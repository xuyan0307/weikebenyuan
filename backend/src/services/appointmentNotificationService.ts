import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { getDb } from '../config/database';
import { randomUUID } from 'crypto';
import { formatDateOnly } from '../utils/serialization';

export type AppointmentNotifyStatus = '需通知' | '已通知' | '延迟' | '遗漏';
export const APPOINTMENT_NOTIFY_STATUSES: AppointmentNotifyStatus[] = [
  '需通知',
  '已通知',
  '延迟',
  '遗漏',
];

interface ReminderRow {
  id: string;
  appointment_no: string;
  customer_name: string | null;
  advisor_name: string | null;
  advisor_wecom_userid: string | null;
  therapist_name: string | null;
  date: string | Date;
  time_slot: string;
  service: string | null;
  notify_replied_at: string | Date | null;
  notify_manual_status: AppointmentNotifyStatus | null;
}

export const REMINDER_HOURS = [12, 6, 3] as const;

let timer: NodeJS.Timeout | null = null;
let accessToken = '';
let accessTokenExpiresAt = 0;

async function auditAutomaticDelivery(
  appointmentId: string,
  reminderHours: number,
  responseStatus: number,
  description: string
) {
  await getDb().execute(
    `INSERT INTO operation_logs
       (id, user_id, username, action, module, entity_id, request_id,
        description, request_payload, response_status, ip_address)
     VALUES (?, 'system', '预约通知调度器', 'WECOM_SEND', 'appointments', ?, ?, ?, ?, ?, 'internal')`,
    [
      randomUUID(), appointmentId, randomUUID(), description.slice(0, 500),
      JSON.stringify({ appointmentId, reminderHours }), responseStatus,
    ]
  ).catch(error => console.error('Appointment notification audit failed', error));
}

function dateOnly(value: string | Date) {
  return formatDateOnly(value);
}

export function timeSlotStart(timeSlot: string) {
  const value = String(timeSlot || '').trim();
  const explicit = value.match(/(?:^|\s)(\d{1,2}):(\d{2})/);
  if (explicit) return `${explicit[1].padStart(2, '0')}:${explicit[2]}`;
  if (value.includes('上午')) return '09:00';
  if (value.includes('下午')) return '13:00';
  if (value.includes('晚上')) return '18:00';
  return '09:00';
}

export function appointmentStartAt(date: string | Date, timeSlot: string) {
  return new Date(`${dateOnly(date)}T${timeSlotStart(timeSlot)}:00+08:00`);
}

