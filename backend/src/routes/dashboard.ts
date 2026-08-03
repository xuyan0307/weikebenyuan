import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDb } from '../config/database';
import {
  buildDashboardTodoQueries,
  mapDashboardTodos,
} from '../services/dashboardTodoService';
import {
  dashboardAppointmentScope,
  dashboardCustomerScope,
  dashboardOrderScope,
} from '../services/dashboardDataScope';
import {
  buildDashboardChart,
  buildDashboardStats,
  DashboardGranularity,
  DashboardOrderSource,
} from '../services/dashboardAnalyticsService';
import { parseJson } from '../utils/serialization';

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

function chartGranularity(value: unknown): DashboardGranularity {
  const granularity = String(value || 'month');
  return ['day', 'week', 'month'].includes(granularity)
    ? granularity as DashboardGranularity
    : 'month';
}

function dateOnly(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value as Date);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function periodBounds(period: DashboardPeriod, startDate: string, endDate: string) {
  if (startDate || endDate) return { startDate, endDate };
  if (period === 'all') return { startDate: '', endDate: '' };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (period === 'today') return { startDate: format(today), endDate: format(today) };
  if (period === 'week') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() || 7) - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: format(monday), endDate: format(sunday) };
  }
  if (period === 'year') return { startDate: `${today.getFullYear()}-01-01`, endDate: `${today.getFullYear()}-12-31` };
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, endDate: format(monthEnd) };
}

async function dashboardSources(req: AuthRequest) {
  const db = getDb();
  const [[customerRows], [orderRows]] = await Promise.all([
    db.query(
      `SELECT c.id, DATE_FORMAT(c.acquired_at, '%Y-%m-%d') AS acquired_at
       FROM customers c WHERE ${customerScope(req)}`,
      customerScopeParams(req)
    ),
    db.query(
      `SELECT o.customer_id, o.customer_snapshot, o.type, o.amount, o.pay_status,
              DATE_FORMAT(o.purchase_date, '%Y-%m-%d') AS purchase_date,
              DATE_FORMAT(o.created_at, '%Y-%m-%d') AS created_date,
              o.service_people
       FROM orders o WHERE ${orderScope(req)}`,
      orderScopeParams(req)
    ),
  ]);
  return {
    customers: (customerRows as RowDataPacket[]).map(row => ({
      id: String(row.id || ''),
      acquiredAt: dateOnly(row.acquired_at),
    })),
    orders: (orderRows as RowDataPacket[]).map(row => {
      const snapshot = parseJson<Record<string, unknown>>(row.customer_snapshot, {});
      return {
        customerId: String(row.customer_id || snapshot.id || ''),
        customerAcquiredAt: dateOnly(snapshot.acquiredAt),
        type: String(row.type || ''),
        amount: Number(row.amount) || 0,
        payStatus: String(row.pay_status || ''),
        purchaseDate: dateOnly(row.purchase_date),
        createdDate: dateOnly(row.created_date),
        servicePeople: row.service_people,
      } satisfies DashboardOrderSource;
    }),
  };
}

type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'all';

function dashboardPeriod(value: unknown): DashboardPeriod {
  const period = String(value || 'month');
  return ['today', 'week', 'month', 'year', 'all'].includes(period)
    ? period as DashboardPeriod
    : 'month';
}

function dateQuery(value: unknown) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

router.get('/stats', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const period = dashboardPeriod(req.query.period);
    const startDate = dateQuery(req.query.startDate);
    const endDate = dateQuery(req.query.endDate);
    const bounds = periodBounds(period, startDate, endDate);
    const sources = await dashboardSources(req);
    const stats = buildDashboardStats({ ...sources, ...bounds });
    res.json({
      period,
      start_date: bounds.startDate || null,
      end_date: bounds.endDate || null,
      ...stats,
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
    const startDate = dateQuery(req.query.startDate);
    const endDate = dateQuery(req.query.endDate);
    const sources = await dashboardSources(req);
    res.json(buildDashboardChart(
      { ...sources, startDate, endDate },
      chartGranularity(req.query.granularity)
    ));
  } catch (err) { next(err); }
});

export { router as dashboardRouter };
