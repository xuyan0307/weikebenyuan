import assert from 'node:assert/strict';

const baseUrl = (process.env.REGRESSION_BASE_URL || 'http://127.0.0.1:3100/api').replace(/\/$/, '');
const adminToken = process.env.REGRESSION_ADMIN_TOKEN || '';
const serviceToken = process.env.REGRESSION_SERVICE_TOKEN || '';

if (!adminToken) {
  throw new Error('REGRESSION_ADMIN_TOKEN is required');
}

const results = [];

async function request(path, { token = adminToken, expectedStatus = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${path} returned non-JSON content`);
    }
  }
  assert.equal(response.status, expectedStatus, `${path}: ${body?.error || `expected ${expectedStatus}, got ${response.status}`}`);
  return body;
}

async function check(name, run) {
  const startedAt = performance.now();
  await run();
  results.push({ name, durationMs: Math.round(performance.now() - startedAt) });
}

function assertPaged(body, pageSize, label) {
  assert.equal(typeof body?.total, 'number', `${label} total is missing`);
  assert.ok(Array.isArray(body?.data), `${label} data is not an array`);
  assert.ok(body.data.length <= pageSize, `${label} exceeded page size`);
}

await check('健康和数据库就绪', async () => {
  const health = await request('/health', { token: '', expectedStatus: 200 });
  const ready = await request('/ready', { token: '', expectedStatus: 200 });
  assert.equal(health.status, 'healthy');
  assert.equal(ready.database, 'connected');
});

await check('未登录访问保护', async () => {
  await request('/customers?page=1&pageSize=1', { token: '', expectedStatus: 401 });
});

await check('客户分页筛选与导出一致', async () => {
  const customers = await request('/customers?page=1&pageSize=20');
  const options = await request('/customers/filter-options');
  const exported = await request('/customers/export');
  assertPaged(customers, 20, 'customers');
  assert.ok(Array.isArray(options.advisors));
  assert.ok(Array.isArray(exported.data));
  assert.equal(customers.total, exported.data.length);

  if (customers.data.length > 0) {
    const keyword = encodeURIComponent(customers.data[0].name);
    const matches = await request(`/customers?page=1&pageSize=20&keyword=${keyword}`);
    assert.ok(matches.total >= 1, 'customer keyword search returned no match');
  }
});

const pagedCases = [
  ['订单列表', '/orders?page=1&pageSize=20'],
  ['预约列表', '/appointments?page=1&pageSize=20'],
  ['技师档案', '/therapists?page=1&pageSize=20'],
  ['服务记录', '/service-records?page=1&pageSize=20'],
  ['合同列表', '/contracts?page=1&pageSize=20'],
  ['操作日志', '/operation-logs?page=1&pageSize=20'],
];

for (const [name, path] of pagedCases) {
  await check(name, async () => {
    const body = await request(path);
    assertPaged(body, 20, name);
  });
}

await check('财务查询', async () => {
  const salary = await request('/finance/salary');
  const income = await request('/finance/income');
  assert.ok(salary !== null);
  assert.ok(income !== null);
});

await check('首页看板查询', async () => {
  await request('/dashboard/stats?period=month');
  await request('/dashboard/recent');
  await request('/dashboard/todos');
  await request('/dashboard/chart?period=month');
});

await check('管理员用户查询', async () => {
  const users = await request('/users');
  assert.ok(Array.isArray(users.data));
});

if (serviceToken) {
  await check('客服角色权限边界', async () => {
    await request('/customers?page=1&pageSize=1', { token: serviceToken });
    await request('/dashboard/stats?period=month', { token: serviceToken });
    await request('/customers/export', { token: serviceToken, expectedStatus: 403 });
    await request('/users', { token: serviceToken, expectedStatus: 403 });
    await request('/operation-logs?page=1&pageSize=1', { token: serviceToken, expectedStatus: 403 });
  });
}

for (const result of results) {
  console.log(`PASS ${result.name} (${result.durationMs}ms)`);
}
console.log(`API regression passed: ${results.length} checks`);
