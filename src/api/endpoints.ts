import { api, Paged, QueryParams } from './client';

// ====== Auth ======
export interface UserInfo {
  id: string;
  username?: string;
  name: string;
  role: string;
  avatar: string;
  phone?: string | null;
  email?: string | null;
}
export interface SystemUserDto {
  id: string; username: string; name: string; role: string; phone?: string;
  email?: string; wechat?: string; wecomUserId?: string; avatar?: string; status: 'active' | 'disabled';
  permissions?: string[] | null; createdAt: string;
}
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: UserInfo }>('/auth/login', { username, password }),
  me: () => api.get<{ user: UserInfo }>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put<{ message: string }>('/auth/password', { oldPassword, newPassword }),
};

// ====== Customers ======
export interface Customer {
  id: string; _id?: string;
  name: string; wechat: string; phone: string; area: string; source: string;
  acquiredAt: string; tag: string; followStatus: string; followDate: string;
  advisor: string; advisorId?: string;
  totalOrders: number; lastFollow: string;
  profile: unknown; situation: string; intendedProduct: string; remark: string;
}
export interface CustomerListParams extends QueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  dateRange?: 'all' | 'today' | 'week' | 'month';
  startDate?: string;
  endDate?: string;
  areas?: string;
  sources?: string;
  statuses?: string;
  followTimes?: string;
  tags?: string;
  advisors?: string;
  includeOrdered?: number | boolean;
  dueFollowUp?: number | boolean;
}
export const customersApi = {
  list: (params: CustomerListParams) => api.get<Paged<Customer>>('/customers', params),
  filterOptions: () => api.get<{ advisors: string[] }>('/customers/filter-options'),
  exportList: (params: Omit<CustomerListParams, 'page' | 'pageSize'>) =>
    api.get<{ data: Customer[] }>('/customers/export', params),
  get: (id: string) => api.get<Customer>(`/customers/${id}`),
  create: (body: Partial<Customer>) => api.post<{ id: string; code: string }>('/customers', body),
  update: (id: string, body: Partial<Customer>) => api.put<{ message: string }>(`/customers/${id}`, body),
  patchFollow: (id: string, followStatus: string, followDate: string) =>
    api.patch<{ message: string }>(`/customers/${id}/follow`, { followStatus, followDate }),
  remove: (id: string) => api.delete<{ message: string }>(`/customers/${id}`),
};

// ====== Users ======
export const usersApi = {
  list: () => api.get<{ data: SystemUserDto[] }>('/users'),
  create: (body: Partial<SystemUserDto> & { password?: string }) => api.post<{ id: string }>('/users', body),
  update: (id: string, body: Partial<SystemUserDto> & { password?: string }) => api.put<{ message: string }>(`/users/${id}`, body),
  remove: (id: string) => api.delete<{ message: string }>(`/users/${id}`),
};

// ====== Platform Settings ======
export const settingsApi = {
  get: <T>(key: string) => api.get<{ key: string; value: T | null; updatedAt: string | null }>(`/settings/${encodeURIComponent(key)}`),
  update: <T>(key: string, value: T) => api.put<{ message: string; key: string }>(`/settings/${encodeURIComponent(key)}`, { value }),
  remove: (key: string) => api.delete<{ message: string; key: string }>(`/settings/${encodeURIComponent(key)}`),
};

// ====== Uploads ======
export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  objectKey: string;
  url: string;
  uploadedAt: string;
}
export const uploadsApi = {
  files: (files: File[], scope = 'general') => {
    const form = new FormData();
    form.append('scope', scope);
    files.forEach(file => form.append('files', file));
    return api.upload<{ data: UploadedFile[] }>('/uploads', form);
  },
};

