begin;
-- The table already has RLS and service-role-only grants. Never expose these fields in landlord selects.
alter table public.screening_private_evidence
  add column if not exists identity_intake_encrypted text,
  add column if not exists identity_intake_at timestamptz,
  add column if not exists identity_review_encrypted text;
notify pgrst, 'reload schema';
commit;
