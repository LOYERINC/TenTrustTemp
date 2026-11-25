import base64
import hmac
import logging
import secrets
from datetime import timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from config import settings
from routers.admin import require_admin
from services.screening_store import authenticated_user
from verification import schemas as s
from verification.service import VerificationService, now

logger = logging.getLogger(__name__)


class VerificationRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handle(request):
            try:
                response = await original(request)
                response.headers["Cache-Control"] = "no-store"
                return response
            except RequestValidationError as exc:
                issues = [
                    {
                        "field": ".".join(str(part) for part in issue["loc"]),
                        "message": "Invalid or missing value.",
                    }
                    for issue in exc.errors()
                ]
                return JSONResponse(
                    {
                        "error": {
                            "code": "validation_error",
                            "message": "Check the submitted fields.",
                            "fields": issues,
                        }
                    },
                    422,
                )
            except HTTPException as exc:
                return JSONResponse(
                    {
                        "error": {
                            "code": f"http_{exc.status_code}",
                            "message": exc.detail,
                        }
                    },
                    exc.status_code,
                    headers={"Cache-Control": "no-store"},
                )
            except Exception as exc:
                logger.error("Verification operation failed (%s)", type(exc).__name__)
                return JSONResponse(
                    {
                        "error": {
                            "code": "internal_error",
                            "message": "Verification could not be processed. Contact support.",
                        }
                    },
                    500,
                )

        return handle


class VerificationBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api/v1/"):
            return await self.app(scope, receive, send)
        size = 0

        async def limited_receive():
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > 8 * 1024 * 1024:
                    raise HTTPException(
                        413, "Verification requests cannot exceed 8 MB."
                    )
            return message

        await self.app(scope, limited_receive, send)


router = APIRouter(
    prefix="/api/v1", tags=["Tenant verification v1"], route_class=VerificationRoute
)


async def actor(authorization: Optional[str] = Header(default=None)):
    return (await authenticated_user(authorization))["id"]


def service():
    return VerificationService()


def ip(request):
    # Configure trusted proxy forwarding at the ASGI server; do not trust arbitrary X-Forwarded-For.
    return request.client.host if request.client else "unknown"


def reason(value: str = Header(alias="X-Review-Reason", min_length=10, max_length=300)):
    return value


@router.get("/verification-policy")
async def policy():
    return {
        "version": settings.VERIFICATION_POLICY_VERSION,
        "retention_days": settings.DATA_RETENTION_DAYS,
        "identity": "Separate BVN OTP and NIN lookups with Mono.",
        "liveness": "A reviewer compares your selfie to the available NIN photo.",
        "credit_status": "not_available",
        "decision": "Human review required; evidence completeness is not a rental eligibility score.",
    }


@router.post("/verification-cases", status_code=201)
async def create_case(
    payload: s.CaseCreate, request: Request, user=Depends(actor), svc=Depends(service)
):
    await svc.rate_limit(user, ip(request), "create")
    case = await svc.create(user, payload)
    return {
        "caseId": case["id"],
        "status": case["status"],
        "expiresAt": case["expires_at"],
    }


@router.post("/verification-cases/{case_id}/consent")
async def consent(
    case_id: UUID,
    payload: s.Consent,
    request: Request,
    user=Depends(actor),
    svc=Depends(service),
):
    return await svc.consent(
        case_id, user, payload, ip(request), request.headers.get("user-agent", "")
    )


@router.post("/verification-cases/{case_id}/consent/revoke")
async def revoke(
    case_id: UUID, payload: s.SubjectBody, user=Depends(actor), svc=Depends(service)
):
    return await svc.revoke(case_id, user, payload.subject_type)


@router.post("/verification-cases/{case_id}/identity")
async def identity(
    case_id: UUID,
    payload: s.IdentitySubmit,
    request: Request,
    user=Depends(actor),
    svc=Depends(service),
):
    return await svc.begin_identity(case_id, user, payload, ip(request))


@router.post("/verification-cases/{case_id}/identity/otp/send")
async def send_otp(
    case_id: UUID,
    payload: s.OtpMethod,
    request: Request,
    user=Depends(actor),
    svc=Depends(service),
):
    return await svc.send_otp(case_id, user, payload, ip(request))


