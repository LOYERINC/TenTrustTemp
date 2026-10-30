"""Private, authenticated encryption for tenant information awaiting staff review."""
import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from config import settings


def encryption_key():
    try:
        key = base64.b64decode(settings.ENCRYPTION_KEY, validate=True)
        if len(key) != 32:
            raise ValueError()
        return key
    except (ValueError, TypeError):
        raise HTTPException(503, "Private manual review storage is not configured.") from None


def encryption_ready():
    try:
        encryption_key()
        return True
    except HTTPException:
        return False


def manual_case(row):
    return (row.get("check_status") or {}).get("identity_method") == "manual_review"


def consent_version(row):
    return settings.SCREENING_V2_CONSENT_VERSION + ("-manual-v1" if manual_case(row) else "")


def encrypt(value, screening_id):
    nonce = os.urandom(12)
    payload = json.dumps(value, separators=(",", ":")).encode()
    encrypted = AESGCM(encryption_key()).encrypt(nonce, payload, str(screening_id).encode())
    return "v1." + base64.urlsafe_b64encode(nonce + encrypted).decode()


def decrypt(value, screening_id):
    try:
        if not value.startswith("v1."):
            raise ValueError()
        payload = base64.urlsafe_b64decode(value[3:])
        return json.loads(AESGCM(encryption_key()).decrypt(payload[:12], payload[12:], str(screening_id).encode()))
    except Exception:
        raise HTTPException(503, "Private review details could not be opened.") from None
