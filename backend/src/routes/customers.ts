import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { generateCustomerCode } from '../services/customerCodeService';
import {
  CustomerDateRange,
  CustomerListFilters,
  exportCustomers,
  getCustomerFilterOptions,
  listCustomers,
  mapCustomerRow,
} from '../services/customerQueryService';

const router: Router = Router();

function nullableDate(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringQuery(value: unknown): string {
  if (Array.isArray(value)) return stringQuery(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function csvQuery(value: unknown): string[] {
  return stringQuery(value).split(',').map(item => item.trim()).filter(Boolean);
}

function customerFiltersFromQuery(query: Record<string, unknown>): CustomerListFilters {
  const requestedDateRange = stringQuery(query.dateRange);
  const dateRange: CustomerDateRange = ['today', 'week', 'month'].includes(requestedDateRange)
    ? requestedDateRange as CustomerDateRange
    : 'all';
  const tags = csvQuery(query.tags);
  const statuses = csvQuery(query.statuses);
  const legacyTag = stringQuery(query.tag);
  const legacyStatus = stringQuery(query.followStatus);
  return {
    keyword: stringQuery(query.keyword),
    dateRange,
    areas: csvQuery(query.areas),
    sources: csvQuery(query.sources),
    statuses: statuses.length > 0 ? statuses : legacyStatus ? [legacyStatus] : [],
    tags: tags.length > 0 ? tags : legacyTag ? [legacyTag] : [],
    advisors: csvQuery(query.advisors),
    includeOrdered: query.includeOrdered === '1' || query.includeOrdered === 'true',
  };
}

async function resolveAdvisorId(db: Pool, body: Record<string, unknown>): Promise<string | null> {
  if (typeof body.advisorId === 'string' && body.advisorId) return body.advisorId;
  const advisorName = typeof body.advisor === 'string' ? body.advisor.trim() : '';
  if (!advisorName) return null;

  const [rows] = await db.execute(
    'SELECT id FROM users WHERE name = ? AND status = ? LIMIT 1',
    [advisorName, 'active']
  );
  return (rows as RowDataPacket[])[0]?.id || null;
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 10);
    const result = await listCustomers(db, {
      ...customerFiltersFromQuery(req.query),
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/filter-options', authenticateToken, async (_req, res, next) => {
  try {
    res.json(await getCustomerFilterOptions(getDb()));
  } catch (err) { next(err); }
});

router.get(
  '/export',
  authenticateToken,
  authorizeRoles('superadmin', 'admin'),
  async (req, res, next) => {
    try {
      const data = await exportCustomers(getDb(), customerFiltersFromQuery(req.query));
      res.json({ data });
    } catch (err) { next(err); }
  }
);

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
    const row = (rows as RowDataPacket[])[0];
    if (!row) return next(createError('客户不存在', 404));
    res.json(mapCustomerRow(row));
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
