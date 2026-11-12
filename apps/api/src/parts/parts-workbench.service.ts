import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  manageSupplyAdvice, parseJalali, parseBasePartNumber, parseStockCode, workingMinutesBetween,
  type PartPickup, type PartsWorkbench, type PartsWorkbenchAction, type PartsWorkbenchLine,
  workingDayMinutes,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { assertNotFuture } from '../cases/cases.service';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import type { EmdadOfficial } from '../daily-reports/report-rows';
import { StockService, snapshotInfo } from '../daily-reports/stock.service';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { blockers, cases, departments, emdadRequests, partRequests, tasks, vehicles } from '../db/schema';
import { calendarAt } from '../workshop/work-calendar';
import { PartsService } from './parts.service';

type PartRow = typeof partRequests.$inferSelect;
const RECEIVED = ['in_dealer_stock', 'received_by_dealer'];
const ACTIVE = ['needed', 'ordered', 'rejected', 'received', 'reserved'];
const companyRequest = (p: PartRow) => p.source === 'company' && !!p.orderRef;
const DAY_MS = 86_400_000;
const baseOf = (code: string | null) => code ? parseStockCode(code)?.basePartNumber ?? parseBasePartNumber(code) : null;

function reportDate(value: string | undefined): Date | null {
  const match = value?.trim().match(/^(\S+)(?:\s+(\S+))?$/);
  return match ? parseJalali(match[1]!, match[2] ?? '00:00') : null;
}


