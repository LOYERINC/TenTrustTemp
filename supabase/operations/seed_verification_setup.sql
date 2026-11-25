-- Approved TenTrust reviewer bootstrap. Safe to repeat for this existing account.
-- Run as the project's database administrator after the verification migrations.
begin;
do $$ begin
  if not exists (
    select 1 from auth.users
    where id='be690953-0043-4aa9-aa9c-6a882edfc9a3'::uuid
      and lower(email)='tentrust32@gmail.com'
  ) then
    raise exception 'The approved TenTrust reviewer account is missing or differs from this seed';
  end if;
end $$;

insert into public.admin_memberships(user_id,active)
values('be690953-0043-4aa9-aa9c-6a882edfc9a3',true)
on conflict(user_id) do update set active=excluded.active;

commit;

select u.email,m.active as reviewer_enabled,
       u.email_confirmed_at is not null as email_confirmed
from public.admin_memberships m join auth.users u on u.id=m.user_id
where m.user_id='be690953-0043-4aa9-aa9c-6a882edfc9a3';
