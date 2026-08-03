import { useState } from 'react';
import {
  TrendingUpIcon, UsersIcon, CreditCardIcon,
  ArrowUpRightIcon, AlertCircleIcon, CalendarCheckIcon, ClipboardIcon,
  ArrowRightIcon,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useApp } from '../hooks/useApp';
import { useDashboardStats, useDashboardTodos, useDashboardChart } from '../api/hooks';
import type { DashboardPeriod } from '../api/endpoints';
import { DateRangeFilter } from './ui/date-range-filter';
import { GLOBAL_DATE_RANGE_QUICK_OPTIONS, quickDateRange, type DateRangeValue } from '../utils/dateRange';
import { useGlobalDateRange } from '../utils/useGlobalDateRange';
import {
  DASHBOARD_FILTER_STORAGE_KEY,
  dashboardTodoTarget,
} from '../utils/dashboardTodoNavigation';

const TIME_FILTERS: Array<{ label: string; value: DashboardPeriod }> = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '今年', value: 'year' },
];

const TODO_ICONS: Record<string, any> = {
  'new-customer-followup': ClipboardIcon,
  'order-customer-followup': AlertCircleIcon,
  'appointment-notification': CalendarCheckIcon,
  'contract-pending-signature': FileTextIcon,
};

export default function DashboardPage() {
  const { setActivePage } = useApp();
  const [timeFilter, setTimeFilter] = useState<DashboardPeriod>('month');
  const [dateRange, setDateRange] = useGlobalDateRange('month');
  const [chartMetric, setChartMetric] = useState('revenue');

  const statsQ = useDashboardStats(timeFilter, dateRange.start, dateRange.end);
  const todosQ = useDashboardTodos();
  const chartQ = useDashboardChart(dateRange.start, dateRange.end);

  const s: any = statsQ.data || {};
  const chartData = (chartQ.data ?? []).map((r: any) => ({
    month: r.month ? r.month.slice(5) + '月' : '',
    revenue: Number(r.revenue) || 0,
    newCustomers: Number(r.new_customers) || 0,
    experienceCards: Number(r.experience_cards) || 0,
    upgrades: Number(r.upgrades) || 0,
  }));
  const todos = todosQ.data ?? [];

  const totalRevenue = Number(s.total_revenue) || 0;
  const experienceRevenue = Number(s.experience_revenue) || 0;
  const upgradeRevenue = Number(s.upgrade_revenue) || 0;
  const purchaseRate = Number(s.purchase_rate) || 0;
  const firstUpgradeCustomers = Number(s.first_upgrade_customers) || 0;
  const upgradeRate = Number(s.upgrade_rate) || 0;
  const secondUpgradeCustomers = Number(s.second_upgrade_customers) || 0;
  const secondUpgradeRate = Number(s.second_upgrade_rate) || 0;

  const KPI_CARDS = [
    {
      key: 'revenue',
      label: '累计销售额',
      value: `¥ ${totalRevenue.toLocaleString()}`,
      details: [`体验卡 ¥ ${experienceRevenue.toLocaleString()}`, `升单套餐 ¥ ${upgradeRevenue.toLocaleString()}`],
      color: '#1E88E5',
      icon: TrendingUpIcon,
    },
    { key: 'newCustomers', label: '新客数量', value: String(Number(s.new_customers) || 0), details: ['按获客时间统计'], color: '#4CAF50', icon: UsersIcon },
    {
      key: 'experienceCards',
      label: '体验卡数量',
      value: String(Number(s.experience_cards) || 0),
      details: ['已付款体验卡', `购买率 ${purchaseRate.toFixed(1)}%`],
      color: '#AB47BC',
      icon: CreditCardIcon,
    },
    {
      key: 'upgrades',
      label: '升单数量',
      value: String(firstUpgradeCustomers),
      details: ['套餐1客户', `升单率 ${upgradeRate.toFixed(1)}%`],
      color: '#FF7043',
      icon: ArrowUpRightIcon,
    },
    {
      key: 'secondUpgrades',
      label: '二次升单',
      value: `¥ ${(Number(s.second_upgrade_revenue) || 0).toLocaleString()}`,
      details: [`套餐2客户 ${secondUpgradeCustomers} 人`, `二次升单率 ${secondUpgradeRate.toFixed(1)}%`],
      color: '#FFC107',
      icon: TrendingUpIcon,
    },
  ];

  function openTodo(type: string) {
    const target = dashboardTodoTarget(type);
    if (!target) return;
    sessionStorage.setItem(DASHBOARD_FILTER_STORAGE_KEY, JSON.stringify(target.filter));
    setActivePage(target.page);
  }

  return (
    <div data-cmp="DashboardPage" className="flex flex-col gap-5">
      {/* Time filter */}
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>经营概览 · 实时数据</div>
        <div className="flex items-center gap-2">
          <DateRangeFilter
            value={dateRange}
            onChange={value => { setDateRange(value); setTimeFilter('all'); }}
            quickOptions={GLOBAL_DATE_RANGE_QUICK_OPTIONS}
            onQuickSelect={value => setTimeFilter(
              value === 'today' || value === 'week' || value === 'month' || value === 'year'
                ? value
                : 'all',
            )}
            align="right"
          />
          <div className="hidden" style={{ background: 'var(--muted)' }}>
          {TIME_FILTERS.map(filter => (
            <button
              key={filter.value}
              className="px-3 py-1 rounded-md text-sm font-medium transition-all"
              style={{
                background: timeFilter === filter.value ? '#fff' : 'transparent',
                color: timeFilter === filter.value ? 'var(--brand)' : 'var(--muted-foreground)',
                boxShadow: timeFilter === filter.value ? '0 1px 4px rgba(30,136,229,0.15)' : 'none',
              }}
              onClick={() => { setTimeFilter(filter.value); setDateRange(quickDateRange(filter.value)); }}
            >
              {filter.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="flex gap-4 flex-wrap">
        {KPI_CARDS.map(card => {
          const Icon = card.icon;
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
              <div className="text-2xl font-bold text-foreground mb-2">{card.value}</div>
              <div className="flex min-h-8 flex-wrap content-start gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {card.details.map(detail => <span key={detail}>{detail}</span>)}
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
            <span className="badge badge-warning">{todos.reduce((sum, todo) => sum + Number(todo.count || 0), 0)} 项待处理</span>
          </div>
          <div className="flex flex-col gap-3 flex-1">
            {todos.map(todo => {
              const Icon = TODO_ICONS[todo.type as keyof typeof TODO_ICONS] ?? AlertCircleIcon;
              return (
                <button
                  type="button"
                  key={todo.id}
                  className="flex items-center gap-3 p-3 rounded-lg text-left transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--muted)', border: `1px solid ${todo.color}25` }}
                  onClick={() => openTodo(todo.type)}
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
                  <ArrowRightIcon size={14} style={{ color: 'var(--brand)' }} />
                </button>
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

    </div>
  );
}
