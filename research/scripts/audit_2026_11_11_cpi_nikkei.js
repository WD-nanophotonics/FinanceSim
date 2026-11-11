// Reproduce the Nov11 CPI first-vintage score and Nikkei conditional horizon diagnostic.
// Model output is deterministic; no drawing, re-fitting or access to future settlements.
const fs=require("fs");
function audit(frozen, previous, input) {
 const r=x=>Math.round(x*1e8)/1e8;
 const cdf=x=>{let t=1/(1+.2316419*Math.abs(x));let tail=Math.exp(-.5*x*x)/Math.sqrt(2*Math.PI)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+1.330274429*t))));return x>=0?1-tail:tail;};
 const cp=frozen.macro_forecasts.us_cpi_mom_nov10;
 const nk=frozen.market_forecasts.nikkei225;
 const cutoff=Date.parse(frozen.forecast_cutoff), observedAt=Date.parse(input.nikkei.observed_at),access=Date.parse(input.accessed_at),releasedAt=Date.parse(input.us_cpi.first_release_at);
 if(!(cutoff<releasedAt&&releasedAt<=access&&cutoff<observedAt&&observedAt<=access)) throw Error("Unavailable data in as-of analysis");
 if(cp.baseline_level!==input.us_cpi.september_headline_mom_sa_first_pct)throw Error("CPI prior-first-release baseline mismatch");
 if(nk.baseline_level!==input.nikkei.reference_close||previous.market_baselines.nikkei225.reference!==nk.baseline_level)throw Error("Official Nikkei reference mismatch");
 const y=r(input.us_cpi.headline_mom_sa_pct-cp.baseline_level);
 const pScore=(arm)=>{
  const a=cp.arms[arm];
  const errors={};
  for(const c of [50,90]){const [lo,hi]=a["interval_"+c], alpha=1-c/100;
   errors["interval_"+c]={lower:lo,upper:hi,covered:(lo<=y&&y<=hi),interval_score_pp:r((hi-lo)+2/alpha*Math.max(0,lo-y,y-hi))};
  }
  return {model_id:a.model_id,point_level:a.center_level,point_change:a.point_change,observed_change:y,
   absolute_point_error_pp:r(Math.abs(a.point_change-y)),direction_actual_negative:true,
   frozen_p_increase:a.prob_positive,direction_brier:r(a.prob_positive*a.prob_positive),...errors};
 };
 const points=Object.fromEntries(["llm","statistical","hybrid"].map(name=>[name,pScore(name)]));
 const s=points.statistical.direction_brier;
 const ret=r(100*(input.nikkei.official_close/nk.baseline_level-1));
 const day=r(100*(input.nikkei.official_close/input.nikkei.close_2026_11_10-1));
 const sigmaWeek=previous.market_baselines.nikkei225.sigma;
 const nLeft=2;
 const sigmaLeft=sigmaWeek*Math.sqrt(nLeft/5);
 const conditional={};
 for(const arm of ["llm","statistical","hybrid"]){
  const upper=nk.arms[arm].interval_90[1];
  const closeBoundary=nk.baseline_level*(1+upper/100);
  const required=100*(closeBoundary/input.nikkei.official_close-1);
  conditional[arm]={
   frozen_upper_90_weekly_return_pct:upper,
   close_level_at_frozen_upper_90:r(closeBoundary),
   required_nov11_to_nov13_pct:r(required),
   assumed_conditional_probability_above_original_90_upper:r(1-cdf(required/sigmaLeft))
  };
 }
 const downClose=nk.baseline_level*(1-1.5/100);
 const neededDown=100*(downClose/input.nikkei.official_close-1);
 return {
  record_type:"deterministic_interim_first_vintage_score_and_horizon_stress",
  date:"2026-11-11",
  information_accessed_at:input.accessed_at,
  frozen_forecast_file:input.forecast_path,
  frozen_forecast_blob_sha:input.forecast_blob_sha,
  fixed_model_input_file:input.model_snapshot_path,
  fixed_model_input_blob_sha:input.model_snapshot_blob_sha,
  executable_model:"research/scripts/audit_2026_11_11_cpi_nikkei.js",
  experiment_type:"exact published outcome scoring + deterministic normal-CDF hypothetical conditional sensitivity",
  seed:null,
  simulations:0,
  frozen_forecasts_unchanged:true,
  cpi_first_release:{
   official_release_at:input.us_cpi.first_release_at,
   official_release_source:input.us_cpi.source_first_archive,
   sep_first_print_mom_pct:cp.baseline_level,
   oct_first_print_mom_pct:input.us_cpi.headline_mom_sa_pct,
   actual_change_vs_frozen_baseline_pp:y,
   first_print_core_mom_pct:input.us_cpi.core_mom_sa_pct,
   food_mom_pct:input.us_cpi.food_mom_sa_pct,
   energy_mom_pct:input.us_cpi.energy_mom_sa_pct,
   shelter_mom_pct:input.us_cpi.shelter_mom_sa_pct,
   model_scores:points,
   brier_skill_vs_statistical:{llm:r(1-points.llm.direction_brier/s),hybrid:r(1-points.hybrid.direction_brier/s)},
   score_interpretation:"One CPI target only. Baseline is original September first print, not a revised later September series. No inference about calibrated skill.",
   unscoreable_yoy_target_ids:["us_cpi_yoy_nov10","us_core_cpi_yoy_nov10"],
   unscoreable_yoy_cause:input.us_cpi.yoy_missing_reason,
   october_real_earnings_mom_sa_pct:input.other_indicators.us_real_hourly_earnings_mom_sa_pct
  },
  macro_target_accounting:{
   total_frozen_macro:Object.keys(frozen.macro_forecasts).length,
   officially_settled_this_research:["us_cpi_mom_nov10"],
   structural_no_official_release:["us_cpi_yoy_nov10","us_core_cpi_yoy_nov10"],
   awaiting_published_first_print:["us_ppi_yoy_nov13","us_ppi_mom_nov13","us_claims_nov12","dallas_wei_nov12"],
   note:"None of the market/market-risk Nov13 targets are settled as of Nov11."
  },
  nikkei_interim_market:{
   source:input.nikkei.source,
   first_frozen_week_reference_date:input.nikkei.reference_date,
   first_frozen_week_reference_close:input.nikkei.reference_close,
   asof_session_date:input.nikkei.observed_date,
   asof_session_official_close:input.nikkei.official_close,
   nov10_to_nov11_return_pct:day,
   nov06_to_nov11_return_pct:ret,
   fridays_target:"2026-11-13T15:30:00+09:00",
   remaining_cash_sessions:nLeft,
   assumed_zero_drift_independent_gaussian_sigma_week_pp:sigmaWeek,
   sigma_for_two_remaining_sessions_pp:r(sigmaLeft),
   frozen_90_interval_upper_diagnostics:conditional,
   week_down_1p5pct_end_price_threshold:r(downClose),
   required_nov11_to_nov13_return_to_week_down_1p5pct:r(neededDown),
   assumed_conditional_probability_week_down_1p5pct:r(cdf(neededDown/sigmaLeft)),
   diagnostic_warning:"Not a refreshed forecast; relies on zero-drift iid Gaussian remaining returns and 2/5 trading-time scaling. Frozen hybrid/LLM interval distributions are not themselves Gaussian, so the interval-cross probabilities are a Gaussian sensitivity benchmark only. Markets can jump and volatility can cluster."
  },
  interpretation:{
   cpi:"October all-items +0.4% vs September +0.6% means a -0.2 percentage-point change. LLM and hybrid assign less than 50% probability to an increase; simple zero-change gives 50%. All monthly scores are retrospective checks against unchanged Nov7 forecasts.",
   market:"Nikkei already positive from Nov6 to Nov11 but Friday target unresolved. Conditionally estimated tail probabilities describe a hypothetical uncalibrated model, not a live forecast or scored test.",
   hypotheses:"A single positive relative score for hybrid CPI provides no evidence of durable Q001/Q003 gain; both nonreported YoY fields expose avoidable target-eligibility failure, as identified before release on Nov10."
  },
  pending:"BLS Oct PPI Nov13 08:30 EST; DOL claims Nov12 08:30 EST; Dallas WEI posting scheduled Nov12; Nikkei Nov13 close and other markets remain future.",
  limitations:input.limitations
 };
}
if(require.main===module){
  const snapshot=JSON.parse(fs.readFileSync("research/inputs/2026-11-11-cpi-nikkei-first-release.json","utf8"));
  const frozen=JSON.parse(fs.readFileSync("research/weekly/2026-11-07-forecast.json","utf8"));
  const model=JSON.parse(fs.readFileSync("research/inputs/2026-11-07-1200-snapshot.json","utf8"));
  process.stdout.write(JSON.stringify(audit(frozen,model,snapshot),null,2)+"\n");
}
module.exports={audit};
