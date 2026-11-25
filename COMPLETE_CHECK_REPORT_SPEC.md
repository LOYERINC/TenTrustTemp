# Complete Check report v1

Provider of verification and loan facts: Interswitch only. AI provider:
Google Gemini through a Google AI Studio API key. Default model:
`gemini-3.6-flash`, configurable on the backend. No Anthropic integration.

## Interswitch credit-history mapping (verified against the portal)

Endpoint: `POST /v1/verify/identity/credit-history-lookup`.
The successful response uses `data.credit_history[]` groups, each with a
`history[]` array and group-level `institution`. A loan's `institution` can be
null even when the group names its bank. Prefer a valid loan-level institution;
otherwise inherit the group value and record `institution_source=group`.

| Provider field | Retained evidence / interpretation |
| --- | --- |
| `data.providers[]` | Lookup-level source list, not an assumed per-record bureau mapping |
| `credit_history[].history[]` | Individual reported records with ordinal record and group references |
| `loan_status`, `performance_status` | Separate reported statuses; one must not replace the other |
| `date_opened`, `closed_date` | Normalized dates; contradictory dates retained for analysis |
| `currency`, `opening_balance`, `repayment_amount` | Reported values preserved; opening balance is not current outstanding debt |
| `repayment_frequency`, `tenor` | Retained without assuming undocumented tenor units |
| `repayment_schedule[].date/status` | Month/date and status retained; pending is not overdue |
| `data.profile` | Excluded from model input: contains personal names, addresses and identifiers |
| `trackingId` | Kept in the private lookup attempt for reconciliation, not AI interpretation |

Loan details remain encrypted in the sandbox intake. At most 50 records and 120
schedule entries per record are normalized; original record/schedule counts allow
coverage gaps to be identified. Old intakes that retained only counts cannot
support detailed repayment analysis without separately reconciled source data.
No repeat provider lookup is made automatically to fill missing details.

## Gemini analysis and admin review

Prompt version `complete-check-analysis-v3` requests a paragraph-led report,
approximately 450-750 words when detailed evidence supports it, with a two- or
three-paragraph executive summary. Shorter reports are appropriate when information
is missing. The aim is explanation of findings, significance, uncertainty and next
steps, rather than repeated raw values or clipped bullet statements.

The report includes a separate `admin_decision` object with outcome `selected`,
`not_selected`, or `further_information_required`, and 20-4000 characters of
administrator-written reasons. Its origin is explicitly `administrator`.
Gemini's input and output schemas exclude this decision. Staff must enter their
own outcome and explanation before approval/publication; neither is preselected
or generated. Both the API and publication RPC reject a missing decision or
insubstantial reasons. Changing the outcome or reasons clears approval. The
approved landlord view and PDF label this decision and its reasons as recorded
by the administrator, separately from AI analysis. AI does not assign tenant
risk levels or invent why a person was selected/not selected.

Gemini now writes genuine free-text analysis rather than selecting canned wording:
executive summary, observations, repayment concerns, missing information and
questions for the admin. It receives normalized records and deterministic counts
of open/closed/performing/non-performing records and schedule outcomes. Contradictory
dates are explicitly available. It may explain qualified financial implications,
but cannot make a rental eligibility decision or assign a tenant suitability score.

Each statement cites evidence keys. The backend validates the JSON structure,
reference existence, size limits and numeric grounding, and binds the analysis
to a digest of its source facts. This does **not** prove semantic correctness:
the admin must check interpretations, dates, reported units and freshness. Admins
can edit every statement, remove observations and add a report note. Any edit
clears approval. Only the approved final text is shown to the landlord and PDF.

## Report order

1. Header: TenTrust, report ID, tenant name, property, publication date, environment.
2. NIN name match: matched, not matched, or unconfirmed.
3. BVN details match: matched, not matched, or unconfirmed.
4. Loan history: confirmed returned record count, no records returned, unconfirmed,
   or unavailable. Do not equate record count with active loans or current debt.
5. Staff video finding: pending, reviewed, or needs follow-up. This is manual
   review, not certified liveness or an automated facial match.
6. Outstanding follow-up and scope limitations.

Names and property details are added by the application, outside model input.
Reported loan amounts, performance and schedule entries are included when supplied.
Current outstanding balances, credit scores, income, employment, address and
affordability are not invented from these fields.
No tenant suitability score, automatic rental decision or approve/reject advice.

## Implemented first slice

`backend/services/complete_check_report.py` defines a strict allowlist of summary
facts and produces a versioned factual draft with source-field references.
Unknown results remain distinct from empty history. Inconsistent facts are rejected.
Raw NIN/BVN, dates of birth, names, OTPs, provider payloads and video URLs are not
accepted by the draft contract.

