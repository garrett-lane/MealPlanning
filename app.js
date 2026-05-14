// ---- State ----
let meals = JSON.parse(localStorage.getItem('meals') || '[]');
let weekPlan = JSON.parse(localStorage.getItem('weekPlan') || '{}');

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MEAL_TYPES = ['Breakfast','Lunch','Dinner'];

// Migrate old flat-array structure to new nested structure
if (DAYS.some(d => weekPlan[d] && Array.isArray(weekPlan[d]))) {
  weekPlan = {};
}

// ---- Persistence ----
function save() {
  localStorage.setItem('meals', JSON.stringify(meals));
  localStorage.setItem('weekPlan', JSON.stringify(weekPlan));
}

// ---- Airtable Sync ----
async function syncFromAirtable() {
  showSyncStatus('loading', 'Syncing from Airtable…');
  try {
    const res = await fetch('https://gtmealprep.netlify.app/api/meals');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    const { records } = await res.json();
    const synced = records.map(r => {
      const f = r.fields;
      const ingredients = (f['Ingredients'] || '')
        .split(',').map(i => i.trim()).filter(Boolean);
      return {
        id: `at_${r.id}`,
        airtableId: r.id,
        name: f['Meal Name'] || '(Unnamed)',
        ingredients,
        recipeUrl: f['Recipe Link'] || '',
        tags: f['Tags'] || [],
        mealType: f['Meal Type'] || ''
      };
    });
    const localOnly = meals.filter(m => !m.airtableId);
    meals = [...synced, ...localOnly];
    save();
    renderTypeFilter();
    renderLibrary();
    showSyncStatus('success', `Synced ${synced.length} meal${synced.length !== 1 ? 's' : ''} from Airtable.`);
  } catch (err) {
    console.error('Sync error:', err);
    showSyncStatus('error', `Sync failed: ${err.message}`);
  }
}

