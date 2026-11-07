// FinanceSim reproducible Nov7 forecast generator; no network, no external modules.
const fs = require("fs");
function generate(snapshot){
const s=snapshot, mk=s.market_baselines, mg=s.macro_baselines;
const rng=(()=>{let x=s.simulation_seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}})();
let spare=null;
function gaussian(){if(spare!==null){const z=spare;spare=null;return z;}let u=1-rng(),v=1-rng(),z=Math.sqrt(-2*Math.log(u));spare=z*Math.sin(2*Math.PI*v);return z*Math.cos(2*Math.PI*v);}
const norm=(x)=>{const t=1/(1+.2316419*Math.abs(x)),d=.398942280401433*Math.exp(-x*x/2),p=1-d*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+1.330274429*t))));return x>=0?p:1-p;};
const round=(x)=>Math.round(x*10000)/10000;
const Z={50:.674489750196,80:1.281551565545,90:1.644853626951};
const ints=(c,sd)=>Object.fromEntries(Object.entries(Z).map(([k,z])=>["interval_"+k,[round(c-z*sd),round(c+z*sd)]]));
const quant=(arr,p)=>{const at=(arr.length-1)*p,i=Math.floor(at);return arr[i]+(at-i)*(arr[Math.min(i+1,arr.length-1)]-arr[i]);};
const qs=(values)=>{const z=[...values].sort((a,b)=>a-b);return {interval_50:[round(quant(z,.25)),round(quant(z,.75))],interval_80:[round(quant(z,.1)),round(quant(z,.9))],interval_90:[round(quant(z,.05)),round(quant(z,.95))]};};
const normalArm=(c,sd,p,model)=>({model_id:model,point_change:round(c),prob_positive:round(p),...ints(c,sd)});
const forecast={record_type:"FinanceSim_three_arm_weekly_prospective",forecast_cutoff:s.information_cutoff,created_after_cutoff:true,simulation_executed:true,generator_path:"research/scripts/generate_2026_11_07.js",inputs_path:"research/inputs/2026-11-07-1200-snapshot.json",code_base_commit:s.prior_commit,seed:s.simulation_seed,draws:s.draws,model_version:"v0.4-weekly-events-manual",information_limitation:"Uses only Friday Nov6 or older observations, despite later Git publication. Source validity and actual publication time must be independently audited.",market_forecasts:{},macro_forecasts:{},risk_forecasts:{},unscorable_omissions:s.unscorable_omissions};
const names=Object.keys(mk),modes=["statistical","hybrid"];
const draws={statistical:Object.fromEntries(names.map(k=>[k,[]])),hybrid:Object.fromEntries(names.map(k=>[k,[]]))};
for(let i=0;i<s.draws;i++){
 const shocks=Object.fromEntries(names.map(k=>[k,0]));
 for(const e of s.subjective_scenarios)if(rng()<e.probability)for(const [k,delta] of Object.entries(e.impacts))shocks[k]+=delta;
 for(const k of names){const info=mk[k],stat=gaussian()*info.sigma;
  draws.statistical[k].push(stat);
  draws.hybrid[k].push(gaussian()*info.sigma+shocks[k]);
 }
}
for(const [k,v] of Object.entries(mk)){
 const lab=v.unit==="percent_yield"?"basis_points":"percent_return";
 const stat=draws.statistical[k],hyb=draws.hybrid[k];
 const hmean=hyb.reduce((a,b)=>a+b,0)/s.draws;
 forecast.market_forecasts[k]={group:"C",label:v.label,unit:lab,baseline_level:v.reference,baseline_unit:v.unit,target_at:v.close,target_date:"2026-11-13",definition:"(Nov13/Nov6-1)*100 percentage return" .replace("percentage return",lab==="basis_points"?"difference in yield * 100 basis points":"percentage return"),source:v.source,confidence:"low, subjective uncalibrated",data_quality:v.quality??"matched vendor/issuer reference needs audit",rationale:v.reason,arms:{
 llm:normalArm(v.llm_center,v.sigma*v.llm_scale,v.llm_p,"pure-llm-Nov7-v1"),
 statistical:normalArm(0,v.sigma,.5,"zero-drift-normal-assumed-vol-Nov7-v1"),
 hybrid:{model_id:"shared-shock-20000draw-MC-Nov7-v1",point_change:round(hmean),prob_positive:round(hyb.filter(x=>x>0).length/s.draws),...qs(hyb)}
 }};
}
for(const [k,v] of Object.entries(mg)){
 const delta=v.center-v.base,llmdelta=v.llm-v.base;
 const hybridP=norm(delta/v.sd);
 const stat=normalArm(0,v.sd,.5,"last-first-print-nochange-gaussian-Nov7");
 const llm=normalArm(llmdelta,v.sd*1.2,v.llm_p,"pure-llm-Nov7");
 const hybrid=normalArm(delta,v.sd,hybridP,"scenario-informed-normal-assumed-Nov7");
 for(const a of [stat,llm,hybrid])a.center_level=round(v.base+a.point_change);
 forecast.macro_forecasts[k]={group:"A",label:v.label,unit:v.unit,baseline_level:v.base,baseline_version:"prior-period first-publication as available at cutoff",definition:"first-published observed value minus frozen previous first published level in identical unit",target_at:v.target,source:v.source,confidence:"low uncalibrated; forecast interval model conditional",rationale:v.why,data_quality:v.quality??"first-vintage verification required",arms:{llm,statistical:stat,hybrid}};
}
function bOutputs(mode){const ds=draws[mode],r={sp_abs:[],wti_abs:[],yield_abs:[],breadth:[],joint:[]};for(let i=0;i<s.draws;i++){const sp=ds.sp500[i],wti=ds.wti[i],us10=ds.us10y[i];
 r.sp_abs.push(Math.abs(sp));r.wti_abs.push(Math.abs(wti));r.yield_abs.push(Math.abs(us10));
 r.breadth.push(["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"].filter(k=>ds[k][i]<=-1.5).length);
 r.joint.push(Number(sp<=-2&&wti>=5));
 }return r;}
