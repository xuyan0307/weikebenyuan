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
