import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../config/database';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function auditLog(module: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    next();
    if (!WRITE_METHODS.has(req.method)) return;
    if (!req.userId) return;
    try {
      const db = getDb();
      const action = `${req.method} ${req.path}`;
      const description = `${req.userName || req.userId} ${req.method} ${req.path}`;
      await db.execute(
        `INSERT INTO operation_logs (id, user_id, username, action, module, description, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          req.userId,
          req.userName || '',
          action,
          module,
          description,
          req.ip || '',
        ]
      );
    } catch (err) {
      console.error('auditLog error:', err);
    }
  };
}
