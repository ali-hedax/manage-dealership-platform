import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { technicianAccountSchema, technicianPinSchema, type TechnicianAccountInput, type TechnicianPinInput } from '@manage/shared';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import type { Actor } from './auth.types';
import { CurrentActor, RequirePermissions } from './decorators';
import { TechniciansService } from './technicians.service';

const activeSchema = z.object({ active: z.boolean() });

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
    return this.technicians.resetPin(actor, id, body.pin);
  }

  @RequirePermissions('user.manage') @Put(':id/active')
  setActive(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(activeSchema)) body: z.infer<typeof activeSchema>) {
    return this.technicians.setActive(actor, id, body.active);
  }
}
