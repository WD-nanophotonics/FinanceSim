// FinanceSim Nov12 as-of official first/revised-vintage and producer-contribution audit.
// Node 18+, no external dependencies, reads fixed public source input.
const fs=require("fs");
function audit(i){
 const pp=x=>Math.round(x*1e8)/1e8;
 const sum=o=>Object.values(o).reduce((s,x)=>s+x,0);
 const b=i.inputs_and_vintages.japan_cgpi, c=b.current, f=b.previous_sep_first, r=b.previous_sep_as_revised_nov12;
 const uk=i.inputs_and_vintages.uk_gdp, nk=i.inputs_and_vintages.nikkei225;
 const contrib=c.contributions_pp_to_import_contract_currency_mom, domestic=c.contributions_pp_to_domestic_ppi_mom;
 const firstDom=pp(c.domestic_ppi_mom_pct-f.domestic_ppi_mom_pct),
       revisedDom=pp(c.domestic_ppi_mom_pct-r.domestic_ppi_mom_pct),
       firstImport=pp(c.import_contract_currency_mom_pct-f.import_contract_currency_mom_pct),
       revisedImport=pp(c.import_contract_currency_mom_pct-r.import_contract_currency_mom_pct);
 const boundary=nk.close_nov06*(1+nk.frozen_hybrid_weekly_interval_90_upper_pct/100);
 return {
  record_type:"deterministic_asof_vintage_revision_and_contribution_audit",date:i.reference_date,underlying_fact_cutoff:i.underlying_fact_cutoff,
  input_path:"research/inputs/2026-11-12-boj-ons-nikkei-first-releases.json",frozen_weekly_forecast:i.frozen_forecast_path,
  method:"read dated issuer first releases and explicitly documented revised comparators; direct arithmetic, no fitting, no forward outcome, no stochastic simulations",
  execution:{type:"deterministic_javascript",seed:null,draws:0,model_id:"2026-11-12-vintage-decomposition-v1",code_base_commit_before_research:"1f4b75b36b34"},
  boj_cgpi:{
   release_at:b.first_release_at,source:b.first_release_url,prior_first_source:b.previous_first_release_url,
   oct2026_domestic_ppi_mom_pct:c.domestic_ppi_mom_pct,oct2026_domestic_ppi_yoy_pct:c.domestic_ppi_yoy_pct,
   sep2026_prior_first_mom_pct:f.domestic_ppi_mom_pct,sep2026_prior_revised_mom_pct:r.domestic_ppi_mom_pct,
   oct_vs_sep_mom_momentum_using_prior_first_pp:firstDom,
   oct_vs_sep_mom_momentum_using_prior_revised_pp:revisedDom,
   revision_choice_effect_on_momentum_pp:pp(firstDom-revisedDom),
   oct_minus_sep_yoy_first_pp:pp(c.domestic_ppi_yoy_pct-f.domestic_ppi_yoy_pct),
   imported_prices:{
    current_contract_currency_mom_pct:c.import_contract_currency_mom_pct,
    current_yen_mom_pct:c.import_yen_mom_pct,current_fx_index_mom_pct:c.exchange_rate_usd_per_yen_mom_change_pct,
    monthly_yen_minus_contract_mom_pp:pp(c.import_yen_mom_pct-c.import_contract_currency_mom_pct),
    approximate_multiplicative_identity_pct:pp(100*((1+c.import_contract_currency_mom_pct/100)*(1+c.exchange_rate_usd_per_yen_mom_change_pct/100)-1)),
    approx_identity_vs_reported_yen_residual_pp:pp(c.import_yen_mom_pct-100*((1+c.import_contract_currency_mom_pct/100)*(1+c.exchange_rate_usd_per_yen_mom_change_pct/100)-1)),
    import_mom_acceleration_prior_first_pp:firstImport,import_mom_acceleration_prior_revised_pp:revisedImport,
    vintage_choice_wedge_import_mom_pp:pp(firstImport-revisedImport),
    import_yoy_acceleration_prior_first_pp:pp(c.import_contract_currency_yoy_pct-f.import_contract_currency_yoy_pct),
    import_yoy_acceleration_prior_revised_pp:pp(c.import_contract_currency_yoy_pct-r.import_contract_currency_yoy_pct),
    energy_purchased_import_contribution_pp:contrib.petroleum_coal_natural_gas,
    energy_contribution_fraction_of_net_pct:pp(100*contrib.petroleum_coal_natural_gas/c.import_contract_currency_mom_pct),
    electronics_import_contribution_fraction_of_net_pct:pp(100*contrib.electronics/c.import_contract_currency_mom_pct),
    all_selected_import_categories_net_contribution_pp:pp(sum(contrib)),
    residual_other_import_categories_pp:pp(c.import_contract_currency_mom_pct-sum(contrib))
   },
   domestic_contribution_pp:{
    fossil_products_plus_utilities:pp(domestic.petroleum_coal+domestic.electric_gas_water),
    fossil_and_utilities_share_of_net_pct:pp(100*(domestic.petroleum_coal+domestic.electric_gas_water)/c.domestic_ppi_mom_pct),
    food_producer_agriculture_negative_pp:domestic.agriculture_forestry_fishery,
    selected_categories_net_pp:pp(sum(domestic)),
    residual_categories_net_pp:pp(c.domestic_ppi_mom_pct-sum(domestic)),
    caution:"Group contributions are percentage-point decompositions of net month-on-month change; shares can sum above 100% when other categories offset one another and must not be treated as weights or causes."
   }
  },
  ons_uk_gdp:{
   release_at:uk.first_release_at,source:uk.first_release_url,q3_2026_first_real_growth_qoq_pct:uk.q3_real_gdp_qoq_pct,
   q3_2026_first_real_growth_yoy_pct:uk.q3_real_gdp_yoy_pct,
   q2_growth_as_shown_in_q3_publication_pct:uk.q2_growth_as_shown_current_release_pct,
   acceleration_vs_current_q2_pp:pp(uk.q3_real_gdp_qoq_pct-uk.q2_growth_as_shown_current_release_pct),
   sector_qoq_pct:uk.q3_sector_qoq_pct,
   services_minus_construction_growth_pp:pp(uk.q3_sector_qoq_pct.services-uk.q3_sector_qoq_pct.construction),
   sep2026_monthly_growth_pct:uk.sep_monthly_real_gdp_mom_pct,
   august_growth_prior_publication_pct:uk.aug_monthly_real_gdp_previous_publication_mom_pct,
   august_growth_as_revised_now_pct:uk.aug_monthly_real_gdp_revised_mom_pct,
   sep_minus_aug_prior_publication_pp:pp(uk.sep_monthly_real_gdp_mom_pct-uk.aug_monthly_real_gdp_previous_publication_mom_pct),
   sep_minus_aug_revised_pp:pp(uk.sep_monthly_real_gdp_mom_pct-uk.aug_monthly_real_gdp_revised_mom_pct),
   revision_choice_wedge_for_monthly_acceleration_pp:pp(uk.aug_monthly_real_gdp_previous_publication_mom_pct-uk.aug_monthly_real_gdp_revised_mom_pct),
   caution:"Q2 comparator is a later-vintage figure, not independently established as original Q2 first release; sector growth rates have different weights and are never summed."
  },
  nikkei_interim:{
   source:nk.close_nov12_url,observed_at:nk.close_nov12_at,reference_close:nk.close_nov06,
   previous_close:nk.close_nov11,current_close:nk.close_nov12,
   thursday_session_return_pct:pp(100*(nk.close_nov12/nk.close_nov11-1)),
   monday_to_thursday_week_so_far_pct:pp(100*(nk.close_nov12/nk.close_nov06-1)),
   frozen_weekly_hybrid_upper_90_pct:nk.frozen_hybrid_weekly_interval_90_upper_pct,
   future_friday_close_at:nk.target_future_close_at,
   future_close_required_to_exceed_frozen_upper:pp(boundary),
   required_friday_session_gain_pct:pp(100*(boundary/nk.close_nov12-1)),
   score_status:"not eligible for Friday-to-Friday score until Nov13 issuer closing figure exists"
  },
  cross_market_timing:{japan_friday_1130_close_at:"2026-11-13T15:30:00+09:00",us_october_ppi_at:"2026-11-13T22:30:00+09:00",ppi_release_after_japan_close_hours:7,interpretation:"US PPI result occurs after Japanese Friday cash settlement; it cannot directly cause Japan's already completed same-Friday cash closing return"},
  target_accounting:{new_data_not_nov7_frozen_targets:["JP_2026_10_CGPI","UK_2026_Q3_GDP_FIRST"],nikkei_2026_11_13_still_pending:true,other_nov7_frozen_us_claims_wei_ppi_not_settled_in_this_run:true},
  caveats:["No empirical causal pass-through from imports to CPI or stocks is inferred from these decompositions.","The issuer/index homepage is mutable and the 2026-11-12 value is archived in the new data snapshot.","Comparison between first and revised vintages is a measurement audit, not a forecast model skill result.","No synthetic data is presented as observed forecasting success."]
 };
}
const arg=process.argv[2]||"research/inputs/2026-11-12-boj-ons-nikkei-first-releases.json";
const data=JSON.parse(fs.readFileSync(arg,"utf8"));
process.stdout.write(JSON.stringify(audit(data),null,2)+"\n");
