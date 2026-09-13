import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../src/components/OrdersListPage.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');

test('service table no longer forces a desktop-width horizontal scroller', () => {
  assert.match(source, /service-person-table rounded-xl/);
  assert.doesNotMatch(source, /minWidth: form.orderType === '套餐' \? 900 : 600/);
  assert.match(css, /\.service-person-table \.service-person-package\s*\{\s*grid-template-columns: minmax\(0,/);
  assert.match(css, /\.service-person-table \.service-person-heading > \*\s*\{\s*width: 100%;\s*min-width: 0;/);
});

test('narrow dialogs wrap service inputs with explicit counter labels', () => {
  assert.match(css, /@container \(max-width: 520px\)/);
  assert.match(css, /content: '服务总次数'/);
  assert.match(css, /content: '已服务次数'/);
  assert.match(css, /content: '服务状态'/);
});
