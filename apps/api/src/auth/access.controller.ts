import {Body,Controller,Get,Header,Param,Put} from '@nestjs/common';
import {accessUpdateSchema,templateUpdateSchema,type AccessUpdate,type TemplateUpdate,type Role} from '@manage/shared';
import {CurrentActor} from './decorators';
import type {Actor} from './auth.types';
import {IdParam} from '../common/params';
import {ZodPipe} from '../common/zod.pipe';
import {AccessService} from './access.service';

@Controller('access')
export class AccessController {
 constructor(private readonly access:AccessService){}
 @Get() @Header('Cache-Control','no-store')
 catalog(@CurrentActor() actor:Actor){return this.access.catalog(actor);}
 @Get('presets') @Header('Cache-Control','no-store')
 presets(@CurrentActor() actor:Actor){return this.access.presets(actor);}
 @Put('users/:id')
 updateUser(@CurrentActor() actor:Actor,@IdParam() id:string,@Body(new ZodPipe(accessUpdateSchema)) input:AccessUpdate){return this.access.updateUser(actor,id,input);}
 @Put('templates/:role')
 updateTemplate(@CurrentActor() actor:Actor,@Param('role') role:Role,@Body(new ZodPipe(templateUpdateSchema)) input:TemplateUpdate){return this.access.updateTemplate(actor,role,input);}
}
