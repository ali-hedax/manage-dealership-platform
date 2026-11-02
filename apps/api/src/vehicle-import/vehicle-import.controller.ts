import { Body, Controller, Get, Post, StreamableFile } from '@nestjs/common';
import { vehicleImportSchema, type VehicleImportInput } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { sampleWorkbook } from './sample';
import { VehicleImportService } from './vehicle-import.service';

@Controller()
export class VehicleImportController {
  constructor(private readonly imports: VehicleImportService) {}

  @Post('vehicle-imports')
  @RequirePermissions('case.import')
  preview(@CurrentActor() actor: Actor, @Body(new ZodPipe(vehicleImportSchema)) body: VehicleImportInput) {
    return this.imports.preview(actor, body);
  }

  @Post('vehicle-imports/:id/apply')
  @RequirePermissions('case.import')
  apply(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.imports.apply(actor, id);
  }

  @Get('vehicle-imports')
  @RequirePermissions('case.import')
  list(@CurrentActor() actor: Actor) {
    return this.imports.list(actor);
  }

  /** Synthetic sample with the intake layout (no real data). Declared before :id. */
  @Get('vehicle-imports/sample')
  @RequirePermissions('case.import')
  sample() {
    return new StreamableFile(Buffer.from(sampleWorkbook()), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="vehicle-import-sample.xlsx"',
    });
  }

  @Get('vehicle-imports/:id')
  @RequirePermissions('case.import')
  get(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.imports.get(actor, id);
  }

  @Get('vehicle-imports/:id/report')
  @RequirePermissions('case.import')
  async report(@CurrentActor() actor: Actor, @IdParam() id: string) {
    const { fileName, data } = await this.imports.report(actor, id);
    return new StreamableFile(Buffer.from(data), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('cases/:id/provenance')
  @RequirePermissions('case.read')
  provenance(@CurrentActor() actor: Actor, @IdParam() id: string) {
    return this.imports.provenance(actor, id);
  }
}
