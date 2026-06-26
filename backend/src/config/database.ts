import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import { seedIfEmpty } from './seed';

let pool: mysql.Pool;
let redisClient: ReturnType<typeof createClient> | null = null;

export async function initDatabase() {
  // MySQL连接池
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chankang_platform',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+08:00'
  });

  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
    await seedIfEmpty(pool);
  } catch (error) {
    console.error('❌ MySQL connection failed:', error);
    throw error;
  }

  // Redis连接
  if (process.env.REDIS_HOST) {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379')
      },
      password: process.env.REDIS_PASSWORD
    });

    try {
      await redisClient.connect();
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      redisClient = null;
    }
  }
}

export function getDb(): mysql.Pool {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
}

export function getRedis() {
  return redisClient;
}