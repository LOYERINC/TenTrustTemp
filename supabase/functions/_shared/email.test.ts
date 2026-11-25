import assert from 'node:assert/strict';
import test from 'node:test';
import { emailContent, EmailJob, normalizeEvent, sendEmail } from './email.ts';
import { authorized } from './runtime.ts';

const job: EmailJob = { id: '11111111-1111-4111-8111-111111111111', kind: 'report_ready',
  source_id: '22222222-2222-4222-8222-222222222222', recipient: 'owner@example.com',
  recipient_name: '<img src=x onerror=alert(1)>', lease_token: 'lease' };
const config = { apiKey: 'test-only', sender: 'hello@example.com', name: 'TenTrust', appUrl: 'https://www.tentrust.com.ng' };

test('report email escapes input and contains only an authenticated dashboard link', () => {
  const content = emailContent(job, config.appUrl);
  assert.ok(!content.htmlContent.includes('<img'));
  assert.ok(content.htmlContent.includes('&lt;img'));
  assert.ok(content.textContent.includes('/dashboard?tab=verify-tenant&report='));
  assert.ok(!content.htmlContent.includes('/api/public/'));
});

test('provider acceptance means sent, not delivered; job correlation is attached', async () => {
  const result = await sendEmail(job, config, async (url, init) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.headers['X-Mailin-custom'], `job_id:${job.id}`);
    assert.deepEqual(body.to, [{ email: job.recipient }]);
    return new Response(JSON.stringify({ messageId: '<message-123>' }), { status: 201 });
  });
  assert.deepEqual(result, { state: 'sent', messageId: 'message-123' });
});

test('explicit rate limiting can retry; ambiguous responses cannot resend blindly', async () => {
  for (const [status, state, error] of [[429, 'queued', 'rate_limited'], [401, 'failed', 'configuration_error'],
    [400, 'failed', 'provider_rejected'], [503, 'unknown', 'provider_uncertain']] as const) {
    assert.deepEqual(await sendEmail(job, config, async () => new Response('{}', { status })), { state, error });
  }
  assert.equal((await sendEmail(job, config, async () => { throw new Error('timeout'); })).state, 'unknown');
  assert.equal((await sendEmail(job, config, async () => new Response('{}', { status: 201 }))).state, 'unknown');
});

test('webhooks use an allowlist and omit bodies, previews, and untrusted arbitrary data', () => {
  const raw = { event: 'hard_bounce', 'message-id': '<message-123>', email: 'OWNER@example.com',
    ts_event: 1792663200, tags: [`job:${job.id}`], mirror_link: 'https://private-preview', body: 'secret' };
  const event = normalizeEvent(raw)!;
  assert.equal(event.p_job, job.id);
  assert.equal(event.p_recipient, 'owner@example.com');
  assert.equal(event.p_message_id, 'message-123');
  assert.ok(!JSON.stringify(event).includes('private-preview'));
  assert.ok(!JSON.stringify(event).includes('secret'));
  assert.equal(normalizeEvent({ ...raw, event: 'opened' }), null);
  assert.equal(normalizeEvent({ ...raw, ts_event: 'invalid' }), null);
  assert.equal(normalizeEvent({ ...raw, tags: [], subject: 'Other application' }), null);
  assert.equal(normalizeEvent({ ...raw, tags: [], subject: 'Reset your TenTrust password' })?.p_kind, 'auth_recovery');
});

test('dispatcher and webhook authentication reject absent or wrong secrets', async () => {
  assert.equal(await authorized(new Request('https://example.com'), 'test-secret'), false);
  assert.equal(await authorized(new Request('https://example.com', { headers: { Authorization: 'Bearer wrong' } }), 'test-secret'), false);
  assert.equal(await authorized(new Request('https://example.com', { headers: { Authorization: 'Bearer test-secret' } }), 'test-secret'), true);
});
