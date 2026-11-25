"""Versioned authenticated encryption; ciphertext is bound to its case, subject and field."""

import base64
import hashlib
import hmac
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

from config import settings


class Vault:
    def __init__(self):
        try:
            self.key = base64.b64decode(settings.ENCRYPTION_KEY, validate=True)
            if len(self.key) != 32 or len(settings.HASH_PEPPER.encode()) < 32:
                raise ValueError("invalid secret length")
        except (ValueError, TypeError):
            raise HTTPException(
                503, "Verification encryption is not configured."
            ) from None

    def encrypt(self, value, context: str) -> str:
        nonce = os.urandom(12)
        data = json.dumps(value, separators=(",", ":")).encode()
        encrypted = AESGCM(self.key).encrypt(nonce, data, context.encode())
        return "v1." + base64.urlsafe_b64encode(nonce + encrypted).decode()

    def decrypt(self, value: str, context: str):
        try:
            if not value.startswith("v1."):
                raise ValueError("unsupported encryption version")
            data = base64.urlsafe_b64decode(value[3:])
            return json.loads(
                AESGCM(self.key).decrypt(data[:12], data[12:], context.encode())
            )
        except Exception:
            raise HTTPException(
                503, "Encrypted verification evidence could not be read."
            ) from None

    def digest(self, value: str, purpose: str) -> str:
        return hmac.new(
            settings.HASH_PEPPER.encode(),
            (purpose + ":" + value).encode(),
            hashlib.sha256,
        ).hexdigest()


def mask_identifier(value: str) -> str:
    return "*" * max(0, len(value) - 4) + value[-4:]
