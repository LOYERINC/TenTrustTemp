"""Complete Check tenant flow for test cases provisioned in a development database."""

from datetime import date, datetime, timezone
from hashlib import md5
from typing import Awaitable, Callable, TypeVar
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config import settings
from routers.admin import require_admin
from routers.screenings import _tenant_rate_limit
from services.interswitch_service import BvnSession, InterswitchLookupUnknown, InterswitchSandbox, InterswitchUnavailable
from services.complete_check_report import CompleteCheckDraft, ReportFacts, build_report
from services.gemini_report import generate_report, validate_report, PROMPT_VERSION
from services.screening_store import SupabaseStore, get_http_client, hash_token
from verification.crypto import Vault
from verification.storage import EvidenceStorage


router = APIRouter(prefix="/api/public/screenings/{token}/interswitch")
staff_router = APIRouter(prefix="/api/admin/complete-check")
CONSENT_VERSION = "complete-check-interswitch-v1"
T = TypeVar("T")


class Consent(BaseModel):
    agreed: bool


class Identity(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    date_of_birth: date
    bvn: str = Field(pattern=r"^[0-9]{11}$")
    nin: str = Field(pattern=r"^[0-9]{11}$")


class OtpMethod(BaseModel):
    method: str = Field(min_length=1, max_length=64)


class OtpCode(BaseModel):
    otp: str = Field(pattern=r"^[0-9]{4,12}$")


class StaffReview(BaseModel):
    video_review: Literal["reviewed", "needs_review"]
    report_approved: Literal[True]
    report: CompleteCheckDraft


class DraftOptions(BaseModel):
    video_review: Literal["pending", "reviewed", "needs_review"] = "pending"


def report_facts(review: dict, video_review: str = "pending") -> ReportFacts:
    return ReportFacts(nin_match="matched", bvn_match="matched", loan_history=review["loan_history"],
                       facility_count=review["facility_count"], video_review=video_review,
                       loans=review.get("loans", []), providers=list(dict.fromkeys(
                           provider.casefold() if provider.casefold() in {"xds", "crc"} else "other"
                           for provider in review.get("providers", []) if isinstance(provider, str))))


def provider() -> InterswitchSandbox:
    return InterswitchSandbox(
        get_http_client("provider"),
        settings.INTERSWITCH_TEST_CLIENT_ID,
        settings.INTERSWITCH_TEST_CLIENT_SECRET,
    )


async def paid_case(token: str, request: Request):
    if settings.ENVIRONMENT != "development" or not settings.INTERSWITCH_SANDBOX_ENABLED:
        raise HTTPException(503, "Complete Check sandbox is disabled.")
    _tenant_rate_limit(request, token)
    store = SupabaseStore()
    link = await store.get_one("screening_tenant_tokens", {"token_hash": f"eq.{hash_token(token)}", "invalidated_at": "is.null"})
    if not link or link.get("consumed_at") or datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise HTTPException(410, "This screening link is unavailable.")
    row = await store.get_one("screening_requests", {"id": f"eq.{link['screening_id']}", "payment_status": "eq.paid"})
    if (
        not row or row["status"] not in ("awaiting_tenant", "incomplete")
        or row["package_id"] != "intermediate_v2"
        or (row.get("check_status") or {}).get("identity_provider") != "interswitch"
    ):
        raise HTTPException(404, "This Complete Check sandbox case is unavailable.")
    payment = await store.get_one("screening_payments", {"screening_id": f"eq.{row['id']}", "status": "eq.paid", "mode": "eq.test"})
    if not payment:
        raise HTTPException(403, "A confirmed test payment is required.")
    return store, row


async def consent_record(store: SupabaseStore, row: dict):
    return await store.get_one("screening_consents", {"screening_id": f"eq.{row['id']}", "method": "eq.tenant_direct_consent"})


async def claim_and_run(store: SupabaseStore, row: dict, kind: str, operation: Callable[[], Awaitable[T]]) -> T:
    claim = await store.rpc("claim_interswitch_lookup", {"p_screening_id": row["id"], "p_check_type": kind})
    if not claim:
        raise HTTPException(409, "This check was already started. Ask TenTrust staff to review its status.")
    try:
        result = await operation()
    except (InterswitchUnavailable, InterswitchLookupUnknown):
        await store.patch("interswitch_lookup_attempts", {"id": f"eq.{claim}"}, {"status": "unknown"})
        raise HTTPException(503, "Interswitch did not confirm this check. Ask TenTrust staff to review it.") from None
    update = {"status": "complete"}
    if reference := getattr(result, "tracking_id", None):
        update["provider_reference"] = reference
    await store.patch("interswitch_lookup_attempts", {"id": f"eq.{claim}"}, update)
    return result


def context(row: dict) -> str:
    return f"interswitch-sandbox:{row['id']}"


async def load_intake(store: SupabaseStore, row: dict, state: str):
    intake = await store.get_one("interswitch_sandbox_intakes", {"screening_id": f"eq.{row['id']}", "state": f"eq.{state}"})
    if not intake:
        raise HTTPException(409, "Refresh the page to continue from your current step.")
    return Vault().decrypt(intake["encrypted_intake"], context(row))


@router.get("")
async def progress(token: str, request: Request):
    store, row = await paid_case(token, request)
    consent = await consent_record(store, row)
    if not consent or consent["version"] != CONSENT_VERSION:
        return {"state": "consent"}
    intake = await store.get_one("interswitch_sandbox_intakes", {"screening_id": f"eq.{row['id']}"})
    if not intake:
        return {"state": "identity"}
    if intake["state"] == "otp_method":
        private = Vault().decrypt(intake["encrypted_intake"], context(row))
        return {"state": "otp_method", "methods": private["methods"]}
    return {"state": intake["state"]}


@router.post("/consent")
async def consent(token: str, request: Request, payload: Consent):
    store, row = await paid_case(token, request)
    if not payload.agreed:
        raise HTTPException(400, "Consent is required before checking identity or loan history.")
    existing = await consent_record(store, row)
    details = {
        "screening_id": row["id"], "landlord_id": row["landlord_id"],
        "method": "tenant_direct_consent", "consented_as": row["tenant_name"],
        "purpose": "Interswitch sandbox BVN, NIN and loan-history checks with sample details only.",
        "version": CONSENT_VERSION, "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing is None:
        await store.insert("screening_consents", details)
    elif existing["version"] != CONSENT_VERSION:
        await store.patch("screening_consents", {"id": f"eq.{existing['id']}"}, details)
    return {"state": "identity"}


@router.post("/identity")
async def identity(token: str, request: Request, payload: Identity):
    store, row = await paid_case(token, request)
    if payload.nin != "63184876213" or payload.bvn not in {"12345678901", "22227777222"}:
        raise HTTPException(422, "Use only the Interswitch Marketplace sample identifiers in the sandbox.")
    if not payload.first_name.strip() or not payload.last_name.strip() or payload.date_of_birth > date.today():
        raise HTTPException(422, "Enter both names and a valid date of birth.")
    vault = Vault()
    sandbox = provider()
    matched = await claim_and_run(store, row, "nin", lambda: sandbox.verify_nin(payload.nin, payload.first_name, payload.last_name))
    if not matched:
        await store.insert("interswitch_sandbox_intakes", {"screening_id": row["id"], "state": "needs_review", "encrypted_intake": vault.encrypt({}, context(row))})
        return {"state": "needs_review"}
    session = await claim_and_run(store, row, "bvn_session", lambda: sandbox.start_bvn_consent(payload.bvn))
    private = payload.model_dump(mode="json", exclude={"nin"})
    private.update(session_id=session.session_id, methods=session.methods)
    await store.insert("interswitch_sandbox_intakes", {
        "screening_id": row["id"], "state": "otp_method", "encrypted_intake": vault.encrypt(private, context(row)),
    })
    return {"state": "otp_method", "methods": session.methods}


@router.post("/otp/send")
async def send_otp(token: str, request: Request, payload: OtpMethod):
    store, row = await paid_case(token, request)
    private = await load_intake(store, row, "otp_method")
    session = BvnSession(private["session_id"], tuple(private["methods"]))
    if payload.method not in session.methods:
        raise HTTPException(422, "Choose an available code delivery method.")
    sandbox = provider()
    await claim_and_run(store, row, "bvn_otp", lambda: sandbox.request_bvn_otp(session, payload.method))
    await store.patch("interswitch_sandbox_intakes", {"screening_id": f"eq.{row['id']}"}, {"state": "otp_code"})
    return {"state": "otp_code"}


@router.post("/otp/verify")
async def verify_otp(token: str, request: Request, payload: OtpCode):
    store, row = await paid_case(token, request)
    private = await load_intake(store, row, "otp_code")
    session = BvnSession(private["session_id"], tuple(private["methods"]))
    sandbox = provider()
    matched = await claim_and_run(store, row, "bvn_details", lambda: sandbox.verify_bvn(
        session, payload.otp, private["bvn"], private["first_name"], private["last_name"], private["date_of_birth"],
    ))
    state = "needs_review"
    review = {}
    if matched:
        result = await claim_and_run(store, row, "loan_history", lambda: sandbox.loan_history(private["bvn"]))
        await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {
            "status": "incomplete",
        })
        review = {"loan_history": result.status, "providers": result.providers, "facility_count": result.facility_count,
                  "loans": [loan.model_dump(mode="json") for loan in result.loans]}
        state = "awaiting_video"
    await store.patch("interswitch_sandbox_intakes", {"screening_id": f"eq.{row['id']}"}, {
        "state": state, "encrypted_intake": Vault().encrypt(review, context(row)),
    })
    return {"state": state}


@router.put("/video")
async def submit_video(token: str, request: Request):
    store, row = await paid_case(token, request)
    await load_intake(store, row, "awaiting_video")
    if request.headers.get("content-type") != "video/mp4":
        raise HTTPException(415, "Choose an MP4 video.")
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > 5 * 1024 * 1024:
            raise HTTPException(413, "Choose an MP4 video of 5 MB or less.")
        content.extend(chunk)
    storage = EvidenceStorage("complete-check-videos")
    key = await storage.upload_video(row["id"], bytes(content))
    updated = await store.patch("interswitch_sandbox_intakes", {
        "screening_id": f"eq.{row['id']}", "state": "eq.awaiting_video",
    }, {"state": "submitted", "video_key": key})
    if not updated:
        await storage.delete(key)
        raise HTTPException(409, "A video was already submitted.")
    return {"state": "submitted"}


async def staff_intake(screening_id: UUID):
    if settings.ENVIRONMENT != "development" or not settings.INTERSWITCH_SANDBOX_ENABLED:
        raise HTTPException(503, "Complete Check sandbox is disabled.")
    store = SupabaseStore()
    row = await store.get_one("interswitch_sandbox_intakes", {"screening_id": f"eq.{screening_id}", "state": "eq.submitted"})
    if not row or not row.get("video_key"):
        raise HTTPException(404, "This case has no video ready for review.")
    review = Vault().decrypt(row["encrypted_intake"], f"interswitch-sandbox:{screening_id}")
    return store, row, review


@staff_router.get("/{screening_id}")
async def staff_review(screening_id: UUID, _staff=Depends(require_admin)):
    _, row, review = await staff_intake(screening_id)
    url = await EvidenceStorage("complete-check-videos").signed_url(row["video_key"])
    return {
        "loan_history": review["loan_history"], "facility_count": review["facility_count"],
        "providers": review["providers"], "video_url": url, "loans": review.get("loans", []),
    }


@staff_router.get("/{screening_id}/report-draft")
async def report_draft(screening_id: UUID, video_review: Literal["pending", "reviewed", "needs_review"] = "pending", _staff=Depends(require_admin)):
    _, _, review = await staff_intake(screening_id)
    # Submitted cases reach this state only after both provider matches succeed.
    # Never infer these outcomes for earlier intake states.
    return build_report(report_facts(review, video_review))


@staff_router.post("/{screening_id}/report-draft/generate")
async def generate_report_draft(screening_id: UUID, payload: DraftOptions = DraftOptions(), _staff=Depends(require_admin)):
    store, _, review = await staff_intake(screening_id)
    if not settings.COMPLETE_CHECK_AI_ENABLED or not settings.GEMINI_API_KEY:
        return {"report": build_report(report_facts(review, payload.video_review)),
                "generation": {"outcome": "not_configured"}}
    facts = report_facts(review, payload.video_review)
    # Atomic database limit across staff accounts and app instances. No automatic retries.
    try:
        allowed = await store.rpc("verification_rate_limit", {
            "p_key": f"complete-check-gemini:{screening_id}", "p_limit": 2, "p_window": 86400,
        })
    except HTTPException:
        return {"report": build_report(facts), "generation": {"outcome": "limit_unavailable"}}
    if allowed is not True:
        return {"report": build_report(facts), "generation": {"outcome": "daily_limit"}}
    result = await generate_report(get_http_client("provider"), facts,
        enabled=True, api_key=settings.GEMINI_API_KEY, model=settings.COMPLETE_CHECK_AI_MODEL)
    return {"report": result.report, "generation": {
        "outcome": result.outcome, "model": result.model, "prompt_version": PROMPT_VERSION,
        "input_tokens": result.input_tokens, "output_tokens": result.output_tokens,
    }}


@staff_router.post("/{screening_id}/publish")
async def publish_report(screening_id: UUID, payload: StaffReview, staff=Depends(require_admin)):
    store, intake, review = await staff_intake(screening_id)
    if payload.report.admin_decision is None:
        raise HTTPException(422, "Record the administrator's decision and reasons before publication.")
    try:
        validate_report(payload.report, report_facts(review, payload.video_review))
    except ValueError:
        raise HTTPException(409, "The report no longer matches the checks or video outcome. Prepare it again.") from None
    published = await store.rpc("publish_complete_check_report", {
        "p_screening_id": str(screening_id), "p_staff_id": staff["id"],
        "p_loan_history": review["loan_history"], "p_video_review": payload.video_review,
        "p_report": payload.report.model_dump(mode="json"),
        "p_intake_revision": md5(intake["encrypted_intake"].encode()).hexdigest(),
    })
    if not published:
        raise HTTPException(409, "This report is no longer ready to publish.")
    return {"published": True}
