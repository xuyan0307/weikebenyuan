import type { Pool } from 'mysql2/promise';
import { getDb } from '../config/database';
import { updateAppointmentStatus } from './appointmentService';

let timer: NodeJS.Timeout | null = null;
let running = false;

interface DueAppointmentRow {
  id: string;
}

export async function completePastAppointments(pool: Pool = getDb()) {
  const [rows] = await pool.query(
    `SELECT a.id
     FROM appointments a
     WHERE a.status IN ('待确认', '已确认')
       AND a.is_backfill = 0
       AND TIMESTAMP(DATE(a.date), TIME(SUBSTRING_INDEX(a.time_slot, '-', 1)))
           <= CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')
     ORDER BY a.date, a.time_slot, a.created_at, a.id
     LIMIT 200`
  );
  const dueAppointments = rows as DueAppointmentRow[];
  let completed = 0;
  let failed = 0;

  for (const appointment of dueAppointments) {
    try {
      // The status transition owns the row lock and progress audit, so repeated
      // scheduler runs cannot apply the order count more than once.
      await updateAppointmentStatus(appointment.id, '已完成', pool);
      completed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Automatic appointment completion failed for ${appointment.id}:`, error);
    }
  }

  return { checked: dueAppointments.length, completed, failed };
}

/** 返回距离下一个北京时间时段结束点（12:00、18:00、次日00:00）的毫秒数。 */
export function millisecondsUntilNextPeriodScan(now = new Date()): number {
  const chinaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = chinaNow.getUTCFullYear();
  const month = chinaNow.getUTCMonth();
  const day = chinaNow.getUTCDate();
  const chinaHour = chinaNow.getUTCHours();
  const nextChinaHour = chinaHour < 12 ? 12 : chinaHour < 18 ? 18 : 24;
  const nextUtc = Date.UTC(year, month, day, nextChinaHour - 8, 0, 0, 0);
  return Math.max(1_000, nextUtc - now.getTime());
}

async function runScheduledCompletion() {
  if (running) return;
  running = true;
  try {
    const result = await completePastAppointments();
    if (result.checked > 0) {
      console.log(`Automatic appointment completion: ${result.completed} completed, ${result.failed} failed`);
    }
  } catch (error) {
    console.error('Automatic appointment completion scan failed:', error);
  } finally {
    running = false;
  }
}

export function startAppointmentAutoCompletionScheduler() {
  if (timer) return;
  void runScheduledCompletion();
  const scheduleNext = () => {
    timer = setTimeout(async () => {
      await runScheduledCompletion();
      scheduleNext();
    }, millisecondsUntilNextPeriodScan());
    timer.unref();
  };
  scheduleNext();
}

export function stopAppointmentAutoCompletionScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}
