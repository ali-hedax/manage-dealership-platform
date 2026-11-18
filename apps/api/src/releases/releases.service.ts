import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { RELEASE_LINE, nextVersion, versionNotes, type ReleaseHistoryEntry, type VersionInfo } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest } from '../common/errors';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { appVersions, users } from '../db/schema';

/** Short commit of the running image (12 characters), from the GIT_COMMIT build argument. */
export const runningCommit = () => (process.env.GIT_COMMIT ?? '').trim().slice(0, 12).toLowerCase() || null;
const LINE = `v${RELEASE_LINE.major}.${RELEASE_LINE.minor}`;

type VersionRow = typeof appVersions.$inferSelect;

/**
 * Confirmation of a release (also used by dist/scripts/confirm-release.js): the
 * commit keeps an existing number, or gets the next patch of the release line.
 */
export async function confirmVersion(db: DatabaseHandle['db'], commit: string, now = new Date()): Promise<{ version: string; created: boolean; noteKeys: string[] }> {
  const key = commit.trim().slice(0, 12).toLowerCase();
  if (!/^[0-9a-f]{7,12}$/.test(key)) throw badRequest('RELEASE_COMMIT_INVALID', 'شناسهٔ commit نامعتبر است');
  for (let attempt = 0; attempt < 3; attempt++) {
    const [known] = await db.select().from(appVersions).where(eq(appVersions.commit, key));
    if (known) return { version: known.version, created: false, noteKeys: known.noteKeys };
    const next = nextVersion(await db.select().from(appVersions));
    // Two confirmations at once: the unique number and commit let only one win; the other re-reads.
    const inserted = await db
      .insert(appVersions)
      .values({ version: next.version, major: next.major, minor: next.minor, patch: next.patch, commit: key, noteKeys: next.noteKeys, confirmedAt: now })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) return { version: next.version, created: true, noteKeys: next.noteKeys };
  }
  throw badRequest('RELEASE_CONFIRM_CONFLICT', 'ثبت شمارهٔ نسخه هم‌زمان انجام شد؛ دوباره اجرا کنید');
}

/**
 * Running version and release history (owner, 2026-11-18). A version number
 * belongs to a commit and is given only by `confirm` — run by the release script
 * after the new release passed its health checks (dist/scripts/confirm-release.js).
 * Confirming the same commit again returns its number; a failed attempt that was
 * rolled back before confirmation never gets one; a rollback to an older image
 * shows the number that commit already had.
 */
@Injectable()
export class ReleasesService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Releases');
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    // Development and browser tests only: number the running build at start. Production never does this.
    if (process.env.RELEASE_AUTOCONFIRM === 'true' && process.env.APP_ENV !== 'production' && runningCommit()) {
      await this.confirm(runningCommit()!).catch((e) => this.logger.warn(`Release not confirmed: ${(e as Error).message}`));
    }
  }

  /** Gives `commit` its number (once) and the change notes no earlier version carried. */
  async confirm(commit: string, now = new Date()) {
    const r = await confirmVersion(this.handle.db, commit, now);
    if (r.created) this.logger.log(`Manage ${r.version} confirmed for ${commit}`);
    return r;
  }

  private async running(): Promise<VersionRow | null> {
    const commit = runningCommit();
    if (!commit) return null;
    try {
      const [row] = await this.handle.db.select().from(appVersions).where(eq(appVersions.commit, commit));
      return row ?? null;
    } catch {
      return null; // before migration 0030
    }
  }

  async current(actor: Actor): Promise<VersionInfo> {
    const row = await this.running();
    const [u] = await this.handle.db.select({ seen: users.releaseSeen }).from(users).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId)));
    return {
      version: row?.version ?? null,
      line: LINE,
      commit: runningCommit(),
      deployedAt: row?.confirmedAt.toISOString() ?? null,
      summary: row ? versionNotes(row.noteKeys).summary : '',
      seen: !row || u?.seen === row.version,
    };
  }

  /** Version label for the health check: the confirmed number, or null before confirmation. */
  async runningVersion(): Promise<string | null> {
    return (await this.running())?.version ?? null;
  }

  /** Every confirmed version, newest first, with its complete Persian change list. */
  async history(): Promise<ReleaseHistoryEntry[]> {
    const commit = runningCommit();
    let rows: VersionRow[] = [];
    try {
      rows = await this.handle.db.select().from(appVersions).orderBy(desc(appVersions.major), desc(appVersions.minor), desc(appVersions.patch));
    } catch {
      rows = [];
    }
    return rows.map((r) => ({ version: r.version, commit: r.commit, deployedAt: r.confirmedAt.toISOString(), noteKeys: r.noteKeys, running: r.commit === commit, ...versionNotes(r.noteKeys) }));
  }

  /** «متوجه شدم»: the announcement of the running version is not shown again to this person. */
  async acknowledge(actor: Actor, version: string): Promise<VersionInfo> {
    const row = await this.running();
    if (!row || version !== row.version) throw badRequest('RELEASE_NOT_CURRENT', 'این نسخه، نسخهٔ در حال اجرا نیست؛ صفحه را دوباره بارگذاری کنید');
    await this.handle.db.transaction(async (tx) => {
      const [u] = await tx.select({ seen: users.releaseSeen }).from(users).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId))).for('update');
      if (u?.seen === version) return;
      await tx.update(users).set({ releaseSeen: version }).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId)));
      await this.audit.record(tx, actor, { entityType: 'user', entityId: actor.user.id, action: 'user.release_seen', before: { releaseSeen: u?.seen ?? null }, after: { releaseSeen: version } });
    });
    return this.current(actor);
  }
}
