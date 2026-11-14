import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { staffExpertCodeSchema, technicianAccountSchema, technicianActiveSchema, technicianPinSchema, technicianSignOutSchema, type StaffExpertCodeInput, type TechnicianAccountInput, type TechnicianActiveInput, type TechnicianPinInput } from '@manage/shared';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import type { Actor } from './auth.types';
import { CurrentActor, RequirePermissions } from './decorators';
import { TechniciansService } from './technicians.service';

@Controller('staff/technicians')
export class TechniciansController {
  constructor(private readonly technicians: TechniciansService) {}

  @RequirePermissions('user.manage') @Get()
  list(@CurrentActor() actor: Actor) {
    return this.technicians.list(actor);
  }

  @RequirePermissions('user.manage') @Post() @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(technicianAccountSchema)) body: TechnicianAccountInput) {
    return this.technicians.create(actor, body);
  }

  @RequirePermissions('user.manage') @Put(':id/pin') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  resetPin(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(technicianPinSchema)) body: TechnicianPinInput) {
    return this.technicians.resetPin(actor, id, body, body.reason);
  }

  @RequirePermissions('user.manage') @Put(':id/expert-code') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  setExpertCode(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(staffExpertCodeSchema)) body: StaffExpertCodeInput) {
    return this.technicians.setExpertCode(actor, id, body.personnelCode, body.reason);
  }

  @RequirePermissions('user.manage') @Post(':id/sign-out')
  signOut(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(technicianSignOutSchema)) body: { reason?: string }) {
    return this.technicians.signOutEverywhere(actor, id, body.reason);
  }

  @RequirePermissions('user.manage') @Put(':id/active')
  setActive(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(technicianActiveSchema)) body: TechnicianActiveInput) {
    return this.technicians.setActive(actor, id, body.active, body.reason);
  }
}
