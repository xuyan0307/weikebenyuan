const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assignedTherapistNames,
  buildSalaryCustomerLedger,
  salaryTierByUpgradeRate,
  salaryMonthWeeks,
} = require('../dist/services/salaryCustomerLedgerService.js');

test('builds complete Monday-to-Sunday weeks for a month', () => {
  const weeks = salaryMonthWeeks('2026-08');
  assert.equal(weeks[0].start, '2026-07-27');
  assert.equal(weeks[0].end, '2026-08-02');
  assert.equal(weeks.every(week => week.days.length === 7), true);
});

test('maps upgrade rates to the configured commission tiers', () => {
  assert.deepEqual(salaryTierByUpgradeRate(39.9), { key: 'observer', label: '观察池', commissionRate: 0 });
  assert.equal(salaryTierByUpgradeRate(40).commissionRate, 6);
  assert.equal(salaryTierByUpgradeRate(50).commissionRate, 8);
  assert.equal(salaryTierByUpgradeRate(60).commissionRate, 12);
  assert.equal(salaryTierByUpgradeRate(75).commissionRate, 15);
});

test('reads therapist assignments from all service people slots', () => {
  assert.deepEqual(
    assignedTherapistNames({ sp1: { assign: '胡老师' }, sp2: { assign: '徐老师' }, sp3: {} }),
    ['胡老师', '徐老师']
  );
});

test('keeps associated customers without completed service and aggregates completed evidence', () => {
  const result = buildSalaryCustomerLedger({
    month: '2026-08',
    therapists: [{ id: 't1', name: '胡老师', upgrade_rate: 50 }],
    customers: [
      { id: 'c1', customer_code: '100001', name: '甲客户' },
      { id: 'c2', customer_code: '100002', name: '乙客户' },
    ],
    orders: [
      { customer_id: 'c1', type: '套餐', amount: 6800, pay_status: '已付款', purchase_date: '2026-08-01', created_date: '2026-08-01', used_times: 1, total_times: 8, is_upgrade: 1, service_item_count: 2, service_items: '盆底、腹直肌', service_people: { sp1: { assign: '胡老师' } } },
      { customer_id: 'c2', type: '体验卡', amount: 288, pay_status: '已付款', purchase_date: '2026-07-20', created_date: '2026-07-20', used_times: 0, total_times: 1, is_upgrade: 0, service_item_count: 1, service_items: '产康体验', service_people: { sp1: { assign: '胡老师' } } },
    ],
    appointments: [
      { customer_id: 'c1', therapist_id: 't1', date: '2026-08-01', status: '已完成' },
    ],
    entries: [
      { id: 'e1', therapistId: 't1', customerId: 'c1', serviceDate: '2026-08-01', payableAmount: 315, laborFee: 300, experienceFee: 0, otherFee: 20, deduction: 5, serviceItems: '盆底、腹直肌', serviceType: '套餐', settlementStatus: '已确认', settlementNote: '路补20' },
    ],
    adjustments: [
      { therapist_id: 't1', customer_id: 'c1', coupon_fee: 50, other_fee: 10, paid_amount: 200, adjustment_note: '路补纠偏' },
    ],
  });
  const customers = result.therapists[0].customers;
  assert.equal(customers.length, 2);
  assert.equal(customers[0].servedTimes, 1);
  assert.equal(result.therapists[0].upgradeRate, 50);
  assert.equal(result.therapists[0].profileUpgradeRate, 50);
  assert.equal(result.therapists[0].commissionRate, 8);
  assert.equal(customers[0].commission, 544);
  assert.equal(customers[0].experienceServiceDate, '2026-08-01');
  assert.equal(customers[0].laborUnitFee, 300);
  assert.equal(customers[0].laborFee, 2400);
  assert.equal(customers[0].otherFee, 25);
  assert.equal(customers[0].totalFee, 3019);
  assert.equal(customers[0].paidSubtotal, 315);
  assert.equal(customers[0].unpaidSubtotal, 2704);
  assert.equal(customers[0].weekSubtotals['2026-07-27'], 315);
  assert.equal(customers[0].weekConfirmedSubtotals['2026-07-27'], 315);
  assert.equal(customers[1].couponFee, 300);
  assert.equal(customers[1].experienceStatus, '待服务');
  assert.equal(result.summary.upgradeRate, 100);
});

test('uses the immutable order snapshot when an ordered customer left the lead table', () => {
  const result = buildSalaryCustomerLedger({
    month: '2026-08',
    therapists: [{ id: 't1', name: '胡老师' }],
    customers: [],
    orders: [{ customer_id: 'historic-customer', customer_code: '100099', customer_name: '历史客户', type: '套餐', amount: 3800, pay_status: '已付款', purchase_date: '2026-07-20', created_date: '2026-07-20', used_times: 0, total_times: 5, is_upgrade: 1, service_item_count: 2, service_items: '盆底、腹直肌', service_people: { sp1: { assign: '胡老师' } } }],
    appointments: [],
    entries: [],
    adjustments: [],
  });
  assert.equal(result.therapists[0].customers[0].customerId, '100099');
  assert.equal(result.therapists[0].customers[0].customerName, '历史客户');
});

