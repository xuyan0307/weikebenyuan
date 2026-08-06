import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeftIcon, ChevronRightIcon, PlusIcon, CalendarIcon,
  EditIcon, CheckIcon, XIcon, SearchIcon, MapPinIcon, ChevronDownIcon,
  MessageSquareIcon, ImageIcon
} from 'lucide-react';
import { uploadsApi } from '../api/endpoints';
import type { Appointment, UploadedFile } from '../api/endpoints';
import { useApp } from '../hooks/useApp';
import { useAppointments, useTherapists, useOrders, useCustomers, useAppointmentMutations } from '../api/hooks';
import { toast } from 'sonner';
import {
  bookingWeekRangeLabel,
  getBookingWeekDates,
} from '../utils/appointmentBookingWeeks';
import {
  getAppointmentServiceFromRecord,
  replaceWithScheduleSnapshot,
  requiresRecordedAppointmentService,
} from '../utils/appointmentServiceSync';
import {
  appointmentBlocksSlot,
  hasBlockingAppointment,
  hasBlockingAppointmentExcluding,
  isCancelledAppointment,
} from '../utils/appointmentSlotAvailability';

type ApptStatus = '待确认' | '已确认' | '已取消' | '已完成';

// ─── Constants ───────────────────────────────────────────────────────────────

const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

type SlotLabel = '上午' | '下午' | '晚上';
const TIME_SLOTS: { label: SlotLabel; range: string; start: string; end: string }[] = [
  { label: '上午', range: '08:00–11:59', start: '08', end: '12' },
  { label: '下午', range: '12:00–17:59', start: '12', end: '18' },
  { label: '晚上', range: '18:00–23:59', start: '18', end: '24' },
];

type ScheduleState = '空闲' | '忙碌' | '待定';
const SCHEDULE_STATES: ScheduleState[] = ['空闲', '忙碌', '待定'];

const SCHEDULE_COLORS: Record<ScheduleState, { bg: string; text: string; border: string }> = {
  '空闲': { bg: '#F0FDF4', text: '#16A34A', border: '#86EFAC' },
  '忙碌': { bg: '#FEF2F2', text: '#DC2626', border: '#FCA5A5' },
  '待定': { bg: '#FFFBEB', text: '#D97706', border: '#FCD34D' },
};

const THERAPIST_COLORS = [
  '#1E88E5', '#43A047', '#F4511E', '#8E24AA', '#00897B', '#E53935',
];

