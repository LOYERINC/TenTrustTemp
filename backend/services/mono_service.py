import logging
from typing import Dict, Any, Optional
import httpx
from fastapi import HTTPException
from config import settings

logger = logging.getLogger(__name__)


class MonoService:
    def __init__(self):
        self.base_url = settings.MONO_BASE_URL.rstrip("/")
        self.secret_key = settings.MONO_SECRET_KEY

    def _get_headers(self) -> Dict[str, str]:
        return {
            "mono-sec-key": self.secret_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def verify_identity(self, *, bvn: str, nin: str, date_of_birth: str) -> Dict[str, Any]:
        """Verify identity with Mono Mashup. The caller must collect consent first."""
        if not self.secret_key:
            raise HTTPException(status_code=503, detail="Identity verification is not available right now.")
        if any(len(value) != 11 or not value.isascii() or not value.isdigit() for value in (bvn, nin)):
            raise HTTPException(status_code=422, detail="Enter both your 11-digit BVN and 11-digit NIN.")
        if settings.ENVIRONMENT == "demo":
            if not self.secret_key.startswith("test_sk_"):
                raise HTTPException(status_code=503, detail="The Sandbox requires a Mono test key.")
            if (bvn, nin, date_of_birth) != ("22227777222", "12345678901", "1991-09-01"):
                raise HTTPException(status_code=422, detail="Use the published Mono Sandbox details shown on this page. Real identity details are not accepted in this demo.")
        payload = {"bvn": bvn, "nin": nin, "date_of_birth": date_of_birth}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(f"{self.base_url}/v3/lookup/mashup", json=payload, headers=self._get_headers())
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail="We could not reach the identity service. Please try again.") from exc
        finally:
            payload["bvn"] = ""
            payload["nin"] = ""
            payload["date_of_birth"] = ""
            bvn = ""
            nin = ""
            date_of_birth = ""
        if response.status_code >= 400:
            # Never pass through provider details: some errors echo request data.
            logger.warning("Mono identity lookup returned HTTP %s", response.status_code)
            if response.status_code in (401, 403):
                raise HTTPException(status_code=503, detail="Identity verification needs account setup. Please contact TenTrust support; your link remains available.")
            if response.status_code == 429 or response.status_code >= 500:
                raise HTTPException(status_code=503, detail="The identity service is busy or unavailable. Please try again later.")
            if response.status_code in (400, 422):
                raise HTTPException(status_code=422, detail="Mono could not verify these details. Check that your BVN, NIN and date of birth belong to the same person and match your records.")
            raise HTTPException(status_code=502, detail="The identity service could not process the check. Please contact TenTrust support.")
        try:
            result = response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="We could not read the verification result. Please try again.") from exc
        if not isinstance(result, dict) or not isinstance(result.get("data"), dict):
            raise HTTPException(status_code=502, detail="We could not read the verification result. Please try again.")
        if result.get("status") not in ("successful", "success", True):
            raise HTTPException(status_code=422, detail="Mono could not verify these details. Check your BVN, NIN and date of birth and try again.")
        return result["data"]

    async def lookup_credit_history(
        self,
        bvn: str,
        provider: str = "all",
        reason: Optional[str] = "Credit Assessment"
    ) -> Dict[str, Any]:
        """Disabled until a separately reviewed credit adapter is available."""
        raise HTTPException(status_code=503, detail="Credit checks are not available in this release.")

    async def exchange_auth_code(self, code: str) -> Dict[str, Any]:
        """
        Exchange a short-lived Mono Connect auth code (from widget) for account ID and initial details.
        Endpoint: POST /v2/accounts/auth
        """
        if not self.secret_key:
            raise HTTPException(status_code=500, detail="MONO_SECRET_KEY is not configured.")

        url = f"{self.base_url}/v2/accounts/auth"
        payload = {"code": code}

        logger.info("Exchanging Mono Connect auth code for account ID...")

        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._get_headers()
                )

                if response.status_code >= 400:
                    logger.error(f"Mono auth exchange returned status {response.status_code}.")
                    error_data = {}
                    try:
                        error_data = response.json()
                    except Exception:
                        error_data = {"message": "Mono returned a non-JSON error response."}
                    raise HTTPException(
                        status_code=response.status_code,
                        detail={
                            "provider": "mono",
                            "message": error_data.get("message", "Auth code exchange failed"),
                            "error": error_data
                        }
                    )

                return response.json()

            except httpx.RequestError as exc:
                logger.error(f"Network error exchanging Mono auth code: {str(exc)}")
                raise HTTPException(
                    status_code=503,
                    detail=f"Unable to reach Mono service: {str(exc)}"
                )

    async def get_account_identity(self, account_id: str) -> Dict[str, Any]:
        """
        Fetch full identity and banking profile for a linked Mono account.
        Endpoint: GET /v2/accounts/{id}/identity
        """
        if not self.secret_key:
            raise HTTPException(status_code=500, detail="MONO_SECRET_KEY is not configured.")

        url = f"{self.base_url}/v2/accounts/{account_id}/identity"
        logger.info(f"Fetching Mono account identity for account: {account_id}")

        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                response = await client.get(url, headers=self._get_headers())
                if response.status_code >= 400:
                    error_data = {}
                    try:
                        error_data = response.json()
                    except Exception:
                        error_data = {"raw": response.text}
                    raise HTTPException(
                        status_code=response.status_code,
                        detail={"provider": "mono", "message": error_data.get("message", "Error"), "error": error_data}
                    )
                return response.json()
            except httpx.RequestError as exc:
                raise HTTPException(status_code=503, detail=f"Unable to reach Mono service: {str(exc)}")

    async def identity_from_connect_code(self, code: str) -> Dict[str, Optional[str]]:
        """Exchange a one-time Connect code and return only identity fields needed by screening."""
        auth_result = await self.exchange_auth_code(code)
        account_id = auth_result.get("id") or (auth_result.get("account") or {}).get("_id")
        if not account_id:
            raise HTTPException(status_code=502, detail="Mono did not return a linked account ID.")

        response = await self.get_account_identity(str(account_id))
        if response.get("status") not in (True, "success", "successful"):
            raise HTTPException(status_code=424, detail="Mono did not complete the linked-account identity lookup.")
        data = response.get("data") if isinstance(response.get("data"), dict) else response
        full_name = data.get("full_name") or data.get("fullName")
        bvn = data.get("bvn")
        return {
            "full_name": str(full_name).strip() if full_name else None,
            "bvn": str(bvn).strip() if bvn else None,
        }


mono_service = MonoService()
