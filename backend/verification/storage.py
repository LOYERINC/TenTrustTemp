import base64
from uuid import uuid4
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from config import settings
from verification.schemas import EvidenceFile


class EvidenceStorage:
    def __init__(self, bucket: str | None = None):
        self.bucket = bucket or settings.VERIFICATION_STORAGE_BUCKET

    def _headers(self):
        return {
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": "Bearer " + settings.SUPABASE_SERVICE_ROLE_KEY,
        }

    def _base(self):
        return settings.SUPABASE_URL.rstrip("/") + "/storage/v1"

    async def upload(self, case: str, file: EvidenceFile, selfie=False) -> str:
        try:
            data = base64.b64decode(
                file.content_base64.get_secret_value(), validate=True
            )
        except ValueError:
            raise HTTPException(422, "Upload a valid base64 file.") from None
        if not 0 < len(data) <= 5 * 1024 * 1024:
            raise HTTPException(422, "Files must be between 1 byte and 5 MB.")
        signatures = {
            "image/jpeg": b"\xff\xd8\xff",
            "image/png": b"\x89PNG\r\n\x1a\n",
            "application/pdf": b"%PDF-",
        }
        if not data.startswith(signatures[file.content_type]) or (
            selfie and file.content_type == "application/pdf"
        ):
            raise HTTPException(
                422, "The file does not match the selected image or document type."
            )
        return await self._upload(case, data, file.content_type)

    async def upload_video(self, case: str, data: bytes) -> str:
        if len(data) < 12 or data[4:8] != b"ftyp":
            raise HTTPException(422, "Choose a valid MP4 video.")
        return await self._upload(case, data, "video/mp4")

    async def _upload(self, case: str, data: bytes, content_type: str) -> str:
        key = case + "/" + str(uuid4())
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    self._base()
                    + "/object/"
                    + self.bucket
                    + "/"
                    + key,
                    headers={
                        **self._headers(),
                        "Content-Type": content_type,
                        "cache-control": "max-age=0",
                    },
                    content=data,
                )
        except httpx.RequestError:
            raise HTTPException(
                503, "Evidence storage is temporarily unavailable."
            ) from None
        if response.status_code >= 400:
            raise HTTPException(503, "Evidence could not be uploaded.")
        return key

    async def signed_url(self, key: str) -> str:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                self._base()
                + "/object/sign/"
                + self.bucket
                + "/"
                + quote(key, safe="/"),
                headers=self._headers(),
                json={"expiresIn": 60},
            )
        if response.status_code >= 400:
            raise HTTPException(503, "Evidence is not available.")
        path = response.json().get("signedURL")
        if not isinstance(path, str) or not path.startswith("/object/sign/"):
            raise HTTPException(502, "Storage returned an invalid evidence URL.")
        return self._base() + path

    async def delete(self, key: str):
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(
                "DELETE",
                self._base() + "/object/" + self.bucket,
                headers=self._headers(),
                json={"prefixes": [key]},
            )
        if response.status_code >= 400:
            raise HTTPException(503, "Evidence deletion will be retried.")
