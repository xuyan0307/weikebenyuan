const test = require('node:test');
const assert = require('node:assert/strict');
const {
  completePastAppointments,
  millisecondsUntilNextPeriodScan,
} = require('../dist/services/appointmentAutoCompletionService');

test('automatic completion scans at the end of morning, afternoon and evening in China time', () => {
  assert.equal(
    millisecondsUntilNextPeriodScan(new Date('2026-08-25T03:59:00.000Z')),
    60 * 1000,
  );
  assert.equal(
    millisecondsUntilNextPeriodScan(new Date('2026-08-25T04:00:00.000Z')),
    6 * 60 * 60 * 1000,
  );
  assert.equal(
    millisecondsUntilNextPeriodScan(new Date('2026-08-25T10:00:00.000Z')),
    6 * 60 * 60 * 1000,
  );
});

test('automatic completion only scans elapsed active non-backfill appointments', async () => {
  const calls = [];
  const pool = {
    query: async sql => {
      calls.push(String(sql));
      return [[], []];
    },
  };

  const result = await completePastAppointments(pool);
  assert.deepEqual(result, { checked: 0, completed: 0, failed: 0 });
  assert.match(calls[0], /status IN \('待确认', '已确认'\)/);
  assert.match(calls[0], /is_backfill = 0/);
  assert.match(calls[0], /TIMESTAMP\(DATE\(a\.date\), TIME\(SUBSTRING_INDEX\(a\.time_slot/);
  assert.match(calls[0], /CONVERT_TZ\(UTC_TIMESTAMP\(\), '\+00:00', '\+08:00'\)/);
});
