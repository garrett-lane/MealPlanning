// ---- State ----
let meals = JSON.parse(localStorage.getItem('meals') || '[]');
let weekPlan = JSON.parse(localStorage.getItem('weekPlan') || '{}');

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

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
      const rawIngredients = f['Ingredients'] || '';
      const ingredients = rawIngredients
        ? rawIngredients.split(',').map(i => i.trim()).filter(Boolean)
        : [];

      return {
        id: `at_${r.id}`,
        airtableId: r.id,
        name: f['Meal Name'] || '(Unnamed)',
        ingredients,
        recipeUrl: f['recipe link'] || '',
        tags: f['meal type'] ? [f['meal type']] : [],
        mealType: f['meal type'] || ''
      };
    });

    // Keep any local-only meals, replace Airtable-sourced ones
    const localOnly = meals.filter(m => !m.airtableId);
    meals = [...synced, ...localOnly];
    save();

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
    const matchesType = !typeVal || m.mealType.toLowerCase() === typeVal.toLowerCase();
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
    const container = document.getElementById(`day-${day}`);
    const planned = weekPlan[day] || [];
    container.innerHTML = planned.map((id, idx) => {
      const meal = meals.find(m => m.id === id);
      if (!meal) return '';
      return `<div class="planned-meal" title="${escHtml(meal.name)}">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(meal.name)}</span>
        <button class="remove-planned" onclick="removePlanned('${day}', ${idx})" title="Remove">✕</button>
      </div>`;
    }).join('');
  });
}

function removePlanned(day, idx) {
  weekPlan[day] = weekPlan[day] || [];
  weekPlan[day].splice(idx, 1);
  save();
  renderWeekPlan();
}

// ---- Drag & Drop into Day Slots ----
document.querySelectorAll('.day-slot').forEach(slot => {
  slot.addEventListener('dragover', e => {
    e.preventDefault();
    slot.classList.add('drag-over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', e => {
    e.preventDefault();
    slot.classList.remove('drag-over');
    const mealId = e.dataTransfer.getData('mealId');
    const day = slot.dataset.day;
    if (!mealId) return;
    weekPlan[day] = weekPlan[day] || [];
    weekPlan[day].push(mealId);
    save();
    renderWeekPlan();
  });
});

// ---- Search & Filter ----
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

// ---- Plan Picker ----
function showPlanPicker(id) {
  const meal = meals.find(m => m.id === id);
  if (!meal) return;

  document.getElementById('detail-title').textContent = `Add "${meal.name}" to plan`;
  document.getElementById('detail-body').innerHTML = `
    <p style="color:var(--muted);margin-bottom:8px">Choose a day:</p>
    <div class="day-picker">
      ${DAYS.map(d => `<button class="day-btn" onclick="addToDay('${id}','${d}')">${d}</button>`).join('')}
    </div>
  `;
  document.getElementById('detail-overlay').classList.remove('hidden');
}

function addToDay(mealId, day) {
  weekPlan[day] = weekPlan[day] || [];
  weekPlan[day].push(mealId);
  save();
  renderWeekPlan();
  document.getElementById('detail-overlay').classList.add('hidden');
}

// ---- Generate Shopping List ----
document.getElementById('generate-list-btn').addEventListener('click', () => {
  const hasPlanned = DAYS.some(day => (weekPlan[day] || []).length > 0);
  if (!hasPlanned) {
    alert('No meals in your weekly plan yet! Add some meals to days first.');
    return;
  }

  let html = '';
  let plainText = 'Shopping List\n==============\n\n';

  DAYS.forEach(day => {
    const dayMeals = (weekPlan[day] || []).map(id => meals.find(m => m.id === id)).filter(Boolean);
    if (dayMeals.length === 0) return;

    html += `<div class="shopping-section"><h3>${day}</h3>`;
    plainText += `${day}\n`;

    dayMeals.forEach(meal => {
      if (meal.ingredients && meal.ingredients.length) {
        meal.ingredients.forEach((ing, i) => {
          const uid = `chk_${meal.id}_${i}`;
          html += `<div class="shopping-item" id="si_${uid}">
            <input type="checkbox" id="${uid}" onchange="toggleShoppingItem('${uid}')">
            <label for="${uid}">${escHtml(meal.name)}: ${escHtml(ing)}</label>
          </div>`;
          plainText += `  [ ] ${meal.name}: ${ing}\n`;
        });
      } else {
        html += `<div class="shopping-item"><label style="color:var(--muted)">${escHtml(meal.name)} (no ingredients saved)</label></div>`;
        plainText += `  [ ] ${meal.name} (no ingredients saved)\n`;
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

// ---- Init ----
renderLibrary();
renderWeekPlan();
