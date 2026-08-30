import { createHash } from 'crypto';
import { Router } from 'express';
import Joi from 'joi';
import type { RowDataPacket } from 'mysql2/promise';
import { getDb } from '../config/database';
import { auditLog } from '../middleware/auditLog';
import { authenticatePersonalAssistant } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import {
  createAppointment,
  getSlotPeriod,
  type AppointmentWriteBody,
  type SlotPeriod,
} from '../services/appointmentService';
import { generateCustomerCode } from '../services/customerCodeService';
import { parseJson } from '../utils/serialization';

const router: Router = Router();

const PERIODS: Array<{ period: SlotPeriod; label: string; range: string }> = [
  { period: 'morning', label: '上午', range: '08:00-11:59' },
  { period: 'afternoon', label: '下午', range: '12:00-17:59' },
  { period: 'evening', label: '晚上', range: '18:00-23:59' },
];

interface AssistantCustomerInput {
  name: string;
  phone?: string | null;
  wechat?: string | null;
  area?: string | null;
  source?: string | null;
  acquiredAt?: string | null;
  tag?: string | null;
  followStatus: string;
  followDate?: string | null;
  advisorId?: string | null;
  advisor?: string | null;
  profile?: Record<string, unknown> | null;
  situation?: string | null;
  intendedProduct?: string | null;
  remark?: string | null;
}

interface AssistantAppointmentInput extends AppointmentWriteBody {
  customerId: string;
  therapistId: string;
  date: string;
  timeSlot: string;
  service: string;
}

const customerSchema = Joi.object({
  name: Joi.string().trim().max(50).required(),
  phone: Joi.string().trim().max(20).allow('', null),
  wechat: Joi.string().trim().max(50).allow('', null),
  area: Joi.string().trim().max(100).allow('', null),
  source: Joi.string().trim().max(50).allow('', null),
  acquiredAt: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  tag: Joi.string().trim().max(10).allow('', null),
  followStatus: Joi.string().valid('待跟进', '跟进中', '已预约', '已成交', '已流失').default('待跟进'),
  followDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  advisorId: Joi.string().trim().max(36).allow('', null),
  advisor: Joi.string().trim().max(50).allow('', null),
  profile: Joi.object().unknown(true).allow(null),
  situation: Joi.string().max(5000).allow('', null),
  intendedProduct: Joi.string().trim().max(100).allow('', null),
  remark: Joi.string().max(5000).allow('', null),
}).or('phone', 'wechat');

const appointmentSchema = Joi.object({
  customerId: Joi.string().trim().max(36).required(),
  orderId: Joi.string().trim().max(50).allow('', null),
  therapistId: Joi.string().trim().max(36).required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  timeSlot: Joi.string().pattern(/^(0[8-9]|1\d|2[0-3]):[0-5]\d$/).required(),
  service: Joi.string().trim().max(2000).required(),
  serviceSequence: Joi.number().integer().min(1).allow(null),
  area: Joi.string().trim().max(100).allow('', null),
  remark: Joi.string().max(5000).allow('', null),
});

function validate<T>(schema: Joi.ObjectSchema, value: unknown): T {
  const result = schema.validate(value, { abortEarly: false, stripUnknown: true });
  if (result.error) {
    throw createError(result.error.details.map(detail => detail.message).join('；'), 400);
  }
  return result.value as T;
}

export function requestIdFrom(req: { headers: Record<string, unknown> }): string {
  const requestId = String(req.headers['x-request-id'] || '').trim();
  if (!requestId || requestId.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    throw createError('写操作必须提供有效的 X-Request-Id', 400);
  }
  return requestId;
}

export function deterministicId(prefix: string, requestId: string): string {
  return `${prefix}-${createHash('sha256').update(requestId).digest('hex').slice(0, 32)}`;
}

