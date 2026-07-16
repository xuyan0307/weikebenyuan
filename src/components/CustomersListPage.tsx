import React, { useState, useRef, useEffect } from 'react';
import {
  SearchIcon, PlusIcon, FilterIcon, PhoneIcon, EyeIcon, EditIcon,
  ChevronLeftIcon, ChevronRightIcon, XIcon, SaveIcon, UserIcon, CalendarIcon,
  TagIcon, ChevronDownIcon, UploadIcon, DownloadIcon, FileTextIcon, CheckIcon,
  ClockIcon, ShoppingBagIcon, PackageIcon,
} from 'lucide-react';
import type { Customer, CustomerTag, FollowStatus, CustomerProfile, Order } from '../data/mockData';
import { useApp } from '../hooks/useApp';
import { useCustomers, useCustomerMutations, useOrders, useSystemUsers } from '../api/hooks';
import { toast } from 'sonner';
import { downloadXlsx, readSpreadsheet, rowsToObjects } from '../utils/spreadsheet';

// ─────────────────────────── Tag system ───────────────────────────
interface TagDef {
  tag: CustomerTag;
  label: string;
  desc: string;
  badgeCls: string;
  groupKey: string;
}

const TAG_DEFS: TagDef[] = [
  { tag: 'V1', label: 'V1', desc: '消费1W-3W之间VIP客户',   badgeCls: 'badge-purple', groupKey: 'V' },
  { tag: 'V2', label: 'V2', desc: '消费3W以上SVIP客户',     badgeCls: 'badge-purple', groupKey: 'V' },
  { tag: 'A1', label: 'A1', desc: '消费5000元以内，小疗程客户',     badgeCls: 'badge-success', groupKey: 'A' },
  { tag: 'A2', label: 'A2', desc: '消费5000-1W元之间，大疗程客户', badgeCls: 'badge-success', groupKey: 'A' },
  { tag: 'B1', label: 'B1', desc: '高意向',    badgeCls: 'badge-warning', groupKey: 'B' },
  { tag: 'B2', label: 'B2', desc: '普通意向',  badgeCls: 'badge-warning', groupKey: 'B' },
  { tag: 'C1', label: 'C1', desc: '待约具体时间', badgeCls: 'badge-info', groupKey: 'C' },
  { tag: 'C2', label: 'C2', desc: '已约具体时间', badgeCls: 'badge-info', groupKey: 'C' },
  { tag: 'D1', label: 'D1', desc: '高意向',              badgeCls: 'badge-gray', groupKey: 'D' },
  { tag: 'D2', label: 'D2', desc: '普通意向',            badgeCls: 'badge-gray', groupKey: 'D' },
  { tag: 'D3', label: 'D3', desc: '沉默客户（不说话）',  badgeCls: 'badge-gray', groupKey: 'D' },
  { tag: 'T1', label: 'T1', desc: '疗程套餐退款', badgeCls: 'badge-danger', groupKey: 'T' },
  { tag: 'T2', label: 'T2', desc: '体验卡退款',   badgeCls: 'badge-danger', groupKey: 'T' },
  { tag: 'S1', label: 'S1', desc: '流失客户（可回访）', badgeCls: 'badge-gray', groupKey: 'S' },
  { tag: 'S2', label: 'S2', desc: '流失客户（无效）',   badgeCls: 'badge-gray', groupKey: 'S' },
];

interface GroupMeta { key: string; name: string; desc: string; badgeCls: string }
const TAG_GROUP_META: GroupMeta[] = [
  { key: 'V', name: 'VIP客户',    desc: 'V类',  badgeCls: 'badge-purple'  },
  { key: 'A', name: '已升套餐',   desc: 'A类',  badgeCls: 'badge-success' },
  { key: 'B', name: '已体验未升单', desc: 'B类', badgeCls: 'badge-warning' },
  { key: 'C', name: '已购体验卡', desc: 'C类',  badgeCls: 'badge-info'    },
  { key: 'D', name: '种子客户',   desc: 'D类',  badgeCls: 'badge-gray'    },
  { key: 'T', name: '退款客户',   desc: 'T类',  badgeCls: 'badge-danger'  },
  { key: 'S', name: '流失客户',   desc: 'S类',  badgeCls: 'badge-gray'    },
];

function getTagDef(tag: CustomerTag): TagDef {
  return TAG_DEFS.find(d => d.tag === tag) ?? TAG_DEFS[TAG_DEFS.length - 1];
}

function textOf(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

const ALL_TAGS: CustomerTag[] = TAG_DEFS.map(d => d.tag);

// ─────────────────────────── New follow status system ───────────────────────────
type NewFollowStatus = '跟进中' | '待跟进' | '已完成' | '延迟';

interface FollowRecord {
  id: string;
  date: string;       // planned follow date
  content: string;    // follow task/todo
  feedback: string;   // post-follow feedback entered by advisor
  status: NewFollowStatus;
  operator: string;
  followerId?: string;
  followerName?: string;
  createdAt: string;
}

// Module-level follow records map (keyed by customerId)

// Module-level task map (keyed by customerId) for the 跟进事项 column

// New display statuses (4 values)
const NEW_DISPLAY_STATUSES: NewFollowStatus[] = ['跟进中', '待跟进', '已完成', '延迟'];

const NEW_STATUS_BADGE: Record<NewFollowStatus, string> = {
  '跟进中':  'badge-info',
  '待跟进':  'badge-warning',
  '已完成':  'badge-success',
  '延迟':    'badge-danger',
};

function isNewFollowStatus(value: unknown): value is NewFollowStatus {
  return value === '跟进中' || value === '待跟进' || value === '已完成' || value === '延迟';
}

function toStoredFollowStatus(status: NewFollowStatus): FollowStatus {
  if (status === '已完成') return '已预约';
  if (status === '延迟') return '跟进中';
  return status;
}

/** Compute the visual follow status from customer data */
function computeDisplayStatus(c: Customer, storedStatus: string): NewFollowStatus {
  const persistedStatus = getPersistedProfile(c).followDisplayStatus;
  if (isNewFollowStatus(persistedStatus)) return persistedStatus;
  if (isNewFollowStatus(storedStatus)) return storedStatus;
  if (!c.followDate) {
    if (storedStatus === '跟进中') return '跟进中';
    return '待跟进';
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fd = new Date(c.followDate); fd.setHours(0, 0, 0, 0);
  const isPast = fd < today;
  // If stored as a "completed" analog
  if (storedStatus === '已成交' || storedStatus === '已预约') return '已完成';
  if (storedStatus === '已流失') return '已完成';
  if (isPast) {
    console.warn(`[跟进提醒] 客户 ${c.name} 跟进已逾期，请尽快联系客服和管理员`);
    return '延迟';
  }
  if (fd >= today && storedStatus === '跟进中') return '跟进中';
  if (fd >= today) return '待跟进';
  return '跟进中';
}

// ─────────────────────────── Old status (kept for stored value) ───────────────────────────
const ALL_STATUSES: NewFollowStatus[] = ['跟进中', '待跟进', '已完成', '延迟'];
const FILTER_STATUSES = ['跟进中', '待跟进', '已完成', '延迟'];

// ─────────────────────────── Options ───────────────────────────
const SOURCE_OPTIONS = ['小红书', '视频号', '美团大众', '抖音', '老客转介绍', '月嫂介绍', '朋友推荐', '其他'];
const AREA_OPTIONS = ['厦门', '泉州', '漳州'];
const PRODUCT_OPTIONS = ['盆底肌', '骨盆', '腹直肌', '运动康复', '身体调理', '其他'];
const INIT_TAG_OPTIONS: CustomerTag[] = ['D1', 'D2', 'D3'];
const FALLBACK_SERVICE_ADVISORS = ['张管理员', '李客服'];

type PersonOption = { id: string; name: string };

function uniquePersonOptions(options: PersonOption[]): PersonOption[] {
  const seen = new Set<string>();
  const result: PersonOption[] = [];
  options.forEach(option => {
    const name = textOf(option.name).trim();
    if (!name) return;
    const key = option.id || name;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ id: option.id || name, name });
  });
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(v => textOf(v).trim()).filter(Boolean)));
}

// ─────────────────────────── Date filter ───────────────────────────
type DateRange = 'all' | 'today' | 'week' | 'month';

function getDateRangeLabel(r: DateRange): string {
  return { all: '全部', today: '今日', week: '近一周', month: '近一个月' }[r];
}

function matchDateRange(dateStr: string, range: DateRange): boolean {
  if (range === 'all') return true;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  if (range === 'today') return d.getTime() === today.getTime();
  if (range === 'week') {
    const from = new Date(today); from.setDate(today.getDate() - 6);
    return d >= from && d <= today;
  }
  if (range === 'month') {
    const from = new Date(today); from.setDate(today.getDate() - 29);
    return d >= from && d <= today;
  }
  return true;
}

// ─────────────────────────── CSV Template ───────────────────────────
const CUSTOMER_IMPORT_HEADERS = ['姓名', '微信号', '联系电话', '所在区域', '来源渠道', '获客时间', '意向产品', '出生年份', '生产时间', '第几胎', '分娩方式', '喂养方式', '需求情况', '备注'];

function downloadCustomerTemplate() {
  downloadXlsx('客户批量导入模板.xlsx', CUSTOMER_IMPORT_HEADERS, []);
}

