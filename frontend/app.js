let api = '', defaults = {}, apiOnline = false;

async function discoverApi() {
  if (location.protocol !== 'file:' && location.port !== '5500') return;

  for (const port of [8000, 8001]) {
    const candidate = `http://127.0.0.1:${port}`;

    try {
      const response = await fetch(candidate + '/health', {
        cache: 'no-store'
      });

      if (!response.ok) continue;

      const health = await response.json();

      if (health.project === 'HomeVision' && health.status === 'ok') {
        api = candidate;
        return;
      }
    } catch (error) {
      // Try the next port.
    }
  }

  throw new Error(
    'HomeVision API not found on ports 8000 or 8001. ' +
    'Run run_homevision.bat and keep its API window open.'
  );
}

const fields = {
  Lng: {
    label: 'Longitude',
    help: 'East–west map coordinate. Keep the supplied sample unless you know the coordinate.',
    group: 'Location & neighbourhood',
    min: 70, max: 140, step: 0.000001
  },
  Lat: {
    label: 'Latitude',
    help: 'North–south map coordinate. The included sample is in Beijing.',
    group: 'Location & neighbourhood',
    min: 15, max: 55, step: 0.000001
  },
  district: {
    label: 'District code',
    help: 'Numeric district identifier from the source dataset. The code-to-name mapping is not included, so do not guess.',
    group: 'Location & neighbourhood',
    type: 'code', min: 1, max: 13,
    options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  },
  communityAverage: {
    label: 'Community average unit price',
    help: 'Historical community-level average price in the source dataset (CNY per m²). Use a known comparable value.',
    group: 'Location & neighbourhood',
    min: 0, max: 1000000, step: 100
  },
  subway: {
    label: 'Subway access',
    help: 'Does the source record indicate subway access?',
    group: 'Location & neighbourhood',
    type: 'binary'
  },
  square: {
    label: 'Living area (m²)',
    help: 'Indoor floor area in square metres.',
    group: 'Home & building',
    min: 10, max: 1000, step: 0.1
  },
  livingRoom: {
    label: 'Living rooms',
    help: 'Number of living rooms.',
    group: 'Home & building',
    min: 0, max: 20, step: 1
  },
  drawingRoom: {
    label: 'Drawing rooms',
    help: 'Number of drawing rooms, as recorded in the dataset.',
    group: 'Home & building',
    min: 0, max: 20, step: 1
  },
  kitchen: {
    label: 'Kitchens',
    help: 'Number of kitchens.',
    group: 'Home & building',
    min: 0, max: 10, step: 1
  },
  bathRoom: {
    label: 'Bathrooms',
    help: 'Number of bathrooms.',
    group: 'Home & building',
    min: 0, max: 20, step: 1
  },
  floor_num: {
    label: 'Floor number',
    help: 'Numeric floor extracted from the source listing. The original floor category is simplified to a number.',
    group: 'Home & building',
    min: 0, max: 100, step: 1
  },
  constructionTime: {
    label: 'Construction year / unknown',
    help: 'Historical Beijing data supports years through 2016. Use 0 only when the source year is unknown.',
    group: 'Home & building',
    min: 0, max: 2016, step: 1
  },
  renovationCondition: {
    label: 'Renovation condition code',
    help: 'Source dataset code (1–4). The source files do not include the code descriptions; use a verified code.',
    group: 'Home & building',
    type: 'code', min: 1, max: 4,
    options: [1, 2, 3, 4]
  },
  buildingType: {
    label: 'Building type code',
    help: 'Source dataset code (1–4). Code meanings are not supplied in the project data.',
    group: 'Home & building',
    type: 'code', min: 1, max: 4,
    options: [1, 2, 3, 4]
  },
  buildingStructure: {
    label: 'Building structure code',
    help: 'Source dataset code (1–6). Code meanings are not supplied in the project data.',
    group: 'Home & building',
    type: 'code', min: 1, max: 6,
    options: [1, 2, 3, 4, 5, 6]
  },
  ladderRatio: {
    label: 'Ladder ratio',
    help: 'Ratio stored in the source dataset. Enter a value from 0 to 1.',
    group: 'Home & building',
    min: 0, max: 1, step: 0.001
  },
  elevator: {
    label: 'Elevator available',
    help: 'Does the source record indicate an elevator?',
    group: 'Home & building',
    type: 'binary'
  },
  fiveYearsProperty: {
    label: 'Property within five-year category',
    help: 'Source dataset flag. Follow the dataset definition rather than guessing.',
    group: 'Home & building',
    type: 'binary'
  },
  followers: {
    label: 'Listing followers',
    help: 'Number of followers/interested users recorded for the listing. This may not be known for a new property.',
    group: 'Listing & market timing',
    min: 0, max: 1000000, step: 1
  },
  trade_year: {
    label: 'Historical trade year',
    help: 'The dataset contains transaction dates from 2002 through January 2018. Predictions outside this period are not supported.',
    group: 'Listing & market timing',
    min: 2002, max: 2018, step: 1
  },
  trade_month: {
    label: 'Recorded trade month',
    help: 'Month number in the recorded transaction date (1–12).',
    group: 'Listing & market timing',
    min: 1, max: 12, step: 1
  },
  trade_quarter: {
    label: 'Recorded trade quarter',
    help: 'Quarter number (1–4). Keep consistent with the month.',
    group: 'Listing & market timing',
    min: 1, max: 4, step: 1
  }
};

