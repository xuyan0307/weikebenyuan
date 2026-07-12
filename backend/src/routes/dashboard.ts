import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDb } from '../config/database';

const router: Router = Router();

function canViewAll(req: AuthRequest): boolean {
  return req.userRole === 'superadmin' || req.userRole === 'admin';
}

function scopeCondition(alias = 'c') {
  return `(? = 1 OR ${alias}.advisor_id = ?)`;
}

function scopeParams(req: AuthRequest) {
  return [canViewAll(req) ? 1 : 0, req.userId || ''] as any[];
}

function lastMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
}

router.get('/stats', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const scopedCustomer = scopeCondition('c');
    const scopedOrderJoin = `orders o JOIN customers c ON c.id = o.customer_id WHERE ${scopedCustomer}`;
    const scopedAppointmentJoin = `appointments a JOIN customers c ON c.id = a.customer_id WHERE ${scopedCustomer}`;
    const scopedServiceRecordJoin = `service_records s JOIN customers c ON c.id = s.customer_id WHERE ${scopedCustomer}`;

    const adminTherapistSql = `(SELECT COUNT(*) FROM therapists WHERE status='在职') AS active_therapists`;
    const scopedTherapistSql = `(SELECT COUNT(DISTINCT t.id)
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN therapists t ON t.id = a.therapist_id
       WHERE ${scopedCustomer} AND t.status='在职') AS active_therapists`;

    const params = [
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...(canViewAll(req) ? [] : scopeParams(req)),
      ...scopeParams(req),
      ...scopeParams(req),
    ];

    const [rows] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM customers c WHERE ${scopedCustomer}) AS total_customers,
         (SELECT COUNT(*) FROM customers c WHERE ${scopedCustomer} AND c.follow_status='待跟进') AS pending_follow,
         (SELECT COUNT(*) FROM customers c WHERE ${scopedCustomer} AND c.follow_status='跟进中') AS following,
         (SELECT COUNT(*) FROM customers c WHERE ${scopedCustomer} AND c.follow_status='已成交') AS dealt,
         (SELECT COUNT(*) FROM ${scopedOrderJoin}) AS total_orders,
         (SELECT COUNT(*) FROM ${scopedOrderJoin} AND o.pay_status='待付款') AS pending_pay,
         (SELECT COUNT(*) FROM ${scopedOrderJoin} AND o.pay_status='已付款') AS paid_orders,
         (SELECT COUNT(*) FROM ${scopedOrderJoin} AND o.contract_signed=0) AS pending_contract,
         (SELECT COUNT(*) FROM ${scopedAppointmentJoin} AND a.status='待确认') AS pending_appt,
         (SELECT COUNT(*) FROM ${scopedAppointmentJoin} AND a.date=CURDATE()) AS today_appt,
         ${canViewAll(req) ? adminTherapistSql : scopedTherapistSql},
         (SELECT COUNT(*) FROM ${scopedServiceRecordJoin}) AS service_records,
         (SELECT COALESCE(SUM(o.amount),0) FROM ${scopedOrderJoin} AND o.pay_status='已付款') AS total_revenue`,
      params
    );
    res.json((rows as any[])[0] || {});
  } catch (err) { next(err); }
});

router.get('/recent', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const scopedCustomer = scopeCondition('c');
    const params = scopeParams(req);

    const [customers] = await db.query(
      `SELECT c.customer_code AS id, c.name, c.follow_status, c.created_at
       FROM customers c
       WHERE ${scopedCustomer}
       ORDER BY c.created_at DESC LIMIT 5`,
      params
    );
    const [orders] = await db.query(
      `SELECT o.order_no AS id, o.amount, o.pay_status, o.created_at, c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
       WHERE ${scopedCustomer}
       ORDER BY o.created_at DESC LIMIT 5`,
      params
    );
    const [appts] = await db.query(
      `SELECT a.appointment_no AS id, a.date, a.time_slot, a.status, c.name AS customer_name, t.name AS therapist_name
       FROM appointments a
       LEFT JOIN customers c ON c.id=a.customer_id
       LEFT JOIN therapists t ON t.id=a.therapist_id
       WHERE ${scopedCustomer}
       ORDER BY a.date DESC, a.created_at DESC LIMIT 5`,
      params
    );
    res.json({ customers, orders, appointments: appts });
  } catch (err) { next(err); }
});

router.get('/todos', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const scopedCustomer = scopeCondition('c');
    const scopedOrderJoin = `orders o JOIN customers c ON c.id = o.customer_id WHERE ${scopedCustomer}`;
    const scopedAppointmentJoin = `appointments a JOIN customers c ON c.id = a.customer_id WHERE ${scopedCustomer}`;

    const params = [
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
      ...scopeParams(req),
    ];

    const [rows] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM ${scopedOrderJoin} AND o.contract_signed=0 AND o.pay_status='已付款') AS contract,
         (SELECT COUNT(*) FROM customers c WHERE ${scopedCustomer} AND c.follow_status='待跟进') AS appointment,
         (SELECT COUNT(*) FROM ${scopedOrderJoin} AND o.pay_status='已付款' AND o.used_times < o.total_times) AS service,
         (SELECT COUNT(*) FROM ${scopedAppointmentJoin} AND a.status IN ('待确认','待取消','待确认取消')) AS cancel`,
      params
    );
    const r = (rows as any[])[0] || {};
    res.json([
      { id: 1, type: 'contract', label: '合同未回签', count: Number(r.contract) || 0, color: '#F44336', urgency: 'high' },
      { id: 2, type: 'appointment', label: '待预约客户', count: Number(r.appointment) || 0, color: '#FFC107', urgency: 'medium' },
      { id: 3, type: 'service', label: '待服务订单', count: Number(r.service) || 0, color: '#1E88E5', urgency: 'medium' },
      { id: 4, type: 'cancel', label: '待确认取消', count: Number(r.cancel) || 0, color: '#FF7043', urgency: 'high' },
    ]);
  } catch (err) { next(err); }
});

