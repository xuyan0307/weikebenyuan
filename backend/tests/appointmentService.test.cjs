const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAppointment,
  decrementAssignedServicePeople,
  getSlotPeriod,
  isAppointmentTimePast,
  incrementAssignedServicePeople,
  resolveAppointmentServiceSequence,
  resolveSynchronizedAppointmentSequence,
  reverseCompletedAppointment,
  synchronizeAllAppointmentOrderProgress,
  synchronizeAppointmentOrderProgress,
  updateAppointment,
  updateAppointmentStatus,
} = require('../dist/services/appointmentService');

test('getSlotPeriod maps booking times to the configured three schedule periods', () => {
  assert.equal(getSlotPeriod('08:00'), 'morning');
  assert.equal(getSlotPeriod('11:59'), 'morning');
  assert.equal(getSlotPeriod('12:00'), 'afternoon');
  assert.equal(getSlotPeriod('17:59'), 'afternoon');
  assert.equal(getSlotPeriod('18:00'), 'evening');
  assert.equal(getSlotPeriod('23:59'), 'evening');
  assert.equal(getSlotPeriod('07:59'), null);
  assert.equal(getSlotPeriod('24:00'), null);
  assert.equal(getSlotPeriod(''), null);
});

test('isAppointmentTimePast rejects elapsed times and accepts future times', () => {
  const now = new Date(2026, 6, 25, 12, 30, 0, 0);
  assert.equal(isAppointmentTimePast('2026-07-24', '23:59', now), true);
  assert.equal(isAppointmentTimePast('2026-07-25', '12:15', now), true);
  assert.equal(isAppointmentTimePast('2026-07-25', '12:45', now), false);
  assert.equal(isAppointmentTimePast('2026-07-26', '08:00', now), false);
  assert.equal(
    isAppointmentTimePast('2026-07-25', '17:59', new Date(2026, 6, 25, 17, 58, 59, 999)),
    false,
  );
  assert.equal(
    isAppointmentTimePast('2026-07-25', '17:59', new Date(2026, 6, 25, 17, 59, 0, 0)),
    true,
  );
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

test('resolveAppointmentServiceSequence defaults to completed times plus one', () => {
  assert.equal(resolveAppointmentServiceSequence(undefined, 2, 5), 3);
  assert.equal(resolveAppointmentServiceSequence(null, 0, 5), 1);
  assert.equal(resolveAppointmentServiceSequence('', 5, 5), 5);
});

test('resolveAppointmentServiceSequence accepts manual correction and rejects invalid ranges', () => {
  assert.equal(resolveAppointmentServiceSequence(4, 2, 5), 4);
  assert.throws(
    () => resolveAppointmentServiceSequence(6, 2, 5),
    error => error.statusCode === 400
  );
  assert.throws(
    () => resolveAppointmentServiceSequence(2.5, 2, 5),
    error => error.statusCode === 400
  );
});

test('incrementAssignedServicePeople can synchronize to an explicit appointment sequence', () => {
  const result = incrementAssignedServicePeople({
    sp1: { assign: '张技师', usedTimes: '2', totalTimes: '5' },
  }, '张技师', 5, 4);

  assert.equal(result.changed, true);
  assert.equal(result.value.sp1.usedTimes, '4');
});

test('decrementAssignedServicePeople reverses only the affected therapist progress', () => {
  const result = decrementAssignedServicePeople({
    sp1: { assign: '张技师', usedTimes: '6', totalTimes: '8' },
    sp2: { assign: '李技师', usedTimes: '4', totalTimes: '8' },
  }, '张技师', 1);
  assert.equal(result.changed, true);
  assert.equal(result.value.sp1.usedTimes, '5');
  assert.equal(result.value.sp2.usedTimes, '4');
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
      date: '2099-07-18',
      timeSlot: '10:00',
    }, pool),
    error => error.statusCode === 409
  );
  assert.equal(pool.calls.includes('commit'), false);
  assert.equal(pool.calls.includes('rollback'), true);
  assert.equal(pool.calls.some(call => String(call).includes("status NOT IN ('已取消', '取消', '已冲销')")), true);
  assert.equal(pool.calls.at(-1), 'release');
});

