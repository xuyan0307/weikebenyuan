import type { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      userName?: string;
    }
  }
}

export {};
