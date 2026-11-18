import {Body,Controller,Get,Param,Post,StreamableFile} from '@nestjs/common';
import {z} from 'zod';
import {REFERENCE_KINDS,referenceFileSchema,referencePreviewSchema,referenceSearchSchema,type ReferenceKind,type ReferenceFileInput,type ReferencePreviewInput} from '@manage/shared';
import {CurrentActor,RequirePermissions} from '../auth/decorators';
import type {Actor} from '../auth/auth.types';
import {IdParam} from '../common/params';
import {ZodPipe} from '../common/zod.pipe';
import {ReferenceDataService} from './reference-data.service';
const Kind=()=>Param('kind',new ZodPipe(z.enum(REFERENCE_KINDS)));
@Controller()
export class ReferenceDataController{
 constructor(private readonly service:ReferenceDataService){}
 @Post('reference-imports/inspect')
 inspect(@CurrentActor()a:Actor,@Body(new ZodPipe(referenceFileSchema))b:ReferenceFileInput){return this.service.inspect(a,b);}
 @Post('reference-imports')
 preview(@CurrentActor()a:Actor,@Body(new ZodPipe(referencePreviewSchema))b:ReferencePreviewInput){return this.service.preview(a,b);}
 @Get('reference-imports/:id')
 get(@CurrentActor()a:Actor,@IdParam()id:string){return this.service.get(a,id);}
 @Post('reference-imports/:id/apply')
 apply(@CurrentActor()a:Actor,@IdParam()id:string){return this.service.apply(a,id);}
 @Get('reference-imports/:id/report')
 async report(@CurrentActor()a:Actor,@IdParam()id:string){return new StreamableFile(Buffer.from(await this.service.report(a,id)),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',disposition:'attachment; filename="reference-result.xlsx"'});}
 @Get('reference-data/:kind')
 list(@CurrentActor()a:Actor,@Kind()kind:ReferenceKind){return this.service.list(a,kind);}
 // POST keeps chassis/customer queries out of URLs, browser history and access logs.
 @Post('reference-data/:kind/search')
 search(@CurrentActor()a:Actor,@Kind()kind:ReferenceKind,@Body(new ZodPipe(referenceSearchSchema))b:{query:string}){return this.service.search(a,kind,b.query);}
 /** Case-scoped, read-only dropdown; no assessment line is created here. */
 @Post('cases/:id/assessment-catalog/search')
 @RequirePermissions('assessment.manage')
 suggestAssessmentParts(@CurrentActor()a:Actor,@IdParam()id:string,@Body(new ZodPipe(referenceSearchSchema))b:{query:string}){
  return this.service.suggestAssessmentParts(a,id,b.query);
 }
 @Get('reference-data/:kind/sample')
 sample(@CurrentActor()a:Actor,@Kind()kind:ReferenceKind){return new StreamableFile(Buffer.from(this.service.sample(a,kind)),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',disposition:'attachment; filename="reference-sample.xlsx"'});}
}
