import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { getDb } from '../config/database';

const router: Router = Router();

router.get('/', authenticateToken, authorizeRoles('superadmin', 'admin'), async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 20);
    const module = (req.query.module as string) || '';
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: any[] = [];
    if (module) { where.push('module = ?'); params.push(module); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM operation_logs ${whereSql}`, params);
    const total = (countRows as any[])[0].cnt;

    const [rows] = await db.query(
      `SELECT * FROM operation_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: rows });
  } catch (err) { next(err); }
});

export { router as operationLogsRouter };