function showSyncStatus(type, message) {
  const el = document.getElementById('sync-status');
  el.className = type ? `sync-status sync-${type}` : '';
  el.textContent = message;
  if (type === 'success') setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

document.getElementById('sync-btn').addEventListener('click', syncFromAirtable);

// ---- Render Meal Library ----
function renderLibrary() {
  const container = document.getElementById('meal-library');
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  const typeVal   = document.getElementById('type-filter').value;

  const filtered = meals.filter(m => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchVal) ||
      (m.tags || []).some(t => t.toLowerCase().includes(searchVal));
    const matchesType = !typeVal || m.mealType === typeVal;
    return matchesSearch && matchesType;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="no-meals">${meals.length === 0
      ? 'No meals yet. Click "Sync from Airtable" to load your meals!'
      : 'No meals match your search.'}</p>`;
    return;
  }

  container.innerHTML = filtered.map(meal => `
    <div class="meal-card" draggable="true" data-id="${meal.id}">
      <div class="meal-card-title">${escHtml(meal.name)}</div>
      ${meal.mealType ? `<span class="meal-type-badge type-${meal.mealType.toLowerCase()}">${escHtml(meal.mealType)}</span>` : ''}
      ${meal.tags && meal.tags.length ? `<div class="meal-tags">${meal.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="meal-actions">
        ${meal.ingredients && meal.ingredients.length
          ? `<button class="btn-ingredients" onclick="showIngredients('${meal.id}')">🥦 Ingredients</button>`
          : ''}
        ${meal.recipeUrl
          ? `<button class="btn-recipe" onclick="openRecipe('${meal.id}')">🔗 Recipe</button>`
          : ''}
        <button class="btn-plan" onclick="showPlanPicker('${meal.id}')">📅 Add to Plan</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.meal-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('mealId', card.dataset.id);
    });
  });
}

// ---- Render Week Plan ----
function renderWeekPlan() {
  DAYS.forEach(day => {
    MEAL_TYPES.forEach(type => {
      const cell = document.getElementById(`cell-${day}-${type}`);
      if (!cell) return;
      const planned = weekPlan[day]?.[type] || [];
      cell.innerHTML = planned.map((id, idx) => {
        if (id === '__leftovers__') {
          return `<div class="planned-meal planned-leftovers">
            <span class="planned-meal-name">🍱 Leftovers</span>
            <button class="remove-planned" onclick="removePlanned('${day}','${type}',${idx})" title="Remove">✕</button>
          </div>`;
        }
        const meal = meals.find(m => m.id === id);
        if (!meal) return '';
        return `<div class="planned-meal" title="${escHtml(meal.name)}">
          <span class="planned-meal-name" onclick="showIngredients('${meal.id}')">${escHtml(meal.name)}</span>
          <div class="planned-meal-btns">
            ${meal.recipeUrl ? `<a class="planned-recipe-btn" href="${escHtml(meal.recipeUrl)}" target="_blank" rel="noopener noreferrer" title="Open Recipe">🔗</a>` : ''}
            <button class="remove-planned" onclick="removePlanned('${day}','${type}',${idx})" title="Remove">✕</button>
          </div>
        </div>`;
      }).join('') + `<button class="leftovers-btn" onclick="addLeftovers('${day}','${type}')" title="Add leftovers">🍱</button>`;
    });
  });
}

function removePlanned(day, type, idx) {
  weekPlan[day]?.[type]?.splice(idx, 1);
  save();
  renderWeekPlan();
}

// ---- Drag & Drop into Meal Cells ----
document.querySelectorAll('.meal-cell').forEach(cell => {
  cell.addEventListener('dragover', e => {
    e.preventDefault();
    cell.classList.add('drag-over');
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
  cell.addEventListener('drop', e => {
    e.preventDefault();
    cell.classList.remove('drag-over');
    const mealId = e.dataTransfer.getData('mealId');
    const { day, type } = cell.dataset;
    if (!mealId) return;
    weekPlan[day] = weekPlan[day] || {};
    weekPlan[day][type] = weekPlan[day][type] || [];
    weekPlan[day][type].push(mealId);
    save();
    renderWeekPlan();
  });
});

// ---- Search & Filter ----
function renderTypeFilter() {
  const select = document.getElementById('type-filter');
  const current = select.value;
  const types = [...new Set(meals.map(m => m.mealType).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All types</option>' +
    types.map(t => `<option value="${t}"${t === current ? ' selected' : ''}>${t}</option>`).join('');
}

document.getElementById('search-input').addEventListener('input', renderLibrary);
document.getElementById('type-filter').addEventListener('change', renderLibrary);

// ---- Show Ingredients Modal ----
function showIngredients(id) {
  const meal = meals.find(m => m.id === id);
  if (!meal) return;
  document.getElementById('detail-title').textContent = meal.name;
  let html = '';
  if (meal.ingredients && meal.ingredients.length) {
    html += `<ul class="ingredient-list">${meal.ingredients.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`;
  } else {
    html += `<p style="color:var(--muted)">No ingredients saved for this meal.</p>`;
  }
  if (meal.recipeUrl) {
    html += `<div class="recipe-link-block"><a href="${escHtml(meal.recipeUrl)}" target="_blank" rel="noopener noreferrer">🔗 Open Full Recipe</a></div>`;
  }
  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail-overlay').classList.remove('hidden');
}

function openRecipe(id) {
  const meal = meals.find(m => m.id === id);
  if (meal && meal.recipeUrl) window.open(meal.recipeUrl, '_blank', 'noopener,noreferrer');
}

document.getElementById('detail-close').addEventListener('click', () => {
  document.getElementById('detail-overlay').classList.add('hidden');
});
document.getElementById('detail-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('detail-overlay'))
    document.getElementById('detail-overlay').classList.add('hidden');
});

// ---- Plan Picker (2-step: day → meal type) ----
function showPlanPicker(id) {
  const meal = meals.find(m => m.id === id);
  if (!meal) return;
  document.getElementById('detail-title').textContent = `Add "${meal.name}" to plan`;
  document.getElementById('detail-body').innerHTML = `
    <p style="color:var(--muted);margin-bottom:8px">Choose a day:</p>
    <div class="day-picker">
      ${DAYS.map(d => `<button class="day-btn" onclick="showMealTypePicker('${id}','${d}')">${d}</button>`).join('')}
    </div>
  `;
  document.getElementById('detail-overlay').classList.remove('hidden');
}

function showMealTypePicker(mealId, day) {
  document.getElementById('detail-body').innerHTML = `
    <p style="color:var(--muted);margin-bottom:8px">Which meal on <strong style="color:var(--primary)">${day}</strong>?</p>
    <div class="day-picker">
      ${MEAL_TYPES.map(t => `<button class="day-btn" onclick="addToDay('${mealId}','${day}','${t}')">${t}</button>`).join('')}
    </div>
  `;
}

function addToDay(mealId, day, type) {
  weekPlan[day] = weekPlan[day] || {};
  weekPlan[day][type] = weekPlan[day][type] || [];
  weekPlan[day][type].push(mealId);
  save();
  renderWeekPlan();
  document.getElementById('detail-overlay').classList.add('hidden');
}

// ---- Leftovers ----
function addLeftovers(day, type) {
  weekPlan[day] = weekPlan[day] || {};
  weekPlan[day][type] = weekPlan[day][type] || [];
  weekPlan[day][type].push('__leftovers__');
  save();
  renderWeekPlan();
}

// ---- Generate Shopping List ----
document.getElementById('generate-list-btn').addEventListener('click', () => {
  const hasPlanned = DAYS.some(d => MEAL_TYPES.some(t => (weekPlan[d]?.[t] || []).length > 0));
  if (!hasPlanned) {
    alert('No meals in your weekly plan yet! Add some meals first.');
    return;
  }

  let html = '';
  let plainText = 'Shopping List\n==============\n\n';

  DAYS.forEach(day => {
    const entries = [];
    MEAL_TYPES.forEach(type => {
      (weekPlan[day]?.[type] || []).forEach(id => {
        if (id === '__leftovers__') return;
        const meal = meals.find(m => m.id === id);
        if (meal) entries.push({ meal, type });
      });
    });
    if (entries.length === 0) return;

    html += `<div class="shopping-section"><h3>${day}</h3>`;
    plainText += `${day}\n`;

    entries.forEach(({ meal, type }) => {
      if (meal.ingredients && meal.ingredients.length) {
        meal.ingredients.forEach((ing, i) => {
          const uid = `chk_${meal.id}_${type}_${i}`;
          html += `<div class="shopping-item" id="si_${uid}">
            <input type="checkbox" id="${uid}" onchange="toggleShoppingItem('${uid}')">
            <label for="${uid}">${escHtml(meal.name)} <span style="color:var(--muted);font-size:0.85em">(${type})</span>: ${escHtml(ing)}</label>
          </div>`;
          plainText += `  [ ] ${meal.name} (${type}): ${ing}\n`;
        });
      } else {
        html += `<div class="shopping-item"><label style="color:var(--muted)">${escHtml(meal.name)} (${type}) — no ingredients saved</label></div>`;
        plainText += `  [ ] ${meal.name} (${type}) — no ingredients saved\n`;
      }
    });

    html += '</div>';
    plainText += '\n';
  });

  document.getElementById('modal-body').innerHTML = html || '<p>No ingredients found.</p>';
  document.getElementById('modal-body').dataset.plain = plainText;
  document.getElementById('modal-overlay').classList.remove('hidden');
});

function toggleShoppingItem(uid) {
  const item = document.getElementById(`si_${uid}`);
  const cb   = document.getElementById(uid);
  if (item) item.classList.toggle('checked', cb.checked);
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
});
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay'))
    document.getElementById('modal-overlay').classList.add('hidden');
});

document.getElementById('copy-list-btn').addEventListener('click', () => {
  const text = document.getElementById('modal-body').dataset.plain || '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-list-btn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy to Clipboard', 2000);
  });
});

// ---- Clear Plan ----
document.getElementById('clear-plan-btn').addEventListener('click', () => {
  const hasPlanned = DAYS.some(d => MEAL_TYPES.some(t => (weekPlan[d]?.[t] || []).length > 0));
  if (!hasPlanned) return;
  if (!confirm('Clear the entire week plan?')) return;
  weekPlan = {};
  save();
  renderWeekPlan();
});

// ---- Random Entree ----
function randomEntree() {
  const entrees = meals.filter(m => m.mealType.toLowerCase().includes('entre'));
  if (entrees.length === 0) {
    alert('No entrees found! Make sure your meals are synced from Airtable.');
    return;
  }
  const meal = entrees[Math.floor(Math.random() * entrees.length)];
  showIngredients(meal.id);
}

document.getElementById('random-btn').addEventListener('click', randomEntree);

// ---- Utility ----
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ---- Week Plan History ----
function getWeekLabel(weekOffset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(monday)} – ${fmt(sunday)}, ${sunday.getFullYear()}`;
}

function saveWeekPlan() {
  const hasPlanned = DAYS.some(d => MEAL_TYPES.some(t => (weekPlan[d]?.[t] || []).length > 0));
  if (!hasPlanned) {
    alert('Nothing in the plan to save!');
    return;
  }
  document.getElementById('detail-title').textContent = 'Save Plan — Choose Week';
  document.getElementById('detail-body').innerHTML = `
    <p style="color:var(--muted);margin-bottom:12px">Which week is this plan for?</p>
    <div class="day-picker" style="flex-direction:column">
      <button class="day-btn" onclick="doSavePlan(0)">This week &nbsp;<small style="color:var(--muted)">${getWeekLabel(0)}</small></button>
      <button class="day-btn" onclick="doSavePlan(1)">Next week &nbsp;<small style="color:var(--muted)">${getWeekLabel(1)}</small></button>
    </div>
  `;
  document.getElementById('detail-overlay').classList.remove('hidden');
}

async function doSavePlan(weekOffset) {
  document.getElementById('detail-overlay').classList.add('hidden');

  const namedPlan = {};
  DAYS.forEach(day => {
    namedPlan[day] = {};
    MEAL_TYPES.forEach(type => {
      namedPlan[day][type] = (weekPlan[day]?.[type] || [])
        .filter(id => id !== '__leftovers__')
        .map(id => meals.find(m => m.id === id)?.name)
        .filter(Boolean);
    });
  });

  const btn = document.getElementById('save-plan-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const res = await fetch('https://gtmealprep.netlify.app/api/weekplans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekLabel: getWeekLabel(weekOffset),
        plan: namedPlan,
        savedOn: new Date().toISOString().split('T')[0]
      })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    btn.textContent = '✅ Saved!';
    setTimeout(() => { btn.textContent = '💾 Save Plan'; btn.disabled = false; }, 2000);
  } catch (err) {
    alert(`Failed to save plan: ${err.message}`);
    btn.textContent = '💾 Save Plan';
    btn.disabled = false;
  }
}

async function showPlanHistory() {
  document.getElementById('detail-title').textContent = 'Plan History';
  document.getElementById('detail-body').innerHTML = '<p style="color:var(--muted)">Loading…</p>';
  document.getElementById('detail-overlay').classList.remove('hidden');

  try {
    const res = await fetch('https://gtmealprep.netlify.app/api/weekplans');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { records } = await res.json();

    if (!records.length) {
      document.getElementById('detail-body').innerHTML = '<p style="color:var(--muted)">No saved plans yet.</p>';
      return;
    }

    const html = records.map(r => {
      const f = r.fields;
      const rows = DAYS.filter(d => f[d]).map(d => {
        const lines = f[d].split('\n').filter(Boolean).map(l => `<div class="history-meal-line">${escHtml(l)}</div>`).join('');
        return `<div class="history-day">
          <span class="history-day-label">${d.slice(0,3)}</span>
          <div class="history-day-meals">${lines}</div>
        </div>`;
      }).join('');
      return `<div class="history-entry">
        <div class="history-week-label">${escHtml(f['Week Label'] || 'Untitled')}</div>
        ${rows}
      </div>`;
    }).join('');

    document.getElementById('detail-body').innerHTML = html;
  } catch (err) {
    document.getElementById('detail-body').innerHTML =
      `<p style="color:var(--danger)">Failed to load history: ${escHtml(err.message)}</p>`;
  }
}

document.getElementById('save-plan-btn').addEventListener('click', saveWeekPlan);
document.getElementById('history-btn').addEventListener('click', showPlanHistory);

// ---- Init ----
renderTypeFilter();
renderLibrary();
renderWeekPlan();
