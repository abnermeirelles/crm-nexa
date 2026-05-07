import { cookies } from 'next/headers';
import { isProd } from '@/env';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookie-names';

export { ACCESS_COOKIE, REFRESH_COOKIE };

const ACCESS_MAX_AGE_S = 60 * 30; // 30min — slightly mais que o TTL do JWT (15min)
const REFRESH_MAX_AGE_S = 60 * 60 * 24 * 7; // 7d

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

const baseCookieOpts = () =>
  ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
  }) as const;

export async function setSessionCookies(tokens: IssuedTokens): Promise<void> {
  const store = await cookies();
  const opts = baseCookieOpts();
  store.set(ACCESS_COOKIE, tokens.accessToken, {
    ...opts,
    maxAge: ACCESS_MAX_AGE_S,
  });
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...opts,
    maxAge: REFRESH_MAX_AGE_S,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value;
}
