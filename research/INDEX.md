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

## After-noon reporting-format supplement, 2026-10-24
- At approximately 12:52 JST a **separate**, append-only supplement was computed from the unchanged October 23 as-of market snapshot and pre-declared scenarios. Its public commit is `eb98c0f8722c1707cd43d00c721e0a7e4e0ef1c3`; file: `research/weekly/2026-10-24-1252-risk-and-interval-supplement-canonical.json`; record SHA-256: `83f30f4aca061c4e7b980de54d33ae49122d6258f09e1b0a4235291ae94a13c9`. **Do not call this addendum a 12:00 pre-registration.**
- The supplement adds five group-B risk-state forecasts, plus model-conditional 50% and 90% intervals for each original group-A and group-C target, while leaving all 17 original three-arm points, probabilities and 80% intervals unchanged. For hybrid market arms the interval sample exactly replays the original 15,000-draw mixture; other intervals are Gaussian approximations from frozen 80% widths and are uncalibrated.
- Weekly user-facing format from next report is strictly grouped by A economic releases/planned events, B market risk state, C financial asset prices; this grouping is distinct from the three independent forecasting arms (LLM, numerical baseline, hybrid). Score A/B/C per target with frozen comparison baselines, and disclose overlaps (group-B states are derived from group-C assets).
- Known metadata issue to audit on settlement: Tokyo cash-equity close is 15:30 JST (Oct24 archive says 15:00 for Nikkei). Keep historical forecast file untouched and record the settlement convention explicitly.
- As of Oct24 there are **zero** validated prior weekly forecast outcomes; skill and 50/90 empirical coverage remain unavailable.

- Archival integrity note (2026-10-24): an intermediate file `research/weekly/2026-10-24-1252-risk-and-interval-supplement.json` was serialized through JavaScript, changing floating-point lexical forms such as `0.0` into `0`, so its original Python SHA-256 seal failed verification. That file is retained as a failed artifact and MUST NOT be used. The independently generated **canonical** Python JSON at `research/weekly/2026-10-24-1252-risk-and-interval-supplement-canonical.json` passes seal verification and exact Python 3.10/3.12 replay. This correction does not alter original 12:06 forecast content.


## 2026-10-31: first prospective weekly evaluation and Nov6 forward forecast

- Original Oct24 17-target three-arm forecast: `research/weekly/2026-10-24-forecast.json` (untouched), plus **after-noon** five-risk addendum.
- Latest Oct31 settlement: `research/weekly/2026-10-31-verification-correction01.json` (supersedes `-verification-provisional.json`; retains all source-vendor caveats). Oct30 WTI 102.95 was **the day's opening quote, not the close**; Reuters' December WTI close was USD104.12 vs Oct23 USD103.27, thus corrected weekly return is positive ~0.8231%, not -0.31%. This correction changed group C Brier skill. The earliest incorrect record is retained for audit.
- Group A: 7 targets; pureLLM average Brier 0.12193, numeric 0.19356, hybrid 0.12736. Group C: 10 targets; LLM 0.25997, numeric 0.25000, hybrid 0.25542. B: five **late-supplement risk targets**, Brier 0.10458 vs assumed independence baseline 0.08277. One sample week is insufficient to claim calibration, alpha or skill. Mixed-unit MAE cannot be aggregated.
- Nov6 prospective 23 targets (8 A releases/events, 5 B risk states, 10 C market assets): `research/weekly/2026-10-31-forecast.json` with code `research/scripts/generate_2026_10_31.js`, inputs `research/inputs/2026-10-31-1200-snapshot.json`, fixed seed 20261031, 20000 Monte Carlo draws. This was generated and published **after** the scheduled 12:00 JST cutoff; only Oct30 or earlier inputs were used, but archive time must never be backdated.
- **Forward baseline warning:** WTI Oct30 reference price in the immutable Oct31 forecast snapshot is also the incorrect USD102.95 opening quote. See append-only `research/weekly/2026-10-31-provenance-amendment01.json`. Score frozen percentage-return forecast against matched Dec26 NYMEX official Oct30 and Nov6 settlements; never modify the archived point/probability. Vendor agreement still requires verification.
- `research/scripts/score_2026_10_31.py` independently replays fixed Oct24 original forecast & risk supplement against corrected Oct30 observed results, with scoring and source cautions. `.github/workflows/tests.yml` includes replay of this script and exact deterministic Nov6 forecast JSON reproduction.
- Priority: improve as-of OHLC settlement-source integrity and official release vintages before further model complexity; source conflict (including WTI and rates) should produce abstention/provisional flags, not fake precision. Daily autonomous research did not generate post-Oct21 files in GitHub; treat missing research as missing rather than hallucinate activity.

- 2026-10-31 ~12:47 JST secondary, post-noon source audit: `research/experiments/2026-10-31-postpublication-source-audit.json`; independently checked BEA Q3 GDP 3.4%, Sept core PCE 3.1%, Dallas WEI 2.98, Nikkei Oct30 official close 63,290.11, BLS Nov6 release schedule and Treasury 10Y provisional 4.94%. No new forecast generated, no frozen values rewritten. **This is after the 12:00 forecast cutoff.** Oct30 WTI settlement vendor mismatch, cross-vendor price baselines and historical RBA futures-probability provenance remain unresolved.
