import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAppointmentServiceFromRecord,
  replaceWithScheduleSnapshot,
  requiresRecordedAppointmentService,
} from '../../src/utils/appointmentServiceSync.ts';

test('appointment service uses the selected order service items as the authoritative record', () => {
  assert.equal(
    getAppointmentServiceFromRecord(
      { type: '套餐', serviceItems: '骨盆修复、腹直肌修复' },
      { intendedProduct: '产康综合调理' }
    ),
    '骨盆修复、腹直肌修复'
  );
});

test('appointment service falls back to the customer record when an old order has no service items', () => {
  assert.equal(
    getAppointmentServiceFromRecord(
      { type: '套餐', serviceItems: '   ' },
      { intendedProduct: '腹直肌修复' }
    ),
    '腹直肌修复'
  );
});

test('package and upgrade appointments require a configured record and never invent therapist services', () => {
  assert.equal(getAppointmentServiceFromRecord({ type: '套餐' }, null), '');
  assert.equal(getAppointmentServiceFromRecord({ type: '体验卡', isUpgrade: true }, null), '');
  assert.equal(requiresRecordedAppointmentService({ type: '套餐' }), true);
  assert.equal(requiresRecordedAppointmentService({ type: '体验卡', isUpgrade: true }), true);
});

test('legacy experience-card appointment keeps a stable default service name', () => {
  assert.equal(getAppointmentServiceFromRecord({ type: '体验卡' }, null), '产康体验');
  assert.equal(requiresRecordedAppointmentService({ type: '体验卡' }), false);
});

test('schedule snapshot replaces unchanged-count appointment rows after cancel or reschedule', () => {
  const previous = [
    { id: 'A001', date: '2026-08-01', timeSlot: '上午 09:00', status: '待服务' },
    { id: 'A002', date: '2026-08-02', timeSlot: '下午 13:00', status: '待服务' },
  ];
  const serverSnapshot = [
    { id: 'A001', date: '2026-08-01', timeSlot: '上午 09:00', status: '已取消' },
    { id: 'A002', date: '2026-08-09', timeSlot: '晚上 18:00', status: '待服务' },
  ];

  const synchronized = replaceWithScheduleSnapshot(serverSnapshot);
  assert.notDeepEqual(synchronized, previous);
  assert.equal(synchronized[0].status, '已取消');
  assert.equal(synchronized[1].date, '2026-08-09');
  assert.equal(synchronized[1].timeSlot, '晚上 18:00');
  assert.notEqual(synchronized[0], serverSnapshot[0]);
});
