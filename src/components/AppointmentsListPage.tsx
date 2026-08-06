import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangleIcon,
  BellIcon,
  BellOffIcon,
  CalendarDaysIcon,
  ClockIcon,
  XIcon,
} from 'lucide-react';
import type { Appointment } from '../api/endpoints';
import {
  useAppointmentMutations,
  useAppointments,
  useCustomerFilterOptions,
  useOrders,
} from '../api/hooks';
import { useApp } from '../hooks/useApp';
import { RecordActionButtons } from './ui/record-action-buttons';
import {
  GlobalMultiSelectFilter,
  matchesGlobalMultiSelect,
  type GlobalFilterOption,
} from './ui/global-multi-select-filter';
import { mutationErrorMessage } from '../utils/appointmentEdit';
import {
  clearDashboardFilter,
  readDashboardFilter,
} from '../utils/dashboardTodoNavigation';
import { DateRangeFilter } from './ui/date-range-filter';
import { GLOBAL_DATE_RANGE_QUICK_OPTIONS, quickDateRange, type DateRangeValue } from '../utils/dateRange';
import { useGlobalDateRange } from '../utils/useGlobalDateRange';

type TimeRange = 'all' | 'today' | 'week' | 'month' | 'custom';
type NotifyStatus = '待通知' | '需通知' | '已通知' | '延迟' | '遗漏';

const APPOINTMENT_STATUS_OPTIONS: GlobalFilterOption[] = [
  { value: '待服务', label: '待服务' },
  { value: '已完成', label: '已完成' },
  { value: '取消', label: '取消' },
];
const NOTIFY_STATUS_OPTIONS: GlobalFilterOption[] = [
  { value: '待通知', label: '待通知' },
  { value: '需通知', label: '需通知' },
  { value: '已通知', label: '已通知' },
  { value: '延迟', label: '延迟' },
  { value: '遗漏', label: '遗漏' },
];

const APPOINTMENT_COLUMN_WIDTHS_KEY = 'appointments-list-column-widths-v1';
const appointmentColumns = [
  { key: 'customerId', label: '客户ID', width: 5.5, minWidth: 4.5, align: 'text-left' },
  { key: 'customerName', label: '客户姓名', width: 7, minWidth: 5, align: 'text-left' },
  { key: 'phone', label: '联系电话', width: 6.5, minWidth: 5, align: 'text-left' },
  { key: 'area', label: '所在区域', width: 5.5, minWidth: 4.5, align: 'text-left' },
  { key: 'therapist', label: '技师', width: 7, minWidth: 5, align: 'text-left' },
  { key: 'date', label: '预约时间', width: 7, minWidth: 5.5, align: 'text-left' },
  { key: 'time', label: '开始时间', width: 5, minWidth: 4.5, align: 'text-left' },
  { key: 'status', label: '状态', width: 6, minWidth: 5, align: 'text-left' },
  { key: 'type', label: '类型', width: 5.5, minWidth: 4.5, align: 'text-left' },
  { key: 'service', label: '服务内容', width: 18, minWidth: 8, align: 'text-left' },
  { key: 'advisor', label: '对应客服', width: 6.5, minWidth: 5, align: 'text-left' },
  { key: 'notify', label: '通知状态', width: 8.5, minWidth: 6, align: 'text-left' },
  { key: 'actions', label: '操作', width: 12, minWidth: 7, align: 'text-center' },
] as const;

const defaultColumnWidths = appointmentColumns.map(column => column.width);

function loadColumnWidths() {
  if (typeof window === 'undefined') return defaultColumnWidths;
  try {
    const saved = JSON.parse(window.localStorage.getItem(APPOINTMENT_COLUMN_WIDTHS_KEY) || '');
    if (
      Array.isArray(saved)
      && saved.length === appointmentColumns.length
      && saved.every((width, index) => Number.isFinite(width) && width >= appointmentColumns[index].minWidth)
    ) {
      return saved as number[];
    }
  } catch {
    // Ignore invalid or stale browser preferences.
  }
  return defaultColumnWidths;
}

const notifyStyles: Record<NotifyStatus, string> = {
  待通知: 'border-slate-200 bg-slate-50 text-slate-600',
  需通知: 'border-amber-200 bg-amber-50 text-amber-700',
  已通知: 'border-green-200 bg-green-50 text-green-700',
  延迟: 'border-orange-200 bg-orange-50 text-orange-700',
  遗漏: 'border-red-200 bg-red-50 text-red-700',
};

