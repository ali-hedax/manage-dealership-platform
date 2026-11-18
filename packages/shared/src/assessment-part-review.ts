/**
 * Internal technical-code review for smart manual assessments.
 * Never confuse this with an insurer's/OEM's official financial authorization.
 *
 * Pure state transitions intentionally do not persist data or alter the existing
 * supply lifecycle. API integration must enforce RBAC, tenant, audit and version.
 */
export type TechnicalReviewStatus = 'pending' | 'accepted' | 'returned';
export type TechnicalReviewAction = 'accept' | 'return' | 'reset';

export interface TechnicalReviewLine {
  itemId: string;
  assessmentId: string;
  partNumber: string | null;
  description: string;
  action: 'replace' | 'repair';
  status: TechnicalReviewStatus;
  /** Required when returned; informational, NOT an authorization document. */
  reason: string | null;
  /** Must match the line content's revision for an acceptance to remain valid. */
  fingerprint: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  version: number;
}

export interface TechnicalReviewCommand {
  action: TechnicalReviewAction;
  reason?: string | null;
  expectedVersion: number;
  actorId: string;
  occurredAt: string;
}

export interface TechnicalReviewResult {
  ok: boolean;
  code?: 'STALE_VERSION' | 'LABOUR_NOT_REVIEWABLE' | 'REASON_REQUIRED' | 'INVALID_TIME';
  line: TechnicalReviewLine;
}

/** Deterministic, normalized identity for detecting edits after acceptance. */
export function technicalReviewFingerprint(line: {
  partNumber: string | null;
  description: string;
  action: string;
  quantity: number;
}): string {
  return JSON.stringify([
    line.action,
    (line.partNumber ?? '').trim().toUpperCase(),
    line.description.trim(),
    line.quantity,
  ]);
}

/**
 * A stale acceptance must never follow a corrected technical code/quantity.
 * Re-review returns pending, preserving the previous audit history on the server.
 */
export function reconcileTechnicalReview(
  state: TechnicalReviewLine,
  currentFingerprint: string,
): TechnicalReviewLine {
  if (state.fingerprint === currentFingerprint) return state;
  return {
    ...state, status: 'pending', reason: null,
    fingerprint: currentFingerprint, reviewedBy: null, reviewedAt: null,
    version: state.version + 1,
  };
}

export function applyTechnicalReview(
  state: TechnicalReviewLine,
  command: TechnicalReviewCommand,
): TechnicalReviewResult {
  if (state.version !== command.expectedVersion)
    return { ok: false, code: 'STALE_VERSION', line: state };
  if (state.action !== 'replace')
    return { ok: false, code: 'LABOUR_NOT_REVIEWABLE', line: state };
  if (!command.occurredAt || !Number.isFinite(Date.parse(command.occurredAt)))
    return { ok: false, code: 'INVALID_TIME', line: state };
  const reason = command.reason?.trim() ?? '';
  if (command.action === 'return' && !reason)
    return { ok: false, code: 'REASON_REQUIRED', line: state };
  const status: TechnicalReviewStatus = command.action === 'accept'
    ? 'accepted' : command.action === 'return' ? 'returned' : 'pending';
  return {
    ok: true,
    line: {
      ...state,
      status,
      reason: status === 'returned' ? reason : null,
      reviewedBy: command.action === 'reset' ? null : command.actorId,
      reviewedAt: command.action === 'reset' ? null : command.occurredAt,
      version: state.version + 1,
    },
  };
}

/** An accepted line can move on without waiting for unrelated returned lines. */
export function technicalReviewSummary(lines: readonly TechnicalReviewLine[]) {
  const parts = lines.filter(line => line.action === 'replace');
  return {
    total: parts.length,
    accepted: parts.filter(line => line.status === 'accepted').length,
    returned: parts.filter(line => line.status === 'returned').length,
    pending: parts.filter(line => line.status === 'pending').length,
    readyItemIds: parts.filter(line => line.status === 'accepted').map(line => line.itemId),
    correctionItemIds: parts.filter(line => line.status === 'returned').map(line => line.itemId),
  };
}
