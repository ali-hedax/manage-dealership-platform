import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, or } from 'drizzle-orm';
import {
  DEFAULT_PULSE_SETTINGS, parseJalali, toLatinDigits,
  type PulseCommandInput, type PulseCommandKind, type PulseCommandStatus, type PulseCredentialsInput, type PulseReviewRow, type PulseRunKind, type PulseRunOutcome, type PulseSettings, type PulseSettingsInput, type PulseState, type PulseStatus,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, conflict, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { APP_CONFIG, type AppConfig } from '../config';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { pulseCommands, pulseConnections, pulseRuns, receptionEvents, receptions } from '../db/schema';
import { caseNumbers, findCaseLink } from './pulse-link';
import { encryptSecret } from './pulse-secret';
import { tehranMidnight } from './pulse-map';

/** Events that count as «تغییر» in the status sentence. */
const CHANGE_EVENTS = ['status', 'released', 'reopened', 'part_added', 'part_changed', 'part_removed', 'part_restored'];

/**
 * «منیج پالس · اتصال کسب‌وکار» in system settings (owner and system administrator,
 * integration.manage). The API never connects to کسب‌وکار itself: «آزمایش اتصال», «همین الان
 * بخوان», backfill and the captcha answer are queued for the worker in pulse_commands.
 */
@Injectable()
export class PulseService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  private async connection(tx: DbOrTx, tenantId: string) {
    const [row] = await tx.select().from(pulseConnections).where(eq(pulseConnections.tenantId, tenantId));
    return row;
  }

  async status(actor: Actor): Promise<PulseStatus> {
    const tenantId = actor.user.tenantId;
    const conn = await this.connection(this.db, tenantId);
    const today = tehranMidnight(new Date());
    const [{ n: todayReceptions }] = await this.db.select({ n: count() }).from(receptions).where(and(eq(receptions.tenantId, tenantId), gte(receptions.admittedAt, today))) as [{ n: number }];
    const [{ n: todayChanges }] = await this.db.select({ n: count() }).from(receptionEvents).where(and(eq(receptionEvents.tenantId, tenantId), gte(receptionEvents.occurredAt, today), inArray(receptionEvents.kind, CHANGE_EVENTS))) as [{ n: number }];
    const [{ n: reviewCount }] = await this.db.select({ n: count() }).from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.linkState, 'ambiguous'))) as [{ n: number }];
    const runs = await this.db.select().from(pulseRuns).where(eq(pulseRuns.tenantId, tenantId)).orderBy(desc(pulseRuns.startedAt)).limit(20);
    const commands = await this.db.select().from(pulseCommands)
      .where(and(eq(pulseCommands.tenantId, tenantId), or(inArray(pulseCommands.status, ['pending', 'running']), gte(pulseCommands.createdAt, new Date(Date.now() - 86_400_000)))))
      .orderBy(desc(pulseCommands.createdAt)).limit(10);
    const settings: PulseSettings = { ...DEFAULT_PULSE_SETTINGS, ...(conn?.settings ?? {}) };
    return {
      featureEnabled: this.cfg.PULSE_ENABLED,
      secretReady: !!this.cfg.PULSE_SECRET_KEY,
      configured: !!conn?.passwordEnc,
      dealerCode: conn?.dealerCode ?? null,
      username: conn?.username ?? null,
      hasPassword: !!conn?.passwordEnc,
      enabled: conn?.enabled ?? false,
      state: (conn?.state ?? 'off') as PulseState,
      version: conn?.version ?? 0,
      settings,
      lastReadAt: conn?.lastReadAt?.toISOString() ?? null,
      lastErrorCode: conn?.lastErrorCode ?? null,
      workerSeenAt: conn?.workerSeenAt?.toISOString() ?? null,
      todayReceptions: Number(todayReceptions),
      todayChanges: Number(todayChanges),
      captchaImage: conn?.state === 'captcha' ? conn.captchaImage : null,
      reviewCount: Number(reviewCount),
      runs: runs.map((r) => ({ id: r.id, kind: r.kind as PulseRunKind, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, outcome: r.outcome as PulseRunOutcome, read: r.readCount, created: r.createdCount, changed: r.changedCount, errorCode: r.errorCode, details: r.details ?? null })),
      commands: commands.map((c) => ({ id: c.id, kind: c.kind as PulseCommandKind, status: c.status as PulseCommandStatus, createdAt: c.createdAt.toISOString(), finishedAt: c.finishedAt?.toISOString() ?? null, progress: c.progress ? { done: c.progress.done, total: c.progress.total } : null, resultCode: c.resultCode })),
    };
  }

  private requireSecret() {
    if (!this.cfg.PULSE_SECRET_KEY) throw badRequest('PULSE_SECRET_MISSING', 'کلید رمزگذاری پالس (PULSE_SECRET_KEY) روی سرور تنظیم نشده است؛ کلمه عبور ذخیره نشد.');
    return this.cfg.PULSE_SECRET_KEY;
  }
  private requireFeature() {
    if (!this.cfg.PULSE_ENABLED) throw badRequest('PULSE_DISABLED', 'منیج پالس روی این سرور خاموش است (PULSE_ENABLED)؛ پیش از شروع باید روی سرور روشن شود.');
  }

  /** Dealer code, user name and (write-only) password. Saving resets the failure counter and any stop. */
  async saveCredentials(actor: Actor, input: PulseCredentialsInput): Promise<PulseStatus> {
    const dealerCode = toLatinDigits(input.dealerCode).trim();
    if (!/^\d{1,16}$/.test(dealerCode)) throw badRequest('PULSE_DEALER_CODE', 'کد نمایندگی فقط از رقم تشکیل می‌شود.');
    const username = input.username.trim();
    await this.db.transaction(async (tx) => {
      const old = await this.connection(tx, actor.user.tenantId);
      const passwordEnc = input.password ? encryptSecret(input.password, this.requireSecret()) : undefined;
      if (!old) {
        if (input.expectedVersion !== 0) throw versionConflict(0);
        if (!passwordEnc) throw badRequest('PULSE_PASSWORD_REQUIRED', 'کلمه عبور کسب‌وکار را وارد کنید.');
        const id = newId();
        await tx.insert(pulseConnections).values({ id, tenantId: actor.user.tenantId, dealerCode, username, passwordEnc, settings: DEFAULT_PULSE_SETTINGS, updatedBy: actor.user.id, isTest: actor.user.isTestTenant });
        await this.audit.record(tx, actor, { entityType: 'pulse', entityId: id, action: 'pulse.credentials_saved', after: { dealerCode, username, passwordChanged: true } });
        return;
      }
      if (old.version !== input.expectedVersion) throw versionConflict(old.version);
      await tx.update(pulseConnections).set({
        dealerCode, username, ...(passwordEnc ? { passwordEnc } : {}),
        failedLogins: 0, captchaImage: null, lastErrorCode: null, state: old.enabled ? 'active' : 'off',
        updatedBy: actor.user.id, updatedAt: new Date(), version: old.version + 1,
      }).where(eq(pulseConnections.id, old.id));
      await this.audit.record(tx, actor, { entityType: 'pulse', entityId: old.id, action: 'pulse.credentials_saved', before: { dealerCode: old.dealerCode, username: old.username }, after: { dealerCode, username, passwordChanged: !!passwordEnc } });
    });
    return this.status(actor);
  }

  async saveSettings(actor: Actor, input: PulseSettingsInput): Promise<PulseStatus> {
    const { expectedVersion, ...settings } = input;
    await this.db.transaction(async (tx) => {
      const old = await this.connection(tx, actor.user.tenantId);
      if (!old) throw badRequest('PULSE_NOT_CONFIGURED', 'اول اطلاعات ورود کسب‌وکار را ثبت کنید.');
      if (old.version !== expectedVersion) throw versionConflict(old.version);
      await tx.update(pulseConnections).set({ settings, updatedBy: actor.user.id, updatedAt: new Date(), version: old.version + 1 }).where(eq(pulseConnections.id, old.id));
      await this.audit.record(tx, actor, { entityType: 'pulse', entityId: old.id, action: 'pulse.settings_saved', before: { ...old.settings }, after: { ...settings } });
    });
    return this.status(actor);
  }

  /** «شروع» / «توقف»: only the flag in the database changes; the worker reads it every 30 seconds. */
  async toggle(actor: Actor, expectedVersion: number, enabled: boolean): Promise<PulseStatus> {
    if (enabled) {
      this.requireFeature();
      this.requireSecret();
    }
    await this.db.transaction(async (tx) => {
      const old = await this.connection(tx, actor.user.tenantId);
      if (!old?.passwordEnc) throw badRequest('PULSE_NOT_CONFIGURED', 'اول اطلاعات ورود کسب‌وکار را ثبت کنید.');
      if (old.version !== expectedVersion) throw versionConflict(old.version);
      await tx.update(pulseConnections).set({
        enabled, state: enabled ? 'active' : 'off', ...(enabled ? { failedLogins: 0, captchaImage: null, lastErrorCode: null } : {}),
        updatedBy: actor.user.id, updatedAt: new Date(), version: old.version + 1,
      }).where(eq(pulseConnections.id, old.id));
      await this.audit.record(tx, actor, { entityType: 'pulse', entityId: old.id, action: enabled ? 'pulse.started' : 'pulse.stopped', before: { enabled: old.enabled, state: old.state }, after: { enabled } });
    });
    return this.status(actor);
  }

  /** Queues a command for the worker; a pending command of the same kind is not duplicated. */
  async command(actor: Actor, input: PulseCommandInput): Promise<PulseStatus> {
    this.requireFeature();
    let payload: Record<string, unknown> = {};
    if (input.kind === 'backfill') {
      const from = parseJalali(toLatinDigits(input.from).replace(/-/g, '/'));
      const now = Date.now();
      if (!from || from.getTime() > now || from.getTime() < now - 366 * 86_400_000) throw badRequest('PULSE_BAD_DATE', 'تاریخ شروع باید یک تاریخ شمسی در یک سال گذشته باشد (مثل ۱۴۰۵/۰۷/۰۱).');
      payload = { from: toLatinDigits(input.from).replace(/-/g, '/') };
    }
    await this.enqueue(actor, input.kind, payload);
    return this.status(actor);
  }

  /** The digits of the captcha image; the worker logs in once with them. */
  async captcha(actor: Actor, answer: string): Promise<PulseStatus> {
    this.requireFeature();
    const conn = await this.connection(this.db, actor.user.tenantId);
    if (conn?.state !== 'captcha') throw conflict('PULSE_NO_CAPTCHA', 'کد امنیتی‌ای در انتظار پاسخ نیست.');
    await this.enqueue(actor, 'captcha_answer', { answer: toLatinDigits(answer) });
    return this.status(actor);
  }

  private async enqueue(actor: Actor, kind: PulseCommandKind, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      const conn = await this.connection(tx, actor.user.tenantId);
      if (!conn?.passwordEnc) throw badRequest('PULSE_NOT_CONFIGURED', 'اول اطلاعات ورود کسب‌وکار را ثبت کنید.');
      const [pending] = await tx.select({ id: pulseCommands.id }).from(pulseCommands).where(and(eq(pulseCommands.tenantId, actor.user.tenantId), eq(pulseCommands.kind, kind), inArray(pulseCommands.status, ['pending', 'running'])));
      if (pending) return;
      const id = newId();
      await tx.insert(pulseCommands).values({ id, tenantId: actor.user.tenantId, kind, payload, requestedBy: actor.user.id, isTest: actor.user.isTestTenant });
      // The captcha digits are never written to the audit trail.
      await this.audit.record(tx, actor, { entityType: 'pulse', entityId: id, action: `pulse.command_${kind}`, after: kind === 'backfill' ? { from: payload.from } : null });
    });
  }

  /** Admissions whose accident-case link is ambiguous: shown for review, never linked automatically. */
  async review(actor: Actor): Promise<PulseReviewRow[]> {
    const tenantId = actor.user.tenantId;
    const rows = await this.db.select({ id: receptions.id, admissionNo: receptions.admissionNo, admissionNoKey: receptions.admissionNoKey, vin: receptions.vin, plate: receptions.plate, productName: receptions.productName })
      .from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.linkState, 'ambiguous'))).orderBy(desc(receptions.admittedAt)).limit(100);
    const out: PulseReviewRow[] = [];
    for (const r of rows) {
      const link = await findCaseLink(this.db, tenantId, r.admissionNoKey, r.vin);
      out.push({ receptionId: r.id, admissionNo: r.admissionNo, plate: r.plate, vehicleName: r.productName, candidates: await caseNumbers(this.db, tenantId, link.caseIds) });
    }
    return out;
  }
}
