import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const isPayloadTooLarge = (err as any).type === 'entity.too.large' || /request entity too large/i.test(err.message || '');
  const statusCode = isPayloadTooLarge ? 413 : (err.statusCode || 500);
  const message = isPayloadTooLarge
    ? '上传内容过大，请压缩图片后重试'
    : err.isOperational ? err.message : 'Internal server error';

  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

export function createError(message: string, statusCode: number = 500): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}
