# Paystack payment release

This release changes payment/auth recovery only. The existing public catalog, identity flow, provider gates and secret values are preserved.

Orders are committed before initialization. Both webhook aliases validate raw-body SHA512 signatures and settle through the same atomic RPC. Owner-only status, retry and recovery routes use provider verification. The return page preserves the reference through login and polls for 60 seconds.

Apply `supabase/migrations/202610290001_resilient_payments.sql` only if absent. It is already applied to the existing TenTrust Supabase project; do not rerun all migrations.

Deploy backend and frontend together. Keep the current test configuration until the account owner installs the live Paystack secret in Render and confirms live checkout/prices. The live webhook is separate from the test webhook:

`https://tentrust-api.onrender.com/api/payments/paystack/webhook`

Subscribe to `charge.success`. Configure the backend PUBLIC_APP_URL and ALLOWED_ORIGINS for `https://www.tentrust.com.ng`. Never add server secrets to VITE variables.

Hosted Supabase confirmation, magic-link and recovery templates were already updated to ConfirmationURL and same-origin payment return allowlists.

Tests: backend payment/Flutterwave tests; frontend payment/auth tests; isolated Postgres settlement tests; TypeScript; production build. Test successful payments, closing the tab, expired auth, duplicate notifications, invalid signatures, abandoned payments and retry after provider-confirmed failure.

Recovery: from backend run `python reconcile_payments.py --limit 100` (dry run), review, then `python reconcile_payments.py --apply --limit 100`. This never creates charges.
