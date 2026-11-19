// As-of November 19, 2026. Frozen Nov14 model conditional audit. No model fit or forward forecast.
const fs = require("fs");
const input=JSON.parse(fs.readFileSync("research/inputs/2026-11-19-official-and-breadth-asof.json","utf8"));
const snapshot=JSON.parse(fs.readFileSync("research/inputs/2026-11-14-1200-snapshot.json","utf8"));
const frozen=JSON.parse(fs.readFileSync("research/weekly/2026-11-14-forecast-corrected-b01.json","utf8"));
function audit(inp,snap,frozen) {
 const round=x=>Number(x.toFixed(8));
 const cdf=z=>{const x=Math.abs(z),t=1/(1+.2316419*x),d=.3989422804014327*Math.exp(-x*x/2);const q=d*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return z>=0?1-q:q};
 if(snap.seed!==20261114||frozen.seed!==20261114||snap.events.length!==5)throw Error("Frozen model mismatch");
 const m=snap.market.nikkei225,labels=["2026-11-13","2026-11-16","2026-11-17","2026-11-18","2026-11-19"];
 const levels=labels.map(d=>inp.nikkei.closes[d]);
 if(Math.abs(m.base-levels[0])>1e-7)throw Error("Baseline index disagreement");
 const daily=levels.slice(1).map((v,k)=>100*(v/levels[k]-1));
 if(Math.abs(levels[4]-levels[3]-inp.market_breadth.nikkei_net_gain_points)>1e-6)throw Error("Index day change disagreement");
 if(Date.parse(inp.as_of)>=Date.parse(inp.pending.us_claims.target)||Date.parse(inp.as_of)>=Date.parse(inp.pending.dallas_wei.nominal_target))throw Error("Unreleased macro data");
 const states=[];
 for(let mask=0;mask<32;mask++){let p=1,mu=m.hybrid;for(let j=0;j<5;j++){const e=snap.events[j],z=(mask>>j)&1;p*=z?e.p:(1-e.p);mu+=(z-e.p)*(e.effects.nikkei225||0)}states.push({p,mu})}
 if(Math.abs(states.reduce((a,b)=>a+b.p,0)-1)>1e-10)throw Error("Invalid shock probabilities");
 function conditional(n,scale,limit,bayes){
  const d=m.sigma*scale/Math.sqrt(5),rest=m.sigma*scale*Math.sqrt((5-n)/5);
  const logs=states.map(s=>Math.log(s.p)-daily.slice(0,n).reduce((v,r)=>v+(r-s.mu/5)**2,0)/(2*d*d));
  const mx=Math.max(...logs),weights=logs.map(v=>Math.exp(v-mx)),total=weights.reduce((a,b)=>a+b,0);
  const threshold=100*((1+limit/100)/(levels[n]/levels[0])-1);
  return {p:states.reduce((v,s,k)=>v+(bayes?weights[k]/total:s.p)*cdf((threshold-s.mu*(5-n)/5)/rest),0),threshold};
 }
 const regression=conditional(2,1,-1.5,true).p;
 if(Math.abs(regression-0.79211623)>1e-5)throw Error("Nov17 checkpoint mismatch: "+regression);
 const risks={};
 for(const scale of [.75,1,1.5,2]){
  const current=conditional(4,scale,-1.5,true),fixed=conditional(4,scale,-1.5,false),zero=conditional(4,scale,0,true);
  risks[String(scale)]={p_week_le_minus1_5:round(current.p),p_no_reweight:round(fixed.p),latent_reweight_effect_pp:round(100*(current.p-fixed.p)),p_week_positive:round(1-zero.p),required_friday_pct_for_week_minus1_5:round(current.threshold)};
 }
 const a=inp.japan_trade,b=inp.market_breadth,top=Object.values(b.nikkei_index_positive_points),delta=levels[4]-levels[3];
 if(b.prime_advanced+b.prime_declined+b.prime_unchanged!==1545)throw Error("Incorrect breadth universe");
 const trade={exports_nominal_yoy_pct:a.exports_nominal_yoy_pct,exports_volume_yoy_pct:a.exports_volume_yoy_pct,imports_nominal_yoy_pct:a.imports_nominal_yoy_pct,imports_volume_yoy_pct:a.imports_volume_yoy_pct,export_nominal_minus_volume_pp:round(a.exports_nominal_yoy_pct-a.exports_volume_yoy_pct),import_nominal_minus_volume_pp:round(a.imports_nominal_yoy_pct-a.imports_volume_yoy_pct),arithmetic_export_implicit_unit_value_yoy_pct:round(100*((1+a.exports_nominal_yoy_pct/100)/(1+a.exports_volume_yoy_pct/100)-1)),arithmetic_import_implicit_unit_value_yoy_pct:round(100*((1+a.imports_nominal_yoy_pct/100)/(1+a.imports_volume_yoy_pct/100)-1)),customs_fx_yen_depreciation_yoy_pct:round(100*(a.customs_fx_oct26_jpy_per_dollar/a.customs_fx_oct25_jpy_per_dollar-1)),unadjusted_trade_balance_100million_jpy:a.trade_balance_unadjusted_100million_jpy,seasonally_adjusted_trade_balance_100million_jpy:a.trade_balance_seasonally_adjusted_100million_jpy,crude_oil_import_growth_contribution_pp:a.crude_oil_import_growth_contribution_pp,semiconductor_export_growth_contribution_pp:a.semiconductor_component_export_growth_contribution_pp};
 const breadth={nikkei_day_change_pct:round(daily[3]),nikkei_day_gain_points:round(delta),topix_day_change_pct:round(100*b.topix_change_points/(b.topix_close-b.topix_change_points)),tse_prime_rising:b.prime_advanced,tse_prime_falling:b.prime_declined,tse_prime_unchanged:b.prime_unchanged,advance_fraction_nonflat:round(b.prime_advanced/(b.prime_advanced+b.prime_declined)),advance_minus_decline_count:b.prime_advanced-b.prime_declined,top_two_contributions_points:round(top[0]+top[1]),top_two_share_of_net_gain:round((top[0]+top[1])/delta),top_five_contributions_points:round(top.reduce((x,y)=>x+y,0)),top_five_share_of_net_gain:round(top.reduce((x,y)=>x+y,0)/delta)};
 return {record_type:"nov19_frozen_model_asof_post_thursday_conditional_trade_breadth_audit",information_as_of:inp.as_of,original_repository_head:inp.original_head,
   frozen_model_commit:snap.model_source_commit,frozen_model_seed:snap.seed,new_random_seed:null,new_monte_carlo_draws:0,scenario_states:32,
   frozen_forecast:"research/weekly/2026-11-14-forecast-corrected-b01.json",frozen_snapshot:"research/inputs/2026-11-14-1200-snapshot.json",source_input:"research/inputs/2026-11-19-official-and-breadth-asof.json",
   actual_execution:"Exact 32 Bernoulli-state summation, Gaussian conditional density and CDF approximation; independently assumed 5 daily Gaussian innovations/equal weekly shock split; no fitted parameters; all probability updates are after observed closes.",
   nikkei_closes:inp.nikkei.closes,daily_index_returns_pct:Object.fromEntries(labels.slice(1).map((v,k)=>[v,round(daily[k])])),nov13_to_nov19_pct:round(100*(levels[4]/levels[0]-1)),
   nov17_regression_replay:round(regression),conditional_risks:risks,trade_first_release_date:"2026-11-18",trade_features:trade,breadth_features:breadth,
   pending_at_asof:inp.pending,limitations:["October Japan trade was first released November 18; exact clock time not verified.","Arithmetic nominal/volume implicit values are not official deflators; commodity weights, composition and yen exchange rates matter.","Stock-breadth and top-contribution figures are secondary Kabutan reports; shares are of NET Nikkei gain and not gross total positive stock contributions.","Nikkei is price-weighted, TOPIX capitalization-weighted, Prime-wide issue breadth broader than Nikkei constituents.","Conditional probabilities use already-observed Monday-Thursday Nikkei closes, cannot count as Saturday-Nov14 prospective scores or evidence of model skill.","Independent Gaussian daily innovations and equal distributed event impacts are assumed, not calibrated; sigma choice materially changes outcomes.","US jobless claims and WEI and Friday endpoints were in the future as of cutoff; no scoring of them.","WTI same-contract price/vendor provenance unresolved."]};
}
process.stdout.write(JSON.stringify(audit(input,snapshot,frozen),null,2)+"\n");
