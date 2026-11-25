-- Approval and report snapshot are written in the same transaction as completion.
alter table public.screening_requests add column published_report jsonb;

create function public.publish_complete_check_report(
  p_screening_id uuid, p_staff_id uuid, p_loan_history text, p_video_review text,
  p_report jsonb, p_intake_revision text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare current_intake public.interswitch_sandbox_intakes;
begin
  if not exists (select 1 from public.admin_memberships where user_id=p_staff_id and active) then
    return false;
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object'
    or (p_report ->> 'schema_version') is distinct from 'complete-check-report-v1'
    or (p_report ->> 'state') is distinct from 'draft'
    or (p_report ->> 'environment') is distinct from 'sandbox'
    or jsonb_typeof(p_report -> 'findings') is distinct from 'array'
    or length(p_report::text) > 512000 then return false; end if;
  if jsonb_typeof(p_report -> 'admin_decision') is distinct from 'object'
    or (p_report #>> '{admin_decision,origin}') is distinct from 'administrator'
    or coalesce(p_report #>> '{admin_decision,outcome}', '') not in ('selected','not_selected','further_information_required')
    or length(trim(coalesce(p_report #>> '{admin_decision,reasons}', ''))) < 20
    or length(p_report #>> '{admin_decision,reasons}') > 4000 then return false; end if;
  perform 1 from public.screening_requests where id=p_screening_id for update;
  if not found then return false; end if;
  select * into current_intake from public.interswitch_sandbox_intakes
    where screening_id=p_screening_id and state='submitted' for update;
  if not found or p_intake_revision is distinct from md5(current_intake.encrypted_intake) then
    return false;
  end if;
  if not public.publish_interswitch_sandbox_report(p_screening_id,p_staff_id,p_loan_history,p_video_review) then
    return false;
  end if;
  update public.screening_requests set published_report =
    p_report || jsonb_build_object('state','published','approved_at',now())
    where id=p_screening_id;
  return true;
end;
$$;

-- Remove the old application path that could complete a case without a snapshot.
revoke execute on function public.publish_interswitch_sandbox_report(uuid,uuid,text,text) from service_role;
revoke all on function public.publish_complete_check_report(uuid,uuid,text,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.publish_complete_check_report(uuid,uuid,text,text,jsonb,text) to service_role;

notify pgrst, 'reload schema';