@router.post("/verification-cases/{case_id}/identity/otp/verify")
async def verify_otp(
    case_id: UUID,
    payload: s.Otp,
    request: Request,
    user=Depends(actor),
    svc=Depends(service),
):
    return await svc.finish_identity(case_id, user, payload, ip(request))


@router.post("/verification-cases/{case_id}/liveness")
async def liveness(
    case_id: UUID, payload: s.LivenessUpload, user=Depends(actor), svc=Depends(service)
):
    return await svc.liveness(case_id, user, payload)


@router.post("/verification-cases/{case_id}/employment")
async def employment(
    case_id: UUID, payload: s.Employment, user=Depends(actor), svc=Depends(service)
):
    return await svc.employment(case_id, user, payload)


@router.post("/verification-cases/{case_id}/address")
async def address(
    case_id: UUID, payload: s.Address, user=Depends(actor), svc=Depends(service)
):
    case = await svc.case(case_id, user, purpose="address", editable=True)
    record = await svc.save_file_record(
        case,
        user,
        "tenant",
        "address_records",
        {
            "address_text": svc.vault.encrypt(
                payload.address_text, case["id"] + ":address"
            ),
            "proof_type": payload.proof_type,
            "verification_status": "pending",
        },
        payload.proof,
        "proof_storage_key",
    )
    await svc.recompute(case, user)
    return {"id": record["id"], "status": "pending"}


@router.post("/verification-cases/{case_id}/references")
async def references(
    case_id: UUID,
    payload: s.ReferenceContact,
    user=Depends(actor),
    svc=Depends(service),
):
    case = await svc.case(case_id, user, purpose="references", editable=True)
    existing = await svc.repo.rows(
        "references", case_id="eq." + case["id"], select="id", limit="6"
    )
    if len(existing) >= 5:
        raise HTTPException(409, "A case can have at most five references.")
    data = {"type": payload.type, "status": "pending"}
    for field in ("name", "phone", "email"):
        value = getattr(payload, field)
        data[field] = (
            svc.vault.encrypt(value, case["id"] + ":reference:" + field)
            if value
            else None
        )
    record = await svc.repo.write(
        case["id"], "references", data, user, "tenant", "reference_submitted"
    )
    await svc.recompute(case, user)
    return {"id": record["id"], "status": "pending"}


@router.post("/verification-cases/{case_id}/guarantor")
async def guarantor(
    case_id: UUID, payload: s.Guarantor, user=Depends(actor), svc=Depends(service)
):
    case = await svc.case(case_id, user, purpose="guarantor", editable=True)
    if await svc.repo.one("guarantors", case_id="eq." + case["id"]):
        raise HTTPException(409, "A guarantor has already been added.")
    invitation = secrets.token_urlsafe(32)
    data = {
        key: svc.vault.encrypt(getattr(payload, key), case["id"] + ":guarantor:" + key)
        for key in ("full_name", "phone", "email", "relationship")
    }
    data.update(
        status="invited",
        invitation_hash=svc.vault.digest(invitation, "guarantor_invite"),
        invitation_expires_at=(now() + timedelta(days=2)).isoformat(),
    )
    record = await svc.repo.write(
        case["id"], "guarantors", data, user, "tenant", "guarantor_invited"
    )
    return {
        "id": record["id"],
        "invitation": invitation,
        "expiresAt": data["invitation_expires_at"],
    }


@router.post("/verification-cases/{case_id}/guarantor/accept")
async def accept_guarantor(
    case_id: UUID,
    payload: s.AcceptGuarantor,
    request: Request,
    user=Depends(actor),
    svc=Depends(service),
):
    await svc.rate_limit(user, ip(request), "guarantor_invite")
    result = await svc.repo.rpc(
        "verification_accept_guarantor",
        case=str(case_id),
        actor=user,
        hash=svc.vault.digest(
            payload.invitation.get_secret_value(), "guarantor_invite"
        ),
    )
    if not result:
        raise HTTPException(404, "The guarantor invitation is invalid or expired.")
    return {"accepted": True, "next_step": "consent"}


@router.get("/verification-cases/{case_id}", response_model=s.LandlordSummary)
async def own_case(
    case_id: UUID,
    subject_type: s.Subject = "tenant",
    user=Depends(actor),
    svc=Depends(service),
):
    return await svc.summary(case_id, user, subject=subject_type)