@Injectable()
export class PartsWorkbenchService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly parts: PartsService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, includeTransit = false): Promise<PartsWorkbench> {
    const db = this.handle.db;
    const tenantId = actor.user.tenantId;
    const now = new Date();
    const [rows, links, waiting, calendar, receipts, upcoming, activeTasks, departmentsList] = await Promise.all([
      db.select({ p: partRequests, c: cases, v: vehicles }).from(partRequests)
        .innerJoin(cases, and(eq(cases.id, partRequests.caseId), eq(cases.tenantId, tenantId), eq(cases.status, 'open')))
        .innerJoin(vehicles, and(eq(vehicles.id, cases.vehicleId), eq(vehicles.tenantId, tenantId)))
        .where(and(eq(partRequests.tenantId, tenantId), inArray(partRequests.status, ACTIVE)))
        .orderBy(asc(partRequests.createdAt), asc(partRequests.id)),
      db.select().from(emdadRequests).where(and(eq(emdadRequests.tenantId, tenantId), isNotNull(emdadRequests.partRequestId))),
      db.select({ partId: blockers.partRequestId, taskId: blockers.taskId, taskTitle: tasks.title }).from(blockers)
        .leftJoin(tasks, and(eq(tasks.id, blockers.taskId), eq(tasks.tenantId, tenantId)))
        .where(and(eq(blockers.tenantId, tenantId), isNull(blockers.resolvedAt), isNotNull(blockers.partRequestId))),
      calendarAt(db, tenantId, now.toISOString()),
      db.select({ official: emdadRequests.official }).from(emdadRequests).where(and(
        eq(emdadRequests.tenantId, tenantId), inArray(emdadRequests.statusCategory, RECEIVED))),
      db.select({ caseId: tasks.caseId, start: tasks.plannedStartAt }).from(tasks)
        .where(and(eq(tasks.tenantId, tenantId), eq(tasks.status, 'pending'), isNotNull(tasks.plannedStartAt))),
      db.select().from(tasks).where(and(eq(tasks.tenantId, tenantId), inArray(tasks.status, ['pending', 'in_progress', 'blocked']))),
      db.select().from(departments).where(eq(departments.tenantId, tenantId)),

    ]);
    const leadTimes = new Map<string, { count: number; days: number }>();
    for (const { official } of receipts) {
      const fields = official as EmdadOfficial;
      const code = fields.fullCodeBase ?? baseOf(fields.initialCode) ?? baseOf(fields.partCode);
      const ordered = reportDate(fields.emdadRegisteredAt);
      const received = reportDate(fields.receivedInWarehouseAt);
      if (!code || !ordered || !received || received < ordered) continue;
      const total = leadTimes.get(code) ?? { count: 0, days: 0 };
      total.count++;
      total.days += (received.getTime() - ordered.getTime()) / DAY_MS;
      leadTimes.set(code, total);
    }
    // When each car's next unit is planned to start: the date a missing part is really needed by.
    const needBy = new Map<string, Date>();
    for (const t of upcoming) if (t.start && (!needBy.has(t.caseId) || t.start < needBy.get(t.caseId)!)) needBy.set(t.caseId, t.start);
    const dayMinutes = workingDayMinutes(calendar.calendar);
    const workDaysUntil = (at: Date) => (dayMinutes ? workingMinutesBetween(now.toISOString(), at.toISOString(), calendar.calendar) / dayMinutes : 0);
    const canReserve = actor.user.permissions.has('stock.read') && actor.user.permissions.has('stock.reserve');
    const needs = rows.filter(({ p }) => p.status === 'needed' && !p.assessmentRejectedAt && p.partNumber).map(({ p }) => p.partNumber!);
    // Price lookup is read-only and may include zero-stock rows. Reservation still requires stock.reserve.
    const stock = await this.stock.exactOptions(actor, actor.user.permissions.has('stock.read') ? [...new Set(needs)] : [], db, true);
    const byPart = new Map<string, typeof links>();
    for (const link of links) {
      const id = link.partRequestId!;
      byPart.set(id, [...(byPart.get(id) ?? []), link]);
    }
    const blockersByPart = new Map(waiting.map(w => [w.partId, w.taskTitle]));
    const departmentNames = new Map(departmentsList.map(d => [d.id, d.name]));
    const tasksByCase = new Map<string, typeof activeTasks>();
    for (const task of activeTasks) tasksByCase.set(task.caseId, [...(tasksByCase.get(task.caseId) ?? []), task]);
    const counts = { decision: 0, ready: 0, overdueEmdad: 0 };
    const cards = new Map<string, { card: PartsWorkbench['cards'][number]; deadline: number; started: number; late: boolean }>();
    let inTransit = 0;
    for (const { p, c, v } of rows) {
      if (p.assessmentRejectedAt && p.status === 'needed') continue; // rejected in the assessment, no supply: not a need (task 3)
      const related = (byPart.get(p.id) ?? []).filter(r => r.caseId === c.id && r.matchStatus === 'matched' && r.statusCategory !== 'cancelled');
      const matching = related.filter(r => !p.orderRef || r.requestNo === p.orderRef || r.emdadNo === p.orderRef);
      const official = matching.length === 1 ? matching[0] : undefined;
      const reportedReceipt = p.source === 'company' && official && RECEIVED.includes(official.statusCategory);
      const ready = p.status === 'received' || p.status === 'reserved';
      const started = p.receivedAt ?? p.reservedAt ?? (reportedReceipt ? reportDate((official.official as EmdadOfficial).receivedInWarehouseAt) ?? official.lastReportAt : null);
      const overdueHandover = !!started && workingMinutesBetween(started.toISOString(), now.toISOString(), calendar.calendar) > 240;
      const lead = leadTimes.get(baseOf(p.partNumber) ?? '');
      const average = lead ? Math.round(lead.days / lead.count) : null;
      const estimated = p.orderedAt && average !== null ? new Date(p.orderedAt.getTime() + average * DAY_MS) : null;
      const dueAt = p.etaAt ?? official?.dueAt ?? (companyRequest(p) ? estimated ?? c.officialDeadlineAt ?? c.forecastDeliveryAt : null);
      const overdue = p.status === 'ordered' && !reportedReceipt && !!dueAt && dueAt < now;
      const allOptions = stock.get(p.partNumber ?? '') ?? [];
      const options = canReserve ? allOptions.filter(item => Number(item.available) >= p.quantity) : [];
      const option = options.length === 1 ? options[0] : undefined;
      const action: PartsWorkbenchLine['action'] = ready ? 'handover'
        : reportedReceipt ? 'received'
        : p.status === 'ordered' || matching.length > 0 || p.status !== 'needed' ? 'follow_up'
        : 'emdad'; // Needed items offer user-selected stock, market and company choices.
      if (action === 'follow_up' && (companyRequest(p) || matching.length > 0) && !overdue) {
        inTransit++;
        if (!includeTransit) continue;
      }
      if (action === 'handover' || action === 'received') counts.ready++;
      else if (action !== 'follow_up') counts.decision++;
      if (overdue && (companyRequest(p) || matching.length > 0)) counts.overdueEmdad++;
      const prices = [...new Set(allOptions.filter(o => o.salePrice !== null && o.currency)
        .map(o => Math.round(Number(o.salePrice) * (o.currency === 'IRT' ? 10 : 1))))];
      // Multiple different prices are ambiguous: never silently choose a company price.
      const inferredPrice = prices.length === 1 && Number.isSafeInteger(prices[0]) ? prices[0]! : null;
      const card = cards.get(c.id) ?? {
        card: { id: c.id, caseNumber: c.caseNumber, model: [v.brand, v.model, v.trim].filter(Boolean).join(' '),
          plate: v.plate, color: v.color, coverage: c.coverageType as PartsWorkbench['cards'][number]['coverage'],
          admissionNo: c.admissionNo, vin: v.vin, chassisRef: v.chassisRef,
          emdadRefs: [], waiting: null, items: [] },
        deadline: (c.officialDeadlineAt ?? c.forecastDeliveryAt)?.getTime() ?? Infinity,
        started: p.createdAt.getTime(), late: false,
      };
      const blocking = blockersByPart.has(p.id);
      const need = needBy.get(c.id);
      const left = need ? Math.max(0, Math.floor(workDaysUntil(need))) : null;
      const advice = blocking && action === 'emdad' ? 'تعمیر همین حالا منتظر این قطعه است؛ امروز تعیین تکلیف کنید.'
        : action === 'emdad' && average !== null && left !== null && average > left ? `امداد ویژه معمولاً ${average} روز طول می‌کشد ولی واحد بعدی ${left === 0 ? 'امروز' : `${left} روز کاری دیگر`} شروع می‌شود؛ خرید از بازار را بررسی کنید.`
        : action === 'emdad' && left !== null ? `واحد بعدی ${left === 0 ? 'امروز' : `${left} روز کاری دیگر`} به این قطعه نیاز دارد.`
        : overdue ? 'از موعد رسیدن گذشته؛ امروز با شرکت یا فروشنده پیگیری کنید.'
        : overdueHandover ? 'قطعه آماده است؛ به واحد اطلاع دهید که تحویل بگیرد.'
        : null;
      if (official) for (const ref of [official.emdadNo, official.requestNo]) {
        if (ref && !card.card.emdadRefs.includes(ref)) card.card.emdadRefs.push(ref);
      }
      if (blocking) card.card.waiting = blockersByPart.get(p.id) || 'تعمیر';
      card.late ||= overdueHandover;
      const linkedTasks = (tasksByCase.get(c.id) ?? []).filter(t => waiting.some(w => w.partId === p.id && w.taskId === t.id));
      const destinationTasks = linkedTasks.length ? linkedTasks : tasksByCase.get(c.id) ?? [];
      const negativeRecommendations: PartsWorkbenchLine['negativeRecommendations'] = [];
      if (!p.partNumber) negativeRecommendations.push({ route: 'reserve', reason: 'کد فنی قطعه ثبت نشده؛ امکان تطبیق قابل اعتماد با موجودی وجود ندارد.' });
      else if (!options.length) negativeRecommendations.push({ route: 'reserve', reason: 'در گزارش موجودی فعال، مقدار قابل رزرو کافی برای تعداد درخواستی پیدا نشد.' });
      if (prices.length > 1) negativeRecommendations.push({ route: 'emdad', reason: 'چند قیمت متفاوت در گزارش موجودی ثبت شده است؛ پیش از ثبت درخواست قیمت شرکت را بررسی کنید.' });
      else if (inferredPrice === null) negativeRecommendations.push({ route: 'emdad', reason: 'قیمت شرکت در گزارش موجودی قابل تعیین نیست؛ قبل از درخواست آن را دستی تأیید کنید.' });
      if (average !== null && left !== null && average > left) negativeRecommendations.push({
        route: 'emdad', reason: `زمان معمول امداد ویژه (${average} روز) از فرصت برنامه تعمیر (${left} روز کاری) بیشتر است؛ تحویل به‌موقع را بررسی کنید.`,
      });
      if (blocking && !options.length) negativeRecommendations.push({
        route: 'emdad', reason: 'واحد تعمیر همین حالا منتظر قطعه است؛ مسیر تأمین سریع‌تر را بررسی کنید.',
      });
      if (!destinationTasks.length) negativeRecommendations.push({
        route: 'market', reason: 'جایگاه دریافت‌کننده در برنامه تعمیر مشخص نیست؛ قبل از تحویل مقصد را تعیین کنید.',
      });
      const preferredRoute: PartsWorkbenchLine['preferredRoute'] =
        options.length && blocking ? 'reserve' :
        options.length && average !== null && left !== null && average > left ? 'reserve' : null;
      const manageAdvice = manageSupplyAdvice({
        partCode: p.partNumber, quantity: p.quantity,
        available: options.reduce((sum, o) => sum + Math.max(0, Number(o.available)), 0),
        companyPriceRial: inferredPrice, salePriceRial: p.salePriceRial ?? inferredPrice ?? p.unitPriceRial,
        coverage: c.coverageType, leadDays: average, workingDaysLeft: left,
        blocking, hasDestination: destinationTasks.length > 0,
      });
      card.card.items.push({
        id: p.id, description: p.description, partNumber: p.partNumber, quantity: p.quantity, version: p.version,
        action, suggestedPriceRial: p.salePriceRial ?? inferredPrice ?? p.unitPriceRial,
        companyPriceRial: inferredPrice,
        stock: option ? { snapshotId: option.snapshotId, fullStockCode: option.fullStockCode, locationAddress: option.locationAddress, available: option.available } : null,
        stockOptions: options.map(o => ({ snapshotId: o.snapshotId, fullStockCode: o.fullStockCode, locationAddress: o.locationAddress, available: o.available })),
        destinations: destinationTasks.map(t => ({ taskId: t.id, departmentId: t.departmentId, label: [t.stationSnapshot?.name || t.stationSnapshot?.code || departmentNames.get(t.departmentId) || 'جایگاه تعیین نشده', t.technicianName].filter(Boolean).join(' · ') })),
        negativeRecommendations, preferredRoute, manageAdvice,
        emdadId: official?.id ?? null, emdadRef: official?.requestNo ?? official?.emdadNo ?? null, emdadAverageDays: average, blocking, overdue, overdueHandover, advice,
      });
      cards.set(c.id, card);
    }
    return {
      counts, inTransit,
      cards: [...cards.values()].sort((a, b) => Number(b.late) - Number(a.late)
        || Number(!!b.card.waiting) - Number(!!a.card.waiting) || a.deadline - b.deadline || a.started - b.started)
        .map(({ card }) => card),
    };
  }

  async act(actor: Actor, id: string, input: PartsWorkbenchAction) {
    const tenantId = actor.user.tenantId;
    return this.handle.db.transaction(async tx => {
      if (input.action === 'emdad') {
        const orderedAt = new Date(input.requestedAt);
        assertNotFuture(orderedAt, 'تاریخ درخواست نمی‌تواند در آینده باشد');
        const rows = await tx.select().from(partRequests)
          .where(and(eq(partRequests.tenantId, tenantId), eq(partRequests.caseId, id),
            inArray(partRequests.id, input.parts.map(p => p.id)))).orderBy(asc(partRequests.id)).for('update');
        if (!actor.user.permissions.has('emdad.manage')) throw forbidden();
        if (input.etaAt && new Date(input.etaAt) < orderedAt) throw badRequest('INVALID_TIME', 'موعد نمی‌تواند قبل از ثبت درخواست باشد');
        if (rows.length !== input.parts.length) throw notFound('نیاز قطعه در این پرونده');
        const entries = new Map(input.parts.map(p => [p.id, p]));
        for (const row of rows) {
          const entry = entries.get(row.id)!;
          await this.parts.actIn(tx, actor, row.id, { action: 'order', expectedVersion: entry.expectedVersion,
            source: 'company', unitPriceRial: entry.companyPriceRial, salePriceRial: entry.salePriceRial,
            orderRef: input.requestNo, etaAt: input.etaAt }, orderedAt);
        }
        return;
      }
      const p = await this.lockPart(tx, tenantId, id, input.expectedVersion);
      if (input.action === 'market') {
        const order = await this.parts.actIn(tx, actor, id, { action: 'order', expectedVersion: p.version, source: 'external',
          supplier: input.supplier, unitPriceRial: input.purchasePriceRial, salePriceRial: input.salePriceRial, orderRef: input.orderRef });
        await this.parts.actIn(tx, actor, id, { action: 'receive', expectedVersion: order.version, inspection: 'ok' });
      } else if (input.action === 'reserve') {
        const snap = await this.stock.active(tx, tenantId);
        if (!snap || !snapshotInfo(snap).reservable) throw badRequest('STOCK_NOT_CONFIRMED', 'گزارش موجودی قابل رزرو نیست');
        const options = p.partNumber ? (await this.stock.exactOptions(actor, [p.partNumber], tx, true)).get(p.partNumber) ?? [] : [];
        if (p.status !== 'needed' || !options.some(o => o.fullStockCode === input.stock.fullStockCode
          && o.locationAddress === input.stock.locationAddress && o.snapshotId === input.stock.snapshotId)) {
          throw badRequest('PART_STOCK_MISMATCH', 'کد انتخاب‌شده با نیاز قطعه یا گزارش فعال همخوانی ندارد');
        }
        await this.stock.reserveIn(tx, actor, { ...input.stock, partRequestId: id, quantity: String(p.quantity) });
        const checked = await this.parts.actIn(tx, actor, id, { action: 'check_stock', expectedVersion: p.version, inStock: true });
        await this.parts.actIn(tx, actor, id, { action: 'reserve', expectedVersion: checked.version, salePriceRial: input.salePriceRial });
      } else if (input.action === 'received') {
        if (!actor.user.permissions.has('emdad.read')) throw forbidden();
        const [emdad] = await tx.select().from(emdadRequests).where(and(eq(emdadRequests.tenantId, tenantId),
          eq(emdadRequests.id, input.emdadId), eq(emdadRequests.caseId, p.caseId), eq(emdadRequests.partRequestId, p.id),
          eq(emdadRequests.matchStatus, 'matched'), inArray(emdadRequests.statusCategory, RECEIVED))).for('update');
        if (!emdad || p.source !== 'company' || (p.orderRef && ![emdad.requestNo, emdad.emdadNo].includes(p.orderRef))) {
          throw badRequest('EMDAD_NOT_RECEIVED', 'رسید منطبق با این قطعه در گزارش امداد ویژه وجود ندارد');
        }
        const ref = emdad.requestNo ?? emdad.emdadNo;
        if (p.status !== 'ordered' && !ref) throw badRequest('EMDAD_REF_REQUIRED', 'شماره درخواست امداد لازم است');
        const ordered = p.status === 'ordered' ? p : await this.parts.actIn(tx, actor, id, {
          action: 'order', expectedVersion: p.version, source: 'company', orderRef: ref ?? undefined,
          unitPriceRial: input.salePriceRial,
        });
        await this.parts.actIn(tx, actor, id, { action: 'receive', expectedVersion: ordered.version, inspection: 'ok',
          salePriceRial: input.salePriceRial, receiptDocNo: ref ?? undefined });
      } else {
        if (p.status !== 'handed_over' || p.returnedAt) throw badRequest('PART_NOT_RETURNABLE', 'فقط قطعه تحویل‌شده را می‌توان برگرداند');
        const now = new Date();
        const [saved] = await tx.update(partRequests).set({ returnedAt: now, returnReason: input.reason, updatedAt: now, version: p.version + 1 })
          .where(and(eq(partRequests.id, id), eq(partRequests.tenantId, tenantId), eq(partRequests.version, p.version))).returning();
        if (!saved) throw versionConflict();
        await this.audit.record(tx, actor, { entityType: 'part', entityId: id, caseId: p.caseId, action: 'part.returned',
          reason: input.reason, after: { returnedAt: now.toISOString() }, snapshot: { version: saved.version, row: saved } });
      }
    });
  }

  async pickup(actor: Actor, taskId: string, input: PartPickup) {
    const tenantId = actor.user.tenantId;
    return this.handle.db.transaction(async tx => {
      const p = await this.lockPart(tx, tenantId, input.partId, input.expectedVersion);
      const [task] = await tx.select().from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.id, taskId),
        eq(tasks.caseId, p.caseId), eq(tasks.assignedUserId, actor.user.id), inArray(tasks.status, ['pending', 'in_progress', 'blocked'])));
      if (!task || (p.handedOverDepartmentId && p.handedOverDepartmentId !== task.departmentId)) throw forbidden();
      const blockingTasks = await tx.select({ taskId: blockers.taskId }).from(blockers).where(and(eq(blockers.tenantId, tenantId),
        eq(blockers.partRequestId, p.id), isNull(blockers.resolvedAt), isNotNull(blockers.taskId)));
      if (blockingTasks.length && !blockingTasks.some(b => b.taskId === task.id)) throw forbidden();
      await this.parts.actIn(tx, actor, p.id, { action: 'hand_over', expectedVersion: p.version,
        departmentId: task.departmentId, recipientName: actor.user.displayName }, new Date(), true);
    });
  }

  private async lockPart(tx: DbOrTx, tenantId: string, id: string, version: number) {
    const [p] = await tx.select().from(partRequests).where(and(eq(partRequests.tenantId, tenantId), eq(partRequests.id, id))).for('update');
    if (!p) throw notFound('قطعه');
    if (p.version !== version) throw versionConflict(p.version);
    return p;
  }
}
