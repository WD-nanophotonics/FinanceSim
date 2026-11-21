import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("parallel_sources", ROOT/"research/scripts/prepare_parallel_history.py")
sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sources)


class SourceParserTests(unittest.TestCase):
    def test_exact_treasury_column_and_year_date(self):
        table = b'<table><tr><th>Date</th><th>2 Yr</th><th>10 Yr</th><th>30 Yr</th></tr><tr><td>11/20/2026</td><td>4.63</td><td>4.92</td><td>5.31</td></tr></table>'
        self.assertEqual(sources.treasury_values(table), {"2026-11-20": 4.92})

    def test_yahoo_uses_close_not_adjusted_close(self):
        raw = json.dumps({"chart": {"error": None, "result": [{"timestamp": [1795179600], "indicators": {"quote": [{"close": [100]}], "adjclose": [{"adjclose": [999]}]}}]}}).encode()
        result = sources.yahoo_values(raw)
        self.assertEqual(list(result.values()), [100])


if __name__ == "__main__":
    unittest.main()
