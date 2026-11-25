from uuid import UUID
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from routers import interswitch
from services.complete_check_report import AdminDecision, ReportFacts, build_report
from services.gemini_report import validate_report


def facts(**changes):
    return ReportFacts(**{
        "nin_match": "matched", "bvn_match": "matched", "loan_history": "no_history",
        "facility_count": 0, **changes,
    })


def test_empty_history_is_not_a_debt_free_conclusion():
    draft = build_report(facts())
    assert draft.state == "draft"
    assert draft.findings[2].text == "No loan-history records were returned by this lookup."
    assert any("does not prove" in text for text in draft.limitations)
    assert any("pending" in finding.text for finding in draft.findings)
    assert all(set(item.source_fields) <= set(ReportFacts.model_fields) for item in draft.findings)


def test_unknown_and_mismatch_require_follow_up():
    draft = build_report(facts(nin_match="not_matched", loan_history="unknown", facility_count=None))
    assert len(draft.follow_up) == 3
    assert "reconciliation" in draft.findings[2].text
    assert "facility_count" not in draft.findings[2].source_fields


@pytest.mark.parametrize("changes", [
    {"loan_history": "found", "facility_count": 0},
    {"loan_history": "unknown", "facility_count": 0},
    {"facility_count": -1}, {"facility_count": True}, {"nin": "63184876213"},
])
def test_rejects_inconsistent_or_private_facts(changes):
    with pytest.raises(ValidationError):
        facts(**changes)


def test_draft_endpoint_requires_admin_and_uses_only_summary():
    app = FastAPI()
    app.include_router(interswitch.staff_router)
    client = TestClient(app)
    case_id = "11111111-1111-4111-8111-111111111111"
    assert client.get(f"/api/admin/complete-check/{case_id}/report-draft").status_code in {401, 403}
    app.dependency_overrides[interswitch.require_admin] = lambda: {"id": "staff"}
    intake = AsyncMock(return_value=(None, {"video_key": "PRIVATE"}, {
        "loan_history": "found", "facility_count": 2, "providers": ["xds"], "bvn": "PRIVATE",
    }))
    with patch.object(interswitch, "staff_intake", intake):
        response = client.get(f"/api/admin/complete-check/{case_id}/report-draft")
    assert response.status_code == 200
    assert "PRIVATE" not in response.text
    assert response.json()["findings"][2]["text"] == "Interswitch returned 2 loan-history records."
    intake.assert_awaited_once_with(UUID(case_id))


def test_publication_rejects_changed_facts_and_unsupported_claims():
    draft = build_report(facts(video_review="reviewed"))
    validate_report(draft, facts(video_review="reviewed"))
    with pytest.raises(ValueError):
        validate_report(draft, facts(video_review="needs_review"))
    draft.findings[2].text = "Tenant has no debt and should be accepted."
    with pytest.raises(ValueError):
        validate_report(draft, facts(video_review="reviewed"))


@pytest.mark.parametrize('reasons', ['short', ' ' * 100])
def test_admin_decision_requires_substantive_human_reasons(reasons):
    with pytest.raises(ValidationError):
        AdminDecision(outcome='not_selected', reasons=reasons)
