import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import {
  compareNightRows, daysInShop, isWorkingDay, NIGHT_LIST_DEADLINE, NIGHT_LIST_GENERATE_AT, NIGHT_LIST_KIND_LABELS, NIGHT_LIST_KINDS, nightListLate, nightListTimes, nightListMissing, nightListSheet, normalizeRoles, officialLabourName, shortVehicleName, toPersianDigits,
  type NightListItemInput, type NightListKind, type NightListPending, type NightListReason, type NightListRow, type NightListStatus, type NightListView, type NightStationOption, type ReceptionDayStats,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, conflict, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { APP_CONFIG, type AppConfig } from '../config';
import { tehranAt, tehranDate } from '../daily-reports/daily-time';
import { safeCell } from '../daily-reports/safe-cell';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { nightListItems, nightLists, notifications, receptionRepairs, receptions, tenants, users, workshopStations } from '../db/schema';
import { writeWorkbook } from '../parts/xlsx';
import { calendarAt } from '../workshop/work-calendar';
import { admissionKey } from './pulse-map';
import { ReceptionService } from './reception.service';

/** Notification keys and links keep their pre-H1 form for the repair list (no repeated alert on the release day). */
const kindSuffix = (kind: NightListKind) => (kind === 'repair' ? '' : `:${kind}`);
const kindQuery = (kind: NightListKind) => (kind === 'repair' ? '' : `&kind=${kind}`);
/** A reception belongs to the accident list when it is linked to an accident case. */
const ofKind = (kind: NightListKind) => (kind === 'accident' ? isNotNull(receptions.caseId) : isNull(receptions.caseId));

function qualified(r: typeof receptions.$inferSelect, cutoff: Date): boolean {
  return !!r.admittedAt && r.admittedAt < cutoff && (r.isOpen || (!!r.releasedAt && r.releasedAt > cutoff));
}

/**
 * «لیست شب» (reconstruction scenario, owner 2026-11-25). Half an hour before the end of the working
 * day in the work calendar (18:00 on a full day, 12:30 on a half-day Thursday) the open receptions
 * become a draft list; the receptionist picks one stay reason per vehicle (the reason of the previous
 * list is copied in), and the reception supervisor sends it. Still a draft 15 minutes after closing
 * (18:45 / 13:15): the service manager is told once. Nothing here writes to کسب‌وکار; receptions stay read only.
 */
@Injectable()
export class NightListService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NightListService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
    private readonly reception: ReceptionService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  onApplicationBootstrap() {
    if (!this.cfg.PULSE_ENABLED || !this.cfg.DAILY_SCHEDULER || this.cfg.APP_ENV === 'test') return;
    const run = () => void this.tick().catch((e: unknown) => this.logger.error(`night list tick failed: ${e instanceof Error ? e.message : 'unknown'}`));
    this.timer = setInterval(run, 60_000);
    this.timer.unref();
    run();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private ensureActive() {
    if (!this.cfg.PULSE_ENABLED) throw badRequest('RECEPTION_DISABLED', 'بخش پذیرش و ترخیص هنوز روی این سرور فعال نشده است.');
  }

  /**
   * Working day or not, and the day's build and send-by times from the work calendar in force that
   * day (a half-day Thursday closes earlier, so its list is built earlier).
   */
  private async schedule(tenantId: string, day: string, db: DbOrTx = this.db): Promise<{ working: boolean; generateAt: Date; deadline: Date; deadlineText: string }> {
    const revision = await calendarAt(db, tenantId, tehranAt(day, '12:00').toISOString());
    const times = nightListTimes(day, revision.calendar);
    const working = isWorkingDay(day, revision.calendar) && !!times;
    const generateAt = times?.generateAt ?? NIGHT_LIST_GENERATE_AT;
    const deadlineText = times?.deadline ?? NIGHT_LIST_DEADLINE;
    return { working, generateAt: tehranAt(day, generateAt), deadline: tehranAt(day, deadlineText), deadlineText };
  }

  /** The nearest earlier and later days that have a list, for browsing past lists. */
  private async neighbours(tenantId: string, day: string, kind: NightListKind, db: DbOrTx = this.db): Promise<{ previousDay: string | null; nextDay: string | null }> {
    const [prev] = await db.select({ day: nightLists.day }).from(nightLists).where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.kind, kind), lt(nightLists.day, day))).orderBy(desc(nightLists.day)).limit(1);
    const [next] = await db.select({ day: nightLists.day }).from(nightLists).where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.kind, kind), gt(nightLists.day, day))).orderBy(asc(nightLists.day)).limit(1);
    return { previousDay: prev?.day ?? null, nextDay: next?.day ?? null };
  }

  /** Active workshop stations for the station dropdowns (code order). */
  private async stations(tenantId: string, db: DbOrTx = this.db): Promise<NightStationOption[]> {
    return db.select({ code: workshopStations.code, name: workshopStations.name }).from(workshopStations)
      .where(and(eq(workshopStations.tenantId, tenantId), eq(workshopStations.isActive, true))).orderBy(asc(workshopStations.code));
  }

  /** «گزارش شب»: receptions admitted that day; never blocks the list when the statistics cannot be read. */
  private async summary(actor: Actor, day: string): Promise<ReceptionDayStats | null> {
    try {
      return await this.reception.stats(actor, day);
    } catch (e) {
      this.logger.warn(`night report summary failed: ${e instanceof Error ? e.message : 'unknown'}`);
      return null;
    }
  }

  /** Every minute: today's draft from the day's build time on a working day, and the late alert once. Idempotent. */
  async tick(now = new Date()): Promise<{ generated: number; alerted: number }> {
    const day = tehranDate(now);
    let generated = 0;
    let alerted = 0;
    for (const t of await this.db.select({ id: tenants.id, isTest: tenants.isTest }).from(tenants)) {
      const s = await this.schedule(t.id, day);
      if (!s.working || now < s.generateAt) continue;
      for (const kind of NIGHT_LIST_KINDS) {
        if (await this.generate(t.id, day, null, t.isTest, now, kind)) generated += 1;
        alerted += await this.alertLate(t.id, day, kind, now, s.deadline, s.deadlineText);
      }
    }
    return { generated, alerted };
  }

  /**
   * Creates the day's list (once) and adds every open reception not on it yet. Returns true when the
   * list was created now. A reason given on the previous list for the same reception is copied in.
   */
  async generate(tenantId: string, day: string, actor: Actor | null, isTest: boolean, now = new Date(), kind: NightListKind = 'repair'): Promise<boolean> {
    const schedule = await this.schedule(tenantId, day);
    if (!schedule.working) return false;
    const cutoff = now < schedule.generateAt ? now : schedule.generateAt;
    return this.db.transaction(async (tx) => {
      const listId = newId();
      const created = await tx.insert(nightLists).values({ id: listId, tenantId, day, kind, generatedAt: now, isTest }).onConflictDoNothing().returning({ id: nightLists.id });
      const [list] = await tx.select().from(nightLists).where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.day, day), eq(nightLists.kind, kind))).for('update');
      if (!list) return false;
      if (list.status !== 'draft') return created.length > 0;
      const open = await tx.select({ id: receptions.id }).from(receptions)
        .where(and(eq(receptions.tenantId, tenantId), lt(receptions.admittedAt, cutoff), ofKind(kind),
          or(eq(receptions.isOpen, true), gt(receptions.releasedAt, cutoff))));
      const present = new Set((await tx.select({ receptionId: nightListItems.receptionId }).from(nightListItems).where(eq(nightListItems.listId, list.id))).map((r) => r.receptionId));
      const missing = open.map((r) => r.id).filter((id) => !present.has(id));
      if (missing.length) {
        // The latest earlier list item of each reception, for the reason and stations to copy.
        const earlier = await tx.select({ receptionId: nightListItems.receptionId, reason: nightListItems.reason, reasonNote: nightListItems.reasonNote, currentStation: nightListItems.currentStation, nextStations: nightListItems.nextStations, day: nightLists.day })
          .from(nightListItems).innerJoin(nightLists, eq(nightLists.id, nightListItems.listId))
          .where(and(eq(nightListItems.tenantId, tenantId), inArray(nightListItems.receptionId, missing), lt(nightLists.day, day)))
          .orderBy(desc(nightLists.day));
        const previous = new Map<string, (typeof earlier)[number]>();
        for (const e of earlier) if (!previous.has(e.receptionId)) previous.set(e.receptionId, e);
        await tx.insert(nightListItems).values(missing.map((receptionId) => {
          const p = previous.get(receptionId);
          return { id: newId(), tenantId, listId: list.id, receptionId, reason: p?.reason ?? null, reasonNote: p?.reasonNote ?? null, currentStation: p?.currentStation ?? null, nextStations: p?.nextStations ?? null, carried: !!p?.reason, isTest };
        })).onConflictDoNothing();
        if (!created.length) {
          await tx.update(nightLists).set({ version: list.version + 1 })
            .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.id, list.id)));
        }
      }
      if (created.length || missing.length) {
        if (actor) await this.audit.record(tx, actor, { entityType: 'night_list', entityId: list.id, action: 'reception.night_list_generated', after: { day, kind, added: missing.length } });
      }
      return created.length > 0;
    });
  }

  /** Still a draft at the send-by time: one notification to each active service manager (the owner when there is none). */
  private async alertLate(tenantId: string, day: string, kind: NightListKind, now: Date, deadline: Date, deadlineText: string): Promise<number> {
    if (now < deadline) return 0;
    // An empty accident list has nothing to send: no alert for it.
    if (kind === 'accident') {
      const [one] = await this.db.select({ id: nightListItems.id }).from(nightListItems).innerJoin(nightLists, eq(nightLists.id, nightListItems.listId))
        .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.day, day), eq(nightLists.kind, kind))).limit(1);
      if (!one) return 0;
    }
    const label = NIGHT_LIST_KIND_LABELS[kind];
    const staff = await this.db.select({ id: users.id, roles: users.roles, isOwner: users.isOwner }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));
    const managers = staff.filter((u) => normalizeRoles(u.roles).includes('service_manager')).map((u) => u.id);
    const recipients = managers.length ? managers : staff.filter((u) => u.isOwner).map((u) => u.id);
    if (!recipients.length) return 0;
    return this.db.transaction(async (tx) => {
      const [claimed] = await tx.update(nightLists).set({ lateNotifiedAt: now })
        .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.day, day), eq(nightLists.kind, kind), eq(nightLists.status, 'draft'), isNull(nightLists.lateNotifiedAt)))
        .returning({ id: nightLists.id });
      if (!claimed) return 0;
      const rows = await tx.insert(notifications).values(recipients.map((userId) => ({
        id: newId(), tenantId, userId, kind: 'night_list_late', title: `${label} هنوز ارسال نشده است`,
        body: `مهلت ارسال ${label} (ساعت ${toPersianDigits(deadlineText)}) گذشت.`, link: `/reception/night${kind === 'repair' ? '' : `?kind=${kind}`}`, dedupeKey: `night_list_late:${day}${kindSuffix(kind)}`, urgent: true,
      }))).onConflictDoNothing().returning({ id: notifications.id });
      return rows.length;
    });
  }

  /** The list of a day, or when it is not built yet, the time it will be. */
  async view(actor: Actor, day?: string, now = new Date(), kind: NightListKind = 'repair'): Promise<NightListView | NightListPending> {
    this.ensureActive();
    const tenantId = actor.user.tenantId;
    const d = day ?? tehranDate(now);
    const [list] = await this.db.select({ l: nightLists, sentByName: users.displayName }).from(nightLists).leftJoin(users, eq(users.id, nightLists.sentBy))
      .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.day, d), eq(nightLists.kind, kind)));
    if (!list) {
      const s = await this.schedule(tenantId, d);
      return { day: d, kind, status: 'not_generated', generatesAt: s.generateAt.toISOString(), workingDay: s.working, ...(await this.neighbours(tenantId, d, kind)), summary: await this.summary(actor, d) };
    }
    return { ...(await this.render(tenantId, list.l, list.sentByName ?? null, now)), summary: await this.summary(actor, d) };
  }

  private async render(tenantId: string, l: typeof nightLists.$inferSelect, sentByName: string | null, now: Date, db: DbOrTx = this.db): Promise<NightListView> {
    const s = await this.schedule(tenantId, l.day, db);
    const cutoff = now < s.generateAt ? now : s.generateAt;
    // A list approved before snapshots existed: show what staff recorded on it, but never today's
    // live labour statuses, and label it «داده‌ی تاریخی ناقص».
    const historical = l.status === 'sent' && !l.approvedSnapshot;
    const items = l.approvedSnapshot ? [] : await db.select({ i: nightListItems, r: receptions, setByName: users.displayName }).from(nightListItems)
      .innerJoin(receptions, eq(receptions.id, nightListItems.receptionId))
      .leftJoin(users, eq(users.id, nightListItems.setBy))
      .where(and(eq(nightListItems.tenantId, tenantId), eq(nightListItems.listId, l.id), eq(receptions.tenantId, tenantId), ...(l.status === 'draft' ? [ofKind(l.kind as NightListKind)] : [])));
    const ids = items.map((x) => x.r.id);
    const labour = ids.length && !historical
      ? await db.select({ receptionId: receptionRepairs.receptionId, description: receptionRepairs.description, code: receptionRepairs.code, state: receptionRepairs.state }).from(receptionRepairs)
        .where(and(eq(receptionRepairs.tenantId, tenantId), inArray(receptionRepairs.receptionId, ids), isNull(receptionRepairs.removedAt)))
      : [];
    const labourOf = new Map<string, string[]>();
    for (const x of labour) {
      const name = officialLabourName(x.description, x.code);
      const text = [name, x.state && `(${x.state})`].filter(Boolean).join(' ');
      labourOf.set(x.receptionId, [...(labourOf.get(x.receptionId) ?? []), text]);
    }
    const at = s.generateAt;
    const included = new Set(items.filter(({ i, r }) => (historical ? i.correction?.present !== false : i.correction?.present ?? qualified(r, cutoff))).map(({ i }) => i.id));
    const draftRows: NightListRow[] = items.map(({ i, r, setByName }) => ({
      id: i.id,
      version: i.version,
      receptionId: r.id,
      admissionNo: r.admissionNo,
      plate: r.plate,
      vehicleName: r.productName || r.modelName ? shortVehicleName(r.productName, r.productName ?? r.modelName) : null,
      ownerName: r.customerName,
      daysIn: r.admittedAt ? daysInShop(r.admittedAt.toISOString(), at.getTime()) : null,
      isOpen: historical ? true : r.isOpen,
      accident: !!r.caseId,
      labour: historical ? ['نامشخص'] : labourOf.get(r.id) ?? [],
      currentStation: i.currentStation,
      nextStations: i.nextStations,
      reason: (i.reason as NightListReason | null) ?? null,
      reasonNote: i.reasonNote,
      carried: i.carried,
      setByName: setByName ?? null,
      setAt: i.setAt?.toISOString() ?? null,
      correction: i.correction,
    })).sort(compareNightRows);
    const rows = l.approvedSnapshot?.rows ?? draftRows.filter((r) => included.has(r.id));
    const physicalVehicleCount = l.status === 'sent' ? l.approvedSnapshot?.physicalVehicleCount ?? null
      : new Set(items.filter(({ i }) => included.has(i.id)).map(({ r }) => r.vin || r.plate || r.id)).size;
    const deadline = l.approvedSnapshot ? new Date(l.approvedSnapshot.deadline) : s.deadline;
    const status = l.status as NightListStatus;
    return {
      id: l.id, kind: l.kind as NightListKind, day: l.day, status, version: l.version, generatedAt: l.generatedAt.toISOString(), sentAt: l.sentAt?.toISOString() ?? null,
      sentByName: l.approvedSnapshot?.sentByName ?? sentByName,
      historicalIncomplete: status === 'sent' && !l.approvedSnapshot,
      excluded: status === 'sent' ? [] : draftRows.filter((r) => !included.has(r.id)),
      physicalVehicleCount,
      deadline: deadline.toISOString(), late: nightListLate(status, deadline, now), missingReasons: nightListMissing(rows), rows,
      ...(await this.neighbours(tenantId, l.day, l.kind as NightListKind, db)),
      stations: await this.stations(tenantId, db),
      summary: null,
    };
  }

  /** Draft now (before the build time or after a missed minute) by the person who sends the list. */
  async generateNow(actor: Actor, day?: string, kind: NightListKind = 'repair'): Promise<NightListView | NightListPending> {
    this.ensureActive();
    const d = day ?? tehranDate(new Date());
    if (d > tehranDate(new Date())) throw badRequest('NIGHT_LIST_FUTURE', 'لیست شب روزهای آینده ساخته نمی‌شود.');
    await this.generate(actor.user.tenantId, d, actor, actor.user.isTestTenant, new Date(), kind);
    return this.view(actor, d, new Date(), kind);
  }

  async setItem(actor: Actor, itemId: string, input: NightListItemInput): Promise<NightListView> {
    this.ensureActive();
    const tenantId = actor.user.tenantId;
    const listId = await this.db.transaction(async (tx) => {
      const [target] = await tx.select({ listId: nightListItems.listId }).from(nightListItems)
        .where(and(eq(nightListItems.tenantId, tenantId), eq(nightListItems.id, itemId)));
      if (!target) throw notFound('ردیف لیست شب');
      const [list] = await tx.select({ status: nightLists.status, version: nightLists.version }).from(nightLists)
        .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.id, target.listId))).for('update');
      if (!list || list.status !== 'draft') throw conflict('NIGHT_LIST_SENT', 'این لیست قبلاً ارسال شده است.');
      const [item] = await tx.select().from(nightListItems).where(and(eq(nightListItems.tenantId, tenantId), eq(nightListItems.id, itemId))).for('update');
      if (!item) throw notFound('ردیف لیست شب');
      if (item.version !== input.expectedVersion) throw versionConflict(item.version);
      const next = {
        reason: input.reason,
        reasonNote: input.reasonNote?.trim() || null,
        currentStation: input.currentStation?.trim() || null,
        nextStations: input.nextStations?.trim() || null,
      };
      await tx.update(nightListItems).set({ ...next, carried: false, setBy: actor.user.id, setAt: new Date(), version: item.version + 1 })
        .where(and(eq(nightListItems.tenantId, tenantId), eq(nightListItems.id, item.id)));
      await tx.update(nightLists).set({ version: list.version + 1 })
        .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.id, item.listId)));
      await this.audit.record(tx, actor, {
        entityType: 'night_list', entityId: item.listId, action: 'reception.night_list_item_set',
        before: { receptionId: item.receptionId, reason: item.reason, reasonNote: item.reasonNote, currentStation: item.currentStation, nextStations: item.nextStations, carried: item.carried },
        after: { receptionId: item.receptionId, ...next },
      });
      return item.listId;
    });
    return this.byId(actor, listId);
  }

  async correctPresence(actor: Actor, listId: string, input: { admissionNo: string; present: boolean; reason: string; expectedVersion: number }): Promise<NightListView> {
    this.ensureActive();
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const [list] = await tx.select().from(nightLists)
        .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.id, listId))).for('update');
      if (!list) throw notFound('لیست شب');
      if (list.status !== 'draft') throw conflict('NIGHT_LIST_SENT', 'این لیست قبلاً ارسال شده است.');
      if (list.version !== input.expectedVersion) throw versionConflict(list.version);
      const key = admissionKey(input.admissionNo);
      if (!key) throw badRequest('NIGHT_LIST_RECEPTION_MATCH', 'شمارهٔ پذیرش معتبر نیست.');
      const matches = await tx.select({ id: receptions.id }).from(receptions)
        .where(and(eq(receptions.tenantId, tenantId), eq(receptions.admissionNoKey, key))).limit(2);
      if (matches.length !== 1) throw badRequest('NIGHT_LIST_RECEPTION_MATCH', 'شمارهٔ پذیرش باید دقیقاً با یک کارت مطابقت داشته باشد.');
      const receptionId = matches[0]!.id;
      const [item] = await tx.select().from(nightListItems)
        .where(and(eq(nightListItems.tenantId, tenantId), eq(nightListItems.listId, listId), eq(nightListItems.receptionId, receptionId)));
      const correction = { present: input.present, reason: input.reason };
      if (item) {
        await tx.update(nightListItems).set({ correction, version: item.version + 1 })
          .where(and(eq(nightListItems.tenantId, tenantId), eq(nightListItems.id, item.id)));
      } else {
        await tx.insert(nightListItems).values({ id: newId(), tenantId, listId, receptionId, correction, isTest: actor.user.isTestTenant });
      }
      await tx.update(nightLists).set({ version: list.version + 1 })
        .where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.id, listId)));
      await this.audit.record(tx, actor, {
        entityType: 'night_list', entityId: listId, action: 'reception.night_list_presence_corrected',
        before: { receptionId, correction: item?.correction ?? null }, after: { receptionId, correction },
      });
    });
    return this.byId(actor, listId);
  }

  /** The reception supervisor sends the list; missing reasons are a warning, not a lock (spec section 2). */
  async send(actor: Actor, listId: string, expectedVersion: number): Promise<NightListView> {
    this.ensureActive();
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const [list] = await tx.select().from(nightLists).where(and(eq(nightLists.tenantId, tenantId), eq(nightLists.id, listId))).for('update');
      if (!list) throw notFound('لیست شب');
      if (list.version !== expectedVersion) throw versionConflict(list.version);
      if (list.status === 'sent') throw conflict('NIGHT_LIST_SENT', 'این لیست قبلاً ارسال شده است.');
      const now = new Date();
      const draft = await this.render(tenantId, list, actor.user.displayName, now, tx);
      const approvedSnapshot = { rows: draft.rows, deadline: draft.deadline, sentByName: draft.sentByName, physicalVehicleCount: draft.physicalVehicleCount };
      await tx.update(nightLists).set({ status: 'sent', sentAt: now, sentBy: actor.user.id, approvedSnapshot, version: list.version + 1 }).where(eq(nightLists.id, list.id));
      const missing = draft.missingReasons;
      await this.audit.record(tx, actor, { entityType: 'night_list', entityId: list.id, action: 'reception.night_list_sent', before: { status: list.status }, after: { status: 'sent', day: list.day, kind: list.kind, missingReasons: missing } });
      const kind = list.kind as NightListKind;
      const staff = await tx.select({ id: users.id, roles: users.roles, isOwner: users.isOwner }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));
      const recipients = staff.filter((u) => u.id !== actor.user.id && (u.isOwner || normalizeRoles(u.roles).includes('service_manager'))).map((u) => u.id);
      if (recipients.length) {
        await tx.insert(notifications).values(recipients.map((userId) => ({
          id: newId(), tenantId, userId, kind: 'night_list_sent', title: `${NIGHT_LIST_KIND_LABELS[kind]} ارسال شد`, body: missing ? `${missing} خودرو بدون علت ماندن است.` : null,
          link: `/reception/night?day=${list.day}${kindQuery(kind)}`, dedupeKey: `night_list_sent:${list.day}${kindSuffix(kind)}`,
        }))).onConflictDoNothing();
      }
    });
    return this.byId(actor, listId);
  }

  private async byId(actor: Actor, listId: string): Promise<NightListView> {
    const [list] = await this.db.select({ l: nightLists, sentByName: users.displayName }).from(nightLists).leftJoin(users, eq(users.id, nightLists.sentBy))
      .where(and(eq(nightLists.tenantId, actor.user.tenantId), eq(nightLists.id, listId)));
    if (!list) throw notFound('لیست شب');
    const view = await this.render(actor.user.tenantId, list.l, list.sentByName ?? null, new Date());
    return { ...view, summary: await this.summary(actor, view.day) };
  }

  async excel(actor: Actor, listId: string): Promise<{ day: string; kind: NightListKind; bytes: Uint8Array }> {
    this.ensureActive();
    const view = await this.byId(actor, listId);
    // Texts come from کسب‌وکار and people: neutralise spreadsheet formulas.
    const sheet = nightListSheet(view.rows);
    if (view.historicalIncomplete) sheet.unshift(['داده‌ی تاریخی ناقص']);
    const rows = sheet.map((r) => r.map((c) => (typeof c === 'string' ? safeCell(c) : c)));
    return { day: view.day, kind: view.kind, bytes: writeWorkbook([{ name: NIGHT_LIST_KIND_LABELS[view.kind], rows }]) };
  }
}
