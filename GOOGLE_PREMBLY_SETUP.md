# Current status — 10 November 2026
- PR #19 merged (94a3a83ad7ed7cb4040c79256810d008d3c73b66). Vercel production deployment 7689627687 succeeded. Render source branches updated.
- Google project tentrust-514317 created under tentrust32@gmail.com. Owner approved the Google API User Data Policy. OAuth client TenTrust Web Sign-in created; credentials saved only in Supabase. Google provider enabled, production audience published, only email/profile/openid scopes configured. Production OAuth round trip completed to the signed-in TenTrust dashboard.
- Existing live Prembly key validated using the official interactive wallet tester (HTTP 200 Successful), then saved in Render. No paid lookup or real tenant ID was sent.
- Prembly wallet balance is zero. Keep SCREENING_IDENTITY_MODE=manual and PREMBLY_CHECKS_ENABLED=false until the owner funds it. No top-up was initiated.
- Current public docs moved from /reference to /api-reference. Correct Basic URLs are /api/v1/verification/api/bvn_basic/ and /api/v1/verification/api/nin_basic/. The old dashboard /v1/auth/verify example returned 404; use the read-only wallet endpoint for key validation.
- After funding, validate wallet availability and sandbox contract behavior before switching new cases to Prembly. Existing cases keep their prior consent. A real paid tenant verification was not tested.

# Google sign-in and Prembly setup — 10 November 2026

## Prepared changes
- Google sign-in button appears only when the public Supabase auth settings report Google enabled. OAuth API errors now show instead of silently failing. Uses basic Google profile/email login without requesting offline Google access. Existing reference-preserving callback remains.
- New `SCREENING_IDENTITY_MODE=prembly` snapshots Prembly onto new Basic cases while preserving staff video review and typed reports. Existing manual cases keep their original consent and do not call a new provider retroactively.
- Before any Prembly lookup, the tenant sees and accepts provider-specific consent (`-prembly-v1`). The encrypted intake is saved atomically before the billed calls so repeated submissions cannot run those lookups twice. No automatic lookup retries.
- BVN Basic uses `/api/v1/verification/api/bvn_basic/`; NIN Basic uses `/api/v1/verification/api/nin_basic/`. Only x-api-key is required; optional app-id is retained. Both were checked against official Prembly documentation. Matching requires provider success plus matching name and date of birth; absent or conflicting fields remain needs review.
- Provider summaries remain encrypted and staff-only. A lookup failure leaves the case for staff review and does not grant a verified verdict. A staff member must still review the video and explicitly write/publish the report. Credit checks stay disabled.

## Google Cloud / Supabase configuration
Google account: tentrust32@gmail.com. Console is open, but first-time Google Cloud Terms of Service must be reviewed and accepted by the owner before project setup.
1. Choose/create the TenTrust Google Cloud project. Configure app branding: TenTrust, https://www.tentrust.com.ng/, privacy https://www.tentrust.com.ng/privacy, terms https://www.tentrust.com.ng/terms, authorized domain tentrust.com.ng, support contact@tentrust.com.ng (or the console account's available verified support address).
2. Audience: External. Scopes: openid, userinfo.email, userinfo.profile only.
3. Create a Web application OAuth client. Origins: https://www.tentrust.com.ng, https://tentrust.com.ng; local development http://localhost:3000 and http://127.0.0.1:3000 as needed.
4. Authorized Google redirect URI must be EXACTLY https://elsvzazxshrqzwtuappy.supabase.co/auth/v1/callback . This differs from the app callback.
5. Enter client ID and client secret in the existing TenTrust Supabase project's Google provider and enable it. Never put the client secret in Vite variables or Git.
6. Supabase Site URL: https://www.tentrust.com.ng. Allow app callbacks https://www.tentrust.com.ng/auth/callback and the current query-preserving redirect patterns; retain localhost callback entries for development.
7. Test normal login and payment-return login. Confirm the app session belongs to the intended user and the payment reference survives. Do not claim Google sign-in works before this end-to-end check.

## Prembly activation
Prembly dashboard is signed in, Live mode. Local existing key is test-only and checks are disabled. Do not regenerate keys.
Store the existing live secret only in backend secret settings (Render PREMBLY_SECRET_KEY), set PREMBLY_BASE_URL=https://api.prembly.com, PREMBLY_CHECKS_ENABLED=true and SCREENING_IDENTITY_MODE=prembly after code deployment and account/channel access confirmation. Keep MONO_IDENTITY_CHECKS_ENABLED=false and MONO_CREDIT_CHECKS_ENABLED=false. Never put a Prembly secret in the frontend.
Read-only key validation is available in the dashboard REST example: GET https://api.prembly.com/api/v1/wallet/ with the secret in x-api-key. No real tenant ID or paid live lookup was sent during implementation. Before live activation confirm BVN/NIN channel access and per-call prices, then run the provider's documented sandbox test cases. An account marked verified is not proof that every channel is funded or enabled.
Keep current production manual mode until those external settings and tests are complete. No database migration is needed. Code enables the new mode only when explicitly configured.

## Official references
https://supabase.com/docs/guides/auth/social-sign-in/auth-google
https://docs.prembly.com/api-reference/identity-verification/verify_bvn_basic
https://docs.prembly.com/api-reference/identity-verification/verify_nin_basic
https://docs.prembly.com/guides/developers/api
