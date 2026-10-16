alter table public.screening_requests
  add column if not exists credit_report jsonb;
