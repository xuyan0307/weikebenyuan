const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canViewAllDashboard,
  dashboardAppointmentScope,
  dashboardCustomerScope,
  dashboardOrderScope,
} = require('../dist/services/dashboardDataScope.js');

test('administrators and super administrators can view all dashboard data', () => {
  for (const role of ['admin', 'superadmin']) {
    const actor = { role, userId: `${role}-id` };
    assert.equal(canViewAllDashboard(actor), true);
    assert.deepEqual(dashboardCustomerScope(actor), { where: '1=1', params: [] });
    assert.deepEqual(dashboardOrderScope(actor), { where: '1=1', params: [] });
    assert.deepEqual(dashboardAppointmentScope(actor), { where: '1=1', params: [] });
  }
});

test('customer service dashboard customers are restricted to the assigned advisor', () => {
  const scope = dashboardCustomerScope({ role: 'service', userId: 'advisor-1' }, 'lead');
  assert.equal(scope.where, 'lead.advisor_id = ?');
  assert.deepEqual(scope.params, ['advisor-1']);
});

test('order ownership uses current customer assignment before historical snapshots', () => {
  const scope = dashboardOrderScope({ role: 'service', userId: 'advisor-1' });
  assert.match(scope.where, /dashboard_customer\.advisor_id = \?/);
  assert.match(scope.where, /NOT EXISTS/);
  assert.match(scope.where, /current_dashboard_customer\.id = o\.customer_id/);
  assert.match(scope.where, /\$\.advisorId/);
  assert.deepEqual(scope.params, ['advisor-1', 'advisor-1']);
});

test('appointment ownership uses current customer assignment with orphan fallback', () => {
  const scope = dashboardAppointmentScope(
    { role: 'service', userId: 'advisor-1' },
    'booking'
  );
  assert.match(scope.where, /dashboard_customer\.id = booking\.customer_id/);
  assert.match(scope.where, /dashboard_customer\.advisor_id = \?/);
  assert.match(scope.where, /NOT EXISTS/);
  assert.match(scope.where, /dashboard_order\.customer_id = booking\.customer_id/);
  assert.match(scope.where, /\$\.advisorId/);
  assert.deepEqual(scope.params, ['advisor-1', 'advisor-1']);
});

test('non-administrator roles never receive an unrestricted dashboard scope', () => {
  for (const role of ['service', 'therapist', 'finance', '', undefined]) {
    const actor = { role, userId: 'user-1' };
    assert.equal(canViewAllDashboard(actor), false);
    assert.notEqual(dashboardCustomerScope(actor).where, '1=1');
    assert.notEqual(dashboardOrderScope(actor).where, '1=1');
    assert.notEqual(dashboardAppointmentScope(actor).where, '1=1');
  }
});
