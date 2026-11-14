import { and, eq } from 'drizzle-orm';
import { normalizeRoles, technicianUsernameForStation } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import { conflict, forbidden } from '../common/errors';
import { newId } from '../common/ids';
import type { DatabaseHandle } from '../db/database';
import { users, workshopStations } from '../db/schema';
import type { Actor } from './auth.types';

export type UsernameChange = { id: string; version: number; before: string; after: string; stationCode: string; stationVersion: number };

/** Preview first; apply accepts exactly that preview. IDs, credentials, sessions
 * and all operational references stay unchanged. Old names cannot be aliases:
 * tech02, for example, may now belong to a different technician.
 */
export async function alignStationUsernames(handle: DatabaseHandle, audit: AuditService, actor: Actor, expected?: UsernameChange[]) {
  if (!actor.user.permissions.has('user.manage') || !actor.user.isOwner) throw forbidden();
  return handle.db.transaction(async tx => {
    const tenantId = actor.user.tenantId;
    const accounts = await tx.select().from(users).where(eq(users.tenantId, tenantId)).orderBy(users.id).for('update');
    const stations = await tx.select().from(workshopStations).where(eq(workshopStations.tenantId, tenantId)).orderBy(workshopStations.id).for('update');
    const plan: UsernameChange[] = [];
    for (const account of accounts) {
      const roles = normalizeRoles(account.roles);
      if (account.isOwner || !account.isActive || roles.length !== 1 || roles[0] !== 'technician') continue;
      const bays = stations.filter(s => s.responsibleUserId === account.id && s.isActive);
      if (bays.length !== 1) throw conflict('AMBIGUOUS_STATION', 'هر تکنسین باید دقیقاً یک جایگاه فعال داشته باشد');
      const bay = bays[0]!;
      let after: string;
      try { after = technicianUsernameForStation(bay.code); } catch { throw conflict('INVALID_STATION_CODE', 'کد جایگاه برای نام کاربری معتبر نیست'); }
      if (after !== account.username) plan.push({ id: account.id, version: account.version, before: account.username, after, stationCode: bay.code, stationVersion: bay.version });
    }
    const destinations = new Set<string>();
    for (const change of plan) {
      if (destinations.has(change.after) || accounts.some(a => a.username === change.after && a.id !== change.id && !plan.some(p => p.id === a.id))) {
        throw conflict('USERNAME_TAKEN', 'شناسه مقصد متعلق به حساب دیگری است؛ هیچ تغییری اعمال نشد');
      }
      destinations.add(change.after);
    }
    if (expected === undefined) return plan;
    if (JSON.stringify(expected) !== JSON.stringify(plan)) throw conflict('VERSION_CONFLICT', 'حساب یا جایگاه تغییر کرده؛ پیش‌نمایش را دوباره بررسی کنید');
    // Two phases allow swaps under the existing tenant+username unique index.
    for (const change of plan) await tx.update(users).set({ username: `rename-${newId()}` }).where(and(eq(users.id, change.id), eq(users.tenantId, tenantId)));
    for (const change of plan) {
      await tx.update(users).set({ username: change.after, version: change.version + 1, updatedAt: new Date() }).where(and(eq(users.id, change.id), eq(users.tenantId, tenantId)));
      await audit.record(tx, actor, { entityType: 'user', entityId: change.id, action: 'user.username_aligned', reason: 'Owner requested TECH plus assigned station code', before: { username: change.before }, after: { username: change.after, stationCode: change.stationCode } });
    }
    return plan;
  });
}
