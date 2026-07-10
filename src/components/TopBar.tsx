import { useState, useRef, useEffect } from 'react';
import {
  BellIcon, RefreshCwIcon, ChevronDownIcon,
  UserIcon, KeyIcon, LogOutIcon, ShieldIcon,
  WalletIcon, HeadphonesIcon, UserCheckIcon,
} from 'lucide-react';
import { useApp } from '../hooks/useApp';
import type { UserInfo } from '../api/endpoints';

const PAGE_TITLES: Record<string, string> = {
  dashboard: '首页经营看板',
  'customers-list': '客户列表',
  'customers-pool': '待预约池',
  'orders-list': '订单列表',
  'orders-contracts': '数据报表',
  'appointments-calendar': '排期日历',
  'appointments-list': '预约列表',
  'therapists-list': '技师档案',
  'finance-salary': '工资结算',
  'finance-income': '收支管理',
  'finance-profit': '利润分析',
  'settings-basic': '基本设置',
  'settings-notify': '通知设置',
};

const BREADCRUMBS: Record<string, string[]> = {
  dashboard: ['首页看板'],
  'customers-list': ['客户管理', '客户列表'],
  'customers-pool': ['客户管理', '待预约池'],
  'orders-list': ['客户管理', '订单列表'],
  'orders-contracts': ['客户管理', '数据报表'],
  'appointments-calendar': ['服务管理', '排期日历'],
  'appointments-list': ['服务管理', '预约列表'],
  'therapists-list': ['服务管理', '技师档案'],
  'finance-salary': ['财务结算', '工资结算'],
  'finance-income': ['财务结算', '收支管理'],
  'finance-profit': ['财务结算', '利润分析'],
  'settings-basic': ['系统设置', '基本设置'],
  'settings-notify': ['系统设置', '通知设置'],
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  service: '客服',
  therapist: '产康师',
  finance: '财务',
};

const ROLE_ICONS: Record<string, typeof UserIcon> = {
  superadmin: ShieldIcon,
  admin: UserIcon,
  service: HeadphonesIcon,
  therapist: UserCheckIcon,
  finance: WalletIcon,
};

