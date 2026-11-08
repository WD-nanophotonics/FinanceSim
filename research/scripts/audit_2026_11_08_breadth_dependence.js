// Exact ex-ante breadth decomposition of the archived Nov7 scenario generator.
// This is a POST-NOON research diagnostic, not a rewrite or a new weekly forecast.
// No network and no external dependencies. Replays the same RNG draw order.
const fs=require('fs');
const snapshotPath=process.argv[2]||'research/inputs/2026-11-07-1200-snapshot.json';
const forecastPath=process.argv[3]||'research/weekly/2026-11-07-forecast.json';
const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
const forecast=JSON.parse(fs.readFileSync(forecastPath,'utf8'));
const ALL=Object.keys(snapshot.market_baselines);
const EQUITY=['sp500','nasdaq100','stoxx600','nikkei225','kospi','csi300'];
const S=new Set(EQUITY), THRESHOLD=-1.5;

// DP is exact for independent Bernoulli events with the supplied marginal rates.
function poissonBinomialAtLeast3(ps){
 let pmf=[1];
 for(const q of ps){
  const next=Array(pmf.length+1).fill(0);
  for(let j=0;j<pmf.length;j++){next[j]+=pmf[j]*(1-q);next[j+1]+=pmf[j]*q;}
  pmf=next;
 }
 return pmf.slice(3).reduce((a,b)=>a+b,0);
}
function run(seed){
 let x=seed>>>0,spare=null;
 const rng=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
 function normal(){
  if(spare!==null){const y=spare;spare=null;return y;}
  const u=1-rng(),v=1-rng(),z=Math.sqrt(-2*Math.log(u));
  spare=z*Math.sin(2*Math.PI*v);
  return z*Math.cos(2*Math.PI*v);
 }
 const count={statistical:Object.fromEntries(EQUITY.map(k=>[k,0])),
              hybrid:Object.fromEntries(EQUITY.map(k=>[k,0]))};
 const joint={statistical:0,hybrid:0};
 for(let i=0;i<snapshot.draws;i++){
  const shocks=Object.fromEntries(ALL.map(k=>[k,0]));
  for(const event of snapshot.subjective_scenarios){
   if(rng()<event.probability){
    for(const [key,imp] of Object.entries(event.impacts))shocks[key]+=imp;
   }
  }
  let statBreadth=0,hybridBreadth=0;
  for(const key of ALL){
   const sd=snapshot.market_baselines[key].sigma;
   // Consume both normals for ALL ten assets to match frozen generator RNG exactly.
   const stat=normal()*sd,hybrid=normal()*sd+shocks[key];
   if(S.has(key)){
    if(stat<=THRESHOLD){count.statistical[key]++;statBreadth++;}
    if(hybrid<=THRESHOLD){count.hybrid[key]++;hybridBreadth++;}
   }
  }
  if(statBreadth>=3)joint.statistical++;
  if(hybridBreadth>=3)joint.hybrid++;
 }
 const modes={};
 for(const mode of ['statistical','hybrid']){
  const q=Object.fromEntries(EQUITY.map(key=>[key,count[mode][key]/snapshot.draws]));
  modes[mode]={
   marginal_tail_rates:q,
   observed_common_draw_breadth_probability:joint[mode]/snapshot.draws,
   independent_identical_marginals_breadth_probability:poissonBinomialAtLeast3(EQUITY.map(key=>q[key]))
  };
 }
 const h=modes.hybrid, b=modes.statistical;
 return {seed,draws:snapshot.draws,threshold_pct:THRESHOLD,
  modes,
  direct_hybrid_minus_statistical_pp:100*(h.observed_common_draw_breadth_probability-b.observed_common_draw_breadth_probability),
  component_from_hybrid_marginal_changes_pp:100*(h.independent_identical_marginals_breadth_probability-b.independent_identical_marginals_breadth_probability),
  dependence_residual_for_hybrid_pp:100*(h.observed_common_draw_breadth_probability-h.independent_identical_marginals_breadth_probability)
 };
}
const replay=run(snapshot.simulation_seed);
for(const mode of ['statistical','hybrid']){
 const saved=forecast.risk_forecasts.breadth.arms[mode].event_probability;
 const got=replay.modes[mode].observed_common_draw_breadth_probability;
 if(Math.abs(saved-got)>1e-12)throw new Error('Frozen Monte Carlo mismatch '+mode+': '+saved+' vs '+got);
}
const robustness=[20261108,20261109,20261110,20261111,20261112].map(seed=>{
 const r=run(seed);
 return {seed,
  hybrid_joint_probability:r.modes.hybrid.observed_common_draw_breadth_probability,
  hybrid_independent_marginals_probability:r.modes.hybrid.independent_identical_marginals_breadth_probability,
  dependence_effect_pp:r.dependence_residual_for_hybrid_pp};
});
const output={
 record_type:'postpublication_counterfactual_dependence_diagnostic',
 frozen_forecast_path:forecastPath,
 source_snapshot_path:snapshotPath,
 original_forecast_cutoff:forecast.forecast_cutoff,
 replay_exact_frozen_event_probabilities:true,
 draw_count:snapshot.draws,
 original_seed:snapshot.simulation_seed,
 mechanism:'Recreate all 10 asset normals and all common event draws in original RNG order; estimate each of six equity one-week downside marginals from archived Monte Carlo; apply exact Poisson-binomial DP to the SAME marginals after eliminating cross-asset dependence. Compare with original shared-shock breadth probability.',
 result:replay,
 robustness_runs:robustness,
 conclusion:'Hybrid 41.82% breadth risk versus statistical 26.60% is mostly explained by DIFFERENT equity downside marginal probabilities, not by the shared-shock dependence residual. This is a within-model counterfactual, not validation versus future real prices.',
 caveats:[
  'Counterfactual comparison is post-Saturday-noon; does not alter or add to the archived Nov7 official forecast.',
  'Independent same-marginals benchmark is derived from hybrid frozen Monte Carlo inputs AFTER the official cutoff, so it is research only and excluded from primary 26-week head-to-head scores.',
  'Monte Carlo marginal rates are assumed scenario-model draws, not fitted or empirical market probabilities.',
  'The decomposition is with respect to the statistical assumed-independent marginal reference; its dependence residual for hybrid is relative to exact independent hybrid empirical marginals.',
  'New seeds are robustness simulation draws under unchanged scenario parameters, not independently observed future market outcomes.'
 ]
};
process.stdout.write(JSON.stringify(output,null,2)+'\n');
