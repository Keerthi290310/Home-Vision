"""Train independent HomeVision models with target-specific valid records."""
import os, json, re, time, argparse
import numpy as np
import pandas as pd
import joblib
try:
    from .preprocessing import transform_features
except ImportError:  # supports direct execution: python ml/train.py
    from preprocessing import transform_features
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OrdinalEncoder
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.dummy import DummyRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.inspection import permutation_importance

ROOT = os.path.dirname(os.path.dirname(__file__))
DATA = os.path.join(ROOT, 'data', 'new.csv')
ART = os.path.join(ROOT, 'artifacts')
os.makedirs(ART, exist_ok=True)
RANDOM_STATE = 42

def prep(frame):
    return transform_features(frame)


def metrics(y_true, predictions):
    return {'MAE': float(mean_absolute_error(y_true, predictions)),
            'RMSE': float(np.sqrt(mean_squared_error(y_true, predictions))),
            'R2': float(r2_score(y_true, predictions))}

def make_preprocessor(categorical, numerical):
    return ColumnTransformer([
        ('num', SimpleImputer(strategy='median'), numerical),
        ('cat', Pipeline([('imputer', SimpleImputer(strategy='most_frequent')),
                          ('ordinal', OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1))]), categorical)
    ])

def candidates():
    return {
        'RandomForest': RandomForestRegressor(n_estimators=100, max_depth=18, min_samples_leaf=2, n_jobs=-1, random_state=RANDOM_STATE),
        'HistGradientBoosting': HistGradientBoostingRegressor(max_iter=100, learning_rate=.08, max_leaf_nodes=31, l2_regularization=1.0, random_state=RANDOM_STATE)
    }

