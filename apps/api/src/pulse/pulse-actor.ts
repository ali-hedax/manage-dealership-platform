import { normalizeRoles, permissionsFor, type Role } from '@manage/shared';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../auth/auth.types';
import type { DbOrTx } from '../db/database';
import { pulseConnections, tenants, users } from '../db/schema';

/**
 * The person who configured Manage Pulse acts for its automatic previews and confirmations, with
 * their own permissions (a missing permission stops the automatic step, never widens it).
 */
export async function pulseActor(db: DbOrTx, tenantId: string, userId: string): Promise<Actor | null> {
  const [row] = await db.select({ u: users, t: tenants }).from(users).innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  if (!row || !row.u.isActive) return null;
  const roles = normalizeRoles(row.u.roles as Role[]);
  return {
    user: {
      id: row.u.id, tenantId, tenantCode: row.t.code, tenantName: row.t.name, isTestTenant: row.t.isTest,
      username: row.u.username, displayName: row.u.displayName, roles, isOwner: row.u.isOwner,
      permissions: permissionsFor(roles, row.t.permissionTemplates, row.u.permissionOverrides, row.u.isOwner), sessionId: 'pulse',
    },
    requestId: 'manage-pulse',
  };
}

/**
 * Whether files Pulse read are confirmed automatically for this dealership (owner, 2026-11-24:
 * «نیاز به ثبت دستی دیگه نداشته باشه»). On unless the owner turned it off.
 */
export async function pulseAutoApply(db: DbOrTx, tenantId: string): Promise<boolean> {
  const [c] = await db.select({ settings: pulseConnections.settings }).from(pulseConnections).where(eq(pulseConnections.tenantId, tenantId));
  return !!c && (c.settings as { autoApply?: boolean } | null)?.autoApply !== false;
}
