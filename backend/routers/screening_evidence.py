"""New tenant steps. Evidence never enters landlord report rows."""
import io
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from uuid import uuid4, UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Header
from fastapi.responses import JSONResponse
from typing import Literal
from pydantic import BaseModel, Field
from pypdf import PdfReader

from config import settings
from routers.admin import require_admin
from routers.mono import mono_service
from routers.screenings import _tenant_rate_limit
from services.package_policy import NEW_PACKAGES, statement_required
from services.screening_store import SupabaseStore, get_http_client, hash_token, authenticated_user
from services.manual_identity import manual_case, consent_version, encrypt, decrypt

router = APIRouter(tags=["Private screening evidence"])
BUCKET = "screening-private-evidence"
LIMIT = 10 * 1024 * 1024

def binding(screening_id, bvn):
    key = settings.TENANT_LINK_SIGNING_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    return hmac.new(key.encode(), f"{screening_id}:{bvn}".encode(), hashlib.sha256).hexdigest()

def stamp(): return datetime.now(timezone.utc).isoformat()

async def session(token, request, require_consent=True):
    _tenant_rate_limit(request, token)
    store = SupabaseStore()
    link = await store.get_one("screening_tenant_tokens", {"token_hash": f"eq.{hash_token(token)}", "invalidated_at": "is.null"})
    if not link or link.get("claimed_at") or link.get("consumed_at") or datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise HTTPException(410, "This link has expired or has been used. Ask for a new link.")
    row = await store.get_one("screening_requests", {"id": f"eq.{link['screening_id']}", "payment_status": "eq.paid"})
    if not row or row["package_id"] not in ("basic_v2", "intermediate_v2") or row["status"] in ("complete", "declined", "expired"):
        raise HTTPException(409, "This screening is not available.")
    if not settings.SCREENING_V2_ENABLED: raise HTTPException(503, "The new screening flow is being set up.")
    if require_consent:
        consent = await store.get_one("screening_consents", {"screening_id": f"eq.{row['id']}", "method": "eq.tenant_direct_consent", "version": f"eq.{consent_version(row)}"})
        if not consent: raise HTTPException(403, "Please read and agree to the checks first.")
    return store, link, row

async def evidence(store, screening_id, kind):
    return await store.get_one("screening_private_evidence", {"screening_id": f"eq.{screening_id}", "kind": f"eq.{kind}"})

async def identity_ready(store, row):
    if not manual_case(row):
        return bool(row.get("identity_verified_at"))
    item = await evidence(store, row["id"], "challenge")
    return bool(item and item.get("identity_intake_encrypted") and item.get("identity_intake_at"))

@router.get("/api/public/screenings/{token}/steps")
async def steps(token: str, request: Request):
    store, _, row = await session(token, request, False)
    challenge = await evidence(store, row["id"], "challenge")
    if not challenge:
        rows = await store.request("POST", "screening_private_evidence", params={"on_conflict": "screening_id,kind"}, json={"screening_id": row["id"], "kind": "challenge", "challenge": str(secrets.randbelow(900000) + 100000)}, headers={"Prefer": "resolution=ignore-duplicates,return=representation"})
        challenge = rows[0] if rows else await evidence(store, row["id"], "challenge")
        if not challenge: raise HTTPException(503, "Your screening steps could not load. Please try again.")
    video = await evidence(store, row["id"], "liveness")
    statement = await evidence(store, row["id"], "statement")
    return {"identity_done": bool(challenge.get("identity_intake_at")) if manual_case(row) else bool(row.get("identity_verified_at")), "verification_mode": "manual" if manual_case(row) else "mono", "statement_required": statement_required(row["package_id"], row.get("monthly_rent")), "challenge": challenge["challenge"], "liveness_uploaded": bool(video), "statement_uploaded": bool(statement)}

class Identity(BaseModel):
    full_name: str | None = Field(default=None, max_length=160)
    bvn: str = Field(pattern=r"^[0-9]{11}$")
    nin: str = Field(pattern=r"^[0-9]{11}$")
    date_of_birth: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")

