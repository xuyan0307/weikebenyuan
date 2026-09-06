import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import { createError } from '../middleware/errorHandler';
import { parseJson } from '../utils/serialization';
import Joi from 'joi';

const router: Router = Router();

export function validateProfile(body: any, role: string | undefined, current?: any) {
  const b = { ...body };
  if ('dispatchSelected' in b) throw createError('请在派单助手设置中配置派单人员', 400);
  if (b.dispatchLocations !== undefined) {
    const { error } = Joi.array().max(2).items(Joi.object({ label: Joi.string().max(80).allow(''), address: Joi.string().trim().max(250).required(), location: Joi.string().max(60).allow('') })).validate(b.dispatchLocations);
    if (error) throw createError('最多录入两个有效出发地址', 400);
  }
  const admin = role === 'admin' || role === 'superadmin';
  if (!admin) {
    if (current && b.therapistType && b.therapistType !== current.therapist_type) throw createError('仅管理员可修改技师类型', 403);
    b.upgradeRate = current?.upgrade_rate ?? 0;
    b.commissionRate = current?.commission_rate ?? 0;
    b.starLevel = current?.star_level ?? 1;
    b.specialtyGrade = current?.specialty_grade ?? (Number(current?.commission_rate ?? 0) === 5 ? 'B' : Number(current?.commission_rate ?? 0) === 0 ? 'observer' : undefined);
  }
  const type = b.therapistType || current?.therapist_type || '产康师';
  if (type.includes('运动') || type.includes('调理')) {
    if (current && b.specialtyGrade === undefined && !current.specialty_grade && ![0, 5].includes(Number(current.commission_rate))) {
      b.specialtyGrade = null;
      b.commissionRate = current.commission_rate;
      return b;
    }
    const grade = b.specialtyGrade ?? current?.specialty_grade ?? (Number(current?.commission_rate) === 5 ? 'B' : 'observer');
    if (grade !== 'observer' && grade !== 'B') throw createError('该类型仅支持观察池或B档', 400);
    b.specialtyGrade = grade;
    // Do not change existing financial profile values during an ordinary staff edit.
    if (admin || !current) b.commissionRate = grade === 'B' ? 5 : 0;
  } else b.specialtyGrade = null;
  return b;
}

function mapRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    therapistType: r.therapist_type || '产康师',
    birthYear: r.birth_year || '',
    phone: r.phone || '',
    area: r.area || '',
    city: r.city,
    detailAddress: r.detail_address || '',
    services: parseJson(r.services, []),
    serviceMethod: r.service_method || '',
    characteristics: r.characteristics || '',
    transport: r.transport || '',
    status: r.status || '在职',
    orders: r.orders || 0,
    rating: Number(r.rating) || 0,
    upgradeRate: r.upgrade_rate || 0,
    starLevel: r.star_level || 1,
    commissionRate: Number(r.commission_rate) || 0,
    healthCert: parseJson(r.health_cert, { state: '无证书' }),
    firstAidCert: parseJson(r.first_aid_cert, { state: '无' }),
    laborCert: parseJson(r.labor_cert, { state: '无' }),
    associationCert: parseJson(r.association_cert, { state: '无' }),
    remark: r.remark || '',
    dispatchEnabled: r.dispatch_enabled !== 0,
    dispatchLocations: parseJson(r.dispatch_locations, []),
    dispatchNote: r.dispatch_note || '',
    specialtyGrade: r.specialty_grade || (Number(r.commission_rate) === 5 ? 'B' : Number(r.commission_rate) === 0 ? 'observer' : undefined),
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string) || 50);
    const city = (req.query.city as string) || '';
    const status = (req.query.status as string) || '';
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: any[] = [];
    if (city) { where.push('city = ?'); params.push(city); }
    if (status) { where.push('status = ?'); params.push(status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.query(`SELECT COUNT(*) AS cnt FROM therapists ${whereSql}`, params);
    const total = (countRows as any[])[0].cnt;

    const [rows] = await db.query(
      `SELECT * FROM therapists ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ total, page, pageSize, data: (rows as any[]).map(mapRow) });
  } catch (err) { next(err); }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query('SELECT * FROM therapists WHERE id = ? LIMIT 1', [req.params.id]);
    const row = (rows as any[])[0];
    if (!row) return next(createError('技师不存在', 404));
    res.json(mapRow(row));
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, auditLog('therapists'), async (req, res, next) => {
  try {
    const b = validateProfile(req.body || {}, req.userRole);
    const db = getDb();
    const id = b.id || randomUUID();
    await db.execute(
      `INSERT INTO therapists (id, name, therapist_type, birth_year, phone, area, city, detail_address, services, service_method, characteristics, transport, status, orders, rating, upgrade_rate, star_level, commission_rate, health_cert, first_aid_cert, labor_cert, association_cert, remark, dispatch_enabled, dispatch_locations, dispatch_note, specialty_grade)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, b.name || '', b.therapistType || '产康师', b.birthYear || null, b.phone || '',
        b.area || null, b.city || '厦门', b.detailAddress || null,
        b.services ? JSON.stringify(b.services) : null,
        b.serviceMethod || null, b.characteristics || null, b.transport || null,
        b.status || '在职', b.orders || 0, b.rating || 5.0, b.upgradeRate || 0, b.starLevel || 1,
        b.commissionRate ?? 0,
        b.healthCert ? JSON.stringify(b.healthCert) : null,
        b.firstAidCert ? JSON.stringify(b.firstAidCert) : null,
        b.laborCert ? JSON.stringify(b.laborCert) : null,
        b.associationCert ? JSON.stringify(b.associationCert) : null,
        b.remark || null,
        b.dispatchEnabled === false ? 0 : 1,
        b.dispatchLocations ? JSON.stringify(b.dispatchLocations) : null,
        b.dispatchNote || null,
        b.specialtyGrade,
      ]
    );
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', authenticateToken, auditLog('therapists'), async (req, res, next) => {
  try {
    const db = getDb();
    const [existingRows] = await db.query('SELECT * FROM therapists WHERE id = ?', [req.params.id]);
    const current = (existingRows as any[])[0];
    if (!current) throw createError('技师不存在', 404);
    const b = validateProfile(req.body || {}, req.userRole, current);
    await db.execute(
      `UPDATE therapists SET
        name=?, therapist_type=?, birth_year=?, phone=?, area=?, city=?, detail_address=?,
        services=?, service_method=?, characteristics=?, transport=?, status=?,
        orders=?, rating=?, upgrade_rate=?, star_level=?, commission_rate=?,
        health_cert=?, first_aid_cert=?, labor_cert=?, association_cert=?, remark=?,
        dispatch_enabled=COALESCE(?,dispatch_enabled), dispatch_locations=COALESCE(?,dispatch_locations), dispatch_note=COALESCE(?,dispatch_note), specialty_grade=?
       WHERE id=?`,
      [
        b.name ?? '', b.therapistType ?? '产康师', b.birthYear ?? null, b.phone ?? '',
        b.area ?? null, b.city ?? '厦门', b.detailAddress ?? null,
        b.services ? JSON.stringify(b.services) : null,
        b.serviceMethod ?? null, b.characteristics ?? null, b.transport ?? null, b.status ?? '在职',
        b.orders ?? 0, b.rating ?? 5.0, b.upgradeRate ?? 0, b.starLevel ?? 1,
        b.commissionRate ?? 0,
        b.healthCert ? JSON.stringify(b.healthCert) : null,
        b.firstAidCert ? JSON.stringify(b.firstAidCert) : null,
        b.laborCert ? JSON.stringify(b.laborCert) : null,
        b.associationCert ? JSON.stringify(b.associationCert) : null,
        b.remark ?? null, b.dispatchEnabled == null ? null : b.dispatchEnabled === false ? 0 : 1,
        b.dispatchLocations ? JSON.stringify(b.dispatchLocations) : null,
        b.dispatchNote ?? null, b.specialtyGrade, req.params.id,
      ]
    );
    res.json({ message: '更新成功' });
  } catch (err) { next(err); }
});

router.patch('/:id/status', authenticateToken, auditLog('therapists'), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const db = getDb();
    await db.execute('UPDATE therapists SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: '状态已更新' });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticateToken, auditLog('therapists'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.execute('DELETE FROM therapists WHERE id = ?', [req.params.id]);
    res.json({ message: '已删除' });
  } catch (err) { next(err); }
});

export { router as therapistsRouter };
