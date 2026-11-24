import { Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DEFAULT_PULSE_SETTINGS, normalizeRoles, PULSE_ATTENTION_STATES, PULSE_ERROR_LABELS, PULSE_STATE_LABELS, parseJalali, type PulseCursor, type PulseRunKind, type PulseSettings, type PulseState } from '@manage/shared';
import type { AuditService } from '../audit/audit.service';
import type { AppConfig } from '../config';
import { newId } from '../common/ids';
import type { DatabaseHandle, DbOrTx } from '../db/database';
import { pulseCommands, pulseConnections, pulseRuns, receptionDefects, receptionEvents, receptionParts, receptionRepairs, receptions, users } from '../db/schema';
import { notifyUsers } from '../parts/part-notify';
import { calendarAt } from '../workshop/work-calendar';
import { KasbClient, type LineKind } from './kasb-client';
import { describeKasbError, KasbError } from './kasb-errors';
import { CARD, PULSE_PROTOCOL_REVISION } from './kasb-protocol';
import type { KasbTable } from './kasb-table';
import { dayChunks, diffLines, isClosed, jalaliDay, mapCard, mapDefect, mapPart, mapRepair, statusTexts, tehranDateKey, tehranMidnight, withinWorkingHours, type DefectValues, type LineBase, type PartValues, type ReceptionValues, type RepairValues } from './pulse-map';
import { findCaseLink } from './pulse-link';
import { stageAutomaticReport } from '../daily-reports/auto-stage';
import { decryptSecret } from './pulse-secret';

// The Manage Pulse worker logic (spec section 26). Runs only in the separate `pulse` process,
// never in the API. One tick handles every dealership: queued commands first (test, read now,
// backfill, captcha answer), then the schedule inside working hours:
//   every N minutes (default 3) today's admissions; every 15 minutes the open window (default
//   60 days, in weekly chunks); parts/labour/defects at once for new or changed cards, every 10
//   minutes for today's open cards, every 30 minutes for older open ones, weekly for released.
// Writes are idempotent: a card or line whose row hash did not change creates no row, history
// or notification. Nothing is deleted; nothing in accident cases, parts, reservations or stock
// is changed. Logs and errors carry only stable codes, never data or secrets.

export const PULSE_LOCK_KEY = 731_621_002;
const LINES_PER_TICK = 30;
const BACKFILL_DAYS_PER_TICK = 5;
type StructureKind = 'cards' | 'parts' | 'repairs' | 'defects';

type Connection = typeof pulseConnections.$inferSelect;
type Command = typeof pulseCommands.$inferSelect;
type Stats = { read: number; created: number; changed: number };

/** An intentional stop (captcha, refused login, password change, missing secret). */
export class PulseStop extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PulseStop';
  }
}

export interface PulseEngineOptions {
  clientFactory?: (origin: string) => KasbClient;
  now?: () => Date;
}

const settingsOf = (c: Connection): PulseSettings => ({ ...DEFAULT_PULSE_SETTINGS, ...(c.settings ?? {}) });
const errorCode = (e: unknown) => (e instanceof PulseStop || e instanceof KasbError ? e.code : 'PULSE_INTERNAL');
/** Secret-free description for logs (database errors may carry values in their message). */
const safe = (e: unknown) => (e instanceof KasbError ? describeKasbError(e) : e instanceof PulseStop ? e.code : `${(e as { name?: string })?.name ?? 'Error'} ${(e as { code?: string })?.code ?? ''}`.trim());

export class PulseEngine {
  private readonly logger = new Logger('ManagePulse');
  private readonly clients = new Map<string, { key: string; client: KasbClient }>();
  private relogins = 0;
  private prunedAt = 0;

  constructor(
    private readonly handle: DatabaseHandle,
    private readonly cfg: AppConfig,
    private readonly audit: AuditService,
    private readonly opts: PulseEngineOptions = {},
  ) {}

  private get db() {
    return this.handle.db;
  }
  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  /** The کسب‌وکار client of a dealership; a new one (no session) when the credentials changed. */
  private client(conn: Connection): KasbClient {
    const key = createHash('sha256').update(`${conn.dealerCode}\n${conn.username}\n${conn.passwordEnc ?? ''}`).digest('hex');
    const cached = this.clients.get(conn.tenantId);
    if (cached?.key === key) return cached.client;
    const client = this.opts.clientFactory?.(this.cfg.PULSE_KASB_ORIGIN) ?? new KasbClient({ origin: this.cfg.PULSE_KASB_ORIGIN });
    this.clients.set(conn.tenantId, { key, client });
    return client;
  }

