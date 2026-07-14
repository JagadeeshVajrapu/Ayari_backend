import { CookieOptions, Response } from 'express';
import { env } from '../config/env';
import { parseDurationToMs } from '../utils/jwt.util';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

function getRefreshCookieOptions(): CookieOptions {
  const maxAge = parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN);

  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    maxAge,
    path: '/api/v1/auth',
  };
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getRefreshCookieOptions());
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
}

export function getRefreshTokenFromCookie(cookies: Record<string, string>): string | undefined {
  return cookies[REFRESH_TOKEN_COOKIE];
}
