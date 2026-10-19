"""FinanceSim stable public Python API."""
from .engine import forecast, backtest, ForecastError
from .scenarios import simulate_scenarios, ScenarioError
from .research import seal, verify, score_weekly, ResearchError

__all__ = [
    "forecast", "backtest", "ForecastError",
    "simulate_scenarios", "ScenarioError",
    "seal", "verify", "score_weekly", "ResearchError",
]
