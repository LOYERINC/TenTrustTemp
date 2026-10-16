create or replace function public.ensure_screening_tenant_token(
  p_screening_id uuid,
  p_landlord_id uuid,
  p_token_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_force_replace uuid default null
)
returns table(id uuid, token_hash text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.screening_requests%rowtype;
  token_row public.screening_tenant_tokens%rowtype;
begin
  select * into request_row
  from public.screening_requests
  where screening_requests.id = p_screening_id
    and screening_requests.landlord_id = p_landlord_id
  for update;
  if not found then raise exception 'screening not found'; end if;
  if request_row.intake_mode <> 'tenant_link' or request_row.payment_status <> 'paid'
     or request_row.status in ('complete', 'declined') then
    raise exception 'tenant link is unavailable';
  end if;

  select * into token_row
  from public.screening_tenant_tokens
  where screening_tenant_tokens.screening_id = p_screening_id
    and screening_tenant_tokens.invalidated_at is null
    and screening_tenant_tokens.consumed_at is null
    and screening_tenant_tokens.expires_at > now()
  order by screening_tenant_tokens.created_at desc
  limit 1
  for update;

  if found and (p_force_replace is null or token_row.id <> p_force_replace) then
    update public.screening_tenant_tokens
    set invalidated_at = now()
    where screening_tenant_tokens.screening_id = p_screening_id
      and screening_tenant_tokens.id <> token_row.id
      and screening_tenant_tokens.invalidated_at is null;
    return query select token_row.id, token_row.token_hash, token_row.expires_at;
    return;
  end if;

  update public.screening_tenant_tokens
  set invalidated_at = now()
  where screening_tenant_tokens.screening_id = p_screening_id
    and screening_tenant_tokens.invalidated_at is null;

  insert into public.screening_tenant_tokens (id, screening_id, token_hash, expires_at)
  values (p_token_id, p_screening_id, p_token_hash, p_expires_at)
  returning screening_tenant_tokens.id, screening_tenant_tokens.token_hash, screening_tenant_tokens.expires_at
  into token_row;
  return query select token_row.id, token_row.token_hash, token_row.expires_at;
end;
$$;

revoke all on function public.ensure_screening_tenant_token(uuid, uuid, uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_screening_tenant_token(uuid, uuid, uuid, text, timestamptz, uuid)
  to service_role;
