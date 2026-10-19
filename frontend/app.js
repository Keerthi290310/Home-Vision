const api = (location.protocol === 'file:' || location.port === '5500')
  ? 'http://127.0.0.1:8000'
  : '';

let defaults = {};
let apiOnline = false;
let predictionTimer = null;
let predictionRequestId = 0;

const fields = {
  Lng: { label: 'Longitude', help: 'East–west map coordinate.', group: 'Location & neighbourhood', min: 70, max: 140, step: 0.000001 },
  Lat: { label: 'Latitude', help: 'North–south map coordinate.', group: 'Location & neighbourhood', min: 15, max: 55, step: 0.000001 },
  district: { label: 'District code', help: 'Numeric district identifier from the dataset.', group: 'Location & neighbourhood', type: 'code', min: 1, max: 13, options: [1,2,3,4,5,6,7,8,9,10,11,12,13] },
  communityAverage: { label: 'Community average unit price', help: 'Historical average price in CNY per m².', group: 'Location & neighbourhood', min: 0, max: 1000000, step: 100 },
  subway: { label: 'Subway access', help: 'Does the record indicate subway access?', group: 'Location & neighbourhood', type: 'binary' },

  square: { label: 'Living area (m²)', help: 'Indoor floor area in square metres.', group: 'Home & building', min: 10, max: 1000, step: 0.1 },
  livingRoom: { label: 'Living rooms', help: 'Number of living rooms.', group: 'Home & building', min: 0, max: 20, step: 1 },
  drawingRoom: { label: 'Drawing rooms', help: 'Number of drawing rooms.', group: 'Home & building', min: 0, max: 20, step: 1 },
  kitchen: { label: 'Kitchens', help: 'Number of kitchens.', group: 'Home & building', min: 0, max: 10, step: 1 },
  bathRoom: { label: 'Bathrooms', help: 'Number of bathrooms.', group: 'Home & building', min: 0, max: 20, step: 1 },
  floor_num: { label: 'Floor number', help: 'Numeric floor from the source listing.', group: 'Home & building', min: 0, max: 100, step: 1 },
  constructionTime: { label: 'Construction year / unknown', help: 'Use 0 if the year is unknown.', group: 'Home & building', min: 0, max: 2016, step: 1 },
  renovationCondition: { label: 'Renovation condition code', help: 'Dataset code 1–4.', group: 'Home & building', type: 'code', min: 1, max: 4, options: [1,2,3,4] },
  buildingType: { label: 'Building type code', help: 'Dataset code 1–4.', group: 'Home & building', type: 'code', min: 1, max: 4, options: [1,2,3,4] },
  buildingStructure: { label: 'Building structure code', help: 'Dataset code 1–6.', group: 'Home & building', type: 'code', min: 1, max: 6, options: [1,2,3,4,5,6] },
  ladderRatio: { label: 'Ladder ratio', help: 'Enter a value from 0 to 1.', group: 'Home & building', min: 0, max: 1, step: 0.001 },
  elevator: { label: 'Elevator available', help: 'Does the record indicate an elevator?', group: 'Home & building', type: 'binary' },
  fiveYearsProperty: { label: 'Property within five-year category', help: 'Dataset flag.', group: 'Home & building', type: 'binary' },

  followers: { label: 'Listing followers', help: 'Number of interested users.', group: 'Listing & market timing', min: 0, max: 1000000, step: 1 },
  trade_year: { label: 'Historical trade year', help: 'Dataset transactions range from 2002 to 2018.', group: 'Listing & market timing', min: 2002, max: 2018, step: 1 },
  trade_month: { label: 'Recorded trade month', help: 'Month number 1–12.', group: 'Listing & market timing', min: 1, max: 12, step: 1 },
  trade_quarter: { label: 'Recorded trade quarter', help: 'Quarter number 1–4.', group: 'Listing & market timing', min: 1, max: 4, step: 1 }
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
  `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} × 10,000 CNY`;

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

    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  const title = document.getElementById('pageTitle');
  if (title) title.textContent = titles[id] || 'HomeVision';

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
    target.querySelector('#formFields input, #formFields select')
      ?.focus({ preventScroll: true });
  }

  return true;
}

