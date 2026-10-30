import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('manual identity storage stays private to trusted backend roles',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create schema auth; create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      alter table storage.objects enable row level security;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
    const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
    const owner=await scalar("insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'owner@example.com',now()) returning id");
    const purchase=async(pkg='basic_v2')=>scalar(`insert into public.screening_requests(landlord_id,landlord_email,package_id,intake_mode,tenant_name,tenant_phone,property_title)
      values($1,'owner@example.com',$2,'tenant_link','Synthetic tenant','08000000000','Synthetic home') returning id`,[owner,pkg]);
    const reserve=async(id,ref,amount=150000)=>scalar("select public.reserve_paystack_order($1,$2,$3,$4,'NGN','test','owner@example.com')",[id,owner,ref,amount]);
    const settle=async(ref,state='paid',transaction='12345',amount=150000)=>scalar("select public.settle_paystack_order($1,$2,'NGN',$3,$4,now())",[ref,amount,state,transaction]);

    const sid=await purchase();
    await db.query("insert into public.screening_private_evidence(screening_id,kind,challenge,identity_intake_encrypted,identity_intake_at,identity_review_encrypted) values($1,'challenge','123456','v1.synthetic-ciphertext',now(),'v1.synthetic-review')",[sid]);
    await db.exec('set role service_role');
    assert.equal(await scalar('select identity_intake_encrypted from public.screening_private_evidence where screening_id=$1',[sid]),'v1.synthetic-ciphertext');
    await db.exec('reset role');
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      try {
        await assert.rejects(db.query('select identity_intake_encrypted from public.screening_private_evidence'));
        await assert.rejects(db.query("update public.screening_private_evidence set identity_review_encrypted='forged'"));
      } finally {await db.exec('reset role');}
    }
    assert.equal(await scalar('select identity_review_encrypted from public.screening_private_evidence'),'v1.synthetic-review');
  } finally {await db.close();}
});
