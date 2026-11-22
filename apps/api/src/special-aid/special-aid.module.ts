import { Module } from '@nestjs/common';
import { SpecialAidController } from './special-aid.controller';
import { SpecialAidService } from './special-aid.service';
import { ReportCenterController } from './report-center.controller';
import { ReportCenterService } from './report-center.service';

/** «پیگیری امداد ویژه»: dossiers per VIN, contacts, part states and supply follow-up (spec section 25). */
@Module({
  controllers: [SpecialAidController, ReportCenterController],
  providers: [SpecialAidService, ReportCenterService],
  exports: [SpecialAidService],
})
export class SpecialAidModule {}
