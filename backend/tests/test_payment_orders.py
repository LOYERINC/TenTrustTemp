import hashlib
import hmac
import json
import unittest
from unittest.mock import AsyncMock, patch
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from services import payment_orders as orders
from routers import screenings as api


def order(**values):
    return {'id':'order-1','screening_id':'screening-1','landlord_id':'user-1',
        'reference':'tt_existing','amount_kobo':150000,'currency':'NGN','provider':'paystack',
        'package_id':'basic_v2','mode':'test','status':'pending',**values}


def transaction(**values):
    return {'id':12345,'reference':'tt_existing','amount':150000,'currency':'NGN',
        'domain':'test','status':'success','provider':'paystack','paid_at':'2026-10-29T12:00:00Z',**values}


class SettlementTests(unittest.IsolatedAsyncioTestCase):
    async def test_webhook_and_backup_share_one_fulfillment(self):
        store=AsyncMock();store.rpc.return_value=order(status='paid')
        result=await orders.apply_transaction(store,order(),transaction())
        self.assertEqual(result['status'],'paid')
        self.assertEqual(store.rpc.await_args.args[0],'settle_paystack_order')
        self.assertEqual(store.rpc.await_args.args[1]['p_transaction_id'],'12345')

    async def test_amount_currency_user_mode_and_transaction_tampering_rejected(self):
        for change in [{'amount':1500},{'amount':True},{'currency':'USD'},{'domain':'live'},
                       {'reference':'tt_wrong'},{'metadata':{'user_id':'other'}},{'metadata':{'order_id':'other'}},{'id':None}]:
            store=AsyncMock()
            with self.assertRaises(HTTPException): await orders.apply_transaction(store,order(),transaction(**change))
            store.rpc.assert_not_awaited()

    async def test_pending_states_never_become_failed(self):
        for state in ['ongoing','pending','processing','queued','reversed','unknown']:
            store=AsyncMock();store.rpc.return_value=order()
            await orders.apply_transaction(store,order(),transaction(status=state))
            self.assertEqual(store.rpc.await_args.args[1]['p_status'],'pending')

    async def test_existing_paid_never_calls_provider_or_refulfills(self):
        store=AsyncMock()
        with patch.object(orders,'verify_transaction',AsyncMock()) as verify:
            await orders.refresh_order(store,order(status='paid'),force=True)
            verify.assert_not_awaited();store.rpc.assert_not_awaited()

    async def test_initialize_commits_order_first_and_includes_owner_metadata(self):
        store=AsyncMock();store.rpc.return_value={'created':True,'order':order(reference='tt_new')}
        client=AsyncMock()
        async def initialize(*args,**kwargs):
            store.rpc.assert_awaited_once()
            return httpx.Response(200,json={'status':True,'data':{'authorization_url':'https://checkout.paystack.com/example'}})
        client.post.side_effect=initialize
        with patch.object(orders,'get_http_client',return_value=client),patch.object(orders,'uuid4') as uuid,patch.object(orders.settings,'PUBLIC_APP_URL','http://localhost:3000'),patch.object(orders.settings,'ALLOWED_ORIGINS','http://localhost:3000,http://127.0.0.1:3000'),patch.object(orders.settings,'ENVIRONMENT','development'):
            uuid.return_value.hex='new'
            result=await orders.initialize(store,{'id':'screening-1','package_id':'basic_v2','landlord_email':'old@example.com'}, {'id':'user-1','email':'current@example.com'},{'price':1500},'http://127.0.0.1:3000')
        body=client.post.await_args.kwargs['json']
        self.assertEqual(body['amount'],150000);self.assertEqual(body['reference'],'tt_new')
        self.assertEqual(body['email'],'current@example.com')
        self.assertEqual(body['metadata']['order_id'],'order-1');self.assertEqual(body['metadata']['user_id'],'user-1')
        self.assertEqual(body['callback_url'],'http://127.0.0.1:3000/payments/return?reference=tt_new')
        self.assertIn('authorization_url',result)

    async def test_lost_initialization_acknowledgement_stays_pending(self):
        store=AsyncMock();store.rpc.return_value={'created':True,'order':order()};client=AsyncMock();client.post.side_effect=httpx.ReadTimeout('lost')
        with patch.object(orders,'get_http_client',return_value=client),patch.object(orders,'return_url',return_value='https://app.test/payments/return?reference=tt_existing'):
            result=await orders.initialize(store,{'id':'screening-1','package_id':'basic_v2','landlord_email':'owner@example.com'},{'id':'user-1'}, {'price':1500})
        self.assertEqual(result['status'],'pending');self.assertNotIn('authorization_url',result)
        store.patch.assert_not_awaited();self.assertEqual(store.rpc.await_count,1)

    async def test_pending_existing_checkout_is_rechecked_not_reinitialized(self):
        store=AsyncMock();store.rpc.return_value={'created':False,'order':order()};client=AsyncMock()
        with patch.object(orders,'get_http_client',return_value=client),patch.object(orders,'refresh_order',AsyncMock(return_value=order(status='paid'))),patch.object(orders,'return_url',return_value='https://app.test/payments/return?reference=tt_existing'):
            result=await orders.initialize(store,{'id':'screening-1','package_id':'basic_v2'},{'id':'user-1'}, {'price':1500})
        self.assertEqual(result['status'],'paid');client.post.assert_not_awaited()


