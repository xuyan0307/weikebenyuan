export interface DashboardActor {
  role?: string;
  userId?: string;
}

export function canViewAllDashboard(actor: DashboardActor) {
  return actor.role === 'superadmin' || actor.role === 'admin';
}

export function dashboardCustomerScope(actor: DashboardActor, alias = 'c') {
  if (canViewAllDashboard(actor)) return { where: '1=1', params: [] as string[] };
  return {
    where: `${alias}.advisor_id = ?`,
    params: [actor.userId || ''],
  };
}

export function dashboardOrderScope(actor: DashboardActor, alias = 'o') {
  if (canViewAllDashboard(actor)) return { where: '1=1', params: [] as string[] };
  return {
    where: `(
      EXISTS (
        SELECT 1 FROM customers dashboard_customer
        WHERE dashboard_customer.id = ${alias}.customer_id
          AND dashboard_customer.advisor_id = ?
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM customers current_dashboard_customer
          WHERE current_dashboard_customer.id = ${alias}.customer_id
        )
        AND JSON_UNQUOTE(
          JSON_EXTRACT(${alias}.customer_snapshot, '$.advisorId')
        ) = ?
      )
    )`,
    params: [actor.userId || '', actor.userId || ''],
  };
}

export function dashboardAppointmentScope(actor: DashboardActor, alias = 'a') {
  if (canViewAllDashboard(actor)) return { where: '1=1', params: [] as string[] };
  return {
    where: `(
      EXISTS (
        SELECT 1 FROM customers dashboard_customer
        WHERE dashboard_customer.id = ${alias}.customer_id
          AND dashboard_customer.advisor_id = ?
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM customers current_dashboard_customer
          WHERE current_dashboard_customer.id = ${alias}.customer_id
        )
        AND EXISTS (
          SELECT 1 FROM orders dashboard_order
          WHERE dashboard_order.customer_id = ${alias}.customer_id
            AND JSON_UNQUOTE(
              JSON_EXTRACT(dashboard_order.customer_snapshot, '$.advisorId')
            ) = ?
        )
      )
    )`,
    params: [actor.userId || '', actor.userId || ''],
  };
}
