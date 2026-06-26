import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getDb } from '../config/database';

const router = Router();

router.get('/stats', authenticateToken, async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM customers) AS total_customers,
         (SELECT COUNT(*) FROM customers WHERE follow_status='待跟进') AS pending_follow,
         (SELECT COUNT(*) FROM customers WHERE follow_status='跟进中') AS following,
         (SELECT COUNT(*) FROM customers WHERE follow_status='已成交') AS dealt,
         (SELECT COUNT(*) FROM orders) AS total_orders,
         (SELECT COUNT(*) FROM orders WHERE pay_status='待付款') AS pending_pay,
         (SELECT COUNT(*) FROM orders WHERE pay_status='已付款') AS paid_orders,
         (SELECT COUNT(*) FROM orders WHERE contract_signed=0) AS pending_contract,
         (SELECT COUNT(*) FROM appointments WHERE status='待确认') AS pending_appt,
         (SELECT COUNT(*) FROM appointments WHERE date=CURDATE()) AS today_appt,
         (SELECT COUNT(*) FROM therapists WHERE status='在职') AS active_therapists,
         (SELECT COALESCE(SUM(amount),0) FROM orders WHERE pay_status='已付款') AS total_revenue`
    );
    res.json((rows as any[])[0] || {});
  } catch (err) { next(err); }
});

router.get('/recent', authenticateToken, async (_req, res, next) => {
  try {
    const db = getDb();
    const [customers] = await db.query('SELECT customer_code AS id, name, follow_status, created_at FROM customers ORDER BY created_at DESC LIMIT 5');
    const [orders] = await db.query(
      `SELECT o.order_no AS id, o.amount, o.pay_status, o.created_at, c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
       ORDER BY o.created_at DESC LIMIT 5`
    );
    const [appts] = await db.query(
      `SELECT a.appointment_no AS id, a.date, a.time_slot, a.status, c.name AS customer_name, t.name AS therapist_name
       FROM appointments a
       LEFT JOIN customers c ON c.id=a.customer_id
       LEFT JOIN therapists t ON t.id=a.therapist_id
       ORDER BY a.date DESC, a.created_at DESC LIMIT 5`
    );
    res.json({ customers, orders, appointments: appts });
  } catch (err) { next(err); }
});

router.get('/todos', authenticateToken, async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE contract_signed=0 AND pay_status='已付款') AS contract,
         (SELECT COUNT(*) FROM customers WHERE follow_status='待跟进') AS appointment,
         (SELECT COUNT(*) FROM orders WHERE pay_status='已付款' AND used_times < total_times) AS service,
         (SELECT COUNT(*) FROM appointments WHERE status='待确认') AS cancel`
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

router.get('/chart', authenticateToken, async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT
         DATE_FORMAT(created_at, '%Y-%m') AS month,
         COALESCE(SUM(CASE WHEN pay_status='已付款' THEN amount ELSE 0 END),0) AS revenue,
         COUNT(*) AS new_customers,
         SUM(CASE WHEN type='体验卡' THEN 1 ELSE 0 END) AS experience_cards,
         SUM(CASE WHEN is_upgrade=1 THEN 1 ELSE 0 END) AS upgrades
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export { router as dashboardRouter };
