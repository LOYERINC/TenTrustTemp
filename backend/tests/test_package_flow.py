import io
import unittest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from routers import screening_evidence as api
from services.package_policy import statement_required, NEW_PACKAGES

class PolicyTests(unittest.TestCase):
 def test_live_payment_cannot_buy_sandbox_identity_checks(self):
  from routers import screenings
  with patch.multiple(screenings.settings, ENVIRONMENT='production', SCREENING_V2_ENABLED=True,
       SCREENING_PRICES_CONFIRMED=True, PAYSTACK_SECRET_KEY='sk_live_synthetic',
       MONO_SECRET_KEY='test_sk_synthetic', MONO_IDENTITY_CHECKS_ENABLED=True,
       MONO_CREDIT_CHECKS_ENABLED=True, SUPABASE_URL='https://example.invalid',
       SUPABASE_ANON_KEY='synthetic', SUPABASE_SERVICE_ROLE_KEY='synthetic'):
   for package in ('basic_v2','intermediate_v2','identity'):
    enabled,reasons=screenings._package_availability(package)
    self.assertFalse(enabled)
    self.assertIn('Live ID checks must be configured before accepting real payments.',reasons)
   with patch.object(screenings.settings,'MONO_SECRET_KEY','live_sk_synthetic'):
    self.assertTrue(screenings._package_availability('basic_v2')[0])
    self.assertTrue(screenings._package_availability('intermediate_v2')[0])
 def test_threshold(self):
  for rent in (1,499999,500000): self.assertFalse(statement_required('intermediate_v2',rent))
  for rent in (500000.01,500001,900000): self.assertTrue(statement_required('intermediate_v2',rent))
  for pkg in ('basic_v2','custom_v2','basic','identity'): self.assertFalse(statement_required(pkg,900000))
  for rent in (None,'bad','NaN','Infinity'): self.assertFalse(statement_required('intermediate_v2',rent))
 def test_catalog(self):
  self.assertEqual(len(NEW_PACKAGES),3)
  self.assertEqual(NEW_PACKAGES['basic_v2']['price'],1500)
  self.assertEqual(NEW_PACKAGES['intermediate_v2']['price'],3000)
  self.assertIsNone(NEW_PACKAGES['custom_v2']['price'])
 def test_pdf_validation(self):
  writer=PdfWriter();writer.add_blank_page(width=100,height=100);out=io.BytesIO();writer.write(out);api.validate_pdf(out.getvalue())
  for body in (b'not PDF',b'%PDF-1.7 broken'):
   with self.assertRaises(HTTPException): api.validate_pdf(body)
  writer.encrypt('secret');out=io.BytesIO();writer.write(out)
  with self.assertRaises(HTTPException): api.validate_pdf(out.getvalue())

class RouteTests(unittest.TestCase):
 def setUp(self):
  app=FastAPI();app.include_router(api.router);self.client=TestClient(app);self.store=AsyncMock()
  self.row={'id':'00000000-0000-0000-0000-000000000001','package_id':'intermediate_v2','monthly_rent':500001,'identity_verified_at':'2026-10-28','check_status':{}}
 def session(self): return patch.object(api,'session',AsyncMock(return_value=(self.store,{'id':'token'},self.row)))
 def test_statement_basic_rejected(self):
  self.row['package_id']='basic_v2'
  with self.session(): r=self.client.put('/api/public/screenings/t/steps/evidence/statement',content=b'test')
  self.assertEqual(r.status_code,409)
 def test_statement_at_threshold_rejected(self):
  self.row['monthly_rent']=500000
  with self.session(): r=self.client.put('/api/public/screenings/t/steps/evidence/statement',content=b'test')
  self.assertEqual(r.status_code,409)
 def test_bad_file_and_size(self):
  with self.session(),patch.object(api,'evidence',AsyncMock(return_value=None)):
   r=self.client.put('/api/public/screenings/t/steps/evidence/statement',content=b'test',headers={'content-type':'text/plain'});self.assertEqual(r.status_code,422)
   r=self.client.put('/api/public/screenings/t/steps/evidence/statement',content=b'x'*(api.LIMIT+1),headers={'content-type':'application/pdf'});self.assertEqual(r.status_code,413)
 def test_cannot_skip_statement(self):
  with self.session(),patch.object(api,'evidence',AsyncMock(side_effect=[{'id':'video'},None])),patch.object(api.mono_service,'lookup_credit_history',AsyncMock()) as credit:
   r=self.client.post('/api/public/screenings/t/steps/submit',json={'bvn':'22227777222'})
   self.assertEqual(r.status_code,422);credit.assert_not_awaited();self.store.rpc.assert_not_awaited()
 def test_cannot_skip_liveness(self):
  with self.session(),patch.object(api,'evidence',AsyncMock(return_value=None)):
   r=self.client.post('/api/public/screenings/t/steps/submit',json={});self.assertEqual(r.status_code,422)
 def test_staff_file_requires_auth(self):
  r=self.client.get('/api/admin/screening-evidence/00000000-0000-0000-0000-000000000001/file');self.assertEqual(r.status_code,401)
 def test_basic_skips_statement_and_credit(self):
  self.row['package_id']='basic_v2'
  with self.session(),patch.object(api,'evidence',AsyncMock(return_value={'id':'video'})),patch.object(api.mono_service,'lookup_credit_history',AsyncMock()) as credit:
   r=self.client.post('/api/public/screenings/t/steps/submit',json={});self.assertEqual(r.status_code,200);self.assertEqual(r.json()['status'],'pending_review');credit.assert_not_awaited()
   self.assertEqual(self.store.patch.await_args_list[0].args[2]['status'],'incomplete')

