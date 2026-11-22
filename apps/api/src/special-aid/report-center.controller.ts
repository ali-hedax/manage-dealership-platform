import { Body, Controller, Get, Put } from '@nestjs/common';
import { reportCenterSaveSchema, type ReportCenterSaveInput } from '@manage/shared';
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
}
