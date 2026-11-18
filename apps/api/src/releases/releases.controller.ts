import { Body, Controller, Get, Post } from '@nestjs/common';
import { releaseAckSchema, type ReleaseAckInput } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CurrentActor } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ReleasesService } from './releases.service';

/** Version indicator, update announcement and release notes for every signed-in person. */
@Controller('releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get('current')
  current(@CurrentActor() actor: Actor) {
    return this.releases.current(actor);
  }

  @Get()
  history() {
    return this.releases.history();
  }

  @Post('ack')
  ack(@CurrentActor() actor: Actor, @Body(new ZodPipe(releaseAckSchema)) body: ReleaseAckInput) {
    return this.releases.acknowledge(actor, body.version);
  }
}
