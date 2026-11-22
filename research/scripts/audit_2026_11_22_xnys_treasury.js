"use strict";
// Reproduce Nov22 real-staging calendar audit. This does not approve live launch.
const fs=require("node:fs"), crypto=require("node:crypto");
const raw=fs.readFileSync("research/parallel/data/2026-11-21-history-staging-correction03.json");
const sha=crypto.createHash("sha1").update("blob "+raw.length).update(Buffer.from([0])).update(raw).digest("hex");
const calendar=JSON.parse(fs.readFileSync("research/inputs/2026-11-22-xnys-calendar-snapshot.json","utf8"));
const audit=function audit(j,c,gitBlob){
  if(j.record_type!=="parallel_history_staging"||j.dataset_kind!=="real"||j.requested_range.join()!==c.range.join())throw Error("wrong staging");
  if(gitBlob!=="c704801f76c99eada73f1ee787de4803afdae503")throw Error("staging blob changed");
  const closed=new Set(c.closed_weekday_dates), eq=j.series.sp500,nd=j.series.nasdaq100, fr=j.series.us10y_fred,issuer=j.series.us10y;
  if(closed.size!==96||c.weekday_count!==2610||Object.keys(eq).length!==2514||Object.keys(nd).length!==2514||Object.keys(fr).length!==2499)throw Error("unexpected counts");
  const all=[],calendarOpen=[],equityAbsentOpen=[],equityPresentClosed=[],equityDisagrees=[],rateMissingEquityOpen=[],ratesOnEquityClosed=[],jointDates=[];
  for(let t=Date.UTC(2016,10,21);t<=Date.UTC(2026,10,20);t+=86400000){
    const dayDate=new Date(t),weekday=dayDate.getUTCDay();
    if(weekday===0||weekday===6)continue;
    const d=dayDate.toISOString().slice(0,10);
    all.push(d);
    const open=!closed.has(d),q=Object.hasOwn(eq,d),n=Object.hasOwn(nd,d),b=Object.hasOwn(fr,d);
    if(open)calendarOpen.push(d);
    if(open&&!q)equityAbsentOpen.push(d);
    if(!open&&q)equityPresentClosed.push(d);
    if(q!==n)equityDisagrees.push(d);
    if(q&&!b)rateMissingEquityOpen.push(d);
    if(!q&&b)ratesOnEquityClosed.push(d);
    if(q&&n&&b)jointDates.push(d);
  }
  const holidays=rateMissingEquityOpen.filter(d=>d!=="2026-11-20");
  const expected=["2017-10-09","2018-10-08","2018-11-12","2019-10-14","2019-11-11","2020-10-12","2020-11-11","2021-10-11","2021-11-11","2022-10-10","2022-11-11","2023-10-09","2024-10-14","2024-11-11","2025-10-13","2025-11-11","2026-10-12","2026-11-11"];
  if(all.length!==2610||calendarOpen.length!==2514||equityAbsentOpen.length||equityPresentClosed.length||equityDisagrees.length||JSON.stringify(holidays)!==JSON.stringify(expected))throw Error("exchange/source calendar mismatch");
  if(jointDates.length!==2495||JSON.stringify(ratesOnEquityClosed)!==JSON.stringify(["2021-04-02","2023-04-07","2025-01-09","2026-04-03"]))throw Error("disjoint bond/equity regression");
  if(fr["2026-11-20"]!==undefined||issuer["2026-11-20"]!==4.92||fr["2026-11-19"]!==5.04)throw Error("latest yield snapshot unexpectedly changed");
  return {
    record_type:"FinanceSim_real_staging_XNYS_calendar_crosscheck_not_forecast",
    as_of_utc:"2026-11-22T10:07:30Z",
    pre_audit_main_commit:"54287c9cb13b1b36040fe8790b25ad1b7e31acd5",
    staging_file:"research/parallel/data/2026-11-21-history-staging-correction03.json",
    pinned_staging_git_blob_sha:gitBlob,
    original_staging_acquired_at_utc:j.acquired_at,
    calendar_file:"research/inputs/2026-11-22-xnys-calendar-snapshot.json",
    calendar_generator:c.generated_by,
    audited_period:c.range,
    observations:{weekdays:all.length,independent_xnys_closed_days:closed.size,xnys_sessions:calendarOpen.length,sp500_quotes:Object.keys(eq).length,nasdaq100_quotes:Object.keys(nd).length,fred_dgs10_quotes:Object.keys(fr).length,equity_and_fred_joint_dates:jointDates.length},
    equity_calendar_comparison:{quotes_missing_on_expected_equity_sessions:equityAbsentOpen,quotes_present_during_expected_equity_closure:equityPresentClosed,sp500_ndx_quote_date_disagreements:equityDisagrees,exact_date_match:true},
    cross_asset_calendar_comparison:{equity_quote_without_fred_dgs10:rateMissingEquityOpen.length,of_which_holiday_pattern_dates:holidays,holiday_pattern_count:holidays.length,of_which_latest_FRED_source_lag:["2026-11-20"],fred_quote_when_equities_closed:ratesOnEquityClosed},
    Nov20_asof_gap:{treasury_issuer_date:"2026-11-20",treasury_par_yield_percent:4.92,FRED_last_available_date:"2026-11-19",FRED_last_percent:5.04,stale_substitution_error_bp:-12,quality:"Different dates, not a same-date vendor disagreement"},
    Nov27_2026_prospective_clock:{Thursday_Nov26:"Both equity and SIFMA USD fixed income closed",Friday_equity_early_close:"2026-11-27T13:00:00-05:00",Friday_SIFMA_bond_recommended_early_close:"2026-11-27T14:00:00-05:00",observed_close_gap_hours:1,actual_data_publication_time:"UNVERIFIED",next_forecast_cutoff:"2026-11-28T12:00:00+09:00"},
    official_sources:c.official_2026_spotchecks,
    interpretation:"96 XNYS closures exactly match both equity quote-absence calendars for this staging dataset. 18 bond-quote absences on equity-open dates align with Columbus/Veterans holiday patterns; historical issuer closure requires further primary-source validation. Four yield observations on equity-closed dates show independent calendars. FRED Nov20 gap is freshness, not a holiday.",
    execution:"Actual deterministic 2610-weekday comparison of archived real historical staging quotes; no model training, no real-time forecast, no seeded simulation (seed not applicable), no refitting, no scoring changes.",
    launch_ready:false,
    remaining:["Independent multi-year Treasury/issuer bond session calendar audit","Registered prospective common quote-provider/source identity for every arm","November27 actual early closes and publication times","Same-origin three-arm reference forecasts and on-time remote receipts"]
  };
};
const result=audit(JSON.parse(raw),calendar,sha);
process.stdout.write(JSON.stringify(result,null,2)+String.fromCharCode(10));
