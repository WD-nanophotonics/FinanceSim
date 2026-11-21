"""Explicit network acquisition of staging history; never infer closed sessions.

Produces compact source observations + raw response hashes, NOT a launch snapshot.
Run in an authorized network environment. No authentication material is used.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from financesim.tail_risk import TailRiskError, sealed, write_new


class TreasuryRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        if tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        if tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def treasury_values(raw):
    parser = TreasuryRows()
    parser.feed(raw.decode("utf-8"))
    column, observations = None, {}
    for row in parser.rows:
        if row and row[0] == "Date":
            if row.count("10 Yr") != 1:
                raise TailRiskError("unrecognized Treasury 10-year header")
            column = row.index("10 Yr")
        elif row and column is not None:
            try:
                day = datetime.strptime(row[0], "%m/%d/%Y").date().isoformat()
            except ValueError:
                continue
            if len(row) <= column or row[column] in ("N/A", "") or day in observations:
                raise TailRiskError("missing/duplicate Treasury observation")
            observations[day] = float(row[column])
    if not observations:
        raise TailRiskError("no Treasury daily par yields")
    return observations


def yahoo_values(raw):
    payload = json.loads(raw)
    if payload["chart"].get("error"):
        raise TailRiskError("Yahoo returned an error")
    result = payload["chart"]["result"][0]
    # Unadjusted price-index close; never use adjclose or intraday quotes.
    quotes = result["indicators"]["quote"][0]["close"]
    dates = result["timestamp"]
    if len(quotes) != len(dates):
        raise TailRiskError("Yahoo timestamps and closes differ")
    values = {}
    for t, value in zip(dates, quotes):
        if value is not None:
            day = datetime.fromtimestamp(t, timezone.utc).date().isoformat()
            if day in values:
                raise TailRiskError("duplicate Yahoo date")
            values[day] = round(float(value), 2)
    return values


def acquire(*, start, end):
    if date.fromisoformat(end) >= datetime.now(timezone.utc).date():
        raise TailRiskError("request only completed historical dates")
    urls = {"sp500": "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=10y&interval=1d",
            "nasdaq100": "https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?range=10y&interval=1d"}
    urls.update({str(y): f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value={y}" for y in range(date.fromisoformat(start).year, date.fromisoformat(end).year+1)})
    def fetch(item):
        name, url = item
        raw = None
        try:
            with urlopen(Request(url, headers={"User-Agent": "FinanceSim/0.1 research"}), timeout=12) as response:
                raw = response.read()
            observations = yahoo_values(raw) if name in ("sp500", "nasdaq100") else treasury_values(raw)
        except (OSError, ValueError, KeyError) as exc:
            return name, {"url": url, "raw_sha256": sha256(raw).hexdigest() if raw is not None else None,
                          "observations": {}, "error": f"{type(exc).__name__}: {exc}"}
        return name, {"url": url, "raw_sha256": sha256(raw).hexdigest(), "observations": {d: v for d, v in observations.items() if start <= d <= end}}
    with ThreadPoolExecutor(max_workers=4) as pool:
        sources = dict(pool.map(fetch, urls.items()))
    treasury = {}
    for name, source in sources.items():
        if name not in ("sp500", "nasdaq100"):
            if set(treasury) & set(source["observations"]):
                raise TailRiskError("Treasury response overlaps years; server may have ignored year filter")
            treasury.update(source["observations"])
    series = {k: sources[k]["observations"] for k in ("sp500", "nasdaq100")}
    series["us10y"] = treasury
    return sealed({"record_type": "parallel_history_staging", "dataset_kind": "real", "acquired_at": datetime.now(timezone.utc).isoformat(),
                   "requested_range": [start, end], "source_responses": sources,
                   "series": series, "counts": {k: len(v) for k, v in series.items()},
                   "unavailable_sources": {k: v["error"] for k, v in sources.items() if "error" in v},
                   "price_precision": "Yahoo unadjusted price-index close rounded to two decimals; Treasury quoted yield unchanged.",
                   "status": "STAGING_ONLY: no inferred session calendar, no live forecast, no claim of vintage backtest",
                   "pending": ["Audit historical calendar independently; absent quotes do not prove closure", "Freeze identical provider/close for future original three arms and candidates", "Refresh through Nov27 before Nov28 cutoff"]})


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("-o", "--output", required=True)
    a = p.parse_args()
    result = acquire(start=a.start, end=a.end)
    write_new(a.output, result)
    print(json.dumps({"counts": result["counts"], "status": result["status"]}))
