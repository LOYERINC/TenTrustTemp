import base64
import copy
import json
import unittest
from datetime import datetime, timezone
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from config import settings
from routers.admin import require_admin
from verification import api
from verification.crypto import Vault, mask_identifier
from verification.providers import (
    MonoIdentityProvider,
    IdentityResult,
    IdentitySession,
    DisabledCreditProvider,
)
from verification.rules import (
    name_similarity,
    affordability,
    evidence_score,
    compare_identity,
)
from verification.service import VerificationService

TENANT = "11111111-1111-4111-8111-111111111111"
LANDLORD = "22222222-2222-4222-8222-222222222222"
ADMIN = "33333333-3333-4333-8333-333333333333"
OTHER = "44444444-4444-4444-8444-444444444444"
PROPERTY = "55555555-5555-4555-8555-555555555555"
BVN = "00000000001"
NIN = "00000000002"
FILE = {
    "content_base64": base64.b64encode(b"\xff\xd8\xfftest image").decode(),
    "content_type": "image/jpeg",
}
PURPOSES = [
    "identity",
    "liveness",
    "employment",
    "address",
    "references",
    "guarantor",
    "summary_sharing",
]


class RulesTests(unittest.TestCase):
    def test_names_ignore_order_punctuation_accents_and_absent_middle_names(self):
        for a, b in [
            ("Chukwu Ada", "Ada Chukwu"),
            ("Ada Mary Chukwu", "Ada Chukwu"),
            ("José O'Neil", "Jose ONeil"),
        ]:
            self.assertEqual(name_similarity(a, b), 1)
        self.assertEqual(name_similarity("", "Ada"), 0)
        self.assertLess(name_similarity("Jane Doe", "Wole Yusuf"), 0.7)

    def test_identity_mismatch_phone_and_duplicate_signals(self):
        a = {
            "verified": True,
            "name": "Ada Chukwu",
            "dob": "1990-01-01",
            "phone": "+2348012345678",
        }
        b = {**a, "phone": "08012345678"}
        self.assertEqual(compare_identity(a, b)["status"], "verified")
        self.assertEqual(
            compare_identity(a, {**b, "dob": "1991-01-01"})["status"], "failed"
        )
        self.assertEqual(
            compare_identity(a, {**b, "phone": "08000000000"})["status"], "review"
        )
        self.assertEqual(compare_identity(a, b, True)["status"], "review")
        self.assertEqual(
            compare_identity(a, {**b, "verified": False})["status"], "failed"
        )

    def test_integer_affordability_boundaries_and_self_declared_income(self):
        for rent, expected in [
            (40000, "pass"),
            (40001, "review"),
            (50000, "review"),
            (50001, "fail"),
        ]:
            self.assertEqual(affordability(rent, 100000, True)["result"], expected)
        self.assertEqual(affordability(30000, 100000, False)["result"], "review")
        for rent, income in [(1.2, 100), (1, 0), (True, 1)]:
            with self.assertRaises(ValueError):
                affordability(rent, income, True)

    def test_completion_score_never_makes_a_rental_decision_and_credit_is_ignored(self):
        values = dict(
            identity="verified",
            liveness="passed",
            affordability_result="pass",
            employment="verified",
            address="verified",
            references="positive",
        )
        result = evidence_score(**values)
        self.assertEqual(result["result"], "review")
        self.assertEqual(result["score"], 100)
        self.assertEqual(result, evidence_score(**values, credit="not_available"))
        self.assertEqual(
            evidence_score(**{**values, "liveness": "failed"})["result"], "review"
        )
        self.assertEqual(
            evidence_score(**{**values, "identity": "pending"})["result"], "pending"
        )
        self.assertTrue(
            any(
                "guarantor" in x
                for x in evidence_score(
                    **{**values, "employment": "unverified"}, guarantor="verified"
                )["reasons"]
            )
        )

    def test_masking(self):
        self.assertEqual(mask_identifier(BVN), "*******0001")


