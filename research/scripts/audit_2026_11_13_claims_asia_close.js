// Fixed-as-of Nov13 research audit. Run on repository root; no network, no guessing.
// Replays the ORIGINAL Nov7 three-arm forecast without changing it.
// Usage: node research/scripts/audit_2026_11_13_claims_asia_close.js [input.json]
const fs = require('fs');
const path = require('path');
function read(p){return JSON.parse(fs.readFileSync(p, 'utf8'));}
function rounded(v){return Math.round((v+Number.EPSILON)*1e8)/1e8;}
function iso(t,label){const v=Date.parse(t);if(!Number.isFinite(v)||!/[Zz]|[+\-]\d\d:\d\d$/.test(t))throw Error('Invalid timezone-aware '+label);return v;}
function evalArm(arm,delta) {
  const point = arm.point_change, p=arm.prob_positive;
  if(!Number.isFinite(point)||!Number.isFinite(p)||p<0||p>1) throw Error('invalid frozen arm');
  const y=delta>0?1:0;
  const intervals={};
  for (const k of [50,80,90]) {
    const a=arm['interval_'+k];if(!Array.isArray(a)||a.length!==2||a[0]>a[1])throw Error('missing/invalid interval');
    const alpha=1-k/100;
    intervals[k]={covered:delta>=a[0]&&delta<=a[1],
      proper_interval_score:rounded(a[1]-a[0]+2/alpha*Math.max(0,a[0]-delta)+2/alpha*Math.max(0,delta-a[1]))};
  }
  return {frozen_model_id:arm.model_id, original_center:point, actual_change:rounded(delta),
    actual_minus_forecast:rounded(delta-point), absolute_error:rounded(Math.abs(delta-point)),
    original_prob_positive:p, direction_outcome:y, brier:rounded((p-y)**2), intervals};
}
function evalTarget(arms,delta){return Object.fromEntries(['llm','statistical','hybrid'].map(a=>[a,evalArm(arms[a],delta)]));}
function audit(input,forecast){
  const cutoff=iso(input.information_cutoff,'research cutoff');
  if(input.frozen_forecast_cutoff!==forecast.forecast_cutoff)throw Error('frozen forecast cutoff mismatch');
  if(iso(forecast.forecast_cutoff,'frozen forecast')>=cutoff)throw Error('forecast not before observations');
  const cl=input.releases.us_claims_nov12;
  if(!cl.first_release)throw Error('claim must be FIRST published');
  if(iso(cl.published_at,'claim release')>=cutoff)throw Error('claims not yet published');
  const fc=forecast.macro_forecasts.us_claims_nov12;
  if(fc.baseline_level!==cl.observed_original_prior_week_first_level_thousands || fc.unit!=='thousands_persons')throw Error('frozen claims baseline mismatch');
  const change=cl.value_thousands_persons-fc.baseline_level;
  const revisedChange=cl.value_thousands_persons-cl.prior_week_revised_in_current_release_thousands;
  const nk=input.settled_asian_market.nikkei225;
  const fn=forecast.market_forecasts.nikkei225;
  if(nk.reference_close!==fn.baseline_level || fn.unit!=='percent_return')throw Error('frozen Nikkei reference mismatch');
  if(!nk.same_issuer_confirmed || iso(nk.settlement_at,'Nikkei close')>=cutoff)throw Error('not yet settled by original index issuer');
  const percent=100*(nk.settlement_close/nk.reference_close-1);
  const yahoo=input.cross_vendor_data_quality.nikkei_yahoo_alternate;
  const altPct=100*(yahoo.displayed_close/nk.reference_close-1);
  const csi=input.cross_vendor_data_quality.csi300_frozen_vendor;
  if(csi.frozen_reference_close!==forecast.market_forecasts.csi300.baseline_level)throw Error('CSI baseline mismatch');
  const csiAlt=100*(csi.alternate_locale_friday_close/csi.frozen_reference_close-1);
  if(iso(input.still_future_at_cutoff.us_october_ppi.scheduled_release_at,'PPI')<=cutoff)throw Error('PPI release no longer future relative to snapshot');
  return {
    record_type:'FinanceSim_real_outcome_pre_US_close_frozen_model_audit',
    based_on_forecast:input.forecast_path,
    forecast_cutoff:forecast.forecast_cutoff,
    information_cutoff:input.information_cutoff,
    methods:'Exact arithmetic from issuer/official source snapshots and immutable original arm probabilities; no Monte Carlo, no new model fit, no future close.',
    actuals:{
      group_A_claims:{target_id:'us_claims_nov12',as_of_release:cl.published_at,unit:'thousands_persons',
        actual_first_level:cl.value_thousands_persons,frozen_first_previous:fc.baseline_level,first_to_first_change:change,
        revised_prior:cl.prior_week_revised_in_current_release_thousands,change_using_revised_prior:revisedChange,
        revision_vintage_wedge:change-revisedChange,scores:evalTarget(fc.arms,change),
        source:cl.source_url},
      group_C_nikkei:{target_id:'nikkei225',at:nk.settlement_at,unit:'percent_return',
        prior_friday:nk.reference_close,settlement_friday:nk.settlement_close,week_return_percent:rounded(percent),
        scores:evalTarget(fn.arms,percent),source:nk.same_issuer_url,
        yahoo_alternate_unverified:{displayed_friday_close:yahoo.displayed_close,
          alternate_week_return_percent:rounded(altPct),issuer_minus_alternate_close_points:rounded(nk.settlement_close-yahoo.displayed_close),
          magnitude_week_return_discrepancy_pp:rounded(Math.abs(altPct-percent)),source:yahoo.source_url,
          status:'QUARANTINED_PROVIDER_SENSITIVITY_ONLY'}},
    },
    not_yet_scoreable:{
      csi300:{reason:'Frozen ph.investing locale has only Nov11, not final Friday; other locale 11/13 quote is not a frozen-vendor match',
        alternate_locale_close:csi.alternate_locale_friday_close,alternate_locale_week_return_pct:rounded(csiAlt),
        cross_source_date_discordance:true,formal_score:null},
      dallas_wei_nov12:{reason:input.unverified.dallas_wei_nov12.reason,formal_score:null},
      us_ppi_nov13:{reason:'US October PPI scheduled '+input.still_future_at_cutoff.us_october_ppi.scheduled_release_at_jst+' after this research cutoff',formal_score:null},
      rest_of_friday_markets_and_B_breadth:{reason:'The US Friday closing bell has not happened; group B joint event not resolved.',formal_score:null}
    },
    important_cautions:[
      'One original weekly macro target and one cash-equity market have become scoreable. This is NOT the Nov14 complete A/B/C weekly score.',
      'Use frozen 189k first-published claims baseline, never silently substitute revised 191k.',
      'Nikkei issuer final close is preferred over a conflicting alternate vendor, whose quote is kept as an unverified sensitivity.',
      'CSI300 from another locale remains a provisional indication and is excluded from formal score.',
      'Claims Brier and Nikkei Brier describe different unit/target groups; do not mix their point errors.',
      'No new model probabilities or post-outcome forecast changes; original 22 target archive remains immutable.'
    ]
  };
}
if(require.main===module){const input=read(process.argv[2]||'research/inputs/2026-11-13-asia-claims-snapshot.json');
  const frozen=read(input.forecast_path);
  process.stdout.write(JSON.stringify(audit(input,frozen),null,2)+'\n');}
module.exports={audit,evalArm};
