from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class MonoCreditHistoryRequest(BaseModel):
    bvn: str = Field(..., min_length=11, max_length=11, description="11-digit Bank Verification Number")
    provider: Optional[str] = Field("all", description="Credit bureau provider: 'crc', 'xds', or 'all'")
    reason: Optional[str] = Field("Tenant Credit Assessment", description="Reason for the credit check (required for regulatory consent)")


class MonoCreditHistoryResponse(BaseModel):
    status: str
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class MonoAuthCodeRequest(BaseModel):
    code: str = Field(..., description="Short-lived auth code returned by Mono Connect widget's onSuccess callback")


class MonoAuthCodeResponse(BaseModel):
    id: Optional[str] = None
    account: Optional[Dict[str, Any]] = None


class MonoWebhookPayload(BaseModel):
    event: str = Field(..., description="Event type emitted by Mono")
    data: Dict[str, Any] = Field(default_factory=dict, description="Event payload")
