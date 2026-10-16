# TenTrust browser walkthrough — 13 October 2026

Used the user-provided landlord account through the normal sign-in form. Credentials are not retained in this report.

## Completed

- Started frontend at http://localhost:3000; backend health at http://127.0.0.1:8000/api/health reported healthy/development.
- Fixed local frontend API setting from unused port 8001 to running backend port 8000.
- Signed in successfully and loaded 13 existing requests.
- Created one synthetic request named TenTrust QA Test, property label QA walkthrough 13 Oct — synthetic data.
- Confirmed configured Paystack key is test mode and checkout visibly displayed TEST. Selected its built-in Success scenario and completed simulated payment.
- Reproduced a failed automatic handoff despite HTTP 200 payment verification. The verification request took 35,223.8 ms.
- Fixed shared-response consumption: every concurrent verification listener now gets a clone of the unconsumed response.
- Removed the dashboard refresh wait before displaying the ready tenant link.
- Retested the same paid callback: both listeners read HTTP 200 and the share modal appeared automatically, including explanation, steps, and link. The request still took 56,906.1 ms; latency target remains unmet.
- Opened the generated link, exercised consent for the synthetic tenant, and reached the identity form.
- Confirmed configured Mono key is test mode. Submitted the sample BVN and date of birth from Mono's Mashup documentation. The tenant UI returned “Those details could not be verified. Check them and try again.” It cleared the document number.
- TypeScript check passed. A focused concurrent Response-cloning check passed.
- Read-only Supabase REST probes selecting zero records took 595 ms and 176 ms. These do not explain the full endpoint latency or measure all database queries.

## Remaining issues

1. Mono integration contract: backend/services/mono_service.py sends either BVN or NIN and date_of_birth to /v3/lookup/mashup. Official documentation says BVN, NIN, and date_of_birth are all required. This is a likely cause of failure; the provider error body was not inspected, so it is not confirmed as the sole cause.
2. Payment verification still takes tens of seconds. Full server timing breakdown is needed; two measured browser requests were 35.2 s and 56.9 s.
3. Successful tenant verification/result generation has not been demonstrated in this walkthrough.
4. PDF download remains unverified because browser permission was previously denied. It was not retried through another method.
5. No Lighthouse mobile/throttled performance pass was completed in this walkthrough.

## Screenshots

- payment-share-link.jpg
- tenant-consent.jpg
- tenant-verification-error.jpg

## Provider references

- https://docs.mono.co/docs/lookup/mashup
- https://docs.mono.co/docs/sandbox

The synthetic request remains in the landlord dashboard for review. The site is not yet confirmed test-ready.
