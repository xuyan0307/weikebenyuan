import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appointmentBlocksSlot,
  hasBlockingAppointment,
  hasBlockingAppointmentAtStart,
  hasBlockingAppointmentExcluding,
  isCancelledAppointment,
} from '../../src/utils/appointmentSlotAvailability.ts';

test('cancelled appointment remains a record but does not block its schedule slot', () => {
  const appointments = [{ id: 'cancelled-history', status: '已取消' }];
  assert.equal(appointments.length, 1);
  assert.equal(appointmentBlocksSlot(appointments[0]), false);
  assert.equal(hasBlockingAppointment(appointments), false);
});

test('API display and database cancellation status aliases both release the slot', () => {
  assert.equal(isCancelledAppointment({ status: '取消' }), true);
  assert.equal(isCancelledAppointment({ status: '已取消' }), true);
  assert.equal(isCancelledAppointment({ status: '取消', rawStatus: '已取消' }), true);
  assert.equal(hasBlockingAppointment([{ status: '取消' }]), false);
});

test('reversed completed service remains historical evidence without blocking the slot', () => {
  assert.equal(appointmentBlocksSlot({ status: '已冲销' }), false);
});

test('active and completed appointments continue to block their schedule slot', () => {
  assert.equal(hasBlockingAppointment([{ status: '待确认' }]), true);
  assert.equal(hasBlockingAppointment([{ status: '已确认' }]), true);
  assert.equal(hasBlockingAppointment([{ status: '已完成' }]), true);
});

test('a new active appointment blocks a slot even when cancelled history is also displayed', () => {
  assert.equal(hasBlockingAppointment([
    { status: '已取消' },
    { status: '待确认' },
  ]), true);
});

test('rescheduling excludes the current appointment but still detects another active booking', () => {
  assert.equal(hasBlockingAppointmentExcluding([
    { id: 'current', status: '待确认' },
    { id: 'cancelled-history', status: '已取消' },
  ], 'current'), false);
  assert.equal(hasBlockingAppointmentExcluding([
    { id: 'current', status: '待确认' },
    { id: 'other', status: '已确认' },
  ], 'current'), true);
});

test('appointments in one period only conflict when their exact start time matches', () => {
  const appointments = [
    { id: 'first', timeSlot: '13:00', status: '待确认' },
    { id: 'cancelled', timeSlot: '14:00', status: '已取消' },
  ];
  assert.equal(hasBlockingAppointmentAtStart(appointments, '13:00'), true);
  assert.equal(hasBlockingAppointmentAtStart(appointments, '13:30'), false);
  assert.equal(hasBlockingAppointmentAtStart(appointments, '14:00'), false);
  assert.equal(hasBlockingAppointmentAtStart(appointments, '13:00', 'first'), false);
});
