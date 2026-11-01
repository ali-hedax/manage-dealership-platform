import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  createPartSchema,
  importPartsSchema,
  partActionSchema,
  partsFromAssessmentSchema,
  type CreatePartInput,
  type ImportPartsInput,
  type PartActionInput,
  type PartsFromAssessmentInput,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { PartsService } from './parts.service';

@Controller()
export class PartsController {
  constructor(private readonly parts: PartsService) {}

  @Get('cases/:id/parts')
  @RequirePermissions('case.read')
  list(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.parts.list(actor, id);
  }

  @Post('cases/:id/parts')
  @RequirePermissions('part.request')
  create(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(createPartSchema)) body: CreatePartInput) {
    return this.parts.create(actor, id, body);
  }

  @Post('cases/:id/parts/from-assessment')
  @RequirePermissions('part.request')
  fromAssessment(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(partsFromAssessmentSchema)) body: PartsFromAssessmentInput,
  ) {
    return this.parts.fromAssessment(actor, id, body);
  }

  @Post('cases/:id/parts/import')
  @RequirePermissions('part.request')
  importSheet(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(importPartsSchema)) body: ImportPartsInput,
  ) {
    return this.parts.importSheet(actor, id, body);
  }

  @Post('parts/:id/actions')
  @RequirePermissions('part.manage')
  act(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(partActionSchema)) body: PartActionInput) {
    return this.parts.act(actor, id, body);
  }
}
