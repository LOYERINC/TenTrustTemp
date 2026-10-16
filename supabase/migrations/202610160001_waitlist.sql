create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (
    char_length(email) <= 254
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ),
  role text not null default 'not-specified'
    check (role in ('tenant', 'landlord', 'agent', 'other', 'not-specified')),
  submitted_at timestamptz not null default now(),
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object')
);

create unique index if not exists waitlist_email_lower_unique
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;

drop policy if exists "Public can join the waitlist" on public.waitlist;
create policy "Public can join the waitlist"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);
