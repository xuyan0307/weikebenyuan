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

export function authorizeRoles(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return next(createError('无权限访问', 403));
    }
    next();
  };
}
