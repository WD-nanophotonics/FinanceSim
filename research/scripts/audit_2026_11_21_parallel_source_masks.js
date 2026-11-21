"use strict";
// Executable real-source mask audit. Intentionally does NOT infer market holiday calendars.
const fs=require("node:fs");
const INPUT="research/parallel/data/2026-11-21-history-staging-correction03.json";
const INPUT_BLOB="c704801f76c99eada73f1ee787de4803afdae503";
const AS_OF_UTC="2026-11-21T10:14:09.306Z";
const HEAD={sha:"9f97f5e78b06dc20eac242f7ae83e13cc6c3a6d5"};
const OFFICIAL={
  "treasury": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value=2026",
  "fred": "https://fred.stlouisfed.org/series/DGS10",
  "nasdaq": "https://www.nasdaq.com/market-activity/stock-market-holiday-schedule",
  "bea": "https://www.bea.gov/news/schedule/"
};
function analyzeStaging(j){
  if(j.record_type!=="parallel_history_staging"||j.dataset_kind!=="real")throw Error("wrong staging identity");
  if(j.requested_range[0]!=="2016-11-21"||j.requested_range[1]!=="2026-11-20")throw Error("unexpected covered interval");
  const cols=["sp500","nasdaq100","us10y","us10y_fred"];
  for(const id of cols){if(!j.series[id])throw Error("missing "+id);if(Object.keys(j.series[id]).length!==j.counts[id])throw Error("staging count mismatch "+id);}
  const matrix={},year={},oneMarketButNoRates=[],dateMask={},allMissing=[];
  let weekdayCount=0;
  for(let ms=Date.UTC(2016,10,21);ms<=Date.UTC(2026,10,20);ms+=86400000){
    const dt=new Date(ms),w=dt.getUTCDay();if(w===0||w===6)continue;
    ++weekdayCount;const day=dt.toISOString().slice(0,10),mask=cols.map(k=>j.series[k][day]===undefined?"0":"1").join("");
    matrix[mask]=(matrix[mask]||0)+1;const yr=day.slice(0,4);(year[yr]??={})[mask]=(year[yr][mask]||0)+1;
    if(mask==="1100")oneMarketButNoRates.push(day);
    if(mask==="0000")allMissing.push(day);
    if(["2021-04-02","2023-04-07","2025-01-09","2026-04-03","2026-10-12","2026-11-11","2026-11-19","2026-11-20"].includes(day))dateMask[day]=mask;
  }
  const sorted=x=>Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)));
  const common=Object.keys(j.series.us10y).filter(d=>j.series.us10y_fred[d]!==undefined);
  const discrepancy=common.filter(d=>Math.abs(j.series.us10y[d]-j.series.us10y_fred[d])>1e-10);
  const keys=sorted(matrix),sum=Object.values(matrix).reduce((a,b)=>a+b,0);
  if(sum!==weekdayCount||weekdayCount!==2610)throw Error("weekday coverage inconsistency");
  if(common.length!==721||discrepancy.length!==0||j.treasury_fred_overlap_audit.n!==721)throw Error("Treasury / FRED numerical overlap regression");
  for(const [mask,n] of Object.entries({"0000":92,"0001":2,"0011":2,"1100":18,"1101":1776,"1110":1,"1111":719}))
    if(matrix[mask]!==n)throw Error("unexpected source mask "+mask);
  if(dateMask["2026-11-20"]!=="1110"||j.series.us10y["2026-11-20"]!==4.92||j.series.us10y_fred["2026-11-19"]!==5.04)throw Error("Nov20 missingness/level regression");
  if(j.series.us10y_fred["2026-11-20"]!==undefined)throw Error("FRED Nov20 is unexpectedly populated; needs new append-only vintage");
  const rows={};
  for(const yr of Object.keys(year).sort()){const x=year[yr];rows[yr]={weekday_count:Object.values(x).reduce((a,b)=>a+b,0),mask_counts:sorted(x)};}
  return {
    record_type:"FinanceSim_append_only_parallel_source_mask_audit",
    kind:"real_staging_source_availability_and_calendar_triage_NOT_LIVE_FORECAST",
    audited_at_utc:AS_OF_UTC,
    staging_path:INPUT,
    staging_blob_sha:INPUT_BLOB,
    staging_source_acquired_at_utc:j.acquired_at,
    underlying_model_head_at_audit:HEAD.sha,
    date_range:j.requested_range,
    series_order:cols,
    mask_semantics:"1=source snapshot contains a dated finite observation, 0=source snapshot does not; these are NOT exchange-session flags",
    weekdays_in_interval:weekdayCount,
    observed_counts:j.counts,
    observed_mask_counts:keys,
    annual_availability:rows,
    equity_open_both_but_neither_10y_channel:oneMarketButNoRates,
    source_specific_date_examples:sorted(dateMask),
    days_none_of_four_have_a_quote:allMissing.length,
    checked_numerical_overlap:{dates:common.length,disagreements:discrepancy.length,does_not_establish_source_identity:true},
    concrete_late_reference_risk:{
      date_treasury:"2026-11-20",treasury_10y_par_yield_percent:j.series.us10y["2026-11-20"],
      last_fred_date:"2026-11-19",last_fred_dgs10_percent:j.series.us10y_fred["2026-11-19"],
      different_date_gap_basis_points:Math.round((j.series.us10y["2026-11-20"]-j.series.us10y_fred["2026-11-19"])*10000)/100,
      meaning:"12-bp mismatch in time if November19 FRED is mistaken for November20 reference. This is a missing latest FRED observation, NOT a same-date quote contradiction."
    },
    calendar_examples:{
      equity_closed_with_rates_present:["2021-04-02","2023-04-07","2025-01-09","2026-04-03"],
      equity_quote_present_without_rates:["2026-11-11","2026-10-12"],
      needs_independent_historical_calendar_audit:true,
      next_thanksgiving_2026:{closed:"2026-11-26",early_equity_close:"2026-11-27T13:00:00-05:00",source:OFFICIAL.nasdaq}
    },
    sources:[{kind:"source_staging",url:"https://github.com/WD-nanophotonics/FinanceSim/blob/main/"+INPUT,source_response_hashes:Object.fromEntries(["sp500","nasdaq100","fred_dgs10","2024","2025","2026"].map(k=>[k,j.source_responses[k].raw_sha256]))},
      {kind:"us_issuer_10year",url:OFFICIAL.treasury,date:"2026-11-20"},
      {kind:"fred_federal_reserve_h15_distribution",url:OFFICIAL.fred,latest_observation_as_checked:"2026-11-19",web_page_says_updated:"2026-11-20 15:17 CST"},
      {kind:"stock_market_2026_calendar",url:OFFICIAL.nasdaq},
      {kind:"BEA_2026_calendar",url:OFFICIAL.bea,scheduled:"2026-11-25 08:30 EST both GDP second estimate and October personal income/outlays"}],
    status:"Partial audited source availability only; no source merge, calendar inference, future predictions, hindsight retuning, model promotion, or claims of on-time launch.",
    outstanding:["Audit all equity and Treasury/H15 opening calendars independently for 2016-2026.","Approve a prospective common source identity for all model arms (Treasury par vs FRED/H15 differ in provenance).","Reacquire Nov27 actual last-close and verify same-day availability before Nov28 12:00 JST.","Build verified dated session grid; avoid forward filling issuer/FRED gaps."] 
  };
}
const j=JSON.parse(fs.readFileSync(INPUT,"utf8"));
process.stdout.write(JSON.stringify(analyzeStaging(j),null,2)+"\n");
