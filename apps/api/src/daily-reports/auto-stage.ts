import { and, desc, eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { DailyReportKind } from '@manage/shared';
import { newId } from '../common/ids';
import type { DbOrTx } from '../db/database';
import { dailyReportFiles, dailyReportImports } from '../db/schema';
import { PARSER_VERSION } from './report-rows';
import { detectFormat } from './spreadsheet-formats';

const FILE_TTL_MS = 7 * 86_400_000;

export type AutoStageResult =
  | { outcome: 'staged'; importId: string }
  | { outcome: 'waiting'; importId: string }
  | { outcome: 'unchanged'; importId: string }
  | { outcome: 'bad_format'; format: string };

/**
 * A report file fetched by Manage Pulse enters the SAME daily-report pipeline as a manual upload
 * (owner, 2026-11-23): an import in status `uploaded` with `diagnostics.source = 'pulse'`. The API
 * process parses it into a preview (DailyReportsService polls these every minute) and a person
 * confirms it exactly as before. Nothing is applied automatically.
 *
 * - the same file already waiting for confirmation is not staged twice;
 * - a file identical to the last applied one is skipped (stock did not change).
 */
export async function stageAutomaticReport(
  db: DbOrTx,
  args: { tenantId: string; isTest: boolean; kind: DailyReportKind; fileName: string; body: Buffer; uploadedBy: string },
): Promise<AutoStageResult> {
  const format = detectFormat(args.body);
  const allowed = args.kind === 'stock' ? ['xlsx', 'html_table'] : ['spreadsheetml'];
  if (!allowed.includes(format)) return { outcome: 'bad_format', format };
  const hash = createHash('sha256').update(args.body).digest('hex');
  const [waiting] = await db.select({ id: dailyReportImports.id }).from(dailyReportImports)
    .where(and(eq(dailyReportImports.tenantId, args.tenantId), eq(dailyReportImports.kind, args.kind), eq(dailyReportImports.fileSha256, hash), inArray(dailyReportImports.status, ['uploaded', 'parsing', 'preview'])))
    .limit(1);
  if (waiting) return { outcome: 'waiting', importId: waiting.id };
  const [lastApplied] = await db.select({ id: dailyReportImports.id, sha: dailyReportImports.fileSha256 }).from(dailyReportImports)
    .where(and(eq(dailyReportImports.tenantId, args.tenantId), eq(dailyReportImports.kind, args.kind), eq(dailyReportImports.status, 'applied')))
    .orderBy(desc(dailyReportImports.appliedAt)).limit(1);
  if (lastApplied?.sha === hash) return { outcome: 'unchanged', importId: lastApplied.id };
  const id = newId();
  await db.insert(dailyReportImports).values({
    id,
    tenantId: args.tenantId,
    kind: args.kind,
    fileName: args.fileName,
    fileSize: args.body.length,
    fileSha256: hash,
    format,
    parserVersion: PARSER_VERSION,
    diagnostics: { source: 'pulse' },
    uploadedBy: args.uploadedBy,
    isTest: args.isTest,
  });
  await db.insert(dailyReportFiles).values({ importId: id, data: args.body, expiresAt: new Date(Date.now() + FILE_TTL_MS) });
  return { outcome: 'staged', importId: id };
}