@router.post("/verification-cases/{case_id}/dispute")
async def dispute(
    case_id: UUID, payload: s.Dispute, user=Depends(actor), svc=Depends(service)
):
    case = await svc.case(case_id, user)
    if case["status"] == "expired" or not active(case):
        raise HTTPException(
            409, "The case has expired. Contact support about your dispute."
        )
    # A completed case can be disputed, but evidence submission remains closed until a reviewer reopens it.
    record = await svc.repo.write(
        case["id"],
        "verification_disputes",
        {
            "subject_id": user,
            "reason_encrypted": svc.vault.encrypt(
                payload.reason, case["id"] + ":dispute"
            ),
        },
        user,
        "tenant",
        "result_disputed",
    )
    return {"id": record["id"], "status": "pending"}


def active(case):
    from verification.service import active_date

    return active_date(case["expires_at"])


@router.get(
    "/landlord/verification-cases/{case_id}/summary", response_model=s.LandlordSummary
)
async def landlord_summary(case_id: UUID, user=Depends(actor), svc=Depends(service)):
    return await svc.summary(case_id, user, role="landlord")


@router.get("/admin/verification-cases")
async def review_queue(
    status: str = Query(
        "needs_review",
        pattern="^(draft|consent_given|in_progress|needs_review|completed|expired)$",
    ),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100000),
    user=Depends(require_admin),
    _reason=Depends(reason),
    svc=Depends(service),
):
    await svc.repo.audit(None, user["id"], "admin", "review_queue_read")
    return {
        "items": await svc.repo.rows(
            "verification_cases",
            status="eq." + status,
            select="id,status,overall_result,score,created_at,expires_at",
            order="created_at.asc,id.asc",
            limit=str(limit),
            offset=str(offset),
        )
    }


