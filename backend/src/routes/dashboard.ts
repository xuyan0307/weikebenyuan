import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDb } from '../config/database';

const router: Router = Router();

function canViewAll(req: AuthRequest): boolean {
  return req.userRole === 'superadmin' || req.userRole === 'admin';
}

function customerScope(req: AuthRequest, alias = 'c') {
  return canViewAll(req) ? '1=1' : `${alias}.advisor_id = ?`;
}

function orderScope(req: AuthRequest, alias = 'o') {
  return canViewAll(req)
    ? '1=1'
    : `JSON_UNQUOTE(JSON_EXTRACT(${alias}.customer_snapshot, '$.advisorId')) = ?`;
}

function customerScopeParams(req: AuthRequest) {
  return canViewAll(req) ? [] : [req.userId || ''];
}

function orderScopeParams(req: AuthRequest) {
  return canViewAll(req) ? [] : [req.userId || ''];
}

function appointmentScope(req: AuthRequest, alias = 'a') {
  if (canViewAll(req)) return '1=1';
  return `(
    ${alias}.customer_id IN (SELECT c.id FROM customers c WHERE c.advisor_id = ?)
    OR ${alias}.customer_id IN (
      SELECT o.customer_id FROM orders o
      WHERE JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId')) = ?
    )
  )`;
}

function appointmentScopeParams(req: AuthRequest) {
  return canViewAll(req) ? [] : [req.userId || '', req.userId || ''];
}

function serviceScope(req: AuthRequest, alias = 's') {
  if (canViewAll(req)) return '1=1';
  return `(
    ${alias}.customer_id IN (SELECT c.id FROM customers c WHERE c.advisor_id = ?)
    OR ${alias}.customer_id IN (
      SELECT o.customer_id FROM orders o
      WHERE JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId')) = ?
    )
  )`;
}

function lastMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

