import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { authenticateToken, AuthRequest, authorizeRoles } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { ossFileUrl } from '../utils/oss';
import { formatDateOnly, parseJson } from '../utils/serialization';
import { createOrder, deleteOrder, normalizePayStatus, updateOrder } from '../services/orderService';

const router: Router = Router();

function withSignedAttachmentUrls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => withSignedAttachmentUrls(item)) as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    if (typeof next.objectKey === 'string' && next.objectKey) {
      try {
        next.url = ossFileUrl(next.objectKey);
      } catch {
        // Keep the stored URL as a fallback when OSS is not configured.
      }
    }
    for (const key of Object.keys(next)) {
      if (Array.isArray(next[key])) next[key] = withSignedAttachmentUrls(next[key]);
    }
    return next as T;
  }
  return value;
}

function formatSnapshotDate(value: unknown) {
  return formatDateOnly(value);
}

function orderCustomerFromRow(r: RowDataPacket) {
  const snapshot = parseJson<Record<string, unknown>>(r.customer_snapshot, {});
  return {
    id: snapshot.id || r.customer_id || '',
    customerCode: snapshot.customerCode || r.customer_code || '',
    name: snapshot.name || r.customer_name || '',
    wechat: snapshot.wechat || r.customer_wechat || '',
    phone: snapshot.phone || r.customer_phone || '',
    area: snapshot.area || r.customer_area || '',
    source: snapshot.source || r.customer_source || '',
    acquiredAt: snapshot.acquiredAt || formatSnapshotDate(r.acquired_at),
    tag: snapshot.tag || r.customer_tag || '',
    followStatus: snapshot.followStatus || r.customer_follow_status || '',
    followDate: snapshot.followDate || formatSnapshotDate(r.customer_follow_date),
    advisor: snapshot.advisor || r.advisor_name || '',
    advisorId: snapshot.advisorId || r.customer_advisor_id || '',
    profile: snapshot.profile || parseJson<Record<string, unknown>>(r.customer_profile, {}),
    situation: snapshot.situation || r.customer_situation || '',
    intendedProduct: snapshot.intendedProduct || r.intended_product || '',
    remark: snapshot.remark || r.customer_remark || '',
  };
}

function mapRow(r: RowDataPacket) {
  const customer = orderCustomerFromRow(r);
  return {
    id: r.order_no || r.id,
    _id: r.id,
    customerId: r.customer_id,
    customerCode: customer.customerCode,
    customerName: customer.name,
    customerPhone: customer.phone,
    area: customer.area,
    advisor: customer.advisor,
    tag: customer.tag,
    customerSnapshot: customer,
    type: r.type,
    amount: Number(r.amount),
    payStatus: r.pay_status,
    // Customer acquisition time remains part of the retained customer snapshot.
    createdAt: customer.acquiredAt || (r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ''),
    purchaseDate: r.purchase_date_text || formatSnapshotDate(r.created_at),
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    usedTimes: r.used_times || 0,
    totalTimes: r.total_times,
    manualProgressAt: r.manual_progress_at ? new Date(r.manual_progress_at).toISOString() : null,
    isUpgrade: !!r.is_upgrade,
    contractSigned: !!r.contract_signed,
    hasCoupon: !!r.has_coupon,
    serviceItemCount: r.service_item_count || 1,
    serviceItems: r.service_items || r.intended_product || '',
    servicePeople: parseJson(r.service_people, null),
    appointmentTime: r.appointment_time || '',
    serviceNote: r.service_note || '',
    contractAttachments: withSignedAttachmentUrls(parseJson(r.contract_attachments, [])),
    servicePhotoRecords: withSignedAttachmentUrls(parseJson(r.service_photo_records, [])),
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
    const params: unknown[] = [];
    if (payStatus) { where.push('o.pay_status = ?'); params.push(payStatus); }
    if (customerId) { where.push('(o.customer_id = ? OR o.customer_id IN (SELECT id FROM customers WHERE customer_code = ?))'); params.push(customerId, customerId); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM orders o ${whereSql}`, params);
    const total = (countRows as Array<{ cnt: number }>)[0].cnt;

    const [rows] = await db.query(
      `SELECT o.id, o.order_no, o.customer_id, o.customer_snapshot, o.type, o.amount, o.pay_status, o.paid_at,
              DATE_FORMAT(o.purchase_date, '%Y-%m-%d') AS purchase_date_text,
              o.used_times, o.total_times, o.manual_progress_at, o.is_upgrade, o.contract_signed, o.has_coupon,
              o.service_item_count, o.service_items, o.service_people, o.appointment_time,
              o.service_note, o.created_at, o.updated_at,
              c.name AS customer_name, c.customer_code, c.wechat AS customer_wechat, c.phone AS customer_phone,
              c.area AS customer_area, c.source AS customer_source, c.tag AS customer_tag, c.follow_status AS customer_follow_status,
              c.follow_date AS customer_follow_date, c.advisor_id AS customer_advisor_id, c.profile AS customer_profile,
              c.situation AS customer_situation, c.remark AS customer_remark, c.acquired_at, c.intended_product,
              u.name AS advisor_name
       FROM (
         SELECT o.id
         FROM orders o
         ${whereSql}
         ORDER BY o.purchase_date DESC, o.created_at DESC
         LIMIT ? OFFSET ?
       ) page_orders
       JOIN orders o ON o.id = page_orders.id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = c.advisor_id
       ORDER BY o.purchase_date DESC, o.created_at DESC`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as RowDataPacket[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('orders'), async (req: AuthRequest, res, next) => {
  try {
    const result = await createOrder(req.body || {});
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `SELECT o.*, DATE_FORMAT(o.purchase_date, '%Y-%m-%d') AS purchase_date_text,
              c.name AS customer_name, c.customer_code, c.wechat AS customer_wechat, c.phone AS customer_phone,
              c.area AS customer_area, c.source AS customer_source, c.tag AS customer_tag, c.follow_status AS customer_follow_status,
              c.follow_date AS customer_follow_date, c.advisor_id AS customer_advisor_id, c.profile AS customer_profile,
              c.situation AS customer_situation, c.remark AS customer_remark, c.acquired_at, c.intended_product,
              u.name AS advisor_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = c.advisor_id
       WHERE o.id = ? OR o.order_no = ?
       LIMIT 1`,
      [req.params.id, req.params.id]
    );
    const order = (rows as RowDataPacket[])[0];
    if (!order) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }
    res.json({ data: mapRow(order) });
  } catch (err) { next(err); }
});

router.put('/:id', authenticateToken, auditLog('orders'), async (req: AuthRequest, res, next) => {
  try {
    await updateOrder(req.params.id, req.body || {}, { role: req.userRole });
    res.json({ message: '订单已更新' });
  } catch (err) { next(err); }
});

router.patch('/:id/status', authenticateToken, auditLog('orders'), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const payStatus = normalizePayStatus(status);
    const db = getDb();
    await db.execute(
      `UPDATE orders SET pay_status = ?, paid_at = CASE WHEN ? = '已付款' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE id = ? OR order_no = ?`,
      [payStatus, payStatus, req.params.id, req.params.id]
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

router.delete('/:id', authenticateToken, authorizeRoles('superadmin', 'admin'), auditLog('orders'), async (req, res, next) => {
  try {
    await deleteOrder(req.params.id);
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as ordersRouter };
