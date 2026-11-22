import { Module } from '@nestjs/common';
import { DailyReportsController } from './daily-reports.controller';
import { DailyReportsService } from './daily-reports.service';
import { DailyTasksService } from './daily-tasks.service';
import { EmdadService } from './emdad.service';
import { StockService } from './stock.service';
import { SpecialAidModule } from '../special-aid/special-aid.module';

/** Daily stock and Emdad Vijeh reports, Manage stock reservations and the 11:00 reminders. */
@Module({
  imports: [SpecialAidModule],
  controllers: [DailyReportsController],
  providers: [DailyReportsService, DailyTasksService, EmdadService, StockService],
  exports: [DailyTasksService, StockService, EmdadService],
})
export class DailyReportsModule {}
