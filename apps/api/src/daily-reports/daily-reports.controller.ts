import { Body, Controller, Get, Param, Patch, Post, Query, Req, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  DAILY_REPORT_KINDS,
  RESERVATION_STATUSES,
  dailyApplySchema,
  dailyRowsQuerySchema,
  emdadFollowUpSchema,
  emdadMatchSchema,
  emdadSearchSchema,
  reservationActionSchema,
  reserveSchema,
  stockProfileSchema,
  stockSearchSchema,
  type DailyApplyInput,
  type DailyReportKind,
  type EmdadFollowUpInput,
  type EmdadMatchInput,
  type EmdadSearchInput,
  type ReservationActionInput,
  type ReserveInput,
  type StockProfileInput,
  type StockSearchQuery,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { DailyReportsService } from './daily-reports.service';
import { DailyTasksService } from './daily-tasks.service';
import { EmdadService } from './emdad.service';
import { StockService } from './stock.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const Kind = () => Param('kind', new ZodPipe(z.enum(DAILY_REPORT_KINDS)));
const uploadQuery = z.object({ kind: z.enum(DAILY_REPORT_KINDS), fileName: z.string().max(300).default('report') });
const reservationQuery = z.object({
  caseId: z.uuid().optional(),
  partRequestId: z.uuid().optional(),
  status: z.enum(RESERVATION_STATUSES).optional(),
  reconcile: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

@Controller()
export class DailyReportsController {
  constructor(
    private readonly reports: DailyReportsService,
    private readonly stock: StockService,
    private readonly emdad: EmdadService,
    private readonly tasks: DailyTasksService,
  ) {}

  // Raw file bytes (application/octet-stream), up to DAILY_REPORT_MAX_BYTES; never base64 in JSON.
  @Post('daily-reports/uploads')
  @RequirePermissions('daily_reports.upload')
  upload(@CurrentActor() a: Actor, @Query(new ZodPipe(uploadQuery)) q: z.infer<typeof uploadQuery>, @Req() req: Request) {
    return this.reports.upload(a, q.kind, q.fileName, req.body);
  }

  @Get('daily-reports/imports')
  list(@CurrentActor() a: Actor, @Query(new ZodPipe(z.object({ kind: z.enum(DAILY_REPORT_KINDS).optional() }))) q: { kind?: DailyReportKind }) {
    return this.reports.list(a, q.kind);
  }

  @Get('daily-reports/imports/:id')
  @RequirePermissions('daily_reports.upload')
  get(@CurrentActor() a: Actor, @IdParam() id: string) {
    return this.reports.get(a, id);
  }

  @Get('daily-reports/imports/:id/rows')
  @RequirePermissions('daily_reports.upload')
  rows(@CurrentActor() a: Actor, @IdParam() id: string, @Query(new ZodPipe(dailyRowsQuerySchema)) q: z.infer<typeof dailyRowsQuerySchema>) {
    return this.reports.rows(a, id, q);
  }

  @Get('daily-reports/imports/:id/report')
  @RequirePermissions('daily_reports.upload')
  async report(@CurrentActor() a: Actor, @IdParam() id: string) {
    return new StreamableFile(Buffer.from(await this.reports.report(a, id)), { type: XLSX, disposition: 'attachment; filename="daily-report-result.xlsx"' });
  }

  @Post('daily-reports/imports/:id/apply')
  @RequirePermissions('daily_reports.apply')
  apply(@CurrentActor() a: Actor, @IdParam() id: string, @Body(new ZodPipe(dailyApplySchema)) b: DailyApplyInput) {
    return this.reports.apply(a, id, b);
  }

  @Post('daily-reports/imports/:id/retry')
  @RequirePermissions('daily_reports.upload')
  retry(@CurrentActor() a: Actor, @IdParam() id: string) {
    return this.reports.retry(a, id);
  }

  @Post('daily-reports/imports/:id/discard')
  @RequirePermissions('daily_reports.upload')
  discard(@CurrentActor() a: Actor, @IdParam() id: string) {
    return this.reports.discard(a, id);
  }

  @Get('daily-reports/profiles/:kind')
  profile(@CurrentActor() a: Actor, @Kind() kind: DailyReportKind) {
    return this.reports.profile(a, kind);
  }

  @Patch('daily-reports/profiles/:kind')
  @RequirePermissions('daily_reports.settings')
  updateProfile(@CurrentActor() a: Actor, @Kind() kind: DailyReportKind, @Body(new ZodPipe(stockProfileSchema)) b: StockProfileInput) {
    return this.reports.updateProfile(a, kind, b);
  }

  @Get('daily-reports/status')
  status(@CurrentActor() a: Actor) {
    return this.reports.status(a);
  }

  @Get('stock/options')
  @RequirePermissions('stock.read')
  options(@CurrentActor() a: Actor, @Query(new ZodPipe(stockSearchSchema)) q: StockSearchQuery) {
    return this.stock.options(a, q);
  }

  @Get('stock/reservations')
  @RequirePermissions('stock.read')
  async reservations(@CurrentActor() a: Actor, @Query(new ZodPipe(reservationQuery)) q: z.infer<typeof reservationQuery>) {
    return { items: await this.stock.reservations(a, { ...q, reconcile: q.reconcile === 'true' }) };
  }

  @Post('stock/reservations')
  @RequirePermissions('stock.reserve')
  reserve(@CurrentActor() a: Actor, @Body(new ZodPipe(reserveSchema)) b: ReserveInput) {
    return this.stock.reserve(a, b);
  }

  @Post('stock/reservations/:id/actions')
  @RequirePermissions('stock.read')
  act(@CurrentActor() a: Actor, @IdParam() id: string, @Body(new ZodPipe(reservationActionSchema)) b: ReservationActionInput) {
    return this.stock.act(a, id, b);
  }

  // POST keeps chassis and admission numbers out of URLs and access logs.
  @Post('emdad/requests/search')
  @RequirePermissions('emdad.read')
  search(@CurrentActor() a: Actor, @Body(new ZodPipe(emdadSearchSchema)) b: EmdadSearchInput) {
    return this.emdad.search(a, b);
  }

  @Post('emdad/requests/export')
  @RequirePermissions('emdad.read')
  async export(@CurrentActor() a: Actor, @Body(new ZodPipe(emdadSearchSchema)) b: EmdadSearchInput) {
    return new StreamableFile(Buffer.from(await this.emdad.export(a, b)), { type: XLSX, disposition: 'attachment; filename="emdad-follow-up.xlsx"' });
  }

  @Get('emdad/requests/:id')
  @RequirePermissions('emdad.read')
  emdadGet(@CurrentActor() a: Actor, @IdParam() id: string) {
    return this.emdad.get(a, id);
  }

  @Patch('emdad/requests/:id/follow-up')
  @RequirePermissions('emdad.manage')
  followUp(@CurrentActor() a: Actor, @IdParam() id: string, @Body(new ZodPipe(emdadFollowUpSchema)) b: EmdadFollowUpInput) {
    return this.emdad.followUp(a, id, b);
  }

  @Post('emdad/requests/:id/match')
  @RequirePermissions('emdad.manage')
  match(@CurrentActor() a: Actor, @IdParam() id: string, @Body(new ZodPipe(emdadMatchSchema)) b: EmdadMatchInput) {
    return this.emdad.match(a, id, b);
  }

  @Get('notifications')
  inbox(@CurrentActor() a: Actor) {
    return this.tasks.inbox(a);
  }

  @Post('notifications/read')
  read(@CurrentActor() a: Actor, @Body(new ZodPipe(z.object({ ids: z.union([z.array(z.uuid()).max(100), z.literal('all')]) }).strict())) b: { ids: string[] | 'all' }) {
    return this.tasks.markRead(a, b.ids);
  }
}
