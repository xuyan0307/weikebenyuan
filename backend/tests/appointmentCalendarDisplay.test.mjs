import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isOrderAssignedToTherapist, orderTherapistServiceProgress } from '../../src/utils/appointmentTherapistOrders.ts';

const calendarSource = await readFile(
  new URL('../../src/components/AppointmentsCalendarPage.tsx', import.meta.url),
  'utf8'
);
const globalCssSource = await readFile(
  new URL('../../src/index.css', import.meta.url),
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

test('new appointment customer picker is limited to the selected therapist assignments', () => {
  assert.match(calendarSource, /isOrderAssignedToTherapist\(order, therapist\?\.name \|\| ''\)/);
  assert.match(calendarSource, /该技师暂无关联客户/);
  const order = {
    servicePeople: {
      sp1: { assign: '曾丽珍' },
      sp2: { assign: '胡小华' },
      sp3: { assign: '待分配' },
    },
  };
  assert.equal(isOrderAssignedToTherapist(order, '曾丽珍'), true);
  assert.equal(isOrderAssignedToTherapist(order, '胡小华'), true);
  assert.equal(isOrderAssignedToTherapist(order, '徐燕玲'), false);
  assert.equal(isOrderAssignedToTherapist({
    servicePeople: JSON.stringify({ sp1: { assign: '徐燕玲' } }),
  }, '徐燕玲'), true);
  assert.equal(isOrderAssignedToTherapist({ servicePeople: '{invalid' }, '徐燕玲'), false);
  assert.deepEqual(orderTherapistServiceProgress({
    usedTimes: 7,
    totalTimes: 8,
    servicePeople: {
      sp1: { assign: '徐燕玲', usedTimes: '7', totalTimes: '8' },
      sp2: { assign: '陈康复', usedTimes: '2', totalTimes: '5' },
    },
  }, '陈康复'), { matched: true, usedTimes: 2, totalTimes: 5 });
  assert.deepEqual(orderTherapistServiceProgress({
    usedTimes: 7,
    totalTimes: 8,
    servicePeople: {
      sp1: { assign: '徐燕玲' },
      sp2: { assign: '陈康复', totalTimes: '3' },
      sp3: { assign: '林调理', totalTimes: '4' },
    },
  }, '陈康复'), { matched: true, usedTimes: 0, totalTimes: 3 });
  assert.deepEqual(orderTherapistServiceProgress({
    usedTimes: 7,
    totalTimes: 8,
    servicePeople: {
      sp1: { assign: '徐燕玲' },
      sp3: { assign: '林调理', totalTimes: '4' },
    },
  }, '林调理'), { matched: true, usedTimes: 0, totalTimes: 4 });
  assert.match(calendarSource, /orderTherapistServiceProgress/);
  assert.match(calendarSource, /currentTotalTimes/);
});

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
  assert.match(calendarSource, /appt\.isBackfill \? '补录 · 已完成服务' : '已完成服务'/);
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

test('historical appointment creation is rendered above the sticky toolbar and marked as a non-counting backfill', () => {
  assert.match(calendarSource, /z-\[100\]/);
  assert.match(calendarSource, /data-backfill-warning/);
  assert.match(calendarSource, /data-appointment-backfill/);
  assert.match(calendarSource, /isBackfill \? '已完成' : '待确认'/);
  assert.match(calendarSource, /!detailTarget\.isBackfill/);
  assert.match(appointmentRouteSource, /isBackfill: Boolean\(r\.is_backfill\)/);
  assert.match(appointmentServiceSource, /const isBackfill = isAppointmentTimePast\(date, timeSlot\)/);
  assert.match(appointmentServiceSource, /isBackfill \? '已完成'/);
  assert.match(appointmentServiceSource, /!appointment\.is_backfill/);
  assert.match(appointmentServiceSource, /AND (?:a\.)?is_backfill = 0/);
  assert.match(migrationSource, /030_appointment_backfill_marker/);
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

test('calendar can baseline package progress and browse therapists by collapsible scrollable city groups', () => {
  assert.match(appointmentRouteSource, /'\/sync-order-progress'/);
  assert.match(appointmentServiceSource, /synchronizeAllAppointmentOrderProgress/);
  assert.match(appointmentServiceSource, /WHERE type = '套餐'/);
  assert.match(appointmentServiceSource, /status === '已完成'/);
  assert.match(appointmentServiceSource, /usedTimes \+ 1/);
  assert.match(appointmentServiceSource, /SET service_sequence = \?, service_total_times = \?/);
  assert.match(calendarSource, />\s*更新\s*</);
  assert.match(calendarSource, /syncAllOrderProgress/);
  assert.match(calendarSource, /collapsedCities/);
  assert.match(calendarSource, /toggleCity/);
  assert.match(calendarSource, /maxHeight: 'min\(560px, calc\(100vh - 160px\)\)'/);
  assert.match(calendarSource, /overflowY: 'auto'/);
});

test('mobile calendar uses compact fixed day widths and readable clipped card fields', () => {
  assert.match(calendarSource, /data-calendar-table/);
  assert.match(calendarSource, /data-calendar-card/);
  assert.match(calendarSource, /data-calendar-day-column/);
  assert.match(calendarSource, /data-calendar-time-column/);
  assert.match(globalCssSource, /min-width:\s*1128px\s*!important/);
  assert.match(globalCssSource, /width:\s*64px\s*!important/);
  assert.match(globalCssSource, /width:\s*152px\s*!important/);
  assert.match(globalCssSource, /height:\s*174px\s*!important/);
  assert.match(globalCssSource, /\[data-calendar-card\]\s+\[title\]/);
  assert.match(globalCssSource, /white-space:\s*nowrap\s*!important/);
  assert.match(globalCssSource, /text-overflow:\s*ellipsis\s*!important/);
  assert.match(globalCssSource, /scroll-snap-type:\s*x mandatory/);
  assert.match(globalCssSource, /scroll-snap-stop:\s*always/);
});
