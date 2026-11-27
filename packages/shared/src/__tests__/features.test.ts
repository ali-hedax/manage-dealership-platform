import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEATURES, featureOfPath, featureOpen, featureTagged, parseOpenFeatures } from '../index';

test('H2 central switch: the owner approved list (2026-11-27)', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(FEATURES).map(([k, v]) => [k, [v.ownerOnly, v.experimental]])), {
    stoppages: [true, true],
    planned_modules: [true, true],
    special_aid: [false, true],
    night_job_split: [false, true],
  });
});

test('closed modules open only for the owner or when the server lists them; the tag is only for the owner', () => {
  assert.equal(featureOpen('stoppages', false), false);
  assert.equal(featureOpen('stoppages', true), true);
  assert.equal(featureOpen('stoppages', false, ['stoppages']), true);
  assert.equal(featureOpen('planned_modules', false, ['stoppages']), false);
  assert.equal(featureOpen('special_aid', false), true);
  assert.equal(featureTagged('special_aid', false), false);
  assert.equal(featureTagged('special_aid', true), true);
  assert.equal(featureTagged('night_job_split', true), true);
});

test('pages map to their module; OPEN_FEATURES ignores unknown names', () => {
  assert.equal(featureOfPath('/reception/stoppage'), 'stoppages');
  assert.equal(featureOfPath('/reception/stoppage/abc'), 'stoppages');
  assert.equal(featureOfPath('/control-room/stoppages'), 'stoppages');
  assert.equal(featureOfPath('/modules/finance'), 'planned_modules');
  assert.equal(featureOfPath('/special-aid/vehicles/x'), 'special_aid');
  assert.equal(featureOfPath('/reception/night'), null);
  assert.equal(featureOfPath('/control-room'), null);
  assert.deepEqual(parseOpenFeatures(' stoppages, nope,stoppages '), ['stoppages']);
  assert.deepEqual(parseOpenFeatures(undefined), []);
});
