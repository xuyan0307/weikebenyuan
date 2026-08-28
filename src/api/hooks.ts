import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authApi, customersApi, ordersApi, appointmentsApi, therapistsApi,
  serviceRecordsApi, financeApi, contractsApi, dashboardApi, operationLogsApi,
  usersApi, settingsApi,
} from './endpoints';
import type { Customer, CustomerListParams, Order, Appointment, Therapist, ServiceRecord } from './endpoints';
import type { QueryParams } from './client';

type SystemUserMutationBody = Parameters<typeof usersApi.create>[0];

export const qk = {
  customers: (params: CustomerListParams) => ['customers', params] as const,
  customerFilterOptions: () => ['customers', 'filter-options'] as const,
  customer: (id: string) => ['customer', id] as const,
  orders: (params: QueryParams) => ['orders', params] as const,
  appointments: (params: QueryParams) => ['appointments', params] as const,
  therapists: (params: QueryParams) => ['therapists', params] as const,
  therapist: (id: string) => ['therapist', id] as const,
  serviceRecords: (params: QueryParams) => ['service-records', params] as const,
  salary: (month: string) => ['salary', month] as const,
  income: () => ['income'] as const,
  contracts: (params: QueryParams) => ['contracts', params] as const,
  dashboardStats: (period: string, startDate = '', endDate = '') => ['dashboard', 'stats', period, startDate, endDate] as const,
  dashboardRecent: () => ['dashboard', 'recent'] as const,
  dashboardTodos: () => ['dashboard', 'todos'] as const,
  dashboardChart: (startDate = '', endDate = '', granularity = 'month') => ['dashboard', 'chart', startDate, endDate, granularity] as const,
  operationLogs: (params: QueryParams) => ['operation-logs', params] as const,
  users: () => ['users'] as const,
  setting: (key: string) => ['settings', key] as const,
  systemParameters: () => ['settings', 'system-parameters'] as const,
};

// ====== Customers ======
export function useCustomers(params: CustomerListParams) {
  return useQuery({ queryKey: qk.customers(params), queryFn: () => customersApi.list(params) });
}
export function useCustomerFilterOptions() {
  return useQuery({
    queryKey: qk.customerFilterOptions(),
    queryFn: () => customersApi.filterOptions(),
    staleTime: 5 * 60 * 1000,
  });
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
export function useOrders(params: QueryParams) {
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
export function useAppointments(params: QueryParams) {
  return useQuery({ queryKey: qk.appointments(params), queryFn: () => appointmentsApi.list(params) });
}
export function useAppointmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['appointments'] }); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['service-records'] }); qc.invalidateQueries({ queryKey: ['salary'] }); };
  return {
    create: useMutation({ mutationFn: (b: Partial<Appointment>) => appointmentsApi.create(b), onSuccess: invalidate }).mutateAsync,
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<Appointment> }) =>
        appointmentsApi.update(id, body),
      onSuccess: invalidate,
    }).mutateAsync,
    patchStatus: useMutation({
      mutationFn: ({ id, status, signaturePhotos }: { id: string; status: string; signaturePhotos?: unknown[] }) =>
        appointmentsApi.patchStatus(id, status, { signaturePhotos }),
      onSuccess: invalidate,
    }).mutateAsync,
    syncOrderProgress: useMutation({
      mutationFn: (id: string) => appointmentsApi.syncOrderProgress(id),
      onSuccess: invalidate,
    }).mutateAsync,
    syncAllOrderProgress: useMutation({
      mutationFn: () => appointmentsApi.syncAllOrderProgress(),
      onSuccess: invalidate,
    }).mutateAsync,
    reverseCompletion: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        appointmentsApi.reverseCompletion(id, reason),
      onSuccess: invalidate,
    }).mutateAsync,
    patchNotificationStatus: useMutation({
      mutationFn: ({
        id,
        status,
      }: {
        id: string;
        status: '待通知' | '需通知' | '已通知' | '延迟' | '遗漏';
      }) => appointmentsApi.patchNotificationStatus(id, status),
      onSuccess: invalidate,
    }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => appointmentsApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Therapists ======
export function useTherapists(params: QueryParams) {
  return useQuery({ queryKey: qk.therapists(params), queryFn: () => therapistsApi.list(params) });
}
export function useTherapist(id: string | null) {
  return useQuery({ queryKey: qk.therapist(id || ''), queryFn: () => therapistsApi.get(id!), enabled: !!id });
}
export function useTherapistMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['therapists'] });
    // 技师定档是工资提成的主数据，档案更新后所有工资视图必须立即重算。
    qc.invalidateQueries({ queryKey: ['salary'] });
  };
  return {
    create: useMutation({ mutationFn: (b: Partial<Therapist>) => therapistsApi.create(b), onSuccess: invalidate }).mutateAsync,
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<Therapist> }) => therapistsApi.update(id, body), onSuccess: invalidate }).mutateAsync,
    patchStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => therapistsApi.patchStatus(id, status), onSuccess: invalidate }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => therapistsApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Service Records ======
