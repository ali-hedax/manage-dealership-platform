import { Module } from '@nestjs/common';
import { AssessmentsController } from '../assessments/assessments.controller';
import { AssessmentsService } from '../assessments/assessments.service';
import { BlockersService } from '../blockers/blockers.service';
import { CasesService } from '../cases/cases.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { TasksService } from '../tasks/tasks.service';
import {
  BlockersController,
  CasesController,
  DashboardController,
  TasksController,
} from './accident.controllers';

/** Phase-1 module: accident repair cases, assessments, repair activities, blockers, dashboard. */
@Module({
  controllers: [CasesController, TasksController, BlockersController, DashboardController, AssessmentsController],
  providers: [CasesService, TasksService, BlockersService, DashboardService, AssessmentsService],
  exports: [CasesService, TasksService, BlockersService],
})
export class AccidentModule {}
