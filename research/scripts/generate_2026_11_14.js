// Node 18+ deterministic replay. INPUT a frozen repository JSON file only; NO network.
const fs = require("fs");
function generate(s) {
 const k=Object.keys(s.market), rng=(()=>{let x=s.seed>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}})();
 let spare=null;
 function normal(){if(spare!==null){const v=spare;spare=null;return v;}const u=Math.max(1e-12,1-rng()),v=1-rng(),a=Math.sqrt(-2*Math.log(u)),b=2*Math.PI*v;spare=a*Math.sin(b);return a*Math.cos(b);}
 function q(v,p){const z=(v.length-1)*p,i=Math.floor(z);return v[i]+(z-i)*(v[Math.min(i+1,v.length-1)]-v[i]);}
 function round(n){return Math.round(n*10000)/10000;}
 function ints(vals){vals.sort((a,b)=>a-b);return {interval_50:[round(q(vals,.25)),round(q(vals,.75))],interval_80:[round(q(vals,.10)),round(q(vals,.90))],interval_90:[round(q(vals,.05)),round(q(vals,.95))]};}
 const z={50:.67448975,80:1.28155156,90:1.64485363};
 function gauss(center,sd){return {interval_50:[round(center-z[50]*sd),round(center+z[50]*sd)],interval_80:[round(center-z[80]*sd),round(center+z[80]*sd)],interval_90:[round(center-z[90]*sd),round(center+z[90]*sd)]};}
 function cdf(x){const a=Math.abs(x), t=1/(1+.2316419*a),d=.39894228*Math.exp(-a*a/2),c=1-d*t*(.31938153+t*(-.35656378+t*(1.78147794+t*(-1.82125598+t*1.33027443))));return x>=0?c:1-c;}
 let hybrid={},stat={};for(const id of k){hybrid[id]=[];stat[id]=[];}
 for(let i=0;i<s.draws;i++){
   const firing=s.events.map(e=>Number(rng()<e.p)-e.p);
   for(const id of k){let d=s.market[id],sh=d.hybrid;for(let j=0;j<firing.length;j++)sh+=firing[j]*(s.events[j].effects[id]||0);hybrid[id].push(sh+d.sigma*normal());stat[id].push(d.sigma*normal());}
 }
 const C={};
 for(const id of k){const d=s.market[id],hy=hybrid[id],point=round(hy.reduce((a,b)=>a+b,0)/hy.length),p=round(hy.filter(x=>x>0).length/hy.length),y=d.unit==="percent_yield"?"basis_points":"percent_return";const mk=(mid,point,pp,inter)=>({model_id:mid,point_change:round(point),prob_positive:round(pp),...inter});C[id]={group:"C",name:d.name,baseline_level:d.base,baseline_unit:d.unit,unit:y,source:d.source,source_quality:d.quality||"provider Friday close, verify upon settlement",reference_date:"2026-11-13",target_date:"2026-11-20",target_local_close: id==="nikkei225"?"2026-11-20T15:30:00+09:00":id==="kospi"?"2026-11-20T15:30:00+09:00":id==="csi300"?"2026-11-20T15:00:00+08:00":id==="stoxx600"?"2026-11-20T17:30:00+01:00":(id==="sp500"||id==="nasdaq100")?"2026-11-20T16:00:00-05:00":"2026-11-20 Friday same vendor cutoff; exact posting timestamp may differ",confidence:s.confidence,arms:{llm:mk("LLM-Nov14-subjective",d.llm,d.llmp,gauss(d.llm,1.24*d.sigma)),statistical:mk("zero-drift-assumed-normal-Nov14",0,.5,gauss(0,d.sigma)),hybrid:mk("common-shock-MC-Nov14",point,p,ints(hy))}};}
 const A={};
 for(const [id,d] of Object.entries(s.macro)){const shift=d.point-d.base,ps=d.llm-d.base;function mk(mid,point,pp,sd){return {model_id:mid,center_level:round(d.base+point),point_change:round(point),prob_positive:round(pp),...gauss(point,sd)};}A[id]={group:"A",name:d.name,baseline_level:d.base,unit:d.unit,reference_period:"prior original first-release observation, not revised",target_at:d.release,source:d.source,source_quality:d.quality||"publisher first release must be verified",confidence:s.confidence,arms:{llm:mk("LLM-Nov14-subjective",ps,d.llmp,d.sigma*1.25),statistical:mk("first-vintage-no-change",0,.5,d.sigma),hybrid:mk("assumed-normal-event-adjusted-Nov14",shift,cdf(shift/d.sigma),d.sigma)}};}
 function avg(v){return v.reduce((a,b)=>a+b,0)/v.length;}
 function stats(arr,fn){return {point_change:round(avg(arr.map(fn))),...ints(arr.map(fn))};}
 const sAbs=arr=>arr.map(x=>Math.abs(x)),yAbs=arr=>arr.map(x=>Math.abs(x));
 const t2=([r])=>r>2,t5=([r])=>r>5,thr=([r])=>r>15;
 const hyRows=[],stRows=[];
 for(let i=0;i<s.draws;i++){hyRows.push(k.map(id=>hybrid[id][i]));stRows.push(k.map(id=>stat[id][i]));}
 function pick(row,id){return row[k.indexOf(id)];}
 function riskData(rows){return {
  sp_abs:rows.map(x=>Math.abs(pick(x,"sp500"))), wti_abs:rows.map(x=>Math.abs(pick(x,"wti"))),
  yield_abs:rows.map(x=>Math.abs(pick(x,"us10y"))),
  breadth:rows.map(x=>["sp500","nasdaq100","stoxx600","nikkei225","kospi","csi300"].filter(id=>pick(x,id)<=-1.5).length),
  joint:rows.map(x=>Number(pick(x,"sp500")<=-2&&pick(x,"wti")>=5))
 };}
 const datH=riskData(hyRows),datS=riskData(stRows);
 const defs={sp_abs:{name:"Absolute S&P500 weekly return >2%",unit:"percent",thresh:2,llm_point:1.9,llm_p:.47,llm_int:[[.6,2.7],[.2,4.8],[.1,6.3]]},wti_abs:{name:"Absolute WTI weekly return >5%",unit:"percent",thresh:5,llm_point:5.8,llm_p:.52,llm_int:[[2,8],[.6,12.5],[.2,16]]},yield_abs:{name:"US10Y weekly absolute change >15bp",unit:"basis_points",thresh:15,llm_point:14,llm_p:.44,llm_int:[[5,21],[1,33],[.3,40]]},breadth:{name:"At least 3 of 6 equity indices decline 1.5%+",unit:"index_count",thresh:3,llm_point:2,llm_p:.37,llm_int:[[1,3],[0,5],[0,6]]},joint:{name:"S&P500 weekly <=-2% AND WTI >=+5%",unit:"binary_0or1",thresh:1,llm_point:.05,llm_p:.05,llm_int:[[0,0],[0,0],[0,1]]}};
 const B={};for(const [id,d] of Object.entries(defs)){function isEvent(x){return id==="joint"?x===1:x>=d.thresh+(id==="sp_abs"||id==="wti_abs"||id==="yield_abs"?1e-10:0);}const hh=datH[id],ss=datS[id],h=stats(hh,x=>x),v=stats(ss,x=>x),pr=(arr)=>round(arr.filter(isEvent).length/arr.length);
 const arm=(mid,point,p,int)=>({model_id:mid,point_change:round(point),event_probability:round(p),...int});
 B[id]={group:"B",name:d.name,unit:d.unit,definition:d.name,quality:id==="wti_abs"||id==="joint"?"WTI continuous-provisional contract quality":"Derived from same Group C simulation, correlated; not independent evidence",arms:{llm:arm("LLM-Nov14-subjective",d.llm_point,d.llm_p,{interval_50:d.llm_int[0],interval_80:d.llm_int[1],interval_90:d.llm_int[2]}),statistical:arm("zero-drift-MC-Nov14",v.point_change,pr(ss),v),hybrid:arm("common-shock-MC-Nov14",h.point_change,pr(hh),h)}};}
 return {record_type:"FinanceSim_three_arm_weekly_prospective",forecast_cutoff:s.scheduled_cutoff,created_after_cutoff:"See actual archive GitHub commit timestamp; do not claim noon commit",source_input:"research/inputs/2026-11-14-1200-snapshot.json",generator:"research/scripts/generate_2026_11_14.js",seed:s.seed,draws:s.draws,model_version:"v0.5-marginal-common-event-exploratory",model_source_commit:s.model_source_commit,arm_ids:["llm","statistical","hybrid"],units:"Equity/spot/futures simple percentage return; Treasury yields basis-point change; macro differences versus prior first release",macro_forecasts:A,risk_forecasts:B,market_forecasts:C,scenarios:s.events,omissions:s.data_omissions,notes:[...s.restrictions,"Unverified price vendors and missing first-release baseline must be omitted from definitive scoring until audited. Probabilities are subjective/model conditional, not backtest calibrated.","Shared shocks in hybrid are independently Bernoulli but act on all assets. Independence of event triggers remains a limitation.","Statistical model uses zero-drift and ASSUMED sigma; no estimated drift or fitted statistical time series.","LLM centers/probabilities are manually authored and are not model-generated sampled calibration."]};}
const inPath=process.argv[2]||"research/inputs/2026-11-14-1200-snapshot.json";
const input=JSON.parse(fs.readFileSync(inPath,"utf8"));
process.stdout.write(JSON.stringify(generate(input),null,2)+"\n");
