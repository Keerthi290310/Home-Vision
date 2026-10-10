# HomeVision — Project Explanation Guide

## One-line explanation
HomeVision is a housing decision-support prototype that predicts two separate outcomes from property features: estimated sale price (`totalPrice`) and estimated days on market (`DOM`). It also lets users compare property scenarios and inspect model evaluation evidence.

## Why this project is different
A basic housing demo usually outputs only one estimated price. HomeVision combines a price estimate with a market-duration estimate and provides a what-if comparison workflow. These are estimates from historical data, not promises about a real sale.

## Dashboard walkthrough
1. **Overview:** introduces the problem, the two prediction targets, dataset size, and test-set R² indicators.
2. **Predict:** enter property characteristics. Start from dataset-derived defaults; change only values you know. Click “Predict price + market time.” The price is in 10k CNY units, so multiply by 10,000 for CNY. DOM is in days.
3. **Scenario Lab:** Scenario A is the reference; Scenario B changes area, renovation code, and floor. The API predicts both outcomes for each scenario and calculates differences relative to A.
4. **Model Insights:** permutation-importance signals from a held-out sample. These indicate associations used by the fitted model, not proof of causation.
5. **Validation & Evidence:** MAE and RMSE measure prediction error (lower is generally better); R² measures how much target variation is explained relative to a constant-mean baseline (closer to 1 is generally better). Candidate benchmark models are evaluated on a held-out split.

## Dataset and method
- Included source file: `data/new.csv`.
- The source has 318,851 rows and 26 columns. Target filtering is independent: all 318,851 rows have valid positive `totalPrice`; 160,874 rows have valid non-negative `DOM`. Missing DOM values do not remove valid price records.
- Data preparation handles numeric conversion, floor extraction, and trade-date features.
- Separate regression pipelines are trained for price and DOM. The target columns are excluded from the input features to avoid direct target leakage.
- Model selection uses a validation split, then final metrics are reported on a separate held-out test split (random state 42). DOM values are strongly skewed and about 43% of valid DOM records equal 1 day, so DOM outputs are approximate.

## Honest limitations to mention
- Data comes from historical housing records and may not represent today's market or other countries/cities.
- Several source fields are category codes; the dashboard keeps those codes because the dataset does not provide verified human-readable labels for every code.
- Days-on-market is harder to predict and depends on many factors absent from the data.
- Predictions are not a formal valuation, financial advice, or a guarantee of sale price or timing.
- Model metrics describe the included evaluation split and do not guarantee performance on new markets.

## Demo checklist
- [ ] Launch `run_homevision.bat` and wait for the API terminal to show it is running.
- [ ] Confirm the dashboard status says API online.
- [ ] Run one property prediction and confirm both outputs change/update.
- [ ] Run Scenario Lab and confirm two scenario rows and differences appear.
- [ ] Open Model Insights and confirm feature bars appear.
- [ ] Open Validation & Evidence and confirm metrics and benchmark rows appear.
- [ ] If any page is empty, do not present it as working; check the API terminal for the error first.
