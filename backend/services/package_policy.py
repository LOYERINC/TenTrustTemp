from decimal import Decimal, InvalidOperation

NEW_PACKAGES = {
    "basic_v2": {"id": "basic_v2", "name": "Basic", "price": 1500, "currency": "NGN", "checks": ["bvn", "nin", "liveness", "report"], "check_count": 1, "description": "BVN, NIN, a liveness check, and a screening report."},
    "intermediate_v2": {"id": "intermediate_v2", "name": "Intermediate", "price": 3000, "currency": "NGN", "checks": ["bvn", "nin", "liveness", "report", "credit_bureau"], "check_count": 1, "credit_provider": "crc", "description": "Everything in Basic, plus a credit check."},
    "custom_v2": {"id": "custom_v2", "name": "Custom", "price": None, "currency": "NGN", "checks": [], "check_count": 1, "description": "Choose your checks. Get a quote before you pay."},
}

def statement_required(package_id, monthly_rent):
    try:
        rent = Decimal(str(monthly_rent))
        return package_id == "intermediate_v2" and rent.is_finite() and rent > Decimal("500000")
    except (InvalidOperation, TypeError, ValueError):
        return False
