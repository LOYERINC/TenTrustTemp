begin;
alter table public.screening_requests drop constraint if exists screening_requests_package_id_check;
alter table public.screening_requests add constraint screening_requests_package_id_check check (package_id in ('identity','basic','standard','premium','founding','basic_v2','intermediate_v2','custom_v2'));
alter table public.screening_payments drop constraint if exists screening_payments_package_id_check;
alter table public.screening_payments add constraint screening_payments_package_id_check check (package_id in ('identity','basic','standard','premium','founding','basic_v2','intermediate_v2','custom_v2'));
create table public.screening_private_evidence (
 id uuid primary key default gen_random_uuid(),
 screening_id uuid not null references public.screening_requests(id) on delete cascade,
 kind text not null check(kind in ('challenge','liveness','statement')),
 challenge text,
 identity_binding text,
 object_key text unique,
 media_type text,
 size_bytes integer check(size_bytes > 0 and size_bytes <= 10485760),
 decision text,
 created_at timestamptz not null default now(),
 unique(screening_id,kind)
);
create table public.screening_evidence_audit (
 id uuid primary key default gen_random_uuid(),
 screening_id uuid not null references public.screening_requests(id),
 evidence_id uuid references public.screening_private_evidence(id),
 staff_id uuid not null references auth.users(id),
 action text not null,
 created_at timestamptz not null default now()
);
alter table public.screening_private_evidence enable row level security;
alter table public.screening_evidence_audit enable row level security;
revoke all on public.screening_private_evidence, public.screening_evidence_audit from public, anon, authenticated;
grant all on public.screening_private_evidence, public.screening_evidence_audit to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('screening-private-evidence','screening-private-evidence',false,10485760,array['application/pdf','video/webm','video/mp4'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive policy also blocks any permissive policy from another feature.
create policy "No client access to screening evidence" on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'screening-private-evidence') with check (bucket_id <> 'screening-private-evidence');
create table public.screening_quote_requests (
 id uuid primary key default gen_random_uuid(),
 landlord_id uuid not null references auth.users(id),
 checks jsonb not null,
 monthly_rent numeric not null check(monthly_rent > 0),
 notes text not null default '',
 created_at timestamptz not null default now()
);
alter table public.screening_quote_requests enable row level security;
revoke all on public.screening_quote_requests from public, anon, authenticated;
grant all on public.screening_quote_requests to service_role;
commit;
