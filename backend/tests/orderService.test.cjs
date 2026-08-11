const test = require('node:test');
require('./orderPurchaseRangeService.test.cjs');
require('./followHistoryService.test.cjs');
require('./formStability.test.cjs');
const assert = require('node:assert/strict');
const {
  applyCanonicalCustomerTag,
  canManuallyEditServiceProgress,
  normalizePayStatus,
} = require('../dist/services/orderService');

test('applyCanonicalCustomerTag replaces the only mutable customer tag', () => {
  const original = { id: 'customer-1', name: 'Test', tag: 'D1', area: 'Xiamen' };
  const updated = applyCanonicalCustomerTag(original, 'C1');

  assert.deepEqual(updated, { ...original, tag: 'C1' });
  assert.equal(original.tag, 'D1');
});

test('normalizePayStatus accepts current and legacy paid values', () => {
  assert.equal(normalizePayStatus('已支付'), '已付款');
  assert.equal(normalizePayStatus('已付款'), '已付款');
  assert.equal(normalizePayStatus('已付定金'), '已付定金');
  assert.equal(normalizePayStatus('已退款'), '已退款');
});

test('normalizePayStatus defaults empty and unknown values to pending', () => {
  assert.equal(normalizePayStatus(), '待付款');
  assert.equal(normalizePayStatus('未知状态'), '待付款');
});

test('service advisors can manually edit order service status and counts', () => {
  assert.equal(canManuallyEditServiceProgress('service'), true);
  assert.equal(canManuallyEditServiceProgress('admin'), true);
  assert.equal(canManuallyEditServiceProgress('superadmin'), true);
  assert.equal(canManuallyEditServiceProgress('therapist'), false);
  assert.equal(canManuallyEditServiceProgress(), false);
});
