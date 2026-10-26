from fastapi import APIRouter
from config import settings

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
        "integrations": {
            "mono": "configured" if settings.MONO_SECRET_KEY else "unconfigured",
            "prembly": "configured" if settings.PREMBLY_SECRET_KEY else "unconfigured"
        }
    }
