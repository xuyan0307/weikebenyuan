export function experienceStageForAppointment<T extends { servicePeople?: unknown }>(order: T | null | undefined): (T & Record<string, any>) | null {
  if (!order) return null;
  let people = order.servicePeople;
  if (typeof people === 'string') {
    try { people = JSON.parse(people); } catch { return null; }
  }
  const snapshot = (people as Record<string, any> | null)?.experienceSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  return { ...order, ...snapshot, type: '体验卡', isUpgrade: false, payStatus: snapshot.payStatus ?? snapshot.paymentStatus };
}
