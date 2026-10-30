import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('durable payment reservations and atomic settlement',async t=>{
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
    const purchase=async(pkg='identity')=>scalar(`insert into public.screening_requests(landlord_id,landlord_email,package_id,intake_mode,tenant_name,tenant_phone,property_title)
      values($1,'owner@example.com',$2,'tenant_link','Synthetic tenant','08000000000','Synthetic home') returning id`,[owner,pkg]);
    const reserve=async(id,ref,amount=150000)=>scalar("select public.reserve_paystack_order($1,$2,$3,$4,'NGN','test','owner@example.com')",[id,owner,ref,amount]);
    const settle=async(ref,state='paid',transaction='12345',amount=150000)=>scalar("select public.settle_paystack_order($1,$2,'NGN',$3,$4,now())",[ref,amount,state,transaction]);

    await t.test('repeated reservations reuse the existing order and immutable amount',async()=>{
      const id=await purchase();const first=await reserve(id,'tt_first');const second=await reserve(id,'tt_unused',300000);
      assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(second.order.id,first.order.id);
      assert.equal(second.order.reference,'tt_first');assert.equal(second.order.amount_kobo,150000);assert.equal(second.order.user_id,owner);
      assert.equal(await scalar('select count(*) from public.screening_payments where screening_id=$1',[id]),1);
    });
    await t.test('mismatched amounts roll back without fulfillment',async()=>{
      await assert.rejects(settle('tt_first','paid','12345',1));
      assert.equal(await scalar("select status from public.screening_payments where reference='tt_first'"),'pending');
    });
    await t.test('duplicate webhook/verification settles once and cannot reset a completed check',async()=>{
      const id=await purchase('founding');await reserve(id,'tt_bundle',2500000);
      await settle('tt_bundle','paid','55555',2500000);
      await db.query("update public.screening_requests set status='complete' where id=$1",[id]);
      await settle('tt_bundle','paid','55555',2500000);
      await settle('tt_bundle','failed',null,2500000);
      assert.equal(await scalar('select status from public.screening_requests where id=$1',[id]),'complete');
      assert.equal(await scalar("select count(*) from public.screening_credits where source_payment_id=(select id from public.screening_payments where reference='tt_bundle')"),1);
      assert.equal(await scalar("select status from public.screening_payments where reference='tt_bundle'"),'paid');
      assert.ok(await scalar("select paid_at from public.screening_payments where reference='tt_bundle'"));
    });
    await t.test('one Paystack transaction cannot fulfill two purchases',async()=>{
      const id=await purchase();await reserve(id,'tt_other');
      await assert.rejects(settle('tt_other','paid','55555'));
      assert.equal(await scalar("select status from public.screening_payments where reference='tt_other'"),'pending');
      assert.equal(await scalar('select payment_status from public.screening_requests where id=$1',[id]),'pending');
    });
    await t.test('only a closed attempt permits a new reservation; references stay unique',async()=>{
      const id=await purchase();await reserve(id,'tt_abandon');await settle('tt_abandon','abandoned',null);
      const retry=await reserve(id,'tt_retry');assert.equal(retry.created,true);
      assert.equal((await reserve(id,'tt_not_again')).order.reference,'tt_retry');
      await assert.rejects(reserve(await purchase(),'tt_retry'));
    });
    await t.test('browser roles cannot reserve or settle arbitrary orders',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec('set role '+role);
        try {await assert.rejects(settle('tt_first'));await assert.rejects(db.query("select public.reserve_paystack_order(gen_random_uuid(),gen_random_uuid(),'tt_attack',150000,'NGN','test','x@example.com')"));}
        finally{await db.exec('reset role');}
      }
    });
  } finally {await db.close();}
});
