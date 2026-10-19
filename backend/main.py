from functools import lru_cache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import FactorAnalysis
import joblib
import json
import os
import pandas as pd
import numpy as np
import subprocess
import sys

from ml.preprocessing import transform_features

ROOT = os.path.dirname(os.path.dirname(__file__))
ART = os.path.join(ROOT, "artifacts")
DATA = os.path.join(ROOT, "data", "new.csv")

app = FastAPI(
    title="HomeVision ML API",
    version="1.0.0",
    description="Price + Days-on-Market decision support"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)


def load_or_rebuild_models():
    try:
        return (
            joblib.load(os.path.join(ART, "price_pipeline.joblib")),
            joblib.load(os.path.join(ART, "dom_pipeline.joblib"))
        )
    except Exception as first_error:
        print(
            "Saved model artifacts are incompatible. "
            "Rebuilding models from data/new.csv..."
        )

        train_script = os.path.join(ROOT, "ml", "train.py")

        result = subprocess.run(
            [sys.executable, train_script, "--fast"],
            cwd=ROOT,
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            raise RuntimeError(
                "Automatic model rebuild failed. "
                "Run: python ml/train.py\n" + result.stderr
            ) from first_error

        try:
            return (
                joblib.load(os.path.join(ART, "price_pipeline.joblib")),
                joblib.load(os.path.join(ART, "dom_pipeline.joblib"))
            )
        except Exception as second_error:
            raise RuntimeError(
                "Models were rebuilt but could not be loaded: "
                + str(second_error)
            ) from first_error


price_model, dom_model = load_or_rebuild_models()

with open(os.path.join(ART, "metrics.json"), encoding="utf-8") as f:
    metrics = json.load(f)

with open(
    os.path.join(ART, "feature_importance.json"), encoding="utf-8"
) as f:
    importance = json.load(f)

with open(
    os.path.join(ART, "feature_schema.json"), encoding="utf-8"
) as f:
    schema = json.load(f)

# Read the dataset once. low_memory=True reduces CSV parser memory usage.
raw = pd.read_csv(
    DATA,
    encoding="latin1",
    low_memory=True
)


def transform(data):
    return transform_features(data)


# Count usable targets without making large copies of the dataset.
price_values = pd.to_numeric(raw["totalPrice"], errors="coerce")
dom_values = pd.to_numeric(raw["DOM"], errors="coerce")

price_usable_mask = (
    (price_values > 0) & np.isfinite(price_values)
)
dom_usable_mask = (
    (dom_values >= 0) & np.isfinite(dom_values)
)

price_usable_rows = int(price_usable_mask.sum())
dom_usable_rows = int(dom_usable_mask.sum())

del price_values, dom_values
del price_usable_mask, dom_usable_mask

features = schema["features"]

if len(features) != 22 or len(set(features)) != len(features):
    raise RuntimeError(
        "Invalid feature schema: expected 22 unique model inputs."
    )

for model_name, model in [
    ("price", price_model),
    ("DOM", dom_model)
]:
    model_features = list(
        getattr(model, "feature_names_in_", [])
    )

    if model_features != features:
        raise RuntimeError(
            f"{model_name} model feature order does not match "
            "feature_schema.json; retrain with python ml/train.py."
        )

if metrics.get("dataset", {}).get("features") != features:
    raise RuntimeError(
        "metrics.json feature list does not match "
        "feature_schema.json; retrain with python ml/train.py."
    )


# Build defaults using a reproducible sample instead of transforming
# the entire dataset during application startup.
DEFAULT_SAMPLE_SIZE = min(5000, len(raw))
default_raw = raw.head(DEFAULT_SAMPLE_SIZE).copy()
default_transformed = transform(default_raw)

defaults = {}

for column in features:
    if column not in default_transformed.columns:
        continue

    series = default_transformed[column]

    if pd.api.types.is_numeric_dtype(series):
        median_value = pd.to_numeric(
            series, errors="coerce"
        ).median()

        defaults[column] = (
            float(median_value)
            if pd.notna(median_value)
            else 0.0
        )
    else:
        mode_values = series.mode(dropna=True)
        defaults[column] = (
            str(mode_values.iloc[0])
            if not mode_values.empty
            else ""
        )

del default_raw, default_transformed

os.makedirs(ART, exist_ok=True)

with open(
    os.path.join(ART, "defaults.json"), "w", encoding="utf-8"
) as f:
    json.dump(defaults, f, indent=2)


class PropertyInput(BaseModel):
    values: dict = Field(default_factory=dict)


def frame(values):
    data = defaults.copy()

    # Only accept inputs used by the trained models.
    allowed = set(features)
    data.update({
        key: value
        for key, value in values.items()
        if key in allowed
    })

    return pd.DataFrame([
        {key: data.get(key) for key in features}
    ])


def clean_pred(value, low=0):
    return max(float(value), low)


FIELD_LIMITS = {
    "Lng": (70, 140),
    "Lat": (15, 55),
    "followers": (0, 1000000),
    "square": (10, 1000),
    "livingRoom": (0, 20),
    "drawingRoom": (0, 20),
    "kitchen": (0, 10),
    "bathRoom": (0, 20),
    "buildingType": (1, 4),
    "constructionTime": (0, 2016),
    "renovationCondition": (1, 4),
    "buildingStructure": (1, 6),
    "ladderRatio": (0, 1),
    "elevator": (0, 1),
    "fiveYearsProperty": (0, 1),
    "subway": (0, 1),
    "district": (1, 13),
    "communityAverage": (0, 1000000),
    "floor_num": (0, 100),
    "trade_year": (2002, 2018),
    "trade_month": (1, 12),
    "trade_quarter": (1, 4)
}

INTEGER_FIELDS = {
    "followers",
    "livingRoom",
    "drawingRoom",
    "kitchen",
    "bathRoom",
    "buildingType",
    "constructionTime",
    "renovationCondition",
    "buildingStructure",
    "elevator",
    "fiveYearsProperty",
    "subway",
    "district",
    "floor_num",
    "trade_year",
    "trade_month",
    "trade_quarter"
}


def validate_values(values):
    for key, value in values.items():
        if key not in features:
            continue

        try:
            number = float(value)
        except (TypeError, ValueError):
            raise HTTPException(
                422, f"{key} must be a numeric value."
            )

        if not np.isfinite(number):
            raise HTTPException(
                422, f"{key} must be a finite number."
            )

        if key in FIELD_LIMITS:
            low, high = FIELD_LIMITS[key]

            if number < low or number > high:
                raise HTTPException(
                    422,
                    f"{key} must be between {low} and {high}."
                )

        if key in INTEGER_FIELDS and not number.is_integer():
            raise HTTPException(
                422, f"{key} must be a whole number."
            )

    month = values.get("trade_month")
    quarter = values.get("trade_quarter")

    if month is not None and quarter is not None:
        if int(quarter) != (int(month) - 1) // 3 + 1:
            raise HTTPException(
                422, "trade_month and trade_quarter do not match."
            )


@app.get("/health")
def health():
    models_loaded = (
        price_model is not None and dom_model is not None
    )

    return {
        "status": "ok" if models_loaded else "degraded",
        "project": "HomeVision",
        "models_loaded": models_loaded,
        "models": {
            "price": price_model is not None,
            "dom": dom_model is not None
        }
    }


@app.get("/summary")
def summary():
    return {
        "rows": int(len(raw)),
        "columns": int(raw.shape[1]),
        "usable_rows": price_usable_rows,
        "price_usable_rows": price_usable_rows,
        "dom_usable_rows": dom_usable_rows,
        "features": features,
        "targets": ["totalPrice", "DOM"]
    }


@app.get("/preprocessing-report")
@lru_cache(maxsize=1)
def preprocessing_report():
    """Return a cached data-quality report without transforming all rows."""

    missing = raw.isna().sum().sort_values(ascending=False)

    missing_rows = [
        {
            "column": str(column),
            "missing": int(count),
            "percent": round(
                float(count) / max(len(raw), 1) * 100, 2
            )
        }
        for column, count in missing.items()
        if int(count) > 0
    ]

    # The same transformation function is used for training and inference.
    # Inspect a small sample to identify available engineered features.
    report_sample = transform(
        raw.head(min(1000, len(raw))).copy()
    )

    engineered = [
        column
        for column in [
            "floor_num",
            "trade_year",
            "trade_month",
            "trade_quarter"
        ]
        if column in report_sample.columns
    ]

    removed_columns = [
        column
        for column in [
            "url", "id", "Cid", "floor", "tradeTime", "price"
        ]
        if column in raw.columns
    ]

    del report_sample

    return {
        "source_rows": int(len(raw)),
        "source_columns": int(raw.shape[1]),
        "duplicate_rows": int(raw.duplicated().sum()),
        "price_usable_rows": price_usable_rows,
        "dom_usable_rows": dom_usable_rows,
        "model_features": int(len(features)),
        "shared_training_inference_transform": True,
        "engineered_features": engineered,
        "removed_columns": removed_columns,
        "missing_values": missing_rows[:15],
        "steps": [
            {
                "title": "Target-specific filtering",
                "detail": (
                    "Price uses finite positive totalPrice; "
                    "DOM uses finite non-negative DOM independently."
                )
            },
            {
                "title": "Numeric conversion",
                "detail": (
                    "Room counts and construction year are converted "
                    "to numeric; invalid values become missing."
                )
            },
            {
                "title": "Floor feature extraction",
                "detail": (
                    "The source floor label is converted "
                    "to numeric floor_num."
                )
            },
            {
                "title": "Date feature extraction",
                "detail": (
                    "tradeTime is parsed into trade_year, "
                    "trade_month and trade_quarter."
                )
            },
            {
                "title": "Leakage and identifier removal",
                "detail": (
                    "Identifiers/free text and target columns "
                    "are excluded from model inputs."
                )
            },
            {
                "title": "Missing-value imputation",
                "detail": (
                    "Numeric features use median imputation; "
                    "categorical features use most-frequent "
                    "imputation in the fitted pipeline."
                )
            },
            {
                "title": "Categorical encoding",
                "detail": (
                    "Categorical inputs use ordinal encoding "
                    "with a safe unknown-category code."
                )
            },
            {
                "title": "Held-out evaluation",
                "detail": (
                    "MAE, RMSE and R² are reported from held-out "
                    "evaluation in artifacts/metrics.json."
                )
            }
        ]
    }


@app.get("/metrics")
def get_metrics():
    return metrics


@app.get("/importance")
def get_importance():
    return importance


@app.get("/factor-analysis")
@lru_cache(maxsize=1)
def factor_analysis():
    """
    Exploratory factor analysis using a smaller reproducible sample.
    Cached after the first successful calculation to speed up later calls.
    """

    candidates = [
        "square",
        "livingRoom",
        "drawingRoom",
        "kitchen",
        "bathRoom",
        "floor_num",
        "constructionTime",
        "renovationCondition",
        "buildingType",
        "buildingStructure",
        "ladderRatio",
        "followers",
        "communityAverage",
        "Lng",
        "Lat"
    ]

    # Sample before transforming to avoid transforming the full CSV.
    sample_raw = raw.sample(
        n=min(2000, len(raw)),
        random_state=42
    ).copy()

    data = transform(sample_raw)
    del sample_raw

    cols = []

    for column in candidates:
        if column not in data.columns:
            continue

        values = pd.to_numeric(data[column], errors="coerce")

        if (
            values.notna().sum() >= min(100, len(values))
            and values.nunique(dropna=True) > 1
        ):
            cols.append(column)

    if len(cols) < 3:
        raise HTTPException(
            500,
            "Not enough varying numeric features for factor analysis."
        )

    sample = data[cols].apply(pd.to_numeric, errors="coerce")
    del data

    sample = sample.replace(
        [np.inf, -np.inf], np.nan
    )
    sample = sample.fillna(sample.median())

    z = StandardScaler().fit_transform(sample)

    n_factors = min(3, max(2, len(cols) // 3))

    model = FactorAnalysis(
        n_components=n_factors,
        random_state=42,
        max_iter=100,
        tol=0.01
    )

    model.fit(z)

    loadings = model.components_.T
    factor_scores = model.transform(z)
    variance = np.var(factor_scores, axis=0)
    total = float(variance.sum()) or 1.0

    factors = []

    for j in range(n_factors):
        ranked = sorted(
            [
                {
                    "feature": column,
                    "loading": float(loadings[i, j])
                }
                for i, column in enumerate(cols)
            ],
            key=lambda item: abs(item["loading"]),
            reverse=True
        )

        factors.append({
            "name": f"Factor {j + 1}",
            "variance_share": float(variance[j] / total),
            "top_loadings": ranked[:6]
        })

    corr = sample.corr().replace(
        [np.inf, -np.inf], np.nan
    ).fillna(0)

    pairs = []

    for i, first in enumerate(cols):
        for second in cols[i + 1:]:
            value = float(corr.loc[first, second])

            if abs(value) >= 0.45:
                pairs.append({
                    "feature_a": first,
                    "feature_b": second,
                    "correlation": value
                })

    pairs = sorted(
        pairs,
        key=lambda item: abs(item["correlation"]),
        reverse=True
    )[:12]

    return {
        "method": (
            "Exploratory Factor Analysis "
            "(scikit-learn FactorAnalysis)"
        ),
        "sample_rows": int(len(sample)),
        "features": cols,
        "n_factors": n_factors,
        "factors": factors,
        "strong_correlations": pairs,
        "caveat": (
            "Exploratory results depend on selected numeric variables "
            "and historical Beijing data. Factor loadings are associations, "
            "not causal effects, and are separate from permutation "
            "feature importance."
        )
    }


@app.get("/defaults")
def get_defaults():
    return defaults


@app.post("/predict")
def predict(req: PropertyInput):
    try:
        validate_values(req.values)

        X = frame(req.values)
        predicted_price = clean_pred(price_model.predict(X)[0])
        predicted_dom = clean_pred(dom_model.predict(X)[0])

        return {
            "predicted_price": predicted_price,
            "predicted_dom_days": predicted_dom,
            "price_unit": "10k CNY",
            "interpretation": interpret(
                predicted_price, predicted_dom
            )
        }

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(400, str(error))


@app.post("/what-if")
def whatif(req: dict):
    scenarios = req.get("scenarios", [])

    if not isinstance(scenarios, list) or not scenarios:
        raise HTTPException(
            400, "Provide a non-empty scenarios list."
        )

    if len(scenarios) > 10:
        raise HTTPException(
            422, "Compare at most 10 scenarios per request."
        )

    output = []

    for i, scenario in enumerate(scenarios, 1):
        if not isinstance(scenario, dict):
            raise HTTPException(
                422, f"Scenario {i} must be an object."
            )

        values = scenario.get("values", {})

        if not isinstance(values, dict):
            raise HTTPException(
                422, f"Scenario {i} values must be an object."
            )

        validate_values(values)

        X = frame(values)
        predicted_price = clean_pred(price_model.predict(X)[0])
        predicted_dom = clean_pred(dom_model.predict(X)[0])

        name = scenario.get("name", f"Scenario {i}")

        if not isinstance(name, str) or not name.strip():
            raise HTTPException(
                422,
                f"Scenario {i} name must be a non-empty string."
            )

        output.append({
            "name": name.strip()[:80],
            "price": predicted_price,
            "dom": predicted_dom
        })

    base = output[0]

    for result in output:
        result["price_change"] = result["price"] - base["price"]
        result["dom_change"] = result["dom"] - base["dom"]

    return {
        "scenarios": output,
        "insight": scenario_insight(output)
    }


def interpret(price, dom):
    if dom < 30:
        speed = "shorter estimated market duration"
    elif dom < 90:
        speed = "moderate estimated market duration"
    else:
        speed = "longer estimated market duration"

    return (
        f"Estimated value: {price:.2f} (10k CNY) "
        f"with a {speed} of about {dom:.0f} days."
    )


def scenario_insight(rows):
    if len(rows) < 2:
        return "Add at least two scenarios to compare trade-offs."

    best = max(rows, key=lambda item: item["price"])
    fastest = min(rows, key=lambda item: item["dom"])

    if best["name"] == fastest["name"]:
        return (
            f"{best['name']} has both the highest estimated price "
            "and shortest estimated DOM among the scenarios."
        )

    return (
        f"{best['name']} has the highest estimated price, while "
        f"{fastest['name']} has the shortest estimated DOM. "
        "The choice is a price-versus-time trade-off."
    )


app.mount(
    "/",
    StaticFiles(
        directory=os.path.join(ROOT, "frontend"),
        html=True
    ),
    name="frontend"
)
