import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  RefreshCwIcon, DownloadIcon, EditIcon, XIcon, PlusIcon, Trash2Icon,
  ChevronLeftIcon, ChevronRightIcon, CalendarIcon, CheckCircleIcon,
  AlertCircleIcon, ClockIcon
} from 'lucide-react';
import { useTherapists, useAppointments, useOrders } from '../api/hooks';

// ─────────── 本地类型 ────────────────────────────────────────────────────────

type SettleStatus = '待结算' | '已结算' | '审核中';

interface OtherFeeItem {
  label: string;
  amount: number;
  note: string;
}

interface TherapistWeekRow {
  therapistId: string;
  therapistName: string;
  therapistType: string;
  starLevel: 1 | 2 | 3 | 4 | 5;
  experienceFee: number;    // 体验卡费用
  laborFee: number;         // 套餐手工费
  commission: number;       // 提成
  couponFee: number;        // 抵扣券
  otherFee: number;         // 其他费用
  total: number;
  status: SettleStatus;
  extras: OtherFeeItem[];
  // 明细快照
  expApptIds: string[];     // 体验卡预约id列表
  laborDetails: { apptId: string; customerName: string; date: string; count: number; fee: number }[];
  commissionDetails: { orderId: string; customerName: string; amount: number; rate: number; fee: number }[];
  couponDetails: { orderId: string; customerName: string; fee: number }[];
}

// ─────────── 工具函数 ────────────────────────────────────────────────────────

function getWeekBounds(offsetWeeks: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const diffToMon = (dow === 0 ? -6 : 1 - dow);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + offsetWeeks * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  // 计算是该月第几周
  const firstDayOfMonth = new Date(mon.getFullYear(), mon.getMonth(), 1);
  const weekNo = Math.ceil((mon.getDate() + firstDayOfMonth.getDay()) / 7);
  const label = `${mon.getFullYear()}年${mon.getMonth() + 1}月 第${weekNo}周`;
  return { start: mon, end: sun, label };
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseServiceCount(service: string): number {
  // 拆分 "," 或 "+" 或 "，"
  const parts = service.split(/[,，+]/).map(s => s.trim()).filter(Boolean);
  return parts.length;
}

function isExperienceAppt(service: string): boolean {
  return service.includes('体验卡');
}

const COMMISSION_RATE: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0.05, 2: 0.06, 3: 0.08, 4: 0.10, 5: 0.12,
};

function fmtMoney(n: number): string {
  return `¥${n.toLocaleString('zh-CN')}`;
}

// ─────────── 初始化本周各技师结算行 ──────────────────────────────────────────

const STATUS_CYCLE: SettleStatus[] = ['待结算', '审核中', '已结算'];
const weekStatusMap: Map<string, SettleStatus> = new Map();
const weekExtrasMap: Map<string, OtherFeeItem[]> = new Map();

