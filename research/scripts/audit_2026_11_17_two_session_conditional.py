"""Post-Tuesday diagnostic of the 14 November pre-registered Nikkei model.

A synthetic 5-session Gaussian decomposition of frozen week-level scenario means.
No forward forecasts are rewritten; no Monte Carlo samples are drawn.
"""
from __future__ import annotations
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def cdf(x):
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


def round8(x):
    return round(x, 8)


def main():
    inp = load('research/inputs/2026-11-17-official-asof-snapshot.json')
    snap = load('research/inputs/2026-11-14-1200-snapshot.json')
    frozen = load('research/weekly/2026-11-14-forecast-corrected-b01.json')
    o = inp['observations']['nikkei225']
    closes = o['closes']
    levels = [closes[d]['value'] for d in ('2026-11-13', '2026-11-16', '2026-11-17')]
    m = snap['market']['nikkei225']
    f = frozen['market_forecasts']['nikkei225']['arms']['hybrid']
    assert levels[0] == m['base'] == frozen['market_forecasts']['nikkei225']['baseline_level']
    assert snap['seed'] == frozen['seed'] == 20261114
    assert len(snap['events']) == 5
    # The 17 Nov US release is in the future at this input's stated cutoff.
    assert inp['as_of'] < inp['pending']['us_oct_import_export_price_indices']['tokyo_time']
    daily = [100 * (levels[i] / levels[i-1] - 1) for i in (1, 2)]
    states = []
    for mask in range(1 << len(snap['events'])):
        p, mean = 1.0, m['hybrid']
        for i, e in enumerate(snap['events']):
            on = (mask >> i) & 1
            p *= e['p'] if on else 1 - e['p']
            mean += (on - e['p']) * e['effects'].get('nikkei225', 0)
        states.append((mask, p, mean))
    assert abs(sum(x[1] for x in states) - 1) < 1e-10

    def conditional(n, multiplier, target, bayes=True):
        sd_day = m['sigma'] * multiplier / math.sqrt(5)
        sd_rest = m['sigma'] * multiplier * math.sqrt((5-n)/5)
        log_lik = [math.log(p) - sum((r-mu/5)**2 for r in daily[:n])/(2*sd_day**2)
                   for _, p, mu in states]
        lmax = max(log_lik)
        posterior_u = [math.exp(v-lmax) for v in log_lik]
        den = sum(posterior_u)
        weight = [v/den for v in posterior_u] if bayes else [s[1] for s in states]
        threshold = 100 * ((1+target/100)/(levels[n]/levels[0])-1)
        out = sum(w * cdf((threshold-mu*(5-n)/5)/sd_rest)
                  for w,(_,p,mu) in zip(weight,states))
        return out, weight, threshold

    scenarios = []
    for scale in (0.75, 1.0, 1.5, 2.0):
        m1, _, _ = conditional(1, scale, -1.5)
        m2, w2, need = conditional(2, scale, -1.5)
        prior_weight_m2, _, _ = conditional(2, scale, -1.5, bayes=False)
        zero, _, _ = conditional(2, scale, 0)
        low90, _, _ = conditional(2, scale, f['interval_90'][0])
        scenarios.append({
            'volatility_multiplier':scale,
            'monday_only_probability_week_le_minus1_5':round8(m1),
            'tuesday_probability_week_le_minus1_5':round8(m2),
            'tuesday_probability_no_reweight':round8(prior_weight_m2),
            'reweight_difference_pp':round8(100*(m2-prior_weight_m2)),
            'tuesday_probability_week_positive':round8(1-zero),
            'tuesday_probability_below_frozen_hybrid_90_lower':round8(low90),
            'needed_return_remaining_three_days_for_week_minus1_5_pct':round8(need),
            'posterior_event_probabilities':{
                e['id']:round8(sum(w for w,(mask,_,_) in zip(w2,states) if (mask>>i)&1))
                for i,e in enumerate(snap['events'])
            }
        })
    # Independent reproduction of the Monday result (32-state model with five equal daily increments).
    assert abs(scenarios[1]['monday_only_probability_week_le_minus1_5']-0.6337067400406247)<2e-7
    events = inp['publication_exposure_today']
    assert [x['relative_to_nikkei_close'] for x in events] == [
        'before_close','after_close','after_close_and_after_run_asof']
    assert scenarios[1]['tuesday_probability_week_le_minus1_5'] > scenarios[1]['monday_only_probability_week_le_minus1_5']

    result = {
        'record_type':'post_tuesday_frozen_model_conditional_diagnostic',
        'date':'2026-11-17', 'information_as_of':inp['as_of'],
        'frozen_forecast':'research/weekly/2026-11-14-forecast-corrected-b01.json',
        'frozen_model_snapshot':'research/inputs/2026-11-14-1200-snapshot.json',
        'observations':'research/inputs/2026-11-17-official-asof-snapshot.json',
        'original_model_source_commit':snap['model_source_commit'],
        'frozen_seed':snap['seed'], 'new_seed':None, 'new_monte_carlo_draws':0,
        'algorithm':'Exact 2^5 Bernoulli scenario enumeration; Bayesian Gaussian two-session likelihood; remaining 3-session Gaussian integration using erfc; synthetic intraweek model extension',
        'scenario_state_count':len(states),
        'levels':{'nov13':levels[0],'nov16':levels[1],'nov17':levels[2]},
        'official_nikkei_close_source':o['source'],
        'monday_return_pct':round8(daily[0]),'tuesday_return_pct':round8(daily[1]),
        'monday_and_tuesday_cumulative_pct':round8(100*(levels[2]/levels[0]-1)),
        'frozen_hybrid_weekly_point_pct':f['point_change'],
        'frozen_hybrid_90_pct_interval':f['interval_90'],
        'scenarios':scenarios,
        'official_release_exposure_today':inp['publication_exposure_today'],
        'uk_ons_features':{
            'regular_pay_yoy_change_vs_previous_first_pp':round8(inp['observations']['uk_labor_2026_11_17']['earnings_regular_yoy_pct']-inp['observations']['uk_labor_2026_11_17']['prior_first_2026_10_20_earnings_regular_yoy_pct']),
            'total_pay_yoy_change_vs_previous_first_pp':round8(inp['observations']['uk_labor_2026_11_17']['earnings_total_yoy_pct']-inp['observations']['uk_labor_2026_11_17']['prior_first_2026_10_20_earnings_total_yoy_pct']),
            'total_pay_yoy_change_vs_revised_prior_pp':round8(inp['observations']['uk_labor_2026_11_17']['earnings_total_yoy_pct']-inp['observations']['uk_labor_2026_11_17']['revised_prior_total_yoy_as_displayed_nov17_pct']),
            'payrolled_oct_vs_revised_sep_increment_difference_thousands':inp['observations']['uk_labor_2026_11_17']['payroll_early_october_month_change_thousands']-inp['observations']['uk_labor_2026_11_17']['payroll_september_change_current_revision_thousands'],
            'sep_payroll_revision_thousands':inp['observations']['uk_labor_2026_11_17']['payroll_september_change_current_revision_thousands']-inp['observations']['uk_labor_2026_11_17']['payroll_september_change_previous_first_thousands'],
            'vacancies_latest_thousands':inp['observations']['uk_labor_2026_11_17']['vacancies_aug_oct_thousands'],
            'vacancies_change_three_month_window_thousands':inp['observations']['uk_labor_2026_11_17']['vacancy_change_from_may_july_thousands']
        },
        'rba_minutes_features':{
            'hike_votes':inp['observations']['rba_minutes_2026_11_17']['vote_raise'],
            'hold_votes':inp['observations']['rba_minutes_2026_11_17']['vote_hold'],
            'hike_vote_share':round8(6/9), 'hold_vote_share':round8(3/9),
            'adopted_hike_bp':round8(100*(4.85-4.60))
        },
        'limitations':[
            'Conditions on Monday and Tuesday observed Nikkei closes, so not a Nov14 ex-ante forecast or a new skill observation.',
            'Intraweek Gaussian independent increments, equal fifths of each weekly shock and beta scenario update are introduced for diagnostic purposes, never fitted.',
            'Five high-level shocks have no observed state labels; posterior scenario probabilities describe model latent states, not measured causes.',
            'Two-day return is compounded, whereas remaining three-day innovations are added as approximate simple percent returns.',
            'UK ONS LFS survey and payroll flash may be revised; previous first vintage and latest revised comparison are explicitly separate.',
            'RBA minutes were published two weeks after rate decision; not admissible for Oct31 frozen prediction calibration.',
            'UK labor figures were public after the Nov17 Tokyo close, and US import/export price release at 22:30 JST is future as of this analysis.',
            'Friday Nov20 and remaining index endpoints are not realized, WTI same-contract provenance unresolved.'
        ]
    }
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
