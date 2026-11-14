// Reproduce 2026-11-14 post-noon six-market breadth shadow benchmark; no future outcomes.
const fs=require("fs");
const audit=function audit(s,seeds=[s.seed,20261115,20261116,20261117,20261118,20261119]){
 const eq=["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"],ids=Object.keys(s.market);
 function pbin(p){let d=[1];for(const a of p){const nd=Array(d.length+1).fill(0);for(let i=0;i<d.length;i++){nd[i]+=d[i]*(1-a);nd[i+1]+=d[i]*a;}d=nd;}return d.slice(3).reduce((a,b)=>a+b,0);}
 function sim(seed){
  let x=seed>>>0,z=null;
  const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296};
  function normal(){if(z!==null){let t=z;z=null;return t;}const u=Math.max(1e-12,1-random()),v=1-random(),a=Math.sqrt(-2*Math.log(u)),b=2*Math.PI*v;z=a*Math.sin(b);return a*Math.cos(b);}
  const H=Object.fromEntries(eq.map(k=>[k,0])),S=Object.fromEntries(eq.map(k=>[k,0]));let h=0,t=0,jh=0,jt=0,sp=0,wti=0;
  for(let i=0;i<s.draws;i++){
   const e=s.events.map(v=>Number(random()<v.p)-v.p),hm={},sm={};
   for(const k of ids){const d=s.market[k];let shift=d.hybrid;for(let j=0;j<e.length;j++)shift+=e[j]*(s.events[j].effects[k]||0);hm[k]=shift+d.sigma*normal();sm[k]=d.sigma*normal();}
   let nh=0,ns=0;
   for(const k of eq){if(hm[k]<=-1.5){H[k]++;nh++;}if(sm[k]<=-1.5){S[k]++;ns++;}}
   h+=Number(nh>=3);t+=Number(ns>=3);jh+=Number(hm.sp500<=-2&&hm.wti>=5);jt+=Number(sm.sp500<=-2&&sm.wti>=5);sp+=Number(hm.sp500<=-2);wti+=Number(hm.wti>=5);
  }
  const margH=Object.fromEntries(eq.map(k=>[k,H[k]/s.draws])),margS=Object.fromEntries(eq.map(k=>[k,S[k]/s.draws]));
  const ih=pbin(Object.values(margH)),is=pbin(Object.values(margS)),ph=h/s.draws,ps=t/s.draws;
  return {seed,n:s.draws,shared_hybrid:ph,shared_statistical:ps,independent_hybrid:ih,independent_statistical:is,hybrid_dependence_residual_pp:100*(ph-ih),statistical_residual_pp:100*(ps-is),between_model_total_gap_pp:100*(ph-ps),marginal_shift_component_pp:100*(ih-is),conditional_marginal_p_hybrid:margH,conditional_marginal_p_statistical:margS,joint_sp_down2_wti_up5_hybrid:jh/s.draws,joint_sp_down2_wti_up5_statistical:jt/s.draws,independent_sp_wti_hybrid:sp/s.draws*wti/s.draws};
 }
 const results=seeds.map(sim);
 return {record_type:"conditional_breadth_shadow_baseline_post_noon_pre_outcome",executed:true,forecast_reference:"research/weekly/2026-11-14-forecast-corrected-b01.json",snapshot_reference:"research/inputs/2026-11-14-1200-snapshot.json",as_of_market_inputs:"2026-11-13 local Friday closes and official rate observations",model_seed:s.seed,draws_each_seed:s.draws,definition:"At least 3 of 6 equity Friday Nov20 returns vs Friday Nov13 <= -1.5%; identical local closing convention",method:"Replay seeded centered-Bernoulli common shock 12-market Monte Carlo in original generator order, preserve draw correlation, compute six per-market P(return<=-1.5). Exact Poisson-binomial P(count>=3) is SAME-MARGINAL INDEPENDENCE shadow benchmark. Compare to common-shock event P from archived corrected Nov14 forecast.",main_seed:results[0],alternate_seeds:results.slice(1).map(({seed,n,shared_hybrid,independent_hybrid,hybrid_dependence_residual_pp,shared_statistical,independent_statistical})=>({seed,n,shared_hybrid,independent_hybrid,hybrid_dependence_residual_pp,shared_statistical,independent_statistical})),registration:"This is a Saturday post-12:00 shadow benchmark written before Nov16-Nov20 future outcomes. It is NOT the original Saturday noon frozen forecast. Append-only, no retrospective redefinition.",risk_quality:"WTI joint risk conditional only; futures contract matching not authenticated. The six-index breadth excludes WTI.",limitations:["No estimated historical covariance or calibrated return process; all probabilities conditional on assumed shocks and volatilities.","Independent shadow probability shares simulated marginals but is not an independently fitted statistical model.","20k draws x 6 seeds measure Monte Carlo seed sensitivity only, not sampling uncertainty from weekly markets.","Asian/European/U.S. session closures staggered, common-shock model lacks event-time exposure mapping.","This experiment must remain separate from the original 12:00 three-arm archive and may not be used to claim historic weekly skill."]};
};
const s=JSON.parse(fs.readFileSync(process.argv[2] || "research/inputs/2026-11-14-1200-snapshot.json","utf8"));
const f=JSON.parse(fs.readFileSync(process.argv[3] || "research/weekly/2026-11-14-forecast-corrected-b01.json","utf8"));
const r=audit(s),m=r.main_seed;
const x=[f.risk_forecasts.breadth.arms.hybrid.event_probability,f.risk_forecasts.breadth.arms.statistical.event_probability,f.risk_forecasts.joint.arms.hybrid.event_probability,f.risk_forecasts.joint.arms.statistical.event_probability];
const y=[m.shared_hybrid,m.shared_statistical,m.joint_sp_down2_wti_up5_hybrid,m.joint_sp_down2_wti_up5_statistical];
if(x.some((v,i)=>Math.abs(v-y[i])>0.000051))throw Error("Frozen corrected risk replay mismatch "+JSON.stringify({x,y}));
process.stdout.write(JSON.stringify(r,null,2)+"\n");
