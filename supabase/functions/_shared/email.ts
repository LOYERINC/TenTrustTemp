export interface EmailJob {
  id: string;
  kind: 'waitlist_welcome' | 'report_ready';
  source_id: string;
  recipient: string;
  recipient_name: string;
  lease_token: string;
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!));

export function emailContent(job: EmailJob, appUrl: string) {
  const origin = new URL(appUrl).origin;
  const report = job.kind === 'report_ready';
  const url = report
    ? `${origin}/dashboard?tab=verify-tenant&report=${encodeURIComponent(job.source_id)}`
    : `${origin}/comingsoon/`;
  const heading = report ? 'Your TenTrust report is ready' : 'You’re on the TenTrust waitlist';
  const copy = report
    ? 'Sign in to your dashboard to review your tenant’s result. The report is advisory and does not make an automatic rental decision.'
    : 'Thanks for joining TenTrust. We’ve saved your place and will share product updates when we’re ready. This message confirms your waitlist signup.';
  const greeting = job.recipient_name ? `Hello ${job.recipient_name},` : 'Hello,';
  const label = report ? 'Open your dashboard' : 'Visit TenTrust';
  return {
    subject: heading,
    textContent: `${greeting}\n\n${heading}\n\n${copy}\n\n${label}: ${url}\n\nTenTrust`,
    htmlContent: `<html><body style="margin:0;background:#f3f7fa;font-family:Arial,sans-serif;color:#0c2340"><main style="max-width:560px;margin:32px auto;padding:32px;background:white;border-radius:16px"><p style="font-size:22px;font-weight:bold">TenTrust</p><p>${escapeHtml(greeting)}</p><h1 style="font-size:24px">${escapeHtml(heading)}</h1><p style="line-height:1.7">${escapeHtml(copy)}</p><p><a style="display:inline-block;padding:14px 20px;border-radius:10px;background:#0d70ab;color:white" href="${escapeHtml(url)}">${label}</a></p><p style="font-size:13px">If the button does not work, open ${escapeHtml(url)}</p></main></body></html>`,
  };
}

export type SendResult = { state: 'sent' | 'queued' | 'failed' | 'unknown'; messageId?: string; error?: string };

/** Only explicit rejections are retryable. A lost acknowledgement can mean sent. */
export async function sendEmail(job: EmailJob, config: { apiKey: string; sender: string; name: string; appUrl: string }, fetcher: typeof fetch = fetch): Promise<SendResult> {
  try {
    const { subject, htmlContent } = emailContent(job, config.appUrl);
    const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(8_000),
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: config.sender, name: config.name },
        to: [{ email: job.recipient }], subject, htmlContent,
        tags: ['tentrust', job.kind, `job:${job.id}`],
        headers: { 'X-Mailin-custom': `job_id:${job.id}` },
      }),
    });
    if (response.status === 429) return { state: 'queued', error: 'rate_limited' };
    if (response.status === 401 || response.status === 403) return { state: 'failed', error: 'configuration_error' };
    if (response.status >= 500) return { state: 'unknown', error: 'provider_uncertain' };
    if (!response.ok) return { state: 'failed', error: 'provider_rejected' };
    const body = await response.json().catch(() => null);
    if (typeof body?.messageId !== 'string' || !body.messageId) return { state: 'unknown', error: 'missing_acknowledgement' };
    return { state: 'sent', messageId: body.messageId.replace(/^<|>$/g, '') };
  } catch {
    return { state: 'unknown', error: 'transport_uncertain' };
  }
}

const events: Record<string, string> = {
  request: 'sent', sent: 'sent', delivered: 'delivered', deferred: 'deferred',
  softBounce: 'soft_bounce', soft_bounce: 'soft_bounce', hardBounce: 'hard_bounce', hard_bounce: 'hard_bounce',
  spam: 'spam', blocked: 'blocked', invalid: 'invalid', error: 'error', unsubscribed: 'unsubscribed',
};
const authSubjects: Record<string, string> = {
  'Confirm your TenTrust email': 'auth_confirmation',
  'Reset your TenTrust password': 'auth_recovery',
  'Your TenTrust sign-in link': 'auth_magic_link',
};

export function normalizeEvent(payload: Record<string, unknown>) {
  const event = events[String(payload.event)];
  const messageId = typeof payload['message-id'] === 'string' ? payload['message-id'].replace(/^<|>$/g, '') : '';
  const recipient = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const rawTs = Number(payload.ts_event ?? payload.ts_epoch ?? payload.ts);
  const date = new Date(rawTs > 1e12 ? rawTs : rawTs * 1000);
  if (!event || !messageId || messageId.length > 500 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
      || !Number.isFinite(rawTs) || !Number.isFinite(date.getTime())) return null;
  const custom = String(payload['X-Mailin-custom'] ?? '');
  const tags = Array.isArray(payload.tags) ? payload.tags.join(' ') : '';
  const job = `${custom} ${tags}`.match(/(?:job_id:|job:)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ?? null;
  const kind = authSubjects[String(payload.subject)] ?? 'unclassified';
  // Ignore unrelated mail from other applications sharing the Brevo account.
  if (!job && kind === 'unclassified') return null;
  return { p_event_key: `${messageId}:${event}:${date.toISOString()}`, p_message_id: messageId,
    p_job: job, p_kind: kind, p_recipient: recipient, p_event: event, p_at: date.toISOString() };
}
