# FinanceSim v0.1.0 — incremental forecasting experiment

An intentionally small, reproducible **statistical baseline**, not a trained world-economy model. Financial market forecasts and economic releases should be treated as separate series, with properly aligned release-time and as-of data.

## Single prediction API

```python
from financesim import forecast, backtest

history = {"sp500": [100 + i*0.2 for i in range(120)],
           "us10y_yield_pct": [4 + 0.001*i for i in range(120)]}
result = forecast(history, indicators=["sp500", "us10y_yield_pct"],
                  method="drift", horizon=5, lookback=26,
                  interval=0.8, simulations=1000, seed=7,
                  frequency="daily", as_of="2026-10-16")
validation = backtest(history, method="drift", horizon=5, lookback=26)
```

Run `python -m unittest discover -s tests -v` and `python examples/quickstart.py` from the repository root. Standard-library only runtime, Python >=3.10.

### Parameters

- `data`: mapping of numerical **levels** (oldest to newest), uniformly spaced, without missing values. Input must contain no future data.
- `indicators`: selected output targets; omit for all.
- `method`: `naive` (last value), `drift` (mean level difference), `ewma` (smoothed level). These are transparent baselines, not fitted cross-asset macro models.
- `horizon`: number of *observations* ahead, NOT a calendar period. For prices, five market sessions roughly represent a week; for weekly macro series, use one observation. Trading holidays and release schedules require upstream adjustment.
- `lookback`, `decay`: trailing observation count and EWMA smoothing.
- `interval`, `simulations`, `seed`: Gaussian-model prediction interval, optional seeded Monte Carlo draws, reproducibility.
- `frequency`, `as_of`: descriptive metadata only, **not data leakage protections**.

### Results and evaluation

The single API returns level point forecasts, positive-change probability, Gaussian intervals, innovation-based uncertainty and optional simulation summaries. The engine assumes independent Gaussian level differences, which is often a poor choice for real equity prices; intervals are not empirically calibrated.

`backtest` uses only prefix data at each historical origin, evaluates targets `horizon` observations later, and reports MAE, RMSE, Brier score, interval coverage and interval score. Origins default to non-overlapping stride. Use distinct tuning and holdout periods before claiming predictive improvements.

### Roadmap

1. Add timestamp-aware market and official macro release-vintage ingestion, quality and data-source locking.
2. Add equity return + volatility models (random walk, EWMA, HAR), event and macro nowcast model families.
3. Separate three arms: pure LLM, numeric benchmarks, LLM+numeric, with immutable weekly forecasts and common targets.
4. Add exogenous variables, probabilistic calibration, walk-forward nested validation and forecast diagnostics.
5. Evaluate after 26 and 52 weeks, always compare with naive/consensus baselines.

**Current release has no external data fetching, no live financial simulation and no demonstrated financial-market accuracy.** Example uses synthetic data only.


### One-command JSON interface

`python -m financesim examples/request.json -o outputs/latest.json`

Pass a JSON object with `action` = `forecast` or `backtest`, `data` containing series arrays, and `parameters` containing the forecasting/backtesting arguments documented above. See `examples/request.json`. The output is machine-readable JSON.


## Research memory and a quantifiable world-model layer (research protocol v0.2)

The research protocol is [research/PROTOCOL.md](research/PROTOCOL.md), with current hypotheses in [research/INDEX.md](research/INDEX.md). Every actual observation, dated hypothesis, simulation, revision and weekly forecast is preserved as a separate provenance-tagged artifact. Daily working information can become scenario inputs, but assumptions are not confused with observed facts.

Use the **same JSON command endpoint** for every mode:

```bash
python -m financesim examples/scenario_request.json
python -m financesim examples/research_seal_request.json
```

CLI `action` now supports `forecast`, `backtest`, `scenarios`, `seal`, `verify`, and `score`.

In Python, additional APIs are `simulate_scenarios(baseline, events, ...)`, `seal(...)`, `verify(record)`, and `score_weekly(forecast_record, actual_changes)`. The `scenarios` mode takes each target's baseline mean change, baseline Gaussian noise standard deviation, an explicitly assumed event probability and impact vector; shocks share event realizations across assets while distinct events and residual noise are independent. It has no automatic news understanding, econometric calibration or feedback network yet. Example parameters are **synthetic, not live economic estimates**.

### Research and outcome integrity

The research sealing utility refuses evidence accessed after the stated information cutoff, requires three consistent prediction arms, blocks scoreable targets already resolved by the prediction cutoff, and hashes the record. The hash is a tamper indicator, **not proof of publication time**; the public Git commit history provides the external timestamp. Real-life dates, publication vintage and market closing conventions require further upstream verification. No user-facing daily research reports are sent; Saturday reports use the archived daily evidence and forecasts.

First as-of research observation: [2026-10-19](research/daily/2026-10-19.json) (official Dallas Fed WEI and U.S. Department of Labor initial claims; not yet a forecast).