@router.post("/api/public/screenings/{token}/steps/identity")
async def identity(token: str, payload: Identity, request: Request):
    store, _, row = await session(token, request)
    if row.get("identity_verified_at"): raise HTTPException(409, "Your ID check is already done. Continue to liveness.")
    if manual_case(row):
        if row["package_id"] != "basic_v2": raise HTTPException(409, "Credit checks are awaiting provider approval.")
        if not payload.full_name or len(payload.full_name.strip()) < 2: raise HTTPException(422, "Enter your full name.")
        try:
            dob = datetime.strptime(payload.date_of_birth, "%Y-%m-%d").date()
            if dob > datetime.now(timezone.utc).date(): raise ValueError()
        except ValueError: raise HTTPException(422, "Enter a valid date of birth.")
        challenge = await evidence(store, row["id"], "challenge")
        if not challenge: raise HTTPException(409, "Load your screening steps first.")
        encrypted = encrypt({"full_name": payload.full_name.strip(), "bvn": payload.bvn, "nin": payload.nin, "date_of_birth": payload.date_of_birth}, row["id"])
        saved = await store.patch("screening_private_evidence", {"id": f"eq.{challenge['id']}", "identity_intake_encrypted": "is.null"}, {"identity_intake_encrypted": encrypted, "identity_intake_at": stamp()})
        if not saved: raise HTTPException(409, "Your ID details were already submitted.")
        checks = dict(row.get("check_status") or {})
        checks.update({"identity_method": "manual_review", "identity": "pending_review", "environment": "sandbox" if settings.PAYSTACK_SECRET_KEY.startswith("sk_test_") or settings.ENVIRONMENT == "demo" else "production"})
        await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {"check_status": checks, "masked_document": "ID details held privately"})
        return {"identity_done": True, "status": "pending_review", "verified": False}
    if not settings.MONO_IDENTITY_CHECKS_ENABLED: raise HTTPException(503, "ID checks are not ready. Please try later.")
    try: datetime.strptime(payload.date_of_birth, "%Y-%m-%d")
    except ValueError: raise HTTPException(422, "Enter a valid date of birth.")
    result = await mono_service.verify_identity(bvn=payload.bvn, nin=payload.nin, date_of_birth=payload.date_of_birth)
    personal = result.get("personal_information") or result.get("identity") or {}
    if not isinstance(personal, dict): personal = {}
    name = str(result.get("full_name") or result.get("name") or personal.get("full_name") or " ".join(filter(None, [personal.get("first_name"), personal.get("middle_name"), personal.get("surname")]))).strip()
    if not name: raise HTTPException(422, "We could not match those ID details. Check them and try again.")
    match = "match" if set(name.casefold().split()) == set(row["tenant_name"].casefold().split()) else "mismatch"
    await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {"identity_verified_at": stamp(), "name_match": match, "masked_document": "BVN •••• " + payload.bvn[-4:], "check_status": {"identity": "verified", "liveness": "pending", "environment": "production" if settings.MONO_SECRET_KEY.startswith("live_sk_") else "sandbox"}})
    challenge = await evidence(store, row["id"], "challenge")
    if not challenge: raise HTTPException(409, "Load your screening steps first.")
    await store.patch("screening_private_evidence", {"id": f"eq.{challenge['id']}"}, {"identity_binding": binding(row["id"], payload.bvn)})
    return {"identity_done": True}

async def bounded_body(request):
    body = bytearray()
    async for part in request.stream():
        if len(body) + len(part) > LIMIT: raise HTTPException(413, "The file must be 10 MB or less.")
        body.extend(part)
    if not body: raise HTTPException(422, "Choose a file to upload.")
    return bytes(body)

def validate_pdf(body):
    if not body.startswith(b"%PDF-"): raise HTTPException(422, "Choose a valid PDF file.")
    try:
        pdf = PdfReader(io.BytesIO(body), strict=True)
        if pdf.is_encrypted or not len(pdf.pages): raise ValueError()
    except Exception:
        raise HTTPException(422, "Choose a PDF we can read. It must not be password protected.")

@router.put("/api/public/screenings/{token}/steps/evidence/{kind}")
async def upload(token: str, kind: str, request: Request):
    store, _, row = await session(token, request)
    if kind not in ("statement", "liveness"): raise HTTPException(404, "Unknown upload.")
    if not await identity_ready(store, row): raise HTTPException(409, "Send your ID details first.")
    if kind == "statement" and not statement_required(row["package_id"], row.get("monthly_rent")):
        raise HTTPException(409, "A bank statement is not required for this screening.")
    if await evidence(store, row["id"], kind): raise HTTPException(409, "This file is already uploaded.")
    body = await bounded_body(request)
    media = request.headers.get("content-type", "").split(";")[0]
    if kind == "statement":
        if media != "application/pdf": raise HTTPException(422, "Only PDF files are accepted.")
        validate_pdf(body)
        suffix = "pdf"
    else:
        challenge = await evidence(store, row["id"], "challenge")
        if not challenge: raise HTTPException(409, "Reload your liveness instructions first.")
        if media not in ("video/webm", "video/mp4") or not (body.startswith(b"\x1aE\xdf\xa3") or body[4:8] == b"ftyp"):
            raise HTTPException(422, "Choose an MP4 or WebM video, 10 MB or less.")
        suffix = "webm" if media == "video/webm" else "mp4"
    key = f"{row['id']}/{uuid4()}.{suffix}"
    client = get_http_client("supabase")
    headers = {"apikey": settings.SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}", "Content-Type": media, "x-upsert": "false"}
    response = await client.post(f"{store.base_url}/storage/v1/object/{BUCKET}/{key}", headers=headers, content=body)
    if response.status_code >= 400: raise HTTPException(503, "Upload failed. Please try again.")
    try:
        await store.insert("screening_private_evidence", {"screening_id": row["id"], "kind": kind, "object_key": key, "media_type": media, "size_bytes": len(body)})
    except Exception:
        await client.delete(f"{store.base_url}/storage/v1/object/{BUCKET}/{key}", headers=headers)
        raise
    return {"uploaded": True}