const groups = [
  'Location & neighbourhood',
  'Home & building',
  'Listing & market timing'
];

const titles = {
  overview: 'Property Intelligence',
  predict: 'Property Prediction',
  whatif: 'Scenario Lab',
  preprocessing: 'Data Preprocessing',
  factor: 'Factor Analysis',
  insights: 'Model Insights',
  data: 'Validation & Evidence'
};

const money = n =>
  `¥${Math.round(Number(n) * 10000).toLocaleString('en-US')}`;

const priceUnits = n =>
  `${Number(n).toLocaleString(undefined, {
    maximumFractionDigits: 2
  })} × 10,000 CNY`;

function showTab(id, options = {}) {
  const target = document.getElementById(id);

  if (!target || !target.classList.contains('tab')) {
    console.error(`HomeVision navigation target not found: ${id}`);
    return false;
  }

  document.querySelectorAll('.tab').forEach(section => {
    const selected = section === target;
    section.classList.toggle('active', selected);
    section.setAttribute('aria-hidden', String(!selected));
  });

  document.querySelectorAll('#sideNav button[data-tab]').forEach(button => {
    const selected = button.dataset.tab === id;
    button.classList.toggle('active', selected);

    if (selected) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  const title = document.getElementById('pageTitle');

  if (title) {
    title.textContent = titles[id] || 'HomeVision';
  }

  const topbar = document.querySelector('.topbar');
  const offset = (topbar?.getBoundingClientRect().height || 0) + 8;
  const y = target.getBoundingClientRect().top + window.scrollY - offset;

  window.scrollTo({
    top: Math.max(0, y),
    behavior: options.behavior || 'smooth'
  });

  if (id === 'preprocessing') loadPreprocessingReport();
  if (id === 'factor') loadFactorAnalysis();

  if (options.focus && id === 'predict') {
    const first = target.querySelector('#formFields input, #formFields select');
    if (first) first.focus({ preventScroll: true });
  }

  return true;
}

document.querySelectorAll('#sideNav button[data-tab]').forEach(button => {
  button.addEventListener('click', () => showTab(button.dataset.tab));
});

document.querySelectorAll('[data-open-tab]').forEach(button => {
  button.addEventListener('click', () => {
    showTab(button.dataset.openTab, {
      focus: button.dataset.openTab === 'predict'
    });
  });
});

async function get(u) {
  const response = await fetch(api + u);

  if (!response.ok) {
    throw new Error(
      (await response.text()) || `Request failed (${response.status})`
    );
  }

  return response.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function fieldMarkup(k) {
  const f = fields[k] || {
    label: k,
    help: 'Feature used by the model.',
    group: 'Other inputs',
    min: 0,
    max: 1000000,
    step: 'any'
  };

  const v = defaults[k] ?? '';
  const id = `field-${k}`;
  let input = '';

  if (f.type === 'binary') {
    input = `
      <select id="${id}" name="${k}" required>
        <option value="0" ${Number(v) === 0 ? 'selected' : ''}>No · 0</option>
        <option value="1" ${Number(v) === 1 ? 'selected' : ''}>Yes · 1</option>
      </select>`;
  } else if (f.type === 'code') {
    input = `
      <select id="${id}" name="${k}" required>
        ${f.options.map(n => `
          <option value="${n}" ${Number(v) === n ? 'selected' : ''}>
            Code ${n}${Number(v) === n ? ' · sample default' : ''}
          </option>
        `).join('')}
      </select>`;
  } else {
    input = `
      <input id="${id}" name="${k}" type="number"
        min="${f.min}" max="${f.max}" step="${f.step}"
        value="${escapeHtml(v)}" required inputmode="decimal">`;
  }

  return `
    <label class="field-card" for="${id}">
      <span class="field-name">${escapeHtml(f.label)}</span>
      ${input}
      <small class="field-help">${escapeHtml(f.help)}</small>
      <small class="sample-default">Sample default: ${escapeHtml(v)}</small>
    </label>`;
}

function buildForm() {
  const form = document.getElementById('form');
  const keys = Object.keys(fields);

  let html = `
    <div class="form-note">
      <b>How to get a useful estimate</b>
      <span>
        Use accurate known values. If a value is unknown, keep the sample
        default and treat the result as exploratory. Coded categories are
        dataset IDs—not human-readable labels.
      </span>
    </div>`;

  for (const group of groups) {
    const groupKeys = keys.filter(k => fields[k].group === group);

    html += `
      <div class="field-group-heading">
        <span>${groups.indexOf(group) + 1}</span>
        <div>
          <b>${group}</b>
          <small>${groupKeys.length} model inputs</small>
        </div>
      </div>
      ${groupKeys.map(fieldMarkup).join('')}`;
  }

  html += `
    <div class="form-actions">
      <button class="primary" type="submit" id="predictBtn">
        Estimate price + time <span>→</span>
      </button>
      <p>Results are estimates based on historical patterns, not guaranteed outcomes.</p>
    </div>`;

  document.getElementById('formFields').innerHTML = html;
  document.getElementById('inputCount').textContent =
    `${keys.length} model inputs · grouped by purpose`;

  document.getElementById('formBadge').textContent =
    apiOnline ? 'MODEL CONNECTED' : 'API OFFLINE';

  document.getElementById('resetDefaults').onclick = () => {
    for (const [k, v] of Object.entries(defaults)) {
      const el = form.elements.namedItem(k);
      if (el) el.value = v;
    }

    setMessage(
      'Sample dataset values restored. Review them before predicting.',
      'info'
    );
  };

  form.onsubmit = async e => {
    e.preventDefault();

    if (!apiOnline) {
      setMessage(
        'The API is not connected. Start the backend and refresh this page.',
        'error'
      );
      return;
    }

    const values = {};

    for (const [k, v] of new FormData(form).entries()) {
      const n = Number(v);
      const f = fields[k];

      if (!Number.isFinite(n)) {
        setMessage(`Enter a valid number for ${f?.label || k}.`, 'error');
        return;
      }

      if (f && (n < f.min || n > f.max)) {
        setMessage(
          `${f.label} must be between ${f.min} and ${f.max}.`,
          'error'
        );
        form.elements.namedItem(k).focus();
        return;
      }

      if (f && Number(f.step) === 1 && !Number.isInteger(n)) {
        setMessage(`${f.label} must be a whole number.`, 'error');
        form.elements.namedItem(k).focus();
        return;
      }

      values[k] = n;
    }

    const month = values.trade_month;
    const quarter = values.trade_quarter;

    if (Math.ceil(month / 3) !== quarter) {
      setMessage(
        'Trade month and trade quarter do not match. For example, months 1–3 are quarter 1.',
        'error'
      );
      return;
    }

    const btn = document.getElementById('predictBtn');
    btn.disabled = true;
    btn.textContent = 'Calculating both estimates…';

    setMessage(
      'Running the price and days-on-market models with your inputs…',
      'info'
    );

    try {
      const response = await fetch(api + '/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Prediction failed');
      }

      const price = Number(result.predicted_price);
      const days = Number(result.predicted_dom_days);

      if (!Number.isFinite(price) || !Number.isFinite(days)) {
        throw new Error('The API returned invalid price or market-time values.');
      }

      document.getElementById('price').textContent = priceUnits(price);
      document.getElementById('priceConverted').textContent =
        `Approximate equivalent: ${money(price)} CNY`;

      document.getElementById('dom').textContent =
        `${Math.round(days).toLocaleString()} days`;

      document.getElementById('interpret').textContent =
        `The model estimates ${money(price)} CNY for the recorded price and about ${Math.round(days)} days on market for this input profile.`;

      document.getElementById('decisionTitle').textContent =
        decisionTitle(days);

      document.getElementById('resultNextStep').textContent =
        days < 30
          ? 'The model predicts a shorter time-on-market estimate for this profile. Compare scenarios before drawing conclusions.'
          : days < 90
            ? 'The model predicts a mid-range time-on-market estimate for this profile. Use Scenario Lab to test changes.'
            : 'The model predicts a longer time-on-market estimate for this profile. Check the input values and compare scenarios.';

      document.getElementById('predictionDisclaimer').textContent =
        'Important: the model uses historical Beijing records and may be inaccurate for different locations, time periods, or properties unlike the training data.';

      setMessage(
        'Prediction completed. Review price and time together; neither is a guarantee.',
        'success'
      );

      document.querySelector('.result-stack').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    } catch (err) {
      setMessage(`Prediction could not be completed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Estimate price + time <span>→</span>';
    }
  };
}

function setMessage(msg, type) {
  const el = document.getElementById('formMessage');

  if (el) {
    el.className = `form-message ${type || ''}`;
    el.textContent = msg;
  }
}

function decisionTitle(days) {
  if (days < 30) return 'Shorter estimated market duration';
  if (days < 90) return 'Mid-range estimated market duration';
  return 'Longer estimated market duration';
}

async function init() {
  try {
    await discoverApi();

    const health = await get('/health');
    apiOnline = health.status === 'ok';

    document.getElementById('status').textContent =
      apiOnline ? 'API connected' : 'API issue';

    document.getElementById('statusDot').style.background =
      apiOnline ? '#21c5a7' : '#ef4444';

    const sideBottom = document.querySelector('.side-bottom');

    if (sideBottom) {
      sideBottom.querySelector('b').textContent =
        apiOnline ? 'ML engine online' : 'ML engine offline';

      sideBottom.querySelector('small').textContent =
        apiOnline ? 'Price + market-time models ready' : 'Start backend and refresh';
    }

    defaults = await get('/defaults');
    buildForm();

    document.getElementById('a_square').value =
      Number(defaults.square || 73.74);

    document.getElementById('a_renov').value =
      Number(defaults.renovationCondition || 3);

    document.getElementById('a_floor').value =
      Number(defaults.floor_num || 11);

    document.getElementById('b_square').value =
      Number(defaults.square || 73.74) + 20;

    document.getElementById('b_renov').value =
      Number(defaults.renovationCondition) === 4 ? 3 : 4;

    document.getElementById('b_floor').value =
      Number(defaults.floor_num || 11);

    const [metrics, importance, summary] = await Promise.all([
      get('/metrics'),
      get('/importance'),
      get('/summary')
    ]);

    renderMetrics(metrics);
    renderImportance(importance);

    document.getElementById('rowsKpi').textContent =
      Number(summary.rows).toLocaleString();

    document.getElementById('featuresKpi').textContent =
      summary.features.length;

    document.getElementById('priceR2').textContent =
      Number(metrics.price_model.metrics.R2).toFixed(3);

    document.getElementById('domR2').textContent =
      Number(metrics.dom_model.metrics.R2).toFixed(3);

    document.getElementById('formBadge').textContent =
      `${summary.features.length} INPUTS READY`;
  } catch (e) {
    apiOnline = false;

    document.getElementById('status').textContent =
      'API unavailable — start backend';

    document.getElementById('statusDot').style.background = '#ef4444';

    const sideBottom = document.querySelector('.side-bottom');

    if (sideBottom) {
      sideBottom.querySelector('b').textContent = 'ML engine offline';
      sideBottom.querySelector('small').textContent = 'Run run_homevision.bat';
    }

    document.getElementById('formBadge').textContent = 'API OFFLINE';

    document.getElementById('formFields').innerHTML = `
      <div class="empty-state">
        <h3>Connect HomeVision to load inputs</h3>
        <p>Start the backend, then refresh this page.</p>
      </div>`;

    console.error('HomeVision API connection failed:', e);
  }
}

function renderMetrics(m) {
  const price = m.price_model.metrics;
  const dom = m.dom_model.metrics;

  const items = [
    ['PRICE · MAE', price.MAE, 'Average absolute error in 10,000 CNY units'],
    ['PRICE · RMSE', price.RMSE, 'Root-mean-square error in 10,000 CNY units; larger misses weigh more'],
    ['PRICE · R²', price.R2, 'Fit score; closer to 1 is generally stronger'],
    ['DOM · MAE', dom.MAE, 'Average absolute error in days'],
    ['DOM · RMSE', dom.RMSE, 'Root-mean-square error in days; larger misses weigh more'],
    ['DOM · R²', dom.R2, 'Fit score; closer to 1 is generally stronger']
  ];

  document.getElementById('metrics').innerHTML = items.map(item => `
    <div class="metric" title="${escapeHtml(item[2])}">
      <small>${item[0]}</small>
      <strong>${Number(item[1]).toFixed(3)}</strong>
      <span>${escapeHtml(item[2])}</span>
    </div>
  `).join('');

  document.getElementById('bench').innerHTML = `
    <div class="table-scroll">
      <table>
        <tr>
          <th>Candidate model</th>
          <th>Target</th>
          <th>MAE</th>
          <th>RMSE</th>
          <th>R²</th>
        </tr>
        ${m.benchmark.map(item => `
          <tr>
            <td><b>${escapeHtml(item.model)}</b></td>
            <td>${escapeHtml(item.target)}</td>
            <td>${Number(item.MAE).toFixed(2)}</td>
            <td>${Number(item.RMSE).toFixed(2)}</td>
            <td>${Number(item.R2).toFixed(3)}</td>
          </tr>
        `).join('')}
      </table>
    </div>`;
}

function renderImportance(im) {
  for (const [id, key] of [['priceImp', 'price'], ['domImp', 'dom']]) {
    const arr = im[key] || [];
    const max = Math.max(...arr.map(x => Math.abs(x.importance))) || 1;

    document.getElementById(id).innerHTML = arr.slice(0, 10).map(item => `
      <div class="bar">
        <b>${escapeHtml(fields[item.feature]?.label || item.feature)}</b>
        <div class="track" aria-label="Relative feature importance">
          <div class="fill" style="width:${Math.min(100, Math.abs(item.importance) / max * 100)}%"></div>
        </div>
        <span>${Number(item.importance).toFixed(3)}</span>
      </div>
    `).join('') || '<p>No feature-importance data is available.</p>';
  }
}

async function runWhatIf() {
  if (!apiOnline) {
    document.getElementById('scenarioOut').innerHTML =
      '<p class="form-message error">HomeVision API is offline. Start the backend and refresh.</p>';
    return;
  }

  const aArea = Number(document.getElementById('a_square').value);
  const aRenov = Number(document.getElementById('a_renov').value);
  const aFloor = Number(document.getElementById('a_floor').value);
  const bArea = Number(document.getElementById('b_square').value);
  const bRenov = Number(document.getElementById('b_renov').value);
  const bFloor = Number(document.getElementById('b_floor').value);

  if (
    [aArea, aRenov, aFloor, bArea, bRenov, bFloor].some(n => !Number.isFinite(n)) ||
    [aArea, bArea].some(n => n < 10 || n > 1000) ||
    [aFloor, bFloor].some(n => n < 0 || n > 100) ||
    [aRenov, bRenov].some(n => !Number.isInteger(n) || n < 1 || n > 4)
  ) {
    document.getElementById('scenarioOut').innerHTML =
      '<p class="form-message error">Check your values: area 10–1000 m², floor 0–100, renovation code 1–4.</p>';
    return;
  }

  const common = { ...defaults };

  const a = {
    ...common,
    square: aArea,
    renovationCondition: aRenov,
    floor_num: aFloor
  };

  const b = {
    ...common,
    square: bArea,
    renovationCondition: bRenov,
    floor_num: bFloor
  };

  try {
    const response = await fetch(api + '/what-if', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarios: [
          { name: 'Baseline', values: a },
          { name: 'Alternative', values: b }
        ]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || 'Scenario failed');
    }

    const scenarios = result.scenarios;

    document.getElementById('scenarioOut').innerHTML = `
      <div class="panel-title">
        <div>
          <span class="eyebrow">MODEL OUTPUTS</span>
          <h3>Your side-by-side comparison</h3>
        </div>
      </div>

      <div class="scenario-results-grid">
        ${scenarios.map((scenario, i) => `
          <div class="scenario-result-card ${i ? 'alt' : ''}">
            <span>${i ? 'B · ALTERNATIVE' : 'A · BASELINE'}</span>
            <h4>${escapeHtml(scenario.name)}</h4>
            <strong>${money(scenario.price)}</strong>
            <small>Estimated sale price</small>
            <b>${Math.round(scenario.dom).toLocaleString()} days</b>
            <small>Estimated time on market</small>
          </div>
        `).join('')}
      </div>

      <div class="scenario-delta">
        <h4>Difference: Alternative minus Baseline</h4>
        <p>
          <b>${money(scenarios[1].price - scenarios[0].price)}</b>
          estimated price ·
          <b>${(scenarios[1].dom - scenarios[0].dom >= 0 ? '+' : '') +
            Math.round(scenarios[1].dom - scenarios[0].dom)} days</b>
          estimated market time
        </p>
        <p>${escapeHtml(result.insight)}</p>
      </div>

      <p class="disclaimer">
        Only area, renovation code, and floor change in this quick comparison;
        all other features stay at sample defaults. These are model associations,
        not causal effects.
      </p>`;
  } catch (e) {
    document.getElementById('scenarioOut').innerHTML =
      `<p class="form-message error">Comparison failed: ${escapeHtml(e.message)}</p>`;
  }
}

document.getElementById('runFactorAnalysis')
  ?.addEventListener('click', loadFactorAnalysis);

document.getElementById('runWhatIfButton')
  ?.addEventListener('click', runWhatIf);

async function loadFactorAnalysis() {
  const out = document.getElementById('factorOut');

  out.innerHTML =
    '<p>Calculating factors from a reproducible sample of the historical dataset…</p>';

  try {
    const result = await get('/factor-analysis');

    const factorHtml = result.factors.map(factor => `
      <div class="panel" style="margin:10px 0;padding:14px">
        <h4>
          ${escapeHtml(factor.name)}
          <small>· ${Math.round(factor.variance_share * 1000) / 10}% of extracted factor-score variance</small>
        </h4>
        <div>
          ${factor.top_loadings.map(item => `
            <div class="bar">
              <b>${escapeHtml(fields[item.feature]?.label || item.feature)}</b>
              <span>loading ${item.loading.toFixed(3)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const correlations = result.strong_correlations.length
      ? `
        <h4>Strong numeric correlations (|r| ≥ 0.45)</h4>
        <div>
          ${result.strong_correlations.map(item => `
            <p>
              ${escapeHtml(fields[item.feature_a]?.label || item.feature_a)}
              ↔
              ${escapeHtml(fields[item.feature_b]?.label || item.feature_b)}:
              <b>${item.correlation.toFixed(2)}</b>
            </p>
          `).join('')}
        </div>`
      : '<p>No feature pairs crossed the selected correlation threshold in this sample.</p>';

    out.innerHTML = `
      <p>
        <b>Method:</b> ${escapeHtml(result.method)} ·
        <b>Sample:</b> ${result.sample_rows.toLocaleString()} records ·
        <b>Numeric variables:</b> ${result.features.length}
      </p>
      ${factorHtml}
      ${correlations}
      <p class="disclaimer">${escapeHtml(result.caveat)}</p>`;
  } catch (e) {
    out.innerHTML =
      `<p class="form-message error">Factor analysis failed: ${escapeHtml(e.message)}</p>`;
  }
}

async function loadPreprocessingReport() {
  const status = document.getElementById('preprocessStatus');

  if (status.dataset.loaded === 'yes') return;

  status.innerHTML = `
    <span class="scope-icon">i</span>
    <div>
      <strong>Loading report…</strong>
      <p>Reading dataset statistics from the API.</p>
    </div>`;

  try {
    const report = await get('/preprocessing-report');

    document.getElementById('preprocessKpis').innerHTML = [
      ['SOURCE RECORDS', report.source_rows.toLocaleString()],
      ['SOURCE COLUMNS', report.source_columns],
      ['DUPLICATE ROWS', report.duplicate_rows.toLocaleString()],
      ['MODEL INPUTS', report.model_features]
    ].map(([label, value]) => `
      <div class="kpi">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>Computed from supplied data</small>
      </div>
    `).join('');

    document.getElementById('preprocessSteps').innerHTML =
      report.steps.map((step, i) => `
        <div class="difference-card" style="margin:10px 0;padding:14px">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3>${escapeHtml(step.title)}</h3>
            <p>${escapeHtml(step.detail)}</p>
          </div>
        </div>
      `).join('');

    document.getElementById('preprocessTargets').innerHTML = `
      <div class="bar">
        <b>Price target</b>
        <span>${report.price_usable_rows.toLocaleString()} records</span>
      </div>
      <div class="bar">
        <b>DOM target</b>
        <span>${report.dom_usable_rows.toLocaleString()} records</span>
      </div>
      <p class="disclaimer">
        The target counts differ because DOM can be missing even when price is valid.
      </p>
      <p>
        <b>Derived features:</b>
        ${report.engineered_features.map(escapeHtml).join(', ') || 'None detected'}
      </p>
      <p>
        <b>Removed fields:</b>
        ${report.removed_columns.map(escapeHtml).join(', ') || 'None detected'}
      </p>`;

    document.getElementById('missingTable').innerHTML =
      report.missing_values.length
        ? `
          <table>
            <thead>
              <tr>
                <th>Source column</th>
                <th>Missing</th>
                <th>Missing %</th>
              </tr>
            </thead>
            <tbody>
              ${report.missing_values.map(item => `
                <tr>
                  <td>${escapeHtml(item.column)}</td>
                  <td>${item.missing.toLocaleString()}</td>
                  <td>${item.percent}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
        : '<p>No missing values found in source columns.</p>';

    status.innerHTML = `
      <span class="scope-icon">✓</span>
      <div>
        <strong>Report loaded from the included dataset</strong>
        <p>
          Missing values and duplicate counts are computed from source data.
          Imputation and encoding are performed in the training pipeline.
        </p>
      </div>`;

    status.dataset.loaded = 'yes';
  } catch (e) {
    status.innerHTML = `
      <span class="scope-icon">!</span>
      <div>
        <strong>Could not load report</strong>
        <p>${escapeHtml(e.message)}. Check that the API is running.</p>
      </div>`;
  }
}

init();
