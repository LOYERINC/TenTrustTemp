# Staff-written manual reports

See [MANUAL_REPORT_WORKFLOW.md](MANUAL_REPORT_WORKFLOW.md) for the payment → tenant intake → staff review → draft → publish → landlord PDF flow and release checklist.

# TenTrust — current status and transfer handover

**Updated: 26 October 2026.** Public rehearsal evidence was recorded at **16:38 UTC**. This README is the starting point for another developer, computer or Codex chat. It contains no passwords, API-key values or reusable sign-in/tenant tokens.

## Start here

**Current level: public Sandbox demo ready. The broader live verification product is not signed off.**

- Public dashboard: https://www.tentrust.com.ng/dashboard
- Backend health: https://tentrust-api.onrender.com/health
- The public journey was completed with normal sign-in, an actual hosted **Paystack test** checkout, server-side payment verification, tenant consent, a successful **Mono Sandbox** lookup, a matching-name report and an actual downloaded PDF.
- Only **Identity verification**, currently **NGN 3,000 in test mode**, is enabled. The checkout gets its package ID, availability and price from the backend.
- No live payment or real-person identity verification was demonstrated. Credit, the broader evidence/reviewer workflow and operational email activation remain separate work.
- A completed synthetic example is already available to the signed-in presenter.

## Progress bars and milestone counts

These are **manually counted milestones**, not an estimate of lines of code, a live monitor or a production-readiness certification. The counts refer to the checklists below.

```text
Public Sandbox demo       [##########] 100%   8 / 8 observed checkpoints
Broader verification v1   [###-------]  33%   2 / 6 delivery milestones
Brevo / email setup       [####------]  40%   2 / 5 recorded setup milestones
Broader live release      [----------]   0%   0 / 8 launch gates signed off
```

### Public demo: 8 of 8 observed

- [x] Presenter account signed in normally; protected administrator operations loaded.
- [x] Synthetic Identity request created using the API package catalog.
- [x] Hosted Paystack checkout displayed **Test** and completed NGN 3,000 successfully.
- [x] Backend verified the payment and issued the private tenant link.
- [x] Tenant consent for the Sandbox fixture was recorded before lookup.
- [x] Mono returned a successful Sandbox identity response.
- [x] Persisted report showed `complete`, `name_match=match` and `environment=sandbox`.
- [x] Actual exported PDF was found, rendered and visually inspected: Sandbox heading, sample-data disclaimer and no full BVN/NIN.

### Broader verification v1: 2 of 6 delivery milestones

- [x] Backend/frontend implementation groundwork exists in the original development folder.
- [x] Verification schema, private evidence bucket and restrictive security policy were applied to hosted Supabase during earlier setup.
- [ ] Review and deploy the versioned `/api/v1` backend; it is **not included in the running demo API**.
- [ ] Review and deploy the coordinated multi-step tenant and evidence-review frontend.
- [ ] Validate evidence uploads, manual selfie/reference-photo review, guarantor consent, disputes and landlord privacy end to end.
- [ ] Populate trusted property ownership mappings and install/observe retention processing.

The first two ticks record implementation/setup work, not proof that the whole v1 workflow is operational.

### Brevo / email: 2 of 5 recorded milestones

- [x] Domain/sender setup was recorded earlier for `tentrust.com.ng` and `contact@tentrust.com.ng`.
- [x] Separate API/SMTP credential preparation was recorded; values belong in ignored files and hosted secret settings.
- [ ] Confirm hosted Auth SMTP/templates and deploy the dispatcher/event functions with the intended secrets.
- [ ] Verify controlled-inbox delivery, event authentication, bounces and suppression handling.
- [ ] Review queued recipients, install the required schedule and deliberately enable sending.

The first two items were not revalidated as a complete delivery pipeline during the demo rehearsal. Email queues were left disabled; do not backfill historical messages automatically.

### Broader live release: 0 of 8 gates signed off

- [ ] Mono business activation/KYB and required live Lookup permissions.
- [ ] Approved pricing and an audit of public package/marketing claims; checkout is authoritative, while other marketing pages still need review.
- [ ] Separately authorized live payment configuration and reconciliation checks.
- [ ] Live identity consent, response/error handling and provider behavior validated with authorized data.
- [ ] Versioned evidence and human-review workflow deployed and accepted.
- [ ] Trusted property/landlord ownership mappings provisioned.
- [ ] Retention jobs, deletion behavior and audit evidence demonstrated.
- [ ] Required email delivery and the broader release/security review completed.

These gates describe the intended broader release. They do not mean every optional feature must be enabled: keep credit disabled until its own implementation/provider review is complete. Scores describe evidence completeness; do not turn them into automatic rental eligibility decisions.

