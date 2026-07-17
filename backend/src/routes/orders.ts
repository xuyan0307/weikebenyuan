import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken, AuthRequest, authorizeRoles } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { createError } from '../middleware/errorHandler';
import { getDb } from '../config/database';
import { ossFileUrl } from '../utils/oss';
import { formatDateOnly, jsonOrNull, parseJson } from '../utils/serialization';

const router: Router = Router();

function withSignedAttachmentUrls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => withSignedAttachmentUrls(item)) as T;
  }
  if (value && typeof value === 'object') {
    const next: any = { ...(value as any) };
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
    return next;
  }
  return value;
}

function normalizePayStatus(status: string | undefined): '已付款' | '待付款' | '已退款' | '已付定金' {
  if (status === '已支付' || status === '已付款') return '已付款';
  if (status === '已付定金') return '已付定金';
  if (status === '已退款') return '已退款';
  return '待付款';
}

async function resolveAdvisorId(db: any, advisor: unknown): Promise<string | null> {
  const advisorName = typeof advisor === 'string' ? advisor.trim() : '';
  if (!advisorName) return null;
  const [rows] = await db.execute(
    'SELECT id FROM users WHERE name = ? AND status = ? LIMIT 1',
    [advisorName, 'active']
  );
  return (rows as any[])[0]?.id || null;
}

