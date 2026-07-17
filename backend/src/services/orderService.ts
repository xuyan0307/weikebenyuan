import { randomUUID } from 'crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { formatDateOnly, jsonOrNull, parseJson } from '../utils/serialization';

export interface OrderWriteBody {
  id?: string;
  customerId?: string;
  customerCode?: string;
  customerName?: string;
  customerWechat?: string;
  customerPhone?: string;
  customerArea?: string;
  customerAdvisor?: string;
  customerTag?: string;
  customerSituation?: string;
  customerRemark?: string;
  source?: string;
  purchaseDate?: string;
  followStatus?: string;
  followDate?: string;
  advisor?: string;
  type?: string;
  amount?: number;
  payStatus?: string;
  usedTimes?: number;
  totalTimes?: number;
  manualProgressEdit?: boolean;
  isUpgrade?: boolean;
  contractSigned?: boolean;
  hasCoupon?: boolean;
  serviceItemCount?: number;
  serviceItems?: string;
  servicePeople?: unknown;
  appointmentTime?: string;
  serviceNote?: string;
  contractAttachments?: unknown[];
  servicePhotoRecords?: unknown[];
}

interface OrderActor {
  role?: string;
}

interface CustomerSnapshot extends Record<string, unknown> {
  id: string;
  customerCode: string;
  name: string;
}

interface CustomerDbRow {
  id: string;
  customer_code: string;
  name: string;
  wechat: string | null;
  phone: string | null;
  area: string | null;
  source: string | null;
  acquired_at: string | Date | null;
  tag: string | null;
  follow_status: string | null;
  follow_date: string | Date | null;
  advisor_id: string | null;
  advisor_name: string | null;
  profile: unknown;
  situation: string | null;
  intended_product: string | null;
  remark: string | null;
}

interface OrderDbRow {
  id: string;
  customer_id: string;
  customer_snapshot: unknown;
  type: string;
  used_times: number;
  total_times: number;
  purchase_date: string | Date | null;
}

export function normalizePayStatus(
  status: string | undefined
): '已付款' | '待付款' | '已退款' | '已付定金' {
  if (status === '已支付' || status === '已付款') return '已付款';
  if (status === '已付定金') return '已付定金';
  if (status === '已退款') return '已退款';
  return '待付款';
}

async function resolveAdvisorId(db: PoolConnection, advisor: unknown): Promise<string | null> {
  const advisorName = typeof advisor === 'string' ? advisor.trim() : '';
  if (!advisorName) return null;
  const [rows] = await db.execute(
    'SELECT id FROM users WHERE name = ? AND status = ? LIMIT 1',
    [advisorName, 'active']
  );
  return (rows as Array<{ id: string }>)[0]?.id || null;
}

async function lockLeadCustomer(db: PoolConnection, requestedId: string) {
  if (!requestedId) return null;
  const [rows] = await db.execute(
    `SELECT id, customer_code
     FROM customers
     WHERE id = ? OR customer_code = ?
     LIMIT 1 FOR UPDATE`,
    [requestedId, requestedId]
  );
  return (rows as Array<{ id: string; customer_code: string }>)[0] || null;
}

async function assertCustomerHasNoOtherOrder(
  db: PoolConnection,
  identifiers: { requestedId?: string; customerId?: string; customerCode?: string },
  exceptOrderId?: string
) {
  const values = Array.from(new Set([
    identifiers.requestedId,
    identifiers.customerId,
    identifiers.customerCode,
  ].filter((value): value is string => !!value)));
  if (values.length === 0) return;

  const placeholders = values.map(() => '?').join(',');
  const params: string[] = [...values, ...values];
  let excludeSql = '';
  if (exceptOrderId) {
    excludeSql = 'AND id <> ?';
    params.push(exceptOrderId);
  }
  const [rows] = await db.execute(
    `SELECT id, order_no
     FROM orders
     WHERE (
       customer_id IN (${placeholders})
       OR JSON_UNQUOTE(JSON_EXTRACT(customer_snapshot, '$.customerCode')) IN (${placeholders})
     )
     ${excludeSql}
     LIMIT 1`,
    params
  );
  const existing = (rows as Array<{ id: string; order_no: string }>)[0];
  if (existing) {
    throw createError(`该客户已存在订单 ${existing.order_no}，请直接编辑原订单`, 409);
  }
}

