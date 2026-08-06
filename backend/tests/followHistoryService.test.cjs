const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeAppendOnlyFollowRecords,
  mergeCustomerProfileFollowHistory,
  mergeOrderFollowHistory,
} = require('../dist/services/followHistoryService.js');

const first = {
  id: 'follow-1', date: '2026-08-04', content: '首次联系', feedback: '未接通',
  status: '待跟进', operator: '客服A', createdAt: '2026-08-04 10:00:00',
};
const second = {
  id: 'follow-2', date: '2026-08-05', content: '再次联系', feedback: '客户有意向',
  status: '跟进中', operator: '客服A', createdAt: '2026-08-04 11:00:00',
};

test('follow history appends new interactions and never deletes existing evidence', () => {
  const merged = mergeAppendOnlyFollowRecords([first], [second]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find(record => record.id === 'follow-1'), first);
  assert.deepEqual(merged.find(record => record.id === 'follow-2'), second);
});

test('changed content reusing an old id becomes an immutable revision', () => {
  const merged = mergeAppendOnlyFollowRecords([first], [{ ...first, feedback: '后来接通', createdAt: '2026-08-04 12:00:00' }]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(record => record.id === 'follow-1').feedback, '未接通');
  assert.match(merged.find(record => record.id !== 'follow-1').id, /^follow-revision-/);
});

test('replaying the same payload does not create duplicate records', () => {
  assert.equal(mergeAppendOnlyFollowRecords([first], [first]).length, 1);
});

test('customer profile updates retain history while changing profile fields', () => {
  const merged = mergeCustomerProfileFollowHistory(
    { age: 30, followRecords: [first] },
    { age: 31, followRecords: [second] },
  );
  assert.equal(merged.age, 31);
  assert.deepEqual(merged.followRecords.map(record => record.id), ['follow-2', 'follow-1']);
});

test('order history protects current and package-stage follow evidence', () => {
  const merged = mergeOrderFollowHistory(
    { followRecords: [first], packageHistory: [{ id: 'package-1', followRecords: [first] }] },
    { followRecords: [second], packageHistory: [{ id: 'package-1', followRecords: [second] }] },
  );
  assert.equal(merged.followRecords.length, 2);
  assert.equal(merged.packageHistory[0].followRecords.length, 2);
});
