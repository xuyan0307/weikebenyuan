import { useState, useRef, useEffect } from 'react';
import {
  SearchIcon, PlusIcon, EyeIcon, PencilIcon,
  ChevronLeftIcon, ChevronRightIcon, XIcon, CheckIcon,
  UserIcon, FileTextIcon, UsersIcon, MessageSquareIcon,
  ImageIcon, ChevronDownIcon, TagIcon, ZapIcon,
} from 'lucide-react';
import type { OrderType, PayStatus, Customer, CustomerTag } from '../data/mockData';
import { useApp } from '../hooks/useApp';
import { useOrders, useOrderMutations, useCustomers, useTherapists } from '../api/hooks';
import { toast } from 'sonner';

/* ─── Types ─────────────────────────────────────────── */
type NewPayStatus = '已支付' | '待支付' | '已付定金';
type TherapistType = '产康师' | '运动康复师' | '调理师';
type TherapistAssign = '待分配' | '无' | string;
type ContractStatus = '无' | '未回签' | '已回签';

interface ServicePerson {
  type: TherapistType;
  assign: TherapistAssign;
}

interface FollowRecord {
  date: string;
  content: string;
  operator: string;
}

interface OrderFollowRecord {
  id: string;
  date: string;
  content: string;
  feedback: string;
  status: '待跟进' | '跟进中' | '已完成' | '延迟';
  operator: string;
  createdAt: string;
}

interface OrderForm {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerArea: string;
  customerTag: CustomerTag | '';
  customerAdvisor: string;
  orderType: OrderType | '';
  amount: string;
  payStatus: NewPayStatus;
  purchaseDate: string;
  contractStatus: ContractStatus;
  servicePerson1: ServicePerson;
  servicePerson2: ServicePerson;
  servicePerson3: ServicePerson;
  serviceItems: string;
  appointmentTime: string;
  serviceNote: string;
  photos: string[];
  followRecords: FollowRecord[];
  newFollowDate: string;
  newFollowContent: string;
}

/* ─── Module-level persistent maps ────────────────────── */
const orderTherapistMap = new Map<string, { sp1: ServicePerson; sp2: ServicePerson; sp3: ServicePerson }>();
const orderFollowMap = new Map<string, OrderFollowRecord[]>();
const orderFollowTaskMap = new Map<string, string>();
const orderContractMap = new Map<string, ContractStatus>();
const orderServiceItemsMap = new Map<string, string>(); // orderId -> serviceItems string

/* ─── Constants & Helpers ────────────────────────────── */
const PAY_STATUS_COLORS: Record<PayStatus, string> = {
  '已付款': 'badge-success',
  '待付款': 'badge-warning',
  '已退款': 'badge-danger',
};

const NEW_PAY_STATUS_COLORS: Record<NewPayStatus, string> = {
  '已支付': 'badge-success',
  '待支付': 'badge-warning',
  '已付定金': 'badge-info',
};

const TAG_CLS: Partial<Record<CustomerTag, string>> = {
  V1: 'badge-purple', V2: 'badge-purple',
  A1: 'badge-success', A2: 'badge-success',
  B1: 'badge-warning', B2: 'badge-warning',
  C1: 'badge-info', C2: 'badge-info',
  D1: 'badge-gray', D2: 'badge-gray', D3: 'badge-gray',
  T1: 'badge-danger', T2: 'badge-danger',
  S1: 'badge-gray', S2: 'badge-gray',
};

const ORDER_TYPE_AMOUNTS: Record<string, number[]> = {
  '体验卡阶段': [199, 299, 399, 499],
  '套餐阶段': [3800, 5800, 6800, 9800, 12800, 15800],
};

const FOLLOW_STATUS_COLORS: Record<string, string> = {
  '待跟进': 'badge-warning',
  '跟进中': 'badge-info',
  '已完成': 'badge-success',
  '延迟': 'badge-danger',
};

/* ─── 常用服务品项 ─────────────────────────────────────── */
interface ServiceGroup {
  group: string;
  items: string[];
}

const SERVICE_PRESETS: ServiceGroup[] = [
  { group: '骨盆修复', items: ['骨盆修复', '骶髂关节复位', '耻骨联合修复', '髋关节松解'] },
  { group: '腹部修复', items: ['腹直肌修复', '腹部紧致塑形', '剖腹产疤痕修复'] },
  { group: '盆底康复', items: ['盆底肌修复', '盆底电刺激治疗', '阴道紧致'] },
  { group: '乳房护理', items: ['乳房疏通', '催乳', '乳腺疏通', '断奶回奶'] },
  { group: '身体调理', items: ['产后催乳按摩', '月子发汗', '全身经络疏通', '脊柱调整', '肩颈舒缓'] },
  { group: '运动康复', items: ['核心肌群激活', '产后瑜伽指导', '体态矫正训练'] },
];

/* ─── Freeze pane helpers ─────────────────────────────── */
const COL_W = [82, 64, 72, 54];
const COL_LEFT = COL_W.reduce<number[]>((acc, w, i) => {
  if (i === 0) return [0];
  return [...acc, acc[i - 1] + COL_W[i - 1]];
}, []);
const FREEZE_TOTAL = COL_W.reduce((s, w) => s + w, 0); // 272

const FREEZE_SHADOW = '4px 0 8px -2px rgba(0,0,0,0.14)';

function STICKY_TH_STYLE(colIdx: number): React.CSSProperties {
  const isLast = colIdx === COL_W.length - 1;
  return {
    position: 'sticky',
    left: COL_LEFT[colIdx],
    width: COL_W[colIdx],
    minWidth: COL_W[colIdx],
    maxWidth: COL_W[colIdx],
    zIndex: 3,
    background: 'var(--muted)',
    borderRight: isLast ? '2px solid var(--border)' : undefined,
    boxShadow: isLast ? FREEZE_SHADOW : undefined,
    clipPath: isLast ? 'inset(0 -12px 0 0)' : undefined,
    textAlign: 'center' as const,
  };
}

