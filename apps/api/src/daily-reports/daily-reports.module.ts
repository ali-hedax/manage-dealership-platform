import { Module } from '@nestjs/common';
import { DailyReportsController } from './daily-reports.controller';
import { DailyReportsService } from './daily-reports.service';
import { DailyTasksService } from './daily-tasks.service';
import { EmdadService } from './emdad.service';
import { StockService } from './stock.service';

/** Daily stock and Emdad Vijeh reports, Manage stock reservations and the 11:00 reminders. */
@Module({
  controllers: [DailyReportsController],
  providers: [DailyReportsService, DailyTasksService, EmdadService, StockService],
  exports: [DailyTasksService, StockService],
})
export class DailyReportsModule {}
