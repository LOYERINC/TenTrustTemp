import logging
from typing import Dict, Any, Optional
import httpx
from fastapi import HTTPException
from config import settings

logger = logging.getLogger(__name__)


class PremblyService:
    def __init__(self):
        self.base_url = settings.PREMBLY_BASE_URL.rstrip("/")
        self.secret_key = settings.PREMBLY_SECRET_KEY
        self.app_id = settings.PREMBLY_APP_ID

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "x-api-key": self.secret_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.app_id:
            headers["app-id"] = self.app_id
        return headers

    async def verify_bvn(
        self,
        bvn: str,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        dob: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Performs comprehensive BVN identity and KYC verification through Prembly (Identitypass).
        Returns exhaustive details including demographics, enrollment bank, contact info, and AML watchlist flags.
        """
        url = f"{self.base_url}/identitypass/verification/bvn"
        payload = {"number": bvn}
        if first_name:
            payload["first_name"] = first_name
        if last_name:
            payload["last_name"] = last_name
        if dob:
            payload["dob"] = dob

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._get_headers()
                )

                if response.status_code >= 400:
                    logger.error(f"Prembly API returned status {response.status_code} for BVN verification.")
                    error_detail = {"message": "Prembly verification failed."}
                    raise HTTPException(
                        status_code=response.status_code,
                        detail={"provider": "prembly", "error": error_detail}
                    )

                return response.json()

            except httpx.RequestError as exc:
                logger.error(f"Network error calling Prembly API: {str(exc)}")
                raise HTTPException(
                    status_code=503,
                    detail=f"Unable to reach Prembly service: {str(exc)}"
                )

    async def verify_nin(
        self,
        nin: str,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Performs National Identification Number (NIN) KYC verification through Prembly.
        """
        url = f"{self.base_url}/identitypass/verification/nin"
        payload = {"number": nin}

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._get_headers()
                )

                if response.status_code >= 400:
                    logger.error(f"Prembly API returned status {response.status_code} for NIN verification.")
                    error_detail = {"message": "Prembly verification failed."}
                    raise HTTPException(
                        status_code=response.status_code,
                        detail={"provider": "prembly", "error": error_detail}
                    )

                return response.json()

            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=503,
                    detail=f"Unable to reach Prembly service: {str(exc)}"
                )


prembly_service = PremblyService()
