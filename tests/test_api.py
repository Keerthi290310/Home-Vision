from fastapi.testclient import TestClient
from backend.main import app
client=TestClient(app)
def test_health():
    response = client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['project'] == 'HomeVision'
    assert body['status'] == 'ok'
    assert body['models_loaded'] is True
    assert body['models'] == {'price': True, 'dom': True}
def test_summary():
 r=client.get('/summary'); assert r.status_code==200 and r.json()['rows']>300000
def test_predict():
 d=client.get('/defaults').json(); r=client.post('/predict',json={'values':d}); assert r.status_code==200; x=r.json(); assert x['predicted_price']>=0 and x['predicted_dom_days']>=0
def test_what_if():
 d=client.get('/defaults').json(); r=client.post('/what-if',json={'scenarios':[{'name':'A','values':d},{'name':'B','values':{**d,'square':d.get('square',90)+20}}]}); assert r.status_code==200 and len(r.json()['scenarios'])==2

def test_dashboard_served():
    r=client.get('/')
    assert r.status_code==200 and 'HomeVision' in r.text

def test_metrics_and_importance():
    m=client.get('/metrics')
    i=client.get('/importance')
    assert m.status_code==200 and 'price_model' in m.json() and 'dom_model' in m.json()
    assert i.status_code==200 and 'price' in i.json() and 'dom' in i.json()

def test_target_and_leakage_fields_are_not_model_inputs():
    d=client.get('/defaults').json()
    d.update({'totalPrice': 999999999, 'DOM': 999999999, 'price': 999999999, 'not_a_feature': 999999999})
    r=client.post('/predict',json={'values':d})
    assert r.status_code==200
    assert r.json()['predicted_price'] < 999999999


def test_predict_rejects_invalid_area():
    d=client.get('/defaults').json()
    d['square']=0
    r=client.post('/predict',json={'values':d})
    assert r.status_code==422 and 'square' in r.json()['detail']

def test_predict_rejects_inconsistent_trade_month_quarter():
    d=client.get('/defaults').json()
    d['trade_month']=1
    d['trade_quarter']=4
    r=client.post('/predict',json={'values':d})
    assert r.status_code==422 and 'do not match' in r.json()['detail']


def test_predict_rejects_trade_year_outside_dataset_period():
    d=client.get('/defaults').json()
    d['trade_year']=2026
    r=client.post('/predict',json={'values':d})
    assert r.status_code==422 and 'trade_year' in r.json()['detail']

def test_predict_rejects_construction_year_outside_dataset_period():
    d=client.get('/defaults').json()
    d['constructionTime']=2026
    r=client.post('/predict',json={'values':d})
    assert r.status_code==422 and 'constructionTime' in r.json()['detail']


def test_factor_analysis_endpoint():
    r=client.get('/factor-analysis')
    assert r.status_code==200
    body=r.json()
    assert body['n_factors'] >= 2
    assert body['sample_rows'] > 100
    assert body['factors'] and body['features']
    assert 'not causal' in body['caveat']

def test_what_if_rejects_invalid_scenario():
    d=client.get('/defaults').json()
    d['square']=0
    r=client.post('/what-if',json={'scenarios':[{'name':'Bad','values':d}]})
    assert r.status_code==422


def test_model_input_schema_has_22_consistent_features():
    schema = client.get('/summary')
    defaults = client.get('/defaults')
    assert schema.status_code == 200 and defaults.status_code == 200
    feature_names = schema.json()['features']
    default_values = defaults.json()
    assert len(feature_names) == 22
    assert len(default_values) == 22
    assert set(feature_names) == set(default_values)


def test_saved_artifacts_and_api_share_the_same_22_feature_schema():
    import json
    from pathlib import Path
    from backend.main import ROOT, schema, defaults, price_model, dom_model

    features = schema['features']
    assert len(features) == 22
    assert len(set(features)) == 22
    assert list(defaults.keys()) == features
    assert list(schema['numerical']) + list(schema.get('categorical', [])) == features
    for model in (price_model, dom_model):
        assert list(model.feature_names_in_) == features
    with open(Path(ROOT) / 'artifacts' / 'metrics.json', encoding='utf-8') as f:
        metrics = json.load(f)
    assert metrics['dataset']['features'] == features


def test_dashboard_navigation_and_sections_follow_analysis_workflow():
    from pathlib import Path
    from backend.main import ROOT
    html = (Path(ROOT) / 'frontend' / 'index.html').read_text(encoding='utf-8')
    expected = ['overview', 'preprocessing', 'factor', 'insights', 'predict', 'whatif', 'data']
    nav = html.split('<nav', 1)[1].split('</nav>', 1)[0]
    nav_order = [nav.index(f'data-tab="{name}"') for name in expected]
    assert nav_order == sorted(nav_order)
    main = html.split('<main', 1)[1]
    import re
    section_order = [re.search(r'<section[^>]*id="' + re.escape(name) + r'"', main).start() for name in expected]
    assert section_order == sorted(section_order)

