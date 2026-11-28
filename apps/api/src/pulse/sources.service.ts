import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNull, like, not, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  DATA_SOURCES, DATA_SOURCE_KEYS, DEFAULT_PULSE_SETTINGS, KASB_FIELD_DEFS, KASB_FIELD_KEYS, LABOUR_LETTER_PATTERN, PULSE_ATTENTION_STATES, PULSE_STATE_LABELS, pulseErrorText,
  type DataSourceEntry, type DataSourceKey, type DataSourceRead, type DataSourcesView, type KasbFieldCoverage, type KasbFieldList, type KasbFieldMap, type KasbFieldMapInput, type PulseState,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { dailyReportImports, pulseConnections, pulseRuns, receptionImports, receptionParts, receptionRepairs, receptions, referenceImports, stoppageImports, tenants } from '../db/schema';
import { calendarAt } from '../workshop/work-calendar';
import { realReceptionsOnly } from './demo-data';
import { applyFieldMap, loadFieldMap, sanitizeFieldMap } from './kasb-fields';
import { withinWorkingHours } from './pulse-map';

/** Pulse runs that count as a read of each source. */
const RUN_KINDS: Record<DataSourceKey, string[]> = { cards: ['today', 'open', 'backfill'], lines: ['lines'], stock: ['stock'], emdad: ['emdad'], appointments: ['appointments'], stoppages: [] };
/** Report files: a run is a read only when a file came back (a request the site is still building is not). */
const FILE_SOURCES = new Set<DataSourceKey>(['stock', 'emdad', 'appointments']);
/** The worker writes worker_seen_at every 30 s; silence for this long means it is not running. */
const WORKER_SILENT_MS = 3 * 60_000;
const DAY = 86_400_000;

const newest = (...reads: (DataSourceRead | null)[]) => reads.filter((r): r is DataSourceRead => !!r).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

/**
 * «منبع‌ها» (S07 + S08, owner 2026-11-28): for every report Manage takes from کسب‌وکار, its last read
 * (by Pulse or by hand), rows, errors and staleness; whether Pulse is live and, if not, why; how complete
 * the stored repair-card data is; and the columns confirmed for the fields never seen in a recording.
 */
