type EdgeRuntime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
export const edge = (globalThis as unknown as { Deno: EdgeRuntime }).Deno;
export function required(name: string) {
  const value = edge.env.get(name)?.trim();
  if (!value) throw new Error('Missing server configuration');
  return value;
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function authorized(request: Request, secret: string) {
  const value = request.headers.get('Authorization') ?? '';
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(value)),
    crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${secret}`)),
  ]);
  const a = new Uint8Array(actual), b = new Uint8Array(expected);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const service = required('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${required('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST', signal: AbortSignal.timeout(5_000),
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('Database operation failed');
  return response.status === 204 ? undefined as T : await response.json();
}
