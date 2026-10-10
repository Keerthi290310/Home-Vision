# Data preprocessing and model implementation

This document describes the preprocessing and model training that are implemented in `ml/train.py`.

## Implemented preprocessing

1. Load `data/new.csv` using pandas.
2. Convert room-count and construction-year columns to numeric values; invalid entries become missing values.
3. Extract a numeric floor value from the source `floor` text.
4. Parse `tradeTime` and derive `trade_year`, `trade_month`, and `trade_quarter`.
5. Remove identifier/free-text columns (`url`, `id`, `Cid`) and raw `floor`, as well as the alternate `price` field to reduce leakage risk.
6. Build a scikit-learn `ColumnTransformer`: numerical features receive median imputation; categorical features receive most-frequent imputation followed by an `OrdinalEncoder` that handles unseen categories.
7. Fit preprocessing and estimator together in a `Pipeline`, so prediction-time data goes through the same transformations as training data.
8. Keep target eligibility separate: price rows require a finite positive `totalPrice`; DOM rows require a finite non-negative `DOM`. Missing DOM does not unnecessarily discard a valid price row.

## Implemented models

Two separate regression pipelines are trained: one for `totalPrice` (source units: 10,000 CNY) and one for `DOM` (days). Candidate regressors are `RandomForestRegressor` and `HistGradientBoostingRegressor`; a median `DummyRegressor` is included as a benchmark baseline. The selected candidate is chosen by validation RMSE. Final MAE, RMSE, and R² are calculated on a separate held-out test split.

The trained pipelines are saved to `artifacts/price_pipeline.joblib` and `artifacts/dom_pipeline.joblib`. Metrics, benchmark results, feature schema, and permutation feature importance are saved under `artifacts/`. The API loads these pipelines for live prediction.

## Reproduce

Run these from the `HomeVision_Final` project root after installing `requirements.txt`:

```powershell
python ml/train.py --fast
python -m pytest -v
```

`--fast` trains the HistGradientBoosting candidate to reduce training time. Omit `--fast` to compare both candidate regressors. Retraining overwrites the model and metric artifacts.

## Limitations

The data is historical Beijing listing data. It should not be treated as a reliable model for other locations or current market conditions. DOM is incomplete and strongly skewed; treat its predictions as exploratory estimates. Ordinal-encoded category codes do not provide human-readable meanings unless a verified mapping is available.


## Input schema consistency

The prediction interface uses 22 input features. The API defaults and generated feature schema must contain the same 22 names; do not add a field only in the UI or only in the model. Automated API tests check this contract. The model targets (`totalPrice` and `DOM`) and leakage fields (`price`, identifiers and URL) are excluded from prediction inputs.

## Test client dependency

`httpx2` is listed as a test dependency for the Starlette TestClient version resolved by the environment. Install all dependencies from `requirements.txt` before running `python -m pytest -v`.
