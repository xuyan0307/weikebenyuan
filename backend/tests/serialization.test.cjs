const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDateOnly, jsonOrNull, parseJson } = require('../dist/utils/serialization');

test('parseJson handles database JSON values and malformed legacy values', () => {
  assert.deepEqual(parseJson('{"status":"ok"}', {}), { status: 'ok' });
  assert.deepEqual(parseJson({ status: 'ok' }, {}), { status: 'ok' });
  assert.deepEqual(parseJson('invalid', []), []);
  assert.deepEqual(parseJson(null, []), []);
});

test('jsonOrNull preserves null and serializes structured values', () => {
  assert.equal(jsonOrNull(null), null);
  assert.equal(jsonOrNull({ count: 2 }), '{"count":2}');
});

test('formatDateOnly does not shift database date strings across timezones', () => {
  assert.equal(formatDateOnly('2026-07-17T16:00:00.000Z'), '2026-07-17');
  assert.equal(formatDateOnly('2026-07-17'), '2026-07-17');
  assert.equal(formatDateOnly(''), '');
});