class CreditInput(BaseModel):
    bvn: str | None = Field(default=None, pattern=r"^[0-9]{11}$")

@router.post("/api/public/screenings/{token}/steps/submit")
async def submit(token: str, payload: CreditInput, request: Request):
    store, link, row = await session(token, request)
    if not await identity_ready(store, row): raise HTTPException(409, "Send your ID details first.")
    if manual_case(row) and row["package_id"] != "basic_v2": raise HTTPException(409, "Credit checks are awaiting provider approval.")
    if not await evidence(store, row["id"], "liveness"): raise HTTPException(422, "Upload your liveness video before you continue.")
    if statement_required(row["package_id"], row.get("monthly_rent")) and not await evidence(store, row["id"], "statement"):
        raise HTTPException(422, "Upload your last 3 months of bank statements before you continue.")
    claimed = await store.rpc("claim_identity_tenant_token", {"p_token_hash": hash_token(token)})
    if not claimed: raise HTTPException(409, "Your check is already being sent. Please wait.")
    checks = dict(row.get("check_status") or {})
    try:
        if row["package_id"] == "intermediate_v2":
            if not settings.MONO_CREDIT_CHECKS_ENABLED or not payload.bvn: raise HTTPException(503, "Credit checks are not ready or BVN is missing.")
            challenge = await evidence(store, row["id"], "challenge")
            if not challenge or not hmac.compare_digest(challenge.get("identity_binding") or "", binding(row["id"], payload.bvn)):
                raise HTTPException(422, "Use the same BVN as your ID check.")
            # Do not store or return provider payloads: staff get only a status.
            result = await mono_service.lookup_credit_history(payload.bvn, provider="crc", reason="Tenant rental screening")
            if result.get("status") not in (True, "success", "successful") or not result.get("data"):
                raise HTTPException(503, "The credit check could not finish. Please try again.")
            checks["credit_bureau"] = "complete"
            checks["credit_result"] = result["data"].get("credit_result", "needs_review")
        checks["liveness"] = "pending_review"
        if statement_required(row["package_id"], row.get("monthly_rent")): checks["statement_review"] = "pending_review"
        await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {"status": "incomplete", "check_status": checks})
        await store.patch("screening_tenant_tokens", {"id": f"eq.{link['id']}"}, {"consumed_at": stamp(), "claimed_at": None})
    except Exception:
        await store.patch("screening_tenant_tokens", {"id": f"eq.{link['id']}"}, {"claimed_at": None})
        raise
    return {"status": "pending_review", "message": "Your checks are sent. Our team will review your video and any statement. Your landlord sees only the final result."}