// ====== Orders ======
export interface Order {
  id: string; _id?: string;
  customerId: string; customerCode?: string; customerName: string; customerPhone?: string;
  area?: string; advisor?: string; tag?: string;
  type: string; amount: number; payStatus: string;
  createdAt: string; purchaseDate?: string; paidAt?: string | null;
  usedTimes: number; totalTimes: number;
  isUpgrade: boolean; contractSigned: boolean; hasCoupon: boolean; serviceItemCount: number;
  serviceItems?: string; servicePeople?: unknown; appointmentTime?: string; serviceNote?: string;
  purchaseRangeProjection?: { active: boolean; displayPurchaseDate: string; visibleStageKeys: string[] };
  contractAttachments?: unknown[]; servicePhotoRecords?: unknown[];
}
export const ordersApi = {
  list: (params: QueryParams) => api.get<Paged<Order>>('/orders', params),
  create: (body: Partial<Order>) => api.post<{ id: string; orderNo: string }>('/orders', body),
  update: (id: string, body: Partial<Order>) => api.put<{ message: string }>(`/orders/${id}`, body),
  patchStatus: (id: string, status: string) =>
    api.patch<{ message: string }>(`/orders/${id}/status`, { status }),
  patchContract: (id: string, signed: boolean) =>
    api.patch<{ message: string }>(`/orders/${id}/contract`, { signed }),
  remove: (id: string) => api.delete<{ message: string }>(`/orders/${id}`),
};

// ====== Appointments ======
export interface Appointment {
  id: string; _id?: string;
  customerId: string; customerName: string;
  customerPhone?: string;
  advisorId?: string; advisorName?: string;
  therapistId: string; therapistName: string;
  date: string; timeSlot: string; service: string;
  serviceContent?: string;
  status: string; rawStatus?: string;
  orderType?: '体验卡' | '套餐';
  area: string; remark: string;
  notifyStatus?: '需通知' | '已通知' | '延迟' | '遗漏' | null;
  notifyManualStatus?: '需通知' | '已通知' | '延迟' | '遗漏' | null;
  notifySentAt?: string | null;
  notifyError?: string;
}
export interface AppointmentCompletion {
  signaturePhotos?: unknown[];
}
export const appointmentsApi = {
  list: (params: QueryParams) => api.get<Paged<Appointment>>('/appointments', params),
  create: (body: Partial<Appointment>) => api.post<{ id: string; no: string }>('/appointments', body),
  update: (id: string, body: Partial<Appointment>) =>
    api.put<{ message: string }>(`/appointments/${id}`, body),
  patchStatus: (id: string, status: string, completion: AppointmentCompletion = {}) =>
    api.patch<{ message: string }>(`/appointments/${id}/status`, { status, ...completion }),
  replyNotified: (id: string) =>
    api.post<{ status: string }>(`/appointments/${id}/notification-reply`, { reply: '已通知' }),
  patchNotificationStatus: (
    id: string,
    status: '需通知' | '已通知' | '延迟' | '遗漏'
  ) => api.patch<{ message: string; status: string }>(
    `/appointments/${id}/notification-status`,
    { status }
  ),
  remove: (id: string) => api.delete<{ message: string }>(`/appointments/${id}`),
};

// ====== Therapists ======
export interface Therapist {
  id: string; name: string; therapistType: string; birthYear?: string;
  phone: string; area: string; city: string; detailAddress: string;
  services: string[]; serviceMethod: string; characteristics: string; transport: string;
  status: string; orders: number; rating: number; upgradeRate: number; starLevel: number; commissionRate: number;
  healthCert: unknown; firstAidCert: unknown; laborCert: unknown; associationCert: unknown; remark?: string;
}
export const therapistsApi = {
  list: (params: QueryParams) => api.get<Paged<Therapist>>('/therapists', params),
  get: (id: string) => api.get<Therapist>(`/therapists/${id}`),
  create: (body: Partial<Therapist>) => api.post<{ id: string }>('/therapists', body),
  update: (id: string, body: Partial<Therapist>) => api.put<{ message: string }>(`/therapists/${id}`, body),
  patchStatus: (id: string, status: string) =>
    api.patch<{ message: string }>(`/therapists/${id}/status`, { status }),
  remove: (id: string) => api.delete<{ message: string }>(`/therapists/${id}`),
};

