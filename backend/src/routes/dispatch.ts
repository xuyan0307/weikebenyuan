import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import Joi from 'joi';
import { createError } from '../middleware/errorHandler';
import { getDb } from '../config/database';
import { queryAddressTips, rankTherapists } from '../services/dispatchService';

const router: Router = Router();
router.use(authenticateToken);
router.use(authorizeRoles('superadmin', 'admin', 'service', 'therapist'));

const inputSchema = Joi.object({
  city: Joi.string().valid('厦门', '泉州', '漳州').required(),
  district: Joi.string().max(80).allow(''),
  address: Joi.string().trim().max(250).required(),
  need: Joi.string().max(300).allow(''),
  appointmentDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(''),
  roles: Joi.array().items(Joi.string().valid('产康师', '运动康复师', '体质调理师')).min(1).max(3).required(),
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
    const [rows] = await db.query("SELECT therapist_type AS role, COUNT(*) AS count FROM therapists WHERE status = '在职' GROUP BY therapist_type ORDER BY therapist_type");
    const counts = (rows as any[]).map(row => ({ role: row.role || '产康师', count: Number(row.count) || 0 }));
    res.json({ source: '技师档案', total: counts.reduce((sum, item) => sum + item.count, 0), roles: counts, mapConfigured: Boolean(process.env.AMAP_WEB_SERVICE_KEY) });
  } catch (error) { next(error); }
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
