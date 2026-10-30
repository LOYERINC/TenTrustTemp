-- Extend existing orders; keep every historical reference and package snapshot.
alter table public.screening_payments
  add column if not exists user_id uuid generated always as (landlord_id) stored,
  add column if not exists paystack_transaction_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists customer_email text;
alter table public.screening_payments drop constraint if exists screening_payments_status_check;
alter table public.screening_payments add constraint screening_payments_status_check
  check (status in ('pending','paid','failed','abandoned'));
create unique index if not exists screening_payments_paystack_transaction_unique
  on public.screening_payments(paystack_transaction_id) where paystack_transaction_id is not null;
update public.screening_payments set paid_at=verified_at where status='paid' and paid_at is null;

-- Lock the purchase, not just a browser request: simultaneous checkout clicks reuse one order.
create or replace function public.reserve_paystack_order(
  p_screening_id uuid,p_user_id uuid,p_reference text,p_amount_kobo bigint,p_currency text,p_mode text,p_email text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.screening_requests%rowtype; p public.screening_payments%rowtype;
begin
  select * into s from public.screening_requests where id=p_screening_id and landlord_id=p_user_id for update;
  if not found then raise exception 'purchase not found'; end if;
  select * into p from public.screening_payments where screening_id=s.id and status='paid' order by created_at desc limit 1;
  if found then return jsonb_build_object('created',false,'order',to_jsonb(p)); end if;
  if s.payment_status='paid' then return jsonb_build_object('created',false,'already_paid',true); end if;
  select * into p from public.screening_payments where screening_id=s.id and status='pending' order by created_at desc limit 1;
  if found then return jsonb_build_object('created',false,'order',to_jsonb(p)); end if;
  insert into public.screening_payments(screening_id,landlord_id,package_id,provider,mode,reference,amount_kobo,currency,customer_email)
    values(s.id,p_user_id,s.package_id,'paystack',p_mode,p_reference,p_amount_kobo,p_currency,p_email) returning * into p;
  update public.screening_requests set status='payment_pending',payment_status='pending' where id=s.id and payment_status<>'paid';
  return jsonb_build_object('created',true,'order',to_jsonb(p));
end $$;
revoke all on function public.reserve_paystack_order(uuid,uuid,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_paystack_order(uuid,uuid,text,bigint,text,text,text) to service_role;

-- Webhook and verification use the same transaction and the existing atomic fulfillment.
create or replace function public.settle_paystack_order(
  p_reference text,p_amount_kobo bigint,p_currency text,p_status text,p_transaction_id text default null,p_paid_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.screening_payments%rowtype;
begin
  select * into p from public.screening_payments where reference=p_reference for update;
  if not found or p.provider<>'paystack' then raise exception 'order not found'; end if;
  if p.amount_kobo<>p_amount_kobo or p.currency<>p_currency then raise exception 'payment mismatch'; end if;
  if p.status='paid' then
    if p_status='paid' and p.paystack_transaction_id is not null and p_transaction_id is distinct from p.paystack_transaction_id
      then raise exception 'transaction mismatch'; end if;
    return to_jsonb(p);
  end if;
  if p_status='paid' then
    if p_transaction_id is null or p_transaction_id !~ '^[0-9]{1,40}$' then raise exception 'transaction id required'; end if;
    perform public.fulfill_screening_payment(p_reference,p_amount_kobo,p_currency);
    update public.screening_payments set paystack_transaction_id=p_transaction_id,paid_at=coalesce(p_paid_at,now())
      where id=p.id returning * into p;
  elsif p_status in ('failed','abandoned') then
    update public.screening_payments set status=p_status where id=p.id and status<>'paid' returning * into p;
    -- Never downgrade a screening paid through another attempt.
    update public.screening_requests set payment_status='failed',status='draft'
      where id=p.screening_id and payment_status<>'paid';
  elsif p_status<>'pending' then raise exception 'invalid payment state';
  end if;
  return to_jsonb(p);
end $$;
revoke all on function public.settle_paystack_order(text,bigint,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_paystack_order(text,bigint,text,text,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
