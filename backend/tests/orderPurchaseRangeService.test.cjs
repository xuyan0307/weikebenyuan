const test = require('node:test');
const assert = require('node:assert/strict');
const { projectOrderPurchaseRange } = require('../dist/services/orderPurchaseRangeService.js');

const order = {
  type: '套餐',
  purchaseDate: '2026-07-08',
  createdDate: '2026-08-03',
  servicePeople: {
    activePackageNumber: 2,
    experienceSnapshot: { purchaseDate: '2026-05-06', amount: 288 },
    packageHistory: [{ id: 'package-1', purchaseDate: '2026-06-10', amount: 8800 }],
  },
};

test('purchase range exposes only stages purchased inside the selected dates', () => {
  assert.deepEqual(projectOrderPurchaseRange(order, '2026-07-01', '2026-07-31'), {
    active: true,
    displayPurchaseDate: '2026-07-08',
    visibleStageKeys: ['package-2'],
  });
  assert.deepEqual(projectOrderPurchaseRange(order, '2026-06-01', '2026-06-30').visibleStageKeys, ['package-1']);
  assert.deepEqual(projectOrderPurchaseRange(order, '2026-05-01', '2026-05-31').visibleStageKeys, ['experience']);
});

test('purchase range excludes orders without any matching purchase stage', () => {
  const projection = projectOrderPurchaseRange(order, '2026-04-01', '2026-04-30');
  assert.equal(projection.displayPurchaseDate, '');
  assert.deepEqual(projection.visibleStageKeys, []);
});

test('unfiltered projection retains every purchase stage', () => {
  assert.deepEqual(projectOrderPurchaseRange(order).visibleStageKeys, ['experience', 'package-1', 'package-2']);
});
