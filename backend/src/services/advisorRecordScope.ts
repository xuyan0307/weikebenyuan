import {
  DashboardActor,
  dashboardCustomerScope,
  dashboardOrderScope,
} from './dashboardDataScope';

export function canBrowseAllAdvisorRecords(role: string | undefined): boolean {
  return role === 'superadmin' || role === 'admin' || role === 'service';
}

export function advisorCustomerRecordScope(actor: DashboardActor, alias = 'c') {
  if (canBrowseAllAdvisorRecords(actor.role)) {
    return { where: '1=1', params: [] as string[] };
  }
  return dashboardCustomerScope(actor, alias);
}

export function advisorOrderRecordScope(actor: DashboardActor, alias = 'o') {
  if (canBrowseAllAdvisorRecords(actor.role)) {
    return { where: '1=1', params: [] as string[] };
  }
  return dashboardOrderScope(actor, alias);
}
