import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from services import screening_store


class RpcErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_link_failure_preserves_the_confirmed_payment_message(self):
        client = AsyncMock()
        client.post.return_value = httpx.Response(400, json={"code": "22P02"})
        with patch.object(screening_store, "configured", return_value=True), patch.object(screening_store, "get_http_client", return_value=client):
            store = screening_store.SupabaseStore()
            with self.assertRaises(HTTPException) as error:
                await store.rpc("ensure_screening_tenant_token", {})
            self.assertEqual(error.exception.status_code, 503)
            self.assertIn("Payment is confirmed", error.exception.detail)
            self.assertIn("Do not pay again", error.exception.detail)
            with self.assertRaises(HTTPException) as error:
                await store.rpc("fulfill_screening_payment", {})
            self.assertEqual(error.exception.status_code, 409)
            self.assertEqual(error.exception.detail, "Payment could not be finalized.")