function buildRows(weekStart: Date, weekEnd: Date, selectedIds: string[], THERAPISTS: any[], APPOINTMENTS: any[], ORDERS: any[]): TherapistWeekRow[] {
  const weekStartStr = toDateStr(weekStart);
  const therapists = selectedIds.length > 0
    ? THERAPISTS.filter(t => selectedIds.includes(t.id))
    : THERAPISTS;

  return therapists.map(therapist => {
    const key = `W-${weekStartStr}-${therapist.id}`;

    // 本周该技师的预约（非已取消）
    const weekAppts = APPOINTMENTS.filter(a =>
      a.therapistId === therapist.id &&
      a.date >= toDateStr(weekStart) &&
      a.date <= toDateStr(weekEnd) &&
      a.status !== '已取消'
    );

    // 1. 体验卡费用
    const expAppts = weekAppts.filter(a => isExperienceAppt(a.service));
    const experienceFee = expAppts.length * 200;

    // 2. 套餐手工费
    const packageAppts = weekAppts.filter(a => !isExperienceAppt(a.service));
    let laborFee = 0;
    const laborDetails: TherapistWeekRow['laborDetails'] = [];
    packageAppts.forEach(a => {
      const cnt = parseServiceCount(a.service);
      let fee = 0;
      if (therapist.therapistType === '产康师') {
        fee = cnt >= 3 ? 400 : cnt === 2 ? 300 : 150;
      } else {
        fee = 150;
      }
      laborFee += fee;
      laborDetails.push({
        apptId: a.id,
        customerName: a.customerName,
        date: a.date,
        count: cnt,
        fee,
      });
    });

    // 3. 提成 + 4. 抵扣券
    // 找出本周关联的已完成订单（usedTimes === totalTimes）
    const weekCustomerIds = new Set(weekAppts.map(a => a.customerId));
    let commission = 0;
    let couponFee = 0;
    const commissionDetails: TherapistWeekRow['commissionDetails'] = [];
    const couponDetails: TherapistWeekRow['couponDetails'] = [];

    ORDERS.forEach(order => {
      if (order.type === '体验卡') return;
      if (!weekCustomerIds.has(order.customerId)) return;
      // 该订单最后一次服务是本周完成的（usedTimes === totalTimes）
      if (order.usedTimes < order.totalTimes) return;
      const rate = COMMISSION_RATE[therapist.starLevel];
      const fee = Math.round(order.amount * rate);
      commission += fee;
      commissionDetails.push({
        orderId: order.id,
        customerName: order.customerName,
        amount: order.amount,
        rate,
        fee,
      });
      // 抵扣券
      if (order.hasCoupon) {
        couponFee += 300;
        couponDetails.push({ orderId: order.id, customerName: order.customerName, fee: 300 });
      }
    });

    // 5. 其他费用（存储在 map 中，可通过编辑弹窗修改）
    const extras: OtherFeeItem[] = weekExtrasMap.get(key) ?? [];
    const otherFee = extras.reduce((s, it) => s + (it.amount || 0), 0);

    const total = experienceFee + laborFee + commission + couponFee + otherFee;
    const status: SettleStatus = weekStatusMap.get(key) ?? '待结算';

    return {
      therapistId: therapist.id,
      therapistName: therapist.name,
      therapistType: therapist.therapistType,
      starLevel: therapist.starLevel,
      experienceFee,
      laborFee,
      commission,
      couponFee,
      otherFee,
      total,
      status,
      extras,
      expApptIds: expAppts.map(a => a.id),
      laborDetails,
      commissionDetails,
      couponDetails,
    };
  });
}

// ─────────── 主组件 ───────────────────────────────────────────────────────────

