import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import {
  PlusIcon, SearchIcon, PencilIcon, Trash2Icon, EyeIcon,
  StarIcon, UploadIcon, XIcon, PlusCircleIcon, ChevronDownIcon,
} from 'lucide-react';
import type { Therapist, CertWithExpiry, MultiCert } from '../data/mockData';
import { useTherapists, useTherapistMutations } from '../api/hooks';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MultiCertItem { name: string; fileUrl?: string; }
interface MultiCertFormValue { state: '有' | '无'; items: MultiCertItem[]; }

interface TherapistForm {
  therapistType: string;
  name: string;
  birthYear: string;
  city: '厦门' | '泉州' | '漳州';
  area: string;
  detailAddress: string;
  phone: string;
  transport: string;
  serviceMethod: string;
  characteristics: string;
  status: '在职' | '离职' | '休假';
  rating: string;
  upgradeRate: string;
  remark: string;
  healthCert: CertWithExpiry;
  firstAidCert: MultiCertFormValue;
  laborCert: MultiCertFormValue;
  associationCert: MultiCertFormValue;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcStarLevel(upgradeRate: number, rating: number): 1 | 2 | 3 | 4 | 5 {
  if (upgradeRate >= 70 && rating >= 4.8) return 5;
  if (upgradeRate >= 60 && rating >= 4.5) return 4;
  if (upgradeRate >= 45 && rating >= 4.0) return 3;
  if (upgradeRate >= 30) return 2;
  return 1;
}

function upgradeRateColor(rate: number): string {
  if (rate >= 60) return 'text-green-600 font-semibold';
  if (rate >= 40) return 'text-orange-500 font-semibold';
  return 'text-red-500 font-semibold';
}

function truncate(str: string, max = 30): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function StarDisplay({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className="flex justify-center gap-px">
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon
          key={i}
          size={13}
          className={i < level ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 fill-gray-200'}
        />
      ))}
    </span>
  );
}

function StatusBadge({ status }: { status: '在职' | '离职' | '休假' }) {
  const cls =
    status === '在职' ? 'bg-green-100 text-green-700' :
    status === '离职' ? 'bg-red-100 text-red-600' :
    'bg-yellow-100 text-yellow-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
}

function HealthCertBadge({ cert }: { cert: CertWithExpiry }) {
  if (cert.state === '有') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">
        有效 · {cert.expiry ?? '—'}
      </span>
    );
  }
  if (cert.state === '办理中') {
    return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-600 font-medium">办理中</span>;
  }
  return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">无证书</span>;
}

function MultiCertBadge({ cert }: { cert: MultiCert }) {
  if (cert.state === '无' || !cert.items || cert.items.length === 0) {
    return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">无</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {cert.items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-medium">
          {item.name}
        </span>
      ))}
    </div>
  );
}

// ─── MultiSelect Dropdown ────────────────────────────────────────────────────

interface MultiSelectOption { label: string; value: string; }