const appointmentStyles: Record<string, string> = {
  待服务: 'bg-blue-50 text-blue-700',
  已完成: 'bg-green-50 text-green-700',
  取消: 'bg-gray-100 text-gray-600',
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRange(range: Exclude<TimeRange, 'custom'>) {
  if (range === 'all') return {};
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  if (range === 'week') {
    const mondayOffset = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - mondayOffset);
    to.setDate(from.getDate() + 6);
  } else if (range === 'month') {
    from.setDate(1);
    to.setMonth(to.getMonth() + 1, 0);
  }
  return { from: formatDate(from), to: formatDate(to) };
}

function startTime(slot: string) {
  const match = String(slot || '').match(/(\d{1,2}:\d{2})/);
  if (match) return match[1];
  if (slot.includes('下午')) return '13:00';
  if (slot.includes('晚上')) return '18:00';
  return '09:00';
}

function Badge({ value, kind }: { value: string; kind: 'notify' | 'appointment' }) {
  const style = kind === 'notify'
    ? notifyStyles[value as NotifyStatus] || 'border-gray-200 bg-gray-100 text-gray-600'
    : appointmentStyles[value] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium ${style} ${kind === 'notify' ? 'border' : ''}`}>
      {value}
    </span>
  );
}

function AppointmentModal({
  appointment,
  mode,
  canEditNotification,
  saving,
  onClose,
  onEdit,
  onSave,
}: {
  appointment: Appointment | null;
  mode: 'view' | 'edit';
  canEditNotification: boolean;
  saving: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSave: (body: Partial<Appointment>) => Promise<void>;
}) {
  const [notifyStatus, setNotifyStatus] = useState<NotifyStatus | ''>('');

  useEffect(() => {
    if (!appointment) return;
    setNotifyStatus(appointment.notifyStatus || '');
  }, [appointment]);

  if (!appointment) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSave({ notifyStatus: notifyStatus || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <form
        className={`flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl ${mode === 'edit' ? 'max-w-md' : 'max-h-[92vh] max-w-3xl'}`}
        onSubmit={submit}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">{mode === 'edit' ? '修改通知状态' : '预约详情'}</h3>
            <p className="mt-1 text-xs text-gray-500">{appointment.customerName} · {appointment.customerId}</p>
          </div>
          <button type="button" className="rounded p-2 hover:bg-gray-100" onClick={onClose} title="关闭">
            <XIcon size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-6">
          {mode === 'edit' ? (
            <>
              <div className="rounded-lg border bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <div className="flex justify-between gap-4">
                  <span>预约时间</span>
                  <span className="font-medium text-gray-900">{appointment.date} {startTime(appointment.timeSlot)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-4">
                  <span>服务技师</span>
                  <span className="font-medium text-gray-900">{appointment.therapistName || '—'}</span>
                </div>
              </div>
              <label className="mt-5 block text-sm text-gray-600">
                通知状态
                <select
                  required
                  value={notifyStatus}
                  disabled={!canEditNotification}
                  onChange={event => setNotifyStatus(event.target.value as NotifyStatus)}
                  className="mt-2 h-11 w-full rounded border bg-white px-3 text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">请选择通知状态</option>
                  {NOTIFY_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                预约时间、技师、服务内容、状态及备注均由排期管理同步，请在排期管理中调整。
              </p>
            </>
          ) : (
            <>
          <section className="rounded-lg border bg-gray-50/60 p-5">
            <h4 className="mb-4 font-semibold text-gray-900">客户信息</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {[
                ['客户ID', appointment.customerId],
                ['客户姓名', appointment.customerName],
                ['联系电话', appointment.customerPhone || '—'],
                ['对应客服', appointment.advisorName || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 text-xs text-gray-500">{label}</div>
                  <div className="text-sm text-gray-900">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-lg border p-5">
            <h4 className="mb-4 font-semibold text-gray-900">预约信息</h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                {[
                  ['服务技师', appointment.therapistName || '—'],
                  ['所在区域', appointment.area || '—'],
                  ['预约日期', appointment.date],
                  ['开始时间', startTime(appointment.timeSlot)],
                  ['预约状态', appointment.status],
                  ['类型', appointment.orderType || '体验卡'],
                  ['通知状态', appointment.notifyStatus || '—'],
                  ['服务内容', appointment.serviceContent || appointment.service || '—'],
                  ['备注', appointment.remark || '—'],
                ].map(([label, value]) => (
                  <div key={label} className={label === '服务内容' || label === '备注' ? 'col-span-2' : ''}>
                    <div className="mb-1 text-xs text-gray-500">{label}</div>
                    <div className="whitespace-pre-wrap text-sm text-gray-900">{value}</div>
                  </div>
                ))}
              </div>
          </section>
          {appointment.notifyError && (
            <div className="mt-5 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              企业微信推送异常：{appointment.notifyError}
            </div>
          )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          {mode === 'view' ? (
            <>
              <button type="button" className="h-10 rounded border px-5 text-sm hover:bg-gray-50" onClick={onClose}>
                关闭
              </button>
              {canEditNotification && (
                <button type="button" className="h-10 rounded bg-blue-500 px-5 text-sm text-white hover:bg-blue-600" onClick={onEdit}>
                  修改通知状态
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="h-10 rounded border px-5 text-sm hover:bg-gray-50" onClick={onClose}>
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded bg-blue-500 px-5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存修改'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export function AppointmentsListPage() {
  const { currentUser } = useApp();
  const canEditNotification = ['superadmin', 'admin', 'service'].includes(currentUser.role);
  const dashboardFilter = useMemo(() => readDashboardFilter(), []);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [appointmentDateRange, setAppointmentDateRange] = useGlobalDateRange('all');
  const [notifyFilters, setNotifyFilters] = useState<string[]>(() =>
    dashboardFilter.appointmentNotifyStatus === '需通知' ? ['需通知'] : []
  );
  const [appointmentFilters, setAppointmentFilters] = useState<string[]>([]);
  const [therapistFilters, setTherapistFilters] = useState<string[]>([]);
  const [selectedAdvisors, setSelectedAdvisors] = useState<string[]>(() =>
    currentUser.role === 'service' && currentUser.name ? [currentUser.name] : []
  );
  useEffect(() => {
    if (currentUser.role === 'service' && currentUser.name) {
      setSelectedAdvisors([currentUser.name]);
    }
  }, [currentUser.name, currentUser.role]);
  const [appointmentModal, setAppointmentModal] = useState<{
    appointment: Appointment;
    mode: 'view' | 'edit';
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [columnWidths, setColumnWidths] = useState<number[]>(loadColumnWidths);
  const [resizingColumn, setResizingColumn] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const resizeRef = useRef<{
    index: number;
    startX: number;
    leftWidth: number;
    rightWidth: number;
    tableWidth: number;
  } | null>(null);
  const range = useMemo(
    () => appointmentDateRange.start || appointmentDateRange.end
      ? { from: appointmentDateRange.start, to: appointmentDateRange.end }
      : {},
    [appointmentDateRange.start, appointmentDateRange.end]
  );
  const query = useAppointments({ page: 1, pageSize: 2000, ...range });
  const ordersQuery = useOrders({ page: 1, pageSize: 2000 });
  const customerFilterOptionsQuery = useCustomerFilterOptions();
  const appointmentMutations = useAppointmentMutations();
  const appointments = query.data?.data || [];
  const orders = ordersQuery.data?.data || [];

  useEffect(() => {
    if (dashboardFilter.appointmentNotifyStatus) clearDashboardFilter();
  }, [dashboardFilter.appointmentNotifyStatus]);

  useEffect(() => {
    window.localStorage.setItem(APPOINTMENT_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    if (resizingColumn === null) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const resize = (event: PointerEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const delta = ((event.clientX - state.startX) / state.tableWidth) * 100;
      const pairWidth = state.leftWidth + state.rightWidth;
      const leftMinimum = appointmentColumns[state.index].minWidth;
      const rightMinimum = appointmentColumns[state.index + 1].minWidth;
      const nextLeft = Math.min(
        pairWidth - rightMinimum,
        Math.max(leftMinimum, state.leftWidth + delta)
      );

      setColumnWidths(current => {
        const next = [...current];
        next[state.index] = nextLeft;
        next[state.index + 1] = pairWidth - nextLeft;
        return next;
      });
    };

    const stop = () => {
      resizeRef.current = null;
      setResizingColumn(null);
    };

    document.addEventListener('pointermove', resize);
    document.addEventListener('pointerup', stop, { once: true });
    return () => {
      document.removeEventListener('pointermove', resize);
      document.removeEventListener('pointerup', stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizingColumn]);

  const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (!tableRef.current || index >= appointmentColumns.length - 1) return;
    event.preventDefault();
    event.stopPropagation();
    const tableWidth = tableRef.current.getBoundingClientRect().width;
    if (!tableWidth) return;
    resizeRef.current = {
      index,
      startX: event.clientX,
      leftWidth: columnWidths[index],
      rightWidth: columnWidths[index + 1],
      tableWidth,
    };
    setResizingColumn(index);
  };

  const advisors = useMemo(() => {
    const names = [
      ...appointments.map(item => item.advisorName),
      ...orders.map(item => item.advisor),
      ...(customerFilterOptionsQuery.data?.advisors || []),
    ].filter(Boolean) as string[];
    if (currentUser.role === 'service' && currentUser.name) names.push(currentUser.name);
    return Array.from(new Set(names)).sort();
  }, [appointments, currentUser.name, currentUser.role, customerFilterOptionsQuery.data?.advisors, orders]);
  const therapistNames = useMemo(
    () => Array.from(new Set(appointments.map(item => item.therapistName).filter(Boolean))).sort(),
    [appointments]
  );
  const advisorOptions = useMemo<GlobalFilterOption[]>(
    () => advisors.map(name => ({ value: name, label: name })),
    [advisors]
  );
  const therapistOptions = useMemo<GlobalFilterOption[]>(
    () => therapistNames.map(name => ({ value: name, label: name })),
    [therapistNames]
  );
  const filtered = useMemo(() => appointments.filter(item => {
    if (!matchesGlobalMultiSelect(item.notifyStatus || '', notifyFilters)) return false;
    if (!matchesGlobalMultiSelect(item.status, appointmentFilters)) return false;
    if (!matchesGlobalMultiSelect(item.therapistName || '', therapistFilters)) return false;
    if (!matchesGlobalMultiSelect(item.advisorName || '', selectedAdvisors)) return false;
    return true;
  }), [appointments, notifyFilters, appointmentFilters, therapistFilters, selectedAdvisors]);

  const notifyCounts = useMemo(() => ({
    待通知: filtered.filter(item => item.notifyStatus === '待通知').length,
    需通知: filtered.filter(item => item.notifyStatus === '需通知').length,
    已通知: filtered.filter(item => item.notifyStatus === '已通知').length,
    延迟: filtered.filter(item => item.notifyStatus === '延迟').length,
    遗漏: filtered.filter(item => item.notifyStatus === '遗漏').length,
  }), [filtered]);

  const summaryCards = [
    { label: '预约总数', value: filtered.length, icon: CalendarDaysIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '待通知', value: notifyCounts.待通知, icon: ClockIcon, color: 'text-slate-600', bg: 'bg-slate-50' },
    { label: '需通知', value: notifyCounts.需通知, icon: ClockIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: '已通知', value: notifyCounts.已通知, icon: BellIcon, color: 'text-green-600', bg: 'bg-green-50' },
    { label: '延迟', value: notifyCounts.延迟, icon: AlertTriangleIcon, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: '遗漏', value: notifyCounts.遗漏, icon: BellOffIcon, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  const saveAppointment = async (body: Partial<Appointment>) => {
    if (!appointmentModal) return;
    setSaving(true);
    try {
      const id = appointmentModal.appointment._id || appointmentModal.appointment.id;
      if (
        canEditNotification
        && body.notifyStatus
        && body.notifyStatus !== appointmentModal.appointment.notifyStatus
      ) {
        await appointmentMutations.patchNotificationStatus({
          id,
          status: body.notifyStatus,
        });
      }
      setAppointmentModal(null);
    } catch (error) {
      window.alert(mutationErrorMessage(error, '预约保存失败，请稍后重试'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-cmp="AppointmentsListPage" className="space-y-5">
      <div className="mobile-summary-grid grid grid-cols-6 gap-4">
        {summaryCards.map(card => (
          <div key={card.label} className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <span className="text-sm text-gray-500">{card.label}</span>
              <span className={`rounded-lg p-2 ${card.bg} ${card.color}`}><card.icon size={18} /></span>
            </div>
            <div className={`mt-3 text-3xl font-semibold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mobile-filter-row flex flex-nowrap items-center justify-start gap-3">
          <DateRangeFilter
            label="预约时间范围"
            value={appointmentDateRange}
            onChange={value => { setAppointmentDateRange(value); setTimeRange('custom'); }}
            quickOptions={GLOBAL_DATE_RANGE_QUICK_OPTIONS}
            onQuickSelect={value => setTimeRange(
              value === 'all' || value === 'today' || value === 'week' || value === 'month'
                ? value
                : 'custom',
            )}
          />
          <div className="hidden">
            {([
              ['all', '全部'],
              ['today', '今日'],
              ['week', '本周'],
              ['month', '本月'],
            ] as Array<[Exclude<TimeRange, 'custom'>, string]>).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => { setTimeRange(value); setAppointmentDateRange(quickDateRange(value)); }}
                className={`h-8 rounded px-3 text-sm ${timeRange === value ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <GlobalMultiSelectFilter
            label="客服"
            options={advisorOptions}
            selected={selectedAdvisors}
            onChange={setSelectedAdvisors}
            width={200}
          />
          <GlobalMultiSelectFilter
            label="预约状态"
            options={APPOINTMENT_STATUS_OPTIONS}
            selected={appointmentFilters}
            onChange={setAppointmentFilters}
          />
          <GlobalMultiSelectFilter
            label="通知状态"
            options={NOTIFY_STATUS_OPTIONS}
            selected={notifyFilters}
            onChange={setNotifyFilters}
          />
          <GlobalMultiSelectFilter
            label="技师"
            options={therapistOptions}
            selected={therapistFilters}
            onChange={setTherapistFilters}
            width={200}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="mobile-business-table w-full overflow-hidden">
          <table ref={tableRef} className="w-full table-fixed text-[13px]">
            <colgroup>
              {appointmentColumns.map((column, index) => (
                <col key={column.key} style={{ width: `${columnWidths[index]}%` }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
              <tr>
                {appointmentColumns.map((column, index) => (
                  <th
                    key={column.key}
                    className={`relative select-none py-3 ${index === 0 ? 'pl-4 pr-1' : 'px-1'} ${column.align}`}
                  >
                    <span className="block truncate">{column.label}</span>
                    {index < appointmentColumns.length - 1 && (
                      <button
                        type="button"
                        aria-label={`调整${column.label}列宽`}
                        title="拖动调整列宽"
                        onPointerDown={event => startColumnResize(event, index)}
                        className={`group absolute right-0 top-0 z-20 h-full w-2 translate-x-1/2 cursor-col-resize touch-none ${
                          resizingColumn === index ? 'bg-blue-100/50' : ''
                        }`}
                      >
                        <span className={`absolute right-1 top-1/4 h-1/2 w-px ${
                          resizingColumn === index ? 'bg-blue-500' : 'bg-gray-300 group-hover:bg-blue-500'
                        }`} />
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item._id || item.id} className="border-t hover:bg-blue-50/30">
                  <td className="truncate py-3 pl-4 pr-1 font-mono text-xs text-blue-600" title={item.customerId}>{item.customerId}</td>
                  <td className="truncate px-1 py-3" title={item.customerName}>{item.customerName || '—'}</td>
                  <td className="truncate px-1 py-3 text-gray-600" title={item.customerPhone}>{item.customerPhone || '—'}</td>
                  <td className="truncate px-1 py-3 text-gray-600" title={item.area}>{item.area || '—'}</td>
                  <td className="truncate px-1 py-3" title={item.therapistName}>{item.therapistName || '待分配'}</td>
                  <td className="truncate px-1 py-3 text-gray-600">{item.date}</td>
                  <td className="truncate px-1 py-3 text-gray-600">{startTime(item.timeSlot)}</td>
                  <td className="px-1 py-3"><Badge value={item.status} kind="appointment" /></td>
                  <td className="px-1 py-3">
                    <span className={`whitespace-nowrap rounded px-1.5 py-1 text-xs ${String(item.orderType) === '套餐' ? 'bg-purple-50 text-purple-700' : 'bg-sky-50 text-sky-700'}`}>
                      {item.orderType || '体验卡'}
                    </span>
                  </td>
                  <td className="truncate px-1 py-3 text-gray-700" title={item.serviceContent || item.service}>
                    {item.serviceContent || item.service || '—'}
                  </td>
                  <td className="truncate px-1 py-3" title={item.advisorName}>{item.advisorName || '—'}</td>
                  <td className="px-1 py-3">
                    {item.notifyStatus
                      ? <Badge value={item.notifyStatus} kind="notify" />
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-2 py-3">
                    <RecordActionButtons
                      onView={() => setAppointmentModal({ appointment: item, mode: 'view' })}
                      onEdit={canEditNotification
                        ? () => setAppointmentModal({ appointment: item, mode: 'edit' })
                        : undefined}
                      viewLabel="查看"
                      editLabel="编辑"
                    />
                  </td>
                </tr>
              ))}
              {!query.isLoading && filtered.length === 0 && (
                <tr><td colSpan={13} className="py-12 text-center text-gray-400">暂无符合条件的预约</td></tr>
              )}
              {query.isLoading && (
                <tr><td colSpan={13} className="py-12 text-center text-gray-400">正在加载预约数据...</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t px-5 py-3 text-sm text-gray-500">共 {filtered.length} 条预约</div>
      </div>
      <AppointmentModal
        appointment={appointmentModal?.appointment || null}
        mode={appointmentModal?.mode || 'view'}
        canEditNotification={canEditNotification}
        saving={saving}
        onClose={() => !saving && setAppointmentModal(null)}
        onEdit={() => setAppointmentModal(current => current ? { ...current, mode: 'edit' } : null)}
        onSave={saveAppointment}
      />
    </div>
  );
}

export default AppointmentsListPage;
