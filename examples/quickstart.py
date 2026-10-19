"""Synthetic example; does not measure real-world predictive skill."""
import json
from financesim import backtest, forecast

history = {
    "stock_index": [100 + 0.03*i + 1.3*((i%9)-4)/4 for i in range(130)],
    "bond_yield_pct": [4.0 + 0.004*((i%13)-6) for i in range(130)],
}
print(json.dumps(forecast(history, method="drift", horizon=5,
                          lookback=26, simulations=1000, seed=123,
                          as_of="2026-10-16"), indent=2))
print(json.dumps({name: {k:v for k,v in metrics.items() if k!="rows"}
                  for name,metrics in backtest(history, method="drift",
                                              horizon=5)["metrics"].items()}, indent=2))