// 个人信息弹窗
function ProfileModal({
  open,
  onClose,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: UserInfo;
}) {
  const [tab, setTab] = useState<'info' | 'password'>('info');
  const [name, setName] = useState(currentUser.name);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saved, setSaved] = useState(false);

  function handleSaveName() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  function handleSavePwd() {
    setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className={open ? 'block' : 'hidden'}>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />
      {/* Modal */}
      <div
        className="fixed z-50 rounded-xl shadow-custom"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 420,
          background: 'var(--card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-base font-bold text-foreground">个人账户</span>
          <button
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
            onClick={onClose}
          >✕</button>
        </div>

        {/* Avatar + basic */}
        <div className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            {currentUser.avatar}
          </div>
          <div>
            <div className="text-foreground font-bold text-base">{currentUser.name}</div>
            <div className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {ROLE_LABELS[currentUser.role] ?? currentUser.role}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              ID: {currentUser.id}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            className="pb-3 text-sm font-medium transition-colors"
            style={{
              borderBottom: tab === 'info' ? '2px solid var(--brand)' : '2px solid transparent',
              color: tab === 'info' ? 'var(--brand)' : 'var(--muted-foreground)',
            }}
            onClick={() => setTab('info')}
          >修改账号名称</button>
          <button
            className="pb-3 text-sm font-medium transition-colors"
            style={{
              borderBottom: tab === 'password' ? '2px solid var(--brand)' : '2px solid transparent',
              color: tab === 'password' ? 'var(--brand)' : 'var(--muted-foreground)',
            }}
            onClick={() => setTab('password')}
          >修改密码</button>
        </div>

        {/* Tab content */}
        <div className="px-6 py-5">
          {tab === 'info' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">账号名称</label>
                <input
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                  }}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="请输入新的账号名称"
                />
              </div>
              {saved && (
                <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(76,175,80,0.1)', color: 'var(--success)' }}>
                  保存成功！
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
                  style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  onClick={onClose}
                >取消</button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--brand)' }}
                  onClick={handleSaveName}
                >保存修改</button>
              </div>
            </div>
          )}
          {tab === 'password' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">当前密码</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--foreground)' }}
                  value={oldPwd}
                  onChange={e => setOldPwd(e.target.value)}
                  placeholder="请输入当前密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">新密码</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--foreground)' }}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="请输入新密码（至少6位）"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">确认新密码</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--foreground)' }}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="请再次输入新密码"
                />
              </div>
              {saved && (
                <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(76,175,80,0.1)', color: 'var(--success)' }}>
                  密码修改成功！
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
                  style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  onClick={onClose}
                >取消</button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--brand)' }}
                  onClick={handleSavePwd}
                >确认修改</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TopBar() {
  const { activePage, notifications, currentUser, setCurrentUser, setActivePage, logout } = useApp();
  const title = PAGE_TITLES[activePage] ?? '产康管理系统';
  const crumbs = BREADCRUMBS[activePage] ?? [title];
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const [showDropdown, setShowDropdown] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRoleSwitch, setShowRoleSwitch] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowRoleSwitch(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const RoleIcon = ROLE_ICONS[currentUser.role] ?? UserIcon;
  const roleLabel = ROLE_LABELS[currentUser.role] ?? currentUser.role;

  function handleSwitchUser(u: UserInfo) {
    setCurrentUser(u);
    setShowDropdown(false);
    setShowRoleSwitch(false);
    setActivePage('dashboard');
  }

  return (
    <header
      data-cmp="TopBar"
      className="flex items-center px-6 gap-4 bg-card"
      style={{
        height: 60,
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {/* Breadcrumb + Title */}
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          <span>首页</span>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>/</span>
              <span className={i === crumbs.length - 1 ? 'text-foreground font-medium' : ''}>{c}</span>
            </span>
          ))}
        </div>
        <h1 className="text-base font-bold text-foreground leading-tight">{title}</h1>
      </div>

      <div className="flex-1" />

      {/* Date */}
      <span className="text-sm hidden xl:block" style={{ color: 'var(--muted-foreground)' }}>{today}</span>

      {/* Refresh */}
      <button className="p-2 rounded-lg hover:bg-muted transition-colors" style={{ color: 'var(--muted-foreground)' }}>
        <RefreshCwIcon size={16} />
      </button>

      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-muted transition-colors" style={{ color: 'var(--muted-foreground)' }}>
        <BellIcon size={18} />
        {notifications > 0 && (
          <span
            className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-white"
            style={{ background: 'var(--danger)', fontSize: 10, lineHeight: 1 }}
          >
            {notifications}
          </span>
        )}
      </button>

      {/* Account dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          onClick={() => { setShowDropdown(v => !v); setShowRoleSwitch(false); }}
        >
          {/* Avatar */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            {currentUser.avatar}
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-sm font-medium text-foreground">{currentUser.name}</span>
            <span className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{roleLabel}</span>
          </div>
          <ChevronDownIcon
            size={14}
            style={{
              color: 'var(--muted-foreground)',
              transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </button>

        {/* Dropdown panel */}
        <div
          className={`shadow-custom ${showDropdown ? 'block' : 'hidden'}`}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 220,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* User info header */}
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
              style={{ background: 'var(--brand)' }}
            >
              {currentUser.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{currentUser.name}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <RoleIcon size={11} style={{ color: 'var(--muted-foreground)' }} />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{roleLabel}</span>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              onClick={() => { setShowProfile(true); setShowDropdown(false); }}
            >
              <UserIcon size={15} style={{ color: 'var(--muted-foreground)' }} />
              <span>个人信息</span>
            </button>
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              onClick={() => { setShowProfile(true); setShowDropdown(false); }}
            >
              <KeyIcon size={15} style={{ color: 'var(--muted-foreground)' }} />
              <span>修改密码</span>
            </button>
          </div>

          {/* Role switch */}
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              onClick={() => setShowRoleSwitch(v => !v)}
            >
              <ShieldIcon size={15} style={{ color: 'var(--muted-foreground)' }} />
              <span className="flex-1 text-left">切换角色（演示）</span>
              <ChevronDownIcon
                size={12}
                style={{
                  color: 'var(--muted-foreground)',
                  transform: showRoleSwitch ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </button>
            {showRoleSwitch && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {[currentUser].map(u => {
                  const URoleIcon = ROLE_ICONS[u.role] ?? UserIcon;
                  return (
                    <button
                      key={u.id}
                      className="w-full flex items-center gap-3 px-5 py-2 text-sm transition-colors hover:bg-muted"
                      style={{ color: currentUser.id === u.id ? 'var(--brand)' : 'var(--foreground)' }}
                      onClick={() => handleSwitchUser(u)}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: currentUser.id === u.id ? 'var(--brand)' : 'var(--muted-foreground)' }}
                      >
                        {u.avatar}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="truncate font-medium">{u.name}</div>
                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{ROLE_LABELS[u.role]}</div>
                      </div>
                      {currentUser.id === u.id && (
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--success)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Logout */}
          <div style={{ borderTop: '1px solid var(--border)' }} className="py-1">
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted"
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                setShowDropdown(false);
                setShowLogoutConfirm(true);
              }}
            >
              <LogOutIcon size={15} />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </div>

      {/* Profile modal */}
      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        currentUser={currentUser}
      />

      {showLogoutConfirm && (
        <div>
          <div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div
            className="fixed z-50 rounded-xl shadow-custom p-6"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 360,
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="text-base font-bold text-foreground">确认退出登录？</div>
            <div className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
              退出后需要重新登录才能继续使用系统。
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted"
                style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
                onClick={() => setShowLogoutConfirm(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--danger)' }}
                onClick={() => {
                  setShowLogoutConfirm(false);
                  logout();
                }}
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
