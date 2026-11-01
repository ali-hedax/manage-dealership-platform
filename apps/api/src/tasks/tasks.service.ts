import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CreateTaskInput, Task, TaskActionInput, TaskStatus, UpdateTaskInput } from '@manage/shared';
import { AuditService, diff } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { assertNotFuture, CasesService, MINUTE_TOLERANCE_MS } from '../cases/cases.service';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { departments, taskDependencies, tasks } from '../db/schema';

type TaskRow = typeof tasks.$inferSelect;

const FINISHED: TaskStatus[] = ['done', 'approved'];
// Stages before repair; starting the first task moves the case to in_repair.
const PRE_REPAIR_STAGES = ['reception', 'assessment', 'awaiting_approval', 'awaiting_parts'];

const toDate = (v: string | null | undefined) => (v == null ? null : new Date(v));

const invalidTransition = (from: string, action: string) =>
  badRequest('INVALID_TRANSITION', `انجام «${action}» در وضعیت فعلی فعالیت (${from}) ممکن نیست`);

@Injectable()
export class TasksService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  async create(actor: Actor, caseId: string, input: CreateTaskInput): Promise<Task> {
    const tenantId = actor.user.tenantId;
    const id = newId();
    await this.db.transaction(async (tx) => {
      const kase = await this.cases.loadForWrite(tx, tenantId, caseId);
      if (kase.stage === 'delivered') throw badRequest('CASE_DELIVERED', 'پرونده تحویل شده است');
      await this.assertDepartment(tx, tenantId, input.departmentId);
      assertPlannedRange(input.plannedStartAt, input.plannedEndAt);
      const dependsOn = [...new Set(input.dependsOn ?? [])];
      await this.assertSameCase(tx, tenantId, caseId, dependsOn);

      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(tasks)
        .where(eq(tasks.caseId, caseId))) as [{ n: number }];
      const [row] = await tx
        .insert(tasks)
        .values({
          id,
          tenantId,
          caseId,
          departmentId: input.departmentId,
          title: input.title ?? null,
          technicianName: input.technicianName ?? null,
          technicianCode: input.technicianCode ?? null,
          plannedStartAt: toDate(input.plannedStartAt),
          plannedEndAt: toDate(input.plannedEndAt),
          weight: input.weight,
          sortOrder: n + 1,
          notes: input.notes ?? null,
          isTest: actor.user.isTestTenant,
          createdBy: actor.user.id,
        })
        .returning();
      if (dependsOn.length) {
        await tx.insert(taskDependencies).values(dependsOn.map((d) => ({ taskId: id, dependsOnTaskId: d })));
      }
      await this.audit.record(tx, actor, {
        entityType: 'task',
        entityId: id,
        caseId,
        action: 'task.created',
        after: {
          departmentId: input.departmentId,
          title: input.title ?? null,
          technicianName: input.technicianName ?? null,
          dependsOn,
        },
        snapshot: { version: 1, row: { ...row!, dependsOn } },
      });
    });
    return this.get(actor, caseId, id);
  }

  async update(actor: Actor, taskId: string, input: UpdateTaskInput): Promise<Task> {
    const tenantId = actor.user.tenantId;
    let caseId = '';
    await this.db.transaction(async (tx) => {
      const task = await this.loadForWrite(tx, tenantId, taskId, input.expectedVersion);
      caseId = task.caseId;
      await this.cases.loadForWrite(tx, tenantId, task.caseId);
      if (input.departmentId) await this.assertDepartment(tx, tenantId, input.departmentId);

      const patch: Partial<TaskRow> = {};
      for (const key of ['departmentId', 'title', 'technicianName', 'technicianCode', 'weight', 'notes'] as const) {
        if (input[key] !== undefined) (patch as any)[key] = input[key];
      }
      if (input.plannedStartAt !== undefined) patch.plannedStartAt = toDate(input.plannedStartAt);
      if (input.plannedEndAt !== undefined) patch.plannedEndAt = toDate(input.plannedEndAt);
      assertPlannedRange(
        (patch.plannedStartAt ?? task.plannedStartAt)?.toISOString(),
        (patch.plannedEndAt ?? task.plannedEndAt)?.toISOString(),
      );

      let depsChange: { before: string[]; after: string[] } | null = null;
      if (input.dependsOn !== undefined) {
        const next = [...new Set(input.dependsOn)];
        if (next.includes(taskId)) throw badRequest('DEPENDENCY_CYCLE', 'فعالیت نمی‌تواند به خودش وابسته باشد');
        await this.assertSameCase(tx, tenantId, task.caseId, next);
        await this.assertNoCycle(tx, task.caseId, taskId, next);
        const before = (
          await tx.select().from(taskDependencies).where(eq(taskDependencies.taskId, taskId))
        ).map((d) => d.dependsOnTaskId);
        await tx.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId));
        if (next.length) {
          await tx.insert(taskDependencies).values(next.map((d) => ({ taskId, dependsOnTaskId: d })));
        }
        depsChange = { before, after: next };
      }

      const updated = await this.save(tx, task, patch);
      const fields = Object.keys(patch);
      const changes = diff(pickRow(task, fields), pickRow(updated, fields));
      await this.audit.record(tx, actor, {
        entityType: 'task',
        entityId: taskId,
        caseId: task.caseId,
        action: 'task.updated',
        before: { ...changes?.before, ...(depsChange ? { dependsOn: depsChange.before } : {}) },
        after: { ...changes?.after, ...(depsChange ? { dependsOn: depsChange.after } : {}) },
        snapshot: { version: updated.version, row: updated },
      });
    });
    return this.get(actor, caseId, taskId);
  }

  /**
   * Phase-1 status recording by the supervisor: start → complete → approve,
   * with reopen for corrective work. Blocking goes through BlockersService.
   */
  async act(actor: Actor, taskId: string, input: TaskActionInput): Promise<Task> {
    const tenantId = actor.user.tenantId;
    if (input.action === 'approve' && !actor.user.permissions.has('task.approve')) throw forbidden();
    const at = input.at ? new Date(input.at) : new Date();
    assertNotFuture(at, 'زمان ثبت‌شده نمی‌تواند در آینده باشد');

    let caseId = '';
    await this.db.transaction(async (tx) => {
      const task = await this.loadForWrite(tx, tenantId, taskId, input.expectedVersion);
      caseId = task.caseId;
      const kase = await this.cases.loadForWrite(tx, tenantId, task.caseId);
      const status = task.status as TaskStatus;
      let patch: Partial<TaskRow>;
      let action: string;

      switch (input.action) {
        case 'start': {
          if (status !== 'pending') throw invalidTransition(status, 'شروع');
          const unfinished = await this.unfinishedDependencies(tx, taskId);
          if (unfinished.length) {
            throw badRequest('DEPENDENCY_NOT_DONE', 'فعالیت‌های پیش‌نیاز هنوز تمام نشده‌اند', {
              taskIds: unfinished,
            });
          }
          patch = { status: 'in_progress', actualStartAt: at };
          action = 'task.started';
          break;
        }
        case 'complete':
          if (status !== 'in_progress') throw invalidTransition(status, 'اتمام');
          if (task.actualStartAt && at.getTime() < task.actualStartAt.getTime() - MINUTE_TOLERANCE_MS) {
            throw badRequest('INVALID_TIME', 'زمان اتمام نمی‌تواند قبل از زمان شروع باشد');
          }
          patch = {
            status: 'done',
            actualEndAt: task.actualStartAt && at < task.actualStartAt ? task.actualStartAt : at,
            completedBy: actor.user.id,
          };
          action = 'task.completed';
          break;
        case 'approve':
          if (status !== 'done') throw invalidTransition(status, 'تأیید');
          patch = { status: 'approved', approvedAt: at, approvedBy: actor.user.id };
          action = 'task.approved';
          break;
        case 'reopen':
          if (!FINISHED.includes(status)) throw invalidTransition(status, 'بازگشایی');
          patch = { status: 'in_progress', actualEndAt: null, completedBy: null, approvedAt: null, approvedBy: null };
          action = 'task.reopened';
          break;
      }

      const updated = await this.save(tx, task, patch);
      await this.audit.record(tx, actor, {
        entityType: 'task',
        entityId: taskId,
        caseId: task.caseId,
        action,
        reason: input.note ?? null,
        occurredAt: at,
        before: { status },
        after: { status: updated.status },
        snapshot: { version: updated.version, row: updated },
      });

      if (input.action === 'start' && PRE_REPAIR_STAGES.includes(kase.stage)) {
        await this.cases.applyStage(tx, actor, kase, { stage: 'in_repair' }, 'خودکار: شروع اولین فعالیت تعمیر');
      }
    });
    return this.get(actor, caseId, taskId);
  }

  async get(actor: Actor, caseId: string, taskId: string): Promise<Task> {
    const task = (await this.cases.tasksOf(actor.user.tenantId, caseId)).find((t) => t.id === taskId);
    if (!task) throw notFound('فعالیت');
    return task;
  }

  async loadForWrite(tx: DbOrTx, tenantId: string, id: string, expectedVersion?: number): Promise<TaskRow> {
    const [row] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
    if (!row) throw notFound('فعالیت');
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw versionConflict(row.version);
    return row;
  }

  async save(tx: DbOrTx, task: TaskRow, patch: Partial<TaskRow>): Promise<TaskRow> {
    const [row] = await tx
      .update(tasks)
      .set({ ...patch, updatedAt: new Date(), version: task.version + 1 })
      .where(and(eq(tasks.id, task.id), eq(tasks.version, task.version)))
      .returning();
    if (!row) throw versionConflict();
    return row;
  }

  private async unfinishedDependencies(tx: DbOrTx, taskId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: tasks.id, status: tasks.status })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
      .where(eq(taskDependencies.taskId, taskId));
    return rows.filter((r) => !FINISHED.includes(r.status as TaskStatus)).map((r) => r.id);
  }

  private async assertDepartment(tx: DbOrTx, tenantId: string, departmentId: string) {
    const [d] = await tx
      .select({ isActive: departments.isActive })
      .from(departments)
      .where(and(eq(departments.id, departmentId), eq(departments.tenantId, tenantId)));
    if (!d || !d.isActive) throw badRequest('INVALID_DEPARTMENT', 'واحد انتخاب‌شده معتبر نیست');
  }

  private async assertSameCase(tx: DbOrTx, tenantId: string, caseId: string, ids: string[]) {
    if (!ids.length) return;
    const rows = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(inArray(tasks.id, ids), eq(tasks.caseId, caseId), eq(tasks.tenantId, tenantId)));
    if (rows.length !== ids.length) {
      throw badRequest('INVALID_DEPENDENCY', 'پیش‌نیازها باید از فعالیت‌های همین پرونده باشند');
    }
  }

  private async assertNoCycle(tx: DbOrTx, caseId: string, taskId: string, next: string[]) {
    const edges = await tx
      .select({ from: taskDependencies.taskId, to: taskDependencies.dependsOnTaskId })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
      .where(eq(tasks.caseId, caseId));
    const graph = new Map<string, string[]>();
    for (const e of edges) if (e.from !== taskId) graph.set(e.from, [...(graph.get(e.from) ?? []), e.to]);
    graph.set(taskId, next);
    // DFS from the edited task: reaching it again means a cycle.
    const stack = [...next];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === taskId) throw badRequest('DEPENDENCY_CYCLE', 'این وابستگی چرخه ایجاد می‌کند');
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...(graph.get(cur) ?? []));
    }
  }
}

function assertPlannedRange(start?: string | null, end?: string | null) {
  if (start && end && new Date(end) < new Date(start)) {
    throw badRequest('INVALID_TIME', 'پایان برنامه‌ای نمی‌تواند قبل از شروع برنامه‌ای باشد');
  }
}

function pickRow(obj: Record<string, any>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}
