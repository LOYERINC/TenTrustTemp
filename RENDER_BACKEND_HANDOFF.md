# TenTrust Render backend setup

The Vercel site is already online, but it is only the frontend. Please deploy the API backend from this GitHub repository to Render.

## Create the backend service

In Render, create a Blueprint instance from the repository and deploy the root `render.yaml`. It already points the service at `backend/`, uses the Python FastAPI app, and selects Paystack with `PAYMENT_PROVIDER=paystack`.

After deployment, copy the Render service URL (for example, `https://tentrust-api.onrender.com`). Set the frontend's `VITE_API_BASE_URL` in Vercel to that URL, then redeploy the Vercel site.

## Add backend environment values in Render

Use the existing local values in `backend/.env` as the source for the matching backend settings. Enter secrets directly in Render; do not commit or forward the `.env` file in an ordinary message.

Required or needed for the current deployment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYMENT_PROVIDER=paystack`
- `PAYSTACK_SECRET_KEY`
- `PAYMENT_CALLBACK_URL=https://tentrust.com.ng/dashboard?tab=verify-tenant`
- `PUBLIC_APP_URL=https://tentrust.com.ng`
- `ALLOWED_ORIGINS=https://tentrust.com.ng`
- `RESEND_API_KEY` and `SCREENING_NOTIFICATION_FROM_EMAIL` for report emails

The existing local Paystack secret is a test key (`sk_test_`). It can be used only for staging or test transactions. Production requires the account's live secret key (`sk_live_`), entered directly in Render. Never put either secret in Vercel frontend variables.

## Full local environment inventory

These are the names currently present in the local files. This inventory is for setup; it does not mean every name should be copied into Render.

Backend `backend/.env` names:

`MONO_PUBLIC_KEY`, `MONO_SECRET_KEY`, `MONO_BASE_URL`, `MONO_IDENTITY_CHECKS_ENABLED`, `MONO_CREDIT_CHECKS_ENABLED`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, `FLW_WEBHOOK_SECRET`, `PAYMENT_CALLBACK_URL`, `PUBLIC_APP_URL`, `MONO_WEBHOOK_SECRET`, `PREMBLY_SECRET_KEY`, `PREMBLY_PUBLIC_KEY`, `PREMBLY_APP_ID`, `PREMBLY_BASE_URL`, `PORT`, `HOST`, `ENVIRONMENT`, `ALLOWED_ORIGINS`, `PAYMENT_PROVIDER`, `PAYSTACK_SECRET_KEY`.

The Render blueprint now lists all the backend `.env` names as well as the API's other deployment settings. `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, and `FLW_WEBHOOK_SECRET` are for the unused Flutterwave option while Paystack is selected. `MONO_PUBLIC_KEY`, `FLW_PUBLIC_KEY`, and `PREMBLY_PUBLIC_KEY` are not read by the current backend settings. Render supplies `PORT` automatically, and `HOST` is set to `0.0.0.0` in the blueprint.

Frontend root `.env` names (set these on Vercel only when the frontend needs them):

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MONO_PUBLIC_KEY`, `VITE_PREMBLY_PUBLIC_KEY`.

## Configure Paystack webhook

After Render provides the backend service URL, register this URL in the Paystack dashboard:

`https://YOUR_RENDER_API_DOMAIN/api/payments/paystack/webhook`

## Deployment checks

- Confirm Render's `/health` endpoint responds successfully.
- Confirm Vercel's `VITE_API_BASE_URL` points to the Render service, then redeploy Vercel.
- Keep `SCREENING_PRICES_CONFIRMED=false` until launch prices are approved. Production checkout remains gated until then.
