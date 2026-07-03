import { useState } from 'react';
import {
  UserPlusIcon, EditIcon, Trash2Icon, ShieldIcon, ShieldCheckIcon,
  BellIcon, WifiIcon, PhoneIcon, CheckIcon, XIcon, PlusIcon,
  LockIcon, UnlockIcon, EyeIcon, EyeOffIcon, SaveIcon, UserIcon,
  ChevronDownIcon, AlertCircleIcon, BadgeCheckIcon
} from 'lucide-react';
import type { Role } from '../data/mockData';
import { useApp } from '../hooks/useApp';

// ──────────────────────────────────────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────────────────────────────────────

type SystemRole = 'superadmin' | 'admin' | 'sales';

interface SystemUser {
  id: string;
  name: string;
  username: string;
  password: string;
  role: SystemRole;
  phone: string;
  wechat: string;
  status: 'active' | 'disabled';
  createdAt: string;
  avatar: string;
  permissions: PermissionKey[];
}

type PermissionKey =
  | 'dashboard'
  | 'customers-list' | 'customers-pool'
  | 'orders-list' | 'orders-contracts'
  | 'therapists-list'
  | 'appointments-calendar' | 'appointments-list'
  | 'services-records' | 'services-change'
  | 'finance-salary' | 'finance-income'
  | 'settings';

interface PermissionGroup {
  key: string;
  label: string;
  color: string;
  items: { key: PermissionKey; label: string }[];
}

interface NotifyConfig {
  userId: string;
  enablePush: boolean;
  phone: string;
  wechat: string;
  bindPhone: boolean;
  bindWechat: boolean;
  events: {
    newOrder: boolean;
    newAppointment: boolean;
    cancelAppointment: boolean;
    salarySettle: boolean;
    customerFollow: boolean;
    contractSign: boolean;
    systemAlert: boolean;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────────────────────────────────────

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'basic', label: '基础功能', color: 'bg-brand/10 text-brand',
    items: [{ key: 'dashboard', label: '首页看板' }],
  },
  {
    key: 'customer', label: '客户管理', color: 'bg-green-100 text-green-700',
    items: [
      { key: 'customers-list', label: '客户列表' },
      { key: 'customers-pool', label: '客户公海' },
      { key: 'orders-list', label: '订单列表' },
      { key: 'orders-contracts', label: '数据报表' },
    ],
  },
  {
    key: 'service', label: '服务管理', color: 'bg-purple-100 text-purple-700',
    items: [
      { key: 'therapists-list', label: '技师档案' },
      { key: 'appointments-calendar', label: '排期管理' },
      { key: 'appointments-list', label: '预约列表' },
      { key: 'services-records', label: '服务记录' },
      { key: 'services-change', label: '服务进度' },
    ],
  },
  {
    key: 'finance', label: '财务结算', color: 'bg-orange-100 text-orange-700',
    items: [
      { key: 'finance-salary', label: '工资结算' },
      { key: 'finance-income', label: '收支管理' },
    ],
  },
  {
    key: 'system', label: '系统设置', color: 'bg-rose-100 text-rose-700',
    items: [{ key: 'settings', label: '系统设置' }],
  },
];

const ALL_PERMS: PermissionKey[] = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

const ROLE_DEFAULT_PERMS: Record<SystemRole, PermissionKey[]> = {
  superadmin: [...ALL_PERMS],
  admin: [...ALL_PERMS],
  sales: ['dashboard', 'customers-list', 'customers-pool', 'orders-list', 'orders-contracts',
    'therapists-list', 'appointments-calendar', 'appointments-list', 'services-records', 'services-change'],
};

const ROLE_LABELS: Record<SystemRole, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  sales: '销售顾问',
};

const ROLE_COLORS: Record<SystemRole, string> = {
  superadmin: 'bg-rose-100 text-rose-700 border-rose-200',
  admin: 'bg-brand/10 text-brand border-brand/20',
  sales: 'bg-green-100 text-green-700 border-green-200',
};

const ROLE_ICONS: Record<SystemRole, React.ReactNode> = {
  superadmin: <ShieldCheckIcon size={13} />,
  admin: <ShieldIcon size={13} />,
  sales: <UserIcon size={13} />,
};

