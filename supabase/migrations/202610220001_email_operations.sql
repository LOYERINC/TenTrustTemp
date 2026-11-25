-- Durable transactional notifications. Sending starts disabled; backfill is explicit.
create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.email_runtime (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.email_runtime(id) values(true);
create table public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null check (kind in ('waitlist_welcome','report_ready')),
  source_id uuid not null,
  recipient text not null,
  recipient_name text not null default '',
  template_version integer not null default 1,
  state text not null default 'queued' check (state in ('queued','sending','sent','delivered','failed','unknown','suppressed')),
  attempts integer not null default 0,
  retries_remaining integer not null default 5,
  due_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  provider_message_id text unique,
  last_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
create index email_jobs_due_idx on public.email_jobs(due_at) where state = 'queued';
create table public.email_attempts (
  id uuid primary key,
  job_id uuid not null references public.email_jobs(id),
  attempt_number integer not null,
  state text not null default 'sending',
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(job_id, attempt_number)
);
create table public.email_events (
  event_key text primary key,
  provider_message_id text not null,
  job_id uuid references public.email_jobs(id),
  kind text not null check (kind in ('app','auth_confirmation','auth_recovery','auth_magic_link','unclassified')),
  recipient text not null,
  event text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index email_events_message_idx on public.email_events(provider_message_id);
create table public.email_suppressions (
  recipient text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_id uuid not null,
  reason text not null,
  result text not null,
  created_at timestamptz not null default now()
);

alter table public.screening_payments add column if not exists mode text not null default 'unknown'
  check (mode in ('test','live','unknown'));

-- Public inserts can trigger jobs without receiving privileges on the queue.
create function public.enqueue_transactional_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'waitlist' then
    insert into public.email_jobs(event_key,kind,source_id,recipient,recipient_name)
    values('waitlist:'||new.id,'waitlist_welcome',new.id,lower(new.email),new.name)
    on conflict(event_key) do nothing;
  elsif new.status = 'complete' and old.status is distinct from 'complete'
    and nullif(btrim(new.landlord_email),'') is not null then
    insert into public.email_jobs(event_key,kind,source_id,recipient,recipient_name)
    values('report:'||new.id,'report_ready',new.id,lower(new.landlord_email),coalesce(new.landlord_name,''))
    on conflict(event_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger waitlist_email after insert on public.waitlist
for each row execute function public.enqueue_transactional_email();
create trigger report_ready_email after update of status on public.screening_requests
for each row execute function public.enqueue_transactional_email();

-- This is deliberately not called by the migration. Release after smoke tests.
create function public.backfill_waitlist_emails() returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  insert into public.email_jobs(event_key,kind,source_id,recipient,recipient_name)
  select 'waitlist:'||id,'waitlist_welcome',id,lower(email),name from public.waitlist
  on conflict(event_key) do nothing;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function public.claim_email_jobs() returns setof public.email_jobs
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.email_runtime where id and enabled) then return; end if;
  -- A dead worker may have submitted the message: never send it again blindly.
  update public.email_attempts set state='unknown',error_code='lease_expired',finished_at=now()
  where id in (select lease_token from public.email_jobs where state='sending' and lease_until<now());
  update public.email_jobs set state='unknown',last_error_code='lease_expired',lease_until=null
  where state='sending' and lease_until<now();
  update public.email_jobs j set state='suppressed',last_error_code='recipient_suppressed'
  where j.state='queued' and exists(select 1 from public.email_suppressions s where s.recipient=lower(j.recipient));
  return query
  with candidates as (
    select id from public.email_jobs where state='queued' and due_at<=now() and retries_remaining>0
    order by due_at,id for update skip locked limit 20
  ), claimed as (
    update public.email_jobs j set state='sending',attempts=attempts+1,retries_remaining=retries_remaining-1,
      lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    from candidates c where j.id=c.id returning j.*
  ), attempts_created as (
    insert into public.email_attempts(id,job_id,attempt_number)
    select lease_token,id,attempts from claimed returning id
  ) select c.* from claimed c join attempts_created a on a.id=c.lease_token;
end;
$$;

create function public.finish_email_attempt(p_job uuid,p_lease uuid,p_state text,
  p_message_id text default null,p_error text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare j public.email_jobs%rowtype; next_state text;
begin
  select * into j from public.email_jobs where id=p_job for update;
  if not found or j.lease_token is distinct from p_lease or j.state not in ('sending','sent','delivered','suppressed','failed') then return false; end if;
  if p_state not in ('sent','queued','failed','unknown') then raise exception 'Invalid result'; end if;
  next_state := case when p_state='queued' and j.retries_remaining<=0 then 'failed' else p_state end;
  -- A webhook can win the race with the HTTP response. Never regress delivery.
  if j.state <> 'sending' then next_state := j.state; end if;
  update public.email_jobs set state=next_state,
    provider_message_id=coalesce(nullif(trim(both '<>' from p_message_id),''),provider_message_id),
    last_error_code=p_error,lease_until=null,
    sent_at=case when p_state='sent' then coalesce(sent_at,now()) else sent_at end,
    due_at=case when next_state='queued' then now()+make_interval(mins=>case j.retries_remaining when 4 then 1 when 3 then 5 when 2 then 15 else 60 end) else due_at end
  where id=p_job;
  update public.email_attempts set state=p_state,error_code=p_error,finished_at=now() where id=p_lease;
  return true;
end;
$$;

create function public.record_email_event(p_event_key text,p_message_id text,p_job uuid,
  p_kind text,p_recipient text,p_event text,p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.email_jobs%rowtype; matched_id uuid; affected integer;
begin
  select * into j from public.email_jobs where lower(recipient)=lower(p_recipient)
    and (provider_message_id=trim(both '<>' from p_message_id) or id=p_job) for update;
  if found then matched_id:=j.id; end if;
  if matched_id is null and p_kind='unclassified' then return; end if;
  insert into public.email_events(event_key,provider_message_id,job_id,kind,recipient,event,occurred_at)
  values(p_event_key,trim(both '<>' from p_message_id),matched_id,
    case when matched_id is not null then 'app' else p_kind end,lower(p_recipient),p_event,p_at)
  on conflict(event_key) do nothing;
  get diagnostics affected = row_count;
  if affected=0 then return; end if;
  if p_event in ('hard_bounce','spam','blocked','invalid','unsubscribed') then
    insert into public.email_suppressions(recipient,reason) values(lower(p_recipient),p_event)
    on conflict(recipient) do nothing;
    update public.email_jobs set state='suppressed',last_error_code=p_event
    where lower(recipient)=lower(p_recipient) and state='queued';
  end if;
  if matched_id is not null then
    update public.email_jobs set
      provider_message_id=coalesce(provider_message_id,trim(both '<>' from p_message_id)),
      state=case when state='delivered' then state
        when p_event='delivered' then 'delivered'
        when p_event in ('hard_bounce','spam','blocked','invalid','unsubscribed') then 'suppressed'
        when state='suppressed' then state
        when p_event in ('error','soft_bounce') then 'failed'
        when p_event='sent' and state<>'failed' then 'sent'
        else state end,
      delivered_at=case when p_event='delivered' then coalesce(delivered_at,p_at) else delivered_at end,
      last_error_code=case when p_event in ('error','soft_bounce','hard_bounce','spam','blocked','invalid','unsubscribed') then 'provider_'||p_event else last_error_code end
    where id=matched_id;
  end if;
end;
$$;

create function public.retry_email_job(p_actor uuid,p_job uuid,p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare j public.email_jobs%rowtype; eligible boolean;
begin
  if not exists(select 1 from public.admin_memberships m join auth.users u on u.id=m.user_id
    where m.user_id=p_actor and m.active and u.email_confirmed_at is not null) then raise exception 'Forbidden'; end if;
  if char_length(btrim(p_reason)) not between 5 and 300 then raise exception 'A reason is required'; end if;
  select * into j from public.email_jobs where id=p_job for update;
  eligible := found and j.state='failed' and j.last_error_code in ('rate_limited','configuration_error','provider_rejected')
    and not exists(select 1 from public.email_suppressions where recipient=lower(j.recipient));
  if eligible then
    update public.email_jobs set state='queued',retries_remaining=5,due_at=now(),last_error_code=null where id=p_job;
  end if;
  insert into public.admin_audit_log(actor_id,action,target_id,reason,result)
  values(p_actor,'retry_email',p_job,btrim(p_reason),case when eligible then 'queued' else 'rejected' end);
  return coalesce(eligible,false);
end;
$$;

create view public.admin_users as
select u.id,u.email,coalesce(u.raw_user_meta_data->>'first_name','') as first_name,
  coalesce(u.raw_user_meta_data->>'last_name','') as last_name,
  case when u.raw_user_meta_data->>'role'='tenant' then 'tenant' else 'landlord' end as role,
  u.created_at,u.last_sign_in_at,u.email_confirmed_at,
  case when u.email_confirmed_at is not null then 'confirmed' else 'unconfirmed' end as status
from auth.users u;

create view public.admin_email_activity as
select id::text,kind,recipient,state,attempts,last_error_code,created_at,sent_at,delivered_at,
  (state='failed' and last_error_code in ('rate_limited','configuration_error','provider_rejected')
   and not exists(select 1 from public.email_suppressions s where s.recipient=lower(j.recipient))) as retryable,
  'app'::text as source
from public.email_jobs j
union all
select 'auth:'||e.provider_message_id,e.kind,e.recipient,
  case when bool_or(e.event='delivered') then 'delivered'
    when bool_or(e.event in ('hard_bounce','spam','blocked','invalid','unsubscribed')) then 'suppressed'
    when bool_or(e.event in ('error','soft_bounce')) then 'failed'
    when bool_or(e.event='sent') then 'sent' else 'unknown' end,
  0,null,min(e.created_at),min(e.occurred_at) filter(where e.event='sent'),
  min(e.occurred_at) filter(where e.event='delivered'),false,'auth'
from public.email_events e where e.job_id is null
group by e.provider_message_id,e.kind,e.recipient;

create function public.admin_overview() returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'users',(select count(*) from auth.users),
  'confirmed_users',(select count(*) from auth.users where email_confirmed_at is not null),
  'waitlist',(select count(*) from public.waitlist),
  'waitlist_today',(select count(*) from public.waitlist where submitted_at>=now()-interval '24 hours'),
  'screenings_complete',(select count(*) from public.screening_requests where status='complete'),
  'screenings_pending',(select count(*) from public.screening_requests where status not in ('complete','declined','expired')),
  'paid_live_kobo',(select coalesce(sum(amount_kobo),0) from public.screening_payments where status='paid' and verified_at is not null and mode='live'),
  'paid_test_kobo',(select coalesce(sum(amount_kobo),0) from public.screening_payments where status='paid' and verified_at is not null and mode='test'),
  'payments_unknown_mode',(select count(*) from public.screening_payments where mode='unknown'),
  'email_queued',(select count(*) from public.email_jobs where state='queued'),
  'email_unknown',(select count(*) from public.email_jobs where state='unknown'),
  'suppressed_recipients',(select count(*) from public.email_suppressions),
  'email_failed',(select count(*) from public.admin_email_activity where state in ('failed','suppressed')),
  'email_enabled',(select enabled from public.email_runtime where id),
  'email_oldest_due',(select min(due_at) from public.email_jobs where state='queued')
);
$$;

-- Views and privileged functions are exposed only through authenticated backend code.
do $$
declare t text; f record;
begin
  foreach t in array array['admin_memberships','email_runtime','email_jobs','email_attempts','email_events','email_suppressions','admin_audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('enqueue_transactional_email','backfill_waitlist_emails',
      'claim_email_jobs','finish_email_attempt','record_email_event','retry_email_job','admin_overview') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;
revoke all on public.admin_users,public.admin_email_activity from public,anon,authenticated;
grant select on public.admin_users,public.admin_email_activity to service_role;
