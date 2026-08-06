export interface DateRangeValue {
  start: string;
  end: string;
}

export type QuickDateRange = 'all' | 'previousMonth' | 'today' | 'week' | 'month' | 'year';

/** Single platform-wide source for date-range shortcuts. */
export const GLOBAL_DATE_RANGE_QUICK_OPTIONS: ReadonlyArray<{
  label: string;
  value: QuickDateRange;
}> = [
  { label: '全部', value: 'all' },
  { label: '上个月', value: 'previousMonth' },
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '今年', value: 'year' },
];

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function quickDateRange(range: QuickDateRange, now = new Date()): DateRangeValue {
  if (range === 'all') return { start: '', end: '' };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (range === 'previousMonth') {
    start.setMonth(start.getMonth() - 1, 1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (range === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (range === 'month') {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  } else if (range === 'year') {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

export function dateInRange(value: unknown, range: DateRangeValue) {
  const date = String(value || '').slice(0, 10);
  if (!range.start && !range.end) return true;
  if (!date) return false;
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
}

export function normalizedDateRange(range: DateRangeValue): DateRangeValue {
  if (range.start && range.end && range.start > range.end) {
    return { start: range.end, end: range.start };
  }
  return range;
}
