"use strict";
// Deterministic retrospective audit. All inputs are pre-existing acquired real-market staging; no fetch or future data.
const fs=require("node:fs");
const raw=JSON.parse(fs.readFileSync("research/parallel/data/2026-11-21-history-staging-correction03.json","utf8"));
function audit(raw,infoTime,inputBlob) {
  const asDate=(s)=>new Date(s+"T00:00:00Z");
  const monday=(s)=>{let d=asDate(s);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};
  const keyset=["sp500","nasdaq100","us10y_fred"];
  if(keyset.some(k=>!raw.series[k]||!Object.keys(raw.series[k]).length))throw Error("missing actual stored history");
  const weekMap={};
  for (const id of keyset) {
    for(const [date,val] of Object.entries(raw.series[id])) {
      if(!Number.isFinite(val))throw Error("nonfinite quote");
      const wk=monday(date); const bucket=weekMap[wk]??={};
      if(!bucket[id]||date>bucket[id].date)bucket[id]={date, value:val};
    }
  }
  const weeks=Object.entries(weekMap).sort((a,b)=>a[0].localeCompare(b[0]));
  const rows=[];
  const excluded=[];
  for(let i=1;i<weeks.length;i++){
    const [w,c]=weeks[i],p=weeks[i-1][1];
    if(w==="2026-11-16"){excluded.push({week_start:w,reason:"FRED DGS10 source snapshot only through 2026-11-19, while equity closes include Nov20; no silent same-Friday substitute."});continue;}
    if(keyset.some(k=>!c[k]||!p[k])){excluded.push({week_start:w,reason:"incomplete series for adjacent weeks"});continue;}
    const sp=100*(c.sp500.value/p.sp500.value-1);
    const nd=100*(c.nasdaq100.value/p.nasdaq100.value-1);
    const bp=100*(c.us10y_fred.value-p.us10y_fred.value);
    rows.push({week_start:w,sp500_return_percent:sp,nasdaq100_return_percent:nd,us10y_change_bp:bp,reference_dates:{sp500:c.sp500.date,nasdaq100:c.nasdaq100.date,us10y_fred:c.us10y_fred.date}});
  }
  if(rows.length!==520)throw Error("unexpected sample length; do not silently change cohort");
  const stats=(items,threshold)=>{
    const n=items.length;
    const nS=items.filter(x=>x.sp500_return_percent<=-threshold).length;
    const nN=items.filter(x=>x.nasdaq100_return_percent<=-threshold).length;
    const nJ=items.filter(x=>x.sp500_return_percent<=-threshold&&x.nasdaq100_return_percent<=-threshold).length;
    if(!(nJ<=nS&&nJ<=nN))throw Error("joint count exceeds marginal count");
    const pS=nS/n,pN=nN/n,pJ=nJ/n,pInd=pS*pN;
    return {weeks:n,sp500_tail_weeks:nS,nasdaq100_tail_weeks:nN,joint_tail_weeks:nJ,
      sp500_rate:pS,nasdaq100_rate:pN,observed_joint_rate:pJ,independent_marginal_product:pInd,
      joint_minus_independent:pJ-pInd, joint_over_independent:pInd>0?pJ/pInd:null};
  };
  const main=stats(rows,5);
  let state=20261123>>>0;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
  const replicates=[];
  for(let rep=0;rep<3000;rep++){
    const sample=[];
    while(sample.length<rows.length){
      const start=Math.floor(random()*rows.length);
      for(let k=0;k<4&&sample.length<rows.length;k++)sample.push(rows[(start+k)%rows.length]);
    }
    replicates.push(stats(sample,5));
  }
  const quantile=(xs,q)=>{
    const a=xs.filter(v=>v!==null&&Number.isFinite(v)).sort((x,y)=>x-y);
    return a[Math.floor(q*(a.length-1))];
  };
  const conf=(field)=>[quantile(replicates.map(x=>x[field]),0.025),quantile(replicates.map(x=>x[field]),0.975)];
  const jointRows=rows.filter(r=>r.sp500_return_percent<=-5&&r.nasdaq100_return_percent<=-5);
  const bondChanges=jointRows.map(x=>x.us10y_change_bp).sort((a,b)=>a-b);
  const mismatches=rows.filter(r=>r.reference_dates.sp500!==r.reference_dates.us10y_fred);
  const results={
    record_type:"FinanceSim_real_historical_joint_equity_tail_audit_not_prospective_forecast",
    analysis_at_utc:infoTime,
    code_before_this_audit:"3aebd84e619951fab55c74c0a69d100f9fc3379f",
    source_path:"research/parallel/data/2026-11-21-history-staging-correction03.json",
    source_blob_sha:inputBlob,
    source_record_sha256:raw.sha256,
    original_history_acquired_at:raw.acquired_at,
    source_channels:{
      sp500:raw.source_responses.sp500.url,
      nasdaq100:raw.source_responses.nasdaq100.url,
      us10y:raw.source_responses.fred_dgs10.url
    },
    research_hypothesis:"The independence benchmark P(S&P <= -5%)*P(NDX <= -5%) understates historical simultaneous weekly left tails; pre-specified 5% event corresponds to registered parallel risk experiment. This diagnostic is not a newly frozen weekly forecast.",
    cohort:{first_week_start:rows[0].week_start,last_week_start:rows.at(-1).week_start,weekly_changes:rows.length,week_start_rule:"UTC Monday of calendar week, per-asset last observed day in each Monday-Friday week; returns to preceding week's own last observed date",excluded_weeks:excluded,source_quote_date_mismatch_weeks:mismatches.map(r=>({week_start:r.week_start,...r.reference_dates}))},
    threshold_negative_simple_return_percent:-5,
    main_result:main,
    historical_joint_event_week_starts:jointRows.map(r=>r.week_start),
    US10Y_in_historical_joint_equity_tails:{units:"basis_points of weekly yield level change",count:jointRows.length,mean_change_bp:bondChanges.reduce((s,x)=>s+x,0)/bondChanges.length,median_change_bp:(bondChanges[4]+bondChanges[5])/2,up_25bp_or_more:bondChanges.filter(x=>x>=25).length,down_25bp_or_more:bondChanges.filter(x=>x<=-25).length},
    approximate_uncertainty:{method:"Circular moving block bootstrap over observed historical weekly rows, block length 4, 3000 replicates, RNG xorshift32, fixed seed 20261123; 2.5% and 97.5% empirical quantiles. Descriptive only, not proof of forecasting calibration.",seed:20261123,block_length_weeks:4,replicates:3000,joint_rate_95_interval:conf("observed_joint_rate"),joint_excess_over_independence_95_interval:conf("joint_minus_independent"),ratio_95_interval:conf("joint_over_independent"),zero_marginal_replicates:replicates.filter(x=>x.joint_over_independent===null).length},
    exploratory_sensitivity:[3,4,5,6].map(t=>({threshold_negative_return_percent:-t,...stats(rows,t)})),
    exploratory_time_split:[{window:"2016-2021",...stats(rows.filter(r=>Number(r.week_start.slice(0,4))<=2021),5)},{window:"2022-2026",...stats(rows.filter(r=>Number(r.week_start.slice(0,4))>=2022),5)}],
    quality_and_interpretation:[
      "Observed frequencies are from a history snapshot acquired on 2026-11-21; no proof of historical first-availability or matched vendor for live forecasts.",
      "Independence rate is the product of pooled historical marginals, not a separate calibrated probability model. Its ratio is descriptive, not evidence of any candidate model's skill.",
      "S&P and NDX represent highly overlapping US equity exposures; their tail co-occurrence must not be treated as 10 independent outcomes.",
      "US10Y channel is FRED DGS10, not a licensed Treasury+FRED splice; FRED H.15 historical definitions and original issuer provenance remain to be audited for future live launch.",
      "The 2026-11-16 week is omitted because at original acquisition FRED lacked Nov20, while stock series included Nov20; no backfill or future quote was inserted.",
      "Four historical weekly closes for stocks and FRED bond quote date differ. Assets use their own actual dates; a risk event is defined weekly, not an identical-minute market reaction.",
      "This is numerical exploratory historical analysis on previously acquired real observations, with deterministic bootstrap. It is neither an out-of-sample test nor a Monte Carlo forecast of Nov27/Dec4.",
      "Historic extreme-tail frequency reflects changing regimes; do not directly substitute pooled 2016–2026 unconditional rates for next week's forecasts."
    ],
    frozen_forecasts_rewritten:false,
    promotion_eligible:false
  };
  if(main.joint_tail_weeks!==10||main.sp500_tail_weeks!==11||main.nasdaq100_tail_weeks!==15)throw Error("historical count regression");
  return results;
}
const result=audit(raw,"2026-11-23T09:52:01.226Z","c704801f76c99eada73f1ee787de4803afdae503");
process.stdout.write(JSON.stringify(result,null,2)+"\n");
