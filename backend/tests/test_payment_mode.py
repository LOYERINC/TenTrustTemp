import unittest
from unittest.mock import patch
from routers.screenings import payment_mode
from config import settings


class PaymentModeTests(unittest.TestCase):
    def test_test_live_and_unrecognized_credentials_are_not_conflated(self):
        for key, expected in [('sk_test_example', 'test'), ('sk_live_example', 'live'), ('invalid', 'unknown'), ('', 'unknown')]:
            with patch.object(settings, 'PAYSTACK_SECRET_KEY', key):
                self.assertEqual(payment_mode('paystack'), expected)
        for key, expected in [('FLWSECK_TEST-example', 'test'), ('FLWSECK-example', 'live'), ('invalid', 'unknown')]:
            with patch.object(settings, 'FLW_SECRET_KEY', key):
                self.assertEqual(payment_mode('flutterwave'), expected)
        self.assertEqual(payment_mode('unsupported'), 'unknown')
