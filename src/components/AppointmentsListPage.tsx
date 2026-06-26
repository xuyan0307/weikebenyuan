import { useState, useEffect } from 'react';
import {
  SearchIcon, FilterIcon, BellIcon, BellOffIcon, ClockIcon, AlertTriangleIcon,
  ChevronLeftIcon, ChevronRightIcon, MapPinIcon, EditIcon, EyeIcon, XIcon,
  CheckCircleIcon, CalendarIcon, UserIcon, PhoneIcon
} from 'lucide-react';
import type { Appointment } from '../api/endpoints';
import { useApp } from '../hooks/useApp';
import { useAppointments, useTherapists, useCustomers } from '../api/hooks';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifyStatus = '待通知' | '已通知' | '延迟通知' | '遗漏';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDeadline(apptDate: string): Date {
  // Deadline = apptDate - 1 day at 20:00:00
  const d = new Date(apptDate);
  d.setDate(d.getDate() - 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

function formatDeadline(apptDate: string): string {
  const d = getDeadline(apptDate);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd} 20:00`;
}

function timeSlotToStart(slot: string): string {
  if (slot === '上午') return '09:00';
  if (slot === '下午') return '14:00';
  if (slot === '晚上') return '18:00';
  // 形如 "09:00-11:00" → 取 "-" 前半段
  if (slot.includes('-')) return slot.split('-')[0].trim();
  return slot;
}

// ─── Notify Badge ─────────────────────────────────────────────────────────────

const NOTIFY_STYLE: Record<NotifyStatus, { bg: string; text: string; border: string; icon: typeof BellIcon }> = {
  '待通知': { bg: '#FFFBEB', text: '#B45309', border: '#FCD34D', icon: ClockIcon },
  '已通知': { bg: '#F0FDF4', text: '#16A34A', border: '#86EFAC', icon: BellIcon },
  '延迟通知': { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74', icon: AlertTriangleIcon },
  '遗漏': { bg: '#FEF2F2', text: '#DC2626', border: '#FCA5A5', icon: BellOffIcon },
};

function NotifyBadge({ status }: { status: NotifyStatus }) {
  const s = NOTIFY_STYLE[status];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      <Icon size={11} />
      {status}
    </span>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  appt: Appointment | null;
  currentStatus: NotifyStatus;
  onClose: () => void;
  onSave: (apptId: string, status: NotifyStatus) => void;
}

function EditModal({ appt, currentStatus, onClose, onSave }: EditModalProps) {
  const [draft, setDraft] = useState<NotifyStatus>(currentStatus);

  // Sync draft when target changes
  useEffect(() => {
    setDraft(currentStatus);
  }, [currentStatus, appt]);

  const visible = !!appt;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200"
      style={{ background: 'rgba(0,0,0,0.45)', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      <div
        className="rounded-2xl shadow-custom overflow-hidden"
        style={{ width: 420, background: 'var(--card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-bold text-base text-foreground">编辑通知状态</span>
          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={onClose}>
            <XIcon size={16} style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Appt summary */}
          {appt && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: 'var(--brand)' }}
              >
                {appt.customerName[0]}
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">{appt.customerName}</div>
                <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
                  <CalendarIcon size={11} />
                  {appt.date} · {appt.timeSlot} · {appt.service}
                </div>
              </div>
            </div>
          )}

          {/* Status select */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">通知状态</label>
            <select
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              value={draft}
              onChange={e => setDraft(e.target.value as NotifyStatus)}
            >
              {(['待通知', '已通知', '延迟通知', '遗漏'] as NotifyStatus[]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {/* Preview badge */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>预览：</span>
              <NotifyBadge status={draft} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
            style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand)' }}
            onClick={() => { if (appt) onSave(appt.id, draft); }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

interface DetailModalProps {
  appt: Appointment | null;
  notifyStatus: NotifyStatus;
  onClose: () => void;
}

function DetailModal({ appt, notifyStatus, onClose }: DetailModalProps) {
  const visible = !!appt;
  const customersQ = useCustomers({ page: 1, pageSize: 1000 });
  const customers: any[] = customersQ.data?.data ?? [];

  if (!appt) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.45)', opacity: 0, pointerEvents: 'none' }}
      />
    );
  }

  const customer = customers.find(c => c.id === appt.customerId) ?? null;
  const deadline = formatDeadline(appt.date);

  function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex items-start gap-2 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs w-20 flex-shrink-0 pt-0.5" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
        <span className="text-sm text-foreground flex-1">{children}</span>
      </div>
    );
  }

  function SectionTitle({ title }: { title: string }) {
    return (
      <div className="flex items-center gap-2 mt-4 mb-1">
        <div className="w-1 h-4 rounded-full" style={{ background: 'var(--brand)' }} />
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand)' }}>{title}</span>
      </div>
    );
  }

  const APPT_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
    '已确认': { bg: '#F0FDF4', text: '#16A34A' },
    '待确认': { bg: '#FFFBEB', text: '#B45309' },
    '已取消': { bg: '#F5F5F5', text: '#757575' },
    '已完成': { bg: '#EFF6FF', text: '#1D4ED8' },
  };
  const apptStyle = APPT_STATUS_STYLE[appt.status] ?? { bg: '#F5F5F5', text: '#757575' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200"
      style={{ background: 'rgba(0,0,0,0.45)', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      <div
        className="rounded-2xl shadow-custom flex flex-col overflow-hidden"
        style={{ width: 520, maxHeight: '88vh', background: 'var(--card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: 'var(--brand)' }}
            >
              {appt.customerName[0]}
            </div>
            <div>
              <div className="font-bold text-base text-foreground">{appt.customerName}</div>
              <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--muted-foreground)' }}>{appt.id}</div>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={onClose}>
            <XIcon size={16} style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Basic info */}
          <SectionTitle title="基本信息" />
          <InfoRow label="客户 ID">
            <span className="font-mono text-xs" style={{ color: 'var(--brand)' }}>{appt.customerId}</span>
          </InfoRow>
          <InfoRow label="客户姓名">{appt.customerName}</InfoRow>
          <InfoRow label="联系电话">
            {customer?.phone
              ? <span className="flex items-center gap-1"><PhoneIcon size={12} style={{ color: 'var(--muted-foreground)' }} />{customer.phone}</span>
              : <span style={{ color: 'var(--muted-foreground)' }}>—</span>
            }
          </InfoRow>
          <InfoRow label="所在区域">
            {appt.area
              ? <span className="flex items-center gap-1"><MapPinIcon size={12} style={{ color: 'var(--muted-foreground)' }} />{appt.area}</span>
              : <span style={{ color: 'var(--muted-foreground)' }}>—</span>
            }
          </InfoRow>
          <InfoRow label="对应客服">
            {customer?.advisor
              ? <span className="flex items-center gap-1"><UserIcon size={12} style={{ color: 'var(--muted-foreground)' }} />{customer.advisor}</span>
              : <span style={{ color: 'var(--muted-foreground)' }}>—</span>
            }
          </InfoRow>

          {/* Appointment info */}
          <SectionTitle title="预约信息" />
          <InfoRow label="技师">{appt.therapistName}</InfoRow>
          <InfoRow label="预约日期">
            <span className="flex items-center gap-1"><CalendarIcon size={12} style={{ color: 'var(--muted-foreground)' }} />{appt.date}</span>
          </InfoRow>
          <InfoRow label="开始时间">{timeSlotToStart(appt.timeSlot)}</InfoRow>
          <InfoRow label="服务项目">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #93C5FD' }}>
              {appt.service}
            </span>
          </InfoRow>
          <InfoRow label="预约状态">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: apptStyle.bg, color: apptStyle.text }}>
              <CheckCircleIcon size={10} />
              {appt.status}
            </span>
          </InfoRow>

          {/* Notify info */}
          <SectionTitle title="通知信息" />
          <InfoRow label="通知状态"><NotifyBadge status={notifyStatus} /></InfoRow>
          <InfoRow label="通知截止">
            <span style={{ color: 'var(--muted-foreground)' }}>{deadline}</span>
          </InfoRow>
          <InfoRow label="备注">
            <span style={{ color: appt.remark ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
              {appt.remark || '—'}
            </span>
          </InfoRow>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 text-white"
            style={{ background: 'var(--brand)' }}
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppointmentsListPage() {
  const { currentUser } = useApp();
  const isTherapist = currentUser.role === 'therapist';

  const apptsQ = useAppointments({ page: 1, pageSize: 1000 });
  const customersQ = useCustomers({ page: 1, pageSize: 1000 });
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const APPOINTMENTS: Appointment[] = apptsQ.data?.data ?? [];
  const CUSTOMERS: any[] = customersQ.data?.data ?? [];
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];

  function getCustomer(customerId: string) {
    return CUSTOMERS.find(c => c.id === customerId) ?? null;
  }

  // Initialize all as '待通知'
  const [notifyStatusMap, setNotifyStatusMap] = useState<Record<string, NotifyStatus>>({});

  // Sync new appointments to '待通知' default + auto-promote overdue ones to '延迟通知'
  useEffect(() => {
    if (APPOINTMENTS.length === 0) return;
    const now = new Date();
    const updates: Record<string, NotifyStatus> = {};
    const advisorSet = new Set<string>();

    APPOINTMENTS.forEach(appt => {
      const deadline = getDeadline(appt.date);
      if (now > deadline) {
        updates[appt.id] = '延迟通知';
        const cust = getCustomer(appt.customerId);
        if (cust?.advisor) advisorSet.add(cust.advisor);
      } else if (notifyStatusMap[appt.id] === undefined) {
        updates[appt.id] = '待通知';
      }
    });

    if (Object.keys(updates).length > 0) {
      setNotifyStatusMap(prev => ({ ...prev, ...updates }));
      advisorSet.forEach(advisor => {
        toast.warning(`已发送通知提醒至 ${advisor}`);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [APPOINTMENTS.length]);

  // Filters
  const [search, setSearch] = useState('');
  const [notifyFilter, setNotifyFilter] = useState('__all__');
  const [therapistFilter, setTherapistFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [detailTarget, setDetailTarget] = useState<Appointment | null>(null);

  // Derived counts
  const counts = {
    total: APPOINTMENTS.length,
    waiting: Object.values(notifyStatusMap).filter(s => s === '待通知').length,
    done: Object.values(notifyStatusMap).filter(s => s === '已通知').length,
    delayed: Object.values(notifyStatusMap).filter(s => s === '延迟通知').length,
  };

  // Filter
  const filtered = APPOINTMENTS.filter(a => {
    const cust = getCustomer(a.customerId);
    const advisor = cust?.advisor ?? '';
    const q = search.toLowerCase();
    const matchSearch = !search
      || a.customerName.toLowerCase().includes(q)
      || a.therapistName.toLowerCase().includes(q)
      || advisor.toLowerCase().includes(q);
    const matchNotify = notifyFilter === '__all__' || notifyStatusMap[a.id] === notifyFilter;
    const matchTherapist = therapistFilter === '__all__' || a.therapistId === therapistFilter;
    return matchSearch && matchNotify && matchTherapist;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  function handleFilterChange(setter: (v: string) => void) {
    return (v: string) => { setter(v); setPage(1); };
  }

  function handleSaveNotify(apptId: string, status: NotifyStatus) {
    setNotifyStatusMap(prev => ({ ...prev, [apptId]: status }));
    setEditTarget(null);
    toast.success('通知状态已更新');
  }

  // Summary cards config
  const summaryCards = [
    { label: '预约总数', value: counts.total, color: 'var(--brand)', icon: CalendarIcon, bg: '#EFF6FF' },
    { label: '待通知', value: counts.waiting, color: '#B45309', icon: ClockIcon, bg: '#FFFBEB' },
    { label: '已通知', value: counts.done, color: '#16A34A', icon: BellIcon, bg: '#F0FDF4' },
    { label: '延迟通知', value: counts.delayed, color: '#F97316', icon: AlertTriangleIcon, bg: '#FFF7ED' },
  ];

  return (
    <div data-cmp="AppointmentsListPage" className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="flex gap-4">
        {summaryCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="flex-1 bg-card rounded-xl p-4 shadow-custom">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>{card.label}</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: card.bg }}>
                  <Icon size={15} style={{ color: card.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl px-4 py-3 shadow-custom flex flex-wrap items-center gap-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--muted)', border: '1px solid var(--border)', minWidth: 220 }}
        >
          <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
          <input
            className="bg-transparent outline-none text-sm flex-1"
            style={{ color: 'var(--foreground)' }}
            placeholder="搜索客户姓名 / 技师 / 客服"
            value={search}
            onChange={e => { handleFilterChange(setSearch)(e.target.value); }}
          />
        </div>

        {/* Notify status filter */}
        <select
          className="text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', height: 36 }}
          value={notifyFilter}
          onChange={e => handleFilterChange(setNotifyFilter)(e.target.value)}
        >
          <option value="__all__">全部通知状态</option>
          {(['待通知', '已通知', '延迟通知', '遗漏'] as NotifyStatus[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Therapist filter */}
        {!isTherapist && (
          <select
            className="text-sm rounded-lg px-2 py-1.5 outline-none"
            style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', height: 36 }}
            value={therapistFilter}
            onChange={e => handleFilterChange(setTherapistFilter)(e.target.value)}
          >
            <option value="__all__">全部技师</option>
            {THERAPISTS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <FilterIcon size={14} />
          共 <strong className="text-foreground">{filtered.length}</strong> 条预约
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-custom overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full text-center" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 80, textAlign: 'center' }}>客户 ID</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>客户姓名</th>
                <th style={{ minWidth: 100, textAlign: 'center' }}>联系电话</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>所在区域</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>技师</th>
                <th style={{ minWidth: 90, textAlign: 'center' }}>预约时间</th>
                <th style={{ minWidth: 70, textAlign: 'center' }}>开始时间</th>
                <th style={{ minWidth: 120, textAlign: 'center' }}>服务项目</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>对应客服</th>
                <th style={{ minWidth: 110, textAlign: 'center' }}>通知状态</th>
                <th style={{ minWidth: 100, textAlign: 'center' }}>备注</th>
                <th style={{ minWidth: 80, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(appt => {
                const customer = getCustomer(appt.customerId);
                const phone = customer?.phone ?? '—';
                const advisor = customer?.advisor ?? '—';
                const notifyStatus = notifyStatusMap[appt.id] ?? '待通知';

                return (
                  <tr key={appt.id}>
                    {/* 客户 ID */}
                    <td className="text-center">
                      <span className="font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{appt.customerId}</span>
                    </td>

                    {/* 客户姓名 */}
                    <td className="text-center">
                      <span className="font-medium text-sm">{appt.customerName}</span>
                    </td>

                    {/* 联系电话 */}
                    <td>
                      <div className="flex items-center justify-center gap-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                        <PhoneIcon size={11} />
                        {phone}
                      </div>
                    </td>

                    {/* 所在区域 */}
                    <td className="text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      {appt.area || '—'}
                    </td>

                    {/* 技师 */}
                    <td className="text-center text-sm" style={{ color: 'var(--foreground)' }}>
                      {appt.therapistName}
                    </td>

                    {/* 预约时间 */}
                    <td className="text-center text-sm" style={{ color: 'var(--foreground)' }}>
                      {appt.date}
                    </td>

                    {/* 开始时间 */}
                    <td className="text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      {timeSlotToStart(appt.timeSlot)}
                    </td>

                    {/* 服务项目 */}
                    <td>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #93C5FD', maxWidth: 140, wordBreak: 'break-all', whiteSpace: 'normal' }}
                      >
                        {appt.service}
                      </span>
                    </td>

                    {/* 对应客服 */}
                    <td className="text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      {advisor}
                    </td>

                    {/* 通知状态 */}
                    <td>
                      <NotifyBadge status={notifyStatus} />
                    </td>

                    {/* 备注 */}
                    <td>
                      <span
                        className="text-xs"
                        style={{ color: appt.remark ? 'var(--foreground)' : 'var(--muted-foreground)', maxWidth: 100, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={appt.remark}
                      >
                        {appt.remark || '—'}
                      </span>
                    </td>

                    {/* 操作 */}
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1.5 rounded hover:bg-muted transition-colors"
                          title="编辑通知状态"
                          onClick={() => setEditTarget(appt)}
                        >
                          <EditIcon size={14} style={{ color: 'var(--brand)' }} />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-muted transition-colors"
                          title="查看详情"
                          onClick={() => setDetailTarget(appt)}
                        >
                          <EyeIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    暂无匹配预约记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {filtered.length === 0
              ? '暂无记录'
              : `第 ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} 条，共 ${filtered.length} 条`
            }
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="p-1.5 rounded hover:bg-muted disabled:opacity-40 transition-colors"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeftIcon size={15} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className="w-7 h-7 rounded text-sm font-medium transition-colors"
                style={{
                  background: p === page ? 'var(--brand)' : 'transparent',
                  color: p === page ? '#fff' : 'var(--foreground)',
                }}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="p-1.5 rounded hover:bg-muted disabled:opacity-40 transition-colors"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRightIcon size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <EditModal
        appt={editTarget}
        currentStatus={editTarget ? (notifyStatusMap[editTarget.id] ?? '待通知') : '待通知'}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveNotify}
      />

      {/* Detail modal */}
      <DetailModal
        appt={detailTarget}
        notifyStatus={detailTarget ? (notifyStatusMap[detailTarget.id] ?? '待通知') : '待通知'}
        onClose={() => setDetailTarget(null)}
      />
    </div>
  );
}
