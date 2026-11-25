# Tenant verification API v1

For the current hosted setup, completed migrations, reviewer seed and remaining deployment work, see the [project setup status](../../README.md). This guide describes the API implementation and configuration.

This module uses the repository's FastAPI, Pydantic and Supabase/PostgREST conventions. It is a separate authenticated API under `/api/v1`; the existing paid, token-based screening MVP has not been migrated into these new tables. The React tenant-link page continues to use that older API. No existing payment or tenant data is automatically copied, billed, or backfilled.

## Assessment boundary

The module collects evidence and provides a human reviewer with identity comparison, declared affordability and verification statuses. It **does not automatically decide rental eligibility**. `score` means evidence completion percentage, not a tenant ranking or risk score. Automated recomputation returns `pending` or `review`. Only an authenticated, server-authorized reviewer can record `pass`, `review` or `fail`, with a reason, using the decision endpoint. A pending check blocks a final decision. Identity and liveness failures remain visible evidence requiring review; they do not automatically deny a rental. A verified guarantor is shown for human consideration and never silently overrides contradictory evidence.

## Setup

1. Install `backend/requirements.txt` and the existing frontend dependencies.
2. Apply repository migrations in order, including `202610250002_verification_cases.sql`. This creates the private `verification-evidence` storage bucket. Source tables have RLS enabled and no anon/authenticated grants; only the backend service role can access them. Apply migrations to a staging project first.
3. Configure the server environment below. `python scripts/configure_verification_dev.py`, run from `backend/`, creates missing local encryption/hash/job secrets in the ignored `backend/.env`, without printing them. Provision production secrets through the hosting secret manager. Do not rotate encryption or pepper keys without a data migration: old evidence and lookup hashes depend on them.
4. Provision reviewer membership in the existing `admin_memberships` table through the server-controlled administration process. Public user metadata cannot grant reviewer access.
5. Populate `verification_property_links(property_id,landlord_id)` from trusted property ownership records. Tenants cannot create these links. A case can be created without a landlord/property; a shared case must use a pre-existing verified pair.
6. Run `uvicorn main:app --reload --port 8000`. The API is documented in `/docs` under “Tenant verification v1”. There is no live provider call at startup.

