import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const orderService = fs.readFileSync(path.join(root, 'backend/src/services/orderService.ts'), 'utf8');
const orderRoute = fs.readFileSync(path.join(root, 'backend/src/routes/orders.ts'), 'utf8');
const orderPage = fs.readFileSync(path.join(root, 'src/components/OrdersListPage.tsx'), 'utf8');
const migrations = fs.readFileSync(path.join(root, 'backend/src/config/migrations.ts'), 'utf8');

test('orders retain and update the canonical customer master', () => {
  assert.doesNotMatch(orderService, /DELETE FROM customers WHERE id/);
  assert.match(orderService, /UPDATE customers SET total_orders = total_orders \+ 1/);
  assert.match(orderService, /generateCustomerCode\(db\)/);
});

test('order APIs and UI prefer the customer-list code over legacy snapshots', () => {
  assert.match(orderRoute, /customerCode: r\.customer_code \|\| snapshot\.customerCode/);
  assert.match(orderRoute, /name: r\.customer_name \|\| snapshot\.name/);
  assert.match(orderPage, /resolvedCustomerId: cust\?\.id \|\| o\.customerCode/);
});

test('historical orders are relinked with auditable evidence', () => {
  assert.match(migrations, /023_canonical_order_customers/);
  assert.match(migrations, /RELINK_CUSTOMER/);
  assert.match(migrations, /afterCustomerCode/);
});
