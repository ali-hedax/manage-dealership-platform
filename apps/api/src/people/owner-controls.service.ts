import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, not, like, sql } from 'drizzle-orm';
import { auditActionLabel, permissionsFor, type AdminActions, type Permission, type Role, type StaffAdminInput, type SystemAdminAccount } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { auditEvents, cases, tenants, users } from '../db/schema';
import { monthOptions, monthRange } from './responsibility.service';

const STAFF: Permission = 'user.manage';

/**
 * The boundary between the owner and the system administrator: the owner gives
 * or takes "invite and deactivate staff" (the existing per-person override of
 * user.manage), and only the owner sees the report of system-admin actions,
 * read straight from the audit trail.
 */
@Injectable()
export class OwnerControlsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}
  private get db() {
    return this.handle.db;
  }

  private async assertOwner(actor: Actor, tx: DbOrTx = this.db) {
    const [u] = await tx.select({ isOwner: users.isOwner, isActive: users.isActive }).from(users).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId)));
    if (!u?.isOwner || !u.isActive) throw forbidden('این بخش فقط برای مالک سامانه است');
  }

  async admins(actor: Actor): Promise<SystemAdminAccount[]> {
    await this.assertOwner(actor);
    return this.adminList(this.db, actor.user.tenantId);
  }

  private async adminList(db: DbOrTx, tenantId: string): Promise<SystemAdminAccount[]> {
    const [tenant] = await db.select({ templates: tenants.permissionTemplates }).from(tenants).where(eq(tenants.id, tenantId));
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isOwner, false), sql`'system_admin' = any(${users.roles})`))
      .orderBy(asc(users.displayName));
    return rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      isActive: u.isActive,
      canManageStaff: permissionsFor(u.roles as Role[], tenant?.templates ?? {}, u.permissionOverrides, false).has(STAFF),
      version: u.version,
    }));
  }

  async setStaffAdmin(actor: Actor, id: string, input: StaffAdminInput): Promise<SystemAdminAccount[]> {
    await this.db.transaction(async (tx) => {
      // Same tenant lock as every other access change, so edits are serialized.
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, actor.user.tenantId)).for('update');
      await this.assertOwner(actor, tx);
      const [u] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, actor.user.tenantId))).for('update');
      if (!u) throw notFound('کارمند');
      if (u.isOwner || !u.roles.includes('system_admin')) throw badRequest('NOT_SYSTEM_ADMIN', 'این دسترسی فقط برای حساب مدیر سیستم تنظیم می‌شود');
      if (u.version !== input.expectedVersion) throw versionConflict(u.version);
      const before = u.permissionOverrides;
      const overrides = { allow: before.allow.filter((p) => p !== STAFF), deny: before.deny.filter((p) => p !== STAFF) };
      const fromRoles = permissionsFor(u.roles as Role[], tenant!.permissionTemplates, overrides, false).has(STAFF);
      if (input.granted && !fromRoles) overrides.allow.push(STAFF);
      if (!input.granted && fromRoles) overrides.deny.push(STAFF);
      const now = new Date();
      await tx.update(users).set({ permissionOverrides: overrides, version: u.version + 1, updatedAt: now }).where(eq(users.id, u.id));
      await this.audit.record(tx, actor, {
        entityType: 'user',
        entityId: u.id,
        action: input.granted ? 'user.staff_admin_granted' : 'user.staff_admin_revoked',
        occurredAt: now,
        before: { permissionOverrides: before },
        after: { permissionOverrides: overrides },
        snapshot: { version: u.version + 1, row: { id: u.id, roles: u.roles, permissionOverrides: overrides } },
      });
    });
    return this.adminList(this.db, actor.user.tenantId);
  }

  /** Every audited action of non-owner system administrators in one Jalali month (sign-ins excluded). */
  async adminActions(actor: Actor, month?: string): Promise<AdminActions> {
    await this.assertOwner(actor);
    const range = monthRange(month);
    const tenantId = actor.user.tenantId;
    const rows = await this.db
      .select({ e: auditEvents, actorName: users.displayName, caseNumber: cases.caseNumber })
      .from(auditEvents)
      .innerJoin(users, eq(users.id, auditEvents.actorUserId))
      .leftJoin(cases, and(eq(cases.id, auditEvents.caseId), eq(cases.tenantId, tenantId)))
      .where(
        and(
          eq(auditEvents.tenantId, tenantId),
          gte(auditEvents.occurredAt, range.from),
          lt(auditEvents.occurredAt, range.to),
          eq(users.isOwner, false),
          sql`'system_admin' = any(${users.roles})`,
          not(like(auditEvents.action, 'auth.%')),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(1000);
    return {
      month: range.key,
      label: range.label,
      months: monthOptions(),
      admins: await this.adminList(this.db, tenantId),
      rows: rows.map(({ e, actorName, caseNumber }) => ({
        id: e.id,
        occurredAt: e.occurredAt.toISOString(),
        actor: { id: e.actorUserId!, displayName: actorName },
        action: e.action,
        actionLabel: auditActionLabel(e.action),
        entityType: e.entityType,
        caseId: e.caseId,
        caseNumber: caseNumber ?? null,
        reason: e.reason,
      })),
    };
  }
}
