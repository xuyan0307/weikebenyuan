import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

export function splitSchemaStatements(source: string): string[] {
  const withoutComments = source
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

function resolveBaseSchemaPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'init.sql'),
    path.resolve(process.cwd(), '..', 'init.sql'),
  ];
  const schemaPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!schemaPath) throw new Error('Base schema file init.sql is unavailable');
  return schemaPath;
}

export async function ensureBaseSchema(db: mysql.Pool): Promise<void> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  if (Number((rows as Array<{ cnt: number }>)[0]?.cnt || 0) > 0) return;

  console.log('Initializing empty database base schema...');
  const source = fs.readFileSync(resolveBaseSchemaPath(), 'utf8');
  for (const statement of splitSchemaStatements(source)) {
    await db.query(statement);
  }
  console.log('Base schema initialized');
}
