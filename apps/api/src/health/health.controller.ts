import { Controller, Get, Inject } from '@nestjs/common';
import { CURRENT_RELEASE } from '@manage/shared';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/decorators';
import { APP_CONFIG, type AppConfig } from '../config';
import { DATABASE, type DatabaseHandle } from '../db/database';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Public()
  @Get()
  async health() {
    let db = 'ok';
    try {
      await this.handle.db.execute(sql`select 1`);
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      dbDriver: this.handle.driver,
      environment: this.cfg.APP_ENV,
      nodeId: this.cfg.NODE_ID,
      // The released Manage version compiled into this image (packages/shared/src/releases.ts).
      version: CURRENT_RELEASE.version,
      commit: process.env.GIT_COMMIT ?? null,
    };
  }
}
