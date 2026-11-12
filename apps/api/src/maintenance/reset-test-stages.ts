/**
 * Task 1 — reset the trial stages of real cases (owner request, 2026-11-12).
 *
 * KEEP: the case itself (identity, numbers, admission, coverage, responsible
 * person), customers, vehicles, case counters, vehicle imports, responsibility
 * periods, every non-case table and the audit trail (audit_events, change_log).
 * DELETE (per case): assessments and their items, part lines and every part
 * operation (reservation, quote, price notice, discrepancy, parts statement),
 * repair tasks and dependencies, external work, technician wages, blockers, QC,
 * financial approvals, payments and finance, alert responses, case reminders.
 * RESET: case stage → reception, status → open, plan/forecast/delivery/closing
 * fields emptied; Emdad report lines are unlinked (kept, re-matched later);
 * case notifications are marked read (kept).
 *
 * Default is a dry run: everything runs inside one transaction that is rolled
 * back, so the counts are exactly what an execution would do. --execute commits
 * and writes one audit row. Tables marked KEEP are fingerprinted before and after
 * inside the transaction; any difference aborts. No personal data is printed.
 *
 * Plain parameterized SQL on one connection (pg client or PGlite), so the same
 * file runs in tests and, compiled, inside the API container.
 */
import { randomUUID } from 'node:crypto';

export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface ResetOptions {
  tenantCode: string;
  actorUsername: string;
  /** Case numbers to leave completely untouched. */
  exclude: string[];
  execute: boolean;
  reason: string;
}

export interface CaseSummary {
  caseNumber: string;
  stage: string;
  status: string;
  delivered: boolean;
  assessments: number;
  parts: number;
  tasks: number;
  lastActivityAt: string | null;
}

export interface ResetReport {
  executed: boolean;
  tenantCode: string;
  casesInScope: number;
  excluded: string[];
  /** Rows deleted per table, rows changed per reset step. */
  deleted: Record<string, number>;
  reset: Record<string, number>;
  keepFingerprintsEqual: boolean;
  cases: CaseSummary[];
  auditEventId: string | null;
}

const PARTS = `select id from part_requests where tenant_id = $2 and case_id = any($1::uuid[])`;
const TASKS = `select id from tasks where tenant_id = $2 and case_id = any($1::uuid[])`;
const REMINDERS = `select id from reminders where tenant_id = $2 and (case_id = any($1::uuid[]) or part_request_id in (${PARTS}))`;

/** Deletion order respects every foreign key (children first). task_dependencies has no tenant column; it is scoped through its tasks. */
const NO_TENANT_COLUMN = new Set(['task_dependencies']);
const DELETES: [table: string, where: string][] = [
  ['reminder_recipients', `reminder_id in (${REMINDERS})`],
  ['reminders', `id in (${REMINDERS})`],
  ['case_alert_responses', `case_id = any($1::uuid[])`],
  ['part_price_notices', `case_id = any($1::uuid[]) or part_request_id in (${PARTS})`],
  ['part_quotes', `case_id = any($1::uuid[]) or part_id in (${PARTS})`],
  ['part_discrepancies', `case_id = any($1::uuid[]) or part_request_id in (${PARTS}) or blocker_id in (select id from blockers where tenant_id = $2 and case_id = any($1::uuid[]))`],
  ['stock_reservations', `case_id = any($1::uuid[]) or part_request_id in (${PARTS})`],
  ['technician_wages', `case_id = any($1::uuid[]) or task_id in (${TASKS})`],
  ['external_work', `task_id in (${TASKS})`],
  ['task_dependencies', `task_id in (${TASKS}) or depends_on_task_id in (${TASKS})`],
  ['blockers', `case_id = any($1::uuid[]) or task_id in (${TASKS}) or part_request_id in (${PARTS})`],
  ['tasks', `case_id = any($1::uuid[])`],
  ['part_requests', `case_id = any($1::uuid[])`],
  ['assessment_items', `assessment_id in (select id from assessments where tenant_id = $2 and case_id = any($1::uuid[]))`],
  ['assessments', `case_id = any($1::uuid[])`],
  ['qc_inspections', `case_id = any($1::uuid[])`],
  ['financial_approvals', `case_id = any($1::uuid[])`],
  ['case_payments', `case_id = any($1::uuid[])`],
  ['case_finance', `case_id = any($1::uuid[])`],
  ['parts_statements', `case_id = any($1::uuid[])`],
];

