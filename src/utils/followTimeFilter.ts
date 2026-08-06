export const FOLLOW_TIME_VALUES = ['today', 'overdue', 'pending'] as const;

export type FollowTimeValue = typeof FOLLOW_TIME_VALUES[number];

interface FollowTimeMatchOptions {
  emptyMeansAll: boolean;
  noneValue?: string;
  today?: string;
}

export function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function followTimeBucket(
  value: string | null | undefined,
  today = localDateKey()
): FollowTimeValue | null {
  const followDate = value && value !== '—' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(followDate)) return null;
  if (followDate === today) return 'today';
  return followDate < today ? 'overdue' : 'pending';
}

export function matchesFollowTime(
  value: string | null | undefined,
  selected: readonly string[],
  options: FollowTimeMatchOptions
): boolean {
  if (options.noneValue && selected.includes(options.noneValue)) return false;

  const active = FOLLOW_TIME_VALUES.filter(item => selected.includes(item));
  const isAll = active.length === FOLLOW_TIME_VALUES.length
    || (options.emptyMeansAll && selected.length === 0);
  if (isAll) return true;
  if (active.length === 0) return false;

  const bucket = followTimeBucket(value, options.today);
  return bucket !== null && active.includes(bucket);
}
