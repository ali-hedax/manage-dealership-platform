import { Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DEFAULT_PULSE_SETTINGS, normalizeRoles, REPORT_CENTER_DEFAULTS, type KasbFieldMap, type ReportCenterKind, PULSE_ATTENTION_STATES, PULSE_ERROR_LABELS, PULSE_STATE_LABELS, parseJalali, type PulseCursor, type PulseRunKind, type PulseSettings, type PulseState } from '@manage/shared';
import type { AuditService } from '../audit/audit.service';
import type { AppConfig } from '../config';
import { newId } from '../common/ids';
import type { DatabaseHandle, DbOrTx } from '../db/database';
import { pulseCommands, pulseConnections, pulseRuns, receptionDefects, receptionEvents, receptionParts, receptionRepairs, receptions, referenceImports, tenants, users } from '../db/schema';
import { notifyUsers } from '../parts/part-notify';
import { calendarAt } from '../workshop/work-calendar';
import { KasbClient, type LineKind } from './kasb-client';
import { describeKasbError, KasbError } from './kasb-errors';
import { CARD, PULSE_PROTOCOL_REVISION, STATUS_DOMAIN } from './kasb-protocol';
import type { KasbTable } from './kasb-table';
import { dayChunks, diffLines, isClosed, jalaliDay, mapCard, mapDefect, mapPart, mapRepair, codeDomains, tehranDateKey, tehranMidnight, withinWorkingHours, type DefectValues, type LineBase, type PartValues, type ReceptionValues, type RepairValues } from './pulse-map';
import { findCaseLink } from './pulse-link';
import { loadFieldMap } from './kasb-fields';
import { lockAdmission } from './reception-lock';
import { stageAutomaticReport } from '../daily-reports/auto-stage';
import { decryptSecret } from './pulse-secret';
import { pulseActor, pulseAutoApply } from './pulse-actor';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { StockService } from '../daily-reports/stock.service';
import { SpecialAidRecordsService } from '../special-aid/special-aid-records.service';
import type { CardTextExtractor } from '../special-aid/card-extractor';
import { ReportCenterService } from '../special-aid/report-center.service';

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
/** Open receptions admitted before the open window are re-read through their admission day, a few days per hour (S07). */
const STALE_OPEN_DAYS_PER_CYCLE = 7;
/** A failure of one card's lines that is about that card only: the card is marked and the others go on (S07). */
const CARD_ONLY_ERRORS = new Set(['KASB_REJECTED', 'KASB_PROTOCOL']);
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

/** The worker never reads card images; matching admissions to cards needs no extractor. */
const NO_CARD_EXTRACTOR: CardTextExtractor = { provider: 'none', extract: async () => null };

/** The cursor without a pending special-aid request. */
function withoutPending(cursor: PulseCursor | null | undefined): PulseCursor {
  const next = { ...(cursor ?? {}) };
  delete next.emdadPending;
  return next;
}

export interface PulseEngineOptions {
  clientFactory?: (origin: string) => KasbClient;
  now?: () => Date;
  /** Pause before the one repeat of a small read the site did not answer (default 2 s; tests use 0). */
  retryDelayMs?: number;
}

const settingsOf = (c: Connection): PulseSettings => ({ ...DEFAULT_PULSE_SETTINGS, ...(c.settings ?? {}) });
const errorCode = (e: unknown) => (e instanceof PulseStop || e instanceof KasbError ? e.code : 'PULSE_INTERNAL');
/** Secret-free description for logs (database errors may carry values in their message). */
const safe = (e: unknown) => (e instanceof KasbError ? describeKasbError(e) : e instanceof PulseStop ? e.code : `${(e as { name?: string })?.name ?? 'Error'} ${(e as { code?: string })?.code ?? ''}`.trim());

export class PulseEngine {
  private readonly logger = new Logger('ManagePulse');
  private readonly clients = new Map<string, { key: string; client: KasbClient }>();
  private readonly fieldMaps = new Map<string, { at: number; map: KasbFieldMap }>();
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

