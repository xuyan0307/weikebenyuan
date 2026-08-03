export interface AppointmentSlotRecord {
  status?: string;
  rawStatus?: string;
}

/** 已取消预约只作为历史记录展示，不再占用技师档期。 */
export function isCancelledAppointment(appointment: AppointmentSlotRecord): boolean {
  const statuses = [appointment.status, appointment.rawStatus]
    .map(value => String(value || '').trim());
  return statuses.some(status => status === '取消' || status === '已取消');
}

export function appointmentBlocksSlot(appointment: AppointmentSlotRecord): boolean {
  return !isCancelledAppointment(appointment);
}

export function hasBlockingAppointment(
  appointments: AppointmentSlotRecord[]
): boolean {
  return appointments.some(appointmentBlocksSlot);
}
