import type { Order } from '../api/endpoints';

type ServicePerson = { assign?: unknown };

type ProgressServicePerson = ServicePerson & { usedTimes?: unknown; totalTimes?: unknown };

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

/** Returns the selected therapist's own counter rather than the order's primary counter. */
export function orderTherapistServiceProgress(
  order: Pick<Order, 'servicePeople' | 'usedTimes' | 'totalTimes'>,
  therapistName: string,
  legacyUsedTimes = order.usedTimes
): { matched: boolean; usedTimes: number; totalTimes: number } {
  const targetName = therapistName.trim();
  const people = parseServicePeople(order.servicePeople) as Record<string, ProgressServicePerson | undefined>;
  const personKey = (['sp1', 'sp2', 'sp3'] as const)
    .find(key => targetName && String(people[key]?.assign ?? '').trim() === targetName);
  const person = personKey ? people[personKey] : undefined;
  const mayUseLegacyOrderProgress = personKey === 'sp1' || personKey === undefined;
  const fallbackTotal = mayUseLegacyOrderProgress ? order.totalTimes : 1;
  const fallbackUsed = mayUseLegacyOrderProgress ? legacyUsedTimes : 0;
  const totalTimes = Math.max(1, Number(person?.totalTimes ?? fallbackTotal) || 1);
  const usedTimes = Math.max(0, Math.min(totalTimes, Number(person?.usedTimes ?? fallbackUsed) || 0));
  return { matched: Boolean(person), usedTimes, totalTimes };
}
