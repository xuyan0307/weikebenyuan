import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import { seedIfEmpty } from './seed';

let pool: mysql.Pool;
let redisClient: ReturnType<typeof createClient> | null = null;

export async function initDatabase() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chankang_platform',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+08:00',
  });

  try {
    const connection = await pool.getConnection();
    console.log('MySQL connected successfully');
    connection.release();
    await seedIfEmpty(pool);
    await runMigrations(pool);
  } catch (error) {
    console.error('MySQL connection failed:', error);
    throw error;
  }

  if (process.env.REDIS_HOST) {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD,
    });

    try {
      await redisClient.connect();
      console.log('Redis connected successfully');
    } catch (error) {
      console.error('Redis connection failed:', error);
      redisClient = null;
    }
  }
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
  return Number((rows as any[])[0]?.cnt || 0) > 0;
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
  return Number((rows as any[])[0]?.cnt || 0) > 0;
}

async function runMigrations(db: mysql.Pool) {
  await db.execute(
    "ALTER TABLE orders MODIFY pay_status enum('已付款','待付款','已退款','已付定金') DEFAULT '待付款' COMMENT '支付状态'"
  );

  await db.execute(
    "ALTER TABLE orders MODIFY type enum('体验卡','套餐') NOT NULL COMMENT '订单类型'"
  );

  if (!(await columnExists(db, 'users', 'wechat'))) {
    await db.execute("ALTER TABLE users ADD COLUMN wechat varchar(100) DEFAULT NULL COMMENT '微信号'");
  }

  if (!(await columnExists(db, 'users', 'permissions'))) {
    await db.execute("ALTER TABLE users ADD COLUMN permissions JSON DEFAULT NULL COMMENT '页面权限'");
  }

  if (!(await columnExists(db, 'orders', 'service_items'))) {
    await db.execute("ALTER TABLE orders ADD COLUMN service_items varchar(500) DEFAULT NULL COMMENT '服务项目名称'");
  }

  if (!(await columnExists(db, 'orders', 'service_people'))) {
    await db.execute("ALTER TABLE orders ADD COLUMN service_people JSON DEFAULT NULL COMMENT '服务人员分配'");
  }

  if (!(await columnExists(db, 'orders', 'appointment_time'))) {
    await db.execute("ALTER TABLE orders ADD COLUMN appointment_time varchar(50) DEFAULT NULL COMMENT '预约时间'");
  }

  if (!(await columnExists(db, 'orders', 'service_note'))) {
    await db.execute("ALTER TABLE orders ADD COLUMN service_note text DEFAULT NULL COMMENT '服务备注'");
  }

  if (!(await columnExists(db, 'orders', 'contract_attachments'))) {
    await db.execute("ALTER TABLE orders ADD COLUMN contract_attachments JSON DEFAULT NULL COMMENT '合同附件'");
  }

  if (!(await columnExists(db, 'orders', 'service_photo_records'))) {
    await db.execute("ALTER TABLE orders ADD COLUMN service_photo_records JSON DEFAULT NULL COMMENT '服务照片记录'");
  }

  if (!(await columnExists(db, 'orders', 'manual_progress_at'))) {
    await db.execute("ALTER TABLE orders ADD COLUMN manual_progress_at datetime DEFAULT NULL COMMENT '服务进度人工校正时间' AFTER total_times");
  }

  if (!(await indexExists(db, 'orders', 'idx_created_at'))) {
    await db.execute("ALTER TABLE orders ADD INDEX idx_created_at (created_at)");
  }

  if (!(await indexExists(db, 'orders', 'idx_customer_created_at'))) {
    await db.execute("ALTER TABLE orders ADD INDEX idx_customer_created_at (customer_id, created_at)");
  }
}

export function getDb(): mysql.Pool {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}

export function getRedis(): any {
  return redisClient;
}
