# FinanceSim living research memory — protocol v0.2

**Purpose:** Make the model a falsifiable world-model under continual revision, not a collection of persuasive post-hoc narratives. The repository is the durable memory, and each scheduled run must read the previous artifacts rather than relying on chat memory.

## Daily cycle (Asia/Tokyo; user receives no routine daily report)

1. **Read state:** load current model source, most recent saved research notes, active hypotheses, previous sealed forecasts, cumulative scores, and unresolved failures.
2. **Observe:** examine dated *as-of* macro series, official economic release calendars, central-bank communications, and relevant financial/microstructure developments. Cite primary public sources with original publication and access timestamps; never manufacture a news item, quote, statistical observation or source.
3. **Quantify:** convert specific evidence into features: surprise relative to consensus, percentage/basis-point change, event probability, volatility estimate, or a conditional scenario-impact assumption. Give units, reference periods, source, and estimated uncertainty. Distinguish measured facts from subjective assumptions.
4. **Simulate:** run existing baseline/time-series models and/or `simulate_scenarios` with recorded seed, parameters, origin information cutoff and code commit; distinguish real-data from synthetic-data tests.
5. **Reflect:** document disagreements with prior hypotheses, alternative explanations, what simulation ruled out, and what cannot yet be judged. New conclusions require evidence and an identifiable future test.
6. **Preserve:** create new files (do not overwrite archived records) under date-stamped paths; include links to any source/code and test records. Routine daily work should not notify the user.
7. **Revise:** improvements to scoring, data, and model code should be tested against prior baselines using as-of historical input. Prefer branch + PR for substantive modifications; CI checks before merge; record limitations. Do not auto-promote a plausible backtest to proven predictive skill.

## Git artifact layout

- `research/daily/YYYY-MM-DD.json`: dated observations, features, simulations, revisions (one as-of sealed record per artifact).
- `research/hypotheses/YYYY-MM-DD-HHMM-ID.json`: falsifiable hypothesis, confidence, evidence, disconfirmation criteria, status.
- `research/experiments/YYYY-MM-DD-HHMM-ID.json`: simulation/data cutoff, code commit, seeds, forecasts vs baseline results; *must* label synthetic data.
- `research/weekly/YYYY-MM-DD-forecast.json`: Saturday 12:00 JST three-arm, same-target forecasts sealed and pushed before the outcomes exist.
- `research/weekly/YYYY-MM-DD-verification.json`: next Saturday's realized values, revision/vintage choice, scoring and dated counterfactuals.
- `research/INDEX.md`: concise maintained map of active hypotheses, failed ideas and current model components; only this summary may be edited without creating a revision record.
- `financesim/`: executable models. `tests/`: executable regression and validation tests.

## Three independently scored arms

- `llm`: pure LLM forecast based on as-of information (no numeric model outputs).
- `statistical`: explicit baseline/time-series model or calibrated econometric model, reproducible code/parameters.
- `hybrid`: LLM reasoning informed by available statistical baselines and explicit scenario simulations.

Use **exactly the same target, unit, definition and observation window** for all three arms; no hindsight changes. For each target seal: `target_id`, `target_at` (ISO timestamp with timezone), `definition`, `unit`, and for each arm: `point_change`, `prob_positive`, `interval_change_80`, `rationale`, `model_id`.

`point_change` is a change in units fixed by the target's `definition` (e.g. simple percentage return in % points; 10Y yield change in basis points). For weekly official releases the metric must explicitly say whether change means delta vs prior release or surprise vs consensus. **Do not mix level forecasts and change forecasts** without defining conversions and baselines.

When no credible data is available, explicitly register non-scoreable omissions and why, outside the `predictions` list. Do not invent numerical values just to satisfy the validation contract.

## Weekly cycle, Saturday 12:00 JST

1. Validate all prior week's sealed predictions and independent verification sources, using first-vintage announcement values where appropriate. Mark unresolved/late releases as missing (never silently remove).
2. Score Brier/MAE/interval coverage **per target** and compare to frozen no-change/historical/consensus benchmarks. Cross-target MAE and interval scores cannot be averaged across different units. Report uncertainty from finite sample and correlated outcomes.
3. Produce next week's frozen quantitative three-arm forecasts. Use previously recorded daily evidence and simulation outputs, plus information available before Saturday cutoff. Store as new Git file with hash and commit.
4. Public report to user has precisely two sections: last week's evaluation and next week's predictions (include confidence levels and events).
5. Any new hypothesis and model revision stays separately versioned; scores for historical predictions never rewritten.

## Provenance and limits

The `financesim.research.seal` function checks structural validity, source time order, three arms, target horizons and builds a SHA-256 content hash. **The hash does not itself prove that the prediction existed at a certain time**; the publicly inspectable Git commit time, a timestamped release, and the absence of file rewrites are additional safeguards. The program does not authenticate the accuracy of source-supplied timestamps.

The `simulate_scenarios` layer takes independent probabilities and impact assumptions; it does not learn impacts or causal effects from news. Correlated macro event risks and feedback loops are not modeled yet. Confidence is therefore model-conditional, not empirically calibrated.

Daily research may fail to access live data due to external network/source/tool restrictions. Record what was actually retrieved, computed and committed; never imply that an unexecuted model has produced live predictions.

## Sample CLI

```bash
python -m financesim examples/request.json
python -m financesim examples/scenario_request.json
python -m financesim examples/research_seal_request.json -o draft_record.json
python -m unittest discover -s tests -v
```

The sample scenario parameters and research evidence are **fictional fixtures**. They must not be treated as investment forecasts, real events, or historical observations.
