import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { therapistOrigins } from '../../src/utils/therapistOrigins.ts';
test('both origins retain separate positions including a second-only address', () => {
  assert.deepEqual(therapistOrigins({ dispatchLocations: [{ label: '出发地址1', address: '家' }, { label: '出发地址2', address: '门店' }] }), ['家', '门店']);
  assert.deepEqual(therapistOrigins({ dispatchLocations: [{ label: '出发地址2', address: '门店' }] }), ['', '门店']);
  assert.deepEqual(therapistOrigins({ dispatchLocations: [{ label: '旧地址', address: '原地址' }] }), ['原地址', '']);
});
test('fallback matches dispatch and does not populate editable slots', () => {
  assert.deepEqual(therapistOrigins({ detailAddress: '住址' }), ['住址', '']);
  assert.deepEqual(therapistOrigins({ detailAddress: '住址' }, false), ['', '']);
});
test('archive list removes birth year and renders both origins without truncation', async () => {
  const source = await readFile(new URL('../../src/components/TherapistListPage.tsx', import.meta.url), 'utf8');
  const headers = source.match(/const THERAPIST_COLUMN_HEADERS = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(headers, /出生年份/);
  assert.match(headers, /出发地址1.*出发地址2/);
  assert.match(source, /therapistOrigins\(t\).map/);
  assert.match(source, /whitespace-normal break-words/);
  assert.match(source, /InfoRow label="出发地址2"/);
});
