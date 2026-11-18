import { Controller, Get, Inject } from '@nestjs/common';
import { RELEASE_LINE } from '@manage/shared';
import { eq, sql } from 'drizzle-orm';
import { Public } from '../auth/decorators';
import { APP_CONFIG, type AppConfig } from '../config';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { appVersions } from '../db/schema';
import { runningCommit } from '../releases/releases.service';

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
    let version: string | null = null;
    const commit = runningCommit();
    if (db === 'ok' && commit) {
      try {
        version = (await this.handle.db.select({ v: appVersions.version }).from(appVersions).where(eq(appVersions.commit, commit)))[0]?.v ?? null;
      } catch {
        version = null; // before migration 0030
      }
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      dbDriver: this.handle.driver,
      environment: this.cfg.APP_ENV,
      nodeId: this.cfg.NODE_ID,
      // Confirmed number of the running commit (null until the release script confirms it).
      version,
      line: `v${RELEASE_LINE.major}.${RELEASE_LINE.minor}`,
      commit: process.env.GIT_COMMIT ?? null,
    };
  }
}
