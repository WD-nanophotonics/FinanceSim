"""Single JSON request interface: python -m financesim request.json."""
import argparse
import json
import sys
from pathlib import Path
from .engine import ForecastError, backtest, forecast
from .research import ResearchError, seal, verify, score_weekly
from .scenarios import ScenarioError, simulate_scenarios


def execute(request):
    if not isinstance(request, dict):
        raise ForecastError('request must be a JSON object')
    action = request.get('action', 'forecast')
    params = request.get('parameters', {})
    if not isinstance(params, dict):
        raise ForecastError('parameters must be a JSON object')
    if action == 'forecast':
        return forecast(request['data'], **params)
    if action == 'backtest':
        return backtest(request['data'], **params)
    if action == 'scenarios':
        return simulate_scenarios(request['baseline'], request['events'], **params)
    if action == 'seal':
        return seal(request['kind'], request['payload'],
                    as_of=request['as_of'], evidence=request.get('evidence'))
    if action == 'verify':
        return {'valid': verify(request['record']), 'record_sha256': request['record']['sha256']}
    if action == 'score':
        return score_weekly(request['record'], request['actual_changes'])
    raise ForecastError('action must be forecast, backtest, scenarios, seal, verify or score')


def main(argv=None):
    parser = argparse.ArgumentParser(description='FinanceSim reproducible research API')
    parser.add_argument('request', help='JSON file with action and input data')
    parser.add_argument('-o', '--output', help='Optional output JSON path')
    args = parser.parse_args(argv)
    try:
        request = json.loads(Path(args.request).read_text(encoding='utf-8'))
        result = execute(request)
        output = json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + '\n'
        if args.output:
            Path(args.output).write_text(output, encoding='utf-8')
        else:
            sys.stdout.write(output)
        return 0
    except (OSError, KeyError, ValueError, TypeError) as exc:
        print(f'FinanceSim error: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