export function activeReminderHour(startAt: Date, now = new Date()) {
  const remainingHours = (startAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  if (remainingHours <= 0 || remainingHours > 12) return null;
  if (remainingHours > 6) return 12;
  if (remainingHours > 3) return 6;
  return 3;
}

export function deriveNotificationStatus(
  startAt: Date,
  repliedAt?: Date | null,
  now = new Date()
): AppointmentNotifyStatus | null {
  if (repliedAt) {
    if (repliedAt.getTime() >= startAt.getTime()) return '遗漏';
    if (repliedAt.getTime() > startAt.getTime() - 2 * 60 * 60 * 1000) return '延迟';
    return '已通知';
  }
  const remainingHours = (startAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  if (remainingHours <= 0) return '遗漏';
  if (remainingHours <= 2) return '延迟';
  if (remainingHours <= 12) return '需通知';
  return null;
}

export function parseNotificationReply(content: string) {
  const match = /^已通知(?:\s+(.+))?$/.exec(String(content || '').trim());
  if (!match) return undefined;
  return match[1]?.trim() || null;
}

function wecomConfigured() {
  return Boolean(
    process.env.WECOM_CORP_ID &&
    process.env.WECOM_APP_SECRET &&
    process.env.WECOM_AGENT_ID
  );
}

function escapeWecomText(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function getWecomAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
  const response = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(process.env.WECOM_CORP_ID || '')}&corpsecret=${encodeURIComponent(process.env.WECOM_APP_SECRET || '')}`
  );
  const result = await response.json() as {
    errcode?: number;
    errmsg?: string;
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || result.errcode || !result.access_token) {
    throw new Error(`WeCom token failed: ${result.errmsg || response.statusText}`);
  }
  accessToken = result.access_token;
  accessTokenExpiresAt = Date.now() + Math.max(60, (result.expires_in || 7200) - 300) * 1000;
  return accessToken;
}

async function sendWecomReminder(row: ReminderRow, reminderHours: number) {
  if (!row.advisor_wecom_userid) {
    throw new Error('Assigned advisor has no Enterprise WeChat UserID');
  }
  if (!wecomConfigured()) throw new Error('WeCom reminder is not configured');

  const token = await getWecomAccessToken();
  const start = appointmentStartAt(row.date, row.time_slot);
  const startText = start.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
  const cardUrl = process.env.WECOM_APPOINTMENT_URL
    || process.env.PUBLIC_BASE_URL
    || 'https://weikebenyuan.com';
  const appointmentKey = row.appointment_no || row.id;
  const description = [
    `<div class="gray">预约时间：${escapeWecomText(startText)}</div>`,
    `<div class="normal">客户：${escapeWecomText(row.customer_name || '未填写')}</div>`,
    `<div class="normal">服务项目：${escapeWecomText(row.service || '未填写')}</div>`,
    `<div class="normal">服务技师：${escapeWecomText(row.therapist_name || '待分配')}</div>`,
    `<div class="gray">预约编号：${escapeWecomText(appointmentKey)}</div>`,
    `<div class="highlight">这是服务开始前 ${reminderHours} 小时提醒</div>`,
    `<div class="highlight">请回复：已通知 ${escapeWecomText(appointmentKey)}</div>`,
  ].join('');
  const response = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: row.advisor_wecom_userid,
        msgtype: 'textcard',
        agentid: Number(process.env.WECOM_AGENT_ID),
        textcard: {
          title: `预约提醒：${row.customer_name || '客户'}`,
          description,
          url: cardUrl,
          btntxt: '查看预约',
        },
        enable_id_trans: 0,
      }),
    }
  );
  const result = await response.json() as { errcode?: number; errmsg?: string; msgid?: string };
  if (!response.ok || result.errcode) {
    throw new Error(`WeCom send failed: ${result.errmsg || response.statusText}`);
  }
  return result.msgid || '';
}

export async function recordNotificationReply(
  appointmentId: string,
  repliedAt = new Date(),
  wecomUserId?: string
) {
  const db = getDb();
  const [rows] = await db.query(
    `SELECT a.id, a.date, a.time_slot,
            COALESCE(
              NULLIF(u.wecom_userid, ''),
              JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorWecomUserId'))
            ) AS advisor_wecom_userid
     FROM appointments a
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN orders o ON o.id = (
       SELECT recent_order.id FROM orders recent_order
       WHERE recent_order.customer_id = a.customer_id
       ORDER BY recent_order.created_at DESC LIMIT 1
     )
     LEFT JOIN users u ON u.id = COALESCE(
       c.advisor_id,
       JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId'))
     )
     WHERE a.id = ? OR a.appointment_no = ?
     LIMIT 1`,
    [appointmentId, appointmentId]
  );
  const row = (rows as Array<{
    id: string;
    date: string | Date;
    time_slot: string;
    advisor_wecom_userid: string | null;
  }>)[0];
  if (!row) throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
  if (wecomUserId && wecomUserId !== row.advisor_wecom_userid) {
    throw Object.assign(new Error('The reply sender is not the assigned advisor'), {
      statusCode: 403,
    });
  }

  const status = deriveNotificationStatus(
    appointmentStartAt(row.date, row.time_slot),
    repliedAt
  );
  await db.execute(
    `UPDATE appointments
     SET notify_status = ?, notify_manual_status = NULL,
         notify_replied_at = ?, notify_error = NULL
     WHERE id = ?`,
    [status, repliedAt, row.id]
  );
  return status;
}

export async function updateAppointmentNotificationStatus(
  appointmentId: string,
  status: AppointmentNotifyStatus,
  actor: { id: string; role: string },
  db: Pool = getDb()
) {
  if (!APPOINTMENT_NOTIFY_STATUSES.includes(status)) {
    throw Object.assign(new Error('Invalid appointment notification status'), {
      statusCode: 400,
    });
  }
  const [rows] = await db.query(
    `SELECT a.id,
            COALESCE(
              c.advisor_id,
              JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId'))
            ) AS advisor_id
     FROM appointments a
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN orders o ON o.id = (
       SELECT recent_order.id FROM orders recent_order
       WHERE recent_order.customer_id = a.customer_id
       ORDER BY recent_order.created_at DESC LIMIT 1
     )
     WHERE a.id = ? OR a.appointment_no = ?
     LIMIT 1`,
    [appointmentId, appointmentId]
  );
  const appointment = (rows as Array<{ id: string; advisor_id: string | null }>)[0];
  if (!appointment) {
    throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
  }
  if (actor.role === 'service' && appointment.advisor_id !== actor.id) {
    throw Object.assign(new Error('Only the assigned advisor can update this notification'), {
      statusCode: 403,
    });
  }
  await db.execute(
    `UPDATE appointments
     SET notify_status = ?, notify_manual_status = ?,
         notify_replied_at = CASE WHEN ? = '已通知' THEN NOW() ELSE NULL END,
         notify_error = NULL
     WHERE id = ?`,
    [status, status, status, appointment.id]
  );
  return status;
}

export async function recordNotificationReplyFromWecom(
  content: string,
  wecomUserId: string,
  repliedAt = new Date()
) {
  const appointmentKey = parseNotificationReply(content);
  if (appointmentKey === undefined) {
    throw Object.assign(new Error('Unsupported reply content'), { statusCode: 400 });
  }
  if (!wecomUserId) {
    throw Object.assign(new Error('Enterprise WeChat sender is required'), {
      statusCode: 400,
    });
  }
  if (appointmentKey) {
    return recordNotificationReply(appointmentKey, repliedAt, wecomUserId);
  }

  const db = getDb();
  const [rows] = await db.query(
    `SELECT a.id, a.date, a.time_slot
     FROM appointments a
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN orders o ON o.id = (
       SELECT recent_order.id FROM orders recent_order
       WHERE recent_order.customer_id = a.customer_id
       ORDER BY recent_order.created_at DESC LIMIT 1
     )
     LEFT JOIN users u ON u.id = COALESCE(
       c.advisor_id,
       JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId'))
     )
     WHERE a.notify_replied_at IS NULL
       AND a.status NOT LIKE '%取消%'
       AND EXISTS (
         SELECT 1
         FROM appointment_notification_deliveries delivery
         WHERE delivery.appointment_id = a.id
           AND delivery.sent_at IS NOT NULL
       )
       AND COALESCE(
         NULLIF(u.wecom_userid, ''),
         JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorWecomUserId'))
       ) = ?`,
    [wecomUserId]
  );
  const candidates = (rows as Array<{
    id: string;
    date: string | Date;
    time_slot: string;
  }>).map(row => ({
    ...row,
    startAt: appointmentStartAt(row.date, row.time_slot),
  }));
  const future = candidates
    .filter(row => row.startAt.getTime() >= repliedAt.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const past = candidates
    .filter(row => row.startAt.getTime() < repliedAt.getTime())
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  const candidate = future[0] || past[0];
  if (!candidate) {
    throw Object.assign(new Error('No pending appointment notification found'), {
      statusCode: 404,
    });
  }
  return recordNotificationReply(candidate.id, repliedAt, wecomUserId);
}

export async function syncAppointmentNotificationStates(now = new Date()) {
  const db = getDb();
  const [rows] = await db.query(
    `SELECT a.id, a.appointment_no, a.date, a.time_slot, a.service, a.notify_replied_at,
            a.notify_manual_status,
            COALESCE(c.name, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.name'))) AS customer_name,
            COALESCE(u.name, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisor'))) AS advisor_name,
            COALESCE(
              NULLIF(u.wecom_userid, ''),
              JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorWecomUserId'))
            ) AS advisor_wecom_userid,
            t.name AS therapist_name
     FROM appointments a
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN orders o ON o.id = (
       SELECT recent_order.id FROM orders recent_order
       WHERE recent_order.customer_id = a.customer_id
       ORDER BY recent_order.created_at DESC LIMIT 1
     )
     LEFT JOIN users u ON u.id = COALESCE(
       c.advisor_id,
       JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.advisorId'))
     )
     LEFT JOIN therapists t ON t.id = a.therapist_id
     WHERE a.status NOT LIKE '%取消%'
       AND a.status NOT LIKE '%完成%'
       AND a.date BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)`
  );

  for (const row of rows as ReminderRow[]) {
    const start = appointmentStartAt(row.date, row.time_slot);
    const firstReminderAt = new Date(start.getTime() - 12 * 60 * 60 * 1000);
    await db.execute(
      'UPDATE appointments SET notify_scheduled_at = ? WHERE id = ?',
      [firstReminderAt, row.id]
    );

    if (row.notify_manual_status) continue;
    if (row.notify_replied_at) continue;
    const currentStatus = deriveNotificationStatus(start, null, now);
    if (currentStatus) {
      await db.execute(
        `UPDATE appointments SET notify_status = ?
         WHERE id = ? AND notify_replied_at IS NULL AND notify_manual_status IS NULL`,
        [currentStatus, row.id]
      );
    }
    if (now.getTime() >= start.getTime()) {
      continue;
    }

    const reminderHours = activeReminderHour(start, now);
    if (!reminderHours) continue;
    const scheduledAt = new Date(start.getTime() - reminderHours * 60 * 60 * 1000);
    const [priorRows] = await db.query(
      `SELECT delivery_status, next_retry_at
       FROM appointment_notification_deliveries
       WHERE appointment_id = ? AND reminder_hours = ? LIMIT 1`,
      [row.id, reminderHours]
    );
    const prior = (priorRows as Array<{ delivery_status: string; next_retry_at: Date | null }>)[0];
    if (prior?.delivery_status === 'sent') continue;
    if (prior?.next_retry_at && new Date(prior.next_retry_at).getTime() > now.getTime()) continue;
    const [claim] = await db.execute<ResultSetHeader>(
      `INSERT IGNORE INTO appointment_notification_deliveries
         (id, appointment_id, reminder_hours, scheduled_at, delivery_status, attempt_count, last_attempt_at)
       VALUES (UUID(), ?, ?, ?, 'sending', 1, ?)
       ON DUPLICATE KEY UPDATE
         delivery_status = IF(delivery_status = 'sent', delivery_status, 'sending'),
         attempt_count = IF(delivery_status = 'sent', attempt_count, attempt_count + 1),
         last_attempt_at = IF(delivery_status = 'sent', last_attempt_at, VALUES(last_attempt_at)),
         next_retry_at = IF(delivery_status = 'sent', next_retry_at, NULL),
         error = IF(delivery_status = 'sent', error, NULL)`,
      [row.id, reminderHours, scheduledAt, now]
    );
    if (!claim.affectedRows) continue;

    const [deliveryRows] = await db.query(
      `SELECT delivery_status FROM appointment_notification_deliveries
       WHERE appointment_id = ? AND reminder_hours = ? LIMIT 1`,
      [row.id, reminderHours]
    );
    if ((deliveryRows as Array<{ delivery_status: string }>)[0]?.delivery_status === 'sent') continue;

    try {
      const messageId = await sendWecomReminder(row, reminderHours);
      await db.execute(
        `UPDATE appointment_notification_deliveries
         SET sent_at = ?, message_id = ?, error = NULL, delivery_status = 'sent',
             response_summary = ?, next_retry_at = NULL
         WHERE appointment_id = ? AND reminder_hours = ?`,
        [now, messageId, `message_id=${messageId}`.slice(0, 500), row.id, reminderHours]
      );
      await db.execute(
        `UPDATE appointments
         SET notify_sent_at = ?, notify_message_id = ?, notify_error = NULL
         WHERE id = ?`,
        [now, messageId, row.id]
      );
      await auditAutomaticDelivery(row.id, reminderHours, 200, `企业微信预约提醒发送成功，message_id=${messageId}`);
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 500);
      const nextRetryAt = new Date(now.getTime() + 5 * 60 * 1000);
      await db.execute(
        `UPDATE appointment_notification_deliveries
         SET delivery_status = 'failed', error = ?, response_summary = ?, next_retry_at = ?
         WHERE appointment_id = ? AND reminder_hours = ? AND sent_at IS NULL`,
        [message, message, nextRetryAt, row.id, reminderHours]
      );
      await db.execute(
        'UPDATE appointments SET notify_error = ? WHERE id = ?',
        [message, row.id]
      );
      await auditAutomaticDelivery(row.id, reminderHours, 502, `企业微信预约提醒发送失败：${message}`);
    }
  }
}

export function startAppointmentNotificationScheduler() {
  if (timer) return;
  void syncAppointmentNotificationStates().catch(error => {
    console.error('Appointment notification sync failed', error);
  });
  timer = setInterval(() => {
    void syncAppointmentNotificationStates().catch(error => {
      console.error('Appointment notification sync failed', error);
    });
  }, 60 * 1000);
  timer.unref();
}

export function stopAppointmentNotificationScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
