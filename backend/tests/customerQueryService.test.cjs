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

test('customer query partitions follow time around today', () => {
  const today = buildCustomerWhere({ followTimes: ['today'] });
  assert.match(today.whereSql, /DATE\(c\.follow_date\) = CURDATE\(\)/);
  assert.doesNotMatch(today.whereSql, /DATE\(c\.follow_date\) [<>] CURDATE\(\)/);
  assert.doesNotMatch(today.whereSql, /c\.follow_date IS NULL/);

  const overdue = buildCustomerWhere({ followTimes: ['overdue'] });
  assert.match(overdue.whereSql, /DATE\(c\.follow_date\) < CURDATE\(\)/);
  assert.doesNotMatch(overdue.whereSql, /DATE\(c\.follow_date\) [=>] CURDATE\(\)/);
  assert.doesNotMatch(overdue.whereSql, /c\.follow_date IS NULL/);

  const pending = buildCustomerWhere({ followTimes: ['pending'] });
  assert.match(pending.whereSql, /DATE\(c\.follow_date\) > CURDATE\(\)/);
  assert.doesNotMatch(pending.whereSql, /DATE\(c\.follow_date\) [=<] CURDATE\(\)/);
  assert.doesNotMatch(pending.whereSql, /c\.follow_date IS NULL/);
});

test('customer query includes undated rows only when all follow times are selected', () => {
  const result = buildCustomerWhere({
    followTimes: ['today', 'overdue', 'pending'],
  });
  assert.match(result.whereSql, /c\.tag IN \('D1','D2','D3'\)/);
  assert.match(result.whereSql, /COALESCE\(c\.total_orders, 0\) = 0/);
  assert.doesNotMatch(result.whereSql, /follow_date/);
  assert.deepEqual(result.params, []);
});

test('customer query returns no rows when all follow times are deselected', () => {
  const result = buildCustomerWhere({
    includeOrdered: true,
    followTimes: ['none'],
  });
  assert.equal(result.whereSql, 'WHERE 1=0');
  assert.deepEqual(result.params, []);
});
