const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePercentage } = require('../dist/services/dashboardMetrics.js');
require('./dashboardAnalyticsService.test.cjs');

test('calculatePercentage returns one decimal percentage', () => {
  assert.equal(calculatePercentage(3, 8), 37.5);
  assert.equal(calculatePercentage(2, 3), 66.7);
});

test('calculatePercentage returns zero when denominator is unavailable', () => {
  assert.equal(calculatePercentage(0, 0), 0);
  assert.equal(calculatePercentage(3, 0), 0);
});
