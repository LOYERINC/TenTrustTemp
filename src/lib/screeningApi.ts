import { supabase } from './supabase';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
export const SCREENING_API_BASE = (configuredApiBase || 'http://localhost:8000').replace(/\/$/, '');
const paymentVerificationFetches = new Map<string, Promise<Response>>();

export interface ScreeningPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  description: string;
  checks: string[];
  check_count: number;
  enabled: boolean;
  unavailable_reason?: string | null;
}

export interface ReadinessScore {
  score: number;
  scale: 100;
  label: string;
  confidence: 'low' | 'moderate' | 'high';
  evidence_coverage: number;
  source: 'rules-based';
  recommendation_label?: string;
  recommendation?: string;
  factors: Array<{ key: string; label: string; weight: number; score: number }>;
  input_sources?: Record<string, string>;
  identity_status: string;
  disclaimer: string;
}

export class ScreeningApiError extends Error {
  detail: unknown;
  status: number;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ScreeningApiError';
    this.status = status;
    this.detail = detail;
  }
}

export async function screeningApi<T>(path: string, options: RequestInit = {}, requireAuth = true): Promise<T> {
  const paymentVerification = path.includes('/verify-payment');
  const requestStartedAt = performance.now();
  const headers = new Headers(options.headers);
  let paymentRequestKey = '';
  headers.set('Content-Type', 'application/json');
  if (requireAuth) {
    const sessionStartedAt = performance.now();
    const { data: { session } } = await supabase.auth.getSession();
    if (paymentVerification) console.info(`[payment-timing] client auth session elapsed_ms=${(performance.now() - sessionStartedAt).toFixed(1)}`);
    if (!session?.access_token) {
      throw new ScreeningApiError('Please sign in again before starting a tenant check.', 401);
    }
    headers.set('Authorization', `Bearer ${session.access_token}`);
    if (paymentVerification) paymentRequestKey = `${session.access_token}:${path}`;
  }

  let response: Response;
  const fetchStartedAt = performance.now();
  try {
    if (paymentVerification) {
      const inFlight = paymentVerificationFetches.get(paymentRequestKey);
      if (inFlight) {
        response = (await inFlight).clone();
      } else {
        const request = fetch(`${SCREENING_API_BASE}${path}`, { ...options, headers });
        paymentVerificationFetches.set(paymentRequestKey, request);
        try {
          // Each caller consumes its own body; keep the shared response unread.
          response = (await request).clone();
        } finally {
          paymentVerificationFetches.delete(paymentRequestKey);
        }
      }
    } else {
      response = await fetch(`${SCREENING_API_BASE}${path}`, { ...options, headers });
    }
  } catch {
    throw new ScreeningApiError('The screening service is unavailable. Please try again shortly.', 0);
  }
  if (paymentVerification) console.info(`[payment-timing] client verify request origin=${new URL(SCREENING_API_BASE).origin} status=${response.status} elapsed_ms=${(performance.now() - fetchStartedAt).toFixed(1)} total_ms=${(performance.now() - requestStartedAt).toFixed(1)}`);

  // Cached profile/session state is not proof the access token is still accepted.
  // Retry only a rejected authentication check, never an ambiguous network failure.
  if (requireAuth && response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session?.access_token && !error) {
      headers.set('Authorization', `Bearer ${data.session.access_token}`);
      try { response = await fetch(`${SCREENING_API_BASE}${path}`, { ...options, headers }); }
      catch { throw new ScreeningApiError('The service is temporarily unavailable. Try again shortly.', 0); }
    } else if (error && (!error.status || error.status >= 500)) {
      throw new ScreeningApiError('Sign-in renewal is temporarily unavailable. Please try again shortly.', 503);
    } else {
      await supabase.auth.signOut({ scope: 'local' });
    }
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail;
    const validationMessages = Array.isArray(detail)
      ? detail.map((issue: { loc?: Array<string | number>; msg?: string }) => {
          const field = issue.loc
            ?.filter((part) => part !== 'body' && part !== 'query' && part !== 'path')
            .map((part) => String(part).replaceAll('_', ' '))
            .join(' ');
          const message = issue.msg?.replace(/^Value error, /, '');
          return message ? (field ? `${field}: ${message}` : message) : null;
        }).filter((message): message is string => Boolean(message))
      : [];
    const message = typeof detail === 'string'
      ? detail
      : detail?.message || validationMessages.join('; ') || 'We could not complete that screening step.';
    throw new ScreeningApiError(message, response.status, detail);
  }
  return body as T;
}

export function formatScreeningError(error: unknown): string {
  if (error instanceof ScreeningApiError) {
    const detail = error.detail as { check_status?: Record<string, string> } | undefined;
    const statuses = detail?.check_status;
    if (statuses && Object.keys(statuses).length) {
      return `${error.message} ${Object.entries(statuses).map(([name, status]) => `${name.replace('_', ' ')}: ${status}`).join(' · ')}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
