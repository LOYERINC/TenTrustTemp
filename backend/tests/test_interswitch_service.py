import asyncio
import json

import httpx
import pytest

from services.interswitch_service import InterswitchLookupUnknown, InterswitchSandbox


def test_documented_credit_history_groups_are_parsed_without_private_profile():
    def respond(request):
        if request.url.path.endswith('/client'):
            return httpx.Response(200, json={"success": True, "data": {"access_token": "test-token", "expires_in": 1800}})
        return httpx.Response(200, json={"success": True, "data": {
            "providers": ["xds"], "profile": {"full_name": "PRIVATE", "identifications": [{"type": "BVN", "no": "PRIVATE"}]},
            "credit_history": [{"institution": "GUARANTY TRUST BANK PLC", "history": [{
                "institution": None, "loan_status": "open", "performance_status": "performing", "currency": "NGN",
                "date_opened": "30-06-2022", "closed_date": "21-06-2022", "opening_balance": 0,
                "repayment_amount": 23000000, "repayment_frequency": "monthly", "tenor": 0,
                "repayment_schedule": [{"date": "06-2022", "status": "pending"}],
            }]}, {"institution": "OTHER GROUP BANK", "history": [{"institution": "RECORD BANK", "loan_status": "closed"}]}],
        }})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            result = await InterswitchSandbox(client, 'id', 'secret').loan_history('22227777222')
        assert result.facility_count == 2
        first, second = result.loans
        assert first.institution == 'GUARANTY TRUST BANK PLC' and first.institution_source == 'group'
        assert first.repayment_amount == '23000000' and first.tenor == 0
        assert first.repayment_schedule[0].date == '2022-06'
        assert first.closed_date < first.date_opened  # Preserve contradictions for the analyst.
        assert second.institution == 'RECORD BANK' and second.source_group == 'group_2'
        assert 'PRIVATE' not in ''.join(loan.model_dump_json() for loan in result.loans)
    asyncio.run(run())


def test_sandbox_history_caches_token_and_drops_private_profile():
    paths = []

    def respond(request):
        paths.append(request.url.path)
        if request.url.path.endswith("/authentication/client"):
            assert json.loads(request.content) == {"clientId": "test-id", "clientSecret": "test-secret"}
            return httpx.Response(200, json={"success": True, "data": {"access_token": "test-token", "expires_in": 1800}})
        assert request.headers["Authorization"] == "Bearer test-token"
        assert json.loads(request.content) == {"bvn": "22227777222"}
        groups = [{"history": [{"loan_status": "open"}]}] if len(paths) == 2 else []
        return httpx.Response(200, json={
            "success": True,
            "trackingId": "fixture-reference",
            "data": {"credit_history": groups, "providers": ["xds"], "profile": {"full_name": "Private"}},
        })

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            service = InterswitchSandbox(client, "test-id", "test-secret")
            found = await service.loan_history("22227777222")
            assert (found.status, found.facility_count, found.providers) == ("found", 1, ("xds",))
            assert found.tracking_id == "fixture-reference"
            assert "Private" not in repr(found)
            empty = await service.loan_history("22227777222")
            assert (empty.status, empty.facility_count) == ("no_history", 0)
        assert len(paths) == 3

    asyncio.run(run())


@pytest.mark.parametrize("malformed", [False, True])
def test_unconfirmed_lookup_is_not_retried_or_treated_as_empty(malformed):
    lookup_count = 0

    def respond(request):
        nonlocal lookup_count
        if request.url.path.endswith("/authentication/client"):
            return httpx.Response(200, json={"success": True, "data": {"access_token": "test-token", "expires_in": 1800}})
        lookup_count += 1
        if malformed:
            return httpx.Response(200, json={"success": True, "data": {"providers": ["xds"]}})
        raise httpx.ReadTimeout("lookup timed out", request=request)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            service = InterswitchSandbox(client, "test-id", "test-secret")
            with pytest.raises(InterswitchLookupUnknown):
                await service.loan_history("22227777222")
        assert lookup_count == 1

    asyncio.run(run())


def test_documented_interswitch_identity_requests():
    calls = []
    responses = {
        "client": {"success": True, "data": {"access_token": "test-token", "expires_in": 1800}},
        "nin": {"success": True, "data": {
            "nin": {"nin": "10000000001"},
            "summary": {"nin_check": {"fieldMatches": {"firstname": True, "lastname": True}}},
        }},
        "initiate-bvn-igree": {"success": True, "data": {
            "bvn": "20000000002",
            "session_id": "provider-session",
            "methods": [{"method": "phone", "hint": "private hint"}],
        }},
        "bvn-igree-request-otp": {"success": True, "data": None},
        "fetch-bvn-igree-details": {"success": True, "data": {
            "bvn": "20000000002", "first_name": "TEST", "last_name": "Person", "dob": "1990-01-01",
            "phone_number": "private phone",
        }},
    }

    def respond(request):
        endpoint = request.url.path.rsplit("/", 1)[-1]
        calls.append((endpoint, json.loads(request.content)))
        return httpx.Response(200, json=responses[endpoint])

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            service = InterswitchSandbox(client, "test-id", "test-secret")
            assert await service.verify_nin("10000000001", "Test", "Person")
            session = await service.start_bvn_consent("20000000002")
            assert session.methods == ("phone",)
            assert "provider-session" not in repr(session)
            with pytest.raises(ValueError):
                await service.request_bvn_otp(session, "unsupported")
            await service.request_bvn_otp(session, "phone")
            assert await service.verify_bvn(session, "123456", "20000000002", "Test", "Person", "1990-01-01")
            assert not await service.verify_bvn(session, "123456", "20000000002", "Test", "Different", "1990-01-01")

    asyncio.run(run())
    assert calls[1] == ("nin", {"nin": "10000000001", "firstName": "Test", "lastName": "Person"})
    assert calls[3] == ("bvn-igree-request-otp", {"session_id": "provider-session", "method": "phone"})
    assert calls[4] == ("fetch-bvn-igree-details", {"session_id": "provider-session", "otp": "123456"})
