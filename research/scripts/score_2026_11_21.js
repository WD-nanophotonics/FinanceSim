// Independent Nov21 weekly settlement score verification: no network, no archive edits.
const fs=require("fs");
const frozen=JSON.parse(fs.readFileSync("research/weekly/2026-11-14-forecast-corrected-b01.json","utf8"));
const observed=JSON.parse(fs.readFileSync("research/inputs/2026-11-21-settlement-sources.json","utf8"));
const verification=JSON.parse(fs.readFileSync("research/weekly/2026-11-21-verification-correction01.json","utf8"));
const arms=["llm","statistical","hybrid"],rnd=x=>Math.round(x*1e6)/1e6;
const assert=(condition,label)=>{if(!condition)throw Error(label)};
const interval=(pair,y,alpha)=>rnd(pair[1]-pair[0]+2/alpha*Math.max(pair[0]-y,0)+2/alpha*Math.max(y-pair[1],0));
const match=(got,want,key)=>assert(Math.abs(got-want)<1e-5,key+" discrepancy "+got+" vs "+want);
for(const z of verification.macro){
  const d=observed.official_macro_first_vintages[z.id],v=frozen.macro_forecasts[z.id];
  const change=d.value-d.reference_first;match(z.actual_delta,change,z.id+" first vintage");
  for(const arm of arms){
    const p=v.arms[arm].prob_positive,q=z.arms[arm],y=Number(change>0);
    match(q.brier,rnd((p-y)**2),z.id+" Brier "+arm);
    match(q.abs_error,rnd(Math.abs(change-v.arms[arm].point_change)),z.id+" MAE "+arm);
    for(const cov of [50,80,90])match(q.intervals[cov].score,interval(v.arms[arm]["interval_"+cov],change,1-cov/100),z.id+" interval "+arm);
  }
}
for(const z of verification.market){
  const d=observed.prices[z.id],f=frozen.market_forecasts[z.id];
  const yieldUnit=["us2y","us10y","us30y"].includes(z.id);
  const actual=yieldUnit?100*(d.current-d.reference):100*(d.current/d.reference-1);
  match(actual,z.actual_change,z.id+" realized change");
  if(z.id==="wti")assert(!z.strict,"unverified WTI must be excluded");
  if(z.id==="usdjpy")assert(z.unit==="percentage_points_return" && Math.abs(z.actual_change+.237961)<1e-4,"USDJPY cannot be classified as a Treasury yield");
  for(const arm of arms){
    const p=f.arms[arm].prob_positive,q=z.arms[arm],y=Number(actual>0);
    match(q.brier,rnd((p-y)**2),z.id+" Brier "+arm);
    match(q.abs_error,rnd(Math.abs(actual-f.arms[arm].point_change)),z.id+" point error "+arm);
    for(const cov of [50,80,90])match(q.intervals[cov].score,interval(f.arms[arm]["interval_"+cov],actual,1-cov/100),z.id+" interval "+arm);
  }
}
for(const z of verification.risk){
  const f=frozen.risk_forecasts[z.id],y=Number(z.event_occurred);
  for(const arm of arms){match(z.arms[arm].brier,rnd((f.arms[arm].event_probability-y)**2),z.id+" Brier "+arm);}
}
assert(verification.sizing.A_total===6&&verification.sizing.B_total===5&&verification.sizing.C_total===12,"frozen total targets mismatch");
assert(verification.group_summary.B.hybrid.n===3&&verification.group_summary.C.hybrid.n===9,"strict score sample mismatch");
assert(verification.risk.find(z=>z.id==="breadth").actual_state===6,"six equity co-drawdown state mismatch");
console.log("FINANCESIM_NOV21_VERIFICATION_REPLAY_PASS",verification.macro.length,verification.market.length,verification.risk.length);
