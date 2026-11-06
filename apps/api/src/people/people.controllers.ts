import { Body, Controller, Get, Post, Put, Query, StreamableFile } from '@nestjs/common';
import {
  caseTransferSchema,
  COVERAGE_BUCKET_LABELS,
  formatJalali,
  monthQuerySchema,
  reminderRespondSchema,
  reminderSendSchema,
  staffAdminSchema,
  technicianProblemSchema,
  wageSeenSchema,
  wageSetSchema,
  type CaseTransferInput,
  type MonthQuery,
  type ReminderRespondInput,
  type ReminderSendInput,
  type StaffAdminInput,
  type TechnicianProblemInput,
  type WageSetInput,
} from '@manage/shared';
import type { z } from 'zod';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { CasesService } from '../cases/cases.service';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { writeWorkbook } from '../parts/xlsx';
import { OwnerControlsService } from './owner-controls.service';
import { RemindersService } from './reminders.service';
import { ResponsibilityService } from './responsibility.service';
import { WagesService } from './wages.service';

/** Reminders between desks; every signed-in person may send and receive (technicians included). */
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('people')
  people(@CurrentActor() actor: Actor) {
    return this.reminders.people(actor);
  }

  @Get('inbox')
  inbox(@CurrentActor() actor: Actor) {
    return this.reminders.inbox(actor);
  }

  @Get()
  mine(@CurrentActor() actor: Actor) {
    return this.reminders.mine(actor);
  }

  @Post()
  send(@CurrentActor() actor: Actor, @Body(new ZodPipe(reminderSendSchema)) body: ReminderSendInput) {
    return this.reminders.send(actor, body);
  }

  @Post(':id/respond')
  respond(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(reminderRespondSchema)) body: ReminderRespondInput) {
    return this.reminders.respond(actor, id, body);
  }
}

/** The technician's own monthly work, wage confirmation and "I have a problem". */
@Controller('workshop')
export class TechnicianWorkController {
  constructor(
    private readonly wages: WagesService,
    private readonly reminders: RemindersService,
  ) {}

  @Get('my-work')
  @RequirePermissions('task.execute')
  myWork(@CurrentActor() actor: Actor, @Query(new ZodPipe(monthQuerySchema)) q: MonthQuery) {
    return this.wages.myWork(actor, q.month);
  }

  @Post('my-tasks/:id/wage-seen')
  @RequirePermissions('task.execute')
  wageSeen(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(wageSeenSchema)) body: z.infer<typeof wageSeenSchema>) {
    return this.wages.markSeen(actor, id, body.expectedVersion);
  }

  @Post('my-tasks/:id/problem')
  @RequirePermissions('task.execute')
  problem(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(technicianProblemSchema)) body: TechnicianProblemInput) {
    return this.reminders.problem(actor, id, body.problem);
  }
}

@Controller('cases')
export class CasePeopleController {
  constructor(
    private readonly cases: CasesService,
    private readonly responsibility: ResponsibilityService,
    private readonly wages: WagesService,
  ) {}

  @Get(':id/responsibility')
  @RequirePermissions('case.read')
  periods(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.responsibility.periods(actor, id);
  }

  @Post(':id/transfer')
  @RequirePermissions('case.update')
  transfer(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(caseTransferSchema)) body: CaseTransferInput) {
    return this.cases.transfer(actor, id, body);
  }

  /** Needs wage.manage or wage.report (checked in the service); never available to technicians. */
  @Get(':id/wages')
  @RequirePermissions('case.read')
  wagesOf(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.wages.caseWages(actor, id);
  }
}

@Controller('tasks')
export class TaskWagesController {
  constructor(private readonly wages: WagesService) {}

  @Put(':id/wage')
  @RequirePermissions('wage.manage')
  setWage(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(wageSetSchema)) body: WageSetInput) {
    return this.wages.setWage(actor, id, body);
  }

  @Get(':id/wage-history')
  history(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.wages.history(actor, id);
  }
}

@Controller('reports')
export class PeopleReportsController {
  constructor(
    private readonly wages: WagesService,
    private readonly responsibility: ResponsibilityService,
  ) {}

  @Get('wages')
  @RequirePermissions('wage.report')
  wageReport(@CurrentActor() actor: Actor, @Query(new ZodPipe(monthQuerySchema)) q: MonthQuery) {
    return this.wages.report(actor, q.month);
  }

  /** Excel: one row per technician and one per approved job of the month. */
  @Get('wages/export')
  @RequirePermissions('wage.report')
  async wageExport(@CurrentActor() actor: Actor, @Query(new ZodPipe(monthQuerySchema)) q: MonthQuery) {
    const r = await this.wages.report(actor, q.month);
    const head = [[actor.user.tenantName], [`اجرت پرداختی در برابر اجرت کارشناسی — ${r.label}`], [`زمان تهیه: ${formatJalali(new Date(), { time: true })}`], []];
    const summary = [
      ...head,
      ['تعمیرکار', 'تعداد کار تأییدشده', 'اجرت پرداختی (ریال)', 'اجرت کارشناسی (ریال)', 'تفاوت (ریال)', 'کار بدون اجرت ثبت‌شده'],
      ...r.rows.map((x) => [x.technician.displayName, x.jobs, x.paidRial, x.expertRial, x.differenceRial, x.missingWage]),
      ['جمع', r.totals.jobs, r.totals.paidRial, r.totals.expertRial, r.totals.differenceRial, null],
    ];
    const details = [
      ...head,
      ['تعمیرکار', 'پلاک', 'کار', 'تاریخ تأیید', 'پوشش', 'اجرت پرداختی (ریال)', 'سهم اجرت کارشناسی (ریال)'],
      ...r.details.map((d) => [d.technician, d.plate, d.title, formatJalali(d.approvedAt), COVERAGE_BUCKET_LABELS[d.coverage], d.wageRial, d.expertRial]),
    ];
    const data = writeWorkbook([
      { name: 'خلاصه', rows: summary },
      { name: 'ریز کارها', rows: details },
    ]);
    return new StreamableFile(Buffer.from(data), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="manage-wages-${r.month}.xlsx"`,
    });
  }

  @Get('responsibility')
  @RequirePermissions('report.manager')
  responsibilityReport(@CurrentActor() actor: Actor, @Query(new ZodPipe(monthQuerySchema)) q: MonthQuery) {
    return this.responsibility.report(actor, q.month);
  }
}

/** Owner only (checked in the service, like the rest of /access). */
@Controller('access')
export class OwnerControlsController {
  constructor(private readonly owner: OwnerControlsService) {}

  @Get('system-admins')
  admins(@CurrentActor() actor: Actor) {
    return this.owner.admins(actor);
  }

  @Put('users/:id/staff-admin')
  setStaffAdmin(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(staffAdminSchema)) body: StaffAdminInput) {
    return this.owner.setStaffAdmin(actor, id, body);
  }

  @Get('admin-actions')
  actions(@CurrentActor() actor: Actor, @Query(new ZodPipe(monthQuerySchema)) q: MonthQuery) {
    return this.owner.adminActions(actor, q.month);
  }
}
