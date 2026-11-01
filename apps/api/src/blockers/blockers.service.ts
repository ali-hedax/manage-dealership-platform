import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Blocker, BlockerFollowUpInput, BlockerReason, CreateBlockerInput, ResolveBlockerInput } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { assertNotFuture, CasesService, MINUTE_TOLERANCE_MS } from '../cases/cases.service';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { assessments, blockers } from '../db/schema';
import { TasksService } from '../tasks/tasks.service';

export type BlockerRow = typeof blockers.$inferSelect;

// A blocker records three moments: when the problem occurred, when it was
// recorded in Manage, and each follow-up / the resolution. Comparing them
// separates a late report or slow follow-up from the blocker itself.
@Injectable()
export class BlockersService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
    private readonly tasks: TasksService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  async create(actor: Actor, caseId: string, input: CreateBlockerInput): Promise<Blocker> {
    const tenantId = actor.user.tenantId;
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    assertNotFuture(occurredAt, 'زمان بروز مانع نمی‌تواند در آینده باشد');
    // Phase 1: only the supervisor records the status of repair activities.
    if (input.taskId && !actor.user.permissions.has('task.manage')) throw forbidden();

    const id = newId();
    await this.db.transaction(async (tx) => {
      await this.cases.loadForWrite(tx, tenantId, caseId);
      if (input.taskId) {
        const task = await this.tasks.loadForWrite(tx, tenantId, input.taskId, input.expectedTaskVersion);
        if (task.caseId !== caseId) throw badRequest('INVALID_TASK', 'فعالیت متعلق به این پرونده نیست');
        if (task.status === 'done' || task.status === 'approved') {
          throw badRequest('INVALID_TRANSITION', 'برای فعالیت تمام‌شده نمی‌توان مانع ثبت کرد');
        }
        if (task.status !== 'blocked') {
          const updated = await this.tasks.save(tx, task, { status: 'blocked' });
          await this.audit.record(tx, actor, {
            entityType: 'task',
            entityId: task.id,
            caseId,
            action: 'task.blocked',
            reason: input.description ?? null,
            before: { status: task.status },
            after: { status: 'blocked', reason: input.reason },
            snapshot: { version: updated.version, row: updated },
          });
        }
      }
      await this.insert(tx, actor, caseId, {
        id,
        taskId: input.taskId ?? null,
        reason: input.reason,
        description: input.description ?? null,
        occurredAt,
      });
    });
    return this.get(actor, caseId, id);
  }

  /** Inserts a blocker inside the caller's transaction (also used for authorization waits). */
  async insert(
    tx: DbOrTx,
    actor: Actor,
    caseId: string,
    b: { id?: string; taskId: string | null; reason: BlockerReason; description: string | null; occurredAt: Date },
  ): Promise<BlockerRow> {
    const id = b.id ?? newId();
    const [row] = await tx
      .insert(blockers)
      .values({
        id,
        tenantId: actor.user.tenantId,
        caseId,
        taskId: b.taskId,
        reason: b.reason,
        description: b.description,
        occurredAt: b.occurredAt,
        recordedBy: actor.user.id,
        isTest: actor.user.isTestTenant,
      })
      .returning();
    await this.audit.record(tx, actor, {
      entityType: 'blocker',
      entityId: id,
      caseId,
      action: 'blocker.created',
      reason: b.description,
      after: { reason: b.reason, taskId: b.taskId, occurredAt: b.occurredAt.toISOString() },
      snapshot: { version: 1, row: row! },
    });
    return row!;
  }

  async followUp(actor: Actor, id: string, input: BlockerFollowUpInput): Promise<Blocker> {
    const at = input.at ? new Date(input.at) : new Date();
    assertNotFuture(at, 'زمان پیگیری نمی‌تواند در آینده باشد');
    const blocker = await this.db.transaction(async (tx) => {
      const b = await this.loadOpen(tx, actor.user.tenantId, id);
      const updated = await this.save(tx, b, { lastFollowUpAt: at, followUpCount: b.followUpCount + 1 });
      await this.audit.record(tx, actor, {
        entityType: 'blocker',
        entityId: id,
        caseId: b.caseId,
        action: 'blocker.acknowledged',
        reason: input.note ?? null,
        occurredAt: at,
        after: { followUpCount: updated.followUpCount },
        snapshot: { version: updated.version, row: updated },
      });
      return updated;
    });
    return this.get(actor, blocker.caseId, id);
  }

  async resolve(actor: Actor, id: string, input: ResolveBlockerInput): Promise<Blocker> {
    const tenantId = actor.user.tenantId;
    const at = input.at ? new Date(input.at) : new Date();
    assertNotFuture(at, 'زمان رفع مانع نمی‌تواند در آینده باشد');
    const blocker = await this.db.transaction(async (tx) => {
      const b = await this.loadOpen(tx, tenantId, id);
      const [managed] = await tx
        .select({ id: assessments.id })
        .from(assessments)
        .where(and(eq(assessments.blockerId, id), eq(assessments.authorizationStatus, 'pending')));
      if (managed) {
        throw badRequest('BLOCKER_MANAGED', 'این مانع با ثبت تصمیم مجوز در بخش کارشناسی رفع می‌شود');
      }
      if (at.getTime() < b.occurredAt.getTime() - MINUTE_TOLERANCE_MS) {
        throw badRequest('INVALID_TIME', 'زمان رفع نمی‌تواند قبل از بروز مانع باشد');
      }
      const updated = await this.close(tx, actor, b, at, input.note);

      // Unblock the task once its last open blocker is resolved.
      if (b.taskId) {
        const others = await tx
          .select({ id: blockers.id })
          .from(blockers)
          .where(and(eq(blockers.taskId, b.taskId), isNull(blockers.resolvedAt), ne(blockers.id, id)));
        const task = await this.tasks.loadForWrite(tx, tenantId, b.taskId);
        if (!others.length && task.status === 'blocked') {
          const next = task.actualStartAt ? 'in_progress' : 'pending';
          const saved = await this.tasks.save(tx, task, { status: next });
          await this.audit.record(tx, actor, {
            entityType: 'task',
            entityId: task.id,
            caseId: b.caseId,
            action: 'task.updated',
            reason: 'رفع مانع',
            before: { status: 'blocked' },
            after: { status: next },
            snapshot: { version: saved.version, row: saved },
          });
        }
      }
      return updated;
    });
    return this.get(actor, blocker.caseId, id);
  }

  /** Marks an open blocker resolved inside the caller's transaction. */
  async close(tx: DbOrTx, actor: Actor, b: BlockerRow, at: Date, note: string): Promise<BlockerRow> {
    const resolvedAt = at < b.occurredAt ? b.occurredAt : at;
    const updated = await this.save(tx, b, {
      resolvedAt,
      resolvedBy: actor.user.id,
      resolutionNote: note,
    });
    await this.audit.record(tx, actor, {
      entityType: 'blocker',
      entityId: b.id,
      caseId: b.caseId,
      action: 'blocker.resolved',
      reason: note,
      occurredAt: resolvedAt,
      snapshot: { version: updated.version, row: updated },
    });
    return updated;
  }

  private async get(actor: Actor, caseId: string, id: string): Promise<Blocker> {
    const b = (await this.cases.blockersOf(actor.user.tenantId, caseId)).find((x) => x.id === id);
    if (!b) throw notFound('مانع');
    return b;
  }

  private async loadOpen(tx: DbOrTx, tenantId: string, id: string): Promise<BlockerRow> {
    const [b] = await tx
      .select()
      .from(blockers)
      .where(and(eq(blockers.id, id), eq(blockers.tenantId, tenantId)));
    if (!b) throw notFound('مانع');
    if (b.resolvedAt) throw badRequest('BLOCKER_RESOLVED', 'این مانع قبلاً رفع شده است');
    await this.cases.loadForWrite(tx, tenantId, b.caseId);
    return b;
  }

  private async save(tx: DbOrTx, b: BlockerRow, patch: Partial<BlockerRow>): Promise<BlockerRow> {
    const [row] = await tx
      .update(blockers)
      .set({ ...patch, updatedAt: new Date(), version: b.version + 1 })
      .where(and(eq(blockers.id, b.id), eq(blockers.version, b.version)))
      .returning();
    if (!row) throw versionConflict();
    return row;
  }
}
