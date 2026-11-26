import { Module } from '@nestjs/common';
import { StoppagesController } from './stoppages.controller';
import { StoppagesService } from './stoppages.service';

/** Official stoppage report «گزارش توقف خودرو» and the stopped-vehicle cases (reconstruction step 1A). */
@Module({ controllers: [StoppagesController], providers: [StoppagesService], exports: [StoppagesService] })
export class StoppagesModule {}
