const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  storageProjection,
  nextShanghaiDailyRefresh,
} = require('../dist/services/systemParametersService.js');

test('storage projection calculates independent used, free and percentage values', () => {
  assert.deepEqual(storageProjection(25, 100), { freeBytes: 75, usagePercent: 25 });
  assert.deepEqual(storageProjection(120, 100), { freeBytes: 0, usagePercent: 100 });
  assert.deepEqual(storageProjection(25, null), { freeBytes: null, usagePercent: null });
});

test('automatic refresh is scheduled for 00:05 Asia/Shanghai on the next day', () => {
  const now = new Date('2026-08-28T15:59:00.000Z'); // Shanghai 23:59
  assert.equal(nextShanghaiDailyRefresh(now).toISOString(), '2026-08-28T16:05:00.000Z');
});

test('system parameters routes are protected and settings navigation exposes both pages', () => {
  const root = path.resolve(__dirname, '../..');
  const route = fs.readFileSync(path.join(root, 'backend/src/routes/settings.ts'), 'utf8');
  const sidebar = fs.readFileSync(path.join(root, 'src/components/Sidebar.tsx'), 'utf8');
  assert.match(route, /system-parameters\/summary[\s\S]*authorizeRoles\('superadmin', 'admin'\)/);
  assert.match(route, /system-parameters\/refresh[\s\S]*authorizeRoles\('superadmin', 'admin'\)/);
  assert.match(sidebar, /settings-main', label: '账号设置'/);
  assert.match(sidebar, /settings-parameters', label: '系统参数'/);
  const compose = fs.readFileSync(path.join(root, 'docker-compose.prod.yml'), 'utf8');
  assert.match(compose, /RDS_STORAGE_TOTAL_GB/);
  assert.match(compose, /OSS_STORAGE_TOTAL_GB/);
});
