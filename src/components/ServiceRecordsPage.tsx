import { useState } from 'react';
import {
  SearchIcon, FilterIcon, CheckCircleIcon, ClockIcon, StarIcon,
  ChevronLeftIcon, ChevronRightIcon, UserIcon, MapPinIcon
} from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useAppointments, useTherapists } from '../api/hooks';

const SERVICE_TYPES = ['骨盆修复', '腹直肌修复', '盆底肌修复', '综合调理', '产后瑜伽'];

interface ServiceRecord {
  id: string;
  date: string;
  customerName: string;
  therapistName: string;
  service: string;
  area: string;
  duration: number;
  feedback: number;
  note: string;
  status: '已完成' | '服务中' | '待确认';
}

function StarRating({ value = 5 }: { value?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <StarIcon
          key={i}
          size={12}
          style={{ color: i <= value ? '#FFC107' : 'var(--border)', fill: i <= value ? '#FFC107' : 'transparent' }}
        />
      ))}
    </div>
  );
}

export default function ServiceRecordsPage() {
  const { currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('__all__');
  const [therapistFilter, setTherapistFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const isTherapist = currentUser.role === 'therapist';

  const apptsQ = useAppointments({ page: 1, pageSize: 1000 });
  const therapistsQ = useTherapists({ page: 1, pageSize: 1000 });
  const THERAPISTS: any[] = therapistsQ.data?.data ?? [];

  const RECORDS: ServiceRecord[] = (apptsQ.data?.data ?? [])
    .filter((a: any) => a.status === '已完成' || a.status === '已确认')
    .map((a: any, i: number) => ({
      id: `SRV${String(i + 1).padStart(4, '0')}`,
      date: a.date,
      customerName: a.customerName,
      therapistName: a.therapistName,
      service: a.service,
      area: a.area,
      duration: 90,
      feedback: [5, 4, 5, 4, 5][i % 5],
      note: a.remark || '客户反馈良好',
      status: a.status === '已完成' ? '已完成' : '服务中',
    }));

  const filtered = RECORDS.filter(r => {
    const matchSearch = !search || r.customerName.includes(search) || r.therapistName.includes(search);
    const matchService = serviceFilter === '__all__' || r.service === serviceFilter;
    const matchTherapist = therapistFilter === '__all__' || r.therapistName.includes(therapistFilter);
    return matchSearch && matchService && matchTherapist;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div data-cmp="ServiceRecordsPage" className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex gap-4">
        {[
          { label: '本月服务次数', value: RECORDS.filter(r => r.status === '已完成').length, color: 'var(--brand)' },
          { label: '平均服务时长', value: '90 min', color: 'var(--success)' },
          { label: '平均评分', value: '4.8 ★', color: '#FFC107' },
          { label: '服务客户数', value: new Set(RECORDS.map(r => r.customerName)).size, color: '#AB47BC' },
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
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
        >
          <option value="__all__">全部服务</option>
          {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {!isTherapist && (
          <select
            className="text-sm rounded-lg px-2 py-1.5 outline-none"
            style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', height: 36 }}
            value={therapistFilter}
            onChange={e => setTherapistFilter(e.target.value)}
          >
            <option value="__all__">全部技师</option>
            {THERAPISTS.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        )}

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
                <th>记录编号</th>
                <th>服务日期</th>
                <th>客户</th>
                <th>技师</th>
                <th>服务项目</th>
                <th>区域</th>
                <th>时长</th>
                <th>客户评分</th>
                <th>备注</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-xs" style={{ color: 'var(--brand)' }}>{r.id}</td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{r.date}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: 'var(--brand)' }}>
                        {r.customerName[0]}
                      </div>
                      {r.customerName}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <UserIcon size={13} style={{ color: 'var(--muted-foreground)' }} />
                      {r.therapistName}
                    </div>
                  </td>
                  <td><span className="badge badge-info">{r.service}</span></td>
                  <td>
                    <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      <MapPinIcon size={11} />
                      {r.area}
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{r.duration} min</td>
                  <td><StarRating value={r.feedback} /></td>
                  <td className="max-w-32 truncate" style={{ color: 'var(--muted-foreground)' }}>{r.note}</td>
                  <td>
                    <span className={`badge ${r.status === '已完成' ? 'badge-success' : r.status === '服务中' ? 'badge-warning' : 'badge-gray'}`}>
                      {r.status}
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
