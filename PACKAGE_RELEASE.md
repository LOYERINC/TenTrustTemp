# Basic and Intermediate release

Public package catalog: Basic NGN 1500, Intermediate NGN 3000, Custom quoted. Existing payment snapshots and historical identity links are retained. The resilient Paystack release from PR #12 is preserved.

Tenant steps: private consent, BVN/NIN check, manual liveness-video review, Intermediate credit lookup, and private three-month PDF statements only when monthly rent is strictly above NGN 500000. Staff review is required before the final landlord report; private evidence is excluded from landlord responses and PDFs. Custom quotes are stored for staff follow-up. No automated biometric face matching or AI affordability decision is claimed.

Migration 202610280001_private_screening_packages.sql is already applied to the existing project. Do not rerun all migrations.

Checkout remains gated by SCREENING_V2_ENABLED (default false), provider readiness and approved prices. Live Paystack charges require live Mono credentials; test-provider results cannot be sold as live checks. Intermediate also requires enabled credit checks and operational staff review. The already-entered live Render key must not be saved into the old demo configuration as a substitute for these launch gates.

Blueprint ENVIRONMENT remains demo and SCREENING_PRICES_CONFIRMED remains false during this code rollout. SCREENING_V2_ENABLED is explicitly false. Live key, live Mono account permissions and launch settings must be coordinated after deployment. No real charge is performed by this release.

Health exposes non-secret mono_mode and screening_v2_enabled readiness indicators. Reports use the recorded identity-provider environment rather than assuming that a live payment means live identity data.

The release includes the previously requested navigation, plain-language copy and card/report presentation needed by the current package screens. Payment references, secrets, tenant links and documents are excluded.