  /** One worker pass over every dealership. A failure of one dealership never stops the others. */
  async tick(): Promise<void> {
    if (!this.cfg.PULSE_ENABLED) return;
    const rows = await this.db.select().from(pulseConnections);
    for (const conn of rows) {
      try {
        await this.processConnection(conn);
      } catch (e) {
        this.logger.error(`dealership ${conn.tenantId}: ${safe(e)}`);
      }
    }
    await this.prune();
  }

  /** Run log is operational, not business data: rows older than 30 days are removed daily. */
  private async prune() {
    const now = this.now().getTime();
    if (now - this.prunedAt < 86_400_000) return;
    this.prunedAt = now;
    await this.db.delete(pulseRuns).where(and(lt(pulseRuns.startedAt, new Date(now - 30 * 86_400_000)), sql`not exists (select 1 from ${receptionEvents} e where e.run_id = ${pulseRuns.id})`));
  }

  private async reload(id: string): Promise<Connection> {
    const [row] = await this.db.select().from(pulseConnections).where(eq(pulseConnections.id, id));
    return row!;
  }
  private async patch(conn: Connection, patch: Partial<Connection>) {
    await this.db.update(pulseConnections).set(patch).where(eq(pulseConnections.id, conn.id));
    Object.assign(conn, patch);
  }

  async processConnection(initial: Connection): Promise<void> {
    let conn = initial;
    const now = this.now();
    await this.patch(conn, { workerSeenAt: now });
    const commands = await this.db.select().from(pulseCommands)
      .where(and(eq(pulseCommands.tenantId, conn.tenantId), inArray(pulseCommands.status, ['pending', 'running'])))
      .orderBy(asc(pulseCommands.createdAt));
    for (const cmd of commands) {
      conn = await this.reload(conn.id);
      await this.runCommand(conn, cmd);
    }
    conn = await this.reload(conn.id);
    if (!conn.enabled || !conn.passwordEnc || PULSE_ATTENTION_STATES.includes(conn.state as PulseState)) return;
    const calendar = (await calendarAt(this.db, conn.tenantId, now.toISOString())).calendar;
    if (!withinWorkingHours(now, settingsOf(conn), calendar)) return;
    await this.scheduled(conn, false);
  }

  // ------------------------------------------------------------ schedule

  private async scheduled(conn: Connection, force: boolean): Promise<boolean> {
    const now = this.now();
    const s = settingsOf(conn);
    const cursor: PulseCursor = conn.cursor ?? {};
    // A few seconds of tolerance for timer jitter between ticks.
    const due = (at: string | undefined, minutes: number) => force || !at || now.getTime() - Date.parse(at) >= minutes * 60_000 - 5_000;
    let ok = true;
    const fresh = new Set<string>();
    if (due(cursor.todayAt, s.intervalMinutes)) ok = (await this.cardsCycle(conn, 'today', [{ from: now, to: now }], fresh)) && ok;
    if (ok && due(cursor.openAt, 15)) ok = (await this.cardsCycle(conn, 'open', dayChunks(new Date(now.getTime() - s.openWindowDays * 86_400_000), now, 7), fresh)) && ok;
    if (ok) ok = (await this.linesCycle(conn, [...fresh])) && ok;
    if (ok && s.stockAuto !== false && (force || this.stockDue(conn, s))) ok = (await this.stockCycle(conn)) && ok;
    return ok;
  }

  // ------------------------------------------------------------ stock report

  /** Once a Tehran day, after `stockAfter` (default 10:00). */
  private stockDue(conn: Connection, s: PulseSettings): boolean {
    const now = this.now();
    const cursor = conn.cursor ?? {};
    if (cursor.stockDay === tehranDateKey(now)) return false;
    // A failed read is tried again after an hour, not on every tick.
    if (cursor.stockTriedAt && now.getTime() - Date.parse(cursor.stockTriedAt) < 3_600_000) return false;
    const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    return hhmm >= (s.stockAfter ?? '10:00');
  }

  /**
   * Reads «گزارش موجودی انبار» (the same file staff download by hand) and stages it in the daily
   * report pipeline; a person still confirms the preview. Owner, 2026-11-23.
   */
  private async stockCycle(conn: Connection): Promise<boolean> {
    this.relogins = 0;
    const run = await this.startRun(conn, 'stock');
    await this.patch(conn, { cursor: { ...(conn.cursor ?? {}), stockTriedAt: this.now().toISOString() } });
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    try {
      if (!conn.updatedBy) throw new PulseStop('PULSE_NOT_CONFIGURED');
      const s = settingsOf(conn);
      const list = await this.withSession(conn, (c) => c.warehouses());
      const wh = (s.stockWarehouse && list.find((w) => w.value === s.stockWarehouse)) || list.find((w) => w.text.includes('قطعات')) || list[0];
      if (!wh) throw new KasbError('KASB_REJECTED');
      const year = Number(jalaliDay(this.now()).slice(0, 4));
      const file = await this.withSession(conn, (c) => c.stockFile(wh.value, year));
      stats.read = 1;
      const staged = await stageAutomaticReport(this.db, { tenantId: conn.tenantId, isTest: conn.isTest, kind: 'stock', fileName: `pulse-stock-${jalaliDay(this.now()).replace(/\//g, '-')}.xls`, body: file, uploadedBy: conn.updatedBy });
      if (staged.outcome === 'bad_format') throw new KasbError('KASB_PROTOCOL');
      if (staged.outcome === 'staged') stats.created = 1;
      await this.patch(conn, { cursor: { ...(conn.cursor ?? {}), stockDay: tehranDateKey(this.now()), stockWarehouse: wh } });
      await this.finishRun(run, 'ok', stats, null, { warehouse: wh.text.slice(0, 60), outcome: staged.outcome, bytes: file.length });
      return true;
    } catch (e) {
      await this.fail(conn, run, e, stats, { step: 'stock' });
      return false;
    }
  }

