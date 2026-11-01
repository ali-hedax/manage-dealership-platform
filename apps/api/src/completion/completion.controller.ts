import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  deliverySchema,
  financialCloseSchema,
  recordQcSchema,
  technicalCloseSchema,
  type DeliveryInput,
  type FinancialCloseInput,
  type RecordQcInput,
  type TechnicalCloseInput,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { CompletionService } from './completion.service';

@Controller('cases')
export class CompletionController {
  constructor(private readonly completion: CompletionService) {}

  @Get(':id/completion')
  @RequirePermissions('case.read')
  get(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.completion.get(actor, id);
  }

  @Post(':id/qc')
  @RequirePermissions('qc.inspect')
  recordQc(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(recordQcSchema)) body: RecordQcInput) {
    return this.completion.recordQc(actor, id, body);
  }

  @Post(':id/technical-close')
  @RequirePermissions('case.technical_close')
  technicalClose(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(technicalCloseSchema)) body: TechnicalCloseInput,
  ) {
    return this.completion.technicalClose(actor, id, body);
  }

  @Post(':id/financial-close')
  @RequirePermissions('finance.close')
  financialClose(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(financialCloseSchema)) body: FinancialCloseInput,
  ) {
    return this.completion.financialClose(actor, id, body);
  }

  @Post(':id/delivery')
  @RequirePermissions('case.deliver')
  deliver(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(deliverySchema)) body: DeliveryInput) {
    return this.completion.deliver(actor, id, body);
  }
}