function STICKY_TD_STYLE(colIdx: number, bg: string): React.CSSProperties {
  const isLast = colIdx === COL_W.length - 1;
  return {
    position: 'sticky',
    left: COL_LEFT[colIdx],
    width: COL_W[colIdx],
    minWidth: COL_W[colIdx],
    maxWidth: COL_W[colIdx],
    zIndex: 2,
    background: bg,
    borderRight: isLast ? '2px solid var(--border)' : undefined,
    boxShadow: isLast ? FREEZE_SHADOW : undefined,
    clipPath: isLast ? 'inset(0 -12px 0 0)' : undefined,
    textAlign: 'center' as const,
  };
}

/* ─── Tag Definitions ────────────────────────────────── */
interface TagDef {
  tag: CustomerTag;
  label: string;
  desc: string;
  badgeCls: string;
  groupKey: string;
  groupLabel: string;
}

const TAG_DEFS: TagDef[] = [
  { tag: 'V1', label: 'V1', desc: '消费1W-3W之间VIP客户',          badgeCls: 'badge-purple',  groupKey: 'V', groupLabel: 'V 已成交高价值' },
  { tag: 'V2', label: 'V2', desc: '消费3W以上SVIP客户',            badgeCls: 'badge-purple',  groupKey: 'V', groupLabel: 'V 已成交高价值' },
  { tag: 'A1', label: 'A1', desc: '消费5000元以内，小疗程客户',     badgeCls: 'badge-success', groupKey: 'A', groupLabel: 'A 已成交' },
  { tag: 'A2', label: 'A2', desc: '消费5000-1W元之间，大疗程客户', badgeCls: 'badge-success', groupKey: 'A', groupLabel: 'A 已成交' },
  { tag: 'B1', label: 'B1', desc: '高意向',                        badgeCls: 'badge-warning', groupKey: 'B', groupLabel: 'B 意向客户' },
  { tag: 'B2', label: 'B2', desc: '普通意向',                      badgeCls: 'badge-warning', groupKey: 'B', groupLabel: 'B 意向客户' },
  { tag: 'C1', label: 'C1', desc: '待约具体时间',                  badgeCls: 'badge-info',    groupKey: 'C', groupLabel: 'C 体验预约' },
  { tag: 'C2', label: 'C2', desc: '已约具体时间',                  badgeCls: 'badge-info',    groupKey: 'C', groupLabel: 'C 体验预约' },
  { tag: 'D1', label: 'D1', desc: '高意向',                        badgeCls: 'badge-gray',    groupKey: 'D', groupLabel: 'D 待开发' },
  { tag: 'D2', label: 'D2', desc: '普通意向',                      badgeCls: 'badge-gray',    groupKey: 'D', groupLabel: 'D 待开发' },
  { tag: 'D3', label: 'D3', desc: '沉默客户（不说话）',            badgeCls: 'badge-gray',    groupKey: 'D', groupLabel: 'D 待开发' },
  { tag: 'T1', label: 'T1', desc: '疗程套餐退款',                  badgeCls: 'badge-danger',  groupKey: 'T', groupLabel: 'T 退款' },
  { tag: 'T2', label: 'T2', desc: '体验卡退款',                    badgeCls: 'badge-danger',  groupKey: 'T', groupLabel: 'T 退款' },
  { tag: 'S1', label: 'S1', desc: '流失客户（可回访）',            badgeCls: 'badge-gray',    groupKey: 'S', groupLabel: 'S 流失' },
  { tag: 'S2', label: 'S2', desc: '流失客户（无效）',              badgeCls: 'badge-gray',    groupKey: 'S', groupLabel: 'S 流失' },
];

/* ─── Filter option constants ────────────────────────── */
const CITY_OPTIONS = [
  { value: '厦门', label: '厦门' },
  { value: '泉州', label: '泉州' },
  { value: '漳州', label: '漳州' },
];

/* ─── Multi-Select Dropdown ──────────────────────────── */
interface MultiSelectDropdownProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  renderOption?: (opt: { value: string; label: string }) => React.ReactNode;
  grouped?: boolean;
}

