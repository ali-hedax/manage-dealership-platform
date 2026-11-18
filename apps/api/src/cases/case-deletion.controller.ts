import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { caseDeleteSchema, caseRestoreSchema, type CaseDeleteInput, type CaseRestoreInput } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { CaseDeletionService } from './case-deletion.service';

/** Owner-only recoverable deletion; the service checks the stored owner flag (owner, 2026-11-18). */
@Controller()
export class CaseDeletionController {
  constructor(private readonly deletion: CaseDeletionService) {}

  @Post('cases/:id/delete')
  @RequirePermissions('case.read')
  remove(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(caseDeleteSchema)) body: CaseDeleteInput) {
    return this.deletion.remove(actor, id, body);
  }

  @Post('cases/:id/restore')
  @RequirePermissions('case.read')
  restore(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(caseRestoreSchema)) body: CaseRestoreInput) {
    return this.deletion.restore(actor, id, body);
  }

  @Get('deleted-cases')
  @RequirePermissions('case.read')
  list(@CurrentActor() actor: Actor, @Query('q') q?: string) {
    return this.deletion.list(actor, typeof q === 'string' ? q.slice(0, 100) : undefined);
  }
}
