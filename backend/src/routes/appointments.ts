import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { formatDateOnly } from '../utils/serialization';
import {
  AppointmentWriteBody,
  createAppointment,
  updateAppointmentStatus,
} from '../services/appointmentService';

const router: Router = Router();

interface AppointmentListRow {
  id: string;
  appointment_no: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  therapist_id: string;
  therapist_name: string | null;
  date: string | Date | null;
  time_slot: string | null;
  service: string | null;
  status: string | null;
  area: string | null;
  remark: string | null;
}

function mapRow(r: AppointmentListRow) {
  return {
    id: r.appointment_no || r.id,
    _id: r.id,
    customerId: r.customer_code || r.customer_id,
    customerName: r.customer_name || '',
    therapistId: r.therapist_id,
    therapistName: r.therapist_name || '',
    date: formatDateOnly(r.date),
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
    const params: Array<string | number> = [];
    if (date) { where.push('a.date = ?'); params.push(date); }
    if (from) { where.push('a.date >= ?'); params.push(from); }
    if (to) { where.push('a.date <= ?'); params.push(to); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM appointments a ${whereSql}`, params);
    const total = Number((countRows as Array<{ cnt: number }>)[0]?.cnt || 0);

    const [rows] = await db.query(
      `SELECT a.*, COALESCE(c.name, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.name'))) AS customer_name,
              COALESCE(c.customer_code, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.customerCode'))) AS customer_code,
              t.name AS therapist_name
       FROM appointments a
       LEFT JOIN customers c ON c.id = a.customer_id
       LEFT JOIN orders o ON o.id = (
         SELECT recent_order.id FROM orders recent_order
         WHERE recent_order.customer_id = a.customer_id
         ORDER BY recent_order.created_at DESC LIMIT 1
       )
       LEFT JOIN therapists t ON t.id = a.therapist_id
       ${whereSql}
       ORDER BY a.date DESC, a.time_slot ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as AppointmentListRow[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    const result = await createAppointment((req.body || {}) as AppointmentWriteBody);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.patch('/:id/status', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    await updateAppointmentStatus(req.params.id, status);
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