class AdditionalRulesTests(unittest.TestCase):
    def test_unverified_employment_with_and_without_guarantor_requires_human_review(
        self,
    ):
        data = dict(
            identity="verified",
            liveness="passed",
            affordability_result="review",
            employment="unverified",
            address="verified",
            references="positive",
        )
        for guarantor in ("not_required", "verified"):
            result = evidence_score(**data, guarantor=guarantor)
            self.assertEqual(result["result"], "review")
            self.assertTrue(any("Employment" in item for item in result["reasons"]))

    def test_name_matching_boundaries(self):
        record = dict(
            verified=True, name="Example Name", dob="1990-01-01", phone="08012345678"
        )
        for similarity, status in [
            (0.6999, "failed"),
            (0.70, "review"),
            (0.8499, "review"),
            (0.85, "verified"),
        ]:
            with patch("verification.rules.name_similarity", return_value=similarity):
                self.assertEqual(compare_identity(record, record)["status"], status)


class CryptoTests(unittest.TestCase):
    def setUp(self):
        self.patches = [
            patch.object(
                settings, "ENCRYPTION_KEY", base64.b64encode(b"k" * 32).decode()
            ),
            patch.object(settings, "HASH_PEPPER", "p" * 32),
        ]
        for p in self.patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in self.patches])

    def test_authenticated_randomized_encryption_and_peppered_hashes(self):
        vault = Vault()
        a = vault.encrypt(BVN, "case:subject:bvn")
        b = vault.encrypt(BVN, "case:subject:bvn")
        self.assertNotEqual(a, b)
        self.assertNotIn(BVN, a)
        self.assertEqual(vault.decrypt(a, "case:subject:bvn"), BVN)
        with self.assertRaises(HTTPException):
            vault.decrypt(a, "other:subject:bvn")
        self.assertNotEqual(vault.digest(BVN, "bvn"), vault.digest(BVN, "nin"))
        self.assertEqual(vault.digest(BVN, "bvn"), vault.digest(BVN, "bvn"))
        with patch.object(settings, "ENCRYPTION_KEY", "short"):
            with self.assertRaises(HTTPException):
                Vault()


class ProviderContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_documented_bvn_otp_and_nin_contracts_and_normalization(self):
        requests = []

        def handler(request):
            requests.append(
                (request.url.path, dict(request.headers), json.loads(request.content))
            )
            path = request.url.path
            if path.endswith("/initiate"):
                data = {"session_id": "mono-session", "methods": [{"method": "phone"}]}
            elif path.endswith("/verify"):
                data = None
            elif path.endswith("/details"):
                data = {
                    "first_name": "Ada",
                    "last_name": "Chukwu",
                    "dob": "1990-01-01",
                    "phone_number": "08012345678",
                    "bvn": BVN,
                    "extra": "never normalized",
                }
            else:
                data = {
                    "firstname": "Ada",
                    "surname": "Chukwu",
                    "birthdate": "01-01-1990",
                    "telephoneno": "08012345678",
                    "nin": NIN,
                    "photo": None,
                }
            return httpx.Response(200, json={"status": "successful", "data": data})

        original = httpx.AsyncClient
        with (
            patch.object(
                settings, "ENCRYPTION_KEY", base64.b64encode(b"k" * 32).decode()
            ),
            patch.object(settings, "HASH_PEPPER", "p" * 32),
            patch.object(settings, "MONO_SECRET_KEY", "test-key"),
            patch.object(settings, "MONO_IDENTITY_CHECKS_ENABLED", True),
            patch(
                "verification.providers.httpx.AsyncClient",
                side_effect=lambda **kwargs: original(
                    transport=httpx.MockTransport(handler)
                ),
            ),
        ):
            provider = MonoIdentityProvider(Vault())
            session = await provider.begin_bvn(BVN, "context")
            self.assertEqual(session.methods, ["phone"])
            await provider.send_otp("mono-session", "phone")
            bvn = await provider.complete_bvn("mono-session", "123456", "context")
            nin = await provider.lookup_nin(NIN, None, "context")
            self.assertEqual(bvn.name, "Ada Chukwu")
            self.assertEqual(nin.dob, "1990-01-01")
            self.assertNotIn("extra", vars(bvn))
            self.assertNotIn(BVN, bvn.audit_encrypted)
        self.assertEqual(
            [r[0] for r in requests],
            [
                "/v2/lookup/bvn/initiate",
                "/v2/lookup/bvn/verify",
                "/v2/lookup/bvn/details",
                "/v3/lookup/nin",
            ],
        )
        self.assertEqual(requests[0][2], {"bvn": BVN, "scope": "identity"})
        self.assertEqual(requests[1][2], {"method": "phone"})
        self.assertEqual(requests[2][2], {"otp": "123456"})
        self.assertEqual(requests[3][2], {"nin": NIN})
        self.assertEqual(requests[1][1]["x-session-id"], "mono-session")

    async def test_disabled_credit_cannot_make_network_requests(self):
        with patch(
            "httpx.AsyncClient",
            side_effect=AssertionError("credit must not call a provider"),
        ):
            self.assertEqual(
                (await DisabledCreditProvider().check())["status"], "not_available"
            )


class OperationalTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.patches = [
            patch.object(
                settings, "ENCRYPTION_KEY", base64.b64encode(b"k" * 32).decode()
            ),
            patch.object(settings, "HASH_PEPPER", "p" * 32),
        ]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [item.stop() for item in self.patches])

    async def test_shared_user_and_ip_limits_use_only_peppered_keys(self):
        repo = MagicMock()
        repo.rpc = AsyncMock(side_effect=[True, False])
        svc = VerificationService(repo, Vault(), MagicMock(), MagicMock())
        with self.assertRaises(HTTPException) as error:
            await svc.rate_limit(TENANT, "192.0.2.1")
        self.assertEqual(error.exception.status_code, 429)
        self.assertEqual(repo.rpc.await_count, 2)
        for call in repo.rpc.await_args_list:
            self.assertNotIn(TENANT, call.kwargs["key"])
            self.assertNotIn("192.0.2.1", call.kwargs["key"])

    async def test_webhook_authentication_encryption_and_idempotent_insert(self):
        from verification.schemas import MonoWebhook

        repo = MagicMock()
        repo.audit = AsyncMock()
        repo.store.request = AsyncMock()
        svc = VerificationService(repo, Vault(), MagicMock(), MagicMock())
        event = MonoWebhook(
            event_id="fixture-event", event="mono.events.fixture", data={"bvn": BVN}
        )
        with patch.object(settings, "MONO_WEBHOOK_SECRET", "fixture-secret"):
            with self.assertRaises(HTTPException):
                await api.webhook(event, "wrong", svc)
            repo.store.request.assert_not_awaited()
            for _ in range(2):
                self.assertEqual(
                    await api.webhook(event, "fixture-secret", svc), {"received": True}
                )
        calls = repo.store.request.await_args_list
        self.assertEqual(
            calls[0].kwargs["json"]["event_hash"], calls[1].kwargs["json"]["event_hash"]
        )
        self.assertEqual(
            calls[0].kwargs["headers"]["Prefer"], "resolution=ignore-duplicates"
        )
        self.assertNotIn(BVN, str(calls))

    async def test_retention_keeps_failed_storage_deletions_queued(self):
        repo = MagicMock()
        repo.rows = AsyncMock(
            side_effect=[
                [{"id": "case"}],
                [{"id": "object", "storage_key": "case/file"}],
            ]
        )
        repo.rpc = AsyncMock()
        repo.store.request = AsyncMock()
        storage = MagicMock()
        storage.delete = AsyncMock(
            side_effect=HTTPException(503, "Storage unavailable")
        )
        result = await VerificationService(
            repo, Vault(), MagicMock(), storage
        ).retention()
        self.assertEqual(result, {"cases_purged": 1, "objects_deleted": 0})
        self.assertFalse(
            any(call.args[0] == "DELETE" for call in repo.store.request.await_args_list)
        )

    async def test_file_signature_validation_happens_before_upload(self):
        from verification.schemas import EvidenceFile
        from verification.storage import EvidenceStorage

        file = EvidenceFile(
            content_base64=base64.b64encode(b"not a jpeg").decode(),
            content_type="image/jpeg",
        )
        with patch(
            "verification.storage.httpx.AsyncClient",
            side_effect=AssertionError("invalid upload made a network request"),
        ):
            with self.assertRaises(HTTPException) as error:
                await EvidenceStorage().upload("case", file, selfie=True)
        self.assertEqual(error.exception.status_code, 422)


class StorageContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_private_upload_no_cache_short_signature_and_exact_delete(self):
        from verification.schemas import EvidenceFile
        from verification.storage import EvidenceStorage

        requests = []

        def handler(request):
            requests.append(request)
            if "/object/sign/" in request.url.path:
                return httpx.Response(
                    200,
                    json={
                        "signedURL": "/object/sign/verification-evidence/case/file?token=fixture"
                    },
                )
            return httpx.Response(200, json={})

        original = httpx.AsyncClient
        with (
            patch.object(settings, "SUPABASE_URL", "https://storage.example"),
            patch.object(settings, "SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key"),
            patch(
                "verification.storage.httpx.AsyncClient",
                side_effect=lambda **kwargs: original(
                    transport=httpx.MockTransport(handler)
                ),
            ),
        ):
            storage = EvidenceStorage()
            key = await storage.upload("case", EvidenceFile(**FILE), selfie=True)
            url = await storage.signed_url(key)
            await storage.delete(key)
        self.assertEqual(requests[0].headers["cache-control"], "max-age=0")
        self.assertEqual(json.loads(requests[1].content), {"expiresIn": 60})
        self.assertTrue(
            url.startswith("https://storage.example/storage/v1/object/sign/")
        )
        self.assertEqual(requests[2].method, "DELETE")
        self.assertEqual(json.loads(requests[2].content), {"prefixes": [key]})


class MemoryRepository:
    """HTTP/service integration fixture. Real SQL invariants are tested separately with PGlite."""

    def __init__(self):
        self.tables = {}
        self.events = []
        self.store = self

    async def rows(self, table, **params):
        rows = list(self.tables.setdefault(table, {}).values())
        for key, value in params.items():
            if key in ("order", "select", "limit", "offset"):
                continue
            if value == "is.null":
                rows = [r for r in rows if r.get(key) is None]
            elif value.startswith("eq."):
                rows = [r for r in rows if str(r.get(key)) == value[3:]]
            elif value.startswith("neq."):
                rows = [r for r in rows if str(r.get(key)) != value[4:]]
        return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)

    async def one(self, table, **params):
        rows = await self.rows(table, **params)
        return copy.deepcopy(rows[0]) if rows else None

    async def audit(self, case, actor, role, event, metadata=None):
        self.events.append((case, actor, role, event, metadata or {}))

    async def write(self, case, table, payload, actor, role, event):
        c = self.tables["verification_cases"][case]
        if c["status"] == "expired":
            raise HTTPException(409, "case unavailable")
        record = (
            await self.one(table, id="eq." + payload["id"])
            if payload.get("id")
            else None
        )
        defaults = {
            "id": str(uuid4()),
            "case_id": case,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "bvn_verified": False,
            "nin_verified": False,
            "duplicate_identity": False,
            "name_match_score": None,
            "dob_match": None,
            "phone_match": None,
            "status": "pending",
        }
        row = {**defaults, **(record or {}), **payload}
        self.tables[table][row["id"]] = row
        await self.audit(case, actor, role, event)
        if c["status"] == "consent_given":
            c["status"] = "in_progress"
        return copy.deepcopy(row)

    async def rpc(self, name, **p):
        if name == "verification_rate_limit":
            return True
        if name == "verification_create":
            row = {
                "id": str(uuid4()),
                "tenant_id": p["tenant"],
                "tenant_first_name": p["first_name"],
                "landlord_id": p["landlord"],
                "property_id": p["property"],
                "monthly_rent_kobo": p["rent"],
                "expires_at": "2099-01-01T00:00:00Z",
                "status": "draft",
                "overall_result": "pending",
                "summary": {},
                "completed_at": None,
            }
            self.tables.setdefault("verification_cases", {})[row["id"]] = row
            return copy.deepcopy(row)
        case = self.tables["verification_cases"][p["case"]]
        if name == "verification_consent":
            row = {
                "id": str(uuid4()),
                "case_id": case["id"],
                "subject_id": p["actor"],
                "subject_type": p["type"],
                "purposes": p["purposes"],
                "policy_version": p["policy"],
                "revoked_at": None,
            }
            self.tables.setdefault("consents", {})[row["id"]] = row
            case["status"] = "consent_given"
            return None
        if name == "verification_begin_identity":
            existing = await self.one(
                "identity_records",
                case_id="eq." + case["id"],
                subject_id="eq." + p["actor"],
            )
            return await self.write(
                case["id"],
                "identity_records",
                {
                    **p["payload"],
                    "subject_id": p["actor"],
                    "subject_type": p["type"],
                    **({"id": existing["id"]} if existing else {}),
                },
                p["actor"],
                p["type"],
                "identity_submitted",
            )
        if name == "verification_claim_identity":
            return case["status"] != "expired"
        if name == "verification_set_summary":
            if case["status"] == "expired":
                raise HTTPException(409, "case expired")
            case["summary"] = p["summary"]
            case["score"] = p["score"]
            case["overall_result"] = p.get("decision") or p["summary"]["result"]
            case["status"] = (
                "completed"
                if p.get("decision")
                else "in_progress"
                if p["summary"]["result"] == "pending"
                else "needs_review"
            )
            if p.get("decision"):
                case["completed_at"] = datetime.now(timezone.utc).isoformat()
            return None
        raise AssertionError("Unexpected RPC " + name)


