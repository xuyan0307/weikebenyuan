const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('stateful form components are declared at module scope to prevent input remount jitter', () => {
  const customers = fs.readFileSync(path.join(root, 'src/components/CustomersListPage.tsx'), 'utf8');
  const finance = fs.readFileSync(path.join(root, 'src/components/FinanceIncomePage.tsx'), 'utf8');
  assert.doesNotMatch(customers, /^  function ModalWrap\(/m);
  assert.match(customers, /^function CustomerModalWrap\(/m);
  assert.doesNotMatch(finance, /^  function Inline(?:String|Money)Cell\(/m);
  assert.match(finance, /^function InlineStringCell\(/m);
  assert.match(finance, /^function InlineMoneyCell\(/m);
});
