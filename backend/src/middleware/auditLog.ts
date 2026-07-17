import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../config/database';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function auditLog(module: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (WRITE_METHODS.has(req.method) && req.userId) {
      res.once('finish', () => {
        if (res.statusCode >= 400) return;
        const userId = req.userId;
        if (!userId) return;
        const action = `${req.method} ${req.path}`;
        const description = `${req.userName || userId} ${req.method} ${req.path}`;
        void getDb().execute(
          `INSERT INTO operation_logs (id, user_id, username, action, module, description, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), userId, req.userName || '', action, module, description, req.ip || '']
        ).catch(err => console.error('auditLog error:', err));
      });
    }
    next();
  };
}
