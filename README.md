# HomeVision
## Dashboard workflow

The dashboard is ordered as Overview → Data Preprocessing → Factor Analysis → Model Insights → Predict → Scenario Lab → Evidence. The modelling workflow is Dataset → preprocessing and feature engineering → exploratory analysis → candidate-model training and selection → held-out evaluation → prediction. Factor analysis is exploratory and does not establish causation.

## AI-Based Housing Price Prediction and Days-on-Market Analysis System

HomeVision is an actual-data ML decision-support prototype trained on historical Beijing housing records. It should not be assumed reliable for other locations, countries, or current market conditions. Instead of stopping at house-price prediction, it combines **price prediction, Days-on-Market (DOM) prediction, what-if scenario comparison, model benchmarking, and feature-impact analysis** in one workflow.

### Latest dashboard refresh
The sidebar is organized as Overview → Data Preprocessing → Factor Analysis → Model Insights → Predict → Scenario Lab → Evidence. Data Preprocessing displays dataset-derived missingness, duplicate counts, target eligibility and feature transformations. Factor Analysis has its own page, separate from model feature importance. The dashboard groups all 22 model inputs into location, home/building, and listing/timing sections; explains each input in plain language; identifies sample defaults; provides reset-to-defaults; validates numeric ranges and matching trade month/quarter; and presents price plus time-on-market with clear units. Scenario Lab displays side-by-side estimates and the alternative-minus-baseline difference. Model Insights and Evidence explain how to read their charts and metrics. The launch script reuses a running HomeVision server or tries port 8001 if port 8000 is occupied.

## Dataset
`data/new.csv` is the supplied housing dataset. It contains 318,851 source records and 26 columns. Model eligibility is target-specific: all 318,851 rows have valid positive `totalPrice`, while 160,874 rows have valid non-negative `DOM`. Missing DOM values do not discard otherwise usable price records.

Targets:
- `totalPrice` → price regression
- `DOM` → market-duration regression

Identifiers/free-text fields are removed from modeling; mixed room/date/floor fields are converted into model-ready features. Target leakage is prevented by excluding each target from its own feature matrix.

## Why it is different
1. Two independent prediction targets in one workflow.
2. What-if scenario engine that reruns both models.
3. Price-versus-market-time trade-off interpretation.
4. Permutation-based feature-impact view for both models (model interpretation, not causal proof).
5. Actual model benchmark and held-out evaluation evidence.
6. Full API + dashboard + automated tests.

## Run on Windows
Recommended: double-click `run_homevision.bat`; it checks dependencies, reuses an existing HomeVision server, and opens the dashboard. See `START_HERE.md` for a beginner-friendly explanation and troubleshooting. For manual launch, from the project root:

```powershell
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload
```

Open `http://127.0.0.1:8000`.

### Model compatibility
The included serialized model artifacts were prepared with scikit-learn 1.8.0, pinned in `requirements.txt`. Keep this version when using the included artifacts to avoid version-mismatch warnings. If you intentionally retrain, record the new environment and review the resulting evaluation metrics. You can rebuild explicitly:

```powershell
python ml/train.py
```

This avoids relying on a specific machine's pickle internals.

### One-click backend
After dependencies are installed, double-click `run_backend.bat`.

## Retrain
```bash
python ml/train.py
```
This reads the included `data/new.csv`, trains the pipelines, evaluates them on an 80/20 held-out split, and writes artifacts to `artifacts/`.

## Test
```bash
pytest -q
```

## API
- `GET /health`
- `GET /summary`
- `GET /metrics`
- `GET /importance`
- `GET /defaults`
- `POST /predict`
- `POST /what-if`

## Evidence
All displayed metrics are read from `artifacts/metrics.json`. The included DOM target is incomplete and strongly skewed, so DOM predictions are approximate and less reliable than price predictions. Price is expressed in 10,000 CNY units in the dataset; the interface also shows its approximate CNY equivalent. Coded category values remain numeric because the supplied source does not contain a trustworthy code-to-name mapping. Predictions are estimates, not guarantees or formal valuations.


## Statistical Factor Analysis
The Model Insights page includes an on-demand exploratory Factor Analysis endpoint (`GET /factor-analysis`). It standardizes selected numeric property attributes, fits scikit-learn `FactorAnalysis` on a reproducible sample, and displays factor loadings plus strong pairwise numeric correlations. This is distinct from permutation feature importance. Factors are exploratory associations, not causal effects; results reflect historical Beijing records and the selected variables.

## Run on Windows
From the extracted `HomeVision_Final` folder, double-click `run_homevision.bat` first. It creates `.venv`, installs requirements, starts the API/dashboard and opens the browser. `run_backend.bat` expects that environment to exist, so use it only after setup.


## Data preprocessing and model implementation

See `docs/data_preprocessing_and_models.md` for the implemented preprocessing pipeline, separate price/DOM models, validation-based model selection, and reproducible training commands. The implementation is in `ml/train.py`; it is code, not just a planned feature.
