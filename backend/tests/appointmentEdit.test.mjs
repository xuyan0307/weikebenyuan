import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  hasAppointmentDetailsChanged,
  mutationErrorMessage,
} from '../../src/utils/appointmentEdit.ts';

const appointment = {
  therapistId: 'T001',
  date: '2026-07-27',
  timeSlot: '上午 08:00',
  area: '思明去',
  service: '产康体验',
  serviceContent: '产康体验',
  remark: '',
};

test('notification-only edit does not submit an unchanged historical appointment', () => {
  assert.equal(
    hasAppointmentDetailsChanged(appointment, {
      therapistId: 'T001',
      date: '2026-07-27',
      timeSlot: '08:00',
      area: '思明去',
      service: '产康体验',
      remark: '',
    }),
    false,
  );
});

test('appointment edit detects real schedule and content changes', () => {
  assert.equal(
    hasAppointmentDetailsChanged(appointment, {
      ...appointment,
      date: '2026-07-28',
    }),
    true,
  );
  assert.equal(
    hasAppointmentDetailsChanged(appointment, {
      ...appointment,
      service: '产康套餐',
    }),
    true,
  );
});

test('mutation error helper exposes API object messages', () => {
  assert.equal(
    mutationErrorMessage({ status: 403, message: '无权限修改该预约' }, '保存失败'),
    '无权限修改该预约',
  );
});

test('customer-service advisors may reschedule without broader appointment edits', async () => {
  const routeSource = await readFile(
    new URL('../src/routes/appointments.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    routeSource,
    /router\.put\([\s\S]*?authorizeRoles\('superadmin', 'admin', 'service'\)/,
  );
  assert.match(
    routeSource,
    /req\.userRole === 'service'[\s\S]*?\{ date: body\.date, timeSlot: body\.timeSlot \}/,
  );
});