@Injectable()
export class SourcesService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  private async autoReads(tenantId: string, key: DataSourceKey): Promise<{ last: DataSourceRead | null; ok: DataSourceRead | null }> {
    const kinds = RUN_KINDS[key];
    if (!kinds.length) return { last: null, ok: null };
    const read = (r: typeof pulseRuns.$inferSelect | undefined): DataSourceRead | null => r ? { at: (r.finishedAt ?? r.startedAt).toISOString(), mode: 'auto', rows: r.readCount, ok: r.outcome === 'ok', errorCode: r.errorCode } : null;
    const scope = and(eq(pulseRuns.tenantId, tenantId), inArray(pulseRuns.kind, kinds), not(eq(pulseRuns.outcome, 'running')));
    const [last] = await this.db.select().from(pulseRuns).where(scope).orderBy(desc(pulseRuns.startedAt)).limit(1);
    const okWhere: SQL[] = [eq(pulseRuns.outcome, 'ok')];
    if (FILE_SOURCES.has(key)) okWhere.push(sql`${pulseRuns.readCount} > 0`);
    const [ok] = await this.db.select().from(pulseRuns).where(and(scope, ...okWhere)).orderBy(desc(pulseRuns.startedAt)).limit(1);
    return { last: read(last), ok: read(ok) };
  }

  private async manualRead(tenantId: string, key: DataSourceKey): Promise<DataSourceRead | null> {
    if (key === 'cards' || key === 'lines') {
      const [r] = await this.db.select().from(receptionImports).where(and(eq(receptionImports.tenantId, tenantId), eq(receptionImports.status, 'applied'))).orderBy(desc(receptionImports.appliedAt)).limit(1);
      return r?.appliedAt ? { at: r.appliedAt.toISOString(), mode: 'manual', rows: r.rowCount, ok: true, errorCode: r.errorCount ? 'RECEPTION_IMPORT_ROWS' : null } : null;
    }
    if (key === 'stock' || key === 'emdad') {
      // Files Pulse staged are named «pulse-…»; any other applied file came by hand.
      const [r] = await this.db.select().from(dailyReportImports)
        .where(and(eq(dailyReportImports.tenantId, tenantId), eq(dailyReportImports.kind, key), eq(dailyReportImports.status, 'applied'), not(like(dailyReportImports.fileName, 'pulse-%'))))
        .orderBy(desc(dailyReportImports.appliedAt)).limit(1);
      const total = Number((r?.counts as Record<string, unknown> | undefined)?.total);
      return r?.appliedAt ? { at: r.appliedAt.toISOString(), mode: 'manual', rows: Number.isFinite(total) ? total : null, ok: true, errorCode: null } : null;
    }
    if (key === 'appointments') {
      const [r] = await this.db.select({ appliedAt: referenceImports.appliedAt, rows: referenceImports.rows }).from(referenceImports)
        .where(and(eq(referenceImports.tenantId, tenantId), eq(referenceImports.kind, 'appointments'), eq(referenceImports.status, 'applied'), not(like(referenceImports.fileName, 'pulse-%'))))
        .orderBy(desc(referenceImports.appliedAt)).limit(1);
      return r?.appliedAt ? { at: r.appliedAt.toISOString(), mode: 'manual', rows: Array.isArray(r.rows) ? r.rows.length : null, ok: true, errorCode: null } : null;
    }
    const [r] = await this.db.select().from(stoppageImports).where(eq(stoppageImports.tenantId, tenantId)).orderBy(desc(stoppageImports.importedAt)).limit(1);
    return r ? { at: r.importedAt.toISOString(), mode: r.source === 'pulse' ? 'auto' : 'manual', rows: r.rowCount, ok: true, errorCode: null } : null;
  }

  private async coverage(tenantId: string, now: Date): Promise<KasbFieldCoverage> {
    const since = new Date(now.getTime() - 30 * DAY);
    const recent = and(eq(receptions.tenantId, tenantId), gte(receptions.admittedAt, since), ...(await realReceptionsOnly(this.db, tenantId)));
    const has = (c: AnyPgColumn) => sql<number>`count(*) filter (where ${c} is not null)::int`;
    const [r] = await this.db.select({
      n: sql<number>`count(*)::int`, lines: has(receptions.linesReadAt), vin: has(receptions.vin), hall: has(receptions.hall),
      name: sql<number>`count(*) filter (where coalesce(${receptions.productName}, ${receptions.modelName}) is not null)::int`,
    }).from(receptions).where(recent);
    const [l] = await this.db.select({
      n: sql<number>`count(*)::int`, technician: has(receptionRepairs.technician), station: has(receptionRepairs.station),
      name: sql<number>`count(*) filter (where coalesce(${receptionRepairs.name}, '') COLLATE "C" ~ ${LABOUR_LETTER_PATTERN})::int`,
    }).from(receptionRepairs).innerJoin(receptions, eq(receptions.id, receptionRepairs.receptionId)).where(and(recent, isNull(receptionRepairs.removedAt)));
    const [p] = await this.db.select({ n: sql<number>`count(*)::int`, name: has(receptionParts.name), code: has(receptionParts.code), price: has(receptionParts.unitPriceRial) })
      .from(receptionParts).innerJoin(receptions, eq(receptions.id, receptionParts.receptionId)).where(and(recent, isNull(receptionParts.removedAt)));
    return {
      since: since.toISOString(), receptions: r?.n ?? 0, receptionsWithLines: r?.lines ?? 0, receptionsWithVin: r?.vin ?? 0, receptionsWithVehicleName: r?.name ?? 0, receptionsWithHall: r?.hall ?? 0,
      labourLines: l?.n ?? 0, labourWithName: l?.name ?? 0, labourWithTechnician: l?.technician ?? 0, labourWithStation: l?.station ?? 0,
      partLines: p?.n ?? 0, partsWithName: p?.name ?? 0, partsWithCode: p?.code ?? 0, partsWithPrice: p?.price ?? 0,
    };
  }

  /** Column names Pulse recorded from real answers, plus the keys of the newest stored rows (names only, never values). */
  private async observedColumns(tenantId: string, structures: Partial<Record<string, string[]>> | undefined): Promise<Record<KasbFieldList, string[]>> {
    const keys = (rows: { official: Record<string, unknown> | null }[]) => rows.flatMap((r) => Object.keys(r.official ?? {}));
    // Demo rows are invented: their keys never count as columns seen in کسب‌وکار once real data exists (H4 part 5).
    const real = await realReceptionsOnly(this.db, tenantId);
    const cards = await this.db.select({ official: receptions.official }).from(receptions)
      .where(and(eq(receptions.tenantId, tenantId), eq(receptions.source, 'pulse'), ...real)).orderBy(desc(receptions.lastSeenAt)).limit(5);
    const repairs = await this.db.select({ official: receptionRepairs.official }).from(receptionRepairs).innerJoin(receptions, eq(receptions.id, receptionRepairs.receptionId))
      .where(and(eq(receptionRepairs.tenantId, tenantId), not(like(receptionRepairs.kasbLineId, 'm:%')), ...real)).orderBy(desc(receptionRepairs.updatedAt)).limit(5);
    const parts = await this.db.select({ official: receptionParts.official }).from(receptionParts).innerJoin(receptions, eq(receptions.id, receptionParts.receptionId))
      .where(and(eq(receptionParts.tenantId, tenantId), not(like(receptionParts.kasbLineId, 'm:%')), ...real)).orderBy(desc(receptionParts.updatedAt)).limit(5);
    const merge = (...lists: (string[] | undefined)[]) => [...new Set(lists.flatMap((l) => l ?? []).filter((c) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(c)))].sort();
    return { cards: merge(structures?.cards, keys(cards)), repairs: merge(structures?.repairs, keys(repairs)), parts: merge(structures?.parts, keys(parts)) };
  }

  async view(actor: Actor, now = new Date()): Promise<DataSourcesView> {
    const tenantId = actor.user.tenantId;
    const [conn] = await this.db.select().from(pulseConnections).where(eq(pulseConnections.tenantId, tenantId));
    const settings = { ...DEFAULT_PULSE_SETTINGS, ...(conn?.settings ?? {}) };
    const working = withinWorkingHours(now, settings, (await calendarAt(this.db, tenantId, now.toISOString())).calendar);
    const state = (conn?.state ?? 'off') as PulseState;
    const silent = !conn?.workerSeenAt || now.getTime() - conn.workerSeenAt.getTime() > WORKER_SILENT_MS;
    let reason: string | null = null;
    if (!this.cfg.PULSE_ENABLED) reason = 'منیج پالس روی این سرور خاموش است (PULSE_ENABLED).';
    else if (!conn?.passwordEnc) reason = 'اطلاعات ورود کسب‌وکار در «اتصال و تنظیمات پالس» ثبت نشده است.';
    else if (!conn.enabled) reason = 'پالس با دکمهٔ «توقف» متوقف شده است.';
    else if (PULSE_ATTENTION_STATES.includes(state)) reason = `${PULSE_STATE_LABELS[state]}: ${pulseErrorText(conn.lastErrorCode) ?? ''}`.trim();
    else if (silent) reason = `برنامهٔ پالس روی سرور کار نمی‌کند (آخرین نشانه: ${conn.workerSeenAt ? conn.workerSeenAt.toISOString() : 'هرگز'}).`;
    else if (state === 'unreachable') reason = pulseErrorText(conn.lastErrorCode) ?? 'کسب‌وکار در دسترس نیست.';
    const live = reason === null;

    const sources: DataSourceEntry[] = [];
    for (const key of DATA_SOURCE_KEYS) {
      const def = DATA_SOURCES[key];
      const auto = await this.autoReads(tenantId, key);
      const manual = await this.manualRead(tenantId, key);
      const lastSuccess = newest(auto.ok, manual);
      const age = lastSuccess ? now.getTime() - Date.parse(lastSuccess.at) : Infinity;
      // Frequent sources are judged only while Pulse should be reading (working hours); daily ones always.
      const judged = def.staleAfterMinutes >= 24 * 60 || !def.modes.includes('auto') || working;
      sources.push({ key, ...def, lastRead: newest(auto.last, manual), lastSuccess, lastAuto: auto.last, lastManual: manual, stale: judged && age > def.staleAfterMinutes * 60_000 });
    }
    return {
      pulse: { configured: !!conn?.passwordEnc, enabled: !!conn?.enabled, state, live, reason, workerSeenAt: conn?.workerSeenAt?.toISOString() ?? null, lastReadAt: conn?.lastReadAt?.toISOString() ?? null, withinWorkingHours: working },
      sources,
      fieldMap: await loadFieldMap(this.db, tenantId),
      observedColumns: await this.observedColumns(tenantId, conn?.cursor?.structures),
      coverage: await this.coverage(tenantId, now),
      failedLineCards: await this.failedCards(tenantId),
    };
  }

  /**
   * Confirms (or clears) the column of each field. Only a column Pulse has seen in a real answer can be
   * confirmed — never a typed guess. Every stored card and line is re-derived at once from its official row.
   */
  async saveFieldMap(actor: Actor, input: KasbFieldMapInput): Promise<DataSourcesView> {
    const tenantId = actor.user.tenantId;
    const [conn] = await this.db.select({ cursor: pulseConnections.cursor }).from(pulseConnections).where(eq(pulseConnections.tenantId, tenantId));
    const observed = await this.observedColumns(tenantId, conn?.cursor?.structures);
    for (const key of KASB_FIELD_KEYS) {
      const column = input[key];
      if (column && !observed[KASB_FIELD_DEFS[key].list].includes(column)) {
        throw badRequest('KASB_COLUMN_UNSEEN', `ستون «${column}» در پاسخ‌های «${KASB_FIELD_DEFS[key].label}» کسب‌وکار دیده نشده است؛ فقط ستون‌های دیده‌شده تأیید می‌شوند.`);
      }
    }
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).for('update');
      const before = (t!.settings ?? {}) as Record<string, unknown>;
      const old = sanitizeFieldMap(before.kasbFieldMap);
      const next: KasbFieldMap = sanitizeFieldMap({ ...old, ...Object.fromEntries(KASB_FIELD_KEYS.filter((k) => k in input).map((k) => [k, input[k] ?? null])) });
      await tx.update(tenants).set({ settings: { ...before, kasbFieldMap: next } }).where(eq(tenants.id, tenantId));
      await applyFieldMap(tx, tenantId, next);
      await this.audit.record(tx, actor, { entityType: 'tenant', entityId: tenantId, action: 'settings.kasb_field_map_saved', before: { kasbFieldMap: old }, after: { kasbFieldMap: next } });
    });
    return this.view(actor);
  }

  /** Cards whose own line read failed last time (S07: shown, never silently skipped). */
  private async failedCards(tenantId: string): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(receptions).where(and(eq(receptions.tenantId, tenantId), not(isNull(receptions.linesErrorCode)), ...(await realReceptionsOnly(this.db, tenantId))));
    return Number(r?.n ?? 0);
  }
}
