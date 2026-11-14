import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { permissionsFor, type Role } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import { alignStationUsernames, type UsernameChange } from '../auth/staff-usernames';
import { loadConfig } from '../config';
import { openDatabase } from '../db/database';
import { tenants, users } from '../db/schema';

// Read-only preview by default. Apply only a reviewed plan, under the explicitly
// selected tenant owner, after backup/restore verification. Never reads secrets.
async function main() {
  const cfg = loadConfig();
  const handle = openDatabase(cfg);
  try {
    const ownerId = process.env.STAFF_USERNAME_OWNER_ID;
    if (!ownerId) throw new Error('STAFF_USERNAME_OWNER_ID required');
    const [found] = await handle.db.select({ user: users, tenant: tenants }).from(users).innerJoin(tenants, eq(tenants.id, users.tenantId)).where(and(eq(users.id, ownerId), eq(users.isOwner, true), eq(users.isActive, true)));
    if (!found) throw new Error('Active owner not found');
    const { user, tenant } = found;
    const actor = { requestId: 'owner-requested-station-usernames', user: { id: user.id, isOwner: true, tenantId: tenant.id, tenantCode: tenant.code, tenantName: tenant.name, isTestTenant: tenant.isTest, username: user.username, displayName: user.displayName, roles: user.roles as Role[], permissions: permissionsFor(user.roles as Role[], tenant.permissionTemplates, user.permissionOverrides, true), sessionId: 'owner-authorized-maintenance' } };
    const path = process.env.STAFF_USERNAME_PLAN_PATH;
    const expected = path ? JSON.parse(readFileSync(path, 'utf8')) as UsernameChange[] : undefined;
    const plan = await alignStationUsernames(handle, new AuditService(handle, cfg), actor, expected);
    console.log(JSON.stringify({ applied: !!path, plan }));
  } finally { await handle.close(); }
}
main().catch(() => { console.error('Username alignment stopped; inspect the reviewed plan and account/station state.'); process.exitCode = 1; });
