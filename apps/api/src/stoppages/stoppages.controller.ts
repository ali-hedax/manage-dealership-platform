import { Body, Controller, Get, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  stoppageImportQuerySchema, stoppageLinkSchema, stoppageListQuerySchema, stoppageOwnerSchema,
  type StoppageLinkInput, type StoppageOwnerInput,
} from '@manage/shared';
import type { z } from 'zod';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { StoppagesService } from './stoppages.service';

/**
 * «خودروهای متوقف» from the official «گزارش توقف خودرو» of کسب‌وکار. The Excel arrives as raw
 * bytes (application/octet-stream): without `confirm` the call only previews, with the previewed
 * SHA-256 it applies.
 */
@Controller('stoppages')
export class StoppagesController {
  constructor(private readonly stoppages: StoppagesService) {}

  @RequirePermissions('stoppage.import') @Post('import')
  async import(@CurrentActor() actor: Actor, @Query(new ZodPipe(stoppageImportQuerySchema)) q: z.infer<typeof stoppageImportQuerySchema>, @Req() req: Request) {
    const data = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
    if (!q.confirm) return this.stoppages.preview(actor, q.fileName, data);
    return this.stoppages.importFile(actor, q.fileName, data, q.confirm, q.acceptWarnings === 'true');
  }

  @RequirePermissions('stoppage.read') @Get()
  list(@CurrentActor() actor: Actor, @Query(new ZodPipe(stoppageListQuerySchema)) q: z.infer<typeof stoppageListQuerySchema>) {
    return this.stoppages.list(actor, q.view, q.q);
  }

  @RequirePermissions('stoppage.read') @Get('report')
  report(@CurrentActor() actor: Actor) { return this.stoppages.report(actor); }

  @RequirePermissions('stoppage.manage') @Get('followers')
  followers(@CurrentActor() actor: Actor) { return this.stoppages.followers(actor); }

  @RequirePermissions('stoppage.read') @Get(':id')
  get(@CurrentActor() actor: Actor, @IdParam() id: string) { return this.stoppages.byId(actor, id); }

  @RequirePermissions('stoppage.manage') @Patch(':id/follow-up')
  followUp(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(stoppageOwnerSchema)) body: StoppageOwnerInput) {
    return this.stoppages.setFollowUp(actor, id, body);
  }

  @RequirePermissions('stoppage.manage') @Post(':id/reception')
  link(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(stoppageLinkSchema)) body: StoppageLinkInput) {
    return this.stoppages.link(actor, id, body);
  }
}