@router.get("/api/admin/screening-evidence/{evidence_id}/file")
async def staff_file(evidence_id: UUID, user=Depends(require_admin)):
    store = SupabaseStore()
    item = await store.get_one("screening_private_evidence", {"id": f"eq.{evidence_id}"})
    if not item or not item.get("object_key"): raise HTTPException(404, "File not found.")
    response = await get_http_client("supabase").get(f"{store.base_url}/storage/v1/object/{BUCKET}/{item['object_key']}", headers={"apikey": settings.SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"})
    if response.status_code != 200: raise HTTPException(503, "File is not available. Try later.")
    await store.insert("screening_evidence_audit", {"screening_id": item["screening_id"], "staff_id": user["id"], "action": "file_read", "evidence_id": str(evidence_id)})
    return Response(response.content, media_type="application/octet-stream", headers={"Content-Disposition": 'attachment; filename="private-evidence"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

@router.get("/api/admin/screenings/{screening_id}/evidence")
async def staff_list(screening_id: UUID, user=Depends(require_admin)):
    store = SupabaseStore()
    row = await store.get_one("screening_requests", {"id": f"eq.{screening_id}"})
    if not row: raise HTTPException(404, "Screening not found.")
    return {"manual_review": manual_case(row), "items": await store.request("GET", "screening_private_evidence", params={"screening_id": f"eq.{screening_id}", "select": "id,kind,challenge,decision,media_type,created_at"})}

@router.get("/api/admin/screenings/{screening_id}/identity-intake")
async def staff_identity(screening_id: UUID, user=Depends(require_admin)):
    store = SupabaseStore()
    row = await store.get_one("screening_requests", {"id": f"eq.{screening_id}"})
    if not row or not manual_case(row): raise HTTPException(404, "Manual intake not found.")
    item = await evidence(store, str(screening_id), "challenge")
    if not item or not item.get("identity_intake_encrypted"): raise HTTPException(404, "The tenant has not sent their ID details.")
    details = decrypt(item["identity_intake_encrypted"], str(screening_id))
    await store.insert("screening_evidence_audit", {"screening_id": str(screening_id), "staff_id": user["id"], "action": "identity_read", "evidence_id": item["id"]})
    return JSONResponse({"details": details, "submitted_at": item["identity_intake_at"], "provider_verified": False}, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})

class Decision(BaseModel):
    approved: bool
    statement_covers_three_months: bool = False
    affordability: str = Field(default="not_required", pattern="^(pass|review|not_required)$")
    identity_outcome: Literal["reviewed", "needs_review"] | None = None
    identity_notes: str = Field(default="", max_length=2000)

@router.post("/api/admin/screenings/{screening_id}/evidence-decision")
async def review(screening_id: UUID, payload: Decision, user=Depends(require_admin)):
    store = SupabaseStore()
    row = await store.get_one("screening_requests", {"id": f"eq.{screening_id}"})
    if not row or row["package_id"] not in NEW_PACKAGES: raise HTTPException(404, "Screening not found.")
    if row["status"] != "incomplete": raise HTTPException(409, "Only a submitted screening waiting for review can be finalized.")
    link = await store.get_one("screening_tenant_tokens", {"screening_id": f"eq.{screening_id}", "consumed_at": "not.is.null"})
    if not link or not await identity_ready(store, row) or not await evidence(store, row["id"], "liveness"):
        raise HTTPException(409, "The tenant must finish all steps before review.")
    checks = dict(row.get("check_status") or {})
    if manual_case(row):
        if row["package_id"] != "basic_v2": raise HTTPException(409, "Bureau credit review is not available.")
        if not payload.identity_outcome or len(payload.identity_notes.strip()) < 10:
            raise HTTPException(422, "Record the manual ID review outcome and a short basis for your review.")
        item = await evidence(store, row["id"], "challenge")
        await store.patch("screening_private_evidence", {"id": f"eq.{item['id']}"}, {"identity_review_encrypted": encrypt({"outcome": payload.identity_outcome, "notes": payload.identity_notes.strip(), "staff_id": user["id"], "reviewed_at": stamp()}, row["id"])})
        checks["identity"] = "manual_reviewed" if payload.identity_outcome == "reviewed" else "needs_review"
        checks["identity_method"] = "manual_review"
    required = statement_required(row["package_id"], row.get("monthly_rent"))
    if row["package_id"] == "intermediate_v2" and checks.get("credit_bureau") != "complete": raise HTTPException(409, "Credit check is not complete.")
    if required and not payload.statement_covers_three_months and payload.affordability != "review":
        raise HTTPException(422, "A statement without confirmed 3-month coverage must remain needs review.")
    if required and (not await evidence(store, row["id"], "statement") or (payload.approved and not payload.statement_covers_three_months) or payload.affordability == "not_required"):
        raise HTTPException(422, "Review the 3-month statement and record the affordability result first.")
    await store.insert("screening_evidence_audit", {"screening_id": row["id"], "staff_id": user["id"], "action": "approved" if payload.approved else "needs_review"})
    checks["liveness"] = "verified" if payload.approved else "needs_review"
    if required: checks["affordability"] = payload.affordability
    checks.pop("statement_review", None)
    await store.patch("screening_requests", {"id": f"eq.{screening_id}"}, {"status": "complete", "check_status": checks, "completed_at": stamp(), "report_id": str(uuid4())})
    return {"status": "complete"}


class Quote(BaseModel):
    checks: list[str] = Field(min_length=1, max_length=9)
    monthly_rent: float = Field(gt=0, le=1_000_000_000)
    notes: str = Field(default="", max_length=2000)

@router.post("/api/screenings/custom-quote")
async def quote(payload: Quote, authorization: str | None = Header(default=None)):
    user = await authenticated_user(authorization)
    allowed = {"BVN check", "NIN check", "Liveness check", "Credit check", "Employment check", "Income evidence", "Past landlord reference", "Guarantor check", "Address evidence"}
    if not set(payload.checks) <= allowed: raise HTTPException(422, "Choose checks from the list.")
    row = await SupabaseStore().insert("screening_quote_requests", {"landlord_id": user["id"], "checks": sorted(set(payload.checks)), "monthly_rent": payload.monthly_rent, "notes": payload.notes})
    return {"id": row["id"], "status": "quote_requested"}
