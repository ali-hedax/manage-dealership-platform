import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { CURRENT_RELEASE, RELEASES, type ReleaseHistoryEntry, type VersionInfo } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest } from '../common/errors';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { appReleases, users } from '../db/schema';

const shortCommit = () => (process.env.GIT_COMMIT ?? '').trim().slice(0, 12) || null;

/**
 * Running version and release history (owner, 2026-11-18). The version is the one
 * compiled into this build; the first start of a version on this installation is
 * its deployment time. A restart or a repeated deployment of the same build only
 * moves last_started_at; a rollback shows the older version automatically.
 */
@Injectable()
export class ReleasesService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Releases');
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.handle.db
        .insert(appReleases)
        .values({ version: CURRENT_RELEASE.version, commit: shortCommit() })
        .onConflictDoUpdate({ target: appReleases.version, set: { lastStartedAt: sql`now()`, commit: sql`coalesce(excluded.commit, ${appReleases.commit})` } });
      this.logger.log(`Manage ${CURRENT_RELEASE.version} started`);
    } catch (e) {
      // Before migration 0028 the table does not exist; the application still starts.
      this.logger.warn(`Release record not written: ${(e as Error).message}`);
    }
  }

  private async records(versions: string[]) {
    try {
      const rows = await this.handle.db.select().from(appReleases).where(inArray(appReleases.version, versions));
      return new Map(rows.map((r) => [r.version, r]));
    } catch {
      return new Map<string, typeof appReleases.$inferSelect>();
    }
  }

  async current(actor: Actor): Promise<VersionInfo> {
    const rec = (await this.records([CURRENT_RELEASE.version])).get(CURRENT_RELEASE.version);
    const [u] = await this.handle.db.select({ seen: users.releaseSeen }).from(users).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId)));
    return { version: CURRENT_RELEASE.version, commit: rec?.commit ?? shortCommit(), deployedAt: rec?.firstStartedAt.toISOString() ?? null, seen: u?.seen === CURRENT_RELEASE.version };
  }

  /** Every release up to the running one, newest first, with its full Persian change list. */
  async history(): Promise<ReleaseHistoryEntry[]> {
    const recs = await this.records(RELEASES.map((r) => r.version));
    return RELEASES.map((r) => ({ ...r, commit: recs.get(r.version)?.commit ?? (r.version === CURRENT_RELEASE.version ? shortCommit() : null), deployedAt: recs.get(r.version)?.firstStartedAt.toISOString() ?? null }));
  }

  /** «متوجه شدم»: the announcement of the running version is not shown again to this person. */
  async acknowledge(actor: Actor, version: string): Promise<VersionInfo> {
    if (version !== CURRENT_RELEASE.version) throw badRequest('RELEASE_NOT_CURRENT', 'این نسخه، نسخهٔ در حال اجرا نیست؛ صفحه را دوباره بارگذاری کنید');
    await this.handle.db.transaction(async (tx) => {
      const [u] = await tx.select({ seen: users.releaseSeen }).from(users).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId))).for('update');
      if (u?.seen === version) return;
      await tx.update(users).set({ releaseSeen: version }).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId)));
      await this.audit.record(tx, actor, { entityType: 'user', entityId: actor.user.id, action: 'user.release_seen', before: { releaseSeen: u?.seen ?? null }, after: { releaseSeen: version } });
    });
    return this.current(actor);
  }
}
