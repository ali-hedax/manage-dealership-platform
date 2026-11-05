import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
  COVERAGE_LABELS, PART_SOURCE_LABELS,
  type Contractor, type ExternalWork, type PartsOperationsNotice, type PartsStatement, type StatementLine, type StatementSnapshot,
  type contractorSchema, type externalWorkActionSchema, type externalWorkCreateSchema, type partConsumptionSchema,
} from '@manage/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { CasesService } from '../cases/cases.service';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { safeCell } from '../daily-reports/safe-cell';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { cases, externalContractors, externalWork, partRequests, partsStatements, tasks, vehicles } from '../db/schema';
import { renderPersianListPdf } from '../reports/pdf';
import { TasksService } from '../tasks/tasks.service';
import { PartsWorkbenchService } from './parts-workbench.service';
import { writeWorkbook } from './xlsx';

function changes(current: StatementSnapshot, previous?: StatementSnapshot) {
  const latest = [...current.parts, ...current.external];
  const before = [...(previous?.parts ?? []), ...(previous?.external ?? [])];
  const old = new Map(before.map(r => [r.id, r]));
  const ids = new Set(latest.map(r => r.id));
  return {
    added: latest.filter(r => !old.has(r.id)).map(r => r.description),
    removed: before.filter(r => !ids.has(r.id)).map(r => r.description),
    changed: latest.filter(r => old.has(r.id) && lineKey(old.get(r.id)!) !== lineKey(r)).map(r => r.description),
  };
}

function lineKey(r: StatementLine) {
  return JSON.stringify([r.code, r.description, r.quantity, r.source, r.priceRial, r.assessmentRial, r.reference]);
}

