import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesOrderContractStatus,
  ORDER_CONTRACT_FILTER_NONE,
  resolveOrderContractStatus,
} from '../../src/utils/orderContractFilter.ts';

test('order contract status resolves backend signed state and experience cards', () => {
  assert.equal(
    resolveOrderContractStatus({ type: '套餐', contractSigned: true }),
    '已回签'
  );
  assert.equal(
    resolveOrderContractStatus({ type: '套餐', contractSigned: false }),
    '未回签'
  );
  assert.equal(
    resolveOrderContractStatus({ type: '体验卡', contractSigned: true }),
    '无'
  );
});

test('local contract edit overrides the persisted package state', () => {
  assert.equal(
    resolveOrderContractStatus(
      { type: '套餐', contractSigned: false },
      '已回签'
    ),
    '已回签'
  );
});

test('contract filter defaults to all and includes orders without contracts', () => {
  for (const status of ['已回签', '未回签', '无']) {
    assert.equal(matchesOrderContractStatus(status, []), true);
    assert.equal(
      matchesOrderContractStatus(status, ['已回签', '未回签']),
      true
    );
  }
});

test('signed and unsigned selections match only their package status', () => {
  assert.equal(matchesOrderContractStatus('已回签', ['已回签']), true);
  assert.equal(matchesOrderContractStatus('未回签', ['已回签']), false);
  assert.equal(matchesOrderContractStatus('无', ['已回签']), false);

  assert.equal(matchesOrderContractStatus('未回签', ['未回签']), true);
  assert.equal(matchesOrderContractStatus('已回签', ['未回签']), false);
  assert.equal(matchesOrderContractStatus('无', ['未回签']), false);
});

test('contract full deselection returns no orders', () => {
  for (const status of ['已回签', '未回签', '无']) {
    assert.equal(
      matchesOrderContractStatus(status, [ORDER_CONTRACT_FILTER_NONE]),
      false
    );
  }
});
