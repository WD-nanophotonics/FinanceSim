# FinanceSim research index

Current stage: **v0.2 research memory and scenario exploration**.

## What exists
- v0.1 statistical engine: naive, drift, EWMA point/interval forecasts and walk-forward backtesting.
- v0.2 research artifacts: as-of evidence timestamps, claim/hypothesis/experiment/revision records, SHA-256 seals, three-arm weekly prediction comparison.
- v0.2 scenario simulation: explicitly assumed independent-event probabilities, impact vectors, joint asset scenario draws, Monte Carlo predictive summaries.

## Active research questions (not established conclusions)
- Q001: Does explicit macro-event quantification add forecast skill beyond univariate naive/EWMA?
- Q002: Is uncertainty in realized volatility more predictable than the sign of one-week returns?
- Q003: Does adding LLM interpretations improve out-of-sample Brier and interval scores against numerical models?
- Q004: Do event probabilities degrade calibration across stressed financial regimes?

## First prospective weekly evaluation (2026-10-24)
- **Sealed 2026-10-24**: `research/weekly/2026-10-24-forecast.json`; 17 common targets, 3 arms each. Actual market values are for 2026-10-23 and earlier; all outcomes occur 2026-10-28 through October 30. Forecast content SHA-256: `d00be1a5231e557dbe7e90f189fa6489651ff05af5638ef1f21d96cec02adf75`.
- Code: `research/scripts/generate_2026_10_24.py` and fixed input snapshot `research/inputs/2026-10-24-1200-snapshot.json`. CI run 40056935102 generated and verified the forecast on Python 3.10 and 3.12. Publication commit: `44b1752d3e6f285a20167dc080c042cf73a30243`.
- **No previous 2026-10-17 sealed weekly forecast**, so there is no scoreable previous-week Brier/MAE/RMSE. Oct21 experiments are not counted retroactively.
- WARNING: first week is uncalibrated; 9 market asset series have only six as-of daily closes, making normal-difference volatilities unreliable; WTI Dec26 volatility prior is assumed, not fitted. Weekly claims sample has ten observations only. Historical claims vintage not independently audited. Subjective LLM and scenario probabilities are explicitly assumptions. No claim of predictive skill yet.

## Validated evidence
- First legitimate prospective predictions are now pre-registered. Predictive accuracy remains unknown until after 2026-10-30 outcomes; synthetic software tests do not validate real economic forecast skill.

## Current limitations
- No automatic current data acquisition and no economic-release vintage loader.
- Scenario impacts are assumptions; Gaussian innovations, conditional independence and no network effects.
- No sustained out-of-sample real-market evaluation yet.
- Daily research artifacts will be added only after actual information retrieval and simulations.

## Next engineering priorities
1. Timezone-and-release-vintage-aware data ingestion, then reusable numerical feature registry.
2. Link evidence IDs to weekly scenario inputs and freeze three arms before outcomes.
3. Evaluation dashboard with week-wise skill vs zero-change, lagged-value and consensus.
4. Extend scenario dependencies and error calibration only after empirical justification.