class RouteTests(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(api.router);self.client=TestClient(app);self.store=AsyncMock();self.store.get_one.return_value=order()

    def signed(self,data):
        body=json.dumps({'event':'charge.success','data':data},indent=2).encode()
        return body,{'x-paystack-signature':hmac.new(b'test-secret',body,hashlib.sha512).hexdigest(),'content-type':'application/json'}

    def test_raw_body_signature_no_session_and_duplicate_ack(self):
        body,headers=self.signed(transaction());self.store.rpc.return_value=order(status='paid')
        with patch.object(api.settings,'PAYSTACK_SECRET_KEY','test-secret'),patch.object(api,'SupabaseStore',return_value=self.store),patch.object(orders,'verify_transaction',AsyncMock()) as verify:
            self.assertEqual(self.client.post('/api/paystack/webhook',content=body,headers=headers).status_code,200)
            self.store.get_one.return_value=order(status='paid')
            self.assertEqual(self.client.post('/api/payments/paystack/webhook',content=body,headers=headers).status_code,200)
            verify.assert_not_awaited();self.assertEqual(self.store.rpc.await_count,1)

    def test_wrong_signature_and_modified_raw_bytes_never_fulfill(self):
        body,headers=self.signed(transaction())
        with patch.object(api.settings,'PAYSTACK_SECRET_KEY','test-secret'),patch.object(api,'SupabaseStore',return_value=self.store):
            self.assertEqual(self.client.post('/api/paystack/webhook',content=body+b' ',headers=headers).status_code,401)
            self.assertEqual(self.client.post('/api/paystack/webhook',content=body,headers={'x-paystack-signature':'wrong'}).status_code,401)
        self.store.rpc.assert_not_awaited()

    def test_owner_cannot_read_or_recover_other_account(self):
        self.store.get_one.return_value=None
        with patch.object(api,'authenticated_user_id',AsyncMock(return_value='other')),patch.object(api,'SupabaseStore',return_value=self.store):
            self.assertEqual(self.client.get('/api/orders/tt_existing/status').status_code,404)
        self.assertEqual(self.store.get_one.await_args.args[1]['landlord_id'],'eq.other')
        with patch.object(api,'authenticated_user',AsyncMock(return_value={'id':'user-1','email':'me@example.com'})),patch.object(api,'SupabaseStore',return_value=self.store):
            self.assertEqual(self.client.post('/api/orders/recover',json={'email':'someone@example.com'}).status_code,400)

    def test_retry_late_success_never_starts_another_charge(self):
        with patch.object(api,'authenticated_user',AsyncMock(return_value={'id':'user-1'})),patch.object(api,'SupabaseStore',return_value=self.store),patch.object(orders,'refresh_order',AsyncMock(return_value=order(status='paid'))),patch.object(orders,'initialize',AsyncMock()) as initialize,patch.object(orders,'return_url',return_value='https://app.test/payments/return?reference=tt_existing'):
            result=self.client.post('/api/orders/tt_existing/retry')
            self.assertEqual(result.status_code,200);self.assertEqual(result.json()['status'],'paid');initialize.assert_not_awaited()

    def test_retry_starts_new_attempt_only_after_provider_confirms_closed(self):
        for state in ('failed','abandoned'):
            with patch.object(api,'authenticated_user',AsyncMock(return_value={'id':'user-1'})),patch.object(api,'SupabaseStore',return_value=self.store),patch.object(orders,'refresh_order',AsyncMock(return_value=order(status=state))) as verify,patch.object(api,'_owner_screening',AsyncMock(return_value={'package_id':'basic_v2'})),patch.object(api,'_public_package',return_value={'enabled':True,'price':1500}),patch.object(orders,'initialize',AsyncMock(return_value={'status':'pending','reference':'tt_new'})) as initialize:
                result=self.client.post('/api/orders/tt_existing/retry')
                self.assertEqual(result.status_code,200);initialize.assert_awaited_once()
                self.assertTrue(verify.await_args.kwargs['force'])

    def test_verification_outage_does_not_initialize_retry(self):
        with patch.object(api,'authenticated_user',AsyncMock(return_value={'id':'user-1'})),patch.object(api,'SupabaseStore',return_value=self.store),patch.object(orders,'refresh_order',AsyncMock(side_effect=HTTPException(503,'temporarily unavailable'))),patch.object(orders,'initialize',AsyncMock()) as initialize:
            self.assertEqual(self.client.post('/api/orders/tt_existing/retry').status_code,503)
            initialize.assert_not_awaited()

    def test_return_origin_is_allowlisted_and_canonical_fallback(self):
        with patch.object(orders.settings,'PUBLIC_APP_URL','https://www.tentrust.com.ng'),patch.object(orders.settings,'ALLOWED_ORIGINS','https://www.tentrust.com.ng'),patch.object(orders.settings,'ENVIRONMENT','production'):
            self.assertTrue(orders.return_url('tt_existing').startswith('https://www.tentrust.com.ng/payments/return?'))
            with self.assertRaises(HTTPException):orders.return_url('tt_existing','https://evil.test')
