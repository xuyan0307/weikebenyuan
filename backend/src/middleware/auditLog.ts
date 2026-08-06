import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../config/database';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sanitizedPayload(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const sensitive = /password|secret|token|authorization/i;
  const clean = Object.fromEntries(
    Object.entries(body as Record<string, unknown>)
      .filter(([key]) => !sensitive.test(key))
      .map(([key, value]) => [key, typeof value === 'string' && value.length > 2000 ? `${value.slice(0, 2000)}…` : value])
  );
  const serialized = JSON.stringify(clean);
  return serialized.length > 10000 ? JSON.stringify({ truncated: true, preview: serialized.slice(0, 9500) }) : serialized;
}

export function auditLog(module: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (WRITE_METHODS.has(req.method) && req.userId) {
      const requestId = String(req.headers['x-request-id'] || randomUUID());
      res.setHeader('X-Request-Id', requestId);
      res.once('finish', () => {
        const userId = req.userId;
        if (!userId) return;
        const action = `${req.method} ${req.path}`;
        const description = `${req.userName || userId} ${req.method} ${req.path}`;
        const entityId = String(req.params?.id || req.params?.key || '');
        void getDb().execute(
          `INSERT INTO operation_logs
             (id, user_id, username, action, module, description, ip_address,
              entity_id, request_id, request_payload, response_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(), userId, req.userName || '', action, module, description, req.ip || '',
            entityId || null, requestId, sanitizedPayload(req.body), res.statusCode,
          ]
        ).catch(err => console.error('auditLog error:', err));
      });
    }
    next();
  };
}
