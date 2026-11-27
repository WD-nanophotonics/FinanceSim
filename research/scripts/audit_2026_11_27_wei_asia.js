"use strict";
function audit(f,prev,o,asof){
 const r=x=>Number(x.toFixed(8)), mean=a=>r(a.reduce((s,x)=>s+x,0)/a.length), pct=(x,y)=>r(100*(x/y-1)), hours=(a,b)=>r((Date.parse(a)-Date.parse(b))/3600000);
 function scores(t,d){return Object.fromEntries(f.arm_ids.map(k=>{const a=t.arms[k],ints={};let sum=0,w=0;for(const p of [50,80,90]){const [lo,hi]=a["interval_"+p],alpha=1-p/100,is=hi-lo+2/alpha*(Math.max(lo-d,0)+Math.max(d-hi,0));ints[p]={covered:lo<=d&&d<=hi,score:r(is)};sum+=alpha/2*is;w+=alpha/2;}return[k,{absolute_error:r(Math.abs(d-a.point_change)),brier:r((a.prob_positive-Number(d>0))**2),intervals:ints,weighted_interval_only:r(sum/w)}]}));}
 const t=f.macro_forecasts.dallas_wei_week_nov21,w=o.wei;
 if(t.reference_level!==w.previous_first||w.date<=f.information_cutoff.slice(0,10)||w.date>asof.slice(0,10))throw Error("WEI baseline/time");
 const delta=r(w.value-w.previous_first),rd=r(w.value-w.previous_revised),ws=scores(t,delta);
 const macro={actual_delta:delta,revised_delta:rd,prior_revision:r(w.previous_revised-w.previous_first),early_release_calendar_days:1,exact_time_verified:false,scores:ws,summary_nine:{}};
 const prior=Object.values(prev.output.targets);
 if(prior.length!==8)throw Error("prior cohort mismatch");
 for(const a of f.arm_ids){const rows=[...prior.map(x=>x.scores[a]),ws[a]];macro.summary_nine[a]={n:rows.length,brier:mean(rows.map(x=>x.brier)),coverage:Object.fromEntries([50,80,90].map(p=>[p,rows.filter(x=>x.intervals[p].covered).length]))};}
 const markets={};for(const [id,m] of Object.entries(o.markets)){const t=f.market_forecasts[id];if(t.reference_level!==m.reference||t.source!==m.url||t.target_date!==m.date||Date.parse(m.observed_at)>Date.parse(asof))throw Error("market baseline/time mismatch "+id);const d=pct(m.value,m.reference);markets[id]={weekly_return:d,daily_return:pct(m.value,m.prior),status:m.status,scores:scores(t,d)};}
 const known=Object.values(markets).filter(x=>!x.status.startsWith("provisional")), down=known.filter(x=>x.weekly_return<=-1.5).length;
 const thresholds={};for(const id of ["sp500","nasdaq100","stoxx600"])thresholds[id]=r(f.market_forecasts[id].reference_level*.985);
 const c=o.cpi,cal=o.calendar;
 const output={macro,markets,breadth:{verified_count:known.length,verified_down:down,strict_final_count_range:[down,down+6-known.length],conditional_if_csi_final_confirmed_count_range:[0,3],conditional_event_requires_all_remaining_three:true,remaining_weekly_minus_1_5_close_thresholds:thresholds,event_status:"pending"},cpi:{yoy_change_vs_current_vintage:c.headline_core_exenergy_yoy.map((x,i)=>r(x-c.previous_current_vintage_yoy[i])),headline_change_vs_secondary_first:r(c.headline_core_exenergy_yoy[0]-c.previous_first_headline_secondary),core_consensus_surprise_secondary:r(c.headline_core_exenergy_yoy[1]-c.consensus_core_secondary),core_minus_exenergy_gap:r(c.headline_core_exenergy_yoy[1]-c.headline_core_exenergy_yoy[2])},source_readiness:{fred_same_date_complete:false,fred_latest_dates:Object.fromEntries(Object.entries(o.fred).map(([k,v])=>[k,v.last_date])),dgs10_stale_difference_bp:r(100*(o.fred.us10y.value-o.treasury.value)),equity_close_to_cutoff_h:hours(cal.cutoff,cal.equity_close),bond_recommendation_to_cutoff_h:hours(cal.cutoff,cal.bond_recommended_close),treasury_typical_observation_to_cutoff_h:hours(cal.cutoff,cal.treasury_typical_observation),treasury_typical_publication_to_cutoff_h:hours(cal.cutoff,cal.treasury_typical_available),all_friday_us_closes_in_future:Date.parse(asof)<Date.parse(cal.equity_close),launch_ready:false}};
 if(delta!==.18||rd!==.13||macro.summary_nine.statistical.brier!==.25||known.length!==2||down!==0||Object.values(markets).some(m=>m.weekly_return<=0)||output.source_readiness.dgs10_stale_difference_bp!==6||output.source_readiness.treasury_typical_publication_to_cutoff_h!==4||!output.source_readiness.all_friday_us_closes_in_future)throw Error("checkpoint failed");
 return output;
}
const fs=require("node:fs"),read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const rec=read("research/daily/2026-11-27.json");
const actual=audit(read(rec.frozen_forecast),read(rec.previous_daily),rec.observations,rec.information_as_of);
require("node:assert/strict").deepEqual(actual,rec.output);
console.log(JSON.stringify(actual,null,2));
