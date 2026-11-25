from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, StrictInt, model_validator

Subject = Literal["tenant", "guarantor"]
Purpose = Literal[
    "identity",
    "liveness",
    "employment",
    "address",
    "references",
    "guarantor",
    "summary_sharing",
]


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SubjectBody(Body):
    subject_type: Subject = "tenant"


class CaseCreate(Body):
    tenant_first_name: str = Field(min_length=1, max_length=60, pattern=r"^[^\d\s]+$")
    landlord_id: UUID | None = None
    property_id: UUID | None = None
    monthly_rent_kobo: StrictInt = Field(gt=0, le=10**14)

    @model_validator(mode="after")
    def property_pair(self):
        if (self.landlord_id is None) != (self.property_id is None):
            raise ValueError("Provide both property and landlord, or neither.")
        return self


class Consent(SubjectBody):
    granted: Literal[True]
    purposes: list[Purpose] = Field(min_length=1, max_length=7)
    policy_version: str = Field(min_length=1, max_length=40)


class IdentitySubmit(SubjectBody):
    bvn: SecretStr = Field(min_length=11, max_length=11)
    nin: SecretStr = Field(min_length=11, max_length=11)
    date_of_birth: date | None = None


class OtpMethod(SubjectBody):
    method: Literal["phone", "phone_1", "email", "alternate_phone"]
    phone_number: SecretStr | None = Field(default=None, min_length=10, max_length=20)

    @model_validator(mode="after")
    def alternate(self):
        if self.method == "alternate_phone" and self.phone_number is None:
            raise ValueError("Alternate phone verification requires a phone number.")
        return self


class Otp(SubjectBody):
    otp: SecretStr = Field(min_length=4, max_length=10)


class EvidenceFile(Body):
    content_base64: SecretStr = Field(min_length=4, max_length=7_000_000)
    content_type: Literal["image/jpeg", "image/png", "application/pdf"]


class LivenessUpload(SubjectBody):
    selfie: EvidenceFile


class Employment(SubjectBody):
    employer_name: str = Field(min_length=2, max_length=200)
    job_title: str = Field(min_length=2, max_length=200)
    employment_type: Literal["employed", "self_employed"]
    monthly_income_kobo: StrictInt = Field(gt=0, le=10**14)
    document: EvidenceFile
    cac_number: str | None = Field(default=None, max_length=40)


class Address(Body):
    address_text: str = Field(min_length=8, max_length=500)
    proof_type: Literal["utility_bill", "tenancy_agreement", "other"]
    proof: EvidenceFile


class ReferenceContact(Body):
    type: Literal["previous_landlord", "personal", "professional"]
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=10, max_length=20, pattern=r"^\+?[0-9 ()-]+$")
    email: str | None = Field(
        default=None, max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )


class Guarantor(Body):
    full_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=10, max_length=20)
    email: str = Field(max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    relationship: str = Field(min_length=2, max_length=80)


class AcceptGuarantor(Body):
    invitation: SecretStr = Field(min_length=32, max_length=200)


class Dispute(Body):
    reason: str = Field(min_length=10, max_length=2000)


class ReviewReason(Body):
    reason: str = Field(min_length=10, max_length=1000)


class LivenessDecision(ReviewReason):
    status: Literal["passed", "failed", "manual_review"]
    match_score: float | None = Field(default=None, ge=0, le=1)


class EmploymentDecision(ReviewReason):
    subject_type: Subject = "tenant"
    subject_id: UUID | None = None
    verification_status: Literal["verified", "failed", "unverified"]
    verification_method: Literal["hr_call", "hr_email", "document", "other"]


class AddressDecision(ReviewReason):
    status: Literal["verified", "failed"]


class ReferenceDecision(ReviewReason):
    status: Literal["contacted", "responded", "failed"]
    paid_on_time: bool | None = None
    property_condition: Literal["good", "fair", "poor"] | None = None
    would_rent_again: bool | None = None


class CaseDecision(ReviewReason):
    result: Literal["pass", "review", "fail"]


class CheckSummary(Body):
    name: str
    status: str


class LandlordSummary(Body):
    caseId: UUID
    tenantFirstName: str
    overallResult: Literal["pass", "review", "fail", "pending"]
    checks: list[CheckSummary]
    reasons: list[str]
    verifiedAt: str | None


class MonoWebhook(Body):
    model_config = ConfigDict(extra="ignore")
    event_id: str = Field(min_length=1, max_length=200)
    event: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    data: dict = Field(default_factory=dict)
    timestamp: str | None = None
