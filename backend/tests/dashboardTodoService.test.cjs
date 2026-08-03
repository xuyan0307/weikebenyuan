const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDashboardTodoQueries,
  mapDashboardTodos,
} = require('../dist/services/dashboardTodoService.js');

test('dashboard todo queries use the same business boundaries as destination filters', () => {
  const queries = buildDashboardTodoQueries({
    customerWhere: 'c.advisor_id = ?',
    orderWhere: 'o.branch_id = ?',
    appointmentWhere: 'a.advisor_id = ?',
  });

  assert.match(queries.newCustomers, /c\.advisor_id = \?/);
  assert.match(queries.newCustomers, /c\.tag IN \('D1','D2','D3'\)/);
  assert.match(queries.newCustomers, /COALESCE\(c\.total_orders, 0\) = 0/);
  assert.match(queries.newCustomers, /DATE\(c\.follow_date\) = CURDATE\(\)/);

  assert.match(queries.orderCustomers, /COUNT\(DISTINCT o\.customer_id\)/);
  assert.match(queries.orderCustomers, /o\.branch_id = \?/);
  assert.match(queries.orderCustomers, /\$\.followRecords\[0\]\.date/);
  assert.match(queries.orderCustomers, /= CURDATE\(\)/);

  assert.match(queries.contracts, /o\.branch_id = \?/);
  assert.match(queries.contracts, /o\.type = '套餐'/);
  assert.match(queries.contracts, /COALESCE\(o\.contract_signed, 0\) = 0/);

  assert.match(queries.appointments, /a\.advisor_id = \?/);
  assert.match(queries.appointments, /notify_manual_status = '需通知'/);
  assert.match(queries.appointments, /notify_replied_at IS NULL/);
  assert.match(queries.appointments, /SUBSTRING_INDEX\(a\.time_slot, '-', 1\)/);
  assert.match(queries.appointments, /INTERVAL 2 HOUR/);
  assert.match(queries.appointments, /INTERVAL 12 HOUR/);
});

test('dashboard todo response contains the four current todo types', () => {
  assert.deepEqual(
    mapDashboardTodos({
      newCustomerCount: 2,
      orderCustomerCount: 3,
      appointmentCount: 4,
      contractCount: 5,
    }),
    [
      {
        id: 1,
        type: 'new-customer-followup',
        label: '新客待跟进通知',
        count: 2,
        color: '#1E88E5',
        urgency: 'high',
      },
      {
        id: 2,
        type: 'order-customer-followup',
        label: '订单客户待跟进通知',
        count: 3,
        color: '#FF7043',
        urgency: 'high',
      },
      {
        id: 3,
        type: 'appointment-notification',
        label: '预约通知',
        count: 4,
        color: '#FFC107',
        urgency: 'high',
      },
      {
        id: 4,
        type: 'contract-pending-signature',
        label: '合同待回签',
        count: 5,
        color: '#E53935',
        urgency: 'high',
      },
    ]
  );
});
