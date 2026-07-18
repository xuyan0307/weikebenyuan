const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAppointment,
  getSlotPeriod,
  incrementAssignedServicePeople,
  updateAppointmentStatus,
} = require('../dist/services/appointmentService');

test('getSlotPeriod maps booking times to the existing three schedule periods', () => {
  assert.equal(getSlotPeriod('08:00'), 'morning');
  assert.equal(getSlotPeriod('13:30'), 'afternoon');
  assert.equal(getSlotPeriod('18:00'), 'evening');
  assert.equal(getSlotPeriod(''), null);
});

test('incrementAssignedServicePeople updates only the matching therapist and respects total', () => {
  const result = incrementAssignedServicePeople({
    sp1: { assign: '张技师', usedTimes: '1', totalTimes: '2' },
    sp2: { assign: '李技师', usedTimes: '3', totalTimes: '5' },
    sp3: { assign: '张技师', usedTimes: '2', totalTimes: '2' },
  }, '张技师', 5);

  assert.equal(result.changed, true);
  assert.equal(result.value.sp1.usedTimes, '2');
  assert.equal(result.value.sp2.usedTimes, '3');
  assert.equal(result.value.sp3.usedTimes, '2');
});

test('incrementAssignedServicePeople leaves unassigned service rows unchanged', () => {
  const result = incrementAssignedServicePeople({
    sp1: { assign: '李技师', usedTimes: '0', totalTimes: '3' },
  }, '张技师', 3);

  assert.equal(result.changed, false);
  assert.equal(result.value.sp1.usedTimes, '0');
});

function fakePool(executeResults) {
  const calls = [];
  let resultIndex = 0;
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql) => {
      calls.push(sql);
      const rows = executeResults[resultIndex++] ?? [];
      return [rows, []];
    },
    query: async sql => {
      calls.push(sql);
      const rows = executeResults[resultIndex++] ?? [];
      return [rows, []];
    },
  };
  return { calls, getConnection: async () => connection };
}

test('createAppointment rolls back when the therapist period is already booked', async () => {
  const pool = fakePool([
    [{ id: 'therapist-1' }],
    [{ time_slot: '09:00' }],
  ]);

  await assert.rejects(
    createAppointment({
      customerId: 'customer-1',
      therapistId: 'therapist-1',
      date: '2026-07-18',
      timeSlot: '10:00',
    }, pool),
    error => error.statusCode === 409
  );
  assert.equal(pool.calls.includes('commit'), false);
  assert.equal(pool.calls.includes('rollback'), true);
  assert.equal(pool.calls.at(-1), 'release');
});

test('updateAppointmentStatus does not reapply progress after it was synchronized', async () => {
  const pool = fakePool([[
    {
      id: 'appointment-1',
      customer_id: 'customer-1',
      therapist_id: 'therapist-1',
      date: '2026-07-18',
      time_slot: '09:00',
      status: '已完成',
      progress_applied_at: '2026-07-18 10:00:00',
    },
  ], []]);

  await updateAppointmentStatus('appointment-1', '已完成', pool);
  assert.equal(pool.calls.some(call => String(call).includes('FROM orders')), false);
  assert.equal(pool.calls.includes('commit'), true);
  assert.equal(pool.calls.includes('rollback'), false);
  assert.equal(pool.calls.at(-1), 'release');
});
