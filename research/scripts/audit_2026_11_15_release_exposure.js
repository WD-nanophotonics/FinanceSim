// Deterministic 32-state conditional Gaussian/Poisson-binomial study.
// Archive is post-2026-11-14-noon and before 2026-11-16 to 20 outcomes.
const fs = require('fs');
const snapshot = JSON.parse(fs.readFileSync('research/inputs/2026-11-14-1200-snapshot.json', 'utf8'));
const frozen = JSON.parse(fs.readFileSync('research/weekly/2026-11-14-forecast-corrected-b01.json', 'utf8'));
const clock = JSON.parse(fs.readFileSync('research/inputs/2026-11-15-release-clock.json', 'utf8'));
const ids = ['sp500','nasdaq100','stoxx600','nikkei225','kospi','csi300'];
const days = ['16','17','18','19','20'];
const dates = {};
for (const m of clock.markets) {
  dates[m.id] = days.map(d => '2026-11-' + d + 'T' + m.close + m.tz);
}
const exposure = clock.events.map(e => {
  const et = Date.parse(e.at);
  if (!(et > Date.parse(snapshot.scheduled_cutoff))) throw Error('Past or invalid event clock: '+e.id);
  const byMarket = {};
  for (const id of ids) {
    const next = dates[id].filter(t => Date.parse(t) > et);
    byMarket[id] = {
      first_close_after_publication: next.length ? next[0] : null,
      eligible_closing_sessions: next.length,
      exact_close_collision: dates[id].some(t => Date.parse(t) === et)
    };
  }
  return {id:e.id, scheduled_at:e.at, utc:new Date(et).toISOString(), by_market:byMarket};
});
const stateJobs = exposure.find(e => e.id === 'us_state_jobs');
const eligible = ids.filter(id => stateJobs.by_market[id].eligible_closing_sessions > 0);
if (eligible.join(',') !== 'sp500,nasdaq100,stoxx600') throw Error('Unexpected US Friday release exposure');
if (!exposure.find(e => e.id === 'dallas_wei').by_market.stoxx600.exact_close_collision)
  throw Error('Dallas Fed nominal WEI release not at European cash-close boundary');
if (snapshot.events.length !== 5) throw Error('Model event count changed');
function normCDF(z) {
  const x=Math.abs(z),t=1/(1+.2316419*x),d=.3989422804014327*Math.exp(-x*x/2);
  const a=d*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return z>=0 ? 1-a : a;
}
function poissonAtLeastThree(p) {
  let z=[1];
  for (const q of p) {
    const next=Array(z.length+1).fill(0);
    for(let i=0;i<z.length;i++){next[i]+=z[i]*(1-q);next[i+1]+=z[i]*q;}
    z=next;
  }
  return z.slice(3).reduce((a,b)=>a+b,0);
}
const configs = [
  {id:'unshocked',shock:0,gate:false},
  {id:'all_six_minus1_pp',shock:-1,gate:false},
  {id:'eligible_only_minus1_pp',shock:-1,gate:true},
  {id:'all_six_minus2_pp',shock:-2,gate:false},
  {id:'eligible_only_minus2_pp',shock:-2,gate:true}
];
const totals=Object.fromEntries(configs.map(x=>[x.id,0]));
const marg=Object.fromEntries(ids.map(id=>[id,0]));
let weightSum=0;
for(let mask=0; mask<(1<<snapshot.events.length); mask++) {
  const fired=snapshot.events.map((e,i)=>(mask>>i)&1);
  let weight=1;
  for(let i=0;i<fired.length;i++) weight*=fired[i] ? snapshot.events[i].p : 1-snapshot.events[i].p;
  weightSum+=weight;
  const mu={};
  for(const id of ids) {
    mu[id]=snapshot.market[id].hybrid;
    for(let i=0;i<fired.length;i++)
      mu[id]+=(fired[i]-snapshot.events[i].p)*(snapshot.events[i].effects[id]||0);
    marg[id]+=weight*normCDF((-1.5-mu[id])/snapshot.market[id].sigma);
  }
  for(const config of configs) {
    const p=ids.map(id=>{
      const extra=config.gate && !eligible.includes(id) ? 0 : config.shock;
      return normCDF((-1.5-mu[id]-extra)/snapshot.market[id].sigma);
    });
    totals[config.id]+=weight*poissonAtLeastThree(p);
  }
}
if(Math.abs(weightSum-1)>1e-10)throw Error('Event-tree probability weight not 1');
const shadow=poissonAtLeastThree(ids.map(id=>marg[id]));
const frozenProbability=frozen.risk_forecasts.breadth.arms.hybrid.event_probability;
if(Math.abs(totals.unshocked-frozenProbability)>.02)
  throw Error('Exact mixture too different from 20,000-draw frozen Monte Carlo');
