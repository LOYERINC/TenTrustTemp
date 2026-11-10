"""Prembly identity lookups. Keys and provider payloads stay on the server.
Official references: docs.prembly.com/api-reference/identity-verification/verify_bvn_basic
and docs.prembly.com/api-reference/identity-verification/verify_nin_basic.
"""
import logging
import re
from datetime import datetime
import httpx
from fastapi import HTTPException
from config import settings

logger = logging.getLogger(__name__)


def normalized_name(value):
    return sorted(re.findall(r"[^\W\d_]+", value.casefold())) if isinstance(value, str) else []


def normalized_dob(value):
    if not isinstance(value, str): return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y"):
        try: return datetime.strptime(value, fmt).date().isoformat()
        except ValueError: pass
    return None


class PremblyService:
    def _get_headers(self):
        headers = {"x-api-key": settings.PREMBLY_SECRET_KEY, "Content-Type": "application/json", "Accept": "application/json"}
        if settings.PREMBLY_APP_ID: headers["app-id"] = settings.PREMBLY_APP_ID
        return headers

    async def _verify(self, channel, number):
        if not settings.PREMBLY_CHECKS_ENABLED or not settings.PREMBLY_SECRET_KEY:
            raise HTTPException(503, "Identity checks are not enabled.")
        if not re.fullmatch(r"[0-9]{11}", number): raise HTTPException(422, "Enter an 11-digit ID number.")
        paths = {"bvn": "/api/v1/verification/api/bvn_basic/", "nin": "/api/v1/verification/api/nin_basic/"}
        # No automatic retries: each lookup can be billed by the provider.
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(settings.PREMBLY_BASE_URL.rstrip("/")+paths[channel], headers=self._get_headers(), json={"number": number})
        except httpx.RequestError:
            raise HTTPException(503, "The identity check could not finish. Staff will review your submission.") from None
        logger.info("prembly.lookup channel=%s http_status=%s", channel, response.status_code)
        if response.status_code >= 400:
            raise HTTPException(503 if response.status_code not in (400,404,422) else 422, "The identity check could not confirm these details.")
        try:
            result=response.json()
            if not isinstance(result, dict): raise ValueError()
        except ValueError: raise HTTPException(502, "The identity service returned an invalid response.") from None
        return result

    async def verify_bvn(self, bvn, first_name=None, last_name=None, dob=None):
        return await self._verify("bvn", bvn)

    async def verify_nin(self, nin, first_name=None, last_name=None):
        return await self._verify("nin", nin)

    def summary(self, result, full_name, dob):
        data=result.get("data")
        if result.get("status") is not True or result.get("response_code") not in (None,"00") or not isinstance(data,dict):
            return {"status":"needs_review", "record_found":False}
        def field(*names):
            return next((data[n] for n in names if isinstance(data.get(n),str) and data[n].strip()), "")
        name=field("full_name","fullName","name") or " ".join(filter(None,[field("firstName","first_name","firstname"),field("middleName","middle_name","middlename"),field("lastName","last_name","lastname","surname")]))
        date=normalized_dob(field("dateOfBirth","date_of_birth","dob","birthdate"))
        name_match=bool(normalized_name(name)) and normalized_name(name)==normalized_name(full_name)
        dob_match=bool(date) and date==dob
        return {"status":"matched" if name_match and dob_match else "needs_review", "record_found":bool(name), "name_match":name_match, "dob_match":dob_match}

    async def check_intake(self, details):
        output={"provider":"prembly"}
        for channel in ("bvn","nin"):
            try:
                result=await self._verify(channel, details[channel])
                output[channel]=self.summary(result,details["full_name"],details["date_of_birth"])
            except HTTPException:
                output[channel]={"status":"needs_review", "reason":"lookup_unavailable"}
        return output


prembly_service=PremblyService()
