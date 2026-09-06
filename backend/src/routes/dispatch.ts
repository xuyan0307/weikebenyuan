import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import Joi from 'joi';
import { createError } from '../middleware/errorHandler';
import { getDb } from '../config/database';
import { queryAddressTips, rankTherapists } from '../services/dispatchService';
import { auditLog } from '../middleware/auditLog';

const router: Router = Router();
router.use(authenticateToken);
router.use(authorizeRoles('superadmin', 'admin', 'service', 'therapist'));

const inputSchema = Joi.object({
  city: Joi.string().valid('厦门', '泉州', '漳州').required(),
  district: Joi.string().max(80).allow(''),
  address: Joi.string().trim().max(250).required(),
  need: Joi.string().max(300).allow(''),
  appointmentDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(''),
  roles: Joi.array().items(Joi.string().valid('产康师', '运动康复师', '体质调理师')).length(1).required(),
  includeObservation: Joi.boolean().default(false),
  location: Joi.string().max(60).allow(''),
});

function mapKey(): string {
  const key = String(process.env.AMAP_WEB_SERVICE_KEY || '').trim();
  if (!key) throw createError('派单地图服务尚未配置，请联系管理员', 503);
  return key;
}

router.get('/source', async (_req, res, next) => {
  try {
    const db = getDb();
    const [rows] = await db.query("SELECT therapist_type AS role, COUNT(*) AS count FROM therapists WHERE status = '在职' AND dispatch_selected = 1 GROUP BY therapist_type ORDER BY therapist_type");
    const counts = (rows as any[]).map(row => ({ role: row.role || '产康师', count: Number(row.count) || 0 }));
    res.json({ source: '技师档案', total: counts.reduce((sum, item) => sum + item.count, 0), roles: counts, mapConfigured: Boolean(process.env.AMAP_WEB_SERVICE_KEY) });
  } catch (error) { next(error); }
});

router.get('/settings', authorizeRoles('superadmin', 'admin'), async (_req, res, next) => {
  try {
    const [rows] = await getDb().query('SELECT id, name, therapist_type, status, dispatch_selected FROM therapists ORDER BY therapist_type, name');
    res.json({ therapists: (rows as any[]).map(row => ({ id: row.id, name: row.name, role: String(row.therapist_type || '产康师').includes('调理') ? '体质调理师' : row.therapist_type || '产康师', status: row.status, selected: Number(row.dispatch_selected) === 1 })) });
  } catch (error) { next(error); }
});

router.put('/settings', authorizeRoles('superadmin', 'admin'), auditLog('dispatch-settings'), async (req, res, next) => {
  const { error, value } = Joi.object({ selections: Joi.array().items(Joi.object({ id: Joi.string().max(64).required(), selected: Joi.boolean().required() })).unique('id').max(1000).required() }).validate(req.body);
  if (error) return next(createError('请检查派单人员配置', 400));
  let connection;
  try {
    connection = await getDb().getConnection();
    await connection.beginTransaction();
    for (const selection of value.selections) {
      const [rows] = await connection.query('SELECT id FROM therapists WHERE id = ? FOR UPDATE', [selection.id]);
      if (!(rows as any[]).length) throw createError('技师档案已变动，请刷新后重新设置', 409);
      await connection.execute('UPDATE therapists SET dispatch_selected = ? WHERE id = ?', [selection.selected ? 1 : 0, selection.id]);
    }
    await connection.commit();
    res.json({ message: '派单人员配置已保存' });
  } catch (error) { if (connection) await connection.rollback(); next(error); }
  finally { connection?.release(); }
});

router.get('/tips', async (req, res, next) => {
  try {
    if (String(req.query.keyword || '').length > 250) throw createError('地址关键词过长', 400);
    const tips = await queryAddressTips(String(req.query.city || ''), String(req.query.district || ''), String(req.query.keyword || ''), mapKey());
    res.json({ tips });
  } catch (error) { next(error); }
});

router.post('/rank', async (req, res, next) => {
  try {
    const { error, value } = inputSchema.validate(req.body || {});
    if (error) throw createError('请检查城市、详细地址及服务人员类型', 400);
    const db = getDb();
    const [rows] = await db.query('SELECT * FROM therapists ORDER BY created_at DESC');
    const result = await rankTherapists(rows as any[], value, mapKey());
    res.json(result);
  } catch (error) { next(error); }
});

export { router as dispatchRouter };
