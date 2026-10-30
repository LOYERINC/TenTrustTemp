import base64
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from routers import screening_evidence as api, screenings
from services import manual_identity as vault

KEY = base64.b64encode(b'x' * 32).decode()
SID = '00000000-0000-0000-0000-000000000001'
DETAILS = {'full_name': 'Synthetic Tenant', 'bvn': '11111111111', 'nin': '22222222222', 'date_of_birth': '1990-01-01'}


class EncryptionTests(unittest.TestCase):
    def test_case_bound_ciphertext_and_invalid_key_fail_closed(self):
        with patch.object(vault.settings, 'ENCRYPTION_KEY', KEY):
            encrypted = vault.encrypt(DETAILS, SID)
            self.assertNotIn(DETAILS['bvn'], encrypted)
            self.assertEqual(vault.decrypt(encrypted, SID), DETAILS)
            with self.assertRaises(HTTPException): vault.decrypt(encrypted, 'another-case')
            with self.assertRaises(HTTPException): vault.decrypt(encrypted[:-8] + 'tampered', SID)
        with patch.object(vault.settings, 'ENCRYPTION_KEY', ''):
            self.assertFalse(vault.encryption_ready())
            with self.assertRaises(HTTPException): vault.encrypt(DETAILS, SID)

    def test_manual_basic_is_separate_from_bureau_credit_and_provider_validation(self):
        with patch.multiple(vault.settings, ENCRYPTION_KEY=KEY, SCREENING_IDENTITY_MODE='manual',
              ENVIRONMENT='production', SCREENING_V2_ENABLED=True, SCREENING_PRICES_CONFIRMED=True,
              PAYSTACK_SECRET_KEY='sk_live_synthetic', MONO_SECRET_KEY='', MONO_IDENTITY_CHECKS_ENABLED=False,
              MONO_CREDIT_CHECKS_ENABLED=True, SUPABASE_URL='https://example.invalid',
              SUPABASE_ANON_KEY='synthetic', SUPABASE_SERVICE_ROLE_KEY='synthetic'):
            self.assertTrue(screenings._package_availability('basic_v2')[0])
            self.assertFalse(screenings._package_availability('intermediate_v2')[0])
            self.assertEqual(screenings._public_package('basic_v2')['verification_mode'], 'manual')
            self.assertNotIn('bvn', screenings._public_package('basic_v2')['checks'])
            with patch.object(vault.settings, 'ENCRYPTION_KEY', ''):
                self.assertFalse(screenings._package_availability('basic_v2')[0])


class CheckoutReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_private_columns_cannot_initialize_a_charge(self):
        from services import payment_orders
        store = AsyncMock()
        store.request.side_effect = HTTPException(400, 'missing columns')
        row = {'id': SID, 'payment_status': 'unpaid', 'check_status': {'identity_method': 'manual_review'}}
        with patch.object(vault.settings, 'ENCRYPTION_KEY', KEY), patch.object(payment_orders, 'get_http_client') as provider:
            with self.assertRaises(HTTPException) as error:
                await payment_orders.initialize(store, row, {'id': 'owner'}, {'price': 1500})
            self.assertEqual(error.exception.status_code, 503)
            store.rpc.assert_not_awaited(); provider.assert_not_called()


class ManualRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI(); self.app.include_router(api.router)
        self.client = TestClient(self.app); self.store = AsyncMock()
        self.row = {'id': SID, 'package_id': 'basic_v2', 'status': 'awaiting_tenant',
                    'check_status': {'identity_method': 'manual_review', 'identity': 'pending_review'}}
        self.token = {'id': 'token'}

    def session(self):
        return patch.object(api, 'session', AsyncMock(return_value=(self.store, self.token, self.row)))

    def test_landlord_must_acknowledge_the_manual_service_before_purchase(self):
        app = FastAPI(); app.include_router(screenings.router)
        with patch.object(vault.settings, 'SCREENING_IDENTITY_MODE', 'manual'), \
             patch.object(screenings, 'authenticated_user', AsyncMock(return_value={'id': 'owner'})), \
             patch.object(screenings, 'SupabaseStore') as store:
            result = TestClient(app).post('/api/screenings', json={
                'package_id': 'basic_v2', 'tenant_name': 'Synthetic Tenant', 'tenant_phone': '08000000000', 'monthly_rent': 100000})
            self.assertEqual(result.status_code, 422); store.assert_not_called()

    def staff(self):
        async def admin(): return {'id': 'staff'}
        self.app.dependency_overrides[api.require_admin] = admin

    def test_intake_is_encrypted_and_never_calls_mono_or_marks_verified(self):
        self.store.patch.return_value = [{'id': 'challenge'}]
        with self.session(), patch.object(api, 'evidence', AsyncMock(return_value={'id': 'challenge'})), \
             patch.object(vault.settings, 'ENCRYPTION_KEY', KEY), \
             patch.object(api.mono_service, 'verify_identity', AsyncMock()) as mono:
            result = self.client.post('/api/public/screenings/t/steps/identity', json=DETAILS)
            self.assertEqual(result.status_code, 200)
            self.assertFalse(result.json()['verified']); mono.assert_not_awaited()
            private = self.store.patch.await_args_list[0].args[2]
            self.assertEqual(vault.decrypt(private['identity_intake_encrypted'], SID), DETAILS)
            public = self.store.patch.await_args_list[1].args[2]
            self.assertNotIn('identity_verified_at', public)
            self.assertNotIn(DETAILS['bvn'], str(public)); self.assertNotIn(DETAILS['nin'], str(public))
            self.assertEqual(public['check_status']['identity'], 'pending_review')

    def test_duplicate_intake_is_not_overwritten(self):
        self.store.patch.return_value = []
        with self.session(), patch.object(api, 'evidence', AsyncMock(return_value={'id': 'challenge'})), patch.object(vault.settings, 'ENCRYPTION_KEY', KEY):
            result = self.client.post('/api/public/screenings/t/steps/identity', json=DETAILS)
            self.assertEqual(result.status_code, 409)
            self.assertEqual(self.store.patch.await_count, 1)
            self.assertEqual(self.store.patch.await_args.args[1]['identity_intake_encrypted'], 'is.null')

    def test_submit_queues_manual_review_without_credit_or_identity_calls(self):
        self.store.rpc.return_value = True
        with self.session(), patch.object(api, 'identity_ready', AsyncMock(return_value=True)), \
             patch.object(api, 'evidence', AsyncMock(return_value={'id': 'video'})), \
             patch.object(api.mono_service, 'lookup_credit_history', AsyncMock()) as credit:
            result = self.client.post('/api/public/screenings/t/steps/submit', json={})
            self.assertEqual(result.status_code, 200); credit.assert_not_awaited()
            change = self.store.patch.await_args_list[0].args[2]
            self.assertEqual(change['status'], 'incomplete')
            self.assertEqual(change['check_status']['identity'], 'pending_review')

    def test_private_details_deny_anonymous_and_landlord(self):
        route = f'/api/admin/screenings/{SID}/identity-intake'
        self.assertEqual(self.client.get(route).status_code, 401)
        from routers import admin
        with patch.object(admin, 'authenticated_user', AsyncMock(return_value={'id': 'landlord', 'email_confirmed_at': 'today'})), \
             patch.object(admin, 'SupabaseStore') as store:
            store.return_value.get_one = AsyncMock(return_value=None)
            self.assertEqual(self.client.get(route, headers={'Authorization': 'Bearer landlord'}).status_code, 403)

    def test_staff_read_is_case_bound_audited_and_not_cached(self):
        self.staff(); self.store.get_one.return_value = self.row
        with patch.object(vault.settings, 'ENCRYPTION_KEY', KEY):
            item = {'id': 'challenge', 'identity_intake_at': 'today', 'identity_intake_encrypted': vault.encrypt(DETAILS, SID)}
            with patch.object(api, 'SupabaseStore', return_value=self.store), patch.object(api, 'evidence', AsyncMock(return_value=item)):
                result = self.client.get(f'/api/admin/screenings/{SID}/identity-intake')
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json()['details'], DETAILS)
                self.assertFalse(result.json()['provider_verified'])
                self.assertEqual(result.headers['cache-control'], 'no-store')
                self.assertEqual(self.store.insert.await_args.args[1]['action'], 'identity_read')

    def test_staff_cannot_complete_without_explicit_manual_outcome(self):
        self.staff(); self.row['status'] = 'incomplete'
        self.store.get_one.side_effect = [self.row, {'consumed_at': 'today'}]
        with patch.object(api, 'SupabaseStore', return_value=self.store), \
             patch.object(api, 'identity_ready', AsyncMock(return_value=True)), \
             patch.object(api, 'evidence', AsyncMock(return_value={'id': 'video'})):
            result = self.client.post(f'/api/admin/screenings/{SID}/evidence-decision', json={'approved': True})
            self.assertEqual(result.status_code, 422); self.store.patch.assert_not_awaited()

    def test_final_report_says_manual_reviewed_and_keeps_notes_private(self):
        self.staff(); self.row['status'] = 'incomplete'
        self.store.get_one.side_effect = [self.row, {'consumed_at': 'today'}]
        with patch.object(api, 'SupabaseStore', return_value=self.store), \
             patch.object(api, 'identity_ready', AsyncMock(return_value=True)), \
             patch.object(api, 'evidence', AsyncMock(side_effect=[{'id': 'video'}, {'id': 'challenge'}])), \
             patch.object(vault.settings, 'ENCRYPTION_KEY', KEY):
            result = self.client.post(f'/api/admin/screenings/{SID}/evidence-decision', json={
                'approved': True, 'identity_outcome': 'reviewed', 'identity_notes': 'Synthetic staff review with limits noted.'})
            self.assertEqual(result.status_code, 200)
            public = self.store.patch.await_args_list[-1].args[2]
            self.assertEqual(public['check_status']['identity'], 'manual_reviewed')
            self.assertNotIn('status', public) # A review does not publish a report.
            self.assertNotIn('identity_verified_at', public)
            self.assertNotIn('Synthetic staff review', str(public))
            notes = self.store.patch.await_args_list[0].args[2]['identity_review_encrypted']
            self.assertEqual(vault.decrypt(notes, SID)['staff_id'], 'staff')


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.app=FastAPI();self.app.include_router(api.router)
        async def staff(): return {'id':'staff'}
        self.app.dependency_overrides[api.require_admin]=staff
        self.client=TestClient(self.app);self.store=AsyncMock()
        self.row={'id':SID,'status':'incomplete','payment_status':'paid','check_status':{'identity_method':'manual_review','liveness':'verified'}}
        self.private={'outcome':'verified','reviewed_at':'today','notes':'PRIVATE NOTES','report_draft':{'body':'The submitted information was reviewed by our staff.','verdict':'verified'}}
        self.key=patch.object(vault.settings,'ENCRYPTION_KEY',KEY);self.key.start();self.addCleanup(self.key.stop)
        self.item={'id':'challenge','identity_intake_encrypted':vault.encrypt(DETAILS,SID),'identity_review_encrypted':vault.encrypt(self.private,SID)}
        self.context=patch.object(api,'manual_report_context',AsyncMock(return_value=(self.store,self.row,self.item,self.private)))
        self.context.start();self.addCleanup(self.context.stop)
        self.store.get_one.return_value={'consumed_at':'today'};self.store.patch.return_value=[self.row]
        self.video=patch.object(api,'evidence',AsyncMock(return_value={'id':'video'}));self.video.start();self.addCleanup(self.video.stop)

    def test_draft_stays_encrypted_and_preserves_private_review(self):
        r=self.client.put(f'/api/admin/screenings/{SID}/report-draft',json={'body':'A private unfinished draft.','verdict':'reviewed'})
        self.assertEqual(r.status_code,200)
        table,params,change=self.store.patch.await_args.args
        self.assertEqual(table,'screening_private_evidence');self.assertIn('identity_review_encrypted',params)
        self.assertNotIn('unfinished',str(change))
        saved=vault.decrypt(change['identity_review_encrypted'],SID)
        self.assertEqual(saved['notes'],'PRIVATE NOTES');self.assertEqual(saved['report_draft']['body'],'A private unfinished draft.')

    def test_publish_copies_only_public_fields_and_completes(self):
        r=self.client.post(f'/api/admin/screenings/{SID}/report-publish')
        self.assertEqual(r.status_code,200)
        table,params,change=self.store.patch.await_args.args
        self.assertEqual(table,'screening_requests');self.assertEqual(change['status'],'complete')
        self.assertEqual(change['credit_report']['verdict'],'verified')
        self.assertNotIn('PRIVATE NOTES',str(change));self.assertNotIn(DETAILS['bvn'],str(change))
        self.assertEqual(params['completed_at'],'is.null')

    def test_verified_requires_explicit_verified_review_and_passed_video(self):
        for outcome,video in [('reviewed','verified'),('verified','needs_review')]:
            self.private['outcome']=outcome;self.row['check_status']['liveness']=video
            self.assertEqual(self.client.post(f'/api/admin/screenings/{SID}/report-publish').status_code,409)
        self.store.patch.assert_not_awaited()

    def test_publish_rejects_full_private_ids_birth_date_and_empty_text(self):
        for text in ['   ', 'BVN: 111-111-111-11, reviewed by staff.', 'Birth date: 01/01/1990 was provided.']:
            self.private['report_draft']['body']=text
            self.assertEqual(self.client.post(f'/api/admin/screenings/{SID}/report-publish').status_code,422)
        self.store.patch.assert_not_awaited()

    def test_duplicate_publish_is_idempotent_and_conflicts_are_rejected(self):
        self.row.update(status='complete',credit_report={'type':'manual_staff_report',**self.private['report_draft'],'revision':1})
        self.assertEqual(self.client.post(f'/api/admin/screenings/{SID}/report-publish').status_code,200)
        self.store.patch.assert_not_awaited()
        self.private['report_draft']['body']='A changed report that needs a new revision.'
        self.store.patch.return_value=[]
        self.assertEqual(self.client.post(f'/api/admin/screenings/{SID}/report-publish').status_code,409)

    def test_staff_draft_response_is_not_cached(self):
        r=self.client.get(f'/api/admin/screenings/{SID}/report-draft')
        self.assertEqual(r.status_code,200);self.assertEqual(r.headers['cache-control'],'no-store')
        self.assertNotIn('PRIVATE NOTES',r.text)


    def test_short_report_can_be_published_without_minimum_length(self):
        self.private['report_draft']['body']='Verified.'
        self.assertEqual(self.client.post(f'/api/admin/screenings/{SID}/report-publish').status_code,200)