def test_shared_preprocessing_removes_targets_and_builds_model_features():
    import pandas as pd
    from ml.preprocessing import transform_features
    from backend.main import schema
    sample = pd.DataFrame([{
        'url': 'example', 'id': 1, 'Cid': 2, 'tradeTime': '2015-03-12',
        'floor': '高楼层 12层', 'totalPrice': 300, 'DOM': 20, 'price': 30000,
        'Lng': 116.4, 'Lat': 39.9, 'followers': 10, 'square': 80,
        'livingRoom': '2', 'drawingRoom': '1', 'kitchen': 1, 'bathRoom': '1',
        'buildingType': 1, 'constructionTime': '2005', 'renovationCondition': 2,
        'buildingStructure': 6, 'ladderRatio': .2, 'elevator': 1,
        'fiveYearsProperty': 1, 'subway': 1, 'district': 2, 'communityAverage': 50000
    }])
    result = transform_features(sample)
    assert list(result.columns) == schema['features']
    assert result.loc[0, 'floor_num'] == 12
    assert result.loc[0, 'trade_month'] == 3 and result.loc[0, 'trade_quarter'] == 1
    assert not ({'totalPrice', 'DOM', 'price', 'url', 'id', 'Cid'} & set(result.columns))


def test_what_if_rejects_malformed_scenario_values():
    for scenarios in ([{'name': 'bad', 'values': None}], [None], {'name': 'bad'}):
        response = client.post('/what-if', json={'scenarios': scenarios})
        assert response.status_code in (400, 422)


def test_what_if_rejects_more_than_ten_scenarios():
    defaults = client.get('/defaults').json()
    scenarios = [{'name': f'S{i}', 'values': defaults} for i in range(11)]
    response = client.post('/what-if', json={'scenarios': scenarios})
    assert response.status_code == 422
    assert '10 scenarios' in response.json()['detail']


def test_what_if_returns_consistent_deltas():
    defaults = client.get('/defaults').json()
    response = client.post('/what-if', json={'scenarios': [
        {'name': 'A', 'values': defaults},
        {'name': 'B', 'values': {**defaults, 'square': defaults['square'] + 10}},
    ]})
    assert response.status_code == 200
    rows = response.json()['scenarios']
    assert rows[0]['price_change'] == 0 and rows[0]['dom_change'] == 0
    assert abs(rows[1]['price_change'] - (rows[1]['price'] - rows[0]['price'])) < 1e-8
    assert abs(rows[1]['dom_change'] - (rows[1]['dom'] - rows[0]['dom'])) < 1e-8


def test_start_analysis_and_scenario_ctas_point_to_real_dashboard_sections():
    from pathlib import Path
    from backend.main import ROOT
    import re
    html = (Path(ROOT) / 'frontend' / 'index.html').read_text(encoding='utf-8')
    js = (Path(ROOT) / 'frontend' / 'app.js').read_text(encoding='utf-8')
    assert re.search(r'data-open-tab="preprocessing"[^>]*>Start analysis', html, re.I)
    assert re.search(r'data-open-tab="whatif"[^>]*>Open Scenario Lab', html, re.I)
    for target in ('predict', 'whatif'):
        assert re.search(r'<section[^>]*id="' + re.escape(target) + r'"', html)
        assert f"{target}:" in js or f"'{target}'" in js
    assert "addEventListener('click',()=>showTab(button.dataset.openTab" in js
    assert "window.scrollTo({top:Math.max(0,y),behavior:options.behavior||'smooth'})" in js
    assert 'window.location.href' not in js


def test_every_sidebar_navigation_button_has_a_matching_section():
    from pathlib import Path
    from backend.main import ROOT
    import re
    html = (Path(ROOT) / 'frontend' / 'index.html').read_text(encoding='utf-8')
    nav = html.split('<nav', 1)[1].split('</nav>', 1)[0]
    targets = re.findall(r'data-tab="([^"]+)"', nav)
    section_ids = re.findall(r'<section[^>]*class="[^"]*\btab\b[^"]*"[^>]*id="([^"]+)"', html)
    # Also support class/id attributes appearing in the opposite order.
    section_ids += re.findall(r'<section[^>]*id="([^"]+)"[^>]*class="[^"]*\btab\b[^"]*"', html)
    assert targets
    assert set(targets) <= set(section_ids)
    assert len(targets) == len(set(targets))


def test_start_analysis_and_step_by_step_workflow_targets():
    from pathlib import Path
    import re
    from backend.main import ROOT
    html = (Path(ROOT) / 'frontend' / 'index.html').read_text(encoding='utf-8')
    js = (Path(ROOT) / 'frontend' / 'app.js').read_text(encoding='utf-8')
    assert re.search(r'data-open-tab="preprocessing"[^>]*>Start analysis', html, re.I)
    for section, target in [('preprocessing','factor'), ('factor','insights'),
                            ('insights','predict'), ('predict','whatif'), ('whatif','data')]:
        part = html.split(f'id="{section}"', 1)[1].split('</section>', 1)[0]
        assert f'data-open-tab="{target}"' in part, f'{section} should continue to {target}'
    assert "addEventListener('click',()=>showTab(button.dataset.openTab" in js