test('updateAppointment updates the selected appointment and excludes itself from conflicts', async () => {
  const pool = fakePool([
    [{
      id: 'appointment-1',
      appointment_no: 'A001',
      customer_id: 'customer-1',
      therapist_id: 'therapist-1',
      date: '2099-07-18',
      time_slot: '09:00',
      service: '骨盆',
      status: '待服务',
      area: '湖里',
      remark: '',
      progress_applied_at: null,
    }],
    [{ id: 'therapist-2' }],
    [],
    [],
  ]);

  await updateAppointment('appointment-1', {
    therapistId: 'therapist-2',
    date: '2099-07-19',
    timeSlot: '13:30',
    service: '腹直肌',
    area: '思明',
    remark: '调整上门时间',
  }, pool);

  assert.equal(pool.calls.some(call => String(call).includes('id <> ?')), true);
  assert.equal(pool.calls.some(call => String(call).includes("status NOT IN ('已取消', '取消', '已冲销')")), true);
  assert.equal(pool.calls.some(call => String(call).includes('UPDATE appointments')), true);
  assert.equal(pool.calls.some(call => String(call).includes('notify_scheduled_at = CASE WHEN')), true);
  assert.equal(pool.calls.includes('commit'), true);
  assert.equal(pool.calls.includes('rollback'), false);
  assert.equal(pool.calls.at(-1), 'release');
});

test('updateAppointment rejects rescheduling completed appointment evidence', async () => {
  const pool = fakePool([[
    {
      id: 'appointment-completed',
      appointment_no: 'A-COMPLETED',
      customer_id: 'customer-1',
      therapist_id: 'therapist-1',
      date: '2099-07-18',
      time_slot: '09:00',
      service: '骨盆',
      status: '已完成',
      area: '湖里',
      remark: '',
      progress_applied_at: '2099-07-18 10:00:00',
      has_service_record: 1,
    },
  ]]);

  await assert.rejects(
    updateAppointment('appointment-completed', {
      date: '2099-07-19',
      timeSlot: '13:30',
    }, pool),
    error => error.statusCode === 409
  );

  assert.equal(pool.calls.some(call => String(call).includes('UPDATE appointments')), false);
  assert.equal(pool.calls.includes('commit'), false);
  assert.equal(pool.calls.includes('rollback'), true);
});

