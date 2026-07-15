import { CookieOptions, Response } from 'express';
import { env } from '../config/env';
import { parseDurationToMs } from '../utils/jwt.util';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

function getRefreshCookieOptions(): CookieOptions {
  const maxAge = parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN);
  // Cross-site frontend/API (e.g. ayaricreations.com → hostingersite.com) needs SameSite=None; Secure
  const sameSite: CookieOptions['sameSite'] = env.COOKIE_SECURE ? 'none' : 'lax';

  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite,
    maxAge,
    path: '/api/v1/auth',
  };
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getRefreshCookieOptions());
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, getRefreshCookieOptions());
}

export function getRefreshTokenFromCookie(cookies: Record<string, string>): string | undefined {
  return cookies[REFRESH_TOKEN_COOKIE];
}
