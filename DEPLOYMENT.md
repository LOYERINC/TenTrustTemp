# Production API and environment setup

This guide lists the external services used by the current app and the exact variable names their owners need to configure. Add secrets in the provider dashboard for the service that consumes them. Never put a private key in a `VITE_` variable, a frontend `.env` file, or source control.

## Services and API keys

| Service | Used for | Environment variables | Where they belong |
| --- | --- | --- | --- |
| Supabase | Frontend sign-in, screening records, consent, payment state | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Netlify frontend; the same project URL and anon key also go in Render as `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Supabase | Trusted backend writes to screening records and bundle credits | `SUPABASE_SERVICE_ROLE_KEY` | Render only; never Netlify or browser code |
| Flutterwave | Screening checkout and payment verification | `FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET` | Render backend only; the current flow creates and verifies checkout on the server |
| Mono | BVN credit history lookup | `MONO_SECRET_KEY`, `MONO_BASE_URL`, `MONO_CREDIT_CHECKS_ENABLED` | Secret key and feature flag on Render; no bank-link key is needed |
| Prembly Identitypass | Optional legacy BVN/NIN checks | `PREMBLY_SECRET_KEY`, `PREMBLY_APP_ID`, `PREMBLY_BASE_URL`, `PREMBLY_WEBHOOK_SECRET` | Render backend only; not required by the current screening packages |
| Google Gemini | AI assistant and rent estimate endpoints | `GEMINI_API_KEY` | Private environment of the serverless or Node service hosting those endpoints; never Vite/Netlify frontend variables |

## Netlify frontend

Set these in the Netlify environment settings for each deploy context:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://elsvzazxshrqzwtuappy.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_API_BASE_URL` | Render API origin, for example `https://YOUR_RENDER_API_DOMAIN`, with no trailing slash |

The Netlify waitlist function also needs the public Supabase URL and anon key available to Functions (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`). The `public.waitlist` table is insert-only for anon users; do not add the service-role key to Netlify.

All `VITE_` settings are visible in the compiled app. Only use public/publishable keys here. After changing a Netlify setting, trigger a new frontend deploy because Vite embeds these values at build time.

## Vercel frontend and waitlist

The Vercel project builds with `npm run build` and serves `dist`. The waitlist endpoint is the Vercel function in `api/waitlist.ts`; configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Vercel project environment for every deploy context. The function accepts name, email, role, and UTM fields and inserts them into `public.waitlist` using the anon key and the table's insert-only RLS policy. The function can fall back to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, but the server-side names are preferred. Never configure or use the service-role key for the public waitlist form.

Apply `supabase/migrations/202610160001_waitlist.sql` to the same Supabase project before accepting signups. Duplicate email addresses return a friendly conflict response.

## Render FastAPI backend

Set these in the Render service environment:

| Variable | Value or action |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `PORT` | Provided by Render |
| `HOST` | `0.0.0.0` |
| `PAYMENT_PROVIDER` | `paystack` |
| `SUPABASE_URL` | `https://elsvzazxshrqzwtuappy.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key, used to validate the signed-in user's JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/secret key; backend only |
| `RESEND_API_KEY` | Resend API key for landlord report-ready email notifications |
| `SCREENING_NOTIFICATION_FROM_EMAIL` | Verified sender, e.g. `TenTrust <reports@your-verified-domain.com>` |
| `PAYSTACK_SECRET_KEY` | Paystack secret key for the chosen environment; backend only |
| `PAYMENT_CALLBACK_URL` | `https://YOUR_NETLIFY_DOMAIN/dashboard?tab=verify-tenant` |
| `PUBLIC_APP_URL` | `https://YOUR_NETLIFY_DOMAIN` |
| `ALLOWED_ORIGINS` | Exact frontend origin(s), comma-separated, with no wildcard; e.g. `https://YOUR_NETLIFY_DOMAIN` |
| `SCREENING_PRICES_CONFIRMED` | Keep `false` until the owner approves launch prices; set `true` only for production checkout after approval |
| `SCREENING_CONSENT_VERSION` | Version label recorded with tenant consent; bump when consent wording changes |
| `MONO_SECRET_KEY` | Mono secret key for the server-side credit history lookup |
| `MONO_BASE_URL` | `https://api.withmono.com` |
| `MONO_CREDIT_CHECKS_ENABLED` | Keep `false` until Mono enables Credit History Lookup for the business account and the owner is ready to use it |
| `PREMBLY_SECRET_KEY` | Prembly Identitypass API key |
| `PREMBLY_APP_ID` | Prembly app ID, if issued for the account |
| `PREMBLY_BASE_URL` | Production API origin; use Prembly's sandbox origin with sandbox credentials |
| `PREMBLY_WEBHOOK_SECRET` | Shared secret used by the Prembly webhook endpoint, if that endpoint is configured |
| `PREMBLY_CHECKS_ENABLED` | Not used by the current tenant screening packages |

The Render blueprint declares the provider keys as unsynchronized secrets, so the owner enters them directly in Render. Do not commit a live `.env` file.

### Paystack setup

Register this webhook in Paystack:

`https://YOUR_RENDER_API_DOMAIN/api/payments/paystack/webhook`

Set `PAYMENT_PROVIDER=paystack` and add `PAYSTACK_SECRET_KEY` directly in Render. Use the existing `sk_test_` key only for staging; production checkout rejects test keys and requires a live `sk_live_` key.

## AI endpoints

The AI assistant and rent estimator read `GEMINI_API_KEY` on the server. The repository currently has `api/chat.ts` and `api/estimate.ts` handlers plus local routes in `server.ts`; `netlify.toml` currently configures only static publishing and SPA routing. Before relying on AI features in production, deploy those handlers through a supported serverless-functions adapter or a Node service, then set `GEMINI_API_KEY` in that service's private environment. Netlify frontend `VITE_` variables are not a safe place for this key.

## Local development

Copy `.env.example` to the frontend's local `.env` and `backend/.env.example` to `backend/.env`. Use sandbox provider keys only. Run the SQL migrations in `supabase/migrations/` before using the screening service.

The Basic package needs Supabase, a configured payment provider, and confirmed prices in production. Standard, Premium, and Founding Member remain unavailable until their identity and credit providers are enabled and working. Provider failures do not create a successful result or sample report.
