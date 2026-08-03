import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_FILTER_NONE,
  matchesGlobalMultiSelect,
  toggleGlobalMultiSelectAll,
  toggleGlobalMultiSelectOption,
} from '../../src/utils/multiSelectFilter.ts';

const options = ['需通知', '已通知', '延迟', '遗漏'];

test('global multi-select defaults to all and supports all-none toggling', () => {
  assert.equal(matchesGlobalMultiSelect('需通知', []), true);
  assert.equal(matchesGlobalMultiSelect('遗漏', []), true);
  assert.deepEqual(toggleGlobalMultiSelectAll([], options), [GLOBAL_FILTER_NONE]);
  assert.equal(matchesGlobalMultiSelect('需通知', [GLOBAL_FILTER_NONE]), false);
  assert.deepEqual(toggleGlobalMultiSelectAll([GLOBAL_FILTER_NONE], options), []);
});

test('global multi-select supports single and multiple selections', () => {
  const single = toggleGlobalMultiSelectOption([], '需通知', options);
  assert.deepEqual(single, ['需通知']);
  assert.equal(matchesGlobalMultiSelect('需通知', single), true);
  assert.equal(matchesGlobalMultiSelect('遗漏', single), false);

  const multiple = toggleGlobalMultiSelectOption(single, '延迟', options);
  assert.deepEqual(multiple, ['需通知', '延迟']);
  assert.equal(matchesGlobalMultiSelect('需通知', multiple), true);
  assert.equal(matchesGlobalMultiSelect('延迟', multiple), true);
  assert.equal(matchesGlobalMultiSelect('已通知', multiple), false);
});
