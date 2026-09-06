import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIcon, BarChart3Icon, BellIcon, ChevronDownIcon, CircleDollarSignIcon,
  DatabaseIcon, FileTextIcon, InfoIcon, MapPinnedIcon,
  MessageCircleMoreIcon, MousePointerClickIcon, RefreshCwIcon, SearchIcon,
  SparklesIcon, TrendingUpIcon, UsersIcon,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../hooks/useApp';
import { juguangApi, type JuguangOverviewDto, type JuguangReportRow } from '../api/endpoints';
import { useJuguangOverview, useJuguangReport, useJuguangSyncStatus } from '../api/hooks';

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom';
type PageKind = 'overview' | 'delivery' | 'search' | 'content' | 'leads' | 'audience' | 'sync';

const PAGE_KIND: Record<string, PageKind> = {
  'juguang-overview': 'overview', 'juguang-delivery': 'delivery', 'juguang-search': 'search',
  'juguang-content': 'content', 'juguang-leads': 'leads', 'juguang-audience': 'audience',
  'juguang-sync': 'sync',
};

const PAGE_DESCRIPTIONS: Record<PageKind, string> = {
  overview: '聚光投放结果、获客效率与平台转化的统一视图',
  delivery: '从计划到创意逐级查看投放效果和预算效率',
  search: '区分关键词规划数据与账户真实搜索词表现',
  content: '评估笔记和广告素材的点击、互动与获客贡献',
  leads: '查看每一类留资来源、质量、响应效率和后续去向',
  audience: '识别高价值城市、人群和设备组合',
  sync: '管理数据新鲜度、自动任务、授权状态与异常记录',
};

const PAGE_TITLES: Record<PageKind, string> = {
  overview: '数据总览',
  delivery: '投放分析',
  search: '搜索与关键词',
  content: '内容与素材',
  leads: '留资与私信',
  audience: '人群与地域',
  sync: '数据同步',
};

function ymd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function shiftDays(date: Date, days: number): Date { return new Date(date.getTime() + days * 86_400_000); }
function presetRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(shiftDays(now, -1));
  if (preset === 'today') return { startDate: today, endDate: today };
  if (preset === 'yesterday') return { startDate: yesterday, endDate: yesterday };
  if (preset === 'week') return { startDate: ymd(shiftDays(now, -7)), endDate: yesterday };
  if (preset === 'month') return { startDate: ymd(shiftDays(now, -30)), endDate: yesterday };
  const parts = yesterday.split('-').map(Number);
  if (preset === 'lastMonth') {
    const firstThisMonth = new Date(Date.UTC(parts[0], parts[1] - 1, 1, 0, 0));
    const lastPreviousMonth = shiftDays(firstThisMonth, -1);
    const lastParts = ymd(lastPreviousMonth).split('-').map(Number);
    return { startDate: `${lastParts[0]}-${String(lastParts[1]).padStart(2, '0')}-01`, endDate: ymd(lastPreviousMonth) };
  }
  if (preset === 'year') return { startDate: `${parts[0]}-01-01`, endDate: yesterday };
  return { startDate: yesterday, endDate: yesterday };
}

