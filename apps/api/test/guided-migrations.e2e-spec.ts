import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

it('upgrades the previous schema without rewriting existing cases and rehearses additive rollback', async () => {
  const source = resolve(__dirname, '../src/db/migrations');
  const prefix = join(tmpdir(), 'manage-guided-migration-');
  const folder = mkdtempSync(prefix);
  if (!resolve(folder).startsWith(resolve(prefix))) throw new Error('Unexpected migration rehearsal path');
  const client = new PGlite();
  try {
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'));
    const previous = { ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx < 24) };
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify(previous));
    for (const entry of previous.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folder });
    const [tenant, user, vehicle, kase] = Array.from({ length: 4 }, () => randomUUID());
    await client.query("insert into tenants(id,code,name,is_test) values ($1,'migration-old','Synthetic migration',true)", [tenant]);
    await client.query("insert into users(id,tenant_id,username,display_name,password_hash,roles,is_test) values ($1,$2,'migration-user','Synthetic user','unusable',ARRAY['accident_expert'],true)", [user, tenant]);
    await client.query("insert into vehicles(id,tenant_id,vin,is_test) values ($1,$2,'TESTVINMIGRATION01',true)", [vehicle, tenant]);
    await client.query("insert into cases(id,tenant_id,vehicle_id,case_number,admitted_at,stage,created_by,updated_by,is_test) values ($1,$2,$3,'AC-1405-0999',now(),'quality_control',$4,$4,true)", [kase, tenant, vehicle, user]);
    const before = (await client.query('select to_jsonb(c) as data from cases c where tenant_id=$1 and id=$2', [tenant, kase])).rows;
    await migrate(db, { migrationsFolder: source });
    expect((await client.query('select count(*)::int as count from drizzle.__drizzle_migrations')).rows).toEqual([{ count: 26 }]);
    expect((await client.query('select workflow from cases where tenant_id=$1 and id=$2', [tenant, kase])).rows).toEqual([{ workflow: null }]);
    expect((await client.query("select to_jsonb(c)-'workflow' as data from cases c where tenant_id=$1 and id=$2", [tenant, kase])).rows).toEqual(before);
    expect((await client.query("select to_regclass('public.case_documents') as name")).rows).toEqual([{ name: 'case_documents' }]);
    for (const name of ['0025_freezing_alex_power', '0024_fat_zaran']) await client.exec(readFileSync(join(source, '../down', `${name}.sql`), 'utf8'));
    expect((await client.query('select to_jsonb(c) as data from cases c where tenant_id=$1 and id=$2', [tenant, kase])).rows).toEqual(before);
  } finally {
    await client.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
