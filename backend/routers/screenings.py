import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional
from uuid import uuid4
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from config import settings
from routers.mono import mono_service
from routers.prembly import prembly_service
from services.scoring import calculate_readiness_score
from services.screening_store import SupabaseStore, authenticated_user, authenticated_user_id, hash_token, new_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Tenant Screenings"])

CONSENT_PURPOSE = "Tenant identity and rental readiness screening for the specified tenancy application."
PACKAGES: Dict[str, Dict[str, Any]] = {
    "basic": {"id": "basic", "name": "Basic", "price": 3000, "currency": "NGN", "checks": ["readiness_score"], "check_count": 1},
    "standard": {"id": "standard", "name": "Standard", "price": 7000, "currency": "NGN", "checks": ["readiness_score", "identity"], "check_count": 1},
    "premium": {"id": "premium", "name": "Premium", "price": 12000, "currency": "NGN", "checks": ["readiness_score", "identity", "credit_bureau"], "check_count": 1},
    "founding": {"id": "founding", "name": "Founding Member", "price": 25000, "currency": "NGN", "checks": ["3_premium_checks"], "check_count": 3},
}


class ScreeningCreate(BaseModel):
    package_id: str
    intake_mode: Literal["direct", "tenant_link"]
    tenant_name: str = Field(min_length=2, max_length=160)
    tenant_phone: str = Field(min_length=6, max_length=40)
    tenant_email: Optional[str] = Field(default=None, max_length=200)
    property_id: Optional[str] = Field(default=None, max_length=128)
    property_title: str = Field(default="Rental application", min_length=1, max_length=200)
    monthly_rent: Optional[float] = Field(default=None, gt=0, le=1_000_000_000)
    monthly_income: Optional[float] = Field(default=None, gt=0, le=1_000_000_000)
    on_time_payments: Optional[int] = Field(default=None, ge=0, le=12)
    total_payments: Optional[int] = Field(default=None, ge=0, le=12)
    income_evidence: bool = False
    rental_reference: bool = False
    landlord_confirms_consent: bool = False
    use_bundle_credit: bool = False

    @model_validator(mode="after")
    def validate_payment_history(self):
        if (self.on_time_payments is None) != (self.total_payments is None):
            raise ValueError("Provide both on-time and total rental payment counts, or neither.")
        if self.on_time_payments is not None and self.on_time_payments > self.total_payments:
            raise ValueError("On-time payments cannot exceed total payments.")
        if self.intake_mode == "direct" and (self.monthly_rent is None or self.monthly_income is None):
            raise ValueError("Direct screenings require monthly rent and income.")
        return self


class ScreeningCompletion(BaseModel):
    tenant_name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    tenant_phone: Optional[str] = Field(default=None, min_length=6, max_length=40)
    tenant_email: Optional[str] = Field(default=None, max_length=200)
    monthly_rent: Optional[float] = Field(default=None, gt=0, le=1_000_000_000)
    monthly_income: float = Field(gt=0, le=1_000_000_000)
    on_time_payments: Optional[int] = Field(default=None, ge=0, le=12)
    total_payments: Optional[int] = Field(default=None, ge=0, le=12)
    income_evidence: bool = False
    rental_reference: bool = False
    bvn: Optional[str] = Field(default=None, min_length=11, max_length=11, pattern=r"^\d{11}$")
    consent: bool = False

    @model_validator(mode="after")
    def validate_payment_history(self):
        if (self.on_time_payments is None) != (self.total_payments is None):
            raise ValueError("Provide both on-time and total rental payment counts, or neither.")
        if self.on_time_payments is not None and self.on_time_payments > self.total_payments:
            raise ValueError("On-time payments cannot exceed total payments.")
        return self


