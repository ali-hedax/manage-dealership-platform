import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  assessmentItemSchema,
  importAssessmentSchema,
  type ImportAssessmentInput,
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

  /** Parts clerk technical review, separate from insurer/OEM authorization. */
  @Get('cases/:id/technical-reviews')
  @RequirePermissions('case.read')
  technicalReviews(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.assessments.technicalReviews(actor,id);
  }

  @Post('assessment-items/:id/technical-review')
  @RequirePermissions('part.manage')
  reviewTechnicalItem(
    @CurrentActor() actor: Actor,
    @IdParam() id: string,
    @Body(new ZodPipe(z.object({
      action:z.enum(['accept','return','reset']),
      reason:z.string().trim().max(500).nullish(),
      expectedVersion:z.number().int().min(0)
    }).strict())) body:{action:'accept'|'return'|'reset';reason?:string|null;expectedVersion:number},
  ){
    return this.assessments.reviewTechnicalItem(actor,id,body);
  }

  @Get('assessments/:id/package')
  @RequirePermissions('case.read')
  packageStatus(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.assessments.packageStatus(actor,id);
  }

  @Post('assessments/:id/package')
  @RequirePermissions('assessment.manage')
  submitPackage(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(removeAssessmentItemSchema)) body: RemoveAssessmentItemInput) {
    return this.assessments.submitPackage(actor,id,body.expectedVersion);
  }

  @Post('assessments/:id/package/finalize')
  @RequirePermissions('part.manage')
  finalizePackage(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(z.object({expectedVersion:z.number().int().positive()}).strict())) body: {expectedVersion:number}) {
    return this.assessments.finalize(actor,id,body,true);
  }

  @Patch('assessment-items/:id/technical-code')
  @RequirePermissions('part.manage')
  correctCode(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(z.object({expectedVersion:z.number().int().positive(),partNumber:z.string().trim().min(1).max(64)}).strict())) body: {expectedVersion:number;partNumber:string}) {
    return this.assessments.updateItem(actor,id,body,true);
  }

  @Post('assessment-items/:id/technical-remove')
  @RequirePermissions('part.manage')
  removeTechnicalLine(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(removeAssessmentItemSchema)) body: RemoveAssessmentItemInput) {
    return this.assessments.removeItem(actor,id,body,true);
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

  @Post('assessments/:id/import')
  @RequirePermissions('assessment.manage')
  importSheet(@CurrentActor() actor: Actor, @IdParam() id: string,
    @Body(new ZodPipe(importAssessmentSchema)) body: ImportAssessmentInput) {
    return this.assessments.importSheet(actor, id, body);
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