function MultiSelectDropdown({
  label, options, selected, onChange, renderOption, grouped = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selected.length === 0 || selected.length === options.length;
  const displayLabel =
    selected.length === 0 || selected.length === options.length
      ? label
      : selected.length === 1
      ? options.find(o => o.value === selected[0])?.label ?? label
      : `${label} (${selected.length})`;

  function toggleAll() { onChange([]); }
  function toggleOne(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  }

  const groupOrder = grouped ? Array.from(new Set(TAG_DEFS.map(d => d.groupKey))) : [];
  const groupedOptions = grouped
    ? groupOrder.map(gk => {
        const groupItems = TAG_DEFS.filter(d => d.groupKey === gk);
        return {
          groupKey: gk,
          groupLabel: groupItems[0]?.groupLabel ?? gk,
          items: options.filter(o => groupItems.some(d => d.tag === o.value)),
        };
      }).filter(g => g.items.length > 0)
    : [];

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors hover:border-brand"
        style={{
          background: 'var(--card)',
          borderColor: selected.length > 0 && selected.length < options.length ? 'var(--brand)' : 'var(--border)',
          color: selected.length > 0 && selected.length < options.length ? 'var(--brand)' : 'var(--foreground)',
          whiteSpace: 'nowrap',
        }}
      >
        {displayLabel}
        <ChevronDownIcon size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      <div
        className={open ? '' : 'hidden'}
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 50,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
          minWidth: grouped ? 280 : renderOption ? 240 : 140,
          padding: '6px 0',
          maxHeight: 360,
          overflowY: 'auto',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted text-sm"
          style={{ color: 'var(--muted-foreground)' }}
          onClick={toggleAll}
        >
          <div
            className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
            style={{
              borderColor: allSelected ? 'var(--brand)' : 'var(--border)',
              background: allSelected ? 'var(--brand)' : 'transparent',
            }}
          >
            {allSelected && <CheckIcon size={10} className="text-white" />}
          </div>
          全部
        </div>
        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
        {grouped ? (
          groupedOptions.map((g, gi) => (
            <div key={g.groupKey}>
              {gi > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '3px 0' }} />}
              <div className="px-3 py-1 flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
                  {g.groupLabel}
                </span>
              </div>
              {g.items.map(opt => {
                const checked = selected.includes(opt.value);
                const def = TAG_DEFS.find(d => d.tag === opt.value);
                return (
                  <div
                    key={opt.value}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted text-sm"
                    style={{ color: 'var(--foreground)' }}
                    onClick={() => toggleOne(opt.value)}
                  >
                    <div
                      className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: checked ? 'var(--brand)' : 'var(--border)',
                        background: checked ? 'var(--brand)' : 'transparent',
                      }}
                    >
                      {checked && <CheckIcon size={10} className="text-white" />}
                    </div>
                    <span className={`badge ${def?.badgeCls ?? 'badge-gray'}`} style={{ fontSize: 10, padding: '1px 5px', minWidth: 22 }}>{opt.label}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)', maxWidth: 160 }}>{def?.desc}</span>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          options.map(opt => {
            const checked = selected.includes(opt.value);
            return (
              <div
                key={opt.value}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted text-sm"
                style={{ color: 'var(--foreground)' }}
                onClick={() => toggleOne(opt.value)}
              >
                <div
                  className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: checked ? 'var(--brand)' : 'var(--border)',
                    background: checked ? 'var(--brand)' : 'transparent',
                  }}
                >
                  {checked && <CheckIcon size={10} className="text-white" />}
                </div>
                {renderOption ? renderOption(opt) : opt.label}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ─── Customer Picker Modal ──────────────────────────── */
interface CustomerPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (c: Customer) => void;
}

function CustomerPickerModal({ visible, onClose, onSelect }: CustomerPickerProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const customersQ = useCustomers({ page: 1, pageSize: 1000 });
  const CUSTOMERS: any[] = customersQ.data?.data ?? [];

  const sorted = [...CUSTOMERS].sort((a, b) =>
    new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime()
  );

  const filtered = sorted.filter(c => {
    if (!search) return true;
    return (
      c.name.includes(search) ||
      c.phone.includes(search) ||
      c.acquiredAt.includes(search) ||
      c.area.includes(search) ||
      c.advisor.includes(search)
    );
  });

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected);
    setSelected(null);
    setSearch('');
    onClose();
  }

  return (
    <div className={visible ? '' : 'hidden'}>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="bg-card rounded-2xl shadow-custom flex flex-col" style={{ width: 740, maxHeight: '80vh' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="font-semibold text-base text-foreground">从客户列表选择</span>
            <button onClick={() => { onClose(); setSelected(null); setSearch(''); }} className="p-1.5 rounded hover:bg-muted">
              <XIcon size={16} />
            </button>
          </div>
          <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--muted)' }}>
              <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
              <input
                className="bg-transparent outline-none text-sm flex-1"
                placeholder="搜索获客时间、客户姓名、手机号、区域、客服"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-auto flex-1 px-6 py-2">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>客户ID</th>
                  <th>姓名</th>
                  <th>手机号</th>
                  <th>所在区域</th>
                  <th>获客时间</th>
                  <th>归属客服</th>
                  <th>标签</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    className="cursor-pointer"
                    style={{ background: selected?.id === c.id ? 'var(--accent)' : undefined }}
                    onClick={() => setSelected(c)}
                  >
                    <td className="text-center">
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center mx-auto"
                        style={{
                          borderColor: selected?.id === c.id ? 'var(--brand)' : 'var(--border)',
                          background: selected?.id === c.id ? 'var(--brand)' : 'transparent',
                        }}
                      >
                        {selected?.id === c.id && <CheckIcon size={10} className="text-white" />}
                      </div>
                    </td>
                    <td className="font-mono text-xs" style={{ color: 'var(--brand)' }}>{c.id}</td>
                    <td className="font-medium">{c.name}</td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{c.phone}</td>
                    <td>{c.area}</td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{c.acquiredAt}</td>
                    <td>{c.advisor}</td>
                    <td><span className={`badge ${TAG_CLS[c.tag] ?? 'badge-gray'}`}>{c.tag}</span></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8" style={{ color: 'var(--muted-foreground)' }}>暂无匹配客户</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {selected ? `已选：${selected.name}` : '请点击行选择客户'}
            </span>
            <div className="flex items-center gap-3">
              <button
                className="px-4 py-1.5 rounded-lg text-sm border hover:bg-muted"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => { onClose(); setSelected(null); setSearch(''); }}
              >取消</button>
              <button
                className="px-4 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--brand)' }}
                disabled={!selected}
                onClick={handleConfirm}
              >确认导入</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Service Items Picker ───────────────────────────── */
interface ServiceItemsPickerProps {
  value: string;
  onChange: (v: string) => void;
}

function ServiceItemsPicker({ value, onChange }: ServiceItemsPickerProps) {
  const selectedItems = value
    ? value.split(/[，,、\n]/).map(s => s.trim()).filter(Boolean)
    : [];

  function togglePreset(item: string) {
    if (selectedItems.includes(item)) {
      const next = selectedItems.filter(s => s !== item);
      onChange(next.join('、'));
    } else {
      const next = [...selectedItems, item];
      onChange(next.join('、'));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <ZapIcon size={12} style={{ color: 'var(--brand)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>快速选择常用品项</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {SERVICE_PRESETS.map(group => (
            <div key={group.group}>
              <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                {group.group}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map(item => {
                  const active = selectedItems.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => togglePreset(item)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        borderColor: active ? 'var(--brand)' : 'var(--border)',
                        background: active ? 'var(--accent)' : 'var(--card)',
                        color: active ? 'var(--brand)' : 'var(--foreground)',
                      }}
                    >
                      {active && <span className="mr-1">✓</span>}
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <TagIcon size={12} style={{ color: 'var(--muted-foreground)' }} />
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>手动输入 / 编辑已选品项</span>
        </div>
        <textarea
          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
          style={{ background: 'var(--muted)', border: '1px solid var(--border)', minHeight: 60 }}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="可直接输入，多个品项用顿号、逗号或换行分隔"
        />
        {selectedItems.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {selectedItems.map(item => (
              <span
                key={item}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                style={{ background: 'var(--accent)', color: 'var(--brand)', border: '1px solid var(--brand)' }}
              >
                {item}
                <button type="button" onClick={() => togglePreset(item)} className="hover:opacity-70">
                  <XIcon size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Service Person Row ─────────────────────────────── */
interface ServicePersonRowProps {
  label: TherapistType;
  value: ServicePerson;
  onChange: (v: ServicePerson) => void;
}

function ServicePersonRow({ label, value, onChange }: ServicePersonRowProps) {
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];
  const typeTherapists = THERAPISTS.filter(t => t.status === '在职');
  const assignOptions = ['待分配', '无', ...typeTherapists.map(t => t.name)];

  return (
    <div className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm font-medium w-20 flex-shrink-0" style={{ color: 'var(--foreground)' }}>{label}</span>
      <select
        className="text-sm rounded-lg px-2 py-1.5 outline-none flex-1"
        style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        value={value.assign}
        onChange={e => onChange({ ...value, assign: e.target.value })}
      >
        {assignOptions.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ─── Order Modal ────────────────────────────────────── */
interface OrderModalProps {
  visible: boolean;
  onClose: () => void;
  isEdit?: boolean;
  editOrderId?: string;
}

const TABS = [
  { key: 'customer', label: '客户信息', icon: UserIcon },
  { key: 'order', label: '订单维护', icon: FileTextIcon },
  { key: 'service', label: '服务人员', icon: UsersIcon },
  { key: 'follow', label: '跟进情况', icon: MessageSquareIcon },
];

function OrderModal({ visible, onClose, isEdit = false, editOrderId = '' }: OrderModalProps) {
  const orderMutations = useOrderMutations();
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState('customer');
  const [form, setForm] = useState<OrderForm>(initForm());
  const [showPicker, setShowPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!visible) {
      setActiveTab('customer');
      setForm(initForm());
    }
  }, [visible]);

  function set<K extends keyof OrderForm>(key: K, val: OrderForm[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleCustomerSelect(c: Customer) {
    setForm(prev => ({
      ...prev,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      customerArea: c.area,
      customerTag: c.tag,
      customerAdvisor: c.advisor,
    }));
  }

  function handleAddFollow() {
    if (!form.newFollowContent) return;
    const rec: FollowRecord = {
      date: form.newFollowDate || new Date().toISOString().slice(0, 10),
      content: form.newFollowContent,
      operator: currentUser.name,
    };
    setForm(prev => ({
      ...prev,
      followRecords: [...prev.followRecords, rec],
      newFollowDate: '',
      newFollowContent: '',
    }));
  }

  async function handleSave() {
    // Persist to module-level maps
    const oid = editOrderId || `ORDER-${Date.now()}`;
    orderTherapistMap.set(oid, {
      sp1: form.servicePerson1,
      sp2: form.servicePerson2,
      sp3: form.servicePerson3,
    });
    // Convert follow records to OrderFollowRecord
    const newRecords: OrderFollowRecord[] = form.followRecords.map((r, i) => ({
      id: `fr-${oid}-${i}`,
      date: r.date,
      content: r.content,
      feedback: '',
      status: '已完成',
      operator: r.operator,
      createdAt: r.date,
    }));
    if (newRecords.length > 0) {
      orderFollowMap.set(oid, newRecords);
    }
    if (form.orderType === '套餐') {
      orderContractMap.set(oid, form.contractStatus === '无' ? '未回签' : form.contractStatus);
    }
    orderServiceItemsMap.set(oid, form.serviceItems);

    const payStatus = (form.payStatus === '已支付' ? '已付款' : form.payStatus === '待支付' ? '待付款' : form.payStatus) as any;
    const orderBody: any = {
      customerId: form.customerId,
      type: form.orderType || '体验卡',
      amount: Number(form.amount) || 0,
      payStatus,
      totalTimes: form.orderType === '套餐' ? 10 : 1,
      contractSigned: form.contractStatus !== '无' && form.contractStatus !== '未回签',
      serviceItemCount: form.serviceItems ? form.serviceItems.split(',').length : 1,
    };
    try {
      if (isEdit && editOrderId) {
        await orderMutations.patchStatus({ id: editOrderId, status: payStatus });
      } else {
        await orderMutations.create(orderBody);
      }
      toast.success(isEdit ? '订单已更新' : '订单已创建');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    }
  }

  const amountSuggestions =
    form.orderType
      ? ORDER_TYPE_AMOUNTS[form.orderType === '体验卡' ? '体验卡阶段' : '套餐阶段'] ?? []
      : [];

  return (
    <>
      <CustomerPickerModal visible={showPicker} onClose={() => setShowPicker(false)} onSelect={handleCustomerSelect} />
      <div className={visible ? '' : 'hidden'}>
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-card rounded-2xl shadow-custom flex flex-col" style={{ width: 700, maxHeight: '92vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-semibold text-base text-foreground">{isEdit ? '编辑订单' : '新建订单'}</span>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-muted"><XIcon size={16} /></button>
            </div>

            {/* Tabs */}
            <div className="flex px-6" style={{ borderBottom: '1px solid var(--border)' }}>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors"
                    style={{
                      color: active ? 'var(--brand)' : 'var(--muted-foreground)',
                      borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                      marginBottom: -1,
                    }}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">

              {/* ── 客户信息 ── */}
              <div className={activeTab === 'customer' ? '' : 'hidden'}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-foreground">客户基本信息</span>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white hover:opacity-90"
                    style={{ background: 'var(--brand)' }}
                    onClick={() => setShowPicker(true)}
                  >
                    <SearchIcon size={13} />
                    从客户列表选择
                  </button>
                </div>
                {form.customerId ? (
                  <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--accent)', border: '1px solid var(--brand)' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base" style={{ background: 'var(--brand)' }}>
                        {form.customerName[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{form.customerName}</div>
                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ID: {form.customerId}</div>
                      </div>
                      {form.customerTag && <span className={`badge ml-2 ${TAG_CLS[form.customerTag] ?? 'badge-gray'}`}>{form.customerTag}</span>}
                      <button className="ml-auto text-xs px-2 py-1 rounded hover:bg-muted" style={{ color: 'var(--muted-foreground)' }} onClick={() => set('customerId', '')}>重新选择</button>
                    </div>
                    <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                      <span><span style={{ color: 'var(--muted-foreground)' }}>手机：</span>{form.customerPhone}</span>
                      <span><span style={{ color: 'var(--muted-foreground)' }}>区域：</span>{form.customerArea}</span>
                      <span><span style={{ color: 'var(--muted-foreground)' }}>客服：</span>{form.customerAdvisor}</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-xl p-8 text-center cursor-pointer hover:border-brand transition-colors mb-3"
                    style={{ border: '2px dashed var(--border)', color: 'var(--muted-foreground)' }}
                    onClick={() => setShowPicker(true)}
                  >
                    <UserIcon size={32} className="mx-auto mb-2 opacity-30" />
                    <div className="text-sm">点击从客户列表选择，或直接填写客户信息</div>
                  </div>
                )}
                <div className="flex flex-col gap-3 mt-4">
                  <div className="flex gap-3">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>客户姓名</label>
                      <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                        value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder="请输入客户姓名" />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>联系电话</label>
                      <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                        value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} placeholder="请输入手机号" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>所在区域</label>
                      <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                        value={form.customerArea} onChange={e => set('customerArea', e.target.value)} placeholder="请输入所在区域" />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>归属客服</label>
                      <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                        value={form.customerAdvisor} onChange={e => set('customerAdvisor', e.target.value)} placeholder="请输入归属客服" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 订单维护 ── */}
              <div className={activeTab === 'order' ? '' : 'hidden'}>
                <div className="flex flex-col gap-4">
                  {/* 订单类型 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>订单类型</label>
                    <div className="flex gap-3">
                      {(['体验卡', '套餐'] as OrderType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => { set('orderType', t); set('amount', ''); set('contractStatus', t === '体验卡' ? '无' : '未回签'); }}
                          className="flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all text-center"
                          style={{
                            borderColor: form.orderType === t ? 'var(--brand)' : 'var(--border)',
                            background: form.orderType === t ? 'var(--accent)' : 'var(--muted)',
                            color: form.orderType === t ? 'var(--brand)' : 'var(--foreground)',
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 金额 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>对应金额（元）</label>
                    <input
                      className="px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                      value={form.amount} onChange={e => set('amount', e.target.value)}
                      placeholder="请输入金额"
                      type="number"
                    />
                    {amountSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>快速选择：</span>
                        {amountSuggestions.map(a => (
                          <button
                            key={a}
                            onClick={() => set('amount', String(a))}
                            className="px-2 py-0.5 rounded text-xs border hover:bg-muted"
                            style={{
                              borderColor: form.amount === String(a) ? 'var(--brand)' : 'var(--border)',
                              color: form.amount === String(a) ? 'var(--brand)' : 'var(--foreground)',
                            }}
                          >¥{a.toLocaleString()}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 支付状态 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>支付状态</label>
                    <div className="flex gap-3">
                      {(['已支付', '待支付', '已付定金'] as NewPayStatus[]).map(s => (
                        <button
                          key={s}
                          onClick={() => set('payStatus', s)}
                          className="flex-1 py-2 rounded-lg text-sm border-2 transition-all text-center"
                          style={{
                            borderColor: form.payStatus === s ? 'var(--brand)' : 'var(--border)',
                            background: form.payStatus === s ? 'var(--accent)' : 'var(--muted)',
                            color: form.payStatus === s ? 'var(--brand)' : 'var(--foreground)',
                          }}
                        >{s}</button>
                      ))}
                    </div>
                  </div>

                  {/* 购买时间 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>购买时间</label>
                    <input
                      type="date"
                      className="px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      value={form.purchaseDate}
                      onChange={e => set('purchaseDate', e.target.value)}
                    />
                  </div>

                  {/* 合同状态 — 仅套餐显示 */}
                  <div className={form.orderType === '套餐' ? '' : 'hidden'}>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>合同状态</label>
                      <div className="flex gap-3">
                        {(['未回签', '已回签'] as ContractStatus[]).map(cs => (
                          <button
                            key={cs}
                            onClick={() => set('contractStatus', cs)}
                            className="flex-1 py-2 rounded-lg text-sm border-2 transition-all text-center"
                            style={{
                              borderColor: form.contractStatus === cs ? (cs === '已回签' ? 'var(--success)' : 'var(--warning)') : 'var(--border)',
                              background: form.contractStatus === cs ? (cs === '已回签' ? 'rgba(var(--success-foreground), 0.06)' : 'rgba(255,170,0,0.08)') : 'var(--muted)',
                              color: form.contractStatus === cs ? (cs === '已回签' ? 'var(--success)' : 'var(--warning)') : 'var(--foreground)',
                            }}
                          >{cs}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 服务项目 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>服务项目</label>
                    <ServiceItemsPicker value={form.serviceItems} onChange={v => set('serviceItems', v)} />
                  </div>
                </div>
              </div>

              {/* ── 服务人员 ── */}
              <div className={activeTab === 'service' ? '' : 'hidden'}>
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-2">服务人员分配</div>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="px-4 py-2 text-xs font-medium flex gap-3" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>
                        <span className="w-20">服务类型</span>
                        <span className="flex-1">分配人员</span>
                      </div>
                      <div className="px-4">
                        <ServicePersonRow label="产康师" value={form.servicePerson1} onChange={v => set('servicePerson1', v)} />
                        <ServicePersonRow label="运动康复师" value={form.servicePerson2} onChange={v => set('servicePerson2', v)} />
                        <ServicePersonRow label="调理师" value={form.servicePerson3} onChange={v => set('servicePerson3', v)} />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>预约时间</label>
                    <input
                      type="datetime-local"
                      className="px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      value={form.appointmentTime}
                      onChange={e => set('appointmentTime', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>服务记录备注</label>
                    <textarea
                      className="px-3 py-2 rounded-lg text-sm outline-none resize-none"
                      style={{ background: 'var(--muted)', border: '1px solid var(--border)', minHeight: 72 }}
                      value={form.serviceNote}
                      onChange={e => set('serviceNote', e.target.value)}
                      placeholder="请输入服务记录说明..."
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>上传服务照片</label>
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => {
                      const files = Array.from(e.target.files ?? []);
                      const urls = files.map(f => URL.createObjectURL(f));
                      set('photos', [...form.photos, ...urls]);
                    }} />
                    <div className="flex flex-wrap gap-2">
                      {(form.photos ?? []).map((url, i) => (
                        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(0,0,0,0.5)' }}
                            onClick={() => set('photos', form.photos.filter((_, j) => j !== i))}
                          >
                            <XIcon size={10} className="text-white" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 text-xs hover:border-brand transition-colors"
                        style={{ border: '2px dashed var(--border)', color: 'var(--muted-foreground)' }}
                      >
                        <ImageIcon size={18} />
                        上传
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 跟进情况 ── */}
              <div className={activeTab === 'follow' ? '' : 'hidden'}>
                <div className="flex flex-col gap-4">
                  {isEdit ? (
                    <>
                      <div className="flex flex-col gap-3">
                        <div className="text-sm font-semibold text-foreground">添加跟进记录</div>
                        <div className="flex gap-3">
                          <div className="flex flex-col gap-1 w-40">
                            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>跟进日期</label>
                            <input
                              type="date"
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                              value={form.newFollowDate}
                              onChange={e => set('newFollowDate', e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>跟进内容</label>
                            <input
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                              value={form.newFollowContent}
                              onChange={e => set('newFollowContent', e.target.value)}
                              placeholder="请输入跟进内容..."
                            />
                          </div>
                        </div>
                        <button
                          onClick={handleAddFollow}
                          disabled={!form.newFollowContent}
                          className="self-start flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                          style={{ background: 'var(--brand)' }}
                        >
                          <PlusIcon size={14} />
                          添加记录
                        </button>
                      </div>
                      {form.followRecords.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <div className="text-sm font-semibold text-foreground">跟进记录（{form.followRecords.length} 条）</div>
                          {form.followRecords.map((r, i) => (
                            <div key={i} className="rounded-lg p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>{r.date}</span>
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>由 {r.operator} 记录</span>
                              </div>
                              <div className="text-sm text-foreground">{r.content}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {form.followRecords.length === 0 && (
                        <div className="text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
                          <MessageSquareIcon size={32} className="mx-auto mb-2 opacity-30" />
                          <div className="text-sm">暂无跟进记录，可在上方添加</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
                      <MessageSquareIcon size={36} className="mx-auto mb-3 opacity-25" />
                      <div className="text-sm font-medium">首次新建订单时跟进情况为空</div>
                      <div className="text-xs mt-1 opacity-70">保存订单后，在编辑状态下可添加售后跟进记录</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1">
                {TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="w-2 h-2 rounded-full transition-colors"
                    style={{ background: activeTab === tab.key ? 'var(--brand)' : 'var(--border)' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                {activeTab !== 'customer' && (
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm border hover:bg-muted"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => {
                      const idx = TABS.findIndex(t => t.key === activeTab);
                      if (idx > 0) setActiveTab(TABS[idx - 1].key);
                    }}
                  >上一步</button>
                )}
                {activeTab !== 'follow' ? (
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90"
                    style={{ background: 'var(--brand)' }}
                    onClick={() => {
                      const idx = TABS.findIndex(t => t.key === activeTab);
                      if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].key);
                    }}
                  >下一步</button>
                ) : (
                  <button
                    className="px-5 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90"
                    style={{ background: 'var(--brand)' }}
                    onClick={handleSave}
                  >{isEdit ? '保存修改' : '创建订单'}</button>
                )}
                <button className="px-4 py-1.5 rounded-lg text-sm border hover:bg-muted" style={{ borderColor: 'var(--border)' }} onClick={onClose}>取消</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function initForm(): OrderForm {
  return {
    customerId: '', customerName: '', customerPhone: '', customerArea: '', customerTag: '', customerAdvisor: '',
    orderType: '', amount: '', payStatus: '待支付', purchaseDate: new Date().toISOString().slice(0, 10),
    contractStatus: '无',
    servicePerson1: { type: '产康师', assign: '待分配' },
    servicePerson2: { type: '运动康复师', assign: '待分配' },
    servicePerson3: { type: '调理师', assign: '待分配' },
    serviceItems: '', appointmentTime: '', serviceNote: '',
    photos: [],
    followRecords: [], newFollowDate: '', newFollowContent: '',
  };
}

/* ─── Helper: get therapist display string for an order ─ */
function getTherapistDisplay(orderId: string): string {
  const saved = orderTherapistMap.get(orderId);
  if (saved) {
    const names = [saved.sp1.assign, saved.sp2.assign, saved.sp3.assign]
      .filter(a => a !== '待分配' && a !== '无');
    return names.length > 0 ? names.join('、') : '待分配';
  }
  return '待分配';
}

/* ─── Helper: get contract status for an order ─────────── */
function getContractStatus(orderId: string, orderType: OrderType): ContractStatus {
  if (orderType === '体验卡') return '无';
  return orderContractMap.get(orderId) ?? '未回签';
}

/* ─── Helper: get follow records for an order ──────────── */
function getFollowRecords(orderId: string): OrderFollowRecord[] {
  return orderFollowMap.get(orderId) ?? [];
}

/* ─── Helper: get follow task for an order ─────────────── */
function getFollowTask(orderId: string): string {
  return orderFollowTaskMap.get(orderId) ?? '';
}

/* ─── Helper: compute follow display info ──────────────── */
function getFollowDisplay(orderId: string): { status: string; date: string; task: string; isOverdue: boolean } {
  const records = getFollowRecords(orderId);
  const task = getFollowTask(orderId);
  if (records.length === 0) {
    return { status: '待跟进', date: '—', task: task || '—', isOverdue: false };
  }
  const latest = records[records.length - 1];
  const isOverdue = latest.status === '延迟';
  return {
    status: latest.status,
    date: latest.date,
    task: task || latest.content || '—',
    isOverdue,
  };
}

/* ─── Main Page ──────────────────────────────────────── */
export default function OrdersListPage() {
  const { currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editOrderId, setEditOrderId] = useState('');
  const pageSize = 10;

  // Multi-select filter states
  const [fType, setFType] = useState<string[]>([]);
  const [fPay, setFPay] = useState<string[]>([]);
  const [fArea, setFArea] = useState<string[]>([]);
  const [fTag, setFTag] = useState<string[]>([]);
  const [fAdvisor, setFAdvisor] = useState<string[]>([]);
  const [fTherapist, setFTherapist] = useState<string[]>([]);

  const isReadOnly = currentUser.role === 'finance';

  // Build option lists from data
  const customersQ = useCustomers({ page: 1, pageSize: 1000 });
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const orderMutations = useOrderMutations();
  const CUSTOMERS: any[] = customersQ.data?.data ?? [];
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];
  const ORDERS: any[] = ordersQ.data?.data ?? [];
  const customerById = new Map(CUSTOMERS.map(c => [c.id, c]));
  const customerByName = new Map(CUSTOMERS.map(c => [c.name, c]));
  const allAdvisors = Array.from(new Set(CUSTOMERS.map(c => c.advisor).filter(Boolean))).sort();

  const TYPE_OPTIONS = [
    { value: '体验卡', label: '体验卡' },
    { value: '套餐', label: '套餐' },
  ];
  const PAY_OPTIONS = [
    { value: '已支付', label: '已支付' },
    { value: '待支付', label: '待支付' },
  ];
  const TAG_OPTIONS = TAG_DEFS.map(d => ({ value: d.tag, label: d.tag }));
  const ADVISOR_OPTIONS = allAdvisors.map(a => ({ value: a, label: a }));
  const THERAPIST_OPTIONS = THERAPISTS
    .filter(t => t.status === '在职')
    .map(t => ({ value: t.name, label: t.name }));

  // Enrich orders with customer area/advisor/tag
  const enrichedOrders = ORDERS.map(o => {
    const cust = customerByName.get(o.customerName) ?? customerById.get(o.customerId);
    return {
      ...o,
      area: cust?.area ?? '—',
      advisor: cust?.advisor ?? '—',
      tag: (cust?.tag ?? null) as CustomerTag | null,
      resolvedCustomerId: cust?.id ?? o.customerId ?? '—',
    };
  });

  const filtered = enrichedOrders.filter(o => {
    const matchSearch = !search || o.customerName.includes(search) || o.id.includes(search);
    const matchType = fType.length === 0 || fType.includes(o.type);
    const matchPay = fPay.length === 0 || fPay.includes(o.payStatus);
    const matchArea = fArea.length === 0 || fArea.includes(o.area);
    const matchTag = fTag.length === 0 || (o.tag !== null && fTag.includes(o.tag));
    const matchAdvisor = fAdvisor.length === 0 || fAdvisor.includes(o.advisor);
    const therapistDisplay = getTherapistDisplay(o.id);
    const matchTherapist = fTherapist.length === 0 || fTherapist.some(t => therapistDisplay.includes(t));
    return matchSearch && matchType && matchPay && matchArea && matchTag && matchAdvisor && matchTherapist;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, fType, fPay, fArea, fTag, fAdvisor, fTherapist]);

  /* ── Column widths for non-frozen cols ── */
  // 订单类型(80) | 服务项目(160) | 跟进状态(76) | 跟进时间(82) | 跟进事项(120) | 付款状态(76) | 金额(80) | 合同状态(76) | 归属客服(76) | 技师(88) | 操作(72)
  const NORMAL_COLS = [80, 160, 76, 82, 120, 76, 80, 76, 76, 88, 72];
  const totalNormal = NORMAL_COLS.reduce((s, w) => s + w, 0);
  const tableMinW = FREEZE_TOTAL + totalNormal;

  return (
    <>
      <OrderModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        isEdit={isEdit}
        editOrderId={editOrderId}
      />

      <div data-cmp="OrdersListPage" className="flex flex-col gap-4">

        {/* ── Top action bar — single row, no wrap ── */}
        <div className="bg-card rounded-xl px-4 py-3 shadow-custom">
          <div className="flex items-center gap-3" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--muted)', minWidth: 220 }}>
              <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
              <input
                className="bg-transparent outline-none text-sm flex-1"
                placeholder="搜索客户姓名、订单编号..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className={search ? '' : 'hidden'}>
                <button onClick={() => setSearch('')}><XIcon size={12} style={{ color: 'var(--muted-foreground)' }} /></button>
              </div>
            </div>
            {/* Filter dropdowns */}
            <MultiSelectDropdown label="订单类型" options={TYPE_OPTIONS} selected={fType} onChange={setFType} />
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown label="付款状态" options={PAY_OPTIONS} selected={fPay} onChange={setFPay} />
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown label="区域" options={CITY_OPTIONS} selected={fArea} onChange={setFArea} />
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown
              label="标签"
              options={TAG_OPTIONS}
              selected={fTag}
              onChange={setFTag}
              grouped={true}
            />
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown label="客服" options={ADVISOR_OPTIONS} selected={fAdvisor} onChange={setFAdvisor} />
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown label="技师" options={THERAPIST_OPTIONS} selected={fTherapist} onChange={setFTherapist} />
            {/* Count + new button */}
            <span className="text-sm flex-shrink-0 ml-1" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>共 {filtered.length} 条</span>
            {!isReadOnly && (
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90 flex-shrink-0"
                style={{ background: 'var(--brand)' }}
                onClick={() => { setIsEdit(false); setEditOrderId(''); setShowModal(true); }}
              >
                <PlusIcon size={14} />
                新建订单
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-card rounded-xl shadow-custom" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'visible', position: 'relative' }}>
            <table
              className="data-table"
              style={{ minWidth: tableMinW, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}
            >
              <colgroup>
                {COL_W.map((w, i) => <col key={`f${i}`} style={{ width: w }} />)}
                {NORMAL_COLS.map((w, i) => <col key={`n${i}`} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  {/* Frozen cols */}
                  <th style={STICKY_TH_STYLE(0)}>购买时间</th>
                  <th style={STICKY_TH_STYLE(1)}>客户ID</th>
                  <th style={STICKY_TH_STYLE(2)}>客户姓名</th>
                  <th style={STICKY_TH_STYLE(3)}>标签</th>
                  {/* Normal cols */}
                  <th style={{ textAlign: 'center' }}>订单类型</th>
                  <th>服务项目</th>
                  <th style={{ textAlign: 'center' }}>跟进状态</th>
                  <th style={{ textAlign: 'center' }}>跟进时间</th>
                  <th>跟进事项</th>
                  <th style={{ textAlign: 'center' }}>付款状态</th>
                  <th style={{ textAlign: 'center' }}>金额</th>
                  <th style={{ textAlign: 'center' }}>合同状态</th>
                  <th>归属客服</th>
                  <th>技师</th>
                  <th style={{ textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(o => {
                  const bgColor = 'var(--card)';

                  // Service items display
                  const serviceItemsText = (() => {
                    const saved = orderServiceItemsMap.get(o.id);
                    if (saved && saved.trim()) return saved;
                    return o.serviceItemCount > 0 ? `共${o.serviceItemCount}项` : '—';
                  })();

                  const therapistDisplay = getTherapistDisplay(o.id);
                  const contractStatus = getContractStatus(o.id, o.type);
                  const followInfo = getFollowDisplay(o.id);

                  return (
                    <tr key={o.id}>
                      {/* Frozen: 购买时间 */}
                      <td style={STICKY_TD_STYLE(0, bgColor)}>
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{o.createdAt}</span>
                      </td>

                      {/* Frozen: 客户ID */}
                      <td style={STICKY_TD_STYLE(1, bgColor)}>
                        <span className="font-mono text-xs" style={{ color: 'var(--brand)', letterSpacing: '-0.02em' }}>
                          {o.resolvedCustomerId}
                        </span>
                      </td>

                      {/* Frozen: 客户姓名 */}
                      <td style={STICKY_TD_STYLE(2, bgColor)}>
                        <span className="font-medium text-sm">{o.customerName}</span>
                      </td>

                      {/* Frozen: 标签 */}
                      <td style={STICKY_TD_STYLE(3, bgColor)}>
                        {o.tag ? (
                          <span className={`badge ${TAG_CLS[o.tag] ?? 'badge-gray'}`}>{o.tag}</span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>
                        )}
                      </td>

                      {/* 订单类型 */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{
                            background: o.type === '体验卡' ? 'rgba(30,136,229,0.12)' : 'rgba(124,58,237,0.11)',
                            color: o.type === '体验卡' ? 'var(--brand)' : '#7c3aed',
                          }}
                        >
                          {o.type}
                        </span>
                        {o.isUpgrade && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--success)' }}>↑升单</div>
                        )}
                      </td>

                      {/* 服务项目 — actual names with ellipsis tooltip */}
                      <td>
                        <span
                          className="text-xs"
                          style={{
                            color: o.serviceItemCount > 0 ? 'var(--foreground)' : 'var(--muted-foreground)',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 152,
                          }}
                          title={serviceItemsText}
                        >
                          {serviceItemsText}
                        </span>
                      </td>

                      {/* 跟进状态 */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`badge ${FOLLOW_STATUS_COLORS[followInfo.status] ?? 'badge-gray'}`}
                          style={followInfo.isOverdue ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
                        >
                          {followInfo.status}
                        </span>
                      </td>

                      {/* 跟进时间 */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className="text-xs"
                          style={{ color: followInfo.isOverdue ? 'var(--danger)' : 'var(--muted-foreground)' }}
                        >
                          {followInfo.date}
                        </span>
                      </td>

                      {/* 跟进事项 */}
                      <td>
                        <span
                          className="text-xs"
                          style={{
                            color: followInfo.isOverdue ? 'var(--danger)' : 'var(--foreground)',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 112,
                          }}
                          title={followInfo.task}
                        >
                          {followInfo.task}
                        </span>
                      </td>

                      {/* 付款状态 */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${PAY_STATUS_COLORS[o.payStatus]}`}>{o.payStatus}</span>
                      </td>

                      {/* 金额 */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="font-semibold text-sm">¥{o.amount.toLocaleString()}</span>
                      </td>

                      {/* 合同状态 */}
                      <td style={{ textAlign: 'center' }}>
                        {o.type === '体验卡' ? (
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>
                        ) : contractStatus === '已回签' ? (
                          <span className="badge badge-success">已回签</span>
                        ) : (
                          <span className="badge badge-warning">未回签</span>
                        )}
                      </td>

                      {/* 归属客服 */}
                      <td>
                        <span className="text-sm">{o.advisor}</span>
                      </td>

                      {/* 技师 */}
                      <td>
                        <span
                          className="text-xs"
                          style={{
                            color: therapistDisplay === '待分配' ? 'var(--muted-foreground)' : 'var(--foreground)',
                            fontStyle: therapistDisplay === '待分配' ? 'italic' : 'normal',
                          }}
                        >
                          {therapistDisplay}
                        </span>
                      </td>

                      {/* 操作 */}
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                            title="查看"
                            style={{ color: 'var(--muted-foreground)' }}
                            onClick={() => { setIsEdit(false); setEditOrderId(o.id); setShowModal(true); }}
                          >
                            <EyeIcon size={14} />
                          </button>
                          {!isReadOnly && (
                            <button
                              className="p-1.5 rounded hover:bg-muted transition-colors"
                              title="编辑"
                              style={{ color: 'var(--muted-foreground)' }}
                              onClick={() => { setIsEdit(true); setEditOrderId(o.id); setShowModal(true); }}
                            >
                              <PencilIcon size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={15} className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
                      <FileTextIcon size={36} className="mx-auto mb-3 opacity-20" />
                      <div className="text-sm">暂无订单数据</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                第 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} 条，共 {filtered.length} 条
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeftIcon size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce<(number | string)[]>((acc, n, i, arr) => {
                    if (i > 0 && typeof arr[i - 1] === 'number' && (n as number) - (arr[i - 1] as number) > 1) {
                      acc.push('…');
                    }
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, i) =>
                    typeof n === 'string' ? (
                      <span key={`e${i}`} className="px-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n as number)}
                        className="w-7 h-7 rounded text-xs font-medium transition-colors"
                        style={{
                          background: page === n ? 'var(--brand)' : 'transparent',
                          color: page === n ? '#fff' : 'var(--foreground)',
                        }}
                      >{n}</button>
                    )
                  )
                }
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRightIcon size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
