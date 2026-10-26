export function safeDashboardReturnTo(value: string | null, origin: string): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin && url.pathname === '/dashboard' ? url.pathname + url.search : null;
  } catch { return null; }
}
