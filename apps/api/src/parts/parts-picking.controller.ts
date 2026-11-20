import { Body, Controller, Get, Header, Post, Query, StreamableFile } from '@nestjs/common';
import { closePickingBatchSchema, createPickingBatchSchema, type ClosePickingBatch, type CreatePickingBatch } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { PartsPickingService } from './parts-picking.service';

@Controller('parts/picking-batches')
@RequirePermissions('case.read', 'part.manage', 'stock.read')
export class PartsPickingController {
  constructor(private readonly picking: PartsPickingService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query('history') history?: string) {
    return this.picking.list(actor, history === '1');
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(createPickingBatchSchema)) input: CreatePickingBatch) {
    return this.picking.create(actor, input);
  }

  @Post(':id/close')
  close(@CurrentActor() actor: Actor, @IdParam() id: string, @Body(new ZodPipe(closePickingBatchSchema)) input: ClosePickingBatch) {
    return this.picking.close(actor, id, input);
  }

  @Get(':id/picking.pdf')
  @Header('Cache-Control', 'private, no-store')
  async pdf(@CurrentActor() actor: Actor, @IdParam() id: string) {
    const pdf = await this.picking.pdf(actor, id);
    return new StreamableFile(pdf.data, { type: 'application/pdf', disposition: `inline; filename="${pdf.fileName}"` });
  }
}
