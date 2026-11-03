import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { quoteDecisionSchema, quoteSchema, saveCalendarSchema, stationSchema, taskActionSchema } from '@manage/shared';
import { z } from 'zod';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import type { Actor } from '../auth/auth.types';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { TasksService } from '../tasks/tasks.service';
import { WorkshopService } from './workshop.service';

@Controller('workshop')
export class WorkshopController {
  constructor(private readonly workshop:WorkshopService,private readonly tasks:TasksService){}
  @Get('calendar') @RequirePermissions('workshop.read') calendar(@CurrentActor() a:Actor){return this.workshop.calendars(a);}
  @Post('calendar') @RequirePermissions('calendar.manage') saveCalendar(@CurrentActor() a:Actor,@Body(new ZodPipe(saveCalendarSchema)) b:z.infer<typeof saveCalendarSchema>){return this.workshop.saveCalendar(a,b);}
  @Get('stations') @RequirePermissions('workshop.read') stations(@CurrentActor() a:Actor){return this.workshop.stations(a);}
  @Post('stations') @RequirePermissions('workshop.manage') createStation(@CurrentActor() a:Actor,@Body(new ZodPipe(stationSchema)) b:z.infer<typeof stationSchema>){return this.workshop.saveStation(a,b);}
  @Patch('stations/:id') @RequirePermissions('workshop.manage') updateStation(@CurrentActor() a:Actor,@IdParam() id:string,@Body(new ZodPipe(stationSchema)) b:z.infer<typeof stationSchema>){return this.workshop.saveStation(a,b,id);}
  @Post('setup-trades') @RequirePermissions('workshop.manage') setup(@CurrentActor() a:Actor){return this.workshop.setupTrades(a);}
  @Get('staff') @RequirePermissions('task.manage') staff(@CurrentActor() a:Actor){return this.workshop.staff(a);}
  @Get('overview') @RequirePermissions('workshop.read') overview(@CurrentActor() a:Actor){return this.workshop.overview(a);}
  @Get('my-tasks') @RequirePermissions('task.execute') mine(@CurrentActor() a:Actor){return this.workshop.taskList(a,true);}
  @Post('my-tasks/:id/actions') @RequirePermissions('task.execute') act(@CurrentActor() a:Actor,@IdParam() id:string,@Body(new ZodPipe(taskActionSchema)) b:z.infer<typeof taskActionSchema>){return this.tasks.executeOwn(a,id,b);}
  @Get('quotes') @RequirePermissions('workshop.read') quotes(@CurrentActor() a:Actor,@Query(new ZodPipe(z.object({caseId:z.uuid().optional()}))) query:{caseId?:string}){return this.workshop.quotes(a,query.caseId);}
  @Post('parts/:id/quotes') @RequirePermissions('part.quote') propose(@CurrentActor() a:Actor,@IdParam() id:string,@Body(new ZodPipe(quoteSchema)) b:z.infer<typeof quoteSchema>){return this.workshop.propose(a,id,b);}
  @Post('quotes/:id/decision') @RequirePermissions('part.price_authorize') decide(@CurrentActor() a:Actor,@IdParam() id:string,@Body(new ZodPipe(quoteDecisionSchema)) b:z.infer<typeof quoteDecisionSchema>){return this.workshop.decide(a,id,b);}
}