@Injectable()
export class PartsOperationsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
    private readonly tasks: TasksService,
    private readonly workbench: PartsWorkbenchService,
  ) {}

  private get db() { return this.handle.db; }

  async contractors(actor: Actor, includeInactive = false): Promise<Contractor[]> {
    const rows = await this.db.select().from(externalContractors).where(and(
      eq(externalContractors.tenantId, actor.user.tenantId), includeInactive ? undefined : eq(externalContractors.active, true),
    )).orderBy(asc(externalContractors.name), asc(externalContractors.id));
    return rows.map(({ id, name, phone, specialty, active, version }) => ({ id, name, phone, specialty, active, version }));
  }

  async saveContractor(actor: Actor, input: z.infer<typeof contractorSchema>, id?: string) {
    if (!actor.user.isOwner && !actor.user.roles.includes('system_admin')) throw forbidden();
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async tx => {
      const patch = { name: input.name, phone: input.phone, specialty: input.specialty, active: input.active, updatedAt: new Date() };
      const [row] = id
        ? await tx.update(externalContractors).set({ ...patch, version: (input.expectedVersion ?? 0) + 1 })
          .where(and(eq(externalContractors.tenantId, tenantId), eq(externalContractors.id, id),
            eq(externalContractors.version, input.expectedVersion ?? 0))).returning()
        : await tx.insert(externalContractors).values({ ...patch, id: newId(), tenantId, isTest: actor.user.isTestTenant }).returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, { entityType: 'external_contractor', entityId: row.id,
        action: id ? 'external_contractor.updated' : 'external_contractor.created', after: patch,
        snapshot: { version: row.version, row } });
      return { id: row.id };
    });
  }

  async createExternal(actor: Actor, caseId: string, input: z.infer<typeof externalWorkCreateSchema>) {
    return this.db.transaction(async tx => {
      const tenantId = actor.user.tenantId;
      const kase = await this.cases.loadForWrite(tx, tenantId, caseId);
      const taskId = await this.tasks.createIn(tx, actor, caseId, { ...input, weight: 1 });
      const task = await this.tasks.loadForWrite(tx, tenantId, taskId);
      if (task.plannedEndAt && (!kase.forecastDeliveryAt || task.plannedEndAt > kase.forecastDeliveryAt)) {
        await this.cases.applyForecast(tx, actor, kase, task.plannedEndAt, 'افزودن خدمات بیرون به مسیر تعمیرات');
      }
      const [row] = await tx.insert(externalWork).values({ taskId, tenantId: actor.user.tenantId, isTest: actor.user.isTestTenant }).returning();
      await this.audit.record(tx, actor, { entityType: 'external_work', entityId: taskId, caseId,
        action: 'external_work.created', snapshot: { version: row!.version, row: row! } });
      return { id: taskId };
    });
  }

  async external(actor: Actor, caseId?: string, tx: DbOrTx = this.db): Promise<ExternalWork[]> {
    const tenantId = actor.user.tenantId;
    const rows = await tx.select({ job: externalWork, task: tasks, kase: cases, plate: vehicles.plate })
      .from(externalWork)
      .innerJoin(tasks, and(eq(tasks.id, externalWork.taskId), eq(tasks.tenantId, tenantId)))
      .innerJoin(cases, and(eq(cases.id, tasks.caseId), eq(cases.tenantId, tenantId)))
      .innerJoin(vehicles, and(eq(vehicles.id, cases.vehicleId), eq(vehicles.tenantId, tenantId)))
      .where(and(eq(externalWork.tenantId, tenantId), caseId ? eq(tasks.caseId, caseId) : eq(cases.status, 'open')))
      .orderBy(asc(externalWork.promisedAt), asc(tasks.createdAt));
    return rows.map(({ job, task, kase, plate }) => ({
      id: task.id, caseId: kase.id, caseNumber: kase.caseNumber, title: task.title ?? 'خدمات بیرون',
      departmentId: task.departmentId, plate,
      status: task.status === 'approved' ? 'approved' : task.status === 'done' ? 'done'
        : task.actualStartAt ? 'dispatched' : job.contractorId ? 'coordinated' : 'pending',
      contractorId: job.contractorId, contractorName: job.contractorName, mode: job.mode,
      appointmentAt: job.appointmentAt?.toISOString() ?? null, promisedAt: job.promisedAt?.toISOString() ?? null,
      priceRial: job.priceRial, overdue: !!job.promisedAt && job.promisedAt < new Date() && !['done', 'approved'].includes(task.status),
      version: job.version, taskVersion: task.version,
    }));
  }

  async externalAction(actor: Actor, taskId: string, input: z.infer<typeof externalWorkActionSchema>) {
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async tx => {
      const [job] = await tx.select().from(externalWork)
        .where(and(eq(externalWork.tenantId, tenantId), eq(externalWork.taskId, taskId))).for('update');
      if (!job) throw notFound('کار بیرون');
      if (job.version !== input.expectedVersion) throw versionConflict(job.version);
      const task = await this.tasks.loadForWrite(tx, tenantId, taskId);
      await this.cases.loadForWrite(tx, tenantId, task.caseId);
      let patch: Partial<typeof job> = {};
      if (input.action === 'coordinate') {
        if (task.status !== 'pending') throw badRequest('EXTERNAL_WORK_STARTED', 'کار بیرون شروع شده است');
        const [contractor] = await tx.select().from(externalContractors).where(and(
          eq(externalContractors.tenantId, tenantId), eq(externalContractors.id, input.contractorId), eq(externalContractors.active, true),
        ));
        if (!contractor) throw notFound('پیمانکار فعال');
        const appointmentAt = new Date(input.appointmentAt);
        const promisedAt = new Date(input.promisedAt);
        if (promisedAt < appointmentAt) throw badRequest('INVALID_PROMISE', 'زمان وعده نباید قبل از ارسال یا حضور باشد');
        patch = { contractorId: contractor.id, contractorName: contractor.name, mode: input.mode,
          appointmentAt, promisedAt, priceRial: input.priceRial };
      } else {
        if (!job.contractorId) throw badRequest('EXTERNAL_WORK_UNCOORDINATED', 'ابتدا هماهنگی با پیمانکار را ثبت کنید');
        await this.tasks.actIn(tx, actor, taskId, { action: input.action === 'dispatch' ? 'start' : 'complete',
          expectedVersion: input.expectedTaskVersion }, false, true);
      }
      const [row] = await tx.update(externalWork).set({ ...patch, version: job.version + 1, updatedAt: new Date() })
        .where(and(eq(externalWork.tenantId, tenantId), eq(externalWork.taskId, taskId), eq(externalWork.version, job.version))).returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, { entityType: 'external_work', entityId: taskId, caseId: task.caseId,
        action: `external_work.${input.action}`, after: patch, snapshot: { version: row.version, row } });
    });
  }

  async statement(actor: Actor, caseId: string, tx: DbOrTx = this.db): Promise<PartsStatement> {
    const tenantId = actor.user.tenantId;
    const [kase] = await tx.select({ c: cases, plate: vehicles.plate }).from(cases)
      .innerJoin(vehicles, and(eq(vehicles.id, cases.vehicleId), eq(vehicles.tenantId, tenantId)))
      .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));
    if (!kase) throw notFound('پرونده');
    const [parts, outside, versions, repair] = await Promise.all([
      tx.select().from(partRequests).where(and(eq(partRequests.tenantId, tenantId), eq(partRequests.caseId, caseId),
        eq(partRequests.status, 'handed_over'), isNull(partRequests.returnedAt))).orderBy(asc(partRequests.createdAt), asc(partRequests.id)),
      this.external(actor, caseId, tx),
      tx.select().from(partsStatements).where(and(eq(partsStatements.tenantId, tenantId), eq(partsStatements.caseId, caseId)))
        .orderBy(asc(partsStatements.version)),
      tx.select({ status: tasks.status }).from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.caseId, caseId))),
    ]);
    const partLine = (p: (typeof parts)[number]): StatementLine => ({
      id: p.id, code: p.partNumber, description: p.description, quantity: p.quantity,
      source: PART_SOURCE_LABELS[p.source as keyof typeof PART_SOURCE_LABELS] ?? p.source,
      priceRial: p.salePriceRial ?? p.unitPriceRial, assessmentRial: p.approvedUnitPriceRial,
      reference: p.orderRef ?? p.receiptDocNo,
    });
    const live: StatementSnapshot = {
      caseNumber: kase.c.caseNumber, plate: kase.plate, admissionNo: kase.c.admissionNo,
      coverage: kase.c.coverageType as StatementSnapshot['coverage'], dealership: actor.user.tenantName,
      parts: parts.filter(p => p.consumedAt).map(partLine),
      external: outside.filter(p => p.status === 'approved').map(p => ({ id: p.id, code: null, description: p.title,
        quantity: 1, source: 'خدمات بیرون', priceRial: p.priceRial, assessmentRial: null, reference: p.contractorName })),
    };
    const editable = (p: (typeof parts)[number]) => ({
      id: p.id, description: p.description, version: p.version, priceRial: p.salePriceRial ?? p.unitPriceRial,
    });
    const unconfirmed = parts.filter(p => !p.consumedAt).map(editable);
    const consumed = parts.filter(p => p.consumedAt).map(editable);
    const current = versions.at(-1)?.snapshot;
    const difference = changes(live, current);
    return { live, unconfirmed, consumed,
      readyToSend: kase.c.status === 'open' && repair.length > 0 && repair.every(t => t.status === 'approved') && !unconfirmed.length
        && (!current || difference.added.length + difference.removed.length + difference.changed.length > 0),
      versions: versions.map((v, i) => ({ number: v.version, sentAt: v.sentAt.toISOString(), snapshot: v.snapshot,
        ...changes(v.snapshot, versions[i - 1]?.snapshot) })) };
  }

  async consume(actor: Actor, caseId: string, id: string, input: z.infer<typeof partConsumptionSchema>) {
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async tx => {
      const [part] = await tx.select().from(partRequests).where(and(eq(partRequests.tenantId, tenantId),
        eq(partRequests.caseId, caseId), eq(partRequests.id, id))).for('update');
      if (!part) throw notFound('قطعه');
      if (part.version !== input.expectedVersion) throw versionConflict(part.version);
      await this.cases.loadForWrite(tx, tenantId, caseId);
      if (part.status !== 'handed_over' || part.returnedAt) throw badRequest('PART_NOT_CONSUMABLE', 'قطعه تحویل‌داده‌شده و برنگشته را ثبت کنید');
      const now = new Date();
      const price = input.salePriceRial ?? part.salePriceRial ?? part.unitPriceRial;
      if (price === null) throw badRequest('PART_SALE_PRICE_REQUIRED', 'قیمت فروش این قطعه را وارد کنید');
      const [row] = await tx.update(partRequests).set({ consumedAt: part.consumedAt ?? now, salePriceRial: price,
        updatedAt: now, version: part.version + 1 }).where(and(eq(partRequests.id, id),
          eq(partRequests.tenantId, tenantId), eq(partRequests.version, part.version))).returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, { entityType: 'part', entityId: id, caseId,
        action: part.consumedAt ? 'part.sale_price_updated' : 'part.consumed',
        before: { salePriceRial: part.salePriceRial }, after: { salePriceRial: price }, snapshot: { version: row.version, row } });
    });
  }

  async send(actor: Actor, caseId: string, expectedVersion: number) {
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async tx => {
      await this.cases.loadForWrite(tx, tenantId, caseId);
      const statement = await this.statement(actor, caseId, tx);
      const current = statement.versions.at(-1)?.number ?? 0;
      if (current !== expectedVersion) throw versionConflict(current);
      if (!statement.readyToSend) throw badRequest('STATEMENT_NOT_READY', 'ابتدا همهٔ کارها و مصرف قطعات را تأیید کنید. برای ارسال دوباره باید تغییری ثبت شده باشد');
      if ([...statement.live.parts, ...statement.live.external].some(p => p.priceRial === null)) {
        throw badRequest('PART_SALE_PRICE_REQUIRED', 'قیمت فروش ردیف‌های ناقص را وارد کنید');
      }
      const id = newId();
      const [row] = await tx.insert(partsStatements).values({ id, tenantId, caseId, version: current + 1,
        snapshot: statement.live, sentBy: actor.user.id, isTest: actor.user.isTestTenant }).returning();
      await this.audit.record(tx, actor, { entityType: 'parts_statement', entityId: id, caseId,
        action: 'parts_statement.sent', after: { version: current + 1 }, snapshot: { version: current + 1, row: row! } });
      return { number: current + 1 };
    });
  }

  async export(actor: Actor, caseId: string, format: 'pdf' | 'xlsx', version: number | undefined, showAssessment: boolean) {
    const statement = await this.statement(actor, caseId);
    const snapshot = version ? statement.versions.find(v => v.number === version)?.snapshot : statement.live;
    if (!snapshot) throw notFound('نسخه صورت قطعات');
    const meta = [snapshot.dealership, `پرونده ${snapshot.caseNumber}`, `پلاک ${snapshot.plate ?? '—'}`,
      `پذیرش ${snapshot.admissionNo ?? '—'}`, COVERAGE_LABELS[snapshot.coverage], version ? `نسخه ${version}` : 'صورت زنده'];
    const header = ['ردیف', 'کد فنی', 'شرح', 'تعداد', 'منبع', 'قیمت واحد (ریال)', 'مبلغ (ریال)', 'مرجع',
      ...(showAssessment ? ['کارشناسی واحد (ریال)'] : [])];
    const cells = (r: StatementLine, i: number) => [
      i + 1, safeCell(r.code ?? ''), safeCell(r.description), r.quantity, r.source, r.priceRial ?? '',
      r.priceRial === null ? '' : r.priceRial * r.quantity, safeCell(r.reference ?? ''), ...(showAssessment ? [r.assessmentRial ?? ''] : []),
    ];
    const sheets = [{ name: 'صورت قطعات', items: snapshot.parts }, { name: 'کار بیرون', items: snapshot.external }];
    if (format === 'xlsx') return Buffer.from(writeWorkbook(sheets.map(s => ({
      name: s.name, rows: [meta.map(safeCell), header, ...s.items.map(cells)],
    }))));
    return renderPersianListPdf('صورت قطعات', meta, sheets.map(s => ({
      title: s.name, rows: s.items.map((r, i) => cells(r, i).map((v, n) => v === '' ? '' : `${header[n]} ${v}`).filter(Boolean).join(' · ')),
    })));
  }

  async notices(actor: Actor, forParts: boolean): Promise<PartsOperationsNotice[]> {
    const tenantId = actor.user.tenantId;
    if (!forParts && !actor.user.permissions.has('case.update')) throw forbidden();
    const outside = await this.external(actor);
    const out = outside.filter(p => p.overdue).map(p => ({ key: p.id, caseId: p.caseId, caseNumber: p.caseNumber,
      plate: p.plate, message: `وعدهٔ کار بیرون گذشته است · ${p.title}` }));
    if (!forParts) {
      const cards = (await this.workbench.list(actor)).cards;
      for (const card of cards) for (const p of card.items.filter(p => p.overdueHandover)) {
        out.push({ key: p.id, caseId: card.id, caseNumber: card.caseNumber, plate: card.plate,
          message: `بیش از ۴ ساعت کاری در انتظار تحویل · ${p.description}` });
      }
    }
    const completed = await this.db.selectDistinct({ id: cases.id, caseNumber: cases.caseNumber, plate: vehicles.plate })
      .from(cases).innerJoin(tasks, and(eq(tasks.caseId, cases.id), eq(tasks.tenantId, tenantId), eq(tasks.status, 'approved')))
      .innerJoin(vehicles, and(eq(vehicles.id, cases.vehicleId), eq(vehicles.tenantId, tenantId)))
      .where(and(eq(cases.tenantId, tenantId), eq(cases.status, 'open')));
    const ids = completed.map(c => c.id);
    if (!ids.length) return out;
    if (forParts) {
      const [unfinished, sent] = await Promise.all([
        this.db.selectDistinct({ caseId: tasks.caseId }).from(tasks).where(and(eq(tasks.tenantId, tenantId),
          inArray(tasks.caseId, ids), ne(tasks.status, 'approved'))),
        this.db.selectDistinct({ caseId: partsStatements.caseId }).from(partsStatements).where(and(
          eq(partsStatements.tenantId, tenantId), inArray(partsStatements.caseId, ids))),
      ]);
      const hidden = new Set([...unfinished, ...sent].map(r => r.caseId));
      for (const c of completed.filter(c => !hidden.has(c.id))) out.push({ key: `final-${c.id}`, caseId: c.id,
        caseNumber: c.caseNumber, plate: c.plate, message: 'کار خودرو تمام شد. صورت قطعات را نهایی کنید.' });
    } else {
      const versions = await this.db.selectDistinctOn([partsStatements.caseId]).from(partsStatements)
        .where(and(eq(partsStatements.tenantId, tenantId), inArray(partsStatements.caseId, ids)))
        .orderBy(asc(partsStatements.caseId), desc(partsStatements.version));
      for (const v of versions) out.push({ key: `sent-${v.id}`, caseId: v.caseId, caseNumber: v.snapshot.caseNumber,
        plate: v.snapshot.plate, message: `صورت قطعات نسخهٔ ${v.version} ارسال شد.` });
    }
    return out;
  }
}