document.querySelectorAll('#sideNav button[data-tab]').forEach(button => {
  button.addEventListener('click', () => showTab(button.dataset.tab));
});

document.querySelectorAll('[data-open-tab]').forEach(button => {
  button.addEventListener('click', () =>
    showTab(button.dataset.openTab, {
      focus: button.dataset.openTab === 'predict'
    })
  );
});

async function get(url) {
  const response = await fetch(api + url);

  if (!response.ok) {
    throw new Error((await response.text()) || `Request failed (${response.status})`);
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function fieldMarkup(key) {
  const field = fields[key];
  const value = defaults[key] ?? '';
  const id = `field-${key}`;
  let input = '';

  if (field.type === 'binary') {
    input = `<select id="${id}" name="${key}" required>
      <option value="0" ${Number(value) === 0 ? 'selected' : ''}>No · 0</option>
      <option value="1" ${Number(value) === 1 ? 'selected' : ''}>Yes · 1</option>
    </select>`;
  } else if (field.type === 'code') {
    input = `<select id="${id}" name="${key}" required>
      ${field.options.map(number => `
        <option value="${number}" ${Number(value) === number ? 'selected' : ''}>
          Code ${number}${Number(value) === number ? ' · sample default' : ''}
        </option>
      `).join('')}
    </select>`;
  } else {
    input = `<input id="${id}" name="${key}" type="number"
      min="${field.min}" max="${field.max}" step="${field.step}"
      value="${escapeHtml(value)}" required inputmode="decimal">`;
  }

  return `<label class="field-card" for="${id}">
    <span class="field-name">${escapeHtml(field.label)}</span>
    ${input}
    <small class="field-help">${escapeHtml(field.help)}</small>
    <small class="sample-default">Sample default: ${escapeHtml(value)}</small>
  </label>`;
}

function buildForm() {
  const form = document.getElementById('form');
  const keys = Object.keys(fields);

  let html = `<div class="form-note">
    <b>How to get a useful estimate</b>
    <span>Change any inputs you know. All remaining inputs keep their current values. Predictions are estimates based on historical data.</span>
  </div>`;

  for (const group of groups) {
    const groupKeys = keys.filter(key => fields[key].group === group);

    html += `<div class="field-group-heading">
      <span>${groups.indexOf(group) + 1}</span>
      <div><b>${group}</b><small>${groupKeys.length} model inputs</small></div>
    </div>${groupKeys.map(fieldMarkup).join('')}`;
  }

  html += `<div class="form-actions">
    <button class="primary" type="submit" id="predictBtn">
      Estimate price + time <span>→</span>
    </button>
    <p>Results are estimates, not guaranteed outcomes.</p>
  </div>`;

  document.getElementById('formFields').innerHTML = html;

  document.getElementById('inputCount').textContent =
    `${keys.length} model inputs · grouped by purpose`;

  document.getElementById('formBadge').textContent =
    apiOnline ? 'MODEL CONNECTED' : 'API OFFLINE';

  // One delegated listener handles changes to every input.
  form.addEventListener('input', event => {
    if (event.target.matches('#formFields input, #formFields select')) {
      schedulePrediction(700);
    }
  });

  form.addEventListener('change', event => {
    if (event.target.matches('#formFields input, #formFields select')) {
      schedulePrediction(150);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearTimeout(predictionTimer);
    await runPrediction(true);
  });

  document.getElementById('resetDefaults').onclick = () => {
    clearTimeout(predictionTimer);

    for (const [key, value] of Object.entries(defaults)) {
      const element = form.elements.namedItem(key);
      if (element) element.value = value;
    }

    setMessage('Sample defaults restored. Updating predictions…', 'info');
    schedulePrediction(0);
  };
}

function schedulePrediction(delay = 500) {
  clearTimeout(predictionTimer);

  predictionTimer = setTimeout(() => {
    runPrediction(false);
  }, delay);
}

async function runPrediction(manual = false) {
  const form = document.getElementById('form');
  if (!form) return;

  // Invalidate previous requests immediately, including when the
  // latest input is temporarily invalid while the user is typing.
  const requestId = ++predictionRequestId;

  if (!apiOnline) {
    setMessage('API is offline. Start the backend and refresh the page.', 'error');
    return;
  }

  // A temporarily empty number field should not send bad data.
  // The next valid input event automatically tries again.
  if (!form.checkValidity()) {
    setMessage('Enter a valid value. Other inputs will keep their current values.', 'info');
    return;
  }

  const values = {};

  // Always send every field, not just the field that changed.
  for (const key of Object.keys(fields)) {
    const element = form.elements.namedItem(key);
    const rawValue = element?.value;

    if (rawValue === '' || rawValue == null) {
      setMessage(`Please enter a value for ${fields[key].label}.`, 'info');
      return;
    }

    const number = Number(rawValue);
    const field = fields[key];

    if (!Number.isFinite(number)) {
      setMessage(`Enter a valid number for ${field.label}.`, 'error');
      return;
    }

    if (field.min !== undefined && number < field.min) {
      setMessage(`${field.label} must be at least ${field.min}.`, 'error');
      element.focus();
      return;
    }

    if (field.max !== undefined && number > field.max) {
      setMessage(`${field.label} must not exceed ${field.max}.`, 'error');
      element.focus();
      return;
    }

    if (field.step === 1 && !Number.isInteger(number)) {
      setMessage(`${field.label} must be a whole number.`, 'error');
      element.focus();
      return;
    }

    values[key] = number;
  }

  // Keep the quarter consistent with the selected month.
  const correctQuarter = Math.ceil(values.trade_month / 3);
  if (values.trade_quarter !== correctQuarter) {
    values.trade_quarter = correctQuarter;
    const quarterInput = form.elements.namedItem('trade_quarter');
    if (quarterInput) quarterInput.value = String(correctQuarter);
  }

  const button = document.getElementById('predictBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Calculating price and days…';
  }

  setMessage('Running predictions for the current input values…', 'info');

  try {
    const response = await fetch(api + '/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof result.detail === 'string'
          ? result.detail
          : JSON.stringify(result.detail || 'Prediction failed')
      );
    }

    // Ignore responses for older input states.
    if (requestId !== predictionRequestId) return;

    const price = Number(result.predicted_price);
    const days = Number(result.predicted_dom_days);

    if (!Number.isFinite(price) || !Number.isFinite(days)) {
      throw new Error(
        'Invalid API response. Expected predicted_price and predicted_dom_days.'
      );
    }

    const priceElement = document.getElementById('price');
    const convertedElement = document.getElementById('priceConverted');
    const daysElement = document.getElementById('dom');

    if (priceElement) priceElement.textContent = priceUnits(price);
    if (convertedElement) {
      convertedElement.textContent = `Approximate equivalent: ${money(price)} CNY`;
    }
    if (daysElement) {
      daysElement.textContent = `${Math.round(days).toLocaleString()} days`;
    }

    const interpretation = document.getElementById('interpret');
    if (interpretation) {
      interpretation.textContent =
        `For the current input profile, the estimated sale price is ${money(price)} CNY and estimated time on market is ${Math.round(days)} days.`;
    }

    const decision = document.getElementById('decisionTitle');
    if (decision) decision.textContent = decisionTitle(days);

    const nextStep = document.getElementById('resultNextStep');
    if (nextStep) {
      nextStep.textContent = days < 30
        ? 'The model predicts a shorter time-on-market estimate. Compare other scenarios before drawing conclusions.'
        : days < 90
          ? 'The model predicts a mid-range time-on-market estimate. Use Scenario Lab to compare changes.'
          : 'The model predicts a longer time-on-market estimate. Check the inputs and compare scenarios.';
    }

    const disclaimer = document.getElementById('predictionDisclaimer');
    if (disclaimer) {
      disclaimer.textContent =
        'The model uses historical Beijing records and may be inaccurate for other locations, time periods, or properties unlike the training data.';
    }

    setMessage(
      'Prediction updated successfully. Both price and days use the current inputs.',
      'success'
    );

    if (manual) {
      document.querySelector('.result-stack')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  } catch (error) {
    if (requestId === predictionRequestId) {
      setMessage(`Prediction failed: ${error.message}`, 'error');
      console.error('HomeVision prediction error:', error);
    }
  } finally {
    // Only the newest request may change the button state.
    if (requestId === predictionRequestId && button) {
      button.disabled = false;
      button.innerHTML = 'Estimate price + time <span>→</span>';
    }
  }
}

function setMessage(message, type) {
  const element = document.getElementById('formMessage');
  if (element) {
    element.className = `form-message ${type || ''}`;
    element.textContent = message;
  }
}

function decisionTitle(days) {
  if (days < 30) return 'Shorter estimated market duration';
  if (days < 90) return 'Mid-range estimated market duration';
  return 'Longer estimated market duration';
}

async function init() {
  try {
    await get('/health');
    apiOnline = true;

    const status = document.getElementById('status');
    if (status) status.textContent = 'API connected';

    const dot = document.getElementById('statusDot');
    if (dot) dot.style.background = '#21c5a7';

    const sideBottom = document.querySelector('.side-bottom');
    if (sideBottom) {
      sideBottom.querySelector('b').textContent = 'ML engine online';
      sideBottom.querySelector('small').textContent = 'Price + market-time models ready';
    }

    defaults = await get('/defaults');

    // Render the form only after the sample defaults are loaded.
    buildForm();

    const area = Number(defaults.square || 73.74);
    const renovation = Number(defaults.renovationCondition || 3);
    const floor = Number(defaults.floor_num || 11);

    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    };

    setValue('a_square', area);
    setValue('a_renov', renovation);
    setValue('a_floor', floor);
    setValue('b_square', area + 20);
    setValue('b_renov', renovation === 4 ? 3 : 4);
    setValue('b_floor', floor);

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
      `${Object.keys(fields).length} INPUTS READY`;

    // Initial prediction using all sample defaults.
    schedulePrediction(0);
  } catch (error) {
    apiOnline = false;

    const status = document.getElementById('status');
    if (status) status.textContent = 'API unavailable — start backend';

    const dot = document.getElementById('statusDot');
    if (dot) dot.style.background = '#ef4444';

    const sideBottom = document.querySelector('.side-bottom');
    if (sideBottom) {
      sideBottom.querySelector('b').textContent = 'ML engine offline';
      sideBottom.querySelector('small').textContent = 'Run run_homevision.bat';
    }

    const badge = document.getElementById('formBadge');
    if (badge) badge.textContent = 'API OFFLINE';

    const formFields = document.getElementById('formFields');
    if (formFields) {
      formFields.innerHTML =
        '<div class="empty-state"><h3>Connect HomeVision to load inputs</h3><p>Start the backend, then refresh this page.</p></div>';
    }

    console.error('HomeVision initialization failed:', error);
  }
}

function renderMetrics(metrics) {
  const price = metrics.price_model.metrics;
  const dom = metrics.dom_model.metrics;

  const items = [
    ['PRICE · MAE', price.MAE, 'Average absolute error in 10,000 CNY units'],
    ['PRICE · RMSE', price.RMSE, 'Root-mean-square error in 10,000 CNY units'],
    ['PRICE · R²', price.R2, 'Fit score; closer to 1 is generally stronger'],
    ['DOM · MAE', dom.MAE, 'Average absolute error in days'],
    ['DOM · RMSE', dom.RMSE, 'Root-mean-square error in days'],
    ['DOM · R²', dom.R2, 'Fit score; closer to 1 is generally stronger']
  ];

  document.getElementById('metrics').innerHTML = items.map(item =>
    `<div class="metric" title="${escapeHtml(item[2])}">
      <small>${item[0]}</small>
      <strong>${Number(item[1]).toFixed(3)}</strong>
      <span>${escapeHtml(item[2])}</span>
    </div>`
  ).join('');

  document.getElementById('bench').innerHTML =
    `<div class="table-scroll"><table>
      <tr><th>Candidate model</th><th>Target</th><th>MAE</th><th>RMSE</th><th>R²</th></tr>
      ${metrics.benchmark.map(item => `<tr>
        <td><b>${escapeHtml(item.model)}</b></td>
        <td>${escapeHtml(item.target)}</td>
        <td>${Number(item.MAE).toFixed(2)}</td>
        <td>${Number(item.RMSE).toFixed(2)}</td>
        <td>${Number(item.R2).toFixed(3)}</td>
      </tr>`).join('')}
    </table></div>`;
}

function renderImportance(importance) {
  for (const [id, key] of [['priceImp', 'price'], ['domImp', 'dom']]) {
    const array = importance[key] || [];
    const max = Math.max(...array.map(item => Math.abs(item.importance))) || 1;

    document.getElementById(id).innerHTML =
      array.slice(0, 10).map(item => `<div class="bar">
        <b>${escapeHtml(fields[item.feature]?.label || item.feature)}</b>
        <div class="track" aria-label="Relative feature importance">
          <div class="fill" style="width:${Math.min(100, Math.abs(item.importance) / max * 100)}%"></div>
        </div>
        <span>${Number(item.importance).toFixed(3)}</span>
      </div>`).join('') ||
      '<p>No feature-importance data is available.</p>';
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
      '<p class="form-message error">Check values: area 10–1000 m², floor 0–100, renovation code 1–4.</p>';
    return;
  }

  const common = { ...defaults };

  const a = { ...common, square: aArea, renovationCondition: aRenov, floor_num: aFloor };
  const b = { ...common, square: bArea, renovationCondition: bRenov, floor_num: bFloor };

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
    if (!response.ok) throw new Error(result.detail || 'Scenario failed');

    const scenarios = result.scenarios;

    document.getElementById('scenarioOut').innerHTML =
      `<div class="panel-title">
        <div><span class="eyebrow">MODEL OUTPUTS</span><h3>Your side-by-side comparison</h3></div>
      </div>
      <div class="scenario-results-grid">
        ${scenarios.map((scenario, index) => `<div class="scenario-result-card ${index ? 'alt' : ''}">
          <span>${index ? 'B · ALTERNATIVE' : 'A · BASELINE'}</span>
          <h4>${escapeHtml(scenario.name)}</h4>
          <strong>${money(scenario.price)}</strong>
          <small>Estimated sale price</small>
          <b>${Math.round(scenario.dom).toLocaleString()} days</b>
          <small>Estimated time on market</small>
        </div>`).join('')}
      </div>
      <div class="scenario-delta">
        <h4>Difference: Alternative minus Baseline</h4>
        <p><b>${money(scenarios[1].price - scenarios[0].price)}</b> estimated price ·
        <b>${(scenarios[1].dom - scenarios[0].dom >= 0 ? '+' : '') + Math.round(scenarios[1].dom - scenarios[0].dom)} days</b>
        estimated market time</p>
        <p>${escapeHtml(result.insight)}</p>
      </div>
      <p class="disclaimer">Only area, renovation code, and floor change in this comparison; other features stay at sample defaults. These are model associations, not causal effects.</p>`;
  } catch (error) {
    document.getElementById('scenarioOut').innerHTML =
      `<p class="form-message error">Comparison failed: ${escapeHtml(error.message)}</p>`;
  }
}

document.getElementById('runFactorAnalysis')
  ?.addEventListener('click', loadFactorAnalysis);

document.getElementById('runWhatIfButton')
  ?.addEventListener('click', runWhatIf);

async function loadFactorAnalysis() {
  const output = document.getElementById('factorOut');
  if (!output) return;

  output.innerHTML =
    '<p>Calculating factors from a reproducible sample of the historical dataset…</p>';

  try {
    const result = await get('/factor-analysis');

    const factorHtml = result.factors.map(factor =>
      `<div class="panel" style="margin:10px 0;padding:14px">
        <h4>${escapeHtml(factor.name)}
          <small>· ${Math.round(factor.variance_share * 1000) / 10}% of extracted factor-score variance</small>
        </h4>
        <div>
          ${factor.top_loadings.map(item => `<div class="bar">
            <b>${escapeHtml(fields[item.feature]?.label || item.feature)}</b>
            <span>loading ${item.loading.toFixed(3)}</span>
          </div>`).join('')}
        </div>
      </div>`
    ).join('');

    const correlations = result.strong_correlations.length
      ? `<h4>Strong numeric correlations (|r| ≥ 0.45)</h4>
         <div>${result.strong_correlations.map(item =>
           `<p>${escapeHtml(fields[item.feature_a]?.label || item.feature_a)} ↔
           ${escapeHtml(fields[item.feature_b]?.label || item.feature_b)}:
           <b>${item.correlation.toFixed(2)}</b></p>`
         ).join('')}</div>`
      : '<p>No feature pairs crossed the selected correlation threshold in this sample.</p>';

    output.innerHTML =
      `<p><b>Method:</b> ${escapeHtml(result.method)} ·
      <b>Sample:</b> ${result.sample_rows.toLocaleString()} records ·
      <b>Numeric variables:</b> ${result.features.length}</p>
      ${factorHtml}${correlations}
      <p class="disclaimer">${escapeHtml(result.caveat)}</p>`;
  } catch (error) {
    output.innerHTML =
      `<p class="form-message error">Factor analysis failed: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadPreprocessingReport() {
  const status = document.getElementById('preprocessStatus');
  if (!status || status.dataset.loaded === 'yes') return;

  status.innerHTML =
    '<span class="scope-icon">i</span><div><strong>Loading report…</strong><p>Reading dataset statistics from the API.</p></div>';

  try {
    const report = await get('/preprocessing-report');

    document.getElementById('preprocessKpis').innerHTML =
      [
        ['SOURCE RECORDS', report.source_rows.toLocaleString()],
        ['SOURCE COLUMNS', report.source_columns],
        ['DUPLICATE ROWS', report.duplicate_rows.toLocaleString()],
        ['MODEL INPUTS', report.model_features]
      ].map(([label, value]) => `<div class="kpi">
        <span>${label}</span><strong>${value}</strong>
        <small>Computed from supplied data</small>
      </div>`).join('');

    document.getElementById('preprocessSteps').innerHTML =
      report.steps.map((step, index) => `<div class="difference-card" style="margin:10px 0;padding:14px">
        <span class="num">${String(index + 1).padStart(2, '0')}</span>
        <div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.detail)}</p></div>
      </div>`).join('');

    document.getElementById('preprocessTargets').innerHTML =
      `<div class="bar"><b>Price target</b><span>${report.price_usable_rows.toLocaleString()} records</span></div>
      <div class="bar"><b>DOM target</b><span>${report.dom_usable_rows.toLocaleString()} records</span></div>
      <p class="disclaimer">Target counts differ because DOM can be missing even when price is valid.</p>
      <p><b>Derived features:</b> ${report.engineered_features.map(escapeHtml).join(', ') || 'None detected'}</p>
      <p><b>Removed fields:</b> ${report.removed_columns.map(escapeHtml).join(', ') || 'None detected'}</p>`;

    document.getElementById('missingTable').innerHTML =
      report.missing_values.length
        ? `<table><thead><tr><th>Source column</th><th>Missing</th><th>Missing %</th></tr></thead>
           <tbody>${report.missing_values.map(item => `<tr>
             <td>${escapeHtml(item.column)}</td>
             <td>${item.missing.toLocaleString()}</td>
             <td>${item.percent}%</td>
           </tr>`).join('')}</tbody></table>`
        : '<p>No missing values found in source columns.</p>';

    status.innerHTML =
      '<span class="scope-icon">✓</span><div><strong>Report loaded from the included dataset</strong><p>Missing values and duplicate counts are computed from source data. Imputation and encoding are performed in the training pipeline.</p></div>';

    status.dataset.loaded = 'yes';
  } catch (error) {
    status.innerHTML =
      `<span class="scope-icon">!</span><div><strong>Could not load report</strong><p>${escapeHtml(error.message)}. Check that the API is running.</p></div>`;
  }
}

init();
