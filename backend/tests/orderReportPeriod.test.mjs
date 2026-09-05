import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { orderReportContribution } from '../../src/utils/orderReportMetrics.ts';

const start = new Date('2026-08-01T00:00:00');
const end = new Date('2026-08-31T23:59:59');
const contribution = (cardDate, packageDate) => orderReportContribution({
  type: '套餐', amount: 6000, payStatus: '已支付', purchaseDate: packageDate,
  servicePeople: { experienceSnapshot: { amount: 288, payStatus: '已支付', purchaseDate: cardDate } },
}, start, end);

test('card and upgrade are attributed independently across month boundaries', () => {
  assert.deepEqual(contribution('2026-07-31', '2026-08-11'), {
    hasExperienceCard: false, hasUpgrade: true, upgradeSalesAmount: 6000,
  });
  assert.deepEqual(contribution('2026-08-31', '2026-09-04'), {
    hasExperienceCard: true, hasUpgrade: false, upgradeSalesAmount: 0,
  });
  assert.deepEqual(contribution('2026-08-01', '2026-08-31'), {
    hasExperienceCard: true, hasUpgrade: true, upgradeSalesAmount: 6000,
  });
});

test('upgrades without a retained card never manufacture a card purchase', () => {
  assert.equal(orderReportContribution({ type: '套餐', amount: 6000,
    payStatus: '已支付', purchaseDate: '2026-08-11' }, start, end).hasExperienceCard, false);
});

test('report counts acquired customers only, including those without an order', () => {
  const source = fs.readFileSync(new URL('../../src/components/ContractListPage.tsx', import.meta.url), 'utf8');
  const page = source.slice(source.indexOf('function OrderReportPage()'));
  const begin = page.indexOf('    customers.forEach(c => {', page.indexOf('advisorOptions.forEach(opt => ensure(opt.value))'));
  const finish = page.indexOf('    return Array.from(map.values())', begin);
  assert.ok(begin >= 0 && finish > begin);
  const row = { customerIds: new Set(), trialCustomerIds: new Set(), upgradeCustomerIds: new Set(), salesAmount: 0 };
  const customers = [
    { id: 'new-no-order', acquiredAt: '2026-08-05' },
    { id: 'new-buyer', acquiredAt: '2026-08-31' },
    { id: 'old-buyer', acquiredAt: '2026-07-21' },
    { id: 'next-month', acquiredAt: '2026-09-01' },
  ];
  const orders = ['old-buyer', 'new-buyer', 'orphan'].map(customerId => ({
    customerId, type: '体验卡', purchaseDate: '2026-08-10', payStatus: '已支付', amount: 288,
  }));
  vm.runInNewContext(page.slice(begin, finish), {
    customers, orders, start, end, customerById: new Map(customers.map(c => [c.id, c])),
    inRange: date => date >= '2026-08-01' && date <= '2026-08-31',
    normalizeAdvisor: value => value || '未分配', ensure: () => row,
    customerKeyOf: order => order.customerId, orderReportContribution,
  });
  assert.deepEqual([...row.customerIds].sort(), ['new-buyer', 'new-no-order']);
  assert.equal(row.trialCustomerIds.size, 3);
  assert.match(page, /title="新客数量"/);
  assert.doesNotMatch(page, /<th>客户数量<\/th>/);
});
