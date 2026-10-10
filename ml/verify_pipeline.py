"""Verify the saved HomeVision dataset -> preprocessing -> model -> API contract.
Run from the project root: python ml/verify_pipeline.py
This checks existing artifacts; it does not retrain models.
"""
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from preprocessing import transform_features

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artifacts'
DATA = ROOT / 'data' / 'new.csv'


def main():
    raw = pd.read_csv(DATA, encoding='latin1', low_memory=False)
    schema = json.loads((ART / 'feature_schema.json').read_text(encoding='utf-8'))
    metrics = json.loads((ART / 'metrics.json').read_text(encoding='utf-8'))
    defaults = json.loads((ART / 'defaults.json').read_text(encoding='utf-8'))
    features = schema['features']
    assert len(features) == 22 and len(set(features)) == 22, 'Expected 22 unique features.'
    assert list(defaults) == features, 'Defaults order differs from model schema.'
    assert metrics['dataset']['features'] == features, 'Metrics schema differs.'
    assert not ({'totalPrice', 'DOM', 'price', 'id', 'Cid', 'url', 'floor', 'tradeTime'} & set(features)), 'Target/leakage fields found.'

    transformed = transform_features(raw)
    missing = [f for f in features if f not in transformed.columns]
    assert not missing, f'Preprocessing does not produce schema features: {missing}'
    model_input = transformed.loc[:, features].head(5).copy()
    for name in ('price_pipeline.joblib', 'dom_pipeline.joblib'):
        model = joblib.load(ART / name)
        assert list(model.feature_names_in_) == features, f'{name} input order mismatch.'
        prediction = model.predict(model_input)
        assert len(prediction) == len(model_input) and np.isfinite(prediction).all(), f'{name} produced invalid predictions.'

    print('PIPELINE CONTRACT: PASS')
    print(f'Dataset rows: {len(raw):,}; source columns: {raw.shape[1]}')
    print(f'Model features: {len(features)}; feature order: consistent')
    print('Training/inference preprocessing: shared function')
    print('Saved price + DOM models: finite predictions on 5 dataset rows each')
    print('Metrics and defaults: schema matches')
    print('NOTE: This verifies saved artifacts; it does not retrain models or test browser interactions.')

if __name__ == '__main__':
    main()
