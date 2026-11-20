import type { CookieOptions, Response } from 'express';
import { config } from '../../config/env.js';

export const REFRESH_COOKIE_NAME = 'syncspace_rt';

/**
 * httpOnly: JavaScript (and therefore XSS) cannot read the token.
 * sameSite=strict: the browser never sends it on cross-site requests (CSRF defence).
 * path=/api/auth: the cookie only travels to the endpoints that need it.
 * secure: HTTPS-only in production.
 */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/auth',
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}
