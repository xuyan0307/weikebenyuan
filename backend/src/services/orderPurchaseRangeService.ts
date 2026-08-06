import { formatDateOnly, parseJson } from '../utils/serialization';

export interface OrderPurchaseRangeInput {
  type: string;
  purchaseDate: unknown;
  createdDate: unknown;
  servicePeople: unknown;
}

export interface OrderPurchaseRangeProjection {
  active: boolean;
  displayPurchaseDate: string;
  visibleStageKeys: string[];
}

function inRange(date: string, from = '', to = '') {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function packageNumber(stage: Record<string, unknown>, fallback: number) {
  const matched = String(stage.id || stage.label || '').match(/\d+/);
  return Math.max(1, Number(matched?.[0]) || fallback);
}

export function orderPurchaseStages(input: OrderPurchaseRangeInput) {
  const people = parseJson<Record<string, unknown>>(input.servicePeople, {});
  const stages = new Map<string, string>();
  const experience = people.experienceSnapshot;
  if (experience && typeof experience === 'object' && !Array.isArray(experience)) {
    stages.set('experience', formatDateOnly((experience as Record<string, unknown>).purchaseDate) || formatDateOnly(input.createdDate));
  } else if (input.type === '体验卡') {
    stages.set('experience', formatDateOnly(input.purchaseDate) || formatDateOnly(input.createdDate));
  }

  const history = Array.isArray(people.packageHistory)
    ? people.packageHistory.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
    : [];
  history.forEach((stage, index) => {
    stages.set(
      `package-${packageNumber(stage, index + 1)}`,
      formatDateOnly(stage.purchaseDate) || formatDateOnly(input.createdDate),
    );
  });
  if (input.type === '套餐') {
    const activeNumber = Math.max(1, Number(people.activePackageNumber) || history.length + 1);
    stages.set(`package-${activeNumber}`, formatDateOnly(input.purchaseDate) || formatDateOnly(input.createdDate));
  }
  if (stages.size === 0) {
    stages.set('current', formatDateOnly(input.purchaseDate) || formatDateOnly(input.createdDate));
  }
  return stages;
}

export function projectOrderPurchaseRange(
  input: OrderPurchaseRangeInput,
  from = '',
  to = '',
): OrderPurchaseRangeProjection {
  const active = Boolean(from || to);
  const stages = orderPurchaseStages(input);
  const visible = active
    ? [...stages.entries()].filter(([, date]) => inRange(date, from, to))
    : [...stages.entries()];
  return {
    active,
    displayPurchaseDate: visible.map(([, date]) => date).filter(Boolean).sort().at(-1) || '',
    visibleStageKeys: visible.map(([key]) => key),
  };
}
