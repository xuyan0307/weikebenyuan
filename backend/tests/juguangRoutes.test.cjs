const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const { signToken } = require('../dist/middleware/auth.js');
const { juguangRouter } = require('../dist/routes/juguang.js');

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/juguang', juguangRouter);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.isOperational ? error.message : 'Internal server error' });
  });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function auth(role) {
  const token = signToken({ id: `${role}-test-user`, role, name: `${role} tester` });
  return { Authorization: `Bearer ${token}` };
}

test('does not let finance users bypass the menu to read content reports', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/juguang/reports/note?startDate=2026-09-05&endDate=2026-09-05`, {
      headers: auth('finance'),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: '无权限访问' });
  });
});

test('restricts audience and synchronization diagnostics to administrators', async () => {
  await withServer(async baseUrl => {
    const audience = await fetch(`${baseUrl}/api/juguang/reports/geo?startDate=2026-09-05&endDate=2026-09-05`, {
      headers: auth('service'),
    });
    const sync = await fetch(`${baseUrl}/api/juguang/sync/status`, { headers: auth('service') });
    assert.equal(audience.status, 403);
    assert.equal(sync.status, 403);
  });
});

test('keeps the entire Juguang module unavailable to therapist accounts', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/juguang/overview`, { headers: auth('therapist') });
    assert.equal(response.status, 403);
  });
});

test('rejects unknown report types before any database query', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/juguang/reports/not-a-report`, { headers: auth('admin') });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: '不支持的聚光报表类型' });
  });
});
