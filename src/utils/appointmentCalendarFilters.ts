export const APPOINTMENT_CITY_OPTIONS = ['厦门', '泉州', '漳州'] as const;

const CITY_ALIASES: Record<(typeof APPOINTMENT_CITY_OPTIONS)[number], string[]> = {
  厦门: ['厦门', '思明', '湖里', '集美', '海沧', '同安', '翔安'],
  泉州: ['泉州', '鲤城', '丰泽', '洛江', '泉港', '石狮', '晋江', '南安', '惠安', '安溪', '永春', '德化', '金门'],
  漳州: ['漳州', '芗城', '龙文', '龙海', '长泰', '漳浦', '云霄', '诏安', '东山', '南靖', '平和', '华安'],
};

/** 将详细地址归并为排期页使用的三级城市筛选值。 */
export function appointmentCityFromArea(area: unknown): string {
  const normalized = String(area ?? '').replace(/\s+/g, '');
  if (!normalized) return '';

  return APPOINTMENT_CITY_OPTIONS.find(city =>
    CITY_ALIASES[city].some(alias => normalized.includes(alias))
  ) ?? '';
}

export function matchesAppointmentCities(area: unknown, selectedCities: string[]): boolean {
  if (selectedCities.length === 0 || selectedCities.length === APPOINTMENT_CITY_OPTIONS.length) {
    return true;
  }
  return selectedCities.includes(appointmentCityFromArea(area));
}
