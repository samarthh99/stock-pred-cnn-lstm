import logging
import time
from datetime import date, datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf
from pandas.tseries.holiday import (
    AbstractHolidayCalendar, GoodFriday, Holiday, USLaborDay, USMartinLutherKingJr,
    USMemorialDay, USPresidentsDay, USThanksgivingDay, nearest_workday,
)

from . import config

log = logging.getLogger("data")
NY = ZoneInfo("America/New_York")
_cache: dict = {}   # ticker -> {"df": DataFrame, "at": timestamp}


class NYSECalendar(AbstractHolidayCalendar):
    rules = [
        Holiday("NewYear", month=1, day=1, observance=nearest_workday),
        USMartinLutherKingJr, USPresidentsDay, GoodFriday, USMemorialDay,
        Holiday("Juneteenth", month=6, day=19, start_date="2022-01-01", observance=nearest_workday),
        Holiday("July4", month=7, day=4, observance=nearest_workday),
        USLaborDay, USThanksgivingDay,
        Holiday("Christmas", month=12, day=25, observance=nearest_workday),
    ]


def _download(ticker: str) -> pd.DataFrame:
    df = yf.download(ticker, start=config.DATA_START, interval="1d",
                     progress=False, auto_adjust=True, threads=False)
    if df is None or df.empty:
        raise RuntimeError("Yahoo Finance returned no data")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
    df = df[~df.index.duplicated()]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    return df


def get_daily(ticker: str) -> pd.DataFrame:
    """Daily OHLCV since 2020, cached per ticker. Falls back to stale cache if Yahoo fails."""
    now = time.time()
    hit = _cache.get(ticker)
    if hit and now - hit["at"] < config.DATA_CACHE_SECONDS:
        return hit["df"]
    try:
        df = _download(ticker)
        _cache[ticker] = {"df": df, "at": now}
        return df
    except Exception as exc:
        log.warning("download failed for %s: %s", ticker, exc)
        if hit:
            return hit["df"]
        raise


def completed_bars(df: pd.DataFrame) -> pd.DataFrame:
    """Drop today's bar while the US market is still open (it is incomplete)."""
    now = datetime.now(NY)
    if df.index[-1].date() == now.date() and now.time() < dtime(16, 15):
        return df.iloc[:-1]
    return df


def build_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Exactly the feature engineering from the Colab training script."""
    feat = raw.copy()
    d = feat["Close"].diff()
    up = d.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    down = (-d.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    feat["RSI"] = 100 - 100 / (1 + up / (down + 1e-9))
    feat["MACD"] = (feat["Close"].ewm(span=12, adjust=False).mean()
                    - feat["Close"].ewm(span=26, adjust=False).mean())
    feat["EMA20"] = feat["Close"].ewm(span=20, adjust=False).mean()
    feat["month"], feat["day"], feat["weekday"] = (
        feat.index.month, feat.index.day, feat.index.dayofweek)
    return feat.iloc[config.WARMUP:]


def next_trading_day(d: date) -> date:
    hol = {h.date() for h in NYSECalendar().holidays(d, d + timedelta(days=15))}
    nxt = d + timedelta(days=1)
    while nxt.weekday() >= 5 or nxt in hol:
        nxt += timedelta(days=1)
    return nxt
