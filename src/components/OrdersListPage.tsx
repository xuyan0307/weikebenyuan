import { useState, useRef, useEffect } from 'react';
import {
  SearchIcon, PlusIcon,
  ChevronLeftIcon, ChevronRightIcon, XIcon, CheckIcon,
  UserIcon, FileTextIcon, UsersIcon, MessageSquareIcon,
  ImageIcon, ChevronDownIcon, TagIcon,
  UploadIcon, DownloadIcon, Trash2Icon,
} from 'lucide-react';
import { RecordActionButtons } from './ui/record-action-buttons';
import type { OrderType, PayStatus, Customer, CustomerTag } from '../data/mockData';
import { useApp } from '../hooks/useApp';
import {
  useOrders, useOrderMutations, useCustomers, useCustomer, useTherapists, useSystemUsers,
  useAppointments, useServiceRecords, useServiceRecordMutations,
} from '../api/hooks';
import { uploadsApi } from '../api/endpoints';
import { toast } from 'sonner';
import { matchesFollowTime } from '../utils/followTimeFilter';
import {
  clearDashboardFilter,
  readDashboardFilter,
} from '../utils/dashboardTodoNavigation';
import {
  matchesOrderContractStatus,
  ORDER_CONTRACT_FILTER_VALUES,
  resolveOrderContractStatus,
} from '../utils/orderContractFilter';
import { downloadXlsx, readSpreadsheet, rowsToObjects } from '../utils/spreadsheet';
import { DateRangeFilter } from './ui/date-range-filter';
import { GLOBAL_DATE_RANGE_QUICK_OPTIONS, dateInRange, quickDateRange, type DateRangeValue } from '../utils/dateRange';
import { useGlobalDateRange } from '../utils/useGlobalDateRange';
import { sumOrderAmountStages } from '../utils/orderAmountSummary';

/* ─── Types ─────────────────────────────────────────── */
type NewPayStatus = '已支付' | '待支付' | '已付定金' | '已退款';
type TherapistType = '产康师' | '运动康复师' | '调理师';
type TherapistAssign = '待分配' | '无' | string;
type ContractStatus = '无' | '未回签' | '已回签';
type OrderModalMode = 'create' | 'view' | 'edit';
type PurchaseDateRange = 'all' | 'today' | 'week' | 'month' | 'custom';

function purchaseDateLabel(range: Exclude<PurchaseDateRange, 'custom'>): string {
  return { all: '全部', today: '今日', week: '本周', month: '本月' }[range];
}

function matchesPurchaseDateRange(value: string, range: PurchaseDateRange): boolean {
  if (range === 'all') return true;
  if (!value) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (range === 'today') return date.getTime() === today.getTime();
  if (range === 'week') {
    const from = new Date(today); from.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const to = new Date(from); to.setDate(from.getDate() + 6);
    return date >= from && date <= to;
  }
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return date >= from && date <= to;
}

interface ServicePerson {
  type: TherapistType;
  assign: TherapistAssign;
  totalTimes?: string;
  usedTimes?: string;
}

interface FollowRecord {
  id?: string;
  date: string;
  content: string;
  feedback: string;
  status: '待跟进' | '跟进中' | '已完成' | '延迟';
  operator: string;
  followerId?: string;
  followerName?: string;
  createdAt?: string;
}

interface OrderAttachment {
  id: string;
  name: string;
  type: string;
  dataUrl?: string;
  url?: string;
  objectKey?: string;
  size?: number;
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
  followerId?: string;
  followerName?: string;
  createdAt: string;
}

interface ExperienceSnapshot {
  amount: string;
  payStatus: NewPayStatus;
  purchaseDate: string;
  serviceItems: string;
  serviceNote: string;
  servicePeople: {
    sp1: ServicePerson;
    sp2: ServicePerson;
    sp3: ServicePerson;
  };
  followRecords?: FollowRecord[];
  totalTimes?: string;
  usedTimes?: number;
  contractStatus?: ContractStatus;
  contractAttachments?: OrderAttachment[];
  servicePhotoRecords?: ServicePhotoRecord[];
}

interface OrderStageSnapshot extends ExperienceSnapshot {
  id: string;
  label: string;
  type: OrderType;
  frozenAt: string;
}

interface OrderForm {
  customerId: string;
  customerName: string;
  customerWechat: string;
  customerPhone: string;
  customerArea: string;
  customerSource: string;
  customerAcquiredAt: string;
  customerTag: CustomerTag | '';
  customerAdvisor: string;
  customerFollowStatus: string;
  customerFollowDate: string;
  customerIntendedProduct: string;
  customerSituation: string;
  customerRemark: string;
  customerBirthYear: string;
  customerDeliveryDate: string;
  customerBabyCount: string;
  customerDeliveryType: '未知' | '顺产' | '剖腹产';
  customerFeedingType: '未知' | '母乳' | '奶粉' | '混合喂养';
  customerFollowTask: string;
  customerProfile: Record<string, unknown>;
  orderType: OrderType | '';
  amount: string;
  payStatus: NewPayStatus;
  purchaseDate: string;
  totalTimes: string;
  usedTimes: number;
  experienceUpgradeStatus: '' | '未升单' | '已升单';
  experienceSnapshot: ExperienceSnapshot | null;
  upgradeCustomerTag: CustomerTag | '';
  packageHistory: OrderStageSnapshot[];
  activePackageNumber: number;
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
  newFollowStatus: '待跟进' | '跟进中' | '已完成' | '延迟';
  newFollowContent: string;
  newFollowFeedback: string;
  newFollowFollowerId: string;
  newFollowFollowerName: string;
}

interface CustomerFollowRecord {
  id: string;
  date: string;
  content: string;
  feedback: string;
  status: string;
  operator: string;
  followerId?: string;
  followerName?: string;
  createdAt: string;
}

const ORDER_IMPORT_HEADERS = ['客户ID', '客户姓名', '微信号', '联系电话', '所在区域', '客户标签', '归属客服', '订单类型', '服务项目', '订单金额', '付款状态', '总次数', '已使用次数', '是否升级', '合同状态', '是否使用优惠券', '预约服务时间', '服务备注'];

function downloadOrderTemplate() {
  downloadXlsx('订单批量导入模板.xlsx', ORDER_IMPORT_HEADERS, []);
}

function importBoolean(value: string): boolean {
  return ['是', '1', 'true', 'yes', '已签约', '已使用'].includes(value.trim().toLowerCase());
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
  '体验卡阶段': [288, 398],
  '套餐阶段': [3800, 5800, 6800, 9800, 12800, 15800],
};

const FOLLOW_STATUS_COLORS: Record<string, string> = {
  '待跟进': 'badge-warning',
  '跟进中': 'badge-info',
  '已完成': 'badge-success',
  '延迟': 'badge-danger',
};

const SERVICE_PRESETS = ['腹直肌', '骨盆', '盆底肌', '通乳'] as const;

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

const UPGRADE_TAGS = new Set<CustomerTag>(['V1', 'V2', 'A1', 'A2']);
const PRE_UPGRADE_TAG_DEFS = TAG_DEFS.filter(definition => !UPGRADE_TAGS.has(definition.tag));
const UPGRADE_TAG_DEFS = TAG_DEFS.filter(definition => UPGRADE_TAGS.has(definition.tag));

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
const FOLLOW_TIME_FILTER_OPTIONS: FilterOption[] = [
  { value: 'today', label: '今日' },
  { value: 'overdue', label: '已过期' },
  { value: 'pending', label: '未开始' },
];
const CONTRACT_STATUS_FILTER_OPTIONS: FilterOption[] =
  ORDER_CONTRACT_FILTER_VALUES.map(value => ({ value, label: value }));

function matchesFollowTimeFilter(value: string, selected: string[]) {
  return matchesFollowTime(value, selected, {
    emptyMeansAll: true,
    noneValue: FILTER_NONE,
  });
}

/* ─── Multi-Select Dropdown ──────────────────────────── */
interface MultiSelectDropdownProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  renderOption?: (opt: FilterOption) => React.ReactNode;
  grouped?: boolean;
  allSelectedLabel?: string;
  fixedSelectAllLabel?: boolean;
}