test('uses every therapist profile tier and keeps commission across month views', () => {
  const base = {
    month: '2026-08',
    scope: 'month',
    customers: [{ id: 'c1', customer_code: '100001', name: '跨月升单客户' }],
    orders: [{ customer_id: 'c1', type: '套餐', amount: 5998, pay_status: '已付款', purchase_date: '2026-07-12', created_date: '2026-07-12', used_times: 0, total_times: 5, is_upgrade: 1, service_item_count: 4, service_items: '一、二、三、四', service_people: { sp1: { assign: '徐老师' } } }],
    appointments: [], entries: [], adjustments: [],
  };
  for (const [profileRate, tierKey, commissionRate, commission] of [
    [39, 'observer', 0, 0],
    [40, 'A', 6, 359.88],
    [50, 'B', 8, 479.84],
    [60, 'S', 12, 719.76],
    [75, 'ace', 15, 899.7],
  ]) {
    const ledger = buildSalaryCustomerLedger({
      ...base,
      therapists: [{ id: 't1', name: '徐老师', upgrade_rate: profileRate }],
    });
    assert.equal(ledger.therapists[0].tierKey, tierKey);
    assert.equal(ledger.therapists[0].commissionRate, commissionRate);
    assert.equal(ledger.therapists[0].customers[0].commission, commission);
  }
});

test('keeps the experience-card status embedded in an upgraded package snapshot', () => {
  const result = buildSalaryCustomerLedger({
    month: '2026-08',
    therapists: [{ id: 't1', name: '胡老师' }],
    customers: [],
    orders: [{ customer_id: 'c1', customer_code: '100088', customer_name: '升单客户', type: '套餐', amount: 6800, pay_status: '已付款', purchase_date: '2026-08-01', created_date: '2026-08-01', used_times: 0, total_times: 8, is_upgrade: 1, service_item_count: 3, service_items: '一、二、三', service_people: { sp1: { assign: '胡老师' }, experienceSnapshot: { usedTimes: 1 } } }],
    appointments: [], entries: [], adjustments: [],
  });
  assert.equal(result.therapists[0].customers[0].experienceStatus, '已服务');
});

test('shows a complete cross-month week without mixing next-month fees into the monthly total', () => {
  const base = { id: 'e1', therapistId: 't1', customerId: 'c1', payableAmount: 300, serviceItems: '一、二', serviceType: '套餐', settlementNote: '', laborFee: 300 };
  const result = buildSalaryCustomerLedger({
    month: '2026-07',
    therapists: [{ id: 't1', name: '胡老师', upgrade_rate: 75 }],
    customers: [{ id: 'c1', customer_code: '100001', name: '跨月客户' }],
    orders: [{ customer_id: 'c1', type: '套餐', amount: 3800, pay_status: '已付款', purchase_date: '2026-07-20', created_date: '2026-07-20', used_times: 0, total_times: 5, is_upgrade: 1, service_item_count: 2, service_items: '一、二', service_people: { sp1: { assign: '胡老师' } } }],
    appointments: [],
    entries: [{ ...base, serviceDate: '2026-07-31' }],
    displayEntries: [{ ...base, serviceDate: '2026-07-31' }, { ...base, id: 'e2', serviceDate: '2026-08-01' }],
    adjustments: [],
  });
  const customer = result.therapists[0].customers[0];
  assert.equal(customer.totalFee, 2370);
  assert.equal(customer.weekSubtotals['2026-07-27'], 600);
  assert.equal(customer.weekConfirmedSubtotals['2026-07-27'], 0);
  assert.equal(customer.days['2026-08-01'].entries.length, 1);
});

test('accumulates paid amount from confirmed historical weeks across month views', () => {
  const confirmedJuly = {
    id: 'e1', therapistId: 't1', customerId: 'c1', serviceDate: '2026-07-27',
    payableAmount: 200, serviceItems: '体验服务', serviceType: '体验卡',
    settlementStatus: '已确认', settlementNote: '',
  };
  const result = buildSalaryCustomerLedger({
    month: '2026-08',
    scope: 'month',
    therapists: [{ id: 't1', name: '胡老师', upgrade_rate: 60 }],
    customers: [{ id: 'c1', customer_code: '100001', name: '跨月结算客户' }],
    orders: [{ customer_id: 'c1', type: '套餐', amount: 3800, pay_status: '已付款', purchase_date: '2026-07-20', created_date: '2026-07-20', used_times: 0, total_times: 5, is_upgrade: 1, service_item_count: 3, service_items: '一、二、三', service_people: { sp1: { assign: '胡老师' } } }],
    appointments: [],
    entries: [],
    cumulativeEntries: [confirmedJuly],
    displayEntries: [confirmedJuly],
    adjustments: [],
  });
  const customer = result.therapists[0].customers[0];
  assert.equal(customer.paidSubtotal, 200);
  assert.equal(customer.weekConfirmedSubtotals['2026-07-27'], 200);
  assert.equal(customer.unpaidSubtotal, customer.totalFee - 200);
  assert.equal(result.summary.paidSubtotal, 200);
});