router.get('/stats', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const customerWhere = customerScope(req);
    const orderWhere = orderScope(req);
    const appointmentWhere = appointmentScope(req);
    const serviceWhere = serviceScope(req);

    const [[customerRows], [orderRows], [appointmentRows], [serviceRows], [therapistRows]] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS pool_customers,
                SUM(follow_status='待跟进') AS pending_follow,
                SUM(follow_status='跟进中') AS following,
                SUM(follow_status='已成交') AS dealt
         FROM customers c WHERE ${customerWhere}`,
        customerScopeParams(req)
      ),
      db.query(
        `SELECT COUNT(DISTINCT customer_id) AS ordered_customers,
                COUNT(*) AS total_orders,
                SUM(pay_status='待付款') AS pending_pay,
                SUM(pay_status='已付款') AS paid_orders,
                SUM(contract_signed=0) AS pending_contract,
                COALESCE(SUM(CASE WHEN pay_status='已付款' THEN amount ELSE 0 END), 0) AS total_revenue
         FROM orders o WHERE ${orderWhere}`,
        orderScopeParams(req)
      ),
      db.query(
        `SELECT SUM(status='待确认') AS pending_appt,
                SUM(date=CURDATE()) AS today_appt
         FROM appointments a WHERE ${appointmentWhere}`,
        appointmentScopeParams(req)
      ),
      db.query(
        `SELECT COUNT(*) AS service_records FROM service_records s WHERE ${serviceWhere}`,
        canViewAll(req) ? [] : [req.userId || '', req.userId || '']
      ),
      canViewAll(req)
        ? db.query("SELECT COUNT(*) AS active_therapists FROM therapists WHERE status='在职'")
        : db.query(
          `SELECT COUNT(DISTINCT a.therapist_id) AS active_therapists
           FROM appointments a JOIN therapists t ON t.id=a.therapist_id
           WHERE ${appointmentWhere} AND t.status='在职'`,
          appointmentScopeParams(req)
        ),
    ]);

    const customers = (customerRows as any[])[0] || {};
    const orders = (orderRows as any[])[0] || {};
    const appointments = (appointmentRows as any[])[0] || {};
    const services = (serviceRows as any[])[0] || {};
    const therapists = (therapistRows as any[])[0] || {};

    res.json({
      total_customers: Number(customers.pool_customers || 0) + Number(orders.ordered_customers || 0),
      pending_follow: Number(customers.pending_follow || 0),
      following: Number(customers.following || 0),
      dealt: Number(customers.dealt || 0),
      total_orders: Number(orders.total_orders || 0),
      pending_pay: Number(orders.pending_pay || 0),
      paid_orders: Number(orders.paid_orders || 0),
      pending_contract: Number(orders.pending_contract || 0),
      pending_appt: Number(appointments.pending_appt || 0),
      today_appt: Number(appointments.today_appt || 0),
      active_therapists: Number(therapists.active_therapists || 0),
      service_records: Number(services.service_records || 0),
      total_revenue: Number(orders.total_revenue || 0),
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
    const [[contractRows], [customerRows], [serviceRows], [cancelRows]] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS cnt FROM orders o
         WHERE ${orderWhere} AND o.contract_signed=0 AND o.pay_status='已付款'`,
        orderScopeParams(req)
      ),
      db.query(
        `SELECT COUNT(*) AS cnt FROM customers c
         WHERE ${customerWhere} AND c.follow_status='待跟进'`,
        customerScopeParams(req)
      ),
      db.query(
        `SELECT COUNT(*) AS cnt FROM orders o
         WHERE ${orderWhere} AND o.pay_status='已付款' AND o.used_times < o.total_times`,
        orderScopeParams(req)
      ),
      db.query(
        `SELECT COUNT(*) AS cnt FROM appointments a
         WHERE ${appointmentWhere} AND a.status='待确认'`,
        appointmentScopeParams(req)
      ),
    ]);
    res.json([
      { id: 1, type: 'contract', label: '合同未回签', count: Number((contractRows as any[])[0]?.cnt || 0), color: '#F44336', urgency: 'high' },
      { id: 2, type: 'appointment', label: '待预约客户', count: Number((customerRows as any[])[0]?.cnt || 0), color: '#FFC107', urgency: 'medium' },
      { id: 3, type: 'service', label: '待服务订单', count: Number((serviceRows as any[])[0]?.cnt || 0), color: '#1E88E5', urgency: 'medium' },
      { id: 4, type: 'cancel', label: '待确认取消', count: Number((cancelRows as any[])[0]?.cnt || 0), color: '#FF7043', urgency: 'high' },
    ]);
  } catch (err) { next(err); }
});

router.get('/chart', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const months = lastMonths(6);
    const firstMonth = `${months[0]}-01`;
    const orderWhere = orderScope(req);
    const customerWhere = customerScope(req);

    const [[orderRows], [poolCustomerRows], [orderedCustomerRows]] = await Promise.all([
      db.query(
        `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month,
                COALESCE(SUM(CASE WHEN o.pay_status='已付款' THEN o.amount ELSE 0 END), 0) AS revenue,
                SUM(o.type='体验卡') AS experience_cards,
                SUM(o.is_upgrade=1) AS upgrades
         FROM orders o WHERE ${orderWhere} AND o.created_at >= ?
         GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')`,
        [...orderScopeParams(req), firstMonth]
      ),
      db.query(
        `SELECT DATE_FORMAT(c.acquired_at, '%Y-%m') AS month, COUNT(*) AS new_customers
         FROM customers c WHERE ${customerWhere} AND c.acquired_at >= ?
         GROUP BY DATE_FORMAT(c.acquired_at, '%Y-%m')`,
        [...customerScopeParams(req), firstMonth]
      ),
      db.query(
        `SELECT DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d'), '%Y-%m') AS month,
                COUNT(DISTINCT o.customer_id) AS new_customers
         FROM orders o
         WHERE ${orderWhere}
           AND STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d') >= ?
         GROUP BY DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.acquiredAt')), '%Y-%m-%d'), '%Y-%m')`,
        [...orderScopeParams(req), firstMonth]
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
