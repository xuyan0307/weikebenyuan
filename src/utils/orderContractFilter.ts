export const ORDER_CONTRACT_FILTER_NONE = '__FILTER_NONE__';
export const ORDER_CONTRACT_FILTER_VALUES = ['已回签', '未回签'] as const;

export type OrderContractStatus = '无' | '已回签' | '未回签';

export function resolveOrderContractStatus(
  order: { type?: string; contractSigned?: boolean },
  localOverride?: OrderContractStatus
): OrderContractStatus {
  if (order.type === '体验卡') return '无';
  if (localOverride && localOverride !== '无') return localOverride;
  return order.contractSigned ? '已回签' : '未回签';
}

export function matchesOrderContractStatus(
  status: OrderContractStatus,
  selected: readonly string[]
) {
  if (selected.includes(ORDER_CONTRACT_FILTER_NONE)) return false;
  const effective = selected.filter(value =>
    ORDER_CONTRACT_FILTER_VALUES.includes(
      value as (typeof ORDER_CONTRACT_FILTER_VALUES)[number]
    )
  );
  if (
    selected.length === 0
    || ORDER_CONTRACT_FILTER_VALUES.every(value => effective.includes(value))
  ) {
    return true;
  }
  if (status === '无') return false;
  return effective.includes(status);
}
