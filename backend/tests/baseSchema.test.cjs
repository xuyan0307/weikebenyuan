const assert = require('node:assert/strict');
const { test } = require('node:test');

const { ensureBaseSchema, splitSchemaStatements } = require('../dist/config/baseSchema.js');

test('base schema parser ignores comments and retains executable statements', () => {
  const statements = splitSchemaStatements('-- comment\nSET NAMES utf8mb4;\nCREATE TABLE users (id int);');
  assert.deepEqual(statements, ['SET NAMES utf8mb4', 'CREATE TABLE users (id int)']);
});

test('empty database initializes all base tables before migrations', async () => {
  const executed = [];
  const pool = {
    query: async (sql) => {
      if (sql.includes('information_schema.TABLES')) return [[{ cnt: 0 }]];
      executed.push(sql);
      return [[]];
    },
  };

  await ensureBaseSchema(pool);

  const createTables = executed.filter(sql => /^CREATE TABLE/i.test(sql));
  assert.equal(createTables.length, 10);
  assert.ok(createTables.some(sql => /CREATE TABLE `users`/i.test(sql)));
  assert.ok(createTables.some(sql => /CREATE TABLE `operation_logs`/i.test(sql)));
});

test('existing database skips base schema initialization', async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      return [[{ cnt: 1 }]];
    },
  };

  await ensureBaseSchema(pool);
  assert.equal(calls, 1);
});