@router.get("/admin/verification-cases/{case_id}/evidence")
async def review_evidence(
    case_id: UUID,
    user=Depends(require_admin),
    _reason=Depends(reason),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin")
    bundle = await svc.bundle(case, user["id"], "admin")
    results = {
        "identity": [],
        "liveness": [],
        "employment": [],
        "address": [],
        "references": [],
        "disputes": [],
    }
    for identity in bundle["identity_records"]:
        ctx = case["id"] + ":" + identity["subject_id"]
        row = {
            "id": identity["id"],
            "subject_type": identity["subject_type"],
            "status": identity["status"],
            "name_match_score": identity["name_match_score"],
            "dob_match": identity["dob_match"],
            "phone_match": identity["phone_match"],
            "duplicate_review_required": identity["duplicate_identity"],
            "reference_photo_available": bool(
                identity.get("reference_photo_encrypted")
            ),
        }
        for kind in ("bvn", "nin"):
            row["name_" + kind] = (
                svc.vault.decrypt(
                    identity["full_name_" + kind], ctx + ":" + kind + "_name"
                )
                if identity.get("full_name_" + kind)
                else None
            )
        results["identity"].append(row)
    for check in bundle["liveness_checks"]:
        results["liveness"].append(
            {
                "id": check["id"],
                "subject_type": check["subject_type"],
                "status": check["status"],
                "selfie_url": await svc.storage.signed_url(check["selfie_storage_key"])
                if check.get("selfie_storage_key")
                else None,
            }
        )
    for record in bundle["employment_records"]:
        ctx = case["id"] + ":" + record["subject_id"]
        results["employment"].append(
            {
                "id": record["id"],
                "subject_id": record["subject_id"],
                "subject_type": record["subject_type"],
                "employer_name": svc.vault.decrypt(
                    record["employer_name"], ctx + ":employer"
                )
                if record.get("employer_name")
                else None,
                "job_title": svc.vault.decrypt(record["job_title"], ctx + ":job")
                if record.get("job_title")
                else None,
                "monthly_income_kobo": record["monthly_income_kobo"],
                "status": record["verification_status"],
                "document_url": await svc.storage.signed_url(
                    record["document_storage_key"]
                )
                if record.get("document_storage_key")
                else None,
            }
        )
    for record in bundle["address_records"]:
        results["address"].append(
            {
                "id": record["id"],
                "address": svc.vault.decrypt(
                    record["address_text"], case["id"] + ":address"
                )
                if record.get("address_text")
                else None,
                "status": record["verification_status"],
                "proof_url": await svc.storage.signed_url(record["proof_storage_key"])
                if record.get("proof_storage_key")
                else None,
            }
        )
    for record in bundle["references"]:
        results["references"].append(
            {
                "id": record["id"],
                "type": record["type"],
                "status": record["status"],
                **{
                    key: svc.vault.decrypt(
                        record[key], case["id"] + ":reference:" + key
                    )
                    if record.get(key)
                    else None
                    for key in ("name", "phone", "email")
                },
            }
        )
    for record in await svc.repo.rows(
        "verification_disputes", case_id="eq." + case["id"]
    ):
        results["disputes"].append(
            {
                "id": record["id"],
                "reason": svc.vault.decrypt(
                    record["reason_encrypted"], case["id"] + ":dispute"
                )
                if record.get("reason_encrypted")
                else None,
            }
        )
    return results


@router.get("/admin/verification-cases/{case_id}/identity/{identity_id}/photo")
async def nin_photo(
    case_id: UUID,
    identity_id: UUID,
    user=Depends(require_admin),
    _reason=Depends(reason),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin")
    await svc.repo.audit(case["id"], user["id"], "admin", "nin_reference_photo_read")
    if case["status"] == "expired" or not active(case):
        raise HTTPException(410, "The reference photo has expired.")
    identity = await svc.repo.one(
        "identity_records", id="eq." + str(identity_id), case_id="eq." + case["id"]
    )
    if not identity or not identity.get("reference_photo_encrypted"):
        raise HTTPException(
            404, "No NIN reference photo is available. Keep the check in manual review."
        )
    photo = svc.vault.decrypt(
        identity["reference_photo_encrypted"],
        case["id"] + ":" + identity["subject_id"] + ":nin_photo",
    )
    try:
        image = base64.b64decode(photo, validate=True)
        if not image.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")):
            raise ValueError("invalid image")
    except (ValueError, TypeError):
        raise HTTPException(
            502, "The reference photo format is not supported."
        ) from None
    return Response(
        image,
        media_type="image/png" if image.startswith(b"\x89PNG") else "image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/admin/verification-cases/{case_id}/liveness/{check_id}/decision")
async def decide_liveness(
    case_id: UUID,
    check_id: UUID,
    payload: s.LivenessDecision,
    user=Depends(require_admin),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin", editable=True)
    await svc.repo.audit(case["id"], user["id"], "admin", "liveness_review_started")
    record = await svc.repo.one(
        "liveness_checks", id="eq." + str(check_id), case_id="eq." + case["id"]
    )
    if not record:
        raise HTTPException(404, "Selfie check not found.")
    identity = await svc.repo.one(
        "identity_records",
        case_id="eq." + case["id"],
        subject_id="eq." + record["subject_id"],
    )
    if payload.status == "passed" and (
        not identity or not identity.get("reference_photo_encrypted")
    ):
        raise HTTPException(
            409, "A NIN reference photo is required to pass the manual comparison."
        )
    await svc.repo.write(
        case["id"],
        "liveness_checks",
        {
            "id": record["id"],
            "status": payload.status,
            "match_score": payload.match_score,
            "reviewed_by": user["id"],
            "reviewed_at": now().isoformat(),
            "review_notes_encrypted": svc.vault.encrypt(
                payload.reason, case["id"] + ":liveness_notes"
            ),
        },
        user["id"],
        "admin",
        "liveness_reviewed",
    )
    return await svc.recompute(case, user["id"])


@router.post("/admin/verification-cases/{case_id}/employment/verify")
async def verify_employment(
    case_id: UUID,
    payload: s.EmploymentDecision,
    user=Depends(require_admin),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin", editable=True)
    subject_id = str(payload.subject_id) if payload.subject_id else case["tenant_id"]
    record = await svc.subject_record(
        "employment_records",
        case,
        subject_id,
        payload.subject_type,
        reader=user["id"],
        reader_role="admin",
    )
    if not record:
        raise HTTPException(404, "Employment record not found.")
    record = await svc.repo.write(
        case["id"],
        "employment_records",
        {
            "id": record["id"],
            "verification_status": payload.verification_status,
            "verification_method": payload.verification_method,
            "verified_by": user["id"],
            "verified_at": now().isoformat(),
            "verification_notes": svc.vault.encrypt(
                payload.reason, case["id"] + ":employment_notes"
            ),
        },
        user["id"],
        "admin",
        "employment_reviewed",
    )
    await svc.refresh_affordability(case, record, user["id"], "admin")
    return await svc.recompute(case, user["id"])


@router.post("/admin/verification-cases/{case_id}/address/{address_id}/verify")
async def verify_address(
    case_id: UUID,
    address_id: UUID,
    payload: s.AddressDecision,
    user=Depends(require_admin),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin", editable=True)
    await svc.repo.write(
        case["id"],
        "address_records",
        {"id": str(address_id), "verification_status": payload.status},
        user["id"],
        "admin",
        "address_reviewed",
    )
    return await svc.recompute(case, user["id"])


@router.post("/admin/verification-cases/{case_id}/references/{ref_id}/record")
async def record_reference(
    case_id: UUID,
    ref_id: UUID,
    payload: s.ReferenceDecision,
    user=Depends(require_admin),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin", editable=True)
    await svc.repo.write(
        case["id"],
        "references",
        {
            "id": str(ref_id),
            "status": payload.status,
            "paid_on_time": payload.paid_on_time,
            "property_condition": payload.property_condition,
            "would_rent_again": payload.would_rent_again,
            "notes": svc.vault.encrypt(payload.reason, case["id"] + ":reference_notes"),
            "responded_at": now().isoformat()
            if payload.status == "responded"
            else None,
        },
        user["id"],
        "admin",
        "reference_recorded",
    )
    return await svc.recompute(case, user["id"])


@router.post("/admin/verification-cases/{case_id}/recompute")
async def recompute(
    case_id: UUID,
    payload: s.ReviewReason,
    user=Depends(require_admin),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin", editable=True)
    return await svc.recompute(case, user["id"])


@router.post("/admin/verification-cases/{case_id}/decision")
async def final_decision(
    case_id: UUID,
    payload: s.CaseDecision,
    user=Depends(require_admin),
    svc=Depends(service),
):
    case = await svc.case(case_id, user["id"], role="admin", editable=True)
    summary = await svc.recompute(case, user["id"])
    if summary["result"] == "pending":
        raise HTTPException(
            409,
            "Complete or review the pending checks before recording a final assessment.",
        )
    await svc.repo.rpc(
        "verification_set_summary",
        case=case["id"],
        actor=user["id"],
        summary=summary,
        score=summary["score"],
        decision=payload.result,
        notes=svc.vault.encrypt(payload.reason, case["id"] + ":review_notes"),
    )
    return {"overallResult": payload.result, "reviewedByHuman": True}


@router.post("/webhooks/mono")
async def webhook(
    payload: s.MonoWebhook,
    mono_webhook_secret: Optional[str] = Header(
        default=None, alias="mono-webhook-secret"
    ),
    svc=Depends(service),
):
    if (
        not settings.MONO_WEBHOOK_SECRET
        or not mono_webhook_secret
        or not hmac.compare_digest(settings.MONO_WEBHOOK_SECRET, mono_webhook_secret)
    ):
        raise HTTPException(401, "Invalid webhook credentials.")
    digest = svc.vault.digest(payload.event_id, "mono_event")
    await svc.repo.audit(None, None, "system", "mono_webhook_received")
    await svc.repo.store.request(
        "POST",
        "verification_webhook_events",
        params={"on_conflict": "event_hash"},
        headers={"Prefer": "resolution=ignore-duplicates"},
        json={
            "event_hash": digest,
            "event_type": payload.event,
            "raw_response_encrypted": svc.vault.encrypt(
                payload.model_dump(), "webhook:" + digest
            ),
            "expires_at": (
                now() + timedelta(days=settings.DATA_RETENTION_DAYS)
            ).isoformat(),
        },
    )
    # Lookup endpoints used here are synchronous; no undocumented identity webhook mutates case status.
    return {"received": True}


@router.post("/jobs/verification-retention")
async def retention(
    authorization: Optional[str] = Header(default=None), svc=Depends(service)
):
    if (
        not settings.VERIFICATION_JOB_SECRET
        or not authorization
        or not hmac.compare_digest(
            authorization, "Bearer " + settings.VERIFICATION_JOB_SECRET
        )
    ):
        raise HTTPException(401, "Invalid retention job credentials.")
    return await svc.retention()
