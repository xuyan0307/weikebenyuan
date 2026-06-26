import { AppProvider, useApp } from '../hooks/useApp';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import DashboardPage from '../components/DashboardPage';
import CustomersListPage from '../components/CustomersListPage';
import CustomerPoolPage from '../components/CustomerPoolPage';
import OrdersListPage from '../components/OrdersListPage';
import ContractListPage from '../components/ContractListPage';
import AppointmentsCalendarPage from '../components/AppointmentsCalendarPage';
import AppointmentsListPage from '../components/AppointmentsListPage';
import ServiceRecordsPage from '../components/ServiceRecordsPage';
import ServiceProgressPage from '../components/ServiceProgressPage';
import TherapistListPage from '../components/TherapistListPage';
import FinanceSalaryPage from '../components/FinanceSalaryPage';
import FinanceIncomePage from '../components/FinanceIncomePage';
import SystemSettingsPage from '../components/SystemSettingsPage';

const PAGE_TITLES: Record<string, string> = {
  'dashboard': '数据概览',
  'customers-list': '客户列表',
  'customers-pool': '客户公海',
  'orders-list': '订单列表',
  'orders-contracts': '合同管理',
  'appointments-calendar': '预约日历',
  'appointments-list': '预约列表',
  'services-records': '服务记录',
  'services-change': '服务进度',
  'therapists-list': '技师管理',
  'finance-salary': '工资结算',
  'finance-income': '收支管理',
  'settings-main': '系统设置',
};

function AppShell() {
  const { activePage, sidebarCollapsed } = useApp();

  const sidebarW = sidebarCollapsed ? 64 : 220;

  return (
    <div
      data-cmp="AppShell"
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--page-bg)' }}
    >
      {/* Sidebar */}
      <div
        className="flex-shrink-0 h-full overflow-y-auto transition-all duration-200"
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
          <div className={activePage === 'dashboard' ? 'block' : 'hidden'}>
            <DashboardPage />
          </div>
          <div className={activePage === 'customers-list' ? 'block' : 'hidden'}>
            <CustomersListPage />
          </div>
          <div className={activePage === 'customers-pool' ? 'block' : 'hidden'}>
            <CustomerPoolPage />
          </div>
          <div className={activePage === 'orders-list' ? 'block' : 'hidden'}>
            <OrdersListPage />
          </div>
          <div className={activePage === 'orders-contracts' ? 'block' : 'hidden'}>
            <ContractListPage />
          </div>
          <div className={activePage === 'appointments-calendar' ? 'block' : 'hidden'}>
            <AppointmentsCalendarPage />
          </div>
          <div className={activePage === 'appointments-list' ? 'block' : 'hidden'}>
            <AppointmentsListPage />
          </div>
          <div className={activePage === 'services-records' ? 'block' : 'hidden'}>
            <ServiceRecordsPage />
          </div>
          <div className={activePage === 'services-change' ? 'block' : 'hidden'}>
            <ServiceProgressPage />
          </div>
          <div className={activePage === 'therapists-list' ? 'block' : 'hidden'}>
            <TherapistListPage />
          </div>
          <div className={activePage === 'finance-salary' ? 'block' : 'hidden'}>
            <FinanceSalaryPage />
          </div>
          <div className={activePage === 'finance-income' ? 'block' : 'hidden'}>
            <FinanceIncomePage />
          </div>
          <div className={activePage === 'settings-main' ? 'block' : 'hidden'}>
            <SystemSettingsPage />
          </div>
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
