import { createHash, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  userName?: string;
}

export interface JwtPayload {
  id: string;
  role: string;
  name: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
  } as jwt.SignOptions);
}

export function authenticateToken(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return next(createError('未登录', 401));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userName = decoded.name;
    next();
  } catch {
    return next(createError('登录已过期', 401));
  }
}

function configuredAssistantKeys(): string[] {
  const raw = process.env.PERSONAL_ASSISTANT_API_KEYS
    || process.env.PERSONAL_ASSISTANT_API_KEY
    || '';
  return raw.split(',').map(value => value.trim()).filter(Boolean);
}

function assistantKeyMatches(supplied: string, expected: string): boolean {
  const suppliedHash = createHash('sha256').update(supplied).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

/**
 * Authenticate the narrowly scoped personal-assistant API without granting a
 * reusable dashboard JWT. The synthetic identity is intentionally attached to
 * the request so every write continues through the existing operation log.
 */
export function authenticatePersonalAssistant(req: AuthRequest, _res: Response, next: NextFunction) {
  const keys = configuredAssistantKeys();
  if (keys.length === 0) {
    return next(createError('个人助理接口尚未配置', 503));
  }

  const supplied = String(req.headers['x-assistant-key'] || '').trim();
  if (!supplied || !keys.some(expected => assistantKeyMatches(supplied, expected))) {
    return next(createError('个人助理凭证无效', 401));
  }

  req.userId = String(process.env.PERSONAL_ASSISTANT_USER_ID || 'personal-assistant').slice(0, 36);
  req.userRole = 'service';
  req.userName = String(process.env.PERSONAL_ASSISTANT_USER_NAME || '个人助理').slice(0, 50);
  next();
}

export function authorizeRoles(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return next(createError('无权限访问', 403));
    }
    next();
  };
}
