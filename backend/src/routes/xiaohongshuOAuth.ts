import { Request, Response, Router } from 'express';

const LOCAL_CALLBACK_URL = 'http://127.0.0.1:8799/xhs/juguang/oauth/callback';

function queryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function xiaohongshuOAuthCallback(req: Request, res: Response): void {
  const authCode = queryText(req.query.auth_code) || queryText(req.query.code);
  const state = queryText(req.query.state);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!authCode || !state) {
    res.status(400).type('text/plain').send('OAuth callback is missing auth_code or state.');
    return;
  }

  const localUrl = new URL(LOCAL_CALLBACK_URL);
  localUrl.searchParams.set('auth_code', authCode);
  localUrl.searchParams.set('state', state);
  res.redirect(302, localUrl.toString());
}

export const xiaohongshuOAuthRouter: Router = Router();
xiaohongshuOAuthRouter.get('/xiaohongshu/callback', xiaohongshuOAuthCallback);
