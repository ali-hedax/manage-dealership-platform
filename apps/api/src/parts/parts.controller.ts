import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  createPartSchema,
  partPickupSchema,
  partsWorkbenchActionSchema,
  type PartPickup,
  type PartsWorkbenchAction,
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
import { PartsWorkbenchService } from './parts-workbench.service';
import { PartsService } from './parts.service';

@Controller()
export class PartsController {
  constructor(private readonly parts: PartsService, private readonly workbench: PartsWorkbenchService) {}

  @Get('parts/workbench')
  @RequirePermissions('part.manage')
  work(@CurrentActor() actor: Actor, @Query('transit') transit?: string) {
    return this.workbench.list(actor, transit === '1');
  }

  @Post('parts/workbench/:id/actions')
  @RequirePermissions('part.manage')
  workAction(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(partsWorkbenchActionSchema)) input: PartsWorkbenchAction) {
    return this.workbench.act(actor, id, input);
  }

  @Post('tasks/:id/part-pickup')
  @RequirePermissions('task.execute')
  pickup(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(partPickupSchema)) input: PartPickup) {
    return this.workbench.pickup(actor, id, input);
  }

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
