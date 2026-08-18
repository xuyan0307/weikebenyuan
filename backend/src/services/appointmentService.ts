import { randomUUID } from 'crypto';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { formatDateOnly, parseJson } from '../utils/serialization';
import { recalculateSalaryRecord } from './salarySettlementService';

export interface AppointmentWriteBody {
  id?: string;
  orderId?: string;
  customerId?: string;
  therapistId?: string;
  date?: string;
  timeSlot?: string;
  service?: string;
  serviceSequence?: number | null;
  status?: string;
  area?: string;
  remark?: string;
}

export interface AppointmentCompletionBody {
  signaturePhotos?: unknown[];
}

export interface AppointmentOperator {
  id: string;
  name: string;
  role: string;
}

interface AppointmentRow {
  id: string;
  appointment_no?: string;
  customer_id: string;
  order_id?: string | null;
  therapist_id: string;
  date: string | Date;
  time_slot: string;
  service: string | null;
  service_sequence?: number | null;
  service_total_times?: number | null;
  status: string;
  area?: string | null;
  remark?: string | null;
  progress_applied_at: string | Date | null;
  has_service_record?: number;
}

interface OrderProgressRow {
  id: string;
  used_times: number;
  total_times: number;
  service_people: unknown;
}

interface ServicePerson extends Record<string, unknown> {
  assign?: string;
  totalTimes?: string | number;
  usedTimes?: string | number;
}

type ServicePeople = Record<string, ServicePerson | undefined>;

export type SlotPeriod = 'morning' | 'afternoon' | 'evening';

export function getSlotPeriod(timeSlot: unknown): SlotPeriod | null {
  const match = /^(\d{2}):(\d{2})$/.exec(String(timeSlot || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 8 || hour > 23 || minute < 0 || minute > 59) return null;
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function isAppointmentTimePast(date: unknown, timeSlot: unknown, now = new Date()): boolean {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeSlot || ''));
  if (!dateMatch || !timeMatch || getSlotPeriod(timeSlot) === null) return true;
  const value = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0
  );
  return Number.isNaN(value.getTime()) || value.getTime() <= now.getTime();
}

export function incrementAssignedServicePeople(
  value: unknown,
  therapistName: string,
  fallbackTotal: number,
  targetSequence?: number | null
): { changed: boolean; value: ServicePeople } {
  const servicePeople = parseJson<ServicePeople>(value, {});
  let changed = false;

  for (const key of ['sp1', 'sp2', 'sp3']) {
    const person = servicePeople[key];
    if (!person || person.assign !== therapistName) continue;
    const total = Math.max(1, Number(person.totalTimes) || fallbackTotal || 1);
    const used = Math.max(0, Number(person.usedTimes) || 0);
    const nextUsed = targetSequence == null
      ? used + 1
      : Math.max(used, Math.trunc(targetSequence));
    servicePeople[key] = { ...person, usedTimes: String(Math.min(total, nextUsed)) };
    changed = true;
  }

  return { changed, value: servicePeople };
}

export function decrementAssignedServicePeople(
  value: unknown,
  therapistName: string,
  amount: number
): { changed: boolean; value: ServicePeople } {
  const servicePeople = parseJson<ServicePeople>(value, {});
  let changed = false;
  for (const key of ['sp1', 'sp2', 'sp3']) {
    const person = servicePeople[key];
    if (!person || person.assign !== therapistName) continue;
    const used = Math.max(0, Number(person.usedTimes) || 0);
    servicePeople[key] = { ...person, usedTimes: String(Math.max(0, used - Math.max(0, amount))) };
    changed = true;
  }
  return { changed, value: servicePeople };
}