| Variable | Meaning |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existing backend authentication/database/storage configuration |
| `MONO_SECRET_KEY`, `MONO_BASE_URL` | Lookup app secret and documented API origin, normally `https://api.withmono.com` |
| `MONO_IDENTITY_CHECKS_ENABLED` | `true` only after the correct Mono Lookup app/entitlements and sandbox configuration are confirmed |
| `ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes; AES-256-GCM |
| `HASH_PEPPER` | Independent random secret, at least 32 bytes; HMAC-SHA256 |
| `LIVENESS_PROVIDER` | `manual_review`; unknown values fail closed |
| `DATA_RETENTION_DAYS` | 1–365; default 30 |
| `VERIFICATION_POLICY_VERSION` | Default `2026-10-25`; clients fetch `/verification-policy` |
| `VERIFICATION_JOB_SECRET` | Independent random bearer secret for the retention job |
| `MONO_WEBHOOK_SECRET` | Shared secret set on the Mono webhook configuration |
| `AFFORDABILITY_PASS_RATIO`, `AFFORDABILITY_REVIEW_RATIO` | Decimal threshold strings; defaults `0.40`, `0.50` |

Credit remains disabled regardless of a stale `MONO_CREDIT_CHECKS_ENABLED` flag. `DisabledCreditProvider` returns `{status:"not_available",provider:null,result:null}` without a network request. Credit-dependent legacy packages are disabled as well.

## Tenant flow

Use the Supabase access token in `Authorization: Bearer …`. The actor always comes from that verified session, never a request `tenant_id`. All case IDs are UUIDs.

1. `POST /verification-cases` with `tenant_first_name` (one word), positive **integer** `monthly_rent_kobo`, and optional paired `landlord_id`/`property_id`.
2. `GET /verification-policy`, then `POST /verification-cases/:id/consent` with `granted:true`, the exact `policy_version`, and chosen `purposes`: `identity`, `liveness`, `employment`, `address`, `references`, `guarantor`, `summary_sharing`. No check runs without its current purpose-specific consent.
3. `POST /verification-cases/:id/identity` with 11-digit string `bvn`, `nin`, optional ISO `date_of_birth`. This normalizes the NIN lookup and starts the BVN session. It returns allowed method names, never the provider session token.
4. `POST /verification-cases/:id/identity/otp/send` with an allowed `method`. `alternate_phone` also requires `phone_number`.
5. `POST /verification-cases/:id/identity/otp/verify` with `otp`. BVN and NIN names, dates of birth and last ten phone digits are compared. A cross-account HMAC match flags manual review. No raw vendor object or ID is returned.
6. `POST /verification-cases/:id/liveness` with `selfie:{content_base64,content_type}`. At most three attempts; default result `manual_review`.
7. `POST /verification-cases/:id/employment` with `employer_name`, `job_title`, `employment_type`, positive integer `monthly_income_kobo`, `document:{content_base64,content_type}` and optional `cac_number`. Income remains self-declared until a reviewer verifies it. The rent/income calculation uses `Decimal`, and passing affordability is capped at `review` while employment is unverified.
8. `POST /verification-cases/:id/address` with `address_text`, `proof_type` and `proof:{content_base64,content_type}`.
9. `POST /verification-cases/:id/references` once per contact (up to five), with `type`, `name`, `phone`, optional `email`. No message is automatically sent to a reference.
10. Optional `POST /verification-cases/:id/guarantor` with name/contact/relationship. The returned short-lived invitation is shared by the tenant. The guarantor signs in as their own user and calls `POST /verification-cases/:id/guarantor/accept` with `invitation`. They must independently consent and use the identity/liveness/employment endpoints with `subject_type:"guarantor"`. Tenant consent cannot stand in for guarantor consent.
11. `GET /verification-cases/:id` returns the summary to its tenant (or accepted guarantor with `subject_type=guarantor`). `POST /verification-cases/:id/dispute` stores an encrypted reason and opens human review. `POST /verification-cases/:id/consent/revoke` with `subject_type` expires the case, stops subsequent writes, clears sensitive fields, and attempts private-file deletion. A guarantor withdrawal conservatively expires the shared case too.

Files are base64 JSON uploads, not multipart. Accepted documents: JPEG, PNG or PDF; selfies: JPEG or PNG; maximum 5 MB per file and 8 MB per request. Content signatures are checked; client filenames and arbitrary storage keys are not accepted. Storage is private, with the platform's storage encryption at rest. Reviewer URLs expire after 60 seconds. No signed evidence URL is returned to a landlord.

## Reviewer and landlord APIs

All `/admin/…` operations require an authenticated email-confirmed active `admin_memberships` entry. Sensitive GETs require `X-Review-Reason` (10–300 characters), and each read is audit logged. Write bodies require a reason. Notes, contacts, normalized identity names/DOB/phone and audit responses are encrypted; no free-text notes are copied into audit metadata.

| Endpoint, relative to `/api/v1` | Use |
|---|---|
| `GET /admin/verification-cases?status=needs_review` | Paginated queue; `limit`/`offset` supported |
| `GET /admin/verification-cases/:id/evidence` | Normalized evidence, disputes and 60-second private file URLs; no raw vendor responses |
| `GET /admin/verification-cases/:id/identity/:identityId/photo` | Authenticated, audited NIN reference image; no-store response |
| `POST /admin/verification-cases/:id/liveness/:checkId/decision` | `status`, optional `match_score`, `reason` |
| `POST /admin/verification-cases/:id/employment/verify` | `subject_type`, optional `subject_id`, `verification_status`, `verification_method`, `reason` |
| `POST /admin/verification-cases/:id/address/:addressId/verify` | `status`, `reason` |
| `POST /admin/verification-cases/:id/references/:refId/record` | Contact status, optional paid-on-time/condition/rent-again answers and reason |
| `POST /admin/verification-cases/:id/recompute` | Refresh evidence completion and reasons; never a final eligibility decision |
| `POST /admin/verification-cases/:id/decision` | Human reviewer records `result` and `reason` after pending checks are resolved |
| `GET /landlord/verification-cases/:id/summary` | Only the explicit `LandlordSummary` DTO; requires both current property ownership and unrevoked summary-sharing consent |

The landlord DTO has exactly `caseId`, `tenantFirstName`, `overallResult`, `checks`, `reasons`, `verifiedAt`. It excludes identifiers, DOB, phone, income, bank data, photos, storage keys and vendor responses. Address evidence is available to the reviewer; the requested landlord DTO does not add an Address check.

## Audit, revocation and retention

Case creation, consent, evidence mutations and their audit events are transactional SQL functions. Identity operations use database leases, shared database rate limits (tenant and client IP), and case row locks. Revocation locks the same case; a provider response that finishes after revocation cannot recreate purged data. Audit events cannot be updated or deleted, including by the service role. Sensitive read endpoints create an audit event first; audit failure denies the read.

Encryption envelopes include a random nonce, authenticated case/subject/field context, and a version marker. Swapping ciphertext between cases or fields fails authentication. BVN/NIN lookup uses domain-separated HMAC hashes, not unpeppered hashes. Raw provider responses exist only as encrypted audit fields and have no read API, including for reviewers. Raw identity request fields and upstream error bodies are never logged or reflected in errors. Consistent v1 errors are `{error:{code,message,fields?}}` and validation errors omit submitted values.

Deploy `supabase/operations/schedule_verification_retention.sql` after configuring the specified Supabase Vault secrets. It invokes the authenticated retention endpoint hourly. The endpoint clears expired identity data, contact details, employment amounts, raw audit responses and photo/session data, expires cases, and drains a durable object-deletion queue. Failed storage deletions remain queued. Sensitive evidence reads and edits are denied after expiry even before the next scheduled purge; the summary remains available under its sharing rules. Consent revocation attempts deletion immediately and queues failures. Private URLs issued before revocation can remain usable for at most their 60-second lifetime.

## Provider implementation and documented limitations

Official contracts checked for this implementation:

- [BVN iGree guide](https://docs.mono.co/docs/lookup/bvn-igree): `POST /v2/lookup/bvn/initiate` with `bvn,scope:"identity"`; `POST /v2/lookup/bvn/verify` with `method` (optional alternate phone); `POST /v2/lookup/bvn/details` with `otp`. The latter two use `x-session-id`. The backend never requests `bank_accounts` scope.
- [NIN lookup guide](https://docs.mono.co/docs/lookup/nin-lookup): `POST /v3/lookup/nin` with `nin`, optional `date_of_birth`. Only documented fields are normalized.
- [Webhook security](https://docs.mono.co/docs/webhooks): Mono specifies a shared `mono-webhook-secret` header, compared in constant time. This is not an invented HMAC signature scheme. `/webhooks/mono` deduplicates by event ID and stores an encrypted event envelope. These lookup calls are synchronous; no undocumented webhook event is allowed to mark a case verified.

Operational TODOs and assumptions:

1. **NIN photo availability:** current documentation warns that some NIN responses are validation only and return no photo. Such cases cannot pass a manual selfie-to-NIN comparison. The API leaves them in review and rejects a passed liveness decision without a reference photo. Confirm access to a photo-bearing response with Mono or add a separately documented liveness provider. No photo, identity match or liveness result is simulated.
2. **BVN session lifetime:** the backend uses a conservative local 10-minute deadline; the cited guide does not promise that duration. An earlier provider expiry is handled as an unsuccessful OTP/session. Confirm the app's provider-specific TTL before rollout.
3. **Property ownership:** this repo has no canonical property ownership table. The trusted `verification_property_links` mapping must be populated from that system; it is not created from a tenant's claims.
4. **Deployment:** migrations, production secrets, reviewer membership and the retention schedule are deployment steps; the code does not mutate the live project or make billable identity calls during tests. Existing token-based MVP cases need an explicit migration/UI integration before using v1.

To add a liveness adapter, implement `LivenessProvider.start/get_result`, register it in `liveness_provider()`, add signature-verified idempotent callbacks if that vendor documents them, and write recorded-response contract tests. Preserve private storage and explicit reviewer authorization. To add credit later, implement `CreditProvider`, add consent/configuration and contract tests, and revise the database `not_available` constraint in a reviewed migration. Credit absence must remain neutral.

## Checks

From `backend/`: `python -m unittest discover -s tests` and `python -m ruff check verification tests/test_verification.py --select E4,E7,E9,F`.

From the repository root: `npm run lint`, `npm run test:verification:db`, `npm run test:email`, and `npm run test:email:db`. SQL tests run against disposable PGlite PostgreSQL, including RLS, consent, leases, retention and append-only audit checks. Provider and HTTP tests use synthetic fixtures and mock HTTP; CI never calls Mono.
