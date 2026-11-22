import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAssessmentSearch, rankAssessmentCandidates, scoreAssessmentCandidates } from '../assessment-search';

test('Persian and Arabic letters, spaces, ZWNJ, digits normalize consistently', () => {
  assert.equal(normalizeAssessmentSearch('سپر جلو'), normalizeAssessmentSearch('سپر‌جلو'));
  assert.equal(normalizeAssessmentSearch('سپرجلو'), normalizeAssessmentSearch('سپر جلو'));
  assert.equal(normalizeAssessmentSearch('كيت يک ۱۲۳'), normalizeAssessmentSearch('کیت یک 123'));
});
test('exact code and verified vehicle match rank correctly', () => {
  const rows = [
    { id: 'a', name: 'سپر جلو', partNumber: '۰۰۱۲۳۴۵۶', vehicleMatch: 'verified' as const },
    { id: 'b', name: 'سپر عقب', partNumber: '00000002', vehicleMatch: 'unknown' as const },
    { id: 'c', name: 'سپر جلو', partNumber: '00000003', vehicleMatch: 'incompatible' as const },
  ];
  assert.deepEqual(rankAssessmentCandidates('سپر', rows).map(x => x.id), ['a', 'b']);
  assert.equal(rankAssessmentCandidates('00123456', rows)[0]?.id, 'a');
  assert.equal(rankAssessmentCandidates('سپر', rows)[1]?.requiresFitmentReview, true);
});
test('aliases and a small typo are searchable', () => {
  const rows = [{ id: 'a', name: 'دیاق', aliases: ['آهن سپر'], partNumber: 'ABC99' }];
  assert.equal(rankAssessmentCandidates('اهن‌سپر', rows)[0]?.id, 'a');
  assert.equal(rankAssessmentCandidates('دیاغ', rows)[0]?.id, 'a');
});
test('empty queries, impossible candidates and invalid limits are safe', () => {
  const rows = [{ id: 'a', name: 'چراغ جلو', partNumber: '0001' }];
  assert.deepEqual(rankAssessmentCandidates('  ', rows), []);
  assert.deepEqual(rankAssessmentCandidates('سپر', rows), []);
  assert.deepEqual(rankAssessmentCandidates('چراغ', rows, 0), []);
});

test('full ranking keeps every match for paging; the ranked list stays capped at 100', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: `p${i}`, name: `سپر آزمون ${i}`, partNumber: `0099${String(i).padStart(4, '0')}01`, vehicleMatch: (i % 2 ? 'verified' : 'unknown') as 'verified' | 'unknown' }));
  const all = scoreAssessmentCandidates('سپر', rows);
  assert.equal(all.length, 150);
  assert.equal(rankAssessmentCandidates('سپر', rows, 500).length, 100);
  assert.deepEqual(rankAssessmentCandidates('سپر', rows, 100).map((x) => x.id), all.slice(0, 100).map((x) => x.id));
  // Verified applicability first; pages never overlap.
  assert.ok(all.slice(0, 75).every((x) => x.vehicleMatch === 'verified'));
  assert.equal(new Set([...all.slice(0, 100), ...all.slice(100)].map((x) => x.id)).size, 150);
});
