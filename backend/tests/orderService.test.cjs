const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePayStatus } = require('../dist/services/orderService');

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
