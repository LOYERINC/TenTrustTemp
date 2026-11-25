import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi import HTTPException

from routers import screenings
from services.mono_service import MonoService


class IdentityServiceTests(unittest.IsolatedAsyncioTestCase):
    async def call_provider(self, response):
        sent = {}

        async def post(url, **kwargs):
            sent.update(url=url, payload=dict(kwargs['json']))
            return response

        client = AsyncMock()
        client.post.side_effect = post
        client.__aenter__.return_value = client
        service = MonoService()
        service.secret_key = 'test-key'
        with patch('services.mono_service.httpx.AsyncClient', return_value=client):
            result = await service.verify_identity(bvn='00000000001', nin='00000000002', date_of_birth='1990-01-01')
        return result, sent

    async def test_mashup_sends_both_identifiers_and_birth_date(self):
        result, sent = await self.call_provider(httpx.Response(200, json={
            'status': 'successful', 'data': {'personal_information': {'first_name': 'Example'}},
        }))
        self.assertTrue(sent['url'].endswith('/v3/lookup/mashup'))
        self.assertEqual(sent['payload'], {'bvn': '00000000001', 'nin': '00000000002', 'date_of_birth': '1990-01-01'})
        self.assertEqual(result['personal_information']['first_name'], 'Example')

    async def test_provider_failures_are_classified_without_echoing_private_details(self):
        for provider_status, expected in [(400, 422), (422, 422), (401, 503), (403, 503), (429, 503), (500, 503), (404, 502)]:
            with self.subTest(provider_status=provider_status):
                with self.assertRaises(HTTPException) as error:
                    await self.call_provider(httpx.Response(provider_status, json={'message': 'private-provider-echo'}))
                self.assertEqual(error.exception.status_code, expected)
                self.assertNotIn('private-provider-echo', error.exception.detail)

    async def test_malformed_provider_response_cannot_become_verified(self):
        with self.assertRaises(HTTPException) as error:
            await self.call_provider(httpx.Response(200, json={'status': 'successful', 'data': []}))
        self.assertEqual(error.exception.status_code, 502)


class IdentityRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_second_identifier_is_rejected_before_database_or_provider_calls(self):
        request = Mock()
        request.json = AsyncMock(return_value={'document_type': 'bvn', 'document_number': '00000000001', 'date_of_birth': '1990-01-01'})
        with patch.object(screenings, '_tenant_rate_limit'), patch.object(screenings, 'SupabaseStore') as store, patch.object(screenings.mono_service, 'verify_identity', AsyncMock()) as provider:
            with self.assertRaises(HTTPException) as error:
                await screenings.complete_public_identity('test-token', request)
        self.assertEqual(error.exception.status_code, 422)
        self.assertIn('NIN', error.exception.detail)
        store.assert_not_called()
        provider.assert_not_awaited()

    async def test_complete_request_sends_both_ids_and_never_persists_them(self):
        body = {'document_type': 'bvn', 'document_number': '00000000001', 'bvn': '00000000001', 'nin': '00000000002', 'date_of_birth': '1990-01-01'}
        request = Mock()
        request.json = AsyncMock(return_value=body)
        store = Mock()
        store.get_one = AsyncMock(side_effect=[
            {'id': 'token-id', 'screening_id': 'request-id', 'expires_at': '2099-01-01T00:00:00Z'},
            {'id': 'request-id', 'tenant_name': 'Example Tenant', 'status': 'awaiting_tenant'},
            {'version': screenings.settings.IDENTITY_CONSENT_VERSION},
        ])
        store.rpc = AsyncMock(return_value=[{'id': 'token-id'}])
        store.patch = AsyncMock()
        provider = AsyncMock(return_value={'personal_information': {'first_name': 'Example', 'surname': 'Tenant'}})
        with patch.object(screenings, '_tenant_rate_limit'), patch.object(screenings, 'SupabaseStore', return_value=store), patch.object(screenings.mono_service, 'verify_identity', provider), patch.object(screenings.settings, 'MONO_SECRET_KEY', 'test-key'), patch.object(screenings.settings, 'MONO_IDENTITY_CHECKS_ENABLED', True):
            result = await screenings.complete_public_identity('test-token', request)
        provider.assert_awaited_once_with(bvn='00000000001', nin='00000000002', date_of_birth='1990-01-01')
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['name_match'], 'match')
        persisted = str(store.patch.await_args_list)
        for private_value in ('00000000001', '00000000002', '1990-01-01'):
            self.assertNotIn(private_value, persisted)
        self.assertEqual(body['bvn'], '')
        self.assertEqual(body['nin'], '')
        self.assertEqual(body['date_of_birth'], '')
