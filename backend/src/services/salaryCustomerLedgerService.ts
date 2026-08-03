import { laborFeeByItemCount } from './salarySettlementService';

export interface SalaryLedgerWeek {
  key: string;
  label: string;
  start: string;
  end: string;
  days: string[];
}

interface TherapistRow {
  id: string;
  name: string;
  therapist_type?: string | null;
  upgrade_rate?: number | string | null;
  commission_rate?: number | string | null;
}
interface CustomerRow { id: string; customer_code: string; name: string }
interface OrderRow {
  customer_id: string;
  customer_code?: string | null;
  customer_name?: string | null;
  type: string;
  amount: number | string;
  pay_status: string;
  purchase_date: string | null;
  created_date: string;
  used_times: number;
  total_times: number;
  is_upgrade: number | boolean;
  service_item_count: number;
  service_items: string | null;
  service_people: unknown;
}
interface AppointmentRow {
  customer_id: string;
  therapist_id: string;
  date: string;
  status: string;
}
interface LedgerEntryRow {
  id: string;
  therapistId: string;
  customerId: string;
  serviceDate: string;
  payableAmount: number;
  serviceItems: string;
  serviceType: string;
  settlementStatus?: string;
  settlementNote: string;
  [key: string]: unknown;
}
interface AdjustmentRow {
  id?: string;
  therapist_id: string;
  customer_id: string;
  coupon_fee: number | string;
  other_fee?: number | string;
  paid_amount: number | string;
  adjustment_note?: string | null;
}

export interface SalaryCustomerLedgerInput {
  month: string;
  scope?: 'all' | 'month';
  therapists: TherapistRow[];
  customers: CustomerRow[];
  orders: OrderRow[];
  appointments: AppointmentRow[];
  entries: LedgerEntryRow[];
  cumulativeEntries?: LedgerEntryRow[];
  displayEntries?: LedgerEntryRow[];
  adjustments: AdjustmentRow[];
}

export function salaryTierByUpgradeRate(rate: number) {
  if (rate >= 75) return { key: 'ace', label: '王牌', commissionRate: 15 };
  if (rate >= 60) return { key: 'S', label: 'S档', commissionRate: 12 };
  if (rate >= 50) return { key: 'B', label: 'B档', commissionRate: 8 };
  if (rate >= 40) return { key: 'A', label: 'A档', commissionRate: 6 };
  return { key: 'observer', label: '观察池', commissionRate: 0 };
}

function dateText(value: unknown): string {
  return String(value || '').slice(0, 10);
}

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function isConfirmedEntry(entry: LedgerEntryRow): boolean {
  return entry.settlementStatus === '已确认' || entry.settlementStatus === '已结算';
}

