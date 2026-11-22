import { Module } from '@nestjs/common';
import { SpecialAidController } from './special-aid.controller';
import { SpecialAidService } from './special-aid.service';

/** «پیگیری امداد ویژه»: dossiers per VIN, contacts, part states and supply follow-up (spec section 25). */
@Module({
  controllers: [SpecialAidController],
  providers: [SpecialAidService],
  exports: [SpecialAidService],
})
export class SpecialAidModule {}
