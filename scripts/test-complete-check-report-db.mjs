import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('report approval publishes one snapshot atomically and rejects stale sources', async () => {
  const db = new PGlite();
  const staff = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const caseId = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create schema auth; create schema storage;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      alter table storage.objects enable row level security;`);
    for (const file of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    }
    await db.query('insert into auth.users(id) values($1),($2)', [staff, other]);
    await db.query('insert into public.admin_memberships(user_id) values($1)', [staff]);
    await db.query(`insert into public.screening_requests(id,landlord_id,package_id,intake_mode,tenant_name,tenant_phone,property_title,status,payment_status,check_status)
      values($1,$2,'intermediate_v2','tenant_link','Sample','08000000000','Sample','incomplete','paid','{"identity_provider":"interswitch"}')`, [caseId, other]);
    await db.query(`insert into public.screening_payments(screening_id,landlord_id,package_id,reference,amount_kobo,status,mode)
      values($1,$2,'intermediate_v2','sample-payment',400000,'paid','test')`, [caseId, other]);
    await db.query(`insert into public.interswitch_sandbox_intakes(screening_id,encrypted_intake,state,video_key)
      values($1,'ciphertext','submitted','private-video')`, [caseId]);
    const revision = (await db.query("select md5('ciphertext') as revision")).rows[0].revision;
    const report = { schema_version: 'complete-check-report-v1', state: 'draft', environment: 'sandbox',
      generator: 'verified-facts-template', findings: [{ id: 'loan_history', text: 'No history returned.' }],
      staff_note: 'Staff approved sample note.', follow_up: [], limitations: ['Sample only.'] };
    report.admin_decision = { outcome: 'further_information_required', reasons: 'Synthetic administrator entry for a database test only.', origin: 'administrator' };
    const publish = async (actor = staff, source = revision) => (await db.query(
      'select public.publish_complete_check_report($1,$2,$3,$4,$5,$6) as ok',
      [caseId, actor, 'no_history', 'reviewed', JSON.stringify(report), source])).rows[0].ok;
    assert.equal(await publish(other), false);
    assert.equal(await publish(staff, 'stale'), false);
    assert.equal((await db.query('select status,published_report from public.screening_requests where id=$1', [caseId])).rows[0].published_report, null);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select public.publish_interswitch_sandbox_report($1,$2,$3,$4)', [caseId, staff, 'no_history', 'reviewed']), /permission denied/);
      if (role !== 'service_role') await assert.rejects(publish(), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal(await publish(), true);
    await db.exec('reset role');
    const completed = (await db.query('select status,published_report from public.screening_requests where id=$1', [caseId])).rows[0];
    assert.equal(completed.status, 'complete');
    assert.equal(completed.published_report.state, 'published');
    assert.equal(completed.published_report.staff_note, report.staff_note);
    assert.ok(completed.published_report.approved_at);
    assert.equal(await publish(), false);
    const audit = (await db.query('select reviewed_by,state from public.interswitch_sandbox_intakes where screening_id=$1', [caseId])).rows[0];
    assert.equal(audit.reviewed_by, staff);
    assert.equal(audit.state, 'published');
  } finally { await db.close(); }
});
