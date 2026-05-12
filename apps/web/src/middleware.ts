import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/cookie-names';
import { isAccessExpiringSoon } from '@/lib/jwt-exp';

const PROTECTED_RE = /^\/(dashboard|contacts)(\/|$)/;

const ACCESS_MAX_AGE_S = 60 * 30;
const REFRESH_MAX_AGE_S = 60 * 60 * 24 * 7;

interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

function getApiUrl(): string {
  return (
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001'
  );
}

async function refreshTokens(
  refreshToken: string,
): Promise<RefreshedTokens | null> {
  try {
    const r = await fetch(`${getApiUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as Partial<RefreshedTokens>;
    if (!data.accessToken || !data.refreshToken) return null;
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  } catch {
    return null;
  }
}

function rebuildCookieHeader(
  header: string | null,
  tokens: RefreshedTokens,
): string {
  const existing = (header ?? '')
    .split(';')
    .map((c) => c.trim())
    .filter(
      (c) =>
        c &&
        !c.startsWith(`${ACCESS_COOKIE}=`) &&
        !c.startsWith(`${REFRESH_COOKIE}=`),
    );
  existing.push(`${ACCESS_COOKIE}=${tokens.accessToken}`);
  existing.push(`${REFRESH_COOKIE}=${tokens.refreshToken}`);
  return existing.join('; ');
}

function applyTokenCookies(
  res: NextResponse,
  tokens: RefreshedTokens,
): void {
  const opts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  } as const;
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...opts,
    maxAge: ACCESS_MAX_AGE_S,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...opts,
    maxAge: REFRESH_MAX_AGE_S,
  });
}

function redirectToLogin(req: NextRequest, nextPath: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', nextPath);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED_RE.test(pathname)) {
    return NextResponse.next();
  }

  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    return redirectToLogin(req, pathname + search);
  }

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const needsRefresh = !access || isAccessExpiringSoon(access);

  if (!needsRefresh) {
    return NextResponse.next();
  }

  const refreshed = await refreshTokens(refresh);
  if (!refreshed) {
    const res = redirectToLogin(req, pathname + search);
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  // RSC desta request precisa enxergar o novo access — reescreve o
  // cabecalho Cookie da request antes de seguir para o handler.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    'cookie',
    rebuildCookieHeader(req.headers.get('cookie'), refreshed),
  );

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  applyTokenCookies(res, refreshed);
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
