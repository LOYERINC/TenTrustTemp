create table if not exists public.screening_requests (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users(id) on delete cascade,
  landlord_email text,
  package_id text not null check (package_id in ('basic', 'standard', 'premium', 'founding')),
  intake_mode text not null check (intake_mode in ('direct', 'tenant_link')),
  tenant_name text not null,
  tenant_phone text not null,
  tenant_email text,
  property_id text,
  property_title text not null,
  monthly_rent numeric,
  monthly_income numeric,
  on_time_payments integer,
  total_payments integer,
  income_evidence boolean not null default false,
  rental_reference boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'payment_pending', 'paid_ready', 'awaiting_tenant', 'processing', 'incomplete', 'complete')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'failed')),
  score jsonb,
  check_status jsonb not null default '{}'::jsonb,
  credit_report jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.screening_requests add column if not exists credit_report jsonb;

create table if not exists public.screening_payments (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.screening_requests(id) on delete cascade,
  landlord_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null check (package_id in ('basic', 'standard', 'premium', 'founding')),
  provider text not null default 'paystack' check (provider in ('paystack', 'flutterwave')),
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  authorization_url text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.screening_consents (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.screening_requests(id) on delete cascade,
  landlord_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('landlord_attestation', 'tenant_direct_consent')),
  purpose text not null,
  version text not null,
  collected_at timestamptz not null,
  unique (screening_id, method)
);

create table if not exists public.screening_tenant_tokens (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.screening_requests(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.screening_credits (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users(id) on delete cascade,
  source_payment_id uuid not null unique references public.screening_payments(id) on delete cascade,
  purchased integer not null check (purchased > 0),
  remaining integer not null check (remaining >= 0 and remaining <= purchased),
  created_at timestamptz not null default now()
);

create table if not exists public.screening_credit_uses (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users(id) on delete cascade,
  screening_id uuid not null unique references public.screening_requests(id) on delete cascade,
  credit_id uuid not null references public.screening_credits(id),
  created_at timestamptz not null default now()
);

create index if not exists screening_requests_landlord_created_idx on public.screening_requests (landlord_id, created_at desc);
create index if not exists screening_payments_screening_idx on public.screening_payments (screening_id, created_at desc);
create index if not exists screening_tokens_screening_idx on public.screening_tenant_tokens (screening_id);

alter table public.screening_requests enable row level security;
alter table public.screening_payments enable row level security;
alter table public.screening_consents enable row level security;
alter table public.screening_tenant_tokens enable row level security;
alter table public.screening_credits enable row level security;
alter table public.screening_credit_uses enable row level security;

create policy "Landlords read their screenings" on public.screening_requests
  for select to authenticated using (landlord_id = auth.uid());
create policy "Landlords read their payments" on public.screening_payments
  for select to authenticated using (landlord_id = auth.uid());
create policy "Landlords read their consent records" on public.screening_consents
  for select to authenticated using (landlord_id = auth.uid());
create policy "Landlords read their screening credits" on public.screening_credits
  for select to authenticated using (landlord_id = auth.uid());
create policy "Landlords read their credit uses" on public.screening_credit_uses
  for select to authenticated using (landlord_id = auth.uid());

revoke all on public.screening_requests, public.screening_payments, public.screening_consents,
  public.screening_tenant_tokens, public.screening_credits, public.screening_credit_uses
  from anon, authenticated;
grant select on public.screening_requests, public.screening_payments, public.screening_consents,
  public.screening_credits, public.screening_credit_uses to authenticated;
grant all on public.screening_requests, public.screening_payments, public.screening_consents,
  public.screening_tenant_tokens, public.screening_credits, public.screening_credit_uses to service_role;

create or replace function public.fulfill_screening_payment(p_reference text, p_amount_kobo bigint, p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.screening_payments%rowtype;
  request_row public.screening_requests%rowtype;
begin
  select * into payment_row from public.screening_payments where reference = p_reference for update;
  if not found then raise exception 'payment reference not found'; end if;
  if payment_row.amount_kobo <> p_amount_kobo or payment_row.currency <> p_currency then
    raise exception 'payment amount or currency mismatch';
  end if;
  select * into request_row from public.screening_requests where id = payment_row.screening_id for update;
  if payment_row.package_id <> request_row.package_id then
    raise exception 'payment package does not match screening';
  end if;

  if payment_row.status <> 'paid' then
    update public.screening_payments set status = 'paid', verified_at = now() where id = payment_row.id;
    -- A late second checkout may settle after a retry has already paid this screening.
    -- Record the settlement, but never issue another bundle or reset a completed check.
    if request_row.payment_status = 'paid' then
      return jsonb_build_object('fulfilled', false, 'duplicate_payment', true, 'screening_id', request_row.id);
    end if;
    update public.screening_requests
      set payment_status = 'paid',
          status = case when intake_mode = 'tenant_link' then 'awaiting_tenant' else 'paid_ready' end
      where id = request_row.id;
    if request_row.package_id = 'founding' then
      insert into public.screening_credits (landlord_id, source_payment_id, purchased, remaining)
      values (payment_row.landlord_id, payment_row.id, 3, 2)
      on conflict (source_payment_id) do nothing;
    end if;
  end if;
  return jsonb_build_object('fulfilled', true, 'screening_id', request_row.id);
end;
$$;

revoke all on function public.fulfill_screening_payment(text, bigint, text) from public, anon, authenticated;
grant execute on function public.fulfill_screening_payment(text, bigint, text) to service_role;

create or replace function public.consume_screening_credit(p_landlord_id uuid, p_screening_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credit_row public.screening_credits%rowtype;
  request_row public.screening_requests%rowtype;
begin
  select * into request_row from public.screening_requests where id = p_screening_id and landlord_id = p_landlord_id for update;
  if not found then raise exception 'screening not found'; end if;
  if request_row.package_id <> 'premium' then raise exception 'credits may only be used for Premium checks'; end if;
  select * into credit_row from public.screening_credits
    where landlord_id = p_landlord_id and remaining > 0
    order by created_at asc limit 1 for update skip locked;
  if not found then raise exception 'no Premium credits available'; end if;
  update public.screening_credits set remaining = remaining - 1 where id = credit_row.id;
  insert into public.screening_credit_uses (landlord_id, screening_id, credit_id)
    values (p_landlord_id, p_screening_id, credit_row.id);
  update public.screening_requests
    set payment_status = 'paid',
        status = case when intake_mode = 'tenant_link' then 'awaiting_tenant' else 'paid_ready' end
    where id = p_screening_id;
  return jsonb_build_object('fulfilled', true, 'screening_id', p_screening_id);
end;
$$;

revoke all on function public.consume_screening_credit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_screening_credit(uuid, uuid) to service_role;
