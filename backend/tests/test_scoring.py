import unittest

from services.scoring import affordability_points, calculate_readiness_score, rental_history_points


class AffordabilityBandsTest(unittest.TestCase):
    def test_boundaries(self):
        cases = [
            (0.25, 100),
            (0.25001, 90),
            (0.30, 90),
            (0.30001, 75),
            (0.35, 75),
            (0.35001, 60),
            (0.40, 60),
            (0.40001, 35),
            (0.50, 35),
            (0.50001, 10),
        ]
        for rent_share, expected in cases:
            with self.subTest(rent_share=rent_share):
                self.assertEqual(affordability_points(rent_share * 1000, 1000), expected)

    def test_rejects_non_positive_values(self):
        with self.assertRaises(ValueError):
            affordability_points(0, 1000)


class RentalHistoryBandsTest(unittest.TestCase):
    def test_bands(self):
        cases = [
            (12, 12, 100),
            (10, 11, 85),
            (8, 10, 70),
            (7, 10, 50),
            (6, 10, 20),
        ]
        for on_time, total, expected in cases:
            with self.subTest(on_time=on_time, total=total):
                self.assertEqual(rental_history_points(on_time, total), expected)

    def test_missing_history_is_omitted(self):
        self.assertIsNone(rental_history_points(0, 0))

    def test_rejects_invalid_history(self):
        with self.assertRaises(ValueError):
            rental_history_points(13, 12)


class CompositeScoreTest(unittest.TestCase):
    def test_perfect_inputs_produce_one_hundred(self):
        result = calculate_readiness_score(250_000, 1_000_000, 12, 12, True, True)
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["scale"], 100)
        self.assertEqual(result["identity_status"], "not_included_in_score")

    def test_missing_history_reweights_available_factors_and_lowers_confidence(self):
        result = calculate_readiness_score(250_000, 1_000_000, income_evidence=True)
        self.assertEqual([factor["key"] for factor in result["factors"]], ["affordability", "evidence"])
        self.assertEqual(result["score"], 86)
        self.assertEqual(result["confidence"], "moderate")

    def test_score_stays_in_one_to_one_hundred_range(self):
        result = calculate_readiness_score(900_000, 1_000_000, 0, 12)
        self.assertGreaterEqual(result["score"], 1)
        self.assertLessEqual(result["score"], 100)

    def test_recommendation_requests_more_information_when_confidence_is_low(self):
        result = calculate_readiness_score(250_000, 1_000_000)
        self.assertEqual(result["recommendation_label"], "More details needed")
        self.assertIn("enough information", result["recommendation"])

    def test_recommendation_never_auto_approves_or_rejects(self):
        positive = calculate_readiness_score(250_000, 1_000_000, 12, 12, True, True)
        concern = calculate_readiness_score(900_000, 1_000_000, 0, 12, True, True)
        self.assertEqual(positive["recommendation_label"], "Good details")
        self.assertEqual(concern["recommendation_label"], "Review these details")
        self.assertIn("closer look", concern["recommendation"])


if __name__ == "__main__":
    unittest.main()
