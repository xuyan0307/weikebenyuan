import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calendarSource = await readFile(
  new URL('../../src/components/AppointmentsCalendarPage.tsx', import.meta.url),
  'utf8'
);
const filterSource = await readFile(
  new URL('../../src/utils/appointmentCalendarFilters.ts', import.meta.url),
  'utf8'
);
const displaySource = await readFile(
  new URL('../../src/utils/appointmentCalendarDisplay.ts', import.meta.url),
  'utf8'
);
const appointmentRouteSource = await readFile(
  new URL('../src/routes/appointments.ts', import.meta.url),
  'utf8'
);
const appointmentServiceSource = await readFile(
  new URL('../src/services/appointmentService.ts', import.meta.url),
  'utf8'
);
const migrationSource = await readFile(
  new URL('../src/config/migrations.ts', import.meta.url),
  'utf8'
);

test('calendar hides cancelled appointments while appointment list keeps the history', () => {
  assert.match(calendarSource, /!isCancelledAppointment\(a\)/);
  assert.doesNotMatch(calendarSource, />已取消<\/span>/);
});

test('calendar area filter exposes only the three supported cities', () => {
  assert.match(filterSource, /\['厦门', '泉州', '漳州'\]/);
  assert.match(calendarSource, /APPOINTMENT_CITY_OPTIONS\.map/);
  assert.match(calendarSource, /matchesAppointmentCities\(a\.area, selectedAreas\)/);
});

test('detailed district addresses are grouped into their parent city', () => {
  assert.match(filterSource, /厦门: \['厦门', '思明', '湖里', '集美', '海沧', '同安', '翔安'\]/);
  assert.match(filterSource, /泉州: \['泉州'.*'晋江'/s);
  assert.match(filterSource, /漳州: \['漳州'.*'漳浦'/s);
});

test('calendar cards use a stable compact read model and open details in place', () => {
  assert.match(calendarSource, /height: 168/);
  assert.match(calendarSource, /textOverflow: 'ellipsis'/);
  assert.doesNotMatch(calendarSource, /类型：\{businessType\}/);
  assert.match(calendarSource, /\{isPackage \? \(/);
  assert.match(calendarSource, /次数：\{progressLabel\}/);
  assert.match(calendarSource, /experiencePaymentLabel/);
  assert.match(calendarSource, /order\?\.payStatus === '已付款'/);
  assert.match(calendarSource, /付款：\{experiencePaymentLabel\}/);
  assert.match(calendarSource, /onView=\{\(\) => setDetailTarget\(appt\)\}/);
  assert.match(calendarSource, /detailTarget &&/);
  assert.match(calendarSource, /<thead[\s\S]*?position: 'sticky'/);
  assert.match(displaySource, /formatAppointmentDistrict/);
  assert.match(displaySource, /appointmentProgressLabel/);
});

test('service completion is offered only for today or an earlier date', () => {
  assert.match(calendarSource, /appt\.date <= getLocalDateKey\(\)/);
  assert.match(calendarSource, /isCompleted = appt\.status === '已完成'/);
  assert.match(calendarSource, />\s*确认服务\s*</);
  assert.match(calendarSource, />\s*已完成服务\s*</);
  assert.match(calendarSource, />\s*已预约未做\s*</);
  assert.match(calendarSource, /备注：\{appt\.remark \|\| ''\}/);
  assert.match(calendarSource, /data-calendar-sticky="filters"/);
  assert.match(calendarSource, /data-calendar-sticky="dates"/);
  assert.match(calendarSource, /data-calendar-scroll-region/);
  assert.match(calendarSource, /zIndex: 70/);
  assert.match(calendarSource, /zIndex: 55/);
  assert.match(calendarSource, /backgroundClip: 'padding-box'/);
  assert.match(calendarSource, /overscrollBehavior: 'contain'/);
  assert.match(calendarSource, /height: 44/);
  assert.match(calendarSource, /borderCollapse: 'separate'/);
  assert.match(calendarSource, /background: '#FFFFFF'/);
  assert.match(calendarSource, /background: '#F5F7FA'/);
});

test('morning afternoon and evening calendar sections use a clear dark divider', () => {
  assert.match(calendarSource, /data-calendar-period=\{slot\.label\}/);
  assert.match(calendarSource, /slotIndex > 0 \? '2px solid #111827'/);
  assert.match(calendarSource, /borderTop: periodDivider/);
});

test('appointments retain an exact order link and display the live order total', () => {
  assert.match(migrationSource, /027_appointment_order_link/);
  assert.match(appointmentServiceSource, /currentOrder\?\.id \?\? null/);
  assert.match(appointmentRouteSource, /o\.total_times AS order_total_times/);
  assert.match(appointmentRouteSource, /r\.order_total_times == null/);
  assert.match(calendarSource, /order\?\.totalTimes \?\? appt\.serviceTotalTimes/);
});
