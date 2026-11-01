import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import {
  financeDecisionSchema,
  financePaymentSchema,
  financeSharesSchema,
  proposeFinanceSchema,
  settlementPaymentSchema,
  type FinanceDecisionInput,
  type FinancePaymentInput,
  type FinanceSharesInput,
  type ProposeFinanceInput,
  type SettlementPaymentInput,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { FinanceService } from './finance.service';

@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('cases/:id/finance')
  @RequirePermissions('case.read')
  summary(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.finance.summary(actor, id);
  }

  @Put('cases/:id/finance/shares')
  @RequirePermissions('finance.propose')
  shares(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(financeSharesSchema)) body: FinanceSharesInput,
  ) {
    return this.finance.setShares(actor, id, body);
  }

  @Post('cases/:id/finance/approvals')
  @RequirePermissions('finance.propose')
  propose(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(proposeFinanceSchema)) body: ProposeFinanceInput,
  ) {
    return this.finance.propose(actor, id, body);
  }

  @Post('cases/:id/finance/payments')
  @RequirePermissions('finance.payment')
  recordPayment(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(settlementPaymentSchema)) body: SettlementPaymentInput,
  ) {
    return this.finance.recordPayment(actor, id, body);
  }

  @Post('financial-approvals/:id/decision')
  @RequirePermissions('finance.approve')
  decide(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(financeDecisionSchema)) body: FinanceDecisionInput,
  ) {
    return this.finance.decide(actor, id, body);
  }

  @Post('financial-approvals/:id/payment')
  @RequirePermissions('finance.payment')
  payment(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(financePaymentSchema)) body: FinancePaymentInput,
  ) {
    return this.finance.confirmPayment(actor, id, body);
  }
}