## Deployed services and source of truth

| Component | Observed state / location |
| --- | --- |
| Public frontend | Vercel project **ten-trust**, team **Jide's projects**, domain `www.tentrust.com.ng` |
| Frontend source | `jaisleek/TenTrust`, branch `main` |
| Last verified frontend application commit | `234951e1674b928c1c25f21648b192a7d0e117a2` — merge of PR #11 |
| Frontend deployment | `BmcQrExi1Yiuc8YXvAEKofgJfhpw`, observed Ready / Production |
| Backend | `https://tentrust-api.onrender.com`, Render service `srv-dbcja45g1s2s73dfeav0` |
| Last verified backend code | `81cf62bdc2fa4d68636c97c26c45eeee1b976fb6` |
| Render source observed in dashboard | `LOYERINC/TenTrustTemp`, `codex/readable-blue-brand-api-setup` |
| Render runtime | `ENVIRONMENT=demo`, Paystack **test**, Identity enabled; **Free** compute plan |
| Blueprint | `exs-dbcj7nvb9u1s73bs1r8g`, configured in `render.yaml` |
| Supabase | Project `elsvzazxshrqzwtuappy` |
| Mono | SMARTMOVE SOLUTIONS LTD, Sandbox Lookup app **TenTrust Tenant Verification** |

`render.yaml` declares `codex/public-demo`, while the dashboard was still observed on `codex/readable-blue-brand-api-setup`. Both release branches received the same verified backend commit. **Check the actual service and Blueprint linkage before publishing or syncing**; do not infer it from a local filename alone.

Merged release work:

