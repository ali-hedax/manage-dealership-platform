import { Module } from '@nestjs/common';
import { AccidentModule } from '../accident/accident.module';
import {
  CasePeopleController,
  OwnerControlsController,
  PeopleReportsController,
  RemindersController,
  TaskWagesController,
  TechnicianWorkController,
} from './people.controllers';
import { OwnerControlsService } from './owner-controls.service';
import { RemindersService } from './reminders.service';
import { ResponsibilityService } from './responsibility.service';
import { WagesService } from './wages.service';

/** Phase 3 of the role-based plan: reminders, technician wages and monthly work, case responsibility, owner controls. */
@Module({
  imports: [AccidentModule],
  controllers: [RemindersController, TechnicianWorkController, CasePeopleController, TaskWagesController, PeopleReportsController, OwnerControlsController],
  providers: [RemindersService, WagesService, ResponsibilityService, OwnerControlsService],
  exports: [RemindersService],
})
export class PeopleModule {}