export function resolveAppointmentServiceSequence(
  requested: unknown,
  completedTimes: unknown,
  totalTimes: unknown
): number {
  const total = Math.max(1, Math.trunc(Number(totalTimes) || 1));
  const completed = Math.max(0, Math.min(total, Math.trunc(Number(completedTimes) || 0)));
  if (requested === undefined || requested === null || requested === '') {
    return Math.min(total, completed + 1);
  }
  const sequence = Number(requested);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > total) {
    throw createError(`本次服务次数应为 1-${total} 之间的整数`, 400);
  }
  return sequence;
}

async function resolveCustomerId(connection: PoolConnection, requestedId: string): Promise<string> {
  const [rows] = await connection.execute(
    'SELECT id FROM customers WHERE id=? OR customer_code=? LIMIT 1',
    [requestedId, requestedId]
  );
  return (rows as Array<{ id: string }>)[0]?.id || requestedId;
}

export async function createAppointment(body: AppointmentWriteBody, pool: Pool = getDb()) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const therapistId = body.therapistId || '';
    const date = body.date || '';
    const timeSlot = body.timeSlot || '';
    const requestedPeriod = getSlotPeriod(timeSlot);
    if (!therapistId || !date || requestedPeriod === null) {
      throw createError('请选择技师、预约日期和有效时间', 400);
    }
    if (isAppointmentTimePast(date, timeSlot)) {
      throw createError('已经过去的时间不能预约，请重新选择', 400);
    }

    // Locking the therapist serializes concurrent bookings before conflict checking.
    await connection.execute('SELECT id FROM therapists WHERE id = ? FOR UPDATE', [therapistId]);
    const [sameDayRows] = await connection.execute(
      `SELECT time_slot FROM appointments
       WHERE therapist_id = ? AND date = ? AND status NOT IN ('已取消', '取消', '已冲销')`,
      [therapistId, date]
    );
    const hasConflict = (sameDayRows as Array<{ time_slot: string }>).some(
      appointment => getSlotPeriod(appointment.time_slot) === requestedPeriod
    );
    if (hasConflict) {
      throw createError('该技师此时间段已有预约，请重新选择', 409);
    }

    const id = randomUUID();
    const no = body.id || ('A' + Date.now());
    const customerId = await resolveCustomerId(connection, body.customerId || '');
    const requestedOrderId = String(body.orderId || '').trim();
    const [orderRows] = await connection.execute(
      `SELECT id, used_times, total_times, type
       FROM orders
       WHERE customer_id = ? AND pay_status <> '已退款'
         ${requestedOrderId ? 'AND (id = ? OR order_no = ?)' : ''}
       ORDER BY created_at DESC
       LIMIT 1 FOR UPDATE`,
      requestedOrderId ? [customerId, requestedOrderId, requestedOrderId] : [customerId]
    );
    const currentOrder = (orderRows as Array<{
      id: string;
      used_times: number;
      total_times: number;
      type: string;
    }>)[0];
    if (requestedOrderId && !currentOrder) {
      throw createError('所选订单不存在、已退款或不属于当前客户，请刷新后重试', 400);
    }
    const isPackageOrder = currentOrder?.type === '套餐';
    const serviceSequence = isPackageOrder
      ? resolveAppointmentServiceSequence(
        body.serviceSequence,
        currentOrder.used_times,
        currentOrder.total_times
      )
      : null;
    const serviceTotalTimes = isPackageOrder
      ? Math.max(1, Number(currentOrder.total_times) || 1)
      : null;
    await connection.execute(
      `INSERT INTO appointments
        (id, appointment_no, customer_id, order_id, therapist_id, date, time_slot, service,
         service_sequence, service_total_times, status, area, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        no,
        customerId,
        currentOrder?.id ?? null,
        therapistId,
        date,
        timeSlot,
        body.service || '',
        serviceSequence,
        serviceTotalTimes,
        body.status || '待确认',
        body.area || null,
        body.remark || null,
      ]
    );
    await connection.commit();
    return { id, no, serviceSequence, serviceTotalTimes };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAppointment(
  appointmentId: string,
  body: AppointmentWriteBody,
  pool: Pool = getDb()
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.id, a.appointment_no, a.customer_id, a.order_id, a.therapist_id, a.date, a.time_slot,
              a.service, a.service_sequence, a.service_total_times,
              a.status, a.area, a.remark, a.progress_applied_at,
              EXISTS(SELECT 1 FROM service_records sr WHERE sr.appointment_id = a.id) AS has_service_record
       FROM appointments a
       WHERE a.id = ? OR a.appointment_no = ?
       LIMIT 1 FOR UPDATE`,
      [appointmentId, appointmentId]
    );
    const current = (rows as AppointmentRow[])[0];
    if (!current) throw createError('预约不存在', 404);

    const therapistId = body.therapistId ?? current.therapist_id;
    const date = body.date ?? formatDateOnly(current.date);
    const timeSlot = body.timeSlot ?? current.time_slot;
    const requestedPeriod = getSlotPeriod(timeSlot);
    if (!therapistId || !date || requestedPeriod === null) {
      throw createError('请选择技师、预约日期和有效时间', 400);
    }

    const scheduleChanged =
      therapistId !== current.therapist_id
      || date !== formatDateOnly(current.date)
      || timeSlot !== current.time_slot;
    const scheduleLocked = current.status.includes('完成')
      || current.status.includes('取消')
      || Boolean(current.progress_applied_at)
      || Boolean(current.has_service_record);
    if (scheduleChanged && scheduleLocked) {
      throw createError('已完成、已取消或已产生服务凭证的预约不能改约', 409);
    }
    if (scheduleChanged && isAppointmentTimePast(date, timeSlot)) {
      throw createError('已经过去的时间不能修改，请重新选择', 400);
    }

    await connection.execute('SELECT id FROM therapists WHERE id = ? FOR UPDATE', [therapistId]);
    const [sameDayRows] = await connection.execute(
      `SELECT time_slot FROM appointments
       WHERE therapist_id = ? AND date = ? AND id <> ? AND status NOT IN ('已取消', '取消', '已冲销')`,
      [therapistId, date, current.id]
    );
    const hasConflict = (sameDayRows as Array<{ time_slot: string }>).some(
      appointment => getSlotPeriod(appointment.time_slot) === requestedPeriod
    );
    if (hasConflict) {
      throw createError('该技师此时间段已有预约，请重新选择', 409);
    }

    await connection.execute(
      `UPDATE appointments
       SET therapist_id = ?, date = ?, time_slot = ?, service = ?, area = ?, remark = ?,
           notify_scheduled_at = CASE WHEN ? THEN NULL ELSE notify_scheduled_at END
       WHERE id = ?`,
      [
        therapistId,
        date,
        timeSlot,
        body.service ?? current.service ?? '',
        body.area ?? current.area ?? null,
        body.remark ?? current.remark ?? null,
        scheduleChanged ? 1 : 0,
        current.id,
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: string,
  completionOrPool: AppointmentCompletionBody | Pool = {},
  providedPool?: Pool
) {
  const isPool = typeof (completionOrPool as Pool).getConnection === 'function';
  const completion = isPool ? {} : completionOrPool as AppointmentCompletionBody;
  const pool = (isPool ? completionOrPool : providedPool) as Pool | undefined || getDb();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.id, a.customer_id, a.order_id, a.therapist_id, a.date, a.time_slot, a.service,
              a.service_sequence, a.service_total_times, a.status,
              a.progress_applied_at,
              EXISTS(SELECT 1 FROM service_records sr WHERE sr.appointment_id = a.id) AS has_service_record
       FROM appointments a WHERE a.id = ? OR a.appointment_no = ? LIMIT 1 FOR UPDATE`,
      [appointmentId, appointmentId]
    );
    const appointment = (rows as AppointmentRow[])[0];
    if (!appointment) throw createError('预约不存在', 404);

    const cancelling = status === '已取消' || status === '取消';
    const alreadyCompleted = appointment.status === '已完成'
      || Boolean(appointment.progress_applied_at)
      || Boolean(appointment.has_service_record);
    if (cancelling && alreadyCompleted) {
      throw createError('该预约已完成并产生服务凭证，不能直接取消；如需纠偏请走冲销流程', 409);
    }

    const applyProgress = status === '已完成' && !appointment.progress_applied_at;
    await connection.execute(
      `UPDATE appointments
       SET status = ?, progress_applied_at = CASE WHEN ? THEN NOW() ELSE progress_applied_at END
       WHERE id = ?`,
      [status, applyProgress ? 1 : 0, appointment.id]
    );

    if (applyProgress) {
      await applyOrderProgress(connection, appointment);
    }
    if (status === '已完成') {
      await ensureServiceRecord(connection, appointment, completion.signaturePhotos || []);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureServiceRecord(
  connection: PoolConnection,
  appointment: AppointmentRow,
  signaturePhotos: unknown[]
) {
  const [existingRows] = await connection.execute(
    'SELECT id FROM service_records WHERE appointment_id = ? LIMIT 1 FOR UPDATE',
    [appointment.id]
  );
  const existing = (existingRows as Array<{ id: string }>)[0];
  if (existing) {
    if (signaturePhotos.length > 0) {
      await connection.execute(
        'UPDATE service_records SET signature_photos = ? WHERE id = ?',
        [JSON.stringify(signaturePhotos), existing.id]
      );
    }
    return;
  }

  await connection.execute(
    `INSERT INTO service_records
      (id, appointment_id, customer_id, therapist_id, service_date, service_items, duration, feedback, photos, signature_photos)
     VALUES (?, ?, ?, ?, TIMESTAMP(?, ?), ?, NULL, NULL, ?, ?)`,
    [
      randomUUID(),
      appointment.id,
      appointment.customer_id,
      appointment.therapist_id,
      appointment.date,
      appointment.time_slot,
      appointment.service || null,
      JSON.stringify([]),
      JSON.stringify(signaturePhotos),
    ]
  );
}

async function applyOrderProgress(connection: PoolConnection, appointment: AppointmentRow) {
  const [orderRows] = await connection.query(
    `SELECT id, used_times, total_times, service_people FROM orders
     WHERE customer_id = ?
       AND (? IS NULL OR id = ?)
       AND used_times < total_times
       AND (manual_progress_at IS NULL OR NOW() > manual_progress_at)
     ORDER BY created_at DESC
     LIMIT 1 FOR UPDATE`,
    [
      appointment.customer_id,
      appointment.order_id ?? null,
      appointment.order_id ?? null,
    ]
  );
  const order = (orderRows as OrderProgressRow[])[0];
  if (!order) return;

  const [therapistRows] = await connection.execute(
    'SELECT name FROM therapists WHERE id = ? LIMIT 1',
    [appointment.therapist_id]
  );
  const therapistName = (therapistRows as Array<{ name: string }>)[0]?.name || '';
  const servicePeople = incrementAssignedServicePeople(
    order.service_people,
    therapistName,
    Number(order.total_times) || 1,
    appointment.service_sequence
  );
  const servicePeopleValue = servicePeople.changed
    ? JSON.stringify(servicePeople.value)
    : typeof order.service_people === 'string'
      ? order.service_people
      : JSON.stringify(order.service_people ?? {});

  const beforeUsed = Math.max(0, Number(order.used_times) || 0);
  const total = Math.max(1, Number(order.total_times) || 1);
  const afterUsed = appointment.service_sequence == null
    ? Math.min(beforeUsed + 1, total)
    : Math.min(Math.max(beforeUsed, Number(appointment.service_sequence) || beforeUsed), total);
  await connection.execute(
    'UPDATE orders SET used_times = ?, service_people = ? WHERE id = ?',
    [afterUsed, servicePeopleValue, order.id]
  );
  await connection.execute(
    `INSERT INTO appointment_progress_events
      (id, appointment_id, order_id, customer_id, before_used_times, after_used_times,
       before_total_times, after_total_times, before_service_people, after_service_people)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(), appointment.id, order.id, appointment.customer_id,
      beforeUsed, afterUsed, total, total,
      JSON.stringify(parseJson(order.service_people, {})), servicePeopleValue,
    ]
  );
}