// ====== Service Records ======
export interface ServiceRecord {
  id: string; appointmentId: string; customerId: string; customerName: string;
  therapistId: string; therapistName: string;
  serviceDate: string; serviceItems: string; duration: number;
  feedback: string; photos: unknown[]; signaturePhotos: unknown[];
}
export const serviceRecordsApi = {
  list: (params: QueryParams) => api.get<Paged<ServiceRecord>>('/service-records', params),
  create: (body: Partial<ServiceRecord>) => api.post<{ id: string }>('/service-records', body),
  update: (id: string, body: Pick<Partial<ServiceRecord>, 'photos'>) =>
    api.put<{ message: string }>(`/service-records/${id}`, body),
};

// ====== Finance ======
export interface SalarySettlementEntry {
  id: string;
  serviceRecordId: string;
  appointmentId: string;
  appointmentNo: string;
  customerId: string;
  customerName: string;
  therapistId: string;
  therapistName: string;
  serviceDate: string;
  serviceItems: string;
  serviceType: '体验卡' | '套餐';
  itemCount: number;
  experienceFee: number;
  laborFee: number;
  commission: number;
  couponFee: number;
  otherFee: number;
  deduction: number;
  payableAmount: number;
  sourceType: string;
  evidence: Record<string, unknown>;
  settlementStatus: '待确认' | '已确认' | '已结算';
  settlementNote: string;
  manualAdjusted: boolean;
  adjustedByName: string;
  adjustedAt?: string | null;
  confirmedByName: string;
  confirmedAt?: string | null;
}
export interface SalaryLedgerDay {
  date: string;
  entries: SalarySettlementEntry[];
  fee: number;
  notes: string;
}
export interface SalaryCustomerLedger {
  therapistId: string;
  therapistName: string;
  customerDbId: string;
  customerId: string;
  customerName: string;
  experienceStatus: '待服务' | '已服务' | '无体验卡';
  experienceServiceDate: string;
  upgradeDate: string;
  hasUpgrade: boolean;
  upgradedThisMonth: boolean;
  projectLabel: string;
  itemCount: number;
  packageAmount: number;
  totalTimes: number;
  servedTimes: number;
  servedThisMonth: boolean;
  couponFee: number;
  experienceFee: number;
  laborFee: number;
  laborUnitFee: number;
  otherFee: number;
  manualOtherFee: number;
  commissionRate: number;
  commission: number;
  totalFee: number;
  paidSubtotal: number;
  unpaidSubtotal: number;
  adjustmentNote: string;
  days: Record<string, SalaryLedgerDay>;
  weekSubtotals: Record<string, number>;
  weekConfirmedSubtotals: Record<string, number>;
}
export interface SalaryLedgerWeek {
  key: string;
  label: string;
  start: string;
  end: string;
  days: string[];
}
export interface SalaryLedgerSummary {
  customerCount: number;
  totalServiceTimes: number;
  servedTimes: number;
  totalFee: number;
  paidSubtotal: number;
  unpaidSubtotal: number;
  currentWeekSubtotal: number;
  upgradeRate: number;
}
export interface SalaryRecord {
  id: string; therapistId: string; therapistName: string; month: string;
  therapistType: string; tier: string; tierKey: string;
  commissionRate: number; upgradeRate: number; profileUpgradeRate: number; upgradedCustomerCount: number;
  serviceCount: number; experienceFee: number; laborFee: number;
  commission: number; couponFee: number; otherFee: number; deduction: number; total: number;
  status: string; confirmedAt?: string | null; confirmedByName: string;
  settledAt?: string | null; settlementNote: string; entries: SalarySettlementEntry[];
  customers: SalaryCustomerLedger[];
}
export interface MonthlyIncome {
  month: string;
  revenue: number | string;
  refund: number | string;
  order_count: number;
}
export interface IncomeSummary {
  total_customers: number;
  total_orders: number;
  total_revenue: number | string;
  done_appointments: number;
}
export const financeApi = {
  salary: (month: string, weekStart?: string, scope: 'all' | 'month' = 'month') => api.get<{
    month: string;
    scope: 'all' | 'month';
    weekStart: string;
    weekEnd: string;
    editable: boolean;
    source: string;
    weeks: SalaryLedgerWeek[];
    summary: SalaryLedgerSummary;
    data: SalaryRecord[];
  }>('/finance/salary', { month, weekStart, scope }),
  updateSalaryEntry: (
    id: string,
    body: Pick<
      SalarySettlementEntry,
      'experienceFee' | 'laborFee' | 'commission' | 'couponFee' |
      'otherFee' | 'deduction' | 'settlementStatus' | 'settlementNote'
    >
  ) => api.patch<{ message: string; payableAmount: number }>(`/finance/salary/entries/${id}`, body),
  updateSalaryCustomerAdjustment: (body: {
    therapistId: string;
    customerId: string;
    month: string;
    couponFee: number;
    otherFee: number;
    commissionRate: number;
    paidAmount: number;
    adjustmentNote: string;
  }) => api.patch<{ message: string }>('/finance/salary/customer-adjustments', body),
  confirmSalaryWeek: (body: {
    therapistId: string;
    customerId: string;
    weekStart: string;
    confirmed: boolean;
  }) => api.patch<{ message: string; updatedCount: number }>('/finance/salary/week-confirmation', body),
  settle: (id: string, status: '审核中' | '已结算', settlementNote = '') =>
    api.post<{ message: string }>(`/finance/salary/${id}/settle`, { status, settlementNote }),
  income: () => api.get<{ monthly: MonthlyIncome[]; summary: IncomeSummary }>('/finance/income'),
  exportSalary: (month: string) => api.download('/finance/salary/export', { month }),
  exportIncome: () => api.download('/finance/income/export'),
};

