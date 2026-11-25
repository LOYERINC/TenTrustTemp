-- Run once after deploying the functions. Populate Vault entries first:
-- tentrust_project_url = https://PROJECT.supabase.co
-- tentrust_email_dispatch_secret = same random secret as EMAIL_DISPATCH_SECRET
-- These secrets must be created through the owner's secret-management workflow.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='tentrust-email-dispatch';
select cron.schedule('tentrust-email-dispatch','* * * * *',$cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='tentrust_project_url')||'/functions/v1/email-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='tentrust_email_dispatch_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  ) where exists(select 1 from public.email_runtime where id and enabled)
    and exists(select 1 from public.email_jobs where (state='queued' and due_at<=now()) or (state='sending' and lease_until<now()));
$cron$);