const EVENT_LABELS: Record<string, string> = {
  newOrder: '新订单提醒',
  newAppointment: '新预约提醒',
  cancelAppointment: '取消预约提醒',
  salarySettle: '薪资结算提醒',
  customerFollow: '客户跟进提醒',
  contractSign: '合同签署提醒',
  systemAlert: '系统告警提醒',
};

let _uid = 100;
function uid() { return String(++_uid); }

// ──────────────────────────────────────────────────────────────────────────────
// 初始数据
// ──────────────────────────────────────────────────────────────────────────────

const INIT_USERS: SystemUser[] = [
  {
    id: 'u1', name: '陈思思', username: 'admin_chen', password: '123456',
    role: 'superadmin', phone: '18800001111', wechat: 'chen_sisi_admin',
    status: 'active', createdAt: '2024-01-01', avatar: '陈',
    permissions: [...ALL_PERMS],
  },
  {
    id: 'u2', name: '张雅君', username: 'admin_zhang', password: '123456',
    role: 'admin', phone: '18800002222', wechat: 'zhang_yajun',
    status: 'active', createdAt: '2024-02-15', avatar: '张',
    permissions: [...ALL_PERMS],
  },
  {
    id: 'u3', name: '王美玲', username: 'sales_wang', password: '123456',
    role: 'sales', phone: '18800003333', wechat: 'wang_meiling',
    status: 'active', createdAt: '2024-03-10', avatar: '王',
    permissions: [...ROLE_DEFAULT_PERMS.sales],
  },
  {
    id: 'u4', name: '林佳怡', username: 'sales_lin', password: '123456',
    role: 'sales', phone: '18800004444', wechat: 'lin_jiayi',
    status: 'disabled', createdAt: '2024-04-20', avatar: '林',
    permissions: [...ROLE_DEFAULT_PERMS.sales],
  },
  {
    id: 'u5', name: '黄晓燕', username: 'admin_huang', password: '123456',
    role: 'admin', phone: '18800005555', wechat: 'huang_xiaoyan',
    status: 'active', createdAt: '2024-05-01', avatar: '黄',
    permissions: [...ALL_PERMS],
  },
];

const INIT_NOTIFY: NotifyConfig[] = INIT_USERS.map(u => ({
  userId: u.id,
  enablePush: u.status === 'active',
  phone: u.phone,
  wechat: u.wechat,
  bindPhone: true,
  bindWechat: u.role !== 'sales',
  events: {
    newOrder: true,
    newAppointment: true,
    cancelAppointment: u.role !== 'sales',
    salarySettle: u.role === 'superadmin' || u.role === 'admin',
    customerFollow: true,
    contractSign: true,
    systemAlert: u.role === 'superadmin',
  },
}));

// ──────────────────────────────────────────────────────────────────────────────
// 空表单
// ──────────────────────────────────────────────────────────────────────────────

const emptyForm = (): Omit<SystemUser, 'id' | 'createdAt' | 'avatar'> => ({
  name: '', username: '', password: '',
  role: 'sales', phone: '', wechat: '',
  status: 'active',
  permissions: [...ROLE_DEFAULT_PERMS.sales],
});

// ──────────────────────────────────────────────────────────────────────────────
// 小组件
// ──────────────────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: SystemRole }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[role]}`}>
      {ROLE_ICONS[role]}{ROLE_LABELS[role]}
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-border'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────────────────────────────────────