  private async startRun(conn: Connection, kind: PulseRunKind): Promise<string> {
    const id = newId();
    await this.db.insert(pulseRuns).values({ id, tenantId: conn.tenantId, kind, startedAt: this.now(), isTest: conn.isTest });
    return id;
  }
  private async finishRun(id: string, outcome: 'ok' | 'error', stats: Stats, errorCode: string | null = null, details: Record<string, unknown> | null = null) {
    await this.db.update(pulseRuns).set({ finishedAt: this.now(), outcome, readCount: stats.read, createdCount: stats.created, changedCount: stats.changed, errorCode, details }).where(eq(pulseRuns.id, id));
  }

  /** Records a failed cycle; network trouble marks «کسب‌وکار در دسترس نیست» without counting as a login failure. */
  private async fail(conn: Connection, run: string, e: unknown, stats: Stats, details: Record<string, unknown>) {
    const code = errorCode(e);
    this.logger.warn(`dealership ${conn.tenantId}: ${safe(e)}`);
    await this.finishRun(run, 'error', stats, code, Object.keys(details).length ? details : null);
    if (e instanceof PulseStop) {
      // Login stops already set their state; a missing key or configuration is shown as the last error.
      if (code.startsWith('PULSE_')) await this.patch(conn, { lastErrorCode: code });
      return;
    }
    if (code === 'KASB_UNREACHABLE' || code === 'KASB_TIMEOUT') {
      if (!PULSE_ATTENTION_STATES.includes(conn.state as PulseState)) await this.patch(conn, { state: 'unreachable', lastErrorCode: code });
    } else await this.patch(conn, { lastErrorCode: code });
  }

  // ------------------------------------------------------------ session

  /** One login attempt. Two refused logins in a row stop the worker until the administrator acts. */
  private async login(conn: Connection, client: KasbClient, captcha: string | null): Promise<void> {
    if (!conn.passwordEnc) throw new PulseStop('PULSE_NOT_CONFIGURED');
    if (!this.cfg.PULSE_SECRET_KEY) throw new PulseStop('PULSE_SECRET_MISSING');
    let password: string;
    try {
      password = decryptSecret(conn.passwordEnc, this.cfg.PULSE_SECRET_KEY);
    } catch {
      throw new PulseStop('PULSE_SECRET_MISSING');
    }
    const run = await this.startRun(conn, 'login');
    const none: Stats = { read: 0, created: 0, changed: 0 };
    let result: Awaited<ReturnType<KasbClient['login']>>;
    try {
      result = await client.login({ dealerCode: conn.dealerCode, username: conn.username, password }, captcha);
    } catch (e) {
      await this.finishRun(run, 'error', none, errorCode(e));
      throw e;
    }
    if (result.kind === 'ok') {
      await this.db.update(pulseConnections).set({ failedLogins: 0, captchaImage: null, lastErrorCode: null, state: sql`case when ${pulseConnections.enabled} then 'active' else 'off' end` }).where(eq(pulseConnections.id, conn.id));
      Object.assign(conn, await this.reload(conn.id));
      await this.finishRun(run, 'ok', none, null, { version: client.clientVersion, ...(client.bundleWarnings.length ? { bundleWarnings: client.bundleWarnings } : {}) });
      return;
    }
    if (result.kind === 'captcha') {
      // A refused answer to a captcha is a refused login too (two in a row stop the worker).
      const failed = captcha ? conn.failedLogins + 1 : conn.failedLogins;
      const stop = failed >= 2;
      await this.patch(conn, { failedLogins: failed, state: stop ? 'login_failed' : 'captcha', captchaImage: stop ? null : result.image.slice(0, 200_000), lastErrorCode: stop ? 'KASB_LOGIN_FAILED' : 'KASB_CAPTCHA' });
      await this.finishRun(run, 'error', none, stop ? 'KASB_LOGIN_FAILED' : 'KASB_CAPTCHA');
      await this.notifyAdmins(conn, stop ? 'login_failed' : 'captcha', stop ? 'KASB_LOGIN_FAILED' : 'KASB_CAPTCHA');
      throw new PulseStop(stop ? 'KASB_LOGIN_FAILED' : 'KASB_CAPTCHA');
    }
    if (result.kind === 'password_change') {
      await this.patch(conn, { state: 'password_change', lastErrorCode: 'KASB_PASSWORD_CHANGE' });
      await this.finishRun(run, 'error', none, 'KASB_PASSWORD_CHANGE');
      await this.notifyAdmins(conn, 'password_change', 'KASB_PASSWORD_CHANGE');
      throw new PulseStop('KASB_PASSWORD_CHANGE');
    }
    const failed = conn.failedLogins + 1;
    await this.patch(conn, { failedLogins: failed, lastErrorCode: 'KASB_LOGIN_FAILED', captchaImage: null, ...(failed >= 2 ? { state: 'login_failed' } : {}) });
    await this.finishRun(run, 'error', none, 'KASB_LOGIN_FAILED', { messageCode: result.messageCode?.slice(0, 40) ?? null, messageText: result.messageText, protocol: PULSE_PROTOCOL_REVISION, clientVersion: JSON.stringify(client.clientVersion), cookies: client.cookieNames.slice(0, 10) });
    if (failed >= 2) await this.notifyAdmins(conn, 'login_failed', 'KASB_LOGIN_FAILED');
    throw new PulseStop('KASB_LOGIN_FAILED');
  }