export async function synchronizeAppointmentOrderProgress(
  appointmentId: string,
  operator: AppointmentOperator,
  pool: Pool = getDb()
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.id AS appointment_id, a.customer_id, a.order_id,
              o.order_no, o.type, o.used_times, o.total_times
       FROM appointments a
       INNER JOIN orders o ON o.id = a.order_id
       WHERE a.id = ? OR a.appointment_no = ?
       LIMIT 1 FOR UPDATE`,
      [appointmentId, appointmentId]
    );
    const row = (rows as Array<{
      appointment_id: string; customer_id: string; order_id: string;
      order_no: string | null; type: string | null; used_times: number; total_times: number;
    }>)[0];
    if (!row) throw createError('预约未关联有效订单，无法同步服务次数', 409);
    const usedTimes = Math.max(0, Number(row.used_times) || 0);
    const totalTimes = Math.max(1, Number(row.total_times) || 1);
    await connection.execute('UPDATE orders SET manual_progress_at = NOW() WHERE id = ?', [row.order_id]);
    await connection.execute(
      `INSERT INTO appointment_progress_syncs
        (id, appointment_id, order_id, customer_id, order_no, order_stage,
         before_used_times, before_total_times, after_used_times, after_total_times,
         operator_id, operator_name, operator_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), row.appointment_id, row.order_id, row.customer_id, row.order_no, row.type,
        usedTimes, totalTimes, usedTimes, totalTimes, operator.id, operator.name, operator.role,
      ]
    );
    await connection.commit();
    return { orderId: row.order_id, usedTimes, totalTimes, nextSequence: Math.min(totalTimes, usedTimes + 1) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reverseCompletedAppointment(
  appointmentId: string,
  reasonValue: unknown,
  operator: AppointmentOperator,
  pool: Pool = getDb()
) {
  const reason = String(reasonValue || '').trim();
  if (reason.length < 2 || reason.length > 500) {
    throw createError('请输入 2-500 个字符的冲销原因', 400);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.*, sr.id AS service_record_id, sr.service_date, sr.service_items,
              pe.id AS progress_event_id, pe.order_id AS progress_order_id,
              pe.before_used_times, pe.after_used_times
       FROM appointments a
       LEFT JOIN service_records sr ON sr.appointment_id = a.id
       LEFT JOIN appointment_progress_events pe ON pe.appointment_id = a.id
       WHERE a.id = ? OR a.appointment_no = ?
       LIMIT 1 FOR UPDATE`,
      [appointmentId, appointmentId]
    );
    const appointment = (rows as Array<AppointmentRow & {
      service_record_id: string | null; service_date: unknown; service_items: unknown;
      progress_event_id: string | null; progress_order_id: string | null;
      before_used_times: number | null; after_used_times: number | null;
    }>)[0];
    if (!appointment) throw createError('预约不存在', 404);
    if (appointment.status === '已冲销') throw createError('该服务已经冲销，不能重复操作', 409);
    if (appointment.status !== '已完成' && !appointment.progress_applied_at && !appointment.service_record_id) {
      throw createError('只有已完成并产生服务凭证的预约可以冲销', 409);
    }

    const [existingRows] = await connection.execute(
      'SELECT id FROM appointment_service_reversals WHERE appointment_id = ? LIMIT 1 FOR UPDATE',
      [appointment.id]
    );
    if ((existingRows as Array<{ id: string }>)[0]) {
      throw createError('该服务已经冲销，不能重复操作', 409);
    }

    const reversalId = randomUUID();
    const orderId = appointment.progress_order_id || appointment.order_id || null;
    let orderBefore: Record<string, unknown> | null = null;
    let orderAfter: Record<string, unknown> | null = null;
    if (orderId && appointment.progress_event_id) {
      const [orderRows] = await connection.execute(
        'SELECT id, used_times, total_times, service_people FROM orders WHERE id = ? LIMIT 1 FOR UPDATE',
        [orderId]
      );
      const order = (orderRows as OrderProgressRow[])[0];
      if (order) {
        const [therapistRows] = await connection.execute('SELECT name FROM therapists WHERE id = ? LIMIT 1', [appointment.therapist_id]);
        const therapistName = (therapistRows as Array<{ name: string }>)[0]?.name || '';
        const delta = Math.max(0, Number(appointment.after_used_times) - Number(appointment.before_used_times));
        const nextUsed = Math.max(0, Number(order.used_times) - delta);
        const people = decrementAssignedServicePeople(order.service_people, therapistName, delta);
        const nextPeople = people.changed
          ? JSON.stringify(people.value)
          : typeof order.service_people === 'string'
            ? order.service_people
            : JSON.stringify(order.service_people ?? {});
        orderBefore = { usedTimes: Number(order.used_times), totalTimes: Number(order.total_times), servicePeople: parseJson(order.service_people, {}) };
        orderAfter = { usedTimes: nextUsed, totalTimes: Number(order.total_times), servicePeople: parseJson(nextPeople, {}) };
        await connection.execute('UPDATE orders SET used_times = ?, service_people = ? WHERE id = ?', [nextUsed, nextPeople, order.id]);
        await connection.execute(
          'UPDATE appointment_progress_events SET reversed_at = NOW(), reversal_id = ? WHERE id = ?',
          [reversalId, appointment.progress_event_id]
        );
      }
    }

    await connection.execute("UPDATE appointments SET status = '已冲销' WHERE id = ?", [appointment.id]);
    if (appointment.service_record_id) {
      await connection.execute(
        'UPDATE service_records SET reversed_at = NOW(), reversed_by = ?, reversal_reason = ? WHERE id = ?',
        [operator.id, reason, appointment.service_record_id]
      );
      await connection.execute(
        'UPDATE salary_settlement_entries SET reversed_at = NOW(), reversal_id = ? WHERE service_record_id = ?',
        [reversalId, appointment.service_record_id]
      );
      const [salaryRows] = await connection.execute(
        `SELECT therapist_id, DATE_FORMAT(service_date, '%Y-%m') AS month
         FROM salary_settlement_entries WHERE service_record_id = ? LIMIT 1`,
        [appointment.service_record_id]
      );
      const salary = (salaryRows as Array<{ therapist_id: string; month: string }>)[0];
      if (salary) await recalculateSalaryRecord(connection, salary.therapist_id, salary.month);
    }
    const originalSnapshot = {
      appointmentId: appointment.id, appointmentNo: appointment.appointment_no,
      status: appointment.status, customerId: appointment.customer_id,
      therapistId: appointment.therapist_id, serviceRecordId: appointment.service_record_id,
      serviceDate: appointment.service_date, serviceItems: appointment.service_items || appointment.service,
      progressAppliedAt: appointment.progress_applied_at,
    };
    await connection.execute(
      `INSERT INTO appointment_service_reversals
        (id, appointment_id, service_record_id, progress_event_id, order_id, customer_id,
         therapist_id, reason, operator_id, operator_name, operator_role,
         original_service_snapshot, affected_data_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reversalId, appointment.id, appointment.service_record_id, appointment.progress_event_id,
        orderId, appointment.customer_id, appointment.therapist_id, reason,
        operator.id, operator.name, operator.role,
        JSON.stringify(originalSnapshot), JSON.stringify({ orderBefore, orderAfter, salaryEvidenceReversed: Boolean(appointment.service_record_id) }),
      ]
    );
    await connection.commit();
    return { reversalId, appointmentId: appointment.id, orderBefore, orderAfter };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
