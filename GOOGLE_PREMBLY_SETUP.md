# Google sign-in and Prembly setup — 10 November 2026

## Prepared changes
- Google sign-in button appears only when the public Supabase auth settings report Google enabled. OAuth API errors now show instead of silently failing. Uses basic Google profile/email login without requesting offline Google access. Existing reference-preserving callback remains.
- New `SCREENING_IDENTITY_MODE=prembly` snapshots Prembly onto new Basic cases while preserving staff video review and typed reports. Existing manual cases keep their original consent and do not call a new provider retroactively.
- Before any Prembly lookup, the tenant sees and accepts provider-specific consent (`-prembly-v1`). The encrypted intake is saved atomically before the billed calls so repeated submissions cannot run those lookups twice. No automatic lookup retries.
- BVN Basic uses `/verification/bvn_validation`; NIN Basic uses `/verification/vnin-basic`. Only x-api-key is required; optional app-id is retained. Both were checked against official Prembly documentation. Matching requires provider success plus matching name and date of birth; absent or conflicting fields remain needs review.
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
Read-only key validation is available in the dashboard REST example: GET https://api.prembly.com/v1/auth/verify with the secret in x-api-key. No real tenant ID or paid live lookup was sent during implementation. Before live activation confirm BVN/NIN channel access and per-call prices, then run the provider's documented sandbox test cases. An account marked verified is not proof that every channel is funded or enabled.
Keep current production manual mode until those external settings and tests are complete. No database migration is needed. Code enables the new mode only when explicitly configured.

## Official references
https://supabase.com/docs/guides/auth/social-sign-in/auth-google
https://docs.prembly.com/reference/bvn-basic
https://docs.prembly.com/reference/national-id-basic
https://docs.prembly.com/guides/developers/api
