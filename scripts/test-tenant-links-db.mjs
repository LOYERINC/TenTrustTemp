import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('paid requests can create and reuse a tenant link after the row projection repair', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const request = '22222222-2222-4222-8222-222222222222';
  const token = '33333333-3333-4333-8333-333333333333';
  const hash = 'a'.repeat(64);
  try {
    await db.exec(`create schema auth;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
    for (const name of ['202610020001_tenant_screenings.sql', '202610120002_identity_verification_mvp.sql', '202610120003_idempotent_tenant_link_issuance.sql']) {
      await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
    }
    await db.query('insert into auth.users(id) values($1)', [owner]);
    await db.query(`insert into public.screening_requests(id,landlord_id,package_id,intake_mode,tenant_name,tenant_phone,property_title,status,payment_status)
      values($1,$2,'basic','tenant_link','Example tenant','08000000000','Example property','awaiting_tenant','paid')`, [request, owner]);
    const issue = (id = token, replacement = null) => db.query(
      "select * from public.ensure_screening_tenant_token($1,$2,$3,$4,now()+interval '48 hours',$5)",
      [request, owner, id, hash, replacement]);
    await assert.rejects(issue(), error => error.code === '22P02');
    await db.exec(await readFile('supabase/migrations/202610250001_fix_tenant_token_returning.sql', 'utf8'));
    const first = (await issue()).rows[0];
    assert.equal(first.id, token);
    assert.equal(first.token_hash, hash);
    assert.ok(new Date(first.expires_at).getTime() > Date.now());
    const second = (await issue('44444444-4444-4444-8444-444444444444')).rows[0];
    assert.deepEqual(second, first);
    const rows = (await db.query('select * from public.screening_tenant_tokens')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].screening_id, request);
    assert.equal(rows[0].invalidated_at, null);
    await db.query("update public.screening_requests set payment_status='unpaid' where id=$1", [request]);
    await assert.rejects(issue(), /tenant link is unavailable/);
    await db.query("update public.screening_requests set payment_status='paid' where id=$1", [request]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(issue(), /permission denied/);
      await db.exec('reset role');
    }
  } finally {
    await db.close();
  }
});
