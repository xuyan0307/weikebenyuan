import { useState, useRef, useEffect } from 'react';
import {
  SearchIcon, PlusIcon, EyeIcon, PencilIcon,
  ChevronLeftIcon, ChevronRightIcon, XIcon, CheckIcon,
  UserIcon, FileTextIcon, UsersIcon, MessageSquareIcon,
  ImageIcon, ChevronDownIcon, TagIcon, ZapIcon,
} from 'lucide-react';
import type { OrderType, PayStatus, Customer, CustomerTag } from '../data/mockData';
import { useApp } from '../hooks/useApp';
import { useOrders, useOrderMutations, useCustomers, useCustomer, useTherapists } from '../api/hooks';
import { toast } from 'sonner';

/* ─── Types ─────────────────────────────────────────── */
type NewPayStatus = '已支付' | '待支付' | '已付定金' | '已退款';
type TherapistType = '产康师' | '运动康复师' | '调理师';
type TherapistAssign = '待分配' | '无' | string;
type ContractStatus = '无' | '未回签' | '已回签';
type OrderModalMode = 'create' | 'view' | 'edit';

interface ServicePerson {
  type: TherapistType;
  assign: TherapistAssign;
}

interface FollowRecord {
  date: string;
  content: string;
  operator: string;
}

interface OrderAttachment {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  uploadedAt: string;
}

interface ServicePhotoRecord {
  id: string;
  seq: number;
  time: string;
  remark: string;
  photos: OrderAttachment[];
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
  contractAttachments: OrderAttachment[];
  servicePhotoRecords: ServicePhotoRecord[];
  editingPhotoRecordId: string;
  newPhotoSeq: string;
  newPhotoTime: string;
  newPhotoRemark: string;
  newPhotoFiles: OrderAttachment[];
  followRecords: FollowRecord[];
  newFollowDate: string;
  newFollowContent: string;
}

interface CustomerFollowRecord {
  id: string;
  date: string;
  content: string;
  feedback: string;
  status: string;
  operator: string;
  createdAt: string;
}

/* ─── Module-level persistent maps ────────────────────── */
const orderTherapistMap = new Map<string, { sp1: ServicePerson; sp2: ServicePerson; sp3: ServicePerson }>();
const orderFollowMap = new Map<string, OrderFollowRecord[]>();
const orderFollowTaskMap = new Map<string, string>();
const orderContractMap = new Map<string, ContractStatus>();
const orderServiceItemsMap = new Map<string, string>(); // orderId -> serviceItems string

/* ─── Constants & Helpers ────────────────────────────── */
const PAY_STATUS_COLORS: Record<string, string> = {
  '已付款': 'badge-success',
  '待付款': 'badge-warning',
  '已退款': 'badge-danger',
  '已付定金': 'badge-info',
};

const NEW_PAY_STATUS_COLORS: Record<NewPayStatus, string> = {
  '已支付': 'badge-success',
  '待支付': 'badge-warning',
  '已付定金': 'badge-info',
  '已退款': 'badge-danger',
};

function payStatusDisplay(status: string | undefined) {
  if (status === '已付款' || status === '已支付') return '已支付';
  if (status === '待付款' || status === '待支付') return '待支付';
  if (status === '已付定金') return '定金';
  if (status === '已退款') return '已退款';
  return status || '待支付';
}

