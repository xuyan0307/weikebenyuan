export interface AppointmentSlotRecord {
  status?: string;
  rawStatus?: string;
}

/** 已取消、已冲销预约只作为历史记录展示，不再占用技师档期。 */
export function isCancelledAppointment(appointment: AppointmentSlotRecord): boolean {
  const statuses = [appointment.status, appointment.rawStatus]
    .map(value => String(value || '').trim());
  return statuses.some(status => status === '取消' || status === '已取消' || status === '已冲销');
}

export function appointmentBlocksSlot(appointment: AppointmentSlotRecord): boolean {
  return !isCancelledAppointment(appointment);
}

export function hasBlockingAppointment(
  appointments: AppointmentSlotRecord[]
): boolean {
  return appointments.some(appointmentBlocksSlot);
}

/** 改约时排除当前预约自身，但仍阻止同一时段内的其他有效预约。 */
export function hasBlockingAppointmentExcluding<T extends AppointmentSlotRecord & { id?: string }>(
  appointments: T[],
  excludedId: string
): boolean {
  return appointments.some(appointment => appointment.id !== excludedId && appointmentBlocksSlot(appointment));
}