Authenticated staff can fetch `GET /api/admin/complete-check/{id}/report-draft`
for a submitted sandbox case. The existing development/sandbox gates apply.
The staff modal automatically loads the factual draft; Gemini is optional.
Staff select their video outcome, prepare the matching draft, optionally edit a
landlord-visible note, and explicitly approve the exact report before publishing.
Changing the outcome, note or generated wording clears approval. Draft edits are
session-only until publication; unpublished drafts are not persisted.
The factual GET preview makes no external requests. Staff can separately request
`POST /api/admin/complete-check/{id}/report-draft/generate` to prepare a Gemini
preview. This endpoint is sandbox-only, requires staff authorization, and permits
at most two attempts per case per day using the existing atomic database rate-limit
RPC. It never automatically retries errors, including quota exhaustion. Missing
configuration, quota limits and rate-limit-service failure return the factual
template. Provider errors likewise return a template; they do not block publication.

## Publication and outage behaviour

The application checks every report finding against fresh source facts at publish
time. A report cannot be published without explicit staff approval. The new
`202611250001_complete_check_report_snapshot.sql` migration adds `published_report`
and an atomic `publish_complete_check_report` RPC. It checks staff membership,
locks the case and intake, rejects a changed intake revision, calls the existing
paid-case publication checks, and stores the approved snapshot with approval time.
Reviewer identity remains in the private intake audit fields. The older RPC is
no longer callable by the application role. A completed case cannot be republished.
Owner report retrieval exposes the snapshot only after completion; the dashboard
and offline PDF render the same approved text, note, follow-up and limitations.
Long text flows onto additional PDF pages.

Customer status after submission is "Checks complete. Your sample report is
awaiting staff review." No Google error is exposed to the customer. Interswitch
failures still remain unconfirmed and are not converted into successful checks.
For a paid case with an unknown provider result, staff must reconcile its lookup
reference before any retry. If delivery cannot be completed, staff arrange a
refund through the payment provider. Automated retry/refund endpoints are not
implemented by this change. Complete Check production checkout remains gated.

The foundation and snapshot migrations were applied atomically to hosted Supabase
project `elsvzazxshrqzwtuappy` on 2026-11-25. A read-only schema check confirmed the
intake table, snapshot column and publication function. This was a manual SQL
Editor rollout, without migration-history bookkeeping; do not reapply blindly.
Application preview deployment and the user’s black-box rehearsal remain pending.

`backend/services/gemini_report.py` sends normalized financial evidence, without
personal identifiers or raw profile data. The generation schema is simplified to
fit Google's grammar limits while Pydantic enforces local size limits. Output is
capped at 6144 tokens (including reasoning), timeout 40 seconds, with no automatic
retry. Generation failure falls back to the factual template. Model, prompt version,
token counts and outcome are returned without exposing keys or provider diagnostics.

## AI Studio configuration

Set these in `backend/.env` (never `VITE_` variables):

```dotenv
GEMINI_API_KEY=<your Google AI Studio API key>
COMPLETE_CHECK_AI_MODEL=gemini-3.6-flash
COMPLETE_CHECK_AI_ENABLED=true
```

The development environment and Interswitch sandbox flag must also be enabled,
and the existing verification rate-limit migration must be applied. Restart the
backend after changing settings. No billing account is enabled by this code;
free-tier availability and quotas depend on Google's project/model rules. Use
synthetic sandbox cases for this initial evaluation. A free API key is not a
guarantee of unlimited free requests. No real tenant data has been sent during
implementation beyond synthetic fixtures. The existing TenTrust Free-tier key
has been configured locally in `backend/.env`; its value is never included in
this document. A live synthetic draft succeeded with Gemini 3.5 Flash-Lite
(245 input tokens, 44 output tokens). Gemini 2.5 Flash-Lite returned HTTP 404
for this account: Google said it is no longer available to new users and named
3.5 Flash-Lite as its replacement. Billing was not enabled.

## Next implementation steps

- Expand synthetic live evaluation of loan analysis; browser
  rehearsal against a submitted sandbox case remains unverified.
- Persist model, prompt version, usage, source revision and staff approval without
  logging private input. Current generation metadata is response-only.
- Persist resumable draft edits if needed. The approved snapshot is stored once;
  revisions/republication are deliberately unsupported in this first release.
- Evaluate missing history, mismatches, unknown responses, malformed model output,
  instruction-like content, numeric changes and duplicate generation requests.
