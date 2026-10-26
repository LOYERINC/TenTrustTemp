# TenTrust — public Sandbox demo

This release prepares the 26 October 2026 public demonstration: normal landlord sign-in, Identity screening creation, hosted Paystack test checkout, server-side payment verification, consent-based Mono Sandbox identity lookup, and a labelled downloadable report. It contains no simulated payment-success path.

See [DEMO.md](DEMO.md) for hosting configuration, documented sample details, presenter steps, pending checks and rollback. The frontend production build passed during preparation; public deployment and the complete hosted checkout rehearsal are not yet confirmed.

## Source layout

- `src/`: React frontend, authenticated landlord dashboard, token-based tenant consent/identity portal and read-only administrator operations.
- `backend/`: FastAPI API, authenticated screening ownership, payment verification and Mono Mashup adapter.
- `supabase/`: database migrations. Hosted payment/token and administrator database setup was applied separately.

## Local development

Install frontend dependencies with `npm install`, then run `npm run dev`. Set the public Supabase configuration and `VITE_API_BASE_URL` in an ignored local environment file. The backend uses `backend/requirements.txt` and an ignored `backend/.env`; start it with `uvicorn main:app --host 127.0.0.1 --port 8000` from the backend directory. Never commit credentials.

Use `npm run build` for a production bundle and `npm run lint` for TypeScript checking.

## What remains after the demo

Live provider onboarding and pricing approval, the new versioned tenant-verification/reviewer workflow, document/selfie review, retention scheduling, trusted property ownership, activation of email delivery, and live payments require separate release work. Credit packages are disabled. Sandbox identity data must never be presented as verification of a real tenant.
