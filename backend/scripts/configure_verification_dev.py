"""Create missing local-only secrets without printing their values or replacing existing keys."""

import base64
import secrets
from pathlib import Path

from dotenv import dotenv_values, set_key


def main():
    target = Path(__file__).resolve().parents[1] / ".env"
    target.touch(exist_ok=True)
    existing = dotenv_values(target)
    generated = {
        "ENCRYPTION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
        "HASH_PEPPER": secrets.token_urlsafe(32),
        "VERIFICATION_JOB_SECRET": secrets.token_urlsafe(32),
    }
    for name, value in generated.items():
        if not existing.get(name):
            set_key(str(target), name, value)
    print(
        "Local verification secrets are configured in the ignored backend environment file."
    )


if __name__ == "__main__":
    main()
