import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  discrepancyAssignSchema,
  discrepancyListSchema,
  discrepancyResolveSchema,
  type DiscrepancyAssignInput,
  type DiscrepancyListQuery,
  type DiscrepancyResolveInput,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { DiscrepanciesService } from './discrepancies.service';

// Review permission (part.manage or report.manager) is checked in the service.
@Controller('part-discrepancies')
export class DiscrepanciesController {
  constructor(private readonly discrepancies: DiscrepanciesService) {}

  @Get()
  @RequirePermissions('case.read')
  list(@CurrentActor() actor: Actor, @Query(new ZodPipe(discrepancyListSchema)) q: DiscrepancyListQuery) {
    return this.discrepancies.list(actor, q);
  }

  @Get(':id/history')
  @RequirePermissions('case.read')
  history(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.discrepancies.history(actor, id);
  }

  @Post(':id/assign')
  @RequirePermissions('case.read')
  assign(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(discrepancyAssignSchema)) body: DiscrepancyAssignInput) {
    return this.discrepancies.assign(actor, id, body);
  }

  @Post(':id/resolve')
  @RequirePermissions('case.read')
  resolve(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(discrepancyResolveSchema)) body: DiscrepancyResolveInput) {
    return this.discrepancies.resolve(actor, id, body);
  }
}
