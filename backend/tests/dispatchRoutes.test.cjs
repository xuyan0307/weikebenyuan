const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { dispatchRouter } = require('../dist/routes/dispatch');
const { signToken } = require('../dist/middleware/auth');
const database = require('../dist/config/database');

test('dispatch APIs require login, enforce service roles, validate input and use archive counts', async () => {
  const original = database.getDb;
  database.getDb = () => ({ query: async () => [[{ role: '产康师', count: 3 }]] });
  const app = express();
  app.use(express.json());
  app.use('/api/dispatch', dispatchRouter);
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/dispatch`;
  const headers = role => ({ Authorization: `Bearer ${signToken({ id: 'test-dispatch', role, name: 'test' })}`, 'Content-Type': 'application/json' });
  try {
    assert.equal((await fetch(`${base}/source`)).status, 401);
    assert.equal((await fetch(`${base}/source`, { headers: headers('finance') })).status, 403);
    const response = await fetch(`${base}/source`, { headers: headers('service') });
    assert.equal(response.status, 200);
    const source = await response.json();
    assert.equal(source.source, '技师档案');
    assert.equal(source.total, 3);
    assert.equal('key' in source, false);
    assert.equal((await fetch(`${base}/rank`, { method: 'POST', headers: headers('service'), body: '{}' })).status, 400);
    assert.equal((await fetch(`${base}/rank`, { method: 'POST', headers: headers('service'),
      body: JSON.stringify({ city: '厦门', address: '测试地址', roles: ['invalid'] }) })).status, 400);
  } finally {
    database.getDb = original;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