def fit_pipe(name, model, X, y, categorical, numerical):
    pipe = Pipeline([('pre', make_preprocessor(categorical, numerical)), ('model', model)])
    pipe.fit(X, y)
    return pipe

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fast', action='store_true', help='Train the HistGradientBoosting model only')
    args = parser.parse_args()

    df = pd.read_csv(DATA, encoding='latin1', low_memory=False)
    X_all = prep(df.drop(columns=['totalPrice', 'DOM']))
    price_all = pd.to_numeric(df['totalPrice'], errors='coerce')
    dom_all = pd.to_numeric(df['DOM'], errors='coerce')
    price_valid = np.isfinite(price_all) & (price_all > 0)
    dom_valid = np.isfinite(dom_all) & (dom_all >= 0)

    # Keep every usable price record even when DOM is missing; train each target independently.
    target_data = {
        'totalPrice': (X_all.loc[price_valid].reset_index(drop=True), price_all.loc[price_valid].reset_index(drop=True), 'price_pipeline.joblib'),
        'DOM': (X_all.loc[dom_valid].reset_index(drop=True), dom_all.loc[dom_valid].reset_index(drop=True), 'dom_pipeline.joblib')
    }
    categorical = [c for c in X_all.columns if X_all[c].dtype == 'object']
    numerical = [c for c in X_all.columns if c not in categorical]
    bench = []
    selected = {}
    final_metrics = {}
    split_counts = {}
    importance_output = {}

    for target, (X, y, artifact_name) in target_data.items():
        X_train_all, X_test, y_train_all, y_test = train_test_split(X, y, test_size=.2, random_state=RANDOM_STATE)
        # Reserve validation records for model selection; the final test split remains held out.
        X_train, X_val, y_train, y_val = train_test_split(X_train_all, y_train_all, test_size=.1875, random_state=RANDOM_STATE)
        split_counts[target] = {'usable_rows': int(len(X)), 'train_rows': int(len(X_train)), 'validation_rows': int(len(X_val)), 'test_rows': int(len(X_test))}

        rng = np.random.RandomState(RANDOM_STATE)
        train_idx = rng.choice(len(X_train), min(30000, len(X_train)), replace=False)
        val_idx = np.arange(min(10000, len(X_val)))
        X_bench, y_bench = X_train.iloc[train_idx], y_train.iloc[train_idx]
        X_eval, y_eval = X_val.iloc[val_idx], y_val.iloc[val_idx]
        candidate_models = [('BaselineMedian', DummyRegressor(strategy='median'))]
        candidate_models += ([('HistGradientBoosting', candidates()['HistGradientBoosting'])] if args.fast else list(candidates().items()))
        for model_name, model in candidate_models:
            start = time.time()
            pipe = fit_pipe(model_name, model, X_bench, y_bench, categorical, numerical)
            bench_metrics = metrics(y_eval, pipe.predict(X_eval))
            bench.append({'model': model_name, 'target': target, **bench_metrics,
                          'evaluation_rows': int(len(X_eval)), 'training_rows': int(len(X_bench)),
                          'evaluation_split': 'validation sample'})
            bench[-1]['training_seconds'] = round(time.time() - start, 2)

        options = list(candidates().items())
        if args.fast:
            options = [('HistGradientBoosting', candidates()['HistGradientBoosting'])]
        scored = []
        for model_name, model in options:
            fit_idx = np.arange(len(X_train))
            if args.fast and len(fit_idx) > 120000:
                fit_idx = np.random.RandomState(RANDOM_STATE).choice(fit_idx, 120000, replace=False)
            pipe = fit_pipe(model_name, model, X_train.iloc[fit_idx], y_train.iloc[fit_idx], categorical, numerical)
            val_metrics = metrics(y_val, pipe.predict(X_val))
            scored.append((val_metrics['RMSE'], model_name, model, val_metrics))
        scored.sort(key=lambda item: item[0])
        _, model_name, model, validation_metrics = scored[0]
        # Refit chosen model on train + validation, then report once on untouched test records.
        X_fit = pd.concat([X_train, X_val], axis=0)
        y_fit = pd.concat([y_train, y_val], axis=0)
        if args.fast and len(X_fit) > 150000:
            fit_idx = np.random.RandomState(RANDOM_STATE).choice(len(X_fit), 150000, replace=False)
            X_fit, y_fit = X_fit.iloc[fit_idx], y_fit.iloc[fit_idx]
        final_pipe = fit_pipe(model_name, model, X_fit, y_fit, categorical, numerical)
        test_predictions = final_pipe.predict(X_test)
        selected[target] = model_name
        final_metrics[target] = metrics(y_test, test_predictions)
        final_metrics[target]['validation_RMSE'] = float(validation_metrics['RMSE'])
        final_metrics[target]['evaluation_rows'] = int(len(X_test))
        joblib.dump(final_pipe, os.path.join(ART, artifact_name))

        sample_n = min(400, len(X_test))
        importance_idx = np.random.RandomState(RANDOM_STATE).choice(len(X_test), sample_n, replace=False)
        perm = permutation_importance(final_pipe, X_test.iloc[importance_idx], y_test.iloc[importance_idx],
                                      n_repeats=2, random_state=RANDOM_STATE,
                                      scoring='neg_mean_absolute_error', n_jobs=1)
        importance_output[target] = [{'feature': feature, 'importance': float(value)}
                                     for feature, value in sorted(zip(X.columns, perm.importances_mean),
                                                                  key=lambda item: abs(item[1]), reverse=True)[:12]]

    out = {
        'dataset': {'rows': int(df.shape[0]), 'columns': int(df.shape[1]),
                    'price_usable_rows': int(price_valid.sum()), 'dom_usable_rows': int(dom_valid.sum()),
                    'usable_rows': int(price_valid.sum()),
                    'features': list(X_all.columns)},
        'target_splits': split_counts,
        'price_model': {'name': selected['totalPrice'], 'metrics': final_metrics['totalPrice']},
        'dom_model': {'name': selected['DOM'], 'metrics': final_metrics['DOM']},
        'benchmark': bench,
        'selection_rule': 'lowest validation RMSE among candidate models; final metrics are measured on a separate held-out test split',
        'split': {'test_size': .2, 'validation_size_of_remaining': .1875, 'random_state': RANDOM_STATE},
        'targets': {'price': 'totalPrice', 'dom': 'DOM'},
        'dom_target_distribution': {'valid_rows': int(dom_valid.sum()), 'one_day_rows': int((dom_all[dom_valid] == 1).sum()), 'one_day_share': float((dom_all[dom_valid] == 1).mean()), 'median_days': float(dom_all[dom_valid].median()), 'p90_days': float(dom_all[dom_valid].quantile(.90))},
        'notes': ['Price and DOM models use independent valid target records.',
                  'Benchmark rows use the same sampled validation records within each target.',
                  'DOM is strongly skewed; interpret its estimates as approximate.',
                  'R² is a fit statistic, not a percentage accuracy guarantee.']
    }
    with open(os.path.join(ART, 'metrics.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2)
    with open(os.path.join(ART, 'feature_importance.json'), 'w', encoding='utf-8') as f:
        json.dump({'price': importance_output['totalPrice'], 'dom': importance_output['DOM']}, f, indent=2)
    with open(os.path.join(ART, 'feature_schema.json'), 'w', encoding='utf-8') as f:
        json.dump({'features': list(X_all.columns), 'categorical': categorical, 'numerical': numerical}, f, indent=2)
    print(json.dumps(out, indent=2))

if __name__ == '__main__':
    main()
