interface AppointmentComparable {
  therapistId?: string;
  date?: string;
  timeSlot?: string;
  area?: string;
  service?: string;
  serviceContent?: string;
  remark?: string;
}

function normalizedTime(value: string | undefined) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function normalizedDate(value: string | undefined) {
  return String(value || '').slice(0, 10).replaceAll('/', '-');
}

function normalizedText(value: string | undefined) {
  return String(value || '').trim();
}

export function hasAppointmentDetailsChanged(
  appointment: AppointmentComparable,
  edited: AppointmentComparable
) {
  return (
    normalizedText(edited.therapistId) !== normalizedText(appointment.therapistId)
    || normalizedDate(edited.date) !== normalizedDate(appointment.date)
    || normalizedTime(edited.timeSlot) !== normalizedTime(appointment.timeSlot)
    || normalizedText(edited.area) !== normalizedText(appointment.area)
    || normalizedText(edited.service) !== normalizedText(
      appointment.serviceContent || appointment.service
    )
    || normalizedText(edited.remark) !== normalizedText(appointment.remark)
  );
}

export function mutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
