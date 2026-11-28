"use strict";
// Append-only retrospective diagnostic; no parameter selection or new predictions.
function audit(raw, verification, prev, settlement){
 const round=x=>Number(x.toFixed(8));
 const mean=a=>round(a.reduce((s,x)=>s+x,0)/a.length);
 const eq=verification.rows.filter(z=>z.group==="C"&&z.unit==="percent_return"&&z.status==="verified");
 const rows=eq.map(z=>({id:z.id,actual:z.actual,points:Object.fromEntries(Object.entries(z.scores).map(([k,s])=>[k,s.point])),hybrid_minus_stat_abs_error:round(z.scores.hybrid.abs_error-z.scores.statistical.abs_error)}));
 if(eq.length!==5||!eq.every(z=>z.actual>0&&z.scores.hybrid.point<0))throw Error("strict equity regression");
 const arm_metrics=Object.fromEntries(["llm","statistical","hybrid"].map(k=>[k,{mae:mean(eq.map(z=>z.scores[k].abs_error)),signed_actual_minus_point:mean(eq.map(z=>z.scores[k].error)),brier:mean(eq.map(z=>z.scores[k].brier))}]));
 const stale={};
 for(const id of ["sp500","nasdaq100","us10y"]){
   const f=raw.fred[id],m=settlement.market[id],change=x=>id==="us10y"?100*(x-f.previous_friday):100*(x/f.previous_friday-1);
   if(m.frozen_reference!==f.previous_friday)throw Error("reference mismatch");
   const current=change(m.value),old=change(f.value);
   stale[id]={page_observation_date:f.observation_date,frozen_matched_vendor_weekly_change:round(current),fred_page_implied_weekly_change:round(old),stale_minus_matched:round(old-current),sign_reversal:Math.sign(old)!==Math.sign(current)};
 }
 const ndxUpdateMinutes=(Date.parse(raw.fred.nasdaq100.page_updated_at)-Date.parse(raw.forecast_seal.deadline))/60000;
 const sealLeadSeconds=(Date.parse(raw.forecast_seal.deadline)-Date.parse(raw.forecast_seal.git_created_at))/1000;
 const old=prev.experiment.historical_next_week_after_joint_crash;
 if(old.n!==10||old.both_positive!==8||old.both_up5!==3)throw Error("historical checkpoint");
 const sp=eq.find(z=>z.id==="sp500").actual,nd=eq.find(z=>z.id==="nasdaq100").actual;
 const rebound={prior_n:old.n,prior_both_positive:old.both_positive,prior_both_up5:old.both_up5,latest_week_sp:sp,latest_week_ndx:nd,provisional_mixed_vendor_n:old.n+1,provisional_both_positive:old.both_positive+Number(sp>0&&nd>0),provisional_both_up5:old.both_up5+Number(sp>=5&&nd>=5),note:"Cross-vendor descriptive extension only; do not alter same-source historical cohort or count as independent predictive evidence."};
 const macro={};for(const c of ["france","spain"]){const x=raw[c];macro[c]=Object.fromEntries(Object.keys(x.first).map(k=>[k,{first_to_first_pp:round(x.first[k]-x.oct_first[k]),vs_oct_final_pp:round(x.first[k]-x.oct_final[k]),oct_revision_pp:round(x.oct_final[k]-x.oct_first[k])}]))}
 if(stale.us10y.stale_minus_matched!==-9||!stale.us10y.sign_reversal||ndxUpdateMinutes!==98||sealLeadSeconds!==129||macro.france.hicp_yoy.first_to_first_pp!==-0.6||rebound.provisional_both_up5!==4)throw Error("audit regression");
 return {strict_equity:{n:eq.length,rows,arm_metrics,mean_hybrid_minus_stat_abs_error:mean(rows.map(z=>z.hybrid_minus_stat_abs_error)),warning:"Five correlated markets in one week; no model selection."},fred_stale_reference:stale,nasdaq_fred_page_update_minutes_after_deadline:ndxUpdateMinutes,legacy_git_metadata_lead_seconds:sealLeadSeconds,rebound,macro,treasury_nov27_minus_nov25_bp:Object.fromEntries(Object.keys(raw.treasury.nov27).map(k=>[k,round(100*(raw.treasury.nov27[k]-raw.treasury.nov25[k]))]))};
}
if(typeof module!=="undefined")module.exports={audit};
if(typeof require!=="undefined"&&require.main===module){
 const fs=require("fs"),read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
 const d=read("research/daily/2026-11-28.json");
 const result=audit(d.observations,read("research/weekly/2026-11-28-verification.json"),read("research/daily/2026-11-24.json"),read("research/inputs/2026-11-28-settlement-sources.json"));
 if(JSON.stringify(result)!==JSON.stringify(d.diagnostics))throw Error("replay mismatch");
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
