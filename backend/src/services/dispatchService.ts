type DbTherapist = Record<string, unknown>;

export interface DispatchInput {
  city: string;
  district?: string;
  address?: string;
  need?: string;
  appointmentDate?: string;
  roles?: string[];
  includeObservation?: boolean;
  location?: string;
}

export interface DispatchCandidate {
  id: string;
  name: string;
  phone: string;
  city: string;
  role: string;
  level: string;
  levelScore: number;
  isObservation: boolean;
  transport: string;
  scope: string;
  originAddress: string;
  driveKm: number;
  driveMinutes: number;
  scopeReason: string;
  projectReason: string;
  note: string;
  estimated: boolean;
  score: number;
}

interface GeoPoint { text: string; lng: number; lat: number }
interface GeocodeResult { location: string; formatted: string }

const geocodeCache = new Map<string, GeocodeResult>();
const distanceCache = new Map<string, { km: number; minutes: number; estimated: boolean }>();

function clean(value: unknown): string { return String(value || '').trim(); }

function parseLocations(value: unknown): Array<{ label?: string; address?: string; location?: string }> {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function parseLocation(value: unknown): GeoPoint | null {
  const text = clean(value);
  if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(text)) return null;
  const [lng, lat] = text.split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return { text, lng, lat };
}

export function haversineKm(fromValue: string, toValue: string): number | null {
  const from = parseLocation(fromValue);
  const to = parseLocation(toValue);
  if (!from || !to) return null;
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLng = (to.lng - from.lng) * rad;
  const lat1 = from.lat * rad;
  const lat2 = to.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function gradeFromUpgradeRate(value: unknown): { level: string; score: number; observation: boolean } {
  const rate = Number(value) || 0;
  if (rate >= 75) return { level: '王牌产康师', score: 5, observation: false };
  if (rate >= 60) return { level: 'S档产康师', score: 4, observation: false };
  if (rate >= 50) return { level: 'B档产康师', score: 3, observation: false };
  if (rate >= 40) return { level: 'A档产康师', score: 2, observation: false };
  return { level: '观察池', score: 1, observation: true };
}

function normalizedRole(value: unknown): string {
  const role = clean(value) || '产康师';
  if (role.includes('运动')) return '运动康复师';
  if (role.includes('调理')) return '体质调理师';
  return '产康师';
}

export function gradeForTherapist(row: DbTherapist) {
  const role = normalizedRole(row.therapist_type);
  if (role === '产康师') return gradeFromUpgradeRate(row.upgrade_rate);
  const isB = row.specialty_grade === 'B' || (!row.specialty_grade && Number(row.commission_rate) === 5);
  return { level: isB ? `B档${role}` : '观察池', score: isB ? 3 : 1, observation: !isB };
}

function roleAllowed(role: string, selectedRoles: string[]): boolean {
  return selectedRoles.some(item => normalizedRole(item) === role);
}

function scopeResult(row: DbTherapist, city: string, district: string): { score: number; reason: string } {
  const blob = [row.city, row.area, row.detail_address].map(clean).join(' ');
  let score = 0;
  const reasons: string[] = [];
  if (city && blob.includes(city)) { score += 2; reasons.push('同城'); }
  if (district && blob.includes(district)) { score += 3; reasons.push('同区/覆盖区'); }
  else if (district) reasons.push('非明确同区');
  return { score, reason: reasons.join('、') || '需确认可接范围' };
}

const PROJECT_KEYWORDS: Record<string, string[]> = {
  腹直肌: ['腹直肌', '腹部', '核心'],
  骨盆: ['骨盆', '收胯', '假胯', '妈妈臀'],
  盆底肌: ['盆底', '漏尿', '膨出', '脱垂'],
  催乳通乳: ['催乳', '通乳', '乳腺', '堵奶', '涨奶', '追奶'],
  体态调整: ['体态', '驼背', '圆肩', '高低肩', '肋骨外翻'],
  孕期调理: ['孕期', '水肿', 'SPA', '备孕', '体质'],
};

function projectResult(row: DbTherapist, need: string): { score: number; reason: string } {
  if (!need) return { score: 1, reason: '未填写项目，需人工确认' };
  const source = [row.services, row.service_method, row.characteristics, row.remark, row.area].map(value => clean(value)).join(' ');
  const hits = Object.entries(PROJECT_KEYWORDS)
    .filter(([, words]) => words.some(word => need.includes(word)) && words.some(word => source.includes(word)))
    .map(([label]) => label);
  return hits.length
    ? { score: 3, reason: `匹配：${hits.join('、')}` }
    : { score: 1, reason: '需人工确认项目匹配' };
}

async function amapGet(path: string, params: Record<string, string>, key: string, timeoutMs = 4000): Promise<any> {
  const url = new URL(`https://restapi.amap.com${path}`);
  Object.entries({ ...params, key }).forEach(([name, value]) => url.searchParams.set(name, value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'weikebenyuan-dispatch/1.0' }, signal: controller.signal });
    if (!response.ok) throw new Error(`地图服务请求失败：${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function geocode(address: string, city: string, key: string): Promise<GeocodeResult> {
  const query = address.includes(city) ? address : `${city}${address}`;
  const cacheKey = `${city}|${query}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;
  const data = await amapGet('/v3/geocode/geo', { address: query, city, output: 'JSON' }, key);
  if (data.status !== '1' || !data.geocodes?.length) throw new Error(`地址无法识别：${address}`);
  const result = { location: clean(data.geocodes[0].location), formatted: clean(data.geocodes[0].formatted_address) || query };
  if (!parseLocation(result.location)) throw new Error('地图返回无效坐标');
  if (geocodeCache.size >= 500) geocodeCache.clear();
  geocodeCache.set(cacheKey, result);
  return result;
}

async function drivingDistance(origin: string, destination: string, key: string): Promise<{ km: number; minutes: number; estimated: boolean }> {
  const cacheKey = `${origin}|${destination}`;
  const cached = distanceCache.get(cacheKey);
  if (cached) return cached;
  try {
    const data = await amapGet('/v3/distance', { origins: origin, destination, type: '1', output: 'JSON' }, key, 2500);
    if (data.status === '1' && data.results?.[0]?.distance != null && data.results[0].duration != null
      && data.results[0].distance !== '' && data.results[0].duration !== ''
      && Number.isFinite(Number(data.results[0].distance)) && Number.isFinite(Number(data.results[0].duration))
      && Number(data.results[0].distance) >= 0 && Number(data.results[0].duration) >= 0) {
      const result = { km: Number(data.results[0].distance) / 1000, minutes: Number(data.results[0].duration) / 60, estimated: false };
      if (distanceCache.size >= 1000) distanceCache.clear();
      distanceCache.set(cacheKey, result);
      return result;
    }
  } catch { /* use straight-line fallback */ }
  const straight = haversineKm(origin, destination);
  if (straight == null) throw new Error('距离计算失败');
  return { km: straight * 1.35, minutes: (straight * 1.35 / 28) * 60, estimated: true };
}

export function sortDispatchCandidates(items: DispatchCandidate[]): DispatchCandidate[] {
  return [...items].sort((a, b) => {
    if (a.isObservation !== b.isObservation) return Number(a.isObservation) - Number(b.isObservation);
    const aFar = a.driveKm > 30;
    const bFar = b.driveKm > 30;
    if (aFar !== bFar) return Number(aFar) - Number(bFar);
    if (!aFar && !bFar && a.levelScore !== b.levelScore) return b.levelScore - a.levelScore;
    if (a.driveKm !== b.driveKm) return a.driveKm - b.driveKm;
    if (a.levelScore !== b.levelScore) return b.levelScore - a.levelScore;
    return b.score - a.score;
  });
}

export async function rankTherapists(rows: DbTherapist[], input: DispatchInput, apiKey: string): Promise<{ customerLocation: string; results: DispatchCandidate[]; warning: string }> {
  const city = clean(input.city);
  const district = clean(input.district);
  const address = clean(input.address);
  const selectedRoles = input.roles?.length ? input.roles : ['产康师'];
  if (!city || (!address && !parseLocation(input.location))) throw new Error('请填写客户城市和详细地址');
  const customerGeo = parseLocation(input.location)
    ? { location: clean(input.location), formatted: address || clean(input.location) }
    : await geocode(`${district}${address}`, city, apiKey);

  let failedOrigins = 0;
  let missingOrigins = 0;
  let pendingGrades = 0;
  const evaluate = async (row: DbTherapist) => {
    const grade = gradeForTherapist(row);
    const role = normalizedRole(row.therapist_type);
    if (clean(row.status) !== '在职') return null;
    if (Number(row.dispatch_selected) !== 1) return null;
    if (!roleAllowed(role, selectedRoles)) return null;
    if (role !== '产康师' && !row.specialty_grade && ![0, 5].includes(Number(row.commission_rate || 0))) { pendingGrades++; return null; }
    if (grade.observation && !input.includeObservation) return null;
    const configuredOrigins = parseLocations(row.dispatch_locations);
    const origins = configuredOrigins.length ? configuredOrigins : [{ label: '默认出发点', address: clean(row.detail_address) }];
    if (!origins.some(item => clean(item.address))) { missingOrigins++; return null; }
    try {
      const measured = (await Promise.all(origins.slice(0, 2).map(async item => {
        try {
        const originAddress = clean(item.address);
        if (!originAddress) return null;
        const stored = parseLocation(item.location);
        const origin = stored ? { location: stored.text, formatted: originAddress } : await geocode(originAddress, clean(row.city) || city, apiKey);
        const distance = await drivingDistance(origin.location, customerGeo.location, apiKey);
        return { originAddress, distance };
        } catch { return null; }
      }))).filter((item): item is { originAddress: string; distance: { km: number; minutes: number; estimated: boolean } } => item !== null)
        .sort((a, b) => a.distance.km - b.distance.km);
      const best = measured[0];
      if (!best) { failedOrigins++; return null; }
      const { originAddress, distance } = best;
      if (distance.km > 50) return null;
      const scope = scopeResult(row, city, district);
      const project = projectResult(row, clean(input.need));
      const distanceScore = Math.max(0, 60 - Math.min(distance.km, 60));
      const score = distanceScore * 10 + grade.score * 35 + scope.score * 20 + project.score * 15 + (clean(row.transport).includes('车') ? 10 : 0);
      return {
        id: clean(row.id), name: clean(row.name), phone: clean(row.phone), city: clean(row.city), role,
        level: grade.level, levelScore: grade.score, isObservation: grade.observation,
        transport: clean(row.transport), scope: clean(row.area), originAddress,
        driveKm: Number(distance.km.toFixed(1)), driveMinutes: Math.max(1, Math.round(distance.minutes)),
        scopeReason: scope.reason, projectReason: project.reason, note: clean(row.dispatch_note) || clean(row.remark),
        estimated: distance.estimated, score: Number(score.toFixed(1)),
      } satisfies DispatchCandidate;
    } catch { failedOrigins++; return null; }
  };
  // Limit simultaneous therapist lookups instead of flooding the map API.
  const candidates: Array<DispatchCandidate | null> = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, async () => {
    while (cursor < rows.length) { const index = cursor++; candidates[index] = await evaluate(rows[index]); }
  }));
  const warning = [pendingGrades ? `${pendingGrades}位人员的原提成不符合新档位规则，请管理员在技师档案确认档位` : '', missingOrigins ? `${missingOrigins}位人员未填写出发地址` : '', failedOrigins ? `${failedOrigins}位人员的地址无法计算，请检查地址或稍后重试` : ''].filter(Boolean).join('；');
  return { customerLocation: customerGeo.formatted, results: sortDispatchCandidates(candidates.filter((item): item is DispatchCandidate => item !== null)), warning };
}

export async function queryAddressTips(city: string, district: string, keyword: string, apiKey: string) {
  if (!city || !keyword) return [];
  const words = district && !keyword.includes(district) ? `${district}${keyword}` : keyword;
  const data = await amapGet('/v3/assistant/inputtips', { keywords: words, city, citylimit: 'true', datatype: 'all', output: 'JSON' }, apiKey);
  return (Array.isArray(data.tips) ? data.tips : []).filter((tip: any) => tip && typeof tip !== 'string' && clean(tip.name)).slice(0, 8).map((tip: any) => ({
    name: clean(tip.name), district: clean(tip.district), address: clean(tip.address), location: clean(tip.location),
  }));
}
