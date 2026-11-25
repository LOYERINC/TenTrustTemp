from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from config import settings
from verification.crypto import Vault
from verification.providers import (
    MonoIdentityProvider,
    liveness_provider,
)
from verification.repository import VerificationRepository
from verification.rules import affordability, compare_identity, evidence_score
from verification.schemas import LandlordSummary
from verification.storage import EvidenceStorage


def now():
    return datetime.now(timezone.utc)


def active_date(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) > now()


class VerificationService:
    def __init__(self, repository=None, vault=None, identity=None, storage=None):
        self.repo = repository or VerificationRepository()
        self.vault = vault or Vault()
        self.identity = identity or MonoIdentityProvider(self.vault)
        self.storage = storage or EvidenceStorage()

    async def case(
        self,
        case_id,
        actor,
        *,
        role="tenant",
        subject="tenant",
        purpose=None,
        editable=False,
    ):
        case = await self.repo.one(
            "verification_cases",
            id="eq." + str(case_id),
            select="id,tenant_id,landlord_id,property_id,status,expires_at",
        )
        if not case:
            raise HTTPException(404, "Verification case not found.")
        if role == "landlord":
            linked = await self.repo.one(
                "verification_property_links",
                property_id="eq." + str(case.get("property_id")),
                landlord_id="eq." + actor,
            )
            consent = await self.repo.one(
                "consents",
                case_id="eq." + case["id"],
                subject_type="eq.tenant",
                subject_id="eq." + case["tenant_id"],
                revoked_at="is.null",
                select="purposes,policy_version",
            )
            if (
                case.get("landlord_id") != actor
                or not linked
                or not consent
                or "summary_sharing" not in consent["purposes"]
            ):
                raise HTTPException(404, "Verification summary not found.")
        elif role != "admin":
            authorized = (
                case["tenant_id"] == actor
                if subject == "tenant"
                else await self.repo.one(
                    "guarantors",
                    case_id="eq." + case["id"],
                    user_id="eq." + actor,
                    status="eq.accepted",
                )
            )
            if not authorized:
                raise HTTPException(404, "Verification case not found.")
        if editable and (
            case["status"] in ("expired", "completed")
            or not active_date(case["expires_at"])
        ):
            raise HTTPException(409, "This verification is no longer editable.")
        if purpose:
            consent = await self.repo.one(
                "consents",
                case_id="eq." + case["id"],
                subject_type="eq." + subject,
                subject_id="eq." + actor,
                revoked_at="is.null",
                select="purposes,policy_version",
            )
            if (
                not consent
                or consent["policy_version"] != settings.VERIFICATION_POLICY_VERSION
                or purpose not in consent["purposes"]
            ):
                raise HTTPException(
                    403,
                    "Current consent for this purpose is required before processing.",
                )
        await self.repo.audit(
            case["id"], actor, role if role != "tenant" else subject, "case_read"
        )
        columns = (
            "id,tenant_first_name,status,overall_result,summary,completed_at,expires_at"
            if role == "landlord"
            else "*"
        )
        return await self.repo.one(
            "verification_cases", id="eq." + case["id"], select=columns
        )

    async def rate_limit(self, actor, ip, action="identity"):
        for key, limit in [("user:" + actor, 10), ("ip:" + ip, 30)]:
            allowed = await self.repo.rpc(
                "verification_rate_limit",
                key=self.vault.digest(key, "rate:" + action),
                limit=limit,
                window=3600,
            )
            if not allowed:
                raise HTTPException(
                    429, "Too many verification requests. Please try again later."
                )

    async def create(self, actor, payload):
        if not 1 <= settings.DATA_RETENTION_DAYS <= 365:
            raise HTTPException(
                503, "Verification retention is not configured correctly."
            )
        return await self.repo.rpc(
            "verification_create",
            tenant=actor,
            first_name=payload.tenant_first_name,
            landlord=str(payload.landlord_id) if payload.landlord_id else None,
            property=str(payload.property_id) if payload.property_id else None,
            rent=payload.monthly_rent_kobo,
            days=settings.DATA_RETENTION_DAYS,
        )

    async def consent(self, case_id, actor, payload, ip, agent):
        case = await self.case(
            case_id, actor, subject=payload.subject_type, editable=True
        )
        if payload.policy_version != settings.VERIFICATION_POLICY_VERSION:
            raise HTTPException(
                409, "Review the current verification policy before giving consent."
            )
        await self.repo.rpc(
            "verification_consent",
            case=case["id"],
            actor=actor,
            type=payload.subject_type,
            purposes=list(set(payload.purposes)),
            policy=payload.policy_version,
            ip=self.vault.encrypt(ip, case["id"] + ":consent:ip"),
            agent=self.vault.encrypt(agent[:500], case["id"] + ":consent:agent"),
        )
        return {"consent_recorded": True, "policy_version": payload.policy_version}

    async def subject_record(
        self, table, case, actor, subject, reader=None, reader_role=None
    ):
        await self.repo.audit(
            case["id"], reader or actor, reader_role or subject, "subject_evidence_read"
        )
        return await self.repo.one(
            table,
            case_id="eq." + case["id"],
            subject_id="eq." + actor,
            subject_type="eq." + subject,
        )

    def context(self, case, actor):
        return case["id"] + ":" + actor

    async def begin_identity(self, case_id, actor, payload, ip):
        case = await self.case(
            case_id,
            actor,
            subject=payload.subject_type,
            purpose="identity",
            editable=True,
        )
        await self.rate_limit(actor, ip)
        bvn, nin = payload.bvn.get_secret_value(), payload.nin.get_secret_value()
        if any(not value.isascii() or not value.isdigit() for value in (bvn, nin)):
            raise HTTPException(422, "BVN and NIN must each contain exactly 11 digits.")
        if payload.date_of_birth and payload.date_of_birth > now().date():
            raise HTTPException(422, "Date of birth cannot be in the future.")
        record = await self.subject_record(
            "identity_records", case, actor, payload.subject_type
        )
        if (
            record
            and record.get("bvn_session_encrypted")
            and record.get("session_expires_at")
            and active_date(record["session_expires_at"])
        ):
            return {
                "status": record["status"],
                "next_step": "select_otp_method",
                "methods": record.get("allowed_methods", []),
            }
        data = {
            "subject_type": payload.subject_type,
            "subject_id": actor,
            "bvn_encrypted": self.vault.encrypt(
                bvn, self.context(case, actor) + ":bvn"
            ),
            "nin_encrypted": self.vault.encrypt(
                nin, self.context(case, actor) + ":nin"
            ),
            "bvn_hash": self.vault.digest(bvn, "bvn"),
            "nin_hash": self.vault.digest(nin, "nin"),
            "status": "pending",
        }
        if record:
            data["id"] = record["id"]
        data.pop("id", None)
        record = await self.repo.rpc(
            "verification_begin_identity",
            case=case["id"],
            actor=actor,
            type=payload.subject_type,
            payload=data,
        )
        if (
            record.get("bvn_session_encrypted")
            and record.get("session_expires_at")
            and active_date(record["session_expires_at"])
        ):
            return {
                "status": record["status"],
                "next_step": "select_otp_method",
                "methods": record.get("allowed_methods", []),
            }
        ctx = self.context(case, actor)
        try:
            nin_result = await self.identity.lookup_nin(
                nin,
                payload.date_of_birth.isoformat() if payload.date_of_birth else None,
                ctx,
            )
            changes = {
                "id": record["id"],
                "subject_id": actor,
                "subject_type": payload.subject_type,
                "nin_verified": nin_result.verified,
                "full_name_nin": self.vault.encrypt(nin_result.name, ctx + ":nin_name"),
                "dob_nin": self.vault.encrypt(nin_result.dob, ctx + ":nin_dob"),
                "phone_nin": self.vault.encrypt(nin_result.phone, ctx + ":nin_phone"),
                "nin_raw_response_encrypted": nin_result.audit_encrypted,
                "reference_photo_encrypted": self.vault.encrypt(
                    nin_result.photo, ctx + ":nin_photo"
                )
                if nin_result.photo
                else None,
                "status": "pending" if nin_result.verified else "failed",
            }
            await self.repo.write(
                case["id"],
                "identity_records",
                changes,
                actor,
                payload.subject_type,
                "nin_lookup_completed",
            )
            if not nin_result.verified:
                await self._identity_failure(
                    case, actor, payload.subject_type, record, 422
                )
                return {"status": "failed", "next_step": "manual_review", "methods": []}
            session = await self.identity.begin_bvn(bvn, ctx)
            await self.repo.write(
                case["id"],
                "identity_records",
                {
                    "id": record["id"],
                    "subject_id": actor,
                    "subject_type": payload.subject_type,
                    "bvn_session_encrypted": session.encrypted_session,
                    "session_expires_at": (now() + timedelta(minutes=10)).isoformat(),
                    "allowed_methods": session.methods,
                    "lease_until": None,
                },
                actor,
                payload.subject_type,
                "identity_lookup_started",
            )
        except HTTPException as exc:
            await self._identity_failure(
                case, actor, payload.subject_type, record, exc.status_code
            )
            raise
        finally:
            bvn = nin = ""
        return {
            "status": "pending",
            "next_step": "select_otp_method",
            "methods": session.methods,
            "reference_photo_available": bool(nin_result.photo),
        }

    async def _identity_failure(self, case, actor, subject, record, status):
        changes = {
            "id": record["id"],
            "subject_id": actor,
            "subject_type": subject,
            "lease_until": None,
        }
        if status == 422:
            changes["status"] = "failed"
        try:
            await self.repo.write(
                case["id"],
                "identity_records",
                changes,
                actor,
                subject,
                "identity_lookup_failed",
            )
            await self.recompute(case, actor)
        except HTTPException:
            # Revocation can race with an external call: do not recreate purged evidence.
            pass

    async def identity_session(self, case, actor, subject):
        record = await self.subject_record("identity_records", case, actor, subject)
        if (
            not record
            or not record.get("bvn_session_encrypted")
            or not active_date(record["session_expires_at"])
        ):
            raise HTTPException(
                409,
                "Start a new identity lookup; the BVN session is unavailable or expired.",
            )
        return record, self.vault.decrypt(
            record["bvn_session_encrypted"], self.context(case, actor) + ":session"
        )

    async def send_otp(self, case_id, actor, payload, ip):
        case = await self.case(
            case_id,
            actor,
            subject=payload.subject_type,
            purpose="identity",
            editable=True,
        )
        await self.rate_limit(actor, ip, "otp")
        record, session = await self.identity_session(case, actor, payload.subject_type)
        if payload.method not in record["allowed_methods"]:
            raise HTTPException(
                422, "Choose one of the available verification methods."
            )
        await self.repo.audit(
            case["id"], actor, payload.subject_type, "identity_otp_requested"
        )
        await self.identity.send_otp(
            session,
            payload.method,
            payload.phone_number.get_secret_value() if payload.phone_number else None,
        )
        return {"next_step": "enter_otp"}

    async def finish_identity(self, case_id, actor, payload, ip):
        case = await self.case(
            case_id,
            actor,
            subject=payload.subject_type,
            purpose="identity",
            editable=True,
        )
        await self.rate_limit(actor, ip, "otp")
        record, session = await self.identity_session(case, actor, payload.subject_type)
        if not await self.repo.rpc(
            "verification_claim_identity",
            case=case["id"],
            subject=actor,
            type=payload.subject_type,
        ):
            raise HTTPException(
                409, "An identity check is already running or consent was revoked."
            )
        ctx = self.context(case, actor)
        try:
            bvn = await self.identity.complete_bvn(
                session, payload.otp.get_secret_value(), ctx
            )
            nin = {
                "verified": record["nin_verified"],
                "name": self.vault.decrypt(record["full_name_nin"], ctx + ":nin_name"),
                "dob": self.vault.decrypt(record["dob_nin"], ctx + ":nin_dob"),
                "phone": self.vault.decrypt(record["phone_nin"], ctx + ":nin_phone"),
            }
            duplicate = False
            for column in ("bvn_hash", "nin_hash"):
                duplicate = duplicate or bool(
                    await self.repo.one(
                        "identity_records",
                        **{
                            column: "eq." + record[column],
                            "subject_id": "neq." + actor,
                            "select": "id",
                        },
                    )
                )
            comparison = compare_identity(bvn.comparison(), nin, duplicate)
            await self.repo.write(
                case["id"],
                "identity_records",
                {
                    "id": record["id"],
                    "subject_id": actor,
                    "subject_type": payload.subject_type,
                    **comparison,
                    "bvn_verified": bvn.verified,
                    "full_name_bvn": self.vault.encrypt(bvn.name, ctx + ":bvn_name"),
                    "dob_bvn": self.vault.encrypt(bvn.dob, ctx + ":bvn_dob"),
                    "phone_bvn": self.vault.encrypt(bvn.phone, ctx + ":bvn_phone"),
                    "raw_response_encrypted": bvn.audit_encrypted,
                    "verified_at": now().isoformat(),
                    "lease_until": None,
                    "bvn_session_encrypted": None,
                    "allowed_methods": [],
                },
                actor,
                payload.subject_type,
                "identity_compared",
            )
        except HTTPException as exc:
            await self._identity_failure(
                case, actor, payload.subject_type, record, exc.status_code
            )
            raise
        await self.recompute(case, actor)
        return {
            "identity_status": comparison["status"],
            "duplicate_review_required": duplicate,
        }

    async def save_file_record(
        self, case, actor, role, table, data, file, column, selfie=False
    ):
        await self.repo.audit(case["id"], actor, role, "evidence_upload_started")
        key = await self.storage.upload(case["id"], file, selfie=selfie)
        try:
            data[column] = key
            return await self.repo.write(
                case["id"], table, data, actor, role, "evidence_uploaded"
            )
        except Exception:
            try:
                await self.storage.delete(key)
            except Exception:
                await self.repo.store.insert(
                    "verification_purge_queue",
                    {"case_id": case["id"], "storage_key": key},
                )
            raise

    async def liveness(self, case_id, actor, payload):
        case = await self.case(
            case_id,
            actor,
            subject=payload.subject_type,
            purpose="liveness",
            editable=True,
        )
        identity = await self.subject_record(
            "identity_records", case, actor, payload.subject_type
        )
        if not identity or not identity.get("nin_verified"):
            raise HTTPException(
                409, "Complete the identity lookup before uploading a selfie."
            )
        previous = await self.repo.rows(
            "liveness_checks",
            case_id="eq." + case["id"],
            subject_id="eq." + actor,
            subject_type="eq." + payload.subject_type,
        )
        if len(previous) >= 3:
            raise HTTPException(
                409, "The maximum of three selfie attempts has been reached."
            )
        provider = liveness_provider()
        record = await self.save_file_record(
            case,
            actor,
            payload.subject_type,
            "liveness_checks",
            {
                "subject_type": payload.subject_type,
                "subject_id": actor,
                "provider": settings.LIVENESS_PROVIDER,
                "status": "manual_review",
                "attempt": len(previous) + 1,
            },
            payload.selfie,
            "selfie_storage_key",
            selfie=True,
        )
        result = await provider.start(record["id"])
        await self.recompute(case, actor)
        return {
            "check_id": record["id"],
            "status": result["status"],
            "attempts_remaining": 2 - len(previous),
            "reference_photo_available": bool(
                identity.get("reference_photo_encrypted")
            ),
        }

    async def employment(self, case_id, actor, payload):
        case = await self.case(
            case_id,
            actor,
            subject=payload.subject_type,
            purpose="employment",
            editable=True,
        )
        current = await self.subject_record(
            "employment_records", case, actor, payload.subject_type
        )
        ctx = self.context(case, actor)
        data = {
            "subject_id": actor,
            "subject_type": payload.subject_type,
            "employment_type": payload.employment_type,
            "employer_name": self.vault.encrypt(
                payload.employer_name, ctx + ":employer"
            ),
            "job_title": self.vault.encrypt(payload.job_title, ctx + ":job"),
            "cac_number": self.vault.encrypt(payload.cac_number, ctx + ":cac")
            if payload.cac_number
            else None,
            "monthly_income_kobo": payload.monthly_income_kobo,
            "verification_status": "unverified",
            "verified_by": None,
            "verified_at": None,
            "verification_method": None,
            "verification_notes": None,
        }
        if current:
            data["id"] = current["id"]
        record = await self.save_file_record(
            case,
            actor,
            payload.subject_type,
            "employment_records",
            data,
            payload.document,
            "document_storage_key",
        )
        if current and current.get("document_storage_key"):
            await self.repo.store.insert(
                "verification_purge_queue",
                {"case_id": case["id"], "storage_key": current["document_storage_key"]},
            )
        await self.refresh_affordability(case, record, actor, payload.subject_type)
        await self.recompute(case, actor)
        return {"status": "unverified", "income_source": "self_declared"}

    async def refresh_affordability(self, case, employment, actor, role):
        current = await self.subject_record(
            "affordability_checks",
            case,
            employment["subject_id"],
            employment["subject_type"],
            reader=actor,
            reader_role=role,
        )
        data = {
            "subject_id": employment["subject_id"],
            "subject_type": employment["subject_type"],
            "monthly_rent_kobo": case["monthly_rent_kobo"],
            "monthly_income_kobo": employment["monthly_income_kobo"],
            **affordability(
                case["monthly_rent_kobo"],
                employment["monthly_income_kobo"],
                employment["verification_status"] == "verified",
            ),
        }
        if current:
            data["id"] = current["id"]
        await self.repo.write(
            case["id"],
            "affordability_checks",
            data,
            actor,
            role,
            "affordability_calculated",
        )

    async def bundle(self, case, actor, role):
        if case["status"] == "expired" or not active_date(case["expires_at"]):
            raise HTTPException(
                410, "Sensitive verification evidence is no longer available."
            )
        await self.repo.audit(case["id"], actor, role, "verification_evidence_read")
        data = {}
        for table in (
            "identity_records",
            "liveness_checks",
            "employment_records",
            "affordability_checks",
            "address_records",
            "references",
            "guarantors",
        ):
            data[table] = await self.repo.rows(
                table, case_id="eq." + case["id"], order="created_at.desc"
            )
        return data

    def evaluate(self, bundle):
        def latest(table, subject="tenant"):
            return next(
                (
                    row
                    for row in bundle[table]
                    if row.get("subject_type", "tenant") == subject
                ),
                {},
            )

        refs = bundle["references"]
        references = (
            "pending"
            if not refs or any(r["status"] != "responded" for r in refs)
            else "negative"
            if any(
                r.get("paid_on_time") is False
                or r.get("property_condition") == "poor"
                or r.get("would_rent_again") is False
                for r in refs
            )
            else "positive"
        )
        guarantor = "not_required"
        if bundle["guarantors"]:
            guarantor = (
                "verified"
                if latest("identity_records", "guarantor").get("status") == "verified"
                and latest("liveness_checks", "guarantor").get("status") == "passed"
                and latest("employment_records", "guarantor").get("verification_status")
                == "verified"
                and latest("affordability_checks", "guarantor").get("result") == "pass"
                else "pending"
            )
        statuses = {
            "identity": latest("identity_records").get("status", "pending"),
            "liveness": latest("liveness_checks").get("status", "pending"),
            "employment": latest("employment_records").get(
                "verification_status", "unverified"
            ),
            "affordability_result": latest("affordability_checks").get(
                "result", "pending"
            ),
            "address": latest("address_records").get("verification_status", "pending"),
            "references": references,
            "guarantor": guarantor,
        }
        return {**evidence_score(**statuses), "checks": statuses}

    async def recompute(self, case, actor):
        if case["status"] == "draft":
            raise HTTPException(403, "Record consent before running checks.")
        data = await self.bundle(case, actor, "system")
        summary = self.evaluate(data)
        await self.repo.rpc(
            "verification_set_summary",
            case=case["id"],
            actor=actor,
            summary=summary,
            score=summary["score"],
        )
        return summary

    async def summary(self, case_id, actor, role="tenant", subject="tenant"):
        case = await self.case(case_id, actor, role=role, subject=subject)
        await self.repo.audit(
            case["id"], actor, role if role != "tenant" else subject, "summary_read"
        )
        statuses = case.get("summary", {}).get("checks", {})
        names = [
            ("Identity", "identity"),
            ("Liveness", "liveness"),
            ("Employment", "employment"),
            ("Affordability", "affordability_result"),
            ("References", "references"),
            ("Guarantor", "guarantor"),
        ]
        labels = {
            "verified": "Verified",
            "passed": "Verified",
            "unverified": "Unverified",
            "pass": "Pass",
            "review": "Review",
            "failed": "Failed",
            "fail": "Above threshold",
            "pending": "Pending",
            "manual_review": "Manual review",
            "positive": "Positive",
            "negative": "Requires review",
            "not_required": "Not required",
        }
        dto = LandlordSummary(
            caseId=case["id"],
            tenantFirstName=case["tenant_first_name"],
            overallResult=case["overall_result"],
            checks=[
                {
                    "name": title,
                    "status": labels.get(
                        statuses.get(
                            key, "not_required" if key == "guarantor" else "pending"
                        ),
                        "Pending",
                    ),
                }
                for title, key in names
            ]
            + [{"name": "Credit check", "status": "Not available"}],
            reasons=case.get("summary", {}).get(
                "reasons",
                [
                    "Evidence collection is not complete. A human reviewer makes the final assessment."
                ],
            ),
            verifiedAt=case.get("completed_at"),
        )
        return dto

    async def revoke(self, case_id, actor, subject):
        case = await self.case(case_id, actor, subject=subject)
        await self.repo.rpc(
            "verification_purge_case", case=case["id"], actor=actor, revoke=True
        )
        await self.retention()
        return {
            "status": "expired",
            "sensitive_fields_purged": True,
            "storage_deletion_queued": True,
        }

    async def retention(self):
        cases = await self.repo.rows(
            "verification_cases",
            expires_at="lte." + now().isoformat(),
            status="neq.expired",
            limit="100",
        )
        for case in cases:
            await self.repo.rpc("verification_purge_case", case=case["id"])
        queue = await self.repo.rows("verification_purge_queue", limit="100")
        removed = 0
        for item in queue:
            try:
                await self.storage.delete(item["storage_key"])
                await self.repo.store.request(
                    "DELETE",
                    "verification_purge_queue",
                    params={"id": "eq." + item["id"]},
                )
                removed += 1
            except Exception:
                # Leave the durable queue entry to retry on the next scheduled run.
                continue
        await self.repo.store.request(
            "PATCH",
            "verification_webhook_events",
            params={"expires_at": "lte." + now().isoformat()},
            json={"raw_response_encrypted": None},
        )
        return {"cases_purged": len(cases), "objects_deleted": removed}
