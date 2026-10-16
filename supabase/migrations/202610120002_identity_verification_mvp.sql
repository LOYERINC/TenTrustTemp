alter table public.screening_requests
  drop constraint if exists screening_requests_package_id_check,
  drop constraint if exists screening_requests_status_check,
  add constraint screening_requests_package_id_check check (package_id in ('identity', 'basic', 'standard', 'premium', 'founding')),
  add constraint screening_requests_status_check check (status in ('draft', 'payment_pending', 'paid_ready', 'awaiting_tenant', 'processing', 'incomplete', 'complete', 'declined', 'expired'));

alter table public.screening_payments
  drop constraint if exists screening_payments_package_id_check,
  add constraint screening_payments_package_id_check check (package_id in ('identity', 'basic', 'standard', 'premium', 'founding'));

alter table public.screening_requests
  add column if not exists landlord_name text,
  add column if not exists name_match text check (name_match in ('match', 'partial', 'mismatch')),
  add column if not exists masked_document text,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists report_id uuid unique;

alter table public.screening_tenant_tokens
  add column if not exists claimed_at timestamptz;

alter table public.screening_consents
  add column if not exists consented_as text;

create or replace function public.claim_identity_tenant_token(p_token_hash text)
returns table (screening_id uuid, token_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare token_row public.screening_tenant_tokens%rowtype;
begin
  select * into token_row from public.screening_tenant_tokens
    where token_hash = p_token_hash and invalidated_at is null
    for update;
  if not found or token_row.consumed_at is not null or token_row.claimed_at is not null or token_row.expires_at <= now() then
    return;
  end if;
  update public.screening_tenant_tokens set claimed_at = now() where id = token_row.id;
  return query select token_row.screening_id, token_row.id;
end;
$$;

revoke all on function public.claim_identity_tenant_token(text) from public, anon, authenticated;
grant execute on function public.claim_identity_tenant_token(text) to service_role;
