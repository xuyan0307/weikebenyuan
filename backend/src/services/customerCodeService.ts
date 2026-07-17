import type { Pool, RowDataPacket } from 'mysql2/promise';

interface CustomerCodeRow extends RowDataPacket {
  customer_code: string;
}

interface MaxCustomerCodeRow extends RowDataPacket {
  max_code: number | null;
}

export async function generateCustomerCode(db: Pool, requested?: unknown): Promise<string> {
  const preferred = typeof requested === 'string' ? requested.trim() : '';
  if (preferred) {
    const [rows] = await db.execute<CustomerCodeRow[]>(
      `SELECT customer_code
       FROM customers
       WHERE customer_code = ?
       UNION ALL
       SELECT JSON_UNQUOTE(JSON_EXTRACT(customer_snapshot, '$.customerCode')) AS customer_code
       FROM orders
       WHERE JSON_UNQUOTE(JSON_EXTRACT(customer_snapshot, '$.customerCode')) = ?
       LIMIT 1`,
      [preferred, preferred]
    );
    if (rows.length === 0) return preferred;
  }

  const [rows] = await db.query<MaxCustomerCodeRow[]>(
    `SELECT MAX(code_value) AS max_code
     FROM (
       SELECT CAST(customer_code AS UNSIGNED) AS code_value
       FROM customers
       WHERE customer_code REGEXP '^[0-9]+$'
       UNION ALL
       SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(customer_snapshot, '$.customerCode')) AS UNSIGNED) AS code_value
       FROM orders
       WHERE JSON_UNQUOTE(JSON_EXTRACT(customer_snapshot, '$.customerCode')) REGEXP '^[0-9]+$'
     ) used_customer_codes`
  );
  const nextNumber = Math.max(100000, Number(rows[0]?.max_code || 100000)) + 1;
  return String(nextNumber);
}
