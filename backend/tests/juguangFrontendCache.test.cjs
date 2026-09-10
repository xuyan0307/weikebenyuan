const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pageSource = fs.readFileSync(
  path.join(__dirname, '../../src/components/JuguangPage.tsx'),
  'utf8',
);

test('renders an existing Juguang snapshot without waiting for page-open refresh', () => {
  assert.match(
    pageSource,
    /const displayReady = rangeReady \|\| Boolean\(currentLastSyncedAt\)/,
  );
  assert.match(pageSource, /data=\{displayReady \? overviewQ\.data : undefined\}/);
  assert.match(pageSource, /loading=\{overviewQ\.isLoading \|\| !displayReady\}/);
  assert.doesNotMatch(pageSource, /data=\{rangeReady \? overviewQ\.data : undefined\}/);
});

test('stops page-open polling when the backend reports a durable sync block', () => {
  assert.match(pageSource, /\['reauthorization_required', 'storage_error', 'failed'\]\.includes/);
  assert.match(pageSource, /setSyncError\(result\.error \|\| '聚光同步失败，请稍后重试'\)/);
  assert.match(pageSource, /syncError && page !== 'sync'/);
});
