export const ORDER_FOLLOW_STATUS_VALUES = ['跟进中', '待跟进', '已完成', '延迟'] as const;

export type OrderFollowStatus = typeof ORDER_FOLLOW_STATUS_VALUES[number];

export function matchesOrderFollowStatuses(
  value: unknown,
  selected: readonly string[],
  noneValue = '__FILTER_NONE__'
): boolean {
  if (selected.includes(noneValue)) return false;
  const active = ORDER_FOLLOW_STATUS_VALUES.filter(status => selected.includes(status));
  if (selected.length === 0 || active.length === ORDER_FOLLOW_STATUS_VALUES.length) return true;
  if (active.length === 0) return false;
  return active.includes(String(value ?? '') as OrderFollowStatus);
}
