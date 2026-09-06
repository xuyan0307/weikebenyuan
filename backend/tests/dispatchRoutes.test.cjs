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
    assert.equal((await fetch(`${base}/settings`, { headers: headers('service') })).status, 403);
    assert.equal((await fetch(`${base}/settings`, { method: 'PUT', headers: headers('therapist'), body: JSON.stringify({ selections: [] }) })).status, 403);
    const response = await fetch(`${base}/source`, { headers: headers('service') });
    assert.equal(response.status, 200);
    const source = await response.json();
    assert.equal(source.source, '技师档案');
    assert.equal(source.total, 3);
    assert.equal('key' in source, false);
    assert.equal((await fetch(`${base}/rank`, { method: 'POST', headers: headers('service'), body: '{}' })).status, 400);
    assert.equal((await fetch(`${base}/rank`, { method: 'POST', headers: headers('service'),
      body: JSON.stringify({ city: '厦门', address: '测试地址', roles: ['invalid'] }) })).status, 400);
    assert.equal((await fetch(`${base}/rank`, { method: 'POST', headers: headers('service'),
      body: JSON.stringify({ city: '厦门', address: '测试地址', roles: ['产康师', '运动康复师'] }) })).status, 400);
  } finally {
    database.getDb = original;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('only admins save explicit archive selections transactionally', async () => {
  const original = database.getDb;
  const selections = { t1: false, t2: true };
  let snapshot; let committed = 0; let rolledBack = 0;
  const connection = {
    beginTransaction: async () => { snapshot = { ...selections }; },
    query: async (_sql, [id]) => [id in selections ? [{ id }] : []],
    execute: async (_sql, [selected, id]) => { selections[id] = !!selected; },
    commit: async () => { committed++; },
    rollback: async () => { Object.assign(selections, snapshot); rolledBack++; },
    release: () => {},
  };
  database.getDb = () => ({ getConnection: async () => connection, execute: async () => [] });
  const app = express(); app.use(express.json()); app.use('/api/dispatch', dispatchRouter);
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/dispatch/settings`;
  const save = (role, changes) => fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${signToken({ id: 'test', role, name: 'test' })}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: changes }) });
  try {
    assert.equal((await save('admin', [{ id: 't1', selected: true }])).status, 200);
    assert.deepEqual(selections, { t1: true, t2: true });
    assert.equal((await save('superadmin', [{ id: 't1', selected: false }, { id: 'deleted', selected: true }])).status, 409);
    assert.deepEqual(selections, { t1: true, t2: true });
    assert.equal((await save('superadmin', [{ id: 't2', selected: false }])).status, 200);
    assert.deepEqual(selections, { t1: true, t2: false });
    assert.equal(committed, 2); assert.equal(rolledBack, 1);
  } finally {
    await new Promise(resolve => setTimeout(resolve, 10));
    database.getDb = original; server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
