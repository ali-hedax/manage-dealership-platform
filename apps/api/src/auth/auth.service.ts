import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { MODULES, permissionsFor, type LoginInput, type Me, type Role } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config';
import { AppError } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { sessions, tenants, users } from '../db/schema';
import type { AuthUser } from './auth.types';
import { hashPassword, verifyPassword } from './password';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const TOUCH_INTERVAL_MS = 5 * 60_000;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const invalidCredentials = () =>
  new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'نام کاربری یا رمز عبور نادرست است');

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  // Verified against when the user does not exist, so response time does not
  // reveal which usernames are valid.
  private dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  async login(
    input: LoginInput,
    meta: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<{ token: string; expiresAt: Date }> {
    const conditions = [eq(users.username, input.username.toLowerCase())];
    if (input.tenantCode) conditions.push(eq(tenants.code, input.tenantCode.toLowerCase()));
    const candidates = await this.db
      .select({ user: users, tenant: tenants })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(...conditions))
      .limit(2);

    if (candidates.length > 1) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'TENANT_REQUIRED', 'کد نمایندگی را وارد کنید');
    }
    const found = candidates[0];
    if (!found) {
      await verifyPassword(input.password, await this.dummyHash);
      this.logger.warn({ username: input.username, ip: meta.ip }, 'login failed: unknown user');
      throw invalidCredentials();
    }
    const { user, tenant } = found;
    const now = new Date();

    if (user.lockedUntil && user.lockedUntil > now) {
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        'ACCOUNT_LOCKED',
        'به دلیل تلاش‌های ناموفق، حساب موقتاً قفل شده است. چند دقیقه بعد دوباره تلاش کنید.',
      );
    }

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok || !user.isActive) {
      const failed = user.failedLoginCount + 1;
      await this.db
        .update(users)
        .set({
          failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
        })
        .where(eq(users.id, user.id));
      this.logger.warn({ userId: user.id, ip: meta.ip, failed }, 'login failed');
      throw invalidCredentials();
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.cfg.SESSION_TTL_HOURS * 3_600_000);
    const sessionId = newId();
    await this.db.transaction(async (tx) => {
      await tx.insert(sessions).values({
        id: sessionId,
        userId: user.id,
        tenantId: tenant.id,
        tokenHash: sha256(token),
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      });
      await tx
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
        .where(eq(users.id, user.id));
      await this.audit.record(
        tx,
        {
          user: this.toAuthUser(user, tenant, sessionId),
          requestId: meta.requestId,
          ip: meta.ip,
        },
        { entityType: 'user', entityId: user.id, action: 'auth.login' },
      );
    });
    return { token, expiresAt };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt)));
  }

  /** Resolves a session cookie to the user; slides expiry on activity. */
  async authenticate(token: string): Promise<AuthUser | null> {
    const now = new Date();
    const rows = await this.db
      .select({ session: sessions, user: users, tenant: tenants })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
      .where(
        and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
      )
      .limit(1);
    const row = rows[0];
    if (!row || !row.user.isActive) return null;

    if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db
        .update(sessions)
        .set({
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + this.cfg.SESSION_TTL_HOURS * 3_600_000),
        })
        .where(eq(sessions.id, row.session.id));
    }
    return this.toAuthUser(row.user, row.tenant, row.session.id);
  }

  me(user: AuthUser): Me {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roles: user.roles,
      permissions: [...user.permissions],
      tenant: { id: user.tenantId, code: user.tenantCode, name: user.tenantName },
      environment: this.cfg.APP_ENV,
      modules: MODULES.map((m) => ({ key: m.key, status: m.status })),
    };
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  private toAuthUser(
    user: typeof users.$inferSelect,
    tenant: typeof tenants.$inferSelect,
    sessionId: string,
  ): AuthUser {
    const roles = user.roles as Role[];
    return {
      id: user.id,
      tenantId: tenant.id,
      tenantCode: tenant.code,
      tenantName: tenant.name,
      isTestTenant: tenant.isTest,
      username: user.username,
      displayName: user.displayName,
      roles,
      permissions: permissionsFor(roles),
      sessionId,
    };
  }
}
