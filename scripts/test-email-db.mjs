// Runs real Postgres migrations and functions in disposable WASM Postgres. No network or production data.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('email operations migration and transactional queue', async t => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const admin = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create schema auth; create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      alter table storage.objects enable row level security;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',
        created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
      if (file === '202610220001_email_operations.sql') {
        await db.exec("insert into public.waitlist(name,email) values('Historical member','historical@example.com')");
      }
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    }
    const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
    const reset = async () => {
      await db.exec(`truncate auth.users,public.waitlist,public.email_jobs,public.email_suppressions,public.admin_audit_log cascade;
        update public.email_runtime set enabled=true;`);
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.com',now()),($2,'admin@example.com',now())", [owner, admin]);
      await db.query('insert into public.admin_memberships(user_id) values($1)', [admin]);
    };
    const waitlist = async email => scalar("insert into public.waitlist(name,email) values('Test member',$1) returning id", [email]);
    const claim = async () => (await db.query('select * from public.claim_email_jobs()')).rows;
    const finish = async (j, state, message = null, error = null) => scalar('select public.finish_email_attempt($1,$2,$3,$4,$5)', [j.id, j.lease_token, state, message, error]);
    const retry = async id => scalar('select public.retry_email_job($1,$2,$3)', [admin, id, 'Provider configuration restored']);
    const event = async (j, type, key = type) => db.query('select public.record_email_event($1,$2,$3,$4,$5,$6,now())', [key, 'message-123', j.id, 'unclassified', j.recipient, type]);
    const screening = async () => scalar(`insert into public.screening_requests(landlord_id,landlord_email,package_id,intake_mode,tenant_name,tenant_phone,property_title)
      values($1,'owner@example.com','identity','tenant_link','Test tenant','08000000000','Test property') returning id`, [owner]);

    await t.test('backfill is explicit, paused by default, and idempotent', async () => {
      assert.equal(await scalar('select count(*) from public.email_jobs'), 0);
      assert.equal(await scalar('select public.backfill_waitlist_emails()'), 1);
      assert.equal(await scalar('select public.backfill_waitlist_emails()'), 0);
      assert.deepEqual(await claim(), []);
      await waitlist('new@example.com');
      assert.equal(await scalar('select count(*) from public.email_jobs'), 2);
    });
    await t.test('anon inserts enqueue safely but private tables and functions remain inaccessible', async () => {
      await reset();
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        try {
          await assert.rejects(db.query('select * from public.email_jobs'));
          await assert.rejects(db.query('select * from public.admin_users'));
          await assert.rejects(db.query('select * from public.claim_email_jobs()'));
          await assert.rejects(db.query("insert into public.admin_memberships(user_id) values(gen_random_uuid())"));
          await db.exec(`insert into public.waitlist(name,email) values('Public signup','${role}@example.com')`);
        } finally { await db.exec('reset role'); }
      }
      assert.equal(await scalar('select count(*) from public.email_jobs'), 2);
    });
    await t.test('report transitions enqueue once and the job contains no report payload', async () => {
      await reset();
      const id = await screening();
      await db.query("update public.screening_requests set status='complete' where id=$1", [id]);
      await db.query("update public.screening_requests set status='incomplete' where id=$1", [id]);
      await db.query("update public.screening_requests set status='complete' where id=$1", [id]);
      const jobs = (await db.query('select * from public.email_jobs')).rows;
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].kind, 'report_ready');
      assert.equal(jobs[0].source_id, id);
      assert.ok(!('score' in jobs[0])); assert.ok(!('credit_report' in jobs[0]));
    });
    await t.test('claims are disjoint, capped at twenty, and dead leases become unknown', async () => {
      await reset();
      for (let i = 0; i < 25; i++) await waitlist(`member${i}@example.com`);
      const [a, b] = await Promise.all([claim(), claim()]);
      assert.equal(a.length, 20); assert.equal(b.length, 5);
      assert.equal(new Set([...a, ...b].map(j => j.id)).size, 25);
      assert.equal(await finish({ ...a[0], lease_token: crypto.randomUUID() }, 'sent'), false);
      await db.exec("update public.email_jobs set lease_until=now()-interval '1 second'");
      assert.deepEqual(await claim(), []);
      assert.equal(await scalar("select count(*) from public.email_jobs where state='unknown'"), 25);
      assert.equal(await retry(a[0].id), false);
    });
    await t.test('webhook before acknowledgement and late duplicate events never regress delivery', async () => {
      await reset(); await waitlist('member@example.com');
      const [job] = await claim();
      await event(job, 'delivered');
      await finish(job, 'sent', 'message-123');
      await event(job, 'sent'); await event(job, 'delivered');
      assert.equal(await scalar('select state from public.email_jobs where id=$1', [job.id]), 'delivered');
      assert.equal(await scalar('select count(*) from public.email_events'), 2);
      assert.equal(await retry(job.id), false);
      await event(job, 'hard_bounce');
      await db.query("insert into public.email_jobs(event_key,kind,source_id,recipient) values('another','waitlist_welcome',gen_random_uuid(),$1)", [job.recipient]);
      await claim();
      assert.equal(await scalar("select state from public.email_jobs where event_key='another'"), 'suppressed');
    });
    await t.test('bounded rate-limit retries and audited manual retry preserve attempt history', async () => {
      await reset(); await waitlist('limited@example.com');
      let job;
      for (let i = 0; i < 5; i++) {
        [job] = await claim(); assert.ok(job);
        await finish(job, 'queued', null, 'rate_limited');
        await db.exec('update public.email_jobs set due_at=now()');
      }
      assert.equal(await scalar('select state from public.email_jobs'), 'failed');
      assert.equal(await retry(job.id), true);
      const [again] = await claim(); assert.equal(again.attempts, 6);
      await finish(again, 'unknown', null, 'transport_uncertain');
      assert.equal(await retry(job.id), false);
      assert.equal(await scalar('select count(*) from public.email_attempts'), 6);
      assert.equal(await scalar('select count(*) from public.admin_audit_log'), 2);
      await assert.rejects(db.query('select public.retry_email_job($1,$2,$3)', [owner, job.id, 'Forged admin metadata']));
    });
    await t.test('only verified live payments count as live revenue', async () => {
      await reset(); const id = await screening();
      for (const [mode, state, amount, verified] of [['live','paid',10000,true],['test','paid',20000,true],['unknown','paid',30000,true],['live','pending',40000,false],['live','paid',50000,false]]) {
        await db.query(`insert into public.screening_payments(screening_id,landlord_id,package_id,reference,amount_kobo,status,mode,verified_at)
          values($1,$2,'identity',$3,$4,$5,$6,case when $7 then now() else null end)`, [id,owner,crypto.randomUUID(),amount,state,mode,verified]);
      }
      const metrics = await scalar('select public.admin_overview()');
      assert.equal(metrics.paid_live_kobo, 10000); assert.equal(metrics.paid_test_kobo, 20000);
      assert.equal(metrics.payments_unknown_mode, 1);
    });
    await t.test('rolled-back signups cannot leave orphaned email jobs', async () => {
      await reset();
      await assert.rejects(db.transaction(async tx => {
        await tx.exec("insert into public.waitlist(name,email) values('Rollback','rollback@example.com')");
        throw new Error('rollback');
      }));
      assert.equal(await scalar('select count(*) from public.waitlist'), 0);
      assert.equal(await scalar('select count(*) from public.email_jobs'), 0);
    });
  } finally { await db.close(); }
});
