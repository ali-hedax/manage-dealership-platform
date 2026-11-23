import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentSearchWords, scoreAssessmentCandidates } from '../assessment-search';
import { latestAdmissionFirst } from '../case-order';
import { COVERAGE_TYPES, canUseSmartAssessment } from '../enums';

const parts = [
  { id: 'a', name: 'سپر جلو', partNumber: '00770001', aliases: ['سورن پلاس', 'سپر جلو سورن پلاس', 'سورن پلاس سپر جلو'] },
  { id: 'b', name: 'سپر جلو', partNumber: '00770003', aliases: ['دنا', 'سپر جلو دنا', 'دنا سپر جلو'] },
  { id: 'c', name: 'گلگیر جلو', partNumber: '00770002', aliases: ['پژو ۲۰۷', 'گلگیر جلو پژو ۲۰۷', 'پژو ۲۰۷ گلگیر جلو'] },
];

test('part name and vehicle model in one query, in any order', () => {
  assert.deepEqual(scoreAssessmentCandidates('سپر سورن', parts).map((r) => r.id), ['a']);
  assert.deepEqual(scoreAssessmentCandidates('دنا سپر', parts).map((r) => r.id), ['b']);
  assert.deepEqual(scoreAssessmentCandidates('گلگیر 207', parts).map((r) => r.id), ['c']);
  assert.deepEqual(scoreAssessmentCandidates('سپر', parts).map((r) => r.id).sort(), ['a', 'b']);
  assert.deepEqual(scoreAssessmentCandidates('00770002', parts).map((r) => r.id), ['c']);
  assert.deepEqual(assessmentSearchWords(' سپر  جلو، سورن '), ['سپر', 'جلو', 'سورن']);
});

test('smart assessment: every recorded coverage except Golden Card; unknown or empty never', () => {
  const allowed = COVERAGE_TYPES.filter((c) => canUseSmartAssessment(c));
  assert.deepEqual(allowed, ['insurance', 'personal', 'mixed']);
  for (const c of ['golden_card', 'unknown', '', null, undefined, 'bogus']) assert.equal(canUseSmartAssessment(c), false, String(c));
});

test('latest admission first; equal admissions by the larger case number, 100 above 99', () => {
  const at = '2026-11-20T08:00:00.000Z';
  const rows = [
    { caseId: '1', caseNumber: 'AC-1405-99', admittedAt: at },
    { caseId: '2', caseNumber: 'AC-1405-100', admittedAt: at },
    { caseId: '3', caseNumber: 'AC-1405-0005', admittedAt: '2026-11-21T08:00:00.000Z' },
    { caseId: '4', caseNumber: 'AC-1405-۱۰۱', admittedAt: '2026-11-19T08:00:00.000Z' },
  ];
  assert.deepEqual([...rows].sort(latestAdmissionFirst).map((r) => r.caseId), ['3', '2', '1', '4']);
});
