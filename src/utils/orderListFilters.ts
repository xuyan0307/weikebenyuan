import { orderServiceRoleDisplay, type OrderServiceRole } from './orderServiceRoleDisplay.ts';

export type OrderTherapistFilterRole = '产康师' | '运动康复师' | '体质调理师';
export type OrderServiceFilterStatus = '未服务' | '服务中' | '已服务';

export const ORDER_THERAPIST_FILTER_ROLES: Array<{
  label: OrderTherapistFilterRole;
  serviceRole: OrderServiceRole;
}> = [
  { label: '产康师', serviceRole: '产康师' },
  { label: '运动康复师', serviceRole: '运动康复师' },
  { label: '体质调理师', serviceRole: '调理师' },
];

export function orderTherapistFilterValue(role: OrderTherapistFilterRole, name: string): string {
  return `${role}::${name.trim()}`;
}

/** Matches the selected service discipline and therapist as one exact pair. */
export function matchesOrderTherapists(order: unknown, selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  return ORDER_THERAPIST_FILTER_ROLES.some(({ label, serviceRole }) => {
    const service = orderServiceRoleDisplay(order as Parameters<typeof orderServiceRoleDisplay>[0], serviceRole);
    return service.name !== '—' && selected.includes(orderTherapistFilterValue(label, service.name));
  });
}

/**
 * Produces one mutually-exclusive order status from each assigned discipline's own count.
 * Experience cards retain their original two-state behavior.
 */
export function orderServiceFilterStatus(order: unknown): OrderServiceFilterStatus {
  const source = order as Parameters<typeof orderServiceRoleDisplay>[0];
  const services = ORDER_THERAPIST_FILTER_ROLES
    .map(({ serviceRole }) => orderServiceRoleDisplay(source, serviceRole))
    .filter(service => service.name !== '—');

  if (services.length === 0) return '未服务';
  if (!services[0].isPackage) {
    return services.some(service => service.usedTimes > 0) ? '已服务' : '未服务';
  }
  if (services.every(service => service.usedTimes <= 0)) return '未服务';
  if (services.every(service => service.usedTimes >= service.totalTimes)) return '已服务';
  return '服务中';
}

export function matchesOrderServiceStatuses(order: unknown, selected: readonly string[]): boolean {
  return selected.length === 0 || selected.includes(orderServiceFilterStatus(order));
}