function nullable(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

router.use(authenticatePersonalAssistant);

router.get('/customers', async (req, res, next) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    if (keyword.length < 2 || keyword.length > 100) {
      throw createError('客户查询关键字长度应为 2-100 个字符', 400);
    }
    const like = `%${keyword}%`;
    const [rows] = await getDb().execute(
      `SELECT c.id, c.customer_code, c.name, c.phone, c.wechat, c.area, c.follow_status,
              c.advisor_id, u.name AS advisor_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.advisor_id
       WHERE c.customer_code LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR c.wechat LIKE ?
       ORDER BY c.updated_at DESC
       LIMIT 20`,
      [like, like, like, like]
    );
    res.json({
      data: (rows as RowDataPacket[]).map(row => ({
        id: row.id,
        customerCode: row.customer_code,
        name: row.name,
        phone: row.phone || '',
        wechat: row.wechat || '',
        area: row.area || '',
        followStatus: row.follow_status || '',
        advisorId: row.advisor_id || '',
        advisorName: row.advisor_name || '',
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/customers', auditLog('assistant-customers'), async (req, res, next) => {
  try {
    const requestId = requestIdFrom(req);
    const body = validate<AssistantCustomerInput>(customerSchema, req.body || {});
    const db = getDb();
    const customerId = deterministicId('pa', requestId);

    const [replayRows] = await db.execute(
      'SELECT id, customer_code, name FROM customers WHERE id = ? LIMIT 1',
      [customerId]
    );
    const replay = (replayRows as RowDataPacket[])[0];
    if (replay) {
      res.json({ id: replay.id, customerCode: replay.customer_code, name: replay.name, replayed: true });
      return;
    }

    const phone = nullable(body.phone);
    const wechat = nullable(body.wechat);
    if (!phone && !wechat) {
      throw createError('手机号和微信号至少填写一项', 400);
    }
    const duplicateWhere: string[] = [];
    const duplicateParams: string[] = [];
    if (phone) { duplicateWhere.push('c.phone = ?'); duplicateParams.push(phone); }
    if (wechat) { duplicateWhere.push('c.wechat = ?'); duplicateParams.push(wechat); }
    const [duplicateRows] = await db.execute(
      `SELECT c.id, c.customer_code, c.name, c.phone, c.wechat
       FROM customers c WHERE ${duplicateWhere.join(' OR ')} LIMIT 10`,
      duplicateParams
    );
    if ((duplicateRows as RowDataPacket[]).length > 0) {
      res.status(409).json({
        error: '手机号或微信已存在，请先确认是否为同一客户，系统未自动覆盖',
        duplicates: (duplicateRows as RowDataPacket[]).map(row => ({
          id: row.id,
          customerCode: row.customer_code,
          name: row.name,
          phone: row.phone || '',
          wechat: row.wechat || '',
        })),
      });
      return;
    }

    let advisorId = nullable(body.advisorId);
    if (!advisorId && nullable(body.advisor)) {
      const [advisorRows] = await db.execute(
        'SELECT id FROM users WHERE name = ? AND status = ? LIMIT 2',
        [nullable(body.advisor), 'active']
      );
      if ((advisorRows as RowDataPacket[]).length !== 1) {
        throw createError('未找到唯一的在职客服，请改用 advisorId', 400);
      }
      advisorId = String((advisorRows as RowDataPacket[])[0].id);
    }

    const customerCode = await generateCustomerCode(db);
    await db.query(
      `INSERT INTO customers
        (id, customer_code, name, wechat, phone, area, source, acquired_at, tag,
         follow_status, follow_date, advisor_id, profile, situation, intended_product, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        customerId,
        customerCode,
        body.name,
        wechat,
        phone || '',
        nullable(body.area),
        nullable(body.source),
        nullable(body.acquiredAt),
        nullable(body.tag),
        body.followStatus,
        nullable(body.followDate),
        advisorId,
        body.profile ? JSON.stringify(body.profile) : null,
        nullable(body.situation),
        nullable(body.intendedProduct),
        nullable(body.remark),
      ]
    );
    res.status(201).json({ id: customerId, customerCode, name: body.name, replayed: false });
  } catch (error) {
    next(error);
  }
});

router.get('/therapists', async (req, res, next) => {
  try {
    const city = String(req.query.city || '').trim();
    const service = String(req.query.service || '').trim().toLowerCase();
    const params: string[] = ['在职'];
    let where = 'WHERE status = ?';
    if (city) { where += ' AND city = ?'; params.push(city); }
    const [rows] = await getDb().execute(
      `SELECT id, name, therapist_type, area, city, services, status
       FROM therapists ${where} ORDER BY city, name`,
      params
    );
    const data = (rows as RowDataPacket[])
      .map(row => ({
        id: String(row.id),
        name: String(row.name || ''),
        therapistType: String(row.therapist_type || '产康师'),
        area: String(row.area || ''),
        city: String(row.city || ''),
        services: parseJson<string[]>(row.services, []),
      }))
      .filter(item => !service || item.services.some(value => String(value).toLowerCase().includes(service)));
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/availability', async (req, res, next) => {
  try {
    const query = validate<{ date: string; city?: string; therapistId?: string }>(
      Joi.object({
        date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
        city: Joi.string().trim().max(20).allow(''),
        therapistId: Joi.string().trim().max(36).allow(''),
      }),
      req.query
    );
    const db = getDb();
    const therapistParams: string[] = ['在职'];
    const therapistWhere = ['status = ?'];
    if (query.city) { therapistWhere.push('city = ?'); therapistParams.push(query.city); }
    if (query.therapistId) { therapistWhere.push('id = ?'); therapistParams.push(query.therapistId); }
    const [therapistRows] = await db.execute(
      `SELECT id, name, therapist_type, area, city FROM therapists
       WHERE ${therapistWhere.join(' AND ')} ORDER BY city, name`,
      therapistParams
    );
    const ids = (therapistRows as RowDataPacket[]).map(row => String(row.id));
    let appointmentRows: RowDataPacket[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await db.execute(
        `SELECT therapist_id, time_slot, appointment_no, status
         FROM appointments
         WHERE date = ? AND therapist_id IN (${placeholders})
           AND status NOT IN ('已取消', '取消')`,
        [query.date, ...ids]
      );
      appointmentRows = rows as RowDataPacket[];
    }

    const occupied = new Map<string, RowDataPacket>();
    for (const row of appointmentRows) {
      const period = getSlotPeriod(row.time_slot);
      if (period) occupied.set(`${row.therapist_id}:${period}`, row);
    }
    res.json({
      date: query.date,
      data: (therapistRows as RowDataPacket[]).map(row => ({
        therapistId: row.id,
        therapistName: row.name,
        therapistType: row.therapist_type || '产康师',
        area: row.area || '',
        city: row.city || '',
        periods: PERIODS.map(period => {
          const booked = occupied.get(`${row.id}:${period.period}`);
          return {
            ...period,
            available: !booked,
            occupiedBy: booked ? String(booked.appointment_no || '') : undefined,
          };
        }),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/appointments', auditLog('assistant-appointments'), async (req, res, next) => {
  try {
    const requestId = requestIdFrom(req);
    const body = validate<AssistantAppointmentInput>(appointmentSchema, req.body || {});
    const db = getDb();
    const appointmentNo = deterministicId('PA', requestId);
    const [replayRows] = await db.execute(
      `SELECT id, appointment_no, customer_id, therapist_id, date, time_slot, status
       FROM appointments WHERE appointment_no = ? LIMIT 1`,
      [appointmentNo]
    );
    const replay = (replayRows as RowDataPacket[])[0];
    if (replay) {
      res.json({
        id: replay.id,
        appointmentNo: replay.appointment_no,
        customerId: replay.customer_id,
        therapistId: replay.therapist_id,
        date: replay.date,
        timeSlot: replay.time_slot,
        status: replay.status,
        replayed: true,
      });
      return;
    }

    const [customerRows] = await db.execute(
      'SELECT id FROM customers WHERE id = ? OR customer_code = ? LIMIT 1',
      [body.customerId, body.customerId]
    );
    if ((customerRows as RowDataPacket[]).length === 0) throw createError('客户不存在', 404);
    const [therapistRows] = await db.execute(
      'SELECT id FROM therapists WHERE id = ? AND status = ? LIMIT 1',
      [body.therapistId, '在职']
    );
    if ((therapistRows as RowDataPacket[]).length === 0) throw createError('在职技师不存在', 404);

    const result = await createAppointment({ ...body, id: appointmentNo });
    res.status(201).json({
      id: result.id,
      appointmentNo: result.no,
      serviceSequence: result.serviceSequence,
      serviceTotalTimes: result.serviceTotalTimes,
      replayed: false,
    });
  } catch (error) {
    next(error);
  }
});

export { router as assistantRouter };
