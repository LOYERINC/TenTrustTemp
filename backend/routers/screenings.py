import hashlib
import hmac
import logging
import base64
import json
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Any, Dict, Literal, Optional
from uuid import uuid4
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from config import settings
from routers.mono import mono_service
from services.scoring import calculate_readiness_score
from services.screening_store import SupabaseStore, authenticated_user, authenticated_user_id, get_http_client, hash_token

from services.package_policy import NEW_PACKAGES, statement_required
from services import payment_orders as orders

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Tenant Screenings"])

CONSENT_PURPOSE = "Tenant rental score and any selected BVN credit check for the specified tenancy application."
PACKAGES: Dict[str, Dict[str, Any]] = {
    "identity": {"id": "identity", "name": "Identity verification", "price": settings.IDENTITY_VERIFICATION_PRICE_NGN, "currency": "NGN", "checks": ["identity"], "check_count": 1},
    "basic": {"id": "basic", "name": "Basic", "price": 3000, "currency": "NGN", "checks": ["readiness_score"], "check_count": 1},
    "standard": {"id": "standard", "name": "Standard", "price": 7000, "currency": "NGN", "checks": ["readiness_score", "credit_bureau"], "credit_provider": "crc", "check_count": 1},
    "premium": {"id": "premium", "name": "Premium", "price": 12000, "currency": "NGN", "checks": ["readiness_score", "credit_bureau"], "credit_provider": "all", "check_count": 1},
    "founding": {"id": "founding", "name": "Founding Member", "price": 25000, "currency": "NGN", "checks": ["3_premium_checks"], "credit_provider": "all", "check_count": 3},
}
PACKAGES.update(NEW_PACKAGES)


class ScreeningCreate(BaseModel):
    package_id: str = "identity"
    intake_mode: Literal["direct", "tenant_link"] = "tenant_link"
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
        if self.package_id != "identity" and self.monthly_rent is None:
            raise ValueError("Enter monthly rent to create a tenant check.")
        if self.intake_mode == "direct" and self.monthly_income is None:
            raise ValueError("Enter monthly income to create a tenant check.")
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
    mono_auth_code: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    consent: bool = False

    @model_validator(mode="after")
    def validate_payment_history(self):
        if (self.on_time_payments is None) != (self.total_payments is None):
            raise ValueError("Provide both on-time and total rental payment counts, or neither.")
        if self.on_time_payments is not None and self.on_time_payments > self.total_payments:
            raise ValueError("On-time payments cannot exceed total payments.")
        return self


class TenantConsentCapture(BaseModel):
    consent: bool


_tenant_hits: Dict[str, list] = {}


def _tenant_rate_limit(request: Request, token: str) -> None:
    now = datetime.now(timezone.utc).timestamp()
    if len(_tenant_hits) > 1000:
        for old_key, stamps in list(_tenant_hits.items()):
            fresh = [stamp for stamp in stamps if now - stamp < 60]
            if fresh:
                _tenant_hits[old_key] = fresh
            else:
                _tenant_hits.pop(old_key, None)
    key = f"{request.client.host if request.client else 'unknown'}:{hash_token(token)}"
    recent = [stamp for stamp in _tenant_hits.get(key, []) if now - stamp < 60]
    if len(recent) >= 12:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a minute and try again.")
    recent.append(now)
    _tenant_hits[key] = recent


