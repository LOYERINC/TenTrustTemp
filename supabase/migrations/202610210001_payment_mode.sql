-- Checkout records the credential mode independently of email operations.
alter table public.screening_payments
  add column if not exists mode text not null default 'unknown'
  check (mode in ('test', 'live', 'unknown'));

notify pgrst, 'reload schema';
