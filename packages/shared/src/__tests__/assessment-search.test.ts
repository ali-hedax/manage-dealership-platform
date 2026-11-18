import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAssessmentSearch, rankAssessmentCandidates } from '../assessment-search';

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
