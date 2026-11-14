// Deterministic first-vintage Nov14 verification; no network or model refit.
const fs=require("fs");
function score(f,obs){
 const names=["llm","statistical","hybrid"], round=x=>Math.round(x*1000000)/1000000;
 function interval(x,y,p){const [lo,hi]=x["interval_"+p],alpha=1-p/100;return {covered:y>=lo&&y<=hi,score:round(hi-lo+2/alpha*Math.max(0,lo-y)+2/alpha*Math.max(0,y-hi))};}
 function row(x,y,group,unit,id,typ){const out={target_id:id,group,unit,observed_change:round(y),arms:{}};for(const arm of names){const a=x.arms[arm],pv=typ==="risk"?a.event_probability:a.prob_positive,actual=typ==="risk"?x.binary_outcome:Number(y>0),err=y-a.point_change;out.arms[arm]={point:round(a.point_change),prob:round(pv),actual_event:actual,point_error:round(err),abs_error:round(Math.abs(err)),brier:round((pv-actual)**2),interval_50:interval(a,y,50),interval_80:interval(a,y,80),interval_90:interval(a,y,90)};}return out;}
 const A={},C={},B={};const missing=[];
 for(const [id,x] of Object.entries(f.macro_forecasts)){
  const o=obs.macro[id];if(o?.status!=="first_release"){missing.push({group:"A",id,reason:o?.reason||"not supplied"});continue;}const y=o.value-x.baseline_level;A[id]={...row(x,y,"A",x.unit,id,"macro"),observed_level:o.value,prior_first:x.baseline_level,release_at:o.release_at,source:o.source};}
 for(const [id,x] of Object.entries(f.market_forecasts)){
  const o=obs.market[id];if(!o){missing.push({group:"C",id,reason:"No matched pair"});continue;}
  const y=id==="us10y"?(o.new-o.old)*100:(o.new/o.old-1)*100;
  C[id]={...row(x,y,"C",x.unit,id,"market"),previous:o.old,current:o.new,quality:o.quality,strict:o.strict,source:o.source,frozen_baseline:x.baseline_level};}
 const cv=id=>C[id]?.observed_change;const cls=["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"];
 const breadth=cls.filter(id=>cv(id)<=-1.5).length;
 const outcomes={sp_abs:Math.abs(cv("sp500")),wti_abs:Math.abs(cv("wti")),yield_abs:Math.abs(cv("us10y")),breadth,joint:Number(cv("sp500")<=-2&&cv("wti")>=5)};
 const events={sp_abs:Number(outcomes.sp_abs>2),wti_abs:Number(outcomes.wti_abs>5),yield_abs:Number(outcomes.yield_abs>15),breadth:Number(outcomes.breadth>=3),joint:Number(outcomes.joint===1)};
 for(const [id,x] of Object.entries(f.risk_forecasts)){const xx={...x,binary_outcome:events[id]};B[id]={...row(xx,outcomes[id],"B",x.unit,id,"risk"),event_outcome:events[id],strict:!["wti_abs","joint"].includes(id),dependency:"derived from same equity/WTI/10Y Group C prices; not independent",quality:["wti_abs","joint"].includes(id)?"WTI provisional":null};}
 const groupResults={};
 for(const [label,group] of Object.entries({A,B,C})){
 const rows=Object.values(group),strict=rows.filter(v=>v.strict!==false);
 function stats(rs){const by={};for(const arm of names){const x=rs.map(t=>t.arms[arm]);const av=k=>x.length?round(x.reduce((a,z)=>a+z[k],0)/x.length):null;const b=x.reduce((a,z)=>a+z.brier,0)/x.length,units={};for(const v of rs){(units[v.unit]??=[]).push(v.arms[arm]);}const perUnit={};for(const [unit,sub] of Object.entries(units)){perUnit[unit]={n:sub.length,mae:round(sub.reduce((a,z)=>a+z.abs_error,0)/sub.length),rmse:round(Math.sqrt(sub.reduce((a,z)=>a+z.point_error**2,0)/sub.length)),mean_interval80_score:round(sub.reduce((a,z)=>a+z.interval_80.score,0)/sub.length)};}by[arm]={n:x.length,mean_brier:round(b),coverage_50:round(av("interval_50")??(x.reduce((a,z)=>a+Number(z.interval_50.covered),0)/x.length)),coverage_80:round(x.reduce((a,z)=>a+Number(z.interval_80.covered),0)/x.length),coverage_90:round(x.reduce((a,z)=>a+Number(z.interval_90.covered),0)/x.length),per_unit:perUnit};}
 const base=by.statistical.mean_brier;for(const arm of names)by[arm].brier_skill_vs_statistical=round(1-by[arm].mean_brier/base);return by;}
 groupResults[label]={all_conditional:stats(rows),strict_only:stats(strict),count:rows.length,strict_count:strict.length};
 }
 return {record_type:"FinanceSim_weekly_verification_APPEND_ONLY",score_cutoff:"2026-11-14T12:00:00+09:00",forecast_file:"research/weekly/2026-11-07-forecast.json",truth_input:"research/inputs/2026-11-14-settlement-sources.json",origin_forecast_archived_after_noon:true,observed_actuals:{A,B,C},group_summary:groupResults,missing,quality:"WTI and the derived B events are provisional; group-B outcomes overlap with group C; statistical baseline is zero-drift/assumed width; no statistical significance or post-hoc refit",measurement:"C returns (new/old-1)*100; Treasury 10Y (new-old)*100 basis points; A value minus original first-release baseline; B magnitude, count, binary event",interval_score_definition:"Winkler score: (upper-lower)+(2/alpha)*max(0,lower-observed)+(2/alpha)*max(0,observed-upper), alpha=0.2 for 80% central interval"};}
const f=JSON.parse(fs.readFileSync(process.argv[2]||"research/weekly/2026-11-07-forecast.json","utf8"));
const obs=JSON.parse(fs.readFileSync(process.argv[3]||"research/inputs/2026-11-14-settlement-sources.json","utf8"));
process.stdout.write(JSON.stringify(score(f,obs),null,2)+"\n");