def _package_availability(package_id: str) -> tuple[bool, list[str]]:
    package = PACKAGES[package_id]
    missing = []
    if package_id in ("standard", "premium", "founding") and (not settings.PREMBLY_SECRET_KEY or not settings.PREMBLY_CHECKS_ENABLED):
        missing.append("identity verification is not configured")
    if package_id in ("premium", "founding") and (not settings.MONO_SECRET_KEY or not settings.MONO_CREDIT_CHECKS_ENABLED):
        missing.append("credit bureau verification is not configured")
    provider = settings.PAYMENT_PROVIDER.strip().lower()
    if provider == "paystack" and not settings.PAYSTACK_SECRET_KEY:
        missing.append("payments are not configured")
    elif provider == "flutterwave":
        if not settings.FLW_SECRET_KEY:
            missing.append("Flutterwave payments are not configured")
        if not settings.FLW_WEBHOOK_SECRET:
            missing.append("Flutterwave webhook verification is not configured")
    elif provider not in ("paystack", "flutterwave"):
        missing.append("payment provider configuration is invalid")
    if not (settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY and settings.SUPABASE_SERVICE_ROLE_KEY):
        missing.append("screening records are not configured")
    if settings.ENVIRONMENT == "production" and not settings.SCREENING_PRICES_CONFIRMED:
        missing.append("screening prices have not been confirmed for launch")
    if settings.ENVIRONMENT == "production" and provider == "paystack" and settings.PAYSTACK_SECRET_KEY.startswith("sk_test_"):
        missing.append("Paystack test credentials cannot be used in production")
    if settings.ENVIRONMENT == "production" and provider == "flutterwave" and "_TEST-" in settings.FLW_SECRET_KEY:
        missing.append("Flutterwave test credentials cannot be used in production")
    return not missing, missing


def _public_package(package_id: str) -> Dict[str, Any]:
    package = PACKAGES[package_id]
    enabled, reasons = _package_availability(package_id)
    description = {
        "basic": "A clear, rules-based rental readiness score.",
        "standard": "Readiness score plus a real identity verification check.",
        "premium": "Readiness score, identity verification, and a real credit bureau check.",
        "founding": "Three Premium checks. Credit is recorded after purchase.",
    }[package_id]
    return {**package, "description": description, "enabled": enabled, "unavailable_reason": "; ".join(reasons) if reasons else None}


async def _owner_screening(store: SupabaseStore, screening_id: str, user_id: str) -> Dict[str, Any]:
    row = await store.get_one("screening_requests", {"id": f"eq.{screening_id}", "landlord_id": f"eq.{user_id}"})
    if not row:
        raise HTTPException(status_code=404, detail="Screening request not found.")
    return row


async def _payment_for_screening(store: SupabaseStore, screening_id: str) -> Optional[Dict[str, Any]]:
    return await store.get_one("screening_payments", {"screening_id": f"eq.{screening_id}", "select": "*", "order": "created_at.desc"})


async def _verify_payment(payment: Dict[str, Any], reference: str) -> Dict[str, Any]:
    provider = payment.get("provider", "paystack")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            if provider == "flutterwave":
                if not settings.FLW_SECRET_KEY:
                    raise HTTPException(status_code=503, detail="Flutterwave payments are not configured.")
                response = await client.get(
                    "https://api.flutterwave.com/v3/transactions/verify_by_reference",
                    params={"tx_ref": reference},
                    headers={"Authorization": f"Bearer {settings.FLW_SECRET_KEY}"},
                )
            else:
                if not settings.PAYSTACK_SECRET_KEY:
                    raise HTTPException(status_code=503, detail="Paystack payments are not configured.")
                response = await client.get(
                    f"https://api.paystack.co/transaction/verify/{reference}",
                    headers={"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"},
                )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Unable to confirm payment right now.") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail="Unable to confirm payment right now.")
    body = response.json()
    if not body.get("status"):
        raise HTTPException(status_code=400, detail="Payment has not been confirmed.")
    transaction = body.get("data") or {}
    if provider == "flutterwave":
        transaction = {
            **transaction,
            "status": "success" if transaction.get("status") == "successful" else transaction.get("status"),
            "reference": transaction.get("tx_ref"),
            "amount": round(float(transaction.get("amount", 0)) * 100),
            "provider": "flutterwave",
        }
    else:
        transaction["provider"] = "paystack"
    return transaction