// ====== Contracts ======
export interface Contract {
  id: string; orderId: string; customerId: string; customerName: string;
  amount: number; type: string; payStatus: string;
  contractSigned: boolean; createdAt: string;
}
export const contractsApi = {
  list: (params: QueryParams) => api.get<Paged<Contract>>('/contracts', params),
  sign: (id: string, signed: boolean) =>
    api.patch<{ message: string }>(`/contracts/${id}/sign`, { signed }),
};

// ====== Dashboard ======
export interface DashboardStats {
  period: DashboardPeriod;
  new_customers: number;
  total_revenue: number;
  experience_revenue: number;
  upgrade_revenue: number;
  experience_cards: number;
  purchase_rate: number;
  upgrades: number;
  first_upgrade_customers: number;
  upgrade_rate: number;
  second_upgrade_count: number;
  second_upgrade_customers: number;
  second_upgrade_rate: number;
  second_upgrade_revenue: number;
}
export type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'all';
export interface DashboardRecent {
  customers: unknown[];
  orders: unknown[];
  appointments: unknown[];
}
export interface DashboardTodo {
  id: number;
  type: string;
  label: string;
  count: number;
  color: string;
  urgency: string;
}
export interface DashboardChartPoint {
  period: string;
  label: string;
  revenue: number;
  new_customers: number;
  experience_cards: number;
  upgrades: number;
  second_upgrades: number;
}
export type DashboardChartGranularity = 'day' | 'week' | 'month';
export const dashboardApi = {
  stats: (period: DashboardPeriod = 'month', startDate = '', endDate = '') =>
    api.get<DashboardStats>('/dashboard/stats', { period, startDate, endDate }),
  recent: () => api.get<DashboardRecent>('/dashboard/recent'),
  todos: () => api.get<DashboardTodo[]>('/dashboard/todos'),
  chart: (startDate = '', endDate = '', granularity: DashboardChartGranularity = 'month') =>
    api.get<DashboardChartPoint[]>('/dashboard/chart', { startDate, endDate, granularity }),
};

// ====== Operation Logs ======
export interface OperationLog {
  id: string; user_id: string; username: string; action: string;
  module: string; description: string; ip_address: string; created_at: string;
  entity_id?: string | null; request_id?: string | null;
  request_payload?: Record<string, unknown> | null; response_status?: number | null;
}
export const operationLogsApi = {
  list: (params: QueryParams) => api.get<Paged<OperationLog>>('/operation-logs', params),
};
