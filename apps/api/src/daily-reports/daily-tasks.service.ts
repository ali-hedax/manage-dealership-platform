import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DAILY_REPORT_KINDS, DAILY_REPORT_KIND_LABELS, permissionsFor, type DailyReportKind, type DailyTaskState, type Role } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { dailyReportProfiles, dailyTasks, notifications, tenants, users } from '../db/schema';
import { tehranAt, tehranDate } from './daily-time';

export const DEFAULT_REMINDER = '11:00';

/**
 * The two daily update tasks and their internal reminders. Runs on the server
 * (not a browser timer or host cron). Tasks and notifications have unique keys
 * (tenant + Tehran day + kind, user + dedupe key), so restarts and several API
 * workers never create duplicates; the notified flag is claimed atomically.
 */
@Injectable()
export class DailyTasksService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('DailyTasks');
  private timer: NodeJS.Timeout | null = null;
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
  ) {}
  private get db() {
    return this.handle.db;
  }

  onApplicationBootstrap() {
    if (!this.cfg.DAILY_SCHEDULER || this.cfg.APP_ENV === 'test') return;
    const run = () => void this.tick().catch((e: unknown) => this.logger.error(`daily task tick failed: ${e instanceof Error ? e.message : 'unknown'}`));
    this.timer = setInterval(run, 60_000);
    this.timer.unref();
    run();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async profiles(tx: DbOrTx, tenantId: string) {
    const rows = await tx.select().from(dailyReportProfiles).where(eq(dailyReportProfiles.tenantId, tenantId));
    return new Map(rows.map((p) => [p.kind as DailyReportKind, p]));
  }

  /** Creates today's tasks (idempotent) and sends due reminders once. */
  async tick(now = new Date()): Promise<{ created: number; notified: number }> {
    const localDate = tehranDate(now);
    let created = 0;
    let notified = 0;
    for (const t of await this.db.select({ id: tenants.id }).from(tenants)) {
      const profiles = await this.profiles(this.db, t.id);
      for (const kind of DAILY_REPORT_KINDS) {
        const p = profiles.get(kind);
        const dueAt = tehranAt(localDate, p?.reminderTime ?? DEFAULT_REMINDER);
        const inserted = await this.db
          .insert(dailyTasks)
          .values({ id: newId(), tenantId: t.id, localDate, kind, dueAt })
          .onConflictDoNothing()
          .returning({ id: dailyTasks.id });
        created += inserted.length;
        if (now < dueAt) continue;
        const [claimed] = await this.db
          .update(dailyTasks)
          .set({ notifiedAt: now })
          .where(and(eq(dailyTasks.tenantId, t.id), eq(dailyTasks.localDate, localDate), eq(dailyTasks.kind, kind), eq(dailyTasks.status, 'pending'), isNull(dailyTasks.notifiedAt)))
          .returning();
        if (!claimed) continue;
        const recipients = await this.recipients(t.id, p?.reminderUserId ?? null);
        if (!recipients.length) continue;
        const rows = await this.db
          .insert(notifications)
          .values(
            recipients.map((userId) => ({
              id: newId(),
              tenantId: t.id,
              userId,
              kind: 'daily_report_due',
              title: `یادآوری: ${DAILY_REPORT_KIND_LABELS[kind]}`,
              body: 'گزارش امروز هنوز ثبت نشده است. فایل را از بخش «به‌روزرسانی گزارش‌های روزانه» بارگذاری و پس از پیش‌نمایش تأیید کنید. این یادآوری کاری را قفل نمی‌کند.',
              link: `/daily-reports?kind=${kind}`,
              dedupeKey: `daily:${kind}:${localDate}`,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: notifications.id });
        notified += rows.length;
      }
    }
    return { created, notified };
  }

  /** The configured person, or everyone active who may upload the daily files. */
  private async recipients(tenantId: string, configured: string | null): Promise<string[]> {
    const [tenant] = await this.db.select({ templates: tenants.permissionTemplates }).from(tenants).where(eq(tenants.id, tenantId));
    const staff = await this.db.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));
    if (configured && staff.some((u) => u.id === configured)) return [configured];
    return staff.filter((u) => permissionsFor(u.roles as Role[], tenant?.templates ?? {}, u.permissionOverrides, u.isOwner).has('daily_reports.upload')).map((u) => u.id);
  }

  /** Today's two tasks; a missing row (scheduler not run yet) is shown as pending. */
  async today(tenantId: string, now = new Date()): Promise<DailyTaskState[]> {
    const localDate = tehranDate(now);
    const rows = await this.db.select().from(dailyTasks).where(and(eq(dailyTasks.tenantId, tenantId), eq(dailyTasks.localDate, localDate)));
    const profiles = await this.profiles(this.db, tenantId);
    return DAILY_REPORT_KINDS.map((kind) => {
      const r = rows.find((x) => x.kind === kind);
      const dueAt = r?.dueAt ?? tehranAt(localDate, profiles.get(kind)?.reminderTime ?? DEFAULT_REMINDER);
      const status = (r?.status ?? 'pending') as DailyTaskState['status'];
      return { kind, localDate, dueAt: dueAt.toISOString(), status, late: status === 'pending' && now >= dueAt, completedAt: r?.completedAt?.toISOString() ?? null, unchangedDeclared: r?.unchangedDeclared ?? false };
    });
  }

  /**
   * Completes today's task with an applied import whose report day is today.
   * Content identical to the previous report counts only with the uploader's
   * explicit declaration that it is today's report (recorded in the audit).
   */
  async completeWith(tx: DbOrTx, actor: Actor, kind: DailyReportKind, importId: string, reportAt: Date, identical: boolean, declaredToday: boolean, now = new Date()): Promise<'done' | 'not_today' | 'needs_declaration' | 'already_done'> {
    const localDate = tehranDate(now);
    if (tehranDate(reportAt) !== localDate) return 'not_today';
    if (identical && !declaredToday) return 'needs_declaration';
    const profiles = await this.profiles(tx, actor.user.tenantId);
    await tx
      .insert(dailyTasks)
      .values({ id: newId(), tenantId: actor.user.tenantId, localDate, kind, dueAt: tehranAt(localDate, profiles.get(kind)?.reminderTime ?? DEFAULT_REMINDER) })
      .onConflictDoNothing();
    const [row] = await tx
      .update(dailyTasks)
      .set({ status: 'done', completedImportId: importId, completedAt: now, completedBy: actor.user.id, unchangedDeclared: identical })
      .where(and(eq(dailyTasks.tenantId, actor.user.tenantId), eq(dailyTasks.localDate, localDate), eq(dailyTasks.kind, kind), eq(dailyTasks.status, 'pending')))
      .returning();
    if (!row) return 'already_done';
    await this.audit.record(tx, actor, {
      entityType: 'daily_report',
      entityId: importId,
      action: identical ? 'daily_task.completed_unchanged_declared' : 'daily_task.completed',
      after: { kind, localDate, importId, unchangedDeclared: identical },
    });
    return 'done';
  }

  async inbox(actor: Actor) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.tenantId, actor.user.tenantId), eq(notifications.userId, actor.user.id)))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return {
      unread: rows.filter((r) => !r.readAt).length,
      items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null })),
    };
  }

  async markRead(actor: Actor, ids: string[] | 'all') {
    const scope = and(eq(notifications.tenantId, actor.user.tenantId), eq(notifications.userId, actor.user.id), isNull(notifications.readAt));
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(ids === 'all' ? scope : and(scope, inArray(notifications.id, ids)));
    return this.inbox(actor);
  }
}
