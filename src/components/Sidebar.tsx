import { useState } from 'react';
import {
  HomeIcon, UsersIcon, CalendarIcon,
  DollarSignIcon, SettingsIcon,
  ChevronDownIcon, ChevronRightIcon,
  ChevronLeftIcon,
} from 'lucide-react';
import { useApp, hasPermission } from '../hooks/useApp';

const NAV_ITEMS = [
  {
    key: 'dashboard', label: '首页看板', icon: HomeIcon, module: 'dashboard',
    children: [],
  },
  {
    key: 'customers', label: '客户管理', icon: UsersIcon, module: 'customers',
    children: [
      { key: 'customers-list', label: '客户列表' },
      { key: 'orders-list', label: '订单列表' },
      { key: 'orders-contracts', label: '合同管理' },
    ],
  },
  {
    key: 'services', label: '服务管理', icon: CalendarIcon, module: 'appointments',
    children: [
      { key: 'therapists-list', label: '技师档案' },
      { key: 'appointments-calendar', label: '排期管理' },
      { key: 'appointments-list', label: '预约列表' },
    ],
  },
  {
    key: 'finance', label: '财务结算', icon: DollarSignIcon, module: 'finance',
    children: [
      { key: 'finance-salary', label: '工资结算' },
      { key: 'finance-income', label: '收支管理' },
    ],
  },
  {
    key: 'settings', label: '系统设置', icon: SettingsIcon, module: 'settings',
    children: [
      { key: 'settings-main', label: '系统设置' },
    ],
  },
];

export default function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, activePage, setActivePage } = useApp();
  const { currentUser } = useApp();
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['dashboard']);

  const visibleNavItems = NAV_ITEMS.filter(item => hasPermission(currentUser.role, item.module));

  function toggleExpand(key: string) {
    setExpandedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function handleNavClick(item: typeof NAV_ITEMS[0]) {
    if (item.children.length === 0) {
      setActivePage(item.key);
    } else {
      toggleExpand(item.key);
      if (!expandedKeys.includes(item.key) && item.children.length > 0) {
        setActivePage(item.children[0].key);
      }
    }
  }

  function handleSubClick(key: string) {
    setActivePage(key);
  }

  return (
    <aside
      data-cmp="Sidebar"
      className="flex flex-col h-screen transition-all duration-200 relative"
      style={{
        width: sidebarCollapsed ? 64 : 220,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--sidebar-border)',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4" style={{ minHeight: 60, borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--brand)' }}>
          <span className="text-white font-bold text-sm">产</span>
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-white font-bold text-sm">产康管理系统</span>
            <span style={{ color: 'var(--sidebar-foreground)', fontSize: 11 }}>专业上门产康服务</span>
          </div>
        )}
        <button
          className="ml-auto p-1 rounded hover:bg-white/10 transition-colors"
          style={{ color: 'var(--sidebar-foreground)' }}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2" style={{ overflowX: 'hidden' }}>
        {visibleNavItems.map(item => {
          const Icon = item.icon;
          const isExpanded = expandedKeys.includes(item.key);
          const isActive = activePage === item.key || item.children.some(c => c.key === activePage);
          return (
            <div key={item.key}>
              <div
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.children.length > 0 && (
                      isExpanded
                        ? <ChevronDownIcon size={14} />
                        : <ChevronRightIcon size={14} />
                    )}
                  </>
                )}
              </div>
              {!sidebarCollapsed && isExpanded && item.children.map(child => (
                <div
                  key={child.key}
                  className={`nav-item-sub ${activePage === child.key ? 'active' : ''}`}
                  onClick={() => handleSubClick(child.key)}
                >
                  <span className="w-1 h-1 rounded-full bg-current opacity-60 flex-shrink-0" />
                  {child.label}
                </div>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