class PrivacyAndSubmitTests(unittest.TestCase):
 setUp=RouteTests.setUp
 session=RouteTests.session
 def test_landlord_cannot_download_evidence(self):
  from routers import admin
  with patch.object(admin,'authenticated_user',AsyncMock(return_value={'id':'landlord','email_confirmed_at':'2026-10-28'})),patch.object(admin,'SupabaseStore') as store:
   store.return_value.get_one=AsyncMock(return_value=None)
   r=self.client.get('/api/admin/screening-evidence/00000000-0000-0000-0000-000000000001/file',headers={'Authorization':'Bearer landlord'})
   self.assertEqual(r.status_code,403)
 def test_credit_bvn_must_match_identity(self):
  with self.session(),patch.object(api,'evidence',AsyncMock(side_effect=[{'id':'video'},{'id':'statement'},{'identity_binding':api.binding(self.row['id'],'22227777222')}])),patch.object(api.settings,'MONO_CREDIT_CHECKS_ENABLED',True),patch.object(api.mono_service,'lookup_credit_history',AsyncMock()) as credit:
   r=self.client.post('/api/public/screenings/t/steps/submit',json={'bvn':'11111111111'})
   self.assertEqual(r.status_code,422);credit.assert_not_awaited()
 def test_intermediate_at_threshold_submits_without_statement(self):
  self.row['monthly_rent']=500000
  with self.session(),patch.object(api,'evidence',AsyncMock(side_effect=[{'id':'video'},{'identity_binding':api.binding(self.row['id'],'22227777222')}])),patch.object(api.settings,'MONO_CREDIT_CHECKS_ENABLED',True),patch.object(api.mono_service,'lookup_credit_history',AsyncMock(return_value={'status':'successful','data':{'credit_result':'no_adverse_flags'}})) as credit:
   r=self.client.post('/api/public/screenings/t/steps/submit',json={'bvn':'22227777222'})
   self.assertEqual(r.status_code,200);credit.assert_awaited_once()
   self.assertNotIn('statement_review',self.store.patch.await_args_list[0].args[2]['check_status'])
 def test_intermediate_over_threshold_submits_pending_private_review(self):
  with self.session(),patch.object(api,'evidence',AsyncMock(side_effect=[{'id':'video'},{'id':'statement'},{'identity_binding':api.binding(self.row['id'],'22227777222')}])),patch.object(api.settings,'MONO_CREDIT_CHECKS_ENABLED',True),patch.object(api.mono_service,'lookup_credit_history',AsyncMock(return_value={'status':'successful','data':{'credit_result':'needs_review'}})):
   r=self.client.post('/api/public/screenings/t/steps/submit',json={'bvn':'22227777222'})
   self.assertEqual(r.status_code,200)
   changes=self.store.patch.await_args_list[0].args[2]
   self.assertEqual(changes['check_status']['statement_review'],'pending_review')
   self.assertEqual(changes['check_status']['credit_result'],'needs_review')
   self.assertNotIn('object_key',r.text)