const riskParams={sp_abs:{threshold:2,unit:"percent",label:"Absolute S&P500 weekly return >2%"},wti_abs:{threshold:5,unit:"percent",label:"Absolute WTI weekly return >5%"},yield_abs:{threshold:15,unit:"basis_points",label:"US10Y weekly absolute change >15bp"},breadth:{threshold:3,unit:"index_count",label:"At least three of six stocks decline >=1.5%"},joint:{threshold:1,unit:"binary_0or1",label:"S&P weekly <= -2% and WTI weekly >=+5%"}};
const manual={sp_abs:[2.0,.48,[.7,3.0],[.2,4.8],[.1,6.5]],wti_abs:[6.2,.56,[2.3,8.2],[.6,13.8],[.2,17.0]],yield_abs:[13,.39,[4,20],[1,31],[0,39]],breadth:[2.4,.43,[1,4],[0,5],[0,6]],joint:[.04,.04,[0,0],[0,0],[0,1]]};
const rr={statistical:bOutputs("statistical"),hybrid:bOutputs("hybrid")};
for(const [k,p] of Object.entries(riskParams)){
 const o={group:"B",label:p.label,definition:p.label,unit:p.unit,threshold:p.threshold,baseline_date:"2026-11-06",target_date:"2026-11-13",data_quality:k==="wti_abs"||k==="joint"?"WTI underlying futures quote provisional":null,confidence:"low uncalibrated, statistically dependent on group C",arms:{}};
 const b=manual[k];o.arms.llm={model_id:"pure-llm-Nov7",point_change:b[0],event_probability:b[1],interval_50:b[2],interval_80:b[3],interval_90:b[4]};
 for(const mode of modes){const z=rr[mode][k],eventP=z.filter(y=>k==="joint"?y===1:k==="breadth"?y>=p.threshold:y>p.threshold).length/s.draws;o.arms[mode]={model_id:mode==="hybrid"?"shared-event-MC-Nov7":"zero-drift-normal-MC-Nov7",point_change:round(z.reduce((a,b)=>a+b,0)/s.draws),event_probability:round(eventP),...qs(z)};}
 forecast.risk_forecasts[k]=o;
}
forecast.limits=s.warnings;
return forecast;
}
if (require.main === module) {
 const input=process.argv[2] || "research/inputs/2026-11-07-1200-snapshot.json";
 const output=generate(JSON.parse(fs.readFileSync(input,"utf8")));
 process.stdout.write(JSON.stringify(output,null,2)+"\\n");
}