/** Case columns emptied or reset; everything else of the case is kept. */
const CASE_RESET_COLUMNS = ['stage', 'status', 'forecast_delivery_at', 'repair_plan', 'actual_delivery_at', 'technical_closed_at', 'technical_closed_by', 'technical_close_note',
  'financial_closed_at', 'financial_closed_by', 'financial_close_note', 'financial_close_estimate_rial', 'financial_close_share_rial', 'financial_close_waived_rial',
  'delivered_by', 'recipient_name', 'recipient_relation', 'delivery_note', 'updated_at', 'updated_by', 'version'];
const EMDAD_LINK_COLUMNS = ['case_id', 'part_request_id', 'match_status', 'match_source', 'match_note', 'updated_at', 'version'];
const TOUCHED = new Set([...DELETES.map(([t]) => t), 'cases', 'emdad_requests', 'notifications']);

const ident = (t: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error('Unexpected table name');
  return `"${t}"`;
};
const minus = (cols: string[]) => cols.map((c) => `-'${c}'`).join('');

/** Counts and hashes of everything that must not change (no row data leaves the database). */
async function keepFingerprint(db: SqlClient, scope: string[], tenantId: string) {
  const tables = (await db.query(`select tablename from pg_tables where schemaname = 'public' order by tablename`)).rows.map((r) => String(r.tablename));
  const out: Record<string, string> = {};
  const hash = async (name: string, select: string, params: unknown[] = []) => {
    const { rows } = await db.query(`select count(*)::int as n, md5(coalesce(string_agg(j, '' order by j), '')) as h from (${select}) s`, params);
    out[name] = `${rows[0]!.n}:${rows[0]!.h}`;
  };
  for (const t of tables) if (!TOUCHED.has(t)) await hash(t, `select to_jsonb(x)::text as j from ${ident(t)} x`);
  // Partly touched tables: the kept part must be identical.
  await hash('cases', `select (to_jsonb(x)${minus(CASE_RESET_COLUMNS)})::text as j from cases x`);
  await hash('emdad_requests', `select (to_jsonb(x)${minus(EMDAD_LINK_COLUMNS)})::text as j from emdad_requests x`);
  await hash('notifications', `select (to_jsonb(x)-'read_at')::text as j from notifications x`);
  await hash('reminders(unlinked)', `select to_jsonb(x)::text as j from reminders x where case_id is null and part_request_id is null`);
  // Rows of excluded cases and other dealerships in the deleted tables.
  for (const [t] of DELETES) {
    const caseScoped = (await db.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'case_id'`, [t])).rows.length > 0;
    if (caseScoped) await hash(`${t}(outside scope)`, `select to_jsonb(x)::text as j from ${ident(t)} x where x.tenant_id <> $2 or x.case_id is null or not (x.case_id = any($1::uuid[]))`, [scope, tenantId]);
  }
  return out;
}

export async function resetTestStages(db: SqlClient, o: ResetOptions): Promise<ResetReport> {
  await db.query('begin');
  try {
    const tenant = (await db.query(`select id from tenants where code = $1`, [o.tenantCode])).rows[0];
    if (!tenant) throw new Error(`Tenant ${o.tenantCode} not found`);
    const tenantId = String(tenant.id);
    // «@owner»: the dealership's single active owner, so no username has to be looked up or printed.
    const actors = o.actorUsername === '@owner'
      ? (await db.query(`select id from users where tenant_id = $1 and is_owner and is_active`, [tenantId])).rows
      : (await db.query(`select id from users where tenant_id = $1 and username = $2 and is_active and (is_owner or 'system_admin' = any(roles))`, [tenantId, o.actorUsername])).rows;
    const actor = actors.length === 1 ? actors[0] : undefined;
    if (!actor) throw new Error('Actor must be an active owner or system administrator of this dealership');
    const known = new Set((await db.query(`select case_number from cases where tenant_id = $1`, [tenantId])).rows.map((r) => String(r.case_number)));
    const unknown = o.exclude.filter((n) => !known.has(n));
    if (unknown.length) throw new Error(`Excluded case numbers not found: ${unknown.join(', ')}`);
    // Lock the cases in scope so nothing changes them while we work.
    const scopeRows = (await db.query(`select id from cases where tenant_id = $1 and not (case_number = any($2::text[])) order by case_number for update`, [tenantId, o.exclude])).rows;
    const scope = scopeRows.map((r) => String(r.id));

    const cases = (await db.query(
      `select c.case_number, c.stage, c.status, c.actual_delivery_at is not null as delivered,
        (select count(*)::int from assessments a where a.case_id = c.id) as assessments,
        (select count(*)::int from part_requests p where p.case_id = c.id) as parts,
        (select count(*)::int from tasks t where t.case_id = c.id) as tasks,
        (select max(e.occurred_at) from audit_events e where e.case_id = c.id and e.action <> 'case.created') as last_at
       from cases c where c.id = any($1::uuid[]) order by c.case_number`,
      [scope],
    )).rows.map((r): CaseSummary => ({
      caseNumber: String(r.case_number), stage: String(r.stage), status: String(r.status), delivered: !!r.delivered,
      assessments: Number(r.assessments), parts: Number(r.parts), tasks: Number(r.tasks),
      lastActivityAt: r.last_at ? new Date(r.last_at as string).toISOString() : null,
    }));

    const before = await keepFingerprint(db, scope, tenantId);
    const deleted: Record<string, number> = {};
    const reset: Record<string, number> = {};
    const count = async (text: string, params: unknown[]) => (await db.query(`with changed as (${text} returning 1) select count(*)::int as n from changed`, params)).rows[0]!.n as number;

    // Emdad report lines stay; only their link to the case/part is removed so the next report can match real parts.
    reset.emdad_requests_unlinked = await count(
      `update emdad_requests set case_id = null, part_request_id = null, match_status = 'unmatched', match_source = 'auto', match_note = 'اتصال با بازنشانی مراحل آزمایشی برداشته شد', updated_at = now(), version = version + 1
       where tenant_id = $2 and (case_id = any($1::uuid[]) or part_request_id in (${PARTS}))`, [scope, tenantId]);
    // An assessment points at its blocker; cut that link before the blockers go.
    await db.query(`update assessments set blocker_id = null where tenant_id = $2 and case_id = any($1::uuid[])`, [scope, tenantId]);
    for (const [table, where] of DELETES) {
      const tenantFilter = NO_TENANT_COLUMN.has(table) ? '$2::uuid is not null' : 'tenant_id = $2';
      deleted[table] = await count(`delete from ${ident(table)} where ${tenantFilter} and (${where})`, [scope, tenantId]);
    }
    reset.notifications_marked_read = await count(
      `update notifications n set read_at = now() where n.tenant_id = $2 and n.read_at is null and exists (select 1 from unnest($1::uuid[]) c(id) where n.link like '/cases/' || c.id::text || '%')`, [scope, tenantId]);
    reset.cases = await count(
      `update cases set stage = 'reception', status = 'open', forecast_delivery_at = null, repair_plan = null, actual_delivery_at = null,
        technical_closed_at = null, technical_closed_by = null, technical_close_note = null, financial_closed_at = null, financial_closed_by = null, financial_close_note = null,
        financial_close_estimate_rial = null, financial_close_share_rial = null, financial_close_waived_rial = null,
        delivered_by = null, recipient_name = null, recipient_relation = null, delivery_note = null,
        updated_at = now(), updated_by = $3, version = version + 1
       where tenant_id = $2 and id = any($1::uuid[])`, [scope, tenantId, actor.id]);

    const after = await keepFingerprint(db, scope, tenantId);
    const changedKeep = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
    if (changedKeep.length) throw new Error(`Kept data changed (${changedKeep.join(', ')}); nothing was committed`);

    let auditEventId: string | null = null;
    if (o.execute) {
      auditEventId = randomUUID();
      await db.query(
        `insert into audit_events (id, tenant_id, case_id, entity_type, entity_id, action, actor_user_id, occurred_at, reason, before, after, is_test)
         values ($1, $2, null, 'maintenance', $2, 'maintenance.test_stages_reset', $3, now(), $4, $5::jsonb, $6::jsonb, false)`,
        [auditEventId, tenantId, actor.id, o.reason, JSON.stringify({ cases: cases.map((c) => ({ caseNumber: c.caseNumber, stage: c.stage, status: c.status })) }), JSON.stringify({ deleted, reset, excluded: o.exclude })],
      );
      await db.query('commit');
    } else {
      await db.query('rollback');
    }
    return { executed: o.execute, tenantCode: o.tenantCode, casesInScope: scope.length, excluded: o.exclude, deleted, reset, keepFingerprintsEqual: true, cases, auditEventId };
  } catch (e) {
    await db.query('rollback').catch(() => undefined);
    throw e;
  }
}

/** Command line: --tenant CODE --actor USERNAME|@owner [--exclude N1,N2] [--execute --confirm CODE] [--reason TEXT] */
export function parseArgs(argv: string[]): ResetOptions {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tenantCode = get('tenant');
  const actorUsername = get('actor');
  if (!tenantCode || !actorUsername) throw new Error('Usage: --tenant CODE --actor USERNAME [--exclude N1,N2] [--execute --confirm CODE] [--reason TEXT]');
  const execute = argv.includes('--execute');
  if (execute && get('confirm') !== tenantCode) throw new Error('--execute needs --confirm with the same dealership code');
  const exclude = (get('exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { tenantCode, actorUsername, exclude, execute, reason: get('reason') ?? 'بازنشانی مراحل آزمایشی پرونده‌ها به درخواست مالک' };
}
