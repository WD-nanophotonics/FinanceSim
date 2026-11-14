// Deterministic append-only correction to Nov14 Group B cross-asset dependence.
const fs=require("fs");
function correctedRisk(s,original){
 const r=JSON.parse(JSON.stringify(original)),ids=Object.keys(s.market);let x=s.seed>>>0,spare=null;
 const rand=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
 function normal(){if(spare!==null){const v=spare;spare=null;return v;}const u=Math.max(1e-12,1-rand()),v=1-rand(),a=Math.sqrt(-2*Math.log(u)),b=2*Math.PI*v;spare=a*Math.sin(b);return a*Math.cos(b);}
 const sampled={};for(const id of ids)sampled[id]=[];
 const mk=()=>({sp_abs:[],wti_abs:[],yield_abs:[],breadth:[],joint:[]});
 const bh=mk(),bs=mk();
 function feed(b,m){
  b.sp_abs.push(Math.abs(m.sp500));b.wti_abs.push(Math.abs(m.wti));b.yield_abs.push(Math.abs(m.us10y));
  b.breadth.push(["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"].filter(id=>m[id]<=-1.5).length);
  b.joint.push(Number(m.sp500<=-2&&m.wti>=5));
 }
 for(let i=0;i<s.draws;i++){
  const firing=s.events.map(e=>Number(rand()<e.p)-e.p),hm={},sm={};
  for(const id of ids){let d=s.market[id],sh=d.hybrid;for(let j=0;j<firing.length;j++)sh+=firing[j]*(s.events[j].effects[id]||0);hm[id]=sh+d.sigma*normal();sm[id]=d.sigma*normal();sampled[id].push(hm[id]);}
  feed(bh,hm);feed(bs,sm);
 }
 function round(n){return Math.round(n*10000)/10000;}
 function q(v,p){const t=(v.length-1)*p,i=Math.floor(t);return v[i]+(t-i)*(v[Math.min(i+1,v.length-1)]-v[i]);}
 function intervals(arr){const vals=[...arr].sort((a,b)=>a-b);return {interval_50:[round(q(vals,.25)),round(q(vals,.75))],interval_80:[round(q(vals,.1)),round(q(vals,.9))],interval_90:[round(q(vals,.05)),round(q(vals,.95))]};}
 const compare={};for(const id of ids){const v=sampled[id],mean=round(v.reduce((a,b)=>a+b,0)/v.length),positive=round(v.filter(x=>x>0).length/v.length),prior=r.market_forecasts[id].arms.hybrid;compare[id]={replayed_point:mean,frozen_point:prior.point_change,replayed_p:positive,frozen_p:prior.prob_positive};if(mean!==prior.point_change||positive!==prior.prob_positive)throw Error("Original Group C mismatch: "+id);}
 for(const id of Object.keys(bh)){
  function e(x){if(id==="joint")return x===1;if(id==="breadth")return x>=3;if(id==="sp_abs")return x>2;if(id==="wti_abs")return x>5;return x>15;}
  for(const [arm,arr] of [["statistical",bs[id]],["hybrid",bh[id]]]){
   let v=r.risk_forecasts[id].arms[arm];
   v.point_change=round(arr.reduce((a,b)=>a+b,0)/arr.length);
   v.event_probability=round(arr.filter(e).length/arr.length);
   Object.assign(v,intervals(arr));
  }
  r.risk_forecasts[id].quality="Corrected joint alignment: keep Monte Carlo draws aligned across assets before calculating joint risk; no marginal forecast values modified. "+(r.risk_forecasts[id].quality||"");
 }
 r.record_type="FinanceSim_three_arm_weekly_prospective_APPEND_ONLY_CORRECTED_B01";
 r.supersedes_risk_only="research/weekly/2026-11-14-forecast.json";
 r.correction_reason="Original Nov14 generator sorted each target's hybrid draws in-place while computing Group C quantiles, destroying draw-level cross-asset alignment before computing B joint states and breadth. This produces impossible joint risk zero. Correct B replays the original RNG and computes joint states before any sorting, leaving Groups A,C untouched. The originally archived forecast is kept as a failed risk artifact.";
 r.generator="research/scripts/replay_2026_11_14_corrected_b01.js";
 r.risk_corrected_before_future_outcomes=true;
 return {record:r,compare};
}
const snapshot=JSON.parse(fs.readFileSync(process.argv[2]||"research/inputs/2026-11-14-1200-snapshot.json","utf8"));
const prior=JSON.parse(fs.readFileSync(process.argv[3]||"research/weekly/2026-11-14-forecast.json","utf8"));
process.stdout.write(JSON.stringify(correctedRisk(snapshot,prior).record,null,2)+"\n");
