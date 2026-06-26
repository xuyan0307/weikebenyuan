import { useState, useMemo } from 'react';
import {
  ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon,
  PlusIcon, Trash2Icon, EditIcon, CheckIcon, XIcon, TrendingUpIcon,
  TrendingDownIcon, DownloadIcon, BuildingIcon, UsersIcon, ZapIcon,
  BriefcaseIcon, CreditCardIcon, ReceiptIcon
} from 'lucide-react';
import { useOrders } from '../api/hooks';

// ─────────── 类型 ────────────────────────────────────────────────────────────

type TimeMode = '月' | '周' | '日';

interface RentRow {
  id: string;
  subItem: string;   // 房租费 / 水电费xxx
  monthlyData: Record<string, number>; // key=YYYY-MM
}

interface StaffRow {
  id: string;
  name: string;
  monthlyData: Record<string, number>;
}

interface FlowRecord {
  id: string;
  date: string;   // MM.DD
  summary: string;
  amount: number;
}

interface OfficeRecord {
  id: string;
  date: string;
  summary: string;
  amount: number;
}

interface FinanceRecord {
  id: string;
  month: string; // YYYY-MM
  summary: string;
  amount: number;
}

// ─────────── Mock 初始数据 ────────────────────────────────────────────────────

const MONTHS_2025 = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];
const SHORT_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月'];

const initRentRows: RentRow[] = [
  {
    id: 'rent1',
    subItem: '房租费',
    monthlyData: { '2025-01': 4000, '2025-02': 4000, '2025-03': 4000, '2025-04': 6000, '2025-05': 4000, '2025-06': 4000 },
  },
  {
    id: 'rent2',
    subItem: '水电费',
    monthlyData: { '2025-01': 78, '2025-02': 78, '2025-03': 78, '2025-04': 87.26, '2025-05': 303.39, '2025-06': 120 },
  },
];

const initStaffRows: StaffRow[] = [
  { id: 's1', name: '郑芷钰', monthlyData: { '2025-01': 8000, '2025-02': 8000, '2025-03': 8000, '2025-04': 8000, '2025-05': 8000, '2025-06': 8000 } },
  { id: 's2', name: '徐燕玲', monthlyData: { '2025-01': 8000, '2025-02': 8000, '2025-03': 8000, '2025-04': 8000, '2025-05': 8000, '2025-06': 8000 } },
  { id: 's3', name: '王秋怡', monthlyData: { '2025-01': 0, '2025-02': 0, '2025-03': 1182, '2025-04': 2600, '2025-05': 3000, '2025-06': 3000 } },
  { id: 's4', name: '黄屹凌', monthlyData: { '2025-01': 0, '2025-02': 0, '2025-03': 0, '2025-04': 1655, '2025-05': 2600, '2025-06': 2600 } },
  { id: 's5', name: '徐炎', monthlyData: { '2025-01': 0, '2025-02': 0, '2025-03': 0, '2025-04': 0, '2025-05': 4000, '2025-06': 4000 } },
];

const initFlowRecords: FlowRecord[] = [
  { id: 'f1', date: '5.3', summary: '小红书聚光充值', amount: 3000 },
  { id: 'f2', date: '5.19', summary: '小红书退款', amount: -2036.74 },
  { id: 'f3', date: '5.19', summary: '小红书聚光充值', amount: 200 },
  { id: 'f4', date: '5.20', summary: '小红书聚光充值', amount: 200 },
  { id: 'f5', date: '5.20', summary: '小红书退款', amount: -77.32 },
  { id: 'f6', date: '5.21', summary: '小红书聚光充值', amount: 1922.68 },
  { id: 'f7', date: '5.21', summary: '小红书聚光充值', amount: 154.64 },
  { id: 'f8', date: '5.31', summary: '小红书聚光充值', amount: 7663.49 },
  { id: 'f9', date: '6.3', summary: '抖音信息流充值', amount: 5000 },
  { id: 'f10', date: '6.15', summary: '小红书聚光充值', amount: 2000 },
];

const initOfficeRecords: OfficeRecord[] = [
  { id: 'o1', date: '1.13', summary: '米挠喵博主 蒲公英商单', amount: 405 },
  { id: 'o2', date: '1.14', summary: '灰豚月卡会员', amount: 110 },
  { id: 'o3', date: '1.16', summary: '小博主 feeling推广费', amount: 303.6 },
  { id: 'o4', date: '1.16', summary: '剪辑费用-1条', amount: 40 },
  { id: 'o5', date: '1.17', summary: '生姜艾草按摩精油', amount: 37.79 },
  { id: 'o6', date: '1.17', summary: '大头棉签10包18+美团8.8', amount: 26.8 },
  { id: 'o7', date: '1.17', summary: '护理垫+艾草精油', amount: 32.6 },
  { id: 'o8', date: '1.23', summary: '徐小白的1件制服+2个名牌', amount: 121 },
  { id: 'o9', date: '1.26', summary: '剪辑视频费用', amount: 75 },
  { id: 'o10', date: '5.3', summary: '办公用品采购', amount: 280 },
  { id: 'o11', date: '5.15', summary: '快递耗材', amount: 56.4 },
  { id: 'o12', date: '6.1', summary: '会议室租用费', amount: 350 },
  { id: 'o13', date: '6.10', summary: '印刷宣传材料', amount: 420 },
];

