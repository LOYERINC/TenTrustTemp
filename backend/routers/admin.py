"""Operations endpoints. Membership is server controlled, never user metadata."""
import re
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from services.screening_store import SupabaseStore, authenticated_user

router = APIRouter(prefix="/api/admin", tags=["Admin operations"])


async def require_admin(authorization: Optional[str] = Header(default=None)):
    user = await authenticated_user(authorization)
    if not user.get("email_confirmed_at"):
        raise HTTPException(status_code=403, detail="Confirm your email before using admin tools.")
    membership = await SupabaseStore().get_one("admin_memberships", {
        "user_id": f"eq.{user['id']}", "active": "eq.true",
    })
    if not membership or not membership.get("active"):
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user


@router.get("/me")
async def me(user=Depends(require_admin)):
    return {"id": user["id"], "email": user.get("email"), "is_admin": True}


@router.get("/overview")
async def overview(_user=Depends(require_admin)):
    data = await SupabaseStore().rpc("admin_overview", {})
    return {"metrics": data, "checked_at": datetime.now(timezone.utc).isoformat()}


# Static allowlists are also the response privacy boundary. No select=* on source records.
RESOURCES = {
    "quotes": ("screening_quote_requests", "id,landlord_id,checks,monthly_rent,notes,created_at", "created_at", "notes", ""),
    "users": ("admin_users", "id,email,first_name,last_name,role,status,created_at,last_sign_in_at,email_confirmed_at", "created_at", "email", "status"),
    "waitlist": ("waitlist", "id,name,email,role,submitted_at", "submitted_at", "email", "role"),
    "payments": ("screening_payments", "id,reference,screening_id,landlord_id,provider,mode,amount_kobo,currency,status,created_at,verified_at", "created_at", "reference", "status"),
    "screenings": ("screening_requests", "id,tenant_name,landlord_email,package_id,status,payment_status,created_at,completed_at", "created_at", "tenant_name", "status"),
    "emails": ("admin_email_activity", "id,kind,recipient,state,source,attempts,last_error_code,created_at,sent_at,delivered_at,retryable", "created_at", "recipient", "state"),
}


def page_params(resource: str, page: int, limit: int, search: str, status: str,
                start: Optional[datetime], end: Optional[datetime], mode: str):
    table, columns, date_column, search_column, status_column = RESOURCES[resource]
    params = {"select": columns, "order": f"{date_column}.desc,id.desc", "offset": str((page-1)*limit), "limit": str(limit+1)}
    # PostgREST expressions must not contain user-supplied filter syntax.
    safe_search = re.sub(r"[^\w@+\- .]", "", search, flags=re.UNICODE).strip()[:100]
    if safe_search:
        params[search_column] = f"ilike.*{safe_search}*"
    if status and not status_column:
        raise HTTPException(status_code=422, detail="Status filtering is not supported for this resource.")
    if status:
        if not re.fullmatch(r"[a-z_]{1,40}", status):
            raise HTTPException(status_code=422, detail="Invalid status filter.")
        params[status_column] = f"eq.{status}"
    conditions = []
    for value, operator in ((start, "gte"), (end, "lte")):
        if value:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            conditions.append(f"{date_column}.{operator}.{value.isoformat()}")
    if conditions:
        params["and"] = f"({','.join(conditions)})"
    if resource == "payments" and mode:
        if mode not in ("test", "live", "unknown"):
            raise HTTPException(status_code=422, detail="Invalid payment mode.")
        params["mode"] = f"eq.{mode}"
    return table, params


class RetryEmail(BaseModel):
    reason: str = Field(min_length=5, max_length=300)


@router.post("/emails/{job_id}/retry")
async def retry_email(job_id: UUID, body: RetryEmail, user=Depends(require_admin)):
    if len(body.reason.strip()) < 5:
        raise HTTPException(status_code=422, detail="Enter a reason of at least five characters.")
    result = await SupabaseStore().rpc("retry_email_job", {
        "p_actor": user["id"], "p_job": str(job_id), "p_reason": body.reason.strip(),
    })
    if not result:
        raise HTTPException(status_code=409, detail="This email is not eligible for retry. Delivered, suppressed, and uncertain sends cannot be retried.")
    return {"queued": True}


@router.get("/{resource}")
async def list_resource(resource: str, page: int = Query(1, ge=1, le=100000),
                        limit: int = Query(25, ge=1, le=100), search: str = Query("", max_length=100),
                        status: str = "", start: Optional[datetime] = None, end: Optional[datetime] = None,
                        mode: str = "", _user=Depends(require_admin)):
    if resource not in RESOURCES:
        raise HTTPException(status_code=404, detail="Resource not found.")
    start = start.replace(tzinfo=timezone.utc) if start and start.tzinfo is None else start
    end = end.replace(tzinfo=timezone.utc) if end and end.tzinfo is None else end
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="Start must precede end.")
    table, params = page_params(resource, page, limit, search, status, start, end, mode)
    rows = await SupabaseStore().request("GET", table, params=params) or []
    return {"items": rows[:limit], "page": page, "limit": limit, "has_more": len(rows)>limit}
