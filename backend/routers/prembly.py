import logging
from fastapi import APIRouter, Header, HTTPException, status
from typing import Optional
import hmac
from config import settings
from schemas.prembly import (
    PremblyBVNVerificationRequest,
    PremblyNINVerificationRequest,
    PremblyVerificationResponse,
    PremblyWebhookPayload,
)
from services.prembly_service import prembly_service
from services.screening_store import authenticated_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prembly", tags=["Prembly KYC & Background Checks"])


@router.post(
    "/verify-bvn",
    response_model=PremblyVerificationResponse,
    summary="Verify BVN Identity",
    description="Validates an 11-digit BVN and returns official KYC details (Full Name, Date of Birth, Gender, Watchlist status, etc.)."
)
async def verify_bvn(payload: PremblyBVNVerificationRequest, authorization: Optional[str] = Header(default=None)):
    await authenticated_user_id(authorization)
    result = await prembly_service.verify_bvn(
        bvn=payload.bvn,
        first_name=payload.first_name,
        last_name=payload.last_name,
        dob=payload.dob
    )
    return result


@router.post(
    "/verify-nin",
    response_model=PremblyVerificationResponse,
    summary="Verify NIN Identity",
    description="Validates an 11-digit NIN and returns KYC verification records."
)
async def verify_nin(payload: PremblyNINVerificationRequest, authorization: Optional[str] = Header(default=None)):
    await authenticated_user_id(authorization)
    result = await prembly_service.verify_nin(
        nin=payload.nin,
        first_name=payload.first_name,
        last_name=payload.last_name
    )
    return result


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    summary="Prembly Webhook Receiver",
    description="Receives real-time asynchronous identity & background verification callbacks from Prembly."
)
async def prembly_webhook(payload: PremblyWebhookPayload, prembly_webhook_secret: Optional[str] = Header(default=None, alias="prembly-webhook-secret")):
    if not settings.PREMBLY_WEBHOOK_SECRET or not prembly_webhook_secret or not hmac.compare_digest(settings.PREMBLY_WEBHOOK_SECRET, prembly_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook credentials.")
    logger.info(f"Received Prembly webhook: {payload.verification_type or payload.event}")
    return {"received": True, "verification_type": payload.verification_type}