test('updateAppointment rolls back when another appointment occupies the therapist period', async () => {
  const pool = fakePool([
    [{
      id: 'appointment-1',
      appointment_no: 'A001',
      customer_id: 'customer-1',
      therapist_id: 'therapist-1',
      date: '2099-07-18',
      time_slot: '09:00',
      service: '骨盆',
      status: '待服务',
      area: '湖里',
      remark: '',
      progress_applied_at: null,
    }],
    [{ id: 'therapist-1' }],
    [{ time_slot: '10:30' }],
  ]);

  await assert.rejects(
    updateAppointment('appointment-1', {
      date: '2099-07-18',
      timeSlot: '11:00',
    }, pool),
    error => error.statusCode === 409
  );

  assert.equal(pool.calls.some(call => String(call).includes('UPDATE appointments')), false);
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

test('completed appointment with service evidence cannot be cancelled directly', async () => {
  const pool = fakePool([[
    {
      id: 'appointment-1',
      customer_id: 'customer-1',
      therapist_id: 'therapist-1',
      date: '2026-07-18',
      time_slot: '09:00',
      service: '骨盆修复',
      status: '已完成',
      progress_applied_at: '2026-07-18 10:00:00',
    },
  ]]);

  await assert.rejects(
    updateAppointmentStatus('appointment-1', '已取消', pool),
    error => error.statusCode === 409 && /服务凭证/.test(error.message)
  );
  assert.equal(pool.calls.some(call => String(call).includes('UPDATE appointments')), false);
  assert.equal(pool.calls.includes('commit'), false);
  assert.equal(pool.calls.includes('rollback'), true);
});

test('legacy appointment with a service record cannot be cancelled even when status is stale', async () => {
  const pool = fakePool([[
    {
      id: 'appointment-legacy',
      customer_id: 'customer-1',
      therapist_id: 'therapist-1',
      date: '2026-07-18',
      time_slot: '09:00',
      service: '骨盆修复',
      status: '待确认',
      progress_applied_at: null,
      has_service_record: 1,
    },
  ]]);
  await assert.rejects(
    updateAppointmentStatus('appointment-legacy', '已取消', pool),
    error => error.statusCode === 409
  );
  assert.equal(pool.calls.some(call => String(call).includes('UPDATE appointments')), false);
});

test('synchronizeAppointmentOrderProgress records the current order baseline transactionally', async () => {
  const pool = fakePool([[
    {
      appointment_id: 'appointment-1', customer_id: 'customer-1', order_id: 'order-1',
      order_no: 'O001', type: '套餐', used_times: 6, total_times: 8,
    },
  ], [], []]);
  const result = await synchronizeAppointmentOrderProgress(
    'appointment-1',
    { id: 'user-1', name: '客服甲', role: 'service' },
    pool,
  );
  assert.deepEqual(result, { orderId: 'order-1', usedTimes: 6, totalTimes: 8, nextSequence: 7 });
  assert.equal(pool.calls.some(call => String(call).includes('appointment_progress_syncs')), true);
  assert.equal(pool.calls.includes('commit'), true);
});

test('bulk progress sync uses the order count for completed appointments and plus one for unfinished appointments', () => {
  assert.equal(resolveSynchronizedAppointmentSequence('已完成', 6, 8), 6);
  assert.equal(resolveSynchronizedAppointmentSequence('已确认', 6, 8), 7);
  assert.equal(resolveSynchronizedAppointmentSequence('待确认', 6, 8), 7);
  assert.equal(resolveSynchronizedAppointmentSequence('已确认', 8, 8), 8);
});

test('synchronizeAllAppointmentOrderProgress baselines package orders and updates active appointments by status', async () => {
  const pool = fakePool([
    [{
      id: 'order-1', order_no: 'O001', customer_id: 'customer-1', type: '套餐',
      used_times: 6, total_times: 8,
    }],
    [],
    [{ id: 'appointment-completed', status: '已完成' }, { id: 'appointment-pending', status: '已确认' }],
    [],
    [],
    [],
  ]);
  const result = await synchronizeAllAppointmentOrderProgress(
    { id: 'user-1', name: '客服甲', role: 'service' },
    pool,
  );
  assert.deepEqual(result, { ordersUpdated: 1, appointmentsUpdated: 2 });
  assert.equal(pool.calls.some(call => String(call).includes("WHERE type = '套餐'")), true);
  assert.equal(pool.calls.some(call => String(call).includes("status NOT IN ('已取消', '取消', '已冲销')")), true);
  assert.equal(pool.calls.filter(call => String(call).includes('SET service_sequence = ?')).length, 2);
  assert.equal(pool.calls.some(call => String(call).includes('appointment_progress_syncs')), true);
  assert.equal(pool.calls.includes('commit'), true);
});

test('reverseCompletedAppointment rejects a repeated reversal before changing evidence', async () => {
  const pool = fakePool([[
    {
      id: 'appointment-1', customer_id: 'customer-1', therapist_id: 'therapist-1',
      status: '已冲销', progress_applied_at: '2026-08-18 10:00:00', service_record_id: 'record-1',
    },
  ]]);
  await assert.rejects(
    reverseCompletedAppointment(
      'appointment-1', '重复冲销测试',
      { id: 'user-1', name: '管理员', role: 'admin' },
      pool,
    ),
    error => error.statusCode === 409 && /重复/.test(error.message),
  );
  assert.equal(pool.calls.some(call => String(call).includes('UPDATE orders')), false);
  assert.equal(pool.calls.includes('rollback'), true);
});

test('reverseCompletedAppointment preserves evidence and rolls back order progress in one transaction', async () => {
  const pool = fakePool([
    [{
      id: 'appointment-1', appointment_no: 'A001', customer_id: 'customer-1',
      order_id: 'order-1', therapist_id: 'therapist-1', status: '已完成',
      service: '骨盆修复', progress_applied_at: '2026-08-18 10:00:00',
      service_record_id: 'record-1', service_date: '2026-08-18 09:00:00',
      service_items: '骨盆修复', progress_event_id: 'event-1', progress_order_id: 'order-1',
      before_used_times: 5, after_used_times: 6,
    }],
    [],
    [{ id: 'order-1', used_times: 6, total_times: 8, service_people: { sp1: { assign: '张技师', usedTimes: '6', totalTimes: '8' } } }],
    [{ name: '张技师' }],
    [], [], [], [], [], [], [],
  ]);
  const result = await reverseCompletedAppointment(
    'appointment-1', '误点已完成服务',
    { id: 'user-1', name: '管理员', role: 'admin' },
    pool,
  );
  assert.equal(result.appointmentId, 'appointment-1');
  assert.equal(result.orderBefore.usedTimes, 6);
  assert.equal(result.orderAfter.usedTimes, 5);
  assert.equal(pool.calls.some(call => String(call).includes("status = '已冲销'")), true);
  assert.equal(pool.calls.some(call => String(call).includes('UPDATE service_records SET reversed_at')), true);
  assert.equal(pool.calls.some(call => String(call).includes('appointment_service_reversals')), true);
  assert.equal(pool.calls.includes('commit'), true);
  assert.equal(pool.calls.includes('rollback'), false);
});
