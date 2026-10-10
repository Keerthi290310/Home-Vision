# Model evaluation and validation

## Targets and leakage control

HomeVision trains two independent regression pipelines using target-specific valid rows:

- `totalPrice`: estimated total property price in the source dataset unit (10,000 CNY).
- `DOM`: days on market.

The DOM target is not a price feature, and totalPrice is not a DOM feature. The alternate `price` field is excluded from both feature sets because it may be target-derived. URL and identifier columns are excluded. Model selection uses a validation split; final metrics are reported on a separate held-out test split.

## Dataset coverage

The included Beijing housing dataset contains 318,851 rows. All 318,851 rows have a valid positive `totalPrice`; 160,874 have a valid non-negative DOM target. The price model therefore uses its own larger eligible population rather than dropping price records when DOM is missing.

The transaction dates run from 2002-06-01 through 2018-01-28. The dashboard limits trade year to 2002–2018 and construction year to the source range through 2016 (0 means unknown). These are historical data limits, not evidence that the model is current for today's market.

## Latest packaged model results

Metrics below are read from `artifacts/metrics.json` and refer to the held-out test split for each target.

| Target | MAE | RMSE | R² | Test rows |
|---|---:|---:|---:|---:|
| totalPrice | 32.184 | 65.376 | 0.920 | 63,771 |
| DOM | 18.152 days | 37.438 days | 0.456 | 32,175 |

Price MAE/RMSE use the source unit of 10,000 CNY (approximately ¥321,838 MAE and ¥653,759 RMSE). DOM MAE means the average absolute error is about 18 days on this test set; it does not mean each individual estimate is within 18 days. R² is not percentage accuracy. DOM is less predictive than price, so market-duration outputs must be treated as rough estimates.

## DOM target caveat

The DOM target is incomplete (157,977 rows are missing it), and its observed distribution is strongly concentrated at 1 day (69,162 records among valid DOM rows). This skew can affect what the model learns. The current model outperforms the median baseline on the sampled validation benchmark, but its R² around 0.46 shows meaningful unexplained variation remains. Do not present DOM as precise or guaranteed.

## Benchmark interpretation

The benchmark table uses the same sampled validation records within each target. The final reported metrics use the full held-out test split, so benchmark values and final metrics are not directly interchangeable. Candidate selection is based on validation RMSE; final metrics are reported on untouched test records.

## Feature importance and what-if analysis

The dashboard uses permutation feature importance to show which input columns most affect model error when shuffled. This is a model-interpretation aid, not a causal or formal statistical factor analysis. Scenario Lab currently changes living area, renovation code and floor while holding all other inputs at the sample defaults; its differences are model scenarios, not causal claims.

## Reproduce

From the project root, install `requirements.txt`, then run:

```powershell
python ml/train.py --fast
python -m pytest -q
```

Predictions are historical-data estimates for decision support, not formal property valuations or guarantees of selling time.
