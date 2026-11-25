"use strict";
const fs=require("node:fs");
function audit(raw,frozen,prev,s) {
 const ids=["sp500","nasdaq100","us10y"];
 const original=[raw.series.sp500,raw.series.nasdaq100,raw.series.us10y_fred];
 const rate={...original[2]};
 const add=prev.fred_append_observation;
 if(add.date!=="2026-11-20"||add.value!==4.92||Object.hasOwn(rate,add.date))throw Error("previous append mismatch");
 rate[add.date]=add.value;
 const series=[original[0],original[1],rate];
 const grid=[];
 for(let d=new Date("2016-11-21T00:00:00Z");d<=new Date("2026-11-20T00:00:00Z");d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()!==0&&d.getUTCDay()!==6)grid.push(d.toISOString().slice(0,10));
 if(grid.length!==2610||Object.keys(rate).length!==2500)throw Error("historical checkpoint");
 const window=grid.slice(-1250);
 const masks=(ss)=>window.map(d=>ss.map(x=>Object.hasOwn(x,d)));
 const blocks=(ms,target)=>{let n=0;for(let i=0;i+5<=ms.length;i++)if(target.every((row,t)=>row.every((required,j)=>!required||ms[i+t][j])))n++;return n;};
 const all=Array.from({length:5},()=>[true,true,true]), holiday=all.map((v,i)=>i===3?[false,false,false]:v);
 const old=masks(original),fresh=masks(series);
 const comparisons={};
 for(let i=0;i<3;i++){
  const k=ids[i], obs=s.fred[k], common=Object.entries(obs.values).filter(([d])=>Object.hasOwn(series[i],d));
  comparisons[k]={n:common.length,max_abs_difference:common.length?Math.max(...common.map(([d,v])=>Math.abs(series[i][d]-v))):null,latest_date:obs.last_date,calendar_days_behind_latest_completed_us_session:(Date.parse("2026-11-24")-Date.parse(obs.last_date))/86400000,prior_frozen_level:frozen.market_forecasts[k].reference_level,prior_frozen_source:frozen.market_forecasts[k].source};
  if(obs.latest_close_at)comparisons[k].page_update_hours_after_close=(Date.parse(obs.updated_at)-Date.parse(obs.latest_close_at))/3600000;
 }
 if(comparisons.sp500.n!==4||comparisons.nasdaq100.n!==3||comparisons.sp500.max_abs_difference!==0||comparisons.nasdaq100.max_abs_difference!==0)throw Error("equity source checkpoint");
 const returnPct=(x,y)=>100*(x/y-1);
 const nk=s.nikkei, g=s.german_gdp, t=s.treasury.values;
 const commonDate="2026-11-23";
 const diff=(a,b)=>+(a-b).toFixed(10);
 const out={
 historical_availability_block_proxy:{window_first:window[0],window_last:window.at(-1),weekdays:window.length,possible_overlapping_five_day_blocks:window.length-4,all_open_old:blocks(old,all),all_open_late_quote_appended:blocks(fresh,all),thursday_closed_old:blocks(old,holiday),thursday_closed_late_quote_appended:blocks(fresh,holiday),registered_minimum:20,interpretation:"Quote presence proxy only, not audited open flags; retrospective overlapping blocks are not independent, cannot authorize launch."},
 comparisons,
 same_date_issuer_fred_10y_nov23_diff_bp:100*(s.fred.us10y.values[commonDate]-t[commonDate]),
 hypothetical_stale_10y_nov24_error_bp:diff(100*s.fred.us10y.values[commonDate],100*t["2026-11-24"]),
 nov23_aligned_interim:{date:commonDate,sp500_return_pct:returnPct(s.fred.sp500.values[commonDate],frozen.market_forecasts.sp500.reference_level),nasdaq100_return_pct:returnPct(s.fred.nasdaq100.values[commonDate],frozen.market_forecasts.nasdaq100.reference_level),us10y_delta_bp:diff(100*s.fred.us10y.values[commonDate],100*frozen.market_forecasts.us10y.reference_level),quality:"interim cross-distributor level comparison; not settlement or source lock"},
 nov24_nasdaq100_interim:{daily_return_pct:returnPct(s.fred.nasdaq100.values["2026-11-24"],s.fred.nasdaq100.values[commonDate]),week_to_date_pct:returnPct(s.fred.nasdaq100.values["2026-11-24"],frozen.market_forecasts.nasdaq100.reference_level)},
 nikkei:{daily_return_pct:returnPct(nk.ohlc[3],nk.previous_close),week_to_date_pct:returnPct(nk.ohlc[3],nk.frozen_close),previous_week_to_date_pct:returnPct(nk.previous_close,nk.frozen_close),fraction_of_tuesday_point_gain_reversed:(nk.previous_close-nk.ohlc[3])/(nk.previous_close-nk.frozen_close),friday_close_needed_for_weekly_minus_5:nk.frozen_close*0.95,friday_close_needed_for_weekly_plus_5:nk.frozen_close*1.05},
 german_gdp_revision_pp:Object.fromEntries(Object.keys(g.first).map(k=>[k,diff(g.detail[k],g.first[k])])),
 early_close_to_cutoff_hours:{equities:(Date.parse(s.calendar.parallel_cutoff)-Date.parse(s.calendar.equity_early_close))/3600000,bond_recommendation:(Date.parse(s.calendar.parallel_cutoff)-Date.parse(s.calendar.bond_recommended_early_close))/3600000},
 scheduled_us_release_utc:new Date(s.calendar.bea_and_durables_scheduled_at).toISOString(),
 complete_nov24_three_channel_panel:false
 };
 if(out.historical_availability_block_proxy.all_open_late_quote_appended<out.historical_availability_block_proxy.all_open_old||out.historical_availability_block_proxy.thursday_closed_late_quote_appended<out.historical_availability_block_proxy.all_open_late_quote_appended||out.german_gdp_revision_pp.qoq!==-0.1||out.early_close_to_cutoff_hours.equities!==9||out.early_close_to_cutoff_hours.bond_recommendation!==8)throw Error("invariant failure");
 return out;
}
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const exp=read("research/experiments/2026-11-25-source-latency-block-availability.json");
const actual=audit(read("research/parallel/data/2026-11-21-history-staging-correction03.json"),read("research/weekly/2026-11-21-forecast.json"),read("research/daily/2026-11-24.json"),exp.observations);
require("node:assert/strict").deepEqual(actual,exp.output);
console.log(JSON.stringify(actual,null,2));
