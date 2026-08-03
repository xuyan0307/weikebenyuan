import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  Edit3Icon,
  RefreshCwIcon,
  SaveIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  SalaryCustomerLedger,
  SalaryLedgerSummary,
  SalarySettlementEntry,
} from '../api/endpoints';
import { useFinanceMutations, useSalary } from '../api/hooks';
import { useApp } from '../hooks/useApp';

type EntryDraft = Pick<
  SalarySettlementEntry,
  'experienceFee' | 'laborFee' | 'commission' | 'couponFee' |
  'otherFee' | 'deduction' | 'settlementStatus' | 'settlementNote'
>;

interface AdjustmentDraft {
  couponFee: number;
  otherFee: number;
  adjustmentNote: string;
}

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mondayOfCurrentWeek(): string {
  const now = new Date();
  const weekday = now.getDay() || 7;
  now.setDate(now.getDate() - weekday + 1);
  return localDate(now);
}

function shiftDate(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + amount);
  return localDate(value);
}

function currentMonth(): string { return localDate(new Date()).slice(0, 7); }

function shiftMonth(month: string, amount: number): string {
  const [year, monthNo] = month.split('-').map(Number);
  const value = new Date(year, monthNo - 1 + amount, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function mondayOfMonth(month: string): string {
  if (month === currentMonth()) return mondayOfCurrentWeek();
  const date = new Date(`${month}-01T00:00:00`);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return localDate(date);
}

function datesOfWeek(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));
}

function weekLabel(weekStart: string): string {
  const weekEnd = shiftDate(weekStart, 6);
  return `${weekStart.slice(0, 4)}年 ${weekStart.slice(5).replace('-', '/')}–${weekEnd.slice(5).replace('-', '/')}`;
}

function money(value: number): string {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function summaryFromCustomers(customers: SalaryCustomerLedger[], weekKey: string, scope: 'all' | 'month'): SalaryLedgerSummary {
  const servedThisMonth = new Set<string>();
  let upgraded = 0;
  for (const customer of customers) {
    if (customer.servedThisMonth) servedThisMonth.add(customer.customerDbId);
    if (customer.upgradedThisMonth) upgraded += 1;
  }
  return {
    customerCount: customers.length,
    totalServiceTimes: customers.reduce((sum, item) => sum + item.totalTimes, 0),
    servedTimes: customers.reduce((sum, item) => sum + item.servedTimes, 0),
    totalFee: customers.reduce((sum, item) => sum + item.totalFee, 0),
    paidSubtotal: customers.reduce((sum, item) => sum + item.paidSubtotal, 0),
    unpaidSubtotal: customers.reduce((sum, item) => sum + item.unpaidSubtotal, 0),
    currentWeekSubtotal: customers.reduce((sum, item) => sum + Number(item.weekSubtotals[weekKey] || 0), 0),
    upgradeRate: scope === 'all'
      ? (customers.length ? Math.round((customers.filter(item => item.hasUpgrade).length / customers.length) * 1000) / 10 : 0)
      : (servedThisMonth.size ? Math.round((upgraded / servedThisMonth.size) * 1000) / 10 : 0),
  };
}

const therapistTypes = ['产康师', '调理师', '运动康复师'];
const FROZEN_COLUMN_COUNT = 5;
const SALARY_COLUMN_WIDTHS_KEY = 'salary-column-widths-v6';
const defaultColumnWidths = [64, 56, 58, 72, 46, 78, 76, 66, 66, 66, 70, 70, 66, 66, 46, 78, 78, 78, 78, 78, 78, 78, 86];

function initialColumnWidths(): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SALARY_COLUMN_WIDTHS_KEY) || '[]');
    return Array.isArray(saved) && saved.length === defaultColumnWidths.length
      ? saved.map((value, index) => Math.max(44, Number(value) || defaultColumnWidths[index]))
      : defaultColumnWidths;
  } catch { return defaultColumnWidths; }
}

