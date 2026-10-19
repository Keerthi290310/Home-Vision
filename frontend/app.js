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
  communityAverage: { label: 'Community average unit price', help: 'Historical average price in CNY per m².', group: 'Location & neighbourhood', min: 0, max: 1000000, step: 'any' },
  subway: { label: 'Subway access', help: 'Does the record indicate subway access?', group: 'Location & neighbourhood', type: 'binary' },

  square: { label: 'Living area (m²)', help: 'Indoor floor area in square metres.', group: 'Home & building', min: 10, max: 1000, step: 'any' },
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

  // Automatically update prediction when an input changes.
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
  predictionTimer = setTimeout(() => runPrediction(false), delay);
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
async function runPrediction(manual = false) {
  const form = document.getElementById('form');
  if (!form) return;

  const requestId = ++predictionRequestId;

  if (!apiOnline) {
    setMessage('API is offline. Start the backend and refresh the page.', 'error');
    return;
  }

  if (!form.checkValidity()) {
    setMessage(
      'Enter a valid value. Other inputs will keep their current values.',
      'info'
    );
    return;
  }

  const values = {};

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

  // Keep trade quarter consistent with trade month.
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

    // Ignore stale responses from older inputs.
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
      convertedElement.textContent =
        `Approximate equivalent: ${money(price)} CNY`;
    }

    if (daysElement) {
      daysElement.textContent =
        `${Math.round(days).toLocaleString()} days`;
    }

    const interpretation = document.getElementById('interpret');

    if (interpretation) {
      interpretation.textContent =
        `For the current input profile, the estimated sale price is ${money(price)} CNY and estimated time on market is ${Math.round(days)} days.`;
    }

    const decision = document.getElementById('decisionTitle');

    if (decision) {
      decision.textContent = decisionTitle(days);
    }

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
    if (requestId === predictionRequestId && button) {
      button.disabled = false;
      button.innerHTML = 'Estimate price + time <span>→</span>';
    }
  }
}
async function init() {
  const form = document.getElementById('form');

  try {
    const response = await fetch(api + '/health');
    if (!response.ok) throw new Error('API unavailable');

    apiOnline = true;
    setMessage('Backend connected. Enter property details to get predictions.', 'success');
  } catch (error) {
    apiOnline = false;
    setMessage(
      'Backend is offline. Start FastAPI on port 8000 and refresh this page.',
      'error'
    );
  }

  // Load backend defaults without overwriting existing user inputs.
  try {
    const response = await fetch(api + '/defaults');

    if (response.ok) {
      const result = await response.json();
      defaults = result.defaults || result;

      if (form) {
        for (const key of Object.keys(fields)) {
          const input = form.elements.namedItem(key);

          if (
            input &&
            (input.value === '' || input.value == null) &&
            defaults[key] !== undefined
          ) {
            input.value = defaults[key];
          }
        }
      }
    }
  } catch (error) {
    console.warn('Could not load defaults:', error);
  }

  // Keep the quarter synchronized with the selected month.
  const monthInput = form?.elements.namedItem('trade_month');
  const quarterInput = form?.elements.namedItem('trade_quarter');

  if (monthInput && quarterInput) {
    monthInput.addEventListener('change', () => {
      const month = Number(monthInput.value);

      if (month >= 1 && month <= 12) {
        quarterInput.value = String(Math.ceil(month / 3));
      }
    });
  }

  // Run an initial prediction when the form is valid.
  if (form && apiOnline && form.checkValidity()) {
    schedulePrediction();
  }

  await renderMetrics();
  await renderImportance();
  await loadFactorAnalysis();
  await loadPreprocessingReport();
}

async function renderMetrics() {
  try {
    const response = await fetch(api + '/metrics');
    if (!response.ok) return;

    const data = await response.json();

    const mapping = {
      modelName: data.model_name,
      modelScore: data.r2,
      modelMAE: data.mae,
      modelRMSE: data.rmse
    };

    for (const [id, value] of Object.entries(mapping)) {
      const element = document.getElementById(id);

      if (element && value !== undefined && value !== null) {
        element.textContent =
          typeof value === 'number'
            ? value.toLocaleString(undefined, {
                maximumFractionDigits: 4
              })
            : String(value);
      }
    }
  } catch (error) {
    console.warn('Metrics could not be loaded:', error);
  }
}

async function renderImportance() {
  try {
    const response = await fetch(api + '/feature-importance');
    if (!response.ok) return;

    const result = await response.json();
    const container = document.getElementById('importance');

    if (!container) return;

    const items = result.importance || result.features || [];

    if (!Array.isArray(items) || items.length === 0) {
      container.textContent = 'Feature importance is not available.';
      return;
    }

    container.innerHTML = items.map(item => {
      const name = escapeHtml(
        item.feature || item.name || item.key || 'Feature'
      );

      const value = Number(
        item.importance ?? item.value ?? item.score ?? 0
      );

      const safeValue = Number.isFinite(value) ? value : 0;
      const width = Math.max(0, Math.min(100, safeValue * 100));

      return `
        <div class="importance-row">
          <div class="importance-label">
            <span>${name}</span>
            <span>${safeValue.toFixed(3)}</span>
          </div>
          <div class="importance-track">
            <div class="importance-bar" style="width:${width}%"></div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.warn('Feature importance could not be loaded:', error);
  }
}

async function runWhatIf() {
  const form = document.getElementById('form');

  if (!form) return;

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const values = {};

  for (const key of Object.keys(fields)) {
    const input = form.elements.namedItem(key);
    if (!input) continue;

    const number = Number(input.value);

    if (!Number.isFinite(number)) {
      setMessage(`Enter a valid value for ${fields[key].label}.`, 'error');
      return;
    }

    values[key] = number;
  }

  const container = document.getElementById('whatIfResults');

  if (container) {
    container.textContent = 'Calculating scenarios…';
  }

  try {
    const response = await fetch(api + '/what-if', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.detail || 'Could not calculate scenarios.'
      );
    }

    if (container) {
      container.innerHTML = `
        <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
      `;
    }
  } catch (error) {
    if (container) {
      container.textContent = `Scenario calculation failed: ${error.message}`;
    }

    console.error('What-if error:', error);
  }
}

async function loadFactorAnalysis() {
  try {
    const response = await fetch(api + '/factor-analysis');
    if (!response.ok) return;

    const result = await response.json();
    const container = document.getElementById('factorAnalysis');

    if (!container) return;

    container.innerHTML = `
      <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
    `;
  } catch (error) {
    console.warn('Factor analysis could not be loaded:', error);
  }
}

async function loadPreprocessingReport() {
  try {
    const response = await fetch(api + '/preprocessing-report');
    if (!response.ok) return;

    const result = await response.json();
    const container = document.getElementById('preprocessingReport');

    if (!container) return;

    container.innerHTML = `
      <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
    `;
  } catch (error) {
    console.warn('Preprocessing report could not be loaded:', error);
  }
}

// Start the application.
init();
