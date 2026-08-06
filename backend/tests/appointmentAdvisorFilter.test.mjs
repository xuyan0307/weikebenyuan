import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calendarSource = await readFile(
  new URL('../../src/components/AppointmentsCalendarPage.tsx', import.meta.url),
  'utf8'
);
const listSource = await readFile(
  new URL('../../src/components/AppointmentsListPage.tsx', import.meta.url),
  'utf8'
);
const routeSource = await readFile(
  new URL('../src/routes/appointments.ts', import.meta.url),
  'utf8'
);

test('calendar exposes global advisor and area multi-select filters', () => {
  assert.match(calendarSource, /label="归属客服"/);
  assert.match(calendarSource, /label="区域"/);
  assert.match(calendarSource, /matchesGlobalMultiSelect\(a\.advisorName/);
  assert.match(calendarSource, /matchesGlobalMultiSelect\(a\.area/);
});

test('service users default appointment pages to their own advisor name', () => {
  assert.match(calendarSource, /currentUser\.role === 'service'.*\[currentUser\.name\]/s);
  assert.match(listSource, /currentUser\.role === 'service'.*\[currentUser\.name\]/s);
});

test('service users can switch appointment advisor filters without losing role-scoped dashboard data', () => {
  assert.match(routeSource, /\['superadmin', 'admin', 'service'\]\.includes/);
});

test('WeCom callback passes reply content before sender identity', () => {
  assert.match(routeSource, /recordNotificationReplyFromWecom\(reply, sender, new Date\(\)\)/);
});

test('dashboard navigation initializes the appointment list with need-notification only', () => {
  assert.match(listSource, /appointmentNotifyStatus === '需通知'.*\['需通知'\]/s);
});
