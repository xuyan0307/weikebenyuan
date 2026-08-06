function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getBookingWeekDates(
  weekOffset: 0 | 1,
  now = new Date()
): string[] {
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() + diffToMonday + weekOffset * 7);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return localDateKey(date);
  });
}

export function bookingWeekRangeLabel(
  weekOffset: 0 | 1,
  now = new Date()
): string {
  const dates = getBookingWeekDates(weekOffset, now);
  const format = (value: string) => {
    const [, month, day] = value.split('-');
    return `${Number(month)}/${Number(day)}`;
  };
  return `${weekOffset === 0 ? '本周' : '下一周'} ${format(dates[0])}—${format(dates[6])}`;
}
