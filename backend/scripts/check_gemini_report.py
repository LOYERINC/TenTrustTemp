"""Live Gemini report demonstration using explicitly synthetic loan records only."""
import asyncio
import argparse
import json
from pathlib import Path

import httpx

from config import settings
from services.complete_check_report import ReportFacts, ReportAnalysis
from services.gemini_report import generate_report, validate_analysis, PROMPT_VERSION
from services.loan_evidence import normalize_loan


async def main(model=None):
    model = model or settings.COMPLETE_CHECK_AI_MODEL
    loans = [normalize_loan(raw, index) for index, raw in enumerate([
        {"institution": "SAMPLE BANK A", "loan_status": "open", "performance_status": "performing", "currency": "NGN",
         "date_opened": "30-06-2022", "closed_date": "21-06-2022", "opening_balance": 0,
         "repayment_amount": 23000000, "repayment_frequency": "monthly",
         "repayment_schedule": [{"date": "06-2022", "status": "pending"}]},
        {"institution": "SAMPLE BANK B", "loan_status": "open", "performance_status": "non-performing", "currency": "NGN",
         "date_opened": "15-01-2025", "opening_balance": 150000,
         "repayment_amount": 25000, "repayment_frequency": "monthly",
         "repayment_schedule": [{"date": "02-2025", "status": "overdue"}, {"date": "03-2025", "status": "paid"}]},
    ], 1)]
    facts = ReportFacts(nin_match="matched", bvn_match="matched", loan_history="found",
                       facility_count=2, video_review="reviewed", loans=loans, providers=["xds"])
    capture = {}
    async with httpx.AsyncClient() as client:
        class Capture:
            async def post(self, *args, **kwargs):
                response = await client.post(*args, **kwargs)
                capture["http_status"] = response.status_code
                if response.is_error:
                    message = str(response.json().get("error", {}).get("message", "Request failed"))
                    print("Provider diagnostic:", message.replace(settings.GEMINI_API_KEY, "[redacted]")[:1500])
                if response.is_success:
                    data = response.json()
                    print("Finish reasons:", [candidate.get("finishReason") for candidate in data.get("candidates", [])])
                    capture["raw_model_text"] = "\n".join(part.get("text", "")
                        for candidate in data.get("candidates", [])
                        for part in candidate.get("content", {}).get("parts", []) if not part.get("thought"))
                return response
        result = await generate_report(Capture(), facts, enabled=settings.COMPLETE_CHECK_AI_ENABLED,
            api_key=settings.GEMINI_API_KEY, model=model)
    print("HTTP:", capture.get("http_status"), "Outcome:", result.outcome)
    if result.outcome != "validated":
        print("No validated AI analysis was returned. Factual fallback remains available.")
        if capture.get("raw_model_text"):
            diagnostic = Path(__file__).resolve().parents[2] / "artifacts/setup/gemini-analysis-diagnostic.json"
            diagnostic.write_text(json.dumps({"sample_data_only": True, **capture}, indent=2), encoding="utf-8")
            try:
                validate_analysis(ReportAnalysis.model_validate_json(capture["raw_model_text"]), facts)
            except ValueError as error:
                print("Synthetic validation diagnostic:", str(error)[:500])
        return 1
    output = {"sample_data_only": True, "description": "Synthetic demonstration, not a real Interswitch lookup or tenant report.",
        "model": model, "prompt_version": PROMPT_VERSION, **capture,
        "source_facts": facts.model_dump(mode="json"), "report": result.report.model_dump(mode="json"),
        "usage": {"input_tokens": result.input_tokens, "output_tokens": result.output_tokens}}
    target = Path(__file__).resolve().parents[2] / "artifacts/setup/gemini-loan-analysis-response.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(result.report.analysis.model_dump(), indent=2))
    print("Saved:", target)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', help='Optional model for this synthetic demo only; does not change application settings.')
    arguments = parser.parse_args()
    raise SystemExit(asyncio.run(main(arguments.model)))
