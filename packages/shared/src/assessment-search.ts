/**
 * Pure, dependency-free matching for the smart manual assessment picker.
 * Input catalog rows MUST come from the tenant-scoped, authorized API.
 * Ranking is a hint, never evidence of VIN/fitment compatibility.
 */
import { toLatinDigits } from './text';

export interface AssessmentCatalogCandidate {
  id: string;
  name: string;
  partNumber: string;
  aliases?: readonly string[];
  /** Set only from verified catalog applicability records; never inferred from the name. */
  vehicleMatch?: 'verified' | 'unknown' | 'incompatible';
}

export interface RankedAssessmentCandidate extends AssessmentCatalogCandidate {
  score: number;
  /** An unverified result must be explicitly checked by a human. */
  requiresFitmentReview: boolean;
}

export function normalizeAssessmentSearch(input: string | null | undefined): string {
  return toLatinDigits(String(input ?? ''))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإٱآ]/g, 'ا')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[\u064b-\u065f\u0670\u0640\u200c\u200d\u200e\u200f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Levenshtein on short normalized phrases only; avoids expensive fuzzy matching on long input. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = next;
  }
  return prev[b.length]!;
}

export function rankAssessmentCandidates(
  query: string,
  candidates: readonly AssessmentCatalogCandidate[],
  limit = 20,
): RankedAssessmentCandidate[] {
  const q = normalizeAssessmentSearch(query);
  if (!q || q.length > 80 || !Number.isFinite(limit) || limit <= 0) return [];
  const output: RankedAssessmentCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.vehicleMatch === 'incompatible') continue;
    const names = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeAssessmentSearch).filter(Boolean);
    const code = normalizeAssessmentSearch(candidate.partNumber);
    let score = 0;
    if (code === q) score = 140;
    else if (code.startsWith(q)) score = 110;
    else if (code.includes(q)) score = 75;
    for (const name of names) {
      if (name === q) score = Math.max(score, 120);
      else if (name.startsWith(q)) score = Math.max(score, 95);
      else if (name.includes(q)) score = Math.max(score, 80);
      else if (q.length >= 3 && q.length <= 24 && name.length <= 48) {
        // Common single-character typo in otherwise close part names.
        const threshold = q.length > 5 ? 2 : 1;
        if (Math.abs(q.length - name.length) <= threshold && distance(q, name) <= threshold)
          score = Math.max(score, 55);
      }
    }
    if (!score) continue;
    // Verified applicability ranks above unknown only; it is never manufactured here.
    if (candidate.vehicleMatch === 'verified') score += 20;
    output.push({ ...candidate, score, requiresFitmentReview: candidate.vehicleMatch !== 'verified' });
  }
  return output.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fa') || a.partNumber.localeCompare(b.partNumber)).slice(0, Math.min(Math.floor(limit), 100));
}
