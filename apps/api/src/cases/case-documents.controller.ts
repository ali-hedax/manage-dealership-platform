import { Body, Controller, Get, Inject, Post, StreamableFile } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import type { Actor } from '../auth/auth.types';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { caseDocuments } from '../db/schema';
import { CasesService } from './cases.service';
import { AuditService } from '../audit/audit.service';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { badRequest, notFound } from '../common/errors';
import { newId } from '../common/ids';
const upload = z.object({ expectedVersion: z.number().int().positive(), fileName: z.string().min(1).max(180),
  mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']), dataBase64: z.string().min(1).max(4200000).regex(/^[A-Za-z0-9+/]+={0,2}$/) });
@Controller('cases')
export class CaseDocumentsController {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle, private readonly cases: CasesService, private readonly audit: AuditService) {}
  @Get(':id/documents')
  @RequirePermissions('case.read')
  async list(@CurrentActor() actor: Actor, @IdParam() id: string) {
    await this.cases.detail(actor, id);
    return this.handle.db.select({ id: caseDocuments.id, fileName: caseDocuments.fileName, mime: caseDocuments.mime, size: caseDocuments.size, createdAt: caseDocuments.createdAt }).from(caseDocuments)
      .where(and(eq(caseDocuments.tenantId, actor.user.tenantId), eq(caseDocuments.caseId, id))).orderBy(desc(caseDocuments.createdAt));
  }
  @Post(':id/documents')
  @RequirePermissions('case.read', 'assessment.manage')
  async upload(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(upload)) input: z.infer<typeof upload>) {
    const bytes = Buffer.from(input.dataBase64, 'base64');
    const magic = input.mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : input.mime === 'image/png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
    if (!magic || bytes.length > 3 * 1024 * 1024) throw badRequest('DOCUMENT_INVALID', 'فقط PDF یا تصویر معتبر تا ۳ مگابایت بارگذاری کنید');
    const hash = createHash('sha256').update(bytes).digest('hex');
    return this.handle.db.transaction(async tx => {
      const c = await this.cases.loadForWrite(tx, actor.user.tenantId, id, input.expectedVersion);
      const [old] = await tx.select({ id: caseDocuments.id }).from(caseDocuments).where(and(eq(caseDocuments.tenantId, actor.user.tenantId), eq(caseDocuments.caseId, id), eq(caseDocuments.sha256, hash)));
      if (old) return { id: old.id };
      const [row] = await tx.insert(caseDocuments).values({ id: newId(), tenantId: actor.user.tenantId, caseId: id, fileName: input.fileName.replace(/[\\/\r\n]/g, '_'), mime: input.mime, size: bytes.length, sha256: hash, dataBase64: bytes.toString('base64'), createdBy: actor.user.id, isTest: actor.user.isTestTenant }).returning();
      await this.cases.applyPatch(tx, actor, c, {}, 'case.document_added', null);
      await this.audit.record(tx, actor, { entityType: 'case_document', entityId: row!.id, caseId: id, action: 'case.document_uploaded', after: { fileName: row!.fileName, sha256: hash }, snapshot: { version: 1, row: row! } });
      return { id: row!.id };
    });
  }
  @Get(':id/documents/:documentId')
  @RequirePermissions('case.read')
  async download(@CurrentActor() actor: Actor, @IdParam() id: string, @IdParam('documentId') documentId: string) {
    const [row] = await this.handle.db.select().from(caseDocuments).where(and(eq(caseDocuments.tenantId, actor.user.tenantId), eq(caseDocuments.caseId, id), eq(caseDocuments.id, documentId)));
    if (!row) throw notFound('مدرک');
    return new StreamableFile(Buffer.from(row.dataBase64, 'base64'), { type: row.mime, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}` });
  }
}
