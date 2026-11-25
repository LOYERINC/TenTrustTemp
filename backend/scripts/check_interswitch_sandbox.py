"""Run the Marketplace NIN and loan-history examples with TenTrust test keys."""

import asyncio
from pathlib import Path

import httpx
from dotenv import dotenv_values

from services.interswitch_service import InterswitchLookupUnknown, InterswitchSandbox, InterswitchUnavailable


async def main() -> int:
    env = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    client_id = env.get("INTERSWITCH_TEST_CLIENT_ID")
    client_secret = env.get("INTERSWITCH_TEST_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("Interswitch sandbox keys are missing from backend/.env.")
        return 1

    step = "NIN"
    try:
        async with httpx.AsyncClient() as client:
            sandbox = InterswitchSandbox(client, client_id, client_secret)
            if not await sandbox.verify_nin("63184876213", "Bunch", "Dillon"):
                print("The NIN example returned a mismatch.")
                return 1
            print("NIN example matched.")
            step = "loan history"
            result = await sandbox.loan_history("22227777222")
            print(f"Loan-history example returned {result.status}.")
    except ImportError:
        print("The configured proxy requires an additional HTTPX dependency.")
        return 1
    except InterswitchUnavailable:
        print("Could not authenticate with Interswitch. Check sandbox connectivity and the project keys.")
        return 1
    except InterswitchLookupUnknown:
        print(f"Interswitch authentication passed, but the {step} result was unconfirmed.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
