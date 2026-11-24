"use strict";
const fs=require("node:fs");
function audit(raw, newFred) {
 const wk=(s)=>{let d=new Date(s+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)};
 const source={sp500:raw.series.sp500,nasdaq100:raw.series.nasdaq100,us10y:{...raw.series.us10y_fred}};
 if(Object.hasOwn(source.us10y,newFred.date)) throw Error("refuse replacement");
 source.us10y[newFred.date]=newFred.value;
 const m={};for(const [k,v] of Object.entries(source))for(const [d,x] of Object.entries(v)){if(!Number.isFinite(x))throw Error("bad quote");const z=m[wk(d)]??={};if(!z[k]||d>z[k].date)z[k]={date:d,value:x};}
 const ws=Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0]));
 const rows=[];for(let i=1;i<ws.length;i++){let [w,c]=ws[i],p=ws[i-1][1];if(!Object.keys(source).every(k=>c[k]&&p[k]))throw Error("incomplete week");rows.push({week:w,sp:100*(c.sp500.value/p.sp500.value-1),nd:100*(c.nasdaq100.value/p.nasdaq100.value-1),bp:100*(c.us10y.value-p.us10y.value),dates:[c.sp500.date,c.nasdaq100.date,c.us10y.date]});}
 const stats=(r)=>{let n=r.length,a=r.filter(x=>x.sp<=-5).length,b=r.filter(x=>x.nd<=-5).length,j=r.filter(x=>x.sp<=-5&&x.nd<=-5),u=r.filter(x=>x.sp>=5&&x.nd>=5).length;return {n,sp:a,nd:b,joint:j.length,joint_rate:j.length/n,independence:a*b/(n*n),ratio:j.length*n/(a*b),bond_down25:j.filter(x=>x.bp<=-25+1e-9).length,bond_up25:j.filter(x=>x.bp>=25-1e-9).length,joint_up5:u,mean_bp:j.reduce((a,b)=>a+b.bp,0)/j.length};};
 const prior=rows.slice(0,-1),old=stats(prior),updated=stats(rows);if(old.n!==520||old.sp!==11||old.nd!==15||old.joint!==10||updated.n!==521||rows.at(-1).dates.some(d=>d!==newFred.date))throw Error("prior checkpoint or new quote mismatch");
 const transitions=prior.flatMap((x,i)=>x.sp<=-5&&x.nd<=-5&&i+1<rows.length?[{after:x.week,next:rows[i+1].week,sp:rows[i+1].sp,nd:rows[i+1].nd}]:[]);
 return {prior:old,updated,last_week:rows.at(-1),historical_next_week_after_joint_crash:{n:transitions.length,both_positive:transitions.filter(x=>x.sp>0&&x.nd>0).length,both_up5:transitions.filter(x=>x.sp>=5&&x.nd>=5).length,rows:transitions},new_crash_next_week:"not yet completed; excluded",nikkei_return_pct:100*(58644.63/56436.65-1),ifo_first_to_first: +(90.6-90.2).toFixed(1),ifo_vs_revised:+(90.6-90.1).toFixed(1)};
}
const raw=JSON.parse(fs.readFileSync("research/parallel/data/2026-11-21-history-staging-correction03.json","utf8"));
const daily=JSON.parse(fs.readFileSync("research/daily/2026-11-24.json","utf8"));
const actual=audit(raw,daily.fred_append_observation);
require("node:assert/strict").deepEqual(actual,daily.experiment);
console.log(JSON.stringify(actual,null,2));
