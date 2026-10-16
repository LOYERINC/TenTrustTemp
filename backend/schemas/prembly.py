from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class PremblyBVNVerificationRequest(BaseModel):
    bvn: str = Field(..., min_length=11, max_length=11, description="11-digit Bank Verification Number", example="12345678901")
    first_name: Optional[str] = Field(None, description="Optional first name for identity matching comparison")
    last_name: Optional[str] = Field(None, description="Optional last name for identity matching comparison")
    dob: Optional[str] = Field(None, description="Date of birth in DD-MM-YYYY or YYYY-MM-DD format")


class PremblyNINVerificationRequest(BaseModel):
    nin: str = Field(..., min_length=11, max_length=11, description="11-digit National Identification Number", example="12345678901")
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class PremblyVerificationResponse(BaseModel):
    status: bool
    detail: Optional[str] = None
    response_code: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class PremblyWebhookPayload(BaseModel):
    event: Optional[str] = None
    verification_type: Optional[str] = None
    status: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)
