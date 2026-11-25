"""Evidence comparisons, not automated rental eligibility decisions."""

import re
import unicodedata
from decimal import Decimal
from difflib import SequenceMatcher

from config import settings


def name_tokens(name: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", name.casefold())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = re.sub(r"[^\w\s]", "", normalized)
    return sorted(set(re.findall(r"[^\W\d_]+", normalized, re.UNICODE)))


def name_similarity(left: str, right: str) -> float:
    a, b = name_tokens(left), name_tokens(right)
    if not a or not b:
        return 0.0
    # One omitted middle name is tolerated only when two or more tokens match.
    if min(len(a), len(b)) >= 2 and (set(a) <= set(b) or set(b) <= set(a)):
        return 1.0
    return round(SequenceMatcher(None, " ".join(a), " ".join(b)).ratio(), 4)


def compare_identity(bvn: dict, nin: dict, duplicate: bool = False) -> dict:
    score = name_similarity(bvn.get("name", ""), nin.get("name", ""))
    dob_match = bool(bvn.get("dob") and nin.get("dob") and bvn["dob"] == nin["dob"])
    phone_a = re.sub(r"\D", "", bvn.get("phone") or "")[-10:]
    phone_b = re.sub(r"\D", "", nin.get("phone") or "")[-10:]
    phone_match = (
        bool(len(phone_a) == 10 and phone_a == phone_b) if phone_a and phone_b else None
    )
    if (
        not bvn.get("verified")
        or not nin.get("verified")
        or score < 0.70
        or (bvn.get("dob") and nin.get("dob") and not dob_match)
    ):
        status = "failed"
    elif score < 0.85 or not dob_match or phone_match is False or duplicate:
        status = "review"
    else:
        status = "verified"
    return {
        "status": status,
        "name_match_score": score,
        "dob_match": dob_match,
        "phone_match": phone_match,
        "duplicate_identity": duplicate,
    }


def affordability(rent: int, income: int, employment_verified: bool) -> dict:
    if type(rent) is not int or type(income) is not int or rent <= 0 or income <= 0:
        raise ValueError("Money must be positive integer kobo amounts.")
    low, high = (
        Decimal(settings.AFFORDABILITY_PASS_RATIO),
        Decimal(settings.AFFORDABILITY_REVIEW_RATIO),
    )
    if not Decimal(0) < low < high <= Decimal(1):
        raise ValueError("Affordability thresholds are invalid.")
    ratio = Decimal(rent) / Decimal(income)
    result = "pass" if ratio <= low else "review" if ratio <= high else "fail"
    if result == "pass" and not employment_verified:
        result = "review"
    return {"ratio": str(ratio.quantize(Decimal(".000001"))), "result": result}


def evidence_score(
    *,
    identity: str,
    liveness: str,
    affordability_result: str,
    employment: str,
    address: str,
    references: str,
    guarantor: str = "not_required",
    credit: str = "not_available",
) -> dict:
    """Return completion percentage and review reasons. A human decides rental suitability."""
    checks = [identity, liveness, affordability_result, employment, address, references]
    if guarantor != "not_required":
        checks.append(guarantor)
    reasons = []
    if identity == "failed":
        reasons.append(
            "Identity records could not be matched; review the evidence with the tenant."
        )
    if liveness == "failed":
        reasons.append(
            "The selfie review did not pass; a reviewer must assess this result."
        )
    if identity == "review" or liveness in ("manual_review", "review"):
        reasons.append("Identity or selfie evidence requires manual review.")
    if affordability_result == "fail":
        reasons.append(
            "The declared rent-to-income ratio is above the configured threshold."
        )
    if employment != "verified":
        reasons.append("Employment evidence has not been verified.")
    if affordability_result == "review":
        reasons.append(
            "Affordability needs review, including the source of the declared income."
        )
    if references == "negative":
        reasons.append("A reference reported a concern; review it with the tenant.")
    if guarantor == "verified":
        reasons.append(
            "Verified guarantor evidence is available for the reviewer to consider."
        )
    pending = any(item == "pending" for item in checks)
    terminal = sum(
        item not in ("pending", "unverified", "manual_review") for item in checks
    )
    reasons.append(
        "A human reviewer must make the final assessment. This is not an automatic rental decision."
    )
    return {
        "result": "pending" if pending else "review",
        "score": round(terminal / len(checks) * 100),
        "reasons": reasons,
    }
