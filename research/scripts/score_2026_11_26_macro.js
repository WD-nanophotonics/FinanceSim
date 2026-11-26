"use strict";
// Deterministic Nov26 partial audit. No fit or new simulation.
const fs=require("node:fs");
function audit(frozen,obs,asof){
 const r=x=>Number(x.toFixed(8)), arms=frozen.arm_ids, targets={};
 const mean=x=>r(x.reduce((a,b)=>a+b,0)/x.length);
 for(const [id,o] of Object.entries(obs.macro)){
   const f=frozen.macro_forecasts[id];
   if(!f||f.reference_level!==o.reference||Date.parse(o.published_at)>Date.parse(asof)||Date.parse(o.published_at)!==Date.parse(f.target_at)||Date.parse(o.published_at)<=Date.parse(frozen.information_cutoff))throw Error("baseline or time mismatch: "+id);
   const delta=r(o.value-o.reference), revised=o.prior_revised===null?null:r(o.value-o.prior_revised), event=Number(delta>0), scores={};
   for(const m of arms){const a=f.arms[m], intervals={};let sum=0,weights=0;
     for(const p of [50,80,90]){const [lo,hi]=a["interval_"+p],alpha=1-p/100; if(lo>hi||a.prob_positive<0||a.prob_positive>1)throw Error("invalid frozen arm"); const is=(hi-lo)+2/alpha*(Math.max(lo-delta,0)+Math.max(delta-hi,0));intervals[p]={covered:lo<=delta&&delta<=hi,score:r(is)};sum+=alpha/2*is;weights+=alpha/2;}
     scores[m]={point_change:a.point_change,prob_positive:a.prob_positive,absolute_error:r(Math.abs(delta-a.point_change)),brier:r((a.prob_positive-event)**2),intervals,weighted_interval_only:r(sum/weights)};
   }
   targets[id]={unit:f.unit,actual_delta:delta,revised_reference_delta:revised,prior_revision:o.prior_revised===null?null:r(o.prior_revised-o.reference),event_positive:event,revision_changes_event:revised===null?null:Number(revised>0)!==event,scores};
 }
 const summary={};for(const m of arms){const rows=Object.values(targets), unitGroups={};for(const t of rows)(unitGroups[t.unit]??=[]).push(t.scores[m]);summary[m]={n:rows.length,mean_direction_brier:mean(rows.map(t=>t.scores[m].brier)),coverage_counts:Object.fromEntries([50,80,90].map(p=>[p,rows.filter(t=>t.scores[m].intervals[p].covered).length])),by_unit:Object.fromEntries(Object.entries(unitGroups).map(([u,v])=>[u,{n:v.length,mae:mean(v.map(a=>a.absolute_error)),mean_weighted_interval_only:mean(v.map(a=>a.weighted_interval_only))}]))};}
 const m=obs.market, p=(x,y)=>r(100*(x/y-1)),bp=(x,y)=>r(100*(x-y)), f=frozen.market_forecasts;
 const market={nikkei_daily_pct:p(m.nikkei.ohlc[3],m.nikkei.previous),nikkei_interim_week_pct:p(m.nikkei.ohlc[3],f.nikkei225.reference_level),sp500_interim_pct:p(m.sp500.value,f.sp500.reference_level),nasdaq100_interim_pct:p(m.nasdaq100.value,f.nasdaq100.reference_level),us10y_interim_bp:bp(m.us10y.value,f.us10y.reference_level),us10y_daily_bp:bp(m.us10y.value,m.us10y.previous),sp500_stale_fred_error_in_weekly_return_pp:r(p(m.fred.sp500.value,f.sp500.reference_level)-p(m.sp500.value,f.sp500.reference_level)),us10y_stale_fred_error_bp:bp(m.fred.us10y.value,m.us10y.value),sp500_fred_update_lag_hours:r((Date.parse(m.fred.sp500.updated_at)-Date.parse(m.fred.sp500.session_close))/3600000),nasdaq_fred_update_lag_hours:r((Date.parse(m.fred.nasdaq100.updated_at)-Date.parse(m.fred.nasdaq100.session_close))/3600000),complete_same_date_fred_panel:false};
 const c=obs.context; const features={gdp_private_demand_revision_pp:r(c.gdp_real_final_sales_private_domestic.second-c.gdp_real_final_sales_private_domestic.advance),gdp_purchase_price_revision_pp:r(c.gdp_domestic_purchases_price.second-c.gdp_domestic_purchases_price.advance),real_dpi_change_vs_first_pp:r(c.pce_real_dpi.oct-c.pce_real_dpi.sep_first),claims_nsa_change_minus_expected_seasonal:c.claims_nsa.weekly_change-c.claims_nsa.expected_seasonal_increase,continuing_claims_change_vs_first:c.claims_continuing.value-c.claims_continuing.prior_first,continuing_claims_change_vs_revised:c.claims_continuing.value-c.claims_continuing.prior_revised};
 if(Object.keys(targets).length!==8||targets.us_gdp_q3_second.actual_delta!==0.9||targets.us_claims_week_nov21.actual_delta!==-14||targets.us_pce_core_mom_oct.event_positive!==0||targets.us_real_pce_mom_oct.actual_delta!==0||targets.us_nominal_pce_mom_oct.revised_reference_delta!==-0.3||summary.statistical.mean_direction_brier!==0.25||arms.some(a=>targets.us_gdp_q3_second.scores[a].intervals[90].covered)||market.us10y_stale_fred_error_bp!==6)throw Error("numerical checkpoint failure");
 return {targets,summary,market,features};
}
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const record=read("research/daily/2026-11-26.json");
const actual=audit(read(record.frozen_forecast),record.observations,record.information_as_of_utc);
require("node:assert/strict").deepEqual(actual,record.output);
console.log(JSON.stringify(actual,null,2));
