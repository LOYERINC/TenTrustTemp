import assert from 'node:assert/strict';
import test from 'node:test';
import handler from './waitlist';

test('waitlist API preserves save and duplicate contracts with a pasted public key', async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_ANON_KEY;
  const key = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.test_signature';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = `${key}\nVITE_OTHER_KEY\tother-value`;
  try {
    let status = 0, body: any;
    const response = { setHeader() {}, status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
    const request = { method: 'POST', body: { name: 'Test user', email: 'TEST@example.com', role: 'landlord' } };
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://example.supabase.co/rest/v1/waitlist');
      assert.equal(new Headers(init?.headers).get('apikey'), key);
      assert.equal(JSON.parse(String(init?.body)).email, 'test@example.com');
      return new Response(null, { status: 201 });
    };
    await handler(request, response);
    assert.equal(status, 201); assert.deepEqual(body, { success: true }); assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('{}', { status: 409 });
    await handler(request, response); assert.equal(status, 409);
    await handler({ ...request, body: { ...request.body, name: '' } }, response); assert.equal(status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldKey;
  }
});
