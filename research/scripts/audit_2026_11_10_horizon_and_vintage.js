// Exploratory Nov10 data-quality and Tuesday-close diagnostic (NOT a replacement forecast).
// Node 18+, no external modules, no new hidden market data or simulated outcomes.
// BLS October 2025 headline/core CPI levels are missing; 2026 October official YoY is unscoreable.
const fs = require('fs');

function cdf(x) {
  // Standard normal cdf Abramowitz-Stegun: maximum error about 7.5e-8.
  const t=1/(1+0.2316419*Math.abs(x));
  const polynomial=t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  const tail=0.3989422804014327*Math.exp(-0.5*x*x)*polynomial;
  return x>=0 ? 1-tail : tail;
}
function r(x){return Math.round(x*1e8)/1e8;}
function analyze(snapshot, frozen, primary) {
  const missing = snapshot.us_cpi_first_vintage_target_audit.unsupported_first_release_target_ids;
  const ids=Object.keys(frozen.macro_forecasts);
  if (missing.some(id=>!ids.includes(id))) throw Error('Missing CPI target is not in frozen seven-target forecast');
  const spend=snapshot.official_macro.jp_household_spending_sep2026;
  const price=snapshot.index_quotes.nikkei225;
  const ref=price.reference_close, observed=price.intermediate_tuesday_close;
  if (ref!==frozen.market_forecasts.nikkei225.baseline_level ||
      ref!==primary.market_baselines.nikkei225.reference) throw Error('Nikkei baseline differs');
  const weekly_to_tuesday = 100*(observed/ref-1);
  const required_from_tuesday = 100*(ref*0.985/observed-1);
  const n_assumed_trading_days=5, n_remaining_days=3;
  const sigma_week=primary.market_baselines.nikkei225.sigma;
  const sigma_rem=sigma_week*Math.sqrt(n_remaining_days/n_assumed_trading_days);
  const probabilities={};
  for(const mult of [1,1.5,2]){
    probabilities[String(mult)]={
      weekly_vol_multiplier:mult,
      assumed_remaining_3_session_std_percentage_points:r(sigma_rem*mult),
      conditional_probability_of_weekly_nikkei_drop_at_least_1p5_pct:r(cdf(required_from_tuesday/(sigma_rem*mult)))
    };
  }
  const original_cpi=frozen.macro_forecasts.us_cpi_mom_nov10.arms;
  const consensus=snapshot.pre_release_consensus.pre_release_oct2026_headline_cpi_mom_pct;
  return {
    record_type:'asof_target_validity_and_conditional_market_sensitivity',
    observation_date:'2026-11-10',
    experiment_type:'deterministic_arithmetic_plus_assumed_iid_Gaussian_remaining_sessions',
    input_path:'research/inputs/2026-11-10-vintage-and-market-snapshot.json',
    frozen_forecast_path:'research/weekly/2026-11-07-forecast.json',
    frozen_model_input_path:'research/inputs/2026-11-07-1200-snapshot.json',
    forecast_modified:false,
    simulation_seed:null,
    simulation_draws:0,
    no_forward_releases:true,
    macro_features:{
      japan_household_spending_first_release_2026_09_real_yoy_pct:spend.real_yoy_pct,
      august_latest_vintage_real_yoy_pct:spend.august_real_yoy_pct_current_page,
      change_in_yoy_rate_vs_aug_latest_vintage_percentage_points:r(spend.real_yoy_pct-spend.august_real_yoy_pct_current_page),
      september_real_mom_SA_pct:spend.real_mom_sa_pct,
      august_latest_vintage_real_mom_SA_pct:spend.august_real_mom_sa_pct_current_page,
      change_in_sa_mom_rate_pp:r(spend.real_mom_sa_pct-spend.august_real_mom_sa_pct_current_page),
      households_two_person_plus_spending_yen:spend.total_spending_yen,
      relevant_first_publication_day:'2026-11-10'
    },
    nikkei_midweek:{
      official_2026_11_06_close:ref,
      official_2026_11_09_close:price.intermediate_monday_close,
      official_2026_11_10_close:observed,
      nov09_pct_vs_nov06:r(100*(price.intermediate_monday_close/ref-1)),
      nov10_pct_vs_nov09:r(100*(observed/price.intermediate_monday_close-1)),
      nov10_pct_vs_nov06:r(weekly_to_tuesday),
      threshold_close_for_frozen_breadth_down_1p5_pct:r(ref*0.985),
      required_nov10_to_nov13_return_to_reach_threshold_pct:r(required_from_tuesday),
      model_assumption:'Independent Gaussian increments; mean zero remaining period; frozen statistical weekly sigma, three sessions left of five; no fitted intraday dynamics, jumps, autocorrelation or volatility clustering. Conditional risk is not a frozen forecast and is not empirically calibrated.',
      frozen_statistical_weekly_sigma_percentage_points:sigma_week,
      conditionally_assumed_risks:probabilities,
      note:'A large midweek rebound does not settle the Friday market target. This arithmetic is a threshold diagnostic, not a trading recommendation.'
    },
    validity_audit:{
      frozen_group_A_target_count:ids.length,
      anticipated_no_official_first_release_value:missing,
      anticipated_no_official_first_release_count:missing.length,
      potentially_scoreable_once_actual_release_observed:ids.filter(id=>!missing.includes(id)),
      potentially_scoreable_count:ids.length-missing.length,
      original_targets_retained:true,
      mandatory_weekly_treatment:'Report missing/structural-unscoreable with denominator 7 intact; no point error, Brier, interval coverage or private YoY nowcast as replacement. If BLS actually prints an official exact series contrary to prior notice, audit the original release and update status in a NEW append-only record.',
      basis:'BLS shutdown FAQ last modified 2026-09-16, before the Nov7 forecast freeze.'
    },
    october_CPI_prerelease_consensus_audit:{
      later_consensus_asof_2026_11_10_headline_mom_pct:consensus,
      frozen_forecast_center_mom_pct:Object.fromEntries(Object.entries(original_cpi).map(([k,a])=>[k,a.center_level])),
      frozen_forecast_minus_later_consensus_pp:Object.fromEntries(Object.entries(original_cpi).map(([k,a])=>[k,r(a.center_level-consensus)])),
      scoring_allowed:false,
      note:'Consensus published after forecast freeze and before official Nov10 release; no ex-ante Nov7 consensus established. No skill computed.'
    },
    quote_source_warning:'Investing.com CSI300 Nov10 several locale snapshots disagree; no numerical CSI300 feature or score entered.',
    publication_state:'US Nov10 08:30 EST October CPI report still FUTURE at source collection; UK Nov12 GDP, BOJ Nov12 CGPI and US Nov13 PPI also remain pending.',
    model_limitations:['Conditioning on a future Friday outcome after observing Tuesday requires an actual time-series model; here zero drift and iid sessions are assumed rather than learned.','Weekly sigma is scenario assumption, not a fitted empirical daily time-series volatility.','Household consumption is September reference period, reported November 10, and cannot establish causal response of Tuesday Nikkei.','October 2026 headline YoY 3.9% and core YoY 2.7% are analyst estimates only; not scoreable official data.']
  };
}
if (require.main === module) {
  const input=JSON.parse(fs.readFileSync('research/inputs/2026-11-10-vintage-and-market-snapshot.json','utf8'));
  const forecast=JSON.parse(fs.readFileSync('research/weekly/2026-11-07-forecast.json','utf8'));
  const primary=JSON.parse(fs.readFileSync('research/inputs/2026-11-07-1200-snapshot.json','utf8'));
  process.stdout.write(JSON.stringify(analyze(input,forecast,primary),null,2)+'\n');
}
module.exports={analyze};
