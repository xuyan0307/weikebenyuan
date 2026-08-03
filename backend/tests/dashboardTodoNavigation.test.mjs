import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardTodoTarget } from '../../src/utils/dashboardTodoNavigation.ts';

test('new customer todo opens customer list with today follow-time filter', () => {
  assert.deepEqual(dashboardTodoTarget('new-customer-followup'), {
    page: 'customers-list',
    filter: { customerFollowTime: 'today' },
  });
});

test('order customer todo opens order list with today follow-time filter', () => {
  assert.deepEqual(dashboardTodoTarget('order-customer-followup'), {
    page: 'orders-list',
    filter: { orderFollowTime: 'today' },
  });
});

test('appointment todo opens appointment list with need-notification filter', () => {
  assert.deepEqual(dashboardTodoTarget('appointment-notification'), {
    page: 'appointments-list',
    filter: { appointmentNotifyStatus: '需通知' },
  });
});

test('contract todo opens order list with unsigned contract filter', () => {
  assert.deepEqual(dashboardTodoTarget('contract-pending-signature'), {
    page: 'orders-list',
    filter: { orderContractStatus: '未回签' },
  });
});

test('removed legacy todo types no longer navigate', () => {
  assert.equal(dashboardTodoTarget('contract'), null);
  assert.equal(dashboardTodoTarget('followup'), null);
  assert.equal(dashboardTodoTarget('appointment'), null);
});
