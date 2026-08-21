import type { Order } from '../api/endpoints';

type ServicePerson = { assign?: unknown };

function parseServicePeople(value: unknown): Record<string, ServicePerson | undefined> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object'
    ? value as Record<string, ServicePerson | undefined>
    : {};
}

/** The order service assignment is the authoritative therapist-customer link. */
export function isOrderAssignedToTherapist(
  order: Pick<Order, 'servicePeople'>,
  therapistName: string
): boolean {
  const targetName = therapistName.trim();
  if (!targetName) return false;
  const people = parseServicePeople(order.servicePeople);
  return ['sp1', 'sp2', 'sp3'].some(key =>
    String(people[key]?.assign ?? '').trim() === targetName
  );
}
