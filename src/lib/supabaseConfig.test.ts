import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { normalizeSupabasePublicKey } from './supabaseConfig';

const key = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.test_signature';

test('signup can construct headers after additional environment rows were pasted into the public key', async () => {
  const pastedValue = `${key}\nVITE_MONO_PUBLIC_KEY\tpublic-test-key\nVITE_PREMBLY_PUBLIC_KEY\tother-public-key`;
  assert.throws(() => new Headers({ apikey: pastedValue }), TypeError);

  const requests: Request[] = [];
  const client = createClient('https://example.supabase.co', normalizeSupabasePublicKey(pastedValue), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ msg: 'Test validation response' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });

  const result = await client.auth.signUp({ email: 'test@example.com', password: 'test-password' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://example.supabase.co/auth/v1/signup');
  assert.equal(requests[0].headers.get('apikey'), key);
  assert.equal(requests[0].headers.get('authorization'), `Bearer ${key}`);
  assert.equal(result.error?.status, 422);
});

test('supports clean legacy and publishable keys, including Windows line endings', () => {
  assert.equal(normalizeSupabasePublicKey(` ${key} `), key);
  assert.equal(normalizeSupabasePublicKey(`${key}\r\nVITE_OTHER_KEY=value`), key);
  assert.equal(normalizeSupabasePublicKey('sb_publishable_test-key\nVITE_OTHER_KEY=value'), 'sb_publishable_test-key');
  assert.equal(normalizeSupabasePublicKey(undefined), '');
});

test('does not extract partial keys from arbitrary text or later lines', () => {
  const invalidFirstLine = `not-a-key\n${key}`;
  const embeddedKey = `prefix ${key} suffix`;
  assert.equal(normalizeSupabasePublicKey(invalidFirstLine), invalidFirstLine);
  assert.equal(normalizeSupabasePublicKey(embeddedKey), embeddedKey);
});
