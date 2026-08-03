import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/components/SystemSettingsPage.tsx', import.meta.url),
  'utf8',
);

test('system account search starts empty and is not treated as a login username field', () => {
  assert.match(source, /const \[searchText, setSearchText\] = useState\(''\)/);
  assert.match(source, /type="search"/);
  assert.match(source, /name="system-user-directory-search"/);
  assert.match(source, /autoComplete="off"/);
  assert.match(source, /data-form-type="other"/);
});
