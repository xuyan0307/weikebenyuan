import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const customersSource = fs.readFileSync(
  new URL('../../src/components/CustomersListPage.tsx', import.meta.url),
  'utf8',
);
const ordersSource = fs.readFileSync(
  new URL('../../src/components/OrdersListPage.tsx', import.meta.url),
  'utf8',
);

test('customer and order lists default service accounts to the signed-in advisor', () => {
  for (const source of [customersSource, ordersSource]) {
    assert.match(source, /currentUser\.role === 'service'/);
    assert.match(source, /currentUser\.name/);
  }
});

test('order advisor options include the complete customer advisor directory', () => {
  assert.match(ordersSource, /useCustomerFilterOptions\(\)/);
  assert.match(ordersSource, /customerFilterOptionsQ\.data\?\.advisors/);
});