const initFinanceRecords: FinanceRecord[] = [
  { id: 'fin1', month: '2025-01', summary: '银商手续费', amount: 85.89 },
  { id: 'fin2', month: '2025-02', summary: '银商手续费', amount: 80.27 },
  { id: 'fin3', month: '2025-03', summary: '银商手续费', amount: 237.21 },
  { id: 'fin4', month: '2025-04', summary: '银商手续费', amount: 296.62 },
  { id: 'fin5', month: '2025-05', summary: '银商手续费', amount: 271.72 },
  { id: 'fin6', month: '2025-06', summary: '银商手续费', amount: 158.50 },
];

// ─────────── 技师薪酬 mock（模拟从 FinanceSalaryPage 同步的数据）────────────

const THERAPIST_SALARY_BY_MONTH: Record<string, number> = {
  '2025-01': 12400, '2025-02': 11800, '2025-03': 15600,
  '2025-04': 18200, '2025-05': 21340, '2025-06': 16800,
};

// ─────────── 工具 ─────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n === 0) return '—';
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtNum(n: number): string {
  if (n === 0) return '';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function parseMonthFromDate(dateStr: string): string {
  // dateStr = "M.D" or "MM.DD"
  const [m] = dateStr.split('.');
  const mo = String(parseInt(m)).padStart(2, '0');
  const year = '2025'; // demo: 固定2025
  return `${year}-${mo}`;
}

function getShortMonth(ym: string): string {
  const [, m] = ym.split('-');
  return `${parseInt(m)}月`;
}

let _uid = 1000;
function uid(): string {
  return String(++_uid);
}

// ─────────── 子组件：折叠 Section ─────────────────────────────────────────────

function Section({
  title, icon, color, total, collapsed, onToggle, children
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-custom overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-accent/30 transition-colors text-left"
      >
        <span className={`p-1.5 rounded-lg ${color}`}>{icon}</span>
        <span className="font-semibold text-foreground flex-1 text-sm">{title}</span>
        <span className="text-sm font-bold text-foreground mr-3">{fmtMoney(total)}</span>
        {collapsed
          ? <ChevronDownIcon size={16} className="text-muted-foreground" />
          : <ChevronUpIcon size={16} className="text-muted-foreground" />}
      </button>
      <div className={collapsed ? 'hidden' : ''}>
        <div className="border-t border-border">{children}</div>
      </div>
    </div>
  );
}

// ─────────── 子组件：可编辑数字单元格 ─────────────────────────────────────────

function EditableCell({
  value, onChange
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          onChange(parseFloat(draft) || 0);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange(parseFloat(draft) || 0); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-20 border border-brand rounded px-1.5 py-0.5 text-sm text-right bg-background text-foreground outline-none"
      />
    );
  }
  return (
    <span
      className="cursor-pointer hover:text-brand transition-colors"
      onClick={() => { setDraft(value === 0 ? '' : String(value)); setEditing(true); }}
    >
      {value === 0 ? <span className="text-muted-foreground/40">—</span> : fmtNum(value)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────────────────────────────────────

export default function FinanceIncomePage() {
  const [timeMode, setTimeMode] = useState<TimeMode>('月');
  const [monthOffset, setMonthOffset] = useState(0); // 0 = 2025-06
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'summary' | 'rent' | 'staff' | 'flow' | 'office' | 'finance'>('summary');

  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const ORDERS: any[] = ordersQ.data?.data ?? [];

  // ── 数据状态 ──────────────────────────────────────────────────────────────
  const [rentRows, setRentRows] = useState<RentRow[]>(initRentRows);
  const [staffRows, setStaffRows] = useState<StaffRow[]>(initStaffRows);
  const [flowRecords, setFlowRecords] = useState<FlowRecord[]>(initFlowRecords);
  const [officeRecords, setOfficeRecords] = useState<OfficeRecord[]>(initOfficeRecords);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>(initFinanceRecords);

  // ── 当前月份 ─────────────────────────────────────────────────────────────
  // 基准：2025-06 offset=0
  const baseYear = 2025;
  const baseMonth = 6;
  const curDate = new Date(baseYear, baseMonth - 1 + monthOffset);
  const curYM = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}`;
  const curLabel = `${curDate.getFullYear()}年${curDate.getMonth() + 1}月`;

  function toggleSection(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // ── 营收（从订单同步）─────────────────────────────────────────────────────
  const revenueData = useMemo(() => {
    const expCards = ORDERS.filter(o => o.type === '体验卡' && o.payStatus === '已付款');
    const packages = ORDERS.filter(o => o.type === '套餐' && o.payStatus === '已付款');
    const refunds = ORDERS.filter(o => o.payStatus === '已退款');
    const expTotal = expCards.reduce((s, o) => s + o.amount, 0);
    const pkgTotal = packages.reduce((s, o) => s + o.amount, 0);
    const refundTotal = refunds.reduce((s, o) => s + o.amount, 0);
    return { expTotal, pkgTotal, refundTotal, total: expTotal + pkgTotal - refundTotal, expCards, packages };
  }, [ORDERS]);

  // ── 房租水电 ─────────────────────────────────────────────────────────────
  const rentTotal = useMemo(() =>
    rentRows.reduce((s, r) => s + (r.monthlyData[curYM] ?? 0), 0),
    [rentRows, curYM]
  );

  // ── 全职人员工资 ──────────────────────────────────────────────────────────
  const staffTotal = useMemo(() =>
    staffRows.reduce((s, r) => s + (r.monthlyData[curYM] ?? 0), 0),
    [staffRows, curYM]
  );

  // ── 技师费用（从工资结算同步）────────────────────────────────────────────
  const therapistSalary = THERAPIST_SALARY_BY_MONTH[curYM] ?? 0;
  const laborTotal = staffTotal + therapistSalary;

  // ── 推流费用 ─────────────────────────────────────────────────────────────
  const flowRecordsByMonth = useMemo(() => {
    return flowRecords.filter(r => parseMonthFromDate(r.date) === curYM);
  }, [flowRecords, curYM]);
  const flowTotal = flowRecordsByMonth.reduce((s, r) => s + r.amount, 0);

  // ── 办公费用 ─────────────────────────────────────────────────────────────
  const officeRecordsByMonth = useMemo(() => {
    return officeRecords.filter(r => parseMonthFromDate(r.date) === curYM);
  }, [officeRecords, curYM]);
  const officeTotal = officeRecordsByMonth.reduce((s, r) => s + r.amount, 0);

  // ── 财务费用 ─────────────────────────────────────────────────────────────
  const financeRecordsByMonth = useMemo(() => {
    return financeRecords.filter(r => r.month === curYM);
  }, [financeRecords, curYM]);
  const financeTotal = financeRecordsByMonth.reduce((s, r) => s + r.amount, 0);

  // ── 汇总 ─────────────────────────────────────────────────────────────────
  const totalIncome = revenueData.total;
  const totalExpense = rentTotal + laborTotal + flowTotal + officeTotal + financeTotal;
  const netProfit = totalIncome - totalExpense;

  // ─────────────────────────────────────────────────────────────────────────
  // 二级页面：编辑功能
  // ─────────────────────────────────────────────────────────────────────────

  // 房租水电：更新单元格
  function updateRent(id: string, ym: string, val: number) {
    setRentRows(prev => prev.map(r =>
      r.id === id ? { ...r, monthlyData: { ...r.monthlyData, [ym]: val } } : r
    ));
  }
  function addRentRow() {
    setRentRows(prev => [...prev, {
      id: uid(), subItem: '新项目',
      monthlyData: Object.fromEntries(MONTHS_2025.map(m => [m, 0])),
    }]);
  }
  function deleteRentRow(id: string) {
    setRentRows(prev => prev.filter(r => r.id !== id));
  }

  // 全职人员：更新单元格
  function updateStaff(id: string, ym: string, val: number) {
    setStaffRows(prev => prev.map(r =>
      r.id === id ? { ...r, monthlyData: { ...r.monthlyData, [ym]: val } } : r
    ));
  }
  function addStaffRow() {
    setStaffRows(prev => [...prev, {
      id: uid(), name: '新员工',
      monthlyData: Object.fromEntries(MONTHS_2025.map(m => [m, 0])),
    }]);
  }
  function deleteStaffRow(id: string) {
    setStaffRows(prev => prev.filter(r => r.id !== id));
  }

  // 推流：增删改
  function addFlowRecord() {
    const mo = String(curDate.getMonth() + 1);
    setFlowRecords(prev => [...prev, { id: uid(), date: `${mo}.1`, summary: '新充值记录', amount: 0 }]);
  }
  function updateFlowRecord(id: string, field: keyof FlowRecord, val: string | number) {
    setFlowRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  }
  function deleteFlowRecord(id: string) {
    setFlowRecords(prev => prev.filter(r => r.id !== id));
  }

  // 办公：增删改
  function addOfficeRecord() {
    const mo = String(curDate.getMonth() + 1);
    setOfficeRecords(prev => [...prev, { id: uid(), date: `${mo}.1`, summary: '新开销记录', amount: 0 }]);
  }
  function updateOfficeRecord(id: string, field: keyof OfficeRecord, val: string | number) {
    setOfficeRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  }
  function deleteOfficeRecord(id: string) {
    setOfficeRecords(prev => prev.filter(r => r.id !== id));
  }

  // 财务：增删改
  function addFinanceRecord() {
    setFinanceRecords(prev => [...prev, { id: uid(), month: curYM, summary: '银商手续费', amount: 0 }]);
  }
  function updateFinanceRecord(id: string, field: keyof FinanceRecord, val: string | number) {
    setFinanceRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  }
  function deleteFinanceRecord(id: string) {
    setFinanceRecords(prev => prev.filter(r => r.id !== id));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 渲染：内联编辑表格行
  // ─────────────────────────────────────────────────────────────────────────

  function InlineStringCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    if (editing) {
      return (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onChange(draft); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { onChange(draft); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="border border-brand rounded px-1.5 py-0.5 text-sm bg-background text-foreground outline-none w-full"
        />
      );
    }
    return (
      <span
        className="cursor-pointer hover:text-brand transition-colors block"
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        {value || <span className="text-muted-foreground/40">点击编辑</span>}
      </span>
    );
  }

  function InlineMoneyCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    if (editing) {
      return (
        <input
          autoFocus
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onChange(parseFloat(draft) || 0); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { onChange(parseFloat(draft) || 0); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-24 border border-brand rounded px-1.5 py-0.5 text-sm text-right bg-background text-foreground outline-none"
        />
      );
    }
    return (
      <span
        className={`cursor-pointer hover:text-brand transition-colors ${value < 0 ? 'text-danger' : ''}`}
        onClick={() => { setDraft(value === 0 ? '' : String(value)); setEditing(true); }}
      >
        {value === 0
          ? <span className="text-muted-foreground/40">—</span>
          : <span>{value < 0 ? '-' : ''}{Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        }
      </span>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 渲染二级页面
  // ─────────────────────────────────────────────────────────────────────────

  if (activeTab === 'rent') {
    const colTotals = MONTHS_2025.map(ym =>
      rentRows.reduce((s, r) => s + (r.monthlyData[ym] ?? 0), 0)
    );
    return (
      <div data-cmp="FinanceIncomePage" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('summary')}
            className="flex items-center gap-1.5 text-sm text-brand hover:underline"
          >
            <ChevronLeftIcon size={16} />返回收支汇总
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold text-foreground">房租水电费用</span>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-custom overflow-x-auto">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">房租水电费用</h3>
            <button
              onClick={addRentRow}
              className="flex items-center gap-1.5 text-sm text-brand hover:bg-brand/10 px-2 py-1 rounded transition-colors"
            >
              <PlusIcon size={14} />添加项目
            </button>
          </div>
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="bg-brand/5 border-b border-border">
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-12">序号</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-left">主项</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-left">项目</th>
                {MONTHS_2025.map((ym, i) => (
                  <th key={ym} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">{SHORT_MONTHS[i]}</th>
                ))}
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-12">操作</th>
              </tr>
            </thead>
            <tbody>
              {rentRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{idx === 0 ? '1' : ''}</td>
                  <td className="px-4 py-2.5 text-brand font-medium text-left">{idx === 0 ? '房租水电费用' : ''}</td>
                  <td className="px-4 py-2.5 text-left">
                    <InlineStringCell
                      value={row.subItem}
                      onChange={v => setRentRows(prev => prev.map(r => r.id === row.id ? { ...r, subItem: v } : r))}
                    />
                  </td>
                  {MONTHS_2025.map(ym => (
                    <td key={ym} className="px-4 py-2.5">
                      <EditableCell
                        value={row.monthlyData[ym] ?? 0}
                        onChange={v => updateRent(row.id, ym, v)}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <button onClick={() => deleteRentRow(row.id)} className="p-1 rounded hover:bg-danger/10 text-danger transition-colors">
                      <Trash2Icon size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-brand/5 font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-center text-brand">合计</td>
                {colTotals.map((t, i) => (
                  <td key={i} className="px-4 py-2.5 text-foreground">
                    {t > 0 ? t.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'staff') {
    const colTotals = MONTHS_2025.map(ym =>
      staffRows.reduce((s, r) => s + (r.monthlyData[ym] ?? 0), 0)
    );
    return (
      <div data-cmp="FinanceIncomePage" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab('summary')} className="flex items-center gap-1.5 text-sm text-brand hover:underline">
            <ChevronLeftIcon size={16} />返回收支汇总
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold text-foreground">全职人员工资表账单</span>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-custom overflow-x-auto">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">全职人员工资表账单</h3>
            <button onClick={addStaffRow} className="flex items-center gap-1.5 text-sm text-brand hover:bg-brand/10 px-2 py-1 rounded transition-colors">
              <PlusIcon size={14} />添加员工
            </button>
          </div>
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="bg-brand/5 border-b border-border">
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-12">序号</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-left">姓名</th>
                {MONTHS_2025.map((ym, i) => (
                  <th key={ym} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">{SHORT_MONTHS[i]}基本工资</th>
                ))}
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-12">操作</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2.5 text-left">
                    <InlineStringCell
                      value={row.name}
                      onChange={v => setStaffRows(prev => prev.map(r => r.id === row.id ? { ...r, name: v } : r))}
                    />
                  </td>
                  {MONTHS_2025.map(ym => (
                    <td key={ym} className="px-4 py-2.5">
                      <EditableCell
                        value={row.monthlyData[ym] ?? 0}
                        onChange={v => updateStaff(row.id, ym, v)}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <button onClick={() => deleteStaffRow(row.id)} className="p-1 rounded hover:bg-danger/10 text-danger transition-colors">
                      <Trash2Icon size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-b border-border bg-brand/5">
                <td colSpan={2} className="px-4 py-2.5 text-brand font-semibold text-center">小计</td>
                {colTotals.map((t, i) => (
                  <td key={i} className="px-4 py-2.5 font-semibold text-brand">
                    {t > 0 ? t.toLocaleString() : '—'}
                  </td>
                ))}
                <td />
              </tr>
              <tr className="bg-muted/30">
                <td colSpan={2} className="px-4 py-2.5 text-muted-foreground text-center text-xs">技师薪酬（同步）</td>
                {MONTHS_2025.map(ym => (
                  <td key={ym} className="px-4 py-2.5 text-muted-foreground text-xs">
                    {(THERAPIST_SALARY_BY_MONTH[ym] ?? 0).toLocaleString()}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'flow') {
    const flowByMonth = MONTHS_2025.map(ym => ({
      ym,
      records: flowRecords.filter(r => parseMonthFromDate(r.date) === ym),
      total: flowRecords.filter(r => parseMonthFromDate(r.date) === ym).reduce((s, r) => s + r.amount, 0),
    }));
    return (
      <div data-cmp="FinanceIncomePage" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab('summary')} className="flex items-center gap-1.5 text-sm text-brand hover:underline">
            <ChevronLeftIcon size={16} />返回收支汇总
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold text-foreground">推流费用</span>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-custom overflow-x-auto">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">推流费用</h3>
            <button onClick={addFlowRecord} className="flex items-center gap-1.5 text-sm text-brand hover:bg-brand/10 px-2 py-1 rounded transition-colors">
              <PlusIcon size={14} />添加记录
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand/5 border-b border-border">
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24 text-right">日期</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">摘要</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-right w-32">金额</th>
                <th className="px-4 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {flowByMonth.map(({ ym, records, total }) => (
                <>
                  {records.map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        <InlineStringCell value={r.date} onChange={v => updateFlowRecord(r.id, 'date', v)} />
                      </td>
                      <td className="px-4 py-2">
                        <InlineStringCell value={r.summary} onChange={v => updateFlowRecord(r.id, 'summary', v)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineMoneyCell value={r.amount} onChange={v => updateFlowRecord(r.id, 'amount', v)} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => deleteFlowRecord(r.id)} className="p-1 rounded hover:bg-danger/10 text-danger transition-colors">
                          <Trash2Icon size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {records.length > 0 && (
                    <tr className="bg-warning/10 border-b border-border">
                      <td colSpan={2} className="px-4 py-2 text-right font-semibold text-foreground">
                        {getShortMonth(ym)}小计
                      </td>
                      <td className={`px-4 py-2 text-right font-bold ${total < 0 ? 'text-danger' : 'text-foreground'}`}>
                        {total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  )}
                </>
              ))}
              <tr className="bg-brand/5 border-t-2 border-border">
                <td colSpan={2} className="px-4 py-3 text-center font-bold text-brand">小计</td>
                <td className="px-4 py-3 text-right font-bold text-foreground">
                  {flowRecords.reduce((s, r) => s + r.amount, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'office') {
    const officeByMonth = MONTHS_2025.map(ym => ({
      ym,
      records: officeRecords.filter(r => parseMonthFromDate(r.date) === ym),
      total: officeRecords.filter(r => parseMonthFromDate(r.date) === ym).reduce((s, r) => s + r.amount, 0),
    }));
    return (
      <div data-cmp="FinanceIncomePage" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab('summary')} className="flex items-center gap-1.5 text-sm text-brand hover:underline">
            <ChevronLeftIcon size={16} />返回收支汇总
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold text-foreground">管理费用 - 办公费</span>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-custom overflow-x-auto">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">管理费用 - 办公费</h3>
            <button onClick={addOfficeRecord} className="flex items-center gap-1.5 text-sm text-brand hover:bg-brand/10 px-2 py-1 rounded transition-colors">
              <PlusIcon size={14} />添加记录
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand/5 border-b border-border">
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-20 text-right">日期</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">摘要</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-right w-32">金额</th>
                <th className="px-4 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {officeByMonth.map(({ ym, records, total }) => (
                <>
                  {records.map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2 text-right text-muted-foreground text-brand/70">
                        <InlineStringCell value={r.date} onChange={v => updateOfficeRecord(r.id, 'date', v)} />
                      </td>
                      <td className="px-4 py-2">
                        <InlineStringCell value={r.summary} onChange={v => updateOfficeRecord(r.id, 'summary', v)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineMoneyCell value={r.amount} onChange={v => updateOfficeRecord(r.id, 'amount', v)} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => deleteOfficeRecord(r.id)} className="p-1 rounded hover:bg-danger/10 text-danger transition-colors">
                          <Trash2Icon size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {records.length > 0 && (
                    <tr className="bg-warning/10 border-b border-border">
                      <td colSpan={2} className="px-4 py-2 text-right font-bold text-foreground">
                        {getShortMonth(ym)}小计
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-foreground">
                        {total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  )}
                </>
              ))}
              <tr className="bg-brand/5 border-t-2 border-border">
                <td colSpan={2} className="px-4 py-3 text-center font-bold text-brand">合计</td>
                <td className="px-4 py-3 text-right font-bold text-foreground">
                  {officeRecords.reduce((s, r) => s + r.amount, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'finance') {
    const finByMonth = MONTHS_2025.map(ym => ({
      ym,
      records: financeRecords.filter(r => r.month === ym),
      total: financeRecords.filter(r => r.month === ym).reduce((s, r) => s + r.amount, 0),
    }));
    return (
      <div data-cmp="FinanceIncomePage" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab('summary')} className="flex items-center gap-1.5 text-sm text-brand hover:underline">
            <ChevronLeftIcon size={16} />返回收支汇总
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold text-foreground">财务费用</span>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-custom overflow-x-auto">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">财务费用</h3>
            <button onClick={addFinanceRecord} className="flex items-center gap-1.5 text-sm text-brand hover:bg-brand/10 px-2 py-1 rounded transition-colors">
              <PlusIcon size={14} />添加记录
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand/5 border-b border-border">
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-28 text-center">日期</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">摘要</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-right w-32">金额</th>
                <th className="px-4 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {finByMonth.map(({ ym, records, total }) => (
                <>
                  {records.length > 0 && (
                    <tr className="bg-muted/20 border-b border-border">
                      <td colSpan={4} className="px-4 py-1.5 text-xs text-muted-foreground font-semibold">
                        {getShortMonth(ym)}份
                      </td>
                    </tr>
                  )}
                  {records.map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2 text-center text-muted-foreground text-xs">{getShortMonth(r.month)}份</td>
                      <td className="px-4 py-2">
                        <InlineStringCell value={r.summary} onChange={v => updateFinanceRecord(r.id, 'summary', v)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineMoneyCell value={r.amount} onChange={v => updateFinanceRecord(r.id, 'amount', v)} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => deleteFinanceRecord(r.id)} className="p-1 rounded hover:bg-danger/10 text-danger transition-colors">
                          <Trash2Icon size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {records.length > 0 && (
                    <tr className="bg-muted/30 border-b border-border">
                      <td className="px-4 py-1.5 text-center text-xs text-muted-foreground" />
                      <td className="px-4 py-1.5 text-right text-xs text-muted-foreground">小计</td>
                      <td className="px-4 py-1.5 text-right text-xs text-foreground font-medium">
                        {total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  )}
                </>
              ))}
              <tr className="bg-brand/5 border-t-2 border-border">
                <td colSpan={2} className="px-4 py-3 text-center font-bold text-brand">合计</td>
                <td className="px-4 py-3 text-right font-bold text-foreground">
                  {financeRecords.reduce((s, r) => s + r.amount, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 主汇总页面
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div data-cmp="FinanceIncomePage" className="flex flex-col gap-5">

      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* 时间维度 */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['月', '周', '日'] as TimeMode[]).map(m => (
              <button
                key={m}
                onClick={() => setTimeMode(m)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  timeMode === m
                    ? 'bg-card text-foreground font-semibold shadow-custom'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                按{m}
              </button>
            ))}
          </div>

          {/* 月份切换 */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-2 py-1.5 shadow-custom">
            <button onClick={() => setMonthOffset(o => o - 1)} className="p-1 rounded hover:bg-accent transition-colors">
              <ChevronLeftIcon size={15} className="text-muted-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground px-2 min-w-[110px] text-center">{curLabel}</span>
            <button onClick={() => setMonthOffset(o => o + 1)} className="p-1 rounded hover:bg-accent transition-colors">
              <ChevronRightIcon size={15} className="text-muted-foreground" />
            </button>
            <button onClick={() => setMonthOffset(0)} className="text-xs text-brand hover:underline px-1">本月</button>
          </div>
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg text-sm hover:bg-accent shadow-custom transition-colors">
          <DownloadIcon size={14} />导出报表
        </button>
      </div>

      {/* 汇总 KPI 卡片 */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: '营业收入', value: totalIncome, color: 'text-success', bg: 'bg-success/5', icon: <TrendingUpIcon size={16} className="text-success" /> },
          { label: '总支出', value: totalExpense, color: 'text-danger', bg: 'bg-danger/5', icon: <TrendingDownIcon size={16} className="text-danger" /> },
          { label: '净利润', value: netProfit, color: netProfit >= 0 ? 'text-brand' : 'text-danger', bg: netProfit >= 0 ? 'bg-brand/5' : 'bg-danger/5', icon: <ReceiptIcon size={16} className="text-brand" /> },
          { label: '利润率', value: totalIncome > 0 ? `${((netProfit / totalIncome) * 100).toFixed(1)}%` : '—', color: 'text-foreground', bg: 'bg-card', isStr: true },
        ].map(card => (
          <div key={card.label} className={`flex-1 min-w-[130px] px-4 py-3 rounded-xl border border-border shadow-custom flex flex-col gap-1 ${card.bg}`}>
            <div className="flex items-center gap-1.5">
              {'icon' in card && card.icon}
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <span className={`text-xl font-bold ${card.color}`}>
              {'isStr' in card && card.isStr ? card.value : fmtMoney(card.value as number)}
            </span>
            <span className="text-[10px] text-muted-foreground">{curLabel}汇总</span>
          </div>
        ))}
      </div>

      {/* ── 营收 Section ───────────────────────────────────────────────── */}
      <Section
        title="营收"
        icon={<TrendingUpIcon size={14} className="text-white" />}
        color="bg-success"
        total={revenueData.total}
        collapsed={!!collapsed['revenue']}
        onToggle={() => toggleSection('revenue')}
      >
        <div className="px-5 py-4 flex flex-col gap-3">
          {/* 子项 */}
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">体验卡收入</span>
              <span className="font-semibold text-foreground">{fmtMoney(revenueData.expTotal)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground">套餐收入</span>
              <span className="font-semibold text-foreground">{fmtMoney(revenueData.pkgTotal)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-1.5">退款扣减 <span className="text-xs text-danger">(已退款订单)</span></span>
              <span className="text-danger font-semibold">-{fmtMoney(revenueData.refundTotal)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 bg-success/5 rounded px-2">
              <span className="font-semibold text-foreground">营收小计</span>
              <span className="font-bold text-success text-base">{fmtMoney(revenueData.total)}</span>
            </div>
          </div>

          {/* 订单明细迷你表 */}
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-xs text-center">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {['订单编号', '客户', '类型', '金额', '状态', '下单时间'].map(h => (
                    <th key={h} className="px-3 py-2 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ORDERS.map(o => (
                  <tr key={o.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-1.5 font-mono text-brand/80">{o.id}</td>
                    <td className="px-3 py-1.5">{o.customerName}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${o.type === '体验卡' ? 'bg-orange-100 text-orange-600' : 'bg-brand/10 text-brand'}`}>
                        {o.type}
                      </span>
                    </td>
                    <td className={`px-3 py-1.5 font-semibold ${o.payStatus === '已退款' ? 'text-danger line-through' : 'text-success'}`}>
                      ¥{o.amount.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                        o.payStatus === '已付款' ? 'bg-success/10 text-success' :
                        o.payStatus === '待付款' ? 'bg-warning/10 text-warning' :
                        'bg-danger/10 text-danger'
                      }`}>{o.payStatus}</span>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{o.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── 房租水电费 Section ──────────────────────────────────────────── */}
      <Section
        title="房租水电费"
        icon={<BuildingIcon size={14} className="text-white" />}
        color="bg-blue-500"
        total={rentTotal}
        collapsed={!!collapsed['rent']}
        onToggle={() => toggleSection('rent')}
      >
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-sm">
            {rentRows.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">{r.subItem}</span>
                <span className="font-semibold text-foreground">{fmtMoney(r.monthlyData[curYM] ?? 0)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5 bg-blue-500/5 rounded px-2">
              <span className="font-semibold text-foreground">小计</span>
              <span className="font-bold text-blue-500 text-base">{fmtMoney(rentTotal)}</span>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('rent')}
            className="text-xs text-brand hover:underline self-end flex items-center gap-1"
          >
            <EditIcon size={11} />编辑明细 →
          </button>
        </div>
      </Section>

      {/* ── 人工费用 Section ────────────────────────────────────────────── */}
      <Section
        title="人工费用"
        icon={<UsersIcon size={14} className="text-white" />}
        color="bg-purple-500"
        total={laborTotal}
        collapsed={!!collapsed['labor']}
        onToggle={() => toggleSection('labor')}
      >
        <div className="px-5 py-4 flex flex-col gap-3">
          {/* 技师费用 */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand inline-block" />技师费用（从工资结算同步）
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/50 text-sm pl-4">
              <span className="text-muted-foreground">{curLabel}技师薪酬合计</span>
              <span className="font-semibold text-foreground">{fmtMoney(therapistSalary)}</span>
            </div>
          </div>
          {/* 全职人员 */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />全职人员工资
            </div>
            <div className="flex flex-col gap-1">
              {staffRows.map(r => (
                (r.monthlyData[curYM] ?? 0) > 0 && (
                  <div key={r.id} className="flex items-center justify-between py-1 border-b border-border/30 text-sm pl-4">
                    <span className="text-muted-foreground">{r.name}</span>
                    <span className="text-foreground">{fmtMoney(r.monthlyData[curYM] ?? 0)}</span>
                  </div>
                )
              ))}
              <div className="flex items-center justify-between py-1.5 text-sm pl-4">
                <span className="font-medium text-foreground">全职小计</span>
                <span className="font-semibold text-purple-500">{fmtMoney(staffTotal)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5 bg-purple-500/5 rounded px-2">
            <span className="font-semibold text-foreground">人工费用小计</span>
            <span className="font-bold text-purple-500 text-base">{fmtMoney(laborTotal)}</span>
          </div>
          <button
            onClick={() => setActiveTab('staff')}
            className="text-xs text-brand hover:underline self-end flex items-center gap-1"
          >
            <EditIcon size={11} />编辑全职工资明细 →
          </button>
        </div>
      </Section>

      {/* ── 推流费用 Section ────────────────────────────────────────────── */}
      <Section
        title="推流费用"
        icon={<ZapIcon size={14} className="text-white" />}
        color="bg-orange-500"
        total={flowTotal}
        collapsed={!!collapsed['flow']}
        onToggle={() => toggleSection('flow')}
      >
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-sm">
            {flowRecordsByMonth.length === 0 && (
              <p className="text-muted-foreground text-xs">本月暂无推流记录</p>
            )}
            {flowRecordsByMonth.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">{r.date} {r.summary}</span>
                <span className={`font-semibold ${r.amount < 0 ? 'text-danger' : 'text-foreground'}`}>{fmtMoney(r.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5 bg-orange-500/5 rounded px-2">
              <span className="font-semibold text-foreground">小计</span>
              <span className="font-bold text-orange-500 text-base">{fmtMoney(flowTotal)}</span>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('flow')}
            className="text-xs text-brand hover:underline self-end flex items-center gap-1"
          >
            <EditIcon size={11} />编辑明细 →
          </button>
        </div>
      </Section>

      {/* ── 办公费用 Section ────────────────────────────────────────────── */}
      <Section
        title="办公费用（日常开销）"
        icon={<BriefcaseIcon size={14} className="text-white" />}
        color="bg-teal-500"
        total={officeTotal}
        collapsed={!!collapsed['office']}
        onToggle={() => toggleSection('office')}
      >
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-sm">
            {officeRecordsByMonth.length === 0 && (
              <p className="text-muted-foreground text-xs">本月暂无办公开销</p>
            )}
            {officeRecordsByMonth.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">{r.date} {r.summary}</span>
                <span className="font-semibold text-foreground">{fmtMoney(r.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5 bg-teal-500/5 rounded px-2">
              <span className="font-semibold text-foreground">小计</span>
              <span className="font-bold text-teal-600 text-base">{fmtMoney(officeTotal)}</span>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('office')}
            className="text-xs text-brand hover:underline self-end flex items-center gap-1"
          >
            <EditIcon size={11} />编辑明细 →
          </button>
        </div>
      </Section>

      {/* ── 财务费用 Section ────────────────────────────────────────────── */}
      <Section
        title="财务费用"
        icon={<CreditCardIcon size={14} className="text-white" />}
        color="bg-rose-500"
        total={financeTotal}
        collapsed={!!collapsed['finance']}
        onToggle={() => toggleSection('finance')}
      >
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-sm">
            {financeRecordsByMonth.length === 0 && (
              <p className="text-muted-foreground text-xs">本月暂无财务费用</p>
            )}
            {financeRecordsByMonth.map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">{r.summary}</span>
                <span className="font-semibold text-foreground">{fmtMoney(r.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5 bg-rose-500/5 rounded px-2">
              <span className="font-semibold text-foreground">小计</span>
              <span className="font-bold text-rose-500 text-base">{fmtMoney(financeTotal)}</span>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('finance')}
            className="text-xs text-brand hover:underline self-end flex items-center gap-1"
          >
            <EditIcon size={11} />编辑明细 →
          </button>
        </div>
      </Section>

      {/* ── 数据汇总 ──────────────────────────────────────────────────────── */}
      <div className="bg-card border-2 border-brand/30 rounded-xl shadow-custom overflow-hidden">
        <div className="px-5 py-3 bg-brand/5 border-b border-brand/20 flex items-center gap-2">
          <ReceiptIcon size={16} className="text-brand" />
          <span className="font-bold text-foreground">数据汇总 · {curLabel}</span>
          <span className="text-xs text-muted-foreground ml-2">时间维度：按{timeMode}</span>
        </div>
        <div className="px-5 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left text-xs font-semibold text-muted-foreground">科目</th>
                <th className="py-2 text-right text-xs font-semibold text-muted-foreground">金额</th>
                <th className="py-2 text-right text-xs font-semibold text-muted-foreground">占收入比</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2.5 text-success font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success inline-block" />营业收入
                </td>
                <td className="py-2.5 text-right font-bold text-success">{fmtMoney(totalIncome)}</td>
                <td className="py-2.5 text-right text-muted-foreground">100%</td>
              </tr>
              {[
                { label: '房租水电费', value: rentTotal, color: 'text-blue-500' },
                { label: '人工费用（技师+全职）', value: laborTotal, color: 'text-purple-500' },
                { label: '推流费用', value: flowTotal, color: 'text-orange-500' },
                { label: '办公费用', value: officeTotal, color: 'text-teal-600' },
                { label: '财务费用', value: financeTotal, color: 'text-rose-500' },
              ].map(item => (
                <tr key={item.label} className="border-b border-border/30">
                  <td className={`py-2 pl-4 text-muted-foreground`}>— {item.label}</td>
                  <td className={`py-2 text-right font-medium ${item.color}`}>{fmtMoney(item.value)}</td>
                  <td className="py-2 text-right text-muted-foreground text-xs">
                    {totalIncome > 0 ? `${((item.value / totalIncome) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-border">
                <td className="py-2.5 font-semibold text-danger flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-danger inline-block" />总支出
                </td>
                <td className="py-2.5 text-right font-bold text-danger">{fmtMoney(totalExpense)}</td>
                <td className="py-2.5 text-right text-muted-foreground">
                  {totalIncome > 0 ? `${((totalExpense / totalIncome) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
              <tr className="bg-brand/5">
                <td className="py-3 font-bold text-brand flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand inline-block" />净利润
                </td>
                <td className={`py-3 text-right font-bold text-xl ${netProfit >= 0 ? 'text-brand' : 'text-danger'}`}>
                  {fmtMoney(netProfit)}
                </td>
                <td className={`py-3 text-right font-semibold text-sm ${netProfit >= 0 ? 'text-brand' : 'text-danger'}`}>
                  {totalIncome > 0 ? `${((netProfit / totalIncome) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
