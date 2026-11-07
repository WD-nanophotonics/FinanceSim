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


## 2026-11-06: research restarted, six of eight group-A outcomes checked before US payroll release

- **Daily evidence resumed:** `research/daily/2026-11-06-restart.json` and first-release inputs `research/inputs/2026-11-06-preclose-first-releases.json`. Previous daily entries end on Oct21; Nov1–5 are NOT backfilled as if daily runs occurred.
- **Partial outcomes available BEFORE Friday 08:30 EST payroll publication:** Oct ISM manufacturing 55.5 (Sep 54.5), ISM services 54.5 (Sep 54.9), initial claims 189k (Oct31 reference week), Dallas Fed WEI 3.47, RBA +25bp to 4.85%, BoE +25bp to 4.0%. Payroll and unemployment rate are NOT yet released as of the recorded timestamp and must remain missing; Nov6 US closing asset values likewise unavailable. A-group 6/8 targets only, not a completed weekly score.
- **First-vintage complication:** frozen first-release prior claims 194k, revised prior in Nov5 release 195k; frozen WEI Oct24 prior value 2.98 vs Nov5 page's revised prior 2.95. Score using frozen first-release baselines, never update them post hoc.
- **Partial Brier over six heterogeneous A outcomes (unadjusted for correlation):** LLM 0.21245, statistical/market baseline 0.17508, hybrid 0.20067. Baseline currently wins; hybrid Brier skill vs statistical is -14.6%, LLM -21.3%. Do not infer long-run relative performance from six observations. Coverage 50/90 for LLM 3/6 and 6/6; baseline 5/6 and 6/6; hybrid 4/6 and 6/6.
- **Reproducible scoring:** `financesim/scorecards.py` and `research/scripts/score_2026_11_06_partial.py`, with source-dated first releases and mandatory per-unit point score aggregation. These scripts do not fetch or authenticate external source URLs.
- **Market quote quality gate:** `financesim/market_data.py` validates required vendor, quote kind, futures contract, currency/unit, observed and available timestamps; rejects opening quotes in official settlement scoring, mixed contracts/vendors and future information. Tests under `tests/test_market_data.py` and `tests/test_scorecards.py`. Validation depends on the caller accurately tagging the underlying vendor data.
- **Next Saturday run 2026-11-07:** fetch official first-release payroll/unemployment (Nov6 08:30 EST), all official Friday market closes and matched futures settlements; perform 23-target Nov6 verification with explicit sources and source integrity checks, then freeze new forecast based on only information available by noon JST, with separate actual commit time. BLS Oct CPI due Nov10 and PPI due Nov13, both 08:30 EST, already verified on official calendar.


## 2026-11-07: prospective week-2 score, new Nov13 three-arm forecast

- **A/B/C previous forecast fully scored, source-provisional where relevant** in `research/weekly/2026-11-07-verification.json` (commit `aee156da0a349cefd5cd157bbfa6a32a67a0c2d1`), with independently saved paired-price/first-release inputs `research/inputs/2026-11-07-settlement-sources.json`. 8 A macro, 5 B risk and 10 C market targets; Nov6 payroll first release +165k, unemployment 4.1%. PPI/CPI next week's target releases not yet occurred.
- **Brier scores, Nov7 settlement:** A llm 0.20040 / stat 0.193813 / hybrid 0.192013 (hybrid nominal +0.9% skill vs numerical); B llm 0.23298 / stat 0.300525 / hybrid 0.245773 (B is deterministically derived from C, WTI provisional); C llm 0.24517 / stat 0.250183 / hybrid 0.243091. Group C 80% coverage 7/10, 6/10, 7/10. C nine percentage-return instrument MAE 5.2923, 5.4968, 5.4184 percentage points; ten-year yield point errors scored separately in basis points. These are not 23 independent predictive wins and are not a calibration claim.
- **Cumulative sample:** A 7+8=15 outcomes per arm, C 10+10=20 outcomes per arm. Group B Oct24 5 targets are an *after-noon supplement* of incomplete three-arm comparability; Nov7 B five outcomes fully three-arm but WTI underlying provisional.
- **Source caveats:** Nov6 WTI continuous quote USD90.34 differs from Reuters December WTI contract settlement USD90.83; Oct30 archive WTI USD102.95 was *opening* price, corrected matched settlement October30 USD104.12. USDJPY vendor close ambiguity. Nikkei official Friday close 57,434.77, KOSPI 5,059.69. For S&P, Yahoo confirms Nov6 7,376.86 (Nov5 7,353.73; date confusion corrected), vendor snapshot says 7,376.92. Append-only source amendments `research/weekly/2026-11-07-provenance-amendment01.json` and `-amendment02.json` protect original forecast from accidental edits.
- **Frozen new prospective 2026-11-13 forecasts:** `research/weekly/2026-11-07-forecast.json`, published after scheduled Saturday noon (real Git commit `498a7ffcdb5997cb7a4694290284b3b3267fa439`), source snapshot `research/inputs/2026-11-07-1200-snapshot.json`, deterministic replay generator `research/scripts/generate_2026_11_07.js`, seed 20261107, 20,000 simulation draws. A 7 targets, B 5 and C 10 including SP500, NDX100, STOXX600, Nikkei, KOSPI, CSI300, gold, WTI, USDJPY and US10Y. Explicit conditional 50/80/90 ranges for each arm; all model probabilities uncalibrated. Scenario shocks are assumptions, not fitted causal effects.
- **Reproducibility:** `research/scripts/score_2026_11_07.py` checks prior-forecast IDs and exact Brier/point/interval scores, and `.github/workflows/tests.yml` independently replays Nov7 forward Monte Carlo byte-for-byte and prior scored outcomes on Python 3.10/3.12. CI run 42333193643 successful. Source URL accuracy requires manual audit; replay alone cannot establish it.
- **Deferred/omitted:** Chinese October CPI expected Nov9 but official prior first-release level cannot be independently established, no numerical fill. US Nov11 Veterans Day can affect Treasury market settlement, no event forecast silently fabricated. No major scheduled rate decision from Fed/BoE/RBA confirmed for Nov9–13.
- **New model judgment:** The first two weeks have high return volatility and poor directional market Brier (~0.25). Ex ante assumed Gaussian vols and independent events are stressed and their 80% coverage failures are material; preserve model failures in next week's evaluation rather than backfit them to this single week.


