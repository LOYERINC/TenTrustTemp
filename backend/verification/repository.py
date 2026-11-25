from fastapi import HTTPException

from services.screening_store import SupabaseStore


class VerificationRepository:
    def __init__(self):
        self.store = SupabaseStore()

    async def rows(self, table, **params):
        return await self.store.request("GET", table, params=params) or []

    async def one(self, table, **params):
        rows = await self.rows(table, **params, limit="1")
        return rows[0] if rows else None

    async def rpc(self, name, **params):
        try:
            return await self.store.rpc(
                name, {"p_" + key: value for key, value in params.items()}
            )
        except HTTPException as exc:
            if exc.status_code == 409:
                raise HTTPException(
                    409,
                    "The verification changed or is unavailable. Refresh before retrying.",
                ) from None
            raise

    async def audit(self, case, actor, role, event, metadata=None):
        await self.rpc(
            "verification_audit",
            case=case,
            actor=actor,
            role=role,
            event=event,
            metadata=metadata or {},
        )

    async def write(self, case, table, payload, actor, role, event):
        return await self.rpc(
            "verification_write",
            case=case,
            table=table,
            payload=payload,
            actor=actor,
            role=role,
            event=event,
        )
