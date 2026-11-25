"""Versioned factual report contract; contains no raw identity or video data."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from services.loan_evidence import LoanRecord


class ReportFacts(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    nin_match: Literal["matched", "not_matched", "unknown"]
    bvn_match: Literal["matched", "not_matched", "unknown"]
    loan_history: Literal["found", "no_history", "unknown", "unavailable"]
    facility_count: int | None = Field(default=None, ge=0)
    video_review: Literal["pending", "reviewed", "needs_review"] = "pending"
    loans: list[LoanRecord] = Field(default_factory=list, max_length=50)
    providers: list[Literal["xds", "crc", "other"]] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def consistent_history(self):
        if self.loan_history == "found" and (self.facility_count is None or self.facility_count < 1):
            raise ValueError("Returned history requires a positive record count.")
        if self.loan_history == "no_history" and self.facility_count != 0:
            raise ValueError("No returned history requires a zero record count.")
        if self.loan_history in {"unknown", "unavailable"} and self.facility_count is not None:
            raise ValueError("An unconfirmed lookup cannot have a confirmed record count.")
        if self.loans and (self.loan_history != "found" or len(self.loans) > self.facility_count):
            raise ValueError("Loan details do not match the confirmed record count.")
        if len({loan.record_id for loan in self.loans}) != len(self.loans):
            raise ValueError("Loan record references must be unique.")
        return self


class ReportFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str
    title: str
    text: str
    source_fields: list[str]


class AnalysisStatement(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=1800)
    evidence: list[str] = Field(min_length=1, max_length=12)


class ReportAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    summary: AnalysisStatement
    observations: list[AnalysisStatement] = Field(max_length=8)
    concerns: list[AnalysisStatement] = Field(max_length=8)
    missing_information: list[AnalysisStatement] = Field(max_length=8)
    questions_for_admin: list[AnalysisStatement] = Field(max_length=8)


class AdminDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    outcome: Literal["selected", "not_selected", "further_information_required"]
    reasons: str = Field(min_length=20, max_length=4000)
    origin: Literal["administrator"] = "administrator"

    @field_validator("reasons", mode="before")
    @classmethod
    def trim_reasons(cls, value):
        return value.strip() if isinstance(value, str) else value


class CompleteCheckDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["complete-check-report-v1"] = "complete-check-report-v1"
    state: Literal["draft"] = "draft"
    environment: Literal["sandbox"] = "sandbox"
    generator: Literal["verified-facts-template", "gemini-validated", "gemini-analysis"] = "verified-facts-template"
    findings: list[ReportFinding]
    follow_up: list[str]
    limitations: list[str]
    staff_note: str = Field(default="", max_length=2000)
    analysis: ReportAnalysis | None = None
    source_digest: str | None = None
    analysis_model: str | None = Field(default=None, max_length=100)
    analysis_prompt_version: str | None = Field(default=None, max_length=100)
    loan_details: list[LoanRecord] = Field(default_factory=list, max_length=50)
    admin_decision: AdminDecision | None = None


def build_report(facts: ReportFacts) -> CompleteCheckDraft:
    findings = []
    follow_up = []
    for field, label in (("nin_match", "NIN name match"), ("bvn_match", "BVN details match")):
        outcome = getattr(facts, field)
        text = {
            "matched": "The submitted details matched the Interswitch response.",
            "not_matched": "The submitted details did not match the Interswitch response.",
            "unknown": "A confirmed match result is not available.",
        }[outcome]
        findings.append(ReportFinding(id=field, title=label, text=text, source_fields=[field]))
        if outcome != "matched":
            follow_up.append(f"Staff must resolve the {label.lower()} result.")
    history_text = {
        "found": f"Interswitch returned {facts.facility_count} loan-history records.",
        "no_history": "No loan-history records were returned by this lookup.",
        "unknown": "The loan-history lookup has no confirmed result and needs reconciliation.",
        "unavailable": "Loan-history information is unavailable.",
    }[facts.loan_history]
    findings.append(ReportFinding(
        id="loan_history", title="Loan history", text=history_text,
        source_fields=["loan_history", "facility_count"] if facts.facility_count is not None else ["loan_history"],
    ))
    if facts.loan_history in {"unknown", "unavailable"}:
        follow_up.append("Staff must resolve the loan-history lookup before describing its outcome.")
    findings.append(ReportFinding(
        id="video_review", title="Staff video review",
        text={"pending": "Staff video review is pending.", "reviewed": "Staff recorded the video as reviewed.",
              "needs_review": "Staff marked the video for follow-up."}[facts.video_review],
        source_fields=["video_review"],
    ))
    if facts.video_review != "reviewed":
        follow_up.append("Complete the staff video review and resolve any follow-up.")
    return CompleteCheckDraft(findings=findings, follow_up=follow_up, loan_details=facts.loans, limitations=[
        "SANDBOX REPORT - SAMPLE DATA ONLY. This draft is not a live verification report.",
        "A record count does not establish current debt, arrears, default, or repayment behaviour.",
        "No records returned does not prove that the person has never borrowed or has no debt.",
        "Income, employment, address, and affordability were not assessed by these checks.",
        "A reviewed video is not a provider-certified liveness or facial-match result.",
        "AI analysis explains the evidence. Any selection decision is recorded separately by an administrator.",
    ])
