export const DASHBOARD_FILTER_STORAGE_KEY = 'weikebenyuan:dashboard-filter';

export type DashboardTodoType =
  | 'new-customer-followup'
  | 'order-customer-followup'
  | 'appointment-notification'
  | 'contract-pending-signature';

export interface DashboardTodoTarget {
  page: string;
  filter: Record<string, string>;
}

const TODO_TARGETS: Record<DashboardTodoType, DashboardTodoTarget> = {
  'new-customer-followup': {
    page: 'customers-list',
    filter: { customerFollowTime: 'today' },
  },
  'order-customer-followup': {
    page: 'orders-list',
    filter: { orderFollowTime: 'today' },
  },
  'appointment-notification': {
    page: 'appointments-list',
    filter: { appointmentNotifyStatus: '需通知' },
  },
  'contract-pending-signature': {
    page: 'orders-list',
    filter: { orderContractStatus: '未回签' },
  },
};

export function dashboardTodoTarget(type: string): DashboardTodoTarget | null {
  return TODO_TARGETS[type as DashboardTodoType] || null;
}

export function readDashboardFilter(): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_FILTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function clearDashboardFilter() {
  try {
    sessionStorage.removeItem(DASHBOARD_FILTER_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
