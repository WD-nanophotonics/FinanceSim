// Nov9 model sensitivity only. Original Nov7 forecast and inputs are immutable.
// Exact original 10-asset RNG order is preserved. No future observations used.
const fs=require('fs');
const s=JSON.parse(fs.readFileSync('research/inputs/2026-11-07-1200-snapshot.json','utf8'));
const f=JSON.parse(fs.readFileSync('research/weekly/2026-11-07-forecast.json','utf8'));
const names=Object.keys(s.market_baselines);
const eq=['sp500','nasdaq100','stoxx600','nikkei225','kospi','csi300'];
const postAsia=new Set(['sp500','nasdaq100','stoxx600']);
let seed=s.simulation_seed>>>0, spare=null;
function rng(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;}
function normal(){
 if(spare!==null){const v=spare;spare=null;return v;}
 const u=1-rng(),v=1-rng(),z=Math.sqrt(-2*Math.log(u));
 spare=z*Math.sin(2*Math.PI*v);return z*Math.cos(2*Math.PI*v);
}
const simulated=[];
for(let i=0;i<s.draws;i++){
 const shock=Object.fromEntries(names.map(k=>[k,0]));
 for(const event of s.subjective_scenarios)if(rng()<event.probability)
  for(const [k,v] of Object.entries(event.impacts))shock[k]+=v;
 const ret={};
 for(const k of names){
  const sd=s.market_baselines[k].sigma;
  normal();ret[k]=normal()*sd+shock[k];
 }
 simulated.push(eq.map(k=>ret[k]));
}
function probability(shift,mode){
 let hits=0;
 for(const row of simulated){
  let n=0;
  for(let j=0;j<eq.length;j++){
   const affected=mode==='all'||(mode==='postAsia'&&postAsia.has(eq[j]));
   if(row[j]+(affected?shift:0)<=-1.5)n++;
  }
  if(n>=3)hits++;
 }
 return {count:hits,p:hits/s.draws};
}
const frozen=f.risk_forecasts.breadth.arms.hybrid.event_probability;
if(probability(0,'all').p!==frozen)throw Error('frozen MC mismatch');
const result={record_type:'exploratory_synthetic_return_shift_sensitivity',
 frozen_forecast:'research/weekly/2026-11-07-forecast.json',
 input_snapshot:'research/inputs/2026-11-07-1200-snapshot.json',
 date:'2026-11-09',
 seed:s.simulation_seed,draws:s.draws,
 base_frozen_probability:frozen,
 definition:'at least three of SP500/NDX100/STOXX600/Nikkei/KOSPI/CSI300 fall >=1.5% by Friday',
 explanatory_only:true,not_empirically_calibrated:true,
 scenarios:{}};
for(const [name,mode] of [['six_synchronous','all'],['US_Europe_only_after_Asia_closes','postAsia']]){
 result.scenarios[name]={};
 for(const shift of [-1,-0.5,0,0.5,1]){
  const {count,p}=probability(shift,mode);
  result.scenarios[name][String(shift)]={shift_percentage_points:shift,hits:count,
    event_probability:p,delta_from_frozen_percentage_points:100*(p-frozen)};
 }
}
process.stdout.write(JSON.stringify(result,null,2)+'\n');
