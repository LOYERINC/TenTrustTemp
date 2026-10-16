# TenTrust Backend (FastAPI)

FastAPI service integrating **Mono** (Credit History Checks via BVN) and **Prembly** (KYC & Background Verification).

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have Python 3.10+ installed.

### 2. Setup Virtual Environment & Install Dependencies
Navigate into the `backend/` directory:

```bash
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Variables
Create or edit your `.env` file based on `.env.example`:

```env
MONO_SECRET_KEY=your_mono_secret_key
MONO_BASE_URL=https://api.withmono.com
MONO_CREDIT_CHECKS_ENABLED=false

PREMBLY_SECRET_KEY=your_prembly_secret_key
PREMBLY_APP_ID=your_prembly_app_id
PREMBLY_BASE_URL=https://api-sandbox.prembly.com

ENVIRONMENT=development
PORT=8000
```

The tenant screening API requires Supabase and a configured payment provider. Set `PAYMENT_PROVIDER=flutterwave` for Flutterwave or `PAYMENT_PROVIDER=paystack` for Paystack. Flutterwave checkout requires `FLW_SECRET_KEY` and a dashboard-configured webhook secret in `FLW_WEBHOOK_SECRET`; Paystack uses `PAYSTACK_SECRET_KEY`. Tenant credit checks do not use Mono Connect or ask the tenant to link a bank. The tenant says yes and enters their BVN; the server sends it to Mono Credit History Lookup and receives JSON. Set `MONO_SECRET_KEY` and `MONO_CREDIT_CHECKS_ENABLED=true` after Mono enables Lookup for the business account. Provider checks are never simulated.

Apply the screening schema before using these endpoints:

```bash
supabase db push
```

Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_PROVIDER`, and the selected gateway's credentials on the FastAPI service. Keep service-role and payment secret keys on the server only. Set a stable `TENANT_LINK_SIGNING_KEY` so an active signed tenant link can be reconstructed safely across backend restarts; if omitted, the backend derives signing from the service-role key. Configure frontend `VITE_API_BASE_URL`, and set `PAYMENT_CALLBACK_URL`, `PUBLIC_APP_URL`, and exact `ALLOWED_ORIGINS` for the deployment. For Flutterwave, register `https://YOUR_API_DOMAIN/api/payments/flutterwave/webhook` in the Flutterwave dashboard and set its Secret Hash to the same value as `FLW_WEBHOOK_SECRET`. For Paystack, register `https://YOUR_API_DOMAIN/api/payments/paystack/webhook`. In production, use live gateway credentials and set `SCREENING_PRICES_CONFIRMED=true` only after package prices have been approved.

Optional landlord report-ready emails use Resend. Configure `RESEND_API_KEY` and `SCREENING_NOTIFICATION_FROM_EMAIL` on the backend, and verify the sender domain in Resend. The email contains only a sign-in link to the landlord dashboard; screening details remain behind Supabase authentication. The dashboard also shows completed reports when the landlord returns.

Deployment variable names and a Render blueprint are in the repository-root `DEPLOYMENT.md` and `render.yaml`. The root `.env.local` is for Vite; backend secrets belong in `backend/.env` locally or the backend service's secret environment settings in Render.

### 4. Running the Server

```bash
uvicorn main:app --reload --port 8000
```

### 5. Interactive API Documentation
Once running, visit:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 📡 API Endpoints

### Health Check
- `GET /health`

### Mono (Credit Checks)
- `POST /api/mono/credit-history`
  - Body: `{"bvn": "12345678901", "provider": "all", "reason": "Credit Assessment"}`
- `POST /api/mono/webhook`

### Prembly (KYC / Background Check)
- `POST /api/prembly/verify-bvn`
  - Body: `{"bvn": "12345678901", "first_name": "JOHN", "last_name": "DOE"}`
- `POST /api/prembly/verify-nin`
  - Body: `{"nin": "12345678901"}`
- `POST /api/prembly/webhook`
