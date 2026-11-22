import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { reportCenterSaveSchema, reportDetectSchema, type ReportCenterSaveInput } from '@manage/shared';
import type { z } from 'zod';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ReportCenterService } from './report-center.service';

/** «مرکز گزارش‌های کسب‌وکار» (spec section 25). */
@Controller('report-center')
export class ReportCenterController {
  constructor(private readonly center: ReportCenterService) {}
  // Permission combinations are checked in the service (upload staff read; report_center.manage edits).
  @RequirePermissions() @Get()
  list(@CurrentActor() actor: Actor) { return this.center.list(actor); }
  @RequirePermissions('report_center.manage') @Put()
  save(@CurrentActor() actor: Actor, @Body(new ZodPipe(reportCenterSaveSchema)) body: ReportCenterSaveInput) { return this.center.save(actor, body); }
  // Unified upload: recognizes each file by content; the existing import of that report then previews it.
  @RequirePermissions() @Post('detect')
  detect(@CurrentActor() actor: Actor, @Body(new ZodPipe(reportDetectSchema)) body: z.infer<typeof reportDetectSchema>) { return this.center.detect(actor, body); }
}
