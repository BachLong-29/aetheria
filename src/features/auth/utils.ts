import { DEFAULT_AFTER_LOGIN } from '@/constants/auth';

/**
 * Where to go once signed in: the page the proxy bounced the visitor from, if it left one.
 * Only an in-app path counts — `//host` and `/\host` read as same-origin to a naive check but are
 * not, and following them would turn the login page into an open redirect.
 */
export function getCallbackUrl(
  search = typeof window === 'undefined' ? '' : window.location.search,
) {
  const raw = new URLSearchParams(search).get('callbackUrl');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return DEFAULT_AFTER_LOGIN;
  }
  // Sent back to the login page itself would loop.
  if (/^\/(login|register)(\/|\?|$)/.test(raw)) return DEFAULT_AFTER_LOGIN;
  return raw;
}
