import { AppProvider, useApp } from '../hooks/useApp';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import React, { lazy, Suspense } from 'react';

const DashboardPage = lazy(() => import('../components/DashboardPage'));
const CustomersListPage = lazy(() => import('../components/CustomersListPage'));
const CustomerPoolPage = lazy(() => import('../components/CustomerPoolPage'));
const OrdersListPage = lazy(() => import('../components/OrdersListPage'));
const ContractListPage = lazy(() => import('../components/ContractListPage'));
const AppointmentsCalendarPage = lazy(() => import('../components/AppointmentsCalendarPage'));
const AppointmentsListPage = lazy(() => import('../components/AppointmentsListPage'));
const ServiceRecordsPage = lazy(() => import('../components/ServiceRecordsPage'));
const ServiceProgressPage = lazy(() => import('../components/ServiceProgressPage'));
const TherapistListPage = lazy(() => import('../components/TherapistListPage'));
const FinanceSalaryPage = lazy(() => import('../components/FinanceSalaryPage'));
const FinanceIncomePage = lazy(() => import('../components/FinanceIncomePage'));
const SystemSettingsPage = lazy(() => import('../components/SystemSettingsPage'));

function PageLoading() {
  return (
    <div className="flex min-h-[240px] items-center justify-center" aria-label="页面加载中">
      <div
        className="h-7 w-7 animate-spin rounded-full"
        style={{ border: '3px solid var(--border)', borderTopColor: 'var(--brand)' }}
      />
    </div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  'dashboard': '数据概览',
  'customers-list': '客户列表',
  'customers-pool': '客户公海',
  'orders-list': '订单列表',
  'orders-contracts': '数据报表',
  'appointments-calendar': '预约日历',
  'appointments-list': '预约列表',
  'services-records': '服务记录',
  'services-change': '服务进度',
  'therapists-list': '技师管理',
  'finance-salary': '工资结算',
  'finance-income': '收支管理',
  'settings-main': '系统设置',
};

class PageErrorBoundary extends React.Component<
  { children: React.ReactNode; pageKey: string },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[PageErrorBoundary]', this.props.pageKey, error);
  }

  componentDidUpdate(prevProps: { pageKey: string }) {
    if (prevProps.pageKey !== this.props.pageKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl bg-card p-6 shadow-custom" style={{ border: '1px solid var(--border)' }}>
          <div className="text-base font-semibold text-foreground mb-2">页面加载失败</div>
          <div className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
            {this.state.error.message || '未知错误'}
          </div>
          <button
            className="px-4 py-2 rounded-lg text-sm text-white"
            style={{ background: 'var(--brand)' }}
            onClick={() => this.setState({ error: null })}
          >
            重新加载页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppShell() {
  const { activePage, sidebarCollapsed } = useApp();

  const sidebarW = sidebarCollapsed ? 64 : 220;

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'customers-list':
        return <CustomersListPage />;
      case 'customers-pool':
        return <CustomerPoolPage />;
      case 'orders-list':
        return <OrdersListPage />;
      case 'orders-contracts':
        return <ContractListPage />;
      case 'appointments-calendar':
        return <AppointmentsCalendarPage />;
      case 'appointments-list':
        return <AppointmentsListPage />;
      case 'services-records':
        return <ServiceRecordsPage />;
      case 'services-change':
        return <ServiceProgressPage />;
      case 'therapists-list':
        return <TherapistListPage />;
      case 'finance-salary':
        return <FinanceSalaryPage />;
      case 'finance-income':
        return <FinanceIncomePage />;
      case 'settings-main':
        return <SystemSettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div
      data-cmp="AppShell"
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--page-bg)' }}
    >
      {/* Sidebar */}
      <div
        className="flex-shrink-0 h-full overflow-hidden transition-all duration-200"
        style={{ width: sidebarW }}
      >
        <Sidebar />
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Top bar */}
        <TopBar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <PageErrorBoundary pageKey={activePage} key={activePage}>
            <Suspense fallback={<PageLoading />}>
              {renderActivePage()}
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function Index() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
