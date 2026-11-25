import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('verification migrations, consent locks, audit, retention and permissions', async t => {
  const db = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111';
  const landlord = '22222222-2222-4222-8222-222222222222';
  const other = '33333333-3333-4333-8333-333333333333';
  const property = '44444444-4444-4444-8444-444444444444';
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
    await db.query('insert into auth.users(id) values($1),($2),($3)', [tenant, landlord, other]);
    const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
    const create = (owner = tenant, land = null, prop = null) => scalar('select public.verification_create($1,$2,$3,$4,$5,$6)', [owner, 'Example', land, prop, 40000, 30]);
    const consent = (id, actor = tenant, type = 'tenant') => db.query('select public.verification_consent($1,$2,$3,$4,$5,$6,$7)', [id, actor, type, JSON.stringify(['identity','liveness','employment','address','references','guarantor','summary_sharing']), '2026-10-25', 'encrypted-ip', 'encrypted-agent']);
    const write = (id, table, data, actor = tenant, role = 'tenant') => scalar('select public.verification_write($1,$2,$3,$4,$5,$6)', [id, table, JSON.stringify(data), actor, role, 'test_evidence_write']);

    await t.test('property ownership and consent cannot be skipped', async () => {
      await assert.rejects(create(tenant, landlord, property), /property is not linked/);
      await db.query('insert into public.verification_property_links(property_id,landlord_id) values($1,$2)', [property, landlord]);
      const c = await create(tenant, landlord, property);
      assert.equal(c.status, 'draft');
      await assert.rejects(write(c.id, 'identity_records', {subject_type:'tenant',subject_id:tenant}), /consent required/);
      await assert.rejects(consent(c.id, other), /subject not authorized/);
      await db.query('select public.verification_consent($1,$2,$3,$4,$5,$6,$7)', [c.id,tenant,'tenant',JSON.stringify(['identity']),'2026-10-25','encrypted-ip','encrypted-agent']);
      await assert.rejects(write(c.id,'liveness_checks',{subject_type:'tenant',subject_id:tenant,provider:'manual_review',status:'manual_review',attempt:1}),/consent required/);
      await consent(c.id);
      const record = await write(c.id, 'identity_records', {subject_type:'tenant',subject_id:tenant,bvn_encrypted:'ciphertext',bvn_hash:'hash-a'});
      assert.equal(record.bvn_verified, false);
      assert.equal(record.status, 'pending');
      assert.equal(await scalar('select count(*) from public.verification_events where case_id=$1', [c.id]), 4);
      await assert.rejects(write(c.id, 'auth.users', {}), /invalid verification resource/);
      const missing = '55555555-5555-4555-8555-555555555555';
      await assert.rejects(write(c.id,'identity_records',{id:missing,status:'verified'}), /resource not found/);
    });

    await t.test('identity lease is atomic and cannot overwrite in-flight identifiers', async () => {
      const c = await create(); await consent(c.id);
      const begin = payload => scalar('select public.verification_begin_identity($1,$2,$3,$4)', [c.id,tenant,'tenant',JSON.stringify(payload)]);
      const record = await begin({bvn_hash:'first',status:'pending'});
      await assert.rejects(begin({bvn_hash:'second',status:'pending'}), /already running/);
      assert.equal(await scalar('select bvn_hash from public.identity_records where id=$1', [record.id]), 'first');
      await write(c.id, 'identity_records', {id:record.id,lease_until:null,bvn_session_encrypted:'session',session_expires_at:'2099-01-01T00:00:00Z'});
      assert.equal((await begin({bvn_hash:'second',status:'pending'})).bvn_hash,'first');
    });

    await t.test('liveness max attempts is enforced in the database', async () => {
      const c=await create(); await consent(c.id);
      for (let attempt=1;attempt<=3;attempt++) await write(c.id,'liveness_checks',{subject_type:'tenant',subject_id:tenant,provider:'manual_review',status:'manual_review',attempt,selfie_storage_key:c.id+'/'+attempt});
      await assert.rejects(write(c.id,'liveness_checks',{subject_type:'tenant',subject_id:tenant,provider:'manual_review',status:'manual_review',attempt:4}), /check constraint/);
    });

    await t.test('revocation purges sensitive columns and blocks late provider writes', async () => {
      const c=await create();await consent(c.id);
      const record=await write(c.id,'identity_records',{subject_type:'tenant',subject_id:tenant,bvn_encrypted:'encrypted-bvn',nin_encrypted:'encrypted-nin',raw_response_encrypted:'encrypted-raw',bvn_hash:'secret-hash',full_name_bvn:'encrypted-name'});
      await write(c.id,'liveness_checks',{subject_type:'tenant',subject_id:tenant,provider:'manual_review',status:'manual_review',attempt:1,selfie_storage_key:c.id+'/image'});
      await db.query('select public.verification_purge_case($1,$2,true)',[c.id,tenant]);
      const row=(await db.query('select * from public.identity_records where id=$1',[record.id])).rows[0];
      for(const field of ['bvn_encrypted','nin_encrypted','raw_response_encrypted','bvn_hash','full_name_bvn'])assert.equal(row[field],null);
      assert.equal(await scalar('select status from public.verification_cases where id=$1',[c.id]),'expired');
      assert.equal(await scalar('select count(*) from public.verification_purge_queue where case_id=$1',[c.id]),1);
      await assert.rejects(write(c.id,'identity_records',{id:record.id,status:'verified'}),/case unavailable/);
      assert.equal(await scalar('select public.verification_claim_identity($1,$2,$3)',[c.id,tenant,'tenant']),false);
    });

    await t.test('guarantor accepts an expiring invitation as their own authenticated subject', async () => {
      const c=await create();await consent(c.id);
      await write(c.id,'guarantors',{status:'invited',invitation_hash:'invitation-hash',invitation_expires_at:'2099-01-01T00:00:00Z'});
      assert.equal(await scalar('select public.verification_accept_guarantor($1,$2,$3)',[c.id,other,'wrong']),false);
      assert.equal(await scalar('select public.verification_accept_guarantor($1,$2,$3)',[c.id,other,'invitation-hash']),true);
      await consent(c.id,other,'guarantor');
      await write(c.id,'identity_records',{subject_type:'guarantor',subject_id:other},other,'guarantor');
      assert.equal(await scalar('select public.verification_accept_guarantor($1,$2,$3)',[c.id,other,'invitation-hash']),false);
    });

    await t.test('audit is append-only and source tables cannot be read by browser roles', async () => {
      await assert.rejects(db.query("update public.verification_events set event_type='changed'"),/append-only/);
      for(const role of ['anon','authenticated']){
        await db.exec('set role '+role);
        for(const table of ['verification_cases','identity_records','consents','liveness_checks','verification_events'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);
        await assert.rejects(db.query("select public.verification_rate_limit('key',1,10)"),/permission denied/);
        await db.exec('reset role');
      }
      assert.equal(await scalar("select public.verification_rate_limit('test-user',1,3600)"),true);
      assert.equal(await scalar("select public.verification_rate_limit('test-user',1,3600)"),false);
      assert.equal(await scalar("select public from storage.buckets where id='verification-evidence'"),false);
      await db.exec(`grant usage on schema storage to authenticated;
        grant select on storage.objects to authenticated;
        create policy broad_existing_policy on storage.objects for select to authenticated using(true);
        insert into storage.objects(bucket_id) values('verification-evidence'),('public-assets');
        set role authenticated;`);
      assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows,[{bucket_id:'public-assets'}]);
      await db.exec('reset role');
    });
  } finally { await db.close(); }
});
