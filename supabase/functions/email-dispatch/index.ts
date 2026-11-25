import { EmailJob, sendEmail } from '../_shared/email.ts';
import { authorized, edge, json, required, rpc } from '../_shared/runtime.ts';

edge.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!await authorized(request, required('EMAIL_DISPATCH_SECRET'))) return json({ error: 'Unauthorized' }, 401);
    const config = { apiKey: required('BREVO_API_KEY'), sender: required('BREVO_FROM_EMAIL'),
      name: edge.env.get('BREVO_FROM_NAME') || 'TenTrust', appUrl: required('PUBLIC_APP_URL') };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.sender) || new URL(config.appUrl).protocol !== 'https:') {
      return json({ error: 'Sender or app URL is invalid' }, 503);
    }
    const jobs = await rpc<EmailJob[]>('claim_email_jobs');
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const result = await sendEmail(job, config);
        await rpc('finish_email_attempt', { p_job: job.id, p_lease: job.lease_token,
          p_state: result.state, p_message_id: result.messageId ?? null, p_error: result.error ?? null });
      }
    };
    const workers = await Promise.allSettled(Array.from({ length: Math.min(5, jobs.length) }, worker));
    return json({ claimed: jobs.length, workerErrors: workers.filter(w => w.status === 'rejected').length });
  } catch {
    // Never include keys, recipients, provider responses, or message bodies in logs.
    return json({ error: 'Email dispatcher unavailable' }, 503);
  }
});