function monday(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function iso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function salaryMonthWeeks(month: string): SalaryLedgerWeek[] {
  const [year, monthNo] = month.split('-').map(Number);
  const first = new Date(year, monthNo - 1, 1);
  const last = new Date(year, monthNo, 0);
  const cursor = monday(first);
  const weeks: SalaryLedgerWeek[] = [];
  while (cursor <= last) {
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(cursor);
      day.setDate(day.getDate() + index);
      return iso(day);
    });
    weeks.push({
      key: days[0],
      label: `${days[0].slice(5).replace('-', '/')}–${days[6].slice(5).replace('-', '/')}`,
      start: days[0],
      end: days[6],
      days,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function assignedTherapistNames(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!parsed || typeof parsed !== 'object') return [];
  return Object.values(parsed as Record<string, unknown>)
    .flatMap(person => {
      if (typeof person === 'string') return [person];
      if (!person || typeof person !== 'object') return [];
      const assign = (person as Record<string, unknown>).assign;
      return typeof assign === 'string' ? [assign] : [];
    })
    .map(name => name.trim())
    .filter(Boolean);
}

function experienceUsageFromSnapshot(value: unknown): number | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const snapshot = (parsed as Record<string, unknown>).experienceSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const usedTimes = Number((snapshot as Record<string, unknown>).usedTimes);
  return Number.isFinite(usedTimes) ? usedTimes : 0;
}

export function buildSalaryCustomerLedger(input: SalaryCustomerLedgerInput) {
  const weeks = salaryMonthWeeks(input.month);
  const customerById = new Map(input.customers.map(customer => [customer.id, customer]));
  for (const order of input.orders) {
    if (!customerById.has(order.customer_id) && order.customer_name) {
      customerById.set(order.customer_id, {
        id: order.customer_id,
        customer_code: order.customer_code || order.customer_id.slice(0, 8),
        name: order.customer_name,
      });
    }
  }
  const therapistByName = new Map(input.therapists.map(therapist => [therapist.name, therapist]));
  const associations = new Map<string, Set<string>>();
  const addAssociation = (therapistId: string, customerId: string) => {
    if (!therapistId || !customerId || !customerById.has(customerId)) return;
    if (!associations.has(therapistId)) associations.set(therapistId, new Set());
    associations.get(therapistId)?.add(customerId);
  };

  for (const order of input.orders) {
    for (const name of assignedTherapistNames(order.service_people)) {
      const therapist = therapistByName.get(name);
      if (therapist) addAssociation(therapist.id, order.customer_id);
    }
  }
  for (const appointment of input.appointments) {
    addAssociation(appointment.therapist_id, appointment.customer_id);
  }
  for (const entry of input.entries) addAssociation(entry.therapistId, entry.customerId);
  for (const entry of input.displayEntries || []) addAssociation(entry.therapistId, entry.customerId);

  const ordersByCustomer = new Map<string, OrderRow[]>();
  for (const order of input.orders) {
    ordersByCustomer.set(order.customer_id, [...(ordersByCustomer.get(order.customer_id) || []), order]);
  }
  const appointmentsByPair = new Map<string, AppointmentRow[]>();
  for (const appointment of input.appointments) {
    const key = `${appointment.therapist_id}:${appointment.customer_id}`;
    appointmentsByPair.set(key, [...(appointmentsByPair.get(key) || []), appointment]);
  }
  const entriesByPair = new Map<string, LedgerEntryRow[]>();
  for (const entry of input.entries) {
    const key = `${entry.therapistId}:${entry.customerId}`;
    entriesByPair.set(key, [...(entriesByPair.get(key) || []), entry]);
  }
  const cumulativeEntriesByPair = new Map<string, LedgerEntryRow[]>();
  for (const entry of input.cumulativeEntries || input.entries) {
    const key = `${entry.therapistId}:${entry.customerId}`;
    cumulativeEntriesByPair.set(key, [...(cumulativeEntriesByPair.get(key) || []), entry]);
  }
  const displayEntriesByPair = new Map<string, LedgerEntryRow[]>();
  for (const entry of input.displayEntries || input.entries) {
    const key = `${entry.therapistId}:${entry.customerId}`;
    displayEntriesByPair.set(key, [...(displayEntriesByPair.get(key) || []), entry]);
  }
  const adjustmentByPair = new Map<string, AdjustmentRow>();
  for (const adjustment of input.adjustments) {
    const key = `${adjustment.therapist_id}:${adjustment.customer_id}`;
    const current = adjustmentByPair.get(key);
    adjustmentByPair.set(key, {
      ...adjustment,
      coupon_fee: money(current?.coupon_fee) + money(adjustment.coupon_fee),
      other_fee: money(current?.other_fee) + money(adjustment.other_fee),
      paid_amount: money(current?.paid_amount) + money(adjustment.paid_amount),
      adjustment_note: [current?.adjustment_note, adjustment.adjustment_note].filter(Boolean).join('；'),
    });
  }

  const therapists = input.therapists.flatMap(therapist => {
    const customerIds = [...(associations.get(therapist.id) || [])];
    if (!customerIds.length) return [];
    const customers = customerIds.flatMap(customerId => {
      const customer = customerById.get(customerId);
      if (!customer) return [];
      const pairKey = `${therapist.id}:${customerId}`;
      const orders = [...(ordersByCustomer.get(customerId) || [])]
        .filter(order => order.pay_status !== '已退款')
        .sort((a, b) => dateText(b.purchase_date || b.created_date).localeCompare(dateText(a.purchase_date || a.created_date)));
      const experienceOrder = orders.find(order => order.type === '体验卡');
      const packageOrder = orders.find(order => order.type === '套餐');
      const primaryOrder = packageOrder || experienceOrder;
      const snapshotExperienceUsage = orders
        .map(order => experienceUsageFromSnapshot(order.service_people))
        .find(value => value !== null);
      const pairAppointments = appointmentsByPair.get(pairKey) || [];
      const allServedTimes = pairAppointments.filter(item => item.status === '已完成').length;
      const firstCompletedServiceDate = pairAppointments
        .filter(item => item.status === '已完成')
        .map(item => dateText(item.date))
        .filter(Boolean)
        .sort()[0] || '';
      const monthEntries = entriesByPair.get(pairKey) || [];
      const cumulativeEntries = cumulativeEntriesByPair.get(pairKey) || [];
      const visibleEntries = displayEntriesByPair.get(pairKey) || [];
      const adjustment = adjustmentByPair.get(pairKey);
      const couponFee = adjustment ? money(adjustment.coupon_fee) : 300;
      // 已付是历史所有已确认周费用的累计，不受当前月份或周视图限制。
      const confirmedEntries = cumulativeEntries.filter(isConfirmedEntry);
      const paidSubtotal = money(confirmedEntries.reduce((sum, entry) => sum + money(entry.payableAmount), 0));
      const experienceFee = money(monthEntries.reduce((sum, entry) => sum + money(entry.experienceFee), 0));
      const laborUnitFee = packageOrder
        ? laborFeeByItemCount(Number(packageOrder.service_item_count) || 0)
        : 0;
      const laborFee = money(laborUnitFee * (Number(packageOrder?.total_times) || 0));
      const confirmedServiceOtherFee = money(confirmedEntries.reduce(
        (sum, entry) => sum + money(entry.otherFee) - money(entry.deduction),
        0
      ));
      const manualOtherFee = money(adjustment?.other_fee);
      const otherFee = money(manualOtherFee + confirmedServiceOtherFee);
      const days: Record<string, { date: string; entries: LedgerEntryRow[]; fee: number; notes: string }> = {};
      for (const entry of visibleEntries) {
        const date = dateText(entry.serviceDate);
        const existing = days[date] || { date, entries: [], fee: 0, notes: '' };
        existing.entries.push(entry);
        existing.fee = money(existing.fee + money(entry.payableAmount));
        existing.notes = [...new Set([...existing.notes.split('；').filter(Boolean), entry.settlementNote].filter(Boolean))].join('；');
        days[date] = existing;
      }
      const weekKeys = new Set(weeks.map(week => week.key));
      for (const date of Object.keys(days)) weekKeys.add(iso(monday(new Date(`${date}T00:00:00`))));
      const weekSubtotals = Object.fromEntries([...weekKeys].map(weekKey => [
        weekKey,
        money(Array.from({ length: 7 }, (_, index) => {
          const date = new Date(`${weekKey}T00:00:00`);
          date.setDate(date.getDate() + index);
          return iso(date);
        }).reduce((sum, date) => sum + money(days[date]?.fee), 0)),
      ]));
      const weekConfirmedSubtotals = Object.fromEntries([...weekKeys].map(weekKey => [
        weekKey,
        money(Array.from({ length: 7 }, (_, index) => {
          const date = new Date(`${weekKey}T00:00:00`);
          date.setDate(date.getDate() + index);
          return iso(date);
        }).reduce((sum, date) => sum + money(
          (days[date]?.entries || []).filter(isConfirmedEntry).reduce(
            (entrySum, entry) => entrySum + money(entry.payableAmount),
            0
          )
        ), 0)),
      ]));
      return [{
        therapistId: therapist.id,
        therapistName: therapist.name,
        customerDbId: customer.id,
        customerId: customer.customer_code,
        customerName: customer.name,
        experienceStatus: experienceOrder
          ? (Number(experienceOrder.used_times) > 0 ? '已服务' : '待服务')
          : snapshotExperienceUsage !== undefined
            ? (Number(snapshotExperienceUsage) > 0 ? '已服务' : '待服务')
            : '无体验卡',
        experienceServiceDate: firstCompletedServiceDate,
        upgradeDate: packageOrder ? dateText(packageOrder.purchase_date || packageOrder.created_date) : '',
        hasUpgrade: Boolean(packageOrder),
        upgradedThisMonth: Boolean(packageOrder && dateText(packageOrder.purchase_date || packageOrder.created_date).startsWith(input.month)),
        projectLabel: primaryOrder?.service_items || '',
        itemCount: Number(primaryOrder?.service_item_count) || 0,
        packageAmount: packageOrder ? money(packageOrder.amount) : 0,
        totalTimes: Number(primaryOrder?.total_times) || 0,
        servedTimes: allServedTimes,
        servedThisMonth: monthEntries.length > 0,
        couponFee,
        experienceFee,
        laborFee,
        laborUnitFee,
        otherFee,
        manualOtherFee,
        commission: 0,
        totalFee: 0,
        paidSubtotal,
        unpaidSubtotal: 0,
        adjustmentNote: adjustment?.adjustment_note || '',
        days,
        weekSubtotals,
        weekConfirmedSubtotals,
      }];
    }).sort((a, b) => a.customerId.localeCompare(b.customerId, 'zh-CN'));
    const upgradedCustomerCount = customers.filter(customer => customer.hasUpgrade).length;
    const upgradeRate = customers.length
      ? Math.round((upgradedCustomerCount / customers.length) * 1000) / 10
      : 0;
    // 定档属于技师档案主数据，工资结算不得根据当前台账客户临时推导档位。
    // 技师档案目前以 upgrade_rate 持久化定档区间，修改后所有工资查询即时读取新值。
    const profileUpgradeRate = money(therapist.upgrade_rate);
    const tier = salaryTierByUpgradeRate(profileUpgradeRate);
    const storedCommissionRate = therapist.commission_rate === null || therapist.commission_rate === undefined
      ? tier.commissionRate
      : money(therapist.commission_rate);
    const commissionRate = Math.min(100, Math.max(0, storedCommissionRate));
    const calculatedCustomers = customers.map(customer => {
      // 提成是客户套餐应付工资的一部分，不因当前查看月份而清零。
      // 月份筛选只影响当月完成凭证与周结算，不改变套餐本身的提成金额。
      const commission = money(customer.packageAmount * commissionRate / 100);
      const totalFee = money(
        customer.couponFee + customer.laborFee + commission + customer.otherFee
      );
      return {
        ...customer,
        commission,
        totalFee,
        unpaidSubtotal: money(Math.max(0, totalFee - customer.paidSubtotal)),
      };
    });
    return [{
      id: therapist.id,
      name: therapist.name,
      therapistType: therapist.therapist_type || '产康师',
      upgradedCustomerCount,
      upgradeRate,
      profileUpgradeRate,
      tier: tier.label,
      tierKey: tier.key,
      commissionRate,
      customers: calculatedCustomers,
    }];
  });

  const allCustomers = therapists.flatMap(therapist => therapist.customers);
  const monthServedCustomerIds = new Set(input.entries.map(entry => entry.customerId));
  const upgradedCustomerIds = new Set(input.orders
    .filter(order => order.type === '套餐' && dateText(order.purchase_date || order.created_date).startsWith(input.month))
    .map(order => order.customer_id));
  const currentWeek = weeks.find(week => {
    const today = iso(new Date());
    return today >= week.start && today <= week.end;
  }) || weeks[0];
  const summary = {
    customerCount: allCustomers.length,
    totalServiceTimes: allCustomers.reduce((sum, customer) => sum + customer.totalTimes, 0),
    servedTimes: allCustomers.reduce((sum, customer) => sum + customer.servedTimes, 0),
    totalFee: money(allCustomers.reduce((sum, customer) => sum + customer.totalFee, 0)),
    paidSubtotal: money(allCustomers.reduce((sum, customer) => sum + customer.paidSubtotal, 0)),
    unpaidSubtotal: money(allCustomers.reduce((sum, customer) => sum + customer.unpaidSubtotal, 0)),
    currentWeekSubtotal: money(allCustomers.reduce((sum, customer) => sum + money(customer.weekSubtotals[currentWeek?.key]), 0)),
    upgradeRate: monthServedCustomerIds.size
      ? Math.round((upgradedCustomerIds.size / monthServedCustomerIds.size) * 1000) / 10
      : 0,
  };
  return { weeks, therapists, summary };
}
