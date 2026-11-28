import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * Rehearsal of migrations 0034 + 0035 («پیگیری امداد ویژه») on a NON-production PostgreSQL copy.
 *
 *   node dist/scripts/rehearse-special-aid.js --url <postgres url of the copy> [--prepare-synthetic] [--out evidence.json]
 *
 * - Refuses a database named `manage` (the Production database name) and any database whose
 *   migration count is not exactly 34 (v1.0.8) before it starts.
 * - `--prepare-synthetic` (CI only): the database must be empty; it is brought to 34 migrations
 *   and filled with synthetic rows (is_test) that exercise reservations, notifications and users.
 * - Records row counts of every table and fingerprints of the existing rows of the tables the
 *   migrations touch, applies the migrations, and checks that nothing existing changed.
 * Exit code 1 when any check fails. Never run it against the live database.
 */
const BEFORE = 34;
const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const url = arg('--url') ?? process.env.REHEARSAL_DATABASE_URL;
const out = arg('--out');
const synthetic = args.includes('--prepare-synthetic');
const folder = resolve(__dirname, '../db/migrations');

/** Existing columns only: the new columns are removed so the fingerprint compares legacy data. */
const FINGERPRINTS: Record<string, string> = {
  stock_reservations: `to_jsonb(t) - 'special_aid_item_id'`,
  users: `to_jsonb(t) - 'job_titles' - 'access_expires_at'`,
  notifications: `to_jsonb(t) - 'category' - 'urgent' - 'resolved_at' - 'resolved_by'`,
  // is_demo (0044, H4): set on the cases of a test dealership, which this rehearsal's synthetic tenant is.
  cases: `to_jsonb(t) - 'is_demo'`,
  part_requests: 'to_jsonb(t)',
  emdad_requests: 'to_jsonb(t)',
  reference_entries: 'to_jsonb(t)',
  tenants: 'to_jsonb(t)',
};

