import { Router } from 'express';
import { authenticateToken, signToken } from '../middleware/auth';
import { getDb } from '../config/database';
import { comparePassword } from '../utils/bcrypt';
import { createError } from '../middleware/errorHandler';

const router: Router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return next(createError('请输入账号和密码', 400));
    }
    const db = getDb();
    const [rows] = await db.execute(
      'SELECT id, username, password_hash, name, role, avatar, phone, email, status FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    const user = (rows as any[])[0];
    if (!user) {
      return next(createError('账号或密码错误', 401));
    }
    if (user.status !== 'active') {
      return next(createError('账号已停用，请联系管理员', 403));
    }
    if (!comparePassword(password, user.password_hash)) {
      return next(createError('账号或密码错误', 401));
    }
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar || user.name?.slice(0, 1) || 'U',
        phone: user.phone || null,
        email: user.email || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return next(createError('未登录', 401));
    const db = getDb();
    const [rows] = await db.execute(
      'SELECT id, username, name, role, avatar, phone, email, status FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const user = (rows as any[])[0];
    if (!user) return next(createError('用户不存在', 404));
    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar || user.name?.slice(0, 1) || 'U',
        phone: user.phone || null,
        email: user.email || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/password', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return next(createError('未登录', 401));
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword || newPassword.length < 6) {
      return next(createError('新密码至少 6 位', 400));
    }
    const db = getDb();
    const [rows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
    const user = (rows as any[])[0];
    if (!user) return next(createError('用户不存在', 404));
    if (!comparePassword(oldPassword, user.password_hash)) {
      return next(createError('原密码错误', 400));
    }
    const { hashPassword } = await import('../utils/bcrypt');
    await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), userId]);
    res.json({ message: '密码修改成功' });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
