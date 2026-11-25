"""Allowlisted loan fields from the Marketplace credit-history response."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RepaymentEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    date: str | None = Field(pattern=r"^[0-9]{4}-[0-9]{2}(-[0-9]{2})?$")
    status: Literal["pending", "paid", "overdue", "missed", "unknown"]


class LoanRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    record_id: str = Field(pattern=r"^loan_[1-9][0-9]*$")
    source_group: str = Field(default="group_1", pattern=r"^group_[1-9][0-9]*$")
    institution: str | None = Field(default=None, max_length=160)
    institution_source: Literal["record", "group", "not_supplied"] = "not_supplied"
    loan_status: Literal["open", "closed", "unknown"] = "unknown"
    performance_status: Literal["performing", "non-performing", "unknown"] = "unknown"
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    date_opened: str | None = Field(default=None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    closed_date: str | None = Field(default=None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    opening_balance: str | None = Field(default=None, pattern=r"^[0-9]{1,24}(\.[0-9]{1,8})?$")
    repayment_amount: str | None = Field(default=None, pattern=r"^[0-9]{1,24}(\.[0-9]{1,8})?$")
    repayment_frequency: Literal["daily", "weekly", "monthly", "quarterly", "annually", "unknown"] = "unknown"
    repayment_schedule: list[RepaymentEntry] = Field(default_factory=list, max_length=120)
    schedule_entries_returned: int | None = Field(default=None, ge=0)
    tenor: int | None = Field(default=None, ge=0)


def _date(value):
    if not isinstance(value, str):
        return None
    for pattern in ("%d-%m-%Y", "%Y-%m-%d", "%m-%Y", "%Y-%m"):
        try:
            parsed = datetime.strptime(value, pattern)
            return parsed.strftime("%Y-%m" if pattern in ("%m-%Y", "%Y-%m") else "%Y-%m-%d")
        except ValueError:
            pass
    return None


def _amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount >= Decimal('1e24') or amount.as_tuple().exponent < -8:
            return None
        return format(amount, 'f')
    except (ValueError, InvalidOperation):
        return None


def normalize_loan(raw: dict, index: int, group: dict | None = None, group_index: int = 1) -> LoanRecord:
    def choice(key, values):
        value = raw.get(key)
        return value if isinstance(value, str) and value in values else "unknown"
    currency = raw.get("currency")
    schedule = raw.get("repayment_schedule")
    def institution_name(value):
        return value.strip() if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9 .,&()'/-]{1,160}", value) else None
    institution = institution_name(raw.get("institution"))
    institution_source = "record" if institution else "not_supplied"
    if not institution:
        institution = institution_name((group or {}).get("institution"))
        if institution:
            institution_source = "group"
    tenor = raw.get("tenor")
    return LoanRecord(
        record_id=f"loan_{index}", source_group=f"group_{group_index}",
        institution=institution, institution_source=institution_source,
        loan_status=choice("loan_status", {"open", "closed"}),
        performance_status=choice("performance_status", {"performing", "non-performing"}),
        currency=currency if isinstance(currency, str) and re.fullmatch(r"[A-Z]{3}", currency) else None,
        date_opened=_date(raw.get("date_opened")) if isinstance(raw.get("date_opened"), str) and len(raw["date_opened"]) == 10 else None,
        closed_date=_date(raw.get("closed_date")) if isinstance(raw.get("closed_date"), str) and len(raw["closed_date"]) == 10 else None,
        opening_balance=_amount(raw.get("opening_balance")), repayment_amount=_amount(raw.get("repayment_amount")),
        repayment_frequency=choice("repayment_frequency", {"daily", "weekly", "monthly", "quarterly", "annually"}),
        repayment_schedule=[RepaymentEntry(date=_date(item.get("date")),
            status=item.get("status") if isinstance(item.get("status"), str) and item.get("status") in {"pending", "paid", "overdue", "missed"} else "unknown")
            for item in (schedule[:120] if isinstance(schedule, list) else []) if isinstance(item, dict)],
        schedule_entries_returned=len(schedule) if isinstance(schedule, list) else None,
        tenor=tenor if type(tenor) is int and 0 <= tenor < 1000000 else None,
    )
