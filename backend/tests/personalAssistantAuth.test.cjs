const assert = require('node:assert/strict');
const test = require('node:test');
const {
  authenticatePersonalAssistant,
} = require('../dist/middleware/auth.js');
const {
  deterministicId,
  requestIdFrom,
} = require('../dist/routes/assistant.js');

function callAuth(headers = {}) {
  const req = { headers };
  let error;
  authenticatePersonalAssistant(req, {}, value => { error = value; });
  return { req, error };
}

test('personal assistant auth fails closed when no key is configured', () => {
  const previousKeys = process.env.PERSONAL_ASSISTANT_API_KEYS;
  const previousKey = process.env.PERSONAL_ASSISTANT_API_KEY;
  delete process.env.PERSONAL_ASSISTANT_API_KEYS;
  delete process.env.PERSONAL_ASSISTANT_API_KEY;
  try {
    const { error } = callAuth({ 'x-assistant-key': 'anything' });
    assert.equal(error?.statusCode, 503);
  } finally {
    if (previousKeys === undefined) delete process.env.PERSONAL_ASSISTANT_API_KEYS;
    else process.env.PERSONAL_ASSISTANT_API_KEYS = previousKeys;
    if (previousKey === undefined) delete process.env.PERSONAL_ASSISTANT_API_KEY;
    else process.env.PERSONAL_ASSISTANT_API_KEY = previousKey;
  }
});
test('personal assistant auth accepts rotating keys and records a synthetic audit identity', () => {
  const previousKeys = process.env.PERSONAL_ASSISTANT_API_KEYS;
  const previousId = process.env.PERSONAL_ASSISTANT_USER_ID;
  const previousName = process.env.PERSONAL_ASSISTANT_USER_NAME;
  process.env.PERSONAL_ASSISTANT_API_KEYS = 'old-key,current-key';
  process.env.PERSONAL_ASSISTANT_USER_ID = 'assistant-audit-id';
  process.env.PERSONAL_ASSISTANT_USER_NAME = '预约助理';
  try {
    const { req, error } = callAuth({ 'x-assistant-key': 'current-key' });
    assert.equal(error, undefined);
    assert.equal(req.userId, 'assistant-audit-id');
    assert.equal(req.userRole, 'service');
    assert.equal(req.userName, '预约助理');

    const rejected = callAuth({ 'x-assistant-key': 'wrong-key' });
    assert.equal(rejected.error?.statusCode, 401);
  } finally {
    if (previousKeys === undefined) delete process.env.PERSONAL_ASSISTANT_API_KEYS;
    else process.env.PERSONAL_ASSISTANT_API_KEYS = previousKeys;
    if (previousId === undefined) delete process.env.PERSONAL_ASSISTANT_USER_ID;
    else process.env.PERSONAL_ASSISTANT_USER_ID = previousId;
    if (previousName === undefined) delete process.env.PERSONAL_ASSISTANT_USER_NAME;
    else process.env.PERSONAL_ASSISTANT_USER_NAME = previousName;
  }
});

test('write request IDs are validated and deterministically mapped to resource IDs', () => {
  const request = { headers: { 'x-request-id': 'mcp:customer:20260829:abc-123' } };
  assert.equal(requestIdFrom(request), 'mcp:customer:20260829:abc-123');
  const first = deterministicId('pa', requestIdFrom(request));
  const second = deterministicId('pa', requestIdFrom(request));
  assert.equal(first, second);
  assert.match(first, /^pa-[a-f0-9]{32}$/);
  assert.throws(
    () => requestIdFrom({ headers: { 'x-request-id': 'contains spaces' } }),
    error => error?.statusCode === 400
  );
});