class FakeIdentity:
    def __init__(self, vault):
        self.vault = vault
        self.calls = []
        self.mismatch = False
        self.fail = False

    async def lookup_nin(self, nin, dob, ctx):
        self.calls.append("nin")
        if self.fail:
            raise HTTPException(422, "No identity record.")
        return IdentityResult(
            True,
            "Ada Chukwu",
            "1990-01-01",
            "08012345678",
            base64.b64encode(b"\xff\xd8\xffphoto").decode(),
            self.vault.encrypt({"fixture": "nin"}, ctx + ":nin_raw"),
        )

    async def begin_bvn(self, bvn, ctx):
        self.calls.append("bvn")
        return IdentitySession(
            self.vault.encrypt("session", ctx + ":session"), ["phone"]
        )

    async def send_otp(self, session, method, phone=None):
        self.calls.append("otp_send")

    async def complete_bvn(self, session, otp, ctx):
        self.calls.append("otp_verify")
        return IdentityResult(
            True,
            "Other Person" if self.mismatch else "Ada Chukwu",
            "1990-01-01",
            "08012345678",
            None,
            self.vault.encrypt({"fixture": "bvn"}, ctx + ":bvn_raw"),
        )


class FakeStorage:
    def __init__(self):
        self.keys = []

    async def upload(self, case, file, selfie=False):
        key = case + "/" + str(uuid4())
        self.keys.append(key)
        return key

    async def signed_url(self, key):
        return "https://private.example/" + key + "?expires=60"

    async def delete(self, key):
        self.keys.remove(key)


class HttpIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.patches = [
            patch.object(
                settings, "ENCRYPTION_KEY", base64.b64encode(b"k" * 32).decode()
            ),
            patch.object(settings, "HASH_PEPPER", "p" * 32),
        ]
        for p in self.patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in self.patches])
        self.repo = MemoryRepository()
        vault = Vault()
        self.provider = FakeIdentity(vault)
        self.storage = FakeStorage()
        self.svc = VerificationService(self.repo, vault, self.provider, self.storage)
        app = FastAPI()
        app.include_router(api.router)
        app.add_middleware(api.VerificationBodyLimit)

        async def user(request: Request):
            return request.headers.get("x-test-actor", TENANT)

        async def admin(request: Request):
            if request.headers.get("x-test-actor") != ADMIN:
                raise HTTPException(403, "Admin required")
            return {"id": ADMIN}

        app.dependency_overrides[api.actor] = user
        app.dependency_overrides[require_admin] = admin
        app.dependency_overrides[api.service] = lambda: self.svc
        self.client = TestClient(app)
        self.admin = {
            "x-test-actor": ADMIN,
            "X-Review-Reason": "Review submitted evidence",
        }
        self.landlord = {"x-test-actor": LANDLORD}
        self.repo.tables["verification_property_links"] = {
            PROPERTY: {"id": PROPERTY, "property_id": PROPERTY, "landlord_id": LANDLORD}
        }

    def post(self, path, data, headers=None):
        return self.client.post("/api/v1/" + path, json=data, headers=headers or {})

    def setup_case(self, consent=True):
        response = self.post(
            "verification-cases",
            {
                "tenant_first_name": "Ada",
                "landlord_id": LANDLORD,
                "property_id": PROPERTY,
                "monthly_rent_kobo": 40000,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        case = response.json()["caseId"]
        if consent:
            response = self.post(
                "verification-cases/" + case + "/consent",
                {
                    "granted": True,
                    "purposes": PURPOSES,
                    "policy_version": settings.VERIFICATION_POLICY_VERSION,
                },
            )
            self.assertEqual(response.status_code, 200, response.text)
        return case

    def finish_identity(self, case):
        path = "verification-cases/" + case + "/identity"
        self.assertEqual(self.post(path, {"bvn": BVN, "nin": NIN}).status_code, 200)
        self.assertEqual(
            self.post(path + "/otp/send", {"method": "phone"}).status_code, 200
        )
        return self.post(path + "/otp/verify", {"otp": "123456"})

    def test_no_consent_no_checks_and_validation_never_echoes_inputs(self):
        case = self.setup_case(False)
        response = self.post(
            "verification-cases/" + case + "/identity", {"bvn": BVN, "nin": NIN}
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.provider.calls, [])
        response = self.post(
            "verification-cases/" + case + "/identity", {"bvn": BVN, "nin": "short"}
        )
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(BVN, response.text)
        self.assertEqual(response.json()["error"]["code"], "validation_error")
        self.assertEqual(
            self.post(
                "verification-cases",
                {"tenant_first_name": "Ada", "monthly_rent_kobo": 1.25},
            ).status_code,
            422,
        )

    def test_happy_path_human_review_and_landlord_dto(self):
        case = self.setup_case()
        root = "verification-cases/" + case
        self.assertEqual(
            self.finish_identity(case).json()["identity_status"], "verified"
        )
        selfie = self.post(root + "/liveness", {"selfie": FILE})
        self.assertEqual(selfie.status_code, 200, selfie.text)
        employment = self.post(
            root + "/employment",
            {
                "employer_name": "Example employer",
                "job_title": "Engineer",
                "employment_type": "employed",
                "monthly_income_kobo": 100000,
                "document": FILE,
            },
        )
        self.assertEqual(employment.status_code, 200, employment.text)
        self.assertEqual(
            next(iter(self.repo.tables["affordability_checks"].values()))["result"],
            "review",
        )
        address = self.post(
            root + "/address",
            {
                "address_text": "Example address",
                "proof_type": "utility_bill",
                "proof": FILE,
            },
        )
        reference = self.post(
            root + "/references",
            {
                "type": "previous_landlord",
                "name": "Example Contact",
                "phone": "08000000000",
            },
        )
        adminroot = "admin/" + root
        self.assertEqual(
            self.post(
                adminroot + "/liveness/" + selfie.json()["check_id"] + "/decision",
                {"status": "passed", "reason": "Compared selfie and NIN photo"},
                self.admin,
            ).status_code,
            200,
        )
        self.assertEqual(
            self.post(
                adminroot + "/employment/verify",
                {
                    "verification_status": "verified",
                    "verification_method": "hr_call",
                    "reason": "Employer confirmed the submitted role",
                },
                self.admin,
            ).status_code,
            200,
        )
        self.assertEqual(
            self.post(
                adminroot + "/address/" + address.json()["id"] + "/verify",
                {"status": "verified", "reason": "Reviewed the address proof"},
                self.admin,
            ).status_code,
            200,
        )
        response = self.post(
            adminroot + "/references/" + reference.json()["id"] + "/record",
            {
                "status": "responded",
                "paid_on_time": True,
                "property_condition": "good",
                "would_rent_again": True,
                "reason": "Previous landlord provided a reference",
            },
            self.admin,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["result"], "review")
        self.assertEqual(response.json()["score"], 100)
        response = self.post(
            adminroot + "/decision",
            {
                "result": "pass",
                "reason": "Human reviewer considered the complete evidence",
            },
            self.admin,
        )
        self.assertEqual(response.status_code, 200, response.text)
        summary = self.client.get(
            "/api/v1/landlord/" + root + "/summary", headers=self.landlord
        )
        self.assertEqual(summary.status_code, 200, summary.text)
        dto = summary.json()
        self.assertEqual(
            set(dto),
            {
                "caseId",
                "tenantFirstName",
                "overallResult",
                "checks",
                "reasons",
                "verifiedAt",
            },
        )
        self.assertEqual(dto["overallResult"], "pass")
        for forbidden in [
            BVN,
            NIN,
            "1990-01-01",
            "08012345678",
            "Example employer",
            "encrypted",
            "storage_key",
            "selfie_url",
            "phone_bvn",
        ]:
            self.assertNotIn(forbidden, summary.text)
        self.assertEqual(
            dto["checks"][-1], {"name": "Credit check", "status": "Not available"}
        )
        other = self.client.get(
            "/api/v1/landlord/" + root + "/summary", headers={"x-test-actor": OTHER}
        )
        self.assertEqual(other.status_code, 404)
        self.assertEqual(
            self.client.get(
                "/api/v1/" + root, headers={"x-test-actor": OTHER}
            ).status_code,
            404,
        )

    def test_identity_mismatch_lookup_failure_duplicate_and_selfie_limit(self):
        case = self.setup_case()
        self.provider.mismatch = True
        self.assertEqual(self.finish_identity(case).json()["identity_status"], "failed")
        self.provider.mismatch = False
        self.provider.fail = True
        case2 = self.setup_case()
        response = self.post(
            "verification-cases/" + case2 + "/identity", {"bvn": BVN, "nin": NIN}
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            next(
                r
                for r in self.repo.tables["identity_records"].values()
                if r["case_id"] == case2
            )["status"],
            "failed",
        )
        self.provider.fail = False
        self.repo.tables["identity_records"]["duplicate"] = {
            "id": "duplicate",
            "subject_id": OTHER,
            "case_id": "other-case",
            "bvn_hash": self.svc.vault.digest(BVN, "bvn"),
            "created_at": "2000",
        }
        case3 = self.setup_case()
        response = self.finish_identity(case3)
        self.assertEqual(response.json()["identity_status"], "review")
        self.assertTrue(response.json()["duplicate_review_required"])
        for i in range(3):
            self.assertEqual(
                self.post(
                    "verification-cases/" + case3 + "/liveness", {"selfie": FILE}
                ).status_code,
                200,
            )
        self.assertEqual(
            self.post(
                "verification-cases/" + case3 + "/liveness", {"selfie": FILE}
            ).status_code,
            409,
        )

    def test_admin_is_server_controlled_and_read_requires_a_reason(self):
        self.assertEqual(
            self.client.get("/api/v1/admin/verification-cases").status_code, 403
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/admin/verification-cases", headers={"x-test-actor": ADMIN}
            ).status_code,
            422,
        )

    def test_missing_reference_photo_cannot_be_marked_passed(self):
        case = self.setup_case()
        self.finish_identity(case)
        identity = next(iter(self.repo.tables["identity_records"].values()))
        identity["reference_photo_encrypted"] = None
        selfie = self.post(
            "verification-cases/" + case + "/liveness", {"selfie": FILE}
        ).json()
        response = self.post(
            "admin/verification-cases/"
            + case
            + "/liveness/"
            + selfie["check_id"]
            + "/decision",
            {"status": "passed", "reason": "Reviewer attempted a comparison"},
            self.admin,
        )
        self.assertEqual(response.status_code, 409)
