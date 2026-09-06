import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
const [page, shell, endpoints, client] = await Promise.all(['src/components/DispatchAssistantPage.tsx', 'src/pages/Index.tsx', 'src/api/endpoints.ts', 'src/api/client.ts'].map(read));

test('dispatch content retains its natural height before the footer', () => {
  assert.match(shell, /activePage === 'dispatch-assistant' \? 'flex grow shrink-0 flex-col'/);
  assert.ok(shell.indexOf('<RegulatoryFooter') > shell.indexOf('{renderActivePage()}'));
});

test('dispatch has no appointment date and exactly one default postpartum role', () => {
  assert.doesNotMatch(page, /appointmentDate|type="date"/);
  assert.match(page, /useState<string\[\]>\(\['产康师'\]\)/);
  assert.match(page, /type="radio" name="dispatch-role"/);
  assert.match(page, /setRoles\(\[role\]\)/);
});

test('touch submission has visible loading, error, empty states and duplicate protection', () => {
  assert.match(page, /type="button" onClick=\{handleRank\}/);
  assert.match(page, /touch-manipulation/);
  assert.match(page, /if \(requestInFlight.current\) return/);
  assert.match(page, /role="alert"/);
  assert.match(page, /hasSearched \? '50公里内暂无/);
  assert.match(page, /正在查询技师并计算距离/);
  assert.match(page, /scrollIntoView/);
});

test('dispatch network requests have a cleared abort timeout', () => {
  assert.match(endpoints, /controller.abort\(\), 55000/);
  assert.match(endpoints, /body, controller.signal/);
  assert.match(endpoints, /finally \{ clearTimeout\(timer\); \}/);
  assert.match(client, /headers,\s+signal,/);
});
