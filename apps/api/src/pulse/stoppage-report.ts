import type { StoppageRecord, StoppageResult } from '@manage/shared';
import { z } from 'zod';

/** The provider owns decoding. Only verified responses may map to “no record”. */
export type StoppageParser = (payload: unknown) =>
  { state: 'active' | 'resolved'; record: StoppageRecord } | { state: 'no_record' };

export function readStoppage(
  parser: StoppageParser,
  payload: unknown,
  observedAt: number,
  now: number,
  maxAgeMs: number,
): StoppageResult {
  if (!Number.isFinite(observedAt) || observedAt > now) return { state: 'error' };
  try {
    const result = parser(payload);
    return now - observedAt > maxAgeMs ? { state: 'stale', lastKnown: result } : result;
  } catch {
    return { state: 'error' };
  }
}

// Versioned synthetic fixture format. Replace this adapter once the official response is verified.
const fixture = z.discriminatedUnion('finding', [
  z.object({ finding: z.literal('empty'), version: z.literal(1) }).strict(),
  z.object({
    finding: z.enum(['open', 'closed']), version: z.literal(1),
    reference: z.string().min(1), reason: z.string().min(1).optional(), part: z.string().min(1).optional(),
    openedAt: z.iso.datetime().optional(), resolvedAt: z.iso.datetime().optional(),
  }).strict(),
]);

export const parseStoppageFixture: StoppageParser = (payload) => {
  const data = fixture.parse(payload);
  if (data.finding === 'empty') return { state: 'no_record' };
  const { reference, reason, part, openedAt, resolvedAt } = data;
  return { state: data.finding === 'open' ? 'active' : 'resolved', record: { reference, reason, part, openedAt, resolvedAt } };
};

export function stoppageValidationReport() {
  const now = Date.parse('2026-01-02T12:00:00Z');
  const hour = 3_600_000;
  const samples = [
    { reference: 'TEST-001', inNightList: true, observedAt: now, payload: { version: 1, finding: 'open', reference: 'TEST-001', reason: 'انتظار قطعهٔ نمونه', part: 'قطعهٔ نمونه' } },
    { reference: 'TEST-002', inNightList: false, observedAt: now, payload: { version: 1, finding: 'open', reference: 'TEST-002' } },
    { reference: 'TEST-003', inNightList: true, observedAt: now, payload: { version: 1, finding: 'empty' } },
    { reference: 'TEST-004', inNightList: false, observedAt: now, payload: { version: 1, finding: 'closed', reference: 'TEST-004', resolvedAt: '2026-01-02T10:00:00Z' } },
    { reference: 'TEST-005', inNightList: true, observedAt: now, payload: null },
    { reference: 'TEST-006', inNightList: false, observedAt: now - 2 * hour, payload: { version: 1, finding: 'open', reference: 'TEST-006' } },
  ];
  return {
    mode: 'validation' as const,
    samples: samples.map(({ reference, inNightList, observedAt, payload }) => ({
      reference, inNightList, result: readStoppage(parseStoppageFixture, payload, observedAt, now, hour),
    })),
  };
}
