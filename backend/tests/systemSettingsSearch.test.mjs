import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldClearAccountSearchAutofill } from '../../src/utils/accountSearch.ts';

const source = await readFile(
  new URL('../../src/components/SystemSettingsPage.tsx', import.meta.url),
  'utf8',
);

test('system account search starts empty and is not treated as a login username field', () => {
  assert.match(source, /const \[searchText, setSearchText\] = useState\(''\)/);
  assert.match(source, /type="text"/);
  assert.match(source, /name={`system-account-filter-\$\{currentUser\.id\}`}/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /readOnly={!searchUnlocked}/);
  assert.match(source, /onPointerDown=/);
  assert.match(source, /data-form-type="other"/);
  assert.match(source, /clearDelayedLoginAutofill/);
  assert.match(source, /searchHasUserInputRef/);
  assert.match(source, /onKeyDown=/);
  assert.match(source, /onPaste=/);
});

test('deleting a browser-filled login name clears the whole value in one action', () => {
  assert.match(source, /e\.key === 'Backspace' \|\| e\.key === 'Delete'/);
  assert.match(source, /e\.preventDefault\(\)/);
  assert.match(source, /setSearchText\(''\)/);
});

test('delayed browser autofill matching the signed-in account is cleared', () => {
  assert.equal(shouldClearAccountSearchAutofill('admin', 'admin', '超级管理员'), true);
  assert.equal(shouldClearAccountSearchAutofill(' 超级管理员 ', 'admin', '超级管理员'), true);
  assert.equal(shouldClearAccountSearchAutofill('zhiyu', 'admin', '超级管理员'), false);
});

test('an intentional search remains available after the user starts typing', () => {
  assert.equal(shouldClearAccountSearchAutofill('admin', 'admin', '超级管理员', true), false);
  assert.equal(shouldClearAccountSearchAutofill('', 'admin', '超级管理员'), false);
});