interface MultiSelectDropdownProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (vals: string[]) => void;
  renderOption?: (opt: MultiSelectOption) => React.ReactNode;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allSelected = selected.length === 0 || selected.length === options.length;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggleAll() {
    onChange(allSelected ? [] : options.map(o => o.value));
  }

  function toggleOne(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  }

  const displayLabel = allSelected
    ? label
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? label)
      : `${label} (${selected.length})`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 whitespace-nowrap
          ${allSelected ? 'border-gray-200 text-gray-600' : 'border-blue-400 text-blue-600 bg-blue-50'}`}
      >
        {displayLabel}
        <ChevronDownIcon size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-custom py-1" style={{ minWidth: 140 }}>
          {/* 全选 */}
          <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-blue-600 w-3.5 h-3.5"
            />
            <span className="text-xs text-gray-500 font-medium">全部</span>
          </label>
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-blue-50">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggleOne(opt.value)}
                className="accent-blue-600 w-3.5 h-3.5"
              />
              {renderOption ? renderOption(opt) : <span className="text-xs text-gray-700">{opt.label}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── StarFilter Dropdown ──────────────────────────────────────────────────────

interface StarFilterDropdownProps {
  selected: number[];
  onChange: (vals: number[]) => void;
}

function StarFilterDropdown({ selected, onChange }: StarFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ALL_STARS = [1, 2, 3, 4, 5];
  const allSelected = selected.length === 0 || selected.length === ALL_STARS.length;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggleAll() {
    onChange(allSelected ? [] : [...ALL_STARS]);
  }

  function toggleOne(v: number) {
    if (selected.includes(v)) {
      onChange(selected.filter(s => s !== v));
    } else {
      onChange([...selected, v]);
    }
  }

  const displayLabel = allSelected
    ? '星级'
    : selected.length === 1
      ? `${selected[0]} 星`
      : `星级 (${selected.length})`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 whitespace-nowrap
          ${allSelected ? 'border-gray-200 text-gray-600' : 'border-blue-400 text-blue-600 bg-blue-50'}`}
      >
        {displayLabel}
        <ChevronDownIcon size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-custom py-1" style={{ minWidth: 130 }}>
          <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-blue-600 w-3.5 h-3.5"
            />
            <span className="text-xs text-gray-500 font-medium">全部</span>
          </label>
          {ALL_STARS.slice().reverse().map(n => (
            <label key={n} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-blue-50">
              <input
                type="checkbox"
                checked={selected.includes(n)}
                onChange={() => toggleOne(n)}
                className="accent-blue-600 w-3.5 h-3.5"
              />
              <span className="flex items-center gap-0.5">
                {Array.from({ length: n }).map((_, i) => (
                  <StarIcon key={i} size={12} className="text-yellow-400 fill-yellow-400" />
                ))}
                <span className="text-xs text-gray-600 ml-1">{n} 星</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MultiCert 表单子组件 ─────────────────────────────────────────────────────

interface MultiCertFormProps {
  label: string;
  value: MultiCertFormValue;
  onChange: (v: MultiCertFormValue) => void;
}

function MultiCertFormSection({ label, value, onChange }: MultiCertFormProps) {
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleStateChange(state: '有' | '无') {
    onChange({ ...value, state, items: state === '有' && value.items.length === 0 ? [{ name: '' }] : value.items });
  }

  function handleItemName(i: number, name: string) {
    const items = value.items.map((it, idx) => idx === i ? { ...it, name } : it);
    onChange({ ...value, items });
  }

  function handleAddItem() {
    onChange({ ...value, items: [...value.items, { name: '' }] });
  }

  function handleRemoveItem(i: number) {
    const items = value.items.filter((_, idx) => idx !== i);
    onChange({ ...value, items: items.length === 0 ? [{ name: '' }] : items });
  }

  function handleFileChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileUrl = URL.createObjectURL(file);
    const items = value.items.map((it, idx) => idx === i ? { ...it, fileUrl } : it);
    onChange({ ...value, items });
  }

  return (
    <div className="mb-3">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex gap-3 mb-2">
        {(['有', '无'] as const).map(opt => (
          <label key={opt} className="flex items-center gap-1 cursor-pointer text-sm">
            <input
              type="radio"
              name={`cert-${label}`}
              checked={value.state === opt}
              onChange={() => handleStateChange(opt)}
              className="accent-blue-600"
            />
            {opt}
          </label>
        ))}
      </div>
      {value.state === '有' && (
        <div className="space-y-2 pl-1">
          {value.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={item.name}
                onChange={e => handleItemName(i, e.target.value)}
                placeholder="证书名称"
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                ref={el => { fileInputRefs.current[i] = el; }}
                onChange={e => handleFileChange(i, e)}
              />
              <button
                type="button"
                onClick={() => fileInputRefs.current[i]?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-blue-300 text-blue-600 hover:bg-blue-50 whitespace-nowrap"
              >
                <UploadIcon size={12} />
                {item.fileUrl ? '已上传' : '上传'}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveItem(i)}
                className="p-1 rounded text-red-400 hover:bg-red-50"
              >
                <XIcon size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
          >
            <PlusCircleIcon size={14} /> 添加证书
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

interface TherapistDetailModalProps {
  therapist: Therapist | null;
  onClose: () => void;
}

function TherapistDetailModal({ therapist, onClose }: TherapistDetailModalProps) {
  if (!therapist) return null;

  const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-24 shrink-0 text-xs text-gray-500">{label}</span>
      <span className="flex-1 text-sm text-gray-800">{value}</span>
    </div>
  );

  const star = calcStarLevel(therapist.upgradeRate, therapist.rating);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="bg-white rounded-xl shadow-custom w-full max-w-2xl max-h-[88vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-base">
              {therapist.name[0]}
            </div>
            <div>
              <p className="font-semibold text-gray-800">{therapist.name}</p>
              <p className="text-xs text-gray-500">{therapist.therapistType} · {therapist.city}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <XIcon size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* 基本信息 */}
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">基本信息</p>
            <div className="bg-gray-50 rounded-lg px-4 py-1">
              <InfoRow label="技师类型" value={therapist.therapistType} />
              <InfoRow label="出生年份" value={therapist.birthYear ?? '—'} />
              <InfoRow label="联系电话" value={therapist.phone} />
              <InfoRow label="所在城市" value={therapist.city} />
              <InfoRow label="可接单范围" value={therapist.area} />
              <InfoRow label="详细住址" value={therapist.detailAddress} />
              <InfoRow label="出行方式" value={therapist.transport} />
              <InfoRow label="在职状态" value={<StatusBadge status={therapist.status} />} />
              <InfoRow label="服务方式" value={therapist.serviceMethod} />
              <InfoRow label="技师特点" value={therapist.characteristics} />
              <InfoRow label="备注" value={therapist.remark ?? '—'} />
            </div>
          </div>

          {/* 绩效信息 */}
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">绩效信息</p>
            <div className="bg-gray-50 rounded-lg px-4 py-1">
              <InfoRow label="累计服务" value={`${therapist.orders} 单`} />
              <InfoRow label="服务评分" value={`${therapist.rating.toFixed(1)}`} />
              <InfoRow
                label="升单率"
                value={<span className={upgradeRateColor(therapist.upgradeRate)}>{therapist.upgradeRate}%</span>}
              />
              <InfoRow
                label="技师星级"
                value={
                  <span className="flex items-center gap-1">
                    <StarDisplay level={star} />
                    <span className="text-xs text-gray-500 ml-1">{star} 星</span>
                  </span>
                }
              />
            </div>
          </div>

          {/* 证书信息 */}
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">证书信息</p>
            <div className="bg-gray-50 rounded-lg px-4 py-1">
              <InfoRow label="健康证" value={<HealthCertBadge cert={therapist.healthCert} />} />
              <InfoRow label="急救证" value={<MultiCertBadge cert={therapist.firstAidCert} />} />
              <InfoRow label="人社局证书" value={<MultiCertBadge cert={therapist.laborCert} />} />
              <InfoRow label="协会证书" value={<MultiCertBadge cert={therapist.associationCert} />} />
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">关闭</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  form: TherapistForm;
  onChange: (f: TherapistForm) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  isNew: boolean;
}

function EditModal({ form, onChange, onClose, onSave, onDelete, isNew }: EditModalProps) {
  function f(k: keyof TherapistForm, v: string | CertWithExpiry | MultiCertFormValue) {
    onChange({ ...form, [k]: v });
  }

  const inputCls = 'border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full';
  const labelCls = 'block text-xs text-gray-500 mb-0.5';
  const fieldCls = 'mb-3';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="bg-white rounded-xl shadow-custom w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-800">{isNew ? '新增技师' : '编辑技师'}</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <XIcon size={18} />
          </button>
        </div>

        <div className="px-6 py-4">
          {/* ── 基本信息 ── */}
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">基本信息</p>
          <div className="grid grid-cols-2 gap-x-4">
            <div className={fieldCls}>
              <label className={labelCls}>技师类型</label>
              <select className={inputCls} value={form.therapistType} onChange={e => f('therapistType', e.target.value)}>
                {['产康师', '运动康复师', '调理师'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>姓名 *</label>
              <input className={inputCls} value={form.name} onChange={e => f('name', e.target.value)} placeholder="请输入姓名" />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>出生年份</label>
              <input className={inputCls} value={form.birthYear} onChange={e => f('birthYear', e.target.value)} placeholder="如 1990" />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>联系电话 *</label>
              <input className={inputCls} value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="请输入电话" />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>所在城市</label>
              <select className={inputCls} value={form.city} onChange={e => f('city', e.target.value as '厦门' | '泉州' | '漳州')}>
                {(['厦门', '泉州', '漳州'] as const).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>可接单范围</label>
              <input className={inputCls} value={form.area} onChange={e => f('area', e.target.value)} placeholder="如：思明区、湖里区" />
            </div>
            <div className={`${fieldCls} col-span-2`}>
              <label className={labelCls}>详细住址</label>
              <input className={inputCls} value={form.detailAddress} onChange={e => f('detailAddress', e.target.value)} placeholder="详细地址" />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>出行方式</label>
              <input className={inputCls} value={form.transport} onChange={e => f('transport', e.target.value)} placeholder="如：私家车" />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>在职状态</label>
              <select className={inputCls} value={form.status} onChange={e => f('status', e.target.value as '在职' | '离职' | '休假')}>
                {(['在职', '离职', '休假'] as const).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className={`${fieldCls} col-span-2`}>
              <label className={labelCls}>服务方式</label>
              <textarea className={`${inputCls} resize-none`} rows={2} value={form.serviceMethod} onChange={e => f('serviceMethod', e.target.value)} placeholder="描述服务方式" />
            </div>
            <div className={`${fieldCls} col-span-2`}>
              <label className={labelCls}>技师特点</label>
              <textarea className={`${inputCls} resize-none`} rows={2} value={form.characteristics} onChange={e => f('characteristics', e.target.value)} placeholder="描述技师特点" />
            </div>
          </div>

          {/* ── 绩效信息 ── */}
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mt-2 mb-3">绩效信息</p>
          <div className="grid grid-cols-2 gap-x-4">
            <div className={fieldCls}>
              <label className={labelCls}>服务评分 (0–5)</label>
              <input type="number" min="0" max="5" step="0.1" className={inputCls} value={form.rating} onChange={e => f('rating', e.target.value)} />
            </div>
            <div className={fieldCls}>
              <label className={labelCls}>升单率 (0–100 %)</label>
              <input type="number" min="0" max="100" className={inputCls} value={form.upgradeRate} onChange={e => f('upgradeRate', e.target.value)} />
            </div>
          </div>

          {/* ── 证书信息 ── */}
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mt-2 mb-3">证书信息</p>

          {/* 健康证 */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">健康证</label>
            <div className="flex gap-3 mb-1">
              {(['有', '办理中', '无证书'] as const).map(opt => (
                <label key={opt} className="flex items-center gap-1 cursor-pointer text-sm">
                  <input
                    type="radio"
                    checked={form.healthCert.state === opt}
                    onChange={() => onChange({ ...form, healthCert: { state: opt } })}
                    className="accent-blue-600"
                  />
                  {opt}
                </label>
              ))}
            </div>
            {form.healthCert.state === '有' && (
              <div className="flex gap-2 pl-1">
                <input
                  type="date"
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={form.healthCert.expiry ?? ''}
                  onChange={e => onChange({ ...form, healthCert: { ...form.healthCert, expiry: e.target.value } })}
                />
              </div>
            )}
          </div>

          <MultiCertFormSection label="急救证" value={form.firstAidCert} onChange={v => onChange({ ...form, firstAidCert: v })} />
          <MultiCertFormSection label="人社局证书" value={form.laborCert} onChange={v => onChange({ ...form, laborCert: v })} />
          <MultiCertFormSection label="协会证书" value={form.associationCert} onChange={v => onChange({ ...form, associationCert: v })} />

          {/* 备注 */}
          <div className={fieldCls}>
            <label className={labelCls}>备注</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.remark} onChange={e => f('remark', e.target.value)} placeholder="备注说明" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          {/* 左侧：删除按钮（仅编辑时显示） */}
          <div>
            {!isNew && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-500 text-sm hover:bg-red-50"
              >
                <Trash2Icon size={14} />
                删除技师
              </button>
            )}
          </div>
          {/* 右侧：取消 + 保存 */}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">取消</button>
            <button onClick={onSave} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const BLANK_FORM: TherapistForm = {
  therapistType: '产康师',
  name: '',
  birthYear: '',
  city: '厦门',
  area: '',
  detailAddress: '',
  phone: '',
  transport: '',
  serviceMethod: '',
  characteristics: '',
  status: '在职',
  rating: '4.5',
  upgradeRate: '50',
  remark: '',
  healthCert: { state: '无证书' },
  firstAidCert: { state: '无', items: [] },
  laborCert: { state: '无', items: [] },
  associationCert: { state: '无', items: [] },
};

function toMultiCert(v: MultiCertFormValue): MultiCert {
  if (v.state === '无') return { state: '无' };
  return { state: '有', items: v.items.filter(it => it.name.trim() !== '') };
}

const CITY_OPTIONS: MultiSelectOption[] = [
  { label: '厦门', value: '厦门' },
  { label: '泉州', value: '泉州' },
  { label: '漳州', value: '漳州' },
];

const TYPE_OPTIONS: MultiSelectOption[] = [
  { label: '产康师', value: '产康师' },
  { label: '运动康复师', value: '运动康复师' },
  { label: '调理师', value: '调理师' },
];

export default function TherapistListPage() {
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const therapists: Therapist[] = (therapistsQ.data?.data ?? []) as any;
  const mutations = useTherapistMutations();
  const [search, setSearch] = useState('');

  // 多选筛选 — 空数组代表全选
  const [filterCities, setFilterCities] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterStars, setFilterStars] = useState<number[]>([]);

  const [detailTarget, setDetailTarget] = useState<Therapist | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editIsNew, setEditIsNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TherapistForm>(BLANK_FORM);

  // ── filtered list ──
  const filtered = therapists.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.includes(q) || t.phone.includes(q) || t.area.includes(q);
    const matchCity = filterCities.length === 0 || filterCities.includes(t.city);
    const matchType = filterTypes.length === 0 || filterTypes.includes(t.therapistType);
    const tStar = calcStarLevel(t.upgradeRate, t.rating);
    const matchStar = filterStars.length === 0 || filterStars.includes(tStar);
    return matchSearch && matchCity && matchType && matchStar;
  });

  // ── open new ──
  function openNew() {
    setForm(BLANK_FORM);
    setEditIsNew(true);
    setEditId(null);
    setEditOpen(true);
  }

  // ── open edit ──
  function openEdit(t: Therapist) {
    setForm({
      therapistType: t.therapistType,
      name: t.name,
      birthYear: t.birthYear ?? '',
      city: t.city,
      area: t.area,
      detailAddress: t.detailAddress,
      phone: t.phone,
      transport: t.transport,
      serviceMethod: t.serviceMethod,
      characteristics: t.characteristics,
      status: t.status,
      rating: String(t.rating),
      upgradeRate: String(t.upgradeRate),
      remark: t.remark ?? '',
      healthCert: { ...t.healthCert },
      firstAidCert: {
        state: t.firstAidCert.state,
        items: t.firstAidCert.items ? t.firstAidCert.items.map(i => ({ ...i })) : [],
      },
      laborCert: {
        state: t.laborCert.state,
        items: t.laborCert.items ? t.laborCert.items.map(i => ({ ...i })) : [],
      },
      associationCert: {
        state: t.associationCert.state,
        items: t.associationCert.items ? t.associationCert.items.map(i => ({ ...i })) : [],
      },
    });
    setEditIsNew(false);
    setEditId(t.id);
    setEditOpen(true);
  }

  // ── save ──
  async function handleSave() {
    if (!form.name.trim()) { toast.error('请填写技师姓名'); return; }
    if (!form.phone.trim()) { toast.error('请填写联系电话'); return; }
    const ratingNum = parseFloat(form.rating);
    const upgradeNum = parseInt(form.upgradeRate, 10);
    if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) { toast.error('评分须在 0~5 之间'); return; }
    if (isNaN(upgradeNum) || upgradeNum < 0 || upgradeNum > 100) { toast.error('升单率须在 0~100 之间'); return; }

    const star = calcStarLevel(upgradeNum, ratingNum);

    try {
      if (editIsNew) {
        const newT: Partial<Therapist> = {
          name: form.name,
          therapistType: form.therapistType,
          birthYear: form.birthYear || undefined,
          phone: form.phone,
          area: form.area,
          city: form.city,
          detailAddress: form.detailAddress,
          services: [],
          serviceMethod: form.serviceMethod,
          characteristics: form.characteristics,
          transport: form.transport,
          status: form.status,
          orders: 0,
          rating: ratingNum,
          upgradeRate: upgradeNum,
          starLevel: star,
          healthCert: form.healthCert,
          firstAidCert: toMultiCert(form.firstAidCert),
          laborCert: toMultiCert(form.laborCert),
          associationCert: toMultiCert(form.associationCert),
          remark: form.remark || undefined,
        };
        await mutations.create(newT);
        toast.success('技师已添加');
      } else {
        await mutations.update({ id: editId!, body: {
          name: form.name,
          therapistType: form.therapistType,
          birthYear: form.birthYear || undefined,
          phone: form.phone,
          area: form.area,
          city: form.city,
          detailAddress: form.detailAddress,
          services: [],
          serviceMethod: form.serviceMethod,
          characteristics: form.characteristics,
          transport: form.transport,
          status: form.status,
          rating: ratingNum,
          upgradeRate: upgradeNum,
          starLevel: star,
          healthCert: form.healthCert,
          firstAidCert: toMultiCert(form.firstAidCert),
          laborCert: toMultiCert(form.laborCert),
          associationCert: toMultiCert(form.associationCert),
          remark: form.remark || undefined,
        } });
        toast.success('技师信息已更新');
      }
      setEditOpen(false);
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    }
  }

  // ── delete（from edit modal）──
  async function handleDeleteFromModal() {
    if (!editId) return;
    try {
      await mutations.remove(editId);
      setEditOpen(false);
      toast.success('已删除技师');
    } catch (e: any) {
      toast.error(e?.message || '删除失败');
    }
  }

  // ── summary counts ──
  const total = therapists.length;
  const onJob = therapists.filter(t => t.status === '在职').length;
  const avgRating = total ? (therapists.reduce((s, t) => s + t.rating, 0) / total).toFixed(1) : '—';
  const avgUpgrade = total ? Math.round(therapists.reduce((s, t) => s + t.upgradeRate, 0) / total) : 0;

  return (
    <div data-cmp="TherapistListPage" className="flex flex-col gap-4 h-full">
      {/* ── Summary Cards ── */}
      <div className="flex gap-4">
        {[
          { label: '技师总数', value: total, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '在职技师', value: onJob, color: 'text-green-600', bg: 'bg-green-50' },
          { label: '平均评分', value: avgRating, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: '平均升单率', value: `${avgUpgrade}%`, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl px-5 py-3 flex flex-col gap-0.5 shadow-custom`} style={{ minWidth: 120 }}>
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl shadow-custom px-5 py-3 flex items-center gap-3 flex-wrap">
        {/* 搜索框 */}
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5" style={{ minWidth: 180, maxWidth: 260 }}>
          <SearchIcon size={15} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索姓名 / 电话 / 区域"
            className="text-sm outline-none w-full bg-transparent"
          />
        </div>

        {/* 区域多选 */}
        <MultiSelectDropdown
          label="区域"
          options={CITY_OPTIONS}
          selected={filterCities}
          onChange={setFilterCities}
        />

        {/* 技师类型多选 */}
        <MultiSelectDropdown
          label="技师类型"
          options={TYPE_OPTIONS}
          selected={filterTypes}
          onChange={setFilterTypes}
        />

        {/* 星级多选 */}
        <StarFilterDropdown selected={filterStars} onChange={setFilterStars} />

        <div className="flex-1" />
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 shrink-0 whitespace-nowrap"
        >
          <PlusIcon size={15} /> 新增技师
        </button>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-custom overflow-auto flex-1">
        <table className="w-full text-sm" style={{ minWidth: 960, borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['序号', '技师类型', '姓名', '出生年份', '可接单范围', '详细住址', '电话',
                '服务方式', '技师特点', '升单率', '服务评分', '星级', '操作',
              ].map(h => (
                <th key={h} className="px-2 py-2.5 text-xs font-semibold text-gray-600 text-center whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, idx) => {
              const star = calcStarLevel(t.upgradeRate, t.rating);
              return (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                  <td className="px-2 py-2 text-center text-xs text-gray-400">{idx + 1}</td>
                  <td className="px-2 py-2 text-center">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">{t.therapistType}</span>
                  </td>
                  {/* 姓名 — whitespace-nowrap，不换行 */}
                  <td className="px-2 py-2 text-center font-medium text-gray-800 whitespace-nowrap">{t.name}</td>
                  <td className="px-2 py-2 text-center text-xs text-gray-600">{t.birthYear ?? '—'}</td>
                  {/* 可接单范围 — text-xs */}
                  <td className="px-2 py-2 text-center text-xs text-gray-700">{t.area}</td>
                  <td className="px-2 py-2 text-center text-xs text-gray-600">{t.detailAddress}</td>
                  <td className="px-2 py-2 text-center text-xs text-gray-600">{t.phone}</td>
                  {/* 服务方式 — 单行截断 + title */}
                  <td className="px-2 py-2 text-center">
                    <span
                      className="text-xs text-gray-600 block overflow-hidden whitespace-nowrap"
                      style={{ textOverflow: 'ellipsis', maxWidth: 150 }}
                      title={t.serviceMethod}
                    >
                      {truncate(t.serviceMethod, 30)}
                    </span>
                  </td>
                  {/* 技师特点 — 单行截断 + title */}
                  <td className="px-2 py-2 text-center">
                    <span
                      className="text-xs text-gray-600 block overflow-hidden whitespace-nowrap"
                      style={{ textOverflow: 'ellipsis', maxWidth: 150 }}
                      title={t.characteristics}
                    >
                      {truncate(t.characteristics, 30)}
                    </span>
                  </td>
                  <td className={`px-2 py-2 text-center text-xs ${upgradeRateColor(t.upgradeRate)}`}>{t.upgradeRate}%</td>
                  <td className="px-2 py-2 text-center text-xs font-medium text-gray-700">{t.rating.toFixed(1)}</td>
                  <td className="px-2 py-2">
                    <StarDisplay level={star} />
                  </td>
                  {/* 操作列：仅详情 + 编辑，无删除 */}
                  <td className="px-2 py-2">
                    <div className="flex justify-center items-center gap-1.5">
                      <button
                        onClick={() => setDetailTarget(t)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
                      >
                        <EyeIcon size={12} />详情
                      </button>
                      <button
                        onClick={() => openEdit(t)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 whitespace-nowrap"
                      >
                        <PencilIcon size={12} />编辑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="py-16 text-center text-gray-400 text-sm">暂无数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Detail Modal ── */}
      <TherapistDetailModal therapist={detailTarget} onClose={() => setDetailTarget(null)} />

      {/* ── Edit Modal ── */}
      {editOpen && (
        <EditModal
          form={form}
          onChange={setForm}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
          onDelete={handleDeleteFromModal}
          isNew={editIsNew}
        />
      )}
    </div>
  );
}
