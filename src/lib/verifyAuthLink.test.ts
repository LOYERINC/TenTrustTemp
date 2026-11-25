import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAuthLink } from './verifyAuthLink';

const implicit = { hasToken: false, type: null };
function fixture() {
  const calls: unknown[] = [];
  const client = { auth: {
    verifyOtp: async (input: unknown) => { calls.push(input); return { error: null }; },
    getSession: async () => ({ data: { session: { access_token: 'test-only-session' } }, error: null }),
    getUser: async () => ({ data: { user: { id: 'user-id' } }, error: null }),
  } };
  return { client, calls };
}
test('recovery exchanges the emailed hash and validates the session with Supabase', async () => {
  const { client, calls } = fixture();
  await verifyAuthLink(client, 'https://www.tentrust.com.ng/auth/reset-password?token_hash=test-only&type=recovery', true, implicit);
  assert.deepEqual(calls, [{ token_hash: 'test-only', type: 'recovery' }]);
});
test('a pre-existing session or confirmation token cannot authorize the recovery screen', async () => {
  const { client, calls } = fixture();
  await assert.rejects(verifyAuthLink(client, 'https://www.tentrust.com.ng/auth/reset-password', true, implicit));
  await assert.rejects(verifyAuthLink(client, 'https://www.tentrust.com.ng/auth/reset-password?token_hash=x&type=signup', true, implicit));
  assert.equal(calls.length, 0);
});
test('expired verification and invalid server sessions are rejected', async () => {
  const { client } = fixture();
  client.auth.verifyOtp = async () => ({ error: new Error('expired') });
  await assert.rejects(verifyAuthLink(client, 'https://www.tentrust.com.ng/auth/callback?token_hash=x&type=signup', false, implicit));
  const other = fixture().client;
  other.auth.getUser = async () => ({ data: { user: null }, error: null });
  await assert.rejects(verifyAuthLink(other, 'https://www.tentrust.com.ng/auth/callback?token_hash=x&type=magiclink', false, implicit));
});
test('supports implicit recovery links and rejects provider errors', async () => {
  await verifyAuthLink(fixture().client, 'https://www.tentrust.com.ng/auth/reset-password', true, { hasToken: true, type: 'recovery' });
  await assert.rejects(verifyAuthLink(fixture().client, 'https://www.tentrust.com.ng/auth/reset-password?error=expired', true, { hasToken: true, type: 'recovery' }));
});
