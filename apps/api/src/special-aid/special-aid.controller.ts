import { Body, Controller, Get, Post, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import {
  contactSchema, dossierSearchSchema, groupDecisionSchema, groupSchema, itemActionSchema, nonConsumptionSchema, postponeSchema, supplySearchSchema,
  type ContactInput, type DossierSearchInput, type ItemActionInput, type NonConsumptionInput, type PostponeInput, type SupplySearchInput,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { SpecialAidService } from './special-aid.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const versionSchema = z.object({ expectedVersion: z.number().int().min(1) });
const decisionBody = groupDecisionSchema.extend({ decision: z.enum(['wait', 'partial']).nullable(), dissolve: z.boolean().optional() });

/** «پیگیری امداد ویژه» (spec section 25). Search bodies are POSTed to keep VINs out of URLs and logs. */
@Controller('special-aid')
export class SpecialAidController {
  constructor(private readonly aid: SpecialAidService) {}

  @RequirePermissions('special_aid.read') @Get('today')
  today(@CurrentActor() actor: Actor) { return this.aid.today(actor); }

  @RequirePermissions('special_aid.read') @Post('dossiers/search')
  list(@CurrentActor() actor: Actor, @Body(new ZodPipe(dossierSearchSchema)) body: DossierSearchInput) { return this.aid.list(actor, body); }

  @RequirePermissions('special_aid.read') @Get('dossiers/:id')
  get(@CurrentActor() actor: Actor, @IdParam() id: string) { return this.aid.get(actor, id); }

  @RequirePermissions('special_aid.operate') @Post('sync')
  sync(@CurrentActor() actor: Actor) { return this.aid.sync(actor); }

  @RequirePermissions('special_aid.operate') @Post('dossiers/:id/contacts')
  contact(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(contactSchema)) body: ContactInput) { return this.aid.contact(actor, id, body); }

  @RequirePermissions('special_aid.operate') @Post('dossiers/:id/postpone')
  postpone(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(postponeSchema)) body: PostponeInput) { return this.aid.postpone(actor, id, body); }

  @RequirePermissions('special_aid.operate') @Post('dossiers/:id/attended')
  attended(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(versionSchema)) body: { expectedVersion: number }) { return this.aid.attended(actor, id, body.expectedVersion); }

  @RequirePermissions('special_aid.operate') @Post('dossiers/:id/groups')
  group(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(groupSchema)) body: { itemIds: string[]; label?: string }) { return this.aid.group(actor, id, body); }

  @RequirePermissions('special_aid.operate') @Post('groups/:id/decision')
  decision(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(decisionBody)) body: z.infer<typeof decisionBody>) { return this.aid.groupDecision(actor, id, body); }

  // special_aid.release is checked in the service for the release action.
  @RequirePermissions('special_aid.read') @Post('items/:id/action')
  action(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(itemActionSchema)) body: ItemActionInput) { return this.aid.itemAction(actor, id, body); }

  @RequirePermissions('special_aid.operate') @Post('items/:id/non-consumption')
  nonConsumption(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(nonConsumptionSchema)) body: NonConsumptionInput) { return this.aid.nonConsumption(actor, id, body); }

  @RequirePermissions('special_aid.supply') @Post('supply/search')
  supply(@CurrentActor() actor: Actor, @Body(new ZodPipe(supplySearchSchema)) body: SupplySearchInput) { return this.aid.supply(actor, body); }

  @RequirePermissions('special_aid.supply') @Post('supply/export')
  async supplyExport(@CurrentActor() actor: Actor, @Body(new ZodPipe(supplySearchSchema)) body: SupplySearchInput) {
    return new StreamableFile(Buffer.from(await this.aid.supplyExport(actor, body)), { type: XLSX, disposition: 'attachment; filename="special-aid-supply.xlsx"' });
  }

  @RequirePermissions('special_aid.report') @Get('summary')
  summary(@CurrentActor() actor: Actor) { return this.aid.summary(actor); }
}
