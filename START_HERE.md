# HomeVision — Start Here

## What this project does
HomeVision is a machine-learning decision-support prototype with two separate regression models:
- **Price model:** estimates `totalPrice` from the available property features. The output uses the dataset unit **10k CNY**; multiply by 10,000 to express the estimate in CNY.
- **DOM model:** estimates `DOM`, the number of days a property may remain on the market.
- **Scenario Lab:** compares alternative property inputs using the same models.
- **Model Insights / Evidence:** shows feature-impact information and held-out evaluation metrics from the training artifacts.

This is a research/demo estimate, not a formal appraisal or guarantee. The included source data represents historical Beijing housing records; results should not be assumed reliable for other locations or current market conditions. The included dataset has 318,851 source rows; the modeling pipeline filters invalid targets before training. Coded fields (district, building type, renovation condition, and building structure) remain numeric codes because a reliable code-to-label mapping is not included.

## Easiest start on Windows
Double-click **`run_homevision.bat`**. It creates the project virtual environment if needed, installs requirements, and starts the API/dashboard using the included trained model artifacts. Keep the API terminal window open. Open **http://127.0.0.1:8000** if the browser does not open automatically. Training is not required for the first launch; retrain only when you intentionally want to regenerate the models.

## Manual run on Windows PowerShell
Open PowerShell in the folder containing this file (`START_HERE.md`) and run one command at a time:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --retries 10 --timeout 60 -r requirements.txt
python -m uvicorn backend.main:app --reload
```

If package installation times out, check your internet connection and rerun the install command. Do not run the last command until installation finishes successfully.

Then open **http://127.0.0.1:8000** in your browser. The FastAPI backend serves the dashboard and API from the same address. Keep the terminal open while using the dashboard.

## Understanding the prediction screen
1. Begin with dataset defaults.
2. Enter only realistic details you know.
3. All 22 model inputs are grouped by location, home/building, and listing/market timing. Binary fields use Yes/No; coded categories remain dataset codes because the source does not provide human-readable names for those codes. Use the sample default when you do not know a field—do not guess a code.
4. Click **Predict price + market time**.
5. Read both estimates together; use Scenario Lab to compare changes.
6. Check the Evidence page for MAE, RMSE, R² and candidate-model comparisons. Metrics are dataset/test-split dependent.

## Troubleshooting
- `No module named uvicorn`: dependency installation did not complete in the active `.venv`; rerun the pip install command.
- `requirements.txt` not found: ensure PowerShell is in the same folder as this file.
- `API unavailable`: use `run_homevision.bat`, or start the backend with the command above and refresh. The dashboard should be opened at `http://127.0.0.1:8000`. If using a separate static server on port 5500, the frontend now targets the backend at port 8000, but the backend must still be running.
- The included model artifacts were prepared with scikit-learn 1.8.0, pinned in `requirements.txt` to avoid cross-version loading warnings. If you intentionally retrain, keep the environment version consistent and review the newly generated evaluation metrics.

## Tests and retraining
```powershell
python -m pytest -q
# Optional: retrain the models from the included dataset
python ml/train.py --fast
```


## Important first run
Run `run_homevision.bat` first; it creates the virtual environment and installs packages. Do not run `run_backend.bat` before setup. To access exploratory statistical Factor Analysis, open the **Factor Analysis** tab and select **Run factor analysis**. The separate **Model Insights** tab shows permutation-based feature importance.
