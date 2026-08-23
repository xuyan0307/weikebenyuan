export type ServicePersonStatus = {
  label: '未服务' | '服务中' | '服务完结';
  detail: string;
};

/** Computes one specialist's status without using another specialist's counts. */
export function servicePersonStatus(
  usedTimesValue: unknown,
  totalTimesValue: unknown,
  lastCompletedAt?: unknown,
  now = new Date()
): ServicePersonStatus {
  const totalTimes = Math.max(1, Number(totalTimesValue) || 1);
  const usedTimes = Math.max(0, Number(usedTimesValue) || 0);
  if (usedTimes <= 0) return { label: '未服务', detail: '' };
  if (usedTimes >= totalTimes) return { label: '服务完结', detail: '' };

  const completedAt = new Date(String(lastCompletedAt || ''));
  if (Number.isNaN(completedAt.getTime()) || completedAt.getTime() > now.getTime()) {
    return { label: '服务中', detail: '间隔待确认' };
  }
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - completedAt.getTime()) / 86_400_000));
  return { label: '服务中', detail: `间隔${elapsedDays}天` };
}

/** Package status wording shared by the order list and editor. */
export function packageServiceStatusText(
  usedTimes: unknown,
  totalTimes: unknown,
  lastCompletedAt?: unknown,
  now = new Date()
): string {
  const status = servicePersonStatus(usedTimes, totalTimes, lastCompletedAt, now);
  return status.label === '服务中' ? status.detail : status.label;
}
