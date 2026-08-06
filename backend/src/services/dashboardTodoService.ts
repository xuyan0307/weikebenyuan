export interface DashboardTodoQueryScope {
  customerWhere: string;
  orderWhere: string;
  appointmentWhere: string;
}

export interface DashboardTodoCountRows {
  newCustomerCount: number;
  orderCustomerCount: number;
  appointmentCount: number;
  contractCount: number;
}

export function buildDashboardTodoQueries(scope: DashboardTodoQueryScope) {
  const appointmentStartSql =
    "TIMESTAMP(DATE(a.date), TIME(SUBSTRING_INDEX(a.time_slot, '-', 1)))";
  // Appointment dates/times are China-local business values. UTC_TIMESTAMP is stable
  // across RDS/server timezone settings, so convert it explicitly before comparison.
  const chinaNowSql = "DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)";
  return {
    newCustomers: `SELECT COUNT(*) AS cnt
      FROM customers c
      WHERE ${scope.customerWhere}
        AND c.tag IN ('D1','D2','D3')
        AND COALESCE(c.total_orders, 0) = 0
        AND DATE(c.follow_date) = CURDATE()`,
    orderCustomers: `SELECT COUNT(DISTINCT o.customer_id) AS cnt
      FROM orders o
      WHERE ${scope.orderWhere}
        AND DATE(
          JSON_UNQUOTE(JSON_EXTRACT(o.service_people, '$.followRecords[0].date'))
        ) = CURDATE()`,
    contracts: `SELECT COUNT(*) AS cnt
      FROM orders o
      WHERE ${scope.orderWhere}
        AND o.type = '套餐'
        AND COALESCE(o.contract_signed, 0) = 0`,
    appointments: `SELECT COUNT(*) AS cnt
      FROM appointments a
      WHERE ${scope.appointmentWhere}
        AND a.status NOT IN ('已完成','取消','已取消')
        AND (
          a.notify_manual_status = '需通知'
          OR (
            a.notify_manual_status IS NULL
            AND a.notify_replied_at IS NULL
            AND ${appointmentStartSql} > DATE_ADD(${chinaNowSql}, INTERVAL 2 HOUR)
            AND ${appointmentStartSql} <= DATE_ADD(${chinaNowSql}, INTERVAL 24 HOUR)
          )
        )`,
  };
}

export function mapDashboardTodos(counts: DashboardTodoCountRows) {
  return [
    {
      id: 1,
      type: 'new-customer-followup',
      label: '新客待跟进通知',
      count: counts.newCustomerCount,
      color: '#1E88E5',
      urgency: 'high',
    },
    {
      id: 2,
      type: 'order-customer-followup',
      label: '订单客户待跟进通知',
      count: counts.orderCustomerCount,
      color: '#FF7043',
      urgency: 'high',
    },
    {
      id: 3,
      type: 'appointment-notification',
      label: '预约通知',
      count: counts.appointmentCount,
      color: '#FFC107',
      urgency: 'high',
    },
    {
      id: 4,
      type: 'contract-pending-signature',
      label: '合同待回签',
      count: counts.contractCount,
      color: '#E53935',
      urgency: 'high',
    },
  ];
}