def _package_availability(package_id: str) -> tuple[bool, list[str]]:
    package = PACKAGES[package_id]
    if package_id in NEW_PACKAGES:
        missing = []
        if package_id == "custom_v2": return False, ["Choose your checks and request a quote."]
        if not settings.SCREENING_V2_ENABLED: missing.append("The new tenant flow is being set up.")
        if not settings.MONO_IDENTITY_CHECKS_ENABLED or not settings.MONO_SECRET_KEY: missing.append("ID checks are not configured.")
        if settings.PAYSTACK_SECRET_KEY.startswith("sk_live_") and not settings.MONO_SECRET_KEY.startswith("live_sk_"):
            missing.append("Live ID checks must be configured before accepting real payments.")
        if package_id == "intermediate_v2" and not settings.MONO_CREDIT_CHECKS_ENABLED: missing.append("Credit checks are not configured.")
        if not settings.PAYSTACK_SECRET_KEY: missing.append("Payments are not configured.")
        if not (settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY and settings.SUPABASE_SERVICE_ROLE_KEY): missing.append("Screening storage is not configured.")
        if settings.ENVIRONMENT == "production" and (not settings.SCREENING_PRICES_CONFIRMED or settings.PAYSTACK_SECRET_KEY.startswith("sk_test_")): missing.append("Live checkout is not approved.")
        if settings.ENVIRONMENT == "demo": missing.append("New packages are not part of the legacy Sandbox demo.")
        return not missing, missing
    missing = []
    if settings.PAYSTACK_SECRET_KEY.startswith("sk_live_") and not settings.MONO_SECRET_KEY.startswith("live_sk_"):
        missing.append("Live ID checks must be configured before accepting real payments.")
    if package_id == "identity" and (not settings.MONO_SECRET_KEY or not settings.MONO_IDENTITY_CHECKS_ENABLED):
        missing.append("identity verification is not configured")
    if package_id in ("standard", "premium", "founding"):
        missing.append("Credit check is not set up yet")
    provider = "paystack" if package_id == "identity" else settings.PAYMENT_PROVIDER.strip().lower()
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
    if settings.ENVIRONMENT == "demo":
        if package_id != "identity":
            missing.append("The public Sandbox demo supports the Identity package")
        if provider != "paystack" or not settings.PAYSTACK_SECRET_KEY.startswith("sk_test_"):
            missing.append("Sandbox checkout requires Paystack test credentials")
        if not settings.MONO_SECRET_KEY.startswith("test_sk_"):
            missing.append("Sandbox identity checks require Mono test credentials")
    return not missing, missing


