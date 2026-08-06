const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canBrowseAllAdvisorRecords,
  advisorCustomerRecordScope,
  advisorOrderRecordScope,
} = require('../dist/services/advisorRecordScope.js');
const {
  dashboardCustomerScope,
  dashboardOrderScope,
} = require('../dist/services/dashboardDataScope.js');

test('customer service can browse all advisor records in customer and order lists', () => {
  const actor = { role: 'service', userId: 'advisor-1' };
  assert.equal(canBrowseAllAdvisorRecords(actor.role), true);
  assert.deepEqual(advisorCustomerRecordScope(actor), { where: '1=1', params: [] });
  assert.deepEqual(advisorOrderRecordScope(actor), { where: '1=1', params: [] });
});

test('dashboard scopes stay restricted for customer service accounts', () => {
  const actor = { role: 'service', userId: 'advisor-1' };
  assert.notEqual(dashboardCustomerScope(actor).where, '1=1');
  assert.notEqual(dashboardOrderScope(actor).where, '1=1');
});

test('other non-administrator roles retain their existing record scope', () => {
  for (const role of ['finance', 'therapist', '', undefined]) {
    const actor = { role, userId: 'user-1' };
    assert.equal(canBrowseAllAdvisorRecords(role), false);
    assert.notEqual(advisorCustomerRecordScope(actor).where, '1=1');
    assert.notEqual(advisorOrderRecordScope(actor).where, '1=1');
  }
});
