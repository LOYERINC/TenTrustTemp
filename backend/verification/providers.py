"""Provider contracts based on Mono's current official BVN iGree and NIN docs.

https://docs.mono.co/docs/lookup/bvn-igree
https://docs.mono.co/docs/lookup/nin-lookup
Only normalized fields and encrypted audit envelopes leave an adapter.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

import httpx
from fastapi import HTTPException

from config import settings
from verification.crypto import Vault


@dataclass
class IdentityResult:
    verified: bool
    name: str
    dob: str | None
    phone: str | None
    photo: str | None
    audit_encrypted: str

    def comparison(self):
        return {
            "verified": self.verified,
            "name": self.name,
            "dob": self.dob,
            "phone": self.phone,
        }


@dataclass
class IdentitySession:
    encrypted_session: str
    methods: list[str]


class IdentityProvider(Protocol):
    async def begin_bvn(self, bvn: str, context: str) -> IdentitySession: ...
    async def send_otp(
        self, session: str, method: str, phone: str | None = None
    ) -> None: ...
    async def complete_bvn(
        self, session: str, otp: str, context: str
    ) -> IdentityResult: ...
    async def lookup_nin(
        self, nin: str, dob: str | None, context: str
    ) -> IdentityResult: ...


class LivenessProvider(Protocol):
    async def start(self, check_id: str) -> dict: ...
    async def get_result(self, check_id: str) -> dict: ...


class CreditProvider(Protocol):
    async def check(self) -> dict: ...


def normalized_date(value) -> str | None:
    if not isinstance(value, str):
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return None


class MonoIdentityProvider:
    def __init__(self, vault: Vault):
        self.vault = vault

    async def _post(self, path: str, payload: dict, session: str | None = None) -> dict:
        if not settings.MONO_SECRET_KEY or not settings.MONO_IDENTITY_CHECKS_ENABLED:
            raise HTTPException(503, "Mono identity lookup is not enabled.")
        headers = {
            "mono-sec-key": settings.MONO_SECRET_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if session:
            headers["x-session-id"] = session
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    settings.MONO_BASE_URL.rstrip("/") + path,
                    json=payload,
                    headers=headers,
                )
        except httpx.RequestError:
            raise HTTPException(
                503, "Identity provider is temporarily unavailable."
            ) from None
        finally:
            payload.clear()
        # No response bodies, request data, or names are logged or reflected in errors.
        if response.status_code in (400, 404, 422):
            raise HTTPException(
                422,
                "The identity record or OTP could not be verified. Check your details.",
            )
        if response.status_code >= 400:
            raise HTTPException(
                503,
                "Identity lookup is unavailable. Contact support if this continues.",
            )
        try:
            body = response.json()
            if not isinstance(body, dict) or body.get("status") != "successful":
                raise ValueError("provider status")
            return body
        except ValueError:
            raise HTTPException(502, "Invalid identity provider response.") from None

    async def begin_bvn(self, bvn: str, context: str) -> IdentitySession:
        body = await self._post(
            "/v2/lookup/bvn/initiate", {"bvn": bvn, "scope": "identity"}
        )
        data = body.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("session_id"), str):
            raise HTTPException(502, "Identity session could not be started.")
        available = data.get("methods")
        if not isinstance(available, list):
            raise HTTPException(502, "BVN verification methods were not returned.")
        methods = [
            item["method"]
            for item in available
            if isinstance(item, dict)
            and item.get("method") in ("phone", "phone_1", "email", "alternate_phone")
        ]
        if not methods:
            raise HTTPException(502, "No BVN verification methods are available.")
        return IdentitySession(
            self.vault.encrypt(data["session_id"], context + ":session"), methods
        )

    async def send_otp(
        self, session: str, method: str, phone: str | None = None
    ) -> None:
        payload = {"method": method}
        if method == "alternate_phone":
            payload["phone_number"] = phone
        await self._post("/v2/lookup/bvn/verify", payload, session)

    async def complete_bvn(
        self, session: str, otp: str, context: str
    ) -> IdentityResult:
        body = await self._post("/v2/lookup/bvn/details", {"otp": otp}, session)
        data = body.get("data")
        if not isinstance(data, dict):
            raise HTTPException(502, "BVN identity details were not returned.")
        name = " ".join(
            data[key].strip()
            for key in ("first_name", "middle_name", "last_name")
            if isinstance(data.get(key), str) and data[key].strip()
        )
        dob = normalized_date(data.get("dob"))
        phone = (
            data.get("phone_number")
            if isinstance(data.get("phone_number"), str)
            else None
        )
        return IdentityResult(
            bool(name and dob),
            name,
            dob,
            phone,
            None,
            self.vault.encrypt(body, context + ":bvn_raw"),
        )

    async def lookup_nin(
        self, nin: str, dob: str | None, context: str
    ) -> IdentityResult:
        payload = {"nin": nin}
        if dob:
            payload["date_of_birth"] = dob
        body = await self._post("/v3/lookup/nin", payload)
        data = body.get("data")
        if not isinstance(data, dict):
            raise HTTPException(502, "NIN identity details were not returned.")
        name = " ".join(
            data[key].strip()
            for key in ("firstname", "middlename", "surname")
            if isinstance(data.get(key), str) and data[key].strip()
        )
        photo = data.get("photo") if isinstance(data.get("photo"), str) else None
        dob = normalized_date(data.get("birthdate"))
        phone = (
            data.get("telephoneno")
            if isinstance(data.get("telephoneno"), str)
            else None
        )
        # Mono documents some NIN responses as name/DOB validation only, with a null photo.
        return IdentityResult(
            bool(name and dob),
            name,
            dob,
            phone,
            photo,
            self.vault.encrypt(body, context + ":nin_raw"),
        )


class ManualReviewLivenessProvider:
    async def start(self, check_id: str) -> dict:
        return {
            "check_id": check_id,
            "provider": "manual_review",
            "status": "manual_review",
            "match_score": None,
        }

    async def get_result(self, check_id: str) -> dict:
        return await self.start(check_id)


class DisabledCreditProvider:
    async def check(self) -> dict:
        return {"status": "not_available", "provider": None, "result": None}


def liveness_provider() -> LivenessProvider:
    if settings.LIVENESS_PROVIDER != "manual_review":
        raise HTTPException(503, "The selected liveness provider is not installed.")
    return ManualReviewLivenessProvider()
