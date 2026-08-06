import mysql from 'mysql2/promise';

interface Migration {
  id: string;
  description: string;
  up: (db: mysql.Pool) => Promise<void>;
}

async function columnExists(db: mysql.Pool, table: string, column: string) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number((rows as Array<{ cnt: number }>)[0]?.cnt || 0) > 0;
}

async function indexExists(db: mysql.Pool, table: string, indexName: string) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return Number((rows as Array<{ cnt: number }>)[0]?.cnt || 0) > 0;
}

async function addColumn(
  db: mysql.Pool,
  table: string,
  column: string,
  definition: string
) {
  if (!(await columnExists(db, table, column))) {
    await db.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

const migrations: Migration[] = [
  {
    id: '001_order_enums',
    description: 'Normalize order type and payment status enums',
    up: async db => {
      await db.execute(
        "ALTER TABLE orders MODIFY pay_status enum('已付款','待付款','已退款','已付定金') DEFAULT '待付款' COMMENT '支付状态'"
      );
      await db.execute(
        "ALTER TABLE orders MODIFY type enum('体验卡','套餐') NOT NULL COMMENT '订单类型'"
      );
    },
  },
  {
    id: '002_user_fields',
    description: 'Add user profile and permission fields',
    up: async db => {
      await addColumn(db, 'users', 'wechat', "varchar(100) DEFAULT NULL COMMENT '微信号'");
      await addColumn(db, 'users', 'permissions', "JSON DEFAULT NULL COMMENT '页面权限'");
    },
  },
  {
    id: '003_order_service_fields',
    description: 'Add order service and attachment fields',
    up: async db => {
      await addColumn(db, 'orders', 'service_items', "varchar(500) DEFAULT NULL COMMENT '服务项目名称'");
      await addColumn(db, 'orders', 'service_people', "JSON DEFAULT NULL COMMENT '服务人员分配'");
      await addColumn(db, 'orders', 'appointment_time', "varchar(50) DEFAULT NULL COMMENT '预约时间'");
      await addColumn(db, 'orders', 'service_note', "text DEFAULT NULL COMMENT '服务备注'");
      await addColumn(db, 'orders', 'contract_attachments', "JSON DEFAULT NULL COMMENT '合同附件'");
      await addColumn(db, 'orders', 'service_photo_records', "JSON DEFAULT NULL COMMENT '服务照片记录'");
      await addColumn(db, 'orders', 'manual_progress_at', "datetime DEFAULT NULL COMMENT '服务进度人工校正时间' AFTER total_times");
    },
  },
  {
    id: '004_order_customer_snapshot',
    description: 'Move ordered customers from lead pool to immutable snapshots',
    up: async db => {
      await addColumn(db, 'orders', 'customer_snapshot', "JSON DEFAULT NULL COMMENT '转入订单池的客户资料快照' AFTER customer_id");
      await db.execute(
        `UPDATE orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = c.advisor_id
         SET o.customer_snapshot = JSON_OBJECT(
           'id', c.id,
           'customerCode', c.customer_code,
           'name', c.name,
           'wechat', c.wechat,
           'phone', c.phone,
           'area', c.area,
           'source', c.source,
           'acquiredAt', DATE_FORMAT(c.acquired_at, '%Y-%m-%d'),
           'tag', c.tag,
           'followStatus', c.follow_status,
           'followDate', DATE_FORMAT(c.follow_date, '%Y-%m-%d'),
           'advisorId', c.advisor_id,
           'advisor', u.name,
           'profile', COALESCE(c.profile, JSON_OBJECT()),
           'situation', c.situation,
           'intendedProduct', c.intended_product,
           'remark', c.remark
         )
         WHERE o.customer_snapshot IS NULL AND c.id IS NOT NULL`
      );

      const [missingSnapshots] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.customer_snapshot IS NULL`
      );
      if (Number((missingSnapshots as Array<{ cnt: number }>)[0]?.cnt || 0) > 0) {
        throw new Error('Customer pool migration stopped: some orders have no customer snapshot');
      }

      await db.execute(
        `DELETE c FROM customers c
         JOIN (SELECT DISTINCT customer_id FROM orders) ordered ON ordered.customer_id = c.id`
      );
    },
  },
  {
    id: '005_order_purchase_date',
    description: 'Add and backfill order purchase date',
    up: async db => {
      await addColumn(db, 'orders', 'purchase_date', "date DEFAULT NULL COMMENT '购卡时间' AFTER paid_at");
      await db.execute('UPDATE orders SET purchase_date = DATE(created_at) WHERE purchase_date IS NULL');
    },
  },
  {
    id: '006_order_indexes',
    description: 'Add indexes for order list and customer lookups',
    up: async db => {
      const indexes = [
        ['idx_created_at', 'created_at'],
        ['idx_purchase_date', 'purchase_date'],
        ['idx_customer_created_at', 'customer_id, created_at'],
      ] as const;
      for (const [name, columns] of indexes) {
        if (!(await indexExists(db, 'orders', name))) {
          await db.execute(`ALTER TABLE orders ADD INDEX \`${name}\` (${columns})`);
        }
      }
    },
  },
  {
    id: '007_list_query_indexes',
    description: 'Add composite indexes for customer pool and appointment schedules',
    up: async db => {
      const indexes = [
        ['customers', 'idx_pool_list', 'tag, total_orders, acquired_at, created_at'],
        ['appointments', 'idx_schedule', 'date, status, therapist_id'],
      ] as const;
      for (const [table, name, columns] of indexes) {
        if (!(await indexExists(db, table, name))) {
          await db.execute(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (${columns})`);
        }
      }
    },
  },
  {
    id: '008_appointment_progress_guard',
    description: 'Prevent completed appointments from applying service progress more than once',
    up: async db => {
      await addColumn(
        db,
        'appointments',
        'progress_applied_at',
        "datetime DEFAULT NULL COMMENT '服务进度已同步时间' AFTER status"
      );
      await db.execute(
        "UPDATE appointments SET progress_applied_at = COALESCE(updated_at, created_at) WHERE status = '已完成' AND progress_applied_at IS NULL"
      );
    },
  },
  {
    id: '009_service_record_evidence',
    description: 'Store service signature evidence and keep one record per appointment',
    up: async db => {
      await addColumn(
        db,
        'service_records',
        'signature_photos',
        "JSON DEFAULT NULL COMMENT '客户签字凭证照片' AFTER photos"
      );
      await db.execute(
        `DELETE duplicate_record FROM service_records duplicate_record
         JOIN service_records retained_record
           ON retained_record.appointment_id = duplicate_record.appointment_id
          AND (
            retained_record.created_at < duplicate_record.created_at
            OR (
              retained_record.created_at = duplicate_record.created_at
              AND retained_record.id < duplicate_record.id
            )
          )`
      );
      if (!(await indexExists(db, 'service_records', 'uk_service_record_appointment'))) {
        await db.execute(
          'ALTER TABLE service_records ADD UNIQUE INDEX `uk_service_record_appointment` (appointment_id)'
        );
      }
    },
  },
  {
    id: '010_backfill_completed_service_records',
    description: 'Backfill service records for appointments completed before evidence tracking',
    up: async db => {
      await db.execute(
        `INSERT IGNORE INTO service_records
          (id, appointment_id, customer_id, therapist_id, service_date, service_items, duration, feedback, photos, signature_photos)
         SELECT UUID(), a.id, a.customer_id, a.therapist_id, TIMESTAMP(a.date, a.time_slot),
                NULLIF(a.service, ''), NULL, NULL, JSON_ARRAY(), JSON_ARRAY()
         FROM appointments a
         LEFT JOIN service_records s ON s.appointment_id = a.id
         WHERE a.status = '已完成' AND s.id IS NULL`
      );
    },
  },
  {
    id: '011_appointment_notifications',
    description: 'Persist appointment reminder delivery and reply state',
    up: async db => {
      await addColumn(
        db,
        'appointments',
        'notify_status',
        "varchar(20) NOT NULL DEFAULT '待通知' AFTER progress_applied_at"
      );
      await addColumn(
        db,
        'appointments',
        'notify_scheduled_at',
        'datetime DEFAULT NULL AFTER notify_status'
      );
      await addColumn(
        db,
        'appointments',
        'notify_sent_at',
        'datetime DEFAULT NULL AFTER notify_scheduled_at'
      );
      await addColumn(
        db,
        'appointments',
        'notify_replied_at',
        'datetime DEFAULT NULL AFTER notify_sent_at'
      );
      await addColumn(
        db,
        'appointments',
        'notify_message_id',
        'varchar(100) DEFAULT NULL AFTER notify_replied_at'
      );
      await addColumn(
        db,
        'appointments',
        'notify_error',
        'varchar(500) DEFAULT NULL AFTER notify_message_id'
      );
      if (!(await indexExists(db, 'appointments', 'idx_appointment_notification'))) {
        await db.execute(
          'ALTER TABLE appointments ADD INDEX `idx_appointment_notification` (`status`, `date`, `notify_sent_at`)'
        );
      }
    },
  },
  {
    id: '012_wecom_staged_notifications',
    description: 'Store enterprise WeChat member IDs and staged reminder delivery state',
    up: async db => {
      await addColumn(
        db,
        'users',
        'wecom_userid',
        "varchar(100) DEFAULT NULL COMMENT 'Enterprise WeChat member UserID' AFTER wechat"
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS appointment_notification_deliveries (
          id varchar(36) PRIMARY KEY,
          appointment_id varchar(36) NOT NULL,
          reminder_hours tinyint unsigned NOT NULL,
          scheduled_at datetime NOT NULL,
          sent_at datetime DEFAULT NULL,
          message_id varchar(100) DEFAULT NULL,
          error varchar(500) DEFAULT NULL,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_appointment_reminder (appointment_id, reminder_hours),
          KEY idx_appointment_reminder_sent (sent_at, scheduled_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
    },
  },
  {
    id: '013_appointment_notification_manual_status',
    description: 'Allow advisors to persist an explicit appointment notification status',
    up: async db => {
      await addColumn(
        db,
        'appointments',
        'notify_manual_status',
        "varchar(20) DEFAULT NULL COMMENT 'Manually selected notification status' AFTER notify_status"
      );
      await db.execute(
        "UPDATE appointments SET notify_status = '需通知' WHERE notify_status = '待通知'"
      );
      await db.execute(
        "ALTER TABLE appointments MODIFY notify_status varchar(20) NOT NULL DEFAULT '需通知'"
      );
    },
  },
  {
    id: '014_salary_settlement_evidence',
    description: 'Persist completed service evidence and editable salary settlement details',
    up: async db => {
      await addColumn(db, 'salary_records', 'experience_fee', "decimal(10,2) NOT NULL DEFAULT 0 AFTER service_count");
      await addColumn(db, 'salary_records', 'coupon_fee', "decimal(10,2) NOT NULL DEFAULT 0 AFTER commission");
      await addColumn(db, 'salary_records', 'other_fee', "decimal(10,2) NOT NULL DEFAULT 0 AFTER coupon_fee");
      await addColumn(db, 'salary_records', 'deduction', "decimal(10,2) NOT NULL DEFAULT 0 AFTER other_fee");
      await addColumn(db, 'salary_records', 'confirmed_at', "datetime DEFAULT NULL AFTER status");
      await addColumn(db, 'salary_records', 'confirmed_by', "varchar(36) DEFAULT NULL AFTER confirmed_at");
      await addColumn(db, 'salary_records', 'settlement_note', "varchar(500) DEFAULT NULL AFTER settled_at");

      await db.execute(
        `CREATE TABLE IF NOT EXISTS salary_settlement_entries (
          id varchar(36) PRIMARY KEY,
          service_record_id varchar(36) NOT NULL,
          appointment_id varchar(36) NOT NULL,
          appointment_no varchar(50) NOT NULL,
          customer_id varchar(36) NOT NULL,
          customer_name varchar(100) NOT NULL,
          therapist_id varchar(36) NOT NULL,
          therapist_name varchar(100) NOT NULL,
          service_date datetime NOT NULL,
          service_items text,
          service_type varchar(20) NOT NULL DEFAULT '套餐',
          item_count int NOT NULL DEFAULT 0,
          experience_fee decimal(10,2) NOT NULL DEFAULT 0,
          labor_fee decimal(10,2) NOT NULL DEFAULT 0,
          commission decimal(10,2) NOT NULL DEFAULT 0,
          coupon_fee decimal(10,2) NOT NULL DEFAULT 0,
          other_fee decimal(10,2) NOT NULL DEFAULT 0,
          deduction decimal(10,2) NOT NULL DEFAULT 0,
          payable_amount decimal(10,2) NOT NULL DEFAULT 0,
          source_type varchar(50) NOT NULL DEFAULT '排期完成服务',
          evidence_snapshot json DEFAULT NULL,
          settlement_status varchar(20) NOT NULL DEFAULT '待确认',
          settlement_note varchar(500) DEFAULT NULL,
          manual_adjusted tinyint(1) NOT NULL DEFAULT 0,
          adjusted_by varchar(36) DEFAULT NULL,
          adjusted_at datetime DEFAULT NULL,
          confirmed_by varchar(36) DEFAULT NULL,
          confirmed_at datetime DEFAULT NULL,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_salary_service_record (service_record_id),
          KEY idx_salary_entry_month_therapist (service_date, therapist_id),
          KEY idx_salary_entry_status (settlement_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
    },
  },
  {
    id: '015_salary_settlement_collation',
    description: 'Align salary evidence text collation with platform tables',
    up: async db => {
      await db.execute(
        'ALTER TABLE salary_settlement_entries CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
      );
    },
  },
  {
    id: '016_salary_customer_ledger',
    description: 'Persist monthly coupon and paid subtotals for therapist customer ledgers',
    up: async db => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS salary_customer_adjustments (
          id varchar(36) PRIMARY KEY,
          therapist_id varchar(36) NOT NULL,
          customer_id varchar(36) NOT NULL,
          month varchar(7) NOT NULL,
          coupon_fee decimal(10,2) NOT NULL DEFAULT 0,
          paid_amount decimal(10,2) NOT NULL DEFAULT 0,
          adjustment_note varchar(500) DEFAULT NULL,
          adjusted_by varchar(36) DEFAULT NULL,
          adjusted_at datetime DEFAULT NULL,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_salary_customer_month (therapist_id, customer_id, month),
          KEY idx_salary_customer_month (month, therapist_id),
          KEY idx_salary_customer_customer (customer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
    },
  },
  {
    id: '017_salary_customer_other_fee',
    description: 'Persist editable customer-level other salary fees',
    up: async db => {
      await addColumn(
        db,
        'salary_customer_adjustments',
        'other_fee',
        "decimal(10,2) NOT NULL DEFAULT 0 AFTER coupon_fee"
      );
      await db.execute(
        'ALTER TABLE salary_customer_adjustments MODIFY coupon_fee decimal(10,2) NOT NULL DEFAULT 300'
      );
    },
  },
  {
    id: '018_notification_delivery_audit',
    description: 'Retain failed enterprise WeChat delivery evidence and retry state',
    up: async db => {
      await addColumn(
        db,
        'appointment_notification_deliveries',
        'delivery_status',
        "varchar(20) NOT NULL DEFAULT 'pending' AFTER scheduled_at"
      );
      await addColumn(
        db,
        'appointment_notification_deliveries',
        'attempt_count',
        'int unsigned NOT NULL DEFAULT 0 AFTER delivery_status'
      );
      await addColumn(
        db,
        'appointment_notification_deliveries',
        'last_attempt_at',
        'datetime DEFAULT NULL AFTER attempt_count'
      );
      await addColumn(
        db,
        'appointment_notification_deliveries',
        'next_retry_at',
        'datetime DEFAULT NULL AFTER last_attempt_at'
      );
      await addColumn(
        db,
        'appointment_notification_deliveries',
        'response_summary',
        'varchar(500) DEFAULT NULL AFTER message_id'
      );
      await db.execute(
        `UPDATE appointment_notification_deliveries
         SET delivery_status = CASE WHEN sent_at IS NULL THEN 'failed' ELSE 'sent' END,
             attempt_count = CASE WHEN attempt_count = 0 THEN 1 ELSE attempt_count END`
      );
    },
  },
  {
    id: '019_platform_settings',
    description: 'Persist platform notification, finance and report settings',
    up: async db => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS platform_settings (
          setting_key varchar(100) PRIMARY KEY,
          setting_value json NOT NULL,
          updated_by varchar(36) DEFAULT NULL,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_platform_settings_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
    },
  },
  {
    id: '020_operation_log_trace_fields',
    description: 'Add entity, request and result evidence to operation logs',
    up: async db => {
      await addColumn(db, 'operation_logs', 'entity_id', 'varchar(100) DEFAULT NULL AFTER module');
      await addColumn(db, 'operation_logs', 'request_id', 'varchar(100) DEFAULT NULL AFTER entity_id');
      await addColumn(db, 'operation_logs', 'request_payload', 'json DEFAULT NULL AFTER description');
      await addColumn(db, 'operation_logs', 'response_status', 'smallint unsigned DEFAULT NULL AFTER request_payload');
      if (!(await indexExists(db, 'operation_logs', 'idx_operation_entity'))) {
        await db.execute('ALTER TABLE operation_logs ADD INDEX idx_operation_entity (module, entity_id)');
      }
      if (!(await indexExists(db, 'operation_logs', 'idx_operation_request'))) {
        await db.execute('ALTER TABLE operation_logs ADD INDEX idx_operation_request (request_id)');
      }
    },
  },
  {
    id: '021_reconcile_cancelled_service_evidence',
    description: 'Restore completed status when an historical cancelled appointment has service evidence',
    up: async db => {
      await db.execute(
        `INSERT INTO operation_logs
           (id, user_id, username, action, module, entity_id, request_id,
            description, request_payload, response_status, ip_address)
         SELECT UUID(), 'system', '数据一致性迁移', 'RECONCILE_STATUS', 'appointments', a.id,
                CONCAT('migration-021-', a.id),
                '检测到已取消预约存在服务凭证，按服务凭证恢复为已完成',
                JSON_OBJECT('beforeStatus', a.status, 'afterStatus', '已完成', 'serviceRecordId', sr.id),
                200, 'internal'
         FROM appointments a
         INNER JOIN service_records sr ON sr.appointment_id = a.id
         WHERE a.status IN ('已取消','取消')`
      );
      await db.execute(
        `UPDATE appointments a
         INNER JOIN service_records sr ON sr.appointment_id = a.id
         SET a.status = '已完成',
             a.progress_applied_at = COALESCE(a.progress_applied_at, sr.service_date)
         WHERE a.status IN ('已取消','取消')`
      );
    },
  },
  {
    id: '022_therapist_commission_rate',
    description: 'Persist editable therapist commission rate and backfill it from grade',
    up: async db => {
      await addColumn(
        db,
        'therapists',
        'commission_rate',
        'decimal(5,2) NOT NULL DEFAULT 0 AFTER star_level'
      );
      await db.execute(
        `UPDATE therapists
         SET commission_rate = CASE
           WHEN upgrade_rate >= 75 THEN 15
           WHEN upgrade_rate >= 60 THEN 12
           WHEN upgrade_rate >= 50 THEN 8
           WHEN upgrade_rate >= 40 THEN 6
           ELSE 0
         END`
      );
    },
  },
  {
    id: '023_canonical_order_customers',
    description: 'Restore ordered customers to the customer master and use one canonical customer code',
    up: async db => {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [maxRows] = await connection.query(
          `SELECT MAX(CAST(customer_code AS UNSIGNED)) AS max_code
           FROM customers WHERE customer_code REGEXP '^[0-9]+$'`
        );
        let nextCode = Math.max(
          100000,
          Number((maxRows as Array<{ max_code: number | null }>)[0]?.max_code || 100000)
        );
        const [orderRows] = await connection.query(
          `SELECT o.id, o.customer_id, o.customer_snapshot, c.id AS canonical_id,
                  c.customer_code AS canonical_code, c.name AS canonical_name
           FROM orders o
           LEFT JOIN customers c ON c.id = o.customer_id
           ORDER BY o.created_at, o.id
           FOR UPDATE`
        );

        for (const raw of orderRows as Array<Record<string, unknown>>) {
          const snapshotValue = raw.customer_snapshot;
          let snapshot: Record<string, unknown> = {};
          try {
            snapshot = typeof snapshotValue === 'string'
              ? JSON.parse(snapshotValue)
              : ((snapshotValue as Record<string, unknown>) || {});
          } catch {
            snapshot = {};
          }
          const oldCustomerId = String(raw.customer_id || snapshot.id || '');
          let canonicalId = String(raw.canonical_id || '');
          let canonicalCode = String(raw.canonical_code || '');
          let canonicalName = String(raw.canonical_name || snapshot.name || '');

          if (!canonicalId) {
            const oldCode = String(snapshot.customerCode || '').trim();
            const phone = String(snapshot.phone || '').trim();
            const name = String(snapshot.name || '').trim();
            const [matches] = await connection.query(
              `SELECT id, customer_code, name,
                      CASE
                        WHEN customer_code IN (?, ?) THEN 1
                        WHEN ? <> '' AND phone = ? THEN 2
                        ELSE 3
                      END AS match_rank
               FROM customers
               WHERE customer_code IN (?, ?)
                  OR (? <> '' AND phone = ?)
                  OR (? <> '' AND name = ?)
               ORDER BY match_rank, created_at
               LIMIT 2
               FOR UPDATE`,
              [oldCustomerId, oldCode, phone, phone, oldCustomerId, oldCode, phone, phone, name, name]
            );
            const candidates = matches as Array<{ id: string; customer_code: string; name: string; match_rank: number }>;
            const bestRank = Number(candidates[0]?.match_rank || 0);
            const bestMatches = candidates.filter(candidate => Number(candidate.match_rank) === bestRank);
            if (bestMatches.length === 1) {
              canonicalId = bestMatches[0].id;
              canonicalCode = bestMatches[0].customer_code;
              canonicalName = bestMatches[0].name;
            } else {
              canonicalId = String(await connection.query('SELECT UUID() AS id').then(
                result => (result[0] as Array<{ id: string }>)[0].id
              ));
              canonicalCode = String(++nextCode);
              canonicalName = name || canonicalCode;
              const advisorCandidate = String(snapshot.advisorId || snapshot.advisor || '');
              const [advisorRows] = advisorCandidate
                ? await connection.query(
                  'SELECT id FROM users WHERE id = ? OR name = ? LIMIT 1',
                  [advisorCandidate, advisorCandidate]
                )
                : [[]];
              const advisorId = (advisorRows as Array<{ id: string }>)[0]?.id || null;
              await connection.execute(
                `INSERT INTO customers
                   (id, customer_code, name, wechat, phone, area, source, acquired_at,
                    tag, follow_date, advisor_id, profile, situation, intended_product, remark)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                  canonicalId, canonicalCode, canonicalName,
                  String(snapshot.wechat || '') || null, phone, String(snapshot.area || '') || null,
                  String(snapshot.source || '') || '订单历史迁移', String(snapshot.acquiredAt || '') || null,
                  String(snapshot.tag || '') || 'D1', String(snapshot.followDate || '') || null, advisorId,
                  JSON.stringify(snapshot.profile || {}), String(snapshot.situation || '') || null,
                  String(snapshot.intendedProduct || '') || null, String(snapshot.remark || '') || null,
                ]
              );
            }
          }

          if (oldCustomerId && oldCustomerId !== canonicalId) {
            for (const table of [
              'appointments', 'service_records', 'salary_settlement_entries',
              'salary_customer_adjustments',
            ]) {
              await connection.execute(
                `UPDATE \`${table}\` SET customer_id = ? WHERE customer_id = ?`,
                [canonicalId, oldCustomerId]
              );
            }
          }
          await connection.execute(
            `UPDATE orders
             SET customer_id = ?,
                 customer_snapshot = JSON_SET(
                   COALESCE(customer_snapshot, JSON_OBJECT()),
                   '$.id', ?, '$.customerCode', ?, '$.name', ?
                 )
             WHERE id = ?`,
            [canonicalId, canonicalId, canonicalCode, canonicalName, String(raw.id)]
          );
          if (oldCustomerId !== canonicalId || String(snapshot.customerCode || '') !== canonicalCode) {
            await connection.execute(
              `INSERT INTO operation_logs
                 (id, user_id, username, action, module, entity_id, request_id,
                  description, request_payload, response_status, ip_address)
               VALUES (UUID(), 'system', '数据一致性迁移', 'RELINK_CUSTOMER', 'orders', ?, ?,
                       '订单客户已关联客户主档统一编号', ?, 200, 'internal')`,
              [
                String(raw.id),
                `migration-023-${String(raw.id)}`,
                JSON.stringify({
                  beforeCustomerId: oldCustomerId,
                  beforeCustomerCode: snapshot.customerCode || '',
                  afterCustomerId: canonicalId,
                  afterCustomerCode: canonicalCode,
                }),
              ]
            );
          }
        }

        await connection.execute(
          `UPDATE customers c
           SET total_orders = (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id)`
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  },
  {
    id: '024_salary_customer_commission_rate',
    description: 'Allow customer salary commission rates to override the therapist profile default',
    up: async db => {
      await addColumn(
        db,
        'salary_customer_adjustments',
        'commission_rate',
        'decimal(5,2) DEFAULT NULL AFTER other_fee'
      );
    },
  },
];

export async function runMigrations(db: mysql.Pool) {
  const lockConnection = await db.getConnection();
  try {
    const [lockRows] = await lockConnection.query(
      "SELECT GET_LOCK(CONCAT(DATABASE(), ':schema_migrations'), 30) AS acquired"
    );
    if (Number((lockRows as Array<{ acquired: number }>)[0]?.acquired || 0) !== 1) {
      throw new Error('Timed out waiting for the database migration lock');
    }

    await db.execute(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id varchar(100) PRIMARY KEY,
        description varchar(255) NOT NULL,
        applied_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    const [rows] = await db.query('SELECT id FROM schema_migrations');
    const applied = new Set((rows as Array<{ id: string }>).map(row => row.id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      console.log(`Applying database migration ${migration.id}: ${migration.description}`);
      await migration.up(db);
      await db.execute(
        'INSERT INTO schema_migrations (id, description) VALUES (?, ?)',
        [migration.id, migration.description]
      );
    }
  } finally {
    try {
      await lockConnection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':schema_migrations'))");
    } finally {
      lockConnection.release();
    }
  }
}
