import { parseJson } from '../utils/serialization';
import { calculatePercentage } from './dashboardMetrics';

export type DashboardGranularity = 'day' | 'week' | 'month';

export interface DashboardCustomerSource {
  id: string;
  acquiredAt: string;
}

export interface DashboardOrderSource {
  customerId: string;
  customerAcquiredAt: string;
  type: string;
  amount: number;
  payStatus: string;
  purchaseDate: string;
  createdDate: string;
  servicePeople: unknown;
}

interface SaleStage {
  customerId: string;
  kind: 'experience' | 'package';
  packageNumber: number;
  amount: number;
  date: string;
}

export interface DashboardAnalyticsInput {
  customers: DashboardCustomerSource[];
  orders: DashboardOrderSource[];
  startDate?: string;
  endDate?: string;
}

function dateOnly(value: unknown) {
  const matched = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return matched?.[0] || '';
}

function inRange(value: string, startDate = '', endDate = '') {
  if (!value) return false;
  if (startDate && value < startDate) return false;
  if (endDate && value > endDate) return false;
  return true;
}

function stageNumber(stage: Record<string, unknown>, fallback: number) {
  const matched = String(stage.id || stage.label || '').match(/\d+/);
  return Math.max(1, Number(matched?.[0]) || fallback);
}

function isRefunded(value: unknown) {
  return String(value || '').includes('退款');
}

export function dashboardSaleStages(orders: DashboardOrderSource[]): SaleStage[] {
  const result: SaleStage[] = [];
  for (const order of orders) {
    const people = parseJson<Record<string, unknown>>(order.servicePeople, {});
    const experience = people.experienceSnapshot;
    if (experience && typeof experience === 'object' && !Array.isArray(experience)) {
      const stage = experience as Record<string, unknown>;
      if (!isRefunded(stage.payStatus)) {
        result.push({
          customerId: order.customerId,
          kind: 'experience',
          packageNumber: 0,
          amount: Number(stage.amount) || 0,
          date: dateOnly(stage.purchaseDate) || dateOnly(order.createdDate),
        });
      }
    } else if (order.type === '体验卡' && !isRefunded(order.payStatus)) {
      result.push({
        customerId: order.customerId,
        kind: 'experience',
        packageNumber: 0,
        amount: Number(order.amount) || 0,
        date: dateOnly(order.purchaseDate) || dateOnly(order.createdDate),
      });
    }

    const history = Array.isArray(people.packageHistory)
      ? people.packageHistory.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
      : [];
    const packages = new Map<number, SaleStage>();
    history.forEach((stage, index) => {
      if (isRefunded(stage.payStatus)) return;
      const number = stageNumber(stage, index + 1);
      packages.set(number, {
        customerId: order.customerId,
        kind: 'package',
        packageNumber: number,
        amount: Number(stage.amount) || 0,
        date: dateOnly(stage.purchaseDate) || dateOnly(order.createdDate),
      });
    });
    if (order.type === '套餐' && !isRefunded(order.payStatus)) {
      const currentNumber = Math.max(1, Number(people.activePackageNumber) || history.length + 1);
      packages.set(currentNumber, {
        customerId: order.customerId,
        kind: 'package',
        packageNumber: currentNumber,
        amount: Number(order.amount) || 0,
        date: dateOnly(order.purchaseDate) || dateOnly(order.createdDate),
      });
    }
    result.push(...packages.values());
  }
  return result;
}

function newCustomerEvents(input: DashboardAnalyticsInput) {
  const events = new Map<string, string>();
  input.customers.forEach(customer => {
    const date = dateOnly(customer.acquiredAt);
    if (date) events.set(customer.id, date);
  });
  input.orders.forEach(order => {
    const date = dateOnly(order.customerAcquiredAt);
    const current = events.get(order.customerId);
    if (date && (!current || date < current)) events.set(order.customerId, date);
  });
  return events;
}