function numberOf(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/[%￥¥,]/gu, '').trim();
  if (!clean || clean === '-') return 0;
  const result = Number(clean);
  return Number.isFinite(result) ? result : 0;
}
function money(value: number): string { return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function integer(value: number): string { return Math.round(value).toLocaleString('zh-CN'); }
function percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function text(value: unknown): string { return value === undefined || value === null || value === '' ? '—' : String(value); }
function safeExternalUrl(value: unknown): string {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return '';
  }
}
function rate(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string' && value.includes('%')) return value;
  const numeric = numberOf(value);
  return `${(Math.abs(numeric) <= 1 ? numeric * 100 : numeric).toFixed(2)}%`;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-card shadow-custom ${className}`}>{children}</section>;
}
function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'red' | 'green' | 'amber' | 'blue' | 'gray' }) {
  const cls = { red: 'badge-danger', green: 'badge-success', amber: 'badge-warning', blue: 'badge-info', gray: 'badge-gray' }[tone];
  return <span className={`badge ${cls}`}>{children}</span>;
}
function EmptyState({ title = '当前时间范围暂无已同步数据' }: { title?: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center"><DatabaseIcon size={30} className="text-muted-foreground"/><div className="font-medium text-foreground">{title}</div><div className="text-xs text-muted-foreground">可点击右上角“手动刷新”拉取聚光报表</div></div>;
}
function ErrorState({ error }: { error: unknown }) {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '数据加载失败';
  return <Card className="p-5"><div className="text-sm text-danger">{message}</div></Card>;
}

function Overview({ data, loading }: { data?: JuguangOverviewDto; loading: boolean }) {
  const m = data?.metrics || {};
  const cards = [
    { label: '总消耗', value: money(m.fee || 0), detail: '聚光实际消费', icon: CircleDollarSignIcon, color: '#ff385d' },
    { label: '曝光量', value: integer(m.impression || 0), detail: '广告展现量', icon: ActivityIcon, color: '#467cf5' },
    { label: '点击量', value: integer(m.click || 0), detail: `点击率 ${percent(m.ctr || 0)}`, icon: MousePointerClickIcon, color: '#6f57d9' },
    { label: '私信开口', value: integer(m.initiative_message || 0), detail: `开口成本 ${money(m.initiative_message_cpl || 0)}`, icon: MessageCircleMoreIcon, color: '#ec4899' },
    { label: '进线数', value: integer(m.message_consult || 0), detail: `进线成本 ${money(m.message_consult_cpl || 0)}`, icon: BellIcon, color: '#0ea5e9' },
    { label: '有效留资', value: integer(m.effective_leads || 0), detail: '私信留资 + 有效表单', icon: UsersIcon, color: '#14a673' },
    { label: '平均留资成本', value: money(m.effective_leads_cpl || 0), detail: '按有效留资计算', icon: TrendingUpIcon, color: '#f4a12c' },
  ];
  const sources = data?.leadSources || [];
  const colors = ['#ff385d', '#467cf5', '#6f57d9', '#14a673', '#f4a12c', '#8a98ad'];
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">{cards.map(item => { const Icon = item.icon; return <Card key={item.label} className="p-4"><div className="flex justify-between"><div><div className="text-sm text-muted-foreground">{item.label}</div><div className="mt-2 text-2xl font-bold text-foreground">{loading ? '…' : item.value}</div></div><span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: item.color, background: `${item.color}12` }}><Icon size={18}/></span></div><div className="mt-3 text-xs text-muted-foreground">{item.detail}</div></Card>; })}</div>
    {!loading && !data?.trend.length ? <Card><EmptyState/></Card> : <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <Card className="p-5"><div className="mb-4 flex justify-between"><div><h3 className="font-semibold">消耗与获客趋势</h3><p className="mt-1 text-xs text-muted-foreground">按天展示实际同步数据</p></div><div className="text-xs"><span className="text-[#ff385d]">● 消耗</span><span className="ml-3 text-[#467cf5]">● 进线</span></div></div><ResponsiveContainer width="100%" height={270}><AreaChart data={data?.trend || []}><defs><linearGradient id="jgFee" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff385d" stopOpacity={0.2}/><stop offset="100%" stopColor="#ff385d" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis yAxisId="fee" tick={{fontSize:11}}/><YAxis yAxisId="count" orientation="right" tick={{fontSize:11}}/><Tooltip/><Area yAxisId="fee" type="monotone" dataKey="fee" stroke="#ff385d" fill="url(#jgFee)"/><Line yAxisId="count" type="monotone" dataKey="messageConsult" stroke="#467cf5" strokeWidth={2}/></AreaChart></ResponsiveContainer></Card>
      <Card className="p-5"><div className="mb-3 flex items-start justify-between"><div><h3 className="font-semibold">留资来源</h3><p className="mt-1 text-xs text-muted-foreground">各来源独立统计，不强行去重合并</p></div><Badge tone="blue">来源可追溯</Badge></div><div className="grid items-center gap-2 sm:grid-cols-[160px_1fr]"><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={sources} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>{sources.map((item, i) => <Cell key={item.key} fill={colors[i % colors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="space-y-2">{sources.map((item, i) => <div key={item.key} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{background:colors[i % colors.length]}}/><span className="flex-1 text-muted-foreground">{item.name}</span><strong>{integer(item.value)}</strong><span className="w-20 text-right text-muted-foreground">{item.value ? money(item.cost) : '—'}</span></div>)}</div></div></Card>
    </div>}
    <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">获客转化漏斗</h3><p className="mt-1 text-xs text-muted-foreground">聚光报表与平台同期经营数据分层展示，暂不代表客户级归因</p></div><Badge tone="amber">分层口径</Badge></div><div className="grid gap-2 md:grid-cols-7">{[
      ['聚光曝光', integer(m.impression || 0), '聚光API'], ['广告点击', integer(m.click || 0), '聚光API'], ['进线数', integer(m.message_consult || 0), '聚光API'], ['有效留资', integer(m.effective_leads || 0), '聚光API'], ['客户建档', integer(data?.platform.customers || 0), '平台数据'], ['体验卡', integer(data?.platform.experienceCards || 0), '平台数据'], ['成交升单', integer(data?.platform.convertedOrders || 0), '平台数据'],
    ].map(([label, value, source]) => <div key={label} className="rounded-lg border border-border bg-muted p-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div><div className="mt-2 text-[10px] text-muted-foreground">{source}</div></div>)}</div></Card>
  </div>;
}

function Delivery({ standard, easy, loading }: { standard: JuguangReportRow[]; easy: JuguangReportRow[]; loading: boolean }) {
  const rows = [...standard, ...easy];
  if (loading) return <Card><EmptyState title="正在加载投放报表…"/></Card>;
  if (!rows.length) return <Card><EmptyState/></Card>;
  return <div className="flex flex-col gap-5"><Card className="p-5"><div className="mb-4 flex justify-between"><div><h3 className="font-semibold">计划进线表现</h3><p className="mt-1 text-xs text-muted-foreground">标准投与简单投合并展示</p></div><Badge tone="red">按计划</Badge></div><ResponsiveContainer width="100%" height={250}><BarChart data={rows.slice(0, 20).map(row => ({ name: row.entityName, 进线: numberOf(row.data.message_consult), 私信开口: numberOf(row.data.initiative_message) }))}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="name" hide/><YAxis/><Tooltip/><Bar dataKey="进线" fill="#467cf5"/><Bar dataKey="私信开口" fill="#ff385d"/></BarChart></ResponsiveContainer></Card><Card className="overflow-hidden"><div className="border-b border-border p-5"><h3 className="font-semibold">投放计划明细</h3><p className="mt-1 text-xs text-muted-foreground">私信开口、进线和留资均为聚光原始报表字段</p></div><div className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>日期</th><th>计划名称</th><th>类型</th><th>消耗</th><th>曝光</th><th>点击</th><th>点击率</th><th>私信开口</th><th>进线数</th><th>私信留资</th><th>开口成本</th><th>进线成本</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.reportDate}-${row.entityId}-${i}`}><td>{row.reportDate}</td><td className="font-medium">{row.entityName}</td><td><Badge tone={standard.includes(row) ? 'blue' : 'red'}>{standard.includes(row) ? '标准投' : '简单投'}</Badge></td><td>{money(numberOf(row.data.fee))}</td><td>{integer(numberOf(row.data.impression))}</td><td>{integer(numberOf(row.data.click))}</td><td>{rate(row.data.ctr)}</td><td className="font-semibold text-pink-600">{integer(numberOf(row.data.initiative_message))}</td><td className="font-semibold text-blue-600">{integer(numberOf(row.data.message_consult))}</td><td>{integer(numberOf(row.data.msg_leads_num))}</td><td>{money(numberOf(row.data.initiative_message_cpl))}</td><td>{money(numberOf(row.data.message_consult_cpl))}</td></tr>)}</tbody></table></div></Card></div>;
}