def _public_package(package_id: str) -> Dict[str, Any]:
    package = PACKAGES[package_id]
    enabled, reasons = _package_availability(package_id)
    if package_id in NEW_PACKAGES:
        return {**package, "enabled": enabled, "unavailable_reason": "; ".join(reasons) if reasons else None}
    description = {
        "identity": "One consent-based identity check. Your tenant enters their ID details in private.",
        "basic": "A score based on rent and income.",
        "standard": "A score and a credit report from one source.",
        "premium": "A score and credit reports from two sources.",
        "founding": "Three Premium checks, with reports from two sources each time.",
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
    if provider == "paystack":
        return await orders.verify_transaction(reference)
    started_at = perf_counter()
    try:
        client = get_http_client("provider")
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
        logger.info("[payment-timing] provider verify provider=%s failed elapsed_ms=%.1f", provider, (perf_counter() - started_at) * 1000)
        raise HTTPException(status_code=503, detail="Unable to confirm payment right now.") from exc
    logger.info("[payment-timing] provider verify provider=%s status=%s elapsed_ms=%.1f", provider, response.status_code, (perf_counter() - started_at) * 1000)
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


async def _fulfill_payment(
    store: SupabaseStore,
    reference: str,
    transaction: Dict[str, Any],
    payment: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    started_at = perf_counter()
    if payment is None:
        payment = await store.get_one("screening_payments", {"reference": f"eq.{reference}"})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment reference not found.")
    if payment.get("provider", "paystack") == "paystack":
        await orders.apply_transaction(store, payment, transaction)
        return await _owner_screening(store, payment["screening_id"], payment["landlord_id"])
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
    row = await _owner_screening(store, payment["screening_id"], payment["landlord_id"])
    logger.info("[payment-timing] fulfill payment complete elapsed_ms=%.1f", (perf_counter() - started_at) * 1000)
    return row


async def _process_screening(
    store: SupabaseStore,
    row: Dict[str, Any],
    payload: ScreeningCompletion,
    consent_method: str,
) -> Dict[str, Any]:
    package_id = row["package_id"]
    if package_id == "identity" or package_id in NEW_PACKAGES:
        raise HTTPException(status_code=400, detail="Complete identity verification using the tenant consent and identity form.")
    if settings.ENVIRONMENT == "demo":
        raise HTTPException(status_code=503, detail="This Sandbox release supports the sample Identity check only.")
    monthly_rent = payload.monthly_rent or row.get("monthly_rent")
    if not monthly_rent:
        raise HTTPException(status_code=422, detail="Monthly rent is required to calculate the readiness score.")
    required = ["credit_bureau"] if package_id in ("standard", "premium", "founding") else []
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
    credit_report = None
    if "credit_bureau" in required:
        credit_bvn = payload.bvn
        if not credit_bvn:
            checks["credit_bureau"] = "incomplete: BVN is required for this package"
        elif not settings.MONO_SECRET_KEY:
            checks["credit_bureau"] = "unavailable: credit provider is not configured"
        else:
            try:
                provider = PACKAGES[package_id].get("credit_provider", "all")
                result = await mono_service.lookup_credit_history(credit_bvn, provider=provider, reason="Tenant rental screening")
                if result.get("status") in (True, "success", "successful") and result.get("data"):
                    data = result.get("data") if isinstance(result.get("data"), dict) else {}
                    credit_report = {
                        "provider": provider,
                        "providers": data.get("providers", []),
                        "credit_history": data.get("credit_history", []),
                        "fetched_at": result.get("timestamp"),
                    }
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
        "credit_report": credit_report,
        "status": "complete",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    return updated[0]


def payment_mode(provider: str) -> str:
    key = settings.PAYSTACK_SECRET_KEY if provider == 'paystack' else settings.FLW_SECRET_KEY
    if provider == 'paystack':
        return 'test' if key.startswith('sk_test_') else 'live' if key.startswith('sk_live_') else 'unknown'
    if provider == 'flutterwave':
        return 'test' if key.startswith('FLWSECK_TEST-') else 'live' if key.startswith('FLWSECK-') else 'unknown'
    return 'unknown'


@router.get("/api/screenings/packages")
async def list_packages():
    return {"packages": [_public_package(package_id) for package_id in NEW_PACKAGES]}


@router.get("/api/screenings")
async def list_screenings(limit: int = 20, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    rows = await store.request("GET", "screening_requests", params={
        "landlord_id": f"eq.{user_id}",
        "select": "id,package_id,intake_mode,tenant_name,tenant_phone,tenant_email,property_title,monthly_rent,monthly_income,on_time_payments,total_payments,income_evidence,rental_reference,status,payment_status,score,check_status,credit_report,created_at,completed_at,name_match,masked_document,identity_verified_at,report_id,landlord_name",
        "order": "created_at.desc",
        "limit": str(max(1, min(limit, 50))),
    })
    token_rows = await store.request("GET", "screening_tenant_tokens", params={
        "screening_id": f"in.({','.join(row['id'] for row in rows or [])})" if rows else "eq.00000000-0000-0000-0000-000000000000",
        "select": "screening_id,expires_at,consumed_at,invalidated_at",
    }) if rows else []
    expiry_by_screening = {token["screening_id"]: token for token in token_rows or []}
    now = datetime.now(timezone.utc)
    for row in rows or []:
        token = expiry_by_screening.get(row["id"])
        if row["status"] in ("paid_ready", "awaiting_tenant") and token and not token.get("consumed_at") and not token.get("invalidated_at"):
            if datetime.fromisoformat(token["expires_at"].replace("Z", "+00:00")) < now:
                await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {"status": "expired"})
                row["status"] = "expired"
    return {"screenings": rows or []}


@router.post("/api/screenings")
async def create_screening(payload: ScreeningCreate, authorization: Optional[str] = Header(default=None)):
    user = await authenticated_user(authorization)
    user_id = user["id"]
    if payload.package_id not in NEW_PACKAGES:
        raise HTTPException(status_code=422, detail="Choose a valid screening package.")
    if payload.package_id in NEW_PACKAGES and payload.intake_mode != "tenant_link":
        raise HTTPException(status_code=422, detail="These packages require the tenant’s private link.")
    package = _public_package(payload.package_id)
    if not package["enabled"]:
        raise HTTPException(status_code=409, detail=package["unavailable_reason"] or "This package is not available.")
    if payload.intake_mode == "direct" and not payload.landlord_confirms_consent:
        raise HTTPException(status_code=400, detail="Confirm that the tenant gave consent before starting this check.")
    if payload.total_payments is not None and payload.on_time_payments is not None and payload.on_time_payments > payload.total_payments:
        raise HTTPException(status_code=422, detail="On-time payments cannot exceed total payments.")
    store = SupabaseStore()
    metadata = user.get("user_metadata") or {}
    row = await store.insert("screening_requests", {
        "landlord_id": user_id,
        "landlord_email": user.get("email"),
        "landlord_name": " ".join(filter(None, [metadata.get("first_name"), metadata.get("last_name")])) or metadata.get("full_name") or "Your landlord",
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


def _signed_tenant_token(token_id: Any, expires_at: datetime) -> str:
    signing_key = settings.TENANT_LINK_SIGNING_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    payload = f"{str(token_id).replace('-', '')}.{int(expires_at.timestamp())}"
    signature = hmac.new(signing_key.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return base64.urlsafe_b64encode(f"{payload}.{encoded_signature}".encode("ascii")).decode("ascii").rstrip("=")


async def _issue_tenant_link(store: SupabaseStore, row: Dict[str, Any]) -> str:
    started_at = perf_counter()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=48)
    token_id = uuid4()
    token = _signed_tenant_token(token_id, expires_at)
    params = {
        "screening_id": row["id"],
        "landlord_id": row["landlord_id"],
        "token_id": str(token_id),
        "token_hash": hash_token(token),
        "expires_at": expires_at.isoformat(),
        "force_replace": None,
    }
    result = await store.rpc("ensure_screening_tenant_token", {f"p_{key}": value for key, value in params.items()})
    token_row = result[0] if isinstance(result, list) else result
    if token_row["id"] != str(token_id):
        old_expiry = datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00"))
        token = _signed_tenant_token(token_row["id"], old_expiry)
        if hash_token(token) != token_row["token_hash"]:
            params.update({"token_id": str(uuid4()), "force_replace": token_row["id"]})
            token = _signed_tenant_token(params["token_id"], expires_at)
            params["token_hash"] = hash_token(token)
            result = await store.rpc("ensure_screening_tenant_token", {f"p_{key}": value for key, value in params.items()})
            token_row = result[0] if isinstance(result, list) else result
            active_expiry = datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00"))
            token = _signed_tenant_token(token_row["id"], active_expiry)
            if hash_token(token) != token_row["token_hash"]:
                raise HTTPException(status_code=503, detail="Unable to restore the active tenant link.")
    logger.info("[payment-timing] link issue total elapsed_ms=%.1f", (perf_counter() - started_at) * 1000)
    return f"{settings.PUBLIC_APP_URL.rstrip('/')}/verify/{token}"


@router.post("/api/screenings/{screening_id}/checkout")
async def initialize_checkout(screening_id: str, authorization: Optional[str] = Header(default=None), request: Request = None):
    user = await authenticated_user(authorization)
    user_id = user["id"]
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    if row["payment_status"] == "paid":
        return {"status":"paid","screening_id":screening_id,"success_url":"/dashboard"}
    package = _public_package(row["package_id"])
    if not package["enabled"]:
        raise HTTPException(status_code=409, detail=package["unavailable_reason"] or "This package is not available.")
    if row["payment_status"] == "paid":
        return {"status": "paid", "screening_id": screening_id}
    if not row.get("landlord_email"):
        raise HTTPException(status_code=400, detail="A valid landlord email is required for payment receipts.")
    provider = "paystack" if row["package_id"] == "identity" else settings.PAYMENT_PROVIDER.strip().lower()
    if provider == "paystack":
        return await orders.initialize(store, row, user, package, request.headers.get("origin") if request else None)
    existing = await _payment_for_screening(store, screening_id)
    if existing and existing["status"] == "pending":
        return {"status": "pending", "reference": existing["reference"], "authorization_url": existing.get("authorization_url")}
    reference = f"tt_{uuid4().hex}"
    amount_kobo = package["price"] * 100
    provider = "paystack" if row["package_id"] == "identity" else settings.PAYMENT_PROVIDER.strip().lower()
    payment = await store.insert("screening_payments", {
        "screening_id": screening_id,
        "landlord_id": user_id,
        "package_id": row["package_id"],
        "provider": provider,
        "mode": payment_mode(provider),
        "reference": reference,
        "amount_kobo": amount_kobo,
        "currency": "NGN",
        "status": "pending",
    })
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
    started_at = perf_counter()
    user_id = await authenticated_user_id(authorization)
    logger.info("[payment-timing] verify endpoint auth elapsed_ms=%.1f", (perf_counter() - started_at) * 1000)
    store = SupabaseStore()
    step_started_at = perf_counter()
    row = await _owner_screening(store, screening_id, user_id)
    payment = await store.get_one("screening_payments", {"reference":f"eq.{orders.reference(reference)}", "screening_id":f"eq.{screening_id}", "landlord_id":f"eq.{user_id}"})
    logger.info("[payment-timing] verify endpoint owner and payment reads elapsed_ms=%.1f", (perf_counter() - step_started_at) * 1000)
    if not payment or payment["reference"] != reference:
        raise HTTPException(status_code=404, detail="Payment reference not found.")
    if payment.get("provider", "paystack") == "paystack" and payment["status"] != "paid":
        payment = await orders.refresh_order(store, payment, force=True)
        row = await _owner_screening(store, screening_id, user_id)
        if payment["status"] != "paid":
            return {**orders.public_status(payment), "payment_status":payment["status"]}
    if payment["status"] != "paid":
        transaction = await _verify_payment(payment, reference)
        if transaction.get("status") != "success":
            await store.patch("screening_payments", {"id": f"eq.{payment['id']}"}, {"status": "failed"})
            await store.patch("screening_requests", {"id": f"eq.{screening_id}"}, {"status": "draft", "payment_status": "failed"})
            raise HTTPException(status_code=402, detail="Payment was not completed. You can retry checkout.")
        row = await _fulfill_payment(store, reference, transaction, payment)
    else:
        logger.info("[payment-timing] verify endpoint skipped provider confirmation for paid payment")
    result: Dict[str, Any] = {"status": row["status"], "payment_status": "paid", "screening_id": screening_id, "intake_mode":row["intake_mode"]}
    if row["intake_mode"] == "tenant_link" and row["status"] != "complete":
        result["tenant_url"] = await _issue_tenant_link(store, row)
        result.update({
            "package_id": row["package_id"],
            "tenant_name": row["tenant_name"],
            "tenant_phone": row["tenant_phone"],
            "tenant_email": row.get("tenant_email"),
            "property_title": row["property_title"],
        })
    logger.info("[payment-timing] verify endpoint total elapsed_ms=%.1f", (perf_counter() - started_at) * 1000)
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
        "id": row["id"], "screening_id": row["id"], "package_id": row["package_id"], "intake_mode": row["intake_mode"],
        "tenant_name": row["tenant_name"], "tenant_phone": row["tenant_phone"], "tenant_email": row.get("tenant_email"),
        "property_title": row["property_title"], "monthly_rent": row.get("monthly_rent"),
        "monthly_income": row.get("monthly_income"), "on_time_payments": row.get("on_time_payments"),
        "total_payments": row.get("total_payments"), "income_evidence": row.get("income_evidence", False),
        "rental_reference": row.get("rental_reference", False), "status": row["status"],
        "payment_status": row["payment_status"], "score": row.get("score"),
        "check_status": row.get("check_status") or {}, "credit_report": row.get("credit_report"),
        "payment_reference": payment.get("reference") if payment else None,
        "name_match": row.get("name_match"), "masked_document": row.get("masked_document"),
        "identity_verified_at": row.get("identity_verified_at"), "report_id": row.get("report_id"),
        "landlord_name": row.get("landlord_name"),
    }


@router.post("/api/screenings/{screening_id}/tenant-link")
async def issue_tenant_link(screening_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    if row["package_id"] in NEW_PACKAGES and (row.get("check_status") or {}).get("liveness") == "pending_review":
        raise HTTPException(status_code=409, detail="This screening is waiting for staff review. No new tenant link is needed.")
    if row["intake_mode"] != "tenant_link" or row["payment_status"] != "paid" or row["status"] in ("complete", "declined"):
        raise HTTPException(status_code=409, detail="A tenant link is not available for this screening.")
    return {"tenant_url": await _issue_tenant_link(store, row), "status": row["status"]}


@router.post("/api/screenings/{screening_id}/decline")
async def decline_screening(screening_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    row = await _owner_screening(store, screening_id, user_id)
    if row.get("status") == "complete":
        raise HTTPException(status_code=409, detail="Completed verifications cannot be declined.")
    await store.patch("screening_tenant_tokens", {"screening_id": f"eq.{screening_id}"}, {"invalidated_at": datetime.now(timezone.utc).isoformat()})
    await store.patch("screening_requests", {"id": f"eq.{screening_id}"}, {"status": "declined"})
    return {"status": "declined"}


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
    return {"status": updated["status"], "score": updated.get("score"), "check_status": updated.get("check_status") or {}, "credit_report": updated.get("credit_report")}


@router.get("/api/public/screenings/{token}")
async def get_public_screening(token: str, request: Request):
    _tenant_rate_limit(request, token)
    store = SupabaseStore()
    token_row = await store.get_one("screening_tenant_tokens", {"token_hash": f"eq.{hash_token(token)}", "invalidated_at": "is.null"})
    if not token_row:
        raise HTTPException(status_code=404, detail="This link is not valid. Ask your landlord for a new one.")
    if token_row.get("consumed_at"):
        raise HTTPException(status_code=410, detail="This link has already been used.")
    if datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This link has expired. Ask your landlord for a new one.")
    row = await store.get_one("screening_requests", {"id": f"eq.{token_row['screening_id']}", "payment_status": "eq.paid"})
    if not row or row["status"] in ("complete", "declined", "expired"):
        raise HTTPException(status_code=404, detail="This tenant link has already been used or is unavailable.")
    return {
        "tenant_name": row["tenant_name"],
        "property_title": row["property_title"],
        "landlord_name": row.get("landlord_name") or "Your landlord",
        "package": _public_package(row["package_id"]),
        "monthly_rent": row.get("monthly_rent"),
        "statement_required": statement_required(row["package_id"], row.get("monthly_rent")),
    }


@router.post("/api/public/screenings/{token}/consent")
async def capture_public_screening_consent(token: str, payload: TenantConsentCapture, request: Request):
    _tenant_rate_limit(request, token)
    if not payload.consent:
        raise HTTPException(status_code=400, detail="Tenant consent is needed before the check.")
    store = SupabaseStore()
    token_row = await store.get_one("screening_tenant_tokens", {"token_hash": f"eq.{hash_token(token)}", "invalidated_at": "is.null"})
    if not token_row:
        raise HTTPException(status_code=404, detail="This link is not valid. Ask your landlord for a new one.")
    if token_row.get("consumed_at"):
        raise HTTPException(status_code=410, detail="This link has already been used.")
    if datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This link has expired. Ask your landlord for a new one.")
    row = await store.get_one("screening_requests", {"id": f"eq.{token_row['screening_id']}", "payment_status": "eq.paid"})
    if not row or row["status"] == "complete":
        raise HTTPException(status_code=404, detail="This tenant link has already been used or is unavailable.")
    existing = await store.get_one("screening_consents", {"screening_id": f"eq.{row['id']}", "method": "eq.tenant_direct_consent"})
    new_flow = row["package_id"] in NEW_PACKAGES
    version = settings.SCREENING_V2_CONSENT_VERSION if new_flow else settings.IDENTITY_CONSENT_VERSION
    consent_data = {
            "screening_id": row["id"],
            "landlord_id": row["landlord_id"],
            "method": "tenant_direct_consent",
            "consented_as": row["tenant_name"],
            "purpose": ("BVN, NIN and manual liveness review; Intermediate includes a Mono credit lookup. For monthly rent over NGN 500000, staff privately review 3-month bank statements for affordability. Landlord sees final screening results only." if new_flow else "Identity verification: compare BVN, NIN and date of birth; landlord sees result only."),
            "version": version,
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }
    if not existing:
        await store.insert("screening_consents", consent_data)
    elif existing.get("version") != version:
        await store.patch("screening_consents", {"id": f"eq.{existing['id']}"}, consent_data)
    return {"consent_recorded": True}


@router.post("/api/public/screenings/{token}/identity")
async def complete_public_identity(token: str, request: Request):
    _tenant_rate_limit(request, token)
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Enter your ID details and try again.") from exc
    document_type = body.get("document_type") if isinstance(body, dict) else None
    document_number = body.get("document_number") if isinstance(body, dict) else None
    bvn = body.get("bvn") if isinstance(body, dict) else None
    nin = body.get("nin") if isinstance(body, dict) else None
    if document_type == "bvn" and bvn is None:
        bvn = document_number
    elif document_type == "nin" and nin is None:
        nin = document_number
    date_of_birth = body.get("date_of_birth") if isinstance(body, dict) else None
    if document_type not in ("bvn", "nin"):
        raise HTTPException(status_code=422, detail="Choose BVN or NIN.")
    if not isinstance(document_number, str) or len(document_number) != 11 or not document_number.isdigit():
        raise HTTPException(status_code=422, detail=f"That {document_type.upper()} doesn't look right. Check the 11 digits and try again.")
    for kind, number in (("BVN", bvn), ("NIN", nin)):
        if not isinstance(number, str) or len(number) != 11 or not number.isascii() or not number.isdigit():
            raise HTTPException(status_code=422, detail=f"Enter your 11-digit {kind}. Both BVN and NIN are required for this identity check.")
    if not isinstance(date_of_birth, str):
        raise HTTPException(status_code=422, detail="Enter a valid date of birth.")
    if not settings.MONO_SECRET_KEY or not settings.MONO_IDENTITY_CHECKS_ENABLED:
        raise HTTPException(status_code=503, detail="Identity verification is being set up. Please try again later.")
    store = SupabaseStore()
    token_row = await store.get_one("screening_tenant_tokens", {"token_hash": f"eq.{hash_token(token)}", "invalidated_at": "is.null"})
    if not token_row:
        raise HTTPException(status_code=404, detail="This link is not valid. Ask your landlord for a new one.")
    if token_row.get("consumed_at"):
        raise HTTPException(status_code=410, detail="This link has already been used.")
    if datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This link has expired. Ask your landlord for a new one.")
    row = await store.get_one("screening_requests", {"id": f"eq.{token_row['screening_id']}", "payment_status": "eq.paid"})
    if not row or row.get("status") in ("complete", "declined", "expired"):
        raise HTTPException(status_code=410, detail="This link has already been used or is no longer available.")
    if row["package_id"] in NEW_PACKAGES:
        raise HTTPException(status_code=409, detail="Use the new tenant screening steps to finish this package.")
    consent = await store.get_one("screening_consents", {"screening_id": f"eq.{row['id']}", "method": "eq.tenant_direct_consent"})
    if not consent:
        raise HTTPException(status_code=403, detail="Please give consent before continuing.")
    if consent.get("version") != settings.IDENTITY_CONSENT_VERSION:
        raise HTTPException(status_code=403, detail="Please refresh this page and review the updated consent for checking both BVN and NIN.")
    try:
        datetime.strptime(date_of_birth, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Enter a valid date of birth.") from exc
    claimed = await store.rpc("claim_identity_tenant_token", {"p_token_hash": hash_token(token)})
    if not claimed:
        raise HTTPException(status_code=410, detail="This link has already been used or is no longer available.")
    last_four = document_number[-4:]
    try:
        result = await mono_service.verify_identity(bvn=bvn, nin=nin, date_of_birth=date_of_birth)
    except Exception:
        await store.patch("screening_tenant_tokens", {"id": f"eq.{token_row['id']}"}, {"claimed_at": None})
        raise
    finally:
        # Keep the submitted identifier only in request memory; never persist or log it.
        if isinstance(body, dict):
            body["document_number"] = ""
            body["bvn"] = ""
            body["nin"] = ""
            body["date_of_birth"] = ""
        document_number = ""
        bvn = ""
        nin = ""
        date_of_birth = ""
    personal_data = result.get("personal_information") or result.get("identity") or {}
    personal = personal_data if isinstance(personal_data, dict) else {}
    verified_name = str(
        result.get("full_name") or result.get("name") or personal.get("full_name") or
        " ".join(filter(None, [personal.get("first_name"), personal.get("middle_name"), personal.get("surname")]))
    ).strip()
    if isinstance(personal, dict):
        personal.clear()
    if isinstance(result, dict):
        result.clear()
    expected_name = " ".join(row["tenant_name"].casefold().split())
    returned_name = " ".join(verified_name.casefold().split())
    if returned_name == expected_name:
        name_match = "match"
    elif returned_name and (returned_name in expected_name or expected_name in returned_name or set(returned_name.split()) & set(expected_name.split())):
        name_match = "partial"
    else:
        name_match = "mismatch"
    now = datetime.now(timezone.utc).isoformat()
    report_id = str(uuid4())
    await store.patch("screening_requests", {"id": f"eq.{row['id']}"}, {
        "status": "complete" if verified_name else "incomplete", "name_match": name_match if verified_name else None,
        "masked_document": f"{document_type.upper()} •••• {last_four}",
        "identity_verified_at": now, "completed_at": now, "report_id": report_id,
        "check_status": {
            "identity": ("sandbox_verified" if settings.ENVIRONMENT == "demo" else "verified") if verified_name else "could_not_verify",
            "environment": "sandbox" if settings.ENVIRONMENT == "demo" else settings.ENVIRONMENT,
        },
    })
    await store.patch("screening_tenant_tokens", {"id": f"eq.{token_row['id']}"}, {"consumed_at": now, "claimed_at": None})
    return {"status": "complete" if verified_name else "incomplete", "name_match": name_match if verified_name else None, "identity_verified_at": now, "report_id": report_id}


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


@router.post("/api/paystack/webhook")
@router.post("/api/payments/paystack/webhook")
async def paystack_webhook(request: Request, x_paystack_signature: Optional[str] = Header(default=None, alias="x-paystack-signature")):
    body = await request.body()
    if len(body) > 262144:
        logger.warning("payment.webhook reference=- outcome=oversized")
        raise HTTPException(413, "Notification too large.")
    try:
        event = json.loads(body)
        if not isinstance(event, dict): raise ValueError()
        data = event.get("data") if isinstance(event.get("data"), dict) else {}
    except (ValueError, TypeError):
        event, data = {}, {}
    ref = data.get("reference")
    safe_ref = ref if isinstance(ref,str) and orders.REFERENCE.fullmatch(ref) else "-"
    logger.info("payment.webhook reference=%s outcome=received", safe_ref)
    expected = hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), body, hashlib.sha512).hexdigest()
    if not settings.PAYSTACK_SECRET_KEY or not x_paystack_signature or not x_paystack_signature.isascii() or len(x_paystack_signature) != 128 or not hmac.compare_digest(expected, x_paystack_signature):
        logger.warning("payment.webhook reference=%s outcome=signature_failure", safe_ref)
        raise HTTPException(401, "Invalid payment notification.")
    if not event:
        raise HTTPException(400, "Invalid payment notification.")
    if event.get("event") != "charge.success": return {"received":True}
    orders.reference(ref)
    store = SupabaseStore()
    payment = await store.get_one("screening_payments", {"reference":f"eq.{ref}"})
    if not payment or payment.get("provider", "paystack") != "paystack":
        logger.warning("payment.webhook reference=%s outcome=unknown_order", ref)
        return {"received":True}
    if payment["status"] == "paid":
        logger.info("payment.webhook reference=%s outcome=already_paid", ref)
        return {"received":True}
    if data.get("status") != "success": raise HTTPException(400, "Invalid successful payment notification.")
    # Signed provider data is authoritative. Only the fast atomic DB transition runs here;
    # no second provider call, biometric check, report generation, or email send.
    await orders.apply_transaction(store, payment, {**data,"provider":"paystack"})
    return {"received":True}


class OrderCreate(BaseModel):
    screening_id: str = Field(min_length=1,max_length=64)


class PaymentRecovery(BaseModel):
    reference: Optional[str] = Field(default=None,max_length=120)
    email: Optional[str] = Field(default=None,max_length=254)


async def _owned_order(store, ref, user_id):
    row = await store.get_one("screening_payments", {"reference":f"eq.{orders.reference(ref)}","landlord_id":f"eq.{user_id}"})
    if not row: raise HTTPException(404, "Payment reference not found for this account.")
    return row


@router.post("/api/orders")
async def start_order(payload: OrderCreate, request: Request, authorization: Optional[str] = Header(default=None)):
    return await initialize_checkout(payload.screening_id,authorization,request)


@router.get("/api/orders/{reference}/status")
async def order_status(reference: str, authorization: Optional[str] = Header(default=None)):
    user_id = await authenticated_user_id(authorization)
    store = SupabaseStore()
    payment = await _owned_order(store,reference,user_id)
    return orders.public_status(await orders.refresh_order(store,payment))


@router.post("/api/orders/{reference}/retry")
async def retry_order(reference: str, request: Request, authorization: Optional[str] = Header(default=None)):
    user = await authenticated_user(authorization)
    store = SupabaseStore()
    payment = await _owned_order(store,reference,user["id"])
    # A failed/abandoned local status is insufficient: verify with Paystack again.
    payment = await orders.refresh_order(store,payment,force=True)
    if payment["status"] not in ("failed","abandoned"):
        return {**orders.public_status(payment),"return_url":orders.return_url(reference,request.headers.get("origin"))}
    row = await _owner_screening(store,payment["screening_id"],user["id"])
    package = _public_package(row["package_id"])
    if not package["enabled"]: raise HTTPException(409,package["unavailable_reason"])
    return await orders.initialize(store,row,user,package,request.headers.get("origin"))


@router.post("/api/orders/recover")
async def recover_orders(payload: PaymentRecovery, authorization: Optional[str] = Header(default=None)):
    user = await authenticated_user(authorization)
    store = SupabaseStore()
    if payload.reference:
        payments = [await _owned_order(store,payload.reference.strip(),user["id"])]
    else:
        if not payload.email or payload.email.strip().lower() != str(user.get("email","")).lower():
            raise HTTPException(400,"Use the email address of your signed-in account, or enter your reference.")
        payments = await store.request("GET","screening_payments",params={"landlord_id":f"eq.{user['id']}","provider":"eq.paystack","status":"in.(pending,failed,abandoned)","order":"created_at.desc","limit":"20","select":"*"})
    recovered=[]
    for payment in payments:
        try:
            recovered.append(orders.public_status(await orders.refresh_order(store,payment,force=True)))
        except HTTPException as exc:
            if exc.status_code != 503: raise
            recovered.append({**orders.public_status(payment),"confirmation_pending":True})
    return {"orders":recovered}


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
    await _fulfill_payment(store, reference, transaction, payment)
    return {"received": True}