  /** Runs a read with a session; on 401 or an unsuccessful answer logs in again once per cycle and repeats it once. */
  private async withSession<T>(conn: Connection, read: (c: KasbClient) => Promise<T>): Promise<T> {
    const client = this.client(conn);
    if (!client.hasSession()) {
      if (PULSE_ATTENTION_STATES.includes(conn.state as PulseState)) throw new PulseStop(conn.lastErrorCode ?? 'KASB_LOGIN_FAILED');
      await this.login(conn, client, null);
    }
    try {
      return await read(client);
    } catch (e) {
      if (!(e instanceof KasbError) || (e.code !== 'KASB_AUTH' && e.code !== 'KASB_REJECTED') || this.relogins >= 1) throw e;
      this.relogins++;
      client.clearSession();
      await this.login(conn, client, null);
      return read(client);
    }
  }

  // ------------------------------------------------------------ admissions

  /** Reads admissions of the given Tehran-day ranges and stores them; ids of new or changed ones go to `fresh`. */
  private async cardsCycle(conn: Connection, kind: 'today' | 'open' | 'backfill', ranges: { from: Date; to: Date }[], fresh: Set<string>): Promise<boolean> {
    this.relogins = 0;
    const startedAt = this.now();
    const cursor: PulseCursor = { ...(conn.cursor ?? {}) };
    if (kind === 'today') cursor.todayAt = startedAt.toISOString();
    if (kind === 'open') cursor.openAt = startedAt.toISOString();
    // The next attempt waits for the interval even if this one fails (no hammering).
    if (kind !== 'backfill') await this.patch(conn, { cursor });
    const run = await this.startRun(conn, kind);
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    const details: Record<string, unknown> = {};
    try {
      await this.ensureCodes(conn);
      for (const r of ranges) {
        const table = await this.withSession(conn, (c) => c.cards(conn.dealerCode, jalaliDay(r.from), jalaliDay(r.to)));
        await this.noteStructure(conn, 'cards', table, details);
        for (const row of table.rows) {
          const values = mapCard(row);
          if (!values) continue;
          stats.read++;
          const { id, outcome } = await this.upsertReception(conn, run, values);
          if (outcome !== 'same') {
            fresh.add(id);
            stats[outcome]++;
          }
        }
      }
      await this.db.update(pulseConnections).set({ lastReadAt: this.now(), lastErrorCode: null, state: sql`case when ${pulseConnections.state} = 'unreachable' then (case when ${pulseConnections.enabled} then 'active' else 'off' end) else ${pulseConnections.state} end` }).where(eq(pulseConnections.id, conn.id));
      Object.assign(conn, await this.reload(conn.id));
      await this.finishRun(run, 'ok', stats, null, Object.keys(details).length ? details : null);
      return true;
    } catch (e) {
      await this.fail(conn, run, e, stats, details);
      return false;
    }
  }

