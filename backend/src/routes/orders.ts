import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';

const router = Router();

function mapRow(r: any) {
  return {
    id: r.order_no || r.id,
    _id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name || '',
    type: r.type,
    amount: Number(r.amount),
    payStatus: r.pay_status,
    createdAt: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    usedTimes: r.used_times || 0,
    totalTimes: r.total_times,
    isUpgrade: !!r.is_upgrade,
    contractSigned: !!r.contract_signed,
    hasCoupon: !!r.has_coupon,
    serviceItemCount: r.service_item_count || 1,
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 10);
    const payStatus = (req.query.payStatus as string) || '';
    const customerId = (req.query.customerId as string) || '';
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: any[] = [];
    if (payStatus) { where.push('o.pay_status = ?'); params.push(payStatus); }
    if (customerId) { where.push('(o.customer_id = ? OR o.customer_id IN (SELECT id FROM customers WHERE customer_code = ?))'); params.push(customerId, customerId); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM orders o ${whereSql}`, params);
    const total = (countRows as any[])[0].cnt;

    const [rows] = await db.query(
      `SELECT o.*, c.name AS customer_name, c.customer_code
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ${whereSql}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('orders'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const id = randomUUID();
    const orderNo = b.id || ('O' + Date.now());
    const [custRows] = await db.execute('SELECT id FROM customers WHERE id=? OR customer_code=? LIMIT 1', [b.customerId, b.customerId]);
    const custId = (custRows as any[])[0]?.id || b.customerId;
    await db.execute(
      `INSERT INTO orders (id, order_no, customer_id, type, amount, pay_status, paid_at, used_times, total_times, is_upgrade, contract_signed, has_coupon, service_item_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, orderNo, custId, b.type || '体验卡', b.amount || 0, b.payStatus || '待付款',
        b.payStatus === '已付款' ? new Date() : null, b.usedTimes || 0, b.totalTimes || 1,
        b.isUpgrade ? 1 : 0, b.contractSigned ? 1 : 0, b.hasCoupon ? 1 : 0, b.serviceItemCount || 1,
      ]
    );
    await db.execute('UPDATE customers SET total_orders = total_orders + 1 WHERE id = ?', [custId]);
    res.status(201).json({ id, orderNo });
  } catch (err) { next(err); }
});

router.patch('/:id/status', authenticateToken, auditLog('orders'), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const db = getDb();
    await db.execute(
      `UPDATE orders SET pay_status = ?, paid_at = CASE WHEN ? = '已付款' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE id = ? OR order_no = ?`,
      [status, status, req.params.id, req.params.id]
    );
    res.json({ message: '订单状态已更新' });
  } catch (err) { next(err); }
});

router.patch('/:id/contract', authenticateToken, auditLog('orders'), async (req, res, next) => {
  try {
    const { signed } = req.body || {};
    const db = getDb();
    await db.execute('UPDATE orders SET contract_signed = ? WHERE id = ? OR order_no = ?', [signed ? 1 : 0, req.params.id, req.params.id]);
    res.json({ message: '合同状态已更新' });
  } catch (err) { next(err); }
});

export { router as ordersRouter };