const pp=(x,y)=>(x-y)*100;
const result={
 record_type:'ex_ante_exact_gaussian_mixture_release_clock_stress',
 date:'2026-11-15',
 executed:true,
 snapshot_path:'research/inputs/2026-11-14-1200-snapshot.json',
 schedule_path:'research/inputs/2026-11-15-release-clock.json',
 frozen_forecast_path:'research/weekly/2026-11-14-forecast-corrected-b01.json',
 frozen_seed:snapshot.seed,
 seed_used_for_exact_method:null,
 new_monte_carlo_draws:0,
 event_tree_states:1<<snapshot.events.length,
 event_clock_count:exposure.length,
 equity_index_count:ids.length,
 release_market_cells:exposure.length*ids.length,
 information_cutoff:snapshot.scheduled_cutoff,
 market_observations_through:'2026-11-13 Friday closes only',
 exposure_rule:'Scheduled public release time must be strictly BEFORE the instrument Friday cash close; equality postpones eligibility, and publisher delays can reduce exposure.',
 event_exposure:exposure,
 us_state_jobs_nov20_eligible:eligible,
 us_state_jobs_nov20_not_eligible:ids.filter(id=>!eligible.includes(id)),
 wei_stoxx_close_collision:true,
 evaluation_definition:'P(at least 3 of 6 equity indices return <= -1.5% over Nov13-Nov20)',
 numerical_method:'Enumerate all 2^5 independent centered-Bernoulli scenario combinations; conditional independent Gaussian asset innovations integrated using normal CDF approximation, with exact Poisson-binomial tail per scenario; weighted summation removes Monte Carlo sampling error but not model uncertainty.',
 archived_MC_breadth_probability:frozenProbability,
 exact_breadth_probabilities:totals,
 same_marginal_independent_shadow:shadow,
 unconditional_market_tail_marginals:marg,
 effects_percentage_points:{
  event_dependence_residual:pp(totals.unshocked,shadow),
  overestimate_if_all_six_minus1:pp(totals.all_six_minus1_pp,totals.eligible_only_minus1_pp),
  overestimate_if_all_six_minus2:pp(totals.all_six_minus2_pp,totals.eligible_only_minus2_pp),
  eligible_only_effect_minus1:pp(totals.eligible_only_minus1_pp,totals.unshocked),
  eligible_only_effect_minus2:pp(totals.eligible_only_minus2_pp,totals.unshocked)
 },
 scenario_weight_sum:weightSum,
 hypothetical_stress:'Apply a synthetic -1 or -2 percentage-point add-on to weekly index returns after Friday Nov20 10am EST state-employment publication, for cash markets whose Friday closes occur later. This is NOT an estimated actual response, causal effect, or real trade recommendation.',
 caveats:[
  'No Nov16-Nov20 outcomes used; all result probabilities are model-conditional.',
  'State-employment macro news is not an original frozen shock; synthetic stress does not amend the original forecast.',
  'Five broad frozen shocks are not themselves dated event releases; event-time alignment requires a new model.',
  'Normal CDF approximation and conditional Gaussian independence are not empirically calibrated.',
  'Regular equity trading hours are assumed; venue holidays and exceptional halts not separately authenticated.',
  'Dallas Fed nominal Thursday 10:30am CT update is at or shortly after that time, so same-instant European close is ambiguous and conservatively excluded.',
  'A deterministic integral has zero Monte Carlo variance, but sampling uncertainty from real markets remains unknown.'
 ]
};
process.stdout.write(JSON.stringify(result,null,2)+String.fromCharCode(10));
