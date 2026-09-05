import { IncomingMessage } from 'http';

export const SENSITIVE_OAUTH_CALLBACK_PATH = '/api/oauth/xiaohongshu/callback';

type LoggableRequest = Pick<IncomingMessage, 'url'> & { originalUrl?: string };

export function shouldSkipRequestLogging(req: LoggableRequest): boolean {
  const requestUrl = req.originalUrl || req.url || '';
  return requestUrl === SENSITIVE_OAUTH_CALLBACK_PATH
    || requestUrl.startsWith(`${SENSITIVE_OAUTH_CALLBACK_PATH}?`);
}
