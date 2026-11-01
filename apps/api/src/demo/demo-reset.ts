import { sql } from 'drizzle-orm';
import type { Database } from '../db/database';

/**
 * Deletes every synthetic tenant (tenants.is_test = true) and all of its rows.
 * Real tenants are never touched. The audit trigger only allows deleting
 * is_test audit rows, and only inside this transaction's purge flag.
 */
export async function purgeTestTenants(db: Database): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('manage.audit_purge', 'on', true)`);
    const rows = await tx.execute<{ id: string }>(sql`select id from tenants where is_test = true`);
    const ids = ((rows as any).rows ?? rows) as { id: string }[];
    for (const { id } of ids) {
      await tx.execute(sql`delete from idempotency_keys where tenant_id = ${id}`);
      await tx.execute(sql`delete from change_log where tenant_id = ${id}`);
      await tx.execute(sql`delete from audit_events where tenant_id = ${id}`);
      await tx.execute(sql`delete from assessment_items where tenant_id = ${id}`);
      await tx.execute(sql`delete from assessments where tenant_id = ${id}`);
      await tx.execute(sql`delete from blockers where tenant_id = ${id}`);
      await tx.execute(
        sql`delete from task_dependencies where task_id in (select id from tasks where tenant_id = ${id})`,
      );
      await tx.execute(sql`delete from tasks where tenant_id = ${id}`);
      await tx.execute(sql`delete from cases where tenant_id = ${id}`);
      await tx.execute(sql`delete from case_counters where tenant_id = ${id}`);
      await tx.execute(sql`delete from customers where tenant_id = ${id}`);
      await tx.execute(sql`delete from vehicles where tenant_id = ${id}`);
      await tx.execute(sql`delete from sessions where tenant_id = ${id}`);
      await tx.execute(sql`delete from departments where tenant_id = ${id}`);
      await tx.execute(sql`delete from users where tenant_id = ${id}`);
      await tx.execute(sql`delete from tenants where id = ${id} and is_test = true`);
    }
    return ids.length;
  });
}
