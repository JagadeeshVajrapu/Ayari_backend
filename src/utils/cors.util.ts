import { env } from '../config/env';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Origins allowed for browser CORS / Socket.IO (production + optional extras). */
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  const primary = stripTrailingSlash(env.FRONTEND_URL);
  if (primary) origins.add(primary);

  // Accept www ↔ apex when one of them is configured
  try {
    const u = new URL(primary);
    if (u.hostname.startsWith('www.')) {
      origins.add(`${u.protocol}//${u.hostname.slice(4)}`);
    } else if (u.hostname.includes('.')) {
      origins.add(`${u.protocol}//www.${u.hostname}`);
    }
  } catch {
    // ignore invalid FRONTEND_URL during origin expansion
  }

  const extras = process.env.CORS_ORIGINS?.split(',') ?? [];
  for (const raw of extras) {
    const trimmed = stripTrailingSlash(raw.trim());
    if (trimmed) origins.add(trimmed);
  }

  return [...origins];
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (getAllowedOrigins().includes(stripTrailingSlash(origin))) return true;
  if (env.NODE_ENV === 'development' && /^http:\/\/localhost:\d+$/.test(origin)) {
    return true;
  }
  return false;
}
