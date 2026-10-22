/** Recover a public key when additional environment rows were pasted below it. */
export function normalizeSupabasePublicKey(value?: string): string {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  const firstLine = trimmed.split(/[\r\n]/, 1)[0].trim();
  const isJwt = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(firstLine);
  const isPublishableKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(firstLine);

  // Only discard trailing rows when the first line is a complete supported key.
  // Never select a token embedded in arbitrary text or on a later line.
  return isJwt || isPublishableKey ? firstLine : trimmed;
}