function SearchReport({ rows, loading }: { rows: JuguangReportRow[]; loading: boolean }) {
  const [mode, setMode] = useState<'actual' | 'planner'>('actual');
  const [keyword, setKeyword] = useState('产后修复');
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof juguangApi.recommendKeywords>>['data']>();
  async function plan() { try { setPlanning(true); setResult((await juguangApi.recommendKeywords(keyword)).data); } catch (error) { toast.error((error as {message?:string})?.message || '关键词查询失败'); } finally { setPlanning(false); } }
  return <div className="flex flex-col gap-5"><Card className="p-2"><div className="flex gap-1"><button onClick={() => setMode('actual')} className={`rounded-lg px-4 py-2 text-sm ${mode === 'actual' ? 'bg-brand text-white' : 'text-muted-foreground'}`}>实际搜索词</button><button onClick={() => setMode('planner')} className={`rounded-lg px-4 py-2 text-sm ${mode === 'planner' ? 'bg-brand text-white' : 'text-muted-foreground'}`}>关键词规划</button></div></Card>{mode === 'planner' ? <Card className="p-5"><div className="flex gap-2"><input value={keyword} onChange={e => setKeyword(e.target.value)} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" placeholder="输入种子关键词"/><button onClick={plan} disabled={planning} className="rounded-lg bg-brand px-4 py-2 text-sm text-white">{planning ? '查询中…' : '查询规划词'}</button></div><div className="mt-5 overflow-x-auto">{!result ? <EmptyState title="输入种子词查询聚光关键词规划数据"/> : <table className="data-table w-full"><thead><tr><th>关键词</th><th>月搜索量</th><th>建议出价</th><th>竞争程度</th><th>推荐原因</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.keyword}><td className="font-medium">{row.keyword}</td><td>{integer(row.monthPv)}</td><td>{money(row.bid)}</td><td>{row.competitionLevel || '待验证'}</td><td>{row.recommendReason.join('、') || '—'}</td></tr>)}</tbody></table>}</div></Card> : loading ? <Card><EmptyState title="正在加载搜索词报表…"/></Card> : !rows.length ? <Card><EmptyState/></Card> : <Card className="overflow-hidden"><div className="border-b border-border p-5"><h3 className="font-semibold">账户真实搜索词</h3><p className="mt-1 text-xs text-muted-foreground">与关键词规划量分开呈现</p></div><div className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>日期</th><th>搜索词</th><th>计划</th><th>消耗</th><th>曝光</th><th>点击</th><th>点击率</th><th>私信开口</th><th>进线</th><th>留资</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.reportDate}-${row.entityId}-${i}`}><td>{row.reportDate}</td><td className="font-medium">{text(row.data.search_word)}</td><td>{text(row.data.campaign_name)}</td><td>{money(numberOf(row.data.fee))}</td><td>{integer(numberOf(row.data.impression))}</td><td>{integer(numberOf(row.data.click))}</td><td>{text(row.data.ctr)}</td><td>{integer(numberOf(row.data.initiative_message))}</td><td>{integer(numberOf(row.data.message_consult))}</td><td>{integer(numberOf(row.data.msg_leads_num))}</td></tr>)}</tbody></table></div></Card>}</div>;
}

function ContentReport({ rows, loading }: { rows: JuguangReportRow[]; loading: boolean }) {
  if (loading) return <Card><EmptyState title="正在加载内容报表…"/></Card>;
  if (!rows.length) return <Card><EmptyState/></Card>;
  return <Card className="overflow-hidden"><div className="border-b border-border p-5"><h3 className="font-semibold">笔记与素材效果</h3><p className="mt-1 text-xs text-muted-foreground">第一期只读分析，不在平台内编辑或启停广告</p></div><div className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>日期</th><th>笔记/素材</th><th>消耗</th><th>曝光</th><th>点击</th><th>互动</th><th>收藏</th><th>私信开口</th><th>进线</th><th>留资</th></tr></thead><tbody>{rows.map((row, i) => { const imageUrl = safeExternalUrl(row.data.note_image); const jumpUrl = safeExternalUrl(row.data.note_jump_url); return <tr key={`${row.reportDate}-${row.entityId}-${i}`}><td>{row.reportDate}</td><td><div className="flex items-center gap-2">{imageUrl ? <img src={imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover"/> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><FileTextIcon size={16}/></span>}{jumpUrl ? <a href={jumpUrl} target="_blank" rel="noreferrer" className="max-w-72 truncate font-medium text-brand">{row.entityName}</a> : <span className="max-w-72 truncate font-medium">{row.entityName}</span>}</div></td><td>{money(numberOf(row.data.fee))}</td><td>{integer(numberOf(row.data.impression))}</td><td>{integer(numberOf(row.data.click))}</td><td>{integer(numberOf(row.data.interaction))}</td><td>{integer(numberOf(row.data.collect))}</td><td>{integer(numberOf(row.data.initiative_message))}</td><td>{integer(numberOf(row.data.message_consult))}</td><td>{integer(numberOf(row.data.msg_leads_num))}</td></tr>; })}</tbody></table></div></Card>;
}

function LeadsReport({ overview, campaigns, loading }: { overview?: JuguangOverviewDto; campaigns: JuguangReportRow[]; loading: boolean }) {
  const m = overview?.metrics || {};
  const sources = overview?.leadSources || [];
  return <div className="flex flex-col gap-5"><div className="grid gap-4 md:grid-cols-4">{[
    ['私信进线', integer(m.message_consult || 0), `成本 ${money(m.message_consult_cpl || 0)}`], ['私信开口', integer(m.initiative_message || 0), `成本 ${money(m.initiative_message_cpl || 0)}`], ['私信留资', integer(m.msg_leads_num || 0), `成本 ${money(m.msg_leads_cost || 0)}`], ['平均首次响应', `${numberOf(m.message_fst_reply_time_avg).toFixed(1)}分`, `1分钟回复率 ${text(m.message_reply_in_1min_rate)}`],
  ].map(([a,b,c]) => <Card key={a} className="p-4"><div className="text-sm text-muted-foreground">{a}</div><div className="mt-2 text-2xl font-bold">{loading ? '…' : b}</div><div className="mt-2 text-xs text-muted-foreground">{c}</div></Card>)}</div><div className="grid gap-5 xl:grid-cols-[0.8fr_1.4fr]"><Card className="p-5"><div className="mb-4"><h3 className="font-semibold">留资来源</h3><p className="mt-1 text-xs text-muted-foreground">来源字段来自聚光账户报表</p></div>{sources.length ? <div className="space-y-3">{sources.map(source => <div key={source.key} className="rounded-lg border border-border p-3"><div className="flex justify-between"><span className="text-sm font-medium">{source.name}</span><strong>{integer(source.value)}</strong></div><div className="mt-2 text-xs text-muted-foreground">{source.value ? `平均成本 ${money(source.cost)}` : '当前范围无数据'}</div></div>)}</div> : <EmptyState/>}</Card><Card className="overflow-hidden"><div className="border-b border-border p-5"><h3 className="font-semibold">计划来源表现</h3><p className="mt-1 text-xs text-muted-foreground">展示聚合指标，不读取或展示私信原文和个人联系方式</p></div>{campaigns.length ? <div className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>计划</th><th>进线</th><th>开口</th><th>私信留资</th><th>表单</th><th>有效表单</th><th>企微添加</th><th>微信复制</th><th>电话拨打</th></tr></thead><tbody>{campaigns.map((row,i) => <tr key={`${row.entityId}-${i}`}><td className="font-medium">{row.entityName}</td><td>{integer(numberOf(row.data.message_consult))}</td><td>{integer(numberOf(row.data.initiative_message))}</td><td>{integer(numberOf(row.data.msg_leads_num))}</td><td>{integer(numberOf(row.data.leads))}</td><td>{integer(numberOf(row.data.valid_leads))}</td><td>{integer(numberOf(row.data.add_wechat_suc_count))}</td><td>{integer(numberOf(row.data.wechat_copy_cnt))}</td><td>{integer(numberOf(row.data.phone_call_cnt))}</td></tr>)}</tbody></table></div> : <EmptyState/>}</Card></div><Card className="border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"><InfoIcon size={14} className="mr-1 inline"/>聚光留资按广告归因时间统计；平台客户、体验卡和升单目前只按相同时间范围并列展示，不代表已经完成客户级匹配。</Card></div>;
}

function AudienceReport({ geo, audience, loading }: { geo: JuguangReportRow[]; audience: JuguangReportRow[]; loading: boolean }) {
  if (loading) return <Card><EmptyState title="正在加载地域与人群报表…"/></Card>;
  if (!geo.length && !audience.length) return <Card><EmptyState/></Card>;
  const chart = geo.slice(0, 20).map(row => ({ name: row.entityName, 进线: numberOf(row.data.message_consult), 消耗: numberOf(row.data.fee) }));
  return <div className="flex flex-col gap-5"><Card className="p-5"><div className="mb-4"><h3 className="font-semibold">城市获客表现</h3><p className="mt-1 text-xs text-muted-foreground">按省、市拆分账户报表</p></div><ResponsiveContainer width="100%" height={280}><BarChart data={chart} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis type="number"/><YAxis type="category" dataKey="name" width={80}/><Tooltip/><Bar dataKey="进线" fill="#467cf5" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></Card><div className="grid gap-5 xl:grid-cols-2"><Card className="overflow-hidden"><div className="border-b border-border p-4 font-semibold">地域明细</div><div className="max-h-[440px] overflow-auto"><table className="data-table w-full"><thead><tr><th>日期</th><th>省份</th><th>城市</th><th>消耗</th><th>进线</th><th>开口</th><th>留资</th></tr></thead><tbody>{geo.map((row,i) => <tr key={`${row.entityId}-${i}`}><td>{row.reportDate}</td><td>{text(row.data.province)}</td><td>{text(row.data.city)}</td><td>{money(numberOf(row.data.fee))}</td><td>{integer(numberOf(row.data.message_consult))}</td><td>{integer(numberOf(row.data.initiative_message))}</td><td>{integer(numberOf(row.data.msg_leads_num))}</td></tr>)}</tbody></table></div></Card><Card className="overflow-hidden"><div className="border-b border-border p-4 font-semibold">人群明细</div><div className="max-h-[440px] overflow-auto"><table className="data-table w-full"><thead><tr><th>日期</th><th>性别</th><th>年龄</th><th>设备</th><th>消耗</th><th>进线</th></tr></thead><tbody>{audience.map((row,i) => <tr key={`${row.entityId}-${i}`}><td>{row.reportDate}</td><td>{text(row.data.gender)}</td><td>{text(row.data.age)}</td><td>{text(row.data.device)}</td><td>{money(numberOf(row.data.fee))}</td><td>{integer(numberOf(row.data.message_consult))}</td></tr>)}</tbody></table></div></Card></div></div>;
}

function SyncReport() {
  const query = useJuguangSyncStatus();
  const data = query.data;
  if (query.error) return <ErrorState error={query.error}/>;
  return <div className="flex flex-col gap-5"><div className="grid gap-4 md:grid-cols-3"><Card className="p-5"><div className="text-sm text-muted-foreground">授权账户</div><div className="mt-2 text-xl font-bold">{data?.advertiserId || '—'}</div><div className="mt-2"><Badge tone={data?.authorized ? 'green' : 'red'}>{data?.authorized ? '授权正常' : '需要处理授权'}</Badge></div></Card><Card className="p-5"><div className="text-sm text-muted-foreground">账户名称</div><div className="mt-2 text-xl font-bold">{data?.advertiserName || '—'}</div><div className="mt-2 text-xs text-muted-foreground">令牌内容不会在页面展示</div></Card><Card className="p-5"><div className="text-sm text-muted-foreground">同步状态</div><div className="mt-2 text-xl font-bold">{data?.running ? '同步中' : '空闲'}</div><div className="mt-2 text-xs text-muted-foreground">00:10增量 · 10:15结算回补</div></Card></div>{data?.tokenError && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{data.tokenError}</Card>}<Card className="overflow-hidden"><div className="border-b border-border p-5"><h3 className="font-semibold">同步记录</h3><p className="mt-1 text-xs text-muted-foreground">仅保留批次、结果和请求错误，不保存明文令牌</p></div>{data?.jobs.length ? <div className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>开始时间</th><th>触发方式</th><th>数据区间</th><th>成功报表</th><th>写入行数</th><th>数据状态</th><th>任务结果</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td>{job.startedAt}</td><td>{job.triggerType}</td><td>{job.startDate} 至 {job.endDate}</td><td>{job.reportsSucceeded}/{job.reportsTotal}</td><td>{job.rowsWritten}</td><td><Badge tone={job.dataStatus === 'settled' ? 'green' : 'amber'}>{job.dataStatus === 'settled' ? '已结算' : '暂定'}</Badge></td><td><Badge tone={job.status === 'success' ? 'green' : job.status === 'partial' ? 'amber' : 'red'}>{job.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="尚无同步任务记录"/>}</Card></div>;
}

export default function JuguangPage() {
  const { activePage, currentUser } = useApp();
  const page = PAGE_KIND[activePage] || 'overview';
  const [preset, setPreset] = useState<DatePreset>('yesterday');
  const initial = useMemo(() => presetRange('yesterday'), []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const canManualSync = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  function selectPreset(value: DatePreset) {
    setPreset(value);
    if (value !== 'custom') { const range = presetRange(value); setStartDate(range.startDate); setEndDate(range.endDate); }
  }

  const overviewQ = useJuguangOverview(startDate, endDate, page === 'overview' || page === 'leads');
  const campaignQ = useJuguangReport('campaign', startDate, endDate, page === 'delivery' || page === 'leads');
  const easyCampaignQ = useJuguangReport('easy_campaign', startDate, endDate, page === 'delivery');
  const searchQ = useJuguangReport('search_word', startDate, endDate, page === 'search');
  const noteQ = useJuguangReport('note', startDate, endDate, page === 'content');
  const geoQ = useJuguangReport('geo', startDate, endDate, page === 'audience');
  const audienceQ = useJuguangReport('audience', startDate, endDate, page === 'audience');

  useEffect(() => {
    if (page === 'sync') return;
    void juguangApi.refreshOnOpen(startDate, endDate).then(result => {
      if (result.accepted) window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['juguang'] }), 2500);
    }).catch(() => undefined);
  }, [activePage, startDate, endDate, page, queryClient]);

  async function manualRefresh() {
    try {
      setRefreshing(true);
      await juguangApi.manualSync(startDate, endDate);
      await queryClient.invalidateQueries({ queryKey: ['juguang'] });
      [5_000, 30_000, 90_000].forEach(delay => window.setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: ['juguang'] }),
        delay,
      ));
      toast.success('聚光数据同步任务已开始，完成后页面会自动更新');
    } catch (error) {
      toast.error((error as {message?: string})?.message || '同步失败');
    } finally { setRefreshing(false); }
  }

  const visibleRows = page === 'delivery'
    ? [...(campaignQ.data || []), ...(easyCampaignQ.data || [])]
    : page === 'search'
      ? searchQ.data || []
      : page === 'content'
        ? noteQ.data || []
        : page === 'audience'
          ? [...(geoQ.data || []), ...(audienceQ.data || [])]
          : [];
  const currentDataStatus = page === 'overview' || page === 'leads'
    ? overviewQ.data?.dataStatus || 'empty'
    : visibleRows.length === 0
      ? 'empty'
      : visibleRows.every(row => row.dataStatus === 'settled')
        ? 'settled'
        : 'provisional';
  const currentLastSyncedAt = page === 'overview' || page === 'leads'
    ? overviewQ.data?.lastSyncedAt
    : visibleRows.map(row => row.syncedAt).filter(Boolean).sort().at(-1) || null;
  const primaryError = overviewQ.error || campaignQ.error || searchQ.error || noteQ.error || geoQ.error || audienceQ.error;
  return <div data-cmp="JuguangPage" className="flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-bold">{PAGE_TITLES[page]}</h2><Badge tone="red">账户 7890257</Badge></div><p className="mt-1 text-sm text-muted-foreground">{PAGE_DESCRIPTIONS[page]}</p></div>{page !== 'sync' && <div className="text-xs text-muted-foreground">{currentLastSyncedAt ? `最近同步：${currentLastSyncedAt}` : '尚未同步当前时间范围'}</div>}</div>
    {page !== 'sync' && <Card className="flex flex-wrap items-center gap-2 p-3"><label className="relative"><span className="sr-only">选择统计时间</span><select value={preset} onChange={e => selectPreset(e.target.value as DatePreset)} className="min-w-32 appearance-none rounded-lg border border-border bg-card py-2 pl-3 pr-9 text-sm"><option value="today">当天</option><option value="yesterday">前一天</option><option value="week">近7天</option><option value="month">近1个月</option><option value="lastMonth">上个月</option><option value="year">今年</option><option value="custom">自定义时间</option></select><ChevronDownIcon size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"/></label>{preset === 'custom' && <><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm"/><span className="text-muted-foreground">至</span><input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm"/></>}<div className="ml-auto flex items-center gap-2"><Badge tone={currentDataStatus === 'settled' ? 'green' : currentDataStatus === 'provisional' ? 'amber' : 'gray'}>{currentDataStatus === 'settled' ? '已结算' : currentDataStatus === 'provisional' ? '暂定数据' : '待同步'}</Badge>{canManualSync && <button onClick={manualRefresh} disabled={refreshing} className="flex items-center gap-2 rounded-lg bg-[#ff385d] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCwIcon size={15} className={refreshing ? 'animate-spin' : ''}/>{refreshing ? '同步中…' : '手动刷新'}</button>}</div></Card>}
    {primaryError && page !== 'sync' ? <ErrorState error={primaryError}/> : page === 'overview' ? <Overview data={overviewQ.data} loading={overviewQ.isLoading}/> : page === 'delivery' ? <Delivery standard={campaignQ.data || []} easy={easyCampaignQ.data || []} loading={campaignQ.isLoading || easyCampaignQ.isLoading}/> : page === 'search' ? <SearchReport rows={searchQ.data || []} loading={searchQ.isLoading}/> : page === 'content' ? <ContentReport rows={noteQ.data || []} loading={noteQ.isLoading}/> : page === 'leads' ? <LeadsReport overview={overviewQ.data} campaigns={campaignQ.data || []} loading={overviewQ.isLoading || campaignQ.isLoading}/> : page === 'audience' ? <AudienceReport geo={geoQ.data || []} audience={audienceQ.data || []} loading={geoQ.isLoading || audienceQ.isLoading}/> : <SyncReport/>}
    {page !== 'sync' && <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><InfoIcon size={13}/>页面只展示已同步的真实聚光报表；缺失字段显示为“—”或0，不使用示例数据补齐。</div>}
  </div>;
}