export function useServiceRecords(params: QueryParams) {
  return useQuery({ queryKey: qk.serviceRecords(params), queryFn: () => serviceRecordsApi.list(params) });
}
export function useServiceRecordMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['service-records'] });
  return {
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Pick<Partial<ServiceRecord>, 'photos'> }) =>
        serviceRecordsApi.update(id, body),
      onSuccess: invalidate,
    }).mutateAsync,
  };
}

// ====== Finance ======
export function useSalary(month: string, weekStart?: string, scope: 'all' | 'month' = 'month') {
  return useQuery({
    queryKey: [...qk.salary(month), weekStart || '', scope],
    queryFn: () => financeApi.salary(month, weekStart, scope),
    placeholderData: previous => previous,
  });
}
export function useIncome() {
  return useQuery({ queryKey: qk.income(), queryFn: () => financeApi.income() });
}
export function useFinanceMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['salary'] });
  return {
    updateEntry: useMutation({
      mutationFn: ({ id, body }: {
        id: string;
        body: Parameters<typeof financeApi.updateSalaryEntry>[1];
      }) => financeApi.updateSalaryEntry(id, body),
      onSuccess: invalidate,
    }).mutateAsync,
    updateCustomerAdjustment: useMutation({
      mutationFn: (body: Parameters<typeof financeApi.updateSalaryCustomerAdjustment>[0]) =>
        financeApi.updateSalaryCustomerAdjustment(body),
      onSuccess: invalidate,
    }).mutateAsync,
    confirmWeek: useMutation({
      mutationFn: (body: Parameters<typeof financeApi.confirmSalaryWeek>[0]) =>
        financeApi.confirmSalaryWeek(body),
      onSuccess: invalidate,
    }).mutateAsync,
    settle: useMutation({
      mutationFn: ({ id, status, settlementNote }: {
        id: string;
        status: '审核中' | '已结算';
        settlementNote?: string;
      }) => financeApi.settle(id, status, settlementNote),
      onSuccess: invalidate,
    }).mutateAsync,
  };
}

// ====== Contracts ======
export function useContracts(params: QueryParams) {
  return useQuery({ queryKey: qk.contracts(params), queryFn: () => contractsApi.list(params) });
}
export function useContractMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return {
    sign: useMutation({ mutationFn: ({ id, signed }: { id: string; signed: boolean }) => contractsApi.sign(id, signed), onSuccess: invalidate }).mutateAsync,
  };
}

// ====== Dashboard ======
export function useDashboardStats(
  period: Parameters<typeof dashboardApi.stats>[0] = 'month',
  startDate = '',
  endDate = ''
) {
  return useQuery({
    queryKey: qk.dashboardStats(period, startDate, endDate),
    queryFn: () => dashboardApi.stats(period, startDate, endDate),
    refetchInterval: 30_000,
  });
}
export function useDashboardRecent() {
  return useQuery({ queryKey: qk.dashboardRecent(), queryFn: () => dashboardApi.recent() });
}
export function useDashboardTodos(enabled = true) {
  return useQuery({ queryKey: qk.dashboardTodos(), queryFn: () => dashboardApi.todos(), refetchInterval: 30_000, enabled });
}
export function useDashboardChart(startDate = '', endDate = '', granularity: 'day' | 'week' | 'month' = 'month') {
  return useQuery({
    queryKey: qk.dashboardChart(startDate, endDate, granularity),
    queryFn: () => dashboardApi.chart(startDate, endDate, granularity),
    refetchInterval: 30_000,
  });
}

// ====== Operation Logs ======
export function useOperationLogs(params: QueryParams) {
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
    create: useMutation({ mutationFn: (body: SystemUserMutationBody) => usersApi.create(body), onSuccess: invalidate }).mutateAsync,
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: SystemUserMutationBody }) => usersApi.update(id, body), onSuccess: invalidate }).mutateAsync,
    remove: useMutation({ mutationFn: (id: string) => usersApi.remove(id), onSuccess: invalidate }).mutateAsync,
  };
}

export function usePlatformSetting<T>(key: string) {
  return useQuery({
    queryKey: qk.setting(key),
    queryFn: async () => (await settingsApi.get<T>(key)).value,
  });
}

export function usePlatformSettingMutation<T>(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: T) => settingsApi.update(key, value),
    onSuccess: (_result, value) => qc.setQueryData(qk.setting(key), value),
  }).mutateAsync;
}

export function useSystemParameters() {
  return useQuery({
    queryKey: qk.systemParameters(),
    queryFn: async () => (await settingsApi.systemParameters()).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSystemParametersRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await settingsApi.refreshSystemParameters()).data,
    onSuccess: data => qc.setQueryData(qk.systemParameters(), data),
  });
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