- [PR #10 — coordinated public Sandbox release](https://github.com/jaisleek/TenTrust/pull/10)
- [PR #11 — backend-driven mode and correct checkout packages](https://github.com/jaisleek/TenTrust/pull/11)

The Sandbox banner and fixture controls read `/health`. They no longer depend on a build-time demo flag. Persisted Sandbox reports also carry an environment marker used by the PDF exporter.

## Exact rehearsal evidence

| Item | Verified value |
| --- | --- |
| Synthetic screening | `6bad959f-e58f-4a97-8d25-b6daddd0e7fa` |
| Report | `cae6af3a-1637-4c2e-aa7b-50d7ef05c780` |
| Payment reference | `tt_cb5a7f810844474d89ea09d8d1ef03f1` |
| Payment | `provider=paystack`, `mode=test`, `status=paid`, `amount_kobo=300000`, `currency=NGN` |
| Screening | `status=complete`, `payment_status=paid`, `package_id=identity`, `name_match=match` |
| Result marker | `check_status.identity=sandbox_verified`, `check_status.environment=sandbox` |

Local proof in the **original project folder**:

- `artifacts/setup/public-demo-rehearsal.json` — read-back of the persisted synthetic screening/payment.
- `artifacts/setup/public-sandbox-identity-complete.png` — completed tenant result.
- `artifacts/setup/public-sandbox-landlord-report.png` — landlord report view.
- `artifacts/setup/paystack-test-checkout.png` — hosted Test checkout.
- `artifacts/setup/public-sandbox-report.pdf` and `.png` — actual PDF and inspected rendering.
- `artifacts/setup/PUBLIC_DEMO_STATUS.md` — operational rehearsal notes.

These local artifacts are not assumed to exist in a fresh Git clone. The PDF was originally saved by Edge into **Documents**, then copied into the proof folder. The automation download event timed out, but the actual file was found and verified; no export-code fix was published.

## Demo runbook

1. Open the public dashboard a few minutes before presenting. Render Free can take **about 50 seconds** to wake after inactivity.
2. Sign in with the presenter account. Its email was manually confirmed through Supabase Auth at the owner's explicit request; the owner chose a password directly on the first-party recovery page. No password is in this README or the repository.
3. Show the existing completed example, or choose **New verification → Identity verification** for a new rehearsal.
4. Use Mono's published sample name **SAMUEL NOMO OLAMIDE**, sample phone **09066662020** and a clearly synthetic property label.
5. Complete the hosted Paystack **Test → Success** option. Do not use a real card or switch the service to live keys for this demo.
6. Wait for backend confirmation and copy/open the issued tenant link. For this synthetic rehearsal, follow the consent step and choose **Use Sandbox details**.
7. The helper fills published sample BVN `22227777222`, NIN `12345678901` and DOB `1991-09-01`. The demo backend rejects arbitrary identity inputs.
8. Run the check, refresh the landlord dashboard, open the report and export the PDF.

If a payment is already confirmed but link issuance fails, retry **Get tenant link** on the same request. **Do not pay again** to recover a paid request. Tenant links expire and are consumed after successful use; create a new synthetic screening for a fresh full rehearsal rather than replaying a consumed link.

Mono references: [Mashup integration](https://docs.mono.co/docs/lookup/mashup), [published Sandbox fixtures](https://docs.mono.co/docs/sandbox).

## Transfer to another chat or computer — read this carefully

There are **two different working folders**:

| Folder | Purpose / transfer warning |
| --- | --- |
| `C:/Users/user/.codex/worktrees/public-demo/Tentrust` | Curated public-demo worktree and this handover. Frontend follow-up branch: `codex/demo-service-mode`; documentation is saved separately on `codex/demo-handover`. |
| `C:/Users/user/Downloads/Tentrust` | Original development checkout, including **uncommitted/unreleased broader verification and email work**. Preserve it separately. |

A fresh clone of the public repository does **not** guarantee recovery of the original folder's uncommitted files. The managed worktree has a Git pointer to the original repository and a `node_modules` junction, so copying that worktree alone is not a self-contained repository backup.

### Move the committed public-demo source

```powershell
git clone https://github.com/jaisleek/TenTrust.git TenTrust
cd TenTrust
git remote add user-fork https://github.com/LOYERINC/TenTrustTemp.git
git fetch user-fork
# If the latest handover is not yet on main:
git switch -c codex/demo-handover user-fork/codex/demo-handover
```

In the existing checkout, the remote named `origin` points to `BMJ2008/TenTrust`, **not the public Vercel source**. Do not push to it assuming it publishes the website. The CLI connection used during setup could push to the LOYERINC fork; merges to `jaisleek/TenTrust` were completed using its owner account in Edge.

### Preserve the unreleased development work too

Before a machine transfer:

- Save `git status` and preserve the original working folder's modified **and untracked** source files. A Git bundle/archive of committed history alone does not include them.
- In particular preserve `backend/verification/`, `src/lib/verificationApi.ts`, the original multi-step `TenantVerificationPortal.tsx`, the original reviewer `AdminDashboard.tsx`, `supabase/migrations/`, `supabase/operations/`, and `EMAIL_OPERATIONS.md`.
- Copy the proof artifacts if needed. The previous setup README was preserved locally as `artifacts/setup/README_HISTORY_2026-10-25.md`.
- Transfer secret files separately through a private channel or secret manager. Do not put them in a source archive you intend to publish.
- Reinstall dependencies; do not rely on the `node_modules` junction or copy generated `dist` files as the source of truth.
- Do not reset/clean the original checkout or deploy it wholesale over the verified demo.

### Copy this into the next Codex chat

> Read README.md and DEMO.md first. TenTrust's public Sandbox demo is verified through normal sign-in, Paystack test payment, server verification, private tenant consent, a Mono Sandbox match and a visually inspected PDF. Last verified frontend application commit is 234951e; backend is 81cf62b, ENVIRONMENT=demo, on Render Free. Preserve the original Downloads/Tentrust checkout: it contains unreleased/uncommitted v1 verification and email work not fully included in the curated demo worktree or public clone. Do not enable live keys, credit or queued email merely to reproduce the demo. Review the outstanding v1 deployment, ownership, retention and delivery milestones before proceeding. No passwords or secret values belong in the handover.

## Configuration and local restart

Frontend public configuration:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=<existing project URL>
VITE_SUPABASE_ANON_KEY=<existing public anon/publishable key>
```

Use `https://tentrust-api.onrender.com` as the API base for hosted builds. Configure Preview public values separately if using Vercel previews; the existing provider setup had most frontend values scoped to Production.

Backend settings belong in ignored `backend/.env` and Render secrets. Preserve existing values for Supabase service-role access, provider secrets, tenant-link signing configuration, `ENCRYPTION_KEY`, `HASH_PEPPER` and `VERIFICATION_JOB_SECRET`; replacing encryption/hash material can make older evidence unreadable or matching inconsistent. The broader module also needs its documented configuration before deployment.

Current demo settings:

```dotenv
ENVIRONMENT=demo
MONO_IDENTITY_CHECKS_ENABLED=true
MONO_CREDIT_CHECKS_ENABLED=false
PAYMENT_PROVIDER=paystack
PUBLIC_APP_URL=https://www.tentrust.com.ng
PAYMENT_CALLBACK_URL=https://www.tentrust.com.ng/dashboard?tab=verify-tenant
```

Keep the existing **test** Paystack and Mono secrets server-side. Never put service-role, payment secret, identity-provider secret or encryption material into `VITE_*` variables. Do not assume local Supabase configuration automatically changes hosted SMTP or Edge Function secrets.

Known local tool versions during checks: **Node v24.12.0**, **Python 3.13.3**. Render used its separately managed Python runtime.

Fresh dependency/bootstrap commands (not a fresh-machine acceptance test):

```powershell
npm ci
npm run dev
```

The frontend development server uses port **3000**. In a second terminal:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Development processes are temporary; do not assume an earlier local server is still running.

## Database migration and scheduler state

Recorded hosted setup already applied:

- `202610210001_payment_mode.sql` — test/live/unknown payment mode.
- `202610220001_email_operations.sql` — administrator/email operations groundwork.
- `202610250001_fix_tenant_token_returning.sql` — paid-request tenant-link repair.
- `202610250002_verification_cases.sql` — broader verification schema and private evidence groundwork.
- `supabase/operations/seed_verification_setup.sql` — active server-controlled reviewer membership for the approved existing Auth user.

The corrected verification migration **asserts existing Storage RLS** rather than trying to alter Supabase's managed `storage.objects` table. Private evidence bucket/policy checks were recorded during setup.

These changes were applied through the hosted SQL editor, not a recorded Supabase CLI migration push. **Reconcile actual schema and CLI migration history before running migrations on the existing project.** The generated `artifacts/setup/pending-verification-setup.sql` bundle is no longer pending and has a guard against rerunning it.

Still pending for the broader workflow:

- Populate trusted `verification_property_links` from verified property ownership records.
- Deploy the versioned backend before scheduling its retention endpoint.
- Provision the intended Vault values (`tentrust_api_url`, `tentrust_verification_job_secret`) and run/review `schedule_verification_retention.sql` from the original source. Observe actual deletion processing.
- Follow `EMAIL_OPERATIONS.md` for delivery/event/scheduler setup before enabling email dispatch. No historical welcome backfill was authorized by this handover.

## Checks, known limitations and fixes worth preserving

**Current evidence:** production frontend build and TypeScript checking passed; backend Python syntax passed; the public Sandbox journey and persisted payment/result were observed; the actual PDF was rendered and visually checked. No new unit-test suite was added during the demo release. Older implementation test counts in the history predate later changes and are not a current full-module acceptance run.

Preserve these fixes:

- The tenant-token SQL function returns the complete expected row. Do not regress to the earlier partial-row return that caused payment `409` errors.
- A paid request with a delayed link must be recoverable without charging again.
- Checkout uses the backend catalog, not placeholder `basic`/`complete` marketing IDs and prices.
- Service mode comes from the backend health response, and Sandbox results remain explicitly labelled.
- Identity completion is exclusive to the consent/provider flow; the legacy score endpoint cannot mark an Identity request complete.
- Administrator membership is server-controlled and checks confirmed email, not editable user metadata.
- Credit and connected-bank flows remain disabled for the demo.

Operational notes:

- Render's secret editor appended text during automation. For a replacement, explicitly select all, clear, enter the value, and verify an exact match before saving. Do not append keys or print them in logs/screenshots. Saving environment settings is not proof they are active: deploy and verify the resulting flow.
- Vercel required owner authorization for fork previews; owner merges to main produced the observed production deployments.
- Browser automation may lose its Edge connection or miss file-download events. Preserve any in-progress paid request and check actual artifacts before concluding a payment/export failed.
- The public checkout was corrected to API pricing, but placeholder claims on other marketing/pricing pages still need audit before a live release.
- The broader module's provider-photo availability, BVN session behavior and manual liveness workflow still need coordinated validation. Do not represent that module as deployed just because its files or database tables exist.

## Next work, in order

1. Preserve both source snapshots and this handover before moving chats/computers.
2. Keep the public Sandbox demo stable; use the existing completed example or repeat the documented test flow.
3. Review the original uncommitted v1 frontend/backend together. Confirm required provider capabilities and privacy boundaries before merging it.
4. Reconcile migration history, then deploy a coordinated v1 backend/frontend to a controlled environment and validate its complete flow.
5. Provision ownership mappings and retention scheduling; demonstrate consent revocation and deletion.
6. Complete Brevo/Auth delivery checks, inspect queues and enable sending deliberately.
7. Complete business activation, pricing review and live-payment/live-identity approvals before changing demo mode or provider keys.

## Rollback

Restore frontend and backend together. First revert the demo Blueprint changes in its linked source so auto-sync does not reapply them. The previous observed frontend was `d1fa7b6`; the previous successful Render deployment was `21df79c`. The previous Render Git state is preserved on `codex/pre-demo-render-20261026`.

Restore `ENVIRONMENT=production` and identity checks disabled for the old guarded release, then use the appropriate hosted rollback/deployment controls. Keep payment, consent and audit records. Never erase evidence or ask for another payment to hide a deployment issue.

For the short presenter procedure and deployment settings, see [DEMO.md](DEMO.md). Broader module and email guides remain in the original development folder until their source is reviewed and committed.
