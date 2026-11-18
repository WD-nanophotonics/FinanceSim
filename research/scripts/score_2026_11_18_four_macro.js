// Deterministic audit of frozen Nov14 three-arm forecasts versus Nov17/18 first releases.
// No model re-fitting, no Monte Carlo, no market outcomes after the information cutoff.
const fs=require('fs');
const frozen=JSON.parse(fs.readFileSync('research/weekly/2026-11-14-forecast-corrected-b01.json','utf8'));
const obs=JSON.parse(fs.readFileSync('research/inputs/2026-11-18-official-first-releases.json','utf8'));
const ids=['us_import_mom_nov17','us_export_mom_nov17','uk_cpi_yoy_nov18','uk_cpi_mom_nov18'];
const methods=['llm','statistical','hybrid'];
const round=x=>Math.round((x+Number.EPSILON)*1e6)/1e6;
function scoreTarget(id){
 const f=frozen.macro_forecasts[id],o=obs.frozen_targets_first_release[id];
 if(!f||!o||o.status!=='first_release')throw Error('Missing first release: '+id);
 if(Math.abs(f.baseline_level-o.prior_first_value)>1e-10)throw Error('First-vintage mismatch: '+id);
 if(Date.parse(o.published_at)>Date.parse(obs.as_of)||Date.parse(o.published_at)>Date.parse(f.target_at)+1000)throw Error('Release time invalid: '+id);
 const delta=round(o.value-f.baseline_level), actual=Number(delta>0), arms={};
 for(const method of methods){
  const a=f.arms[method],intervals={};
  for(const pct of [50,80,90]){
   const [lo,hi]=a['interval_'+pct];
   intervals['coverage_'+pct]=lo-1e-10<=delta&&delta<=hi+1e-10;
  }
  arms[method]={predicted_change:round(a.point_change),absolute_error:round(Math.abs(delta-a.point_change)),prob_positive:a.prob_positive,brier:round((a.prob_positive-actual)**2),...intervals};
 }
 return {group:'A',target_id:id,unit:f.unit,first_release_value:o.value,prior_first_value:o.prior_first_value,observed_change:delta,realized_positive:actual,published_at:o.published_at,source:o.source,arms};
}
const targets=Object.fromEntries(ids.map(id=>[id,scoreTarget(id)])),summary={};
for(const method of methods){
 const m=ids.map(id=>targets[id].arms[method]);
 summary[method]={n:m.length,mae_change_pp:round(m.reduce((s,r)=>s+r.absolute_error,0)/m.length),mean_brier:round(m.reduce((s,r)=>s+r.brier,0)/m.length),coverage_50_count:m.filter(x=>x.coverage_50).length,coverage_80_count:m.filter(x=>x.coverage_80).length,coverage_90_count:m.filter(x=>x.coverage_90).length};
}
const n=obs.market.nikkei225;
const changes={nov17_to_nov18_pct:round(100*(n.closes['2026-11-18']/n.closes['2026-11-17']-1)),frozen_nov13_to_nov18_pct:round(100*(n.closes['2026-11-18']/n.closes['2026-11-13']-1))};
const p=obs.context.uk_ppi,b=obs.context.us_mxp;
const features={
 uk_ppi_input_yoy_change_vs_sep_first_pp:round(p.oct_input_yoy-p.sep_first_input_yoy),
 uk_ppi_output_yoy_change_vs_sep_first_pp:round(p.oct_output_yoy-p.sep_first_output_yoy),
 uk_ppi_output_yoy_change_vs_sep_revised_pp:round(p.oct_output_yoy-p.sep_current_revised_output_yoy),
 uk_ppi_input_minus_output_yoy_oct_pp:round(p.oct_input_yoy-p.oct_output_yoy),
 uk_ppi_first_vintage_gap_change_pp:round((p.oct_input_yoy-p.oct_output_yoy)-(p.sep_first_input_yoy-p.sep_first_output_yoy)),
 us_sep_export_revision_pp:round(b.sep_export_revised_mom-b.sep_export_first_mom),
 us_oct_import_minus_export_mom_pp:round(b.oct_import_mom-b.oct_export_mom),
 us_oct_nonfuel_minus_fuel_import_mom_pp:round(b.oct_nonfuel_import_mom-b.oct_fuel_import_mom),...changes
};
const result={record_type:'FinanceSim_2026_11_18_partial_first_release_verification',
 information_as_of:obs.as_of,original_head:obs.original_head,
 forecast_file:'research/weekly/2026-11-14-forecast-corrected-b01.json',
 frozen_model_source_commit:frozen.model_source_commit,frozen_seed:frozen.seed,
 input_file:'research/inputs/2026-11-18-official-first-releases.json',
 score_policy:'Only Nov17/18 first-published four macro targets; value minus prior first release; direction strictly delta>0; per-target Brier and intervals; no joint C/B scoring until Friday.',
 actuals:targets,summary,measured_context_features:features,
 execution:'Deterministic Node.js scoring of archived three-arm forecast; NO new model fit, NO stochastic draw, NO market backtest.',
 remaining_frozen_macro_targets:['us_claims_nov19','dallas_wei_nov19'],
 limitations:['Only four released correlated price-index targets; not a weekly or lifetime model ranking.',
 'First-vintage September US export 2.2% and later revised 2.4% are distinct; frozen baseline remains 2.2%.',
 'US October import change is exactly 0.0pp; positive-direction event is false even while the level is +1.1% MoM.',
 'UK PPI is context and was not registered as a Nov14 prediction target; ONS PPI is provisional.',
 'UK CPI issued 16:00 JST after Tokyo Nov18 cash close; Nikkei close cannot incorporate that UK public release.',
 'Prior weekly market closes and unmatched fixed-contract WTI settlements remain unverified where noted; no future Friday closes used.',
 'Multiple targets share macro shocks and units; four scores cannot establish calibrated forecasting skill.']};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
