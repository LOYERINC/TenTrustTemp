import asyncio
import re
import time
import unicodedata
from dataclasses import dataclass, field
from typing import Literal

import httpx
from services.loan_evidence import LoanRecord, normalize_loan


SANDBOX_URL = "https://sandbox.interswitchng.com/marketplace-routing/api"


class InterswitchUnavailable(Exception):
    """Authentication failed before a lookup was sent."""


class InterswitchLookupUnknown(Exception):
    """Reconcile the lookup with Interswitch before attempting it again."""


@dataclass(frozen=True)
class LoanHistory:
    status: Literal["found", "no_history"]
    providers: tuple[str, ...]
    facility_count: int
    tracking_id: str | None
    loans: tuple[LoanRecord, ...] = field(default=(), repr=False)


@dataclass(frozen=True)
class BvnSession:
    session_id: str = field(repr=False)
    methods: tuple[str, ...]


def _name_key(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


class InterswitchSandbox:
    def __init__(self, client: httpx.AsyncClient, client_id: str, client_secret: str):
        self._client = client
        self._client_id = client_id
        self._client_secret = client_secret
        self._token = ""
        self._expires_at = 0.0
        self._token_lock = asyncio.Lock()

    async def _access_token(self) -> str:
        async with self._token_lock:
            if self._token and time.monotonic() < self._expires_at:
                return self._token
            if not self._client_id or not self._client_secret:
                raise InterswitchUnavailable("Sandbox project credentials are required.")
            try:
                response = await self._client.post(
                    f"{SANDBOX_URL}/v1/authentication/client",
                    json={"clientId": self._client_id, "clientSecret": self._client_secret},
                    timeout=10,
                    follow_redirects=False,
                )
                response.raise_for_status()
                body = response.json()
                data = body["data"]
                token = data["access_token"]
                expires_in = data["expires_in"]
                if (
                    body.get("success") is not True
                    or not isinstance(token, str)
                    or not re.fullmatch(r"[A-Za-z0-9._~+/=-]+", token)
                    or type(expires_in) is not int
                    or expires_in <= 0
                ):
                    raise ValueError
            except (httpx.HTTPError, KeyError, TypeError, ValueError):
                raise InterswitchUnavailable("Interswitch sandbox authentication failed.") from None
            self._token = token
            self._expires_at = time.monotonic() + max(0, expires_in - 30)
            return token

    async def _lookup(self, endpoint: str, payload: dict[str, str]) -> dict:
        token = await self._access_token()
        try:
            response = await self._client.post(
                f"{SANDBOX_URL}/v1/verify/identity/{endpoint}",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
                timeout=20,
                follow_redirects=False,
            )
            response.raise_for_status()
            body = response.json()
            if not isinstance(body, dict) or body.get("success") is not True:
                raise ValueError
            return body
        except (httpx.HTTPError, ValueError):
            raise InterswitchLookupUnknown("Interswitch did not return a confirmed lookup result.") from None

    async def verify_nin(self, nin: str, first_name: str, last_name: str) -> bool:
        if not re.fullmatch(r"[0-9]{11}", nin) or not first_name.strip() or not last_name.strip():
            raise ValueError("An 11-digit NIN and both names are required.")
        body = await self._lookup("nin", {"nin": nin, "firstName": first_name.strip(), "lastName": last_name.strip()})
        try:
            data = body["data"]
            returned_nin = data["nin"]["nin"]
            fields = data["summary"]["nin_check"]["fieldMatches"]
            if not isinstance(returned_nin, str) or type(fields["firstname"]) is not bool or type(fields["lastname"]) is not bool:
                raise ValueError
            return returned_nin == nin and fields["firstname"] and fields["lastname"]
        except (KeyError, TypeError, ValueError):
            raise InterswitchLookupUnknown("Interswitch did not return a confirmed NIN match result.") from None

    async def start_bvn_consent(self, bvn: str) -> BvnSession:
        if not re.fullmatch(r"[0-9]{11}", bvn):
            raise ValueError("An 11-digit BVN is required.")
        body = await self._lookup("initiate-bvn-igree", {"bvn": bvn})
        try:
            data = body["data"]
            session_id = data["session_id"]
            if data["bvn"] != bvn or not isinstance(session_id, str) or not session_id:
                raise ValueError
            methods = tuple(item["method"] for item in data["methods"])
            if not methods or any(not isinstance(method, str) or not method for method in methods):
                raise ValueError
            return BvnSession(session_id, methods)
        except (KeyError, TypeError, ValueError):
            raise InterswitchLookupUnknown("Interswitch did not return a confirmed BVN session.") from None

    async def request_bvn_otp(self, session: BvnSession, method: str, phone_number: str | None = None) -> None:
        if method not in session.methods:
            raise ValueError("Choose an OTP method offered for this BVN session.")
        payload = {"session_id": session.session_id, "method": method}
        if phone_number:
            payload["phone_number"] = phone_number
        await self._lookup("bvn-igree-request-otp", payload)

    async def verify_bvn(
        self, session: BvnSession, otp: str, bvn: str, first_name: str, last_name: str, date_of_birth: str
    ) -> bool:
        if not re.fullmatch(r"[0-9]+", otp):
            raise ValueError("An OTP is required.")
        body = await self._lookup("fetch-bvn-igree-details", {"session_id": session.session_id, "otp": otp})
        try:
            data = body["data"]
            values = (data["bvn"], data["first_name"], data["last_name"], data["dob"])
            if any(not isinstance(value, str) or not value.strip() for value in values):
                raise ValueError
            return (
                data["bvn"] == bvn
                and _name_key(data["first_name"]) == _name_key(first_name)
                and _name_key(data["last_name"]) == _name_key(last_name)
                and data["dob"] == date_of_birth
            )
        except (KeyError, TypeError, ValueError):
            raise InterswitchLookupUnknown("Interswitch did not return a confirmed BVN match result.") from None

    async def loan_history(self, bvn: str) -> LoanHistory:
        if not re.fullmatch(r"[0-9]{11}", bvn):
            raise ValueError("An 11-digit BVN is required.")
        body = await self._lookup("credit-history-lookup", {"bvn": bvn})
        try:
            data = body["data"]
            groups = data["credit_history"]
            providers = data["providers"]
            if not isinstance(groups, list) or not isinstance(providers, list) or not providers:
                raise ValueError
            if any(not isinstance(provider, str) or not provider.strip() for provider in providers):
                raise ValueError
            facility_count = 0
            loans = []
            for group_index, group in enumerate(groups, 1):
                history = group["history"]
                if not isinstance(history, list) or any(not isinstance(loan, dict) or not loan for loan in history):
                    raise ValueError
                facility_count += len(history)
                for loan in history:
                    if len(loans) < 50:
                        loans.append(normalize_loan(loan, len(loans) + 1, group, group_index))
            tracking_id = body.get("trackingId")
            return LoanHistory(
                status="found" if facility_count else "no_history",
                providers=tuple(dict.fromkeys(providers)),
                facility_count=facility_count,
                tracking_id=tracking_id if isinstance(tracking_id, str) else None,
                loans=tuple(loans),
            )
        except (KeyError, TypeError, ValueError):
            raise InterswitchLookupUnknown("Interswitch did not return a confirmed lookup result.") from None
