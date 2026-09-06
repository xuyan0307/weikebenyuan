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

test('all platform pages share one footer outside the scrollable main area', async () => {
  assert.equal((shellSource.match(/<RegulatoryFooter/g) || []).length, 1);
  const main = shellSource.slice(shellSource.indexOf('<main'), shellSource.indexOf('</main>'));
  assert.doesNotMatch(main, /RegulatoryFooter/);
  assert.ok(shellSource.indexOf('<RegulatoryFooter') > shellSource.indexOf('</main>'));
  assert.doesNotMatch(main, /activePage === 'dispatch-assistant'/);
  assert.match(main, /overflow-y-auto/);
  const css = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');
  const rule = css.match(/\.app-regulatory-footer\s*\{([^}]+)\}/)[1];
  assert.match(rule, /flex-shrink: 0/);
  assert.match(rule, /safe-area-inset-bottom/);
  assert.doesNotMatch(rule, /position:\s*(fixed|absolute)/);
});
