import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDaysIcon, CarIcon, LocateFixedIcon, MapPinIcon, SearchIcon, ShieldCheckIcon, UserRoundSearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { dispatchApi, type DispatchCandidate, type DispatchTip } from '../api/endpoints';

const CITIES = ['厦门', '泉州', '漳州'];
const ROLES = ['产康师', '运动康复师', '体质调理师'];

function todayValue() {
  // WebView locale output can use slashes; date inputs and the API require ISO.
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function DispatchAssistantPage() {
  const [city, setCity] = useState('厦门');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [need, setNeed] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(todayValue());
  const [roles, setRoles] = useState<string[]>(['产康师']);
  const [includeObservation, setIncludeObservation] = useState(false);
  const [tips, setTips] = useState<DispatchTip[]>([]);
  const [results, setResults] = useState<DispatchCandidate[]>([]);
  const [customerLocation, setCustomerLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const requestInFlight = useRef(false);
  const [source, setSource] = useState<{ total: number; roles: { role: string; count: number }[]; mapConfigured: boolean } | null>(null);

  useEffect(() => {
    dispatchApi.source().then(setSource).catch(() => setSource(null));
  }, []);

  useEffect(() => {
    const keyword = address.trim();
    if (keyword.length < 2) { setTips([]); return; }
    if (location) { setTips([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      dispatchApi.tips(city, district, keyword).then(data => { if (active) setTips(data.tips); }).catch(() => { if (active) setTips([]); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [address, city, district, location]);

  const roleSummary = useMemo(() => source?.roles.map(item => `${item.role} ${item.count}人`).join(' · ') || '正在读取技师档案', [source]);

  function toggleRole(role: string) {
    setRoles(current => current.includes(role) ? current.filter(item => item !== role) : [...current, role]);
  }

  async function handleRank() {
    if (requestInFlight.current) return;
    setErrorMessage('');
    if (!address.trim()) { setErrorMessage('请填写客户详细地址'); return; }
    if (!roles.length) { setErrorMessage('请至少选择一种服务人员'); return; }
    requestInFlight.current = true;
    setLoading(true);
    setHasSearched(true);
    setResults([]); setCustomerLocation(''); setWarning(''); setTips([]);
    try {
      const data = await dispatchApi.rank({ city, district, address, location, need, appointmentDate, roles, includeObservation });
      setCustomerLocation(data.customerLocation);
      setResults(data.results);
      setWarning(data.warning || '');
      if (!data.results.length) toast.info('50公里内暂无符合条件的服务人员');
    } catch (error: any) {
      setErrorMessage(error?.message || '派单计算失败，请检查网络后重试');
    } finally { setLoading(false); requestInFlight.current = false; }
  }

  useEffect(() => {
    if (hasSearched) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hasSearched, loading]);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <section className="rounded-xl bg-card p-4 shadow-custom" style={{ border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 text-base font-bold text-foreground"><UserRoundSearchIcon size={20} className="text-blue-600" />派单助手</div>
            <p className="mt-1 text-xs text-muted-foreground">按距离、档位、覆盖区域与项目匹配推荐服务人员，最远展示50公里。</p>
            <p className="mt-1 text-xs text-muted-foreground">推荐不代表预约日期有空档，不会自动创建预约；请在排期管理确认档期。</p>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <div className="flex items-center gap-1 font-semibold"><ShieldCheckIcon size={14} />数据源：技师档案（{source?.total ?? '—'}人）</div>
            <div className="mt-1 text-blue-500">{roleSummary}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-gray-500">客户城市
            <select value={city} onChange={event => { setCity(event.target.value); setLocation(''); }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800">
              {CITIES.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">区县
            <input value={district} onChange={event => { setDistrict(event.target.value); setLocation(''); }} placeholder="如：思明区" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="relative text-xs text-gray-500 md:col-span-2">详细地址 / 小区
            <div className="relative mt-1"><MapPinIcon size={16} className="absolute left-3 top-2.5 text-gray-400" /><input value={address} onChange={event => { setAddress(event.target.value); setLocation(''); }} placeholder="输入小区、街道或完整地址" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></div>
            {tips.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {tips.map((tip, index) => <button type="button" key={`${tip.location}-${index}`} onClick={() => { setAddress([tip.name, tip.address].filter(Boolean).join(' ')); setDistrict(tip.district || district); setLocation(tip.location); setTips([]); }} className="block w-full border-b border-gray-100 px-3 py-2 text-left hover:bg-blue-50"><span className="block text-sm text-gray-800">{tip.name}</span><span className="block truncate text-xs text-gray-400">{tip.district} {tip.address}</span></button>)}
              </div>
            )}
          </label>
          <label className="text-xs text-gray-500 xl:col-span-2">服务需求
            <input value={need} onChange={event => setNeed(event.target.value)} placeholder="如：骨盆修复、腹直肌、运动康复" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-gray-500">预约日期
            <div className="relative mt-1"><CalendarDaysIcon size={16} className="absolute left-3 top-2.5 text-gray-400" /><input type="date" value={appointmentDate} onChange={event => setAppointmentDate(event.target.value)} className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></div>
          </label>
          <div className="text-xs text-gray-500">服务人员类型
            <div className="mt-1 flex min-h-[38px] flex-wrap items-center gap-2">{ROLES.map(role => <label key={role} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs ${roles.includes(role) ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}><input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} className="mr-1.5 accent-blue-600" />{role}</label>)}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={includeObservation} onChange={event => setIncludeObservation(event.target.checked)} className="accent-blue-600" />包含观察池（始终排在正式人员之后，需主管复核）</label>
          <button type="button" onClick={handleRank} disabled={loading || source?.mapConfigured === false} className="flex min-h-11 touch-manipulation items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><SearchIcon size={17} />{loading ? '正在计算…' : '开始智能派单'}</button>
        </div>
        {errorMessage && <p role="alert" className="mt-3 text-sm text-red-600">{errorMessage}</p>}
        {source?.mapConfigured === false && <p className="mt-2 text-right text-xs text-orange-600">地图服务尚未配置，管理员配置后即可使用距离派单。</p>}
      </section>

      <section ref={resultRef} aria-busy={loading} aria-live="polite" className="min-h-[240px] scroll-mt-4 rounded-xl bg-card p-4 shadow-custom" style={{ border: '1px solid var(--border)' }}>
        {warning && <p role="status" className="mb-3 text-xs text-orange-600">{warning}</p>}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-gray-800">推荐结果 <span className="ml-1 font-normal text-gray-400">{results.length ? `${results.length}人` : ''}</span></h2>{customerLocation && <div className="flex items-center gap-1 text-xs text-gray-500"><LocateFixedIcon size={14} />已定位：{customerLocation}</div>}</div>
        {!results.length ? <div className="flex min-h-[180px] flex-col items-center justify-center text-gray-400"><UserRoundSearchIcon size={42} strokeWidth={1.3} /><p role="status" className="mt-2 text-sm">{loading ? '正在查询技师并计算距离，请稍候…' : errorMessage ? errorMessage : hasSearched ? '50公里内暂无符合条件的服务人员，可调整条件后重试' : '填写客户地址后开始派单（服务需求选填）'}</p></div> : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">{results.map((item, index) => (
            <article key={item.id} className="rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm">
              <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${index < 3 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{index + 1}</span><div><div className="font-semibold text-gray-800">{item.name} <span className="ml-1 text-xs font-normal text-gray-400">{item.role}</span></div><div className="mt-0.5 text-xs text-gray-500">{item.level}{item.isObservation ? ' · 需复核' : ''}</div></div></div><div className="text-right"><div className="text-base font-bold text-blue-600">{item.driveKm} km</div><div className="text-xs text-gray-400">约 {item.driveMinutes} 分钟{item.estimated ? '（估算）' : ''}</div></div></div>
              <div className="mt-3 space-y-1.5 text-xs text-gray-600"><div className="flex gap-2"><MapPinIcon size={14} className="mt-0.5 shrink-0 text-gray-400" /><span>{item.originAddress}</span></div><div className="flex gap-2"><CarIcon size={14} className="mt-0.5 shrink-0 text-gray-400" /><span>{item.transport || '出行方式待确认'} · {item.scope || '范围待确认'}</span></div><div className="rounded-lg bg-gray-50 px-2.5 py-2"><span className="text-blue-600">区域：</span>{item.scopeReason}<br /><span className="text-blue-600">项目：</span>{item.projectReason}</div>{item.note && <div className="truncate text-gray-400" title={item.note}>备注：{item.note}</div>}</div>
            </article>
          ))}</div>
        )}
      </section>
    </div>
  );
}
