const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');

const { seedIfEmpty } = require('../dist/config/seed.js');

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  BOOTSTRAP_ADMIN_USERNAME: process.env.BOOTSTRAP_ADMIN_USERNAME,
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  BOOTSTRAP_ADMIN_NAME: process.env.BOOTSTRAP_ADMIN_NAME,
};

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function emptyDatabasePool() {
  const executions = [];
  return {
    executions,
    query: async () => [[{ cnt: 0 }]],
    execute: async (sql, params) => {
      executions.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
}

beforeEach(() => {
  delete process.env.BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  delete process.env.BOOTSTRAP_ADMIN_NAME;
});

afterEach(() => {
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) restoreEnv(name, value);
});

test('empty production database rejects missing bootstrap credentials', async () => {
  process.env.NODE_ENV = 'production';
  const pool = emptyDatabasePool();

  await assert.rejects(
    () => seedIfEmpty(pool),
    /BOOTSTRAP_ADMIN_USERNAME.*BOOTSTRAP_ADMIN_PASSWORD/
  );
  assert.equal(pool.executions.length, 0);
});

test('empty production database creates only the configured superadmin', async () => {
  process.env.NODE_ENV = 'production';
  process.env.BOOTSTRAP_ADMIN_USERNAME = 'release-admin';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'strong-password-for-test';
  process.env.BOOTSTRAP_ADMIN_NAME = '发布管理员';
  const pool = emptyDatabasePool();

  await seedIfEmpty(pool);

  assert.equal(pool.executions.length, 1);
  const params = pool.executions[0].params;
  assert.equal(params[1], 'release-admin');
  assert.equal(params[3], '发布管理员');
  assert.equal(params[4], 'superadmin');
  assert.notEqual(params[2], process.env.BOOTSTRAP_ADMIN_PASSWORD);
});

test('empty development database retains the five local demo users', async () => {
  process.env.NODE_ENV = 'development';
  const pool = emptyDatabasePool();

  await seedIfEmpty(pool);

  assert.equal(pool.executions.length, 5);
  assert.deepEqual(
    pool.executions.map(({ params }) => params[1]),
    ['admin', 'zhang', 'li', 'wang', 'zhao']
  );
});