function MultiSelectDropdown({
  label, options, selected, onChange, renderOption, grouped = false,
  allSelectedLabel, fixedSelectAllLabel = false,
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
      ? '全不选'
      : selected.length === 0 || effectiveSelected.length === options.length
      ? allSelectedLabel ?? label
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

  function groupValues(items: FilterOption[]) {
    return items.map(item => item.value);
  }

  function groupAllSelected(items: FilterOption[]) {
    const values = groupValues(items);
    return values.length > 0 && values.every(value => optionChecked(value));
  }

  function toggleGroup(items: FilterOption[]) {
    const values = groupValues(items);
    if (allSelected) {
      const next = options.map(opt => opt.value).filter(value => !values.includes(value));
      onChange(next.length > 0 ? next : [FILTER_NONE]);
      return;
    }
    if (groupAllSelected(items)) {
      const next = effectiveSelected.filter(value => !values.includes(value));
      onChange(next.length > 0 ? next : [FILTER_NONE]);
      return;
    }
    onChange(Array.from(new Set([...effectiveSelected, ...values])));
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
          {fixedSelectAllLabel ? '全选' : allSelected ? '全不选' : '全选'}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
        {grouped ? (
          groupedOptions.map((g, gi) => (
            <div key={g.groupKey}>
              {gi > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '3px 0' }} />}
              <div
                className="px-3 py-1 flex items-center gap-2 cursor-pointer hover:bg-muted"
                onClick={() => toggleGroup(g.items)}
              >
                <div
                  className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: groupAllSelected(g.items) ? 'var(--brand)' : 'var(--border)',
                    background: groupAllSelected(g.items) ? 'var(--brand)' : 'transparent',
                  }}
                >
                  {groupAllSelected(g.items) && <CheckIcon size={10} className="text-white" />}
                </div>
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
      <div>
        <textarea
          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
          style={{ background: 'var(--muted)', border: '1px solid var(--border)', minHeight: 60 }}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="请输入服务项目，多个项目用顿号、逗号或换行分隔"
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {SERVICE_PRESETS.map(item => {
            const active = selectedItems.includes(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => togglePreset(item)}
                className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
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
    </div>
  );
}

/* ─── Service Person Row ─────────────────────────────── */
interface ServicePersonRowProps {
  label: TherapistType;
  value: ServicePerson;
  onChange: (v: ServicePerson) => void;
  totalTimes?: string;
  onTotalTimesChange?: (value: string) => void;
  usedTimes?: string;
  onUsedTimesChange?: (value: string) => void;
  isExperience?: boolean;
  canEditProgress?: boolean;
  assignmentDisabled?: boolean;
}

function isAssignedServicePerson(person?: ServicePerson) {
  return Boolean(person?.assign && person.assign !== '待分配' && person.assign !== '无');
}

function experienceOverallUsedTimes(...people: ServicePerson[]) {
  const assignedPeople = people.filter(isAssignedServicePerson);
  return assignedPeople.length > 0 && assignedPeople.every(person => Number(person.usedTimes) > 0) ? 1 : 0;
}

function isExperienceServiceComplete(form: Pick<OrderForm, 'servicePerson1' | 'servicePerson2' | 'servicePerson3' | 'usedTimes' | 'totalTimes'>) {
  const assignedPeople = [form.servicePerson1, form.servicePerson2, form.servicePerson3].filter(isAssignedServicePerson);
  if (assignedPeople.length > 0) {
    return assignedPeople.every(person => Number(person.usedTimes) > 0);
  }
  return Number(form.usedTimes) >= Math.max(1, Number(form.totalTimes) || 1);
}

function isPackageServiceComplete(form: Pick<OrderForm, 'servicePerson1' | 'servicePerson2' | 'servicePerson3' | 'usedTimes' | 'totalTimes'>) {
  const assignedPeople = [form.servicePerson1, form.servicePerson2, form.servicePerson3].filter(isAssignedServicePerson);
  if (assignedPeople.length > 0) {
    return assignedPeople.every(person => {
      const total = Math.max(1, Number(person.totalTimes) || Number(form.totalTimes) || 1);
      return Number(person.usedTimes) >= total;
    });
  }
  return Number(form.usedTimes) >= Math.max(1, Number(form.totalTimes) || 1);
}

function ServicePersonRow({
  label,
  value,
  onChange,
  totalTimes = '1',
  onTotalTimesChange,
  usedTimes = '0',
  onUsedTimesChange,
  isExperience = false,
  canEditProgress = false,
  assignmentDisabled = false,
}: ServicePersonRowProps) {
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];
  const typeTherapists = THERAPISTS.filter(t => t.status === '在职');
  const assignOptions = ['待分配', '无', ...typeTherapists.map(t => t.name)];
  const isUnassigned = !isAssignedServicePerson(value);

  return (
    <div className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm font-medium w-20 flex-shrink-0" style={{ color: 'var(--foreground)' }}>{label}</span>
      <select
        className="text-sm rounded-lg px-2 py-1.5 outline-none flex-1"
        style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        value={value.assign}
        onChange={e => onChange({
          ...value,
          assign: e.target.value,
          ...(e.target.value === '待分配' || e.target.value === '无' ? { usedTimes: '0' } : {}),
        })}
        disabled={assignmentDisabled}
      >
        {assignOptions.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <div className="w-28 flex-shrink-0">
        {isUnassigned ? (
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>无</span>
        ) : isExperience ? (
          <select
            className="w-full text-sm rounded-lg px-2 py-1.5 outline-none"
            style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            value={Number(usedTimes) > 0 ? '1' : '0'}
            disabled={!canEditProgress}
            onChange={e => onUsedTimesChange?.(e.target.value)}
          >
            <option value="0">未服务</option>
            <option value="1">已服务</option>
          </select>
        ) : onTotalTimesChange ? (
          <input
            type="number"
            min="1"
            className="w-full text-sm rounded-lg px-2 py-1.5 outline-none"
            style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            value={totalTimes}
            onChange={e => onTotalTimesChange?.(e.target.value)}
            disabled={!canEditProgress}
          />
        ) : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>}
      </div>
      {!isExperience && (
        <div className="w-28 flex-shrink-0">
          {isUnassigned ? (
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>无</span>
          ) : <input
            type="number"
            min="0"
            max={Math.max(1, Number(totalTimes) || 1)}
            className="w-full text-sm rounded-lg px-2 py-1.5 outline-none"
            style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            value={usedTimes}
            onChange={e => onUsedTimesChange?.(e.target.value)}
            disabled={!canEditProgress}
          />}
        </div>
      )}
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

type OrderModalTab = 'customer' | 'experience' | 'package';

const TABS: Array<{ key: OrderModalTab; label: string; icon: typeof UserIcon }> = [
  { key: 'customer', label: '客户信息', icon: UserIcon },
  { key: 'experience', label: '体验卡阶段', icon: TagIcon },
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

function getCustomerFollowRecords(customer: any): CustomerFollowRecord[] {
  const records = customer?.profile?.followRecords;
  return Array.isArray(records) ? sortFollowRecords(records) : [];
}

function HistoricalFollowRecords({ records }: { records: CustomerFollowRecord[] }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquareIcon size={14} style={{ color: 'var(--brand)' }} />
        <span className="text-sm font-semibold text-foreground">客户池跟进记录</span>
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>只读，共 {records.length} 条</span>
      </div>
      {records.length === 0 ? (
        <div className="text-center py-6" style={{ color: 'var(--muted-foreground)' }}>
          <MessageSquareIcon size={26} className="mx-auto mb-2 opacity-30" />
          <div className="text-sm">暂无历史跟进记录</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((record, index) => (
            <div
              key={record.id || index}
              className="grid grid-cols-[150px_120px_minmax(0,1fr)] gap-3 items-start rounded-lg px-3 py-2.5"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>记录时间</div>
                <div className="text-sm text-foreground">{displayDateTime(record.createdAt || record.date) || '—'}</div>
              </div>
              <div>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>跟进人</div>
                <div className="text-sm text-foreground">{record.followerName || record.operator || '—'}</div>
              </div>
              <div className="min-w-0">
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>跟进事项</div>
                <div className="text-sm text-foreground whitespace-pre-wrap break-words">{record.content || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ');
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nowRecordTime() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function recordTimeValue(value: unknown): number {
  const text = String(value || '').trim();
  if (!/\d{1,2}:\d{2}/.test(text)) return 0;
  const parsed = Date.parse(text.replace(' ', 'T'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasPreciseRecordTime(value: unknown): boolean {
  return recordTimeValue(value) > 0;
}

function sortFollowRecords<T extends { createdAt?: string; date?: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const byCreated = recordTimeValue(b.createdAt) - recordTimeValue(a.createdAt);
    if (byCreated !== 0) return byCreated;
    return recordTimeValue(b.date) - recordTimeValue(a.date);
  });
}

function snapshotOrderStage(
  form: OrderForm,
  id: string,
  label: string,
  type: OrderType,
  frozen = true,
): OrderStageSnapshot {
  return {
    id,
    label,
    type,
    frozenAt: frozen ? nowRecordTime() : '',
    amount: form.amount,
    payStatus: form.payStatus,
    purchaseDate: form.purchaseDate,
    serviceItems: form.serviceItems,
    serviceNote: form.serviceNote,
    servicePeople: {
      sp1: { ...form.servicePerson1 },
      sp2: { ...form.servicePerson2 },
      sp3: { ...form.servicePerson3 },
    },
    followRecords: sortFollowRecords(form.followRecords),
    totalTimes: form.totalTimes,
    usedTimes: form.usedTimes,
    contractStatus: form.contractStatus,
    contractAttachments: [...form.contractAttachments],
    servicePhotoRecords: [...form.servicePhotoRecords],
  };
}

function StageSummary({ stage }: { stage: ExperienceSnapshot | OrderStageSnapshot }) {
  const people = stage.servicePeople;
  const servicePeople = [people?.sp1, people?.sp2, people?.sp3].filter(Boolean) as ServicePerson[];
  const records = sortFollowRecords(stage.followRecords || []);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
      <span>金额：¥{stage.amount || '—'}</span>
      <span>购买时间：{stage.purchaseDate || '—'}</span>
      <span>付款状态：{payStatusDisplay(stage.payStatus)}</span>
      <span>服务进度：{stage.usedTimes ?? 0} / {stage.totalTimes || 1}</span>
      <span className="col-span-2">服务项目：{stage.serviceItems || '—'}</span>
      <span className="col-span-2">服务备注：{stage.serviceNote || '—'}</span>
      <div className="col-span-2 flex flex-col gap-1">
        <span>服务人员：</span>
        {servicePeople.map(person => (
          <span key={person.type} className="pl-3">
            {person.type}：{person.assign || '无'}
            {person.assign && person.assign !== '待分配' && person.assign !== '无'
              ? `（${person.usedTimes || 0} / ${person.totalTimes || stage.totalTimes || 1}）`
              : ''}
          </span>
        ))}
      </div>
      <span>合同附件：{stage.contractAttachments?.length || 0} 个</span>
      <span>历史照片记录：{stage.servicePhotoRecords?.length || 0} 次</span>
      <div className="col-span-2 flex flex-col gap-2">
        <span>跟进记录：{records.length} 条</span>
        {records.map((record, index) => (
          <div
            key={record.id || `${record.createdAt || record.date}-${index}`}
            className="rounded-lg p-3"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span style={{ color: 'var(--brand)' }}>{record.createdAt || record.date || '—'}</span>
              <span className={`badge ${FOLLOW_STATUS_COLORS[record.status] ?? 'badge-gray'}`}>{record.status}</span>
              <span>跟进人员：{record.followerName || record.operator || '—'}</span>
            </div>
            <div className="mt-1">事项：{record.content || '—'}</div>
            {record.feedback && <div className="mt-1">反馈：{record.feedback}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AmountStage {
  key: string;
  label: string;
  amount: number;
  purchaseDate: string;
}

function getOrderAmountStages(order: any): AmountStage[] {
  const people = order?.servicePeople && typeof order.servicePeople === 'object'
    ? order.servicePeople as Record<string, any>
    : {};
  const result: AmountStage[] = [];
  const experienceSnapshot = people.experienceSnapshot as ExperienceSnapshot | undefined;
  const packageHistory = ensureArray<OrderStageSnapshot>(people.packageHistory);

  if (experienceSnapshot) {
    result.push({
      key: 'experience',
      label: '体验卡',
      amount: Number(experienceSnapshot.amount) || 0,
      purchaseDate: experienceSnapshot.purchaseDate || '',
    });
  } else if (order?.type === '体验卡') {
    result.push({
      key: 'experience',
      label: '体验卡',
      amount: Number(order.amount) || 0,
      purchaseDate: order.purchaseDate || order.createdAt || '',
    });
  }

  packageHistory
    .map((stage, index) => {
      const matchedNumber = Number(String(stage.id || stage.label || '').match(/\d+/)?.[0]);
      const packageNumber = matchedNumber > 0 ? matchedNumber : index + 1;
      return { stage, packageNumber };
    })
    .sort((a, b) => a.packageNumber - b.packageNumber)
    .forEach(({ stage, packageNumber }) => {
      result.push({
        key: `package-${packageNumber}`,
        label: `套餐${packageNumber}`,
        amount: Number(stage.amount) || 0,
        purchaseDate: stage.purchaseDate || '',
      });
    });

  if (order?.type === '套餐') {
    const activePackageNumber = Math.max(1, Number(people.activePackageNumber) || packageHistory.length + 1);
    const currentKey = `package-${activePackageNumber}`;
    const currentStage: AmountStage = {
      key: currentKey,
      label: `套餐${activePackageNumber}`,
      amount: Number(order.amount) || 0,
      purchaseDate: order.purchaseDate || order.createdAt || '',
    };
    const existingIndex = result.findIndex(stage => stage.key === currentKey);
    if (existingIndex >= 0) result[existingIndex] = currentStage;
    else result.push(currentStage);
  }

  const stages = result.length > 0
    ? result
    : [{ key: 'current', label: '金额', amount: Number(order?.amount) || 0, purchaseDate: order?.purchaseDate || order?.createdAt || '' }];
  const projection = order?.purchaseRangeProjection;
  if (!projection?.active) return stages;
  const visibleKeys = new Set(ensureArray<string>(projection.visibleStageKeys));
  return stages.filter(stage => visibleKeys.has(stage.key));
}

function openAttachment(att: OrderAttachment) {
  const src = attachmentSrc(att);
  if (!src) return;
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('浏览器已拦截新窗口');
    return;
  }
  if (att.type?.startsWith('image/')) {
    win.document.write(`<img src="${src}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`);
  } else {
    win.document.write(`<iframe src="${src}" style="width:100%;height:100vh;border:0;"></iframe>`);
  }
}

function attachmentSrc(att: OrderAttachment | undefined) {
  return att?.url || att?.dataUrl || '';
}

function formFromOrder(order: any): OrderForm {
  const orderId = order?.id || '';
  const customer = order?.customerSnapshot || {};
  const customerProfile = customer?.profile && typeof customer.profile === 'object'
    ? customer.profile as Record<string, unknown>
    : {};
  const customerAge = Number(customerProfile.age) || 0;
  const orderPeople = order?.servicePeople || {};
  const savedTherapists = orderTherapistMap.get(orderId) || (orderPeople?.sp1 || orderPeople?.sp2 || orderPeople?.sp3 ? orderPeople : null);
  const persistedFollowRecords = Array.isArray(orderPeople?.followRecords) ? orderPeople.followRecords : getFollowRecords(orderId);
  const experienceSnapshot = orderPeople?.experienceSnapshot || null;
  const packageHistory = ensureArray<OrderStageSnapshot>(orderPeople?.packageHistory);
  const canonicalCustomerTag = customer.tag || order?.tag || orderPeople?.upgradeCustomerTag || '';
  const savedFollowRecords: FollowRecord[] = sortFollowRecords<FollowRecord>(persistedFollowRecords.map((r: any) => ({
    id: r.id,
    date: r.date,
    content: r.content,
    feedback: r.feedback || '',
    status: r.status || '待跟进',
    operator: r.operator || r.followerName || '',
    followerId: r.followerId || '',
    followerName: r.followerName || r.operator || '',
    createdAt: hasPreciseRecordTime(r.createdAt) ? r.createdAt : '',
  })));
  const latestOpenRecord = savedFollowRecords.find((r: any) => r.status !== '已完成');
  return {
    customerId: order?.internalCustomerId || order?.customerId || order?.resolvedCustomerId || order?.customerCode || '',
    customerName: customer.name || order?.customerName || '',
    customerWechat: customer.wechat || '',
    customerPhone: customer.phone || order?.customerPhone || '',
    customerArea: (customer.area || order?.area) && (customer.area || order?.area) !== '—' ? (customer.area || order?.area) : '',
    customerSource: customer.source || '',
    customerAcquiredAt: customer.acquiredAt || order?.createdAt || '',
    customerTag: TAG_DEFS.some(definition => definition.tag === canonicalCustomerTag)
      ? canonicalCustomerTag as CustomerTag
      : '',
    customerAdvisor: (customer.advisor || order?.advisor) && (customer.advisor || order?.advisor) !== '—' ? (customer.advisor || order?.advisor) : '',
    customerFollowStatus: customer.followStatus || '待跟进',
    customerFollowDate: customer.followDate || '',
    customerIntendedProduct: customer.intendedProduct || '',
    customerSituation: customer.situation || '',
    customerRemark: customer.remark || '',
    customerBirthYear: customerAge > 0 ? String(new Date().getFullYear() - customerAge) : '',
    customerDeliveryDate: String(customerProfile.deliveryDate || ''),
    customerBabyCount: Number(customerProfile.babyCount) > 0 ? String(customerProfile.babyCount) : '',
    customerDeliveryType: (customerProfile.deliveryType || '未知') as OrderForm['customerDeliveryType'],
    customerFeedingType: (customerProfile.feedingType || '未知') as OrderForm['customerFeedingType'],
    customerFollowTask: String(customerProfile.followTask || ''),
    customerProfile,
    orderType: order?.type || '',
    amount: order?.amount != null ? String(order.amount) : '',
    payStatus: payStatusToForm(effectiveOrderPayStatus(order)),
    purchaseDate: order?.purchaseDate || order?.createdAt || new Date().toISOString().slice(0, 10),
    totalTimes: String(order?.totalTimes || 1),
    usedTimes: Number(order?.usedTimes || 0),
    experienceUpgradeStatus: order?.isUpgrade ? '已升单' : (order?.type === '体验卡' && Number(order?.usedTimes || 0) >= Number(order?.totalTimes || 1) ? '未升单' : ''),
    experienceSnapshot,
    upgradeCustomerTag: TAG_DEFS.some(definition => definition.tag === canonicalCustomerTag)
      ? canonicalCustomerTag as CustomerTag
      : '',
    packageHistory,
    activePackageNumber: Math.max(1, Number(orderPeople?.activePackageNumber) || (packageHistory.length + 1)),
    contractStatus: getContractStatus(order),
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
    newFollowDate: latestOpenRecord?.date || '',
    newFollowStatus: latestOpenRecord?.status || '待跟进',
    newFollowContent: latestOpenRecord?.content || '',
    newFollowFeedback: '',
    newFollowFollowerId: latestOpenRecord?.followerId || '',
    newFollowFollowerName: latestOpenRecord?.followerName || latestOpenRecord?.operator || '',
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
        <div className="text-sm font-semibold text-foreground mb-3">客户需求</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {([
            ['意向产品', profileValue(c.intendedProduct || form.customerIntendedProduct)],
            ['客户需求及痛点', profileValue(c.situation || form.customerSituation)],
            ['备注', profileValue(c.remark || form.customerRemark)],
          ] as [string, string][]).map(([key, value]) => (
            <div key={key} className={key === '意向产品' ? 'flex items-start gap-3' : 'col-span-2 flex items-start gap-3'}>
              <span className="text-xs w-24 flex-shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{key}</span>
              <span className="text-sm font-medium text-foreground whitespace-pre-wrap break-words">{value}</span>
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

      <HistoricalFollowRecords records={followRecords} />
    </div>
  );
}

function OrderModal({ visible, onClose, mode = 'create', order = null, editOrderId = '' }: OrderModalProps) {
  const orderMutations = useOrderMutations();
  const { currentUser, setActivePage } = useApp();
  const canChooseFollower = currentUser.role === 'superadmin' || currentUser.role === 'admin';
  const canChooseAdvisor = canChooseFollower;
  const canDeleteOrder = canChooseFollower && mode === 'edit';
  const canEditServiceProgress = canChooseFollower && mode !== 'view';
  const usersQuery = useSystemUsers(canChooseFollower);
  const followerOptions = canChooseFollower
    ? (usersQuery.data?.data ?? [])
      .filter(u => u.status === 'active' && (u.role === 'superadmin' || u.role === 'admin' || u.role === 'service'))
      .map(u => ({ id: u.id, name: u.name }))
    : [{ id: currentUser.id, name: currentUser.name }];
  const advisorOptions = canChooseAdvisor
    ? (usersQuery.data?.data ?? [])
      .filter(u => u.status === 'active' && (u.role === 'superadmin' || u.role === 'admin' || u.role === 'service'))
      .map(u => ({ id: u.id, name: u.name }))
    : [{ id: currentUser.id, name: currentUser.name }];
  const defaultFollower = followerOptions.find(u => u.id === currentUser.id) ?? followerOptions[0] ?? { id: currentUser.id, name: currentUser.name };
  const [activeTab, setActiveTab] = useState<OrderModalTab>('customer');
  const [form, setForm] = useState<OrderForm>(initForm());
  const [isManualProgressDirty, setIsManualProgressDirty] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showUpgradeConfirmation, setShowUpgradeConfirmation] = useState(false);
  const [showPackageUpgradeConfirmation, setShowPackageUpgradeConfirmation] = useState(false);
  const [packageStageToDelete, setPackageStageToDelete] = useState<number | null>(null);
  const [isDeletingPackageStage, setIsDeletingPackageStage] = useState(false);
  const [pendingUpgradeTag, setPendingUpgradeTag] = useState<CustomerTag | ''>('');
  const [isEditingExperienceSnapshot, setIsEditingExperienceSnapshot] = useState(false);
  const contractFileRef = useRef<HTMLInputElement>(null);
  const servicePhotoFileRef = useRef<HTMLInputElement>(null);
  const isEdit = mode === 'edit';
  const isView = mode === 'view';
  const customerQuery = useCustomer(mode === 'create' ? (form.customerId || null) : null);
  const fullCustomer = customerQuery.data as any;
  const appointmentsQuery = useAppointments({
    page: 1,
    pageSize: 1000,
    customerId: form.customerId || '__none__',
  });
  const serviceRecordsQuery = useServiceRecords({
    page: 1,
    pageSize: 1000,
    customerId: form.customerId || '__none__',
  });
  const serviceRecordMutations = useServiceRecordMutations();
  const [uploadingRecordId, setUploadingRecordId] = useState('');
  const customerAppointments = appointmentsQuery.data?.data ?? [];
  const serviceRecords = serviceRecordsQuery.data?.data ?? [];
  const nextAppointment = [...customerAppointments]
    .filter(item => item.status !== '已完成' && item.status !== '已取消')
    .sort((a, b) => `${a.date} ${a.timeSlot}`.localeCompare(`${b.date} ${b.timeSlot}`))[0];

  function goToAppointmentCalendar() {
    sessionStorage.setItem('weikebenyuan:appointment-prefill', JSON.stringify({
      customerId: form.customerId,
      customerName: form.customerName,
      therapistNames: [form.servicePerson1.assign, form.servicePerson2.assign, form.servicePerson3.assign]
        .filter(name => name && name !== '待分配' && name !== '无'),
    }));
    onClose();
    setActivePage('appointments-calendar');
  }

  async function uploadServiceRecordPhotos(recordId: string, currentPhotos: unknown[], files: FileList | null) {
    if (!files?.length) return;
    const valid = Array.from(files).filter(file => file.type === 'image/png' || file.type === 'image/jpeg');
    const remaining = Math.max(0, 10 - currentPhotos.length);
    if (valid.length === 0 || remaining === 0) {
      toast.error(remaining === 0 ? '本次服务最多保留 10 张照片' : '仅支持 PNG/JPG 图片');
      return;
    }
    setUploadingRecordId(recordId);
    try {
      const uploaded = await uploadsApi.files(valid.slice(0, remaining), 'service-records');
      await serviceRecordMutations.update({
        id: recordId,
        body: { photos: [...currentPhotos, ...uploaded.data] },
      });
      toast.success('服务照片已保存');
    } catch (error: any) {
      toast.error(error?.message || '服务照片上传失败');
    } finally {
      setUploadingRecordId('');
    }
  }

  useEffect(() => {
    if (!visible) {
      setActiveTab('customer');
      setForm(initForm());
      setIsManualProgressDirty(false);
      setShowPicker(false);
      setShowUpgradeConfirmation(false);
      setShowPackageUpgradeConfirmation(false);
      setPendingUpgradeTag('');
      setIsEditingExperienceSnapshot(false);
      return;
    }
    setActiveTab('customer');
    setShowPicker(false);
    setShowUpgradeConfirmation(false);
    setShowPackageUpgradeConfirmation(false);
    setPendingUpgradeTag('');
    setIsEditingExperienceSnapshot(false);
    const nextForm = order && mode !== 'create' ? formFromOrder(order) : initForm();
    nextForm.newFollowFollowerId = nextForm.newFollowFollowerId || defaultFollower.id;
    nextForm.newFollowFollowerName = nextForm.newFollowFollowerName || defaultFollower.name;
    setForm(nextForm);
    setIsManualProgressDirty(false);
  }, [visible, mode, editOrderId, order]);

  function set<K extends keyof OrderForm>(key: K, val: OrderForm[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function setCustomerTag(tag: CustomerTag | '') {
    setForm(prev => ({
      ...prev,
      customerTag: tag,
      // Keep the legacy stage field synchronized while persisted old orders still contain it.
      upgradeCustomerTag: tag,
    }));
    setShowUpgradeConfirmation(false);
  }

  function handleCustomerSelect(c: Customer) {
    const customer = c as any;
    const profile = customer.profile && typeof customer.profile === 'object'
      ? customer.profile as Record<string, unknown>
      : {};
    const age = Number(profile.age) || 0;
    setForm(prev => ({
      ...prev,
      customerId: c.id,
      customerName: c.name,
      customerWechat: c.wechat || '',
      customerPhone: c.phone,
      customerArea: c.area,
      customerSource: c.source || '',
      customerAcquiredAt: c.acquiredAt || '',
      customerTag: c.tag,
      upgradeCustomerTag: c.tag,
      customerAdvisor: c.advisor,
      customerFollowStatus: c.followStatus || '待跟进',
      customerFollowDate: c.followDate || '',
      customerIntendedProduct: c.intendedProduct || '',
      customerSituation: c.situation || '',
      customerRemark: c.remark || '',
      customerBirthYear: age > 0 ? String(new Date().getFullYear() - age) : '',
      customerDeliveryDate: String(profile.deliveryDate || ''),
      customerBabyCount: Number(profile.babyCount) > 0 ? String(profile.babyCount) : '',
      customerDeliveryType: (profile.deliveryType || '未知') as OrderForm['customerDeliveryType'],
      customerFeedingType: (profile.feedingType || '未知') as OrderForm['customerFeedingType'],
      customerFollowTask: String(profile.followTask || ''),
      customerProfile: profile,
    }));
  }

  function handleAddFollow() {
    if (!form.newFollowContent.trim() && !form.newFollowFeedback.trim()) return;
    const follower = followerOptions.find(u => u.id === form.newFollowFollowerId) ?? defaultFollower;
    const rec: FollowRecord = {
      id: `fr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: form.newFollowDate || new Date().toISOString().slice(0, 10),
      content: form.newFollowContent.trim(),
      feedback: form.newFollowFeedback.trim(),
      status: form.newFollowStatus,
      operator: follower.name,
      followerId: follower.id,
      followerName: follower.name,
      createdAt: nowRecordTime(),
    };
    const nextRecords = sortFollowRecords([rec, ...form.followRecords]);
    setForm(prev => ({
      ...prev,
      followRecords: nextRecords,
      // Keep the current task as the next draft, but clear one-off feedback so every save
      // creates a new immutable interaction record.
      newFollowDate: rec.status === '已完成' ? '' : rec.date,
      newFollowStatus: rec.status === '已完成' ? '待跟进' : rec.status,
      newFollowContent: rec.status === '已完成' ? '' : rec.content,
      newFollowFeedback: '',
      newFollowFollowerId: follower.id,
      newFollowFollowerName: follower.name,
    }));
  }

  const isExperienceOrder = form.orderType === '体验卡' || order?.type === '体验卡' || Boolean(form.experienceSnapshot) || Boolean(order?.isUpgrade);
  const currentExperienceServiceComplete = form.orderType === '体验卡' && isExperienceServiceComplete(form);
  const isCompletedExperience = isExperienceOrder && (
    Boolean(form.experienceSnapshot) ||
    currentExperienceServiceComplete ||
    (order?.type === '体验卡' && Number(order?.usedTimes || 0) >= Number(order?.totalTimes || 1))
  );
  const canChoosePackage = !isExperienceOrder || form.experienceUpgradeStatus === '已升单';
  const isExperienceFrozen = isCompletedExperience
    && form.experienceUpgradeStatus === '已升单'
    && form.orderType === '体验卡'
    && !canChooseFollower;
  const selectableCustomerTagDefs = form.experienceUpgradeStatus === '已升单' || form.orderType === '套餐'
    ? TAG_DEFS
    : PRE_UPGRADE_TAG_DEFS;
  const isActiveStageTab = (
    activeTab === 'experience' && form.orderType === '体验卡'
  ) || (
    activeTab === 'package' && form.orderType === '套餐'
  );
  const packageStageNumbers = Array.from(new Set([
    ...form.packageHistory.map(stage => (
      Math.max(1, Number(String(stage.id || stage.label).match(/\d+/)?.[0]) || 1)
    )),
    ...(form.orderType === '套餐' ? [Math.max(1, form.activePackageNumber)] : [1]),
  ])).sort((a, b) => a - b);
  const latestPackageNumber = Math.max(...packageStageNumbers);
  const canAddNextPackage = isEdit
    && !isView
    && form.orderType === '套餐'
    && form.activePackageNumber === latestPackageNumber
    && (Boolean(form.experienceSnapshot) || Boolean(order?.isUpgrade));
  const visibleTabs: Array<{
    id: string;
    key: OrderModalTab;
    label: string;
    icon: typeof UserIcon;
    packageNumber?: number;
    disabled?: boolean;
  }> = [
    ...TABS.map(tab => ({ id: tab.key, ...tab })),
    ...packageStageNumbers.map(packageNumber => ({
      id: `package-${packageNumber}`,
      key: 'package' as const,
      label: `套餐${packageNumber}阶段`,
      icon: FileTextIcon,
      packageNumber,
      disabled: !canChoosePackage,
    })),
  ];
  const activeVisibleTabId = activeTab === 'package'
    ? `package-${Math.max(1, form.activePackageNumber)}`
    : activeTab;

  function openVisibleTab(tab: typeof visibleTabs[number]) {
    if (tab.disabled) return;
    if (tab.key !== 'package' || !tab.packageNumber) {
      setActiveTab(tab.key);
      return;
    }
    const targetStage = form.packageHistory.find(stage => (
      Math.max(1, Number(String(stage.id || stage.label).match(/\d+/)?.[0]) || 1) === tab.packageNumber
    ));
    if (tab.packageNumber !== form.activePackageNumber && targetStage && !targetStage.frozenAt) {
      switchToPackageStage(targetStage);
    }
    setActiveTab('package');
  }

  function setExperienceUpgradeStatus(status: '' | '未升单' | '已升单', targetTag: CustomerTag | '' = '') {
    setForm(prev => {
      const nextTag = status === '已升单' ? targetTag : prev.customerTag;
      const snapshot = status === '已升单' && !prev.experienceSnapshot
        ? snapshotOrderStage(prev, 'experience', '体验卡阶段', '体验卡')
        : prev.experienceSnapshot;
      if (status !== '已升单') {
        return { ...prev, experienceUpgradeStatus: status, experienceSnapshot: snapshot };
      }
      return {
        ...prev,
        experienceUpgradeStatus: status,
        experienceSnapshot: snapshot,
        customerTag: nextTag,
        upgradeCustomerTag: nextTag,
        orderType: '套餐',
        amount: '',
        payStatus: '待支付',
        purchaseDate: new Date().toISOString().slice(0, 10),
        totalTimes: '1',
        usedTimes: 0,
        contractStatus: '未回签',
        serviceItems: '',
        serviceNote: '',
        contractAttachments: [],
        servicePhotoRecords: [],
        servicePerson1: { type: '产康师', assign: '待分配' },
        servicePerson2: { type: '运动康复师', assign: '待分配' },
        servicePerson3: { type: '调理师', assign: '待分配' },
        followRecords: [],
        newFollowDate: '',
        newFollowStatus: '待跟进',
        newFollowContent: '',
        newFollowFeedback: '',
      };
    });
    if (status === '已升单') {
      setIsManualProgressDirty(false);
      setShowUpgradeConfirmation(false);
      setPendingUpgradeTag('');
      toast.success('体验卡阶段已固化，套餐1阶段已开启');
    }
  }

  function updateExperienceSnapshot(patch: Partial<ExperienceSnapshot>) {
    setForm(prev => prev.experienceSnapshot
      ? { ...prev, experienceSnapshot: { ...prev.experienceSnapshot, ...patch } }
      : prev);
  }

  function updateExperienceSnapshotPerson(key: 'sp1' | 'sp2' | 'sp3', person: ServicePerson) {
    setForm(prev => {
      if (!prev.experienceSnapshot) return prev;
      const people = {
        ...prev.experienceSnapshot.servicePeople,
        [key]: person,
      };
      return {
        ...prev,
        experienceSnapshot: {
          ...prev.experienceSnapshot,
          servicePeople: people,
          usedTimes: experienceOverallUsedTimes(people.sp1, people.sp2, people.sp3),
        },
      };
    });
  }

  function confirmNextPackage() {
    const completedPackageNumber = form.activePackageNumber;
    const currentPackageComplete = isPackageServiceComplete(form);
    setForm(prev => {
      if (prev.orderType !== '套餐') return prev;
      const currentPackageNumber = Math.max(1, prev.activePackageNumber);
      const currentPackageId = `package-${currentPackageNumber}`;
      const currentPackage = snapshotOrderStage(
        prev,
        currentPackageId,
        `套餐${currentPackageNumber}`,
        '套餐',
        isPackageServiceComplete(prev),
      );
      return {
        ...prev,
        packageHistory: [
          ...prev.packageHistory.filter(stage => stage.id !== currentPackageId),
          currentPackage,
        ],
        activePackageNumber: currentPackageNumber + 1,
        amount: '',
        payStatus: '待支付',
        purchaseDate: new Date().toISOString().slice(0, 10),
        totalTimes: '1',
        usedTimes: 0,
        contractStatus: '未回签',
        serviceItems: '',
        serviceNote: '',
        contractAttachments: [],
        servicePhotoRecords: [],
        servicePerson1: { type: '产康师', assign: '待分配' },
        servicePerson2: { type: '运动康复师', assign: '待分配' },
        servicePerson3: { type: '调理师', assign: '待分配' },
        followRecords: [],
        newFollowDate: '',
        newFollowStatus: '待跟进',
        newFollowContent: '',
        newFollowFeedback: '',
      };
    });
    setShowPackageUpgradeConfirmation(false);
    setIsManualProgressDirty(false);
    toast.success(currentPackageComplete
      ? `套餐${completedPackageNumber}已固化为记录，套餐${completedPackageNumber + 1}已生成`
      : `套餐${completedPackageNumber + 1}已生成，套餐${completedPackageNumber}保留为进行中`);
  }

  function switchToPackageStage(stage: OrderStageSnapshot) {
    if (stage.frozenAt) return;
    setForm(prev => {
      const currentPackageNumber = Math.max(1, prev.activePackageNumber);
      const currentPackageId = `package-${currentPackageNumber}`;
      const currentPackage = snapshotOrderStage(
        prev,
        currentPackageId,
        `套餐${currentPackageNumber}`,
        '套餐',
        isPackageServiceComplete(prev),
      );
      const nextHistory = [
        ...prev.packageHistory.filter(item => item.id !== stage.id && item.id !== currentPackageId),
        currentPackage,
      ];
      const targetNumber = Math.max(1, Number(String(stage.id || stage.label).match(/\d+/)?.[0]) || 1);
      return {
        ...prev,
        packageHistory: nextHistory,
        activePackageNumber: targetNumber,
        amount: stage.amount,
        payStatus: stage.payStatus,
        purchaseDate: stage.purchaseDate,
        totalTimes: String(stage.totalTimes || 1),
        usedTimes: Number(stage.usedTimes || 0),
        contractStatus: stage.contractStatus || '未回签',
        serviceItems: stage.serviceItems,
        serviceNote: stage.serviceNote,
        contractAttachments: [...(stage.contractAttachments || [])],
        servicePhotoRecords: [...(stage.servicePhotoRecords || [])],
        servicePerson1: { ...stage.servicePeople.sp1 },
        servicePerson2: { ...stage.servicePeople.sp2 },
        servicePerson3: { ...stage.servicePeople.sp3 },
        followRecords: sortFollowRecords(stage.followRecords || []),
        newFollowDate: '',
        newFollowStatus: '待跟进',
        newFollowContent: '',
        newFollowFeedback: '',
      };
    });
    setShowPackageUpgradeConfirmation(false);
    setIsManualProgressDirty(false);
  }

  function packageNumberForStage(stage: OrderStageSnapshot): number {
    return Math.max(1, Number(String(stage.id || stage.label).match(/\d+/)?.[0]) || 1);
  }

  function restorePackageStage(
    sourceForm: OrderForm,
    stage: OrderStageSnapshot,
    packageHistory: OrderStageSnapshot[],
  ): OrderForm {
    return {
      ...sourceForm,
      packageHistory,
      activePackageNumber: packageNumberForStage(stage),
      amount: stage.amount,
      payStatus: stage.payStatus,
      purchaseDate: stage.purchaseDate,
      totalTimes: String(stage.totalTimes || 1),
      usedTimes: Number(stage.usedTimes || 0),
      contractStatus: stage.contractStatus || '未回签',
      serviceItems: stage.serviceItems,
      serviceNote: stage.serviceNote,
      contractAttachments: [...(stage.contractAttachments || [])],
      servicePhotoRecords: [...(stage.servicePhotoRecords || [])],
      servicePerson1: { ...stage.servicePeople.sp1 },
      servicePerson2: { ...stage.servicePeople.sp2 },
      servicePerson3: { ...stage.servicePeople.sp3 },
      followRecords: sortFollowRecords(stage.followRecords || []),
      newFollowDate: '',
      newFollowStatus: '待跟进',
      newFollowContent: '',
      newFollowFeedback: '',
    };
  }

  async function confirmDeletePackageStage() {
    const packageNumber = packageStageToDelete;
    if (!canDeleteOrder || !editOrderId || !packageNumber || packageNumber <= 1) return;

    setIsDeletingPackageStage(true);
    try {
      const retainedHistory = form.packageHistory.filter(
        stage => packageNumberForStage(stage) !== packageNumber,
      );
      let nextForm: OrderForm;

      if (form.activePackageNumber !== packageNumber) {
        nextForm = { ...form, packageHistory: retainedHistory };
      } else {
        const fallbackStage = [...retainedHistory]
          .sort((a, b) => packageNumberForStage(b) - packageNumberForStage(a))[0];
        if (!fallbackStage) {
          throw new Error('套餐1为基础阶段，无法删除');
        }
        nextForm = restorePackageStage(
          form,
          fallbackStage,
          retainedHistory.filter(stage => stage.id !== fallbackStage.id),
        );
      }

      const { body } = buildOrderWritePayload(nextForm, true);
      await orderMutations.update({ id: editOrderId, body });
      setForm(nextForm);
      setActiveTab('package');
      setPackageStageToDelete(null);
      setIsManualProgressDirty(false);
      toast.success(`套餐${packageNumber}阶段已删除`);
    } catch (error: any) {
      toast.error(error?.message || `套餐${packageNumber}阶段删除失败`);
    } finally {
      setIsDeletingPackageStage(false);
    }
  }

  async function handleContractFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    const valid = selected.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
    if (valid.length !== selected.length) toast.error('合同附件仅支持 PDF 或图片格式');
    if (valid.length === 0) return;
    try {
      const uploaded = await uploadsApi.files(valid, 'contracts');
      set('contractAttachments', [...form.contractAttachments, ...uploaded.data]);
      toast.success('上传成功');
    } catch (error: any) {
      toast.error(error?.message || '上传失败');
    } finally {
      if (contractFileRef.current) contractFileRef.current.value = '';
    }
  }

  async function handleServicePhotoFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    const valid = selected.filter(f => f.type === 'image/png' || f.type === 'image/jpeg');
    if (valid.length !== selected.length) toast.error('服务照片仅支持 PNG、JPG 格式');
    const remaining = Math.max(0, 10 - form.newPhotoFiles.length);
    if (valid.length > remaining) toast.error('每次服务最多上传 10 张图片');
    if (valid.length === 0 || remaining === 0) return;
    try {
      const uploaded = await uploadsApi.files(valid.slice(0, remaining), 'service-photos');
      set('newPhotoFiles', [...form.newPhotoFiles, ...uploaded.data]);
      toast.success('上传成功');
    } catch (error: any) {
      toast.error(error?.message || '上传失败');
    } finally {
      if (servicePhotoFileRef.current) servicePhotoFileRef.current.value = '';
    }
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

  function buildOrderWritePayload(sourceForm: OrderForm, manualProgressEdit: boolean) {
    const oid = editOrderId || `ORDER-${Date.now()}`;
    const followRecords: OrderFollowRecord[] = sortFollowRecords(sourceForm.followRecords).map((record, index) => ({
      id: record.id || `fr-${oid}-${index}`,
      date: record.date,
      content: record.content,
      feedback: record.feedback || '',
      status: record.status || '待跟进',
      operator: record.operator,
      followerId: record.followerId,
      followerName: record.followerName || record.operator,
      createdAt: hasPreciseRecordTime(record.createdAt) ? record.createdAt : '',
    }));
    const payStatus = (
      sourceForm.payStatus === '已支付'
        ? '已付款'
        : sourceForm.payStatus === '待支付'
          ? '待付款'
          : sourceForm.payStatus
    ) as any;
    const body: any = {
      customerId: sourceForm.customerId,
      customerName: sourceForm.customerName,
      customerWechat: sourceForm.customerWechat,
      customerPhone: sourceForm.customerPhone,
      customerArea: sourceForm.customerArea,
      customerSource: sourceForm.customerSource,
      customerAcquiredAt: sourceForm.customerAcquiredAt,
      customerTag: sourceForm.customerTag,
      customerAdvisor: sourceForm.customerAdvisor,
      customerFollowStatus: sourceForm.customerFollowStatus,
      customerFollowDate: sourceForm.customerFollowDate,
      customerIntendedProduct: sourceForm.customerIntendedProduct,
      customerSituation: sourceForm.customerSituation,
      customerRemark: sourceForm.customerRemark,
      customerProfile: {
        ...sourceForm.customerProfile,
        age: Number(sourceForm.customerBirthYear) > 1900
          ? Math.max(0, new Date().getFullYear() - Number(sourceForm.customerBirthYear))
          : 0,
        deliveryDate: sourceForm.customerDeliveryDate,
        deliveryType: sourceForm.customerDeliveryType,
        babyCount: Number(sourceForm.customerBabyCount) || 0,
        feedingType: sourceForm.customerFeedingType,
        followTask: sourceForm.customerFollowTask,
      },
      type: sourceForm.orderType || '体验卡',
      amount: Number(sourceForm.amount) || 0,
      payStatus,
      purchaseDate: sourceForm.purchaseDate,
      serviceItems: sourceForm.serviceItems,
      totalTimes: sourceForm.orderType === '套餐' || order?.isUpgrade
        ? Math.max(1, Number(sourceForm.totalTimes) || 1)
        : 1,
      usedTimes: sourceForm.usedTimes,
      manualProgressEdit,
      isUpgrade: sourceForm.experienceUpgradeStatus === '已升单',
      contractSigned: sourceForm.contractStatus !== '无' && sourceForm.contractStatus !== '未回签',
      serviceItemCount: Math.max(1, splitServiceItems(sourceForm.serviceItems).length),
      servicePeople: {
        sp1: sourceForm.servicePerson1,
        sp2: sourceForm.servicePerson2,
        sp3: sourceForm.servicePerson3,
        followRecords,
        experienceSnapshot: sourceForm.experienceSnapshot,
        packageHistory: sourceForm.packageHistory,
        activePackageNumber: sourceForm.activePackageNumber,
        upgradeCustomerTag: sourceForm.customerTag,
      },
      appointmentTime: sourceForm.appointmentTime,
      serviceNote: sourceForm.serviceNote,
      contractAttachments: sourceForm.contractAttachments,
      servicePhotoRecords: sourceForm.servicePhotoRecords,
    };
    return { body, followRecords, oid };
  }

  async function handleSave() {
    if (isView) return;
    if (form.orderType === '体验卡' && form.experienceUpgradeStatus !== '已升单'
      && form.customerTag && UPGRADE_TAGS.has(form.customerTag)) {
      toast.error('未升单客户请选择 A2 以下（不含 A2）的客户标签');
      setActiveTab('experience');
      return;
    }
    if (form.experienceUpgradeStatus === '已升单' && !form.customerTag) {
      toast.error('请选择客户标签');
      setActiveTab('experience');
      return;
    }
    const { body: orderBody, followRecords: newRecords, oid } = buildOrderWritePayload(
      form,
      isManualProgressDirty,
    );
    orderTherapistMap.set(oid, {
      sp1: form.servicePerson1,
      sp2: form.servicePerson2,
      sp3: form.servicePerson3,
    });
    if (newRecords.length > 0) {
      orderFollowMap.set(oid, newRecords);
      orderFollowTaskMap.set(oid, newRecords[0].content);
    }
    if (form.orderType === '套餐') {
      orderContractMap.set(oid, form.contractStatus === '无' ? '未回签' : form.contractStatus);
    }
    orderServiceItemsMap.set(oid, form.serviceItems);
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

  async function handleDelete() {
    if (!canDeleteOrder || !editOrderId) return;
    if (!window.confirm('确认删除该订单吗？删除后无法恢复。')) return;
    try {
      await orderMutations.remove(editOrderId);
      toast.success('订单已删除');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || '删除失败');
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
          <div className="relative bg-card rounded-2xl shadow-custom flex flex-col" style={{ width: 700, maxHeight: '92vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-semibold text-base text-foreground">{isView ? '查看订单' : isEdit ? '编辑订单' : '新建订单'}</span>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-muted"><XIcon size={16} /></button>
            </div>

            {/* Tabs */}
            <div className="flex px-6 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              {visibleTabs.map(tab => {
                const Icon = tab.icon;
                const active = activeVisibleTabId === tab.id;
                const tabButton = (
                  <button
                    key={tab.id}
                    disabled={tab.disabled}
                    onClick={() => openVisibleTab(tab)}
                    className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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
                if (tab.key !== 'package' || !tab.packageNumber || tab.packageNumber <= 1 || !canDeleteOrder) {
                  return tabButton;
                }
                return (
                  <div key={tab.id} className="flex shrink-0 items-center">
                    {tabButton}
                    <button
                      type="button"
                      title={`删除套餐${tab.packageNumber}阶段`}
                      aria-label={`删除套餐${tab.packageNumber}阶段`}
                      onClick={() => setPackageStageToDelete(tab.packageNumber || null)}
                      className="mr-1 flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-red-50"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2Icon size={14} />
                    </button>
                  </div>
                );
              })}
              {canAddNextPackage && (
                <button
                  type="button"
                  onClick={() => setShowPackageUpgradeConfirmation(true)}
                  className="flex shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
                  style={{
                    color: 'var(--brand)',
                    borderBottom: '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  <PlusIcon size={14} />
                  新增套餐{form.activePackageNumber + 1}阶段
                </button>
              )}
            </div>

            {showPackageUpgradeConfirmation && form.orderType === '套餐' && !isView && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl"
                style={{ background: 'rgba(15, 23, 42, 0.36)' }}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="package-upgrade-dialog-title"
                  className="w-[420px] max-w-[calc(100%-32px)] rounded-xl bg-card p-5 shadow-custom"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div id="package-upgrade-dialog-title" className="text-base font-semibold text-foreground">
                    确认新增套餐{form.activePackageNumber + 1}阶段
                  </div>
                  <div className="mt-2 text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>
                    {isPackageServiceComplete(form)
                      ? `套餐${form.activePackageNumber}服务已全部完成，新增套餐${form.activePackageNumber + 1}后，套餐${form.activePackageNumber}将作为已完成记录保留。`
                      : `套餐${form.activePackageNumber}服务尚未全部完成。新增套餐${form.activePackageNumber + 1}不会结束当前套餐；两个套餐将作为独立阶段，可分别切换和维护。`}
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPackageUpgradeConfirmation(false)}
                      className="px-4 py-2 rounded-lg text-sm border"
                      style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={confirmNextPackage}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'var(--brand)' }}
                    >
                      确认创建
                    </button>
                  </div>
                </div>
              </div>
            )}

            {packageStageToDelete !== null && form.orderType === '套餐' && canDeleteOrder && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl"
                style={{ background: 'rgba(15, 23, 42, 0.36)' }}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="package-delete-dialog-title"
                  className="w-[420px] max-w-[calc(100%-32px)] rounded-xl bg-card p-5 shadow-custom"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div id="package-delete-dialog-title" className="text-base font-semibold text-foreground">
                    确认删除套餐{packageStageToDelete}阶段
                  </div>
                  <div className="mt-2 text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>
                    删除后，该套餐的金额、服务人员、服务记录、合同附件和跟进记录都会从订单中移除，且无法恢复。其他套餐及体验卡阶段不受影响。
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isDeletingPackageStage}
                      onClick={() => setPackageStageToDelete(null)}
                      className="px-4 py-2 rounded-lg text-sm border disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingPackageStage}
                      onClick={confirmDeletePackageStage}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: 'var(--danger)' }}
                    >
                      {isDeletingPackageStage ? '正在删除...' : '确认删除'}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                {isView ? (
                  <CustomerArchiveView customer={order?.customerSnapshot || fullCustomer} form={form} />
                ) : null}
                {!isView && (
                  <div className="flex flex-col gap-4 mt-4">
                    <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <div className="text-sm font-semibold text-foreground mb-3">基本资料</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>客户姓名</label>
                          <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder="请输入客户姓名" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>微信号</label>
                          <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerWechat} onChange={e => set('customerWechat', e.target.value)} placeholder="请输入微信号" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>联系电话</label>
                          <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} placeholder="请输入手机号" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>所在区域</label>
                          <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerArea} onChange={e => set('customerArea', e.target.value)} placeholder="请输入所在区域" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>来源渠道</label>
                          <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerSource} onChange={e => set('customerSource', e.target.value)} placeholder="请输入来源渠道" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>获客时间</label>
                          <input type="date" className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerAcquiredAt} onChange={e => set('customerAcquiredAt', e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>客户标签</label>
                          <select className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerTag} onChange={e => setCustomerTag(e.target.value as CustomerTag | '')}>
                            <option value="">请选择</option>
                            {form.customerTag && !selectableCustomerTagDefs.some(tag => tag.tag === form.customerTag) && (
                              <option value={form.customerTag} disabled>{form.customerTag}（当前标签，升单后可用）</option>
                            )}
                            {selectableCustomerTagDefs.map(tag => <option key={tag.tag} value={tag.tag}>{tag.label} — {tag.desc}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>归属客服</label>
                          <select
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerAdvisor}
                            onChange={e => set('customerAdvisor', e.target.value)}
                          >
                            <option value="">请选择归属客服</option>
                            {form.customerAdvisor && !advisorOptions.some(option => option.name === form.customerAdvisor) && (
                              <option value={form.customerAdvisor}>{form.customerAdvisor}（历史绑定）</option>
                            )}
                            {advisorOptions.map(option => (
                              <option key={option.id} value={option.name}>{option.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <div className="text-sm font-semibold text-foreground mb-3">客户画像</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>出生年份</label>
                          <input inputMode="numeric" className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerBirthYear} onChange={e => set('customerBirthYear', e.target.value)} placeholder="例：1995" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>生产时间</label>
                          <input type="date" className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerDeliveryDate} onChange={e => set('customerDeliveryDate', e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>第几胎</label>
                          <select className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerBabyCount} onChange={e => set('customerBabyCount', e.target.value)}>
                            <option value="">未知</option>
                            {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>第{value}胎</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>分娩方式</label>
                          <select className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerDeliveryType} onChange={e => set('customerDeliveryType', e.target.value as OrderForm['customerDeliveryType'])}>
                            {['未知', '顺产', '剖腹产'].map(value => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>喂养方式</label>
                          <select className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerFeedingType} onChange={e => set('customerFeedingType', e.target.value as OrderForm['customerFeedingType'])}>
                            {['未知', '母乳', '奶粉', '混合喂养'].map(value => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <div className="text-sm font-semibold text-foreground mb-3">客户需求</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>意向产品</label>
                          <input className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerIntendedProduct} onChange={e => set('customerIntendedProduct', e.target.value)} placeholder="多个产品用逗号分隔" />
                        </div>
                        <div className="col-span-2 flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>客户需求及痛点</label>
                          <textarea rows={3} className="px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerSituation} onChange={e => set('customerSituation', e.target.value)} placeholder="请输入客户需求及痛点" />
                        </div>
                        <div className="col-span-2 flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>备注</label>
                          <textarea rows={2} className="px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            value={form.customerRemark} onChange={e => set('customerRemark', e.target.value)} placeholder="请输入客户备注" />
                        </div>
                      </div>
                    </div>

                    <HistoricalFollowRecords records={getCustomerFollowRecords({ profile: form.customerProfile })} />
                  </div>
                )}
              </div>

              {/* ── 当前阶段订单内容 ── */}
              <div className={isActiveStageTab ? '' : 'hidden'}>
                <div className="flex flex-col gap-4">
                  {form.packageHistory.filter(stage => stage.frozenAt).map(stage => (
                    <div key={stage.id} className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-foreground">
                          {stage.label}（已固化）
                        </div>
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>只读记录</span>
                      </div>
                      <StageSummary stage={stage} />
                    </div>
                  ))}

                  {form.orderType === '体验卡' && (
                    <div className="rounded-xl p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <div className="text-sm font-semibold text-foreground mb-2">体验卡状态</div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowUpgradeConfirmation(false);
                            setPendingUpgradeTag('');
                          }}
                          className="py-2 rounded-lg text-sm font-medium border-2"
                          style={{
                            borderColor: showUpgradeConfirmation ? 'var(--border)' : 'var(--brand)',
                            background: showUpgradeConfirmation ? 'var(--card)' : 'var(--accent)',
                            color: showUpgradeConfirmation ? 'var(--foreground)' : 'var(--brand)',
                          }}
                        >
                          未升单
                        </button>
                        <button
                          type="button"
                          disabled={isView || !isCompletedExperience}
                          onClick={() => {
                            setPendingUpgradeTag(UPGRADE_TAGS.has(form.customerTag as CustomerTag) ? form.customerTag : '');
                            setShowUpgradeConfirmation(true);
                          }}
                          className="py-2 rounded-lg text-sm font-medium border-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            borderColor: showUpgradeConfirmation ? 'var(--brand)' : 'var(--border)',
                            background: showUpgradeConfirmation ? 'var(--accent)' : 'var(--card)',
                            color: showUpgradeConfirmation ? 'var(--brand)' : 'var(--foreground)',
                          }}
                          title={isCompletedExperience ? '进入升单确认' : '体验卡服务全部完成后才可升单'}
                        >
                          已升单
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>客户标签</label>
                          <select
                            value={showUpgradeConfirmation ? pendingUpgradeTag : form.customerTag}
                            disabled={isView}
                            onChange={event => {
                              const nextTag = event.target.value as CustomerTag | '';
                              if (showUpgradeConfirmation) {
                                setPendingUpgradeTag(nextTag);
                              } else {
                                setCustomerTag(nextTag);
                              }
                            }}
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                          >
                            <option value="">
                              {showUpgradeConfirmation ? '请选择 A2 或以上客户标签' : '请选择客户标签'}
                            </option>
                            {!showUpgradeConfirmation && form.customerTag && !PRE_UPGRADE_TAG_DEFS.some(tag => tag.tag === form.customerTag) && (
                              <option value={form.customerTag} disabled>{form.customerTag}（当前标签，升单后可用）</option>
                            )}
                            {(showUpgradeConfirmation ? UPGRADE_TAG_DEFS : PRE_UPGRADE_TAG_DEFS).map(tag => (
                              <option key={tag.tag} value={tag.tag}>{tag.label} — {tag.desc}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                        {isCompletedExperience
                          ? '当前状态：未升单。可直接维护 A2 以下（不含 A2）客户标签；升单需另选 A2 或以上标签并再次确认。'
                          : '当前状态：未升单。体验卡已分配的服务全部完成后，才可发起升单。'}
                      </div>
                      {showUpgradeConfirmation && !isView && (
                        <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--card)', border: '1px solid var(--warning)' }}>
                          <div className="text-sm font-semibold text-foreground">再次确认升单</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                            请在上方“客户标签”选择 A2 或以上级别标签。确认后体验卡阶段将固化为记录，套餐1阶段自动开放。
                          </div>
                          <div className="flex justify-end gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => {
                                setShowUpgradeConfirmation(false);
                                setPendingUpgradeTag('');
                              }}
                              className="px-3 py-1.5 rounded-lg text-sm border hover:bg-muted"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={!pendingUpgradeTag}
                              onClick={() => {
                                if (!isCompletedExperience) {
                                  toast.error('体验卡服务尚未全部完成，暂不能升单');
                                  setShowUpgradeConfirmation(false);
                                  return;
                                }
                                if (!pendingUpgradeTag || !UPGRADE_TAGS.has(pendingUpgradeTag)) {
                                  toast.error('请选择 A2 或以上级别的客户标签');
                                  return;
                                }
                                setExperienceUpgradeStatus('已升单', pendingUpgradeTag);
                                setActiveTab('package');
                              }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: 'var(--brand)' }}
                            >
                              再次确认升单
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-sm font-semibold text-foreground pt-1">
                    {form.orderType === '套餐' ? `套餐${form.activePackageNumber}信息` : '体验卡信息'}
                  </div>
                  <fieldset disabled={isExperienceFrozen} style={{ minWidth: 0, opacity: isExperienceFrozen ? 0.64 : 1 }}>
                  {form.orderType === '套餐' && (
                    <div className="flex flex-col gap-1 mb-3">
                      <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>客户标签</label>
                      <select
                        value={form.customerTag}
                        disabled={isView}
                        onChange={event => setCustomerTag(event.target.value as CustomerTag | '')}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      >
                        <option value="">请选择客户标签</option>
                        {TAG_DEFS.map(tag => (
                          <option key={tag.tag} value={tag.tag}>{tag.label} — {tag.desc}</option>
                        ))}
                      </select>
                    </div>
                  )}
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

                  {/* 服务项目 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>服务项目</label>
                    <ServiceItemsPicker value={form.serviceItems} onChange={v => set('serviceItems', v)} />
                  </div>

                  {form.orderType === '套餐' && (
                  <div className="flex flex-col gap-2">
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
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>合同附件</label>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>支持 PDF、JPG、PNG、WEBP</div>
                      </div>
                      {!isView && (
                        <>
                          <input
                            ref={contractFileRef}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
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
                  )}
                  </fieldset>
                </div>
              </div>

              {/* ── 当前阶段服务人员 ── */}
              <div className={isActiveStageTab ? 'mt-5 pt-5' : 'hidden'} style={{ borderTop: isActiveStageTab ? '1px solid var(--border)' : undefined }}>
                <fieldset style={{ minWidth: 0 }}>
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-1">
                      {form.orderType === '套餐' ? `套餐${form.activePackageNumber}` : '体验卡阶段'} · 服务人员与服务记录
                    </div>
                    <div className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>服务人员、排期及服务照片均归属于当前订单阶段。</div>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="px-4 py-2 text-xs font-medium flex gap-3" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>
                        <span className="w-20">服务类型</span>
                        <span className="flex-1">分配人员</span>
                        <span className="w-28">{form.orderType === '体验卡' ? '服务状态' : '服务总次数'}</span>
                        {form.orderType !== '体验卡' && <span className="w-28">已服务次数</span>}
                      </div>
                      <div className="px-4">
                        <ServicePersonRow
                          label="产康师"
                          value={form.servicePerson1}
                          onChange={v => {
                            set('servicePerson1', v);
                            if (form.orderType === '体验卡') {
                              set('usedTimes', experienceOverallUsedTimes(v, form.servicePerson2, form.servicePerson3));
                            }
                          }}
                          totalTimes={form.totalTimes}
                          usedTimes={form.servicePerson1.usedTimes || '0'}
                          isExperience={form.orderType === '体验卡'}
                          canEditProgress={canEditServiceProgress}
                          assignmentDisabled={isExperienceFrozen}
                          onTotalTimesChange={v => {
                            if (!canEditServiceProgress) return;
                            set('totalTimes', v);
                            set('servicePerson1', { ...form.servicePerson1, totalTimes: v });
                            setIsManualProgressDirty(true);
                          }}
                          onUsedTimesChange={v => {
                            if (!canEditServiceProgress) return;
                            const used = Math.max(0, Math.min(form.orderType === '体验卡' ? 1 : Math.max(1, Number(form.totalTimes) || 1), Number(v) || 0));
                            set('servicePerson1', { ...form.servicePerson1, usedTimes: String(used) });
                            set('usedTimes', form.orderType === '体验卡'
                              ? experienceOverallUsedTimes({ ...form.servicePerson1, usedTimes: String(used) }, form.servicePerson2, form.servicePerson3)
                              : used);
                            setIsManualProgressDirty(true);
                          }}
                        />
                        <ServicePersonRow
                          label="运动康复师"
                          value={form.servicePerson2}
                          onChange={v => {
                            set('servicePerson2', v);
                            if (form.orderType === '体验卡') {
                              set('usedTimes', experienceOverallUsedTimes(form.servicePerson1, v, form.servicePerson3));
                            }
                          }}
                          totalTimes={form.servicePerson2.totalTimes || form.totalTimes}
                          usedTimes={form.servicePerson2.usedTimes || '0'}
                          isExperience={form.orderType === '体验卡'}
                          canEditProgress={canEditServiceProgress}
                          assignmentDisabled={isExperienceFrozen}
                          onTotalTimesChange={v => {
                            if (!canEditServiceProgress) return;
                            set('servicePerson2', { ...form.servicePerson2, totalTimes: v });
                            setIsManualProgressDirty(true);
                          }}
                          onUsedTimesChange={v => {
                            if (!canEditServiceProgress) return;
                            const used = Math.max(0, Math.min(form.orderType === '体验卡' ? 1 : Math.max(1, Number(form.servicePerson2.totalTimes || form.totalTimes) || 1), Number(v) || 0));
                            set('servicePerson2', { ...form.servicePerson2, usedTimes: String(used) });
                            if (form.orderType === '体验卡') {
                              set('usedTimes', experienceOverallUsedTimes(form.servicePerson1, { ...form.servicePerson2, usedTimes: String(used) }, form.servicePerson3));
                            }
                            setIsManualProgressDirty(true);
                          }}
                        />
                        <ServicePersonRow
                          label="调理师"
                          value={form.servicePerson3}
                          onChange={v => {
                            set('servicePerson3', v);
                            if (form.orderType === '体验卡') {
                              set('usedTimes', experienceOverallUsedTimes(form.servicePerson1, form.servicePerson2, v));
                            }
                          }}
                          totalTimes={form.servicePerson3.totalTimes || form.totalTimes}
                          usedTimes={form.servicePerson3.usedTimes || '0'}
                          isExperience={form.orderType === '体验卡'}
                          canEditProgress={canEditServiceProgress}
                          assignmentDisabled={isExperienceFrozen}
                          onTotalTimesChange={v => {
                            if (!canEditServiceProgress) return;
                            set('servicePerson3', { ...form.servicePerson3, totalTimes: v });
                            setIsManualProgressDirty(true);
                          }}
                          onUsedTimesChange={v => {
                            if (!canEditServiceProgress) return;
                            const used = Math.max(0, Math.min(form.orderType === '体验卡' ? 1 : Math.max(1, Number(form.servicePerson3.totalTimes || form.totalTimes) || 1), Number(v) || 0));
                            set('servicePerson3', { ...form.servicePerson3, usedTimes: String(used) });
                            if (form.orderType === '体验卡') {
                              set('usedTimes', experienceOverallUsedTimes(form.servicePerson1, form.servicePerson2, { ...form.servicePerson3, usedTimes: String(used) }));
                            }
                            setIsManualProgressDirty(true);
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {form.orderType === '体验卡'
                        ? `体验卡服务状态：${form.usedTimes > 0 ? '已服务' : '未服务'}。`
                        : `人工校正后，仅校正时间之后完成的排期会继续累加。当前主服务进度：${form.usedTimes} / ${Math.max(1, Number(form.totalTimes) || 1)}`}
                    </div>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>下一次上门时间</div>
                        {nextAppointment ? (
                          <div className="text-sm font-semibold text-foreground">
                            {nextAppointment.date} {nextAppointment.timeSlot}
                            <span className="font-normal ml-3" style={{ color: 'var(--muted-foreground)' }}>
                              {nextAppointment.therapistName || '待分配技师'} · {nextAppointment.service || '服务项目待确认'}
                            </span>
                          </div>
                        ) : (
                          <div className="text-sm font-semibold text-foreground">还未预约</div>
                        )}
                      </div>
                      {!nextAppointment && form.customerId && (
                        <button
                          type="button"
                          onClick={goToAppointmentCalendar}
                          className="px-4 py-2 rounded-lg text-sm text-white hover:opacity-90"
                          style={{ background: 'var(--brand)' }}
                        >
                          去预约
                        </button>
                      )}
                    </div>
                    <div className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                      预约时间由技师排期表同步，此处不直接修改。
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">服务记录</div>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        共 {serviceRecords.length} 次已确认服务
                      </span>
                    </div>
                    {serviceRecords.length === 0 ? (
                      <div className="rounded-xl p-8 text-center text-sm" style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
                        暂无已完成的上门服务记录
                      </div>
                    ) : serviceRecords.map((record, index) => {
                      const photos = (record.photos || []) as OrderAttachment[];
                      const signatures = (record.signaturePhotos || []) as OrderAttachment[];
                      return (
                        <div key={record.id} className="rounded-xl p-4 flex flex-col gap-3" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
                          <div className="grid grid-cols-[70px_1fr_1fr] gap-3 text-sm">
                            <div className="font-semibold" style={{ color: 'var(--brand)' }}>第 {serviceRecords.length - index} 次</div>
                            <div><span style={{ color: 'var(--muted-foreground)' }}>服务时间：</span>{displayDateTime(record.serviceDate)}</div>
                            <div><span style={{ color: 'var(--muted-foreground)' }}>服务技师：</span>{record.therapistName || '—'}</div>
                            <div className="col-start-2 col-span-2"><span style={{ color: 'var(--muted-foreground)' }}>服务项目：</span>{record.serviceItems || '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>客户签字凭证</div>
                            {signatures.length === 0 ? (
                              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>未上传</span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {signatures.map(photo => (
                                  <button type="button" key={photo.id} onClick={() => openAttachment(photo)} className="w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                    <img src={attachmentSrc(photo)} alt={photo.name} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>其他服务照片（最多 10 张）</div>
                              {!isView && (
                                <label className="px-3 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-muted" style={{ border: '1px solid var(--border)', color: 'var(--brand)' }}>
                                  {uploadingRecordId === record.id ? '上传中...' : '上传照片'}
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg"
                                    multiple
                                    className="hidden"
                                    disabled={uploadingRecordId === record.id}
                                    onChange={event => uploadServiceRecordPhotos(record.id, photos, event.target.files)}
                                  />
                                </label>
                              )}
                            </div>
                            {photos.length === 0 ? (
                              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>暂无照片</span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {photos.map(photo => (
                                  <button type="button" key={photo.id} onClick={() => openAttachment(photo)} className="w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                    <img src={attachmentSrc(photo)} alt={photo.name} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {form.servicePhotoRecords.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-semibold text-foreground">历史照片记录</div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        以下为旧版订单中保存的照片，仅作历史留档查看。
                      </div>
                      {[...form.servicePhotoRecords]
                        .sort((a, b) => (b.time || '').localeCompare(a.time || ''))
                        .map(record => (
                          <div key={record.id} className="rounded-xl p-3 flex items-start gap-4" style={{ border: '1px solid var(--border)' }}>
                            <div className="w-28 flex-shrink-0 text-sm">
                              <div className="font-semibold">第 {record.seq} 次</div>
                              <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{displayDateTime(record.time)}</div>
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap gap-2">
                                {(record.photos || []).map(photo => (
                                  <button type="button" key={photo.id} onClick={() => openAttachment(photo)} className="w-14 h-14 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                    <img src={attachmentSrc(photo)} alt={photo.name} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                              {record.remark && <div className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>{record.remark}</div>}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                </fieldset>
              </div>

              {/* ── 当前阶段跟进情况 ── */}
              <div className={isActiveStageTab ? 'mt-5 pt-5' : 'hidden'} style={{ borderTop: isActiveStageTab ? '1px solid var(--border)' : undefined }}>
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {form.orderType === '套餐' ? `套餐${form.activePackageNumber}` : '体验卡阶段'} · 跟进情况
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>新增记录只写入当前阶段；已固化阶段的记录保留在上方阶段摘要中。</div>
                  </div>
                  {isEdit ? (
                    <>
                      <div className="flex flex-col gap-3">
                        <div className="text-sm font-semibold text-foreground">跟进信息</div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>跟进人员</label>
                            <select
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                              value={form.newFollowFollowerId || currentUser.id}
                              disabled={!canChooseFollower}
                              onChange={e => {
                                const selected = followerOptions.find(u => u.id === e.target.value) ?? defaultFollower;
                                setForm(prev => ({ ...prev, newFollowFollowerId: selected.id, newFollowFollowerName: selected.name }));
                              }}
                            >
                              {followerOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>跟进状态</label>
                            <select
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                              value={form.newFollowStatus}
                              onChange={e => set('newFollowStatus', e.target.value as OrderForm['newFollowStatus'])}
                            >
                              {(['跟进中', '待跟进', '已完成', '延迟'] as OrderForm['newFollowStatus'][]).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>下次跟进时间</label>
                            <input
                              type="date"
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                              value={form.newFollowDate}
                              onChange={e => set('newFollowDate', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>跟进事项（当前待办）</label>
                          <textarea
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--muted)', border: '1px solid var(--border)', minHeight: 56, resize: 'vertical' }}
                            value={form.newFollowContent}
                            onChange={e => set('newFollowContent', e.target.value)}
                            placeholder="记录本次跟进的任务和待办事项..."
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>跟进反馈（本次备注）</label>
                          <textarea
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--muted)', border: '1px solid var(--border)', minHeight: 68, resize: 'vertical' }}
                            value={form.newFollowFeedback}
                            onChange={e => set('newFollowFeedback', e.target.value)}
                            placeholder="记录本次跟进情况，如：电话沟通，了解客户意向..."
                          />
                        </div>
                        <button
                          onClick={handleAddFollow}
                          disabled={!form.newFollowContent.trim() && !form.newFollowFeedback.trim()}
                          className="self-start flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                          style={{ background: 'var(--brand)' }}
                        >
                          <PlusIcon size={14} />
                          保存本次
                        </button>
                      </div>
                      {form.followRecords.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <div className="text-sm font-semibold text-foreground">跟进记录（{form.followRecords.length} 条）</div>
                          {sortFollowRecords(form.followRecords).map((r, i) => (
                            <div key={r.id || i} className="rounded-lg p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>{r.date}</span>
                                <span className={`badge ${FOLLOW_STATUS_COLORS[r.status] ?? 'badge-gray'}`}>{r.status}</span>
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>跟进人员：{r.followerName || r.operator}</span>
                              </div>
                              {r.content && <div className="text-sm text-foreground">事项：{r.content}</div>}
                              {r.feedback && <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>反馈：{r.feedback}</div>}
                              <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>记录时间：{r.createdAt || '—'}</div>
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
                  ) : isView ? (
                    <div className="flex flex-col gap-3">
                      {form.followRecords.length > 0 ? (
                        <>
                          <div className="text-sm font-semibold text-foreground">跟进记录（{form.followRecords.length} 条）</div>
                          {sortFollowRecords(form.followRecords).map((r, i) => (
                            <div key={r.id || i} className="rounded-lg p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>{r.date}</span>
                                <span className={`badge ${FOLLOW_STATUS_COLORS[r.status] ?? 'badge-gray'}`}>{r.status}</span>
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>跟进人员：{r.followerName || r.operator}</span>
                              </div>
                              {r.content && <div className="text-sm text-foreground">事项：{r.content}</div>}
                              {r.feedback && <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>反馈：{r.feedback}</div>}
                              <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>记录时间：{r.createdAt || '—'}</div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
                          <MessageSquareIcon size={32} className="mx-auto mb-2 opacity-30" />
                          <div className="text-sm">暂无跟进记录</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
                      <MessageSquareIcon size={36} className="mx-auto mb-3 opacity-25" />
                      <div className="text-sm font-medium">首次新建订单时跟进情况为空</div>
                      <div className="text-xs mt-1 opacity-70">保存订单后，在编辑状态下可添加售后跟进记录</div>
                    </div>
                  )}
                </div>
              </div>

              {activeTab === 'experience' && form.orderType === '套餐' && form.experienceSnapshot && (
                <div className="rounded-xl p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-foreground">体验卡阶段（已结束）</div>
                    {canChooseFollower && !isView ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingExperienceSnapshot(value => !value)}
                        className="px-3 py-1.5 rounded-lg text-xs border hover:bg-card"
                        style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
                      >
                        {isEditingExperienceSnapshot ? '完成记录编辑' : '管理员编辑记录'}
                      </button>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>客服仅可查看</span>
                    )}
                  </div>
                  {isEditingExperienceSnapshot && canChooseFollower && !isView ? (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>体验卡金额（元）</label>
                          <input
                            value={form.experienceSnapshot.amount}
                            onChange={event => updateExperienceSnapshot({ amount: event.target.value })}
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>购买时间</label>
                          <input
                            type="date"
                            value={form.experienceSnapshot.purchaseDate}
                            onChange={event => updateExperienceSnapshot({ purchaseDate: event.target.value })}
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                          />
                        </div>
                        <div className="col-span-2 flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>付款状态</label>
                          <select
                            value={form.experienceSnapshot.payStatus}
                            onChange={event => updateExperienceSnapshot({ payStatus: event.target.value as NewPayStatus })}
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                          >
                            {(['已支付', '待支付', '已付定金', '已退款'] as NewPayStatus[]).map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2 flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>服务项目</label>
                          <textarea
                            rows={2}
                            value={form.experienceSnapshot.serviceItems}
                            onChange={event => updateExperienceSnapshot({ serviceItems: event.target.value })}
                            className="px-3 py-2 rounded-lg text-sm outline-none resize-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                          />
                        </div>
                        <div className="col-span-2 flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>服务备注</label>
                          <textarea
                            rows={2}
                            value={form.experienceSnapshot.serviceNote}
                            onChange={event => updateExperienceSnapshot({ serviceNote: event.target.value })}
                            className="px-3 py-2 rounded-lg text-sm outline-none resize-none"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                          />
                        </div>
                      </div>
                      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="px-4 py-2 text-xs font-medium flex gap-3" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>
                          <span className="w-20">服务类型</span>
                          <span className="flex-1">分配人员</span>
                          <span className="w-28">服务状态</span>
                        </div>
                        <div className="px-4">
                          {([
                            ['产康师', 'sp1'],
                            ['运动康复师', 'sp2'],
                            ['调理师', 'sp3'],
                          ] as const).map(([label, key]) => {
                            const person = form.experienceSnapshot!.servicePeople[key] || { type: label, assign: '待分配' };
                            return (
                              <ServicePersonRow
                                key={key}
                                label={label}
                                value={person}
                                onChange={value => updateExperienceSnapshotPerson(key, value)}
                                usedTimes={person.usedTimes || '0'}
                                isExperience
                                canEditProgress
                                onUsedTimesChange={value => updateExperienceSnapshotPerson(key, {
                                  ...person,
                                  usedTimes: String(Math.max(0, Math.min(1, Number(value) || 0))),
                                })}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        历史跟进记录、服务照片和签字凭证继续作为原始记录保留。
                      </div>
                    </div>
                  ) : (
                    <StageSummary stage={form.experienceSnapshot} />
                  )}
                </div>
              )}
              {activeTab === 'experience' && form.orderType === '套餐' && !form.experienceSnapshot && (
                <div className="rounded-xl p-10 text-center" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
                  <FileTextIcon size={32} className="mx-auto mb-3 opacity-30" />
                  <div className="text-sm font-medium">该历史订单没有体验卡阶段记录</div>
                  <div className="text-xs mt-1">套餐信息请在“套餐阶段”中查看和维护。</div>
                </div>
              )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1">
                {visibleTabs.map(tab => (
                  <button
                    key={tab.id}
                    disabled={tab.disabled}
                    onClick={() => openVisibleTab(tab)}
                    className="w-2 h-2 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: activeVisibleTabId === tab.id ? 'var(--brand)' : 'var(--border)' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                {canDeleteOrder && (
                  <button
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm border hover:bg-muted"
                    style={{ color: 'var(--danger)', borderColor: 'rgba(220,38,38,0.35)' }}
                    onClick={handleDelete}
                  ><Trash2Icon size={14} />删除订单</button>
                )}
                {activeTab !== 'customer' && (
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm border hover:bg-muted"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => {
                      const idx = visibleTabs.findIndex(tab => tab.id === activeVisibleTabId);
                      if (idx > 0) openVisibleTab(visibleTabs[idx - 1]);
                    }}
                  >上一步</button>
                )}
                {activeTab === 'customer' ? (
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm text-white font-medium hover:opacity-90"
                    style={{ background: 'var(--brand)' }}
                    onClick={() => {
                      const idx = visibleTabs.findIndex(tab => tab.id === activeVisibleTabId);
                      const nextTab = visibleTabs.slice(idx + 1).find(tab => !tab.disabled);
                      if (nextTab) openVisibleTab(nextTab);
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
    customerId: '', customerName: '', customerWechat: '', customerPhone: '', customerArea: '',
    customerSource: '小红书', customerAcquiredAt: new Date().toISOString().slice(0, 10),
    customerTag: '', customerAdvisor: '', customerFollowStatus: '待跟进', customerFollowDate: '',
    customerIntendedProduct: '', customerSituation: '', customerRemark: '',
    customerBirthYear: '', customerDeliveryDate: '', customerBabyCount: '',
    customerDeliveryType: '未知', customerFeedingType: '未知', customerFollowTask: '', customerProfile: {},
    orderType: '体验卡', amount: '', payStatus: '待支付', purchaseDate: new Date().toISOString().slice(0, 10),
    totalTimes: '1', usedTimes: 0,
    experienceUpgradeStatus: '', experienceSnapshot: null,
    upgradeCustomerTag: '', packageHistory: [], activePackageNumber: 1,
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
    followRecords: [], newFollowDate: '', newFollowStatus: '待跟进', newFollowContent: '', newFollowFeedback: '', newFollowFollowerId: '', newFollowFollowerName: '',
  };
}

/* ─── Helper: get therapist display string for an order ─ */
function getTherapistDisplay(orderOrId: string | {
  id?: string;
  servicePeople?: Partial<Record<'sp1' | 'sp2' | 'sp3', ServicePerson>> | null;
}): string {
  const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id || '';
  const persisted = typeof orderOrId === 'string' ? null : orderOrId.servicePeople;
  const people = orderTherapistMap.get(orderId)
    || (persisted?.sp1 || persisted?.sp2 || persisted?.sp3 ? persisted : null);
  if (!people) return '待分配';

  const names = [people.sp1?.assign, people.sp2?.assign, people.sp3?.assign]
    .filter((name): name is string => Boolean(name && name !== '待分配' && name !== '无'));
  return names.length > 0 ? Array.from(new Set(names)).join('、') : '待分配';
}

/* ─── Helper: get contract status for an order ─────────── */
function getContractStatus(order?: {
  id?: string;
  type?: string;
  contractSigned?: boolean;
}): ContractStatus {
  const source = order || { type: '体验卡' };
  return resolveOrderContractStatus(
    source,
    orderContractMap.get(source.id || '')
  );
}

/* ─── Helper: get follow records for an order ──────────── */
function getOrderFollowRecords(order: any): OrderFollowRecord[] {
  const persisted = order?.servicePeople?.followRecords;
  if (Array.isArray(persisted)) return sortFollowRecords(persisted);
  return getFollowRecords(order?.id || '');
}

function getFollowRecords(orderId: string): OrderFollowRecord[] {
  return sortFollowRecords(orderFollowMap.get(orderId) ?? []);
}

/* ─── Helper: get follow task for an order ─────────────── */
function getFollowTask(orderId: string): string {
  return orderFollowTaskMap.get(orderId) ?? '';
}

/* ─── Helper: compute follow display info ──────────────── */
function getFollowDisplay(order: any): { status: string; date: string; task: string; isOverdue: boolean } {
  const records = getOrderFollowRecords(order);
  const task = getFollowTask(order?.id || '');
  if (records.length === 0) {
    return { status: '待跟进', date: '—', task: task || '—', isOverdue: false };
  }
  const latest = records[0];
  const isOverdue = latest.status === '延迟';
  return {
    status: latest.status,
    date: latest.date,
    task: task || latest.content || '—',
    isOverdue,
  };
}

function serviceProgressText(order: any): string {
  const used = Math.max(0, Number(order?.usedTimes) || 0);
  const total = Math.max(1, Number(order?.totalTimes) || 1);
  const people = order?.servicePeople || {};
  const assignedPeople = ['sp1', 'sp2', 'sp3']
    .map(key => people[key] as ServicePerson | undefined)
    .filter(isAssignedServicePerson);
  if (assignedPeople.length === 0) return '无';
  if (order?.type === '套餐' || order?.isUpgrade) return `${used}/${total}`;
  const hasPersonStatus = assignedPeople.some(person => person.usedTimes !== undefined);
  const experienceUsed = hasPersonStatus
    ? assignedPeople.some(person => Number(person.usedTimes) > 0)
    : used > 0;
  return experienceUsed ? '已服务' : '未服务';
}

/* ─── Main Page ──────────────────────────────────────── */
export default function OrdersListPage() {
  const { currentUser } = useApp();
  const orderMutations = useOrderMutations();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<OrderModalMode>('create');
  const [editOrderId, setEditOrderId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pageSize, setPageSize] = useState(20);
  const [purchaseDateRange, setPurchaseDateRange] = useState<PurchaseDateRange>('all');
  const [purchaseCustomRange, setPurchaseCustomRange] = useGlobalDateRange('all');

  // Multi-select filter states
  const [fType, setFType] = useState<string[]>([]);
  const [fPay, setFPay] = useState<string[]>([]);
  const [fContract, setFContract] = useState<string[]>(() => {
    const filter = readDashboardFilter();
    if (filter.orderContractStatus === '未回签') {
      clearDashboardFilter();
      return ['未回签'];
    }
    return [];
  });
  const [fArea, setFArea] = useState<string[]>([]);
  const [fTag, setFTag] = useState<string[]>([]);
  const [fFollowTime, setFFollowTime] = useState<string[]>(() => {
    const filter = readDashboardFilter();
    if (filter.orderFollowTime === 'today') {
      clearDashboardFilter();
      return ['today'];
    }
    return [];
  });
  const [fAdvisor, setFAdvisor] = useState<string[]>([]);
  const [fTherapist, setFTherapist] = useState<string[]>([]);

  const isReadOnly = currentUser.role === 'finance';
  const canManageBulk = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  // Build option lists from data
  const customersQ = useCustomers({ page: 1, pageSize: 1000, includeOrdered: 1 });
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const ordersQ = useOrders({
    page: 1,
    pageSize: 1000,
    from: purchaseCustomRange.start,
    to: purchaseCustomRange.end,
  });
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
    getTherapistDisplay(o).split(/[，,、]/).map(name => name.trim()).filter(name => name && name !== '待分配')
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
    const projection = o.purchaseRangeProjection;
    const matchPurchaseDate = projection?.active
      ? ensureArray<string>(projection.visibleStageKeys).length > 0
      : dateInRange(o.purchaseDate || o.createdAt, purchaseCustomRange);
    const matchType = fType.length === 0 || fType.includes(o.type);
    const normalizedPay = o.payStatus === '已支付' ? '已付款' : o.payStatus === '待支付' ? '待付款' : o.payStatus;
    const matchPay = fPay.length === 0 || fPay.includes(normalizedPay);
    const matchContract = matchesOrderContractStatus(
      getContractStatus(o),
      fContract
    );
    const matchArea = fArea.length === 0 || fArea.some(area => String(o.area || '').includes(area));
    const matchTag = fTag.length === 0 || (o.tag !== null && fTag.includes(o.tag));
    const followInfo = getFollowDisplay(o);
    const matchFollowTime = matchesFollowTimeFilter(followInfo.date, fFollowTime);
    const matchAdvisor = fAdvisor.length === 0 || fAdvisor.includes(o.advisor);
    const therapistDisplay = getTherapistDisplay(o);
    const matchTherapist = fTherapist.length === 0 || fTherapist.some(t => therapistDisplay.includes(t));
    return matchSearch && matchPurchaseDate && matchType && matchPay && matchContract && matchArea && matchTag && matchFollowTime && matchAdvisor && matchTherapist;
  }).sort((a, b) => {
    const bTime = new Date(`${b.purchaseRangeProjection?.displayPurchaseDate || b.purchaseDate || ''}T00:00:00`).getTime();
    const aTime = new Date(`${a.purchaseRangeProjection?.displayPurchaseDate || a.purchaseDate || ''}T00:00:00`).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const amountStageRows = filtered.map(order => getOrderAmountStages(order));
  const maxPackageNumber = Math.max(
    1,
    ...amountStageRows.flatMap(stages =>
      stages.map(stage => stage.key)
        .filter(key => key.startsWith('package-'))
        .map(key => Number(key.slice('package-'.length)) || 0),
    ),
  );
  const amountColumns: Array<{ key: string; label: string }> = [
    { key: 'experience', label: '体验卡金额' },
    ...Array.from({ length: maxPackageNumber }, (_, index) => ({
      key: `package-${index + 1}`,
      label: `套餐${index + 1}金额`,
    })),
  ];
  const amountTotals = sumOrderAmountStages(amountStageRows);

  useEffect(() => { setPage(1); }, [search, purchaseDateRange, purchaseCustomRange.start, purchaseCustomRange.end, fType, fPay, fContract, fArea, fTag, fFollowTime, fAdvisor, fTherapist]);

  function handleOrderCustomerExport() {
    const headers = ['订单编号', '购买时间', '客户ID', '客户姓名', '联系电话', '所在区域', '客户标签', '归属客服', '订单类型', '服务项目', '跟进状态', '跟进时间', '跟进事项', '付款状态', '订单金额', '合同状态', '服务人员', '预约服务时间', '服务备注'];
    const rows = filtered.map(order => {
      const follow = getFollowDisplay(order);
      return [
        order.id, order.purchaseRangeProjection?.displayPurchaseDate || order.purchaseDate || '', order.resolvedCustomerId, order.customerName, order.customerPhone, order.area, order.tag || '', order.advisor,
        order.type, order.serviceItems || '', follow.status, follow.date, follow.task, payStatusDisplay(effectiveOrderPayStatus(order)),
        getOrderAmountStages(order).reduce((sum, stage) => sum + stage.amount, 0),
        getContractStatus(order), getTherapistDisplay(order), order.appointmentTime || '', order.serviceNote || '',
      ];
    });
    downloadXlsx(`订单客户信息_${new Date().toISOString().slice(0, 10)}.xlsx`, headers, rows);
    toast.success(`已导出 ${rows.length} 条订单客户信息`);
  }

  async function handleOrderImport() {
    if (!importFile) return;
    try {
      const sheetRows = await readSpreadsheet(importFile);
      if (!sheetRows[0]?.includes('客户姓名')) { setImportMsg('未找到“客户姓名”列，请使用下载的订单导入模板。'); return; }
      const records = rowsToObjects(sheetRows);
      if (records.length === 0) { setImportMsg('文件内容为空或格式不正确，请使用下载的模板。'); return; }
      const orders = records.map(row => ({
        customerId: row['客户ID'] || '',
        customerName: row['客户姓名'] || '',
        customerWechat: row['微信号'] || '',
        customerPhone: row['联系电话'] || '',
        customerArea: row['所在区域'] || '',
        customerTag: row['客户标签'] || 'D1',
        customerAdvisor: row['归属客服'] || currentUser.name,
        source: '订单批量导入',
        type: row['订单类型'] || '体验卡',
        serviceItems: row['服务项目'] || '',
        amount: Number(row['订单金额']) || 0,
        payStatus: row['付款状态'] || '待付款',
        totalTimes: Math.max(1, Number(row['总次数']) || 1),
        usedTimes: Math.max(0, Number(row['已使用次数']) || 0),
        isUpgrade: importBoolean(row['是否升级'] || ''),
        contractSigned: importBoolean(row['合同状态'] || ''),
        hasCoupon: importBoolean(row['是否使用优惠券'] || ''),
        appointmentTime: row['预约服务时间'] || '',
        serviceNote: row['服务备注'] || '',
        serviceItemCount: Math.max(1, (row['服务项目'] || '').split(/[、,，]/).filter(Boolean).length),
      })).filter(order => order.customerId || order.customerName || order.customerPhone);
      if (orders.length === 0) { setImportMsg('未识别到有效订单，请至少填写客户ID、客户姓名或联系电话。'); return; }
      setImportMsg(`正在导入 ${orders.length} 条订单...`);
      const results = await Promise.all(orders.map(order => orderMutations.create(order as any).then(() => true).catch(() => false)));
      const success = results.filter(Boolean).length;
      setImportMsg(success === orders.length ? `成功导入 ${success} 条订单` : `成功导入 ${success} 条，失败 ${orders.length - success} 条，请检查客户和必填信息。`);
      if (success > 0) setImportFile(null);
    } catch (error: any) {
      setImportMsg(error?.message || '导入失败，请检查 Excel 或 CSV 格式。');
    }
  }

  /* ── Column widths for non-frozen cols ── */
  // 区域 | 订单类型 | 服务项目 | 跟进状态 | 跟进时间 | 跟进事项 | 付款状态
  const NORMAL_COLS_BEFORE_AMOUNT = [92, 80, 160, 76, 82, 120, 76];
  // 合同状态 | 归属客服 | 技师 | 服务情况 | 操作
  const NORMAL_COLS_AFTER_AMOUNT = [76, 76, 88, 82, 96];
  const NORMAL_COLS = [
    ...NORMAL_COLS_BEFORE_AMOUNT,
    ...amountColumns.map(() => 108),
    ...NORMAL_COLS_AFTER_AMOUNT,
  ];
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

      <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${showImport ? 'opacity-100 pointer-events-auto' : 'hidden opacity-0 pointer-events-none'}`} style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="bg-card rounded-2xl shadow-custom flex flex-col overflow-hidden" style={{ width: 560, maxHeight: '90vh' }}>
          <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <UploadIcon size={16} style={{ color: 'var(--brand)' }} />
            <span className="font-bold text-base text-foreground">批量导入订单</span>
            <div className="flex-1" />
            <button className="p-1.5 rounded hover:bg-muted" onClick={() => { setShowImport(false); setImportFile(null); setImportMsg(''); }}><XIcon size={16} /></button>
          </div>
          <div className="p-6 flex flex-col gap-5">
            <div className="rounded-lg px-4 py-3 text-sm leading-relaxed" style={{ background: 'rgba(30,136,229,0.08)', color: 'var(--brand)', border: '1px solid rgba(30,136,229,0.2)' }}>
              下载模板后填写订单及客户资料。若客户ID不存在，系统会按客户姓名或联系电话自动创建客户并关联订单。
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">第一步：下载模板</span>
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium self-start" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }} onClick={downloadOrderTemplate}>
                <DownloadIcon size={14} style={{ color: 'var(--brand)' }} />下载订单导入模板.xlsx
              </button>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>客户姓名、联系电话、订单类型和订单金额建议填写完整。</span>
            </div>
            <input ref={importInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { setImportFile(e.target.files?.[0] || null); setImportMsg(''); if (importInputRef.current) importInputRef.current.value = ''; }} />
            <button className="flex flex-col items-center justify-center gap-2 rounded-xl transition-all hover:opacity-80" style={{ border: `2px dashed ${importFile ? 'var(--brand)' : 'var(--border)'}`, background: importFile ? 'rgba(30,136,229,0.05)' : 'var(--muted)', padding: '28px 16px' }} onClick={() => importInputRef.current?.click()}>
              {importFile ? <><FileTextIcon size={30} style={{ color: 'var(--brand)' }} /><span className="text-sm font-semibold">{importFile.name}</span></> : <><UploadIcon size={30} style={{ color: 'var(--muted-foreground)' }} /><span className="text-sm font-medium">点击选择 Excel 或 CSV 文件</span></>}
            </button>
            {importMsg && <div className="text-sm" style={{ color: importMsg.includes('成功') ? 'var(--success)' : 'var(--danger)' }}>{importMsg}</div>}
          </div>
          <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button className="px-4 py-2 rounded-lg text-sm border hover:bg-muted" style={{ borderColor: 'var(--border)' }} onClick={() => setShowImport(false)}>取消</button>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50" style={{ background: 'var(--brand)' }} disabled={!importFile} onClick={handleOrderImport}><UploadIcon size={14} />开始导入</button>
          </div>
        </div>
      </div>

      <div data-cmp="OrdersListPage" className="flex flex-col gap-4">

        {/* ── Top action bar — single row, no wrap ── */}
        <div className="bg-card rounded-xl px-4 py-3 shadow-custom">
          <div className="flex flex-wrap items-center gap-3">
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
            <DateRangeFilter
              label="购卡时间范围"
              className="hidden"
              value={purchaseCustomRange}
              onChange={value => { setPurchaseCustomRange(value); setPurchaseDateRange('custom'); }}
            />
            <div
              className="order-2 basis-full flex flex-nowrap items-center gap-2 pt-3 [&>.w-px]:hidden"
              style={{ borderTop: '1px solid var(--border)' }}
            >
            <DateRangeFilter
              label="购卡时间范围"
              value={purchaseCustomRange}
              onChange={value => { setPurchaseCustomRange(value); setPurchaseDateRange('custom'); }}
              quickOptions={GLOBAL_DATE_RANGE_QUICK_OPTIONS}
              onQuickSelect={value => setPurchaseDateRange(
                value === 'all' || value === 'today' || value === 'week' || value === 'month'
                  ? value
                  : 'custom',
              )}
            />
            <div className="hidden" style={{ background: 'var(--border)' }} />
            <div className="hidden">
              <span className="text-xs font-medium mr-1" style={{ color: 'var(--muted-foreground)' }}>购卡时间</span>
              {(['all', 'today', 'week', 'month'] as Exclude<PurchaseDateRange, 'custom'>[]).map(range => (
                <button
                  key={range}
                  onClick={() => { setPurchaseDateRange(range); setPurchaseCustomRange(quickDateRange(range)); }}
                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: purchaseDateRange === range ? 'var(--brand)' : 'var(--muted)',
                    color: purchaseDateRange === range ? '#fff' : 'var(--foreground)',
                    border: `1px solid ${purchaseDateRange === range ? 'var(--brand)' : 'var(--border)'}`,
                  }}
                >
                  {purchaseDateLabel(range)}
                </button>
              ))}
            </div>
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown label="订单类型" options={TYPE_OPTIONS} selected={fType} onChange={setFType} />
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown label="付款状态" options={PAY_OPTIONS} selected={fPay} onChange={setFPay} />
            <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <MultiSelectDropdown
              label="合同"
              options={CONTRACT_STATUS_FILTER_OPTIONS}
              selected={fContract}
              onChange={setFContract}
            />
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
            <MultiSelectDropdown
              label="跟进时间"
              options={FOLLOW_TIME_FILTER_OPTIONS}
              selected={fFollowTime}
              onChange={setFFollowTime}
              allSelectedLabel="跟进时间 全选"
              fixedSelectAllLabel
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
            </div>
            {/* Count + new button */}
            <span className="text-sm flex-shrink-0 ml-1" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>共 {filtered.length} 条</span>
            {canManageBulk && (
              <>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }} onClick={handleOrderCustomerExport}>
                  <DownloadIcon size={14} />客户信息导出
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }} onClick={() => { setImportFile(null); setImportMsg(''); setShowImport(true); }}>
                  <UploadIcon size={14} />批量导入
                </button>
              </>
            )}
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
          <div style={{ maxHeight: 'calc(100vh - 310px)', overflow: 'auto', position: 'relative' }}>
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
                  <th style={STICKY_TH_STYLE(0)}>购卡时间</th>
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
                  {amountColumns.map(column => (
                    <th key={column.key} style={{ textAlign: 'center' }}>{column.label}</th>
                  ))}
                  <th style={{ textAlign: 'center' }}>合同状态</th>
                  <th>归属客服</th>
                  <th>技师</th>
                  <th style={{ textAlign: 'center' }}>服务情况</th>
                  <th style={{ textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: 'rgba(30,136,229,0.06)' }}>
                  <td style={STICKY_TD_STYLE(0, 'rgba(30,136,229,0.06)')}>
                    <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>销售总额</span>
                  </td>
                  <td style={STICKY_TD_STYLE(1, 'rgba(30,136,229,0.06)')} />
                  <td style={STICKY_TD_STYLE(2, 'rgba(30,136,229,0.06)')} />
                  <td style={STICKY_TD_STYLE(3, 'rgba(30,136,229,0.06)')} />
                  {NORMAL_COLS_BEFORE_AMOUNT.map((_, index) => <td key={`summary-before-${index}`} />)}
                  {amountColumns.map(column => (
                    <td
                      key={`summary-${column.key}`}
                      style={{ textAlign: 'center' }}
                      title={`当前筛选 ${filtered.length} 条订单的${column.label}逐行合计`}
                    >
                      <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>
                        ¥{(amountTotals.get(column.key) || 0).toLocaleString()}
                      </span>
                    </td>
                  ))}
                  {NORMAL_COLS_AFTER_AMOUNT.map((_, index) => <td key={`summary-after-${index}`} />)}
                </tr>
                {paginated.map(o => {
                  const bgColor = 'var(--card)';

                  // Service items display
                  const serviceItemsText = (() => {
                    const saved = orderServiceItemsMap.get(o.id);
                    if (saved && saved.trim()) return saved;
                    if (o.serviceItems && o.serviceItems.trim()) return o.serviceItems;
                    return '—';
                  })();

                  const therapistDisplay = getTherapistDisplay(o);
                  const contractStatus = getContractStatus(o);
                  const followInfo = getFollowDisplay(o);
                  const displayPayStatus = effectiveOrderPayStatus(o);
                  const orderAmountStages = new Map(
                    getOrderAmountStages(o).map(stage => [stage.key, stage]),
                  );

                  return (
                    <tr key={o._id || o.id}>
                      {/* Frozen: 购卡时间 */}
                      <td style={STICKY_TD_STYLE(0, bgColor)}>
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {o.purchaseRangeProjection?.displayPurchaseDate || o.purchaseDate || '—'}
                        </span>
                      </td>

                      {/* Frozen: 客户ID */}
                      <td style={STICKY_TD_STYLE(1, bgColor)}>
                        <span className="font-mono text-xs" style={{ color: 'var(--brand)', letterSpacing: '-0.02em' }}>
                          {o.resolvedCustomerId}
                        </span>
                      </td>

                      {/* Frozen: 客户姓名 */}
                      <td style={STICKY_TD_STYLE(2, bgColor)}>
                        <span
                          className="font-medium text-sm"
                          style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={o.customerName}
                        >
                          {o.customerName}
                        </span>
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

                      {/* 分阶段金额 */}
                      {amountColumns.map(column => {
                        const stage = orderAmountStages.get(column.key);
                        return (
                          <td key={`${o.id}-${column.key}`} style={{ textAlign: 'center' }}>
                            {stage ? (
                              <span className="text-sm font-semibold text-foreground">
                                ¥{stage.amount.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>
                            )}
                          </td>
                        );
                      })}

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

                      <td style={{ textAlign: 'center' }}>
                        <span className="text-xs font-medium" style={{ color: serviceProgressText(o) === '未服务' ? 'var(--muted-foreground)' : 'var(--brand)' }}>
                          {serviceProgressText(o)}
                        </span>
                      </td>

                      {/* 操作 */}
                      <td style={{ textAlign: 'center' }}>
                        <RecordActionButtons
                          onView={() => { setModalMode('view'); setEditOrderId(o.id); setSelectedOrder(o); setShowModal(true); }}
                          onEdit={isReadOnly ? undefined : () => { setModalMode('edit'); setEditOrderId(o.id); setSelectedOrder(o); setShowModal(true); }}
                        />
                      </td>
                    </tr>
                  );
                })}

                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={16 + amountColumns.length} className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
                      <FileTextIcon size={36} className="mx-auto mb-3 opacity-20" />
                      <div className="text-sm">暂无订单数据</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                每页
                <select className="rounded-md px-2 py-1 text-xs bg-card" style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[10, 20, 30, 50].map(size => <option key={size} value={size}>{size} 条</option>)}
                </select>
              </label>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {filtered.length === 0 ? '共 0 条' : `第 ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} 条，共 ${filtered.length} 条`}
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
        </div>
      </div>
    </>
  );
}
