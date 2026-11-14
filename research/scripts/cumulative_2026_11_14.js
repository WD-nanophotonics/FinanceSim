const fs=require("fs");
function cumulative(v){
const w=[];
for(const g of ["A","B","C"]){const d=[];
 for(let i=0;i<3;i++){
  if(g==="B"&&i===0)continue;
  const src=i===0?v[i].group_summary[g].by_arm:(i===1?v[i].summary[g]:v[i].group_summary[g].strict_only);
  const n=i===0?v[i].group_summary[g].n:(i===1?src.llm.n:v[i].group_summary[g].strict_count);
  const out={week:["2026-10-24/10-30","2026-10-31/11-06","2026-11-07/11-13"][i],n,arms:{}};
  for(const arm of ["llm","statistical","hybrid"]){const x=src[arm];out.arms[arm]={brier:x.mean_brier??x.brier,coverage80:x.coverage80??x.coverage_80};}
  d.push(out);
 }
 const n=d.reduce((a,x)=>a+x.n,0),agg={};
 for(const arm of ["llm","statistical","hybrid"]){
  const b=d.reduce((a,x)=>a+x.n*x.arms[arm].brier,0)/n;
  const cov=d.reduce((a,x)=>a+x.n*x.arms[arm].coverage80,0)/n;
  agg[arm]={mean_brier:+b.toFixed(6),coverage80:+cov.toFixed(6)};
 }
 const skill=1-agg.hybrid.mean_brier/agg.statistical.mean_brier;
 w.push({group:g,n,arm_summary:agg,hybrid_skill_vs_statistical:+skill.toFixed(6),source_weeks:d,limitations:g==="B"?"Original Oct24 5-group risk SUPPLEMENT omitted: it was after-noon and single-arm only, so cannot enter three-arm fair comparison. Nov14 WTI-derived B probabilities provisional and excluded.":g==="C"?"Nov14 WTI continuous-futures entry excluded; earlier weeks vendor-dependent and provisional. Mixed-unit point errors never pooled.":"2026-11-14 two structural missing CPI YoY targets excluded from Brier/coverage, still reported 7 forecasted A targets."});
}
return {record_type:"cumulative_live_forecast_performance_three_week_snapshot",as_of:"2026-11-14T12:00:00+09:00",sources:["research/weekly/2026-10-31-verification-correction01.json","research/weekly/2026-11-07-verification.json","research/weekly/2026-11-14-verification-correction01.json"],groups:w,interpretation:"Exploratory heterogenous and strongly correlated 3-week observations, not evidence of calibrated long-run skill. C+B dependent and WTI quote provenance provisional.",planned_review:"26 weekly evaluation cycles, then at least one year; no interim promotion based on three weeks."};}
const args=process.argv.slice(2);
const paths=args.length?args:["research/weekly/2026-10-31-verification-correction01.json","research/weekly/2026-11-07-verification.json","research/weekly/2026-11-14-verification-correction01.json"];
if(paths.length!==3)throw Error("expected three weekly inputs");
const v=paths.map(p=>JSON.parse(fs.readFileSync(p,"utf8")));
process.stdout.write(JSON.stringify(cumulative(v),null,2)+"\n");
