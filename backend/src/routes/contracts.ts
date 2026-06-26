import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';

const router = Router();

function mapRow(r: any) {
  return {
    id: r.order_no || r.id,
    orderId: r.order_no || r.id,
    customerId: r.customer_id,
    customerName: r.customer_name || '',
    amount: Number(r.amount),
    type: r.type,
    payStatus: r.pay_status,
    contractSigned: !!r.contract_signed,
    createdAt: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 20);
    const signed = req.query.signed;
    const offset = (page - 1) * pageSize;
    const whereSql = signed === '1' ? 'WHERE o.contract_signed = 1' : signed === '0' ? 'WHERE o.contract_signed = 0' : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM orders o ${whereSql}`);
    const total = (countRows as any[])[0].cnt;

    const [rows] = await db.query(
      `SELECT o.*, c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ${whereSql}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.patch('/:id/sign', authenticateToken, auditLog('contracts'), async (req, res, next) => {
  try {
    const { signed } = req.body || {};
    const db = getDb();
    await db.execute('UPDATE orders SET contract_signed = ? WHERE id = ? OR order_no = ?', [signed ? 1 : 0, req.params.id, req.params.id]);
    res.json({ message: '合同状态已更新' });
  } catch (err) { next(err); }
});

export { router as contractsRouter };
