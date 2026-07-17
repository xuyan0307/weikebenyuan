import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
  type?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const isPayloadTooLarge = err.type === 'entity.too.large' || /request entity too large/i.test(err.message || '');
  const isDuplicate = err.code === 'ER_DUP_ENTRY';
  const statusCode = isPayloadTooLarge ? 413 : isDuplicate ? 409 : (err.statusCode || 500);
  const message = isPayloadTooLarge
    ? '上传内容过大，请压缩图片后重试'
    : isDuplicate
      ? '数据已存在，请勿重复提交'
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
