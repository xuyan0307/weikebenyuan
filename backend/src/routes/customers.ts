import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';

const router: Router = Router();

function nullableDate(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function formatDateOnly(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value as any);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function generateCustomerCode(db: any, requested?: unknown): Promise<string> {
  const preferred = typeof requested === 'string' ? requested.trim() : '';
  if (preferred) {
    const [rows] = await db.execute('SELECT id FROM customers WHERE customer_code = ? LIMIT 1', [preferred]);
    if ((rows as any[]).length === 0) return preferred;
  }

  const [rows] = await db.query(
    `SELECT MAX(CAST(customer_code AS UNSIGNED)) AS max_code
     FROM customers
     WHERE customer_code REGEXP '^[0-9]+$'`
  );
  const nextNumber = Math.max(100000, Number((rows as any[])[0]?.max_code || 100000)) + 1;
  return String(nextNumber);
}

async function resolveAdvisorId(db: any, body: any): Promise<string | null> {
  if (body.advisorId) return body.advisorId;
  const advisorName = typeof body.advisor === 'string' ? body.advisor.trim() : '';
  if (!advisorName) return null;

  const [rows] = await db.execute(
    'SELECT id FROM users WHERE name = ? AND status = ? LIMIT 1',
    [advisorName, 'active']
  );
  return (rows as any[])[0]?.id || null;
}

function mapRow(r: any) {
  return {
    id: r.customer_code || r.id,
    _id: r.id,
    name: r.name,
    wechat: r.wechat || '',
    phone: r.phone || '',
    area: r.area || '',
    source: r.source || '',
    acquiredAt: r.acquired_at_date || formatDateOnly(r.acquired_at),
    tag: r.tag || '',
    followStatus: r.follow_status || '待跟进',
    followDate: r.follow_date_date || formatDateOnly(r.follow_date),
    advisor: r.advisor_name || '',
    advisorId: r.advisor_id || '',
    totalOrders: r.total_orders || 0,
    lastFollow: r.last_follow_date || formatDateOnly(r.last_follow),
    profile: typeof r.profile === 'string' ? JSON.parse(r.profile || '{}') : (r.profile || null),
    situation: r.situation || '',
    intendedProduct: r.intended_product || '',
    remark: r.remark || '',
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 10);
    const keyword = (req.query.keyword as string) || '';
    const tag = (req.query.tag as string) || '';
    const followStatus = (req.query.followStatus as string) || '';
    const includeOrdered = req.query.includeOrdered === '1' || req.query.includeOrdered === 'true';
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: any[] = [];
    if (!includeOrdered) where.push("c.tag IN ('D1','D2','D3') AND COALESCE(c.total_orders, 0) = 0");
    if (keyword) {
      where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.customer_code LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (tag) { where.push('c.tag = ?'); params.push(tag); }
    if (followStatus) { where.push('c.follow_status = ?'); params.push(followStatus); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM customers c ${whereSql}`,
      params
    );
    const total = (countRows as any[])[0].cnt;

    const [rows] = await db.query(
      `SELECT c.*,
              DATE_FORMAT(c.acquired_at, '%Y-%m-%d') AS acquired_at_date,
              DATE_FORMAT(c.follow_date, '%Y-%m-%d') AS follow_date_date,
              DATE_FORMAT(c.last_follow, '%Y-%m-%d') AS last_follow_date,
              u.name AS advisor_name
       FROM customers c LEFT JOIN users u ON u.id = c.advisor_id
       ${whereSql}
       ORDER BY c.acquired_at DESC, c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT c.*,
              DATE_FORMAT(c.acquired_at, '%Y-%m-%d') AS acquired_at_date,
              DATE_FORMAT(c.follow_date, '%Y-%m-%d') AS follow_date_date,
              DATE_FORMAT(c.last_follow, '%Y-%m-%d') AS last_follow_date,
              u.name AS advisor_name
       FROM customers c LEFT JOIN users u ON u.id = c.advisor_id
       WHERE c.id = ? OR c.customer_code = ? LIMIT 1`,
      [req.params.id, req.params.id]
    );
    const row = (rows as any[])[0];
    if (!row) return next(createError('客户不存在', 404));
    res.json(mapRow(row));
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('customers'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const advisorId = await resolveAdvisorId(db, b);
    const id = randomUUID();
    const code = await generateCustomerCode(db, b.id || b.customerCode);
    await db.execute(
      `INSERT INTO customers (id, customer_code, name, wechat, phone, area, source, acquired_at, tag, follow_status, follow_date, advisor_id, profile, situation, intended_product, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, code, b.name || '', b.wechat || null, b.phone || '', b.area || null, b.source || null,
        nullableDate(b.acquiredAt), b.tag || null, b.followStatus || '待跟进', nullableDate(b.followDate),
        advisorId,
        b.profile ? JSON.stringify(b.profile) : null,
        b.situation || null, b.intendedProduct || null, b.remark || null,
      ]
    );
    res.status(201).json({ id, code });
  } catch (err) { next(err); }
});

router.put('/:id', authenticateToken, auditLog('customers'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = getDb();
    const advisorId = await resolveAdvisorId(db, b);
    await db.execute(
      `UPDATE customers SET
        name=?, wechat=?, phone=?, area=?, source=?, acquired_at=?, tag=?, follow_status=?,
        follow_date=?, advisor_id=?, profile=?, situation=?, intended_product=?, remark=?
       WHERE id=? OR customer_code=?`,
      [
        b.name ?? '', b.wechat ?? null, b.phone ?? '', b.area ?? null, b.source ?? null,
        nullableDate(b.acquiredAt), b.tag ?? null, b.followStatus ?? '待跟进',
        nullableDate(b.followDate), advisorId,
        b.profile ? JSON.stringify(b.profile) : null,
        b.situation ?? null, b.intendedProduct ?? null, b.remark ?? null,
        req.params.id, req.params.id,
      ]
    );
    res.json({ message: '更新成功' });
  } catch (err) { next(err); }
});

router.patch('/:id/follow', authenticateToken, auditLog('customers'), async (req, res, next) => {
  try {
    const { followStatus, followDate } = req.body || {};
    const db = getDb();
    await db.execute(
      'UPDATE customers SET follow_status=?, follow_date=?, last_follow=NOW() WHERE id=? OR customer_code=?',
      [followStatus, nullableDate(followDate), req.params.id, req.params.id]
    );
    res.json({ message: '跟进状态已更新' });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticateToken, authorizeRoles('superadmin', 'admin'), auditLog('customers'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.execute('DELETE FROM customers WHERE id=? OR customer_code=?', [req.params.id, req.params.id]);
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as customersRouter };
