import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authApi, customersApi, ordersApi, appointmentsApi, therapistsApi,
  serviceRecordsApi, financeApi, contractsApi, dashboardApi, operationLogsApi,
  usersApi,
} from './endpoints';
import type { Customer, Order, Appointment, Therapist } from './endpoints';

export const qk = {
  customers: (params: any) => ['customers', params] as const,
  customer: (id: string) => ['customer', id] as const,
  orders: (params: any) => ['orders', params] as const,
  appointments: (params: any) => ['appointments', params] as const,
  therapists: (params: any) => ['therapists', params] as const,
  therapist: (id: string) => ['therapist', id] as const,
  serviceRecords: (params: any) => ['service-records', params] as const,
  salary: (month: string) => ['salary', month] as const,
  income: () => ['income'] as const,
  contracts: (params: any) => ['contracts', params] as const,
  dashboardStats: () => ['dashboard', 'stats'] as const,
  dashboardRecent: () => ['dashboard', 'recent'] as const,
  dashboardTodos: () => ['dashboard', 'todos'] as const,
  dashboardChart: () => ['dashboard', 'chart'] as const,
  operationLogs: (params: any) => ['operation-logs', params] as const,
  users: () => ['users'] as const,
};

// ====== Customers ======
export function useCustomers(params: Record<string, any>) {
  return useQuery({ queryKey: qk.customers(params), queryFn: () => customersApi.list(params) });
}
export function useCustomer(id: string | null) {
  return useQuery({ queryKey: qk.customer(id || ''), queryFn: () => customersApi.get(id!), enabled: !!id });
}
export function useCustomerMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    create: useMutation({ mutationFn: (b: Partial<Customer>) => customersApi.create(b), onSuccess: invalidate }).mutateAsync,
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<Customer> }) => customersApi.update(id, body), onSuccess: invalidate }).mutateAsync,
    patchFollow: useMutation({ mutationFn: ({ id, followStatus, followDate }: { id: string; followStatus: string; followDate: string }) => customersApi.patchFollow(id, followStatus, followDate), onSuccess: invalidate }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => customersApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Orders ======
export function useOrders(params: Record<string, any>) {
  return useQuery({ queryKey: qk.orders(params), queryFn: () => ordersApi.list(params) });
}
export function useOrderMutations() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['contracts'] }); };
  return {
    create: useMutation({ mutationFn: (b: Partial<Order>) => ordersApi.create(b), onSuccess: invalidate }).mutateAsync,
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<Order> }) => ordersApi.update(id, body), onSuccess: invalidate }).mutateAsync,
    patchStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => ordersApi.patchStatus(id, status), onSuccess: invalidate }).mutateAsync,
    patchContract: useMutation({ mutationFn: ({ id, signed }: { id: string; signed: boolean }) => ordersApi.patchContract(id, signed), onSuccess: invalidate }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => ordersApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Appointments ======
export function useAppointments(params: Record<string, any>) {
  return useQuery({ queryKey: qk.appointments(params), queryFn: () => appointmentsApi.list(params) });
}
export function useAppointmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['appointments'] }); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  return {
    create: useMutation({ mutationFn: (b: Partial<Appointment>) => appointmentsApi.create(b), onSuccess: invalidate }).mutateAsync,
    patchStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => appointmentsApi.patchStatus(id, status), onSuccess: invalidate }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => appointmentsApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Therapists ======
export function useTherapists(params: Record<string, any>) {
  return useQuery({ queryKey: qk.therapists(params), queryFn: () => therapistsApi.list(params) });
}
export function useTherapist(id: string | null) {
  return useQuery({ queryKey: qk.therapist(id || ''), queryFn: () => therapistsApi.get(id!), enabled: !!id });
}
export function useTherapistMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['therapists'] });
  return {
    create: useMutation({ mutationFn: (b: Partial<Therapist>) => therapistsApi.create(b), onSuccess: invalidate }).mutateAsync,
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<Therapist> }) => therapistsApi.update(id, body), onSuccess: invalidate }).mutateAsync,
    patchStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => therapistsApi.patchStatus(id, status), onSuccess: invalidate }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => therapistsApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Service Records ======
export function useServiceRecords(params: Record<string, any>) {
  return useQuery({ queryKey: qk.serviceRecords(params), queryFn: () => serviceRecordsApi.list(params) });
}

// ====== Finance ======
export function useSalary(month: string) {
  return useQuery({ queryKey: qk.salary(month), queryFn: () => financeApi.salary(month) });
}
export function useIncome() {
  return useQuery({ queryKey: qk.income(), queryFn: () => financeApi.income() });
}
export function useFinanceMutations() {
  const qc = useQueryClient();
  return {
    settle: useMutation({ mutationFn: (id: string) => financeApi.settle(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['salary'] }) }).mutateAsync,
  };
}

// ====== Contracts ======
export function useContracts(params: Record<string, any>) {
  return useQuery({ queryKey: qk.contracts(params), queryFn: () => contractsApi.list(params) });
}
export function useContractMutations() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['contracts'] }); qc.invalidateQueries({ queryKey: ['orders'] }); };
  return {
    sign: useMutation({ mutationFn: ({ id, signed }: { id: string; signed: boolean }) => contractsApi.sign(id, signed), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Dashboard ======
export function useDashboardStats() {
  return useQuery({ queryKey: qk.dashboardStats(), queryFn: () => dashboardApi.stats(), refetchInterval: 60_000 });
}
export function useDashboardRecent() {
  return useQuery({ queryKey: qk.dashboardRecent(), queryFn: () => dashboardApi.recent() });
}
export function useDashboardTodos() {
  return useQuery({ queryKey: qk.dashboardTodos(), queryFn: () => dashboardApi.todos() });
}
export function useDashboardChart() {
  return useQuery({ queryKey: qk.dashboardChart(), queryFn: () => dashboardApi.chart() });
}

// ====== Operation Logs ======
export function useOperationLogs(params: Record<string, any>) {
  return useQuery({ queryKey: qk.operationLogs(params), queryFn: () => operationLogsApi.list(params) });
}

// ====== Users ======
export function useSystemUsers(enabled = true) {
  return useQuery({ queryKey: qk.users(), queryFn: () => usersApi.list(), enabled });
}
export function useSystemUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  return {
    create: useMutation({ mutationFn: (body: any) => usersApi.create(body), onSuccess: invalidate }).mutateAsync,
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: any }) => usersApi.update(id, body), onSuccess: invalidate }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => usersApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Auth ======
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => authApi.login(username, password),
    onSuccess: () => qc.clear(),
  });
}
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => authApi.me(), retry: false, staleTime: 0 });
}