export default function FinanceSalaryPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[]>([]);
  const [therapistDropOpen, setTherapistDropOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const apptsQ = useAppointments({ page: 1, pageSize: 1000 });
  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];
  const APPOINTMENTS: any[] = apptsQ.data?.data ?? [];
  const ORDERS: any[] = ordersQ.data?.data ?? [];

  // 编辑弹窗状态
  const [editingRow, setEditingRow] = useState<TherapistWeekRow | null>(null);
  const [editExtras, setEditExtras] = useState<OtherFeeItem[]>([]);

  // 明细弹窗
  const [detailRow, setDetailRow] = useState<TherapistWeekRow | null>(null);

  const { start: weekStart, end: weekEnd, label: weekLabel } = useMemo(
    () => getWeekBounds(weekOffset),
    [weekOffset]
  );
  const weekStartStr = toDateStr(weekStart);

  const rows = useMemo(
    () => buildRows(weekStart, weekEnd, selectedTherapistIds, THERAPISTS, APPOINTMENTS, ORDERS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekOffset, selectedTherapistIds, refreshTick, THERAPISTS, APPOINTMENTS, ORDERS]
  );

  // ── 汇总卡片 ──────────────────────────────────────────────────────────────
  const summaryExpFee = rows.reduce((s, r) => s + r.experienceFee, 0);
  const summaryLaborFee = rows.reduce((s, r) => s + r.laborFee, 0);
  const summaryCommission = rows.reduce((s, r) => s + r.commission, 0);
  const summaryTotal = rows.reduce((s, r) => s + r.total, 0);
  const pendingCount = rows.filter(r => r.status === '待结算').length;

  // ── 周日期条 ────────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const CN_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  // ── 技师多选下拉 ─────────────────────────────────────────────────────────
  function toggleTherapist(id: string) {
    setSelectedTherapistIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // ── 状态点击循环 ─────────────────────────────────────────────────────────
  function cycleStatus(row: TherapistWeekRow) {
    const key = `W-${weekStartStr}-${row.therapistId}`;
    const cur = row.status;
    const idx = STATUS_CYCLE.indexOf(cur);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    weekStatusMap.set(key, next);
    setRefreshTick(t => t + 1);
    toast.success(`${row.therapistName} 结算状态已更新为「${next}」`);
  }

  // ── 打开编辑弹窗 ─────────────────────────────────────────────────────────
  function openEdit(row: TherapistWeekRow) {
    setEditingRow(row);
    setEditExtras(row.extras.length > 0
      ? row.extras.map(e => ({ ...e }))
      : [{ label: '路补', amount: 0, note: '' }]
    );
  }

  function saveEdit() {
    if (!editingRow) return;
    const key = `W-${weekStartStr}-${editingRow.therapistId}`;
    weekExtrasMap.set(key, editExtras.filter(e => e.label || e.amount));
    setEditingRow(null);
    setRefreshTick(t => t + 1);
    toast.success('其他费用已保存');
  }

  // ── 下载明细（模拟） ────────────────────────────────────────────────────
  function downloadDetail() {
    toast.success(`${weekLabel} 薪酬明细已导出`);
  }

  // ── 状态标签 ────────────────────────────────────────────────────────────
  function StatusBadge({ status }: { status: SettleStatus }) {
    const cfg = {
      '待结算': { bg: 'bg-warning/10 text-warning', icon: <ClockIcon size={12} /> },
      '审核中': { bg: 'bg-brand/10 text-brand', icon: <AlertCircleIcon size={12} /> },
      '已结算': { bg: 'bg-success/10 text-success', icon: <CheckCircleIcon size={12} /> },
    }[status];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg}`}>
        {cfg.icon}{status}
      </span>
    );
  }

  // ── 星级 ────────────────────────────────────────────────────────────────
  function StarBadge({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
    return (
      <span className="text-warning text-xs font-semibold">
        {'★'.repeat(level)}{'☆'.repeat(5 - level)}
      </span>
    );
  }

  return (
    <div data-cmp="FinanceSalaryPage" className="p-6 flex flex-col gap-5">

      {/* ── 顶部操作栏 ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 周切换 */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-2 py-1.5 shadow-custom">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              className="p-1 rounded hover:bg-accent transition-colors"
            >
              <ChevronLeftIcon size={16} className="text-muted-foreground" />
            </button>
            <CalendarIcon size={14} className="text-brand ml-1" />
            <span className="text-sm font-semibold text-foreground px-2 min-w-[160px] text-center">
              {weekLabel}
            </span>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              className="p-1 rounded hover:bg-accent transition-colors"
            >
              <ChevronRightIcon size={16} className="text-muted-foreground" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-brand hover:underline px-1"
            >
              本周
            </button>
          </div>

          {/* 技师多选 */}
          <div className="relative">
            <button
              onClick={() => setTherapistDropOpen(o => !o)}
              className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors shadow-custom min-w-[140px]"
            >
              <span className="flex-1 text-left">
                {selectedTherapistIds.length === 0
                  ? '全部技师'
                  : `已选 ${selectedTherapistIds.length} 位`}
              </span>
              <ChevronRightIcon size={14} className={`text-muted-foreground transition-transform ${therapistDropOpen ? 'rotate-90' : ''}`} />
            </button>
            <div className={`absolute top-full mt-1 left-0 z-20 bg-popover border border-border rounded-lg shadow-custom w-52 py-1 ${therapistDropOpen ? '' : 'hidden'}`}>
              <button
                onClick={() => setSelectedTherapistIds([])}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors text-brand"
              >
                全部技师
              </button>
              {THERAPISTS.map(t => (
                <button
                  key={t.id}
                  onClick={() => toggleTherapist(t.id)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <span>{t.name}</span>
                  <span className={`w-4 h-4 rounded border text-xs flex items-center justify-center
                    ${selectedTherapistIds.includes(t.id) ? 'bg-brand border-brand text-white' : 'border-border'}`}>
                    {selectedTherapistIds.includes(t.id) ? '✓' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshTick(t => t + 1); toast.success('数据已刷新'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground hover:bg-accent shadow-custom transition-colors"
          >
            <RefreshCwIcon size={14} />刷新数据
          </button>
          <button
            onClick={downloadDetail}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-sm hover:opacity-90 shadow-custom transition-colors"
          >
            <DownloadIcon size={14} />下载明细
          </button>
        </div>
      </div>

      {/* ── 周日期条 ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3 shadow-custom flex-wrap">
        <span className="text-xs text-muted-foreground font-medium mr-2">排期周</span>
        {weekDates.map((d, i) => {
          const isPast = d <= today;
          const isToday = d.getTime() === today.getTime();
          const dayStr = toDateStr(d);
          return (
            <div
              key={dayStr}
              className={`flex flex-col items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                ${isPast
                  ? 'bg-brand text-white shadow-custom'
                  : 'bg-muted text-muted-foreground'}`}
            >
              <span className="text-[10px] mb-0.5 opacity-80">{CN_DAYS[i]}</span>
              <span>{`${d.getMonth() + 1}/${d.getDate()}`}</span>
              {isToday && (
                <span className="text-[9px] mt-0.5 bg-white text-brand rounded px-1 font-bold">今天</span>
              )}
            </div>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground">
          {weekDates.filter(d => d <= today).length} 天已过
        </span>
      </div>

      {/* ── 汇总卡片 ────────────────────────────────────────────────────── */}
      <div className="flex gap-4 flex-wrap">
        {[
          { label: '体验卡手工费', value: summaryExpFee, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/20' },
          { label: '套餐手工费', value: summaryLaborFee, color: 'text-brand', bg: 'bg-brand/5' },
          { label: '提成合计', value: summaryCommission, color: 'text-success', bg: 'bg-success/5' },
          { label: '合计应付', value: summaryTotal, color: 'text-foreground', bg: 'bg-card', bold: true },
          { label: '待结算人数', value: pendingCount, color: 'text-warning', bg: 'bg-warning/5', unit: '人' },
        ].map(card => (
          <div
            key={card.label}
            className={`flex flex-col gap-1 px-5 py-3 rounded-xl border border-border shadow-custom min-w-[130px] flex-1 ${card.bg}`}
          >
            <span className="text-xs text-muted-foreground">{card.label}</span>
            <span className={`text-xl font-bold ${card.color} ${card.bold ? 'text-2xl' : ''}`}>
              {card.unit
                ? `${card.value}${card.unit}`
                : fmtMoney(card.value)}
            </span>
          </div>
        ))}
      </div>

      {/* ── 主表格 ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl shadow-custom overflow-x-auto">
        <table className="w-full text-sm text-center">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                '技师ID', '技师名称', '类型', '星级',
                '体验卡费用', '手工费用', '提成', '抵扣券',
                '其他费用', '合计应付', '结算状态', '操作'
              ].map(col => (
                <th key={col} className="px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.therapistId} className="border-b border-border hover:bg-accent/40 transition-colors">
                <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{row.therapistId}</td>
                <td className="px-3 py-3 font-semibold text-foreground">{row.therapistName}</td>
                <td className="px-3 py-3">
                  <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">{row.therapistType}</span>
                </td>
                <td className="px-3 py-3"><StarBadge level={row.starLevel} /></td>
                <td className="px-3 py-3 text-orange-500 font-medium">
                  {fmtMoney(row.experienceFee)}
                  {row.experienceFee > 0 && (
                    <div className="text-[10px] text-muted-foreground">{row.expApptIds.length}次×¥200</div>
                  )}
                </td>
                <td className="px-3 py-3 text-brand font-medium">
                  {fmtMoney(row.laborFee)}
                  {row.laborDetails.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">{row.laborDetails.length}次</div>
                  )}
                </td>
                <td className="px-3 py-3 text-success font-medium">
                  {fmtMoney(row.commission)}
                  {row.commissionDetails.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">{(COMMISSION_RATE[row.starLevel] * 100).toFixed(0)}%</div>
                  )}
                </td>
                <td className="px-3 py-3 text-purple-500 font-medium">
                  {row.couponFee > 0 ? fmtMoney(row.couponFee) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-3 text-foreground">
                  {fmtMoney(row.otherFee)}
                  {row.extras.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">{row.extras.length}项</div>
                  )}
                </td>
                <td className="px-3 py-3 font-bold text-foreground text-base">{fmtMoney(row.total)}</td>
                <td className="px-3 py-3">
                  <button onClick={() => cycleStatus(row)}>
                    <StatusBadge status={row.status} />
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => setDetailRow(row)}
                      className="p-1.5 rounded hover:bg-brand/10 text-brand transition-colors"
                      title="查看明细"
                    >
                      <CalendarIcon size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(row)}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="编辑其他费用"
                    >
                      <EditIcon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="py-12 text-muted-foreground text-sm">
                  本周暂无技师数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 编辑其他费用弹窗 ────────────────────────────────────────────── */}
      <div className={`fixed inset-0 z-40 flex items-center justify-center ${editingRow ? '' : 'hidden'}`}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setEditingRow(null)} />
        <div className="relative bg-card rounded-2xl shadow-custom border border-border w-[480px] max-h-[80vh] overflow-y-auto z-50">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h3 className="font-semibold text-foreground">{editingRow?.therapistName} · 其他费用</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{weekLabel}　路补 / 耗材 / 其他</p>
            </div>
            <button onClick={() => setEditingRow(null)} className="p-1.5 rounded hover:bg-accent transition-colors">
              <XIcon size={16} className="text-muted-foreground" />
            </button>
          </div>
          <div className="px-6 py-4 flex flex-col gap-3">
            {editExtras.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 flex-wrap">
                <select
                  value={item.label}
                  onChange={e => {
                    const next = [...editExtras];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setEditExtras(next);
                  }}
                  className="flex-none w-28 border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-foreground"
                >
                  {['路补', '耗材费用', '其他'].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="金额"
                  value={item.amount || ''}
                  onChange={e => {
                    const next = [...editExtras];
                    next[idx] = { ...next[idx], amount: Number(e.target.value) || 0 };
                    setEditExtras(next);
                  }}
                  className="flex-none w-24 border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-foreground"
                />
                <input
                  type="text"
                  placeholder="备注"
                  value={item.note}
                  onChange={e => {
                    const next = [...editExtras];
                    next[idx] = { ...next[idx], note: e.target.value };
                    setEditExtras(next);
                  }}
                  className="flex-1 min-w-0 border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-foreground"
                />
                <button
                  onClick={() => setEditExtras(prev => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <Trash2Icon size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setEditExtras(prev => [...prev, { label: '路补', amount: 0, note: '' }])}
              className="flex items-center gap-1.5 text-sm text-brand hover:underline mt-1"
            >
              <PlusIcon size={14} />添加费用项
            </button>
            <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
              <span className="text-sm text-muted-foreground">
                合计其他费用：<strong className="text-foreground">{fmtMoney(editExtras.reduce((s, e) => s + (e.amount || 0), 0))}</strong>
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
            <button
              onClick={() => setEditingRow(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
            >
              取消
            </button>
            <button
              onClick={saveEdit}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm hover:opacity-90 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>

      {/* ── 明细弹窗 ────────────────────────────────────────────────────── */}
      <div className={`fixed inset-0 z-40 flex items-center justify-center ${detailRow ? '' : 'hidden'}`}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setDetailRow(null)} />
        <div className="relative bg-card rounded-2xl shadow-custom border border-border w-[600px] max-h-[85vh] overflow-y-auto z-50">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h3 className="font-semibold text-foreground">{detailRow?.therapistName} · 费用明细</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{weekLabel}</p>
            </div>
            <button onClick={() => setDetailRow(null)} className="p-1.5 rounded hover:bg-accent transition-colors">
              <XIcon size={16} className="text-muted-foreground" />
            </button>
          </div>
          {detailRow && (
            <div className="px-6 py-4 flex flex-col gap-5">

              {/* 体验卡 */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  体验卡费用 · {fmtMoney(detailRow.experienceFee)}
                </h4>
                {detailRow.expApptIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-4">本周无体验卡预约</p>
                ) : (
                  <div className="pl-4 flex flex-col gap-1">
                    {detailRow.expApptIds.map(id => {
                      const a = APPOINTMENTS.find(x => x.id === id);
                      return (
                        <div key={id} className="flex justify-between text-sm">
                          <span className="text-foreground">{a?.customerName} · {a?.date} · {a?.service}</span>
                          <span className="text-orange-500 font-medium">¥200</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 套餐手工费 */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand inline-block" />
                  套餐手工费 · {fmtMoney(detailRow.laborFee)}
                </h4>
                {detailRow.laborDetails.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-4">本周无套餐服务</p>
                ) : (
                  <div className="pl-4 flex flex-col gap-1">
                    {detailRow.laborDetails.map(d => (
                      <div key={d.apptId} className="flex justify-between text-sm">
                        <span className="text-foreground">{d.customerName} · {d.date} · {d.count >= 3 ? '三项+' : d.count === 2 ? '两项' : '单项'}</span>
                        <span className="text-brand font-medium">{fmtMoney(d.fee)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 提成 */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success inline-block" />
                  提成 · {fmtMoney(detailRow.commission)}
                  <span className="normal-case text-[10px]">（{detailRow.starLevel}星·{(COMMISSION_RATE[detailRow.starLevel] * 100).toFixed(0)}%）</span>
                </h4>
                {detailRow.commissionDetails.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-4">本周无完结订单提成</p>
                ) : (
                  <div className="pl-4 flex flex-col gap-1">
                    {detailRow.commissionDetails.map(d => (
                      <div key={d.orderId} className="flex justify-between text-sm">
                        <span className="text-foreground">{d.customerName} · {fmtMoney(d.amount)} × {(d.rate * 100).toFixed(0)}%</span>
                        <span className="text-success font-medium">{fmtMoney(d.fee)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 抵扣券 */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                  抵扣券 · {fmtMoney(detailRow.couponFee)}
                </h4>
                {detailRow.couponDetails.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-4">本周无抵扣券发放</p>
                ) : (
                  <div className="pl-4 flex flex-col gap-1">
                    {detailRow.couponDetails.map(d => (
                      <div key={d.orderId} className="flex justify-between text-sm">
                        <span className="text-foreground">{d.customerName} · 服务完结抵扣券</span>
                        <span className="text-purple-500 font-medium">{fmtMoney(d.fee)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 其他费用 */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />
                  其他费用 · {fmtMoney(detailRow.otherFee)}
                </h4>
                {detailRow.extras.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-4">暂无其他费用</p>
                ) : (
                  <div className="pl-4 flex flex-col gap-1">
                    {detailRow.extras.map((e, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-foreground">{e.label}{e.note ? ` · ${e.note}` : ''}</span>
                        <span className="text-foreground font-medium">{fmtMoney(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 合计 */}
              <div className="border-t border-border pt-3 flex justify-between items-center">
                <span className="font-semibold text-foreground">合计应付</span>
                <span className="text-xl font-bold text-foreground">{fmtMoney(detailRow.total)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-end px-6 py-4 border-t border-border">
            <button
              onClick={() => setDetailRow(null)}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm hover:opacity-90 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
