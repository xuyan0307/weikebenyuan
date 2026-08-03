import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingWeekRangeLabel,
  getBookingWeekDates,
} from '../../src/utils/appointmentBookingWeeks.ts';

test('booking picker exposes the current Monday-to-Sunday week', () => {
  const now = new Date(2026, 7, 1, 10, 0, 0);
  assert.deepEqual(getBookingWeekDates(0, now), [
    '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
    '2026-07-31', '2026-08-01', '2026-08-02',
  ]);
  assert.equal(bookingWeekRangeLabel(0, now), '本周 7/27—8/2');
});

test('booking picker exposes the complete following week', () => {
  const now = new Date(2026, 7, 1, 10, 0, 0);
  assert.deepEqual(getBookingWeekDates(1, now), [
    '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
    '2026-08-07', '2026-08-08', '2026-08-09',
  ]);
  assert.equal(bookingWeekRangeLabel(1, now), '下一周 8/3—8/9');
});

test('next-week dates remain correct across a year boundary', () => {
  const now = new Date(2026, 11, 31, 10, 0, 0);
  assert.deepEqual(getBookingWeekDates(1, now), [
    '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07',
    '2027-01-08', '2027-01-09', '2027-01-10',
  ]);
});