async def _fulfill_payment(store: SupabaseStore, reference: str, transaction: Dict[str, Any]) -> Dict[str, Any]:
    payment = await store.get_one("screening_payments", {"reference": f"eq.{reference}"})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment reference not found.")
    expected_package = PACKAGES[payment["package_id"]]
    if (
        transaction.get("provider", "paystack") != payment.get("provider", "paystack")
        or
        transaction.get("status") != "success"
        or transaction.get("reference") != reference
        or transaction.get("amount") != payment["amount_kobo"]
        or transaction.get("currency") != payment["currency"]
        or payment["amount_kobo"] != expected_package["price"] * 100
    ):
        raise HTTPException(status_code=400, detail="Payment details do not match this screening request.")
    await store.rpc("fulfill_screening_payment", {
        "p_reference": reference,
        "p_amount_kobo": payment["amount_kobo"],
        "p_currency": payment["currency"],
    })
    return await _owner_screening(store, payment["screening_id"], payment["landlord_id"])


async def _process_screening(
    store: SupabaseStore,
    row: Dict[str, Any],
    payload: ScreeningCompletion,
    consent_method: str,
) -> Dict[str, Any]:
    package_id = row["package_id"]
    monthly_rent = payload.monthly_rent or row.get("monthly_rent")
    if not monthly_rent:
        raise HTTPException(status_code=422, detail="Monthly rent is required to calculate the readiness score.")
    required = ["identity"] if package_id == "standard" else ["identity", "credit_bureau"] if package_id in ("premium", "founding") else []
    eligible_status = "in.(paid_ready,incomplete)" if consent_method == "landlord_attestation" else "in.(awaiting_tenant,incomplete)"
    claimed = await store.patch("screening_requests", {"id": f"eq.{row['id']}", "status": eligible_status}, {"status": "processing"})
    if not claimed:
        raise HTTPException(status_code=409, detail="This screening is already being processed or has already been completed.")

    if consent_method == "tenant_direct_consent":
        prior_consent = await store.get_one("screening_consents", {"screening_id": f"eq.{row['id']}", "method": "eq.tenant_direct_consent"})
        if not prior_consent:
            try:
                await store.insert("screening_consents", {
                    "screening_id": row["id"],
                    "landlord_id": row["landlord_id"],
                    "method": consent_method,
                    "purpose": CONSENT_PURPOSE,
                    "version": settings.SCREENING_CONSENT_VERSION,
                    "collected_at": datetime.now(timezone.utc).isoformat(),
                })
            except HTTPException:
                await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {"status": "incomplete"})
                raise
    checks: Dict[str, str] = {"readiness_score": "complete"}
    first = (payload.tenant_name or row["tenant_name"]).strip().split()[0]
    last = (payload.tenant_name or row["tenant_name"]).strip().split()[-1]

    if "identity" in required:
        if not payload.bvn:
            checks["identity"] = "incomplete: BVN is required for this package"
        elif not settings.PREMBLY_SECRET_KEY:
            checks["identity"] = "unavailable: identity provider is not configured"
        else:
            try:
                result = await prembly_service.verify_bvn(payload.bvn, first_name=first, last_name=last)
                data = result.get("data") or {}
                verified = result.get("status") in (True, "success") and (
                    result.get("response_code") == "00" or str(data.get("verification_status", "")).upper() == "VERIFIED"
                )
                checks["identity"] = "verified" if verified else "failed"
            except HTTPException:
                checks["identity"] = "unavailable"
    if "credit_bureau" in required:
        if not payload.bvn:
            checks["credit_bureau"] = "incomplete: BVN is required for this package"
        elif not settings.MONO_SECRET_KEY:
            checks["credit_bureau"] = "unavailable: credit provider is not configured"
        else:
            try:
                result = await mono_service.lookup_credit_history(payload.bvn, provider="all", reason="Tenant rental screening")
                if result.get("status") in (True, "success", "successful") or result.get("data"):
                    checks["credit_bureau"] = "complete"
                else:
                    checks["credit_bureau"] = "unavailable"
            except HTTPException:
                checks["credit_bureau"] = "unavailable"

    for name in required:
        if checks.get(name) != "verified" and not (name == "credit_bureau" and checks.get(name) == "complete"):
            await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {"status": "incomplete", "check_status": checks})
            raise HTTPException(status_code=424, detail={"message": "One or more included checks could not be completed. No result was marked verified.", "check_status": checks})

    score = calculate_readiness_score(
        monthly_rent=monthly_rent,
        monthly_income=payload.monthly_income,
        on_time_payments=payload.on_time_payments,
        total_payments=payload.total_payments,
        income_evidence=payload.income_evidence,
        rental_reference=payload.rental_reference,
    )
    intake_source = "tenant_reported" if consent_method == "tenant_direct_consent" else "landlord_reported"
    score["input_sources"] = {
        "income": intake_source,
        "rent": "landlord_supplied" if row.get("monthly_rent") else "tenant_reported",
        "rental_history": intake_source if payload.total_payments else "not_provided",
        "evidence": intake_source,
    }

    updated = await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {
        "tenant_name": payload.tenant_name or row["tenant_name"],
        "tenant_phone": payload.tenant_phone or row["tenant_phone"],
        "tenant_email": payload.tenant_email or row.get("tenant_email"),
        "monthly_rent": monthly_rent,
        "monthly_income": payload.monthly_income,
        "on_time_payments": payload.on_time_payments,
        "total_payments": payload.total_payments,
        "income_evidence": payload.income_evidence,
        "rental_reference": payload.rental_reference,
        "score": score,
        "check_status": checks,
        "status": "complete",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    return updated[0]


@router.get("/api/screenings/packages")
async def list_packages():
    return {"packages": [_public_package(package_id) for package_id in PACKAGES]}


@router.get("/api/screenings")
async def list_screenings(limit: int = 20, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    rows = await store.request("GET", "screening_requests", params={
        "landlord_id": f"eq.{user_id}",
        "select": "id,package_id,intake_mode,tenant_name,tenant_phone,tenant_email,property_title,monthly_rent,monthly_income,on_time_payments,total_payments,income_evidence,rental_reference,status,payment_status,score,check_status,created_at,completed_at",
        "order": "created_at.desc",
        "limit": str(max(1, min(limit, 50))),
    })
    return {"screenings": rows or []}


@router.post("/api/screenings")
async def create_screening(payload: ScreeningCreate, authorization: Optional[str] = Header(default=None)):
    user = await authenticated_user(authorization)
    user_id = user["id"]
    if payload.package_id not in PACKAGES:
        raise HTTPException(status_code=422, detail="Choose a valid screening package.")
    package = _public_package(payload.package_id)
    if not package["enabled"]:
        raise HTTPException(status_code=409, detail=package["unavailable_reason"] or "This package is not available.")
    if payload.intake_mode == "direct" and not payload.landlord_confirms_consent:
        raise HTTPException(status_code=400, detail="Confirm that the tenant gave consent before starting this check.")
    if payload.total_payments is not None and payload.on_time_payments is not None and payload.on_time_payments > payload.total_payments:
        raise HTTPException(status_code=422, detail="On-time payments cannot exceed total payments.")
    store = SupabaseStore()
    row = await store.insert("screening_requests", {
        "landlord_id": user_id,
        "landlord_email": user.get("email"),
        "package_id": payload.package_id,
        "intake_mode": payload.intake_mode,
        "tenant_name": payload.tenant_name.strip(),
        "tenant_phone": payload.tenant_phone.strip(),
        "tenant_email": payload.tenant_email.strip() if payload.tenant_email else None,
        "property_id": payload.property_id,
        "property_title": payload.property_title.strip(),
        "monthly_rent": payload.monthly_rent,
        "monthly_income": payload.monthly_income,
        "on_time_payments": payload.on_time_payments,
        "total_payments": payload.total_payments,
        "income_evidence": payload.income_evidence,
        "rental_reference": payload.rental_reference,
        "status": "draft",
        "payment_status": "unpaid",
    })
    if payload.intake_mode == "direct":
        await store.insert("screening_consents", {
            "screening_id": row["id"],
            "landlord_id": user_id,
            "method": "landlord_attestation",
            "purpose": CONSENT_PURPOSE,
            "version": settings.SCREENING_CONSENT_VERSION,
            "collected_at": datetime.now(timezone.utc).isoformat(),
        })
    if payload.use_bundle_credit:
        if payload.package_id != "premium":
            raise HTTPException(status_code=400, detail="Founding Member credits can only be used for Premium screenings.")
        await store.rpc("consume_screening_credit", {"p_landlord_id": user_id, "p_screening_id": row["id"]})
        if payload.intake_mode == "tenant_link":
            tenant_url = await _issue_tenant_link(store, row)
            return {"screening_id": row["id"], "status": "awaiting_tenant", "tenant_url": tenant_url, "package": package}
        return {"screening_id": row["id"], "status": "paid_ready", "payment_status": "paid", "package": package}
    return {"screening_id": row["id"], "status": row["status"], "package": package}


async def _issue_tenant_link(store: SupabaseStore, row: Dict[str, Any]) -> str:
    token = new_token()
    await store.patch("screening_tenant_tokens", {"screening_id": f"eq.{row['id']}"}, {"invalidated_at": datetime.now(timezone.utc).isoformat()})
    await store.insert("screening_tenant_tokens", {
        "screening_id": row["id"],
        "token_hash": hash_token(token),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    })
    return f"{settings.PUBLIC_APP_URL.rstrip('/')}/verify/{token}"


@router.post("/api/screenings/{screening_id}/checkout")
async def initialize_checkout(screening_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    package = _public_package(row["package_id"])
    if not package["enabled"]:
        raise HTTPException(status_code=409, detail=package["unavailable_reason"] or "This package is not available.")
    if row["payment_status"] == "paid":
        return {"status": "paid", "screening_id": screening_id}
    if not row.get("landlord_email"):
        raise HTTPException(status_code=400, detail="A valid landlord email is required for payment receipts.")
    existing = await _payment_for_screening(store, screening_id)
    if existing and existing["status"] == "pending":
        return {"status": "pending", "reference": existing["reference"], "authorization_url": existing.get("authorization_url")}
    reference = f"tt_{uuid4().hex}"
    amount_kobo = package["price"] * 100
    payment = await store.insert("screening_payments", {
        "screening_id": screening_id,
        "landlord_id": user_id,
        "package_id": row["package_id"],
        "provider": settings.PAYMENT_PROVIDER.strip().lower(),
        "reference": reference,
        "amount_kobo": amount_kobo,
        "currency": "NGN",
        "status": "pending",
    })
    provider = settings.PAYMENT_PROVIDER.strip().lower()
    if provider not in ("paystack", "flutterwave"):
        await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"status": "failed"})
        raise HTTPException(status_code=503, detail="Payment provider configuration is invalid.")
    secret_key = settings.FLW_SECRET_KEY if provider == "flutterwave" else settings.PAYSTACK_SECRET_KEY
    if not secret_key:
        await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"status": "failed"})
        raise HTTPException(status_code=503, detail="Payment processing is not configured.")
    callback = urlsplit(settings.PAYMENT_CALLBACK_URL)
    callback_query = dict(parse_qsl(callback.query))
    callback_query.update({"screening": screening_id, ("tx_ref" if provider == "flutterwave" else "reference"): reference})
    callback_url = urlunsplit((callback.scheme, callback.netloc, callback.path, urlencode(callback_query), callback.fragment))
    if provider == "flutterwave":
        body = {
            "tx_ref": reference,
            "amount": package["price"],
            "currency": "NGN",
            "redirect_url": callback_url,
            "customer": {"email": row.get("landlord_email") or "", "name": "TenTrust Landlord"},
            "meta": {"screening_id": screening_id, "package_id": row["package_id"]},
            "customizations": {"title": "TenTrust tenant screening"},
        }
        init_url = "https://api.flutterwave.com/v3/payments"
    else:
        body = {
            "email": row.get("landlord_email") or "",
            "amount": amount_kobo,
            "currency": "NGN",
            "reference": reference,
            "callback_url": callback_url,
            "metadata": {"screening_id": screening_id, "package_id": row["package_id"]},
        }
        init_url = "https://api.paystack.co/transaction/initialize"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(init_url, json=body, headers={"Authorization": f"Bearer {secret_key}"})
    except httpx.RequestError as exc:
        await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"status": "failed"})
        raise HTTPException(status_code=503, detail="Unable to start checkout. Try again.") from exc
    try:
        checkout_body = response.json()
    except ValueError:
        checkout_body = {}
    if response.status_code >= 400 or not checkout_body.get("status"):
        await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"status": "failed"})
        raise HTTPException(status_code=502, detail="Unable to start checkout. Try again.")
    authorization_url = (checkout_body.get("data") or {}).get("link" if provider == "flutterwave" else "authorization_url")
    allowed_checkout_host = "checkout.flutterwave.com" if provider == "flutterwave" else "checkout.paystack.com"
    if not isinstance(authorization_url, str) or urlsplit(authorization_url).scheme != "https" or urlsplit(authorization_url).hostname != allowed_checkout_host:
        await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"status": "failed"})
        raise HTTPException(status_code=502, detail="Payment provider returned an invalid checkout link.")
    await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"authorization_url": authorization_url})
    await store.patch("screening_requests", {"id": f"eq.{screening_id}"}, {"status": "payment_pending", "payment_status": "pending"})
    return {"status": "pending", "reference": reference, "authorization_url": authorization_url}


