import assert from 'node:assert/strict';
import test from 'node:test';
import {
 applyTechnicalReview, reconcileTechnicalReview, technicalReviewFingerprint,
 technicalReviewSummary, type TechnicalReviewLine,
} from '../assessment-part-review';

function line(index: number): TechnicalReviewLine {
 return {
  itemId: 'item-' + index, assessmentId: 'draft-1',
  action: 'replace', partNumber: '001' + index, description: 'قطعه ساختگی ' + index,
  status: 'pending', reason: null, fingerprint: 'fingerprint-' + index,
  reviewedBy: null, reviewedAt: null, version: 1,
 };
}
const at = '2026-11-18T08:00:00.000Z';

test('95 accepted parts can proceed while five returned lines wait for correction', () => {
 const items = Array.from({length: 100}, (_, i) => line(i));
 const outcomes = items.map((item, i) => applyTechnicalReview(item, {
  action: i < 95 ? 'accept' : 'return',
  reason: i < 95 ? null : 'شماره فنی اشتباه است',
  actorId: 'parts-clerk', occurredAt: at, expectedVersion: 1,
 }));
 assert.equal(outcomes.filter(o => o.ok).length, 100);
 const summary = technicalReviewSummary(outcomes.map(o => o.line));
 assert.equal(summary.accepted, 95);
 assert.equal(summary.returned, 5);
 assert.equal(summary.pending, 0);
 assert.equal(summary.readyItemIds.length, 95);
 assert.deepEqual(summary.correctionItemIds, ['item-95','item-96','item-97','item-98','item-99']);
});

test('a returned line needs an explanation, rejects stale version, leaves status untouched', () => {
 const initial = line(1);
 const noReason = applyTechnicalReview(initial, { action: 'return', actorId: 'parts', expectedVersion: 1, occurredAt: at });
 assert.equal(noReason.code, 'REASON_REQUIRED');
 assert.equal(noReason.line.status, 'pending');
 const stale = applyTechnicalReview(initial, { action: 'accept', actorId: 'parts', expectedVersion: 2, occurredAt: at });
 assert.equal(stale.code, 'STALE_VERSION');
 assert.equal(stale.line.version, 1);
});

test('correction invalidates earlier acceptance and triggers re-review', () => {
 const state = line(1);
 const accepted = applyTechnicalReview(state, {action: 'accept', actorId: 'parts', expectedVersion: 1, occurredAt: at}).line;
 assert.equal(reconcileTechnicalReview(accepted, accepted.fingerprint).status, 'accepted');
 const corrected = reconcileTechnicalReview(accepted, 'corrected-fingerprint');
 assert.equal(corrected.status, 'pending');
 assert.equal(corrected.reviewedBy, null);
 assert.equal(corrected.version, 3);
 const reviewed = applyTechnicalReview(corrected, {action: 'accept', actorId: 'parts', expectedVersion: 3, occurredAt: at});
 assert.equal(reviewed.line.status, 'accepted');
});

test('labour lines cannot be sent to parts technical review', () => {
 const labour = {...line(1), action: 'repair' as const};
 const outcome = applyTechnicalReview(labour, {action: 'accept', actorId: 'parts', expectedVersion: 1, occurredAt: at});
 assert.equal(outcome.code, 'LABOUR_NOT_REVIEWABLE');
 assert.equal(technicalReviewSummary([labour]).total, 0);
});

test('part identity changes affect fingerprint and reason cannot leak after acceptance', () => {
 const data = {action:'replace', description:'سپر جلو',partNumber:'00123001',quantity:1};
 assert.notEqual(technicalReviewFingerprint(data),technicalReviewFingerprint({...data,partNumber:'00123002'}));
 assert.notEqual(technicalReviewFingerprint(data),technicalReviewFingerprint({...data,quantity:2}));
 const initial = applyTechnicalReview(line(2), {action:'return',actorId:'parts',reason:'کد نادرست',expectedVersion:1,occurredAt:at}).line;
 const fixed = applyTechnicalReview(initial, {action:'accept',actorId:'parts',expectedVersion:2,occurredAt:at}).line;
 assert.equal(fixed.reason,null);
});
