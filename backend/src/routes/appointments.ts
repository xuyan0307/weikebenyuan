import { Router, text } from 'express';
import { authenticateToken, authorizeRoles, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { formatDateOnly } from '../utils/serialization';
import {
  AppointmentWriteBody,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
} from '../services/appointmentService';
import {
  APPOINTMENT_NOTIFY_STATUSES,
  AppointmentNotifyStatus,
  appointmentStartAt,
  deriveNotificationStatus,
  parseNotificationReply,
  recordNotificationReply,
  recordNotificationReplyFromWecom,
  updateAppointmentNotificationStatus,
} from '../services/appointmentNotificationService';
import {
  type WecomCallbackQuery,
  verifyAndDecryptWecomEcho,
  verifyAndDecryptWecomMessage,
} from '../services/wecomCallbackService';

const router: Router = Router();

function getWecomCallbackQuery(query: Record<string, unknown>): WecomCallbackQuery {
  const callbackQuery = {
    msgSignature: String(query.msg_signature || ''),
    timestamp: String(query.timestamp || ''),
    nonce: String(query.nonce || ''),
  };

  if (!callbackQuery.msgSignature || !callbackQuery.timestamp || !callbackQuery.nonce) {
    throw Object.assign(new Error('Missing WeCom callback query parameters'), {
      statusCode: 400,
    });
  }

  return callbackQuery;
}

interface AppointmentListRow {
  id: string;
  appointment_no: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  advisor_id: string | null;
  advisor_name: string | null;
  therapist_id: string;
  therapist_name: string | null;
  date: string | Date | null;
  time_slot: string | null;
  service: string | null;
  service_sequence: number | null;
  service_total_times: number | null;
  status: string | null;
  area: string | null;
  remark: string | null;
  order_type: string | null;
  order_service_items: string | null;
  notify_status: string | null;
  notify_manual_status: AppointmentNotifyStatus | null;
  notify_replied_at: string | Date | null;
  notify_sent_at: string | Date | null;
  notify_error: string | null;
}

function appointmentStatus(status: string | null) {
  const value = String(status || '');
  if (value.includes('完成')) return '已完成';
  if (value.includes('取消')) return '取消';
  return '待服务';
}

function orderType(type: string | null) {
  return String(type || '').includes('套餐') ? '套餐' : '体验卡';
}

function mapRow(r: AppointmentListRow) {
  const advisorName = r.advisor_name && r.advisor_name !== 'null' ? r.advisor_name : '';
  const date = formatDateOnly(r.date);
  const repliedAt = r.notify_replied_at ? new Date(r.notify_replied_at) : null;
  const calculatedNotifyStatus = deriveNotificationStatus(
    appointmentStartAt(date, r.time_slot || ''),
    repliedAt
  );
  const displayedNotifyStatus = r.notify_manual_status || calculatedNotifyStatus;
  return {
    id: r.appointment_no || r.id,
    _id: r.id,
    customerId: r.customer_code || r.customer_id,
    customerName: r.customer_name || '',
    customerPhone: r.customer_phone || '',
    advisorId: r.advisor_id || '',
    advisorName,
    therapistId: r.therapist_id,
    therapistName: r.therapist_name || '',
    date,
    timeSlot: r.time_slot || '',
    service: r.service || '',
    serviceContent: r.service || r.order_service_items || '',
    serviceSequence: r.service_sequence == null ? null : Number(r.service_sequence),
    serviceTotalTimes: r.service_total_times == null ? null : Number(r.service_total_times),
    status: appointmentStatus(r.status),
    rawStatus: r.status || '',
    orderType: orderType(r.order_type),
    area: r.area || '',
    remark: r.remark || '',
    notifyStatus: displayedNotifyStatus,
    notifyManualStatus: r.notify_manual_status,
    notifySentAt: r.notify_sent_at || null,
    notifyError: r.notify_error || '',
  };
}

router.get('/notifications/wecom-callback', async (req, res, next) => {
  try {
    const callbackQuery = getWecomCallbackQuery(req.query);
    const echoStr = String(req.query.echostr || '');
    if (!echoStr) {
      throw Object.assign(new Error('Missing WeCom echostr'), { statusCode: 400 });
    }

    const echo = verifyAndDecryptWecomEcho(callbackQuery, echoStr);
    res.type('text/plain').send(echo);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/notifications/wecom-callback',
  text({ type: ['text/xml', 'application/xml'], limit: '256kb' }),
  async (req, res, next) => {
    try {
      const callbackQuery = getWecomCallbackQuery(req.query);
      const message = verifyAndDecryptWecomMessage(
        callbackQuery,
        typeof req.body === 'string' ? req.body : '',
      );

      if (message.msgType === 'text' && parseNotificationReply(message.content) !== undefined) {
        await recordNotificationReplyFromWecom(
          message.content,
          message.fromUserId,
          new Date(),
        );
      }

      res.type('text/plain').send('success');
    } catch (error) {
      next(error);
    }
  },
);

router.post('/notifications/wecom-reply', async (req, res, next) => {
  try {
    const expected = String(process.env.WECOM_CALLBACK_TOKEN || '').trim();
    const supplied = String(
      req.headers['x-wecom-callback-token'] || req.body?.token || '',
    ).trim();
    if (!expected || supplied !== expected) {
      res.status(401).json({ error: 'Invalid callback token' });
      return;
    }

    const reply = String(req.body?.reply || '').trim();
    const parsedAppointmentId = parseNotificationReply(reply);
    if (parsedAppointmentId === undefined) {
      res.status(400).json({ error: 'Only the 已通知 reply is supported' });
      return;
    }

    const appointmentId = String(
      req.body?.appointmentId || parsedAppointmentId || '',
    ).trim();
    const sender = String(
      req.body?.wecomUserId || req.body?.fromUserId || req.body?.sender || '',
    ).trim();

    const status = appointmentId
      ? await recordNotificationReply(appointmentId, new Date(), sender || undefined)
      : sender
        ? await recordNotificationReplyFromWecom(reply, sender, new Date())
        : null;

    if (!status) {
      res.status(400).json({
        error: appointmentId
          ? 'Appointment notification was not found'
          : 'Appointment ID or WeCom sender is required',
      });
      return;
    }

    res.json({ status });
  } catch (err) {
    next(err);
  }
});

router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(2000, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const date = (req.query.date as string) || '';
    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || '';
    const status = (req.query.status as string) || '';
    const customerId = (req.query.customerId as string) || '';
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (date) { where.push('a.date = ?'); params.push(date); }
    if (from) { where.push('a.date >= ?'); params.push(from); }
    if (to) { where.push('a.date <= ?'); params.push(to); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    if (customerId) {
      where.push(`(
        a.customer_id = ?
        OR a.customer_id IN (SELECT id FROM customers WHERE customer_code = ?)
        OR a.customer_id IN (
          SELECT customer_id FROM orders
          WHERE JSON_UNQUOTE(JSON_EXTRACT(customer_snapshot, '$.customerCode')) = ?
        )
      )`);
      params.push(customerId, customerId, customerId);
    }
    // Customer-service users may switch the advisor filter after entering with
    // themselves selected by default. Keep the legacy restricted scope for any
    // other non-administrator roles.
    if (!['superadmin', 'admin', 'service'].includes(req.userRole || '')) {
      where.push(`(
        a.customer_id IN (SELECT c.id FROM customers c WHERE c.advisor_id = ?)
        OR a.customer_id IN (
          SELECT o.customer_id FROM orders o
          WHERE JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId')) = ?
        )
      )`);
      params.push(req.userId || '', req.userId || '');
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM appointments a ${whereSql}`, params);
    const total = Number((countRows as Array<{ cnt: number }>)[0]?.cnt || 0);

    const [rows] = await db.query(
      `SELECT a.*,
              COALESCE(c.name, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.name'))) AS customer_name,
              COALESCE(c.customer_code, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.customerCode'))) AS customer_code,
              COALESCE(c.phone, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.phone'))) AS customer_phone,
              COALESCE(c.area, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.area')), a.area) AS area,
              COALESCE(c.advisor_id, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId'))) AS advisor_id,
              COALESCE(u.name, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisor'))) AS advisor_name,
              o.type AS order_type,
              o.service_items AS order_service_items,
              t.name AS therapist_name
       FROM appointments a
       LEFT JOIN customers c ON c.id = a.customer_id
       LEFT JOIN orders o ON o.id = (
         SELECT recent_order.id FROM orders recent_order
         WHERE recent_order.customer_id = a.customer_id
         ORDER BY recent_order.created_at DESC LIMIT 1
       )
       LEFT JOIN users u ON u.id = COALESCE(c.advisor_id, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId')))
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

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('superadmin', 'admin'),
  auditLog('appointments'),
  async (req, res, next) => {
    try {
      await updateAppointment(req.params.id, (req.body || {}) as AppointmentWriteBody);
      res.json({ message: '预约已更新' });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/:id/notification-reply', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    if (String(req.body?.reply || '').trim() !== '已通知') {
      res.status(400).json({ error: 'Only the 已通知 reply is supported' });
      return;
    }
    const status = await recordNotificationReply(req.params.id);
    res.json({ status });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/notification-status',
  authenticateToken,
  authorizeRoles('superadmin', 'admin', 'service'),
  auditLog('appointments'),
  async (req: AuthRequest, res, next) => {
    try {
      const status = String(req.body?.status || '') as AppointmentNotifyStatus;
      if (!APPOINTMENT_NOTIFY_STATUSES.includes(status)) {
        res.status(400).json({ error: '通知状态无效' });
        return;
      }
      await updateAppointmentNotificationStatus(
        req.params.id,
        status,
        { id: req.userId || '', role: req.userRole || '' }
      );
      res.json({ message: '通知状态已更新', status });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/:id/status', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    await updateAppointmentStatus(req.params.id, status, {
      signaturePhotos: Array.isArray(req.body?.signaturePhotos) ? req.body.signaturePhotos : [],
    });
    res.json({ message: '预约状态已更新' });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticateToken, auditLog('appointments'), async (req, res, next) => {
  try {
    const db = getDb();
    const [evidenceRows] = await db.query(
      `SELECT a.status, a.progress_applied_at, sr.id AS service_record_id
       FROM appointments a
       LEFT JOIN service_records sr ON sr.appointment_id = a.id
       WHERE a.id = ? OR a.appointment_no = ?
       LIMIT 1`,
      [req.params.id, req.params.id]
    );
    const evidence = (evidenceRows as Array<{
      status: string;
      progress_applied_at: string | null;
      service_record_id: string | null;
    }>)[0];
    if (evidence && (evidence.status === '已完成' || evidence.progress_applied_at || evidence.service_record_id)) {
      res.status(409).json({ error: '该预约已产生服务凭证，不能删除；如需纠偏请走冲销流程' });
      return;
    }
    await db.execute('DELETE FROM appointments WHERE id = ? OR appointment_no = ?', [req.params.id, req.params.id]);
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as appointmentsRouter };