export function buildDashboardStats(input: DashboardAnalyticsInput) {
  const stages = dashboardSaleStages(input.orders).filter(stage =>
    inRange(stage.date, input.startDate, input.endDate)
  );
  const customerEvents = newCustomerEvents(input);
  const newCustomers = [...customerEvents.values()].filter(date =>
    inRange(date, input.startDate, input.endDate)
  ).length;
  const experienceCustomerIds = new Set(stages.filter(stage => stage.kind === 'experience').map(stage => stage.customerId));
  const firstPackageCustomerIds = new Set(stages.filter(stage => stage.kind === 'package' && stage.packageNumber === 1).map(stage => stage.customerId));
  const secondPackageCustomerIds = new Set(stages.filter(stage => stage.kind === 'package' && stage.packageNumber === 2).map(stage => stage.customerId));
  const experienceRevenue = stages.filter(stage => stage.kind === 'experience').reduce((sum, stage) => sum + stage.amount, 0);
  const upgradeRevenue = stages.filter(stage => stage.kind === 'package').reduce((sum, stage) => sum + stage.amount, 0);
  const secondUpgradeRevenue = stages.filter(stage => stage.kind === 'package' && stage.packageNumber === 2).reduce((sum, stage) => sum + stage.amount, 0);
  return {
    new_customers: newCustomers,
    total_revenue: experienceRevenue + upgradeRevenue,
    experience_revenue: experienceRevenue,
    upgrade_revenue: upgradeRevenue,
    experience_cards: experienceCustomerIds.size,
    purchase_rate: calculatePercentage(experienceCustomerIds.size, newCustomers),
    upgrades: firstPackageCustomerIds.size,
    first_upgrade_customers: firstPackageCustomerIds.size,
    upgrade_rate: calculatePercentage(firstPackageCustomerIds.size, experienceCustomerIds.size),
    second_upgrade_count: secondPackageCustomerIds.size,
    second_upgrade_customers: secondPackageCustomerIds.size,
    second_upgrade_rate: calculatePercentage(secondPackageCustomerIds.size, firstPackageCustomerIds.size),
    second_upgrade_revenue: secondUpgradeRevenue,
  };
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function nextMonth(value: string) {
  const date = new Date(`${monthStart(value)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function weekStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function bucketStart(value: string, granularity: DashboardGranularity) {
  if (granularity === 'month') return monthStart(value);
  if (granularity === 'week') return weekStart(value);
  return value;
}

function bucketLabel(value: string, granularity: DashboardGranularity) {
  if (granularity === 'month') return `${value.slice(0, 7)}`;
  if (granularity === 'week') return `${value.slice(5)}~${addDays(value, 6).slice(5)}`;
  return value.slice(5);
}

function advanceBucket(value: string, granularity: DashboardGranularity) {
  if (granularity === 'month') return nextMonth(value);
  return addDays(value, granularity === 'week' ? 7 : 1);
}

export function buildDashboardChart(input: DashboardAnalyticsInput, granularity: DashboardGranularity) {
  const stages = dashboardSaleStages(input.orders);
  const customers = newCustomerEvents(input);
  const allDates = [
    ...stages.map(stage => stage.date),
    ...customers.values(),
  ].filter(Boolean).sort();
  const start = input.startDate || allDates[0] || dateOnly(new Date().toISOString());
  const end = input.endDate || allDates.at(-1) || start;
  const firstBucket = bucketStart(start, granularity);
  const lastBucket = bucketStart(end, granularity);
  const buckets = new Map<string, {
    period: string;
    label: string;
    revenue: number;
    new_customers: number;
    experience_cards: number;
    upgrades: number;
    second_upgrades: number;
  }>();
  for (let cursor = firstBucket, guard = 0; cursor <= lastBucket && guard < 5000; cursor = advanceBucket(cursor, granularity), guard += 1) {
    buckets.set(cursor, {
      period: cursor,
      label: bucketLabel(cursor, granularity),
      revenue: 0,
      new_customers: 0,
      experience_cards: 0,
      upgrades: 0,
      second_upgrades: 0,
    });
  }
  const experienceByBucket = new Map<string, Set<string>>();
  const firstPackagesByBucket = new Map<string, Set<string>>();
  const secondPackagesByBucket = new Map<string, Set<string>>();
  stages.filter(stage => inRange(stage.date, start, end)).forEach(stage => {
    const key = bucketStart(stage.date, granularity);
    const bucket = buckets.get(key);
    if (!bucket) return;
    bucket.revenue += stage.amount;
    const target = stage.kind === 'experience'
      ? experienceByBucket
      : stage.packageNumber === 1
        ? firstPackagesByBucket
        : stage.packageNumber === 2
          ? secondPackagesByBucket
          : null;
    if (target) target.set(key, new Set([...(target.get(key) || []), stage.customerId]));
  });
  customers.forEach(date => {
    if (!inRange(date, start, end)) return;
    const bucket = buckets.get(bucketStart(date, granularity));
    if (bucket) bucket.new_customers += 1;
  });
  buckets.forEach((bucket, key) => {
    bucket.experience_cards = experienceByBucket.get(key)?.size || 0;
    bucket.upgrades = firstPackagesByBucket.get(key)?.size || 0;
    bucket.second_upgrades = secondPackagesByBucket.get(key)?.size || 0;
  });
  return [...buckets.values()];
}
