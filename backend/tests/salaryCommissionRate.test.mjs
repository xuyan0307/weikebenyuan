import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migrations = readFileSync(new URL('../src/config/migrations.ts', import.meta.url), 'utf8');
const financeRoute = readFileSync(new URL('../src/routes/finance.ts', import.meta.url), 'utf8');
const salaryPage = readFileSync(new URL('../../src/components/FinanceSalaryPage.tsx', import.meta.url), 'utf8');

test('persists a customer-level commission rate with auditable finance mutation', () => {
  assert.match(migrations, /024_salary_customer_commission_rate/);
  assert.match(migrations, /salary_customer_adjustments[\s\S]*commission_rate/);
  assert.match(financeRoute, /commission_rate = VALUES\(commission_rate\)/);
  assert.match(financeRoute, /auditLog\('finance'\)/);
  assert.match(financeRoute, /提成比例须在0至100之间/);
});

test('shows and edits the commission rate without editing the therapist profile', () => {
  assert.match(salaryPage, /'提成比例', '提成'/);
  assert.match(salaryPage, /customer\.commissionRate}%/);
  assert.match(salaryPage, /提成＝\{money\(editingCustomer\.packageAmount\)}/);
  assert.match(salaryPage, /commissionRate: customer\.commissionRate/);
});
