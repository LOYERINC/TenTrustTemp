import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from routers import admin

USER = {"id": "11111111-1111-4111-8111-111111111111", "email": "admin@example.com", "email_confirmed_at": "2026-10-22"}


class AdminAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_user_metadata_cannot_grant_membership(self):
        forged = {**USER, "user_metadata": {"role": "admin"}}
        store = MagicMock()
        store.get_one = AsyncMock(return_value=None)
        with patch.object(admin, "authenticated_user", AsyncMock(return_value=forged)), patch.object(admin, "SupabaseStore", return_value=store):
            with self.assertRaises(HTTPException) as failure:
                await admin.require_admin("Bearer test")
        self.assertEqual(failure.exception.status_code, 403)

    async def test_unconfirmed_membership_is_not_enough(self):
        with patch.object(admin, "authenticated_user", AsyncMock(return_value={**USER, "email_confirmed_at": None})), patch.object(admin, "SupabaseStore") as store:
            with self.assertRaises(HTTPException) as failure:
                await admin.require_admin("Bearer test")
            store.assert_not_called()
        self.assertEqual(failure.exception.status_code, 403)

    async def test_verified_member_is_allowed(self):
        store = MagicMock()
        store.get_one = AsyncMock(return_value={"active": True})
        with patch.object(admin, "authenticated_user", AsyncMock(return_value=USER)), patch.object(admin, "SupabaseStore", return_value=store):
            self.assertEqual(await admin.require_admin("Bearer test"), USER)
        self.assertEqual(store.get_one.await_args.args[1]["user_id"], f"eq.{USER['id']}")


class AdminRouteTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(admin.router)
        self.client = TestClient(app)

    def test_all_operations_require_auth(self):
        with patch.object(admin, "authenticated_user", AsyncMock(side_effect=HTTPException(401, "Sign in"))):
            for path in ["me", "overview", "users", "waitlist", "payments", "screenings", "emails"]:
                self.assertEqual(self.client.get(f"/api/admin/{path}").status_code, 401)
            response = self.client.post("/api/admin/emails/22222222-2222-4222-8222-222222222222/retry", json={"reason": "Provider restored"})
            self.assertEqual(response.status_code, 401)

    def test_pagination_privacy_and_filter_encoding(self):
        store = MagicMock()
        store.get_one = AsyncMock(return_value={"active": True})
        store.request = AsyncMock(return_value=[{"id": "1"}, {"id": "2"}])
        with patch.object(admin, "authenticated_user", AsyncMock(return_value=USER)), patch.object(admin, "SupabaseStore", return_value=store):
            response = self.client.get('/api/admin/screenings?limit=1&page=2&search=test%2Cstatus.eq.complete')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["has_more"])
        params = store.request.await_args.kwargs["params"]
        self.assertEqual(params["offset"], "1")
        self.assertNotIn("credit_report", params["select"])
        self.assertNotIn("monthly_income", params["select"])
        self.assertNotIn(",", params["tenant_name"])

    def test_retry_is_audited_atomic_rpc_and_ineligible_returns_conflict(self):
        store = MagicMock()
        store.get_one = AsyncMock(return_value={"active": True})
        store.rpc = AsyncMock(return_value=False)
        with patch.object(admin, "authenticated_user", AsyncMock(return_value=USER)), patch.object(admin, "SupabaseStore", return_value=store):
            response = self.client.post('/api/admin/emails/22222222-2222-4222-8222-222222222222/retry', json={"reason": "Provider restored"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(store.rpc.await_args.args[0], "retry_email_job")
        self.assertEqual(store.rpc.await_args.args[1]["p_actor"], USER["id"])
