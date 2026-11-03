import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { AUTH_ROUTES, PUBLIC_ROUTES, TOKEN_KEYS, TOKEN_MAX_AGE } from '@/constants/auth';
import { routing } from '@/i18n/routing';

const handleI18n = createMiddleware(routing);

/**
 * Strip the locale prefix from a pathname to get the canonical route.
 * Only non-default locales have a URL prefix (localePrefix: 'as-needed').
 */
function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(`/${locale}`.length);
    if (pathname === `/${locale}`) return '/';
  }
  return pathname;
}

/**
 * Derive locale from the URL pathname.
 * Returns defaultLocale when the pathname has no explicit prefix.
 */
function getLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) return locale;
  }
  return routing.defaultLocale;
}

function isProtectedRoute(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return !(PUBLIC_ROUTES as readonly string[]).includes(path);
}

interface IssuedTokens {
  access: string;
  refresh: string;
}

/**
 * Trade a refresh token for a new pair, or `null` if it is spent.
 *
 * The matcher below excludes `/api`, so this call does not come back through
 * here.
 */
async function refreshTokens(req: NextRequest, refreshToken: string): Promise<IssuedTokens | null> {
  try {
    const res = await fetch(new URL('/api/v1/auth/refresh', req.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { data?: { accessToken?: string; refreshToken?: string } };
    const access = body.data?.accessToken;
    const refresh = body.data?.refreshToken;
    return access && refresh ? { access, refresh } : null;
  } catch {
    // A refresh that cannot be reached is not a reason to crash a navigation;
    // the caller falls through to the login redirect.
    return null;
  }
}

/**
 * Written to match what the axios client writes, attribute for attribute —
 * differing on `path` or `sameSite` would leave the browser holding two
 * cookies of the same name.
 *
 * Deliberately **not** `httpOnly`: the client reads these with `document.cookie`
 * to set the Authorization header, and hiding them here would silently log the
 * app out of its own API.
 */
function writeTokenCookies(res: NextResponse, tokens: IssuedTokens) {
  const base = {
    path: '/',
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
  };
  res.cookies.set(TOKEN_KEYS.ACCESS, tokens.access, { ...base, maxAge: TOKEN_MAX_AGE.ACCESS });
  res.cookies.set(TOKEN_KEYS.REFRESH, tokens.refresh, { ...base, maxAge: TOKEN_MAX_AGE.REFRESH });
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  const cleanPathname = stripLocalePrefix(pathname);
  const locale = getLocale(pathname);
  const localePrefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  let token = req.cookies.get(TOKEN_KEYS.ACCESS)?.value;
  let issued: IssuedTokens | null = null;

  // The access cookie carries a 15-minute Max-Age, so the browser drops it
  // while the refresh cookie lives on for days. This runs before any client
  // JavaScript, which means the axios interceptor that normally refreshes on a
  // 401 never gets a turn during a full-page navigation — without this, every
  // session ended at fifteen minutes on the first link clicked.
  if (!token && isProtectedRoute(cleanPathname)) {
    const refreshToken = req.cookies.get(TOKEN_KEYS.REFRESH)?.value;
    if (refreshToken) {
      issued = await refreshTokens(req, refreshToken);
      if (issued) {
        token = issued.access;
        // Also on the request, so this same render sees them — the protected
        // layout reads the access token from `cookies()` to build the session.
        req.cookies.set(TOKEN_KEYS.ACCESS, issued.access);
        req.cookies.set(TOKEN_KEYS.REFRESH, issued.refresh);
      }
    }
  }

  // Unauthenticated user hitting a protected route → redirect to login
  if (isProtectedRoute(cleanPathname) && !token) {
    const loginUrl = new URL(`${localePrefix}${AUTH_ROUTES.LOGIN}`, req.url);
    // Without the locale prefix: the login page pushes it back through the locale-aware router.
    loginUrl.searchParams.set('callbackUrl', `${cleanPathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting the login page → redirect to dashboard
  if (cleanPathname === AUTH_ROUTES.LOGIN && token) {
    return NextResponse.redirect(new URL(`${localePrefix}/dashboard`, req.url));
  }

  // Delegate to next-intl for locale detection and routing
  const res = handleI18n(req);

  // Persist a refreshed pair to the browser, or it would be traded again on
  // every navigation for the rest of the fifteen minutes.
  if (issued) writeTokenCookies(res, issued);

  return res;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
