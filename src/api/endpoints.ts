import { api, Paged } from './client';

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
  profile: any; situation: string; intendedProduct: string; remark: string;
}
export const customersApi = {
  list: (params: Record<string, any>) => api.get<Paged<Customer>>('/customers', params),
  get: (id: string) => api.get<Customer>(`/customers/${id}`),
  create: (body: Partial<Customer>) => api.post<{ id: string; code: string }>('/customers', body),
  update: (id: string, body: Partial<Customer>) => api.put<{ message: string }>(`/customers/${id}`, body),
  patchFollow: (id: string, followStatus: string, followDate: string) =>
    api.patch<{ message: string }>(`/customers/${id}/follow`, { followStatus, followDate }),
  remove: (id: string) => api.delete<{ message: string }>(`/customers/${id}`),
};

// ====== Orders ======
export interface Order {
  id: string; _id?: string;
  customerId: string; customerName: string;
  type: string; amount: number; payStatus: string;
  createdAt: string; paidAt?: string | null;
  usedTimes: number; totalTimes: number;
  isUpgrade: boolean; contractSigned: boolean; hasCoupon: boolean; serviceItemCount: number;
}
export const ordersApi = {
  list: (params: Record<string, any>) => api.get<Paged<Order>>('/orders', params),
  create: (body: Partial<Order>) => api.post<{ id: string; orderNo: string }>('/orders', body),
  patchStatus: (id: string, status: string) =>
    api.patch<{ message: string }>(`/orders/${id}/status`, { status }),
  patchContract: (id: string, signed: boolean) =>
    api.patch<{ message: string }>(`/orders/${id}/contract`, { signed }),
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
  list: (params: Record<string, any>) => api.get<Paged<Appointment>>('/appointments', params),
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
  healthCert: any; firstAidCert: any; laborCert: any; associationCert: any; remark?: string;
}
export const therapistsApi = {
  list: (params: Record<string, any>) => api.get<Paged<Therapist>>('/therapists', params),
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
  feedback: string; photos: any[];
}
export const serviceRecordsApi = {
  list: (params: Record<string, any>) => api.get<Paged<ServiceRecord>>('/service-records', params),
  create: (body: Partial<ServiceRecord>) => api.post<{ id: string }>('/service-records', body),
};

// ====== Finance ======
export interface SalaryRecord {
  id: string; therapistId: string; therapistName: string; month: string;
  serviceCount: number; laborFee: number; commission: number; total: number;
  status: string; settledAt?: string | null;
}
export const financeApi = {
  salary: (month: string) => api.get<{ month: string; data: SalaryRecord[] }>('/finance/salary', { month }),
  settle: (id: string) => api.post<{ message: string }>(`/finance/salary/${id}/settle`),
  income: () => api.get<{ monthly: any[]; summary: any }>('/finance/income'),
};

// ====== Contracts ======
export interface Contract {
  id: string; orderId: string; customerId: string; customerName: string;
  amount: number; type: string; payStatus: string;
  contractSigned: boolean; createdAt: string;
}
export const contractsApi = {
  list: (params: Record<string, any>) => api.get<Paged<Contract>>('/contracts', params),
  sign: (id: string, signed: boolean) =>
    api.patch<{ message: string }>(`/contracts/${id}/sign`, { signed }),
};

// ====== Dashboard ======
export const dashboardApi = {
  stats: () => api.get<any>('/dashboard/stats'),
  recent: () => api.get<any>('/dashboard/recent'),
  todos: () => api.get<any[]>('/dashboard/todos'),
  chart: () => api.get<any[]>('/dashboard/chart'),
};

// ====== Operation Logs ======
export interface OperationLog {
  id: string; user_id: string; username: string; action: string;
  module: string; description: string; ip_address: string; created_at: string;
}
export const operationLogsApi = {
  list: (params: Record<string, any>) => api.get<Paged<OperationLog>>('/operation-logs', params),
};
