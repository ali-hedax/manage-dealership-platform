import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { TechnicianAccountInput } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type Tx } from '../db/database';
import { sessions, users } from '../db/schema';
import { isTechnicianOnly } from './auth.service';
import type { Actor } from './auth.types';
import { hashPassword } from './password';

export interface TechnicianAccount {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  hasPin: boolean;
  locked: boolean;
  lastLoginAt: string | null;
}

/**
 * Technician accounts without email: username + 4-digit PIN, technician role
 * only. Created and reset by whoever holds user.manage (owner, and the system
 * administrator while the owner allows it).
 */
@Injectable()
export class TechniciansService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  async list(actor: Actor): Promise<TechnicianAccount[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, actor.user.tenantId), isNull(users.email)))
      .orderBy(asc(users.displayName));
    const now = Date.now();
    return rows
      .filter((u) => isTechnicianOnly(u.roles, u.isOwner))
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        isActive: u.isActive,
        hasPin: !!u.pinHash,
        locked: !!u.lockedUntil && u.lockedUntil.getTime() > now,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      }));
  }

  async create(actor: Actor, input: TechnicianAccountInput): Promise<TechnicianAccount[]> {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.username, input.username)));
      if (taken) throw conflict('USERNAME_TAKEN', 'این نام کاربری قبلاً استفاده شده است');
      const id = newId();
      await tx.insert(users).values({
        id,
        tenantId,
        username: input.username,
        displayName: input.displayName,
        // Never used: technicians sign in with their PIN only.
        passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
        pinHash: await hashPassword(input.pin),
        roles: ['technician'],
        isActive: true,
        activatedAt: new Date(),
        isTest: actor.user.isTestTenant,
      });
      await this.audit.record(tx, actor, {
        entityType: 'user',
        entityId: id,
        action: 'user.technician_created',
        after: { username: input.username, displayName: input.displayName, roles: ['technician'] },
      });
    });
    return this.list(actor);
  }

  async resetPin(actor: Actor, id: string, pin: string): Promise<TechnicianAccount[]> {
    await this.db.transaction(async (tx) => {
      const user = await this.loadTechnician(tx, actor.user.tenantId, id);
      await tx
        .update(users)
        .set({ pinHash: await hashPassword(pin), failedLoginCount: 0, lockedUntil: null, updatedAt: new Date(), version: sql`${users.version} + 1` })
        .where(eq(users.id, user.id));
      // A new PIN ends every open session of this technician.
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await this.audit.record(tx, actor, { entityType: 'user', entityId: user.id, action: 'user.technician_pin_reset' });
    });
    return this.list(actor);
  }

  async setActive(actor: Actor, id: string, active: boolean): Promise<TechnicianAccount[]> {
    await this.db.transaction(async (tx) => {
      const user = await this.loadTechnician(tx, actor.user.tenantId, id);
      await tx.update(users).set({ isActive: active, updatedAt: new Date(), version: sql`${users.version} + 1` }).where(eq(users.id, user.id));
      if (!active) await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await this.audit.record(tx, actor, {
        entityType: 'user',
        entityId: user.id,
        action: active ? 'user.technician_activated' : 'user.technician_deactivated',
      });
    });
    return this.list(actor);
  }

  private async loadTechnician(tx: Tx, tenantId: string, id: string) {
    const [user] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, tenantId)));
    if (!user) throw notFound('تعمیرکار');
    if (user.email || !isTechnicianOnly(user.roles, user.isOwner)) {
      throw badRequest('NOT_TECHNICIAN_ACCOUNT', 'رمز ۴ رقمی فقط برای حساب تعمیرکار بدون ایمیل است');
    }
    return user;
  }
}