async function resolveOrderCustomerId(db: any, body: any): Promise<string> {
  const rawCustomerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
  if (rawCustomerId) {
    const [custRows] = await db.execute(
      'SELECT id FROM customers WHERE id=? OR customer_code=? LIMIT 1',
      [rawCustomerId, rawCustomerId]
    );
    const existingId = (custRows as any[])[0]?.id;
    if (existingId) return existingId;
  }

  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : '';
  if (!customerName && !customerPhone) return rawCustomerId || '';

  if (customerPhone) {
    const [phoneRows] = await db.execute(
      'SELECT id FROM customers WHERE phone = ? LIMIT 1',
      [customerPhone]
    );
    const existingByPhone = (phoneRows as any[])[0]?.id;
    if (existingByPhone) return existingByPhone;
  }

  const customerId = randomUUID();
  const customerCode = 'C' + Date.now().toString().slice(-8);
  const advisorId = await resolveAdvisorId(db, body.customerAdvisor || body.advisor);
  await db.execute(
    `INSERT INTO customers (id, customer_code, name, wechat, phone, area, source, acquired_at, tag, follow_status, advisor_id, profile, situation, intended_product, remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      customerId,
      customerCode,
      customerName || customerPhone,
      body.customerWechat || null,
      customerPhone || '',
      body.customerArea || null,
      body.source || '订单录入',
      body.purchaseDate || new Date(),
      body.customerTag || 'D1',
      '待跟进',
      advisorId,
      JSON.stringify({ age: 0, deliveryDate: '', deliveryType: '未知', babyCount: 0, feedingType: '未知', followTask: '', followRecords: [] }),
      body.customerSituation || null,
      body.serviceItems || null,
      '订单创建时自动建档',
    ]
  );
  return customerId;
}

function formatSnapshotDate(value: any) {
  return formatDateOnly(value);
}

async function getCustomerSnapshot(db: any, customerId: string, fallback: any = {}) {
  if (customerId) {
    const [rows] = await db.execute(
      `SELECT c.*, u.name AS advisor_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.advisor_id
       WHERE c.id = ? LIMIT 1`,
      [customerId]
    );
    const customer = (rows as any[])[0];
    if (customer) {
      return {
        id: customer.id,
        customerCode: customer.customer_code,
        name: customer.name,
        wechat: customer.wechat || '',
        phone: customer.phone || '',
        area: customer.area || '',
        source: customer.source || '',
        acquiredAt: formatSnapshotDate(customer.acquired_at),
        tag: customer.tag || '',
        followStatus: customer.follow_status || '',
        followDate: formatSnapshotDate(customer.follow_date),
        advisorId: customer.advisor_id || '',
        advisor: customer.advisor_name || '',
        profile: parseJson<Record<string, unknown>>(customer.profile, {}),
        situation: customer.situation || '',
        intendedProduct: customer.intended_product || '',
        remark: customer.remark || '',
      };
    }
  }

  return {
    id: customerId || fallback.customerId || '',
    customerCode: fallback.customerCode || '',
    name: fallback.customerName || '',
    wechat: fallback.customerWechat || '',
    phone: fallback.customerPhone || '',
    area: fallback.customerArea || '',
    source: fallback.source || '',
    acquiredAt: fallback.purchaseDate || '',
    tag: fallback.customerTag || '',
    followStatus: fallback.followStatus || '待跟进',
    followDate: fallback.followDate || '',
    advisorId: '',
    advisor: fallback.customerAdvisor || fallback.advisor || '',
    profile: {},
    situation: fallback.customerSituation || '',
    intendedProduct: fallback.serviceItems || '',
    remark: fallback.customerRemark || '',
  };
}

async function applyOrderCustomerEdits(db: any, snapshot: any, body: any) {
  const next = { ...snapshot };
  const advisor = body.customerAdvisor || body.advisor;
  if (body.customerName !== undefined) next.name = body.customerName;
  if (body.customerWechat !== undefined) next.wechat = body.customerWechat;
  if (body.customerPhone !== undefined) next.phone = body.customerPhone;
  if (body.customerArea !== undefined) next.area = body.customerArea;
  if (body.source !== undefined) next.source = body.source;
  if (body.customerTag !== undefined) next.tag = body.customerTag;
  if (advisor !== undefined) {
    next.advisor = advisor || '';
    next.advisorId = advisor ? await resolveAdvisorId(db, advisor) : '';
  }
  if (body.serviceItems !== undefined) next.intendedProduct = body.serviceItems;
  return next;
}

function orderCustomerFromRow(r: any) {
  const snapshot = parseJson<Record<string, any>>(r.customer_snapshot, {});
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

function mapRow(r: any) {
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
    const params: any[] = [];
    if (payStatus) { where.push('o.pay_status = ?'); params.push(payStatus); }
    if (customerId) { where.push('(o.customer_id = ? OR o.customer_id IN (SELECT id FROM customers WHERE customer_code = ?))'); params.push(customerId, customerId); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM orders o ${whereSql}`, params);
    const total = (countRows as any[])[0].cnt;

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
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('orders'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const id = randomUUID();
    const orderNo = b.id || ('O' + Date.now());
    const custId = await resolveOrderCustomerId(db, b);
    const customerSnapshot = await getCustomerSnapshot(db, custId, b);
    const payStatus = normalizePayStatus(b.payStatus);
    await db.execute(
      `INSERT INTO orders (id, order_no, customer_id, type, amount, pay_status, paid_at, purchase_date, used_times, total_times, is_upgrade, contract_signed, has_coupon, service_item_count, service_items, service_people, appointment_time, service_note, contract_attachments, service_photo_records)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, orderNo, custId, b.type || '体验卡', b.amount || 0, payStatus,
        payStatus === '已付款' ? new Date() : null, b.purchaseDate || new Date(), b.usedTimes || 0, b.totalTimes || 1,
        b.isUpgrade ? 1 : 0, b.contractSigned ? 1 : 0, b.hasCoupon ? 1 : 0, b.serviceItemCount || 1,
        b.serviceItems || null,
        jsonOrNull(b.servicePeople),
        b.appointmentTime || null,
        b.serviceNote || null,
        jsonOrNull(b.contractAttachments || []),
        jsonOrNull(b.servicePhotoRecords || []),
      ]
    );
    if (custId) {
      // Store the full profile first, then move the record out of the lead pool.
      await db.execute('UPDATE orders SET customer_snapshot = ? WHERE id = ?', [JSON.stringify(customerSnapshot), id]);
      await db.execute('DELETE FROM customers WHERE id = ?', [custId]);
    }
    res.status(201).json({ id, orderNo });
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
    const order = (rows as any[])[0];
    if (!order) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }
    res.json({ data: mapRow(order) });
  } catch (err) { next(err); }
});

router.put('/:id', authenticateToken, auditLog('orders'), async (req: AuthRequest, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const [rows] = await db.execute(
      'SELECT id, customer_id, customer_snapshot, type, used_times, total_times, purchase_date FROM orders WHERE id=? OR order_no=? LIMIT 1',
      [req.params.id, req.params.id]
    );
    const existing = (rows as any[])[0];
    if (!existing) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }

    const manualProgressEdit = b.manualProgressEdit === true;
    const canEditProgress = req.userRole === 'superadmin' || req.userRole === 'admin';
    if (manualProgressEdit && !canEditProgress) {
      return next(createError('仅超级管理员和管理员可以人工校正服务情况', 403));
    }

    const requestedCustomerId = b.customerId || existing.customer_id;
    const custId = requestedCustomerId === existing.customer_id
      ? existing.customer_id
      : await resolveOrderCustomerId(db, { ...b, customerId: requestedCustomerId });
    const existingSnapshot = parseJson<Record<string, any>>(existing.customer_snapshot, {});
    const selectedSnapshot = custId === existing.customer_id
      ? existingSnapshot
      : await getCustomerSnapshot(db, custId, b);
    const customerSnapshot = await applyOrderCustomerEdits(db, selectedSnapshot, b);
    const payStatus = normalizePayStatus(b.payStatus);
    const orderType = b.type || existing.type;
    const totalTimes = orderType === '体验卡' && !b.isUpgrade
      ? 1
      : Math.max(1, Number(b.totalTimes) || 1);
    const usedTimes = manualProgressEdit
      ? Math.min(totalTimes, Math.max(0, Number(b.usedTimes) || 0))
      : Number(existing.used_times) || 0;
    await db.execute(
      `UPDATE orders
       SET customer_id=?, type=?, amount=?, pay_status=?, purchase_date=?,
           paid_at = CASE WHEN ? = '已付款' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           used_times=?, total_times=?,
           manual_progress_at = CASE WHEN ? THEN NOW() ELSE manual_progress_at END,
           is_upgrade=?, contract_signed=?, has_coupon=?, service_item_count=?, service_items=?,
           service_people=?, appointment_time=?, service_note=?, contract_attachments=?, service_photo_records=?, customer_snapshot=?
       WHERE id=?`,
      [
        custId || existing.customer_id,
        orderType,
        b.amount || 0,
        payStatus,
        b.purchaseDate !== undefined ? (b.purchaseDate || null) : existing.purchase_date,
        payStatus,
        usedTimes,
        totalTimes,
        manualProgressEdit ? 1 : 0,
        b.isUpgrade ? 1 : 0,
        b.contractSigned ? 1 : 0,
        b.hasCoupon ? 1 : 0,
        b.serviceItemCount || 1,
        b.serviceItems || null,
        jsonOrNull(b.servicePeople),
        b.appointmentTime || null,
        b.serviceNote || null,
        jsonOrNull(b.contractAttachments || []),
        jsonOrNull(b.servicePhotoRecords || []),
        JSON.stringify(customerSnapshot),
        existing.id,
      ]
    );

    if (custId && custId !== existing.customer_id) {
      await db.execute('DELETE FROM customers WHERE id = ?', [custId]);
    }

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
    const db = getDb();
    const [rows] = await db.execute('SELECT customer_id FROM orders WHERE id=? OR order_no=? LIMIT 1', [req.params.id, req.params.id]);
    const customerId = (rows as any[])[0]?.customer_id;
    await db.execute('DELETE FROM orders WHERE id=? OR order_no=?', [req.params.id, req.params.id]);
    if (customerId) {
      await db.execute('UPDATE customers SET total_orders = GREATEST(total_orders - 1, 0) WHERE id=?', [customerId]);
    }
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as ordersRouter };
