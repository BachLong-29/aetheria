export const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
} as const;

export const TOKEN_MAX_AGE = {
  // 15 minutes — matches server-side ACCESS_TOKEN_EXPIRY
  ACCESS: 15 * 60,
  // 7 days — matches server-side REFRESH_TOKEN_EXPIRY
  REFRESH: 7 * 24 * 60 * 60,
} as const;

export const AUTH_ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
} as const;

/**
 * Pages anyone may open. Everything else needs a session — listing what is public rather than what
 * is protected means a page added under `(protected)` can never be left unguarded by accident.
 */
export const PUBLIC_ROUTES = [
  '/',
  AUTH_ROUTES.LOGIN,
  AUTH_ROUTES.REGISTER,
  AUTH_ROUTES.FORGOT_PASSWORD,
] as const;

export const DEFAULT_AFTER_LOGIN = '/dashboard';
