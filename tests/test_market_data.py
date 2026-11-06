import unittest
from financesim.market_data import MarketDataError, validate_quote, weekly_price_change

OLD = {"instrument":"WTI", "contract":"CLZ26", "vendor":"NYMEX",
       "quote_type":"settlement", "unit":"USD/bbl", "value":104.12,
       "observed_at":"2026-10-30T14:30:00-04:00",
       "available_at":"2026-10-30T16:30:00-04:00",
       "source_url":"https://example.org/settlement"}
NEW = {**OLD, "value":105.0,
       "observed_at":"2026-11-06T14:30:00-05:00",
       "available_at":"2026-11-06T16:30:00-05:00"}


class QuoteValidationTests(unittest.TestCase):
    def test_matching_settlements_and_timezones(self):
        out = weekly_price_change(OLD, NEW,
                forecast_cutoff="2026-10-31T12:00:00+09:00",
                evaluation_as_of="2026-11-07T12:00:00+09:00",
                expected_quote_type="settlement")
        self.assertAlmostEqual(out["pct_change"], 100*(105/104.12-1))

    def test_open_is_rejected(self):
        bad = {**OLD, "quote_type":"open", "value":102.95}
        with self.assertRaises(MarketDataError):
            weekly_price_change(bad,NEW,forecast_cutoff="2026-10-31T12:00:00+09:00",
                                evaluation_as_of="2026-11-07T12:00:00+09:00")

    def test_future_reference_is_rejected(self):
        with self.assertRaises(MarketDataError):
            validate_quote(NEW, as_of="2026-10-31T12:00:00+09:00")

    def test_vendor_and_contract_mismatch(self):
        for key, value in (("vendor","vendor2"), ("contract","CLF27"), ("unit","EUR/bbl")):
            with self.assertRaises(MarketDataError):
                weekly_price_change(OLD,{**NEW,key:value},
                    forecast_cutoff="2026-10-31T12:00:00+09:00",
                    evaluation_as_of="2026-11-07T12:00:00+09:00")

    def test_no_untimestamped_or_unattributed_data(self):
        for key, value in (("available_at","2026-11-06T14:30:00"),
                           ("source_url",""), ("value", float("nan"))):
            with self.assertRaises(MarketDataError):
                validate_quote({**NEW,key:value},as_of="2026-11-07T12:00:00+09:00")

    def test_no_same_day_forward_leak(self):
        with self.assertRaises(MarketDataError):
            weekly_price_change(OLD,OLD,forecast_cutoff="2026-10-31T12:00:00+09:00",
                                evaluation_as_of="2026-11-07T12:00:00+09:00")

    def test_bad_official_close_convention(self):
        with self.assertRaises(MarketDataError):
            weekly_price_change(OLD,NEW,forecast_cutoff="2026-10-31T12:00:00+09:00",
                    evaluation_as_of="2026-11-07T12:00:00+09:00",
                    expected_quote_type="official_close")


if __name__ == "__main__":
    unittest.main()
