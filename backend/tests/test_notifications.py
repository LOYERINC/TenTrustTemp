import unittest
from unittest.mock import patch

from config import settings
from routers import screenings


class FakeResponse:
    status_code = 200


class FakeResendClient:
    def __init__(self):
        self.request = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, url, *, json, headers):
        self.request = {"url": url, "json": json, "headers": headers}
        return FakeResponse()


class ReportReadyNotificationTest(unittest.IsolatedAsyncioTestCase):
    async def test_email_is_sent_with_authenticated_report_link_and_no_screening_details(self):
        client = FakeResendClient()
        row = {"id": "screening-123", "landlord_email": "landlord@example.com"}
        with (
            patch.object(settings, "RESEND_API_KEY", "re_test_key"),
            patch.object(settings, "SCREENING_NOTIFICATION_FROM_EMAIL", "TenTrust <reports@example.com>"),
            patch("routers.screenings.httpx.AsyncClient", return_value=client),
        ):
            await screenings._notify_landlord_report_ready(row)

        self.assertEqual(client.request["url"], "https://api.resend.com/emails")
        self.assertEqual(client.request["json"]["to"], ["landlord@example.com"])
        self.assertIn("report=screening-123", client.request["json"]["text"])
        self.assertNotIn("100/100", client.request["json"]["text"])
        self.assertEqual(client.request["headers"]["Authorization"], "Bearer re_test_key")

    async def test_email_is_skipped_when_not_configured(self):
        with (
            patch.object(settings, "RESEND_API_KEY", ""),
            patch.object(settings, "SCREENING_NOTIFICATION_FROM_EMAIL", ""),
            patch("routers.screenings.httpx.AsyncClient") as client,
        ):
            await screenings._notify_landlord_report_ready({"id": "screening-123", "landlord_email": "landlord@example.com"})

        client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