class ReviewBoundaryTests(unittest.TestCase):
 def setUp(self):
  self.app=FastAPI();self.app.include_router(api.router);self.app.dependency_overrides[api.require_admin]=lambda:{'id':'staff'};self.client=TestClient(self.app)
  self.store=AsyncMock();self.row={'id':'00000000-0000-0000-0000-000000000001','package_id':'intermediate_v2','monthly_rent':500001,'identity_verified_at':'2026-10-28','status':'incomplete','check_status':{'identity':'verified','credit_bureau':'complete'}}
 def test_staff_cannot_finalize_missing_statement_review(self):
  self.store.get_one.side_effect=[self.row,{'consumed_at':'2026-10-28'}]
  with patch.object(api,'SupabaseStore',return_value=self.store),patch.object(api,'evidence',AsyncMock(return_value={'id':'video'})):
   r=self.client.post('/api/admin/screenings/'+self.row['id']+'/evidence-decision',json={'approved':True})
   self.assertEqual(r.status_code,422);self.store.patch.assert_not_awaited()
 def test_staff_review_generates_only_final_result(self):
  self.store.get_one.side_effect=[self.row,{'consumed_at':'2026-10-28'}]
  with patch.object(api,'SupabaseStore',return_value=self.store),patch.object(api,'evidence',AsyncMock(return_value={'id':'private-item','object_key':'private/path.pdf'})):
   r=self.client.post('/api/admin/screenings/'+self.row['id']+'/evidence-decision',json={'approved':False,'statement_covers_three_months':True,'affordability':'review'})
   self.assertEqual(r.status_code,200)
   changes=self.store.patch.await_args.args[2]
   self.assertEqual(changes['check_status']['liveness'],'needs_review')
   self.assertEqual(changes['check_status']['affordability'],'review')
   self.assertNotIn('object_key',str(changes));self.assertNotIn('private/path',str(changes));self.assertTrue(changes['report_id'])
 def test_incomplete_month_coverage_can_only_be_needs_review(self):
  self.store.get_one.side_effect=[self.row,{'consumed_at':'2026-10-28'}]
  with patch.object(api,'SupabaseStore',return_value=self.store),patch.object(api,'evidence',AsyncMock(return_value={'id':'private-item'})):
   r=self.client.post('/api/admin/screenings/'+self.row['id']+'/evidence-decision',json={'approved':False,'statement_covers_three_months':False,'affordability':'review'})
   self.assertEqual(r.status_code,200)
   self.assertEqual(self.store.patch.await_args.args[2]['check_status']['affordability'],'review')
 def test_incomplete_month_coverage_cannot_pass_affordability(self):
  self.store.get_one.side_effect=[self.row,{'consumed_at':'2026-10-28'}]
  with patch.object(api,'SupabaseStore',return_value=self.store),patch.object(api,'evidence',AsyncMock(return_value={'id':'private-item'})):
   r=self.client.post('/api/admin/screenings/'+self.row['id']+'/evidence-decision',json={'approved':False,'statement_covers_three_months':False,'affordability':'pass'})
   self.assertEqual(r.status_code,422);self.store.patch.assert_not_awaited()
 def test_declined_case_cannot_be_finalized(self):
  self.row['status']='declined';self.store.get_one.return_value=self.row
  with patch.object(api,'SupabaseStore',return_value=self.store):
   r=self.client.post('/api/admin/screenings/'+self.row['id']+'/evidence-decision',json={'approved':True})
   self.assertEqual(r.status_code,409);self.store.patch.assert_not_awaited()

class ChallengeTests(unittest.TestCase):
 setUp=RouteTests.setUp
 session=RouteTests.session
 def test_racing_load_reuses_existing_challenge(self):
  self.store.request.return_value=[]
  with self.session(),patch.object(api,'evidence',AsyncMock(side_effect=[None,{'challenge':'123456'},None,None])):
   r=self.client.get('/api/public/screenings/t/steps')
   self.assertEqual(r.status_code,200);self.assertEqual(r.json()['challenge'],'123456')
   self.assertEqual(self.store.request.await_args.kwargs['headers']['Prefer'],'resolution=ignore-duplicates,return=representation')

if __name__=='__main__': unittest.main()