  /** Official status texts (Sec/Code, domain CAR_STATE_REC), refreshed once a day. A failure is not fatal. */
  private async ensureCodes(conn: Connection) {
    const cursor: PulseCursor = { ...(conn.cursor ?? {}) };
    if (cursor.codesAt && this.now().getTime() - Date.parse(cursor.codesAt) < 86_400_000) return;
    cursor.codesAt = this.now().toISOString();
    try {
      const texts = statusTexts(await this.withSession(conn, (c) => c.codes()));
      if (Object.keys(texts).length) cursor.statusTexts = texts;
    } catch (e) {
      if (e instanceof PulseStop) throw e;
      if (e instanceof KasbError && (e.code === 'KASB_UNREACHABLE' || e.code === 'KASB_TIMEOUT')) throw e;
      this.logger.warn(`dealership ${conn.tenantId}: status texts not read (${safe(e)})`);
    }
    await this.patch(conn, { cursor });
    for (const [code, text] of Object.entries(cursor.statusTexts ?? {})) {
      await this.db.update(receptions).set({ statusText: text }).where(and(eq(receptions.tenantId, conn.tenantId), eq(receptions.statusCode, code), sql`${receptions.statusText} is distinct from ${text}`));
    }
  }

  /** Column names (never values) of the first non-empty answer of each list go to the run log once. */
  private async noteStructure(conn: Connection, kind: StructureKind, table: KasbTable, details: Record<string, unknown>) {
    if (!table.columns.length || conn.cursor?.structures?.[kind]) return;
    const cursor: PulseCursor = { ...(conn.cursor ?? {}), structures: { ...(conn.cursor?.structures ?? {}), [kind]: table.columns } };
    details.structures = { ...((details.structures as object) ?? {}), [kind]: table.columns };
    await this.patch(conn, { cursor });
  }

  private async event(tx: DbOrTx, conn: Connection, run: string, receptionId: string, kind: string, data: Record<string, unknown> | null = null) {
    await tx.insert(receptionEvents).values({ id: newId(), tenantId: conn.tenantId, receptionId, kind, data, runId: run, occurredAt: this.now(), isTest: conn.isTest });
  }

  /** Stores one admission. Same row hash: only last_seen_at moves (no history, no notification). */
  async upsertReception(conn: Connection, run: string, v: ReceptionValues): Promise<{ id: string; outcome: 'created' | 'changed' | 'same' }> {
    const now = this.now();
    const statusText = v.statusCode ? conn.cursor?.statusTexts?.[v.statusCode] ?? null : null;
    const closed = isClosed(v.exitAt, statusText);
    const scope = { tenantId: conn.tenantId, isTest: conn.isTest, requestId: `pulse:${run}` };
    return this.db.transaction(async (tx) => {
      const [old] = await tx.select().from(receptions).where(and(eq(receptions.tenantId, conn.tenantId), eq(receptions.kasbRcd, v.kasbRcd)));
      const fields = {
        admissionNo: v.admissionNo, admissionNoKey: v.admissionNoKey, cardNo: v.cardNo, chassis: v.chassis, vin: v.vin, engineNo: v.engineNo,
        productCode: v.productCode, productName: v.productName, modelCode: v.modelCode, modelName: v.modelName, color: v.color,
        plate: v.plate, plateRegion: v.plateRegion, plateSection: v.plateSection, plateLetter: v.plateLetter, plateThree: v.plateThree,
        customerName: v.customerName, customerPhone: v.customerPhone, customerMobile: v.customerMobile, customerNationalId: v.customerNationalId,
        customerAddress: v.customerAddress, delivererName: v.delivererName, delivererMobile: v.delivererMobile, entranceKm: v.entranceKm,
        admittedAt: v.admittedAt, statusCode: v.statusCode, statusText, isOpen: !closed, station: v.station, receptionist: v.receptionist,
        searchText: v.searchText, official: v.official, rowHash: v.rowHash,
      };
      if (!old) {
        const id = newId();
        const link = await findCaseLink(tx, conn.tenantId, v.admissionNoKey, v.vin);
        await tx.insert(receptions).values({ id, tenantId: conn.tenantId, kasbRcd: v.kasbRcd, ...fields, releasedAt: closed ? v.exitAt ?? now : null, firstSeenAt: now, lastSeenAt: now, caseId: link.state === 'linked' ? link.caseIds[0]! : null, linkState: link.state, isTest: conn.isTest });
        await this.event(tx, conn, run, id, 'created', { status: statusText ?? v.statusCode });
        if (link.state === 'linked') await this.event(tx, conn, run, id, 'case_linked', { caseId: link.caseIds[0] });
        await this.audit.recordSystem(tx, scope, { entityType: 'reception', entityId: id, caseId: link.state === 'linked' ? link.caseIds[0] : null, action: 'reception.created', after: { statusCode: v.statusCode, isOpen: !closed, linkState: link.state } });
        return { id, outcome: 'created' as const };
      }
      if (old.rowHash === v.rowHash) {
        // Same official row. A status text that became known later is filled in silently.
        await tx.update(receptions).set({ lastSeenAt: now, ...(statusText && statusText !== old.statusText ? { statusText } : {}) }).where(eq(receptions.id, old.id));
        return { id: old.id, outcome: 'same' as const };
      }
      const link = old.caseId ? null : await findCaseLink(tx, conn.tenantId, v.admissionNoKey, v.vin);
      const releasedAt = closed ? old.releasedAt ?? v.exitAt ?? now : null;
      await tx.update(receptions).set({
        ...fields, releasedAt, lastSeenAt: now, updatedAt: now, version: old.version + 1,
        ...(link ? { caseId: link.state === 'linked' ? link.caseIds[0]! : null, linkState: link.state } : {}),
      }).where(eq(receptions.id, old.id));
      if (old.statusCode !== v.statusCode) await this.event(tx, conn, run, old.id, 'status', { from: old.statusText ?? old.statusCode, to: statusText ?? v.statusCode });
      if (old.isOpen && closed) await this.event(tx, conn, run, old.id, 'released', null);
      if (!old.isOpen && !closed) await this.event(tx, conn, run, old.id, 'reopened', null);
      if (link?.state === 'linked') await this.event(tx, conn, run, old.id, 'case_linked', { caseId: link.caseIds[0] });
      await this.audit.recordSystem(tx, scope, { entityType: 'reception', entityId: old.id, caseId: old.caseId ?? (link?.state === 'linked' ? link.caseIds[0] : null), action: 'reception.updated', before: { statusCode: old.statusCode, isOpen: old.isOpen }, after: { statusCode: v.statusCode, isOpen: !closed } });
      return { id: old.id, outcome: 'changed' as const };
    });
  }

