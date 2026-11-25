alter table public.screening_requests drop constraint if exists screening_requests_package_id_check;
alter table public.screening_requests add constraint screening_requests_package_id_check
  check (package_id in ('identity','basic','standard','premium','founding','basic_v2','intermediate_v2','custom_v2'));
alter table public.screening_payments drop constraint if exists screening_payments_package_id_check;
alter table public.screening_payments add constraint screening_payments_package_id_check
  check (package_id in ('identity','basic','standard','premium','founding','basic_v2','intermediate_v2','custom_v2'));

create unique index screening_complete_check_test_payment_active
  on public.screening_payments(screening_id)
  where package_id = 'intermediate_v2' and mode = 'test' and amount_kobo = 400000
    and status in ('pending', 'paid');

create table public.interswitch_lookup_attempts (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.screening_requests(id) on delete cascade,
  check_type text not null check (check_type in ('nin', 'bvn_session', 'bvn_otp', 'bvn_details', 'loan_history')),
  consent_version text not null,
  status text not null default 'started'
    check (status in ('started', 'complete', 'unknown')),
  provider_reference text,
  started_at timestamptz not null default now(),
  unique (screening_id, check_type)
);

alter table public.interswitch_lookup_attempts enable row level security;
revoke all on public.interswitch_lookup_attempts from public, anon, authenticated;
grant select, update (status, provider_reference)
  on public.interswitch_lookup_attempts to service_role;

-- A null result is never permission to call the provider. If a worker stops
-- after claiming a lookup, staff must reconcile the attempt before proceeding.
create function public.claim_interswitch_lookup(p_screening_id uuid, p_check_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_id uuid;
begin
  insert into public.interswitch_lookup_attempts (screening_id, check_type, consent_version)
  select request.id, p_check_type, consent.version
  from public.screening_requests request
  join public.screening_consents consent on consent.screening_id = request.id
  where request.id = p_screening_id
    and request.package_id = 'intermediate_v2'
    and request.payment_status = 'paid'
    and request.status in ('awaiting_tenant', 'incomplete')
    and request.check_status ->> 'identity_provider' = 'interswitch'
    and exists (
      select 1 from public.screening_payments payment
      where payment.screening_id = request.id and payment.status = 'paid' and payment.mode = 'test'
    )
    and consent.method = 'tenant_direct_consent'
    and consent.version = 'complete-check-interswitch-v1'
  on conflict (screening_id, check_type) do nothing
  returning id into attempt_id;
  return attempt_id;
end;
$$;

revoke all on function public.claim_interswitch_lookup(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_interswitch_lookup(uuid, text) to service_role;

create table public.interswitch_sandbox_intakes (
  screening_id uuid primary key references public.screening_requests(id) on delete cascade,
  encrypted_intake text not null,
  state text not null check (state in ('otp_method', 'otp_code', 'awaiting_video', 'submitted', 'needs_review', 'published')),
  video_key text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

alter table public.interswitch_sandbox_intakes enable row level security;
revoke all on public.interswitch_sandbox_intakes from public, anon, authenticated;
grant select, insert, update on public.interswitch_sandbox_intakes to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('complete-check-videos', 'complete-check-videos', false, 5242880, array['video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy complete_check_videos_service_only on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'complete-check-videos')
  with check (bucket_id <> 'complete-check-videos');

create function public.publish_interswitch_sandbox_report(
  p_screening_id uuid, p_staff_id uuid, p_loan_history text, p_video_review text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_loan_history is null or p_loan_history not in ('found', 'no_history')
     or p_video_review is null or p_video_review not in ('reviewed', 'needs_review') then
    return false;
  end if;
  if not exists (select 1 from public.admin_memberships where user_id = p_staff_id and active) then
    return false;
  end if;
  perform 1 from public.screening_requests request
    where request.id = p_screening_id and request.package_id = 'intermediate_v2'
      and request.status = 'incomplete' and request.payment_status = 'paid'
      and request.check_status ->> 'identity_provider' = 'interswitch'
      and exists (select 1 from public.screening_payments payment where payment.screening_id = request.id
        and payment.status = 'paid' and payment.mode = 'test')
    for update;
  if not found then return false; end if;
  update public.interswitch_sandbox_intakes
    set state = 'published', reviewed_at = now(), reviewed_by = p_staff_id
    where screening_id = p_screening_id and state = 'submitted' and video_key is not null;
  if not found then return false; end if;
  update public.screening_requests
    set status = 'complete', completed_at = now(), report_id = gen_random_uuid(),
      check_status = jsonb_build_object('identity_provider', 'interswitch', 'environment', 'sandbox',
        'bvn', 'match', 'nin', 'match', 'loan_history', p_loan_history, 'video_review', p_video_review)
    where id = p_screening_id;
  update public.screening_tenant_tokens set consumed_at = now()
    where screening_id = p_screening_id and consumed_at is null;
  return true;
end;
$$;

revoke all on function public.publish_interswitch_sandbox_report(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.publish_interswitch_sandbox_report(uuid, uuid, text, text) to service_role;
