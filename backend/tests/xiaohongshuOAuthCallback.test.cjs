const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const {
  xiaohongshuOAuthRouter,
} = require('../dist/routes/xiaohongshuOAuth.js');

async function withServer(run) {
  const app = express();
  app.use('/api/oauth', xiaohongshuOAuthRouter);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

test('redirects a valid Xiaohongshu callback to the fixed local receiver', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(
      `${baseUrl}/api/oauth/xiaohongshu/callback?auth_code=short-lived-code&state=expected-state`,
      { redirect: 'manual' },
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      'http://127.0.0.1:8799/xhs/juguang/oauth/callback?auth_code=short-lived-code&state=expected-state',
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  });
});

test('rejects callbacks without both an authorization code and state', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(
      `${baseUrl}/api/oauth/xiaohongshu/callback?auth_code=short-lived-code`,
      { redirect: 'manual' },
    );

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
    assert.doesNotMatch(await response.text(), /short-lived-code/);
  });
});
