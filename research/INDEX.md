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

## Validated evidence
- None yet from live real-world financial predictions. Tests so far verify software behavior on synthetic examples.

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
