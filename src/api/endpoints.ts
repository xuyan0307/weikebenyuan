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
  email?: string; wechat?: string; avatar?: string; status: 'active' | 'disabled';
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
  areas?: string;
  sources?: string;
  statuses?: string;
  tags?: string;
  advisors?: string;
  includeOrdered?: number | boolean;
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
  therapistId: string; therapistName: string;
  date: string; timeSlot: string; service: string;
  status: string; area: string; remark: string;
}
export const appointmentsApi = {
  list: (params: QueryParams) => api.get<Paged<Appointment>>('/appointments', params),
  create: (body: Partial<Appointment>) => api.post<{ id: string; no: string }>('/appointments', body),
  patchStatus: (id: string, status: string) =>
    api.patch<{ message: string }>(`/appointments/${id}/status`, { status }),
  remove: (id: string) => api.delete<{ message: string }>(`/appointments/${id}`),
};

// ====== Therapists ======
export interface Therapist {
  id: string; name: string; therapistType: string; birthYear?: string;
  phone: string; area: string; city: string; detailAddress: string;
  services: string[]; serviceMethod: string; characteristics: string; transport: string;
  status: string; orders: number; rating: number; upgradeRate: number; starLevel: number;
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
  feedback: string; photos: unknown[];
}
export const serviceRecordsApi = {
  list: (params: QueryParams) => api.get<Paged<ServiceRecord>>('/service-records', params),
  create: (body: Partial<ServiceRecord>) => api.post<{ id: string }>('/service-records', body),
};

// ====== Finance ======
export interface SalaryRecord {
  id: string; therapistId: string; therapistName: string; month: string;
  serviceCount: number; laborFee: number; commission: number; total: number;
  status: string; settledAt?: string | null;
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
  salary: (month: string) => api.get<{ month: string; data: SalaryRecord[] }>('/finance/salary', { month }),
  settle: (id: string) => api.post<{ message: string }>(`/finance/salary/${id}/settle`),
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
  total_customers: number;
  pending_follow: number;
  following: number;
  dealt: number;
  total_orders: number;
  pending_pay: number;
  paid_orders: number;
  pending_contract: number;
  pending_appt: number;
  today_appt: number;
  active_therapists: number;
  service_records: number;
  total_revenue: number;
}
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
  month: string;
  revenue: number;
  new_customers: number;
  experience_cards: number;
  upgrades: number;
}
export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/dashboard/stats'),
  recent: () => api.get<DashboardRecent>('/dashboard/recent'),
  todos: () => api.get<DashboardTodo[]>('/dashboard/todos'),
  chart: () => api.get<DashboardChartPoint[]>('/dashboard/chart'),
};

// ====== Operation Logs ======
export interface OperationLog {
  id: string; user_id: string; username: string; action: string;
  module: string; description: string; ip_address: string; created_at: string;
}
export const operationLogsApi = {
  list: (params: QueryParams) => api.get<Paged<OperationLog>>('/operation-logs', params),
};
