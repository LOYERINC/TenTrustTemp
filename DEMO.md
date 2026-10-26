# Public Sandbox demo — 26 October 2026

## What this release does

Authenticated landlords create an Identity screening, complete a real Paystack **test** checkout, receive a one-time tenant link, and view the provider-returned identity result. The tenant gives consent and submits Mono’s documented Sandbox Mashup fixture. PDFs and pages label the journey as a Sandbox demonstration. No real payment or live identity verification is supported in demo mode. Credit checks and bank connections are disabled. The operations screen reads real paginated records behind confirmed-email, server-controlled administrator membership.

## Hosting configuration

Frontend: `www.tentrust.com.ng` on Vercel project `ten-trust`. Backend: `https://tentrust-api.onrender.com`, Render service `srv-dbcja45g1s2s73dfeav0`. Both releases must use this branch together. `render.yaml` declares the non-secret demo settings and the backend release branch. The existing Blueprint-linked branch must receive that file for automatic sync; an automatic sync still needs to be observed in Render before calling the backend ready.

Render must use `ENVIRONMENT=demo`, `MONO_IDENTITY_CHECKS_ENABLED=true`, `MONO_CREDIT_CHECKS_ENABLED=false`, existing Paystack `sk_test_` credentials, and existing Mono `test_sk_` credentials. Keep all Supabase/signing secrets server-side. Set `PUBLIC_APP_URL=https://www.tentrust.com.ng` and `PAYMENT_CALLBACK_URL=https://www.tentrust.com.ng/dashboard?tab=verify-tenant`. Preserve exact approved CORS origins; include the public www domain. Production mode continues to reject Paystack test credentials.

Vercel builds require `VITE_DEMO_MODE=true`, `VITE_API_BASE_URL=https://tentrust-api.onrender.com`, and existing public Supabase URL/anon key. Configure the same public values for Preview if promoting a preview build. Never put service-role, Paystack secret or Mono secret keys in Vite variables.

## Presenter journey

1. Sign in normally with a confirmed TenTrust account. Invitations or password changes must be completed by the account holder.
2. In the landlord dashboard create an **Identity verification** request for a synthetic tenant and synthetic property.
3. Follow the hosted Paystack checkout. Confirm the checkout says **TEST** and use Paystack’s displayed test-payment options only. Do not use a real card.
4. Return to the dashboard and wait for server-side payment verification. A successful provider payment creates a tenant link; a UI redirect alone never marks a request paid. If link issuance fails, retry **Get tenant link** on that same request rather than paying again.
5. Open the tenant link, give consent, and choose **Use Sandbox details**: BVN `22227777222`, NIN `12345678901`, date of birth `1991-09-01`. The backend rejects other identity inputs in demo mode.
6. Run the check. Refresh the landlord dashboard, open the actual returned report, and download its labelled Sandbox PDF. Name mismatch remains visible for human review; it never makes a rental decision.

Official Mono fixtures: https://docs.mono.co/docs/sandbox (Lookup tab). A direct Sandbox Mashup request returned HTTP 200 during release preparation.

## Remaining work / release checks

At preparation time the frontend production build and TypeScript checking succeeded, and backend Python syntax compiled. An initial TypeScript attempt ran out of memory; rerunning directly with a bounded Node heap completed successfully. Hosted deployment and the complete Paystack-to-report rehearsal are still pending; do not treat those as completed until verified.

The broader `/api/v1` tenant verification module, live provider onboarding, selfie/document review, retention scheduling, trusted property ownership mapping, email dispatcher activation, and live payments are outside this narrow demo release. Database groundwork exists separately, but this branch does not publish the new review workflow. No fake verified records or authentication bypass are included.

## Rollback

Revert the demo Blueprint changes in its linked branch first, so automatic sync cannot reapply demo settings. Restore the previous Vercel production deployment (`d1fa7b6`) and the previous successful Render deployment (`21df79c`) with `ENVIRONMENT=production` and identity checks disabled. A Git backup branch, `codex/pre-demo-render-20261026`, preserves the previous Render source. Keep real payment records; never erase records to hide a deployment problem. Restore public frontend/backend together.
