import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';

const router: Router = Router();

function parseJson(v: any, fallback: any) {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v || 'null') || fallback; } catch { return fallback; }
  }
  return v;
}

function jsonOrNull(value: unknown) {
  return value == null ? null : JSON.stringify(value);
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
      JSON.stringify({ age: 0, deliveryDate: '', deliveryType: '顺产', babyCount: 1, feedingType: '母乳', followTask: '', followRecords: [] }),
      body.customerSituation || null,
      body.serviceItems || null,
      '订单创建时自动建档',
    ]
  );
  return customerId;
}

function mapRow(r: any) {
  return {
    id: r.order_no || r.id,
    _id: r.id,
    customerId: r.customer_id,
    customerCode: r.customer_code || '',
    customerName: r.customer_name || '',
    customerPhone: r.customer_phone || '',
    area: r.customer_area || '',
    advisor: r.advisor_name || '',
    tag: r.customer_tag || '',
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
    serviceItems: r.service_items || r.intended_product || '',
    servicePeople: parseJson(r.service_people, null),
    appointmentTime: r.appointment_time || '',
    serviceNote: r.service_note || '',
    contractAttachments: parseJson(r.contract_attachments, []),
    servicePhotoRecords: parseJson(r.service_photo_records, []),
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
      `SELECT o.id, o.order_no, o.customer_id, o.type, o.amount, o.pay_status, o.paid_at,
              o.used_times, o.total_times, o.is_upgrade, o.contract_signed, o.has_coupon,
              o.service_item_count, o.service_items, o.service_people, o.appointment_time,
              o.service_note, o.created_at, o.updated_at,
              c.name AS customer_name, c.customer_code, c.phone AS customer_phone,
              c.area AS customer_area, c.tag AS customer_tag, c.intended_product,
              u.name AS advisor_name
       FROM (
         SELECT o.id
         FROM orders o
         ${whereSql}
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?
       ) page_orders
       JOIN orders o ON o.id = page_orders.id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = c.advisor_id
       ORDER BY o.created_at DESC`,
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
    const payStatus = normalizePayStatus(b.payStatus);
    await db.execute(
      `INSERT INTO orders (id, order_no, customer_id, type, amount, pay_status, paid_at, used_times, total_times, is_upgrade, contract_signed, has_coupon, service_item_count, service_items, service_people, appointment_time, service_note, contract_attachments, service_photo_records)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, orderNo, custId, b.type || '体验卡', b.amount || 0, payStatus,
        payStatus === '已付款' ? new Date() : null, b.usedTimes || 0, b.totalTimes || 1,
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
      await db.execute('UPDATE customers SET total_orders = total_orders + 1 WHERE id = ?', [custId]);
    }
    res.status(201).json({ id, orderNo });
  } catch (err) { next(err); }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.execute(
      `SELECT o.*, c.name AS customer_name, c.customer_code, c.phone AS customer_phone,
              c.area AS customer_area, c.tag AS customer_tag, c.intended_product,
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

router.put('/:id', authenticateToken, auditLog('orders'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const [rows] = await db.execute(
      'SELECT id, customer_id FROM orders WHERE id=? OR order_no=? LIMIT 1',
      [req.params.id, req.params.id]
    );
    const existing = (rows as any[])[0];
    if (!existing) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }

    const custId = await resolveOrderCustomerId(db, { ...b, customerId: b.customerId || existing.customer_id });
    const payStatus = normalizePayStatus(b.payStatus);
    await db.execute(
      `UPDATE orders
       SET customer_id=?, type=?, amount=?, pay_status=?,
           paid_at = CASE WHEN ? = '已付款' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           total_times=?, is_upgrade=?, contract_signed=?, has_coupon=?, service_item_count=?, service_items=?,
           service_people=?, appointment_time=?, service_note=?, contract_attachments=?, service_photo_records=?
       WHERE id=?`,
      [
        custId || existing.customer_id,
        b.type || '体验卡',
        b.amount || 0,
        payStatus,
        payStatus,
        b.totalTimes || 1,
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
        existing.id,
      ]
    );

    if (custId) {
      const advisorId = await resolveAdvisorId(db, b.customerAdvisor || b.advisor);
      await db.execute(
        `UPDATE customers
         SET name=?, phone=?, area=?, tag=?, advisor_id=?, intended_product=COALESCE(?, intended_product)
         WHERE id=?`,
        [
          b.customerName || '',
          b.customerPhone || '',
          b.customerArea || null,
          b.customerTag || null,
          advisorId,
          b.serviceItems || null,
          custId,
        ]
      );
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

router.delete('/:id', authenticateToken, auditLog('orders'), async (req, res, next) => {
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
