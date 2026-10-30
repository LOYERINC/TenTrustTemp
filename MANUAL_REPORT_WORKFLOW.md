# Manual review and report handover — 30 October 2026

## Customer flow
1. Landlord chooses Basic (NGN 1,500), acknowledges manual review, and pays through Paystack.
2. Confirmed payment unlocks a tenant link. The landlord shares that link.
3. Tenant consents and submits their full name, BVN, NIN, date of birth, and challenge video.
4. Confirmed staff open /admin → Screenings → Review evidence. ID details and videos are staff-only.
5. Staff record the manual ID outcome and private basis for it, then save the video review.
6. Staff type the landlord-facing report, choose its result, and Save draft or Publish report to landlord.
7. Landlord opens the completed case in /dashboard, reads the published report, and downloads the full PDF.

## Drafts and publication
Drafts stay AES-GCM encrypted in the existing private challenge row, inside identity_review_encrypted.report_draft. Private notes and identity intake never enter the landlord report. Public reports use the existing credit_report JSONB column with type=manual_staff_report, body, verdict, review_method, revision, and published_at. This discriminator separates them from legacy bureau results. No new migration or environment variable is needed for the report editor.

Saving evidence no longer completes a manual case. Explicit publication changes status to complete and uses the existing report-ready email trigger. Re-publishing changes increments revision but keeps report ID; unchanged duplicate publication does nothing. Concurrent saves/publications return a conflict instead of silently overwriting. Revisions replace the published report; this is not an immutable public revision archive. Existing automated report paths are unchanged.

Verified is a recorded TenTrust staff decision after manual ID review and a passed video review; it does not claim Mono or official registry validation. Unresolved checks cannot be published as verified/reviewed. Full submitted BVN/NIN (including spaced/hyphenated digits) and common birth-date formats are blocked in public text. Staff must still check all report text for private information before publishing; the guard is not a complete content redactor.

## Current live foundation
PR #14 is merged and deployed. Production backend health confirms live Paystack, manual identity mode, and private storage readiness. Basic NGN 1,500 is enabled. Intermediate NGN 3,000 is disabled while Mono/credit approval is pending; Custom is quote-only. Private-intake migration 202610300001_manual_identity_intake.sql is applied. Existing encryption key, Supabase secrets and private bucket remain required. Mono is never called for manual Basic cases.

## Validation and remaining release steps
Applicable backend tests: 67 passed. Frontend payment/auth and long-report PDF tests: 8 passed. TypeScript passes. Synthetic three-page PDF rendered and inspected; last finding and NGN amounts preserved. Two old Resend notification tests in test_notifications.py refer to removed settings and fail independently of this change; they are excluded from the applicable suite. Brevo uses the existing database queue instead.

Before calling this change live: merge the staff-report PR, deploy backend/frontend, then perform a public signed-in rehearsal using an authorized staff account and a customer-owned case. Actual live charge delivery and full public manual-review journey have not been exercised by automation. No real tenant verdict or real charge was created during development.

## Operations
- Never put private IDs, birth date, bank documents, or private notes in the typed report.
- Do not reopen the four historical held Brevo jobs.
- Admin membership is server-controlled and requires a confirmed account.
- Report routes require staff membership; landlord report routes retain owner checks.
- PDF wraps long text across pages and includes manual-review provenance, revision, report ID, and date.
