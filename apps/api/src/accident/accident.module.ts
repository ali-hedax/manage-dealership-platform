import { PartsPickingController } from '../parts/parts-picking.controller';
import { PartsPickingService } from '../parts/parts-picking.service';
import { CaseDocumentsController } from '../cases/case-documents.controller';
import { CaseDeletionController } from '../cases/case-deletion.controller';
import { CaseDeletionService } from '../cases/case-deletion.service';
import { PrintController } from '../print/print.controller';
import { PrintService } from '../print/print.service';
import { ReleasesController } from '../releases/releases.controller';
import { ReleasesService } from '../releases/releases.service';
import { Module } from '@nestjs/common';
import { DailyReportsModule } from '../daily-reports/daily-reports.module';
import { AlertsController } from '../alerts/alerts.controller';
import { AlertsService } from '../alerts/alerts.service';
import { ControlRoomController } from '../control-room/control-room.controller';
import { ControlRoomService } from '../control-room/control-room.service';
import { DeskController } from '../desk/desk.controller';
import { DeskService } from '../desk/desk.service';
import { WorkshopController } from '../workshop/workshop.controller';
import { WorkshopService } from '../workshop/workshop.service';
import { ReferenceDataController } from '../reference-data/reference-data.controller';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { AssessmentsController } from '../assessments/assessments.controller';
import { AssessmentsService } from '../assessments/assessments.service';
import { BlockersService } from '../blockers/blockers.service';
import { CasesService } from '../cases/cases.service';
import { CompletionController } from '../completion/completion.controller';
import { CompletionService } from '../completion/completion.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { FinanceController } from '../finance/finance.controller';
import { FinanceService } from '../finance/finance.service';
import { PartsOperationsController } from '../parts/parts-operations.controller';
import { PartsOperationsService } from '../parts/parts-operations.service';
import { PartsController } from '../parts/parts.controller';
import { PartsWorkbenchService } from '../parts/parts-workbench.service';
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
  imports: [DailyReportsModule],
  controllers: [
    CaseDocumentsController,
    CaseDeletionController,
    PrintController,
    ReleasesController,
    AlertsController,
    DeskController,
    ControlRoomController,
    WorkshopController,
    ReferenceDataController,
    CasesController,
    TasksController,
    BlockersController,
    DashboardController,
    AssessmentsController,
    PartsController,
    PartsPickingController,
    PartsOperationsController,
    FinanceController,
    CompletionController,
    VehicleImportController,
    ReportsController,
    DiscrepanciesController,
  ],
  providers: [
    CaseDeletionService,
    PrintService,
    ReleasesService,
    AlertsService,
    DeskService,
    ControlRoomService,
    WorkshopService,
    ReferenceDataService,
    CasesService,
    TasksService,
    BlockersService,
    DashboardService,
    AssessmentsService,
    PartsService,
    PartsPickingService,
    PartsWorkbenchService,
    PartsOperationsService,
    FinanceService,
    CompletionService,
    VehicleImportService,
    ReportsService,
    DiscrepanciesService,
  ],
  exports: [PartsOperationsService, CasesService, TasksService, BlockersService, AssessmentsService, PartsService, FinanceService, CompletionService],
})
export class AccidentModule {}
