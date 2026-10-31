// FinanceSim week 2026-10-31 deterministic generator (Node 18+/V8), no external dependencies.
// INPUT: research/inputs/2026-10-31-1200-snapshot.json (fixed, publicly archived)
// OUTPUT: 3-arm prospective forecasts and shared-event MC risk states.
function run(snapshot){
const seed=20261031, n=20000;const keys=Object.keys(snapshot.markets);
function rngFactory(seed){let x=(seed>>>0)||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}}
const rng=rngFactory(seed), spare={value:null};
function gaussian(){if(spare.value!==null){const x=spare.value;spare.value=null;return x;}let u=1-rng(),v=1-rng();let r=Math.sqrt(-2*Math.log(u)),a=2*Math.PI*v;spare.value=r*Math.sin(a);return r*Math.cos(a);}
const zs={50:0.674489750196,80:1.281551565545,90:1.644853626951};
function q(sorted,p){let x=(sorted.length-1)*p,i=Math.floor(x);return sorted[i]+(x-i)*(sorted[Math.min(i+1,sorted.length-1)]-sorted[i]);}
function intervals(sorted){return {interval_50:[q(sorted,.25),q(sorted,.75)],interval_80:[q(sorted,.1),q(sorted,.9)],interval_90:[q(sorted,.05),q(sorted,.95)]};}
function normalInterval(point,sigma){return {interval_50:[point-zs[50]*sigma,point+zs[50]*sigma],interval_80:[point-zs[80]*sigma,point+zs[80]*sigma],interval_90:[point-zs[90]*sigma,point+zs[90]*sigma]};}
function bernoulliIntervals(p){const quantile=(a)=>(a<=1-p?0:1);return{interval_50:[quantile(.25),quantile(.75)],interval_80:[quantile(.1),quantile(.9)],interval_90:[quantile(.05),quantile(.95)]};}
function roundDeep(z){if(Array.isArray(z))return z.map(roundDeep);if(typeof z==="number")return Math.round(z*10000)/10000;if(z&&typeof z==="object")return Object.fromEntries(Object.entries(z).map(([k,v])=>[k,roundDeep(v)]));return z;}
const pure={
sp500:{point:-1.0,p:0.37},nasdaq100:{point:-1.6,p:0.34},stoxx600:{point:-0.45,p:0.43},
nikkei225:{point:-0.8,p:0.40},kospi:{point:-1.4,p:0.41},csi300:{point:-0.45,p:0.45},
gold:{point:-0.8,p:0.44},wti:{point:1.0,p:0.56},usdjpy:{point:-0.35,p:0.43},us10y:{point:2,p:0.54}};
const hybridDraw=Object.fromEntries(keys.map(k=>[k,[]])),statDraw=Object.fromEntries(keys.map(k=>[k,[]]));
for(let i=0;i<n;i++){let active=snapshot.events.filter(e=>rng()<e.p);
for(let k of keys){const cfg=snapshot.markets[k];let impact=active.reduce((a,e)=>a+(e.impacts[k]||0),0);
 hybridDraw[k].push(cfg.prior+impact+cfg.sigma_weekly*gaussian());
 statDraw[k].push(cfg.sigma_weekly*gaussian());}}
function summary(draws,k){const s=draws.slice().sort((a,b)=>a-b),avg=draws.reduce((a,b)=>a+b,0)/n;
return{point_change:avg,prob_positive:draws.filter(x=>x>0).length/n,...intervals(s)};}
const marketForecasts={};
for(const k of keys){const cfg=snapshot.markets[k],hybrid=summary(hybridDraw[k],k),statistical=summary(statDraw[k],k),llm=pure[k];
marketForecasts[k]={group:"C",unit:k==="us10y"?"basis_points":"percent_return",
 baseline_level:cfg.value,baseline_unit:cfg.unit,target_date:"2026-11-06",target_time:k==="nikkei225"?"15:30 JST":k==="csi300"?"15:00 CST":k==="kospi"?"15:30 KST":k==="stoxx600"?"17:30 CET":k==="us10y"?"US Treasury daily publication":k==="wti"?"NYMEX Dec26 settlement":"Friday vendor daily closing quote",
 definition:k==="us10y"?"Treasury official Nov6 minus Oct30 10Y par yield, times 100 bp":k==="wti"?"Same NYMEX Dec26 contract settlement Nov6/Oct30 simple percent return (provisional input)":"Nov6/Oct30 daily close percentage return in local instrument currency from frozen provider",
 source:cfg.source,confidence:"low, uncalibrated",
 arms:{
 llm:{model_id:"LLM-subjective-v20261031",point_change:llm.point,prob_positive:llm.p,...normalInterval(llm.point,cfg.sigma_weekly*1.2)},
 statistical:{model_id:"zero-drift-Gaussian-assumed-weekly-vol-v2",...statistical},
 hybrid:{model_id:"six-event-common-shock-MonteCarlo-v2",...hybrid}
 }}}