function effectiveOrderPayStatus(order: any): string {
  return order?.tag === 'T2' ? '已退款' : order?.payStatus;
}

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
  { tag: 'V1', label: 'V1', desc: '消费1W-3W之间VIP客户',          badgeCls: 'badge-purple',  groupKey: 'V', groupLabel: 'V VIP客户' },
  { tag: 'V2', label: 'V2', desc: '消费3W以上SVIP客户',            badgeCls: 'badge-purple',  groupKey: 'V', groupLabel: 'V VIP客户' },
  { tag: 'A1', label: 'A1', desc: '消费5000元以内，小疗程客户',     badgeCls: 'badge-success', groupKey: 'A', groupLabel: 'A 已升套餐' },
  { tag: 'A2', label: 'A2', desc: '消费5000-1W元之间，大疗程客户', badgeCls: 'badge-success', groupKey: 'A', groupLabel: 'A 已升套餐' },
  { tag: 'B1', label: 'B1', desc: '高意向',                        badgeCls: 'badge-warning', groupKey: 'B', groupLabel: 'B 已体验未升单' },
  { tag: 'B2', label: 'B2', desc: '普通意向',                      badgeCls: 'badge-warning', groupKey: 'B', groupLabel: 'B 已体验未升单' },
  { tag: 'C1', label: 'C1', desc: '待约具体时间',                  badgeCls: 'badge-info',    groupKey: 'C', groupLabel: 'C 已购体验卡' },
  { tag: 'C2', label: 'C2', desc: '已约具体时间',                  badgeCls: 'badge-info',    groupKey: 'C', groupLabel: 'C 已购体验卡' },
  { tag: 'D1', label: 'D1', desc: '高意向',                        badgeCls: 'badge-gray',    groupKey: 'D', groupLabel: 'D 种子客户' },
  { tag: 'D2', label: 'D2', desc: '普通意向',                      badgeCls: 'badge-gray',    groupKey: 'D', groupLabel: 'D 种子客户' },
  { tag: 'D3', label: 'D3', desc: '沉默客户（不说话）',            badgeCls: 'badge-gray',    groupKey: 'D', groupLabel: 'D 种子客户' },
  { tag: 'T1', label: 'T1', desc: '疗程套餐退款',                  badgeCls: 'badge-danger',  groupKey: 'T', groupLabel: 'T 退款客户' },
  { tag: 'T2', label: 'T2', desc: '体验卡退款',                    badgeCls: 'badge-danger',  groupKey: 'T', groupLabel: 'T 退款客户' },
  { tag: 'S1', label: 'S1', desc: '流失客户（可回访）',            badgeCls: 'badge-gray',    groupKey: 'S', groupLabel: 'S 流失客户' },
  { tag: 'S2', label: 'S2', desc: '流失客户（无效）',              badgeCls: 'badge-gray',    groupKey: 'S', groupLabel: 'S 流失客户' },
];

/* ─── Filter option constants ────────────────────────── */
const CITY_OPTIONS = [
  { value: '厦门', label: '厦门' },
  { value: '泉州', label: '泉州' },
  { value: '漳州', label: '漳州' },
];

interface FilterOption {
  value: string;
  label: string;
  group?: string;
}

const FILTER_NONE = '__FILTER_NONE__';

/* ─── Multi-Select Dropdown ──────────────────────────── */
interface MultiSelectDropdownProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  renderOption?: (opt: FilterOption) => React.ReactNode;
  grouped?: boolean;
}

function MultiSelectDropdown({
  label, options, selected, onChange, renderOption, grouped = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 140 });
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const menuWidth = grouped ? 280 : renderOption ? 240 : 140;

  function updateMenuPosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(menuWidth, rect.width);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    setMenuPos({
      top: rect.bottom + 6,
      left: Math.max(12, left),
      width,
    });
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const reposition = () => updateMenuPosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, options.length, grouped]);

  const effectiveSelected = selected.filter(v => v !== FILTER_NONE);
  const noneSelected = selected.includes(FILTER_NONE);
  const allSelected = !noneSelected && (selected.length === 0 || effectiveSelected.length === options.length);
  const displayLabel =
    noneSelected
      ? '未选择'
      : selected.length === 0 || effectiveSelected.length === options.length
      ? label
      : effectiveSelected.length === 1
      ? options.find(o => o.value === effectiveSelected[0])?.label ?? label
      : `${label} (${effectiveSelected.length})`;

  function toggleAll() {
    onChange(allSelected ? [FILTER_NONE] : []);
  }
  function optionChecked(value: string) {
    return allSelected || effectiveSelected.includes(value);
  }
  function toggleOne(val: string) {
    if (effectiveSelected.includes(val)) {
      const next = effectiveSelected.filter(v => v !== val);
      onChange(next.length > 0 ? next : [FILTER_NONE]);
    } else {
      onChange([...effectiveSelected, val]);
    }
  }

  const groupedByOption = grouped && options.some(o => o.group);
  const groupOrder = grouped
    ? groupedByOption
      ? Array.from(new Set(options.map(o => o.group || '其他')))
      : Array.from(new Set(TAG_DEFS.map(d => d.groupKey)))
    : [];
  const groupedOptions = grouped
    ? groupedByOption
      ? groupOrder.map(gk => ({
          groupKey: gk,
          groupLabel: gk,
          items: options.filter(o => (o.group || '其他') === gk),
        })).filter(g => g.items.length > 0)
      : groupOrder.map(gk => {
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
        ref={buttonRef}
        onClick={() => {
          updateMenuPosition();
          setOpen(v => !v);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors hover:border-brand"
        style={{
          background: 'var(--card)',
          borderColor: selected.length > 0 && !allSelected ? 'var(--brand)' : 'var(--border)',
          color: selected.length > 0 && !allSelected ? 'var(--brand)' : 'var(--foreground)',
          whiteSpace: 'nowrap',
        }}
      >
        {displayLabel}
        <ChevronDownIcon size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      <div
        className={open ? '' : 'hidden'}
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          zIndex: 9999,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
          minWidth: menuPos.width,
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
                const checked = optionChecked(opt.value);
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
                    {renderOption ? renderOption(opt) : (
                      <>
                        <span className={`badge ${def?.badgeCls ?? 'badge-gray'}`} style={{ fontSize: 10, padding: '1px 5px', minWidth: 22 }}>{opt.label}</span>
                        <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)', maxWidth: 160 }}>{def?.desc}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          options.map(opt => {
            const checked = optionChecked(opt.value);
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
  const customersQ = useCustomers({ page: 1, pageSize: 1000, includeOrdered: 1 });
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

  if (!visible) return null;

  return (
    <div>
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
  mode?: OrderModalMode;
  order?: any | null;
  editOrderId?: string;
}

const TABS = [
  { key: 'customer', label: '客户信息', icon: UserIcon },
  { key: 'order', label: '订单维护', icon: FileTextIcon },
  { key: 'service', label: '服务人员', icon: UsersIcon },
  { key: 'follow', label: '跟进情况', icon: MessageSquareIcon },
];

function payStatusToForm(status: string | undefined): NewPayStatus {
  if (status === '已付款' || status === '已支付') return '已支付';
  if (status === '已付定金') return '已付定金';
  if (status === '已退款') return '已退款';
  return '待支付';
}

function splitServiceItems(value: string | undefined): string[] {
  return (value || '').split(/[，,、\n]/).map(s => s.trim()).filter(Boolean);
}

function getCustomerFollowTask(customer: any): string {
  return customer?.profile?.followTask || '';
}

function getCustomerFollowRecords(customer: any): CustomerFollowRecord[] {
  const records = customer?.profile?.followRecords;
  return Array.isArray(records) ? records : [];
}

function profileValue(value: unknown, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function nowLocalDateTime() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function displayDateTime(value: string | undefined) {
  return value ? value.replace('T', ' ') : '-';
}

function readFileAsDataUrl(file: File): Promise<OrderAttachment> {
  if (file.type.startsWith('image/')) {
    return readImageAsCompressedAttachment(file);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file read failed'));
    reader.onload = () => resolve({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      dataUrl: String(reader.result || ''),
      uploadedAt: nowLocalDateTime(),
    });
    reader.readAsDataURL(file);
  });
}

function readImageAsCompressedAttachment(file: File): Promise<OrderAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('image read failed'));
    reader.onload = () => {
      const source = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('image decode failed'));
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        resolve({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name.replace(/\.(png|jpe?g|webp|bmp)$/i, '.jpg'),
          type: 'image/jpeg',
          dataUrl,
          uploadedAt: nowLocalDateTime(),
        });
      };
      img.src = source;
    };
    reader.readAsDataURL(file);
  });
}

