import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/cookie-names';

const PROTECTED_RE = /^\/(dashboard)(\/|$)/;

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED_RE.test(pathname)) {
    return NextResponse.next();
  }

  const hasRefresh = Boolean(req.cookies.get(REFRESH_COOKIE)?.value);
  if (hasRefresh) {
    return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Protege tudo exceto _next internals e arquivos estaticos.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