const macro_specs=[
{id:"claims_nov05",label:"US initial jobless claims first release for Oct31 reference week, thousands persons",base:194,unit:"thousands_persons",target:"2026-11-05T08:30:00-05:00",centers:[196,194,195],probs:[.55,.5,.53],stds:[9,8,9],source:snapshot.macro_last.claims.source},
{id:"wei_nov05",label:"Dallas Fed WEI first release for week ended Oct31, index points",base:2.98,unit:"index_points",target:"2026-11-05T10:30:00-06:00",centers:[2.85,2.98,2.87],probs:[.43,.5,.45],stds:[.55,.48,.55],source:snapshot.macro_last.wei.source},
{id:"ism_mfg_nov02",label:"ISM October manufacturing PMI first release",base:54.5,unit:"index_points",target:"2026-11-02T10:00:00-05:00",centers:[54.0,54.5,54.1],probs:[.40,.5,.43],stds:[1.6,1.5,1.6],source:snapshot.macro_last.ism_mfg.source},
{id:"ism_services_nov04",label:"ISM October services PMI first release",base:54.9,unit:"index_points",target:"2026-11-04T10:00:00-05:00",centers:[54.5,54.9,54.7],probs:[.42,.5,.46],stds:[1.7,1.6,1.7],source:snapshot.macro_last.ism_services.source},
{id:"nonfarm_payroll_nov06",label:"BLS October nonfarm payrolls first release, thousands person change",base:29,unit:"thousands_persons",target:"2026-11-06T08:30:00-05:00",centers:[65,29,72],probs:[.61,.5,.64],stds:[110,110,110],source:snapshot.macro_last.nfp.source},
{id:"unemployment_rate_nov06",label:"BLS October unemployment rate first release, percentage",base:4.2,unit:"percent",target:"2026-11-06T08:30:00-05:00",centers:[4.2,4.2,4.2],probs:[.42,.5,.45],stds:[.2,.2,.2],source:snapshot.macro_last.unemployment.source}
];
const macroForecasts={};
for(const x of macro_specs){const arms={};["llm","statistical","hybrid"].forEach((a,i)=>{
const pt=x.centers[i]-x.base,iv=normalInterval(pt,x.stds[i]);arms[a]={model_id:a==="llm"?"LLM-20261031":a==="statistical"?"no-change-baseline": "narrative-event-adjusted",center_level:x.centers[i],point_change:pt,prob_positive:x.probs[i],...iv};});
macroForecasts[x.id]={group:"A",label:x.label,definition:"First published level compared to frozen previous first-released level; positive means higher than reference",unit:x.unit,baseline_level:x.base,target_at:x.target,source:x.source,confidence:"low, uncalibrated",arms};}
for(const b of [
{id:"rba_hike_nov03",label:"RBA raises cash rate by at least 0.25 percentage points at Nov3 meeting",target:"2026-11-03T14:30:00+11:00",source:snapshot.macro_last.rba_rate.source,probs:[.78,.81,.79],prev:4.6},
{id:"boe_hike_nov05",label:"BoE raises Bank Rate by at least 0.25 percentage points at Nov5 meeting",target:"2026-11-05T12:00:00+00:00",source:snapshot.macro_last.boe_rate.source,probs:[.75,.88,.80],prev:3.75}
]){macroForecasts[b.id]={group:"A",label:b.label,definition:"Binary 1 if specified rate hike occurs at scheduled meeting, otherwise 0",unit:"binary_0or1",baseline_level:b.prev,rate_unit:"percent",target_at:b.target,source:b.source,confidence:"medium but uncalibrated",arms:Object.fromEntries(["llm","statistical","hybrid"].map((arm,i)=>[arm,{model_id:arm==="statistical"?"as-of-market-implied-prob":arm==="llm"?"LLM-20261031":"LLM-adjusted-market-implied",point_change:b.probs[i],prob_positive:b.probs[i],...bernoulliIntervals(b.probs[i])}]))};}
function riskFrom(draws){let r={sp_abs:[],wti_abs:[],yield_abs:[],breadth:[],joint:[]};
for(let i=0;i<n;i++){const s=draws.sp500[i],w=draws.wti[i],y=draws.us10y[i];
r.sp_abs.push(Math.abs(s));r.wti_abs.push(Math.abs(w));r.yield_abs.push(Math.abs(y));
r.breadth.push(["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"].filter(k=>draws[k][i]<=-1.5).length);
r.joint.push(Number(s<=-2&&w>=5));}
return r;}
const rb=riskFrom(statDraw),rh=riskFrom(hybridDraw);
const specs=[
{id:"sp_abs",label:"Absolute S&P500 weekly percent return",threshold:2,threshold_op:"abs(return)>2%",unit:"percent",llm:{pt:2.2,p:.52,iv50:[.8,2.9],iv80:[.25,4.7],iv90:[.1,6.2]}},
{id:"wti_abs",label:"Absolute Dec26 WTI weekly percent return",threshold:5,threshold_op:"abs(return)>5%",unit:"percent",llm:{pt:5.0,p:.48,iv50:[2,7.1],iv80:[.4,11],iv90:[.1,14]}},
{id:"yield_abs",label:"Absolute US10Y Treasury weekly yield move",threshold:15,threshold_op:"abs(change)>15bp",unit:"basis_points",llm:{pt:16,p:.46,iv50:[6,23],iv80:[1,33],iv90:[0,45]}},
{id:"breadth",label:"Number of 6 major equity indices down at least 1.5% for the week",threshold:3,threshold_op:"count>=3",unit:"index_count",llm:{pt:2.0,p:.33,iv50:[1,3],iv80:[0,4],iv90:[0,5]}},
{id:"joint",label:"S&P500 return <=-2% AND WTI return >=+5%",threshold:1,threshold_op:"event==1",unit:"binary_0or1",llm:{pt:.06,p:.06,iv50:[0,0],iv80:[0,0],iv90:[0,1]}}
];
const riskForecasts={};
for(const x of specs){
 function score(values){const s=values.slice().sort((a,b)=>a-b),point=values.reduce((a,b)=>a+b,0)/n;let ep=values.filter(z=>x.id==="joint"?z===1:z>x.threshold || (x.id==="breadth"&&z>=x.threshold)).length/n;return {point_change:point,event_probability:ep,...intervals(s)};}
 const ss=score(rb[x.id]),hs=score(rh[x.id]),l=x.llm;
 riskForecasts[x.id]={group:"B",label:x.label,definition:x.threshold_op+" at Oct30 vs Nov6 matched closes",unit:x.unit,threshold:x.threshold,baseline_date:"2026-10-30",target_date:"2026-11-06",confidence:"low, uncalibrated; derived from market predictions",arms:{
 llm:{model_id:"LLM-manual-20261031",point_change:l.pt,event_probability:l.p,interval_50:l.iv50,interval_80:l.iv80,interval_90:l.iv90},
 statistical:{model_id:"independent-zero-drift-Gaussian",...ss},
 hybrid:{model_id:"common-event-MC",...hs}}};
}
return roundDeep({record_type:"FinanceSim 3-arm forward forecast",forecast_cutoff:"2026-10-31T12:00:00+09:00",created_after_cutoff:true,inputs_path:"research/inputs/2026-10-31-1200-snapshot.json",generator_path:"research/scripts/generate_2026_10_31.js",seed,n,model_version:"v0.3-weekly-scenario-1",simulation_executed:true,simulation_assumptions:"20000 seeded samples; independent event occurrence with common cross-asset impact vectors, independent normal residual noise, values in percent changes except yield basis points",measurement_info:"A first-release official/established monthly/weekly values; B derived from C outcomes; C use fixed instrument/vendor Friday closes Oct30 -> Nov6, note Nov3 JP exchange holiday, US Nov1 DST change",market_forecasts:marketForecasts,macro_forecasts:macroForecasts,risk_forecasts:riskForecasts,limits:snapshot.caveats});}
if(typeof module!=="undefined"&&module.exports)module.exports={run};
if(typeof require!=="undefined" && require.main===module){const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));process.stdout.write(JSON.stringify(run(x),null,2)+"\n");}
