import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import interswitch
from services.complete_check_report import ReportFacts
from services.gemini_report import generate_report, validate_report


FACTS = ReportFacts(nin_match="matched", bvn_match="matched", loan_history="no_history", facility_count=0)
ANALYSIS = {
    "summary": {"text": "Identity checks matched, while this lookup returned no loan records. Debt and affordability remain unassessed.", "evidence": ["nin_match", "bvn_match", "loan_history", "scope"]},
    "observations": [], "concerns": [],
    "missing_information": [{"text": "Income and current outstanding balances were not supplied.", "evidence": ["scope"]}],
    "questions_for_admin": [{"text": "Complete the video review before publication.", "evidence": ["video_review"]}],
}


def body(choices=ANALYSIS, reason="STOP"):
    return {"candidates": [{"finishReason": reason, "content": {"parts": [{"text": json.dumps(choices)}]}}],
            "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 20, "thoughtsTokenCount": 5}}


@pytest.mark.parametrize("reply,outcome", [
    (body(), "validated"),
    (body({**ANALYSIS, "summary": {"text": "Debt is 9999.", "evidence": ["loan_history"]}}), "fallback"),
    (body({**ANALYSIS, "tenant_score": 99}), "fallback"),
    (body({**ANALYSIS, "summary": {"text": "Approve this tenant.", "evidence": ["loan_history"]}}), "fallback"),
    (body({**ANALYSIS, "summary": {"text": "Loan is performing.", "evidence": ["loans.fake"]}}), "fallback"),
    (body(reason="MAX_TOKENS"), "incomplete"),
    ({"promptFeedback": {"blockReason": "SAFETY"}}, "incomplete"),
    ({"candidates": [{"finishReason": "STOP", "content": {"parts": []}}]}, "fallback"),
])
def test_generation_validates_claims_and_falls_back_without_retry(reply, outcome):
    calls = []
    def respond(request):
        calls.append(request)
        assert request.headers["x-goog-api-key"] == "test-secret"
        assert "test-secret" not in str(request.url)
        payload = json.loads(request.content)
        assert payload["generationConfig"]["maxOutputTokens"] == 6144
        prompt = json.loads(payload["contents"][0]["parts"][0]["text"])
        assert not any(key in prompt["evidence"] for key in ("nin", "bvn", "video_url", "tenant_name", "staff_note", "admin_decision"))
        return httpx.Response(200, json=reply)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            result = await generate_report(client, FACTS, enabled=True, api_key="test-secret", model="gemini-2.5-flash-lite")
        assert result.outcome == outcome
        assert result.report.generator == ("gemini-analysis" if outcome == "validated" else "verified-facts-template")
        validate_report(result.report, FACTS)
        assert result.report.admin_decision is None
        if outcome == "validated":
            assert result.input_tokens == 100 and result.output_tokens == 25
        assert len(calls) == 1
    asyncio.run(run())


@pytest.mark.parametrize("status", [429, 500])
def test_provider_errors_do_not_retry(status):
    calls = []
    async def run():
        def respond(request):
            calls.append(request)
            return httpx.Response(status, json={"error": "private diagnostic"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            result = await generate_report(client, FACTS, enabled=True, api_key="secret", model="gemini-2.5-flash-lite")
        assert result.outcome == "fallback"
        assert "private diagnostic" not in repr(result)
        assert len(calls) == 1
    asyncio.run(run())


def test_disabled_or_invalid_model_does_not_send_request():
    async def run():
        def fail(_):
            pytest.fail("Unexpected network request")
        async with httpx.AsyncClient(transport=httpx.MockTransport(fail)) as client:
            for enabled, key, model in ((False, "secret", "gemini-2.5-flash-lite"), (True, "", "gemini-2.5-flash-lite"), (True, "secret", "../../elsewhere")):
                result = await generate_report(client, FACTS, enabled=enabled, api_key=key, model=model)
                assert result.report.generator == "verified-facts-template"
    asyncio.run(run())


def test_staff_generation_auth_configuration_and_database_limit():
    app = FastAPI()
    app.include_router(interswitch.staff_router)
    client = TestClient(app)
    path = "/api/admin/complete-check/11111111-1111-4111-8111-111111111111/report-draft/generate"
    assert client.post(path).status_code in {401, 403}
    app.dependency_overrides[interswitch.require_admin] = lambda: {"id": "staff"}
    store = SimpleNamespace(rpc=AsyncMock(return_value=False))
    intake = AsyncMock(return_value=(store, {}, {"loan_history": "no_history", "facility_count": 0}))
    settings = SimpleNamespace(COMPLETE_CHECK_AI_ENABLED=False, GEMINI_API_KEY="secret", COMPLETE_CHECK_AI_MODEL="gemini-2.5-flash-lite")
    generator = AsyncMock()
    with patch.object(interswitch, "staff_intake", intake), patch.object(interswitch, "settings", settings), patch.object(interswitch, "generate_report", generator):
        response = client.post(path)
        assert response.status_code == 200
        assert response.json()["generation"]["outcome"] == "not_configured"
        store.rpc.assert_not_awaited()
        settings.COMPLETE_CHECK_AI_ENABLED = True
        response = client.post(path)
        assert response.status_code == 200
        assert response.json()["report"]["generator"] == "verified-facts-template"
        generator.assert_not_awaited()
        assert store.rpc.await_args.args[1]["p_limit"] == 2
        from fastapi import HTTPException
        store.rpc.side_effect = HTTPException(503, "Database unavailable")
        response = client.post(path)
        assert response.status_code == 200
        assert response.json()["generation"]["outcome"] == "limit_unavailable"
        generator.assert_not_awaited()