  // ------------------------------------------------------------ lines

  /** Parts, labour and defects of the cards that are due (new or changed ones first). */
  private async linesCycle(conn: Connection, priority: string[]): Promise<boolean> {
    this.relogins = 0;
    const now = this.now();
    const s = settingsOf(conn);
    const today = tehranMidnight(now);
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const due = or(
      isNull(receptions.linesReadAt),
      and(eq(receptions.isOpen, true), gte(receptions.admittedAt, today), lt(receptions.linesReadAt, ago(10 * 60_000))),
      and(eq(receptions.isOpen, true), lt(receptions.admittedAt, today), lt(receptions.linesReadAt, ago(30 * 60_000))),
      and(eq(receptions.isOpen, false), gte(receptions.releasedAt, ago(s.openWindowDays * 86_400_000)), lt(receptions.linesReadAt, ago(7 * 86_400_000))),
    );
    const pick = { id: receptions.id, official: receptions.official };
    const first = priority.length ? await this.db.select(pick).from(receptions).where(and(eq(receptions.tenantId, conn.tenantId), inArray(receptions.id, priority.slice(0, LINES_PER_TICK)))) : [];
    const rest = first.length < LINES_PER_TICK
      ? await this.db.select(pick).from(receptions).where(and(eq(receptions.tenantId, conn.tenantId), due, ...(first.length ? [notInArray(receptions.id, first.map((r) => r.id))] : [])))
        .orderBy(sql`${receptions.linesReadAt} asc nulls first`, desc(receptions.admittedAt)).limit(LINES_PER_TICK - first.length)
      : [];
    const cards = [...first, ...rest];
    if (!cards.length) return true;
    const run = await this.startRun(conn, 'lines');
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    const details: Record<string, unknown> = {};
    try {
      for (const card of cards) {
        const rcd = card.official[CARD.rcd];
        for (const kind of ['defects', 'repairs', 'parts'] as LineKind[]) {
          const table = await this.withSession(conn, (c) => c.lines(kind, rcd));
          await this.noteStructure(conn, kind, table, details);
          const n = await this.applyLines(conn, run, card.id, kind, table);
          stats.read += table.rows.length;
          stats.created += n.created;
          stats.changed += n.changed;
        }
        await this.db.update(receptions).set({ linesReadAt: this.now() }).where(eq(receptions.id, card.id));
      }
      await this.finishRun(run, 'ok', stats, null, Object.keys(details).length ? details : null);
      return true;
    } catch (e) {
      await this.fail(conn, run, e, stats, details);
      return false;
    }
  }

