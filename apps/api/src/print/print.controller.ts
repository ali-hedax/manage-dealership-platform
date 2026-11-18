import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { DESK_FILTERS, type DeskFilter } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { PrintService } from './print.service';

/** Printable A4 checklists; read-only (owner, 2026-11-18). */
@Controller('print')
export class PrintController {
  constructor(private readonly print: PrintService) {}

  /** «چاپ لیست برداشت قطعات»: ?scope=all adds the lines that are not picked, greyed. */
  @Get('cases/:id/picking.pdf')
  @RequirePermissions('case.read', 'stock.read')
  async picking(@CurrentActor() actor: Actor, @IdParam() id: string, @Query('scope') scope?: string) {
    const r = await this.print.picking(actor, id, scope === 'all' ? 'all' : 'pick');
    // Opened in the browser's PDF viewer for printing (inline), with a stable file name.
    return new StreamableFile(r.data, { type: 'application/pdf', disposition: `inline; filename="${r.fileName}"` });
  }

  /** «چاپ چک‌لیست بازدید خودروها»: every active accident vehicle in the dealership, or one desk filter. */
  @Get('inspection.pdf')
  @RequirePermissions('case.read')
  async inspection(@CurrentActor() actor: Actor, @Query('filter') filter?: string) {
    const f = (DESK_FILTERS as readonly string[]).includes(filter ?? '') ? (filter as DeskFilter) : 'all';
    const r = await this.print.inspection(actor, f);
    return new StreamableFile(r.data, { type: 'application/pdf', disposition: `inline; filename="${r.fileName}"` });
  }
}
