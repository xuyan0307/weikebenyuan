import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDb } from '../config/database';
import { calculatePercentage } from '../services/dashboardMetrics';
import {
  buildDashboardTodoQueries,
  mapDashboardTodos,
} from '../services/dashboardTodoService';
import {
  dashboardAppointmentScope,
  dashboardCustomerScope,
  dashboardOrderScope,
} from '../services/dashboardDataScope';

const router: Router = Router();

function dashboardActor(req: AuthRequest) {
  return { role: req.userRole, userId: req.userId };
}

function customerScope(req: AuthRequest, alias = 'c') {
  return dashboardCustomerScope(dashboardActor(req), alias).where;
}

function orderScope(req: AuthRequest, alias = 'o') {
  return dashboardOrderScope(dashboardActor(req), alias).where;
}

function customerScopeParams(req: AuthRequest) {
  return dashboardCustomerScope(dashboardActor(req)).params;
}

function orderScopeParams(req: AuthRequest) {
  return dashboardOrderScope(dashboardActor(req)).params;
}

function appointmentScope(req: AuthRequest, alias = 'a') {
  return dashboardAppointmentScope(dashboardActor(req), alias).where;
}

function appointmentScopeParams(req: AuthRequest) {
  return dashboardAppointmentScope(dashboardActor(req)).params;
}

function lastMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'all';

function dashboardPeriod(value: unknown): DashboardPeriod {
  const period = String(value || 'month');
  return ['today', 'week', 'month', 'year', 'all'].includes(period)
    ? period as DashboardPeriod
    : 'month';
}

function periodSql(period: DashboardPeriod, expression: string) {
  if (period === 'today') return `DATE(${expression}) = CURDATE()`;
  if (period === 'week') return `YEARWEEK(${expression}, 1) = YEARWEEK(CURDATE(), 1)`;
  if (period === 'month') return `DATE_FORMAT(${expression}, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`;
  if (period === 'year') return `YEAR(${expression}) = YEAR(CURDATE())`;
  return '1=1';
}

function dateQuery(value: unknown) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function dashboardDateRange(
  period: DashboardPeriod,
  expression: string,
  startDate: string,
  endDate: string
) {
  if (!startDate && !endDate) return { sql: periodSql(period, expression), params: [] as string[] };
  const conditions: string[] = [];
  const params: string[] = [];
  if (startDate) {
    conditions.push(`DATE(${expression}) >= ?`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`DATE(${expression}) <= ?`);
    params.push(endDate);
  }
  return { sql: conditions.join(' AND ') || '1=1', params };
}

function monthsInRange(startDate: string, endDate: string) {
  const fallback = lastMonths(6);
  if (!startDate || !endDate) return fallback;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return fallback;
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last && months.length < 60) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.length ? months : fallback;
}