function ResizableHeader({ index, width, onResize, children, className = '', stickyLeft }: {
  index: number;
  width: number;
  onResize: (index: number, width: number) => void;
  children: React.ReactNode;
  className?: string;
  stickyLeft?: number;
}) {
  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: MouseEvent) => onResize(index, Math.max(44, startWidth + moveEvent.clientX - startX));
    const stop = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  };
  const frozen = stickyLeft !== undefined;
  return <th
    style={frozen ? { left: stickyLeft } : undefined}
    className={`relative border-b border-r border-border px-2 py-3 ${frozen ? 'sticky z-40 bg-muted' : ''} ${index === FROZEN_COLUMN_COUNT - 1 ? 'shadow-[5px_0_7px_-5px_rgba(15,23,42,0.45)]' : ''} ${className}`}
  >
    {children}
    <span
      role="separator"
      aria-label="拖动调整列宽"
      onMouseDown={startResize}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40"
    />
  </th>;
}

function TherapistMultiSelect({ rows, selected, onChange }: {
  rows: Array<{ therapistId: string; therapistName: string; therapistType: string }>;
  selected: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selected ?? rows.map(row => row.therapistId));
  const toggle = (id: string) => {
    if (selected === null) return onChange([id]);
    onChange(selectedSet.has(id)
      ? [...selectedSet].filter(value => value !== id)
      : [...selectedSet, id]);
  };
  const allSelected = selected === null;
  const label = allSelected ? '全部技师' : selected.length === 0 ? '未选技师' : `已选${selected.length}人`;
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return <div ref={rootRef} className="relative">
    <button onClick={() => setOpen(value => !value)} className="inline-flex min-w-40 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm">
      {label}<ChevronDownIcon size={15} />
    </button>
    {open && <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-xl">
      <div className="max-h-80 overflow-y-auto py-1">
        <button onClick={() => onChange(allSelected ? [] : null)} className="flex w-full items-center gap-2 border-b border-border px-2 py-2.5 text-left font-medium hover:bg-muted">
          <span className={`flex h-4 w-4 items-center justify-center rounded border ${allSelected ? 'border-primary bg-primary text-white' : 'border-border'}`}>{allSelected && <CheckIcon size={12} />}</span>
          全选
        </button>
        {therapistTypes.map(type => {
          const group = rows.filter(row => (row.therapistType || '产康师') === type);
          const groupSelected = group.length > 0 && group.every(row => selectedSet.has(row.therapistId));
          return <div key={type} className="py-1">
            <button disabled={!group.length} onClick={() => {
              const next = new Set(selectedSet);
              group.forEach(row => groupSelected ? next.delete(row.therapistId) : next.add(row.therapistId));
              onChange([...next]);
            }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-medium hover:bg-muted disabled:opacity-40">
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${groupSelected ? 'border-primary bg-primary text-white' : 'border-border'}`}>{groupSelected && <CheckIcon size={12} />}</span>
              {type}<span className="ml-auto text-xs text-muted-foreground">{group.length}人</span>
            </button>
            {group.map(row => <button key={row.therapistId} onClick={() => toggle(row.therapistId)} className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-8 pr-2 text-left text-sm hover:bg-muted">
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${selectedSet.has(row.therapistId) ? 'border-primary bg-primary text-white' : 'border-border'}`}>{selectedSet.has(row.therapistId) && <CheckIcon size={12} />}</span>{row.therapistName}
            </button>)}
          </div>;
        })}
      </div>
    </div>}
  </div>;
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-bold leading-6 text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-[10px] leading-4 text-muted-foreground">{note}</div>
    </div>
  );
}

