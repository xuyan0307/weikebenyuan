import { useState } from 'react';
import {
  SearchIcon, FilterIcon, FileTextIcon, CheckCircleIcon,
  ClockIcon, XCircleIcon, DownloadIcon,
  ChevronLeftIcon, ChevronRightIcon
} from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useOrders, useOrderMutations } from '../api/hooks';
import { toast } from 'sonner';

type ContractStatus = '已签署' | '待签署' | '已过期' | '已撤销';

interface ContractRecord {
  id: string;
  orderId: string;
  customerName: string;
  type: string;
  amount: number;
  signedAt: string;
  expiresAt: string;
  status: ContractStatus;
}

const STATUS_COLORS: Record<ContractStatus, string> = {
  '已签署': 'badge-success',
  '待签署': 'badge-warning',
  '已过期': 'badge-gray',
  '已撤销': 'badge-danger',
};

const STATUS_ICONS: Record<ContractStatus, typeof CheckCircleIcon> = {
  '已签署': CheckCircleIcon,
  '待签署': ClockIcon,
  '已过期': XCircleIcon,
  '已撤销': XCircleIcon,
};

export default function ContractListPage() {
  const { currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [typeFilter, setTypeFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const ordersQ = useOrders({ page: 1, pageSize: 1000 });
  const mutations = useOrderMutations();

  const CONTRACTS: ContractRecord[] = (ordersQ.data?.data ?? []).map((o: any, i: number) => ({
    id: `CON${String(i + 1).padStart(4, '0')}`,
    orderId: o.id,
    customerName: o.customerName,
    type: o.type === '套餐' ? '套餐服务合同' : '体验服务协议',
    amount: o.amount,
    signedAt: o.contractSigned ? o.createdAt : '',
    expiresAt: o.contractSigned ? `${o.createdAt.slice(0, 4) + 1}-${o.createdAt.slice(5, 7)}-01` : '',
    status: (o.contractSigned ? '已签署' : '待签署') as ContractStatus,
  }));

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'superadmin' || currentUser.role === 'service';

  const filtered = CONTRACTS.filter(c => {
    const matchSearch = !search || c.customerName.includes(search) || c.id.includes(search);
    const matchStatus = statusFilter === '__all__' || c.status === statusFilter;
    const matchType = typeFilter === '__all__' || c.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div data-cmp="ContractListPage" className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex gap-4">
        {([
          { label: '已签署', status: '已签署' as ContractStatus, color: 'var(--success)' },
          { label: '待签署', status: '待签署' as ContractStatus, color: 'var(--warning)' },
          { label: '已过期', status: '已过期' as ContractStatus, color: 'var(--muted-foreground)' },
          { label: '已撤销', status: '已撤销' as ContractStatus, color: 'var(--danger)' },
        ]).map(s => (
          <div key={s.label} className="flex-1 bg-card rounded-xl p-4 shadow-custom">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{s.label}</span>
              <FileTextIcon size={16} style={{ color: s.color }} />
            </div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>
              {CONTRACTS.filter(c => c.status === s.status).length}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-custom flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--muted)', minWidth: 200 }}>
          <SearchIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
          <input
            className="bg-transparent outline-none text-sm flex-1"
            placeholder="搜索客户姓名/合同编号"
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
          {(['已签署', '待签署', '已过期', '已撤销'] as ContractStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          className="text-sm rounded-lg px-2 py-1.5 outline-none"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', height: 36 }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="__all__">全部类型</option>
          <option value="套餐服务合同">套餐服务合同</option>
          <option value="体验服务协议">体验服务协议</option>
        </select>

        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <FilterIcon size={14} />
          共 <strong className="text-foreground">{filtered.length}</strong> 份合同
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-custom overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>合同编号</th>
                <th>关联订单</th>
                <th>客户</th>
                <th>合同类型</th>
                <th>合同金额</th>
                <th>签署日期</th>
                <th>到期日期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(c => {
                const Icon = STATUS_ICONS[c.status];
                return (
                  <tr key={c.id}>
                    <td className="font-mono text-xs" style={{ color: 'var(--brand)' }}>{c.id}</td>
                    <td className="font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.orderId}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: 'var(--brand)' }}>
                          {c.customerName[0]}
                        </div>
                        {c.customerName}
                      </div>
                    </td>
                    <td><span className="badge badge-purple">{c.type}</span></td>
                    <td className="font-bold" style={{ color: 'var(--success)' }}>¥ {c.amount.toLocaleString()}</td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{c.signedAt || '—'}</td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{c.expiresAt}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[c.status]}`}>
                        <Icon size={10} className="inline mr-1" />
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded hover:bg-muted transition-colors" title="下载合同">
                          <DownloadIcon size={13} style={{ color: 'var(--brand)' }} />
                        </button>
                        {canEdit && c.status === '待签署' && (
                          <button className="px-2 py-1 rounded text-xs font-medium text-white hover:opacity-90"
                            style={{ background: 'var(--success)', height: 24 }}>
                            催签
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
