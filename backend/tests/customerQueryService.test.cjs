const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCustomerWhere } = require('../dist/services/customerQueryService');

test('customer query keeps the default lead-pool boundary', () => {
  const result = buildCustomerWhere({});
  assert.match(result.whereSql, /c\.tag IN \('D1','D2','D3'\)/);
  assert.match(result.whereSql, /COALESCE\(c\.total_orders, 0\) = 0/);
  assert.deepEqual(result.params, []);
});

test('customer query builds keyword, date and multi-select filters', () => {
  const result = buildCustomerWhere({
    keyword: '测试',
    dateRange: 'month',
    areas: ['厦门', '泉州'],
    sources: ['小红书'],
    statuses: ['待跟进', '延迟'],
    tags: ['D1', 'D2'],
    advisors: ['李客服'],
  });

  assert.match(result.whereSql, /c\.wechat LIKE/);
  assert.match(result.whereSql, /DATE_FORMAT\(c\.acquired_at/);
  assert.match(result.whereSql, /c\.area LIKE \? OR c\.area LIKE \?/);
  assert.match(result.whereSql, /followDisplayStatus/);
  assert.deepEqual(result.params, [
    '%测试%', '%测试%', '%测试%', '%测试%',
    '%厦门%', '%泉州%',
    '小红书',
    'D1', 'D2',
    '李客服',
    '待跟进', '延迟',
  ]);
});

test('customer query can explicitly include ordered customers', () => {
  const result = buildCustomerWhere({ includeOrdered: true });
  assert.equal(result.whereSql, '');
  assert.deepEqual(result.params, []);
});
