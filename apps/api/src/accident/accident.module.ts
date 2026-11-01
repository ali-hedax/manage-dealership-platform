import { Module } from '@nestjs/common';
import { AssessmentsController } from '../assessments/assessments.controller';
import { AssessmentsService } from '../assessments/assessments.service';
import { BlockersService } from '../blockers/blockers.service';
import { CasesService } from '../cases/cases.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { FinanceController } from '../finance/finance.controller';
import { FinanceService } from '../finance/finance.service';
import { PartsController } from '../parts/parts.controller';
import { PartsService } from '../parts/parts.service';
import { TasksService } from '../tasks/tasks.service';
import {
  BlockersController,
  CasesController,
  DashboardController,
  TasksController,
} from './accident.controllers';

/** Phase-1 module: accident repair cases, assessments, parts, finance gate, repair activities, blockers, dashboard. */
@Module({
  controllers: [
    CasesController,
    TasksController,
    BlockersController,
    DashboardController,
    AssessmentsController,
    PartsController,
    FinanceController,
  ],
  providers: [
    CasesService,
    TasksService,
    BlockersService,
    DashboardService,
    AssessmentsService,
    PartsService,
    FinanceService,
  ],
  exports: [CasesService, TasksService, BlockersService, AssessmentsService, PartsService, FinanceService],
})
export class AccidentModule {}