export default function SystemSettingsPage() {
  const { currentUser } = useApp();
  const isSuperAdmin = (currentUser.role as string) === 'superadmin';

  const [activeTab, setActiveTab] = useState<'accounts' | 'notify'>('accounts');
  const [users, setUsers] = useState<SystemUser[]>(INIT_USERS);
  const [notifyConfigs, setNotifyConfigs] = useState<NotifyConfig[]>(INIT_NOTIFY);

  // 弹窗状态
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SystemUser, 'id' | 'createdAt' | 'avatar'>>(emptyForm());
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPermModal, setShowPermModal] = useState(false);
  const [permUserId, setPermUserId] = useState<string | null>(null);
  const [permDraft, setPermDraft] = useState<PermissionKey[]>([]);

  // 搜索 / 筛选
  const [searchText, setSearchText] = useState('');
  const [filterRole, setFilterRole] = useState<SystemRole | '__all__'>('__all__');

  // ── 账号操作 ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowPassword(false);
    setShowModal(true);
  }

  function openEdit(u: SystemUser) {
    setEditingId(u.id);
    setForm({ name: u.name, username: u.username, password: u.password, role: u.role, phone: u.phone, wechat: u.wechat, status: u.status, permissions: [...u.permissions] });
    setShowPassword(false);
    setShowModal(true);
  }

  function handleFormRoleChange(r: SystemRole) {
    setForm(prev => ({ ...prev, role: r, permissions: [...ROLE_DEFAULT_PERMS[r]] }));
  }

  function saveForm() {
    if (!form.name.trim() || !form.username.trim()) return;
    if (editingId) {
      setUsers(prev => prev.map(u => u.id === editingId
        ? { ...u, ...form }
        : u
      ));
    } else {
      const newUser: SystemUser = {
        id: uid(),
        ...form,
        avatar: form.name[0] ?? '?',
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setUsers(prev => [...prev, newUser]);
      setNotifyConfigs(prev => [...prev, {
        userId: newUser.id,
        enablePush: true,
        phone: newUser.phone,
        wechat: newUser.wechat,
        bindPhone: false, bindWechat: false,
        events: { newOrder: true, newAppointment: true, cancelAppointment: false, salarySettle: false, customerFollow: true, contractSign: false, systemAlert: false },
      }]);
    }
    setShowModal(false);
  }

  function deleteUser(id: string) {
    setUsers(prev => prev.filter(u => u.id !== id));
    setNotifyConfigs(prev => prev.filter(c => c.userId !== id));
    setDeleteConfirmId(null);
  }

  function toggleStatus(id: string) {
    setUsers(prev => prev.map(u =>
      u.id === id ? { ...u, status: u.status === 'active' ? 'disabled' : 'active' } : u
    ));
  }

  // ── 权限编辑 ──────────────────────────────────────────────────────────────

  function openPermEdit(u: SystemUser) {
    setPermUserId(u.id);
    setPermDraft([...u.permissions]);
    setShowPermModal(true);
  }

  function togglePerm(k: PermissionKey) {
    setPermDraft(prev => prev.includes(k) ? prev.filter(p => p !== k) : [...prev, k]);
  }

  function savePerms() {
    if (!permUserId) return;
    setUsers(prev => prev.map(u => u.id === permUserId ? { ...u, permissions: [...permDraft] } : u));
    setShowPermModal(false);
  }

  // ── 通知设置 ──────────────────────────────────────────────────────────────

  function updateNotify(userId: string, patch: Partial<NotifyConfig>) {
    setNotifyConfigs(prev => prev.map(c => c.userId === userId ? { ...c, ...patch } : c));
  }

  function updateNotifyEvent(userId: string, eventKey: string, val: boolean) {
    setNotifyConfigs(prev => prev.map(c =>
      c.userId === userId
        ? { ...c, events: { ...c.events, [eventKey]: val } }
        : c
    ));
  }

  // ── 过滤 ─────────────────────────────────────────────────────────────────

  const filteredUsers = users.filter(u => {
    const matchSearch = !searchText || u.name.includes(searchText) || u.username.includes(searchText) || u.phone.includes(searchText);
    const matchRole = filterRole === '__all__' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const canDeleteUser = (target: SystemUser) => {
    if (!isSuperAdmin) return false;
    if (target.role === 'superadmin') return false; // 不能删除超管
    return true;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 渲染
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div data-cmp="SystemSettingsPage" className="flex flex-col gap-5">

      {/* 标签页切换 */}
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 self-start">
        {[
          { key: 'accounts', label: '账号与权限', icon: <ShieldIcon size={14} /> },
          { key: 'notify', label: '通知设置', icon: <BellIcon size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'accounts' | 'notify')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-card text-foreground shadow-custom'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════ 账号与权限 ════════════════════════════ */}
      <div className={activeTab === 'accounts' ? 'flex flex-col gap-4' : 'hidden'}>

        {/* 权限说明卡片 */}
        <div className="bg-brand/5 border border-brand/20 rounded-xl px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon size={16} className="text-brand" />
            <span className="font-semibold text-foreground text-sm">角色权限说明</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {[
              { role: 'superadmin' as SystemRole, desc: '拥有全部权限，可新增/编辑/删除任意账号（包括管理员），不可被删除' },
              { role: 'admin' as SystemRole, desc: '拥有全部页面权限，可管理销售顾问账号，不可删除其他管理员' },
              { role: 'sales' as SystemRole, desc: '默认拥有客户管理和服务管理权限，可按需定制' },
            ].map(({ role, desc }) => (
              <div key={role} className="flex-1 min-w-[200px] bg-card rounded-lg px-3 py-2.5 border border-border flex flex-col gap-1.5">
                <RoleBadge role={role} />
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索姓名 / 账号 / 手机号"
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-brand/30 w-52"
          />
          <div className="relative">
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value as SystemRole | '__all__')}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-card text-foreground outline-none focus:ring-2 focus:ring-brand/30 appearance-none pr-7 cursor-pointer"
            >
              <option value="__all__">全部角色</option>
              <option value="superadmin">超级管理员</option>
              <option value="admin">管理员</option>
              <option value="sales">销售顾问</option>
            </select>
            <ChevronDownIcon size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="flex-1" />
          {isSuperAdmin && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors shadow-custom"
            >
              <UserPlusIcon size={14} />新增账号
            </button>
          )}
        </div>

        {/* 账号列表 */}
        <div className="bg-card border border-border rounded-xl shadow-custom overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand/5 border-b border-border">
                {['姓名', '账号', '角色', '手机号', '微信号', '状态', '创建时间', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">暂无账号数据</td>
                </tr>
              )}
              {filteredUsers.map(u => (
                <tr key={u.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                        u.role === 'superadmin' ? 'bg-rose-500' : u.role === 'admin' ? 'bg-brand' : 'bg-green-500'
                      }`}>
                        {u.avatar}
                      </div>
                      <span className="font-medium text-foreground">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{u.username}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{u.phone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.wechat || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      u.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-success' : 'bg-muted-foreground'}`} />
                      {u.status === 'active' ? '正常' : '已禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{u.createdAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {/* 编辑 */}
                      {(isSuperAdmin || (currentUser.role === 'admin' && u.role === 'sales')) && (
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded hover:bg-brand/10 text-brand transition-colors"
                          title="编辑账号"
                        >
                          <EditIcon size={13} />
                        </button>
                      )}
                      {/* 权限 */}
                      {(isSuperAdmin || (currentUser.role === 'admin' && u.role === 'sales')) && (
                        <button
                          onClick={() => openPermEdit(u)}
                          className="p-1.5 rounded hover:bg-purple-500/10 text-purple-500 transition-colors"
                          title="配置权限"
                        >
                          <LockIcon size={13} />
                        </button>
                      )}
                      {/* 启用/禁用 */}
                      {isSuperAdmin && u.role !== 'superadmin' && (
                        <button
                          onClick={() => toggleStatus(u.id)}
                          className={`p-1.5 rounded transition-colors ${
                            u.status === 'active'
                              ? 'hover:bg-warning/10 text-warning'
                              : 'hover:bg-success/10 text-success'
                          }`}
                          title={u.status === 'active' ? '禁用账号' : '启用账号'}
                        >
                          {u.status === 'active' ? <UnlockIcon size={13} /> : <LockIcon size={13} />}
                        </button>
                      )}
                      {/* 删除 */}
                      {canDeleteUser(u) && (
                        <button
                          onClick={() => setDeleteConfirmId(u.id)}
                          className="p-1.5 rounded hover:bg-danger/10 text-danger transition-colors"
                          title="删除账号"
                        >
                          <Trash2Icon size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════════════════════ 通知设置 ════════════════════════════ */}
      <div className={activeTab === 'notify' ? 'flex flex-col gap-4' : 'hidden'}>
        <div className="bg-warning/5 border border-warning/20 rounded-xl px-5 py-3 flex items-center gap-2 text-sm">
          <AlertCircleIcon size={15} className="text-warning flex-shrink-0" />
          <span className="text-foreground/80">绑定手机号或微信后，系统会通过对应渠道推送消息通知。微信推送需扫码关注服务号完成绑定。</span>
        </div>

        <div className="flex flex-col gap-3">
          {users.map(u => {
            const cfg = notifyConfigs.find(c => c.userId === u.id);
            if (!cfg) return null;
            return (
              <div key={u.id} className="bg-card border border-border rounded-xl shadow-custom overflow-hidden">
                {/* 用户头部 */}
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-muted/20">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
                    u.role === 'superadmin' ? 'bg-rose-500' : u.role === 'admin' ? 'bg-brand' : 'bg-green-500'
                  }`}>
                    {u.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{u.name}</span>
                      <RoleBadge role={u.role} />
                      {u.status === 'disabled' && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">已禁用</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{u.username}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">消息推送</span>
                    <Toggle checked={cfg.enablePush} onChange={v => updateNotify(u.id, { enablePush: v })} />
                  </div>
                </div>

                <div className={cfg.enablePush ? '' : 'opacity-40 pointer-events-none'}>
                  <div className="px-5 py-4 flex flex-col gap-4">
                    {/* 绑定渠道 */}
                    <div className="flex flex-wrap gap-4">
                      {/* 手机号 */}
                      <div className="flex-1 min-w-[220px] flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          <PhoneIcon size={12} />手机推送
                          {cfg.bindPhone && <BadgeCheckIcon size={12} className="text-success" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={cfg.phone}
                            onChange={e => updateNotify(u.id, { phone: e.target.value })}
                            placeholder="输入手机号"
                            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                          />
                          <button
                            onClick={() => updateNotify(u.id, { bindPhone: !cfg.bindPhone })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              cfg.bindPhone
                                ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                                : 'bg-brand/10 text-brand border-brand/20 hover:bg-brand/20'
                            }`}
                          >
                            {cfg.bindPhone ? <><CheckIcon size={11} className="inline mr-1" />已绑定</> : '绑定'}
                          </button>
                        </div>
                      </div>
                      {/* 微信 */}
                      <div className="flex-1 min-w-[220px] flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          <WifiIcon size={12} />微信推送
                          {cfg.bindWechat && <BadgeCheckIcon size={12} className="text-success" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={cfg.wechat}
                            onChange={e => updateNotify(u.id, { wechat: e.target.value })}
                            placeholder="输入微信号"
                            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                          />
                          <button
                            onClick={() => updateNotify(u.id, { bindWechat: !cfg.bindWechat })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              cfg.bindWechat
                                ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                                : 'bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20'
                            }`}
                          >
                            {cfg.bindWechat ? <><CheckIcon size={11} className="inline mr-1" />已绑定</> : '扫码绑定'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 推送事件 */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">接收推送类型</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(EVENT_LABELS).map(([ek, el]) => {
                          const on = cfg.events[ek as keyof typeof cfg.events];
                          return (
                            <button
                              key={ek}
                              onClick={() => updateNotifyEvent(u.id, ek, !on)}
                              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                on
                                  ? 'bg-brand/10 text-brand border-brand/30'
                                  : 'bg-muted text-muted-foreground border-border hover:border-brand/30 hover:text-brand'
                              }`}
                            >
                              {on && <CheckIcon size={10} />}
                              {el}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════ 新增/编辑账号弹窗 ════════════════ */}
      <div className={showModal ? 'fixed inset-0 z-50 flex items-center justify-center' : 'hidden'}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
        <div className="relative bg-card rounded-2xl shadow-custom border border-border w-[480px] max-h-[90vh] overflow-y-auto mx-4 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="font-bold text-foreground text-base">{editingId ? '编辑账号' : '新增账号'}</h3>
            <button onClick={() => setShowModal(false)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground">
              <XIcon size={16} />
            </button>
          </div>
          <div className="px-6 py-5 flex flex-col gap-4">
            {/* 基本信息 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">姓名 *</label>
              <input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="请输入真实姓名"
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">登录账号 *</label>
              <input
                value={form.username}
                onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="字母/数字/下划线"
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={editingId ? '不修改请留空' : '设置登录密码'}
                  className="w-full border border-border rounded-lg px-3 py-2 pr-9 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                </button>
              </div>
            </div>
            {/* 角色 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">角色</label>
              <div className="flex gap-2">
                {(isSuperAdmin ? ['superadmin', 'admin', 'sales'] : ['sales']).map(r => (
                  <button
                    key={r}
                    onClick={() => handleFormRoleChange(r as SystemRole)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      form.role === r
                        ? 'bg-brand text-white border-brand'
                        : 'border-border text-muted-foreground hover:border-brand/40'
                    }`}
                  >
                    {ROLE_LABELS[r as SystemRole]}
                  </button>
                ))}
              </div>
            </div>
            {/* 联系方式 */}
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">手机号</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="11位手机号"
                  className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">微信号</label>
                <input
                  value={form.wechat}
                  onChange={e => setForm(prev => ({ ...prev, wechat: e.target.value }))}
                  placeholder="微信号（可选）"
                  className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>
            {/* 状态 */}
            <div className="flex items-center justify-between py-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">账号状态</p>
                <p className="text-xs text-muted-foreground">禁用后该账号无法登录系统</p>
              </div>
              <Toggle checked={form.status === 'active'} onChange={v => setForm(prev => ({ ...prev, status: v ? 'active' : 'disabled' }))} />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors">
              取消
            </button>
            <button
              onClick={saveForm}
              disabled={!form.name.trim() || !form.username.trim()}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <SaveIcon size={13} />{editingId ? '保存修改' : '创建账号'}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════ 权限配置弹窗 ════════════════ */}
      <div className={showPermModal ? 'fixed inset-0 z-50 flex items-center justify-center' : 'hidden'}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowPermModal(false)} />
        <div className="relative bg-card rounded-2xl shadow-custom border border-border w-[520px] max-h-[90vh] overflow-y-auto mx-4 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <LockIcon size={16} className="text-purple-500" />
              <h3 className="font-bold text-foreground text-base">配置页面权限</h3>
              {permUserId && (() => {
                const u = users.find(x => x.id === permUserId);
                return u ? <RoleBadge role={u.role} /> : null;
              })()}
            </div>
            <button onClick={() => setShowPermModal(false)} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground">
              <XIcon size={16} />
            </button>
          </div>
          <div className="px-6 py-5 flex flex-col gap-4">
            {/* 快捷按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPermDraft([...ALL_PERMS])}
                className="text-xs px-2.5 py-1 bg-brand/10 text-brand rounded-lg hover:bg-brand/20 transition-colors"
              >全选</button>
              <button
                onClick={() => setPermDraft([])}
                className="text-xs px-2.5 py-1 bg-muted text-muted-foreground rounded-lg hover:bg-accent transition-colors"
              >清空</button>
              <button
                onClick={() => {
                  const u = users.find(x => x.id === permUserId);
                  if (u) setPermDraft([...ROLE_DEFAULT_PERMS[u.role]]);
                }}
                className="text-xs px-2.5 py-1 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 transition-colors"
              >恢复默认</button>
              <span className="ml-auto text-xs text-muted-foreground">已选 {permDraft.length} / {ALL_PERMS.length} 项</span>
            </div>
            {PERMISSION_GROUPS.map(group => (
              <div key={group.key} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${group.color}`}>{group.label}</span>
                  <div className="flex-1 h-px bg-border" />
                  <button
                    onClick={() => {
                      const groupKeys = group.items.map(i => i.key);
                      const allOn = groupKeys.every(k => permDraft.includes(k));
                      if (allOn) {
                        setPermDraft(prev => prev.filter(k => !groupKeys.includes(k)));
                      } else {
                        setPermDraft(prev => [...new Set([...prev, ...groupKeys])]);
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {group.items.every(i => permDraft.includes(i.key)) ? '取消全组' : '全选此组'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pl-1">
                  {group.items.map(item => {
                    const on = permDraft.includes(item.key);
                    return (
                      <button
                        key={item.key}
                        onClick={() => togglePerm(item.key)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          on
                            ? 'bg-brand text-white border-brand'
                            : 'bg-card text-muted-foreground border-border hover:border-brand/40 hover:text-foreground'
                        }`}
                      >
                        {on && <CheckIcon size={10} />}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
            <button onClick={() => setShowPermModal(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors">取消</button>
            <button
              onClick={savePerms}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors flex items-center gap-1.5"
            >
              <SaveIcon size={13} />保存权限
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════ 删除确认弹窗 ════════════════ */}
      <div className={deleteConfirmId ? 'fixed inset-0 z-50 flex items-center justify-center' : 'hidden'}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirmId(null)} />
        <div className="relative bg-card rounded-2xl shadow-custom border border-border w-[360px] mx-4 flex flex-col">
          <div className="px-6 py-5 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
              <Trash2Icon size={22} className="text-danger" />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground text-base">确认删除账号？</p>
              {deleteConfirmId && (() => {
                const u = users.find(x => x.id === deleteConfirmId);
                return u ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    将永久删除账号 <span className="font-semibold text-foreground">「{u.name}」</span>，此操作不可撤销。
                  </p>
                ) : null;
              })()}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex items-center gap-2">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
            >取消</button>
            <button
              onClick={() => deleteConfirmId && deleteUser(deleteConfirmId)}
              className="flex-1 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition-colors"
            >确认删除</button>
          </div>
        </div>
      </div>

    </div>
  );
}
