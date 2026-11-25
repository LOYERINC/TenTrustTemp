import { normalizeEvent } from '../_shared/email.ts';
import { authorized, edge, json, required, rpc } from '../_shared/runtime.ts';

edge.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!await authorized(request, required('BREVO_WEBHOOK_TOKEN'))) return json({ error: 'Unauthorized' }, 401);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 65536) return json({ error: 'Payload too large' }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const events = Array.isArray(body) ? body : [body];
    if (events.length > 100 || events.some(e => !e || typeof e !== 'object' || Array.isArray(e))) return json({ error: 'Invalid event batch' }, 400);
    for (const payload of events) {
      const event = normalizeEvent(payload);
      if (event) await rpc('record_email_event', event);
    }
    return json({ received: true });
  } catch {
    return json({ error: 'Event storage unavailable' }, 503);
  }
});
