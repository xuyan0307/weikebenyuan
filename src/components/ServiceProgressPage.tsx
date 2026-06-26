import { useState } from 'react';
import {
  SearchIcon, FilterIcon, ActivityIcon, TrendingUpIcon,
  ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, ClockIcon
} from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useOrders, useAppointments } from '../api/hooks';

type ProgressStatus = '进行中' | '已完成' | '暂停';

interface ServiceProgress {
  id: string;
  customerName: string;
  packageName: string;
  totalTimes: number;
  usedTimes: number;
  remainingTimes: number;
  startDate: string;
  lastServiceDate: string;
  therapistName: string;
  status: ProgressStatus;
  progressPct: number;
}

const STATUS_COLORS: Record<ProgressStatus, string> = {
  '进行中': 'badge-info',
  '已完成': 'badge-success',
  '暂停': 'badge-warning',
};

export default function ServiceProgressPage() {
  const { currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const apptsQ = useAppointments({ page: 1, pageSize: 1000 });
  const ORDERS: any[] = ordersQ.data?.data ?? [];
  const APPOINTMENTS: any[] = apptsQ.data?.data ?? [];

  const PROGRESS_LIST: ServiceProgress[] = ORDERS
    .filter(o => o.type === '套餐')
    .map((o: any, i: number) => {
      const appt = APPOINTMENTS[i % Math.max(APPOINTMENTS.length, 1)];
      const pct = Math.round((o.usedTimes / Math.max(o.totalTimes, 1)) * 100);
      const status: ProgressStatus = o.usedTimes === o.totalTimes ? '已完成' : pct > 0 ? '进行中' : '暂停';
      return {
        id: `SP${String(i + 1).padStart(4, '0')}`,
        customerName: o.customerName,
        packageName: o.type,
        totalTimes: o.totalTimes,
        usedTimes: o.usedTimes,
        remainingTimes: o.totalTimes - o.usedTimes,
        startDate: o.createdAt,
        lastServiceDate: appt?.date ?? '',
        therapistName: appt?.therapistName ?? '—',
        status,
        progressPct: pct,
      };
    });

  const filtered = PROGRESS_LIST.filter(p => {
    const matchSearch = !search || p.customerName.includes(search) || p.therapistName.includes(search);
    const matchStatus = statusFilter === '__all__' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const inProgressCount = PROGRESS_LIST.filter(p => p.status === '进行中').length;
  const completedCount = PROGRESS_LIST.filter(p => p.status === '已完成').length;
  const avgProgress = Math.round(PROGRESS_LIST.reduce((s, p) => s + p.progressPct, 0) / Math.max(PROGRESS_LIST.length, 1));

  return (
    <div data-cmp="ServiceProgressPage" className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex gap-4">
        {[
          { label: '进行中套餐', value: inProgressCount, color: 'var(--brand)' },
          { label: '已完成套餐', value: completedCount, color: 'var(--success)' },
          { label: '暂停套餐', value: PROGRESS_LIST.filter(p => p.status === '暂停').length, color: 'var(--warning)' },
          { label: '平均完成度', value: `${avgProgress}%`, color: '#AB47BC' },
        ].map(s => (
          <div key={s.label} className="flex-1 bg-card rounded-xl p-4 shadow-custom">
            <div className="text-sm mb-1" style={{ color: 'var(--muted-foreground)' }}>{s.label}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-custom flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--muted)', minWidth: 200 }}>
          <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
          <input
            className="bg-transparent outline-none text-sm flex-1"
            placeholder="搜索客户/技师"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', height: 36 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="__all__">全部状态</option>
          <option value="进行中">进行中</option>
          <option value="已完成">已完成</option>
          <option value="暂停">暂停</option>
        </select>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <FilterIcon size={14} />
          共 <strong className="text-foreground">{filtered.length}</strong> 条记录
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-custom overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>编号</th>
                <th>客户</th>
                <th>套餐</th>
                <th>服务进度</th>
                <th>已用/总次</th>
                <th>剩余次数</th>
                <th>开始日期</th>
                <th>最近服务</th>
                <th>负责技师</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(p => (
                <tr key={p.id}>
                  <td className="font-mono text-xs" style={{ color: 'var(--brand)' }}>{p.id}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: 'var(--brand)' }}>
                        {p.customerName[0]}
                      </div>
                      {p.customerName}
                    </div>
                  </td>
                  <td><span className="badge badge-purple">{p.packageName}</span></td>
                  <td style={{ minWidth: 120 }}>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span style={{ color: 'var(--muted-foreground)' }}>{p.progressPct}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--muted)', width: 100 }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${p.progressPct}%`,
                            background: p.progressPct >= 100 ? 'var(--success)' : p.progressPct > 50 ? 'var(--brand)' : 'var(--warning)',
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="font-medium" style={{ color: 'var(--brand)' }}>{p.usedTimes}/{p.totalTimes}</td>
                  <td>
                    <span className={`badge ${p.remainingTimes === 0 ? 'badge-gray' : p.remainingTimes <= 2 ? 'badge-danger' : 'badge-success'}`}>
                      {p.remainingTimes} 次
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{p.startDate}</td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{p.lastServiceDate}</td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{p.therapistName}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[p.status]}`}>
                      {p.status === '进行中' ? <ActivityIcon size={10} className="inline mr-1" /> : <CheckCircleIcon size={10} className="inline mr-1" />}
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            第 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filtered.length)} 条，共 {filtered.length} 条
          </span>
          <div className="flex items-center gap-2">
            <button className="p-1.5 rounded hover:bg-muted disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeftIcon size={15} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className="w-7 h-7 rounded text-sm font-medium"
                style={{ background: p === page ? 'var(--brand)' : 'transparent', color: p === page ? '#fff' : 'var(--foreground)' }}
                onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="p-1.5 rounded hover:bg-muted disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRightIcon size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
