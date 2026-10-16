alter table public.screening_payments
  add column if not exists provider text not null default 'paystack';

alter table public.screening_payments
  drop constraint if exists screening_payments_provider_check;

alter table public.screening_payments
  add constraint screening_payments_provider_check
  check (provider in ('paystack', 'flutterwave'));
