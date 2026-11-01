import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  assessmentItemSchema,
  createAssessmentSchema,
  finalizeAssessmentSchema,
  recordAuthorizationSchema,
  removeAssessmentItemSchema,
  updateAssessmentItemSchema,
  type AssessmentItemInput,
  type CreateAssessmentInput,
  type FinalizeAssessmentInput,
  type RecordAuthorizationInput,
  type RemoveAssessmentItemInput,
  type UpdateAssessmentItemInput,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { AssessmentsService } from './assessments.service';

@Controller()
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get('cases/:id/assessments')
  @RequirePermissions('case.read')
  list(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.assessments.list(actor, id);
  }

  @Post('cases/:id/assessments')
  @RequirePermissions('assessment.manage')
  create(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(createAssessmentSchema)) body: CreateAssessmentInput,
  ) {
    return this.assessments.create(actor, id, body);
  }

  @Post('assessments/:id/items')
  @RequirePermissions('assessment.manage')
  addItem(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(assessmentItemSchema)) body: AssessmentItemInput,
  ) {
    return this.assessments.addItem(actor, id, body);
  }

  @Patch('assessment-items/:id')
  @RequirePermissions('assessment.manage')
  updateItem(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(updateAssessmentItemSchema)) body: UpdateAssessmentItemInput,
  ) {
    return this.assessments.updateItem(actor, id, body);
  }

  @Post('assessment-items/:id/remove')
  @RequirePermissions('assessment.manage')
  removeItem(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(removeAssessmentItemSchema)) body: RemoveAssessmentItemInput,
  ) {
    return this.assessments.removeItem(actor, id, body);
  }

  @Post('assessments/:id/finalize')
  @RequirePermissions('assessment.manage')
  finalize(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(finalizeAssessmentSchema)) body: FinalizeAssessmentInput,
  ) {
    return this.assessments.finalize(actor, id, body);
  }

  @Post('assessments/:id/authorization')
  @RequirePermissions('assessment.authorize')
  authorize(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(recordAuthorizationSchema)) body: RecordAuthorizationInput,
  ) {
    return this.assessments.recordAuthorization(actor, id, body);
  }
}
