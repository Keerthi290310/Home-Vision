"""Single source of truth for HomeVision feature engineering.

Used by both model training and API inference so the same raw fields become
exactly the same 22 model inputs in the same order.
"""
from __future__ import annotations
import re
import numpy as np
import pandas as pd

TARGET_COLUMNS = {'totalPrice', 'DOM'}
LEAKAGE_AND_IDENTIFIER_COLUMNS = {'url', 'id', 'Cid', 'floor', 'price', 'tradeTime'}


def floor_num(value):
    """Extract a numeric floor from labels such as '中楼层' or '高楼层 12层'."""
    match = re.search(r'(\d+)', str(value))
    return float(match.group(1)) if match else np.nan


def transform_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Apply deterministic feature engineering and remove targets/leakage fields."""
    frame = frame.copy()
    for column in ('livingRoom', 'drawingRoom', 'bathRoom', 'constructionTime'):
        if column in frame:
            frame[column] = pd.to_numeric(frame[column], errors='coerce')
    if 'floor' in frame:
        frame['floor_num'] = frame['floor'].map(floor_num)
    if 'tradeTime' in frame:
        dates = pd.to_datetime(frame['tradeTime'], errors='coerce')
        frame['trade_year'] = dates.dt.year
        frame['trade_month'] = dates.dt.month
        frame['trade_quarter'] = dates.dt.quarter
    drop = [c for c in TARGET_COLUMNS | LEAKAGE_AND_IDENTIFIER_COLUMNS if c in frame.columns]
    frame = frame.drop(columns=drop, errors='ignore')
    # A stable order is defined from the retained frame; downstream callers align to schema.
    return frame.replace([np.inf, -np.inf], np.nan)
