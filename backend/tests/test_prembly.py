import unittest
from unittest.mock import AsyncMock,patch
from fastapi import HTTPException
from config import settings
from services.prembly_service import PremblyService

class PremblyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self): self.service=PremblyService()

    def test_summary_requires_success_name_and_birth_date(self):
        good={"status":True,"response_code":"00","data":{"firstName":"Sample","lastName":"Tenant","dateOfBirth":"1990-01-01"}}
        self.assertEqual(self.service.summary(good,"Tenant Sample","1990-01-01")["status"],"matched")
        self.assertEqual(self.service.summary(good,"Another Person","1990-01-01")["status"],"needs_review")
        self.assertEqual(self.service.summary({**good,"status":False},"Sample Tenant","1990-01-01")["status"],"needs_review")
        self.assertEqual(self.service.summary({**good,"response_code":"01"},"Sample Tenant","1990-01-01")["status"],"needs_review")
        self.assertEqual(self.service.summary(good,"Sample Tenant","2000-01-01")["status"],"needs_review")
        self.assertNotIn("Sample",str(self.service.summary(good,"Sample Tenant","1990-01-01")))

    async def test_disabled_service_does_not_contact_provider(self):
        with patch.object(settings,'PREMBLY_CHECKS_ENABLED',False),patch('services.prembly_service.httpx.AsyncClient') as client:
            with self.assertRaises(HTTPException): await self.service.verify_bvn('11111111111')
            client.assert_not_called()

    async def test_provider_failure_retains_staff_review_and_does_not_retry(self):
        self.service._verify=AsyncMock(side_effect=HTTPException(503,'unavailable'))
        data=await self.service.check_intake({'full_name':'Sample Tenant','date_of_birth':'1990-01-01','bvn':'11111111111','nin':'22222222222'})
        self.assertEqual(self.service._verify.await_count,2)
        self.assertEqual(data['bvn']['status'],'needs_review');self.assertEqual(data['nin']['status'],'needs_review')
        self.assertNotIn('11111111111',str(data))

    async def test_success_uses_private_summary_only(self):
        self.service._verify=AsyncMock(return_value={'status':True,'data':{'first_name':'Sample','last_name':'Tenant','dob':'1990-01-01','photo':'PRIVATE PHOTO'}})
        result=await self.service.check_intake({'full_name':'Sample Tenant','date_of_birth':'1990-01-01','bvn':'11111111111','nin':'22222222222'})
        self.assertEqual(result['nin']['status'],'matched');self.assertNotIn('PRIVATE PHOTO',str(result))


    async def test_documented_paths_and_secret_header_are_server_side(self):
        import httpx
        response=httpx.Response(200,json={'status':True,'response_code':'00','data':{}})
        client=AsyncMock();client.post.return_value=response
        manager=AsyncMock();manager.__aenter__.return_value=client
        with patch.object(settings,'PREMBLY_CHECKS_ENABLED',True),patch.object(settings,'PREMBLY_SECRET_KEY','test_sk_synthetic'),patch('services.prembly_service.httpx.AsyncClient',return_value=manager):
            await self.service.verify_bvn('11111111111');await self.service.verify_nin('22222222222')
        calls=client.post.await_args_list
        self.assertTrue(calls[0].args[0].endswith('/api/v1/verification/api/bvn_basic/'))
        self.assertTrue(calls[1].args[0].endswith('/api/v1/verification/api/nin_basic/'))
        self.assertEqual(calls[0].kwargs['json'],{'number':'11111111111'})
        self.assertEqual(calls[0].kwargs['headers']['x-api-key'],'test_sk_synthetic')


    def test_live_checkout_requires_live_prembly_and_keeps_credit_disabled(self):
        import base64
        from routers.screenings import _package_availability
        with patch.multiple(settings, SCREENING_IDENTITY_MODE='prembly',PREMBLY_CHECKS_ENABLED=True,PREMBLY_SECRET_KEY='live_sk_synthetic',SCREENING_V2_ENABLED=True,SCREENING_PRICES_CONFIRMED=True,ENCRYPTION_KEY=base64.b64encode(b'x'*32).decode(),PAYSTACK_SECRET_KEY='sk_live_synthetic',ENVIRONMENT='production',SUPABASE_URL='https://example.invalid',SUPABASE_ANON_KEY='synthetic',SUPABASE_SERVICE_ROLE_KEY='synthetic',MONO_CREDIT_CHECKS_ENABLED=False):
            self.assertTrue(_package_availability('basic_v2')[0])
            self.assertFalse(_package_availability('intermediate_v2')[0])
            with patch.object(settings,'PREMBLY_SECRET_KEY','test_sk_synthetic'):self.assertFalse(_package_availability('basic_v2')[0])
            with patch.object(settings,'PAYSTACK_SECRET_KEY','sk_test_synthetic'):self.assertFalse(_package_availability('basic_v2')[0])