// ─────────────────────────── Helpers ───────────────────────────
function profileSummary(p: CustomerProfile | null | undefined): string {
  const profile = {
    age: 0,
    deliveryDate: '',
    deliveryType: '未知',
    babyCount: 0,
    feedingType: '未知',
    ...(p ?? {}),
  };
  const pregnancy = profile.babyCount ? `第${profile.babyCount}胎` : '未知';
  return `${profile.age || '—'}岁 · ${profile.deliveryDate || '—'} · ${profile.deliveryType || '未知'} · ${pregnancy} · ${profile.feedingType || '未知'}`;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nowIso(): string { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function recordTimeValue(value: unknown): number {
  const text = textOf(value).trim();
  if (!/\d{1,2}:\d{2}/.test(text)) return 0;
  const parsed = Date.parse(text.replace(' ', 'T'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDateInput(value: unknown): string {
  const text = textOf(value).trim();
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  return text;
}

type PersistedCustomerProfile = CustomerProfile & {
  followTask?: string;
  followDisplayStatus?: NewFollowStatus;
  followRecords?: FollowRecord[];
};

function getPersistedProfile(c: Customer): PersistedCustomerProfile {
  return {
    age: 0,
    deliveryDate: '',
    deliveryType: '未知',
    babyCount: 0,
    feedingType: '未知',
    ...(c.profile ?? {}),
  } as PersistedCustomerProfile;
}

function getFollowTask(c: Customer): string {
  return getPersistedProfile(c).followTask ?? '';
}

function getFollowRecords(c: Customer): FollowRecord[] {
  const records = getPersistedProfile(c).followRecords;
  return Array.isArray(records)
    ? [...records].sort((a, b) => recordTimeValue(b.createdAt) - recordTimeValue(a.createdAt))
    : [];
}

// ─────────────────────────── TaskTooltip ───────────────────────────
function TaskTooltip({ text, isOverdue = false }: { text: string; isOverdue?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const bgColor = isOverdue ? 'rgba(239,68,68,0.95)' : 'rgba(15,23,42,0.93)';
  const arrowColor = isOverdue ? 'rgba(239,68,68,0.95)' : 'rgba(15,23,42,0.93)';

  function handleMouseMove(e: React.MouseEvent) {
    setPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block', maxWidth: 155, cursor: 'default' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onMouseMove={handleMouseMove}
    >
      {/* 截断显示 */}
      <span
        className="text-xs"
        style={{
          color: isOverdue ? '#ef4444' : 'var(--foreground)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textAlign: 'left',
          wordBreak: 'break-all',
        }}
      >
        {text}
      </span>

      {/* 浮层：通过 portal 挂在 body 上，跟随鼠标 */}
      {visible && (
        <div
          style={{
            position: 'fixed',
            left: pos.x + 12,
            top: pos.y - 12,
            transform: 'translateY(-100%)',
            zIndex: 99999,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: bgColor,
              color: '#fff',
              borderRadius: 6,
              padding: '7px 11px',
              fontSize: 12,
              lineHeight: 1.6,
              maxWidth: 280,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
            }}
          >
            {text}
          </div>
          {/* 三角箭头朝下 */}
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `6px solid ${arrowColor}`,
              marginLeft: 14,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Form types ───────────────────────────
interface CustomerForm {
  acquiredAt: string; source: string; name: string; wechat: string;
  phone: string; area: string; intendedProducts: string[]; deliveryDate: string;
  babyCount: string; deliveryType: '未知' | '顺产' | '剖腹产'; feedingType: '未知' | '母乳' | '奶粉' | '混合喂养';
  birthYear: string; situation: string; tag: CustomerTag; advisor: string; remark: string;
  followStatus: NewFollowStatus; followDate: string; followContent: string;
  followerId: string; followerName: string;
  followTask: string; // NEW: follow task/todo item
}

function blankForm(advisor: string, followerId = '', followerName = advisor): CustomerForm {
  return {
    acquiredAt: todayStr(), source: '小红书', name: '', wechat: '', phone: '',
    area: '', intendedProducts: [], deliveryDate: '', babyCount: '',
    deliveryType: '未知', feedingType: '未知', birthYear: '', situation: '',
    tag: 'D1', advisor, remark: '',
    followStatus: '待跟进', followDate: '', followContent: '', followerId, followerName, followTask: '',
  };
}

function customerToForm(c: Customer, fallbackAdvisor = '', followerId = '', followerName = ''): CustomerForm {
  const profile = getPersistedProfile(c);
  const latestOpenRecord = getFollowRecords(c).find(r => r.status !== '已完成');
  const birthYear = profile.age > 0
    ? String(new Date().getFullYear() - profile.age)
    : '';
  const advisor = textOf(c.advisor) || fallbackAdvisor;
  return {
    acquiredAt: textOf(c.acquiredAt) || todayStr(), source: textOf(c.source), name: textOf(c.name), wechat: textOf(c.wechat),
    phone: textOf(c.phone), area: textOf(c.area),
    intendedProducts: textOf(c.intendedProduct).split(',').map(s => s.trim()).filter(Boolean),
    deliveryDate: normalizeDateInput(profile.deliveryDate), babyCount: profile.babyCount ? String(profile.babyCount) : '',
    deliveryType: profile.deliveryType || '未知', feedingType: profile.feedingType || '未知',
    birthYear, situation: textOf(c.situation), tag: (textOf(c.tag) || 'D1') as CustomerTag,
    advisor, remark: textOf(c.remark),
    followStatus: latestOpenRecord?.status ?? computeDisplayStatus(c, c.followStatus),
    followDate: latestOpenRecord?.date ?? textOf(c.followDate),
    followContent: latestOpenRecord?.feedback ?? '',
    followerId: latestOpenRecord?.followerId || followerId || '',
    followerName: latestOpenRecord?.followerName || followerName || advisor,
    followTask: latestOpenRecord?.content ?? getFollowTask(c),
  };
}

// ─────────────────────────── MultiSelect Dropdown ───────────────────────────
interface MultiSelectProps {
  label: string;
  allOptions: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  renderOption?: (opt: string) => React.ReactNode;
  renderLabel?: (selected: string[]) => React.ReactNode;
  width?: number;
  groupedOptions?: { groupLabel: string; groupBadge: string; options: string[] }[];
}

function MultiSelectDropdown({
  label,
  allOptions,
  selected,
  onChange,
  renderOption,
  renderLabel,
  width = 200,
  groupedOptions,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isAll = selected.length === allOptions.length;

  function toggleAll() {
    if (isAll) onChange([]);
    else onChange([...allOptions]);
  }

  function toggleOne(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
    else onChange([...selected, opt]);
  }

  function toggleGroup(opts: string[]) {
    const allIn = opts.every(o => selected.includes(o));
    if (allIn) onChange(selected.filter(s => !opts.includes(s)));
    else {
      const next = [...selected];
      opts.forEach(o => { if (!next.includes(o)) next.push(o); });
      onChange(next);
    }
  }

  const displayLabel = isAll
    ? <span className="text-sm" style={{ color: 'var(--foreground)' }}>全部</span>
    : renderLabel
      ? renderLabel(selected)
      : <span className="text-sm" style={{ color: 'var(--brand)' }}>{selected.length > 0 ? `已选 ${selected.length}` : '全部'}</span>;

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors"
        style={{
          background: isAll ? 'var(--muted)' : 'rgba(30,136,229,0.08)',
          border: `1px solid ${isAll ? 'var(--border)' : 'var(--brand)'}`,
          color: 'var(--foreground)',
          minWidth: 72,
        }}
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
        {displayLabel}
        <ChevronDownIcon size={12} style={{
          color: 'var(--muted-foreground)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
          flexShrink: 0,
        }} />
      </button>

      <div className={open ? 'block' : 'hidden'}
        style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          width, background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 320, overflowY: 'auto',
        }}>
        {/* Select All row */}
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
          style={{ borderBottom: '1px solid var(--border)' }}
          onClick={toggleAll}
        >
          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: isAll ? 'var(--brand)' : 'transparent', border: `1.5px solid ${isAll ? 'var(--brand)' : 'var(--border)'}` }}>
            {isAll && <CheckIcon size={10} color="#fff" />}
          </div>
          <span className="text-sm font-medium text-foreground">全部</span>
        </div>

        {groupedOptions ? (
          groupedOptions.map(grp => {
            const allIn = grp.options.every(o => selected.includes(o));
            const someIn = grp.options.some(o => selected.includes(o));
            return (
              <div key={grp.groupLabel}>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted transition-colors"
                  style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
                  onClick={() => toggleGroup(grp.options)}
                >
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      background: allIn ? 'var(--brand)' : someIn ? 'rgba(30,136,229,0.3)' : 'transparent',
                      border: `1.5px solid ${allIn || someIn ? 'var(--brand)' : 'var(--border)'}`,
                    }}>
                    {allIn && <CheckIcon size={10} color="#fff" />}
                    {someIn && !allIn && <div style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--brand)' }} />}
                  </div>
                  <span className={`badge ${grp.groupBadge} text-xs`}>{grp.groupLabel}</span>
                  <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                    {grp.options.filter(o => selected.includes(o)).length}/{grp.options.length}
                  </span>
                </div>
                {grp.options.map(opt => {
                  const tagDef = TAG_DEFS.find(d => d.tag === opt);
                  return (
                    <div key={opt}
                      className="flex items-center gap-2 pl-6 pr-3 py-1.5 cursor-pointer hover:bg-muted transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onClick={() => toggleOne(opt)}>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{ background: selected.includes(opt) ? 'var(--brand)' : 'transparent', border: `1.5px solid ${selected.includes(opt) ? 'var(--brand)' : 'var(--border)'}` }}>
                        {selected.includes(opt) && <CheckIcon size={10} color="#fff" />}
                      </div>
                      {renderOption
                        ? renderOption(opt)
                        : tagDef
                          ? (
                            <span className="flex items-center gap-1.5">
                              <span className={`badge ${tagDef.badgeCls} text-xs`}>{opt}</span>
                              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{tagDef.desc}</span>
                            </span>
                          )
                          : <span className="text-sm text-foreground">{opt}</span>
                      }
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          allOptions.map(opt => (
            <div key={opt}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
              style={{ borderBottom: '1px solid var(--border)' }}
              onClick={() => toggleOne(opt)}>
              <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: selected.includes(opt) ? 'var(--brand)' : 'transparent', border: `1.5px solid ${selected.includes(opt) ? 'var(--brand)' : 'var(--border)'}` }}>
                {selected.includes(opt) && <CheckIcon size={10} color="#fff" />}
              </div>
              {renderOption ? renderOption(opt) : <span className="text-sm text-foreground">{opt}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Inline Product MultiSelect (for form) ───────────────────────────
interface InlineProductSelectProps {
  selected: string[];
  onChange: (next: string[]) => void;
}

function InlineProductSelect({ selected = [], onChange = () => {} }: InlineProductSelectProps) {
  function toggle(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
    else onChange([...selected, opt]);
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg" style={{ background: 'var(--background)', border: '1px solid var(--border)', minHeight: 40 }}>
      {PRODUCT_OPTIONS.map(opt => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              background: active ? 'var(--brand)' : 'var(--muted)',
              color: active ? '#fff' : 'var(--foreground)',
              border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            {active && <CheckIcon size={9} />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Sub-components ───────────────────────────
const inputCls = 'w-full text-sm px-3 py-2 rounded-lg outline-none border transition-colors focus:border-blue-400';
const inputStyle: React.CSSProperties = { background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' };

function FF({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
        {label}{required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────── Freeze-pane sticky styles ───────────────────────────
// Compact widths for the first four frozen columns
const COL_W = [82, 64, 96, 54] as const; // 获客时间 | 客户ID | 客户姓名 | 标签
const COL_LEFT: [number, number, number, number] = [
  0,
  COL_W[0],
  COL_W[0] + COL_W[1],
  COL_W[0] + COL_W[1] + COL_W[2],
];
const FREEZE_SHADOW = '4px 0 8px -2px rgba(0,0,0,0.14)';

const STICKY_TH_STYLE = (i: 0 | 1 | 2 | 3): React.CSSProperties => ({
  position: 'sticky',
  left: COL_LEFT[i],
  zIndex: 3,
  minWidth: COL_W[i],
  width: COL_W[i],
  background: 'var(--muted)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  padding: '6px 4px',
  ...(i === 3 ? {
    borderRight: '2px solid var(--border)',
    boxShadow: FREEZE_SHADOW,
    clipPath: 'inset(0 -12px 0 0)',
  } : {}),
});

const STICKY_TD_STYLE = (i: 0 | 1 | 2 | 3, bg: string): React.CSSProperties => ({
  position: 'sticky',
  left: COL_LEFT[i],
  zIndex: 2,
  minWidth: COL_W[i],
  width: COL_W[i],
  background: bg,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  padding: '6px 4px',
  ...(i === 3 ? {
    borderRight: '2px solid var(--border)',
    boxShadow: FREEZE_SHADOW,
    clipPath: 'inset(0 -12px 0 0)',
  } : {}),
});

// ─────────────────────────── Main component ───────────────────────────
export default function CustomersListPage() {
  const { currentUser } = useApp();
  const canChooseAdvisor = currentUser.role === 'superadmin' || currentUser.role === 'admin';
  const canChooseFollower = canChooseAdvisor;
  const usersQuery = useSystemUsers(canChooseAdvisor || canChooseFollower);
  const assignableUsers = (usersQuery.data?.data ?? [])
    .filter(u => u.status === 'active' && (u.role === 'superadmin' || u.role === 'admin' || u.role === 'service'))
    .map(u => ({ id: u.id, name: u.name }));
  const currentUserOption = { id: currentUser.id, name: currentUser.name };
  const advisorOptions = canChooseAdvisor
    ? uniquePersonOptions([
      ...assignableUsers,
      currentUserOption,
      ...FALLBACK_SERVICE_ADVISORS.map(name => ({ id: name, name })),
    ])
    : uniquePersonOptions([currentUserOption]);
  const advisorNames = advisorOptions.map(u => u.name);
  const defaultAdvisorName =
    advisorOptions.find(u => u.id === currentUser.id)?.name
    || textOf(currentUser.name)
    || advisorNames[0]
    || '';
  const followerOptions = canChooseFollower
    ? uniquePersonOptions([...assignableUsers, currentUserOption])
    : uniquePersonOptions([currentUserOption]);
  const defaultFollower = followerOptions.find(u => u.id === currentUser.id) ?? followerOptions[0] ?? { id: currentUser.id, name: currentUser.name };
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [areaFilter, setAreaFilter] = useState<string[]>([...AREA_OPTIONS]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([...SOURCE_OPTIONS]);
  const [statusFilter, setStatusFilter] = useState<string[]>([...FILTER_STATUSES]);
  const [tagFilter, setTagFilter] = useState<CustomerTag[]>([...ALL_TAGS]);
  const [advisorFilter, setAdvisorFilter] = useState<string[]>([]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'basic' | 'profile' | 'follow' | 'orders'>('basic');

  const customersQuery = useCustomers({ page: 1, pageSize: 10000 });
  const customers: Customer[] = (customersQuery.data?.data ?? []) as any;
  const mutations = useCustomerMutations();
  const ordersQuery = useOrders({ customerId: detailId || '', page: 1, pageSize: 100 });
  // Local follow task map state (for re-rendering)

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<CustomerForm>(blankForm(textOf(currentUser.name), currentUser.id, currentUser.name));
  const addFormRef = useRef(addForm);
  const [addErrors, setAddErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CustomerForm>(blankForm(textOf(currentUser.name), currentUser.id, currentUser.name));
  const editFormRef = useRef(editForm);
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});

  const [showLegend, setShowLegend] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = currentUser.role !== 'finance' && currentUser.role !== 'therapist';
  const canManageBulk = currentUser.role === 'superadmin' || currentUser.role === 'admin';
  const advisorFilterOptions = uniqueStrings([
    ...advisorNames,
    ...customers.map(c => textOf(c.advisor)),
  ]);

  useEffect(() => {
    if (showAdd) return;
    const nextAdvisor = defaultAdvisorName || textOf(currentUser.name);
    setAddForm(prev => {
      if (prev.advisor === nextAdvisor && prev.followerId === defaultFollower.id && prev.followerName === defaultFollower.name) {
        return prev;
      }
      const next = { ...prev, advisor: nextAdvisor, followerId: defaultFollower.id, followerName: defaultFollower.name };
      addFormRef.current = next;
      return next;
    });
  }, [showAdd, defaultAdvisorName, currentUser.name, defaultFollower.id, defaultFollower.name]);

  // ── compute display statuses ──
  const customerDisplayStatus = (c: Customer): NewFollowStatus => computeDisplayStatus(c, c.followStatus);

  // ── filter ──
  const filtered = customers.filter(c => {
    const q = search.trim();
    const name = textOf(c.name);
    const phone = textOf(c.phone);
    const id = textOf(c.id);
    const wechat = textOf(c.wechat);
    const acquiredAt = textOf(c.acquiredAt);
    const area = textOf(c.area);
    const source = textOf(c.source);
    const advisor = textOf(c.advisor);
    const tag = textOf(c.tag) as CustomerTag;
    const matchSearch = !q || name.includes(q) || phone.includes(q) || id.includes(q) || wechat.includes(q);
    const matchDate = matchDateRange(acquiredAt, dateRange);
    const matchArea = areaFilter.length === 0 || areaFilter.some(a => area.includes(a)) || areaFilter.length === AREA_OPTIONS.length;
    const matchSource = sourceFilter.length === 0 || sourceFilter.includes(source) || sourceFilter.length === SOURCE_OPTIONS.length;
    const displaySt = customerDisplayStatus(c);
    const matchStatus = statusFilter.length === 0 || statusFilter.includes(displaySt) || statusFilter.length === FILTER_STATUSES.length;
    const matchTag = tagFilter.length === 0 || tagFilter.includes(tag) || tagFilter.length === ALL_TAGS.length;
    const matchAdvisor = advisorFilter.length === 0 || advisorFilter.includes(advisor) || advisorFilter.length === advisorFilterOptions.length;
    return matchSearch && matchDate && matchArea && matchSource && matchStatus && matchTag && matchAdvisor;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const detailCustomer = customers.find(c => c.id === detailId);
  const editCustomer   = customers.find(c => c.id === editId);

  function resetPage() { setPage(1); }

  // ── validate ──
  function validate(f: CustomerForm): Partial<Record<keyof CustomerForm, string>> {
    const e: Partial<Record<keyof CustomerForm, string>> = {};
    if (!f.name.trim())   e.name   = '请填写客户姓名';
    if (!f.wechat.trim()) e.wechat = '请填写微信号';
    if (!f.acquiredAt)    e.acquiredAt = '请选择获客时间';
    return e;
  }

  // ── add ──
  async function handleAdd() {
    const draft = addFormRef.current;
    const errs = validate(draft);
    if (Object.keys(errs).length) { setAddErrors(errs); return; }
    const birthYearNum = Number(draft.birthYear);
    const computedAge = birthYearNum > 1900 ? new Date().getFullYear() - birthYearNum : 0;
    const nc: any = {
      name: draft.name.trim(), wechat: draft.wechat.trim(),
      phone: draft.phone.trim(), area: draft.area.trim(),
      source: draft.source, acquiredAt: draft.acquiredAt,
      tag: draft.tag, followStatus: '待跟进', followDate: '',
      advisor: draft.advisor, totalOrders: 0, lastFollow: todayStr(),
      profile: {
        age: computedAge,
        deliveryDate: draft.deliveryDate,
        deliveryType: draft.deliveryType,
        babyCount: Number(draft.babyCount) || 0,
        feedingType: draft.feedingType,
        followTask: draft.followTask,
        followDisplayStatus: draft.followStatus,
        followRecords: [],
      },
      situation: draft.situation,
      intendedProduct: draft.intendedProducts.join(','),
      remark: draft.remark,
    };
    try {
      await mutations.create(nc);
      toast.success('客户新增成功');
      setShowAdd(false); setAddErrors({});
    } catch (e: any) {
      toast.error(e?.message || '新增失败');
    }
  }

  // ── edit ──
  async function handleEdit() {
    if (!editId) return;
    const draft = editFormRef.current;
    const errs = validate(draft);
    if (Object.keys(errs).length) { setEditErrors(errs); return; }
    const birthYearNum = Number(draft.birthYear);
    const computedAge = birthYearNum > 1900 ? new Date().getFullYear() - birthYearNum : 0;

    const existingCustomer = customers.find(c => c.id === editId);
    const existingProfile = existingCustomer ? getPersistedProfile(existingCustomer) : null;
    let nextFollowRecords = existingCustomer ? getFollowRecords(existingCustomer) : [];

    // Append follow record when any follow field changes or receives feedback.
    const previousDisplayStatus = existingCustomer ? computeDisplayStatus(existingCustomer, existingCustomer.followStatus) : '待跟进';
    const hasUpdate =
      Boolean(draft.followContent.trim()) ||
      draft.followTask.trim() !== textOf(existingProfile?.followTask).trim() ||
      draft.followDate !== textOf(existingCustomer?.followDate) ||
      draft.followStatus !== previousDisplayStatus;
    if (hasUpdate) {
      const latestRecord = nextFollowRecords[0];
      const rec: FollowRecord = {
        id: latestRecord && latestRecord.status !== '已完成' ? latestRecord.id : `fr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        date: draft.followDate || todayStr(),
        content: draft.followTask.trim(),
        feedback: draft.followContent.trim(),
        status: draft.followStatus,
        operator: draft.followerName || currentUser.name,
        followerId: draft.followerId || currentUser.id,
        followerName: draft.followerName || currentUser.name,
        createdAt: nowIso(),
      };
      nextFollowRecords = latestRecord && latestRecord.status !== '已完成'
        ? [rec, ...nextFollowRecords.slice(1)]
        : [rec, ...nextFollowRecords];
    }

    const updated: any = {
      name: draft.name.trim(), wechat: draft.wechat.trim(),
      phone: draft.phone.trim(), area: draft.area.trim(),
      source: draft.source, acquiredAt: draft.acquiredAt,
      tag: draft.tag, advisor: draft.advisor,
      intendedProduct: draft.intendedProducts.join(','),
      situation: draft.situation,
      remark: draft.remark,
      followStatus: toStoredFollowStatus(draft.followStatus),
      followDate: draft.followDate,
      profile: {
        ...(existingProfile ?? {}),
        age: computedAge > 0 ? computedAge : 0,
        deliveryDate: draft.deliveryDate,
        deliveryType: draft.deliveryType,
        babyCount: Number(draft.babyCount) || 0,
        feedingType: draft.feedingType,
        followTask: draft.followTask,
        followDisplayStatus: draft.followStatus,
        followRecords: nextFollowRecords,
      },
    };
    try {
      await mutations.update({ id: editId, body: updated });
      toast.success('客户更新成功');
      setEditId(null); setEditErrors({});
    } catch (e: any) {
      toast.error(e?.message || '更新失败');
    }
  }

  // ── form field update ──
  function patchAdd(k: keyof CustomerForm, v: string, render = true) {
    const next = { ...addFormRef.current, [k]: v };
    addFormRef.current = next;
    if (render) setAddForm(next);
    if (addErrors[k]) setAddErrors(p => { const n = { ...p }; delete n[k]; return n; });
  }
  function patchEdit(k: keyof CustomerForm, v: string, render = true) {
    const next = { ...editFormRef.current, [k]: v };
    editFormRef.current = next;
    if (render) setEditForm(next);
    if (editErrors[k]) setEditErrors(p => { const n = { ...p }; delete n[k]; return n; });
  }

  function patchAddProducts(products: string[]) {
    const next = { ...addFormRef.current, intendedProducts: products };
    addFormRef.current = next;
    setAddForm(next);
  }
  function patchEditProducts(products: string[]) {
    const next = { ...editFormRef.current, intendedProducts: products };
    editFormRef.current = next;
    setEditForm(next);
  }

  function handleCustomerExport() {
    const headers = ['客户ID', '客户姓名', '微信号', '联系电话', '所在区域', '来源渠道', '获客时间', '客户标签', '归属客服', '跟进状态', '下次跟进时间', '当前跟进事项', '最近跟进反馈', '订单数', '年龄', '生产时间', '第几胎', '分娩方式', '喂养方式', '意向产品', '需求情况', '备注', '全部跟进记录'];
    const rows = customers.map(customer => {
      const profile = getPersistedProfile(customer);
      const records = getFollowRecords(customer).map(record => [record.createdAt || record.date, record.status, record.followerName || record.operator, record.content, record.feedback].filter(Boolean).join(' | ')).join('\n');
      const latest = getFollowRecords(customer)[0];
      return [
        customer.id, customer.name, customer.wechat, customer.phone, customer.area, customer.source, customer.acquiredAt,
        customer.tag, customer.advisor, customerDisplayStatus(customer), customer.followDate, profile.followTask || '', latest?.feedback || '',
        customer.totalOrders, profile.age || '', profile.deliveryDate || '', profile.babyCount || '', profile.deliveryType || '',
        profile.feedingType || '', customer.intendedProduct, customer.situation, customer.remark, records,
      ];
    });
    downloadXlsx(`客户完整信息_${todayStr()}.xlsx`, headers, rows);
    toast.success(`已导出 ${rows.length} 位客户的完整信息`);
  }

  // ── Spreadsheet import ──
  async function handleImport() {
    if (!importFile) return;
    try {
      const sheetRows = await readSpreadsheet(importFile);
      if (!sheetRows[0]?.includes('姓名')) { setImportMsg('未找到“姓名”列，请使用下载的客户导入模板。'); return; }
      const dataRows = rowsToObjects(sheetRows);
      if (dataRows.length === 0) { setImportMsg('文件内容为空或格式有误，请使用下载的模板。'); return; }
      const newCustomers: Partial<Customer>[] = [];
      dataRows.forEach(row => {
        const name = row['姓名'] || '';
        const wechat = row['微信号'] || '';
        const phone = row['联系电话'] || '';
        if (!name && !wechat) return;
        const area = row['所在区域'] || '';
        const source = row['来源渠道'] || '其他';
        const acquiredAt = row['获客时间'] || todayStr();
        const intendedProduct = row['意向产品'] || '';
        const birthYearRaw = Number(row['出生年份']) || 0;
        const age = birthYearRaw > 1900 ? new Date().getFullYear() - birthYearRaw : 0;
        const deliveryDate = row['生产时间'] || '';
        const babyCount = Number(row['第几胎']) || 1;
        const rawDelivery = row['分娩方式'];
        const deliveryType: '顺产' | '剖腹产' = rawDelivery === '剖腹产' ? '剖腹产' : '顺产';
        const rawFeeding = row['喂养方式'];
        const feedingType: '母乳' | '奶粉' | '混合喂养' =
          rawFeeding === '奶粉' ? '奶粉' : rawFeeding === '混合喂养' ? '混合喂养' : '母乳';
        const situation = row['需求情况'] || '';
        const remark = row['备注'] || '';
        const nc: Partial<Customer> = {
          name, wechat, phone, area, source, acquiredAt,
          tag: 'D1', followStatus: '待跟进', followDate: '',
          advisor: defaultAdvisorName, totalOrders: 0, lastFollow: todayStr(),
          profile: { age, deliveryDate, deliveryType, babyCount, feedingType, followTask: '', followDisplayStatus: '待跟进', followRecords: [] } as PersistedCustomerProfile,
          situation, intendedProduct, remark,
        };
        newCustomers.push(nc);
      });
      if (newCustomers.length === 0) { setImportMsg('未解析到有效数据，请检查文件格式'); return; }
      setImportMsg(`正在导入 ${newCustomers.length} 条...`);
      const results = await Promise.all(newCustomers.map(nc => mutations.create(nc).then(() => true).catch(() => false)));
      const success = results.filter(Boolean).length;
      setImportMsg(success === newCustomers.length ? `成功导入 ${success} 条客户数据` : `成功导入 ${success} 条，失败 ${newCustomers.length - success} 条，请检查重复或必填信息。`);
      if (success > 0) setImportFile(null);
    } catch (error: any) {
      setImportMsg(error?.message || '导入失败，请检查文件格式后重试。');
    }
  }

  // ── shared form render ──
  function renderForm(
    form: CustomerForm,
    patch: (k: keyof CustomerForm, v: string, render?: boolean) => void,
    patchProducts: (products: string[]) => void,
    errors: Partial<Record<keyof CustomerForm, string>>,
    isEdit: boolean,
    previewId?: string,
  ) {
    const tagOptions = isEdit ? ALL_TAGS : INIT_TAG_OPTIONS;
    const formAdvisorOptions = uniquePersonOptions([
      ...advisorOptions,
      form.advisor ? { id: form.advisor, name: form.advisor } : { id: defaultAdvisorName, name: defaultAdvisorName },
    ]);
    return (
      <div className="flex flex-col gap-4 p-6 overflow-y-auto" style={{ maxHeight: 560 }}>
        {/* Row 1: 获客时间 / 客户ID / 来源渠道 / 归属客服 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <FF label="获客时间" required>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.acquiredAt} onChange={e => patch('acquiredAt', e.target.value)} />
              {errors.acquiredAt && <span className="text-xs text-red-500">{errors.acquiredAt}</span>}
            </FF>
          </div>
          <div style={{ width: 110, flexShrink: 0 }}>
            <FF label="客户ID">
              <div
                className="flex items-center px-3 rounded-lg text-sm font-mono select-all"
                style={{
                  ...inputStyle,
                  background: 'var(--muted)',
                  height: 38,
                  color: 'var(--muted-foreground)',
                  border: '1px dashed var(--border)',
                  cursor: 'default',
                  letterSpacing: '0.03em',
                }}
              >
                {previewId ?? '—'}
              </div>
            </FF>
          </div>
          <div className="flex-1">
            <FF label="来源渠道">
              <select className={inputCls + ' cursor-pointer'} style={inputStyle}
                value={form.source} onChange={e => patch('source', e.target.value)}>
                {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FF>
          </div>
          <div className="flex-1">
            <FF label="归属客服">
              <select className={inputCls + ' cursor-pointer'} style={inputStyle}
                value={form.advisor}
                disabled={!canChooseAdvisor}
                onChange={e => patch('advisor', e.target.value)}>
                {formAdvisorOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </FF>
          </div>
        </div>

        {/* Row 2: 客户姓名 / 微信号 / 联系方式 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <FF label="客户姓名" required>
              <input className={inputCls} style={inputStyle} placeholder="请输入姓名"
                defaultValue={form.name} onChange={e => patch('name', e.target.value, false)} />
              {errors.name && <span className="text-xs text-red-500">{errors.name}</span>}
            </FF>
          </div>
          <div className="flex-1">
            <FF label="微信号" required>
              <input className={inputCls} style={inputStyle} placeholder="请输入微信号"
                defaultValue={form.wechat} onChange={e => patch('wechat', e.target.value, false)} />
              {errors.wechat && <span className="text-xs text-red-500">{errors.wechat}</span>}
            </FF>
          </div>
          <div className="flex-1">
            <FF label="联系方式">
              <input className={inputCls} style={inputStyle} placeholder="手机号（选填）"
                defaultValue={form.phone} onChange={e => patch('phone', e.target.value, false)} />
            </FF>
          </div>
        </div>

        {/* Row 3: 所在地址 / 客户标签 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <FF label="所在地址">
              <input className={inputCls} style={inputStyle} placeholder="区域/小区"
                defaultValue={form.area} onChange={e => patch('area', e.target.value, false)} />
            </FF>
          </div>
          <div className="flex-1">
            <FF label={isEdit ? '客户标签' : '初定级'}>
              <select className={inputCls + ' cursor-pointer'} style={inputStyle}
                value={form.tag} onChange={e => patch('tag', e.target.value as CustomerTag)}>
                {tagOptions.map(t => {
                  const def = getTagDef(t);
                  return <option key={t} value={t}>{t} — {def.desc}</option>;
                })}
              </select>
            </FF>
          </div>
        </div>

        {/* 意向产品：多选 */}
        <FF label="意向产品">
          <InlineProductSelect
            selected={form.intendedProducts}
            onChange={patchProducts}
          />
          {form.intendedProducts.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              已选：{form.intendedProducts.join('、')}
            </span>
          )}
        </FF>

        {/* 跟进信息 */}
        {isEdit && (
          <div className="rounded-lg p-3 flex flex-col gap-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>跟进信息</span>
            <div className="flex gap-3">
              <div className="flex-1">
                <FF label="跟进人员">
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={form.followerId || currentUser.id}
                    disabled={!canChooseFollower}
                    onChange={e => {
                      const selected = followerOptions.find(u => u.id === e.target.value) ?? defaultFollower;
                      patch('followerId', selected.id);
                      patch('followerName', selected.name);
                    }}
                  >
                    {followerOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </FF>
              </div>
              <div className="flex-1">
                <FF label="跟进状态">
                  <select className={inputCls + ' cursor-pointer'} style={inputStyle}
                    value={form.followStatus} onChange={e => patch('followStatus', e.target.value as NewFollowStatus)}>
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FF>
              </div>
              <div className="flex-1">
                <FF label="下次跟进时间">
                  <input type="date" className={inputCls} style={inputStyle}
                    value={form.followDate} onChange={e => patch('followDate', e.target.value)} />
                </FF>
              </div>
            </div>
            <FF label="跟进事项（当前待办）">
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
                placeholder="记录本次跟进的任务和待办事项..."
                defaultValue={form.followTask} onChange={e => patch('followTask', e.target.value, false)} />
            </FF>
            <FF label="跟进反馈（本次备注）">
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 68, resize: 'vertical' }}
                placeholder="记录本次跟进情况，如：电话沟通，了解客户意向..."
                defaultValue={form.followContent} onChange={e => patch('followContent', e.target.value, false)} />
            </FF>
          </div>
        )}

        {/* 客户画像 */}
        <div className="rounded-lg p-3 flex flex-col gap-3" style={{ background: 'var(--muted)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>客户画像</span>
          <div className="flex gap-3">
            <div className="flex-1">
              <FF label="出生年份">
                <input type="number" className={inputCls} style={inputStyle} placeholder="例：1995"
                  min={1970} max={2010} defaultValue={form.birthYear}
                  onChange={e => patch('birthYear', e.target.value, false)} />
              </FF>
            </div>
            <div className="flex-1">
              <FF label="生产时间">
                <input type="date" className={inputCls} style={inputStyle}
                  value={form.deliveryDate} onChange={e => patch('deliveryDate', e.target.value)} />
              </FF>
            </div>
            <div className="flex-1">
              <FF label="第几胎">
                <select className={inputCls + ' cursor-pointer'} style={inputStyle}
                  value={form.babyCount} onChange={e => patch('babyCount', e.target.value)}>
                  <option value="">未知</option>
                  {['1', '2', '3', '4'].map(n => <option key={n} value={n}>第{n}胎</option>)}
                </select>
              </FF>
            </div>
            <div className="flex-1">
              <FF label="分娩方式">
                <select className={inputCls + ' cursor-pointer'} style={inputStyle}
                  value={form.deliveryType} onChange={e => patch('deliveryType', e.target.value as '顺产' | '剖腹产')}>
                  <option value="未知">未知</option>
                  <option value="顺产">顺产</option>
                  <option value="剖腹产">剖腹产</option>
                </select>
              </FF>
            </div>
            <div className="flex-1">
              <FF label="喂养方式">
                <select className={inputCls + ' cursor-pointer'} style={inputStyle}
                  value={form.feedingType} onChange={e => patch('feedingType', e.target.value as '母乳' | '奶粉' | '混合喂养')}>
                  <option value="未知">未知</option>
                  <option value="母乳">母乳</option>
                  <option value="奶粉">奶粉</option>
                  <option value="混合喂养">混合喂养</option>
                </select>
              </FF>
            </div>
          </div>
        </div>

        <FF label="需求及痛点">
          <textarea className={inputCls} style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            placeholder="客户主要需求、痛点描述..."
            defaultValue={form.situation} onChange={e => patch('situation', e.target.value, false)} />
        </FF>
        <FF label="备注">
          <input className={inputCls} style={inputStyle} placeholder="其他备注"
            defaultValue={form.remark} onChange={e => patch('remark', e.target.value, false)} />
        </FF>
      </div>
    );
  }

  // ── modal wrapper ──
  function ModalWrap({ show, title, onClose, onConfirm, confirmLabel = '保存', children, width = 880 }: {
    show: boolean; title: string; onClose: () => void; onConfirm: () => void;
    confirmLabel?: string; children: React.ReactNode; width?: number;
  }) {
    if (!show) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 opacity-100 pointer-events-auto"
        style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="bg-card rounded-2xl shadow-custom flex flex-col overflow-hidden"
          style={{ width, maxHeight: '90vh' }}>
          <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="font-bold text-base text-foreground">{title}</span>
            <div className="flex-1" />
            <button className="p-1.5 rounded hover:bg-muted" onClick={onClose}><XIcon size={16} /></button>
          </div>
          {children}
          <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}>
            <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
              onClick={onClose}>取消</button>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand)' }} onClick={onConfirm}>
              <SaveIcon size={13} />{confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── build tag grouped options for MultiSelect (with annotations) ──
  const tagGroupedOptions = TAG_GROUP_META.map(grp => ({
    groupLabel: `${grp.key} · ${grp.name}`,
    groupBadge: grp.badgeCls,
    options: TAG_DEFS.filter(d => d.groupKey === grp.key).map(d => d.tag as string),
  }));

  // Prevent unused variable warning

  // ── render ──
  return (
    <div data-cmp="CustomersListPage" className="flex flex-col gap-4">

      {/* ══ Search / Filter bar ══ */}
      <div className="bg-card rounded-xl p-4 shadow-custom flex flex-col gap-3">
        {/* row 1: search + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--muted)', minWidth: 220 }}>
            <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
            <input className="bg-transparent outline-none text-sm flex-1"
              placeholder="搜索客户姓名/微信/ID"
              value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            <FilterIcon size={13} />
            共 <strong className="text-foreground">{filtered.length}</strong> 位客户
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: showLegend ? 'rgba(30,136,229,0.1)' : 'var(--muted)',
              color: showLegend ? 'var(--brand)' : 'var(--muted-foreground)',
              border: `1px solid ${showLegend ? 'var(--brand)' : 'var(--border)'}`,
            }}
            onClick={() => setShowLegend(v => !v)}>
            <TagIcon size={13} />
            标签说明
            <ChevronDownIcon size={12}
              style={{ transform: showLegend ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>
          {canManageBulk && (
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
              style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              onClick={handleCustomerExport}>
              <DownloadIcon size={13} />批量导出
            </button>
          )}
          {canEdit && (
            <>
              {canManageBulk && <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                onClick={() => { setImportFile(null); setImportMsg(''); setShowImport(true); }}>
                <UploadIcon size={13} />批量导入
              </button>}
              <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
                style={{ background: 'var(--brand)' }}
                onClick={() => {
                  const nextForm = blankForm(defaultAdvisorName, defaultFollower.id, defaultFollower.name);
                  addFormRef.current = nextForm;
                  setAddForm(nextForm);
                  setAddErrors({});
                  setShowAdd(true);
                }}>
                <PlusIcon size={14} />新增客户
              </button>
            </>
          )}
        </div>

        {/* row 2: filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 获客时间 */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium mr-1" style={{ color: 'var(--muted-foreground)' }}>获客时间</span>
            {(['all', 'today', 'week', 'month'] as DateRange[]).map(r => (
              <button key={r}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                style={{
                  background: dateRange === r ? 'var(--brand)' : 'var(--muted)',
                  color: dateRange === r ? '#fff' : 'var(--foreground)',
                  border: `1px solid ${dateRange === r ? 'var(--brand)' : 'var(--border)'}`,
                }}
                onClick={() => { setDateRange(r); resetPage(); }}>
                {getDateRangeLabel(r)}
              </button>
            ))}
          </div>

          <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />

          {/* 所在区域 */}
          <MultiSelectDropdown
            label="区域"
            allOptions={AREA_OPTIONS}
            selected={areaFilter}
            onChange={v => { setAreaFilter(v); resetPage(); }}
            width={160}
          />

          {/* 来源渠道 */}
          <MultiSelectDropdown
            label="来源"
            allOptions={SOURCE_OPTIONS}
            selected={sourceFilter}
            onChange={v => { setSourceFilter(v); resetPage(); }}
            width={180}
          />

          {/* 跟进状态 — 4 new values */}
          <MultiSelectDropdown
            label="状态"
            allOptions={FILTER_STATUSES}
            selected={statusFilter}
            onChange={v => { setStatusFilter(v); resetPage(); }}
            width={180}
            renderOption={opt => {
              const badge = NEW_STATUS_BADGE[opt as NewFollowStatus] ?? 'badge-gray';
              return <span className={`badge ${badge} text-xs`}>{opt}</span>;
            }}
          />

          {/* 客户标签 — with annotations */}
          <MultiSelectDropdown
            label="标签"
            allOptions={ALL_TAGS as string[]}
            selected={tagFilter as string[]}
            onChange={v => { setTagFilter(v as CustomerTag[]); resetPage(); }}
            width={300}
            groupedOptions={tagGroupedOptions}
            renderLabel={sel => (
              <span className="text-sm" style={{ color: 'var(--brand)' }}>
                {sel.length === ALL_TAGS.length ? '全部' : `已选 ${sel.length}`}
              </span>
            )}
          />

          {/* 归属客服 */}
          <MultiSelectDropdown
            label="客服"
            allOptions={advisorFilterOptions}
            selected={advisorFilter}
            onChange={v => { setAdvisorFilter(v); resetPage(); }}
            width={180}
          />
        </div>

        {/* ══ Tag legend table (collapsible) ══ */}
        <div className={showLegend ? 'block' : 'hidden'}>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  <th className="py-2 px-3 text-left font-semibold w-24" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>主标签</th>
                  <th className="py-2 px-3 text-left font-semibold w-20" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>标签符号</th>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>标签含义</th>
                </tr>
              </thead>
              <tbody>
                {TAG_GROUP_META.map(grp => {
                  const defs = TAG_DEFS.filter(d => d.groupKey === grp.key);
                  return defs.map((def, idx) => (
                    <tr key={def.tag}
                      style={{ borderBottom: idx === defs.length - 1 ? '1px solid var(--border)' : '1px dashed var(--border)' }}>
                      {idx === 0 && (
                        <td rowSpan={defs.length}
                          className="py-2 px-3 align-middle font-semibold text-center"
                          style={{ borderRight: '1px solid var(--border)', color: 'var(--foreground)' }}>
                          <div className="flex flex-col items-center gap-1">
                            <span className={`badge ${grp.badgeCls}`}>{grp.key}</span>
                            <span style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{grp.name}</span>
                          </div>
                        </td>
                      )}
                      <td className="py-1.5 px-3" style={{ borderRight: '1px solid var(--border)' }}>
                        <span className={`badge ${def.badgeCls}`}>{def.label}</span>
                      </td>
                      <td className="py-1.5 px-3" style={{ color: 'var(--foreground)' }}>{def.desc}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══ Data table ══ */}
      <div className="bg-card rounded-xl shadow-custom overflow-hidden">
        <div style={{ maxHeight: 'calc(100vh - 310px)', overflow: 'auto' }}>
          <table className="data-table w-full" style={{ borderCollapse: 'collapse', minWidth: 1496, tableLayout: 'fixed' }}>
            <colgroup>
              {[82, 64, 96, 54, 90, 100, 160, 130, 100, 96, 160, 180, 96, 88].map((width, index) => <col key={index} style={{ width }} />)}
            </colgroup>
            <thead>
              <tr>
                {/* Frozen columns 1-4 (sticky) */}
                <th style={STICKY_TH_STYLE(0)}>获客时间</th>
                <th style={STICKY_TH_STYLE(1)}>客户ID</th>
                <th style={STICKY_TH_STYLE(2)}>客户姓名</th>
                <th style={STICKY_TH_STYLE(3)}>标签</th>
                {/* Scrollable columns */}
                <th style={{ width: 90, textAlign: 'center' }}>跟进状态</th>
                <th style={{ width: 100, textAlign: 'center' }}>跟进时间</th>
                <th style={{ width: 160, textAlign: 'center' }}>跟进事项</th>
                <th style={{ width: 130, textAlign: 'center' }}>微信/电话</th>
                <th style={{ width: 100, textAlign: 'center' }}>所在区域</th>
                <th style={{ width: 96, textAlign: 'center' }}>来源渠道</th>
                <th style={{ width: 160, textAlign: 'center' }}>客户画像</th>
                <th style={{ width: 180, textAlign: 'center' }}>需求情况</th>
                <th style={{ width: 96, textAlign: 'center' }}>归属客服</th>
                <th style={{ minWidth: 88, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(c => {
                const def = getTagDef(c.tag);
                const displayStatus = customerDisplayStatus(c);
                const isOverdue = displayStatus === '延迟';
                const overdueColor = '#ef4444';
                const followTask = getFollowTask(c);
                // Frozen columns must have an opaque background to prevent content bleed-through
                const frozenBg = 'var(--card)';

                return (
                  <tr key={c.id}>
                    {/* Frozen col 1: 获客时间 */}
                    <td style={STICKY_TD_STYLE(0, frozenBg)}>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.acquiredAt}</span>
                    </td>
                    {/* Frozen col 2: 客户ID */}
                    <td style={STICKY_TD_STYLE(1, frozenBg)}>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{c.id}</span>
                    </td>
                    {/* Frozen col 3: 客户姓名 */}
                    <td style={STICKY_TD_STYLE(2, frozenBg)}>
                      <span
                        className="font-medium text-sm"
                        style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={c.name}
                      >
                        {c.name}
                      </span>
                    </td>
                    {/* Frozen col 4: 标签 — badge only, no desc */}
                    <td style={STICKY_TD_STYLE(3, frozenBg)}>
                      <span className={`badge ${def.badgeCls} text-xs`}>{c.tag}</span>
                    </td>

                    {/* 跟进状态 — 延迟时文字变红 */}
                    <td className="text-center" style={{ color: isOverdue ? overdueColor : undefined }}>
                      <span className={`badge ${NEW_STATUS_BADGE[displayStatus]} text-xs`}
                        style={isOverdue ? { background: 'rgba(239,68,68,0.12)', color: overdueColor, borderColor: 'rgba(239,68,68,0.3)' } : {}}>
                        {displayStatus}
                      </span>
                    </td>
                    {/* 跟进时间 — 延迟时变红 */}
                    <td className="text-center">
                      {c.followDate
                        ? <span className="text-xs font-medium" style={{ color: isOverdue ? overdueColor : 'var(--foreground)' }}>
                            {c.followDate}
                          </span>
                        : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </td>
                    {/* 跟进事项 — 延迟时变红，hover 浮层显示完整内容 */}
                    <td className="text-center">
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {followTask
                          ? <TaskTooltip text={followTask} isOverdue={isOverdue} />
                          : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>
                        }
                      </div>
                    </td>

                    {/* 微信/电话 */}
                    <td className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        {c.wechat && (
                          <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>{c.wechat}</span>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1">
                            <PhoneIcon size={10} style={{ color: 'var(--muted-foreground)' }} />
                            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.phone}</span>
                          </div>
                        )}
                        {!c.wechat && !c.phone && <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>}
                      </div>
                    </td>
                    <td className="text-sm text-center">{c.area}</td>
                    <td className="text-center"><span className="badge badge-info text-xs" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.source}>{c.source}</span></td>
                    <td className="text-center">
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)', lineHeight: 1.6, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={profileSummary(c.profile)}>
                        {profileSummary(c.profile)}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="text-xs line-clamp-2"
                        style={{ color: 'var(--muted-foreground)', display: 'block', maxWidth: 170, margin: '0 auto', textAlign: 'left', overflow: 'hidden' }} title={c.situation || ''}>
                        {c.situation || '—'}
                      </span>
                    </td>
                    <td className="text-sm text-center" style={{ color: 'var(--muted-foreground)' }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.advisor}>{c.advisor}</span></td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                          style={{ background: 'rgba(30,136,229,0.1)', color: 'var(--brand)' }}
                          onClick={() => { setDetailId(c.id); setDetailTab('basic'); }}>
                          <EyeIcon size={11} />查看
                        </button>
                        {canEdit && (
                          <button className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                            style={{ background: 'rgba(100,100,100,0.1)', color: 'var(--foreground)' }}
                            onClick={() => {
                              const nextForm = customerToForm(c, defaultAdvisorName);
                              nextForm.followerId = defaultFollower.id;
                              nextForm.followerName = defaultFollower.name;
                              editFormRef.current = nextForm;
                              setEditForm(nextForm);
                              setEditErrors({});
                              setEditId(c.id);
                            }}>
                            <EditIcon size={11} />编辑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    暂无匹配客户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            每页
            <select className="rounded-md px-2 py-1 text-sm bg-card" style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {[10, 20, 30, 50].map(size => <option key={size} value={size}>{size} 条</option>)}
            </select>
          </label>
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {filtered.length === 0
              ? '共 0 条'
              : `第 ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} 条，共 ${filtered.length} 条`}
          </span>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40"
              disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeftIcon size={14} />
            </button>
            {Array.from({ length: Math.min(totalPages, 9) }, (_, i) => i + 1).map(p => (
              <button key={p}
                className="w-7 h-7 rounded text-sm font-medium transition-all"
                style={{ background: p === page ? 'var(--brand)' : 'transparent', color: p === page ? '#fff' : 'var(--foreground)' }}
                onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40"
              disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ══ Detail Modal ══ */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200
        ${detailId ? 'opacity-100 pointer-events-auto' : 'hidden opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="bg-card rounded-2xl shadow-custom flex flex-col overflow-hidden"
          style={{ width: 700, maxHeight: '88vh' }}>
          {detailCustomer ? (
            <>
              <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ background: 'var(--brand)' }}>{detailCustomer.name[0]}</div>
                <div>
                  <div className="font-bold text-lg text-foreground">{detailCustomer.name}</div>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    ID: {detailCustomer.id} · {detailCustomer.wechat || detailCustomer.phone || '—'} · {detailCustomer.area}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className={`badge ${getTagDef(detailCustomer.tag).badgeCls}`}>{detailCustomer.tag}</span>
                  {(() => {
                    const ds = customerDisplayStatus(detailCustomer);
                    return <span className={`badge ${NEW_STATUS_BADGE[ds]}`}>{ds}</span>;
                  })()}
                  <button className="p-1.5 rounded hover:bg-muted ml-2"
                    onClick={() => setDetailId(null)}><XIcon size={15} /></button>
                </div>
              </div>

              <div className="flex px-6 gap-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                {(['basic', 'profile', 'follow', 'orders'] as const).map(tab => {
                  const lbl: Record<string, string> = { basic: '基本信息', profile: '客户画像', follow: '跟进记录', orders: '订单' };
                  return (
                    <button key={tab}
                      className="px-4 py-3 text-sm font-medium transition-colors"
                      style={{
                        color: detailTab === tab ? 'var(--brand)' : 'var(--muted-foreground)',
                        borderBottom: detailTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
                      }}
                      onClick={() => setDetailTab(tab)}>{lbl[tab]}</button>
                  );
                })}
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {/* 基本信息 tab */}
                <div className={detailTab === 'basic' ? 'block' : 'hidden'}>
                  <div className="flex flex-col gap-3">
                    {([
                      ['客户ID', detailCustomer.id],
                      ['姓名', detailCustomer.name],
                      ['微信号', detailCustomer.wechat || '—'],
                      ['联系电话', detailCustomer.phone || '—'],
                      ['所在区域', detailCustomer.area],
                      ['来源渠道', detailCustomer.source],
                      ['获客时间', detailCustomer.acquiredAt],
                      ['意向产品', detailCustomer.intendedProduct || '—'],
                      ['归属客服', detailCustomer.advisor],
                      ['下次跟进', detailCustomer.followDate || '—'],
                      ['备注', detailCustomer.remark || '—'],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-4">
                        <span className="text-sm w-20 flex-shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{k}</span>
                        <span className="text-sm font-medium text-foreground">{v}</span>
                      </div>
                    ))}
                    {/* Follow task */}
                    <div className="flex items-start gap-4">
                      <span className="text-sm w-20 flex-shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>跟进事项</span>
                      <span className="text-sm font-medium text-foreground">{getFollowTask(detailCustomer) || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* 客户画像 tab */}
                <div className={detailTab === 'profile' ? 'block' : 'hidden'}>
                  <div className="flex flex-col gap-4">
                    <div className="rounded-lg p-4" style={{ background: 'var(--muted)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <UserIcon size={14} style={{ color: 'var(--brand)' }} />
                        <span className="font-semibold text-sm text-foreground">基本画像</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ['年龄', getPersistedProfile(detailCustomer).age ? `${getPersistedProfile(detailCustomer).age}岁` : '—'],
                          ['生产时间', textOf(getPersistedProfile(detailCustomer).deliveryDate) || '—'],
                          ['分娩方式', textOf(getPersistedProfile(detailCustomer).deliveryType) || '—'],
                          ['第几胎', getPersistedProfile(detailCustomer).babyCount ? `第${getPersistedProfile(detailCustomer).babyCount}胎` : '—'],
                          ['喂养方式', textOf(getPersistedProfile(detailCustomer).feedingType) || '—'],
                        ] as [string, string][]).map(([k, v]) => (
                          <div key={k} className="flex flex-col items-center rounded-lg px-4 py-2 gap-0.5"
                            style={{ background: 'var(--card)', minWidth: 88 }}>
                            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{k}</span>
                            <span className="text-sm font-semibold text-foreground">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg p-4" style={{ background: 'var(--muted)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <CalendarIcon size={14} style={{ color: 'var(--brand)' }} />
                        <span className="font-semibold text-sm text-foreground">需求与客户情况</span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground">{detailCustomer.situation || '暂无记录'}</p>
                    </div>
                  </div>
                </div>

                {/* 跟进记录 tab — shows FollowRecord history */}
                <div className={detailTab === 'follow' ? 'block' : 'hidden'}>
                  {(() => {
                    const records = getFollowRecords(detailCustomer);
                    if (records.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                          <ClockIcon size={36} style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} />
                          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无跟进记录</span>
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                            编辑客户并填写跟进内容后，记录将自动保存在此处
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-col gap-3">
                        {records.map(rec => (
                          <div key={rec.id} className="p-4 rounded-xl flex flex-col gap-2"
                            style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ClockIcon size={12} style={{ color: 'var(--brand)' }} />
                                <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>计划跟进：{rec.date}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`badge ${NEW_STATUS_BADGE[rec.status]} text-xs`}>{rec.status}</span>
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>跟进人员：{rec.followerName || rec.operator}</span>
                              </div>
                            </div>
                            {rec.content && (
                              <div className="rounded-lg p-2.5" style={{ background: 'var(--card)' }}>
                                <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>跟进事项</div>
                                <div className="text-sm text-foreground">{rec.content}</div>
                              </div>
                            )}
                            {rec.feedback && (
                              <div className="rounded-lg p-2.5" style={{ background: 'rgba(30,136,229,0.05)', border: '1px solid rgba(30,136,229,0.15)' }}>
                                <div className="text-xs font-medium mb-1" style={{ color: 'var(--brand)' }}>跟进反馈</div>
                                <div className="text-sm text-foreground">{rec.feedback}</div>
                              </div>
                            )}
                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>记录时间：{rec.createdAt}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* 订单 tab */}
                <div className={detailTab === 'orders' ? 'block' : 'hidden'}>
                  {(() => {
                    const customerOrders: Order[] = (ordersQuery.data?.data ?? []) as any;
                    if (customerOrders.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-14 gap-3">
                          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                            style={{ background: 'var(--muted)' }}>
                            <ShoppingBagIcon size={28} style={{ color: 'var(--muted-foreground)', opacity: 0.45 }} />
                          </div>
                          <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>
                            该客户暂未购买体验卡
                          </span>
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>
                            购买体验卡或套餐后，订单信息将显示在此处
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-col gap-3">
                        {/* 订单统计行 */}
                        <div className="flex items-center gap-2 mb-1">
                          <PackageIcon size={13} style={{ color: 'var(--brand)' }} />
                          <span className="text-sm font-semibold text-foreground">
                            共 {customerOrders.length} 个订单
                          </span>
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                            · 累计消费 ¥{customerOrders.reduce((s, o) => s + o.amount, 0).toLocaleString()}
                          </span>
                        </div>

                        {customerOrders.map(order => {
                          const isExperience = order.type === '体验卡';
                          const progress = order.totalTimes > 0
                            ? Math.round((order.usedTimes / order.totalTimes) * 100)
                            : 0;

                          return (
                            <div key={order.id}
                              className="rounded-xl p-4 flex flex-col gap-3"
                              style={{
                                background: 'var(--muted)',
                                border: '1px solid var(--border)',
                              }}>
                              {/* 订单头部 */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                                    style={isExperience
                                      ? { background: 'rgba(30,136,229,0.12)', color: 'var(--brand)', border: '1px solid rgba(30,136,229,0.25)' }
                                      : { background: 'rgba(139,92,246,0.12)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.25)' }
                                    }>
                                    {order.type}
                                  </span>
                                  {order.isUpgrade && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                      style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' }}>
                                      已升套餐
                                    </span>
                                  )}
                                  {order.contractSigned && (
                                    <span className="text-xs px-2 py-0.5 rounded-full"
                                      style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
                                      已签合同
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                    {order.payStatus === '已付款'
                                      ? <span style={{ color: '#16a34a' }}>● 已付款</span>
                                      : order.payStatus === '待付款'
                                        ? <span style={{ color: '#d97706' }}>● 待付款</span>
                                        : <span style={{ color: '#dc2626' }}>● 已退款</span>}
                                  </span>
                                </div>
                              </div>

                              {/* 订单主信息 */}
                              <div className="flex items-center gap-6">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>订单金额</span>
                                  <span className="text-lg font-bold" style={{ color: 'var(--brand)' }}>
                                    ¥{order.amount.toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>购买时间</span>
                                  <span className="text-sm font-medium text-foreground">{order.createdAt}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>订单编号</span>
                                  <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{order.id}</span>
                                </div>
                              </div>

                              {/* 服务次数进度条 */}
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>服务进度</span>
                                  <span className="text-xs font-semibold text-foreground">
                                    {order.usedTimes} / {order.totalTimes} 次
                                  </span>
                                </div>
                                <div className="w-full h-2 rounded-full overflow-hidden"
                                  style={{ background: 'var(--card)' }}>
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                      width: `${progress}%`,
                                      background: progress >= 100
                                        ? 'var(--success)'
                                        : isExperience
                                          ? 'var(--brand)'
                                          : 'linear-gradient(90deg, var(--brand) 0%, #7c3aed 100%)',
                                    }}
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                    剩余 {order.totalTimes - order.usedTimes} 次
                                  </span>
                                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                    {progress}% 已使用
                                  </span>
                                </div>
                              </div>

                              {/* 服务项目数 */}
                              {order.serviceItemCount > 0 && (
                                <div className="flex items-center gap-1.5 pt-1"
                                  style={{ borderTop: '1px solid var(--border)' }}>
                                  <FileTextIcon size={12} style={{ color: 'var(--muted-foreground)' }} />
                                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                    包含 {order.serviceItemCount} 个服务项目
                                    {order.hasCoupon ? '  ·  含优惠券' : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0"
                style={{ borderTop: '1px solid var(--border)' }}>
                <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                  style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                  onClick={() => setDetailId(null)}>关闭</button>
                {canEdit && (
                  <button className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--brand)' }}
                    onClick={() => {
                      if (!detailCustomer) return;
                      const nextForm = customerToForm(detailCustomer, defaultAdvisorName, defaultFollower.id, defaultFollower.name);
                      editFormRef.current = nextForm;
                      setEditForm(nextForm);
                      setEditErrors({});
                      setEditId(detailCustomer.id);
                      setDetailId(null);
                    }}>编辑信息</button>
                )}
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>客户不存在</div>
          )}
        </div>
      </div>

      {/* ══ Add Modal ══ */}
      <ModalWrap show={showAdd} title="新增客户"
        onClose={() => setShowAdd(false)} onConfirm={handleAdd}>
        {renderForm(addFormRef.current, patchAdd, patchAddProducts, addErrors, false, '自动生成')}
      </ModalWrap>

      {/* ══ Edit Modal ══ */}
      <ModalWrap show={!!editId} title={`编辑客户 — ${editCustomer?.name ?? ''}`}
        onClose={() => setEditId(null)} onConfirm={handleEdit}>
        {renderForm(editFormRef.current, patchEdit, patchEditProducts, editErrors, true, editId ?? undefined)}
      </ModalWrap>

      {/* ══ Import Modal ══ */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200
        ${showImport ? 'opacity-100 pointer-events-auto' : 'hidden opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="bg-card rounded-2xl shadow-custom flex flex-col overflow-hidden"
          style={{ width: 560, maxHeight: '90vh' }}>
          <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <UploadIcon size={16} style={{ color: 'var(--brand)' }} />
            <span className="font-bold text-base text-foreground">批量导入客户</span>
            <div className="flex-1" />
            <button className="p-1.5 rounded hover:bg-muted"
              onClick={() => { setShowImport(false); setImportFile(null); setImportMsg(''); }}>
              <XIcon size={16} />
            </button>
          </div>

          <div className="p-6 flex flex-col gap-5 overflow-y-auto flex-1">
            <div className="rounded-lg px-4 py-3 text-sm leading-relaxed"
              style={{ background: 'rgba(30,136,229,0.08)', color: 'var(--brand)', border: '1px solid rgba(30,136,229,0.2)' }}>
              请先下载导入模板，按照列名填写客户信息后上传 CSV 文件。支持批量导入，每行代表一位客户。
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">第一步：下载模板</span>
              <button
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 self-start"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                onClick={downloadCustomerTemplate}>
                <DownloadIcon size={14} style={{ color: 'var(--brand)' }} />
                下载客户导入模板.xlsx
              </button>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                列名：{CUSTOMER_IMPORT_HEADERS.join('、')}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">第二步：上传文件</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  setImportFile(f);
                  setImportMsg('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-xl cursor-pointer transition-all hover:opacity-80"
                style={{
                  border: `2px dashed ${importFile ? 'var(--brand)' : 'var(--border)'}`,
                  background: importFile ? 'rgba(30,136,229,0.05)' : 'var(--muted)',
                  padding: '28px 16px',
                }}
                onClick={() => fileInputRef.current?.click()}>
                {importFile ? (
                  <>
                    <FileTextIcon size={32} style={{ color: 'var(--brand)' }} />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm font-semibold text-foreground">{importFile.name}</span>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {(importFile.size / 1024).toFixed(1)} KB · 点击重新选择
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <UploadIcon size={32} style={{ color: 'var(--muted-foreground)' }} />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm font-medium text-foreground">点击选择 Excel 或 CSV 文件</span>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        支持 .xlsx、.csv 格式，文件大小不超过 5MB
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {importMsg && (
              <div className="rounded-lg px-4 py-3 text-sm font-medium"
                style={{
                  background: importMsg.startsWith('✅') ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)',
                  color: importMsg.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
                  border: `1px solid ${importMsg.startsWith('✅') ? 'rgba(76,175,80,0.25)' : 'rgba(244,67,54,0.25)'}`,
                }}>
                {importMsg}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}>
            <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
              onClick={() => { setShowImport(false); setImportFile(null); setImportMsg(''); }}>
              取消
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{
                background: importFile ? 'var(--brand)' : 'var(--muted-foreground)',
                opacity: importFile ? 1 : 0.5,
                cursor: importFile ? 'pointer' : 'not-allowed',
              }}
              onClick={importFile ? handleImport : undefined}>
              <UploadIcon size={13} />开始导入
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
