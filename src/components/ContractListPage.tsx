import { useEffect, useMemo, useState } from 'react';
import {
  SearchIcon, FilterIcon, UsersIcon, CreditCardIcon, TrendingUpIcon,
  CoinsIcon, TargetIcon, ChevronDownIcon, CheckIcon, XIcon,
  ChevronLeftIcon, ChevronRightIcon,
} from 'lucide-react';
import { useCustomers, useOrders } from '../api/hooks';
import { useApp } from '../hooks/useApp';

type TimeDimension = 'day' | 'week' | 'month' | 'year';

interface Option {
  value: string;
  label: string;
}

interface AdvisorReportRow {
  advisor: string;
  customerCount: number;
  trialCardCount: number;
  purchaseRate: number;
  upgradeCustomerCount: number;
  upgradeRate: number;
  salesAmount: number;
}

const DIMENSION_LABEL: Record<TimeDimension, string> = {
  day: '今日',
  week: '本周',
  month: '本月',
  year: '今年',
};

const STORAGE_PREFIX = 'chankang.report.monthlyTrialTarget.';
const PAGE_SIZE = 10;

function advisorTargetStorageKey(month: string, advisor: string) {
  return `${STORAGE_PREFIX}${month}.${encodeURIComponent(advisor)}`;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function weekStr(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function parseDate(value: unknown) {
  const text = String(value || '').slice(0, 10);
  if (!text) return null;
  const d = new Date(`${text}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function periodRange(dimension: TimeDimension, value: string) {
  if (dimension === 'day') {
    const d = parseDate(value) ?? new Date();
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (dimension === 'week') {
    const [yearText, weekText] = value.split('-W');
    const year = Number(yearText) || new Date().getFullYear();
    const week = Number(weekText) || Number(weekStr().slice(-2));
    const jan4 = new Date(year, 0, 4);
    const firstMonday = startOfWeek(jan4);
    const start = new Date(firstMonday);
    start.setDate(firstMonday.getDate() + (week - 1) * 7);
    return { start, end: endOfWeek(start) };
  }
  if (dimension === 'month') {
    const [yearText, monthText] = value.split('-');
    const year = Number(yearText) || new Date().getFullYear();
    const month = (Number(monthText) || new Date().getMonth() + 1) - 1;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  const year = Number(value) || new Date().getFullYear();
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

function inRange(value: unknown, start: Date, end: Date) {
  const d = parseDate(value);
  return !!d && d >= start && d <= end;
}

function money(value: number) {
  return `¥ ${Math.round(value).toLocaleString()}`;
}

function percent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value * 1000) / 10}%`;
}

function normalizeAdvisor(value: unknown) {
  const text = String(value || '').trim();
  return text && text !== '—' ? text : '未分配';
}

function isTrialOrder(order: any) {
  return String(order.type || '').includes('体验');
}

function isPackageOrder(order: any) {
  return String(order.type || '').includes('套餐') || order.isUpgrade;
}

function isRefunded(order: any) {
  return String(order.payStatus || '').includes('退款') || order.tag === 'T2';
}

function customerKeyOf(order: any) {
  return String(order.customerId || order.customerCode || order.customerName || order.id || '');
}

function MultiSelect({ label, options, selected, onChange }: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === 0 || selected.length === options.length;
  const display = allSelected
    ? `${label} 全部`
    : selected.length === 1
      ? options.find(o => o.value === selected[0])?.label ?? label
      : `${label} (${selected.length})`;

  function toggleAll() {
    onChange(allSelected ? ['__none__'] : []);
  }

  function toggleOne(value: string) {
    const effective = selected.includes('__none__') ? [] : selected;
    if (effective.includes(value)) {
      const next = effective.filter(v => v !== value);
      onChange(next.length ? next : ['__none__']);
      return;
    }
    onChange([...effective, value]);
  }

  function checked(value: string) {
    return allSelected || selected.includes(value);
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border hover:border-brand"
        style={{
          background: 'var(--card)',
          borderColor: !allSelected ? 'var(--brand)' : 'var(--border)',
          color: !allSelected ? 'var(--brand)' : 'var(--foreground)',
          height: 36,
        }}
        onClick={() => setOpen(v => !v)}
      >
        {display}
        <ChevronDownIcon size={13} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 rounded-lg shadow-custom overflow-hidden"
          style={{ zIndex: 30, background: 'var(--card)', border: '1px solid var(--border)', minWidth: 170 }}
        >
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left" onClick={toggleAll}>
            <CheckBox checked={allSelected} />
            全部
          </button>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          {options.map(opt => (
            <button
              key={opt.value}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
              onClick={() => toggleOne(opt.value)}
            >
              <CheckBox checked={checked(opt.value)} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
      style={{
        borderColor: checked ? 'var(--brand)' : 'var(--border)',
        background: checked ? 'var(--brand)' : 'transparent',
      }}
    >
      {checked && <CheckIcon size={10} className="text-white" />}
    </span>
  );
}

export default function ContractListPage() {
  const { currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState<string[]>([]);
  const [dimension, setDimension] = useState<TimeDimension>('month');
  const [periodValue, setPeriodValue] = useState(monthStr());
  const [page, setPage] = useState(1);
  const [advisorTargets, setAdvisorTargets] = useState<Record<string, string>>({});
  const canEditTargets = currentUser.role === 'admin' || currentUser.role === 'superadmin';

  const customersQ = useCustomers({ page: 1, pageSize: 10000, includeOrdered: 1 });
  const ordersQ = useOrders({ page: 1, pageSize: 10000 });
  const customers: any[] = customersQ.data?.data ?? [];
  const orders: any[] = ordersQ.data?.data ?? [];

  useEffect(() => {
    if (dimension === 'day') setPeriodValue(todayStr());
    if (dimension === 'week') setPeriodValue(weekStr());
    if (dimension === 'month') setPeriodValue(monthStr());
    if (dimension === 'year') setPeriodValue(String(new Date().getFullYear()));
  }, [dimension]);

  const { start, end } = periodRange(dimension, periodValue);
  const selectedMonth = dimension === 'month' ? periodValue : monthStr(start);

  const customerById = useMemo(() => {
    const map = new Map<string, any>();
    customers.forEach(c => {
      [c.id, c._id, c.customerCode, c.name].filter(Boolean).forEach(key => map.set(String(key), c));
    });
    return map;
  }, [customers]);

  const advisorOptions = useMemo(() => {
    const advisors = new Set<string>();
    customers.forEach(c => advisors.add(normalizeAdvisor(c.advisor)));
    orders.forEach(o => advisors.add(normalizeAdvisor(o.advisor || customerById.get(o.customerId)?.advisor || customerById.get(o.customerName)?.advisor)));
    return Array.from(advisors).sort((a, b) => a.localeCompare(b, 'zh-CN')).map(value => ({ value, label: value }));
  }, [customers, orders, customerById]);
  const advisorOptionsKey = advisorOptions.map(o => o.value).join('|');

  useEffect(() => {
    const next: Record<string, string> = {};
    advisorOptions.forEach(opt => {
      next[opt.value] = localStorage.getItem(advisorTargetStorageKey(selectedMonth, opt.value)) || '0';
    });
    setAdvisorTargets(next);
  }, [selectedMonth, advisorOptionsKey]);

  function advisorTarget(advisor: string) {
    return Math.max(0, Number(advisorTargets[advisor]) || 0);
  }

  function saveAdvisorTarget(advisor: string, value: string) {
    if (!canEditTargets) return;
    const normalized = String(Math.max(0, Number(value) || 0));
    setAdvisorTargets(prev => ({ ...prev, [advisor]: normalized }));
    localStorage.setItem(advisorTargetStorageKey(selectedMonth, advisor), normalized);
  }

  const reportRows = useMemo<AdvisorReportRow[]>(() => {
    const map = new Map<string, AdvisorReportRow & { customerIds: Set<string>; trialCustomerIds: Set<string>; upgradeCustomerIds: Set<string> }>();

    function ensure(advisor: string) {
      if (!map.has(advisor)) {
        map.set(advisor, {
          advisor,
          customerCount: 0,
          trialCardCount: 0,
          purchaseRate: 0,
          upgradeCustomerCount: 0,
          upgradeRate: 0,
          salesAmount: 0,
          customerIds: new Set(),
          trialCustomerIds: new Set(),
          upgradeCustomerIds: new Set(),
        });
      }
      return map.get(advisor)!;
    }

    advisorOptions.forEach(opt => ensure(opt.value));

    customers.forEach(c => {
      const advisor = normalizeAdvisor(c.advisor);
      const row = ensure(advisor);
      const customerId = String(c.id || c._id || c.customerCode || c.name);
      if (inRange(c.acquiredAt, start, end)) row.customerIds.add(customerId);
    });

    orders.forEach(o => {
      if (!inRange(o.createdAt || o.purchaseDate || o.paidAt, start, end)) return;
      const customer = customerById.get(o.customerId) || customerById.get(o.customerCode) || customerById.get(o.customerName);
      const advisor = normalizeAdvisor(o.advisor || customer?.advisor);
      const row = ensure(advisor);
      const customerId = customer ? String(customer.id || customer._id || customer.customerCode || customer.name) : customerKeyOf(o);

      if (isTrialOrder(o)) {
        row.trialCardCount += 1;
        row.trialCustomerIds.add(customerId);
      }
      if (isPackageOrder(o)) {
        row.upgradeCustomerIds.add(customerId);
      }
      if (!isRefunded(o)) {
        row.salesAmount += Number(o.amount) || 0;
      }
    });

    return Array.from(map.values()).map(row => ({
      advisor: row.advisor,
      customerCount: row.customerIds.size,
      trialCardCount: row.trialCardCount,
      purchaseRate: row.customerIds.size ? row.trialCardCount / row.customerIds.size : 0,
      upgradeCustomerCount: row.upgradeCustomerIds.size,
      upgradeRate: row.trialCardCount ? row.upgradeCustomerIds.size / row.trialCardCount : 0,
      salesAmount: row.salesAmount,
    })).sort((a, b) => b.salesAmount - a.salesAmount || b.trialCardCount - a.trialCardCount || a.advisor.localeCompare(b.advisor, 'zh-CN'));
  }, [customers, orders, customerById, advisorOptionsKey, start.getTime(), end.getTime()]);

  const filtered = reportRows.filter(row => {
    const matchSearch = !search.trim() || row.advisor.includes(search.trim());
    const effectiveAdvisor = advisorFilter.includes('__none__') ? [] : advisorFilter;
    const matchAdvisor = effectiveAdvisor.length === 0 || effectiveAdvisor.includes(row.advisor);
    return matchSearch && matchAdvisor;
  });

  const summary = filtered.reduce((acc, row) => ({
    customers: acc.customers + row.customerCount,
    trials: acc.trials + row.trialCardCount,
    upgrades: acc.upgrades + row.upgradeCustomerCount,
    sales: acc.sales + row.salesAmount,
    target: acc.target + advisorTarget(row.advisor),
  }), { customers: 0, trials: 0, upgrades: 0, sales: 0, target: 0 });
  const target = summary.target;
  const completionRate = target > 0 ? summary.trials / target : 0;
  const showMonthlyAssessment = dimension === 'month';

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, advisorFilter, dimension, periodValue]);

  return (
    <div data-cmp="OrderReportPage" className="flex flex-col gap-4">
      <div className={showMonthlyAssessment ? 'grid grid-cols-5 gap-4' : 'grid grid-cols-4 gap-4'}>
        <MetricCard title="客户数量" value={summary.customers.toLocaleString()} icon={UsersIcon} color="var(--brand)" />
        <MetricCard title="已购体验卡" value={summary.trials.toLocaleString()} icon={CreditCardIcon} color="var(--success)" />
        <MetricCard title="升单客户" value={summary.upgrades.toLocaleString()} icon={TrendingUpIcon} color="var(--warning)" />
        <MetricCard title="销售额" value={money(summary.sales)} icon={CoinsIcon} color="var(--success)" />
        {showMonthlyAssessment && (
          <MetricCard title="月度完成率" value={percent(completionRate)} icon={TargetIcon} color="var(--brand)" sub={`目标 ${target} 张`} />
        )}
      </div>

      <div className="bg-card rounded-xl p-4 shadow-custom flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--muted)', minWidth: 230, height: 36 }}>
          <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
          <input
            className="bg-transparent outline-none text-sm flex-1"
            placeholder="搜索客服名称"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')}><XIcon size={12} style={{ color: 'var(--muted-foreground)' }} /></button>}
        </div>

        <MultiSelect label="客服" options={advisorOptions} selected={advisorFilter} onChange={setAdvisorFilter} />

        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['day', 'week', 'month', 'year'] as TimeDimension[]).map(item => (
            <button
              key={item}
              className="px-3 text-sm font-medium"
              style={{
                height: 36,
                background: dimension === item ? 'var(--brand)' : 'var(--card)',
                color: dimension === item ? '#fff' : 'var(--foreground)',
                borderRight: item !== 'year' ? '1px solid var(--border)' : undefined,
              }}
              onClick={() => setDimension(item)}
            >
              {DIMENSION_LABEL[item]}
            </button>
          ))}
        </div>

        {dimension === 'day' && <input type="date" className="text-sm rounded-lg px-3 outline-none" style={dateInputStyle} value={periodValue} max={todayStr()} onChange={e => setPeriodValue(e.target.value)} />}
        {dimension === 'week' && <input type="week" className="text-sm rounded-lg px-3 outline-none" style={dateInputStyle} value={periodValue} max={weekStr()} onChange={e => setPeriodValue(e.target.value)} />}
        {dimension === 'month' && <input type="month" className="text-sm rounded-lg px-3 outline-none" style={dateInputStyle} value={periodValue} max={monthStr()} onChange={e => setPeriodValue(e.target.value)} />}
        {dimension === 'year' && (
          <input
            type="number"
            className="text-sm rounded-lg px-3 outline-none"
            style={{ ...dateInputStyle, width: 110 }}
            min={2020}
            max={new Date().getFullYear()}
            value={periodValue}
            onChange={e => setPeriodValue(e.target.value)}
          />
        )}

        {showMonthlyAssessment && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--muted)', border: '1px solid var(--border)', height: 36 }}>
            <TargetIcon size={14} style={{ color: 'var(--brand)' }} />
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {selectedMonth} 体验卡目标按客服单独设置
            </span>
          </div>
        )}

        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <FilterIcon size={14} />
          共 <strong className="text-foreground">{filtered.length}</strong> 位客服
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-custom overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>客服名字</th>
                <th>客户数量</th>
                <th>已购体验卡数量</th>
                <th>购买率</th>
                {showMonthlyAssessment && <th>月度目标</th>}
                {showMonthlyAssessment && <th>目标完成率</th>}
                <th>升单客户数</th>
                <th>升单率</th>
                <th>销售额</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={showMonthlyAssessment ? 9 : 7} className="text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
                    当前筛选条件下暂无报表数据
                  </td>
                </tr>
              ) : paginated.map(row => (
                <tr key={row.advisor}>
                  <td className="font-semibold">{row.advisor}</td>
                  <td>{row.customerCount}</td>
                  <td>
                    <span className="badge badge-info">{row.trialCardCount}</span>
                  </td>
                  <td>{percent(row.purchaseRate)}</td>
                  {showMonthlyAssessment && (
                    <td>
                      {canEditTargets ? (
                        <input
                          type="number"
                          min={0}
                          className="rounded-lg px-2 py-1 text-sm outline-none"
                          style={{
                            width: 72,
                            background: 'var(--muted)',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground)',
                          }}
                          value={advisorTargets[row.advisor] ?? '0'}
                          onChange={e => saveAdvisorTarget(row.advisor, e.target.value)}
                        />
                      ) : (
                        <span>{advisorTarget(row.advisor)}</span>
                      )}
                    </td>
                  )}
                  {showMonthlyAssessment && (
                    <td>{percent(advisorTarget(row.advisor) ? row.trialCardCount / advisorTarget(row.advisor) : 0)}</td>
                  )}
                  <td>
                    <span className="badge badge-success">{row.upgradeCustomerCount}</span>
                  </td>
                  <td>{percent(row.upgradeRate)}</td>
                  <td className="font-bold" style={{ color: 'var(--success)' }}>{money(row.salesAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            第 {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} 条，共 {filtered.length} 条
          </span>
          <div className="flex items-center gap-2">
            <button className="p-1.5 rounded hover:bg-muted disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeftIcon size={15} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className="w-7 h-7 rounded text-sm font-medium"
                style={{ background: p === page ? 'var(--brand)' : 'transparent', color: p === page ? '#fff' : 'var(--foreground)' }}
                onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="p-1.5 rounded hover:bg-muted disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              <ChevronRightIcon size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  background: 'var(--card)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  height: 36,
};

function MetricCard({ title, value, icon: Icon, color, sub }: {
  title: string;
  value: string;
  icon: typeof UsersIcon;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-card rounded-xl p-4 shadow-custom">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{title}</span>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{sub}</div>}
    </div>
  );
}
