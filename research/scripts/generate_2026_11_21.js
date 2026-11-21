// Node 18+ deterministic FinanceSim Nov21 2026 scenario forecast. No network I/O.
const fs=require("fs");

function generate(s) {
 const names=Object.keys(s.market), arms=["llm","statistical","hybrid"];
 let state=s.seed>>>0, spare=null;
 const rng=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 const normal=()=>{if(spare!==null){const v=spare;spare=null;return v;}const u=Math.max(1e-12,1-rng()),v=Math.max(1e-12,1-rng());const r=Math.sqrt(-2*Math.log(u)),ang=2*Math.PI*v;spare=r*Math.sin(ang);return r*Math.cos(ang);};
 const round=x=>Math.round(x*10000)/10000;
 const quantile=(arr,p)=>{let t=(arr.length-1)*p,i=Math.floor(t);return arr[i]+(t-i)*(arr[Math.min(i+1,arr.length-1)]-arr[i]);};
 const intervals=(xs)=>{const a=[...xs].sort((x,y)=>x-y);return {interval_50:[round(quantile(a,.25)),round(quantile(a,.75))],interval_80:[round(quantile(a,.1)),round(quantile(a,.9))],interval_90:[round(quantile(a,.05)),round(quantile(a,.95))]};};
 const zs={50:.674489750196,80:1.281551565545,90:1.644853626951};
 const normalIntervals=(mu,sd)=>({interval_50:[round(mu-zs[50]*sd),round(mu+zs[50]*sd)],interval_80:[round(mu-zs[80]*sd),round(mu+zs[80]*sd)],interval_90:[round(mu-zs[90]*sd),round(mu+zs[90]*sd)]});
 const cdf=(x)=>{const a=Math.abs(x),t=1/(1+.2316419*a),d=.3989422804014327*Math.exp(-a*a/2),v=1-d*(.319381530*t-.356563782*t*t+1.781477937*t*t*t-1.821255978*t*t*t*t+1.330274429*t*t*t*t*t);return x>=0?v:1-v;};
 const n=s.n;
 const draws={statistical:{},hybrid:{}}, sums={statistical:{},hybrid:{}}, pos={statistical:{},hybrid:{}};
 for(const arm of ["statistical","hybrid"])for(const id of names){draws[arm][id]=[];sums[arm][id]=0;pos[arm][id]=0;}
 const scenarios=s.scenarios;
 for(let i=0;i<n;i++){
   const flags=scenarios.map(e=>rng()<e.p);
   for(const id of names){
     const v=s.market[id],z=normal(),stat=v.sigma_week*z;
     let hybrid=v.hybrid_residual_center+v.sigma_week*z;
     for(let e=0;e<scenarios.length;e++)if(flags[e])hybrid+=(scenarios[e].impacts[id]||0);
     for(const [arm,ret] of [["statistical",stat],["hybrid",hybrid]]){
       draws[arm][id].push(ret);sums[arm][id]+=ret;if(ret>0)pos[arm][id]++;
     }
   }
 }
 const market_forecasts={};
 for(const [id,x] of Object.entries(s.market)){
   const unit=(["us2y","us10y","us30y"].includes(id)?"basis_points":"percent_return");
   market_forecasts[id]={group:"C",name:x.name,reference_level:x.reference,reference_unit:x.reference_unit,target_date:x.target_date,target_close_rule:x.target_close_rule,unit,source:x.source_url,quality:x.quality,confidence:"low, uncalibrated",arms:{
    llm:{model_id:"LLM-Nov21-subjective",point_change:round(x.llm_point_change),prob_positive:x.llm_prob_positive,...normalIntervals(x.llm_point_change,1.15*x.sigma_week)},
    statistical:{model_id:"zero-drift-assumed-vol-Nov21",point_change:round(sums.statistical[id]/n),prob_positive:round(pos.statistical[id]/n),...intervals(draws.statistical[id])},
    hybrid:{model_id:"shared-shock-MC-20261121",point_change:round(sums.hybrid[id]/n),prob_positive:round(pos.hybrid[id]/n),...intervals(draws.hybrid[id])}
   }};
 }
 const macro_forecasts={};
 for(const [id,x] of Object.entries(s.macro)){
   const make=(mu,p,sd,model_id)=>({model_id,center_level:round(mu),point_change:round(mu-x.reference),prob_positive:round(p),...normalIntervals(mu-x.reference,sd)});
   macro_forecasts[id]={group:"A",name:x.name,definition:x.definition,unit:x.unit,reference_level:x.reference,target_at:x.target_at,release_status:x.release_status,source:x.source_url,confidence:"low, subjective/model-conditional",arms:{
     llm:make(x.llm_center_level,x.llm_prob_positive,1.15*x.sigma_change,"LLM-Nov21-subjective"),
     statistical:make(x.reference,.5,x.sigma_change,"first-vintage-no-change-sigma-assumed"),
     hybrid:make(x.hybrid_center_level,cdf((x.hybrid_center_level-x.reference)/x.sigma_change),x.sigma_change,"scenario-judgement-adjusted-normal-Nov21")
   }};
 }
 const riskDefs={
   sp_abs:{name:"|S&P500 weekly return| >2%",unit:"percent",target_value:a=>Math.abs(a.sp500),event_value:v=>v>2},
   wti_abs:{name:"|WTI provisional weekly return| >5%",unit:"percent",target_value:a=>Math.abs(a.wti),event_value:v=>v>5},
   yield_abs:{name:"|US10Y yield change| >15bp",unit:"basis_points",target_value:a=>Math.abs(a.us10y),event_value:v=>v>15},
   breadth:{name:"At least 3 of six equity indexes fall >=1.5%",unit:"index_count",target_value:a=>["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"].filter(id=>a[id]<=-1.5).length,event_value:v=>v>=3},
   joint:{name:"S&P500 <=-2% and WTI >=5%",unit:"binary_0or1",target_value:a=>(a.sp500<=-2&&a.wti>=5)?1:0,event_value:v=>v===1}
 };
 const risk_forecasts={};
 const llmRisk={sp_abs:[3.4,.65,[1.0,5.0],[.3,7.3],[.15,9.0]],wti_abs:[5.0,.48,[1.4,7],[.4,12],[.2,15]],yield_abs:[19,.53,[5,28],[1,42],[.5,50]],breadth:[2.7,.42,[1,4],[0,6],[0,6]],joint:[.09,.09,[0,0],[0,1],[0,1]]};
 for(const [id,d] of Object.entries(riskDefs)){
    const a={};for(const arm of ["statistical","hybrid"]){
      const observations=[];for(let i=0;i<n;i++){const one={};for(const name of names)one[name]=draws[arm][name][i];observations.push(d.target_value(one));}
      const count=observations.filter(d.event_value).length;
      a[arm]={model_id:arm==="statistical"?"independent-zero-drift-sigma-assumed":"shared-shock-MC-20261121",point_change:round(observations.reduce((x,y)=>x+y,0)/n),event_probability:round(count/n),...intervals(observations)};
    }
    const L=llmRisk[id];
    a.llm={model_id:"LLM-Nov21-subjective",point_change:L[0],event_probability:L[1],interval_50:L[2],interval_80:L[3],interval_90:L[4]};
    risk_forecasts[id]={group:"B",name:d.name,definition:s.risk_definitions[id],unit:d.unit,quality:id==="wti_abs"||id==="joint"?"WTI continuous contract: conditional probability and future settlement": "Derived from C, not independent observations",confidence:"low, uncalibrated",arms:a};
 }
 return {record_type:"FinanceSim_three_arm_weekly_forecast_Nov21",information_cutoff:s.data_cutoff,created_after_cutoff:true,model_version:s.model_version,input_path:"research/inputs/2026-11-21-1200-snapshot.json",generator_path:"research/scripts/generate_2026_11_21.js",source_commit:s.source_commit,seed:s.seed,draws:n,arm_ids:arms,holiday_rules:s.quality.holiday,market_forecasts,macro_forecasts,risk_forecasts,scenarios:s.scenarios,missingness:"No official fixed NYMEX contract identity for WTI. Thanksgiving week DOL/Dallas release times provisional; evaluate only released first vintages.",limitations:[s.quality.all_scenario_probabilities,s.quality.sigma,s.quality.statistical,s.quality.llm,s.quality.hybrid,"No observations later than information cutoff used. Public Git commit time is actual seal, after scheduled noon.","Three different forecasting arms use common definitions; baseline itself is a simple assumed normal null model, not empirically fitted.","B events derived from C assets, so B and C outcomes must not be counted as independent wins."]};
}

if (require.main===module){const p=process.argv[2]||"research/inputs/2026-11-21-1200-snapshot.json";const s=JSON.parse(fs.readFileSync(p,"utf8"));process.stdout.write(JSON.stringify(generate(s),null,2)+"\n");}
module.exports={generate};
