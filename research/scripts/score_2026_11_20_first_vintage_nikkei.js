// Daily Nov20 2026. Frozen three-arm first-vintage scoring only: NO model fit or new Monte Carlo.
const fs=require('fs');
const frozen=JSON.parse(fs.readFileSync('research/weekly/2026-11-14-forecast-corrected-b01.json','utf8'));
const input=JSON.parse(fs.readFileSync('research/inputs/2026-11-20-official-asof.json','utf8'));
const previous=JSON.parse(fs.readFileSync('research/experiments/2026-11-18-four-macro-first-release-score.json','utf8'));
const prevInput=JSON.parse(fs.readFileSync('research/inputs/2026-11-18-official-first-releases.json','utf8'));
function compute(f,o,previous,prevInput){
 const assert=(v,m)=>{if(!v)throw Error(m)},round=(x,n=6)=>Number(x.toFixed(n)),arms=["llm","statistical","hybrid"];
 assert(f.seed===20261114 && o.frozen_seed===20261114,"frozen seed drift");
 const ids=["us_import_mom_nov17","us_export_mom_nov17","uk_cpi_yoy_nov18","uk_cpi_mom_nov18","us_claims_nov19","dallas_wei_nov19"],results={},summary={};
 for(const id of ids){
  const ff=f.macro_forecasts[id], old=prevInput.frozen_targets_first_release[id],newer=o.official_new_releases[id];
  assert(!!ff && !!(old||newer),"missing original frozen target or observation "+id);
  const x=old?old.value:newer.first_release_value,ref=old?old.prior_first_value:newer.prior_first_release_value;
  assert(Math.abs(ref-ff.baseline_level)<1e-9,"as-of vintage mismatch "+id);
  const delta=round(x-ref),y=Number(delta>0),row={first_release_value:x,prior_first_release_value:ref,delta,positive_event:y,unit:ff.unit,arms:{}};
  for(const a of arms){const pred=ff.arms[a],p=pred.prob_positive,sc={point_change:pred.point_change,absolute_error:round(Math.abs(delta-pred.point_change)),prob_positive:p,brier:round((p-y)**2)};for(const pct of [50,80,90]){const [lo,hi]=pred["interval_"+pct];sc["coverage_"+pct]=delta>=lo-1e-9 && delta<=hi+1e-9}row.arms[a]=sc;}
  if(old){assert(delta===previous.actuals[id].observed_change,"prior first vintage delta changed "+id);for(const a of arms)assert(Math.abs(row.arms[a].brier-previous.actuals[id].arms[a].brier)<1e-8,"previous score regression "+id+a);}
  results[id]=row;
 }
 for(const a of arms){const list=ids.map(id=>results[id].arms[a]);summary[a]={target_count:6,mean_direction_brier:round(list.reduce((v,x)=>v+x.brier,0)/6),coverage_50_count:list.filter(x=>x.coverage_50).length,coverage_80_count:list.filter(x=>x.coverage_80).length,coverage_90_count:list.filter(x=>x.coverage_90).length,mae_first_four_price_change_pp:round(list.slice(0,4).reduce((v,x)=>v+x.absolute_error,0)/4),us_claims_absolute_error_thousands:list[4].absolute_error,wei_absolute_error_index_points:list[5].absolute_error};assert(Math.abs(summary[a].mae_first_four_price_change_pp-previous.summary[a].mae_change_pp)<1e-8,"prior mean MAE regression "+a);}
 const wei=o.official_new_releases.dallas_wei_nov19,cl=o.official_new_releases.us_claims_nov19,c=o.new_context.japan_oct_cpi,n=o.new_context.nikkei,ff=f.market_forecasts.nikkei225;
 assert(ff.baseline_level===n.prior_friday_close&&ff.target_date===n.session_date,"Nikkei source or target drift");assert(round(n.prior_day_close-n.final_close,2)===n.reported_day_fall_points,"Nikkei day fall mismatch");assert(n.issuer_constituents_advancing+n.issuer_constituents_declining+n.issuer_constituents_flat===225,"Nikkei count mismatch");
 const weekly=round(100*(n.final_close/n.prior_friday_close-1)),daily=round(100*(n.final_close/n.prior_day_close-1)),marketArms={};
 for(const a of arms){const pred=ff.arms[a],p=pred.prob_positive;const row={frozen_point_return_pct:pred.point_change,absolute_error_pct_points:round(Math.abs(weekly-pred.point_change)),prob_positive:p,direction_brier:round(p*p)};for(const pct of [50,80,90]){const [lo,hi]=pred["interval_"+pct];row["coverage_"+pct]=weekly>=lo && weekly<=hi}marketArms[a]=row;}
 const weifirst=round(wei.first_release_value-wei.prior_first_release_value),weirevised=round(wei.first_release_value-wei.prior_latest_revised_value);
 assert(weifirst===-0.11 && weirevised===0.26,"WEI vintage sign-reversal regression");
 return {record_type:"FinanceSim_2026_11_20_deterministic_partial_week_seal_and_vintage_audit",information_as_of:o.information_as_of,original_repo_head:o.original_repo_head,forecast_source:o.frozen_forecast,source_input:"research/inputs/2026-11-20-official-asof.json",model_source_commit:o.frozen_model_source_commit,original_seed:o.frozen_seed,new_seed:null,new_monte_carlo_draws:0,
 execution:"ACTUALLY EXECUTED deterministic frozen-record scoring; 6 first-vintage A releases and issuer-confirmed Nikkei C close; no new Monte Carlo, no live rerun of simulation, no fit.",
 macro_first_vintage_actuals:results,macro_summary:summary,
 nikkei_realized:{friday_reference:n.prior_friday_close,friday_close:n.final_close,one_day_return_pct:daily,weekly_return_pct:weekly,arms:marketArms,issuer_constituents_declining_fraction:round(n.issuer_constituents_declining/225),tech_sector_share_of_net_fall:round(-n.tech_sector_contribution_points/n.reported_day_fall_points),tech_plus_info_share_of_net_fall:round(-(n.tech_sector_contribution_points+n.info_comm_sector_contribution_points)/n.reported_day_fall_points)},
 vintage_disagreement:{claims_change_first_to_first_thousands:round(cl.first_release_value-cl.prior_first_release_value),claims_current_release_change_vs_revised_thousands:round(cl.first_release_value-cl.prior_latest_revised_value),claims_prior_revision_thousands:round(cl.prior_latest_revised_value-cl.prior_first_release_value),wei_change_first_to_first_index_points:weifirst,wei_current_release_change_vs_revised_index_points:weirevised,wei_prior_revision_index_points:round(wei.prior_latest_revised_value-wei.prior_first_release_value),wei_direction_flips_if_revised_baseline_used:(weifirst>0)!==(weirevised>0)},
 japan_cpi_yoy_first_vintage_context:{oct_headline:c.headline_yoy_pct,oct_ex_fresh:c.ex_fresh_yoy_pct,oct_ex_fresh_energy:c.ex_fresh_and_energy_yoy_pct,change_vs_sep_first_headline_pp:round(c.headline_yoy_pct-c.prior_sep_first_headline_yoy_pct),change_vs_sep_first_ex_fresh_pp:round(c.ex_fresh_yoy_pct-c.prior_sep_first_ex_fresh_yoy_pct),change_vs_sep_first_ex_fresh_energy_pp:round(c.ex_fresh_and_energy_yoy_pct-c.prior_sep_first_ex_fresh_and_energy_yoy_pct),not_scored:true},
 unsettled:o.unavailable_at_cutoff,
 limitations:["Brier is dimensionless but six first-released macro outcomes are correlated and too few for meaningful winner selection.","Price-change, claim-count and WEI-point MAE use different units and MUST NOT be pooled.","Dallas Fed exact November 19 release clock and Japanese CPI exact November 20 release clock were not independently verified.","Nikkei Friday market is complete; U.S./Europe Friday markets have not closed. No synthetic placeholder prices, no cross-market breadth score.","Original Nov14 probability and intervals remain unchanged. Earlier four macro outcomes and scores are regression-checked.","Nikkei 95% constituent declines and large tech-sector net contribution are descriptives, not proof of causal attribution."]};
}
process.stdout.write(JSON.stringify(compute(frozen,input,previous,prevInput),null,2)+'\n');