async function snapshot(c: Client) {
  const tables = (await c.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).rows.map((r) => r.name);
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = Number((await c.query(`select count(*)::int as n from "${t}"`)).rows[0].n);
  const fingerprints: Record<string, string> = {};
  for (const [t, expr] of Object.entries(FINGERPRINTS)) {
    if (!tables.includes(t)) continue;
    fingerprints[t] = (await c.query(`select coalesce(md5(string_agg((${expr})::text, '|' order by t.id::text)), 'empty') as f from "${t}" t`)).rows[0].f;
  }
  const migrations = Number((await c.query(`select count(*)::int as n from drizzle.__drizzle_migrations`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
  return { migrations, counts, fingerprints };
}

async function prepareSynthetic(c: Client) {
  const tables = Number((await c.query(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`)).rows[0].n);
  if (tables > 0) throw new Error('--prepare-synthetic needs an empty database');
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
  const tmp = mkdtempSync(join(tmpdir(), 'manage-rehearsal-'));
  try {
    mkdirSync(join(tmp, 'meta'));
    const previous = { ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx < BEFORE) };
    writeFileSync(join(tmp, 'meta/_journal.json'), JSON.stringify(previous));
    for (const e of previous.entries) copyFileSync(join(folder, `${e.tag}.sql`), join(tmp, `${e.tag}.sql`));
    await migrate(drizzle(c), { migrationsFolder: tmp });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const [tenant, user, user2, vehicle, kase, part, part2, imp, snap, res, res2] = Array.from({ length: 11 }, () => randomUUID());
  await c.query(`insert into tenants(id,code,name,is_test) values ($1,'rehearsal','Synthetic rehearsal',true)`, [tenant]);
  await c.query(`insert into users(id,tenant_id,username,display_name,password_hash,roles,is_test) values ($1,$3,'rh-parts','Synthetic parts','unusable',ARRAY['parts_clerk'],true),($2,$3,'rh-expert','Synthetic expert','unusable',ARRAY['accident_expert'],true)`, [user, user2, tenant]);
  await c.query(`insert into vehicles(id,tenant_id,vin,is_test) values ($1,$2,'TESTVINREHEARSAL1',true)`, [vehicle, tenant]);
  await c.query(`insert into cases(id,tenant_id,vehicle_id,case_number,admitted_at,stage,created_by,updated_by,is_test) values ($1,$2,$3,'AC-1405-0901',now(),'in_repair',$4,$4,true)`, [kase, tenant, vehicle, user2]);
  await c.query(`insert into part_requests(id,tenant_id,case_id,description,part_number,source,status,created_by,is_test) values ($1,$3,$4,'قطعهٔ ساختگی','00123456','stock','reserved',$5,true),($2,$3,$4,'قطعهٔ ساختگی دوم','00654321','stock','handed_over',$5,true)`, [part, part2, tenant, kase, user]);
  await c.query(`insert into daily_report_imports(id,tenant_id,kind,status,file_name,file_size,file_sha256,format,parser_version,uploaded_by,is_test) values ($1,$2,'stock','applied','s.xlsx',1,'x','xlsx','1',$3,true)`, [imp, tenant, user]);
  await c.query(`insert into stock_snapshots(id,tenant_id,import_id,reported_at,reported_at_precision,item_count,published_by) values ($1,$2,$3,now(),'minute',2,$4)`, [snap, tenant, imp, user]);
  await c.query(`insert into stock_reservations(id,tenant_id,case_id,part_request_id,full_stock_code,quantity,snapshot_id,reserved_by,is_test) values ($1,$2,$3,$4,'0012345601',1,$5,$6,true)`, [res, tenant, kase, part, snap, user]);
  await c.query(`insert into stock_reservations(id,tenant_id,case_id,part_request_id,full_stock_code,quantity,snapshot_id,reserved_by,status,issued_at,issued_by,is_test) values ($1,$2,$3,$4,'0065432101',2,$5,$6,'issued',now(),$6,true)`, [res2, tenant, kase, part2, snap, user]);
  await c.query(`insert into notifications(id,tenant_id,user_id,kind,title,body,link,dedupe_key) values ($1,$2,$3,'daily_report_due','گزارش امروز','متن ساختگی','/daily-reports','rehearsal-1')`, [randomUUID(), tenant, user]);
}

async function main() {
  if (!url) throw new Error('--url (or REHEARSAL_DATABASE_URL) is required');
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const db = (await c.query<{ d: string }>('select current_database() as d')).rows[0]!.d;
    if (db === 'manage') throw new Error('Refusing the database named "manage" (Production name). Restore the backup into a separately named copy.');
    if (synthetic) await prepareSynthetic(c);
    const before = await snapshot(c);
    if (before.migrations !== BEFORE) throw new Error(`Expected ${BEFORE} applied migrations (v1.0.8), found ${before.migrations}`);
    const started = Date.now();
    await migrate(drizzle(c), { migrationsFolder: folder });
    const after = await snapshot(c);
    const failures: string[] = [];
    for (const [t, n] of Object.entries(before.counts)) if (after.counts[t] !== n) failures.push(`row count of ${t}: ${n} → ${after.counts[t]}`);
    for (const [t, f] of Object.entries(before.fingerprints)) if (after.fingerprints[t] !== f) failures.push(`existing rows of ${t} changed`);
    const q = async (sql: string) => (await c.query(sql)).rows[0];
    const orphan = Number((await q(`select count(*)::int as n from stock_reservations where special_aid_item_id is null and (case_id is null or part_request_id is null)`)).n);
    if (orphan) failures.push(`${orphan} reservations without an owner`);
    const ck = await q(`select convalidated from pg_constraint where conname = 'stock_reservations_owner_ck'`);
    if (!ck?.convalidated) failures.push('stock_reservations_owner_ck missing or not validated');
    for (const t of ['special_aid_dossiers', 'special_aid_admissions', 'special_aid_items', 'special_aid_contacts', 'special_aid_groups', 'special_aid_cards', 'special_aid_feedback', 'special_aid_appointment_links']) {
      if (after.counts[t] === undefined) failures.push(`table ${t} missing`); else if (after.counts[t] !== 0) failures.push(`table ${t} is not empty after migration`);
    }
    const users = await q(`select count(*) filter (where job_titles <> '{}')::int as titled, count(*) filter (where access_expires_at is not null)::int as expiring from users`);
    if (users.titled || users.expiring) failures.push('existing users received job titles or an access end date');
    const active = await q(`select count(*) filter (where status = 'reserved')::int as reserved, count(*) filter (where status = 'issued' and reflected_at is null)::int as issued from stock_reservations`);
    const evidence = { database: db, startedAt: new Date(started).toISOString(), seconds: (Date.now() - started) / 1000, synthetic, migrations: { before: before.migrations, after: after.migrations }, activeReservations: active, counts: before.counts, fingerprints: before.fingerprints, failures, ok: failures.length === 0 };
    const text = JSON.stringify(evidence, null, 2);
    if (out) writeFileSync(out, text);
    console.log(text);
    if (failures.length) process.exitCode = 1;
  } finally { await c.end(); }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
