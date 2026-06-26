import { useState } from 'react';
import {
  SearchIcon, FilterIcon, UsersIcon, InboxIcon,
  ChevronLeftIcon, ChevronRightIcon, PhoneIcon, MapPinIcon, PlusIcon
} from 'lucide-react';
import type { CustomerTag } from '../data/mockData';
import { useApp } from '../hooks/useApp';
import { useCustomers, useCustomerMutations } from '../api/hooks';
import { toast } from 'sonner';

const TAG_COLORS: Record<CustomerTag, string> = {
  'V1': 'badge-purple',
  'V2': 'badge-purple',
  'A1': 'badge-danger',
  'A2': 'badge-danger',
  'B1': 'badge-warning',
  'B2': 'badge-warning',
  'C1': 'badge-info',
  'C2': 'badge-info',
  'D1': 'badge-success',
  'D2': 'badge-success',
  'D3': 'badge-success',
  'T1': 'badge-gray',
  'T2': 'badge-gray',
  'S1': 'badge-gray',
  'S2': 'badge-gray',
};

const AREAS = ['东城区', '西城区', '朝阳区', '海淀区', '丰台区'];
const SOURCES = ['自然流量', '朋友推荐', '美团', '小红书', '微信广告'];

// Customer pool: clients not yet assigned / in early acquisition phase (status = 待跟进 or 跟进中)
export default function CustomerPoolPage() {
  const { currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('__all__');
  const [sourceFilter, setSourceFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const canClaim = currentUser.role === 'service' || currentUser.role === 'admin' || currentUser.role === 'superadmin';

  const customersQ = useCustomers({ page: 1, pageSize: 1000 });
  const allCustomers: any[] = customersQ.data?.data ?? [];
  const mutations = useCustomerMutations();

  const poolCustomers = allCustomers.filter(c => c.followStatus === '待跟进' || c.followStatus === '跟进中');

  const filtered = poolCustomers.filter(c => {
    const matchSearch = !search || c.name.includes(search) || c.phone.includes(search);
    const matchArea = areaFilter === '__all__' || c.area === areaFilter;
    const matchSource = sourceFilter === '__all__' || c.source === sourceFilter;
    return matchSearch && matchArea && matchSource;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div data-cmp="CustomerPoolPage" className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex gap-4">
        {[
          { label: '公海客户总数', value: poolCustomers.length, icon: UsersIcon, color: 'var(--brand)' },
          { label: '待跟进', value: allCustomers.filter(c => c.followStatus === '待跟进').length, icon: InboxIcon, color: 'var(--warning)' },
          { label: '跟进中', value: allCustomers.filter(c => c.followStatus === '跟进中').length, icon: InboxIcon, color: 'var(--success)' },
          { label: '今日新增', value: Math.floor(poolCustomers.length * 0.15), icon: PlusIcon, color: '#AB47BC' },
        ].map(s => (
          <div key={s.label} className="flex-1 bg-card rounded-xl p-4 shadow-custom">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{s.label}</span>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
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
            placeholder="搜索客户姓名/电话"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', height: 36 }}
          value={areaFilter}
          onChange={e => setAreaFilter(e.target.value)}
        >
          <option value="__all__">全部区域</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', height: 36 }}
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
        >
          <option value="__all__">全部来源</option>
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <FilterIcon size={14} />
          共 <strong className="text-foreground">{filtered.length}</strong> 条
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-custom overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>客户姓名</th>
                <th>电话</th>
                <th>区域</th>
                <th>来源</th>
                <th>录入时间</th>
                <th>标签</th>
                <th>跟进状态</th>
                <th>最后跟进</th>
                {canClaim && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {paginated.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: 'var(--brand)' }}>
                        {c.name[0]}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      <PhoneIcon size={11} />
                      {c.phone}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      <MapPinIcon size={11} />
                      {c.area}
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{c.source}</td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{c.acquiredAt}</td>
                  <td><span className={`badge ${TAG_COLORS[c.tag]}`}>{c.tag} 级</span></td>
                  <td>
                    <span className={`badge ${c.followStatus === '待跟进' ? 'badge-warning' : 'badge-info'}`}>
                      {c.followStatus}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted-foreground)' }}>{c.lastFollow}</td>
                  {canClaim && (
                    <td>
                      <button className="px-3 py-1 rounded text-xs font-medium text-white hover:opacity-90"
                        style={{ background: 'var(--brand)', height: 26 }}>
                        领取
                      </button>
                    </td>
                  )}
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
