from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from routers import interswitch
from services.interswitch_service import BvnSession, LoanHistory


SCREENING_ID = '00000000-0000-4000-8000-000000000001'


class Store:
    def __init__(self):
        self.row = {
            "id": SCREENING_ID, "landlord_id": "landlord", "tenant_name": "Sample Tenant",
            "status": "awaiting_tenant", "package_id": "intermediate_v2",
            "check_status": {"identity_provider": "interswitch"},
        }
        self.consent = None
        self.intake = None
        self.attempts = {}
        self.test_payment = True

    async def get_one(self, table, params):
        if table == "screening_tenant_tokens":
            return {"screening_id": SCREENING_ID, "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}
        if table == "screening_requests":
            return self.row
        if table == "screening_payments":
            return {"id": "test-payment"} if self.test_payment else None
        if table == "screening_consents":
            return self.consent
        state = params.get("state")
        return self.intake if self.intake and (not state or state == "eq." + self.intake["state"]) else None

    async def insert(self, table, values):
        if table == "screening_consents":
            self.consent = values
        else:
            self.intake = values

    async def patch(self, table, params, values):
        if table == "interswitch_lookup_attempts":
            self.attempts[params["id"][3:]].update(values)
        elif table == "screening_requests":
            self.row.update(values)
        else:
            self.intake.update(values)
        return [values]

    async def rpc(self, function, values):
        if function == "publish_interswitch_sandbox_report":
            if self.intake["state"] != "submitted":
                return False
            self.intake["state"] = "published"
            self.row["status"] = "complete"
            self.row["check_status"]["loan_history"] = values["p_loan_history"]
            return True
        kind = values["p_check_type"]
        if not self.consent or kind in self.attempts:
            return None
        self.attempts[kind] = {"status": "started"}
        return kind


def test_paid_sandbox_tenant_flow(monkeypatch):
    store = Store()
    monkeypatch.setattr(interswitch, "SupabaseStore", lambda: store)
    monkeypatch.setattr(interswitch, "settings", SimpleNamespace(ENVIRONMENT="development", INTERSWITCH_SANDBOX_ENABLED=True))
    monkeypatch.setattr(interswitch, "_tenant_rate_limit", lambda *_: None)
    monkeypatch.setattr("verification.crypto.settings", SimpleNamespace(ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", HASH_PEPPER="x" * 32))
    called = []

    async def nin(*args):
        called.append("nin")
        return True

    async def start(*args):
        called.append("session")
        return BvnSession("private-test-session", ("phone",))

    async def send(*args):
        called.append("send")

    async def verify(*args):
        called.append("verify")
        return True

    async def loans(*args):
        called.append("loans")
        return LoanHistory("no_history", ("xds",), 0, "fixture-reference")

    monkeypatch.setattr(interswitch, "provider", lambda: SimpleNamespace(
        verify_nin=nin, start_bvn_consent=start, request_bvn_otp=send, verify_bvn=verify, loan_history=loans))
    async def upload(case, data):
        assert case == SCREENING_ID and data[4:8] == b"ftyp"
        return "private/test-video"

    async def sign(key):
        assert key == "private/test-video"
        return "https://storage.example.test/private/video"

    monkeypatch.setattr(interswitch, "EvidenceStorage", lambda _: SimpleNamespace(upload_video=upload, signed_url=sign))
    app = FastAPI()
    app.include_router(interswitch.staff_router)

    def staff(authorization: str = Header(default="")):
        if authorization != "Bearer sample-staff":
            raise HTTPException(403)
        return {"id": "staff"}

    app.dependency_overrides[interswitch.require_admin] = staff
    staff_url = f"/api/admin/complete-check/{SCREENING_ID}"
    staff_headers = {"Authorization": "Bearer sample-staff"}
    app.include_router(interswitch.router)
    path = "/api/public/screenings/sample-token/interswitch"
    identity = {"first_name": "Bunch", "last_name": "Dillon", "date_of_birth": "1990-01-01", "bvn": "22227777222", "nin": "63184876213"}
    with TestClient(app) as client:
        store.test_payment = False
        assert client.get(path).status_code == 403
        store.test_payment = True
        assert client.get(path).json() == {"state": "consent"}
        assert client.post(path + "/identity", json=identity).status_code == 409
        assert called == []
        assert client.post(path + "/consent", json={"agreed": True}).json() == {"state": "identity"}
        result = client.post(path + "/identity", json=identity)
        assert result.json() == {"state": "otp_method", "methods": ["phone"]}
        assert "private-test-session" not in store.intake["encrypted_intake"]
        assert client.get(path).json() == result.json()
        assert client.post(path + "/otp/send", json={"method": "phone"}).json() == {"state": "otp_code"}
        assert client.post(path + "/otp/verify", json={"otp": "123456"}).json() == {"state": "awaiting_video"}
        assert client.post(path + "/otp/verify", json={"otp": "123456"}).status_code == 409
        assert client.get(staff_url, headers=staff_headers).status_code == 404
        assert client.put(path + "/video", content=b"sample", headers={"Content-Type":"text/plain"}).status_code == 415
        video = b"\x00\x00\x00\x18ftypisom"
        assert client.put(path + "/video", content=video, headers={"Content-Type":"video/mp4"}).json() == {"state": "submitted"}
        assert "loan_history" not in store.row["check_status"]
        assert client.get(staff_url).status_code == 403
        review = client.get(staff_url, headers=staff_headers).json()
        assert review["loan_history"] == "no_history"
        assert client.post(staff_url + "/publish", headers=staff_headers, json={"video_review":"reviewed"}).json() == {"published": True}
        assert client.post(staff_url + "/publish", headers=staff_headers, json={"video_review":"reviewed"}).status_code == 404
    assert called == ["nin", "session", "send", "verify", "loans"]
    assert store.row["status"] == "complete"
    assert store.row["check_status"]["loan_history"] == "no_history"
    assert store.attempts["loan_history"]["provider_reference"] == "fixture-reference"


def test_complete_check_checkout_uses_test_amount_and_recovers_link(monkeypatch):
    import asyncio

    from routers import screenings

    settings = SimpleNamespace(
        ENVIRONMENT="development", INTERSWITCH_SANDBOX_ENABLED=True,
        INTERSWITCH_TEST_CLIENT_ID="sandbox", INTERSWITCH_TEST_CLIENT_SECRET="sandbox",
        PAYMENT_PROVIDER="flutterwave", PAYSTACK_SECRET_KEY="sk_test_fixture",
        SUPABASE_URL="https://db.example.test", SUPABASE_ANON_KEY="anon",
        SUPABASE_SERVICE_ROLE_KEY="service",
        SCREENING_PRICES_CONFIRMED=True,
        PAYMENT_CALLBACK_URL="http://127.0.0.1:3048/dashboard",
    )
    monkeypatch.setattr(screenings, "settings", settings)
    row = {
        "id": SCREENING_ID, "landlord_id": "landlord", "landlord_email": "sample@example.test",
        "package_id": "intermediate_v2", "intake_mode": "tenant_link",
        "payment_status": "unpaid", "status": "draft", "tenant_name": "Sample Tenant",
        "tenant_phone": "08012345678", "property_title": "Sample flat",
    }
    payment = {}

    async def auth(*args):
        return "landlord"

    async def owner(*args):
        return row

    async def latest(*args):
        return payment or None

    async def insert(table, values):
        assert table == "screening_payments"
        payment.update(id="payment", **values)
        return payment

    async def patch(table, _, values):
        (payment if table == "screening_payments" else row).update(values)

    async def fulfill(name, values):
        assert name == "fulfill_screening_payment" and values["p_amount_kobo"] == 400000
        payment.update(status="paid")
        row.update(status="awaiting_tenant", payment_status="paid")

    async def verification(order, reference):
        return {"status": "success", "domain": "test", "reference": reference, "amount": 400000, "currency": "NGN"}

    class Provider:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *, json, headers):
            assert url == "https://api.paystack.co/transaction/initialize"
            assert json["amount"] == 400000 and headers["Authorization"] == "Bearer sk_test_fixture"
            return SimpleNamespace(status_code=200, json=lambda: {
                "status": True, "data": {"authorization_url": "https://checkout.paystack.com/test-checkout"},
            })

    async def tenant_link(*args):
        return "http://127.0.0.1:3048/verify/example"

    monkeypatch.setattr(screenings, "authenticated_user_id", auth)
    monkeypatch.setattr(screenings, "_owner_screening", owner)
    monkeypatch.setattr(screenings, "_payment_for_screening", latest)
    monkeypatch.setattr(screenings, "_verify_payment", verification)
    monkeypatch.setattr(screenings, "_issue_tenant_link", tenant_link)
    monkeypatch.setattr(screenings, "SupabaseStore", lambda: SimpleNamespace(insert=insert, patch=patch, rpc=fulfill))
    monkeypatch.setattr(screenings.httpx, "AsyncClient", lambda **_: Provider())

    async def run():
        assert screenings._public_package("intermediate_v2")["enabled"]
        checkout = await screenings.initialize_checkout(SCREENING_ID)
        assert payment["mode"] == "test"
        assert await screenings.initialize_checkout(SCREENING_ID) == checkout
        verified = await screenings.verify_checkout(SCREENING_ID, checkout["reference"])
        assert verified["payment_status"] == "paid"
        assert verified["tenant_url"] == (await screenings.issue_tenant_link(SCREENING_ID))["tenant_url"]
        settings.ENVIRONMENT = "production"
        assert not screenings._public_package("intermediate_v2")["enabled"]

    asyncio.run(run())


# ---------------------------------------------------------------------------
# Edge-case tests
# ---------------------------------------------------------------------------

def _base_client(monkeypatch, store, *, sandbox_enabled=True):
    monkeypatch.setattr(interswitch, "SupabaseStore", lambda: store)
    monkeypatch.setattr(
        interswitch, "settings",
        SimpleNamespace(ENVIRONMENT="development", INTERSWITCH_SANDBOX_ENABLED=sandbox_enabled),
    )
    monkeypatch.setattr(interswitch, "_tenant_rate_limit", lambda *_: None)
    monkeypatch.setattr(
        "verification.crypto.settings",
        SimpleNamespace(ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", HASH_PEPPER="x" * 32),
    )
    app = FastAPI()
    app.include_router(interswitch.router)
    return TestClient(app, raise_server_exceptions=False)


PATH = "/api/public/screenings/sample-token/interswitch"
IDENTITY = {
    "first_name": "Bunch", "last_name": "Dillon", "date_of_birth": "1990-01-01",
    "bvn": "22227777222", "nin": "63184876213",
}


def test_expired_link_returns_410(monkeypatch):
    """A link whose expires_at is in the past must be rejected."""
    store = Store()

    _orig = Store.get_one

    async def patched(self, table, params):
        if table == "screening_tenant_tokens":
            return {
                "screening_id": SCREENING_ID,
                "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
            }
        return await _orig(self, table, params)

    store.get_one = lambda table, params: patched(store, table, params)
    client = _base_client(monkeypatch, store)
    assert client.get(PATH).status_code == 410


def test_consumed_link_returns_410(monkeypatch):
    """A link already consumed (consumed_at set) must be rejected."""
    store = Store()

    async def patched_get(table, params):
        if table == "screening_tenant_tokens":
            return {
                "screening_id": SCREENING_ID,
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                "consumed_at": datetime.now(timezone.utc).isoformat(),
            }
        return await Store.get_one(store, table, params)

    store.get_one = patched_get
    client = _base_client(monkeypatch, store)
    assert client.get(PATH).status_code == 410


def test_declined_consent_returns_400(monkeypatch):
    """Posting agreed=false must be rejected before anything is written."""
    store = Store()
    client = _base_client(monkeypatch, store)
    response = client.post(PATH + "/consent", json={"agreed": False})
    assert response.status_code == 400
    assert store.consent is None


def test_repeat_consent_is_accepted_idempotent(monkeypatch):
    """Posting consent a second time (same version) must succeed without error."""
    store = Store()
    client = _base_client(monkeypatch, store)
    assert client.post(PATH + "/consent", json={"agreed": True}).status_code == 200
    assert client.post(PATH + "/consent", json={"agreed": True}).status_code == 200


def test_wrong_nin_returns_422(monkeypatch):
    """Submitting a NIN not in the documented sandbox set must be rejected immediately."""
    store = Store()
    store.consent = {"version": interswitch.CONSENT_VERSION, "method": "tenant_direct_consent", "screening_id": SCREENING_ID}
    monkeypatch.setattr(interswitch, "provider", lambda: SimpleNamespace(
        verify_nin=None, start_bvn_consent=None, request_bvn_otp=None, verify_bvn=None, loan_history=None,
    ))
    client = _base_client(monkeypatch, store)
    response = client.post(PATH + "/identity", json={**IDENTITY, "nin": "00000000000"})
    assert response.status_code == 422
    assert not store.attempts


def test_wrong_bvn_returns_422(monkeypatch):
    """Submitting a BVN not in the documented sandbox set must be rejected."""
    store = Store()
    store.consent = {"version": interswitch.CONSENT_VERSION, "method": "tenant_direct_consent", "screening_id": SCREENING_ID}
    monkeypatch.setattr(interswitch, "provider", lambda: SimpleNamespace(
        verify_nin=None, start_bvn_consent=None, request_bvn_otp=None, verify_bvn=None, loan_history=None,
    ))
    client = _base_client(monkeypatch, store)
    response = client.post(PATH + "/identity", json={**IDENTITY, "bvn": "00000000000"})
    assert response.status_code == 422
    assert not store.attempts


def test_interswitch_timeout_at_nin_becomes_503(monkeypatch):
    """When the NIN call raises InterswitchUnavailable the endpoint returns 503
    and records the attempt as 'unknown' so staff can reconcile."""
    from services.interswitch_service import InterswitchUnavailable

    store = Store()
    store.consent = {"version": interswitch.CONSENT_VERSION, "method": "tenant_direct_consent", "screening_id": SCREENING_ID}

    async def fail_nin(*args):
        raise InterswitchUnavailable("timed out")

    monkeypatch.setattr(interswitch, "provider", lambda: SimpleNamespace(
        verify_nin=fail_nin, start_bvn_consent=None, request_bvn_otp=None, verify_bvn=None, loan_history=None,
    ))
    client = _base_client(monkeypatch, store)
    response = client.post(PATH + "/identity", json=IDENTITY)
    assert response.status_code == 503
    assert store.attempts.get("nin", {}).get("status") == "unknown"


def test_interswitch_timeout_at_bvn_session_becomes_503(monkeypatch):
    """When start_bvn_consent raises InterswitchLookupUnknown the endpoint returns 503,
    the nin attempt stays complete, and bvn_session becomes unknown."""
    from services.interswitch_service import InterswitchLookupUnknown

    store = Store()
    store.consent = {"version": interswitch.CONSENT_VERSION, "method": "tenant_direct_consent", "screening_id": SCREENING_ID}

    async def ok_nin(*args):
        return True

    async def fail_session(*args):
        raise InterswitchLookupUnknown("no session")

    monkeypatch.setattr(interswitch, "provider", lambda: SimpleNamespace(
        verify_nin=ok_nin, start_bvn_consent=fail_session,
        request_bvn_otp=None, verify_bvn=None, loan_history=None,
    ))
    client = _base_client(monkeypatch, store)
    response = client.post(PATH + "/identity", json=IDENTITY)
    assert response.status_code == 503
    assert store.attempts["nin"]["status"] == "complete"
    assert store.attempts["bvn_session"]["status"] == "unknown"


def test_interswitch_timeout_at_loan_history_becomes_503(monkeypatch):
    """When loan_history raises after BVN is verified the endpoint returns 503
    and loan_history attempt is marked unknown for staff reconciliation."""
    from services.interswitch_service import InterswitchLookupUnknown
    from verification.crypto import Vault

    store = Store()
    store.consent = {"version": interswitch.CONSENT_VERSION, "method": "tenant_direct_consent", "screening_id": SCREENING_ID}
    store.attempts = {
        "nin": {"status": "complete"},
        "bvn_session": {"status": "complete"},
        "bvn_otp": {"status": "complete"},
    }

    async def ok_bvn(*args):
        return True

    async def fail_loans(*args):
        raise InterswitchLookupUnknown("no loans")

    monkeypatch.setattr(interswitch, "provider", lambda: SimpleNamespace(
        verify_nin=None, start_bvn_consent=None, request_bvn_otp=None,
        verify_bvn=ok_bvn, loan_history=fail_loans,
    ))
    # Build client first so crypto settings are patched before Vault is used.
    client = _base_client(monkeypatch, store)
    private = {
        "first_name": "Bunch", "last_name": "Dillon", "date_of_birth": "1990-01-01",
        "bvn": "22227777222", "session_id": "sess", "methods": ["phone"],
    }
    ctx = f"interswitch-sandbox:{SCREENING_ID}"
    store.intake = {
        "screening_id": SCREENING_ID, "state": "otp_code",
        "encrypted_intake": Vault().encrypt(private, ctx),
    }
    response = client.post(PATH + "/otp/verify", json={"otp": "123456"})
    assert response.status_code == 503
    assert store.attempts["loan_history"]["status"] == "unknown"


def test_duplicate_video_upload_returns_409(monkeypatch):
    """Uploading a second video after the intake moved past awaiting_video must return 409
    and clean up the orphaned upload."""
    from verification.crypto import Vault

    store = Store()
    store.consent = {"version": interswitch.CONSENT_VERSION, "method": "tenant_direct_consent", "screening_id": SCREENING_ID}

    upload_count = 0

    async def upload(case, data):
        nonlocal upload_count
        upload_count += 1
        return f"private/video-{upload_count}"

    deleted = []

    async def delete(key):
        deleted.append(key)

    _orig_patch = Store.patch

    async def conflict_patch(table, params, values):
        if table == "interswitch_sandbox_intakes" and values.get("state") == "submitted":
            return []  # empty = no rows updated → conflict
        return await _orig_patch(store, table, params, values)

    store.patch = conflict_patch

    monkeypatch.setattr(interswitch, "EvidenceStorage", lambda _: SimpleNamespace(
        upload_video=upload, signed_url=None, delete=delete,
    ))
    # Build client first so crypto settings are patched before Vault is used.
    client = _base_client(monkeypatch, store)
    ctx = f"interswitch-sandbox:{SCREENING_ID}"
    store.intake = {
        "screening_id": SCREENING_ID, "state": "awaiting_video",
        "encrypted_intake": Vault().encrypt({}, ctx),
    }
    video = b"\x00\x00\x00\x18ftypisom"
    response = client.put(PATH + "/video", content=video, headers={"Content-Type": "video/mp4"})
    assert response.status_code == 409
    assert deleted, "Orphaned upload must be cleaned up"


def test_sandbox_disabled_returns_503(monkeypatch):
    """When INTERSWITCH_SANDBOX_ENABLED is False the entire router returns 503."""
    store = Store()
    client = _base_client(monkeypatch, store, sandbox_enabled=False)
    assert client.get(PATH).status_code == 503
    assert client.post(PATH + "/consent", json={"agreed": True}).status_code == 503


def test_missing_payment_returns_403(monkeypatch):
    """When no confirmed test payment exists the tenant endpoint must return 403."""
    store = Store()
    store.test_payment = False
    client = _base_client(monkeypatch, store)
    assert client.get(PATH).status_code == 403
