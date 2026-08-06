const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardStats, buildDashboardChart } = require('../dist/services/dashboardAnalyticsService.js');

const input = {
  startDate: '2026-07-01', endDate: '2026-07-31',
  customers: [{ id: 'lead-1', acquiredAt: '2026-07-01' }],
  orders: [
    {
      customerId: 'customer-1', customerAcquiredAt: '2026-07-02', type: '套餐', amount: 8000,
      payStatus: '已支付', purchaseDate: '2026-07-20', createdDate: '2026-08-03',
      servicePeople: {
        activePackageNumber: 2,
        experienceSnapshot: { amount: 288, purchaseDate: '2026-07-03', payStatus: '已支付' },
        packageHistory: [{ id: 'package-1', amount: 6000, purchaseDate: '2026-07-10', payStatus: '已支付' }],
      },
    },
    {
      customerId: 'customer-2', customerAcquiredAt: '2026-07-04', type: '体验卡', amount: 288,
      payStatus: '已支付', purchaseDate: '2026-07-05', createdDate: '2026-08-03', servicePeople: {},
    },
  ],
};

test('dashboard stats use each sale stage business date and amount', () => {
  assert.deepEqual(buildDashboardStats(input), {
    new_customers: 3, total_revenue: 14576, experience_revenue: 576, upgrade_revenue: 14000,
    experience_cards: 2, purchase_rate: 66.7, upgrades: 1, first_upgrade_customers: 1,
    upgrade_rate: 50, second_upgrade_count: 1, second_upgrade_customers: 1,
    second_upgrade_rate: 100, second_upgrade_revenue: 8000,
  });
});

test('day, week, and month chart totals match dashboard stats', () => {
  for (const granularity of ['day', 'week', 'month']) {
    const totals = buildDashboardChart(input, granularity).reduce((sum, row) => ({
      revenue: sum.revenue + row.revenue,
      newCustomers: sum.newCustomers + row.new_customers,
      experienceCards: sum.experienceCards + row.experience_cards,
      upgrades: sum.upgrades + row.upgrades,
      secondUpgrades: sum.secondUpgrades + row.second_upgrades,
    }), { revenue: 0, newCustomers: 0, experienceCards: 0, upgrades: 0, secondUpgrades: 0 });
    assert.deepEqual(totals, { revenue: 14576, newCustomers: 3, experienceCards: 2, upgrades: 1, secondUpgrades: 1 });
  }
});
