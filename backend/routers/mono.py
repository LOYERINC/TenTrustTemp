import logging
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status
from schemas.mono import (
    MonoCreditHistoryRequest,
    MonoCreditHistoryResponse,
    MonoAuthCodeRequest,
    MonoAuthCodeResponse,
    MonoWebhookPayload
)
from services.mono_service import mono_service
from services.screening_store import authenticated_user_id
from config import settings
import hmac

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mono", tags=["Mono Identity & Credit Integration"])


@router.post(
    "/credit-history",
    response_model=MonoCreditHistoryResponse,
    summary="Look up credit history by BVN",
    description="Fetches formal credit history, bureau scores, active/closed facilities, and defaults for a customer via their 11-digit BVN."
)
async def get_credit_history(payload: MonoCreditHistoryRequest, authorization: Optional[str] = Header(default=None)):
    await authenticated_user_id(authorization)
    # This adapter remains disabled even if a stale deployment flag is true.
    raise HTTPException(status_code=503, detail="Credit checks are not available in this release.")


@router.post(
    "/exchange-token",
    summary="Exchange Mono Connect auth code",
    description="Exchanges the temporary auth code returned by the Mono Connect widget for a permanent Account ID."
)
async def exchange_token(payload: MonoAuthCodeRequest, authorization: Optional[str] = Header(default=None)):
    await authenticated_user_id(authorization)
    if settings.ENVIRONMENT == "demo":
        raise HTTPException(status_code=503, detail="The Sandbox demo supports the sample identity check only.")
    if not settings.MONO_IDENTITY_CHECKS_ENABLED:
        raise HTTPException(status_code=503, detail="Mono identity checks are not enabled for this environment.")
    result = await mono_service.exchange_auth_code(payload.code)
    return result


@router.get(
    "/account/{account_id}/identity",
    summary="Get connected account identity",
    description="Fetches identity and KYC data attached to a connected bank account."
)
async def get_account_identity(account_id: str, authorization: Optional[str] = Header(default=None)):
    await authenticated_user_id(authorization)
    if settings.ENVIRONMENT == "demo":
        raise HTTPException(status_code=503, detail="The Sandbox demo supports the sample identity check only.")
    if not settings.MONO_IDENTITY_CHECKS_ENABLED:
        raise HTTPException(status_code=503, detail="Mono identity checks are not enabled for this environment.")
    result = await mono_service.get_account_identity(account_id)
    return result


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    summary="Mono Webhook Receiver",
    description="Receives real-time webhook event notifications from Mono."
)
async def mono_webhook(
    payload: MonoWebhookPayload,
    mono_webhook_secret: str = Header(None, alias="mono-webhook-secret")
):
    if not settings.MONO_WEBHOOK_SECRET or not mono_webhook_secret or not hmac.compare_digest(settings.MONO_WEBHOOK_SECRET, mono_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook credentials.")
    logger.info(f"Received Mono webhook event: {payload.event}")
    return {"received": True, "event": payload.event}