  private async applyLines(conn: Connection, run: string, receptionId: string, kind: LineKind, table: KasbTable): Promise<{ created: number; changed: number }> {
    const now = this.now();
    const scope = { tenantId: conn.tenantId, isTest: conn.isTest, requestId: `pulse:${run}` };
    // The three line tables share id, reception_id, kasb_line_id, row_hash and removed_at.
    const target = (kind === 'parts' ? receptionParts : kind === 'repairs' ? receptionRepairs : receptionDefects) as unknown as typeof receptionParts;
    const incoming: LineBase[] = table.rows.map((r) => (kind === 'parts' ? mapPart(r) : kind === 'repairs' ? mapRepair(r) : mapDefect(r)));
    const columns = (l: LineBase): Record<string, unknown> => {
      const common = { official: l.official, rowHash: l.rowHash };
      if (kind === 'parts') {
        const p = l as PartValues;
        return { ...common, name: p.name, code: p.code, qtyRequested: p.qtyRequested, qtyFinal: p.qtyFinal, unitPriceRial: p.unitPriceRial, state: p.state, specialAid: p.specialAid, warranty: p.warranty, rejectReason: p.rejectReason, repairLineId: p.repairLine };
      }
      if (kind === 'repairs') {
        const r = l as RepairValues;
        return { ...common, code: r.code, description: r.description, state: r.state, finalPriceRial: r.finalPriceRial, warranty: r.warranty, defectLineId: r.defectLine };
      }
      const d = l as DefectValues;
      return { ...common, customerText: d.customerText, expertText: d.expertText, state: d.state, type: d.type };
    };
    const label = (l: LineBase) => ({ name: (l as PartValues).name ?? null, code: (l as PartValues).code ?? null });
    return this.db.transaction(async (tx) => {
      const stored = await tx.select({ id: target.id, lineId: target.kasbLineId, rowHash: target.rowHash, removedAt: target.removedAt }).from(target).where(eq(target.receptionId, receptionId));
      const diff = diffLines(stored, incoming);
      for (const line of diff.added) {
        await tx.insert(target).values({ id: newId(), tenantId: conn.tenantId, receptionId, kasbLineId: line.lineId, ...columns(line), firstSeenAt: now, updatedAt: now, isTest: conn.isTest } as never);
        if (kind === 'parts') await this.event(tx, conn, run, receptionId, 'part_added', label(line));
      }
      for (const { stored: s, next } of diff.changed) {
        const [before] = kind === 'parts' ? await tx.select({ state: receptionParts.state, qty: receptionParts.qtyFinal, reject: receptionParts.rejectReason }).from(receptionParts).where(eq(receptionParts.id, s.id)) : [];
        await tx.update(target).set({ ...columns(next), updatedAt: now } as never).where(eq(target.id, s.id));
        const p = next as PartValues;
        if (kind === 'parts' && before && (before.state !== p.state || before.qty !== p.qtyFinal || before.reject !== p.rejectReason)) {
          await this.event(tx, conn, run, receptionId, 'part_changed', { ...label(next), from: before.state, to: p.state, rejectReason: p.rejectReason });
        }
      }
      for (const { stored: s, next } of diff.restored) {
        await tx.update(target).set({ ...columns(next), removedAt: null, updatedAt: now } as never).where(eq(target.id, s.id));
        if (kind === 'parts') await this.event(tx, conn, run, receptionId, 'part_restored', label(next));
      }
      for (const s of diff.removed) {
        await tx.update(target).set({ removedAt: now, updatedAt: now } as never).where(eq(target.id, s.id));
        if (kind === 'parts') {
          const [p] = await tx.select({ name: receptionParts.name, code: receptionParts.code }).from(receptionParts).where(eq(receptionParts.id, s.id));
          await this.event(tx, conn, run, receptionId, 'part_removed', { name: p?.name ?? null, code: p?.code ?? null });
        }
      }
      const changed = diff.changed.length + diff.restored.length + diff.removed.length;
      if (diff.added.length || changed) {
        await this.audit.recordSystem(tx, scope, { entityType: 'reception', entityId: receptionId, action: `reception.${kind}_synced`, after: { added: diff.added.length, changed: diff.changed.length, restored: diff.restored.length, removed: diff.removed.length } });
      }
      return { created: diff.added.length, changed };
    });
  }

  // ------------------------------------------------------------ commands

  private async setCommand(cmd: Command, patch: Partial<Command>) {
    await this.db.update(pulseCommands).set(patch).where(eq(pulseCommands.id, cmd.id));
    Object.assign(cmd, patch);
  }

