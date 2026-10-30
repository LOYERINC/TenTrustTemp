export function safeDashboardReturnTo(value: string | null, origin: string): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin && ['/dashboard','/payments/return','/payments/recover'].includes(url.pathname) ? url.pathname + url.search : null;
  } catch { return null; }
}

export function authCallbackUrl(origin: string, path = '/auth/callback') {
  const target = safeDashboardReturnTo(new URLSearchParams(window.location.search).get('returnTo'), origin);
  return origin + path + (target ? '?' + new URLSearchParams({returnTo:target}) : '');
}

export function authLinkReturnTo(href: string, origin: string): string | null {
  const query = new URL(href, origin).searchParams;
  const direct = safeDashboardReturnTo(query.get('returnTo'), origin);
  if (direct) return direct;
  const next = query.get('next');
  if (!next) return null;
  try {
    const callback = new URL(next, origin);
    if (callback.origin !== origin || !['/auth/callback','/auth/reset-password'].includes(callback.pathname)) return null;
    return safeDashboardReturnTo(callback.searchParams.get('returnTo'), origin);
  } catch { return null; }
}
