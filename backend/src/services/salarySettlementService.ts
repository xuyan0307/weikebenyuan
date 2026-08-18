import type { Pool, PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'crypto';

export interface SalaryFeeDefaults {
  serviceType: '体验卡' | '套餐';
  itemCount: number;
  experienceFee: number;
  laborFee: number;
}

export function splitServiceItems(service: unknown): string[] {
  return String(service || '')
    .split(/[，,、+＋;；/|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function laborFeeByItemCount(itemCount: unknown): number {
  const count = Math.max(0, Math.floor(Number(itemCount) || 0));
  if (count <= 0) return 0;
  if (count === 1) return 200;
  return Math.min(600, (count + 1) * 100);
}

export function calculateSalaryFeeDefaults(service: unknown): SalaryFeeDefaults {
  const text = String(service || '').trim();
  const items = splitServiceItems(text);
  const isExperience = /体验/.test(text);
  const itemCount = Math.max(items.length, text ? 1 : 0);

  if (isExperience) {
    return {
      serviceType: '体验卡',
      itemCount,
      experienceFee: 200,
      laborFee: 0,
    };
  }

  return {
    serviceType: '套餐',
    itemCount,
    experienceFee: 0,
    laborFee: laborFeeByItemCount(itemCount),
  };
}

interface CompletedServiceRow {
  service_record_id: string;
  appointment_id: string;
  appointment_no: string;
  customer_id: string;
  customer_name: string | null;
  therapist_id: string;
  therapist_name: string | null;
  service_date: Date | string;
  service_items: string | null;
  signature_photos: unknown;
}

async function completedServices(
  connection: Pool | PoolConnection,
  month: string
): Promise<CompletedServiceRow[]> {
  const [rows] = await connection.query(
    `SELECT
       sr.id AS service_record_id,
       a.id AS appointment_id,
       a.appointment_no,
       sr.customer_id,
       COALESCE(
         c.name,
         JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.name')),
         '未知客户'
       ) AS customer_name,
       sr.therapist_id,
       COALESCE(t.name, '未知产康师') AS therapist_name,
       sr.service_date,
       COALESCE(NULLIF(sr.service_items, ''), a.service, '') AS service_items,
       sr.signature_photos
     FROM service_records sr
     INNER JOIN appointments a ON a.id = sr.appointment_id AND a.status = '已完成'
     LEFT JOIN customers c ON c.id = sr.customer_id
     LEFT JOIN orders o ON o.id = (
       SELECT recent_order.id
       FROM orders recent_order
       WHERE recent_order.customer_id = sr.customer_id
       ORDER BY recent_order.created_at DESC
       LIMIT 1
     )
     LEFT JOIN therapists t ON t.id = sr.therapist_id
     WHERE DATE_FORMAT(sr.service_date, '%Y-%m') = ? AND sr.reversed_at IS NULL
     ORDER BY sr.service_date, a.appointment_no`,
    [month]
  );
  return rows as CompletedServiceRow[];
}

export async function syncCompletedServicesToSalary(
  pool: Pool,
  month: string
): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const rows = await completedServices(connection, month);

    for (const row of rows) {
      const defaults = calculateSalaryFeeDefaults(row.service_items);
      await connection.execute(
        `INSERT INTO salary_settlement_entries (
           id, service_record_id, appointment_id, appointment_no,
           customer_id, customer_name, therapist_id, therapist_name,
           service_date, service_items, service_type, item_count,
           experience_fee, labor_fee, commission, coupon_fee,
           other_fee, deduction, payable_amount, source_type,
           evidence_snapshot, settlement_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, '排期完成服务', ?, '待确认')
         ON DUPLICATE KEY UPDATE
           appointment_id = VALUES(appointment_id),
           appointment_no = VALUES(appointment_no),
           customer_name = VALUES(customer_name),
           therapist_id = VALUES(therapist_id),
           therapist_name = VALUES(therapist_name),
           service_date = VALUES(service_date),
           service_items = VALUES(service_items),
           service_type = VALUES(service_type),
           item_count = VALUES(item_count),
           experience_fee = IF(manual_adjusted = 1, experience_fee, VALUES(experience_fee)),
           labor_fee = IF(manual_adjusted = 1, labor_fee, VALUES(labor_fee)),
           payable_amount = IF(manual_adjusted = 1, payable_amount, VALUES(payable_amount)),
           evidence_snapshot = VALUES(evidence_snapshot)`,
        [
          randomUUID(),
          row.service_record_id,
          row.appointment_id,
          row.appointment_no,
          row.customer_id,
          row.customer_name || '未知客户',
          row.therapist_id,
          row.therapist_name || '未知产康师',
          row.service_date,
          row.service_items || '',
          defaults.serviceType,
          defaults.itemCount,
          defaults.experienceFee,
          defaults.laborFee,
          defaults.experienceFee + defaults.laborFee,
          JSON.stringify({
            appointmentId: row.appointment_id,
            appointmentNo: row.appointment_no,
            serviceRecordId: row.service_record_id,
            completedService: true,
            signaturePhotos: row.signature_photos || [],
          }),
        ]
      );
    }

    const [therapists] = await connection.query(
      `SELECT DISTINCT therapist_id, therapist_name
       FROM salary_settlement_entries
       WHERE DATE_FORMAT(service_date, '%Y-%m') = ?`,
      [month]
    );

    for (const therapist of therapists as Array<{ therapist_id: string; therapist_name: string }>) {
      await connection.execute(
        `INSERT INTO salary_records (
           id, therapist_id, month, service_count, experience_fee,
           labor_fee, commission, coupon_fee, other_fee, deduction,
           total, status
         )
         SELECT UUID(), ?, ?,
           SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN 1 ELSE 0 END),
           COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN experience_fee ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN labor_fee ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN commission ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN coupon_fee ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN other_fee ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN deduction ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN payable_amount ELSE 0 END), 0),
           '待结算'
         FROM salary_settlement_entries
         WHERE therapist_id = ? AND DATE_FORMAT(service_date, '%Y-%m') = ?
         ON DUPLICATE KEY UPDATE
           service_count = VALUES(service_count),
           experience_fee = VALUES(experience_fee),
           labor_fee = VALUES(labor_fee),
           commission = VALUES(commission),
           coupon_fee = VALUES(coupon_fee),
           other_fee = VALUES(other_fee),
           deduction = VALUES(deduction),
           total = VALUES(total)`,
        [therapist.therapist_id, month, therapist.therapist_id, month]
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

export async function recalculateSalaryRecord(
  connection: Pool | PoolConnection,
  therapistId: string,
  month: string
): Promise<void> {
  await connection.execute(
    `UPDATE salary_records sr
     JOIN (
       SELECT therapist_id,
         SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN 1 ELSE 0 END) AS service_count,
         COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN experience_fee ELSE 0 END), 0) AS experience_fee,
         COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN labor_fee ELSE 0 END), 0) AS labor_fee,
         COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN commission ELSE 0 END), 0) AS commission,
         COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN coupon_fee ELSE 0 END), 0) AS coupon_fee,
         COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN other_fee ELSE 0 END), 0) AS other_fee,
         COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN deduction ELSE 0 END), 0) AS deduction,
         COALESCE(SUM(CASE WHEN reversed_at IS NULL AND settlement_status IN ('已确认', '已结算') THEN payable_amount ELSE 0 END), 0) AS total
       FROM salary_settlement_entries
       WHERE therapist_id = ? AND DATE_FORMAT(service_date, '%Y-%m') = ?
       GROUP BY therapist_id
     ) totals ON totals.therapist_id = sr.therapist_id
     SET sr.service_count = totals.service_count,
         sr.experience_fee = totals.experience_fee,
         sr.labor_fee = totals.labor_fee,
         sr.commission = totals.commission,
         sr.coupon_fee = totals.coupon_fee,
         sr.other_fee = totals.other_fee,
         sr.deduction = totals.deduction,
         sr.total = totals.total
     WHERE sr.therapist_id = ? AND sr.month = ?`,
    [therapistId, month, therapistId, month]
  );
}