router.get('/stats', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const period = dashboardPeriod(req.query.period);
    const startDate = dateQuery(req.query.startDate);
    const endDate = dateQuery(req.query.endDate);
    const customerWhere = customerScope(req);
    const orderWhere = orderScope(req);
    const customerPeriod = dashboardDateRange(period, 'c.acquired_at', startDate, endDate);
    const snapshotPeriod = dashboardDateRange(
      period,
      "STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d')",
      startDate,
      endDate
    );
    const orderPeriod = dashboardDateRange(period, 'COALESCE(o.paid_at, o.purchase_date, o.created_at)', startDate, endDate);
    const rankedPeriod = dashboardDateRange(period, 'COALESCE(ranked.paid_at, ranked.purchase_date, ranked.created_at)', startDate, endDate);

    const [[customerRows], [snapshotCustomerRows], [orderRows], [packageUpgradeRows]] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS new_customers
         FROM customers c
         WHERE ${customerWhere} AND ${customerPeriod.sql}`,
        [...customerScopeParams(req), ...customerPeriod.params]
      ),
      db.query(
        `SELECT COUNT(DISTINCT o.customer_id) AS new_customers
         FROM orders o
         WHERE ${orderWhere}
           AND NOT EXISTS (SELECT 1 FROM customers current_customer WHERE current_customer.id=o.customer_id)
           AND ${snapshotPeriod.sql}`,
        [...orderScopeParams(req), ...snapshotPeriod.params]
      ),
      db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN o.pay_status='已付款' THEN o.amount ELSE 0 END), 0) AS total_revenue,
           COALESCE(SUM(CASE WHEN o.pay_status='已付款' AND o.type='体验卡' THEN o.amount ELSE 0 END), 0) AS experience_revenue,
           COALESCE(SUM(CASE WHEN o.pay_status='已付款' AND o.type='套餐' THEN o.amount ELSE 0 END), 0) AS upgrade_revenue,
           SUM(o.pay_status='已付款' AND o.type='体验卡') AS experience_cards,
           SUM(o.pay_status='已付款' AND o.type='套餐') AS upgrades
         FROM orders o
         WHERE ${orderWhere} AND ${orderPeriod.sql}`,
        [...orderScopeParams(req), ...orderPeriod.params]
      ),
      db.query(
        `SELECT COALESCE(SUM(ranked.package_sequence=1), 0) AS first_upgrade_customers,
                COALESCE(SUM(ranked.package_sequence=2), 0) AS second_upgrade_customers,
                COALESCE(SUM(CASE WHEN ranked.package_sequence=2 THEN ranked.amount ELSE 0 END), 0) AS second_upgrade_revenue
         FROM (
           SELECT o.amount, o.paid_at, o.purchase_date, o.created_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY o.customer_id
                    ORDER BY COALESCE(o.paid_at, o.purchase_date, o.created_at), o.created_at, o.id
                  ) AS package_sequence
           FROM orders o
           WHERE ${orderWhere} AND o.pay_status='已付款' AND o.type='套餐'
         ) ranked
         WHERE ranked.package_sequence IN (1, 2)
           AND ${rankedPeriod.sql}`,
        [...orderScopeParams(req), ...rankedPeriod.params]
      ),
    ]);

    const customers = (customerRows as any[])[0] || {};
    const snapshotCustomers = (snapshotCustomerRows as any[])[0] || {};
    const orders = (orderRows as any[])[0] || {};
    const packageUpgrades = (packageUpgradeRows as any[])[0] || {};
    const newCustomers = Number(customers.new_customers || 0) + Number(snapshotCustomers.new_customers || 0);
    const experienceCards = Number(orders.experience_cards || 0);
    const firstUpgradeCustomers = Number(packageUpgrades.first_upgrade_customers || 0);
    const secondUpgradeCustomers = Number(packageUpgrades.second_upgrade_customers || 0);

    res.json({
      period,
      start_date: startDate || null,
      end_date: endDate || null,
      new_customers: newCustomers,
      total_revenue: Number(orders.total_revenue || 0),
      experience_revenue: Number(orders.experience_revenue || 0),
      upgrade_revenue: Number(orders.upgrade_revenue || 0),
      experience_cards: experienceCards,
      purchase_rate: calculatePercentage(experienceCards, newCustomers),
      upgrades: Number(orders.upgrades || 0),
      first_upgrade_customers: firstUpgradeCustomers,
      upgrade_rate: calculatePercentage(firstUpgradeCustomers, experienceCards),
      second_upgrade_count: secondUpgradeCustomers,
      second_upgrade_customers: secondUpgradeCustomers,
      second_upgrade_rate: calculatePercentage(secondUpgradeCustomers, firstUpgradeCustomers),
      second_upgrade_revenue: Number(packageUpgrades.second_upgrade_revenue || 0),
    });
  } catch (err) { next(err); }
});

router.get('/recent', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const customerWhere = customerScope(req);
    const orderWhere = orderScope(req);
    const appointmentWhere = appointmentScope(req);

    const [[customers], [orders], [appointments]] = await Promise.all([
      db.query(
        `SELECT c.customer_code AS id, c.name, c.follow_status, c.acquired_at
         FROM customers c WHERE ${customerWhere}
         ORDER BY c.acquired_at DESC, c.created_at DESC LIMIT 5`,
        customerScopeParams(req)
      ),
      db.query(
        `SELECT o.order_no AS id, o.amount, o.pay_status, o.created_at,
                JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.name')) AS customer_name
         FROM orders o WHERE ${orderWhere}
         ORDER BY o.created_at DESC LIMIT 5`,
        orderScopeParams(req)
      ),
      db.query(
        `SELECT a.appointment_no AS id, a.date, a.time_slot, a.status,
                COALESCE(c.name, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.name'))) AS customer_name,
                t.name AS therapist_name
         FROM appointments a
         LEFT JOIN customers c ON c.id=a.customer_id
         LEFT JOIN orders o ON o.id=(
           SELECT latest_order.id FROM orders latest_order
           WHERE latest_order.customer_id=a.customer_id
           ORDER BY latest_order.created_at DESC LIMIT 1
         )
         LEFT JOIN therapists t ON t.id=a.therapist_id
         WHERE ${appointmentWhere}
         ORDER BY a.date DESC, a.created_at DESC LIMIT 5`,
        appointmentScopeParams(req)
      ),
    ]);
    res.json({ customers, orders, appointments });
  } catch (err) { next(err); }
});

