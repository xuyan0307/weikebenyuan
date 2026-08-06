const test = require('node:test');
const assert = require('node:assert/strict');
const {
  activeReminderHour,
  appointmentStartAt,
  deriveNotificationStatus,
  timeSlotStart,
  updateAppointmentNotificationStatus,
} = require('../dist/services/appointmentNotificationService');

test('timeSlotStart supports exact booking time and schedule periods', () => {
  assert.equal(timeSlotStart('10:30'), '10:30');
  assert.equal(timeSlotStart('上午 10:30'), '10:30');
  assert.equal(timeSlotStart('上午'), '09:00');
  assert.equal(timeSlotStart('下午'), '13:00');
  assert.equal(timeSlotStart('晚上'), '18:00');
});

test('appointmentStartAt keeps mysql DATE objects on the selected China day', () => {
  assert.equal(
    appointmentStartAt(new Date('2026-08-03T16:00:00.000Z'), '12:00').toISOString(),
    '2026-08-04T04:00:00.000Z',
  );
});

test('appointmentStartAt consistently uses China Standard Time', () => {
  assert.equal(
    appointmentStartAt('2026-07-28', '10:30').toISOString(),
    '2026-07-28T02:30:00.000Z',
  );
});

test('activeReminderHour selects each reminder window once', () => {
  const now = new Date('2026-07-28T00:00:00.000Z');
  const startAfter = (hours) => new Date(now.getTime() + hours * 60 * 60 * 1000);

  assert.equal(activeReminderHour(startAfter(25), now), null);
  assert.equal(activeReminderHour(startAfter(24), now), 24);
  assert.equal(activeReminderHour(startAfter(13), now), 24);
  assert.equal(activeReminderHour(startAfter(12), now), 12);
  assert.equal(activeReminderHour(startAfter(7), now), 12);
  assert.equal(activeReminderHour(startAfter(6), now), 6);
  assert.equal(activeReminderHour(startAfter(4), now), 6);
  assert.equal(activeReminderHour(startAfter(3), now), 3);
  assert.equal(activeReminderHour(startAfter(1), now), 3);
  assert.equal(activeReminderHour(startAfter(-1), now), null);
});

test('notification reply earlier than or exactly two hours is on time', () => {
  const start = appointmentStartAt('2026-07-28', '10:00');
  assert.equal(
    deriveNotificationStatus(start, new Date('2026-07-28T07:00:00+08:00')),
    '已通知',
  );
  assert.equal(
    deriveNotificationStatus(start, new Date('2026-07-28T08:00:00+08:00')),
    '已通知',
  );
});

test('a valid Enterprise WeChat reply always marks the appointment notified', () => {
  const start = appointmentStartAt('2026-07-28', '10:00');
  assert.equal(
    deriveNotificationStatus(start, new Date('2026-07-28T08:00:01+08:00')),
    '已通知',
  );
  assert.equal(
    deriveNotificationStatus(start, new Date('2026-07-28T09:59:59+08:00')),
    '已通知',
  );
});

test('a valid reply stays notified while no reply after start is missed', () => {
  const start = appointmentStartAt('2026-07-28', '10:00');
  assert.equal(
    deriveNotificationStatus(start, new Date('2026-07-28T10:00:00+08:00')),
    '已通知',
  );
  assert.equal(
    deriveNotificationStatus(start, null, new Date('2026-07-28T10:00:00+08:00')),
    '遗漏',
  );
  assert.equal(
    deriveNotificationStatus(start, null, new Date('2026-07-28T09:59:59+08:00')),
    '延迟',
  );
});

test('notification status follows the 24-hour and 2-hour no-reply boundaries', () => {
  const start = appointmentStartAt('2026-07-28', '20:00');
  assert.equal(
    deriveNotificationStatus(start, null, new Date('2026-07-27T19:59:59+08:00')),
    '待通知',
  );
  assert.equal(
    deriveNotificationStatus(start, null, new Date('2026-07-27T20:00:00+08:00')),
    '需通知',
  );
  assert.equal(
    deriveNotificationStatus(start, null, new Date('2026-07-28T17:59:59+08:00')),
    '需通知',
  );
  assert.equal(
    deriveNotificationStatus(start, null, new Date('2026-07-28T18:00:00+08:00')),
    '延迟',
  );
  assert.equal(
    deriveNotificationStatus(start, null, new Date('2026-07-28T20:00:00+08:00')),
    '遗漏',
  );
});

test('assigned advisor can manually update notification status', async () => {
  const executed = [];
  const db = {
    query: async () => [[{ id: 'appointment-id', advisor_id: 'advisor-id' }]],
    execute: async (sql, params) => {
      executed.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  const status = await updateAppointmentNotificationStatus(
    'A001',
    '已通知',
    { id: 'advisor-id', role: 'service' },
    db,
  );
  assert.equal(status, '已通知');
  assert.match(executed[0].sql, /notify_manual_status/);
  assert.deepEqual(executed[0].params.slice(0, 3), ['已通知', '已通知', '已通知']);
});

test('advisor cannot update another advisor appointment notification', async () => {
  const db = {
    query: async () => [[{ id: 'appointment-id', advisor_id: 'other-advisor' }]],
    execute: async () => {
      throw new Error('should not execute');
    },
  };
  await assert.rejects(
    updateAppointmentNotificationStatus(
      'A001',
      '需通知',
      { id: 'advisor-id', role: 'service' },
      db,
    ),
    error => error.statusCode === 403,
  );
});
