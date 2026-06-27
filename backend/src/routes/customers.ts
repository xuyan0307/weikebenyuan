import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';

const router: Router = Router();

function mapRow(r: any) {
  return {
    id: r.customer_code || r.id,
    _id: r.id,
    name: r.name,
    wechat: r.wechat || '',
    phone: r.phone || '',
    area: r.area || '',
    source: r.source || '',
    acquiredAt: r.acquired_at ? new Date(r.acquired_at).toISOString().slice(0, 10) : '',
    tag: r.tag || '',
    followStatus: r.follow_status || '待跟进',
    followDate: r.follow_date ? new Date(r.follow_date).toISOString().slice(0, 10) : '',
    advisor: r.advisor_name || '',
    advisorId: r.advisor_id || '',
    totalOrders: r.total_orders || 0,
    lastFollow: r.last_follow ? new Date(r.last_follow).toISOString().slice(0, 10) : '',
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
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: any[] = [];
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
      `SELECT c.*, u.name AS advisor_name
       FROM customers c LEFT JOIN users u ON u.id = c.advisor_id
       ${whereSql}
       ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query(
      `SELECT c.*, u.name AS advisor_name
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
    const id = randomUUID();
    const code = b.id || ('C' + Date.now().toString().slice(-8));
    await db.execute(
      `INSERT INTO customers (id, customer_code, name, wechat, phone, area, source, acquired_at, tag, follow_status, follow_date, advisor_id, profile, situation, intended_product, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, code, b.name || '', b.wechat || null, b.phone || '', b.area || null, b.source || null,
        b.acquiredAt || null, b.tag || null, b.followStatus || '待跟进', b.followDate || null,
        b.advisorId || null,
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
    await db.execute(
      `UPDATE customers SET
        name=?, wechat=?, phone=?, area=?, source=?, acquired_at=?, tag=?, follow_status=?,
        follow_date=?, advisor_id=?, profile=?, situation=?, intended_product=?, remark=?
       WHERE id=? OR customer_code=?`,
      [
        b.name ?? '', b.wechat ?? null, b.phone ?? '', b.area ?? null, b.source ?? null,
        b.acquiredAt ?? null, b.tag ?? null, b.followStatus ?? '待跟进',
        b.followDate ?? null, b.advisorId ?? null,
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
      [followStatus, followDate, req.params.id, req.params.id]
    );
    res.json({ message: '跟进状态已更新' });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticateToken, auditLog('customers'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.execute('DELETE FROM customers WHERE id=? OR customer_code=?', [req.params.id, req.params.id]);
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as customersRouter };
