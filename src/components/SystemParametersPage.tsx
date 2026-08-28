import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CloudIcon,
  DatabaseIcon,
  HardDriveIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useSystemParameters, useSystemParametersRefresh } from '../api/hooks';
import type { ResourceStatus, StorageParameter } from '../api/endpoints';

const STATUS_STYLE: Record<ResourceStatus, string> = {
  healthy: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  unavailable: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<ResourceStatus, string> = {
  healthy: '正常', warning: '需关注', unavailable: '暂不可用',
};

function formatBytes(value: number | null) {
  if (value === null) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let current = value;
  let index = -1;
  do { current /= 1024; index += 1; } while (current >= 1024 && index < units.length - 1);
  return `${current >= 10 ? current.toFixed(1) : current.toFixed(2)} ${units[index]}`;
}

function formatChinaTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replaceAll('/', '-');
}

function StatusBadge({ status }: { status: ResourceStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {status === 'healthy' ? <CheckCircle2Icon size={12} /> : <AlertTriangleIcon size={12} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function StorageSummary({ metric }: { metric: StorageParameter }) {
  const percent = metric.usagePercent === null ? 0 : Math.min(metric.usagePercent, 100);
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">空间总量</div>
          <div className="mt-1 text-base font-semibold text-foreground">{formatBytes(metric.totalBytes)}</div>
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">已用空间</div>
          <div className="mt-1 text-base font-semibold text-brand">{formatBytes(metric.usedBytes)}</div>
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">未用空间</div>
          <div className="mt-1 text-base font-semibold text-foreground">{formatBytes(metric.freeBytes)}</div>
        </div>
      </div>
      {metric.usagePercent !== null && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>容量使用率</span><span>{metric.usagePercent.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${percent >= 80 ? 'bg-amber-500' : 'bg-brand'}`} style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </>
  );
}

export default function SystemParametersPage() {
  const query = useSystemParameters();
  const refresh = useSystemParametersRefresh();
  const data = query.data;

  return (
    <div data-cmp="SystemParametersPage" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-custom">
        <div>
          <h2 className="font-semibold text-foreground">云资源与证书监控</h2>
          <p className="mt-1 text-xs text-muted-foreground">每天凌晨 00:05 自动更新，也可手动获取最新状态。</p>
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <RefreshCwIcon size={15} className={refresh.isPending ? 'animate-spin' : ''} />
          {refresh.isPending ? '更新中…' : '手动更新'}
        </button>
      </div>

      {(query.isLoading || !data) && !query.isError && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">正在读取系统参数…</div>
      )}
      {query.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">系统参数读取失败，请稍后重试。</div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-custom">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 text-blue-600"><DatabaseIcon size={20} /></div>
                <div><h3 className="font-semibold">RDS MySQL</h3><p className="text-xs text-muted-foreground">结构化存储 · {data.rds.database}</p></div>
              </div>
              <StatusBadge status={data.rds.status} />
            </div>
            <StorageSummary metric={data.rds} />
            <p className="mt-4 text-xs text-muted-foreground">{data.rds.message}</p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-custom">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-cyan-100 p-2 text-cyan-600"><CloudIcon size={20} /></div>
                <div><h3 className="font-semibold">OSS</h3><p className="text-xs text-muted-foreground">非结构化存储 · {data.oss.bucket || '未配置 Bucket'}</p></div>
              </div>
              <StatusBadge status={data.oss.status} />
            </div>
            <StorageSummary metric={data.oss} />
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <HardDriveIcon size={13} />对象数量：{data.oss.objectCount === null ? '—' : data.oss.objectCount.toLocaleString('zh-CN')} · 区域：{data.oss.region || '—'}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data.oss.message}</p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-custom xl:col-span-2">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600"><ShieldCheckIcon size={20} /></div>
                <div><h3 className="font-semibold">SSL 证书</h3><p className="text-xs text-muted-foreground">{data.ssl.domain}</p></div>
              </div>
              <StatusBadge status={data.ssl.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">生效时间</div><div className="mt-1 text-sm font-medium">{formatChinaTime(data.ssl.validFrom)}</div></div>
              <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">到期时间</div><div className="mt-1 text-sm font-medium">{formatChinaTime(data.ssl.validTo)}</div></div>
              <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">剩余有效期</div><div className="mt-1 text-sm font-semibold text-brand">{data.ssl.daysRemaining === null ? '—' : `${data.ssl.daysRemaining} 天`}</div></div>
              <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">签发机构</div><div className="mt-1 truncate text-sm font-medium" title={data.ssl.issuer}>{data.ssl.issuer || '—'}</div></div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{data.ssl.message}</p>
          </section>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>最近更新：{formatChinaTime(data.refreshedAt)}</span>
          <span>下次自动更新：{formatChinaTime(data.nextAutoRefreshAt)}</span>
          {refresh.isSuccess && <span className="text-green-600">手动更新成功</span>}
          {refresh.isError && <span className="text-red-600">手动更新失败</span>}
        </div>
      )}
    </div>
  );
}
