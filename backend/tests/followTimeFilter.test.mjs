import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLLOW_TIME_VALUES,
  followTimeBucket,
  matchesFollowTime,
} from '../../src/utils/followTimeFilter.ts';

const TODAY = '2026-07-31';
const customerOptions = { emptyMeansAll: false, today: TODAY };

test('follow time classifies today, overdue, pending and undated values', () => {
  assert.equal(followTimeBucket('2026-07-31', TODAY), 'today');
  assert.equal(followTimeBucket('2026-07-27', TODAY), 'overdue');
  assert.equal(followTimeBucket('2026-08-01', TODAY), 'pending');
  assert.equal(followTimeBucket('', TODAY), null);
  assert.equal(followTimeBucket('—', TODAY), null);
});

test('today filter includes only the current date', () => {
  assert.equal(matchesFollowTime('2026-07-31', ['today'], customerOptions), true);
  assert.equal(matchesFollowTime('2026-07-27', ['today'], customerOptions), false);
  assert.equal(matchesFollowTime('2026-08-01', ['today'], customerOptions), false);
  assert.equal(matchesFollowTime('', ['today'], customerOptions), false);
});

test('overdue filter includes only dates before today', () => {
  assert.equal(matchesFollowTime('2026-07-27', ['overdue'], customerOptions), true);
  assert.equal(matchesFollowTime('2026-07-31', ['overdue'], customerOptions), false);
  assert.equal(matchesFollowTime('2026-08-01', ['overdue'], customerOptions), false);
  assert.equal(matchesFollowTime('', ['overdue'], customerOptions), false);
});

test('pending filter includes only dates after today', () => {
  assert.equal(matchesFollowTime('2026-08-01', ['pending'], customerOptions), true);
  assert.equal(matchesFollowTime('2026-07-31', ['pending'], customerOptions), false);
  assert.equal(matchesFollowTime('2026-07-27', ['pending'], customerOptions), false);
  assert.equal(matchesFollowTime('', ['pending'], customerOptions), false);
});

test('all selection includes undated values and no selection returns no customers', () => {
  assert.equal(matchesFollowTime('', FOLLOW_TIME_VALUES, customerOptions), true);
  assert.equal(matchesFollowTime('2026-07-27', FOLLOW_TIME_VALUES, customerOptions), true);
  assert.equal(matchesFollowTime('2026-07-31', [], customerOptions), false);
});

test('order default selection means all and explicit none means no rows', () => {
  const orderOptions = { emptyMeansAll: true, noneValue: '__FILTER_NONE__', today: TODAY };
  assert.equal(matchesFollowTime('', [], orderOptions), true);
  assert.equal(matchesFollowTime('2026-07-27', [], orderOptions), true);
  assert.equal(matchesFollowTime('2026-07-31', ['__FILTER_NONE__'], orderOptions), false);
});