  /** Columns confirmed in «منبع‌ها» (S08), read at most once a minute. */
  private async fields(conn: Connection): Promise<KasbFieldMap> {
    const cached = this.fieldMaps.get(conn.tenantId);
    if (cached && Date.now() - cached.at < 60_000) return cached.map;
    const map = await loadFieldMap(this.db, conn.tenantId);
    this.fieldMaps.set(conn.tenantId, { at: Date.now(), map });
    return map;
  }

  /** Small JSON reads: one more try after a short pause when the site did not answer in time (S07). */
  private async retrying<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (e) {
      if (!(e instanceof KasbError) || (e.code !== 'KASB_TIMEOUT' && e.code !== 'KASB_UNREACHABLE')) throw e;
      const pause = this.opts.retryDelayMs ?? 2_000;
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
      return read();
    }
  }

  /** The کسب‌وکار client of a dealership; a new one (no session) when the credentials changed. */
  private client(conn: Connection): KasbClient {
    const key = createHash('sha256').update(`${conn.dealerCode}\n${conn.username}\n${conn.passwordEnc ?? ''}`).digest('hex');
    const cached = this.clients.get(conn.tenantId);
    if (cached?.key === key) return cached.client;
    const client = this.opts.clientFactory?.(this.cfg.PULSE_KASB_ORIGIN) ?? new KasbClient({ origin: this.cfg.PULSE_KASB_ORIGIN, reportTimeoutMs: this.cfg.HEAVY_REPORT_TIMEOUT_MS });
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
    // Open receptions older than the window were never read again, so a release in کسب‌وکار never reached
    // Manage and they stayed «open» (and on the night list) for good. Their admission days are re-read hourly.
    if (ok && due(cursor.staleOpenAt, 60)) ok = (await this.staleOpenCycle(conn, fresh)) && ok;
    if (ok) ok = (await this.linesCycle(conn, [...fresh])) && ok;
    if (ok && s.stockAuto !== false && (force || this.stockDue(conn, s))) ok = (await this.stockCycle(conn)) && ok;
    // The two reports never stop the admission reads: a refused report is only logged.
    if (ok && s.emdadAuto !== false && this.emdadDue(conn, s)) await this.emdadCycle(conn, false);
    if (ok && s.appointmentsAuto !== false && this.dailyDue(conn.cursor?.appointmentsDay, conn.cursor?.appointmentsTriedAt, s.appointmentsAfter ?? '10:10')) await this.appointmentsCycle(conn);
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

  // ------------------------------------------------------------ special-aid report and appointment list

  private tehranHhmm(at: Date): string {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  }
  /** کسب‌وکار refuses the special-aid report 07:00–10:00 and 16:00–18:00, except on Fridays (its isOffPeak). */
  private reportPeak(at: Date): boolean {
    if (new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' }).format(at) === 'Fri') return false;
    const t = this.tehranHhmm(at);
    return (t >= '07:00' && t <= '10:00') || (t >= '16:00' && t <= '18:00');
  }
  /** Once a Tehran day after `after`; a failed attempt is retried after an hour. */
  private dailyDue(day: string | undefined, triedAt: string | undefined, after: string): boolean {
    const now = this.now();
    if (day === tehranDateKey(now)) return false;
    if (triedAt && now.getTime() - Date.parse(triedAt) < 3_600_000) return false;
    return this.tehranHhmm(now) >= after;
  }
  private emdadDue(conn: Connection, s: PulseSettings): boolean {
    const cursor = conn.cursor ?? {};
    if (this.reportPeak(this.now())) return false;
    // A report the server is still building is asked for again every two minutes.
    if (cursor.emdadPending) return !cursor.emdadTriedAt || this.now().getTime() - Date.parse(cursor.emdadTriedAt) >= 2 * 60_000 - 5_000;
    return this.dailyDue(cursor.emdadDay, cursor.emdadTriedAt, s.emdadAfter ?? '10:05');
  }
  /** Report-center period of a report (days back and ahead), as the dealership set it. */
  private async reportPeriod(tenantId: string, kind: ReportCenterKind): Promise<{ past: number; future: number }> {
    const [t] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
    const stored = ((t?.settings ?? {}) as { reportCenter?: Partial<Record<ReportCenterKind, { pastDays?: number; futureDays?: number }>> }).reportCenter?.[kind];
    return { past: stored?.pastDays ?? REPORT_CENTER_DEFAULTS[kind].pastDays, future: stored?.futureDays ?? REPORT_CENTER_DEFAULTS[kind].futureDays };
  }
  private shiftDay(days: number): string {
    return jalaliDay(new Date(this.now().getTime() + days * 86_400_000));
  }

  /**
   * «گزارش امداد ویژه»: requested once a day; the server builds it in the background, so the same
   * request is repeated every two minutes (for up to an hour) until the file is ready. The file is
   * staged in the daily-report pipeline (kind emdad) and a person confirms it. Owner, 2026-11-24.
   */
  private async emdadCycle(conn: Connection, force: boolean): Promise<boolean> {
    this.relogins = 0;
    const now = this.now();
    const cursor: PulseCursor = conn.cursor ?? {};
    if (this.reportPeak(now)) {
      if (force) { const run = await this.startRun(conn, 'emdad'); await this.finishRun(run, 'error', { read: 0, created: 0, changed: 0 }, 'KASB_REPORT_PEAK'); }
      return false;
    }
    let pending = cursor.emdadPending;
    if (pending && now.getTime() - Date.parse(pending.since) > 3_600_000) {
      // Not ready after an hour: give up and ask again an hour later.
      const rest = withoutPending(cursor);
      await this.patch(conn, { cursor: { ...rest, emdadTriedAt: now.toISOString() } });
      const run = await this.startRun(conn, 'emdad');
      await this.finishRun(run, 'error', { read: 0, created: 0, changed: 0 }, 'KASB_REPORT_FAILED', { status: 'timeout', from: pending.from, to: pending.to });
      return false;
    }
    const first = !pending;
    if (!pending) {
      const period = await this.reportPeriod(conn.tenantId, 'emdad');
      pending = { from: this.shiftDay(-period.past), to: this.shiftDay(0), since: now.toISOString() };
    }
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    let run: string | null = null;
    try {
      if (!conn.updatedBy) throw new PulseStop('PULSE_NOT_CONFIGURED');
      const answer = await this.withSession(conn, (c) => c.emdadReport(conn.dealerCode, pending.from, pending.to));
      if (answer.status === 'pending') {
        await this.patch(conn, { cursor: { ...(conn.cursor ?? {}), emdadPending: pending, emdadTriedAt: now.toISOString() } });
        // Only the request itself is logged; the polls that follow are not.
        if (first) { run = await this.startRun(conn, 'emdad'); await this.finishRun(run, 'ok', stats, null, { status: 'requested', from: pending.from, to: pending.to }); }
        return true;
      }
      run = await this.startRun(conn, 'emdad');
      const rest = withoutPending(conn.cursor);
      if (answer.status === 'failed') {
        await this.patch(conn, { cursor: { ...rest, emdadTriedAt: now.toISOString() } });
        await this.finishRun(run, 'error', stats, 'KASB_REPORT_FAILED', { status: answer.reason });
        return false;
      }
      stats.read = 1;
      const staged = await stageAutomaticReport(this.db, { tenantId: conn.tenantId, isTest: conn.isTest, kind: 'emdad', fileName: `pulse-emdad-${pending.to.replace(/\//g, '-')}.xls`, body: answer.file, uploadedBy: conn.updatedBy });
      if (staged.outcome === 'bad_format') throw new KasbError('KASB_PROTOCOL');
      if (staged.outcome === 'staged') stats.created = 1;
      await this.patch(conn, { cursor: { ...rest, emdadDay: tehranDateKey(now), emdadTriedAt: now.toISOString() } });
      await this.finishRun(run, 'ok', stats, null, { from: pending.from, to: pending.to, outcome: staged.outcome, bytes: answer.file.length });
      return true;
    } catch (e) {
      const rest = withoutPending(conn.cursor);
      await this.patch(conn, { cursor: { ...rest, emdadTriedAt: now.toISOString() } });
      await this.fail(conn, run ?? (await this.startRun(conn, 'emdad')), e, stats, { step: 'emdad' });
      return false;
    }
  }

  /**
   * «لیست نوبت پذیرش»: read once a day for the report-center period and prepared as a preview of
   * the appointments import with the column layout the dealership confirmed once. A person still
   * confirms it in «اطلاعات پایه»; without a confirmed layout nothing is prepared. Owner, 2026-11-24.
   */
  private async appointmentsCycle(conn: Connection): Promise<boolean> {
    this.relogins = 0;
    const now = this.now();
    const run = await this.startRun(conn, 'appointments');
    await this.patch(conn, { cursor: { ...(conn.cursor ?? {}), appointmentsTriedAt: now.toISOString() } });
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    try {
      if (!conn.updatedBy) throw new PulseStop('PULSE_NOT_CONFIGURED');
      const period = await this.reportPeriod(conn.tenantId, 'appointments');
      const from = this.shiftDay(-period.past), to = this.shiftDay(period.future);
      const file = await this.withSession(conn, (c) => c.appointmentsFile(conn.dealerCode, from, to));
      stats.read = 1;
      const actor = await pulseActor(this.db, conn.tenantId, conn.updatedBy);
      if (!actor) throw new PulseStop('PULSE_NOT_CONFIGURED');
      const fileName = `pulse-appointments-${this.shiftDay(0).replace(/\//g, '-')}.xlsx`;
      const fileBase64 = file.toString('base64');
      const found = await new ReportCenterService(this.handle, this.audit).detect(actor, { fileName, fileBase64 });
      if (found.kind !== 'appointments' || found.sheetIndex == null || found.headerRow == null || !found.mapping) {
        await this.finishRun(run, 'error', stats, 'PULSE_LAYOUT_UNCONFIRMED', { from, to, bytes: file.length });
        return false;
      }
      // The same file waiting for confirmation, or already confirmed, is not prepared again.
      const sha = createHash('sha256').update(fileBase64).digest('hex');
      const [same] = await this.db.select({ id: referenceImports.id, status: referenceImports.status }).from(referenceImports)
        .where(and(eq(referenceImports.tenantId, conn.tenantId), eq(referenceImports.kind, 'appointments'), eq(referenceImports.fileSha256, sha)))
        .orderBy(desc(referenceImports.createdAt)).limit(1);
      const refs = new ReferenceDataService(this.handle, this.audit, new SpecialAidRecordsService(this.handle, this.audit, NO_CARD_EXTRACTOR), new StockService(this.handle, this.audit));
      let outcome: string, previewId: string, counts: Record<string, number>;
      if (same) {
        outcome = same.status === 'applied' ? 'unchanged' : 'waiting'; previewId = same.id;
        const [held] = await this.db.select({ rows: referenceImports.rows }).from(referenceImports).where(eq(referenceImports.id, same.id));
        counts = {};
        for (const r of (held?.rows ?? []) as { outcome?: string }[]) if (r.outcome) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
      } else {
        const preview = await refs.preview(actor, { kind: 'appointments', fileName, fileBase64, sheetIndex: found.sheetIndex, headerRow: found.headerRow, offset: 0, mapping: found.mapping });
        outcome = 'staged'; previewId = preview.id; counts = preview.counts; stats.created = preview.counts.new; stats.changed = preview.counts.update;
      }
      // «ثبت خودکار» (owner, 2026-11-24): confirmed as the person who configured Pulse, unless many
      // rows were rejected or conflict (then a person decides) or that person may not confirm it.
      let autoHold: string | null = null;
      if (outcome !== 'unchanged' && (await pulseAutoApply(this.db, conn.tenantId))) {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const bad = (counts.error ?? 0) + (counts.conflict ?? 0);
        if (bad > Math.max(5, 0.1 * total)) autoHold = 'rows';
        else if (!actor.user.permissions.has('reference.appointments.manage')) autoHold = 'permission';
        else { await refs.apply(actor, previewId); outcome = 'applied'; }
      }
      await this.patch(conn, { cursor: { ...(conn.cursor ?? {}), appointmentsDay: tehranDateKey(now) } });
      await this.finishRun(run, 'ok', stats, null, { from, to, outcome, previewId, autoHold, bytes: file.length });
      return true;
    } catch (e) {
      await this.fail(conn, run, e, stats, { step: 'appointments' });
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
    // The site's own code and short message make a refused read diagnosable from «جزئیات فنی».
    if (e instanceof KasbError && (e.messageCode || e.messageText)) details = { ...details, messageCode: e.messageCode ?? null, messageText: e.messageText ?? null };
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
  private async cardsCycle(conn: Connection, kind: 'today' | 'open' | 'backfill' | 'stale_open', ranges: { from: Date; to: Date }[], fresh: Set<string>): Promise<boolean> {
    this.relogins = 0;
    const startedAt = this.now();
    const cursor: PulseCursor = { ...(conn.cursor ?? {}) };
    if (kind === 'today') cursor.todayAt = startedAt.toISOString();
    if (kind === 'open') cursor.openAt = startedAt.toISOString();
    if (kind === 'stale_open') cursor.staleOpenAt = startedAt.toISOString();
    // The next attempt waits for the interval even if this one fails (no hammering).
    if (kind !== 'backfill') await this.patch(conn, { cursor });
    // Old open receptions are logged with the open window («پذیرش‌های باز»).
    const run = await this.startRun(conn, kind === 'stale_open' ? 'open' : kind);
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    const details: Record<string, unknown> = {};
    try {
      await this.ensureCodes(conn);
      const fields = await this.fields(conn);
      for (const r of ranges) {
        const table = await this.retrying(() => this.withSession(conn, (c) => c.cards(conn.dealerCode, jalaliDay(r.from), jalaliDay(r.to))));
        await this.noteStructure(conn, 'cards', table, details);
        for (const row of table.rows) {
          const values = mapCard(row, fields);
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

  /**
   * Receptions still open in Manage whose admission day is before the open window: their days are read
   * again (oldest first, a few per hour), so a release in کسب‌وکار reaches Manage however old the card is.
   */
  private async staleOpenCycle(conn: Connection, fresh: Set<string>): Promise<boolean> {
    const s = settingsOf(conn);
    const windowStart = tehranMidnight(new Date(this.now().getTime() - s.openWindowDays * 86_400_000));
    const rows = await this.db.select({ at: receptions.admittedAt }).from(receptions)
      .where(and(eq(receptions.tenantId, conn.tenantId), eq(receptions.isOpen, true), eq(receptions.source, 'pulse'), lt(receptions.admittedAt, windowStart)))
      .orderBy(asc(receptions.admittedAt)).limit(500);
    const days = [...new Set(rows.map((r) => (r.at ? tehranDateKey(r.at) : null)).filter((d): d is string => !!d))].slice(0, STALE_OPEN_DAYS_PER_CYCLE);
    if (!days.length) {
      await this.patch(conn, { cursor: { ...(conn.cursor ?? {}), staleOpenAt: this.now().toISOString() } });
      return true;
    }
    // Noon of each Tehran day (fixed +03:30, no daylight saving in Iran) names that day.
    const ranges = days.map((d) => { const day = new Date(`${d}T12:00:00+03:30`); return { from: day, to: day }; });
    return this.cardsCycle(conn, 'stale_open', ranges, fresh);
  }

  /** Official status texts (Sec/Code, domain CAR_STATE_REC), refreshed once a day. A failure is not fatal. */
  private async ensureCodes(conn: Connection) {
    const cursor: PulseCursor = { ...(conn.cursor ?? {}) };
    if (cursor.codesAt && this.now().getTime() - Date.parse(cursor.codesAt) < 86_400_000) return;
    cursor.codesAt = this.now().toISOString();
    try {
      const domains = codeDomains(await this.withSession(conn, (c) => c.codes()));
      const texts = domains[STATUS_DOMAIN] ?? {};
      if (Object.keys(texts).length) cursor.statusTexts = texts;
      // All domains, for the texts of the other coded fields of a card (H4 part 3).
      if (Object.keys(domains).length) cursor.codeDomains = domains;
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
      await lockAdmission(tx, this.handle.driver, conn.tenantId, v.admissionNoKey);
      let [old] = await tx.select().from(receptions).where(and(eq(receptions.tenantId, conn.tenantId), eq(receptions.kasbRcd, v.kasbRcd)));
      if (!old && v.admissionNoKey) {
        // A card entered by hand while Pulse was down (key: admission number) becomes this card: same row,
        // same night-list history; its manual lines give way when Pulse reads the card's lines.
        const manual = await tx.select().from(receptions).where(and(eq(receptions.tenantId, conn.tenantId), eq(receptions.admissionNoKey, v.admissionNoKey), eq(receptions.source, 'manual'))).limit(2);
        if (manual.length === 1) {
          old = manual[0]!;
          await tx.update(receptions).set({ kasbRcd: v.kasbRcd, source: 'pulse', rowHash: '', linesReadAt: null }).where(eq(receptions.id, old.id));
          await this.event(tx, conn, run, old.id, 'created', { status: statusText ?? v.statusCode, fromManual: true });
          old = { ...old, kasbRcd: v.kasbRcd, source: 'pulse', rowHash: '', linesReadAt: null };
        }
      }
      const fields = {
        admissionNo: v.admissionNo, admissionNoKey: v.admissionNoKey, cardNo: v.cardNo, chassis: v.chassis, vin: v.vin, engineNo: v.engineNo,
        productCode: v.productCode, productName: v.productName, modelCode: v.modelCode, modelName: v.modelName, color: v.color,
        plate: v.plate, plateRegion: v.plateRegion, plateSection: v.plateSection, plateLetter: v.plateLetter, plateThree: v.plateThree,
        customerName: v.customerName, customerPhone: v.customerPhone, customerMobile: v.customerMobile, customerNationalId: v.customerNationalId,
        customerAddress: v.customerAddress, delivererName: v.delivererName, delivererMobile: v.delivererMobile, entranceKm: v.entranceKm,
        admittedAt: v.admittedAt, statusCode: v.statusCode, statusText, isOpen: !closed, station: v.station, receptionist: v.receptionist, hall: v.hall,
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
      const releasedAt = closed ? v.exitAt ?? old.releasedAt ?? now : null;
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

  /**
   * Parts, labour and defects of the cards that are due. Order (S07): new or changed cards first, then
   * today's cards, then other open cards, then never-read older cards, then released ones — so a backlog
   * of old cards never holds back today's labour and parts. A card whose own read is refused is marked
   * and skipped until its next turn; it never stops the others.
   */
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
    const tier = sql`case
      when ${receptions.admittedAt} >= ${today.toISOString()}::timestamptz then 0
      when ${receptions.isOpen} then 1
      when ${receptions.linesReadAt} is null then 2
      else 3 end`;
    const pick = { id: receptions.id, official: receptions.official };
    // Manual cards (no DrcdRcd yet) have nothing to read until Pulse sees the card itself.
    const own = and(eq(receptions.tenantId, conn.tenantId), eq(receptions.source, 'pulse'));
    const first = priority.length ? await this.db.select(pick).from(receptions).where(and(own, inArray(receptions.id, priority.slice(0, LINES_PER_TICK)))) : [];
    const rest = first.length < LINES_PER_TICK
      ? await this.db.select(pick).from(receptions).where(and(own, due, ...(first.length ? [notInArray(receptions.id, first.map((r) => r.id))] : [])))
        .orderBy(tier, sql`${receptions.linesReadAt} asc nulls first`, desc(receptions.admittedAt)).limit(LINES_PER_TICK - first.length)
      : [];
    const cards = [...first, ...rest];
    if (!cards.length) return true;
    const run = await this.startRun(conn, 'lines');
    const stats: Stats = { read: 0, created: 0, changed: 0 };
    const details: Record<string, unknown> = {};
    const failed: Record<string, number> = {};
    try {
      const fields = await this.fields(conn);
      for (const card of cards) {
        const rcd = card.official[CARD.rcd];
        try {
          for (const kind of ['defects', 'repairs', 'parts'] as LineKind[]) {
            const table = await this.retrying(() => this.withSession(conn, (c) => c.lines(kind, rcd)));
            await this.noteStructure(conn, kind, table, details);
            const n = await this.applyLines(conn, run, card.id, kind, table, fields);
            stats.read += table.rows.length;
            stats.created += n.created;
            stats.changed += n.changed;
          }
          await this.db.update(receptions).set({ linesReadAt: this.now(), linesErrorCode: null }).where(eq(receptions.id, card.id));
        } catch (e) {
          if (!(e instanceof KasbError) || !CARD_ONLY_ERRORS.has(e.code)) throw e;
          // This card only: tried again at its normal turn, after the others.
          failed[e.code] = (failed[e.code] ?? 0) + 1;
          await this.db.update(receptions).set({ linesReadAt: this.now(), linesErrorCode: e.code }).where(eq(receptions.id, card.id));
        }
      }
      const failedCards = Object.values(failed).reduce((a, b) => a + b, 0);
      if (failedCards) details.failedCards = { count: failedCards, codes: failed };
      if (failedCards === cards.length) {
        await this.finishRun(run, 'error', stats, Object.keys(failed)[0] ?? 'KASB_REJECTED', details);
        return true;
      }
      await this.finishRun(run, 'ok', stats, null, Object.keys(details).length ? details : null);
      return true;
    } catch (e) {
      await this.fail(conn, run, e, stats, details);
      return false;
    }
  }

  private async applyLines(conn: Connection, run: string, receptionId: string, kind: LineKind, table: KasbTable, fields: KasbFieldMap): Promise<{ created: number; changed: number }> {
    const now = this.now();
    const scope = { tenantId: conn.tenantId, isTest: conn.isTest, requestId: `pulse:${run}` };
    // The three line tables share id, reception_id, kasb_line_id, row_hash and removed_at.
    const target = (kind === 'parts' ? receptionParts : kind === 'repairs' ? receptionRepairs : receptionDefects) as unknown as typeof receptionParts;
    const incoming: LineBase[] = table.rows.map((r) => (kind === 'parts' ? mapPart(r, fields) : kind === 'repairs' ? mapRepair(r, fields) : mapDefect(r)));
    const columns = (l: LineBase): Record<string, unknown> => {
      const common = { official: l.official, rowHash: l.rowHash };
      if (kind === 'parts') {
        const p = l as PartValues;
        return { ...common, name: p.name, code: p.code, qtyRequested: p.qtyRequested, qtyFinal: p.qtyFinal, unitPriceRial: p.unitPriceRial, state: p.state, specialAid: p.specialAid, warranty: p.warranty, rejectReason: p.rejectReason, repairLineId: p.repairLine };
      }
      if (kind === 'repairs') {
        const r = l as RepairValues;
        return { ...common, code: r.code, description: r.description, name: r.name, technician: r.technician, station: r.station, state: r.state, finalPriceRial: r.finalPriceRial, warranty: r.warranty, defectLineId: r.defectLine };
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
        // A line typed into the manual file gives way to what Pulse read: not a removal in کسب‌وکار.
        if (kind === 'parts' && !s.lineId.startsWith('m:')) {
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
      if (cmd.kind === 'emdad_now') {
        // A forced request still respects the site's peak hours; a pending one is simply asked again.
        const ok = await this.emdadCycle(conn, true);
        return finish(ok, ok ? 'OK' : (await this.reload(conn.id)).lastErrorCode ?? 'KASB_REPORT_PEAK');
      }
      if (cmd.kind === 'appointments_now') {
        const ok = await this.appointmentsCycle(conn);
        return finish(ok, ok ? 'OK' : (await this.reload(conn.id)).lastErrorCode ?? 'PULSE_LAYOUT_UNCONFIRMED');
      }
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