async function resolveOrderCustomerId(
  db: PoolConnection,
  body: OrderWriteBody,
  lockedCustomerId?: string
): Promise<string> {
  if (lockedCustomerId) return lockedCustomerId;
  const rawCustomerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';

  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : '';
  if (!customerName && !customerPhone) return rawCustomerId;

  if (customerPhone) {
    const [phoneRows] = await db.execute(
      'SELECT id FROM customers WHERE phone = ? LIMIT 1 FOR UPDATE',
      [customerPhone]
    );
    const existingByPhone = (phoneRows as Array<{ id: string }>)[0]?.id;
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

async function getCustomerSnapshot(
  db: PoolConnection,
  customerId: string,
  fallback: OrderWriteBody = {}
): Promise<CustomerSnapshot> {
  if (customerId) {
    const [rows] = await db.execute(
      `SELECT c.*, u.name AS advisor_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.advisor_id
       WHERE c.id = ? LIMIT 1`,
      [customerId]
    );
    const customer = (rows as CustomerDbRow[])[0];
    if (customer) {
      return {
        id: customer.id,
        customerCode: customer.customer_code,
        name: customer.name,
        wechat: customer.wechat || '',
        phone: customer.phone || '',
        area: customer.area || '',
        source: customer.source || '',
        acquiredAt: formatDateOnly(customer.acquired_at),
        tag: customer.tag || '',
        followStatus: customer.follow_status || '',
        followDate: formatDateOnly(customer.follow_date),
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

async function applyCustomerEdits(
  db: PoolConnection,
  snapshot: CustomerSnapshot,
  body: OrderWriteBody
): Promise<CustomerSnapshot> {
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

export async function createOrder(body: OrderWriteBody) {
  const db = getDb();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const requestedId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
    const leadCustomer = await lockLeadCustomer(connection, requestedId);
    await assertCustomerHasNoOtherOrder(connection, {
      requestedId,
      customerId: leadCustomer?.id,
      customerCode: leadCustomer?.customer_code,
    });

    const customerId = await resolveOrderCustomerId(connection, body, leadCustomer?.id);
    const customerSnapshot = await getCustomerSnapshot(connection, customerId, body);
    await assertCustomerHasNoOtherOrder(connection, {
      requestedId,
      customerId,
      customerCode: customerSnapshot.customerCode,
    });

    const id = randomUUID();
    const orderNo = body.id || ('O' + Date.now());
    const payStatus = normalizePayStatus(body.payStatus);
    await connection.execute(
      `INSERT INTO orders (id, order_no, customer_id, customer_snapshot, type, amount, pay_status, paid_at, purchase_date, used_times, total_times, is_upgrade, contract_signed, has_coupon, service_item_count, service_items, service_people, appointment_time, service_note, contract_attachments, service_photo_records)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, orderNo, customerId, JSON.stringify(customerSnapshot), body.type || '体验卡', body.amount || 0, payStatus,
        payStatus === '已付款' ? new Date() : null, body.purchaseDate || new Date(), body.usedTimes || 0, body.totalTimes || 1,
        body.isUpgrade ? 1 : 0, body.contractSigned ? 1 : 0, body.hasCoupon ? 1 : 0, body.serviceItemCount || 1,
        body.serviceItems || null,
        jsonOrNull(body.servicePeople),
        body.appointmentTime || null,
        body.serviceNote || null,
        jsonOrNull(body.contractAttachments || []),
        jsonOrNull(body.servicePhotoRecords || []),
      ]
    );
    if (customerId) await connection.execute('DELETE FROM customers WHERE id = ?', [customerId]);
    await connection.commit();
    return { id, orderNo };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateOrder(orderId: string, body: OrderWriteBody, actor: OrderActor) {
  const db = getDb();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, customer_id, customer_snapshot, type, used_times, total_times, purchase_date
       FROM orders WHERE id=? OR order_no=? LIMIT 1 FOR UPDATE`,
      [orderId, orderId]
    );
    const existing = (rows as OrderDbRow[])[0];
    if (!existing) throw createError('订单不存在', 404);

    const manualProgressEdit = body.manualProgressEdit === true;
    const canEditProgress = actor.role === 'superadmin' || actor.role === 'admin';
    if (manualProgressEdit && !canEditProgress) {
      throw createError('仅超级管理员和管理员可以人工校正服务情况', 403);
    }

    const requestedCustomerId = body.customerId || existing.customer_id;
    let customerId = existing.customer_id as string;
    let selectedSnapshot = parseJson<CustomerSnapshot>(existing.customer_snapshot, {
      id: customerId,
      customerCode: '',
      name: '',
    });
    if (requestedCustomerId !== existing.customer_id) {
      const leadCustomer = await lockLeadCustomer(connection, requestedCustomerId);
      await assertCustomerHasNoOtherOrder(connection, {
        requestedId: requestedCustomerId,
        customerId: leadCustomer?.id,
        customerCode: leadCustomer?.customer_code,
      }, existing.id);
      customerId = await resolveOrderCustomerId(
        connection,
        { ...body, customerId: requestedCustomerId },
        leadCustomer?.id
      );
      selectedSnapshot = await getCustomerSnapshot(connection, customerId, body);
    }

    const customerSnapshot = await applyCustomerEdits(connection, selectedSnapshot, body);
    const payStatus = normalizePayStatus(body.payStatus);
    const orderType = body.type || existing.type;
    const totalTimes = orderType === '体验卡' && !body.isUpgrade
      ? 1
      : Math.max(1, Number(body.totalTimes) || 1);
    const usedTimes = manualProgressEdit
      ? Math.min(totalTimes, Math.max(0, Number(body.usedTimes) || 0))
      : Number(existing.used_times) || 0;

    await connection.execute(
      `UPDATE orders
       SET customer_id=?, type=?, amount=?, pay_status=?, purchase_date=?,
           paid_at = CASE WHEN ? = '已付款' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           used_times=?, total_times=?,
           manual_progress_at = CASE WHEN ? THEN NOW() ELSE manual_progress_at END,
           is_upgrade=?, contract_signed=?, has_coupon=?, service_item_count=?, service_items=?,
           service_people=?, appointment_time=?, service_note=?, contract_attachments=?, service_photo_records=?, customer_snapshot=?
       WHERE id=?`,
      [
        customerId,
        orderType,
        body.amount || 0,
        payStatus,
        body.purchaseDate !== undefined ? (body.purchaseDate || null) : existing.purchase_date,
        payStatus,
        usedTimes,
        totalTimes,
        manualProgressEdit ? 1 : 0,
        body.isUpgrade ? 1 : 0,
        body.contractSigned ? 1 : 0,
        body.hasCoupon ? 1 : 0,
        body.serviceItemCount || 1,
        body.serviceItems || null,
        jsonOrNull(body.servicePeople),
        body.appointmentTime || null,
        body.serviceNote || null,
        jsonOrNull(body.contractAttachments || []),
        jsonOrNull(body.servicePhotoRecords || []),
        JSON.stringify(customerSnapshot),
        existing.id,
      ]
    );

    if (customerId && customerId !== existing.customer_id) {
      await connection.execute('DELETE FROM customers WHERE id = ?', [customerId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteOrder(orderId: string) {
  const db = getDb();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, customer_id FROM orders WHERE id=? OR order_no=? LIMIT 1 FOR UPDATE',
      [orderId, orderId]
    );
    const order = (rows as Array<{ id: string; customer_id: string }>)[0];
    if (!order) throw createError('订单不存在', 404);
    await connection.execute('DELETE FROM orders WHERE id=?', [order.id]);
    if (order.customer_id) {
      await connection.execute(
        'UPDATE customers SET total_orders = GREATEST(total_orders - 1, 0) WHERE id=?',
        [order.customer_id]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
