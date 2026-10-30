from fastapi import APIRouter
from config import settings
from services.manual_identity import encryption_ready

router = APIRouter(tags=["Health"])


@router.get("/health")
@router.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "TenTrust Verification API",
        "environment": settings.ENVIRONMENT,
        "demo": settings.ENVIRONMENT == "demo",
        "payment_mode": "test" if settings.PAYSTACK_SECRET_KEY.startswith("sk_test_") else "live" if settings.PAYSTACK_SECRET_KEY.startswith("sk_live_") else "unconfigured",
        "mono_mode": "live" if settings.MONO_SECRET_KEY.startswith("live_sk_") else "test" if settings.MONO_SECRET_KEY.startswith("test_sk_") else "unknown",
        "screening_v2_enabled": settings.SCREENING_V2_ENABLED,
        "identity_mode": settings.SCREENING_IDENTITY_MODE,
        "manual_review_storage_ready": encryption_ready() if settings.SCREENING_IDENTITY_MODE == "manual" else None,
        "integrations": {
            "mono": "configured" if settings.MONO_SECRET_KEY else "unconfigured",
            "prembly": "configured" if settings.PREMBLY_SECRET_KEY else "unconfigured"
        }
    }
