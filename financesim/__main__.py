"""Command line entrypoint: python -m financesim path/to/request.json."""
import argparse
import json
import sys
from pathlib import Path
from .engine import ForecastError, backtest, forecast


def main(argv=None):
    parser = argparse.ArgumentParser(description='FinanceSim single-request forecasting API')
    parser.add_argument('request', help='JSON file with data, action and parameters')
    parser.add_argument('-o', '--output', help='Optional output JSON path')
    args = parser.parse_args(argv)
    try:
        request = json.loads(Path(args.request).read_text(encoding='utf-8'))
        if not isinstance(request, dict):
            raise ForecastError('request must be a JSON object')
        action = request.get('action', 'forecast')
        data = request['data']
        parameters = request.get('parameters', {})
        if not isinstance(parameters, dict):
            raise ForecastError('parameters must be a JSON object')
        if action == 'forecast':
            result = forecast(data, **parameters)
        elif action == 'backtest':
            result = backtest(data, **parameters)
        else:
            raise ForecastError('action must be forecast or backtest')
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