function openAttachment(att: OrderAttachment) {
  if (!att?.dataUrl) return;
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('浏览器已拦截新窗口');
    return;
  }
  if (att.type?.startsWith('image/')) {
    win.document.write(`<img src="${att.dataUrl}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`);
  } else {
    win.document.write(`<iframe src="${att.dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`);
  }
}

function formFromOrder(order: any): OrderForm {
  const orderId = order?.id || '';
  const orderPeople = order?.servicePeople || {};
  const savedTherapists = orderTherapistMap.get(orderId) || (orderPeople?.sp1 || orderPeople?.sp2 || orderPeople?.sp3 ? orderPeople : null);
  const savedFollowRecords = getFollowRecords(orderId).map(r => ({
    date: r.date,
    content: r.content,
    operator: r.operator,
  }));
  return {
    customerId: order?.internalCustomerId || order?.customerId || order?.resolvedCustomerId || order?.customerCode || '',
    customerName: order?.customerName || '',
    customerPhone: order?.customerPhone || '',
    customerArea: order?.area && order.area !== '—' ? order.area : '',
    customerTag: order?.tag || '',
    customerAdvisor: order?.advisor && order.advisor !== '—' ? order.advisor : '',
    orderType: order?.type || '',
    amount: order?.amount != null ? String(order.amount) : '',
    payStatus: payStatusToForm(effectiveOrderPayStatus(order)),
    purchaseDate: order?.createdAt || new Date().toISOString().slice(0, 10),
    contractStatus: getContractStatus(orderId, order?.type || '体验卡'),
    servicePerson1: savedTherapists?.sp1 || { type: '产康师', assign: '待分配' },
    servicePerson2: savedTherapists?.sp2 || { type: '运动康复师', assign: '待分配' },
    servicePerson3: savedTherapists?.sp3 || { type: '调理师', assign: '待分配' },
    serviceItems: order?.serviceItems || orderServiceItemsMap.get(orderId) || '',
    appointmentTime: order?.appointmentTime || '',
    serviceNote: order?.serviceNote || '',
    contractAttachments: ensureArray<OrderAttachment>(order?.contractAttachments),
    servicePhotoRecords: ensureArray<ServicePhotoRecord>(order?.servicePhotoRecords),
    editingPhotoRecordId: '',
    newPhotoSeq: '',
    newPhotoTime: '',
    newPhotoRemark: '',
    newPhotoFiles: [],
    followRecords: savedFollowRecords,
    newFollowDate: '',
    newFollowContent: '',
  };
}

