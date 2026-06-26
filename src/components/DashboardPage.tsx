import { useState } from 'react';
import {
  TrendingUpIcon, TrendingDownIcon, UsersIcon, CreditCardIcon,
  ArrowUpRightIcon, AlertCircleIcon, CalendarCheckIcon, ClipboardIcon, XCircleIcon,
  ArrowRightIcon,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useApp } from '../hooks/useApp';
import { useDashboardStats, useDashboardTodos, useDashboardChart } from '../api/hooks';

const TIME_FILTERS = ['今日', '本周', '本月', '今年'];

const TODO_ICONS: Record<string, any> = {
  contract: AlertCircleIcon,
  appointment: CalendarCheckIcon,
  service: ClipboardIcon,
  cancel: XCircleIcon,
};

export default function DashboardPage() {
  const { setActivePage } = useApp();
  const [timeFilter, setTimeFilter] = useState('本月');
  const [chartMetric, setChartMetric] = useState('revenue');
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);

  const statsQ = useDashboardStats();
  const todosQ = useDashboardTodos();
  const chartQ = useDashboardChart();

  const s: any = statsQ.data || {};
  const chartData = (chartQ.data ?? []).map((r: any) => ({
    month: r.month ? r.month.slice(5) + '月' : '',
    revenue: Number(r.revenue) || 0,
    newCustomers: Number(r.new_customers) || 0,
    experienceCards: Number(r.experience_cards) || 0,
    upgrades: Number(r.upgrades) || 0,
  }));
  const todos = (todosQ.data ?? []).filter((t: any) => !dismissedIds.includes(t.id));

  const totalRevenue = Number(s.total_revenue) || 0;
  const totalCustomers = Number(s.total_customers) || 0;
  const paidOrders = Number(s.paid_orders) || 0;
  const todayAppt = Number(s.today_appt) || 0;
  const activeTherapists = Number(s.active_therapists) || 0;
  const pendingContract = Number(s.pending_contract) || 0;

  const KPI_CARDS = [
    { key: 'revenue', label: '累计销售额', value: `¥ ${totalRevenue.toLocaleString()}`, change: 0, color: '#1E88E5', icon: TrendingUpIcon },
    { key: 'newCustomers', label: '客户总数', value: String(totalCustomers), change: 0, color: '#4CAF50', icon: UsersIcon },
    { key: 'experienceCards', label: '已付款订单', value: String(paidOrders), change: 0, color: '#AB47BC', icon: CreditCardIcon },
    { key: 'upgrades', label: '今日预约', value: String(todayAppt), change: 0, color: '#FF7043', icon: ArrowUpRightIcon },
    { key: 'upgradeRate', label: '在职技师', value: String(activeTherapists), change: 0, color: '#FFC107', icon: TrendingUpIcon },
  ];

  function dismissTodo(id: number) {
    setDismissedIds(prev => [...prev, id]);
  }

  return (
    <div data-cmp="DashboardPage" className="flex flex-col gap-5">
      {/* Time filter */}
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>经营概览 · 实时数据</div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--muted)' }}>
          {TIME_FILTERS.map(f => (
            <button
              key={f}
              className="px-3 py-1 rounded-md text-sm font-medium transition-all"
              style={{
                background: timeFilter === f ? '#fff' : 'transparent',
                color: timeFilter === f ? 'var(--brand)' : 'var(--muted-foreground)',
                boxShadow: timeFilter === f ? '0 1px 4px rgba(30,136,229,0.15)' : 'none',
              }}
              onClick={() => setTimeFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="flex gap-4 flex-wrap">
        {KPI_CARDS.map(card => {
          const Icon = card.icon;
          const isUp = card.change >= 0;
          return (
            <div
              key={card.key}
              className="flex-1 rounded-xl p-4 bg-card shadow-custom"
              style={{ minWidth: 160 }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>{card.label}</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: card.color + '18' }}>
                  <Icon size={16} style={{ color: card.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground mb-1">{card.value}</div>
              <div className="flex items-center gap-1 text-xs">
                {isUp
                  ? <TrendingUpIcon size={12} style={{ color: 'var(--danger)' }} />
                  : <TrendingDownIcon size={12} style={{ color: 'var(--success)' }} />
                }
                <span style={{ color: isUp ? 'var(--danger)' : 'var(--success)' }}>
                  {isUp ? '+' : ''}{card.change}%
                </span>
                <span style={{ color: 'var(--muted-foreground)' }}>环比上月</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart + Todo */}
      <div className="flex gap-5">
        {/* Chart */}
        <div className="flex-1 bg-card rounded-xl p-5 shadow-custom" style={{ minWidth: 0 }}>
          <div className="flex items-center justify-between mb-4">
            <span className="font-semibold text-foreground">数据趋势</span>
            <div className="flex gap-1">
              {[
                { key: 'revenue', label: '销售额' },
                { key: 'newCustomers', label: '新客' },
                { key: 'experienceCards', label: '体验卡' },
                { key: 'upgrades', label: '升单' },
              ].map(m => (
                <button
                  key={m.key}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                  style={{
                    background: chartMetric === m.key ? 'var(--brand)' : 'var(--muted)',
                    color: chartMetric === m.key ? '#fff' : 'var(--muted-foreground)',
                  }}
                  onClick={() => setChartMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
              <Line
                type="monotone"
                dataKey={chartMetric}
                stroke="var(--brand)"
                strokeWidth={2.5}
                dot={{ fill: 'var(--brand)', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Todo */}
        <div className="bg-card rounded-xl p-5 shadow-custom flex flex-col" style={{ width: 300, flexShrink: 0 }}>
          <div className="flex items-center justify-between mb-4">
            <span className="font-semibold text-foreground">待办中心</span>
            <span className="badge badge-warning">{todos.length} 项待处理</span>
          </div>
          <div className="flex flex-col gap-3 flex-1">
            {todos.map(todo => {
              const Icon = TODO_ICONS[todo.type as keyof typeof TODO_ICONS] ?? AlertCircleIcon;
              const pageMap: Record<string, string> = {
                contract: 'orders-contracts',
                appointment: 'customers-pool',
                service: 'services-records',
                cancel: 'services-change',
              };
              return (
                <div
                  key={todo.id}
                  className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ background: 'var(--muted)', border: `1px solid ${todo.color}25` }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: todo.color + '18' }}>
                    <Icon size={16} style={{ color: todo.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{todo.label}</div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      <span className="font-bold" style={{ color: todo.color }}>{todo.count}</span> 条待处理
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="p-1.5 rounded-md hover:bg-white transition-colors"
                      title="前往处理"
                      onClick={() => setActivePage(pageMap[todo.type] ?? 'dashboard')}
                    >
                      <ArrowRightIcon size={13} style={{ color: 'var(--brand)' }} />
                    </button>
                    <button
                      className="p-1.5 rounded-md hover:bg-white transition-colors"
                      title="标记已处理"
                      onClick={() => dismissTodo(todo.id)}
                    >
                      <XCircleIcon size={13} style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                  </div>
                </div>
              );
            })}
            {todos.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                <span className="text-2xl mb-1">✓</span>
                <span>暂无待办事项</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="flex gap-4">
        {[
          { label: '今日预约', value: todayAppt, sub: '实时', color: 'var(--brand)' },
          { label: '待付款订单', value: Number(s.pending_pay) || 0, sub: '待收款', color: 'var(--success)' },
          { label: '在职技师', value: activeTherapists, sub: '可派单', color: '#AB47BC' },
          { label: '未签合同', value: pendingContract, sub: '待回签', color: 'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="flex-1 bg-card rounded-xl p-4 shadow-custom flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold text-white"
              style={{ background: s.color }}>
              {s.value}
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{s.label}</div>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
