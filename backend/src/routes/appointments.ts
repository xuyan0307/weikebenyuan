import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';

const router: Router = Router();

function mapRow(r: any) {
  return {
    id: r.appointment_no || r.id,
    _id: r.id,
    customerId: r.customer_code || r.customer_id,
    customerName: r.customer_name || '',
    therapistId: r.therapist_id,
    therapistName: r.therapist_name || '',
    date: r.date ? new Date(r.date).toISOString().slice(0, 10) : '',
    timeSlot: r.time_slot || '',
    service: r.service || '',
    status: r.status || '待确认',
    area: r.area || '',
    remark: r.remark || '',
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 50);
    const date = (req.query.date as string) || '';
    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || '';
    const status = (req.query.status as string) || '';
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: any[] = [];
    if (date) { where.push('a.date = ?'); params.push(date); }
    if (from) { where.push('a.date >= ?'); params.push(from); }
    if (to) { where.push('a.date <= ?'); params.push(to); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM appointments a ${whereSql}`, params);
    const total = (countRows as any[])[0].cnt;

    const [rows] = await db.query(
      `SELECT a.*, c.name AS customer_name, c.customer_code, t.name AS therapist_name
       FROM appointments a
       LEFT JOIN customers c ON c.id = a.customer_id
       LEFT JOIN therapists t ON t.id = a.therapist_id
       ${whereSql}
       ORDER BY a.date DESC, a.time_slot ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const id = randomUUID();
    const no = b.id || ('A' + Date.now());
    const [custRows] = await db.execute('SELECT id FROM customers WHERE id=? OR customer_code=? LIMIT 1', [b.customerId, b.customerId]);
    const custId = (custRows as any[])[0]?.id || b.customerId;
    await db.execute(
      `INSERT INTO appointments (id, appointment_no, customer_id, therapist_id, date, time_slot, service, status, area, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, no, custId, b.therapistId, b.date, b.timeSlot, b.service || '', b.status || '待确认', b.area || null, b.remark || null]
    );
    res.status(201).json({ id, no });
  } catch (err) { next(err); }
});

router.patch('/:id/status', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const db = getDb();
    await db.execute('UPDATE appointments SET status = ? WHERE id = ? OR appointment_no = ?', [status, req.params.id, req.params.id]);
    res.json({ message: '预约状态已更新' });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.execute('DELETE FROM appointments WHERE id = ? OR appointment_no = ?', [req.params.id, req.params.id]);
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as appointmentsRouter };
