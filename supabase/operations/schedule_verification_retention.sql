-- Run after deploying /api/v1/jobs/verification-retention. Configure these Supabase Vault secrets:
-- tentrust_api_url = https://YOUR_BACKEND_HOST
-- tentrust_verification_job_secret = same value as VERIFICATION_JOB_SECRET on the backend.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='tentrust-verification-retention';
select cron.schedule('tentrust-verification-retention','15 * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='tentrust_api_url')||'/api/v1/jobs/verification-retention',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
      (select decrypted_secret from vault.decrypted_secrets where name='tentrust_verification_job_secret')),
    body := '{}'::jsonb,timeout_milliseconds := 60000
  );
$job$);