router.get('/chart', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const scopedCustomer = scopeCondition('c');
    const scopedParams = scopeParams(req);
    const months = lastMonths(6);
    const firstMonth = `${months[0]}-01`;

    const [orderRows] = await db.query(
      `SELECT
         DATE_FORMAT(o.created_at, '%Y-%m') AS month,
         COALESCE(SUM(CASE WHEN o.pay_status='已付款' THEN o.amount ELSE 0 END),0) AS revenue,
         SUM(CASE WHEN o.type='体验卡' THEN 1 ELSE 0 END) AS experience_cards,
         SUM(CASE WHEN o.is_upgrade=1 THEN 1 ELSE 0 END) AS upgrades
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE ${scopedCustomer} AND o.created_at >= ?
       GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')`,
      [...scopedParams, firstMonth]
    );

    const [customerRows] = await db.query(
      `SELECT DATE_FORMAT(c.created_at, '%Y-%m') AS month, COUNT(*) AS new_customers
       FROM customers c
       WHERE ${scopedCustomer} AND c.created_at >= ?
       GROUP BY DATE_FORMAT(c.created_at, '%Y-%m')`,
      [...scopedParams, firstMonth]
    );

    const byMonth = new Map(months.map(month => [month, {
      month,
      revenue: 0,
      new_customers: 0,
      experience_cards: 0,
      upgrades: 0,
    }]));

    for (const row of orderRows as any[]) {
      const item = byMonth.get(row.month);
      if (!item) continue;
      item.revenue = Number(row.revenue) || 0;
      item.experience_cards = Number(row.experience_cards) || 0;
      item.upgrades = Number(row.upgrades) || 0;
    }
    for (const row of customerRows as any[]) {
      const item = byMonth.get(row.month);
      if (!item) continue;
      item.new_customers = Number(row.new_customers) || 0;
    }

    res.json(Array.from(byMonth.values()));
  } catch (err) { next(err); }
});

export { router as dashboardRouter };
