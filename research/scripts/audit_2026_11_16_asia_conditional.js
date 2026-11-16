// Deterministic Monday-to-Friday conditional risk study of a frozen Saturday model.
// Post-release diagnostic, NOT a replacement for the 2026-11-14 ex-ante forecast.
const fs=require('fs');
const snap=JSON.parse(fs.readFileSync('research/inputs/2026-11-14-1200-snapshot.json','utf8'));
const old=JSON.parse(fs.readFileSync('research/weekly/2026-11-14-forecast-corrected-b01.json','utf8'));
const ev=JSON.parse(fs.readFileSync('research/inputs/2026-11-16-asia-first-release.json','utf8'));
const m=snap.market.nikkei225, f=old.market_forecasts.nikkei225.arms.hybrid;
const monday=100*(ev.observations.nikkei_2026_11_16.value/m.base-1);
const events=snap.events;
function normalCDF(q){
  const x=Math.abs(q),t=1/(1+.2316419*x),d=.3989422804014327*Math.exp(-x*x/2);
  const tail=d*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return q>=0?1-tail:tail;
}
const required=(t)=>100*((1+t/100)/(1+monday/100)-1);
const states=[];
for(let mask=0;mask<1<<events.length;mask++){
  let prior=1,mean=m.hybrid;
  for(let i=0;i<events.length;i++){
    const e=events[i],on=(mask>>i)&1;
    prior*=on?e.p:(1-e.p);
    mean+=(on-e.p)*(e.effects.nikkei225||0);
  }
  states.push({mask,prior,mean});
}
if(Math.abs(states.reduce((a,s)=>a+s.prior,0)-1)>1e-10)throw Error('Prior does not sum to 1');
const scenarios=[];
for(const scale of [0.75,1,1.5,2]){
  const dailySigma=m.sigma*scale/Math.sqrt(5);
  const remainSigma=m.sigma*scale*Math.sqrt(4/5);
  let norm=0;
  for(const s of states){
    s.likelihood=Math.exp(-0.5*((monday-s.mean/5)/dailySigma)**2)/dailySigma;
    norm+=s.prior*s.likelihood;
  }
  const prob=(bayes,target)=>states.reduce((sum,s)=>{
    const w=bayes?s.prior*s.likelihood/norm:s.prior;
    return sum+w*normalCDF((required(target)-4*s.mean/5)/remainSigma);
  },0);
  const expected=states.reduce((sum,s)=>{
    const w=s.prior*s.likelihood/norm;
    return sum+w*(100*((1+monday/100)*(1+4*s.mean/500)-1));
  },0);
  const post=Object.fromEntries(events.map((e,i)=>[
    e.id,states.reduce((sum,s)=>sum+(((s.mask>>i)&1)?s.prior*s.likelihood/norm:0),0)
  ]));
  scenarios.push({
    future_volatility_multiplier:scale,gaussian_sigma_remaining_4_sessions_pct:remainSigma,
    remaining_return_needed_for_week_minus_1_5_pct:required(-1.5),
    conditional_prob_week_below_minus_1_5_no_reweight:prob(false,-1.5),
    conditional_prob_week_below_minus_1_5_bayes:prob(true,-1.5),
    conditional_prob_week_positive_bayes:1-prob(true,0),
    conditional_prob_below_frozen_hybrid_90_lower_bayes:prob(true,f.interval_90[0]),
    posterior_mean_weekly_return_pct:expected,posterior_shock_probabilities:post
  });
}
const o=ev.observations;
const result={
  record_type:'after_monday_frozen_model_conditional_diagnostic',date:'2026-11-16',
  as_of:ev.as_of,execution:'32-state deterministic Gaussian-mixture integration; no MC and no model refit',
  source_snapshot:'research/inputs/2026-11-14-1200-snapshot.json',
  frozen_original:'research/weekly/2026-11-14-forecast-corrected-b01.json',
  actual_inputs:'research/inputs/2026-11-16-asia-first-release.json',
  original_seed:snap.seed,simulation_seed:null,new_monte_carlo_draws:0,
  original_reference_nikkei:m.base,official_nikkei_monday:o.nikkei_2026_11_16.value,
  observed_monday_return_pct:monday,
  frozen_hybrid_weekly_point_pct:f.point_change,
  frozen_hybrid_90_interval:f.interval_90,
  original_sigma_week_pct:m.sigma,
  original_scenario_unconditional_prob_week_below_minus_1_5:
    states.reduce((a,s)=>a+s.prior*normalCDF((-1.5-s.mean)/m.sigma),0),
  scenarios,
  observed_macro_features:{
    china_industrial_yoy_slowdown_pp:o.cn_oct_industrial.value-o.cn_sep_industrial.value,
    china_retail_yoy_slowdown_pp:o.cn_oct_retail.value-o.cn_sep_retail.value,
    china_hightech_yoy_acceleration_pp:o.cn_oct_hightech.value-o.cn_sep_hightech.value,
    china_property_cumulative_growth_rate_change_pp:o.cn_ytd_oct_property.value-o.cn_ytd_sep_property.value,
    japan_real_gdp_qoq_display:o.jp_q3_real_gdp_qoq.displayed,
    japan_nominal_gdp_qoq_pct:o.jp_q3_nominal_gdp_qoq.value
  },
  assumptions:'Scenario weekly effect spread uniformly across five independent normal daily shocks. Bayes update uses only official Monday Nikkei return and normal likelihood with daily sigma=weekly sigma/sqrt(5). Remaining four-session Gaussian variance scales 4/5. Compound realized Monday and remaining simple return. Subjective assumptions, not a calibrated real posterior.',
  limitations:[
    'Monday is after forecast cutoff; DO NOT alter archived Saturday point forecast or score it early.',
    'The five original shocks have no intrawEEK occurrence time; equal splitting is purely hypothetical.',
    'Volatility multipliers illustrate sensitivity; no parameters are estimated from Monday information.',
    'Do not treat China October macro events or Japan Q3 GDP omitted from frozen A as preregistered outcomes.',
    'Official Japan real GDP -0.0% is a rounded signed value; exact qoq not known.',
    'Cumulative China property investment rate is not a monthly October growth rate.',
    'End-of-week prices and upcoming official macro outcomes are pending.',
    'WTI matched fixed contract and other market close provenance still unresolved.'
  ]
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