const CITY_GROUPS = ['厦门', '泉州', '漳州'];

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getBoundTherapists(therapists: any[], orders: any[], appointments: Appointment[]) {
  const assignedNames = new Set<string>();
  const appointmentTherapistIds = new Set(appointments.map(appointment => appointment.therapistId));

  orders.forEach(order => {
    const people = order.servicePeople ?? {};
    ['sp1', 'sp2', 'sp3'].forEach(key => {
      const name = people[key]?.assign;
      if (name && name !== '待分配') assignedNames.add(name);
    });
  });

  return therapists
    .filter(therapist => therapist.status === '在职')
    .filter(therapist => appointmentTherapistIds.has(therapist.id) || assignedNames.has(therapist.name))
    .sort((a, b) => {
      const aCity = CITY_GROUPS.indexOf(a.city);
      const bCity = CITY_GROUPS.indexOf(b.city);
      const cityOrder = (aCity === -1 ? CITY_GROUPS.length : aCity) - (bCity === -1 ? CITY_GROUPS.length : bCity);
      return cityOrder || a.name.localeCompare(b.name, 'zh-CN');
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOfWeek(weekOffset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDates(weekOffset: number): string[] {
  const monday = getMondayOfWeek(weekOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  });
}

function formatDisplayDate(isoDate: string): string {
  const parts = isoDate.split('-');
  return `${parts[1]}/${parts[2]}`;
}

function getMonthWeekNumber(date: Date): { year: number; month: number; weekNum: number } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDow = firstOfMonth.getDay();
  const firstMondayOffset = firstDow === 0 ? -6 : 1 - firstDow;
  const firstWeekMonday = new Date(firstOfMonth);
  firstWeekMonday.setDate(firstOfMonth.getDate() + firstMondayOffset);
  const diffDays = Math.floor((date.getTime() - firstWeekMonday.getTime()) / 86400000);
  const weekNum = Math.floor(diffDays / 7) + 1;
  return { year, month, weekNum: Math.max(1, Math.min(4, weekNum)) };
  // suppress unused lint
  void day;
}

function getWeekLabel(weekOffset: number): string {
  const monday = getMondayOfWeek(weekOffset);
  const { year, month, weekNum } = getMonthWeekNumber(monday);
  return `${year}年${month}月 第${weekNum}周`;
}

function slotKeyFor(therapistId: string, date: string, slot: SlotLabel): string {
  return `${therapistId}_${date}_${slot}`;
}

function slotLabelFromTimeSlot(timeSlot: string): SlotLabel {
  const h = parseInt(timeSlot.split(':')[0]);
  if (h < 12) return '上午';
  if (h < 18) return '下午';
  return '晚上';
}

function appointmentDateTime(date: string, hour: string, minute: string): Date | null {
  const [year, month, day] = date.split('-').map(Number);
  const h = Number(hour);
  const m = Number(minute);
  if (![year, month, day, h, m].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, h, m, 0, 0);
}

function isAppointmentTimePast(date: string, hour: string, minute: string, now = new Date()): boolean {
  const value = appointmentDateTime(date, hour, minute);
  return !value || value.getTime() <= now.getTime();
}

function isSlotExpired(date: string, slot: (typeof TIME_SLOTS)[number], now = new Date()): boolean {
  const today = getLocalDateKey(now);
  if (date < today) return true;
  if (date > today) return false;
  const lastSelectableHour = String(Number(slot.end) - 1).padStart(2, '0');
  const lastSelectableTime = appointmentDateTime(date, lastSelectableHour, '59');
  return !lastSelectableTime || lastSelectableTime.getTime() <= now.getTime();
}

function getOrderForAppointment(appt: Pick<Appointment, 'customerId' | 'customerName'>, orders: any[]) {
  return orders.find(order => order.customerId === appt.customerId || order.customerCode === appt.customerId)
    ?? orders.find(order => order.customerName === appt.customerName)
    ?? null;
}

// ─── TherapistMultiSelect ─────────────────────────────────────────────────────

interface TherapistMultiSelectProps {
  therapists: any[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

function TherapistMultiSelect({ therapists, selectedIds, onChange, disabled = false }: TherapistMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selectedIds.length === 0;

  function toggleAll() { onChange([]); }

  function toggleOne(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  let label = '全部技师';
  if (!allSelected) {
    if (selectedIds.length === 1) {
      const t = therapists.find(t => t.id === selectedIds[0]);
      label = t ? `${t.name} · ${t.therapistType}` : '1位技师';
    } else {
      label = `已选 ${selectedIds.length} 位技师`;
    }
  }

  return (
    <div ref={ref} className="relative" style={{ minWidth: 180 }}>
      <button
        className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 outline-none font-medium transition-colors hover:opacity-80"
        style={{
          border: '1.5px solid var(--border)',
          background: 'var(--muted)',
          color: allSelected ? 'var(--muted-foreground)' : 'var(--foreground)',
          height: 36,
          width: '100%',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          pointerEvents: disabled ? 'none' : 'auto',
        }}
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDownIcon size={14} style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <div
          className="absolute z-50 rounded-xl shadow-custom py-1.5"
          style={{
            top: 'calc(100% + 4px)', left: 0,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            minWidth: 220,
          }}
        >
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
            style={{ color: 'var(--foreground)' }}
            onClick={toggleAll}
          >
            <div
              className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
              style={{
                border: `1.5px solid ${allSelected ? 'var(--brand)' : 'var(--border)'}`,
                background: allSelected ? 'var(--brand)' : 'transparent',
              }}
            >
              {allSelected && <CheckIcon size={10} color="#fff" />}
            </div>
            <span className="font-medium">全部技师</span>
          </button>
          <div style={{ borderBottom: '1px solid var(--border)', margin: '4px 0' }} />
          {CITY_GROUPS.map(city => {
            const cityTherapists = therapists.filter(therapist => therapist.city === city);
            if (cityTherapists.length === 0) return null;
            return (
              <div key={city}>
                <div className="px-3 pt-2 pb-1 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{city}</div>
                {cityTherapists.map(t => {
                  const checked = selectedIds.includes(t.id);
                  const color = THERAPIST_COLORS[therapists.findIndex(therapist => therapist.id === t.id) % THERAPIST_COLORS.length];
                  return (
                    <button
                      key={t.id}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                      style={{ color: 'var(--foreground)' }}
                      onClick={() => toggleOne(t.id)}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{
                          border: `1.5px solid ${checked ? 'var(--brand)' : 'var(--border)'}`,
                          background: checked ? 'var(--brand)' : 'transparent',
                        }}
                      >
                        {checked && <CheckIcon size={10} color="#fff" />}
                      </div>
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: color, fontSize: 10 }}
                      >
                        {t.name[0]}
                      </div>
                      <span className="truncate">{t.name}</span>
                      <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>{t.therapistType}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AppointmentCard ──────────────────────────────────────────────────────────

interface AppointmentCardProps {
  appt: Appointment;
  showTherapist?: boolean;
  therapistColor?: string;
  usedTimes?: number;
  // Edit mode operation bar
  editMode?: boolean;
  isConfirmingCancel?: boolean;
  onRequestCancel?: () => void;
  onConfirmCancel?: () => void;
  onAbortCancel?: () => void;
  isEditingRemark?: boolean;
  onToggleRemark?: () => void;
  remarkDraft?: string;
  onRemarkChange?: (v: string) => void;
  onRemarkSave?: () => void;
  onReschedule?: () => void;
  onComplete?: () => void;
}

function AppointmentCard({
  appt,
  showTherapist = false,
  therapistColor = '#1E88E5',
  usedTimes,
  editMode = false,
  isConfirmingCancel = false,
  onRequestCancel = () => {},
  onConfirmCancel = () => {},
  onAbortCancel = () => {},
  isEditingRemark = false,
  onToggleRemark = () => {},
  remarkDraft = '',
  onRemarkChange = () => {},
  onRemarkSave = () => {},
  onReschedule = () => {},
  onComplete = () => {},
}: AppointmentCardProps) {
  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const ORDERS: any[] = ordersQ.data?.data ?? [];
  const order = getOrderForAppointment(appt, ORDERS);
  const isCancelled = isCancelledAppointment(appt);
  const isExperience = !isCancelled && order?.type === '体验卡' && !order?.isUpgrade;
  const isPackage = !isCancelled && (order?.type === '套餐' || order?.isUpgrade);

  let bg = '#F5F5F5';
  let text = '#757575';
  let border = '#E0E0E0';

  if (isCancelled) {
    bg = '#F5F5F5'; text = '#9E9E9E'; border = '#E0E0E0';
  } else if (isExperience) {
    bg = '#FFF7ED'; text = '#C2410C'; border = '#FDBA74';
  } else if (isPackage) {
    bg = '#EFF6FF'; text = '#1D4ED8'; border = '#93C5FD';
  }

  const displayUsedTimes = usedTimes !== undefined ? usedTimes : (order?.usedTimes ?? 0);
  const area = appt.area;
  const canComplete = !editMode && !isCancelled && appt.status !== '已完成' && appt.date <= getLocalDateKey();

  return (
    <div
      className="rounded-lg px-2 py-1.5 text-xs mb-1 transition-opacity"
      style={{
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        wordBreak: 'break-all',
        whiteSpace: 'normal',
        width: '100%',
        boxSizing: 'border-box',
        display: 'block',
      }}
    >
      {/* Therapist tag when multi-select */}
      {showTherapist && (
        <div className="mb-0.5" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: therapistColor }} />
          <span style={{ opacity: 0.7, fontSize: 11 }}>{appt.therapistName}</span>
        </div>
      )}
      {/* Row 1: area + name */}
      <div className="mb-0.5">
        {area && <span style={{ opacity: 0.6 }}>{area} </span>}
        <span className="font-semibold">
          {appt.customerName}{appt.advisorName ? `（${appt.advisorName}）` : ''}
        </span>
      </div>
      {/* Row 2: time */}
      <div style={{ opacity: 0.75 }} className="mb-0.5">{appt.timeSlot}</div>
      <div
        className="mb-0.5"
        style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={appt.service || '未填写服务项目'}
      >
        项目：{appt.service || '—'}
      </div>
      {/* Row 3: type-specific info */}
      {isCancelled && (
        <div style={{ opacity: 0.72 }}>
          <div>已取消</div>
          <div style={{ color: '#16A34A' }}>时段已释放，可重新预约</div>
        </div>
      )}
      {isExperience && order && (
        <div style={{ opacity: 0.8 }}>
          {order.payStatus === '已付款' ? '已付款' : '待付款'}
        </div>
      )}
      {isPackage && order && (
        <div style={{ opacity: 0.8 }}>
          第{displayUsedTimes}次/共{order.totalTimes}次
        </div>
      )}
      {appt.status === '已完成' && <div className="mt-1 font-medium" style={{ color: '#16A34A' }}>已完成服务</div>}
      {canComplete && (
        <button
          className="mt-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:opacity-85"
          style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}
          onClick={e => { e.stopPropagation(); onComplete(); }}
        >
          确认已完成
        </button>
      )}
      {/* Remark display (non-edit mode) */}
      {!editMode && appt.remark && (
        <div className="mt-0.5" style={{ opacity: 0.6, fontSize: 10 }}>备注：{appt.remark}</div>
      )}

      {/* Edit mode operation bar */}
      {editMode && (
        <div
          className="mt-1 pt-1"
          style={{ borderTop: `1px solid ${border}` }}
        >
          {/* Confirm cancel inline prompt */}
          {isConfirmingCancel ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span style={{ color: '#DC2626', fontSize: 10, fontWeight: 600 }}>确认取消预约？</span>
              <button
                className="px-1.5 py-0.5 rounded text-xs font-medium transition-colors"
                style={{ background: '#DC2626', color: '#fff', border: 'none' }}
                onClick={e => { e.stopPropagation(); onConfirmCancel(); }}
              >
                确定
              </button>
              <button
                className="px-1.5 py-0.5 rounded text-xs font-medium transition-colors"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                onClick={e => { e.stopPropagation(); onAbortCancel(); }}
              >
                算了
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              {!isCancelled && appt.status !== '已完成' && (
                <button
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80"
                  style={{ background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
                  onClick={e => { e.stopPropagation(); onReschedule(); }}
                >
                  <EditIcon size={10} />
                  调整时间
                </button>
              )}
              {/* Remark toggle button */}
              <button
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                onClick={e => { e.stopPropagation(); onToggleRemark(); }}
              >
                <MessageSquareIcon size={10} />
                备注
              </button>
              {/* Cancel button — only for non-cancelled appts */}
              {!isCancelled && (
                <button
                  className="px-1.5 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80"
                  style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
                  onClick={e => { e.stopPropagation(); onRequestCancel(); }}
                >
                  取消预约
                </button>
              )}
            </div>
          )}

          {/* Inline remark editor */}
          {isEditingRemark && (
            <div className="mt-1 flex items-center gap-1">
              <input
                className="flex-1 rounded px-1.5 py-1 text-xs outline-none"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  minWidth: 0,
                }}
                placeholder="输入备注..."
                value={remarkDraft}
                onChange={e => onRemarkChange(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
              <button
                className="px-1.5 py-1 rounded text-xs font-medium transition-colors hover:opacity-80 flex-shrink-0"
                style={{ background: 'var(--brand)', color: '#fff' }}
                onClick={e => { e.stopPropagation(); onRemarkSave(); }}
              >
                保存
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WeekPicker Popover ───────────────────────────────────────────────────────

interface WeekPickerProps {
  weekOffset: number;
  onClose: () => void;
  onSelect: (offset: number) => void;
}
function WeekPicker({ weekOffset, onClose, onSelect }: WeekPickerProps) {
  const baseMonday = getMondayOfWeek(weekOffset);
  const { year: baseYear, month: baseMonth } = getMonthWeekNumber(baseMonday);
  const [pickerYear, setPickerYear] = useState(baseYear);
  const [pickerMonth, setPickerMonth] = useState(baseMonth);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function getMondayOfNthWeek(year: number, month: number, n: number): Date {
    const firstOfMonth = new Date(year, month - 1, 1);
    const firstDow = firstOfMonth.getDay();
    const firstMondayOffset = firstDow === 0 ? -6 : 1 - firstDow;
    const firstWeekMonday = new Date(firstOfMonth);
    firstWeekMonday.setDate(firstOfMonth.getDate() + firstMondayOffset);
    const result = new Date(firstWeekMonday);
    result.setDate(firstWeekMonday.getDate() + (n - 1) * 7);
    return result;
  }

  function handleSelectWeek(n: number) {
    const monday = getMondayOfNthWeek(pickerYear, pickerMonth, n);
    const thisMonday = getMondayOfWeek(0);
    const diffDays = Math.round((monday.getTime() - thisMonday.getTime()) / 86400000);
    const newOffset = Math.round(diffDays / 7);
    onSelect(newOffset);
    onClose();
  }

  const years = Array.from({ length: 5 }, (_, i) => 2023 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const { year: curY, month: curM, weekNum: curW } = getMonthWeekNumber(baseMonday);

  return (
    <div
      ref={ref}
      className="absolute z-50 rounded-xl shadow-custom p-4"
      style={{
        top: '110%', left: '50%', transform: 'translateX(-50%)',
        background: 'var(--card)', border: '1px solid var(--border)',
        minWidth: 220,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <select
          className="flex-1 text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{ border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)' }}
          value={pickerYear}
          onChange={e => setPickerYear(Number(e.target.value))}
        >
          {years.map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select
          className="flex-1 text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{ border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)' }}
          value={pickerMonth}
          onChange={e => setPickerMonth(Number(e.target.value))}
        >
          {months.map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        {[1, 2, 3, 4].map(n => {
          const isCurrent = pickerYear === curY && pickerMonth === curM && n === curW;
          return (
            <button
              key={n}
              className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors font-medium hover:opacity-80"
              style={{
                background: isCurrent ? 'var(--brand)' : 'var(--muted)',
                color: isCurrent ? '#fff' : 'var(--foreground)',
              }}
              onClick={() => handleSelectWeek(n)}
            >
              第{n}周
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CreateModal ──────────────────────────────────────────────────────────────

interface RescheduleModalProps {
  visible: boolean;
  appointment: Appointment | null;
  baseWeekOffset: number;
  localAppts: Appointment[];
  slotStatus: Record<string, ScheduleState>;
  onClose: () => void;
  onSave: (appointment: Appointment, date: string, timeSlot: string) => Promise<void>;
}

function RescheduleModal({
  visible,
  appointment,
  baseWeekOffset,
  localAppts,
  slotStatus,
  onClose,
  onSave,
}: RescheduleModalProps) {
  const [weekIndex, setWeekIndex] = useState<0 | 1>(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<SlotLabel | ''>('');
  const [startHour, setStartHour] = useState('09');
  const [startMin, setStartMin] = useState('00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !appointment) return;
    setWeekIndex(0);
    setSelectedDate(appointment.date);
    setSelectedSlot(slotLabelFromTimeSlot(appointment.timeSlot));
    const [hour = '09', minute = '00'] = appointment.timeSlot.split(':');
    setStartHour(hour);
    setStartMin(minute);
    setSaving(false);
  }, [visible, appointment]);

  const weekDates = useMemo(
    () => getWeekDates(baseWeekOffset + weekIndex),
    [baseWeekOffset, weekIndex]
  );

  function hourOptions(slot: SlotLabel | ''): string[] {
    const definition = TIME_SLOTS.find(item => item.label === slot);
    if (!definition) return [];
    const start = Number(definition.start);
    const end = Number(definition.end) - 1;
    return Array.from({ length: end - start + 1 }, (_, index) => String(start + index).padStart(2, '0'));
  }

  function minuteOptions(slot: SlotLabel | '', hour: string): string[] {
    const options = ['00', '15', '30', '45'];
    const definition = TIME_SLOTS.find(item => item.label === slot);
    if (definition && Number(hour) === Number(definition.end) - 1) options.push('59');
    return options;
  }

  function firstAvailableTime(date: string, slot: SlotLabel): { hour: string; minute: string } | null {
    for (const hour of hourOptions(slot)) {
      for (const minute of minuteOptions(slot, hour)) {
        if (!isAppointmentTimePast(date, hour, minute)) return { hour, minute };
      }
    }
    return null;
  }

  function isAvailable(date: string, slot: SlotLabel): boolean {
    if (!appointment) return false;
    const definition = TIME_SLOTS.find(item => item.label === slot);
    if (!definition || isSlotExpired(date, definition)) return false;
    if ((slotStatus[slotKeyFor(appointment.therapistId, date, slot)] ?? '空闲') !== '空闲') return false;
    const sameSlotAppointments = localAppts.filter(item =>
      item.therapistId === appointment.therapistId
      && item.date === date
      && slotLabelFromTimeSlot(item.timeSlot) === slot
    );
    return !hasBlockingAppointmentExcluding(sameSlotAppointments, appointment.id);
  }

  function selectSlot(date: string, slot: SlotLabel) {
    if (!isAvailable(date, slot)) return;
    const first = firstAvailableTime(date, slot);
    if (!first) return;
    setSelectedDate(date);
    setSelectedSlot(slot);
    setStartHour(first.hour);
    setStartMin(first.minute);
  }

  async function submit() {
    if (!appointment || !selectedDate || !selectedSlot || saving) return;
    if (!isAvailable(selectedDate, selectedSlot)) {
      toast.error('该时间段已不可预约，请重新选择');
      return;
    }
    if (isAppointmentTimePast(selectedDate, startHour, startMin)) {
      toast.error('已经过去的时间不能改约');
      return;
    }
    setSaving(true);
    try {
      await onSave(appointment, selectedDate, `${startHour}:${startMin}`);
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !appointment) return null;
  const changed = selectedDate !== appointment.date || `${startHour}:${startMin}` !== appointment.timeSlot;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="rounded-2xl shadow-custom overflow-hidden" style={{ width: 760, maxWidth: 'calc(100vw - 32px)', background: 'var(--card)' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="font-bold text-lg text-foreground">调整预约时间</div>
            <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
              {appointment.customerName} · {appointment.therapistName} · 当前 {appointment.date} {appointment.timeSlot}
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted" onClick={onClose}><XIcon size={18} /></button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-medium text-sm text-foreground">选择该技师的其他空闲时间</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>已占用、忙碌、待定和已过期时段不可选择</div>
            </div>
            <div className="flex rounded-lg p-1" style={{ background: 'var(--muted)' }}>
              {([0, 1] as const).map(index => {
                const dates = getWeekDates(baseWeekOffset + index);
                return (
                  <button
                    key={index}
                    className="px-3 py-1.5 rounded-md text-xs font-medium"
                    style={{ background: weekIndex === index ? 'var(--brand)' : 'transparent', color: weekIndex === index ? '#fff' : 'var(--muted-foreground)' }}
                    onClick={() => setWeekIndex(index)}
                  >
                    {index === 0 ? '本显示周' : '下一周'} {formatDisplayDate(dates[0])}–{formatDisplayDate(dates[6])}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="grid" style={{ gridTemplateColumns: '72px repeat(7, minmax(0, 1fr))', background: 'var(--muted)' }}>
              <div className="px-2 py-3 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>时段</div>
              {weekDates.map((date, index) => (
                <div key={date} className="px-1 py-2 text-center text-xs" style={{ borderLeft: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--muted-foreground)' }}>{WEEK_DAYS[index]}</div>
                  <div className="font-semibold mt-0.5 text-foreground">{formatDisplayDate(date)}</div>
                </div>
              ))}
            </div>
            {TIME_SLOTS.map(slot => (
              <div key={slot.label} className="grid" style={{ gridTemplateColumns: '72px repeat(7, minmax(0, 1fr))', borderTop: '1px solid var(--border)' }}>
                <div className="px-2 py-3 text-xs font-medium text-foreground">{slot.label}</div>
                {weekDates.map(date => {
                  const available = isAvailable(date, slot.label);
                  const active = selectedDate === date && selectedSlot === slot.label;
                  const current = appointment.date === date && slotLabelFromTimeSlot(appointment.timeSlot) === slot.label;
                  return (
                    <div key={date} className="p-1.5" style={{ borderLeft: '1px solid var(--border)' }}>
                      <button
                        className="w-full rounded-md py-2 text-xs font-medium"
                        disabled={!available}
                        style={{
                          background: active ? '#DBEAFE' : available ? '#F0FDF4' : 'var(--muted)',
                          color: active ? '#1D4ED8' : available ? '#16A34A' : 'var(--muted-foreground)',
                          border: `1px solid ${active ? '#60A5FA' : available ? '#86EFAC' : 'var(--border)'}`,
                          opacity: available ? 1 : 0.55,
                          cursor: available ? 'pointer' : 'not-allowed',
                        }}
                        onClick={() => selectSlot(date, slot.label)}
                      >
                        {current ? '当前' : available ? '空闲' : '不可选'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>精确开始时间</span>
            <select className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--card)' }} value={startHour} onChange={event => setStartHour(event.target.value)} disabled={!selectedSlot}>
              {hourOptions(selectedSlot).map(hour => <option key={hour} value={hour}>{hour}时</option>)}
            </select>
            <span>:</span>
            <select className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--card)' }} value={startMin} onChange={event => setStartMin(event.target.value)} disabled={!selectedSlot}>
              {minuteOptions(selectedSlot, startHour).map(minute => <option key={minute} value={minute}>{minute}分</option>)}
            </select>
            {selectedDate && <span className="text-sm font-medium text-foreground">{selectedDate}</span>}
          </div>
        </div>

        <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="px-4 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }} onClick={onClose}>取消</button>
          <button className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: 'var(--brand)' }} disabled={!changed || saving} onClick={submit}>
            {saving ? '保存中...' : '确认改约'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CreateModalProps {
  visible: boolean;
  therapistId: string;
  localAppts: Appointment[];
  slotStatus: Record<string, ScheduleState>;
  localOrderUsedTimes: Record<string, number>;
  initialCustomerId?: string;
  onClose: () => void;
  onSave: (newAppt: Appointment, orderId: string) => Promise<void>;
}

function CreateModal({
  visible, therapistId, localAppts, slotStatus,
  localOrderUsedTimes,
  initialCustomerId = '',
  onClose, onSave,
}: CreateModalProps) {
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const customersQ = useCustomers({ page: 1, pageSize: 1000 });
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];
  const ORDERS: any[] = ordersQ.data?.data ?? [];
  const CUSTOMERS: any[] = customersQ.data?.data ?? [];

  const therapist = THERAPISTS.find(t => t.id === therapistId);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<SlotLabel | ''>('');
  const [bookingWeekOffset, setBookingWeekOffset] = useState<0 | 1>(0);
  const [startHour, setStartHour] = useState('09');
  const [startMin, setStartMin] = useState('00');
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedOrder = ORDERS.find(o => o.id === selectedOrderId) ?? null;
  const isPackageOrder = selectedOrder ? (selectedOrder.type === '套餐' || selectedOrder.isUpgrade) : false;

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setStep(1);
      setSearch('');
      setSelectedOrderId('');
      setSelectedDate('');
      setSelectedSlot('');
      setBookingWeekOffset(0);
      setStartHour('09');
      setStartMin('00');
      setRemark('');
      setIsSubmitting(false);
    }
  }, [visible]);

  const bookingWeekDates = useMemo(
    () => getBookingWeekDates(bookingWeekOffset),
    [bookingWeekOffset]
  );

  function selectBookingWeek(offset: 0 | 1) {
    setBookingWeekOffset(offset);
    setSelectedDate('');
    setSelectedSlot('');
    setStartHour('09');
    setStartMin('00');
  }

  useEffect(() => {
    if (!visible || !initialCustomerId || ORDERS.length === 0) return;
    const matchedOrder = ORDERS.find(order =>
      order.customerId === initialCustomerId || order.customerCode === initialCustomerId
    );
    if (matchedOrder) setSelectedOrderId(matchedOrder.id);
  }, [visible, initialCustomerId, ORDERS.length]);

  const eligibleOrders = ORDERS.filter(o => o.payStatus !== '已退款');
  const filteredOrders = eligibleOrders.filter(o => {
    const cust = CUSTOMERS.find(c => c.name === o.customerName);
    const area = cust?.area ?? '';
    const q = search.toLowerCase();
    return o.customerName.toLowerCase().includes(q) || area.toLowerCase().includes(q);
  });

  const selectedCustomer = selectedOrder
    ? (CUSTOMERS.find(c => c.id === selectedOrder.customerId || c._id === selectedOrder.customerId)
      ?? CUSTOMERS.find(c => c.name === selectedOrder.customerName)
      ?? null)
    : null;
  const syncedService = getAppointmentServiceFromRecord(selectedOrder, selectedCustomer);
  const serviceRecordRequired = requiresRecordedAppointmentService(selectedOrder);
  const serviceRecordMissing = serviceRecordRequired && !syncedService;

  // Current used times for selected order
  const currentUsedTimes = selectedOrder
    ? (localOrderUsedTimes[selectedOrder.id] ?? selectedOrder.usedTimes)
    : 0;

  function isSlotFree(date: string, slot: SlotLabel): boolean {
    const slotDefinition = TIME_SLOTS.find(item => item.label === slot);
    if (!slotDefinition || isSlotExpired(date, slotDefinition)) return false;
    const key = slotKeyFor(therapistId, date, slot);
    const status = slotStatus[key] ?? '空闲';
    const hasAppt = localAppts.some(a =>
      a.therapistId === therapistId &&
      a.date === date &&
      slotLabelFromTimeSlot(a.timeSlot) === slot &&
      appointmentBlocksSlot(a)
    );
    return status === '空闲' && !hasAppt;
  }

  function firstAvailableTime(date: string, slot: (typeof TIME_SLOTS)[number]): { hour: string; minute: string } | null {
    const hours = getHourOptions(slot.label);
    for (const hour of hours) {
      for (const minute of getMinuteOptions(slot.label, hour)) {
        if (!isAppointmentTimePast(date, hour, minute)) return { hour, minute };
      }
    }
    return null;
  }

  function getHourOptions(slot: SlotLabel): string[] {
    const s = TIME_SLOTS.find(t => t.label === slot);
    if (!s) return [];
    const start = parseInt(s.start);
    const end = parseInt(s.end) - 1;
    return Array.from({ length: end - start + 1 }, (_, i) => String(start + i).padStart(2, '0'));
  }

  function getMinuteOptions(slot: SlotLabel | '', hour: string): string[] {
    const options = ['00', '15', '30', '45'];
    const definition = TIME_SLOTS.find(item => item.label === slot);
    if (definition && Number(hour) === Number(definition.end) - 1) options.push('59');
    return options;
  }

  async function handleConfirm() {
    if (isSubmitting || !selectedOrder || !selectedDate || !selectedSlot || !therapist) return;
    if (serviceRecordMissing) {
      toast.error('客户档案尚未配置服务项目，请先到订单列表补充后再预约');
      return;
    }
    if (isAppointmentTimePast(selectedDate, startHour, startMin)) {
      toast.error('已经过去的时间不能预约，请重新选择');
      return;
    }
    const area = selectedOrder?.area || selectedCustomer?.area || '';
    const service = syncedService;
    const newAppt: Appointment = {
      id: `A${Date.now()}`,
      customerId: selectedOrder.customerId,
      customerName: selectedOrder.customerName,
      therapistId: therapist.id,
      therapistName: therapist.name,
      advisorName: selectedOrder.advisor || selectedCustomer?.advisor || '',
      date: selectedDate,
      timeSlot: `${startHour}:${startMin}`,
      service,
      status: '待确认' as ApptStatus,
      area,
      remark,
    };
    setIsSubmitting(true);
    try {
      await onSave(newAppt, selectedOrder.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!therapist) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200"
      style={{
        background: 'rgba(0,0,0,0.45)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="rounded-2xl shadow-custom flex flex-col overflow-hidden"
        style={{ width: 600, maxHeight: '90vh', background: 'var(--card)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-bold text-lg text-foreground">新建预约</span>
          <div className="flex items-center gap-1.5 ml-3">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                  style={{
                    background: step > s ? 'var(--success)' : step === s ? 'var(--brand)' : 'var(--border)',
                    color: step >= s ? '#fff' : 'var(--muted-foreground)',
                  }}
                >
                  {step > s ? <CheckIcon size={11} /> : s}
                </div>
                <span className="text-xs" style={{ color: step === s ? 'var(--brand)' : 'var(--muted-foreground)' }}>
                  {s === 1 ? '选择客户' : '选时确认'}
                </span>
                {s < 2 && <div className="w-8 h-px mx-1" style={{ background: 'var(--border)' }} />}
              </div>
            ))}
          </div>
          <button className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={onClose}>
            <XIcon size={16} style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        {/* Therapist Banner */}
        <div className="px-6 py-2.5 flex items-center gap-3 flex-shrink-0" style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            {therapist.name[0]}
          </div>
          <div>
            <span className="font-semibold text-sm text-foreground">{therapist.name}</span>
            <span className="mx-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>{therapist.therapistType}</span>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{therapist.area}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Step 1: Customer list */}
          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3" style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}>
              <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--foreground)' }}
                placeholder="搜索客户姓名或区域..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              {filteredOrders.map(order => {
                const cust = CUSTOMERS.find(c => c.name === order.customerName);
                const isSelected = selectedOrderId === order.id;
                const isPkg = order.type === '套餐' || order.isUpgrade;
                const localUsed = localOrderUsedTimes[order.id] ?? order.usedTimes;
                return (
                  <div
                    key={order.id}
                    className="rounded-xl px-4 py-3 cursor-pointer transition-all"
                    style={{
                      border: isSelected ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                      background: isSelected ? '#EFF6FF' : 'var(--card)',
                    }}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{order.customerName}</span>
                        {cust?.area && (
                          <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--muted-foreground)' }}>
                            <MapPinIcon size={11} />{cust.area}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-xs rounded px-1.5 py-0.5 font-medium"
                          style={isPkg
                            ? { background: '#BFDBFE', color: '#1E40AF' }
                            : { background: '#FED7AA', color: '#9A3412' }
                          }
                        >
                          {order.type}
                        </span>
                        <span
                          className="text-xs rounded px-1.5 py-0.5"
                          style={order.payStatus === '已付款'
                            ? { background: '#DCFCE7', color: '#16A34A' }
                            : { background: '#FEF9C3', color: '#B45309' }
                          }
                        >
                          {order.payStatus}
                        </span>
                      </div>
                    </div>
                    {isPkg && (
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        已服务 {localUsed} 次 / 共 {order.totalTimes} 次
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredOrders.length === 0 && (
                <div className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无匹配客户</div>
              )}
            </div>
          </div>

          {/* Step 2: Date + time + service */}
          <div style={{ display: step === 2 ? 'block' : 'none' }}>
            {selectedOrder && (
              <div className="flex flex-col gap-4">
                {/* Customer summary */}
                <div className="rounded-xl px-4 py-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>客户信息</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{selectedOrder.customerName}</span>
                    {selectedCustomer?.area && (
                      <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        <MapPinIcon size={11} />{selectedCustomer.area}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {selectedOrder.type} · {selectedOrder.payStatus}
                      {isPackageOrder && ` · 即将服务第${currentUsedTimes + 1}次/共${selectedOrder.totalTimes}次`}
                    </span>
                  </div>
                </div>

                {/* Service is authoritative customer/order record data, never edited during booking. */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-sm font-medium text-foreground">服务项目</div>
                    <div className="text-xs flex items-center gap-1" style={{ color: serviceRecordMissing ? '#D97706' : '#16A34A' }}>
                      {serviceRecordMissing ? <XIcon size={13} /> : <CheckIcon size={13} />}
                      {serviceRecordMissing ? '档案未配置' : '已从客户档案同步'}
                    </div>
                  </div>
                  <div
                    className="w-full rounded-lg px-3 py-2.5 text-sm"
                    style={{
                      border: `1px solid ${serviceRecordMissing ? '#FCD34D' : 'var(--border)'}`,
                      background: serviceRecordMissing ? '#FFFBEB' : 'var(--muted)',
                      color: serviceRecordMissing ? '#B45309' : 'var(--foreground)',
                      minHeight: 40,
                    }}
                  >
                    {syncedService || '客户档案尚未配置服务项目，请先到订单列表补充'}
                  </div>
                  <div className="mt-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    预约服务项目与客户档案保持一致，此处不可手动修改
                  </div>
                </div>

                {/* Week slot picker */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">选择时间（仅空闲时段可选）</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        可预约本周和下一周，以周为单位切换
                      </div>
                    </div>
                    <div className="flex items-center rounded-lg p-1" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      {([0, 1] as const).map(offset => {
                        const active = bookingWeekOffset === offset;
                        return (
                          <button
                            key={offset}
                            type="button"
                            className="rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                              background: active ? 'var(--brand)' : 'transparent',
                              color: active ? '#fff' : 'var(--muted-foreground)',
                            }}
                            onClick={() => selectBookingWeek(offset)}
                          >
                            {bookingWeekRangeLabel(offset)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                    <table style={{ minWidth: 460, width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          <th className="text-xs font-semibold py-2 px-2 text-left" style={{ color: 'var(--muted-foreground)', width: 52, borderRight: '1px solid var(--border)' }}>时段</th>
                          {bookingWeekDates.map((d, i) => (
                            <th key={d} className="text-xs font-semibold py-2 px-1 text-center" style={{ color: 'var(--muted-foreground)', borderRight: i < 6 ? '1px solid var(--border)' : 'none' }}>
                              <div>{WEEK_DAYS[i]}</div>
                              <div className="font-bold text-foreground">{formatDisplayDate(d)}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {TIME_SLOTS.map(slot => (
                          <tr key={slot.label} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="text-xs px-2 py-1.5 align-middle" style={{ color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                              <div className="font-medium">{slot.label}</div>
                            </td>
                            {bookingWeekDates.map((date, di) => {
                              const free = isSlotFree(date, slot.label);
                              const expired = isSlotExpired(date, slot);
                              const isSel = selectedDate === date && selectedSlot === slot.label;
                              return (
                                <td key={date} className="px-1 py-1 text-center" style={{ borderRight: di < 6 ? '1px solid var(--border)' : 'none' }}>
                                  <button
                                    className="w-full rounded py-1.5 text-xs font-medium transition-all"
                                    disabled={!free}
                                    style={isSel
                                      ? { background: 'var(--brand)', color: '#fff', border: '2px solid var(--brand)' }
                                      : free
                                        ? { background: '#F0FDF4', color: '#16A34A', border: '1px solid #86EFAC', cursor: 'pointer' }
                                        : { background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: 'not-allowed', opacity: 0.45 }
                                    }
                                    onClick={() => {
                                      if (!free) return;
                                      const firstTime = firstAvailableTime(date, slot);
                                      if (!firstTime) return;
                                      setSelectedDate(date);
                                      setSelectedSlot(slot.label);
                                      setStartHour(firstTime.hour);
                                      setStartMin(firstTime.minute);
                                    }}
                                  >
                                    {expired ? '已过期' : free ? '空闲' : '占用'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Start time */}
                <div style={{ opacity: selectedSlot ? 1 : 0.4, pointerEvents: selectedSlot ? 'auto' : 'none' }}>
                  <div className="text-sm font-medium text-foreground mb-2">开始时间</div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)' }}
                      value={startHour}
                      onChange={e => {
                        const hour = e.target.value;
                        setStartHour(hour);
                        if (selectedDate && isAppointmentTimePast(selectedDate, hour, startMin)) {
                          const minute = getMinuteOptions(selectedSlot, hour).find(value => !isAppointmentTimePast(selectedDate, hour, value));
                          if (minute) setStartMin(minute);
                        }
                      }}
                    >
                      {(selectedSlot ? getHourOptions(selectedSlot as SlotLabel) : ['09']).map(h => (
                        <option
                          key={h}
                          value={h}
                          disabled={selectedDate ? getMinuteOptions(selectedSlot, h).every(m => isAppointmentTimePast(selectedDate, h, m)) : false}
                        >
                          {h}时
                        </option>
                      ))}
                    </select>
                    <span className="font-medium text-foreground">:</span>
                    <select
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)' }}
                      value={startMin}
                      onChange={e => setStartMin(e.target.value)}
                    >
                      {getMinuteOptions(selectedSlot, startHour).map(m => (
                        <option
                          key={m}
                          value={m}
                          disabled={selectedDate ? isAppointmentTimePast(selectedDate, startHour, m) : false}
                        >
                          {m}分
                        </option>
                      ))}
                    </select>
                    {selectedDate && selectedSlot && (
                      <span className="text-sm ml-2" style={{ color: 'var(--muted-foreground)' }}>
                        {selectedDate} · {selectedSlot}
                      </span>
                    )}
                  </div>
                </div>

                {/* Remark */}
                <div>
                  <div className="text-sm font-medium text-foreground mb-2">备注</div>
                  <textarea
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    style={{ border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)' }}
                    rows={2}
                    placeholder="特殊情况说明..."
                    value={remark}
                    onChange={e => setRemark(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
            style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)', height: 36 }}
            onClick={() => { if (step > 1) setStep(1); else onClose(); }}
          >
            {step > 1 ? '上一步' : '取消'}
          </button>
          {step === 1 ? (
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--brand)', height: 36, opacity: selectedOrderId ? 1 : 0.5, pointerEvents: selectedOrderId ? 'auto' : 'none' }}
              onClick={() => { if (selectedOrderId) setStep(2); }}
            >
              下一步
            </button>
          ) : (
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              disabled={isSubmitting || serviceRecordMissing}
              style={{
                background: 'var(--brand)',
                height: 36,
                opacity: (selectedDate && selectedSlot && !isSubmitting && !serviceRecordMissing) ? 1 : 0.5,
                pointerEvents: (selectedDate && selectedSlot && !isSubmitting && !serviceRecordMissing) ? 'auto' : 'none',
                cursor: isSubmitting ? 'wait' : 'pointer',
              }}
              onClick={() => { if (selectedDate && selectedSlot && !isSubmitting && !serviceRecordMissing) void handleConfirm(); }}
            >
              确认保存
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EditScheduleBanner ───────────────────────────────────────────────────────

interface EditScheduleBannerProps {
  therapistName: string;
  onSave: () => void;
  onCancel: () => void;
}
function EditScheduleBanner({ therapistName, onSave, onCancel }: EditScheduleBannerProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl flex-shrink-0" style={{ background: '#FEF3C7', border: '1.5px solid #FCD34D' }}>
      <EditIcon size={15} style={{ color: '#D97706' }} />
      <span className="text-sm font-semibold" style={{ color: '#92400E' }}>
        正在编辑「{therapistName}」的档期
      </span>
      <span className="text-xs ml-1" style={{ color: '#B45309' }}>无预约时段可更改状态；有预约时段支持取消预约和备注</span>
      <div className="flex-1" />
      <button
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
        style={{ background: '#16A34A', color: '#fff' }}
        onClick={onSave}
      >
        <CheckIcon size={13} /> 确认保存
      </button>
      <button
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
        onClick={onCancel}
      >
        <XIcon size={13} /> 取消
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AppointmentsCalendarPage() {
  const { currentUser, setActivePage } = useApp();
  const isTherapist = currentUser.role === 'therapist';

  const apptsQ = useAppointments({ page: 1, pageSize: 1000 });
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const APPOINTMENTS: Appointment[] = apptsQ.data?.data ?? [];
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];
  const ORDERS: any[] = ordersQ.data?.data ?? [];
  const apptMutations = useAppointmentMutations();

  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[]>([]);
  const [localAppts, setLocalAppts] = useState<Appointment[]>([]);
  const [slotStatus, setSlotStatus] = useState<Record<string, ScheduleState>>({});
  const [editMode, setEditMode] = useState(false);
  const [draftSlotStatus, setDraftSlotStatus] = useState<Record<string, ScheduleState>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [prefillCustomerId, setPrefillCustomerId] = useState('');
  const [returnToOrderEditor, setReturnToOrderEditor] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<Appointment | null>(null);
  const [completionSignaturePhotos, setCompletionSignaturePhotos] = useState<UploadedFile[]>([]);
  const [completionUploading, setCompletionUploading] = useState(false);
  const [completionSaving, setCompletionSaving] = useState(false);

  const calendarTherapists = useMemo(
    () => getBoundTherapists(THERAPISTS, ORDERS, APPOINTMENTS),
    [THERAPISTS, ORDERS, APPOINTMENTS]
  );

  useEffect(() => {
    if (calendarTherapists.length === 0) return;
    const raw = sessionStorage.getItem('weikebenyuan:appointment-prefill');
    if (!raw) return;
    try {
      const prefill = JSON.parse(raw) as {
        customerId?: string;
        therapistNames?: string[];
        returnToOrderEditor?: boolean;
      };
      const therapist = calendarTherapists.find(item => prefill.therapistNames?.includes(item.name));
      if (therapist) {
        setSelectedTherapistIds([therapist.id]);
        setPrefillCustomerId(prefill.customerId || '');
        setReturnToOrderEditor(Boolean(prefill.returnToOrderEditor));
        setShowCreateModal(true);
        sessionStorage.removeItem('weikebenyuan:appointment-prefill');
      }
    } catch {
      sessionStorage.removeItem('weikebenyuan:appointment-prefill');
    }
  }, [calendarTherapists]);

  // The appointments table is the schedule source of truth. Replace existing local
  // rows as well as adding/removing rows so cancellations and reschedules are never stale.
  useEffect(() => {
    if (!apptsQ.data) return;
    setLocalAppts(replaceWithScheduleSnapshot(APPOINTMENTS));
  }, [apptsQ.data, APPOINTMENTS]);

  // ── New states for this feature set ──────────────────────────────────────
  // Track used times per order (runtime only, base values from server)
  const [localOrderUsedTimes, setLocalOrderUsedTimes] = useState<Record<string, number>>({});
  useEffect(() => {
    setLocalOrderUsedTimes(prev => {
      const next = { ...prev };
      ORDERS.forEach(o => {
        next[o.id] = o.usedTimes;
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ORDERS.length]);
  // Edit mode: inline remark editing state
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});

  const weekDates = getWeekDates(weekOffset);
  const weekLabel = getWeekLabel(weekOffset);

  const activeTherapistIds: string[] = isTherapist
    ? ['T001']
    : (selectedTherapistIds.length === 0 ? calendarTherapists.map(therapist => therapist.id) : selectedTherapistIds);

  const singleTherapistId: string = isTherapist
    ? 'T001'
    : (selectedTherapistIds.length === 1 ? selectedTherapistIds[0] : '');
  const canInteract = !!singleTherapistId && !editMode;

  const selectedTherapist = singleTherapistId ? calendarTherapists.find(t => t.id === singleTherapistId) : undefined;

  const therapistColorMap: Record<string, string> = {};
  calendarTherapists.forEach((t, i) => {
    therapistColorMap[t.id] = THERAPIST_COLORS[i % THERAPIST_COLORS.length];
  });

  function getDisplayedAppts(): Appointment[] {
    return localAppts.filter(a => activeTherapistIds.includes(a.therapistId));
  }

  function getApptsForCell(date: string, slot: SlotLabel): Appointment[] {
    return getDisplayedAppts().filter(a =>
      a.date === date && slotLabelFromTimeSlot(a.timeSlot) === slot
    );
  }

  function getSlotStatusForDisplay(tId: string, date: string, slot: SlotLabel): ScheduleState {
    const key = slotKeyFor(tId, date, slot);
    return (editMode ? draftSlotStatus[key] : slotStatus[key]) ?? '空闲';
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    if (returnToOrderEditor) {
      setReturnToOrderEditor(false);
      setActivePage('orders-list');
    }
  }

  function enterEditMode() {
    setDraftSlotStatus({ ...slotStatus });
    setEditMode(true);
    // Clear any pending edits
    setEditingRemarkId(null);
    setConfirmCancelId(null);
    setRescheduleTarget(null);
  }

  function saveEdit() {
    setSlotStatus({ ...draftSlotStatus });
    setEditMode(false);
    setEditingRemarkId(null);
    setConfirmCancelId(null);
    setRescheduleTarget(null);
    toast.success('档期已保存');
  }

  function cancelEdit() {
    setDraftSlotStatus({});
    setEditMode(false);
    setEditingRemarkId(null);
    setConfirmCancelId(null);
    setRescheduleTarget(null);
  }

  function handleSlotSelectChange(tId: string, date: string, slot: SlotLabel, value: ScheduleState) {
    const key = slotKeyFor(tId, date, slot);
    setDraftSlotStatus(prev => ({ ...prev, [key]: value }));
  }

  // Creating an appointment does not consume a service. It is counted only after completion.
  async function handleNewAppt(newAppt: Appointment, orderId: string): Promise<void> {
    const existing = localAppts.some(appointment =>
      appointment.therapistId === newAppt.therapistId
      && appointment.date === newAppt.date
      && appointment.timeSlot === newAppt.timeSlot
      && appointmentBlocksSlot(appointment)
    );
    if (existing) {
      toast.error('该技师此时间段已有预约，请重新选择');
      return;
    }

    try {
      const created = await apptMutations.create({
      customerId: newAppt.customerId,
      customerName: newAppt.customerName,
      therapistId: newAppt.therapistId,
      therapistName: newAppt.therapistName,
      date: newAppt.date,
      timeSlot: newAppt.timeSlot,
      service: newAppt.service,
      status: newAppt.status,
      area: newAppt.area,
      remark: newAppt.remark,
      });
      const persisted = { ...newAppt, id: created.no || created.id, _id: created.id };
      setLocalAppts(prev => prev.some(appointment => appointment.id === persisted.id) ? prev : [persisted, ...prev]);

      setShowCreateModal(false);
      toast.success(`已为「${newAppt.customerName}」创建预约`);
      if (returnToOrderEditor) {
        setReturnToOrderEditor(false);
        setActivePage('orders-list');
      }
    } catch (err: any) {
      toast.error('预约保存失败：' + (err?.message ?? ''));
    }
  }

  // Cancel an appointment (from edit mode)
  async function handleCancelAppt(apptId: string) {
    const previous = localAppts.find(appointment => appointment.id === apptId);
    setLocalAppts(prev => prev.map(a => {
      if (a.id !== apptId) return a;
      if (isCancelledAppointment(a)) return a; // no-op
      return { ...a, status: '已取消' as ApptStatus };
    }));
    try {
      await apptMutations.patchStatus({ id: apptId, status: '已取消' });
      setConfirmCancelId(null);
      toast.success('预约已取消，预约列表已同步更新');
    } catch (error: any) {
      if (previous) {
        setLocalAppts(prev => prev.map(item => item.id === apptId ? previous : item));
      }
      toast.error(error?.message || '取消预约失败');
    }
  }

  function handleCompleteAppt(apptId: string) {
    const appointment = localAppts.find(item => item.id === apptId);
    if (!appointment || appointment.status === '已完成') return;
    setCompletionTarget(appointment);
    setCompletionSignaturePhotos([]);
  }

  async function handleCompletionPhotoFiles(files: FileList | null) {
    if (!files?.length) return;
    const valid = Array.from(files).filter(file => file.type === 'image/png' || file.type === 'image/jpeg');
    const remaining = Math.max(0, 5 - completionSignaturePhotos.length);
    if (valid.length === 0 || remaining === 0) {
      toast.error(remaining === 0 ? '签字凭证最多上传 5 张' : '仅支持 PNG/JPG 图片');
      return;
    }
    setCompletionUploading(true);
    try {
      const uploaded = await uploadsApi.files(valid.slice(0, remaining), 'service-signatures');
      setCompletionSignaturePhotos(prev => [...prev, ...uploaded.data]);
    } catch (error: any) {
      toast.error(error?.message || '签字凭证上传失败');
    } finally {
      setCompletionUploading(false);
    }
  }

  async function confirmCompleteAppt() {
    const appointment = completionTarget;
    if (!appointment || completionSaving) return;
    setCompletionSaving(true);
    setLocalAppts(prev => prev.map(item => item.id === appointment.id ? { ...item, status: '已完成' as ApptStatus } : item));
    try {
      await apptMutations.patchStatus({
        id: appointment.id,
        status: '已完成',
        signaturePhotos: completionSignaturePhotos,
      });
      setCompletionTarget(null);
      setCompletionSignaturePhotos([]);
      toast.success('服务已确认完成，服务记录与订单进度已同步');
    } catch (error: any) {
      setLocalAppts(prev => prev.map(item => item.id === appointment.id ? appointment : item));
      toast.error(error?.message || '服务完成确认失败');
    } finally {
      setCompletionSaving(false);
    }
  }

  // Save remark for an appointment (from edit mode)
  async function handleSaveRemark(apptId: string) {
    const draft = remarkDrafts[apptId] ?? '';
    const previous = localAppts.find(appointment => appointment.id === apptId);
    setLocalAppts(prev => prev.map(a => a.id === apptId ? { ...a, remark: draft } : a));
    try {
      await apptMutations.update({ id: apptId, body: { remark: draft } });
      setEditingRemarkId(null);
      toast.success('备注已保存，预约列表已同步更新');
    } catch (error: any) {
      if (previous) {
        setLocalAppts(prev => prev.map(item => item.id === apptId ? previous : item));
      }
      toast.error(error?.message || '备注保存失败');
    }
  }

  async function handleRescheduleAppt(appointment: Appointment, date: string, timeSlot: string) {
    const previous = appointment;
    const next = { ...appointment, date, timeSlot };
    setLocalAppts(items => items.map(item => item.id === appointment.id ? next : item));
    try {
      await apptMutations.update({ id: appointment.id, body: { date, timeSlot } });
      setRescheduleTarget(null);
      toast.success(`已改约至 ${date} ${timeSlot}，预约列表已同步更新`);
    } catch (error: any) {
      setLocalAppts(items => items.map(item => item.id === appointment.id ? previous : item));
      toast.error(error?.message || '预约时间调整失败');
      throw error;
    }
  }

  const showTherapistOnCard = activeTherapistIds.length !== 1 && !isTherapist;

  return (
    <div data-cmp="AppointmentsCalendarPage" className="flex flex-col gap-3" style={{ minHeight: 0, height: '100%' }}>
      {/* Edit banner */}
      {editMode && selectedTherapist && (
        <EditScheduleBanner
          therapistName={selectedTherapist.name}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      )}

      {/* Controls bar */}
      <div className="mobile-page-toolbar bg-card rounded-xl px-4 py-3 shadow-custom flex flex-wrap items-center gap-3 flex-shrink-0">
        {!isTherapist && (
          <TherapistMultiSelect
            therapists={calendarTherapists}
            selectedIds={selectedTherapistIds}
            onChange={ids => {
              setSelectedTherapistIds(ids);
              if (editMode) cancelEdit();
            }}
          />
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#FFF7ED', border: '1px solid #FDBA74' }} />
            <span style={{ color: 'var(--muted-foreground)' }}>体验卡</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#EFF6FF', border: '1px solid #93C5FD' }} />
            <span style={{ color: 'var(--muted-foreground)' }}>套餐</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#F5F5F5', border: '1px solid #E0E0E0' }} />
            <span style={{ color: 'var(--muted-foreground)' }}>已取消</span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Week navigator */}
        <div className="flex items-center gap-1 relative">
          <button
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            style={{ border: '1px solid var(--border)' }}
            onClick={() => setWeekOffset(w => w - 1)}
          >
            <ChevronLeftIcon size={16} />
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors flex items-center gap-1.5"
            style={{ border: '1px solid var(--border)' }}
            onClick={() => setShowWeekPicker(v => !v)}
          >
            <CalendarIcon size={14} style={{ color: 'var(--brand)' }} />
            {weekLabel}
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            style={{ border: '1px solid var(--border)' }}
            onClick={() => setWeekOffset(w => w + 1)}
          >
            <ChevronRightIcon size={16} />
          </button>
          {showWeekPicker && (
            <WeekPicker
              weekOffset={weekOffset}
              onClose={() => setShowWeekPicker(false)}
              onSelect={offset => setWeekOffset(offset)}
            />
          )}
        </div>

        {/* Action buttons */}
        {!isTherapist && (
          <div className="flex items-center gap-2">
            <div className="relative" title={!singleTherapistId ? '请选择单位技师后操作' : ''}>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  border: '1.5px solid var(--border)',
                  color: canInteract ? 'var(--foreground)' : 'var(--muted-foreground)',
                  background: 'var(--muted)',
                  height: 36,
                  opacity: canInteract ? 1 : 0.5,
                  cursor: canInteract ? 'pointer' : 'not-allowed',
                  pointerEvents: canInteract ? 'auto' : 'none',
                }}
                onClick={() => { if (canInteract) enterEditMode(); }}
              >
                <EditIcon size={14} />
                档期更新
              </button>
            </div>
            <div className="relative" title={!singleTherapistId ? '请选择单位技师后操作' : ''}>
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{
                  background: 'var(--brand)',
                  height: 36,
                  opacity: canInteract ? 1 : 0.5,
                  cursor: canInteract ? 'pointer' : 'not-allowed',
                  pointerEvents: canInteract ? 'auto' : 'none',
                }}
                onClick={() => { if (canInteract) setShowCreateModal(true); }}
              >
                <PlusIcon size={14} />
                新建预约
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Weekly Calendar */}
      <div className="bg-card rounded-xl shadow-custom overflow-hidden flex-1" style={{ minHeight: 0 }}>
        <div className="overflow-auto" style={{ height: '100%' }}>
          <table style={{ minWidth: 720, width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: 'var(--muted)' }}>
                <th
                  className="text-left text-xs font-semibold px-3 py-3"
                  style={{ color: 'var(--muted-foreground)', width: 88, borderRight: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--muted)' }}
                >
                  时段
                </th>
                {weekDates.map((d, i) => {
                  const today = getLocalDateKey();
                  const isToday = d === today;
                  return (
                    <th
                      key={d}
                      className="text-center text-xs font-semibold px-2 py-3"
                      style={{
                        color: 'var(--muted-foreground)',
                        borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                        position: 'sticky', top: 0, zIndex: 2,
                        background: 'var(--muted)',
                      }}
                    >
                      <div>{WEEK_DAYS[i]}</div>
                      <div
                        className="text-sm font-bold mt-0.5 rounded-lg px-2 py-0.5 inline-block"
                        style={{
                          color: isToday ? '#fff' : 'var(--foreground)',
                          background: isToday ? 'var(--brand)' : 'transparent',
                        }}
                      >
                        {formatDisplayDate(d)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(slot => (
                <tr key={slot.label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td
                    className="px-3 py-3 align-top text-xs font-medium"
                    style={{
                      color: 'var(--muted-foreground)',
                      borderRight: '1px solid var(--border)',
                      verticalAlign: 'top',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div className="font-semibold text-foreground">{slot.label}</div>
                    <div className="opacity-60 mt-0.5">{slot.range}</div>
                  </td>
                  {weekDates.map((date, di) => {
                    const cellAppts = getApptsForCell(date, slot.label);
                    const hasActiveAppt = hasBlockingAppointment(cellAppts);

                    const schedState = singleTherapistId
                      ? getSlotStatusForDisplay(singleTherapistId, date, slot.label)
                      : '空闲';
                    const sc = SCHEDULE_COLORS[schedState];
                    const showStatusBg = !hasActiveAppt && schedState !== '空闲';

                    return (
                      <td
                        key={date}
                        className="px-2 py-2 align-top"
                        style={{
                          minHeight: 80,
                          verticalAlign: 'top',
                          borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                          background: showStatusBg ? sc.bg : 'transparent',
                          transition: 'background 0.2s',
                        }}
                      >
                        <div className="flex flex-col gap-1">
                          {/* Cancelled appointments remain visible but do not block the released slot. */}
                          {editMode && singleTherapistId && !hasActiveAppt && (
                            <select
                              className="w-full rounded-lg text-xs font-medium outline-none px-1.5 py-1.5 transition-all"
                              style={{
                                background: sc.bg,
                                color: sc.text,
                                border: `1.5px solid ${sc.border}`,
                                cursor: 'pointer',
                              }}
                              value={schedState}
                              onChange={e => handleSlotSelectChange(singleTherapistId, date, slot.label, e.target.value as ScheduleState)}
                              onClick={e => e.stopPropagation()}
                            >
                              {SCHEDULE_STATES.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          )}

                          {/* Appointment cards (edit or normal mode) */}
                          {cellAppts.map(appt => {
                            const order = getOrderForAppointment(appt, ORDERS);
                            const usedTimes = order ? (localOrderUsedTimes[order.id] ?? order.usedTimes) : 0;
                            const isConfirming = confirmCancelId === appt.id;
                            const isEditingRmk = editingRemarkId === appt.id;

                            return (
                              <AppointmentCard
                                key={appt.id}
                                appt={appt}
                                showTherapist={showTherapistOnCard}
                                therapistColor={therapistColorMap[appt.therapistId]}
                                usedTimes={usedTimes}
                                editMode={editMode}
                                isConfirmingCancel={isConfirming}
                                onRequestCancel={() => {
                                  setConfirmCancelId(appt.id);
                                  setEditingRemarkId(null);
                                }}
                                onConfirmCancel={() => handleCancelAppt(appt.id)}
                                onAbortCancel={() => setConfirmCancelId(null)}
                                isEditingRemark={isEditingRmk}
                                onToggleRemark={() => {
                                  if (editingRemarkId === appt.id) {
                                    setEditingRemarkId(null);
                                  } else {
                                    // Init draft from current remark
                                    setRemarkDrafts(prev => ({
                                      ...prev,
                                      [appt.id]: appt.remark ?? '',
                                    }));
                                    setEditingRemarkId(appt.id);
                                    setConfirmCancelId(null);
                                  }
                                }}
                                remarkDraft={remarkDrafts[appt.id] ?? appt.remark ?? ''}
                                onRemarkChange={v => setRemarkDrafts(prev => ({ ...prev, [appt.id]: v }))}
                                onRemarkSave={() => handleSaveRemark(appt.id)}
                                onReschedule={() => {
                                  setRescheduleTarget(appt);
                                  setEditingRemarkId(null);
                                  setConfirmCancelId(null);
                                }}
                                onComplete={() => handleCompleteAppt(appt.id)}
                              />
                            );
                          })}

                          {/* Normal view: non-free schedule status badge */}
                          {!editMode && !hasActiveAppt && schedState !== '空闲' && (
                            <div
                              className="rounded-md px-2 py-1 text-xs font-medium text-center"
                              style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
                            >
                              {schedState}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {completionTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="w-[520px] max-w-[calc(100vw-32px)] rounded-xl shadow-custom overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <div className="font-semibold text-foreground">确认完成上门服务</div>
                <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  {completionTarget.customerName} · {completionTarget.date} {completionTarget.timeSlot}
                </div>
              </div>
              <button type="button" className="p-2 rounded-lg hover:bg-muted" onClick={() => setCompletionTarget(null)}>
                <XIcon size={18} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span style={{ color: 'var(--muted-foreground)' }}>服务技师：</span>{completionTarget.therapistName || '—'}</div>
                <div><span style={{ color: 'var(--muted-foreground)' }}>服务项目：</span>{completionTarget.service || '—'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground mb-1">客户签字凭证（选填）</div>
                <div className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
                  可上传客户签字单或签字确认照片，支持 PNG/JPG，最多 5 张。
                </div>
                <div className="flex flex-wrap gap-2">
                  {completionSignaturePhotos.map(photo => (
                    <div key={photo.id} className="relative w-20 h-20 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <img src={photo.url} alt={photo.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
                        onClick={() => setCompletionSignaturePhotos(prev => prev.filter(item => item.id !== photo.id))}
                      >
                        <XIcon size={12} />
                      </button>
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-lg flex flex-col items-center justify-center gap-1 text-xs cursor-pointer hover:border-brand"
                    style={{ border: '2px dashed var(--border)', color: 'var(--muted-foreground)' }}>
                    <ImageIcon size={20} />
                    {completionUploading ? '上传中' : '上传'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      multiple
                      className="hidden"
                      disabled={completionUploading}
                      onChange={event => handleCompletionPhotoFiles(event.target.files)}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button type="button" className="px-4 py-2 rounded-lg text-sm hover:bg-muted" style={{ border: '1px solid var(--border)' }} onClick={() => setCompletionTarget(null)}>
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
                disabled={completionSaving || completionUploading}
                onClick={confirmCompleteAppt}
              >
                {completionSaving ? '确认中...' : '确认已完成'}
              </button>
            </div>
          </div>
        </div>
      )}

      <RescheduleModal
        visible={Boolean(rescheduleTarget)}
        appointment={rescheduleTarget}
        baseWeekOffset={weekOffset}
        localAppts={localAppts}
        slotStatus={draftSlotStatus}
        onClose={() => setRescheduleTarget(null)}
        onSave={handleRescheduleAppt}
      />

      {/* Create modal */}
      <CreateModal
        visible={showCreateModal}
        therapistId={singleTherapistId}
        localAppts={localAppts}
        slotStatus={slotStatus}
        localOrderUsedTimes={localOrderUsedTimes}
        initialCustomerId={prefillCustomerId}
        onClose={closeCreateModal}
        onSave={handleNewAppt}
      />
    </div>
  );
}
