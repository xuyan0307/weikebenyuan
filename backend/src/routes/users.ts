import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { hashPassword } from '../utils/bcrypt';

const router: Router = Router();
const validRoles = new Set(['superadmin', 'admin', 'service', 'therapist', 'finance']);

function parsePermissions(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRole(role: unknown) {
  const next = typeof role === 'string' ? role : 'service';
  return validRoles.has(next) ? next : 'service';
}

function normalizeStatus(status: unknown) {
  return status === 'disabled' || status === 'inactive' ? 'inactive' : 'active';
}

function normalizePermissions(permissions: unknown) {
  return Array.isArray(permissions) ? JSON.stringify(permissions) : null;
}

function mapUser(r: any) {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: normalizeRole(r.role),
    phone: r.phone || '',
    email: r.email || '',
    wechat: r.wechat || '',
    avatar: r.avatar || r.name?.slice(0, 1) || 'U',
    status: r.status === 'active' ? 'active' : 'disabled',
    permissions: parsePermissions(r.permissions),
    createdAt: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
  };
}

router.get('/', authenticateToken, authorizeRoles('superadmin', 'admin'), async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT id, username, name, role, phone, email, wechat, avatar, status, permissions, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ data: (rows as any[]).map(mapUser) });
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, authorizeRoles('superadmin', 'admin'), auditLog('users'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.username || !b.name) return next(createError('请填写姓名和登录账号', 400));
    const id = randomUUID();
    const password = b.password || '123456';
    const db = getDb();
    await db.execute(
      `INSERT INTO users (id, username, password_hash, name, role, phone, email, wechat, avatar, status, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        b.username,
        hashPassword(password),
        b.name,
        normalizeRole(b.role),
        b.phone || null,
        b.email || null,
        b.wechat || null,
        b.avatar || b.name.slice(0, 1),
        normalizeStatus(b.status),
        normalizePermissions(b.permissions),
      ]
    );
    res.status(201).json({ id });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return next(createError('登录账号已存在', 409));
    next(err);
  }
});

router.put('/:id', authenticateToken, authorizeRoles('superadmin', 'admin'), auditLog('users'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.username || !b.name) return next(createError('请填写姓名和登录账号', 400));
    const db = getDb();
    const params: any[] = [
      b.username,
      b.name,
      normalizeRole(b.role),
      b.phone || null,
      b.email || null,
      b.wechat || null,
      b.avatar || b.name.slice(0, 1),
      normalizeStatus(b.status),
      normalizePermissions(b.permissions),
    ];
    let sql = `UPDATE users SET username=?, name=?, role=?, phone=?, email=?, wechat=?, avatar=?, status=?, permissions=?`;
    if (b.password) {
      sql += ', password_hash=?';
      params.push(hashPassword(b.password));
    }
    sql += ' WHERE id=?';
    params.push(req.params.id);
    await db.execute(sql, params);
    res.json({ message: '更新成功' });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return next(createError('登录账号已存在', 409));
    next(err);
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('superadmin'), auditLog('users'), async (req, res, next) => {
  try {
    if (req.params.id === req.userId) return next(createError('不能删除当前登录账号', 400));
    const db = getDb();
    await db.execute('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as usersRouter };
