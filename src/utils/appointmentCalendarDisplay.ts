const DISTRICT_NAMES = [
  '思明区', '湖里区', '集美区', '海沧区', '同安区', '翔安区',
  '鲤城区', '丰泽区', '洛江区', '泉港区', '石狮', '晋江', '南安', '惠安', '安溪', '永春', '德化', '金门',
  '芗城区', '龙文区', '龙海', '长泰', '漳浦', '云霄', '诏安', '东山', '南靖', '平和', '华安',
];

/** 将详细地址压缩为排期卡片需要的区/县级展示。 */
export function formatAppointmentDistrict(value: unknown): string {
  const area = String(value || '').trim();
  if (!area) return '—';

  const knownDistrict = DISTRICT_NAMES.find(name => area.includes(name));
  if (knownDistrict) return knownDistrict;

  const matches = area.match(/[\u4e00-\u9fff]{2,8}(?:区|县|市)/g) ?? [];
  const candidate = [...matches].reverse().find(item => /(?:区|县)$/.test(item))
    ?? matches.at(-1)
    ?? area;
  const withoutPrefix = candidate.replace(/^.*?(?:省|自治区|特别行政区)/, '');
  return /市$/.test(withoutPrefix) ? withoutPrefix.slice(0, -1) : withoutPrefix;
}

export function appointmentProgressLabel(sequence: unknown, total: unknown): string {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeSequence = Math.min(safeTotal, Math.max(0, Number(sequence) || 0));
  return `${safeSequence}/${safeTotal}`;
}
