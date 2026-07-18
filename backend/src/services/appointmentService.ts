import { randomUUID } from 'crypto';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { parseJson } from '../utils/serialization';

export interface AppointmentWriteBody {
  id?: string;
  customerId?: string;
  therapistId?: string;
  date?: string;
  timeSlot?: string;
  service?: string;
  status?: string;
  area?: string;
  remark?: string;
}

interface AppointmentRow {
  id: string;
  customer_id: string;
  therapist_id: string;
  date: string | Date;
  time_slot: string;
  status: string;
  progress_applied_at: string | Date | null;
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
  const hour = Number.parseInt(String(timeSlot || '').split(':')[0], 10);
  if (Number.isNaN(hour)) return null;
  if (hour < 13) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function incrementAssignedServicePeople(
  value: unknown,
  therapistName: string,
  fallbackTotal: number
): { changed: boolean; value: ServicePeople } {
  const servicePeople = parseJson<ServicePeople>(value, {});
  let changed = false;

  for (const key of ['sp1', 'sp2', 'sp3']) {
    const person = servicePeople[key];
    if (!person || person.assign !== therapistName) continue;
    const total = Math.max(1, Number(person.totalTimes) || fallbackTotal || 1);
    const used = Math.max(0, Number(person.usedTimes) || 0);
    servicePeople[key] = { ...person, usedTimes: String(Math.min(total, used + 1)) };
    changed = true;
  }

  return { changed, value: servicePeople };
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

    // Locking the therapist serializes concurrent bookings before conflict checking.
    await connection.execute('SELECT id FROM therapists WHERE id = ? FOR UPDATE', [therapistId]);
    const [sameDayRows] = await connection.execute(
      `SELECT time_slot FROM appointments
       WHERE therapist_id = ? AND date = ? AND status <> '已取消'`,
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
    await connection.execute(
      `INSERT INTO appointments (id, appointment_no, customer_id, therapist_id, date, time_slot, service, status, area, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        no,
        customerId,
        therapistId,
        date,
        timeSlot,
        body.service || '',
        body.status || '待确认',
        body.area || null,
        body.remark || null,
      ]
    );
    await connection.commit();
    return { id, no };
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
  pool: Pool = getDb()
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, customer_id, therapist_id, date, time_slot, status, progress_applied_at
       FROM appointments WHERE id = ? OR appointment_no = ? LIMIT 1 FOR UPDATE`,
      [appointmentId, appointmentId]
    );
    const appointment = (rows as AppointmentRow[])[0];
    if (!appointment) throw createError('预约不存在', 404);

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

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function applyOrderProgress(connection: PoolConnection, appointment: AppointmentRow) {
  const [orderRows] = await connection.query(
    `SELECT id, used_times, total_times, service_people FROM orders
     WHERE customer_id = ? AND used_times < total_times
       AND (manual_progress_at IS NULL OR TIMESTAMP(?, ?) > manual_progress_at)
     ORDER BY created_at DESC
     LIMIT 1 FOR UPDATE`,
    [appointment.customer_id, appointment.date, appointment.time_slot]
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
    Number(order.total_times) || 1
  );
  const servicePeopleValue = servicePeople.changed
    ? JSON.stringify(servicePeople.value)
    : typeof order.service_people === 'string'
      ? order.service_people
      : JSON.stringify(order.service_people ?? {});

  await connection.execute(
    'UPDATE orders SET used_times = LEAST(used_times + 1, total_times), service_people = ? WHERE id = ?',
    [servicePeopleValue, order.id]
  );
}
