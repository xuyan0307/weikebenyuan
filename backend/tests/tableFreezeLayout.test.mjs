import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const customersSource = readFileSync(new URL('../../src/components/CustomersListPage.tsx', import.meta.url), 'utf8');
const ordersSource = readFileSync(new URL('../../src/components/OrdersListPage.tsx', import.meta.url), 'utf8');

function assertSharedFreezeContract(source, timeLabel) {
  assert.match(source, /const COL_W = \[82, 110\]/, 'left freeze pane must contain exactly two columns');
  assert.match(source, new RegExp(`<th style=\\{STICKY_TH_STYLE\\(0\\)\\}>${timeLabel}<\\/th>[\\s\\S]*?<th style=\\{STICKY_TH_STYLE\\(1\\)\\}>客户姓名<\\/th>`));
  assert.doesNotMatch(source, /STICKY_TH_STYLE\([23]\)/, 'tag and customer id must not remain left-frozen');
  assert.match(source, /const ACTION_COL_W = 136;/, 'right-frozen action column must fit both full buttons');
  assert.match(source, /<th style=\{STICKY_RIGHT_TH_STYLE\}>操作<\/th>/, 'operation header must be right-frozen');
  assert.match(source, /<td style=\{STICKY_RIGHT_TD_STYLE\([^)]*\)\}>[\s\S]*?<RecordActionButtons/, 'operation cells must be right-frozen');
}

test('customer table freezes only acquisition time/name and places id after advisor', () => {
  assertSharedFreezeContract(customersSource, '获客时间');
  assert.match(customersSource, /<th[^>]*>归属客服<\/th>\s*<th[^>]*>客户ID<\/th>\s*<th style=\{STICKY_RIGHT_TH_STYLE\}>操作<\/th>/);
});

test('order table freezes only purchase time/name and places id after advisor', () => {
  assertSharedFreezeContract(ordersSource, '购卡时间');
  assert.match(ordersSource, /<th>归属客服<\/th>\s*<th[^>]*>客户ID<\/th>\s*<th>技师<\/th>/);
});
