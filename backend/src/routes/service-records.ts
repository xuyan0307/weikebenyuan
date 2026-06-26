import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';

const router = Router();

function parseJson(v: any, fallback: any) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v || 'null') || fallback; } catch { return fallback; } }
  return v;
}

function mapRow(r: any) {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    customerId: r.customer_code || r.customer_id,
    customerName: r.customer_name || '',
    therapistId: r.therapist_id,
    therapistName: r.therapist_name || '',
    serviceDate: r.service_date ? new Date(r.service_date).toISOString() : '',
    serviceItems: r.service_items || '',
    duration: r.duration || 0,
    feedback: r.feedback || '',
    photos: parseJson(r.photos, []),
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 20);
    const customerId = (req.query.customerId as string) || '';
    const therapistId = (req.query.therapistId as string) || '';
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: any[] = [];
    if (customerId) { where.push('(s.customer_id = ? OR s.customer_id IN (SELECT id FROM customers WHERE customer_code = ?))'); params.push(customerId, customerId); }
    if (therapistId) { where.push('s.therapist_id = ?'); params.push(therapistId); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM service_records s ${whereSql}`, params);
    const total = (countRows as any[])[0].cnt;

    const [rows] = await db.query(
      `SELECT s.*, c.name AS customer_name, c.customer_code, t.name AS therapist_name
       FROM service_records s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN therapists t ON t.id = s.therapist_id
       ${whereSql}
       ORDER BY s.service_date DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('service-records'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const id = randomUUID();
    const [custRows] = await db.execute('SELECT id FROM customers WHERE id=? OR customer_code=? LIMIT 1', [b.customerId, b.customerId]);
    const custId = (custRows as any[])[0]?.id || b.customerId;
    await db.execute(
      `INSERT INTO service_records (id, appointment_id, customer_id, therapist_id, service_date, service_items, duration, feedback, photos)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, b.appointmentId || null, custId, b.therapistId, b.serviceDate || new Date(), b.serviceItems || null, b.duration || null, b.feedback || null, b.photos ? JSON.stringify(b.photos) : null]
    );
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

export { router as serviceRecordsRouter };
