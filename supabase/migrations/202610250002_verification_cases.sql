-- All access is through the authenticated API. No source table is exposed to landlords.
create table public.verification_property_links (
  property_id uuid primary key, landlord_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.verification_cases (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references auth.users(id),
  tenant_first_name text not null, landlord_id uuid references auth.users(id), property_id uuid,
  status text not null default 'draft' check(status in ('draft','consent_given','in_progress','needs_review','completed','expired')),
  overall_result text not null default 'pending' check(overall_result in ('pass','review','fail','pending')),
  score integer check(score between 0 and 100), monthly_rent_kobo bigint check(monthly_rent_kobo>0),
  summary jsonb not null default '{}', completed_at timestamptz, expires_at timestamptz not null,
  reviewed_by uuid references auth.users(id), review_notes_encrypted text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((landlord_id is null) = (property_id is null))
);
create table public.consents (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  subject_type text not null check(subject_type in ('tenant','guarantor')), subject_id uuid not null references auth.users(id),
  purposes jsonb not null check(jsonb_typeof(purposes)='array'), policy_version text not null,
  ip_address text, user_agent text, granted_at timestamptz not null default now(), revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(case_id,subject_type,subject_id)
);
create table public.identity_records (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  subject_type text not null check(subject_type in ('tenant','guarantor')), subject_id uuid not null references auth.users(id),
  bvn_encrypted text, bvn_hash text, nin_encrypted text, nin_hash text,
  bvn_verified boolean not null default false, nin_verified boolean not null default false,
  full_name_bvn text, full_name_nin text, dob_bvn text, dob_nin text, phone_bvn text, phone_nin text,
  name_match_score numeric, dob_match boolean, phone_match boolean, duplicate_identity boolean not null default false,
  raw_response_encrypted text, nin_raw_response_encrypted text, reference_photo_encrypted text,
  bvn_session_encrypted text, session_expires_at timestamptz, allowed_methods jsonb not null default '[]',
  status text not null default 'pending' check(status in ('pending','verified','review','failed')),
  verified_at timestamptz, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(case_id,subject_type,subject_id)
);
create index identity_bvn_hash_idx on public.identity_records(bvn_hash) where bvn_hash is not null;
create index identity_nin_hash_idx on public.identity_records(nin_hash) where nin_hash is not null;
create table public.liveness_checks (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  subject_type text not null check(subject_type in ('tenant','guarantor')), subject_id uuid not null references auth.users(id),
  selfie_storage_key text, reference_photo_source text not null default 'nin' check(reference_photo_source='nin'),
  provider text not null, status text not null default 'pending' check(status in ('pending','passed','failed','manual_review')),
  match_score numeric check(match_score between 0 and 1), reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  review_notes_encrypted text, attempt integer not null check(attempt between 1 and 3),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(case_id,subject_type,subject_id,attempt)
);
create table public.employment_records (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  subject_type text not null check(subject_type in ('tenant','guarantor')), subject_id uuid not null references auth.users(id),
  employer_name text, job_title text, employment_type text not null check(employment_type in ('employed','self_employed')),
  monthly_income_kobo bigint check(monthly_income_kobo>0), document_storage_key text, cac_number text,
  verification_status text not null default 'unverified' check(verification_status in ('unverified','pending','verified','failed')),
  verified_by uuid references auth.users(id), verification_method text check(verification_method in ('hr_call','hr_email','document','other')),
  verification_notes text, verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(case_id,subject_type,subject_id)
);
create table public.affordability_checks (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  subject_type text not null check(subject_type in ('tenant','guarantor')), subject_id uuid not null references auth.users(id),
  monthly_rent_kobo bigint check(monthly_rent_kobo>0), monthly_income_kobo bigint check(monthly_income_kobo>0),
  ratio numeric, result text not null check(result in ('pass','review','fail')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(case_id,subject_type,subject_id)
);
create table public.address_records (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  address_text text, proof_type text not null check(proof_type in ('utility_bill','tenancy_agreement','other')),
  proof_storage_key text, verification_status text not null default 'pending' check(verification_status in ('pending','verified','failed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public."references" (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  type text not null check(type in ('previous_landlord','personal','professional')), name text, phone text, email text,
  status text not null default 'pending' check(status in ('pending','contacted','responded','failed')),
  paid_on_time boolean, property_condition text check(property_condition in ('good','fair','poor')), would_rent_again boolean,
  notes text, responded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.guarantors (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  user_id uuid references auth.users(id), full_name text, phone text, email text, relationship text,
  status text not null default 'invited' check(status in ('invited','accepted','revoked')),
  invitation_hash text unique, invitation_expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(case_id)
);
create table public.verification_events (
  id uuid primary key default gen_random_uuid(), case_id uuid references public.verification_cases(id),
  actor_type text not null check(actor_type in ('tenant','landlord','admin','system','guarantor')), actor_id uuid,
  event_type text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.credit_checks (
  id uuid primary key default gen_random_uuid(), case_id uuid not null unique references public.verification_cases(id),
  status text not null default 'not_available' check(status='not_available'), provider text, result jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.verification_disputes (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  subject_id uuid not null references auth.users(id), reason_encrypted text, status text not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.verification_purge_queue (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.verification_cases(id),
  storage_key text not null unique, created_at timestamptz not null default now()
);
create table public.verification_webhook_events (
  id uuid primary key default gen_random_uuid(), event_hash text not null unique,
  event_type text not null, raw_response_encrypted text, expires_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.verification_rate_limits (
  key text primary key, window_start timestamptz not null, count integer not null
);

-- Source tables are service-only. Tenant/reviewer authorization is rechecked by the API.
do $$ declare name text; begin
  foreach name in array array['verification_property_links','verification_cases','consents','identity_records',
    'liveness_checks','employment_records','affordability_checks','address_records','references','guarantors',
    'verification_events','credit_checks','verification_disputes','verification_purge_queue',
    'verification_webhook_events','verification_rate_limits'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant all on public.%I to service_role',name);
  end loop;
end $$;

create function public.verification_touch() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
do $$ declare name text; begin
  foreach name in array array['verification_cases','consents','identity_records','liveness_checks','employment_records',
    'affordability_checks','address_records','references','guarantors','credit_checks','verification_disputes'] loop
    execute format('create trigger touch before update on public.%I for each row execute function public.verification_touch()',name);
  end loop;
end $$;
create function public.verification_immutable_event() returns trigger language plpgsql as $$
begin raise exception 'verification audit events are append-only'; end $$;
create trigger immutable before update or delete on public.verification_events
for each row execute function public.verification_immutable_event();

create function public.verification_rate_limit(p_key text,p_limit integer,p_window integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare hits integer; begin
  insert into verification_rate_limits(key,window_start,count) values(p_key,now(),1)
  on conflict(key) do update set
    count=case when verification_rate_limits.window_start<now()-make_interval(secs=>p_window) then 1 else verification_rate_limits.count+1 end,
    window_start=case when verification_rate_limits.window_start<now()-make_interval(secs=>p_window) then now() else verification_rate_limits.window_start end
  returning count into hits;
  return hits<=p_limit;
end $$;

create function public.verification_audit(p_case uuid,p_actor uuid,p_role text,p_event text,p_metadata jsonb default '{}') returns void
language sql security definer set search_path=public as $$
insert into verification_events(case_id,actor_id,actor_type,event_type,metadata) values(p_case,p_actor,p_role,p_event,p_metadata);
$$;

-- Every evidence mutation locks the case, rechecks consent/expiry, and writes its audit entry atomically.
create function public.verification_write(p_case uuid,p_table text,p_payload jsonb,p_actor uuid,p_role text,p_event text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c verification_cases%rowtype; outrow jsonb; rowid uuid; sid uuid; st text; cols text; purpose text; begin
  select * into c from verification_cases where id=p_case for update;
  if not found or c.status='expired' or c.expires_at<=now() then raise exception 'case unavailable'; end if;
  if p_table not in ('identity_records','liveness_checks','employment_records','affordability_checks','address_records',
    'references','guarantors','verification_disputes','credit_checks') then raise exception 'invalid verification resource'; end if;
  if p_role<>'admin' then
    sid=coalesce((p_payload->>'subject_id')::uuid,p_actor); st=coalesce(p_payload->>'subject_type','tenant');
    purpose=case p_table when 'identity_records' then 'identity' when 'liveness_checks' then 'liveness'
      when 'employment_records' then 'employment' when 'affordability_checks' then 'employment'
      when 'address_records' then 'address' when 'references' then 'references' when 'guarantors' then 'guarantor' else null end;
    if sid<>p_actor or not exists(select 1 from consents where case_id=p_case and subject_id=p_actor
      and subject_type=st and revoked_at is null and (purpose is null or purposes ? purpose)) then raise exception 'consent required'; end if;
    if c.status not in ('consent_given','in_progress','needs_review') and p_table<>'verification_disputes' then raise exception 'case not editable'; end if;
  end if;
  p_payload=p_payload||jsonb_build_object('case_id',p_case,'updated_at',now());
  rowid=(p_payload->>'id')::uuid;
  if rowid is null then
    p_payload=p_payload||jsonb_build_object('id',gen_random_uuid(),'created_at',now());
    select string_agg(quote_ident(key),',') into cols from jsonb_object_keys(p_payload) key;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(%I.*)',p_table,cols,cols,p_table,p_table)
      using p_payload into outrow;
  else
    -- Only keys in the service DTO are updated; server-side roles cannot choose arbitrary tables.
    execute format('select to_jsonb(t) from public.%I t where id=$1 and case_id=$2',p_table) using rowid,p_case into outrow;
    if outrow is null then raise exception 'resource not found'; end if;
    p_payload=outrow||p_payload;
    execute format('update public.%I t set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1)) where id=$2 and case_id=$3 returning to_jsonb(t.*)',
      p_table,
      (select string_agg(quote_ident(attname),',') from pg_attribute where attrelid=format('public.%I',p_table)::regclass and attnum>0 and not attisdropped),
      (select string_agg(quote_ident(attname),',') from pg_attribute where attrelid=format('public.%I',p_table)::regclass and attnum>0 and not attisdropped),p_table)
      using p_payload,rowid,p_case into outrow;
  end if;
  insert into verification_events(case_id,actor_id,actor_type,event_type) values(p_case,p_actor,p_role,p_event);
  if c.status='consent_given' then update verification_cases set status='in_progress' where id=p_case; end if;
  if p_table='verification_disputes' then
    update verification_cases set status='needs_review',overall_result='review',reviewed_by=null,completed_at=null where id=p_case;
  end if;
  return outrow;
end $$;

create function public.verification_create(p_tenant uuid,p_first_name text,p_landlord uuid,p_property uuid,p_rent bigint,p_days integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c verification_cases%rowtype; begin
  if p_days not between 1 and 365 or p_rent<=0 then raise exception 'invalid case configuration'; end if;
  if p_landlord is not null and not exists(select 1 from verification_property_links where property_id=p_property and landlord_id=p_landlord) then raise exception 'property is not linked to landlord'; end if;
  insert into verification_cases(tenant_id,tenant_first_name,landlord_id,property_id,monthly_rent_kobo,expires_at)
  values(p_tenant,p_first_name,p_landlord,p_property,p_rent,now()+make_interval(days=>p_days)) returning * into c;
  insert into credit_checks(case_id) values(c.id);
  perform verification_audit(c.id,p_tenant,'tenant','case_created');
  return to_jsonb(c);
end $$;

create function public.verification_consent(p_case uuid,p_actor uuid,p_type text,p_purposes jsonb,p_policy text,p_ip text,p_agent text)
returns void language plpgsql security definer set search_path=public as $$
declare c verification_cases%rowtype; begin
  select * into c from verification_cases where id=p_case for update;
  if not found or c.status='expired' or c.expires_at<=now() then raise exception 'case unavailable'; end if;
  if not ((p_type='tenant' and c.tenant_id=p_actor) or (p_type='guarantor' and exists(select 1 from guarantors where case_id=p_case and user_id=p_actor and status='accepted'))) then raise exception 'subject not authorized'; end if;
  if exists(select 1 from consents where case_id=p_case and subject_id=p_actor and subject_type=p_type
    and revoked_at is null and not (purposes <@ p_purposes)) then raise exception 'revoke consent before removing purposes'; end if;
  insert into consents(case_id,subject_type,subject_id,purposes,policy_version,ip_address,user_agent)
  values(p_case,p_type,p_actor,p_purposes,p_policy,p_ip,p_agent)
  on conflict(case_id,subject_type,subject_id) do update set purposes=excluded.purposes,policy_version=excluded.policy_version,ip_address=excluded.ip_address,user_agent=excluded.user_agent,granted_at=now(),revoked_at=null;
  if c.status='draft' then update verification_cases set status='consent_given' where id=p_case; end if;
  perform verification_audit(p_case,p_actor,p_type,'consent_given',jsonb_build_object('policy_version',p_policy,'purposes',p_purposes));
end $$;

create function public.verification_set_summary(p_case uuid,p_actor uuid,p_summary jsonb,p_score integer,p_decision text default null,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from verification_cases where id=p_case and status in ('consent_given','in_progress','needs_review') and expires_at>now() for update;
  if not found then raise exception 'case unavailable'; end if;
  if p_decision is not null and p_decision not in ('pass','review','fail') then raise exception 'invalid decision'; end if;
  update verification_cases set summary=p_summary,score=p_score,
    overall_result=coalesce(p_decision,case when p_summary->>'result'='pending' then 'pending' else 'review' end),
    status=case when p_decision is not null then 'completed' when p_summary->>'result'='pending' then 'in_progress' else 'needs_review' end,
    reviewed_by=case when p_decision is not null then p_actor else null end,
    review_notes_encrypted=p_notes,completed_at=case when p_decision is not null then now() else null end
    where id=p_case;
  perform verification_audit(p_case,p_actor,case when p_decision is null then 'system' else 'admin' end,
    case when p_decision is null then 'evidence_recomputed' else 'reviewer_decision' end);
end $$;

create function public.verification_purge_case(p_case uuid,p_actor uuid default null,p_revoke boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from verification_cases where id=p_case for update;
  insert into verification_purge_queue(case_id,storage_key)
    select p_case,selfie_storage_key from liveness_checks where case_id=p_case and selfie_storage_key is not null
    union select p_case,document_storage_key from employment_records where case_id=p_case and document_storage_key is not null
    union select p_case,proof_storage_key from address_records where case_id=p_case and proof_storage_key is not null
    on conflict(storage_key) do nothing;
  update identity_records set bvn_encrypted=null,nin_encrypted=null,bvn_hash=null,nin_hash=null,
    full_name_bvn=null,full_name_nin=null,dob_bvn=null,dob_nin=null,phone_bvn=null,phone_nin=null,
    raw_response_encrypted=null,nin_raw_response_encrypted=null,reference_photo_encrypted=null,
    bvn_session_encrypted=null,allowed_methods='[]',lease_until=null where case_id=p_case;
  update liveness_checks set selfie_storage_key=null,review_notes_encrypted=null where case_id=p_case;
  update employment_records set document_storage_key=null,employer_name=null,job_title=null,cac_number=null,verification_notes=null,monthly_income_kobo=null where case_id=p_case;
  update affordability_checks set monthly_income_kobo=null,monthly_rent_kobo=null,ratio=null where case_id=p_case;
  update address_records set address_text=null,proof_storage_key=null where case_id=p_case;
  update public."references" set name=null,phone=null,email=null,notes=null where case_id=p_case;
  update guarantors set full_name=null,phone=null,email=null,relationship=null,invitation_hash=null where case_id=p_case;
  update verification_disputes set reason_encrypted=null where case_id=p_case;
  update consents set ip_address=null,user_agent=null,revoked_at=case when p_revoke then now() else revoked_at end where case_id=p_case;
  update verification_cases set status='expired',monthly_rent_kobo=null,review_notes_encrypted=null where id=p_case;
  perform verification_audit(p_case,p_actor,case when p_actor is null then 'system' else 'tenant' end,
    case when p_revoke then 'consent_revoked_and_purged' else 'retention_purged' end);
end $$;

create function public.verification_begin_identity(p_case uuid,p_actor uuid,p_type text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r identity_records%rowtype; begin
  perform 1 from verification_cases where id=p_case and status in ('consent_given','in_progress','needs_review') and expires_at>now() for update;
  if not found or not exists(select 1 from consents where case_id=p_case and subject_id=p_actor and subject_type=p_type and revoked_at is null and purposes ? 'identity') then raise exception 'consent required'; end if;
  select * into r from identity_records where case_id=p_case and subject_id=p_actor and subject_type=p_type for update;
  if found and r.lease_until>now() then raise exception 'identity check already running'; end if;
  if found and r.bvn_session_encrypted is not null and r.session_expires_at>now() then return to_jsonb(r); end if;
  if found then
    p_payload=p_payload||jsonb_build_object('id',r.id,'subject_id',p_actor,'subject_type',p_type,'lease_until',now()+interval '2 minutes',
      'bvn_verified',false,'nin_verified',false,'bvn_session_encrypted',null,'allowed_methods','[]'::jsonb,
      'raw_response_encrypted',null,'nin_raw_response_encrypted',null,'reference_photo_encrypted',null);
  else
    p_payload=p_payload||jsonb_build_object('subject_id',p_actor,'subject_type',p_type,'lease_until',now()+interval '2 minutes');
  end if;
  return verification_write(p_case,'identity_records',p_payload,p_actor,p_type,'identity_submitted');
end $$;

create function public.verification_accept_guarantor(p_case uuid,p_actor uuid,p_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from verification_cases where id=p_case and status<>'expired' and expires_at>now() for update;
  if not found then return false; end if;
  update guarantors set user_id=p_actor,status='accepted',invitation_hash=null
    where case_id=p_case and invitation_hash=p_hash and status='invited' and invitation_expires_at>now()
    and p_actor<>(select tenant_id from verification_cases where id=p_case);
  if not found then return false; end if;
  perform verification_audit(p_case,p_actor,'guarantor','guarantor_invitation_accepted');
  return true;
end $$;

create function public.verification_claim_identity(p_case uuid,p_subject uuid,p_type text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from verification_cases where id=p_case and expires_at>now() and status in ('consent_given','in_progress','needs_review') for update;
  if not found or not exists(select 1 from consents where case_id=p_case and subject_id=p_subject and subject_type=p_type and revoked_at is null and purposes ? 'identity') then return false; end if;
  update identity_records set lease_until=now()+interval '2 minutes' where case_id=p_case and subject_id=p_subject and subject_type=p_type and (lease_until is null or lease_until<now());
  return found;
end $$;

-- Only backend/service credentials may execute these functions.
do $$ declare r record; begin
  for r in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in
    ('verification_rate_limit','verification_audit','verification_write','verification_purge_case','verification_claim_identity',
     'verification_create','verification_consent','verification_set_summary','verification_begin_identity','verification_accept_guarantor') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.signature);
    execute format('grant execute on function %s to service_role',r.signature);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('verification-evidence','verification-evidence',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Supabase manages storage.objects and enables RLS itself. Hosted postgres may
-- create policies but cannot ALTER this managed table. Fail closed if its
-- expected platform protection is absent.
do $$ begin
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
    raise exception 'Supabase Storage RLS must already be enabled before verification setup';
  end if;
end $$;
-- Restrictive policies also constrain any existing broad permissive storage policies.
create policy verification_evidence_service_only on storage.objects as restrictive
for all to anon,authenticated
using (bucket_id<>'verification-evidence') with check (bucket_id<>'verification-evidence');
notify pgrst,'reload schema';
