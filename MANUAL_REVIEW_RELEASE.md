# Manual Basic review while Mono is under approval

The user confirmed Mono is under review and requested private tenant intake for manual admin review. Basic NGN1500 is a manual service, not automated BVN/NIN validation. Intermediate bureau credit remains unavailable; Custom is quote-only.

A landlord must acknowledge the manual service before creating a purchase. Each new Basic case snapshots manual_review as its identity method, so later provider-mode changes do not silently change an existing tenant's consent. Tenants enter full name, BVN, NIN and DOB privately, then upload the existing challenge video. No Mono call is made. Submission is pending_review, never identity verified.

ID fields are AES-256-GCM encrypted with case-bound associated data in the existing private service-role-only evidence table. The admin explicitly opens the details through an authenticated, confirmed-staff endpoint that records an audit action and returns no-store. Tenant ID numbers and private staff notes never enter landlord responses or PDFs.

Staff choose an explicit manual outcome and provide private notes before completing the review. Reports say manual_reviewed / needs_review and manual_review, never provider verified. Manual reports and the public pricing/banner explain that no automated ID or bureau check was performed.

Migration 202610300001_manual_identity_intake.sql adds three nullable encrypted-intake fields. It was applied by the user to the existing project and independently verified with a zero-row column query. Existing RLS/grants are preserved. Checkout also checks encryption and schema readiness before reserving an order or initializing Paystack.

Keep the existing ENCRYPTION_KEY stable: base64-encoded 32 bytes. Do not rotate it without migrating old ciphertext. No new secret value is committed.

Rollout: merge this PR to deploy the frontend. The user should save the pending existing live Paystack key into Render under the current disabled/demo configuration first; no Mono live key is needed for manual review. Verify payment_mode=live, then fast-forward the Render source branches to this release. Its Blueprint enables production/manual Basic and keeps both Mono identity and credit provider flags false.

Expected public state after rollout: environment production, payment_mode live, identity_mode manual, manual_review_storage_ready true; Basic1500 enabled, Intermediate3000 disabled, Custom quoted. A human must perform the live payment rehearsal and all actual tenant review decisions. No real charge or tenant eligibility decision was performed by the agent.

Old Mono cases retain their original provider/consent path. New manual cases remain manual after a later switch back to Mono. No automatic upgrade of an old test report into a production verification is performed.
