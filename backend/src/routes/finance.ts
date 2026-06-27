import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';

const router: Router = Router();

function mapSalary(r: any) {
  return {
    id: r.id,
    therapistId: r.therapist_id,
    therapistName: r.therapist_name || '',
    month: r.month,
    serviceCount: r.service_count || 0,
    laborFee: Number(r.labor_fee) || 0,
    commission: Number(r.commission) || 0,
    total: Number(r.total) || 0,
    status: r.status || '待结算',
    settledAt: r.settled_at ? new Date(r.settled_at).toISOString() : null,
  };
}

router.get('/salary', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const [rows] = await db.query(
      `SELECT s.*, t.name AS therapist_name
       FROM salary_records s LEFT JOIN therapists t ON t.id = s.therapist_id
       WHERE s.month = ? ORDER BY s.status, t.name`,
      [month]
    );
    res.json({ month, data: (rows as any[]).map(mapSalary) });
  } catch (err) { next(err); }
});

router.post('/salary/:id/settle', authenticateToken, auditLog('finance'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.execute("UPDATE salary_records SET status='已结算', settled_at=NOW() WHERE id=?", [req.params.id]);
    res.json({ message: '已结算' });
  } catch (err) { next(err); }
});

router.get('/income', authenticateToken, async (_req, res, next) => {
  try {
    const db = getDb();
    const [monthRows] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              SUM(CASE WHEN pay_status='已付款' THEN amount ELSE 0 END) AS revenue,
              SUM(CASE WHEN pay_status='已退款' THEN amount ELSE 0 END) AS refund,
              COUNT(*) AS order_count
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month`
    );
    const [summary] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM customers) AS total_customers,
         (SELECT COUNT(*) FROM orders) AS total_orders,
         (SELECT COALESCE(SUM(amount),0) FROM orders WHERE pay_status='已付款') AS total_revenue,
         (SELECT COUNT(*) FROM appointments WHERE status='已完成') AS done_appointments`
    );
    res.json({ monthly: monthRows, summary: (summary as any[])[0] });
  } catch (err) { next(err); }
});

export { router as financeRouter };
