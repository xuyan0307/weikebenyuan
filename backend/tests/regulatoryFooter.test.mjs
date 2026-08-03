import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const footerSource = await readFile(
  new URL('../../src/components/RegulatoryFooter.tsx', import.meta.url),
  'utf8',
);
const shellSource = await readFile(new URL('../../src/pages/Index.tsx', import.meta.url), 'utf8');
const loginSource = await readFile(new URL('../../src/pages/Login.tsx', import.meta.url), 'utf8');

test('the ICP filing is rendered globally and links to MIIT', () => {
  assert.match(footerSource, /闽ICP备2025084332号-2/);
  assert.match(footerSource, /https:\/\/beian\.miit\.gov\.cn\//);
  assert.match(shellSource, /<RegulatoryFooter/);
  assert.match(loginSource, /<RegulatoryFooter/);
});
