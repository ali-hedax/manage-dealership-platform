import { Module } from '@nestjs/common';
import { AssessmentsController } from '../assessments/assessments.controller';
import { AssessmentsService } from '../assessments/assessments.service';
import { BlockersService } from '../blockers/blockers.service';
import { CasesService } from '../cases/cases.service';
import { CompletionController } from '../completion/completion.controller';
import { CompletionService } from '../completion/completion.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { FinanceController } from '../finance/finance.controller';
import { FinanceService } from '../finance/finance.service';
import { PartsController } from '../parts/parts.controller';
import { PartsService } from '../parts/parts.service';
import { DiscrepanciesController } from '../discrepancies/discrepancies.controller';
import { DiscrepanciesService } from '../discrepancies/discrepancies.service';
import { ReportsController } from '../reports/reports.controller';
import { ReportsService } from '../reports/reports.service';
import { TasksService } from '../tasks/tasks.service';
import { VehicleImportController } from '../vehicle-import/vehicle-import.controller';
import { VehicleImportService } from '../vehicle-import/vehicle-import.service';
import {
  BlockersController,
  CasesController,
  DashboardController,
  TasksController,
} from './accident.controllers';

/** Phase-1 module: accident repair cases, assessments, parts, finance gate, repair activities, blockers, QC and delivery, dashboard. */
@Module({
  controllers: [
    CasesController,
    TasksController,
    BlockersController,
    DashboardController,
    AssessmentsController,
    PartsController,
    FinanceController,
    CompletionController,
    VehicleImportController,
    ReportsController,
    DiscrepanciesController,
  ],
  providers: [
    CasesService,
    TasksService,
    BlockersService,
    DashboardService,
    AssessmentsService,
    PartsService,
    FinanceService,
    CompletionService,
    VehicleImportService,
    ReportsService,
    DiscrepanciesService,
  ],
  exports: [CasesService, TasksService, BlockersService, AssessmentsService, PartsService, FinanceService, CompletionService],
})
export class AccidentModule {}