router.get('/todos', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const customerWhere = customerScope(req);
    const orderWhere = orderScope(req);
    const appointmentWhere = appointmentScope(req);
    const queries = buildDashboardTodoQueries({
      customerWhere,
      orderWhere,
      appointmentWhere,
    });
    const [[customerRows], [orderRows], [appointmentRows], [contractRows]] = await Promise.all([
      db.query(
        queries.newCustomers,
        customerScopeParams(req)
      ),
      db.query(
        queries.orderCustomers,
        orderScopeParams(req)
      ),
      db.query(
        queries.appointments,
        appointmentScopeParams(req)
      ),
      db.query(
        queries.contracts,
        orderScopeParams(req)
      ),
    ]);
    res.json(mapDashboardTodos({
      newCustomerCount: Number((customerRows as any[])[0]?.cnt || 0),
      orderCustomerCount: Number((orderRows as any[])[0]?.cnt || 0),
      appointmentCount: Number((appointmentRows as any[])[0]?.cnt || 0),
      contractCount: Number((contractRows as any[])[0]?.cnt || 0),
    }));
  } catch (err) { next(err); }
});

router.get('/chart', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const startDate = dateQuery(req.query.startDate);
    const endDate = dateQuery(req.query.endDate);
    const months = monthsInRange(startDate, endDate);
    const firstDate = startDate || `${months[0]}-01`;
    const lastDate = endDate || '';
    const rangeEndSql = lastDate ? ' AND DATE(%EXPR%) <= ?' : '';
    const orderWhere = orderScope(req);
    const customerWhere = customerScope(req);

    const [[orderRows], [poolCustomerRows], [orderedCustomerRows]] = await Promise.all([
      db.query(
        `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month,
                COALESCE(SUM(CASE WHEN o.pay_status='已付款' THEN o.amount ELSE 0 END), 0) AS revenue,
                SUM(o.type='体验卡') AS experience_cards,
                SUM(o.is_upgrade=1) AS upgrades
         FROM orders o WHERE ${orderWhere} AND o.created_at >= ?${rangeEndSql.replace('%EXPR%', 'o.created_at')}
         GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')`,
        [...orderScopeParams(req), firstDate, ...(lastDate ? [lastDate] : [])]
      ),
      db.query(
        `SELECT DATE_FORMAT(c.acquired_at, '%Y-%m') AS month, COUNT(*) AS new_customers
         FROM customers c WHERE ${customerWhere} AND c.acquired_at >= ?${rangeEndSql.replace('%EXPR%', 'c.acquired_at')}
         GROUP BY DATE_FORMAT(c.acquired_at, '%Y-%m')`,
        [...customerScopeParams(req), firstDate, ...(lastDate ? [lastDate] : [])]
      ),
      db.query(
        `SELECT DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d'), '%Y-%m') AS month,
                COUNT(DISTINCT o.customer_id) AS new_customers
         FROM orders o
         WHERE ${orderWhere}
           AND NOT EXISTS (SELECT 1 FROM customers current_customer WHERE current_customer.id=o.customer_id)
           AND STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d') >= ?${lastDate ? " AND DATE(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d')) <= ?" : ''}
         GROUP BY DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d'), '%Y-%m')`,
        [...orderScopeParams(req), firstDate, ...(lastDate ? [lastDate] : [])]
      ),
    ]);

    const byMonth = new Map(months.map(month => [month, {
      month, revenue: 0, new_customers: 0, experience_cards: 0, upgrades: 0,
    }]));
    for (const row of orderRows as any[]) {
      const item = byMonth.get(row.month);
      if (!item) continue;
      item.revenue = Number(row.revenue) || 0;
      item.experience_cards = Number(row.experience_cards) || 0;
      item.upgrades = Number(row.upgrades) || 0;
    }
    for (const rows of [poolCustomerRows, orderedCustomerRows] as any[]) {
      for (const row of rows as any[]) {
        const item = byMonth.get(row.month);
        if (item) item.new_customers += Number(row.new_customers) || 0;
      }
    }
    res.json(Array.from(byMonth.values()));
  } catch (err) { next(err); }
});

export { router as dashboardRouter };