  async runCommand(conn: Connection, cmd: Command): Promise<void> {
    const finish = (ok: boolean, code: string | null) => this.setCommand(cmd, { status: ok ? 'done' : 'failed', resultCode: code, finishedAt: this.now(), payload: {} });
    if (cmd.status === 'pending') await this.setCommand(cmd, { status: 'running', startedAt: this.now() });
    if (!conn.passwordEnc) return finish(false, 'PULSE_NOT_CONFIGURED');
    try {
      if (cmd.kind === 'test') {
        const code = await this.testConnection(conn);
        return finish(code === null, code ?? 'OK');
      }
      if (cmd.kind === 'captcha_answer') {
        const answer = typeof cmd.payload?.answer === 'string' ? cmd.payload.answer : '';
        if (conn.state !== 'captcha' || !answer) return finish(false, 'PULSE_NO_CAPTCHA');
        // The answer is used once and removed from the queue in any case.
        await this.setCommand(cmd, { payload: {} });
        const client = this.client(conn);
        await this.login(conn, client, answer);
        return finish(true, 'OK');
      }
      if (PULSE_ATTENTION_STATES.includes(conn.state as PulseState)) return finish(false, conn.lastErrorCode ?? 'KASB_LOGIN_FAILED');
      if (cmd.kind === 'sync_now') {
        const ok = await this.scheduled(conn, true);
        return finish(ok, ok ? 'OK' : (await this.reload(conn.id)).lastErrorCode ?? 'PULSE_INTERNAL');
      }
      if (cmd.kind === 'backfill') return this.backfillStep(conn, cmd);
      if (cmd.kind === 'stock_now') {
        const ok = await this.stockCycle(conn);
        return finish(ok, ok ? 'OK' : (await this.reload(conn.id)).lastErrorCode ?? 'PULSE_INTERNAL');
      }
      return finish(false, 'PULSE_UNKNOWN_COMMAND');
    } catch (e) {
      this.logger.warn(`dealership ${conn.tenantId}: command ${cmd.kind} ${safe(e)}`);
      return finish(false, errorCode(e));
    }
  }

  /** «آزمایش اتصال»: one login and one read of today's admissions; nothing is stored. Null when it worked. */
  private async testConnection(conn: Connection): Promise<string | null> {
    this.relogins = 1; // no second login inside a test
    const client = this.client(conn);
    client.clearSession();
    const run = await this.startRun(conn, 'test');
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    try {
      await this.login(conn, client, null);
      const table = await this.withSession(conn, (c) => c.cards(conn.dealerCode, jalaliDay(this.now()), jalaliDay(this.now())));
      stats.read = table.rows.length;
      await this.finishRun(run, 'ok', stats, null, { authScheme: client.authScheme, version: client.clientVersion, columns: table.columns.length, ...(client.bundleWarnings.length ? { bundleWarnings: client.bundleWarnings } : {}) });
      return null;
    } catch (e) {
      await this.finishRun(run, 'error', stats, errorCode(e));
      if (e instanceof KasbError && (e.code === 'KASB_UNREACHABLE' || e.code === 'KASB_TIMEOUT') && !PULSE_ATTENTION_STATES.includes(conn.state as PulseState) && conn.enabled) await this.patch(conn, { state: 'unreachable', lastErrorCode: e.code });
      return errorCode(e);
    }
  }

  /** «بارگذاری اولیه»: day by day from the chosen date, a few days per tick, with progress. */
  private async backfillStep(conn: Connection, cmd: Command): Promise<void> {
    const now = this.now();
    const from = parseJalali(String(cmd.payload?.from ?? ''));
    if (!from) return this.setCommand(cmd, { status: 'failed', resultCode: 'PULSE_BAD_DATE', finishedAt: now });
    const days = dayChunks(from, now, 1);
    const progress = cmd.progress ?? { done: 0, total: days.length };
    const batch = days.slice(progress.done, progress.done + BACKFILL_DAYS_PER_TICK);
    const fresh = new Set<string>();
    if (batch.length && !(await this.cardsCycle(conn, 'backfill', batch, fresh))) {
      return this.setCommand(cmd, { status: 'failed', resultCode: (await this.reload(conn.id)).lastErrorCode ?? 'PULSE_INTERNAL', finishedAt: this.now(), progress });
    }
    const done = Math.min(days.length, progress.done + batch.length);
    await this.setCommand(cmd, { progress: { done, total: days.length }, ...(done >= days.length ? { status: 'done', resultCode: 'OK', finishedAt: this.now(), payload: {} } : {}) });
    if (fresh.size) await this.linesCycle(conn, [...fresh]);
  }

  // ------------------------------------------------------------ notifications

  /** The owner and active system administrators hear when the worker needs them (once a day per state). */
  private async notifyAdmins(conn: Connection, state: PulseState, code: string) {
    const rows = await this.db.select({ id: users.id, roles: users.roles, isOwner: users.isOwner }).from(users).where(and(eq(users.tenantId, conn.tenantId), eq(users.isActive, true)));
    const ids = rows.filter((u) => u.isOwner || normalizeRoles(u.roles).includes('system_admin')).map((u) => u.id);
    await notifyUsers(this.db, conn.tenantId, ids, {
      kind: 'pulse.attention',
      title: `منیج پالس متوقف شد: ${PULSE_STATE_LABELS[state]}`,
      body: PULSE_ERROR_LABELS[code] ?? null,
      link: '/settings/pulse',
      dedupeKey: `pulse:${state}:${tehranDateKey(this.now())}`,
      urgent: true,
      category: 'general',
    });
  }
}