function CustomerArchiveView({ customer, form }: { customer: any; form: OrderForm }) {
  const c = customer || {};
  const profile = c.profile || {};
  const followRecords = getCustomerFollowRecords(c);
  const basicRows: [string, string][] = [
    ['客户ID', profileValue(c.id || form.customerId)],
    ['客户姓名', profileValue(c.name || form.customerName)],
    ['微信号', profileValue(c.wechat)],
    ['联系电话', profileValue(c.phone || form.customerPhone)],
    ['所在区域', profileValue(c.area || form.customerArea)],
    ['来源渠道', profileValue(c.source)],
    ['获客时间', profileValue(c.acquiredAt)],
    ['客户标签', profileValue(c.tag || form.customerTag)],
    ['归属客服', profileValue(c.advisor || form.customerAdvisor)],
    ['跟进状态', profileValue(c.followStatus)],
    ['下次跟进', profileValue(c.followDate)],
    ['意向产品', profileValue(c.intendedProduct)],
    ['客户需求', profileValue(c.situation)],
    ['备注', profileValue(c.remark)],
    ['跟进事项', profileValue(getCustomerFollowTask(c))],
  ];
  const profileRows: [string, string][] = [
    ['年龄', profileValue(profile.age ? `${profile.age}岁` : '')],
    ['生产时间', profileValue(profile.deliveryDate)],
    ['分娩方式', profileValue(profile.deliveryType)],
    ['第几胎', profileValue(profile.babyCount ? `第${profile.babyCount}胎` : '')],
    ['喂养方式', profileValue(profile.feedingType)],
  ];

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold text-foreground mb-3">客户基本信息</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {basicRows.map(([k, v]) => (
            <div key={k} className={k === '客户需求' || k === '备注' || k === '跟进事项' ? 'col-span-2 flex items-start gap-3' : 'flex items-start gap-3'}>
              <span className="text-xs w-16 flex-shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{k}</span>
              <span className="text-sm font-medium text-foreground whitespace-pre-wrap break-words">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <UserIcon size={14} style={{ color: 'var(--brand)' }} />
          <span className="text-sm font-semibold text-foreground">客户画像</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {profileRows.map(([k, v]) => (
            <div key={k} className="flex flex-col items-center rounded-lg px-4 py-2 gap-0.5"
              style={{ background: 'var(--card)', minWidth: 88 }}>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{k}</span>
              <span className="text-sm font-semibold text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareIcon size={14} style={{ color: 'var(--brand)' }} />
          <span className="text-sm font-semibold text-foreground">跟进记录</span>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>共 {followRecords.length} 条</span>
        </div>
        {followRecords.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            <MessageSquareIcon size={28} className="mx-auto mb-2 opacity-30" />
            <div className="text-sm">暂无跟进记录</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {followRecords.map((rec, idx) => (
              <div key={rec.id || idx} className="rounded-lg p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>计划跟进：{rec.date || '—'}</span>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>操作人：{rec.operator || '—'}</span>
                </div>
                {rec.content && <div className="text-sm text-foreground mb-1">事项：{rec.content}</div>}
                {rec.feedback && <div className="text-sm text-foreground mb-1">反馈：{rec.feedback}</div>}
                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>记录时间：{rec.createdAt || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderModal({ visible, onClose, mode = 'create', order = null, editOrderId = '' }: OrderModalProps) {
  const orderMutations = useOrderMutations();
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState('customer');
  const [form, setForm] = useState<OrderForm>(initForm());
  const [showPicker, setShowPicker] = useState(false);
  const contractFileRef = useRef<HTMLInputElement>(null);
  const servicePhotoFileRef = useRef<HTMLInputElement>(null);
  const isEdit = mode === 'edit';
  const isView = mode === 'view';
  const customerQuery = useCustomer(form.customerId || null);
  const fullCustomer = customerQuery.data as any;

  useEffect(() => {
    if (!visible) {
      setActiveTab('customer');
      setForm(initForm());
      setShowPicker(false);
      return;
    }
    setActiveTab('customer');
    setShowPicker(false);
    setForm(order && mode !== 'create' ? formFromOrder(order) : initForm());
  }, [visible, mode, editOrderId, order]);

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

  async function handleContractFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    const valid = selected.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
    if (valid.length !== selected.length) toast.error('合同附件仅支持 PDF 或图片格式');
    const attachments = await Promise.all(valid.map(readFileAsDataUrl));
    set('contractAttachments', [...form.contractAttachments, ...attachments]);
    if (contractFileRef.current) contractFileRef.current.value = '';
  }

  async function handleServicePhotoFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    const valid = selected.filter(f => f.type === 'image/png' || f.type === 'image/jpeg');
    if (valid.length !== selected.length) toast.error('服务照片仅支持 PNG、JPG 格式');
    const remaining = Math.max(0, 10 - form.newPhotoFiles.length);
    if (valid.length > remaining) toast.error('每次服务最多上传 10 张图片');
    const attachments = await Promise.all(valid.slice(0, remaining).map(readFileAsDataUrl));
    set('newPhotoFiles', [...form.newPhotoFiles, ...attachments]);
    if (servicePhotoFileRef.current) servicePhotoFileRef.current.value = '';
  }

  function resetPhotoDraft() {
    setForm(prev => ({
      ...prev,
      editingPhotoRecordId: '',
      newPhotoSeq: '',
      newPhotoTime: '',
      newPhotoRemark: '',
      newPhotoFiles: [],
    }));
  }

  function handleSavePhotoRecord() {
    if (form.newPhotoFiles.length === 0) {
      toast.error('请先上传服务照片');
      return;
    }
    const record: ServicePhotoRecord = {
      id: form.editingPhotoRecordId || `spr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      seq: Number(form.newPhotoSeq) || form.servicePhotoRecords.length + 1,
      time: form.newPhotoTime || nowLocalDateTime(),
      remark: form.newPhotoRemark,
      photos: form.newPhotoFiles,
    };
    setForm(prev => ({
      ...prev,
      servicePhotoRecords: prev.editingPhotoRecordId
        ? prev.servicePhotoRecords.map(r => r.id === prev.editingPhotoRecordId ? record : r)
        : [...prev.servicePhotoRecords, record],
      editingPhotoRecordId: '',
      newPhotoSeq: '',
      newPhotoTime: '',
      newPhotoRemark: '',
      newPhotoFiles: [],
    }));
  }

  function handleEditPhotoRecord(record: ServicePhotoRecord) {
    setForm(prev => ({
      ...prev,
      editingPhotoRecordId: record.id,
      newPhotoSeq: String(record.seq || ''),
      newPhotoTime: record.time || '',
      newPhotoRemark: record.remark || '',
      newPhotoFiles: record.photos || [],
    }));
  }

  async function handleSave() {
    if (isView) return;
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
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerArea: form.customerArea,
      customerTag: form.customerTag,
      customerAdvisor: form.customerAdvisor,
      type: form.orderType || '体验卡',
      amount: Number(form.amount) || 0,
      payStatus,
      purchaseDate: form.purchaseDate,
      serviceItems: form.serviceItems,
      totalTimes: form.orderType === '套餐' ? 10 : 1,
      contractSigned: form.contractStatus !== '无' && form.contractStatus !== '未回签',
      serviceItemCount: Math.max(1, splitServiceItems(form.serviceItems).length),
      servicePeople: {
        sp1: form.servicePerson1,
        sp2: form.servicePerson2,
        sp3: form.servicePerson3,
      },
      appointmentTime: form.appointmentTime,
      serviceNote: form.serviceNote,
      contractAttachments: form.contractAttachments,
      servicePhotoRecords: form.servicePhotoRecords,
    };
    try {
      if (isEdit && editOrderId) {
        await orderMutations.update({ id: editOrderId, body: orderBody });
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

  if (!visible) return null;

  return (
    <>
      <CustomerPickerModal visible={showPicker} onClose={() => setShowPicker(false)} onSelect={handleCustomerSelect} />
      <div>
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-card rounded-2xl shadow-custom flex flex-col" style={{ width: 700, maxHeight: '92vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-semibold text-base text-foreground">{isView ? '查看订单' : isEdit ? '编辑订单' : '新建订单'}</span>
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
              <div className="contents">

              {/* ── 客户信息 ── */}
              <div className={activeTab === 'customer' ? '' : 'hidden'}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-foreground">客户基本信息</span>
                  <button
                    disabled={isView}
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
                      {!isView && <button className="ml-auto text-xs px-2 py-1 rounded hover:bg-muted" style={{ color: 'var(--muted-foreground)' }} onClick={() => set('customerId', '')}>重新选择</button>}
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
                    onClick={() => !isView && setShowPicker(true)}
                  >
                    <UserIcon size={32} className="mx-auto mb-2 opacity-30" />
                    <div className="text-sm">点击从客户列表选择，或直接填写客户信息</div>
                  </div>
                )}
                {(isView || (isEdit && fullCustomer)) ? (
                  <CustomerArchiveView customer={fullCustomer} form={form} />
                ) : null}
                {!isView && (
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
                )}
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
                      {([
                        '已支付',
                        '待支付',
                        '已付定金',
                        ...(form.payStatus === '已退款' ? ['已退款' as NewPayStatus] : []),
                      ] as NewPayStatus[]).map(s => (
                        <button
                          key={s}
                          onClick={() => set('payStatus', s)}
                          className="flex-1 py-2 rounded-lg text-sm border-2 transition-all text-center"
                          style={{
                            borderColor: form.payStatus === s ? 'var(--brand)' : 'var(--border)',
                            background: form.payStatus === s ? 'var(--accent)' : 'var(--muted)',
                            color: form.payStatus === s ? 'var(--brand)' : 'var(--foreground)',
                          }}
                        >{payStatusDisplay(s)}</button>
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

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>合同附件</label>
                      {!isView && (
                        <>
                          <input
                            ref={contractFileRef}
                            type="file"
                            accept="application/pdf,image/*"
                            multiple
                            className="hidden"
                            onChange={e => handleContractFiles(e.target.files)}
                          />
                          <button
                            type="button"
                            onClick={() => contractFileRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white hover:opacity-90"
                            style={{ background: 'var(--brand)' }}
                          >
                            <PlusIcon size={13} />
                            上传附件
                          </button>
                        </>
                      )}
                    </div>
                    {form.contractAttachments.length === 0 ? (
                      <div className="rounded-lg p-4 text-center text-sm" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
                        暂无合同附件
                      </div>
                    ) : (
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                        {form.contractAttachments.map(att => (
                          <div key={att.id} className="flex items-center gap-3 px-3 py-2 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                            <FileTextIcon size={15} style={{ color: 'var(--brand)' }} />
                            <span className="flex-1 truncate">{att.name}</span>
                            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{displayDateTime(att.uploadedAt)}</span>
                            <button type="button" className="text-xs hover:underline" style={{ color: 'var(--brand)' }} onClick={() => openAttachment(att)}>查看</button>
                            {!isView && (
                              <button
                                type="button"
                                className="text-xs hover:underline"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => set('contractAttachments', form.contractAttachments.filter(x => x.id !== att.id))}
                              >
                                删除
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>服务照片维护</label>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>每次最多 10 张 PNG/JPG</span>
                    </div>
                    {!isView && (
                      <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>第几次</label>
                            <input
                              type="number"
                              min={1}
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                              value={form.newPhotoSeq}
                              onChange={e => set('newPhotoSeq', e.target.value)}
                              placeholder="如：1"
                            />
                          </div>
                          <div className="flex flex-col gap-1 col-span-2">
                            <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>上传/服务时间</label>
                            <input
                              type="datetime-local"
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                              value={form.newPhotoTime}
                              onChange={e => set('newPhotoTime', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>备注信息</label>
                          <input
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.newPhotoRemark}
                            onChange={e => set('newPhotoRemark', e.target.value)}
                            placeholder="填写本次服务照片说明"
                          />
                        </div>
                        <input
                          ref={servicePhotoFileRef}
                          type="file"
                          accept="image/png,image/jpeg"
                          multiple
                          className="hidden"
                          onChange={e => handleServicePhotoFiles(e.target.files)}
                        />
                        <div className="flex flex-wrap gap-2">
                          {form.newPhotoFiles.map(photo => (
                            <div key={photo.id} className="relative w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                              <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ background: 'rgba(0,0,0,0.5)' }}
                                onClick={() => set('newPhotoFiles', form.newPhotoFiles.filter(x => x.id !== photo.id))}
                              >
                                <XIcon size={10} className="text-white" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => servicePhotoFileRef.current?.click()}
                            className="w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 text-xs hover:border-brand transition-colors"
                            style={{ border: '2px dashed var(--border)', color: 'var(--muted-foreground)' }}
                          >
                            <ImageIcon size={18} />
                            上传
                          </button>
                        </div>
                        <div className="flex justify-end gap-2">
                          {form.editingPhotoRecordId && (
                            <button type="button" onClick={resetPhotoDraft} className="px-3 py-1.5 rounded-lg text-sm border hover:bg-muted" style={{ borderColor: 'var(--border)' }}>取消编辑</button>
                          )}
                          <button
                            type="button"
                            onClick={handleSavePhotoRecord}
                            className="px-4 py-1.5 rounded-lg text-sm text-white hover:opacity-90"
                            style={{ background: 'var(--brand)' }}
                          >
                            {form.editingPhotoRecordId ? '保存本次' : '新增本次'}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="grid grid-cols-[70px_140px_1fr_100px] gap-3 px-3 py-2 text-xs font-medium" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                        <span>次数</span>
                        <span>时间</span>
                        <span>图片/备注</span>
                        <span>操作</span>
                      </div>
                      {form.servicePhotoRecords.length === 0 ? (
                        <div className="p-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无服务照片记录</div>
                      ) : (
                        [...form.servicePhotoRecords].sort((a, b) => (a.seq || 0) - (b.seq || 0)).map(record => (
                          <div key={record.id} className="grid grid-cols-[70px_140px_1fr_100px] gap-3 px-3 py-3 items-start text-sm" style={{ borderTop: '1px solid var(--border)' }}>
                            <span className="font-semibold text-foreground">第 {record.seq} 次</span>
                            <span style={{ color: 'var(--muted-foreground)' }}>{displayDateTime(record.time)}</span>
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap gap-1.5">
                                {(record.photos || []).map(photo => (
                                  <button
                                    type="button"
                                    key={photo.id}
                                    onClick={() => openAttachment(photo)}
                                    className="w-12 h-12 rounded-lg overflow-hidden"
                                    style={{ border: '1px solid var(--border)' }}
                                  >
                                    <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                              {record.remark && <div className="text-xs break-words" style={{ color: 'var(--muted-foreground)' }}>{record.remark}</div>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {record.photos?.[0] && <button type="button" className="text-xs hover:underline" style={{ color: 'var(--brand)' }} onClick={() => openAttachment(record.photos[0])}>查看</button>}
                              {!isView && (
                                <>
                                  <button type="button" className="text-xs hover:underline" style={{ color: 'var(--brand)' }} onClick={() => handleEditPhotoRecord(record)}>编辑</button>
                                  <button
                                    type="button"
                                    className="text-xs hover:underline"
                                    style={{ color: 'var(--danger)' }}
                                    onClick={() => set('servicePhotoRecords', form.servicePhotoRecords.filter(x => x.id !== record.id))}
                                  >
                                    删除
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))
                      )}
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
                ) : isView ? (
                  <button
                    className="px-5 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90"
                    style={{ background: 'var(--brand)' }}
                    onClick={onClose}
                  >关闭</button>
                ) : (
                  <button
                    className="px-5 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90"
                    style={{ background: 'var(--brand)' }}
                    onClick={handleSave}
                  >{isEdit ? '保存修改' : '创建订单'}</button>
                )}
                <button className="px-4 py-1.5 rounded-lg text-sm border hover:bg-muted" style={{ borderColor: 'var(--border)' }} onClick={onClose}>{isView ? '关闭' : '取消'}</button>
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
    contractAttachments: [],
    servicePhotoRecords: [],
    editingPhotoRecordId: '',
    newPhotoSeq: '',
    newPhotoTime: '',
    newPhotoRemark: '',
    newPhotoFiles: [],
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
  const [modalMode, setModalMode] = useState<OrderModalMode>('create');
  const [editOrderId, setEditOrderId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
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
  const customersQ = useCustomers({ page: 1, pageSize: 1000, includeOrdered: 1 });
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const CUSTOMERS: any[] = customersQ.data?.data ?? [];
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];
  const ORDERS: any[] = ordersQ.data?.data ?? [];
  const customerById = new Map(CUSTOMERS.flatMap(c => [[c.id, c], [c._id, c]].filter(([id]) => !!id) as [string, any][]));
  const customerByName = new Map(CUSTOMERS.map(c => [c.name, c]));
  const TYPE_OPTIONS = [
    { value: '体验卡', label: '体验卡' },
    { value: '套餐', label: '套餐' },
  ];
  const PAY_OPTIONS = [
    { value: '已付款', label: '已支付' },
    { value: '待付款', label: '待支付' },
  ];

  // Enrich orders with customer area/advisor/tag
  const enrichedOrders = ORDERS.map(o => {
    const cust = customerByName.get(o.customerName) ?? customerById.get(o.customerId);
    return {
      ...o,
      area: o.area || cust?.area || '—',
      customerPhone: o.customerPhone || cust?.phone || '',
      advisor: o.advisor || cust?.advisor || '—',
      tag: (o.tag || cust?.tag || null) as CustomerTag | null,
      resolvedCustomerId: o.customerCode || cust?.id || o.customerId || '—',
      internalCustomerId: o.customerId || cust?._id || '',
    };
  });

  const toOptions = (values: string[]) =>
    Array.from(new Set(values.map(v => v.trim()).filter(v => v && v !== '—')))
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map(v => ({ value: v, label: v }));

  const TAG_OPTIONS = TAG_DEFS.map(d => ({ value: d.tag, label: d.tag }));
  const AREA_OPTIONS = CITY_OPTIONS;
  const ADVISOR_OPTIONS = toOptions([
    ...CUSTOMERS.map(c => c.advisor),
    ...enrichedOrders.map(o => o.advisor),
  ]);
  const assignedTherapistNames = enrichedOrders.flatMap(o =>
    getTherapistDisplay(o.id).split(/[，,、]/).map(name => name.trim()).filter(name => name && name !== '待分配')
  );
  const therapistTypeOrder = ['产康师', '调理师', '运动康复师'];
  const THERAPIST_OPTIONS: FilterOption[] = [
    ...THERAPISTS
      .filter(t => t.status === '在职')
      .sort((a, b) => {
        const at = therapistTypeOrder.indexOf(a.therapistType);
        const bt = therapistTypeOrder.indexOf(b.therapistType);
        return (at === -1 ? 99 : at) - (bt === -1 ? 99 : bt) || a.name.localeCompare(b.name, 'zh-CN');
      })
      .map(t => ({ value: t.name, label: t.name, group: t.therapistType || '其他' })),
    ...assignedTherapistNames
      .filter(name => !THERAPISTS.some(t => t.name === name))
      .map(name => ({ value: name, label: name, group: '其他' })),
  ];

  const filtered = enrichedOrders.filter(o => {
    const matchSearch = !search || o.customerName.includes(search) || o.id.includes(search);
    const matchType = fType.length === 0 || fType.includes(o.type);
    const normalizedPay = o.payStatus === '已支付' ? '已付款' : o.payStatus === '待支付' ? '待付款' : o.payStatus;
    const matchPay = fPay.length === 0 || fPay.includes(normalizedPay);
    const matchArea = fArea.length === 0 || fArea.some(area => String(o.area || '').includes(area));
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
  // 区域(92) | 订单类型(80) | 服务项目(160) | 跟进状态(76) | 跟进时间(82) | 跟进事项(120) | 付款状态(76) | 金额(80) | 合同状态(76) | 归属客服(76) | 技师(88) | 操作(96)
  const NORMAL_COLS = [92, 80, 160, 76, 82, 120, 76, 80, 76, 76, 88, 96];
  const totalNormal = NORMAL_COLS.reduce((s, w) => s + w, 0);
  const tableMinW = FREEZE_TOTAL + totalNormal;

  return (
    <>
      <OrderModal
        visible={showModal}
        onClose={() => { setShowModal(false); setSelectedOrder(null); }}
        mode={modalMode}
        order={selectedOrder}
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
            <MultiSelectDropdown label="区域" options={AREA_OPTIONS} selected={fArea} onChange={setFArea} />
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
            <MultiSelectDropdown
              label="技师"
              options={THERAPIST_OPTIONS}
              selected={fTherapist}
              onChange={setFTherapist}
              grouped={true}
              renderOption={opt => (
                <>
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>{opt.group}</span>
                </>
              )}
            />
            {/* Count + new button */}
            <span className="text-sm flex-shrink-0 ml-1" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>共 {filtered.length} 条</span>
            {!isReadOnly && (
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90 flex-shrink-0"
                style={{ background: 'var(--brand)' }}
                onClick={() => { setModalMode('create'); setEditOrderId(''); setSelectedOrder(null); setShowModal(true); }}
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
                  <th>区域</th>
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
                    if (o.serviceItems && o.serviceItems.trim()) return o.serviceItems;
                    return '—';
                  })();

                  const therapistDisplay = getTherapistDisplay(o.id);
                  const contractStatus = getContractStatus(o.id, o.type);
                  const followInfo = getFollowDisplay(o.id);
                  const displayPayStatus = effectiveOrderPayStatus(o);

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

                      {/* 区域 */}
                      <td>
                        <span
                          className="text-xs"
                          style={{
                            color: o.area && o.area !== '—' ? 'var(--foreground)' : 'var(--muted-foreground)',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 84,
                          }}
                          title={o.area}
                        >
                          {o.area || '—'}
                        </span>
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
                            color: serviceItemsText !== '—' ? 'var(--foreground)' : 'var(--muted-foreground)',
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
                        <span className={`badge ${PAY_STATUS_COLORS[displayPayStatus] ?? 'badge-gray'}`}>{payStatusDisplay(displayPayStatus)}</span>
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
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                            title="查看"
                            style={{ background: 'rgba(30,136,229,0.1)', color: 'var(--brand)' }}
                            onClick={() => { setModalMode('view'); setEditOrderId(o.id); setSelectedOrder(o); setShowModal(true); }}
                          >
                            <EyeIcon size={11} />查看
                          </button>
                          {!isReadOnly && (
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium hover:opacity-80 transition-opacity"
                              title="编辑"
                              style={{ background: 'rgba(100,100,100,0.1)', color: 'var(--foreground)' }}
                              onClick={() => { setModalMode('edit'); setEditOrderId(o.id); setSelectedOrder(o); setShowModal(true); }}
                            >
                              <PencilIcon size={11} />编辑
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={16} className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
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
