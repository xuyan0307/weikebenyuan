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
