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

test('the global ICP filing keeps a single compact bottom row', () => {
  assert.match(footerSource, /h-6/);
  assert.match(footerSource, /whitespace-nowrap/);
  assert.match(footerSource, /leading-none/);
  assert.doesNotMatch(footerSource, /py-2/);
  assert.match(shellSource, /pt-5 pb-0/);
  assert.doesNotMatch(shellSource, /RegulatoryFooter className="mt-4"/);
});
