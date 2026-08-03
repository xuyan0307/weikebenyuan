const mysql = require('../backend/node_modules/mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'chankang',
    password: process.env.DB_PASSWORD || 'chankang_password',
    database: process.env.DB_NAME || 'chankang_platform',
  });
  try {
    const [deliveryColumns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'appointment_notification_deliveries'
         AND COLUMN_NAME IN ('delivery_status','attempt_count','last_attempt_at','next_retry_at','response_summary')
       ORDER BY COLUMN_NAME`
    );
    const [deliveries] = await connection.query(
      `SELECT delivery_status, attempt_count, error, next_retry_at
       FROM appointment_notification_deliveries ORDER BY created_at DESC LIMIT 5`
    );
    const [conflicts] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM service_records sr
       INNER JOIN appointments a ON a.id = sr.appointment_id
       WHERE a.status IN ('已取消','取消')`
    );
    const [auditColumns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_logs'
         AND COLUMN_NAME IN ('entity_id','request_id','request_payload','response_status')
       ORDER BY COLUMN_NAME`
    );
    console.log(JSON.stringify({
      deliveryColumns: deliveryColumns.map(row => row.COLUMN_NAME),
      deliveries,
      cancelledServiceRecordConflicts: Number(conflicts[0]?.count || 0),
      auditColumns: auditColumns.map(row => row.COLUMN_NAME),
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
