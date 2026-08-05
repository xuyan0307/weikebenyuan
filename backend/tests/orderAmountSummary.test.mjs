import assert from 'node:assert/strict';
import test from 'node:test';
import { sumOrderAmountStages } from '../../src/utils/orderAmountSummary.ts';

test('order amount summary counts every row even when business order numbers repeat', () => {
  const totals = sumOrderAmountStages([
    [{ key: 'package-1', amount: 8800 }],
    [{ key: 'package-1', amount: 6000 }],
    [{ key: 'package-2', amount: 1800 }],
  ]);

  assert.equal(totals.get('package-1'), 14800);
  assert.equal(totals.get('package-2'), 1800);
});

test('order amount summary uses currency precision and ignores invalid values', () => {
  const totals = sumOrderAmountStages([
    [{ key: 'package-1', amount: 0.1 }],
    [{ key: 'package-1', amount: 0.2 }],
    [{ key: 'package-1', amount: Number.NaN }],
  ]);

  assert.equal(totals.get('package-1'), 0.3);
});

test('order amount summary matches the displayed last stage value within one row', () => {
  const totals = sumOrderAmountStages([
    [
      { key: 'package-1', amount: 5000 },
      { key: 'package-1', amount: 8800 },
    ],
  ]);

  assert.equal(totals.get('package-1'), 8800);
});