@router.post("/api/screenings/{screening_id}/verify-payment")
async def verify_checkout(screening_id: str, reference: str, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    payment = await _payment_for_screening(store, screening_id)
    if not payment or payment["reference"] != reference:
        raise HTTPException(status_code=404, detail="Payment reference not found.")
    if payment["status"] != "paid":
        transaction = await _verify_payment(payment, reference)
        if transaction.get("status") != "success":
            await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"status": "failed"})
            await store.patch("screening_requests", {"id": f"eq.{screening_id}"}, {"status": "draft", "payment_status": "failed"})
            raise HTTPException(status_code=402, detail="Payment was not completed. You can retry checkout.")
        row = await _fulfill_payment(store, reference, transaction)
    result: Dict[str, Any] = {"status": row["status"], "payment_status": "paid", "screening_id": screening_id}
    if row["intake_mode"] == "tenant_link" and row["status"] != "complete":
        result["tenant_url"] = await _issue_tenant_link(store, row)
    return result


@router.get("/api/screenings/credits")
async def get_credits(authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    rows = await store.request("GET", "screening_credits", params={"landlord_id": f"eq.{user_id}", "remaining": "gt.0", "select": "remaining"})
    return {"premium_credits": sum(int(row["remaining"]) for row in (rows or []))}


@router.get("/api/screenings/{screening_id}")
async def get_screening(screening_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    payment = await _payment_for_screening(store, screening_id)
    return {
        "screening_id": row["id"], "package_id": row["package_id"], "intake_mode": row["intake_mode"],
        "tenant_name": row["tenant_name"], "tenant_phone": row["tenant_phone"], "tenant_email": row.get("tenant_email"),
        "property_title": row["property_title"], "monthly_rent": row.get("monthly_rent"),
        "monthly_income": row.get("monthly_income"), "on_time_payments": row.get("on_time_payments"),
        "total_payments": row.get("total_payments"), "income_evidence": row.get("income_evidence", False),
        "rental_reference": row.get("rental_reference", False), "status": row["status"],
        "payment_status": row["payment_status"], "score": row.get("score"),
        "check_status": row.get("check_status") or {}, "payment_reference": payment.get("reference") if payment else None,
    }


@router.post("/api/screenings/{screening_id}/tenant-link")
async def issue_tenant_link(screening_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    if row["intake_mode"] != "tenant_link" or row["payment_status"] != "paid" or row["status"] == "complete":
        raise HTTPException(status_code=409, detail="A tenant link is not available for this screening.")
    return {"tenant_url": await _issue_tenant_link(store, row), "status": row["status"]}


@router.post("/api/screenings/{screening_id}/complete")
async def complete_direct_screening(screening_id: str, payload: ScreeningCompletion, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    if row["intake_mode"] != "direct":
        raise HTTPException(status_code=400, detail="This screening must be completed using its tenant link.")
    if row["payment_status"] != "paid":
        raise HTTPException(status_code=402, detail="Payment must be confirmed before screening begins.")
    if not payload.consent:
        raise HTTPException(status_code=400, detail="Tenant consent is required before processing the screening.")
    updated = await _process_screening(store, row, payload, "landlord_attestation")
    return {"status": updated["status"], "score": updated.get("score"), "check_status": updated.get("check_status") or {}}


@router.get("/api/public/screenings/{token}")
async def get_public_screening(token: str):
    store = SupabaseStore()
    token_row = await store.get_one("screening_tenant_tokens", {"token_hash": f"eq.{hash_token(token)}", "invalidated_at": "is.null"})
    if not token_row or datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="This tenant link is invalid or expired.")
    row = await store.get_one("screening_requests", {"id": f"eq.{token_row['screening_id']}", "payment_status": "eq.paid"})
    if not row or row["status"] == "complete":
        raise HTTPException(status_code=404, detail="This tenant link has already been used or is unavailable.")
    return {"tenant_name": row["tenant_name"], "property_title": row["property_title"], "package": _public_package(row["package_id"])}


@router.post("/api/public/screenings/{token}/complete")
async def complete_public_screening(token: str, payload: ScreeningCompletion):
    if not payload.consent:
        raise HTTPException(status_code=400, detail="Tenant consent is required before processing the screening.")
    store = SupabaseStore()
    token_row = await store.get_one("screening_tenant_tokens", {"token_hash": f"eq.{hash_token(token)}", "invalidated_at": "is.null"})
    if not token_row or datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="This tenant link is invalid or expired.")
    row = await store.get_one("screening_requests", {"id": f"eq.{token_row['screening_id']}", "payment_status": "eq.paid"})
    if not row or row["status"] == "complete":
        raise HTTPException(status_code=404, detail="This tenant link has already been used or is unavailable.")
    updated = await _process_screening(store, row, payload, "tenant_direct_consent")
    await store.patch("screening_tenant_tokens", {"id": f"eq.{token_row['id']}"}, {"consumed_at": datetime.now(timezone.utc).isoformat()})
    return {"status": updated["status"], "score": updated.get("score"), "check_status": updated.get("check_status") or {}}


@router.post("/api/payments/paystack/webhook")
async def paystack_webhook(request: Request, x_paystack_signature: Optional[str] = Header(default=None, alias="x-paystack-signature")):
    body = await request.body()
    if not settings.PAYSTACK_SECRET_KEY or not x_paystack_signature:
        raise HTTPException(status_code=401, detail="Invalid payment notification.")
    expected = hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), body, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(expected, x_paystack_signature):
        raise HTTPException(status_code=401, detail="Invalid payment notification.")
    event = await request.json()
    if event.get("event") != "charge.success":
        return {"received": True}
    data = event.get("data") or {}
    reference = data.get("reference")
    if not reference:
        return {"received": True}
    store = SupabaseStore()
    payment = await store.get_one("screening_payments", {"reference": f"eq.{reference}"})
    if not payment or payment["status"] == "paid":
        return {"received": True}
    if payment.get("provider", "paystack") != "paystack":
        return {"received": True}
    transaction = await _verify_payment(payment, reference)
    await _fulfill_payment(store, reference, transaction)
    return {"received": True}


@router.post("/api/payments/flutterwave/webhook")
async def flutterwave_webhook(request: Request, verif_hash: Optional[str] = Header(default=None, alias="verif-hash")):
    if not settings.FLW_SECRET_KEY or not settings.FLW_WEBHOOK_SECRET or not verif_hash:
        raise HTTPException(status_code=401, detail="Invalid payment notification.")
    if not hmac.compare_digest(settings.FLW_WEBHOOK_SECRET, verif_hash):
        raise HTTPException(status_code=401, detail="Invalid payment notification.")
    event = await request.json()
    data = event.get("data") or {}
    reference = data.get("tx_ref")
    if event.get("event") != "charge.completed" or not reference:
        return {"received": True}
    store = SupabaseStore()
    payment = await store.get_one("screening_payments", {"reference": f"eq.{reference}"})
    if not payment or payment.get("provider") != "flutterwave" or payment["status"] == "paid":
        return {"received": True}
    transaction = await _verify_payment(payment, reference)
    await _fulfill_payment(store, reference, transaction)
    return {"received": True}