## 2026-11-07 evening: after-publication independent data audit (NOT the noon forecast)

- Daily research record: `research/daily/2026-11-07.json`, source cutoff approximately 19:33 JST, official BLS CPI baseline and November 6 Employment Situation checked against dated first releases. Payrolls +165k, unemployment 4.1%, wage +0.4% MoM; Sep payroll revised to +60k from original +29k, Aug/Sep combined upward revision +84k. Prior Sept headline CPI 3.7% YoY, core 2.6%, gasoline +9.1% MoM; next Oct CPI November 10 and PPI November 13 at 08:30 EST. UST official 10Y November 6 = 4.86%. **Do not incorporate this evening analysis into the already archived noon information set, and do not alter Nov7 frozen probabilities or points.**
- Historical (Oct30-to-Nov6) market-source sensitivity experiment: `research/experiments/2026-11-07-paired-provider-price-sensitivity.json`. Inputs `research/inputs/2026-11-07-vendor-sensitivity.json`, executable deterministic code `research/scripts/audit_2026_11_07_vendor_sensitivity.py` (commit `316f2101263d`), CI run `42364139932` passed Python 3.10 and 3.12. No model refit and no new Monte Carlo simulation in evening run.
- **USDJPY vendor-date reconciliation:** investing.co.jp Oct30 157.55 -> Nov6 158.48 (+0.59029%); Yahoo Japan separately Oct30 157.53 -> Nov6 158.45 (+0.58402%). Weekly return difference only **0.00627 percentage points**. Older speculative Yahoo Nov6 ~157.498 is not confirmed as Nov6 end-of-day closing; previous ~1 yen source-conflict warning should not be treated as established. Exact provider session cutoffs still differ.
- **WTI remains unverified fixed-contract:** Reuters' WTI futures settlement Oct30 USD104.12 -> Nov6 USD90.83 implies **-12.76412%**, versus original continuous-historical quote Nov6 USD90.34 implying **-13.23473%**. Sensitivity **+0.47061 percentage points**, with NO proof from the retrieved news that both reports identify exactly the same Dec26 NYMEX fixed contract. Treat Reuters result as a conditional source scenario and keep WTI C/B provisional.
- Across nine Group-C percentage-return instruments, replacing WTI and USDJPY with full alternate paired source scenarios changes MAE for each of the frozen three arms by **-0.05299 percentage points**; direction Brier and interval coverage labels unchanged. This is quote-sensitivity arithmetic, **not** retroactive improvement or newly verified forecast skill. The original Nov7 verification, its amended source notes, and all prior forecasts remain unchanged.
- A prospective test plan, `research/hypotheses/2026-11-07-1930-cross-market-tail-dependence.json`, compares scenario-dependent tail probability to independent-marginal-tail benchmark over 26 future weeks, after pre-registration of both models and as-of inputs. This is a low-confidence hypothesis only; Nov6 had four of six equities falling by at least 1.5%, and 80% intervals of every arm missed Nikkei, KOSPI, and WTI. Avoid interpreting correlated markets as independent samples.
- Next code/data priority: archived official CME fixed-contract settlement source+timestamps for WTI, rigorous first-print macro vintages and a stable same-vendor FX cutoff. Nov7's 22-target Nov13 forward forecast remains immutable.
