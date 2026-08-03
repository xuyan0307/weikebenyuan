import { Router } from 'express';
import { getDb } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { parseJson } from '../utils/serialization';

const router: Router = Router();
const VALID_KEY = /^[a-z0-9][a-z0-9:._-]{0,99}$/i;

function assertWriteAccess(role: string | undefined, key: string) {
  if (role === 'superadmin' || role === 'admin') return;
  if (role === 'finance' && key === 'finance-expenses-v1') return;
  throw Object.assign(new Error('无权修改该平台配置'), { statusCode: 403 });
}

function settingKey(value: unknown) {
  const key = String(value || '');
  if (!VALID_KEY.test(key)) throw Object.assign(new Error('配置键无效'), { statusCode: 400 });
  return key;
}

router.get('/:key', authenticateToken, async (req, res, next) => {
  try {
    const key = settingKey(req.params.key);
    const [rows] = await getDb().query(
      'SELECT setting_value, updated_at FROM platform_settings WHERE setting_key = ? LIMIT 1',
      [key]
    );
    const row = (rows as Array<{ setting_value: unknown; updated_at: Date }>)[0];
    res.json({ key, value: row ? parseJson(row.setting_value, null) : null, updatedAt: row?.updated_at || null });
  } catch (error) { next(error); }
});

router.put('/:key', authenticateToken, auditLog('settings'), async (req, res, next) => {
  try {
    const key = settingKey(req.params.key);
    assertWriteAccess(req.userRole, key);
    const serialized = JSON.stringify(req.body?.value ?? null);
    if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) {
      throw Object.assign(new Error('配置内容不能超过 1MB'), { statusCode: 413 });
    }
    await getDb().execute(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
         updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [key, serialized, req.userId || null]
    );
    res.json({ message: '配置已保存', key });
  } catch (error) { next(error); }
});

router.delete('/:key', authenticateToken, auditLog('settings'), async (req, res, next) => {
  try {
    const key = settingKey(req.params.key);
    assertWriteAccess(req.userRole, key);
    await getDb().execute('DELETE FROM platform_settings WHERE setting_key = ?', [key]);
    res.json({ message: '配置已删除', key });
  } catch (error) { next(error); }
});

export { router as settingsRouter };