function Modal({ title, children, saving, onClose, onSave }: {
  title: string;
  children: React.ReactNode;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><XIcon size={18} /></button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">取消</button>
          <button disabled={saving} onClick={onSave} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
            <SaveIcon size={15} />{saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FinanceSalaryPage() {
  const { currentUser } = useApp();
  const [weekStart, setWeekStart] = useState(mondayOfCurrentWeek());
  const [month, setMonth] = useState(currentMonth());
  const [scope, setScope] = useState<'all' | 'month'>('month');
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[] | null>(null);
  const [columnWidths, setColumnWidths] = useState<number[]>(initialColumnWidths);
  const [editingEntry, setEditingEntry] = useState<SalarySettlementEntry | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<SalaryCustomerLedger | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingWeek, setConfirmingWeek] = useState('');
  const salaryQ = useSalary(month, weekStart, scope);
  const mutations = useFinanceMutations();
  const rows = salaryQ.data?.data || [];
  const editable = Boolean(salaryQ.data?.editable) && ['admin', 'superadmin'].includes(currentUser.role);
  const selectedWeek = useMemo(() => ({
    key: weekStart,
    label: weekLabel(weekStart).split(' ')[1],
    start: weekStart,
    end: shiftDate(weekStart, 6),
    days: datesOfWeek(weekStart),
  }), [weekStart]);
  const visibleRows = selectedTherapistIds === null ? rows : rows.filter(row => selectedTherapistIds.includes(row.therapistId));
  const visibleCustomers = visibleRows.flatMap(row => row.customers || []);
  const summary = useMemo(
    () => summaryFromCustomers(visibleCustomers, selectedWeek?.key || '', scope),
    [visibleCustomers, selectedWeek?.key, scope]
  );
  const confirmedWeekSubtotal = useMemo(
    () => visibleCustomers.reduce(
      (sum, customer) => sum + Number(customer.weekConfirmedSubtotals[selectedWeek.key] || 0),
      0
    ),
    [visibleCustomers, selectedWeek.key]
  );
  const totalTableWidth = useMemo(() => columnWidths.reduce((sum, width) => sum + width, 0), [columnWidths]);

  useEffect(() => {
    localStorage.setItem(SALARY_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  const frozenOffsets = useMemo(
    () => columnWidths.map((_, index) => columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0)),
    [columnWidths]
  );

  function resizeColumn(index: number, width: number) {
    setColumnWidths(current => current.map((value, currentIndex) => currentIndex === index ? width : value));
  }

  function changeMonth(amount: number) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setWeekStart(mondayOfMonth(next));
  }

  function changeWeek(amount: number) {
    const next = shiftDate(weekStart, amount * 7);
    setWeekStart(next);
  }

  function openEntry(entry: SalarySettlementEntry) {
    if (!editable) return;
    setEditingEntry(entry);
    setEntryDraft({
      experienceFee: entry.experienceFee,
      laborFee: entry.laborFee,
      commission: entry.commission,
      couponFee: entry.couponFee,
      otherFee: entry.otherFee,
      deduction: entry.deduction,
      settlementStatus: entry.settlementStatus,
      settlementNote: entry.settlementNote,
    });
  }

  function openCustomer(customer: SalaryCustomerLedger) {
    if (!editable) return;
    setEditingCustomer(customer);
    setAdjustmentDraft({
      couponFee: customer.couponFee,
      otherFee: customer.manualOtherFee,
      adjustmentNote: customer.adjustmentNote,
    });
  }

  async function saveEntry() {
    if (!editingEntry || !entryDraft) return;
    setSaving(true);
    try {
      await mutations.updateEntry({ id: editingEntry.id, body: entryDraft });
      toast.success('本次服务费用和备注已保存');
      setEditingEntry(null);
      setEntryDraft(null);
    } catch (error: any) {
      toast.error(error?.message || '保存失败');
    } finally { setSaving(false); }
  }

  async function saveAdjustment() {
    if (!editingCustomer || !adjustmentDraft) return;
    setSaving(true);
    try {
      await mutations.updateCustomerAdjustment({
        therapistId: editingCustomer.therapistId,
        customerId: editingCustomer.customerDbId,
        month,
        paidAmount: 0,
        ...adjustmentDraft,
      });
      toast.success('客户抵扣券和其他费用已保存');
      setEditingCustomer(null);
      setAdjustmentDraft(null);
    } catch (error: any) {
      toast.error(error?.message || '保存失败');
    } finally { setSaving(false); }
  }

  async function toggleWeekConfirmation(customer: SalaryCustomerLedger, confirmed: boolean) {
    const key = `${customer.therapistId}:${customer.customerDbId}:${selectedWeek.key}`;
    setConfirmingWeek(key);
    try {
      const result = await mutations.confirmWeek({
        therapistId: customer.therapistId,
        customerId: customer.customerDbId,
        weekStart: selectedWeek.key,
        confirmed,
      });
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error?.message || '本周结算确认失败');
    } finally {
      setConfirmingWeek('');
    }
  }

  function downloadDetail() {
    if (!visibleCustomers.length) return toast.info('当前没有可下载的客户结算明细');
    const headers = ['技师', '工种', '分档', '提成比例', '升单率', '客户ID', '客户姓名', '体验卡', '体验卡服务时间', '升单时间', '项目数', '套餐金额', '已服务/总数', '抵扣券', '手工费', '提成', '其他费用', '总费用', '已付小计', '未付小计', '当周小计'];
    const lines = [headers.map(csvCell).join(','), ...visibleCustomers.map(customer => [
      customer.therapistName,
      visibleRows.find(row => row.therapistId === customer.therapistId)?.therapistType || '产康师',
      visibleRows.find(row => row.therapistId === customer.therapistId)?.tier || '',
      visibleRows.find(row => row.therapistId === customer.therapistId)?.commissionRate || 0,
      visibleRows.find(row => row.therapistId === customer.therapistId)?.upgradeRate || 0,
      customer.customerId, customer.customerName, customer.experienceStatus, customer.experienceServiceDate,
      customer.upgradeDate, customer.itemCount, customer.packageAmount,
      `${customer.servedTimes}/${customer.totalTimes}`, customer.couponFee, customer.laborFee, customer.commission, customer.otherFee, customer.totalFee,
      customer.paidSubtotal, customer.unpaidSubtotal, customer.weekSubtotals[selectedWeek?.key || ''] || 0,
    ].map(csvCell).join(','))];
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${weekStart}-工资结算客户明细.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
  return (
    <div className="flex h-[calc(100vh-86px)] min-h-0 flex-col gap-2 overflow-hidden p-3">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border bg-card p-1 shadow-sm">
          <button onClick={() => setScope('all')} className={`rounded-lg px-4 py-2 text-sm ${scope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>全部</button>
          <button onClick={() => setScope('month')} className={`rounded-lg px-4 py-2 text-sm ${scope === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>本月</button>
        </div>
        {scope === 'month' && <div className="flex items-center rounded-xl border border-border bg-card shadow-sm">
          <button aria-label="上一月" onClick={() => changeMonth(-1)} className="px-3 py-2.5 text-muted-foreground">‹</button>
          <div className="flex min-w-36 items-center justify-center gap-2 px-3 font-semibold"><CalendarDaysIcon size={17} className="text-primary" />{month.replace('-', '年')}月</div>
          <button aria-label="下一月" onClick={() => changeMonth(1)} className="px-3 py-2.5 text-muted-foreground">›</button>
        </div>}
        <TherapistMultiSelect rows={rows} selected={selectedTherapistIds} onChange={setSelectedTherapistIds} />
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs text-emerald-700">自动同步排期已完成服务</span>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">数据来源与计算口径</summary>
          <div className="absolute left-0 top-11 z-50 w-[520px] rounded-xl border border-border bg-card p-4 text-xs leading-6 text-foreground shadow-xl">
            <div>客户、套餐金额、项目数及总次数来自客户订单；已服务次数和每日完成记录来自排期管理。</div>
            <div>抵扣券默认 ¥300，可手动调整；其他费用默认 ¥0，可手动填写。</div>
            <div>产康师单次手工费：2项 ¥300、3项 ¥400、4项 ¥500、5项及以上 ¥600；总手工费＝单次手工费×订单总次数。</div>
            <div>提成＝套餐金额×技师档案当前定档比例（观察池0%、A档6%、B档8%、S档12%、王牌15%）；档案更新后工资全局重算。</div>
            <div>总费用＝抵扣券＋手工费＋提成＋其他费用。</div>
            <div>每日费用由排期“已完成”服务生成并可纠偏；确认本周结算后，才累计到已付金额。</div>
          </div>
        </details>
        <div className="ml-auto flex gap-2">
          <button onClick={() => salaryQ.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm"><RefreshCwIcon size={16} />同步排期</button>
          <button onClick={downloadDetail} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground"><DownloadIcon size={16} />下载明细</button>
        </div>
      </div>

      <div className="grid flex-shrink-0 grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <SummaryCard label="客户总数" value={`${summary.customerCount}人`} note="当前技师累计关联客户" />
        <SummaryCard label="服务总次数" value={`${summary.totalServiceTimes}次`} note="客户订单累计总次数" />
        <SummaryCard label="已服务总次数" value={`${summary.servedTimes}次`} note="排期已完成累计" />
        <SummaryCard label="总费用小计" value={money(summary.totalFee)} note="抵扣券+手工+提成+其他" />
        <SummaryCard label="已付小计" value={money(summary.paidSubtotal)} note="每周确认后累计" />
        <SummaryCard label="未付小计" value={money(summary.unpaidSubtotal)} note="总费用减已付" />
        <SummaryCard label="本周费用小计" value={money(summary.currentWeekSubtotal)} note={`已确认 ${money(confirmedWeekSubtotal)}`} />
        <SummaryCard label={scope === 'all' ? '总升单率' : '本月升单率'} value={`${summary.upgradeRate}%`} note="升单客户/全部客户" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <div className="mr-auto text-xs text-muted-foreground">每日服务与费用来自排期已完成凭证；确认当周结算后累计至已付，管理员、超管可点击金额纠偏。</div>
          <span className="text-xs font-medium text-muted-foreground">每周结算</span>
          <div className="flex items-center rounded-lg border border-border bg-background">
            <button aria-label="上一周" onClick={() => changeWeek(-1)} className="px-3 py-2 text-muted-foreground">‹</button>
            <div className="min-w-48 px-3 text-center text-sm font-semibold">{weekLabel(weekStart)}</div>
            <button aria-label="下一周" onClick={() => changeWeek(1)} className="px-3 py-2 text-muted-foreground">›</button>
            <button onClick={() => { setWeekStart(mondayOfCurrentWeek()); if (scope === 'month') setMonth(currentMonth()); }} className="border-l border-border px-3 py-2 text-xs text-primary">本周</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="table-fixed border-collapse text-center text-xs" style={{ width: totalTableWidth, minWidth: totalTableWidth }}>
            <colgroup>
              {columnWidths.map((width, index) => <col key={index} style={{ width }} />)}
            </colgroup>
            <thead className="sticky top-0 z-30 bg-muted text-muted-foreground shadow-sm">
              <tr>
                {['客户ID', '客户姓名', '体验卡', '升单时间', '项目', '套餐金额', '已服务/总数', '抵扣券', '手工费', '提成', '其他费用', '总费用', '已付', '未付'].map((label, index) => (
                  <ResizableHeader
                    key={label}
                    index={index}
                    width={columnWidths[index]}
                    onResize={resizeColumn}
                    stickyLeft={index < FROZEN_COLUMN_COUNT ? frozenOffsets[index] : undefined}
                    className="whitespace-nowrap text-center"
                  >{label}</ResizableHeader>
                ))}
                <ResizableHeader index={14} width={columnWidths[14]} onResize={resizeColumn}>行别</ResizableHeader>
                {(selectedWeek?.days || []).map((date, index) => (
                  <ResizableHeader key={date} index={15 + index} width={columnWidths[15 + index]} onResize={resizeColumn}>
                    <div>{weekdays[index]}</div><div className="mt-0.5 text-foreground">{date.slice(5).replace('-', '/')}</div>
                  </ResizableHeader>
                ))}
                <ResizableHeader index={22} width={columnWidths[22]} onResize={resizeColumn}>{weekStart === mondayOfCurrentWeek() ? '本周' : '当周'}结算</ResizableHeader>
              </tr>
            </thead>
            {salaryQ.isLoading ? (
              <tbody><tr><td colSpan={23} className="p-12 text-center text-muted-foreground">正在同步结算台账…</td></tr></tbody>
            ) : visibleRows.length === 0 ? (
              <tbody><tr><td colSpan={23} className="p-12 text-center text-muted-foreground">当前暂无技师客户数据</td></tr></tbody>
            ) : visibleRows.map(row => (
              <tbody key={row.therapistId}>
                <tr className="bg-primary/10 font-semibold">
                  <td
                    colSpan={5}
                    style={{ left: 0 }}
                    className="sticky z-20 border-y border-r border-border bg-blue-50 px-3 py-2 text-center text-primary shadow-[5px_0_7px_-5px_rgba(15,23,42,0.45)]"
                  >
                    <div>{row.therapistName} · {row.customers.length}位客户小结 · 升单率 {row.upgradeRate}%</div>
                    <div className="mt-1 text-[11px] font-normal text-muted-foreground">档案定档 {row.tier} · 提成比例 {row.commissionRate}% · {row.therapistType}</div>
                  </td>
                  <td className="border-y border-r border-border px-2 py-3">{money(row.customers.reduce((sum, item) => sum + item.packageAmount, 0))}</td>
                  <td className="border-y border-r border-border px-2 py-3 text-emerald-700">{row.customers.reduce((sum, item) => sum + item.servedTimes, 0)}/{row.customers.reduce((sum, item) => sum + item.totalTimes, 0)}</td>
                  <td className="border-y border-r border-border px-2 py-3">{money(row.customers.reduce((sum, item) => sum + item.couponFee, 0))}</td>
                  <td className="border-y border-r border-border px-2 py-3 text-blue-700">{money(row.customers.reduce((sum, item) => sum + item.laborFee, 0))}</td>
                  <td className="border-y border-r border-border px-2 py-3 text-purple-700">{money(row.customers.reduce((sum, item) => sum + item.commission, 0))}</td>
                  <td className="border-y border-r border-border px-2 py-3 text-amber-700">{money(row.customers.reduce((sum, item) => sum + item.otherFee, 0))}</td>
                  <td className="border-y border-r border-border px-2 py-3">{money(row.customers.reduce((sum, item) => sum + item.totalFee, 0))}</td>
                  <td className="border-y border-r border-border px-2 py-3">{money(row.customers.reduce((sum, item) => sum + item.paidSubtotal, 0))}</td>
                  <td className="border-y border-r border-border px-2 py-3 text-orange-600">{money(row.customers.reduce((sum, item) => sum + item.unpaidSubtotal, 0))}</td>
                  <td className="border-y border-r border-border px-1 py-3 text-center text-primary">小结</td>
                  {selectedWeek.days.map(date => {
                    const entries = row.customers.flatMap(customer => customer.days[date]?.entries || []);
                    return <td key={date} className="border-y border-r border-border px-2 py-2 text-center"><div>{entries.length}次</div><div className="text-emerald-700">{money(entries.reduce((sum, entry) => sum + entry.payableAmount, 0))}</div></td>;
                  })}
                  <td className="border-y border-border px-2 py-2 text-center">
                    <div className="font-semibold text-emerald-700">{money(row.customers.reduce((sum, item) => sum + Number(item.weekSubtotals[selectedWeek.key] || 0), 0))}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">已确认 {money(row.customers.reduce((sum, item) => sum + Number(item.weekConfirmedSubtotals[selectedWeek.key] || 0), 0))}</div>
                  </td>
                </tr>
                {row.customers.map(customer => (
                  <Fragment key={`${row.therapistId}-${customer.customerDbId}`}>
                    <tr className="align-top hover:bg-muted/20">
                      <td rowSpan={3} style={{ left: frozenOffsets[0] }} className="sticky z-20 border-b border-r border-border bg-card px-1 py-3 text-center font-mono text-primary">{customer.customerId}</td>
                      <td rowSpan={3} style={{ left: frozenOffsets[1] }} className="sticky z-20 break-all border-b border-r border-border bg-card px-1 py-3 text-center font-medium leading-5">{customer.customerName}</td>
                      <td rowSpan={3} style={{ left: frozenOffsets[2] }} className={`sticky z-20 max-w-0 overflow-hidden border-b border-r border-border bg-card px-1 py-3 text-center leading-5 ${customer.experienceStatus === '已服务' ? 'text-emerald-700' : customer.experienceStatus === '待服务' ? 'text-amber-700' : 'text-muted-foreground'}`}>
                        <div className="truncate">{customer.experienceStatus}</div>
                        {customer.experienceStatus === '已服务' && <div className="mt-1 max-w-full break-all text-[10px] leading-4 text-muted-foreground">{customer.experienceServiceDate || '时间待补录'}</div>}
                      </td>
                      <td rowSpan={3} style={{ left: frozenOffsets[3] }} className="sticky z-20 border-b border-r border-border bg-card px-1 py-3 text-center">{customer.upgradeDate || '—'}</td>
                      <td rowSpan={3} style={{ left: frozenOffsets[4] }} className="sticky z-20 border-b border-r border-border bg-card px-1 py-3 text-center font-medium shadow-[5px_0_7px_-5px_rgba(15,23,42,0.45)]">{customer.itemCount ? `${customer.itemCount}项` : '—'}</td>
                      <td rowSpan={3} className="border-b border-r border-border px-3 py-3 font-medium">{money(customer.packageAmount)}</td>
                      <td rowSpan={3} className="border-b border-r border-border px-2 py-3 text-center font-semibold text-emerald-600">{customer.servedTimes}/{customer.totalTimes}</td>
                      <td rowSpan={3} className="border-b border-r border-border px-3 py-3"><button onClick={() => openCustomer(customer)} className={editable ? 'text-primary hover:underline' : ''}>{money(customer.couponFee)}</button></td>
                      <td rowSpan={3} className="border-b border-r border-border px-2 py-3 font-semibold text-blue-700">{money(customer.laborFee)}</td>
                      <td rowSpan={3} className="border-b border-r border-border px-2 py-3 font-semibold text-purple-700">{money(customer.commission)}</td>
                      <td rowSpan={3} title="路补、耗材等其他费用，默认0元，支持手动调整" className="border-b border-r border-border px-2 py-3 font-semibold text-amber-700"><button onClick={() => openCustomer(customer)} className={editable ? 'text-amber-700 hover:underline' : ''}>{money(customer.otherFee)}</button></td>
                      <td rowSpan={3} className="border-b border-r border-border px-3 py-3 font-semibold">{money(customer.totalFee)}</td>
                      <td rowSpan={3} className="border-b border-r border-border px-3 py-3"><button onClick={() => openCustomer(customer)} className={editable ? 'text-primary hover:underline' : ''}>{money(customer.paidSubtotal)}</button></td>
                      <td rowSpan={3} className="border-b border-r border-border px-3 py-3 font-semibold text-orange-600">{money(customer.unpaidSubtotal)}</td>
                      <td className="border-b border-r border-border bg-blue-50/30 px-2 py-2 text-center text-blue-700">服务</td>
                      {(selectedWeek?.days || []).map(date => {
                        const day = customer.days[date];
                        return <td key={date} className="border-b border-r border-border px-2 py-2 text-center">{day?.entries.map(entry => <div key={entry.id} className="mb-1 rounded bg-blue-50 px-2 py-1 text-center text-blue-700">已完成 · {entry.itemCount || 0}项</div>) || '—'}</td>;
                      })}
                      <td className="border-b border-border px-2 py-2 text-center text-muted-foreground">完成{(selectedWeek?.days || []).reduce((sum, date) => sum + (customer.days[date]?.entries.length || 0), 0)}次</td>
                    </tr>
                    <tr className="align-top hover:bg-muted/20">
                      <td className="border-b border-r border-border bg-emerald-50/30 px-2 py-2 text-center text-emerald-700">费用</td>
                      {(selectedWeek?.days || []).map(date => {
                        const day = customer.days[date];
                        return <td key={date} className="border-b border-r border-border px-2 py-2 text-center">{day ? day.entries.map(entry => <button key={entry.id} onClick={() => openEntry(entry)} className={`mb-1 block w-full rounded px-1 py-1 text-center ${entry.settlementStatus === '待确认' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'} ${editable ? 'hover:brightness-95' : ''}`}><span className="inline-flex items-center justify-center gap-1">{money(entry.payableAmount)}{editable && <Edit3Icon size={11} />}</span><span className="block text-[10px]">{entry.settlementStatus}</span></button>) : '—'}</td>;
                      })}
                      <td className="border-b border-border px-1 py-2 text-center">
                        {(() => {
                          const entries = selectedWeek.days.flatMap(date => customer.days[date]?.entries || []);
                          const total = Number(customer.weekSubtotals[selectedWeek.key] || 0);
                          const confirmed = Number(customer.weekConfirmedSubtotals[selectedWeek.key] || 0);
                          const allConfirmed = entries.length > 0 && entries.every(entry => entry.settlementStatus !== '待确认');
                          const confirmationKey = `${customer.therapistId}:${customer.customerDbId}:${selectedWeek.key}`;
                          if (!entries.length) return <span className="text-muted-foreground">—</span>;
                          return <div className="space-y-1">
                            <div className="font-semibold text-emerald-700">{money(total)}</div>
                            <div className="text-[10px] text-muted-foreground">已确认 {money(confirmed)}</div>
                            {editable && <button
                              disabled={confirmingWeek === confirmationKey}
                              onClick={() => toggleWeekConfirmation(customer, !allConfirmed)}
                              className={`rounded px-2 py-1 text-[10px] disabled:opacity-50 ${allConfirmed ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}
                            >{confirmingWeek === confirmationKey ? '处理中…' : allConfirmed ? '撤销确认' : '确认本周'}</button>}
                          </div>;
                        })()}
                      </td>
                    </tr>
                    <tr className="align-top hover:bg-muted/20">
                      <td className="border-b border-r border-border bg-amber-50/30 px-2 py-2 text-center text-amber-700">备注</td>
                      {(selectedWeek?.days || []).map(date => {
                        const day = customer.days[date];
                        return <td key={date} className="border-b border-r border-border px-2 py-2 text-center text-muted-foreground">{day?.entries.map(entry => <button key={entry.id} onClick={() => openEntry(entry)} className={`block w-full rounded px-1 text-center ${editable ? 'hover:bg-muted' : ''}`}>{entry.settlementNote || (editable ? '点击添加备注' : '—')}</button>) || '—'}</td>;
                      })}
                      <td className="border-b border-border px-2 py-2 text-center text-muted-foreground">{customer.adjustmentNote || '—'}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>

      {editingEntry && entryDraft && <Modal title={`${editingEntry.customerName} · ${editingEntry.serviceDate.slice(0, 10)} 服务费用`} saving={saving} onClose={() => setEditingEntry(null)} onSave={saveEntry}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-800">来源：排期管理“已完成”服务；{editingEntry.itemCount}项默认费用已按项目数生成，管理员、超管可在此纠偏。</div>
          {editingEntry.serviceType === '体验卡' ? <label className="space-y-1.5 text-sm"><span>体验卡服务费用</span><input type="number" min="0" value={entryDraft.experienceFee} onChange={event => setEntryDraft({ ...entryDraft, experienceFee: Number(event.target.value) })} className={inputClass} /></label> : <label className="space-y-1.5 text-sm"><span>本次手工费</span><input type="number" min="0" value={entryDraft.laborFee} onChange={event => setEntryDraft({ ...entryDraft, laborFee: Number(event.target.value) })} className={inputClass} /></label>}
          <label className="space-y-1.5 text-sm"><span>本次其他费用（路补/耗材）</span><input type="number" min="0" value={entryDraft.otherFee} onChange={event => setEntryDraft({ ...entryDraft, otherFee: Number(event.target.value) })} className={inputClass} /></label>
          <label className="space-y-1.5 text-sm"><span>凭证状态</span><select value={entryDraft.settlementStatus} onChange={event => setEntryDraft({ ...entryDraft, settlementStatus: event.target.value as EntryDraft['settlementStatus'] })} className={inputClass}><option>待确认</option><option>已确认</option><option>已结算</option></select></label>
          <label className="col-span-2 space-y-1.5 text-sm"><span>备注</span><textarea rows={3} value={entryDraft.settlementNote} onChange={event => setEntryDraft({ ...entryDraft, settlementNote: event.target.value })} placeholder="可填写额外路补、耗材或特殊情况" className={inputClass} /></label>
        </div>
      </Modal>}

      {editingCustomer && adjustmentDraft && <Modal title={`${editingCustomer.therapistName} · ${editingCustomer.customerName} 月度结算`} saving={saving} onClose={() => setEditingCustomer(null)} onSave={saveAdjustment}>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm leading-6">当前总费用：<b>{money(editingCustomer.totalFee)}</b>，已付：<b className="text-emerald-700">{money(editingCustomer.paidSubtotal)}</b>，未付：<b className="text-orange-600">{money(editingCustomer.unpaidSubtotal)}</b><br /><span className="text-xs text-muted-foreground">手工费 {money(editingCustomer.laborUnitFee)} × {editingCustomer.totalTimes}次＝{money(editingCustomer.laborFee)}；已付金额仅由每周已确认费用累计。</span></div>
          <label className="block space-y-1.5 text-sm"><span>抵扣券（默认 ¥300，计入总费用）</span><input type="number" min="0" value={adjustmentDraft.couponFee} onChange={event => setAdjustmentDraft({ ...adjustmentDraft, couponFee: Number(event.target.value) })} className={inputClass} /></label>
          <label className="block space-y-1.5 text-sm"><span>其他费用（默认 ¥0，路补/耗材等）</span><input type="number" min="0" value={adjustmentDraft.otherFee} onChange={event => setAdjustmentDraft({ ...adjustmentDraft, otherFee: Number(event.target.value) })} className={inputClass} /></label>
          <label className="block space-y-1.5 text-sm"><span>月度结算备注</span><textarea rows={3} value={adjustmentDraft.adjustmentNote} onChange={event => setAdjustmentDraft({ ...adjustmentDraft, adjustmentNote: event.target.value })} className={inputClass} /></label>
        </div>
      </Modal>}
    </div>
  );
}
