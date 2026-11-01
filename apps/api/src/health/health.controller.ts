import { Controller, Get, Inject } from '@nestjs/common';
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
      version: process.env.npm_package_version ?? '0.1.0',
      commit: process.env.GIT_COMMIT ?? null,
    };
  }
}
