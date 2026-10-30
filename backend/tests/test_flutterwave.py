import unittest
from unittest.mock import AsyncMock, patch

import httpx

from routers import screenings


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.get = AsyncMock(return_value=response)
        self.post = AsyncMock(return_value=response)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


class FlutterwaveVerificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_verification_normalizes_success_and_converts_naira_to_kobo(self):
        response = httpx.Response(200, json={
            "status": "success",
            "data": {"status": "successful", "tx_ref": "tt_example", "amount": 7000, "currency": "NGN"},
        })
        client = FakeClient(response)
        with patch.object(screenings.settings, "FLW_SECRET_KEY", "test-secret"), patch.object(screenings, "get_http_client", return_value=client):
            transaction = await screenings._verify_payment({"provider": "flutterwave"}, "tt_example")

        self.assertEqual(transaction["provider"], "flutterwave")
        self.assertEqual(transaction["status"], "success")
        self.assertEqual(transaction["reference"], "tt_example")
        self.assertEqual(transaction["amount"], 700000)
        self.assertEqual(transaction["currency"], "NGN")
        client.get.assert_awaited_once()
        self.assertEqual(client.get.await_args.args[0], "https://api.flutterwave.com/v3/transactions/verify_by_reference")
        self.assertEqual(client.get.await_args.kwargs["params"], {"tx_ref": "tt_example"})

    async def test_unpaid_flutterwave_transaction_stays_unpaid(self):
        response = httpx.Response(200, json={
            "status": "success",
            "data": {"status": "failed", "tx_ref": "tt_example", "amount": 7000, "currency": "NGN"},
        })
        client = FakeClient(response)
        with patch.object(screenings.settings, "FLW_SECRET_KEY", "test-secret"), patch.object(screenings, "get_http_client", return_value=client):
            transaction = await screenings._verify_payment({"provider": "flutterwave"}, "tt_example")

        self.assertEqual(transaction["status"], "failed")

    async def test_wrong_amount_is_not_fulfilled(self):
        class Store:
            rpc = AsyncMock()

            async def get_one(self, _table, _params):
                return {
                    "package_id": "standard", "provider": "flutterwave", "amount_kobo": 700000,
                    "currency": "NGN", "screening_id": "screening-1", "landlord_id": "landlord-1",
                }

        store = Store()
        with self.assertRaises(screenings.HTTPException) as error:
            await screenings._fulfill_payment(store, "tt_example", {
                "provider": "flutterwave", "status": "success", "reference": "tt_example",
                "amount": 699999, "currency": "NGN",
            })
        self.assertEqual(error.exception.status_code, 400)
        store.rpc.assert_not_awaited()

    async def test_verified_flutterwave_payment_fulfills_exactly_once(self):
        class Store:
            rpc = AsyncMock()

            async def get_one(self, _table, _params):
                return {
                    "package_id": "standard", "provider": "flutterwave", "amount_kobo": 700000,
                    "currency": "NGN", "screening_id": "screening-1", "landlord_id": "landlord-1",
                }

        store = Store()
        completed_row = {"id": "screening-1", "status": "paid_ready"}
        with patch.object(screenings, "_owner_screening", new=AsyncMock(return_value=completed_row)):
            result = await screenings._fulfill_payment(store, "tt_example", {
                "provider": "flutterwave", "status": "success", "reference": "tt_example",
                "amount": 700000, "currency": "NGN",
            })

        self.assertEqual(result, completed_row)
        store.rpc.assert_awaited_once_with("fulfill_screening_payment", {
            "p_reference": "tt_example", "p_amount_kobo": 700000, "p_currency": "NGN",
        })

    async def test_checkout_uses_server_price_and_flutterwave_link(self):
        response = httpx.Response(200, json={"status": "success", "data": {"link": "https://checkout.flutterwave.com/v3/hosted/pay/example"}})
        client = FakeClient(response)

        class Store:
            def __init__(self):
                self.inserted_payment = None
                self.patches = []

            async def get_one(self, *_args, **_kwargs):
                return None

            async def insert(self, _table, payload):
                self.inserted_payment = payload
                return {"id": "payment-1", **payload}

            async def patch(self, table, params, payload):
                self.patches.append((table, params, payload))
                return [{"id": "payment-1"}]

        store = Store()
        screening_row = {
            "id": "screening-1", "landlord_id": "landlord-1", "landlord_email": "landlord@example.com",
            "package_id": "standard", "payment_status": "unpaid", "intake_mode": "direct",
        }
        with (
            patch.object(screenings, "authenticated_user", new=AsyncMock(return_value={"id":"landlord-1","email":"landlord@example.com"})),
            patch.object(screenings, "SupabaseStore", return_value=store),
            patch.object(screenings, "_owner_screening", new=AsyncMock(return_value=screening_row)),
            patch.object(screenings, "_public_package", return_value={"id": "standard", "price": 7000, "enabled": True}),
            patch.object(screenings.settings, "PAYMENT_PROVIDER", "flutterwave"),
            patch.object(screenings.settings, "FLW_SECRET_KEY", "test-secret"),
            patch.object(screenings.settings, "PAYMENT_CALLBACK_URL", "https://app.example/dashboard?tab=verify-tenant"),
            patch.object(screenings.httpx, "AsyncClient", return_value=client),
        ):
            result = await screenings.initialize_checkout("screening-1", authorization="Bearer token")

        self.assertEqual(result["authorization_url"], "https://checkout.flutterwave.com/v3/hosted/pay/example")
        self.assertEqual(store.inserted_payment["amount_kobo"], 700000)
        self.assertEqual(store.inserted_payment["provider"], "flutterwave")
        request_body = client.post.await_args.kwargs["json"]
        self.assertEqual(request_body["amount"], 7000)
        self.assertEqual(request_body["currency"], "NGN")
        self.assertEqual(request_body["customer"]["email"], "landlord@example.com")
        self.assertIn("screening=screening-1", request_body["redirect_url"])
        self.assertIn(f"tx_ref={result['reference']}", request_body["redirect_url"])


if __name__ == "__main__":
    unittest.main()
