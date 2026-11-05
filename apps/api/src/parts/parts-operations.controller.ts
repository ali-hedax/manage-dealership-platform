import { Body, Controller, Get, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { contractorSchema, externalWorkActionSchema, externalWorkCreateSchema, partConsumptionSchema, statementSendSchema } from '@manage/shared';
import { z } from 'zod';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { PartsOperationsService } from './parts-operations.service';

const exportSchema = z.object({
  format: z.enum(['pdf', 'xlsx']), version: z.coerce.number().int().positive().optional(),
  assessment: z.enum(['0', '1']).default('0'),
});

@Controller()
export class PartsOperationsController {
  constructor(private readonly parts: PartsOperationsService) {}

  @Get('parts/operations/notices')
  @RequirePermissions('case.update')
  coordinatorNotices(@CurrentActor() actor: Actor) { return this.parts.notices(actor, false); }

  @Get('parts/workbench/notices')
  @RequirePermissions('part.manage')
  partsNotices(@CurrentActor() actor: Actor) { return this.parts.notices(actor, true); }

  @Get('parts/contractors')
  @RequirePermissions('part.manage')
  contractors(@CurrentActor() actor: Actor, @Query('all') all?: string) { return this.parts.contractors(actor, all === '1'); }

  @Post('parts/contractors')
  @RequirePermissions('settings.manage')
  createContractor(@CurrentActor() actor: Actor, @Body(new ZodPipe(contractorSchema)) input: z.infer<typeof contractorSchema>) {
    return this.parts.saveContractor(actor, input);
  }

  @Patch('parts/contractors/:id')
  @RequirePermissions('settings.manage')
  updateContractor(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(contractorSchema)) input: z.infer<typeof contractorSchema>) {
    return this.parts.saveContractor(actor, input, id);
  }

  @Get('parts/external-work')
  @RequirePermissions('part.manage')
  externalQueue(@CurrentActor() actor: Actor) { return this.parts.external(actor); }

  @Get('cases/:id/external-work')
  @RequirePermissions('case.read')
  externalForCase(@CurrentActor() actor: Actor, @IdParam() id: string) { return this.parts.external(actor, id); }

  @Post('cases/:id/external-work')
  @RequirePermissions('task.manage')
  createExternal(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(externalWorkCreateSchema)) input: z.infer<typeof externalWorkCreateSchema>) {
    return this.parts.createExternal(actor, id, input);
  }

  @Post('parts/external-work/:id/actions')
  @RequirePermissions('part.manage')
  externalAction(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(externalWorkActionSchema)) input: z.infer<typeof externalWorkActionSchema>) {
    return this.parts.externalAction(actor, id, input);
  }

  @Get('cases/:id/parts-statement')
  @RequirePermissions('case.read')
  statement(@CurrentActor() actor: Actor, @IdParam() id: string) { return this.parts.statement(actor, id); }

  @Post('cases/:id/parts-statement')
  @RequirePermissions('part.manage')
  send(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(statementSendSchema)) input: z.infer<typeof statementSendSchema>) {
    return this.parts.send(actor, id, input.expectedVersion);
  }

  @Post('cases/:id/parts-statement/:partId/consume')
  @RequirePermissions('part.manage')
  consume(@CurrentActor() actor: Actor, @IdParam() id: string, @IdParam('partId') partId: string,
    @Body(new ZodPipe(partConsumptionSchema)) input: z.infer<typeof partConsumptionSchema>) {
    return this.parts.consume(actor, id, partId, input);
  }

  @Get('cases/:id/parts-statement/export')
  @RequirePermissions('case.read')
  async export(@CurrentActor() actor: Actor, @IdParam() id: string, @Query(new ZodPipe(exportSchema)) query: z.infer<typeof exportSchema>) {
    const data = await this.parts.export(actor, id, query.format, query.version, query.assessment === '1');
    return new StreamableFile(data, {
      type: query.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="parts-statement.${query.format}"`,
    });
  }
}
