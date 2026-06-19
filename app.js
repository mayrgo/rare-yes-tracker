'use strict';

const COLOR_OPTIONS = [
  { name: 'brown', value: '#9A6B4F' },
  { name: 'red', value: '#D8665B' },
  { name: 'blue', value: '#5E8DD6' },
  { name: 'purple', value: '#9B74D1' },
  { name: 'green', value: '#5EA878' },
  { name: 'orange', value: '#D68B45' },
  { name: 'pink', value: '#D879A6' },
  { name: 'teal', value: '#4BA7A1' },
  { name: 'yellow', value: '#C9A447' },
  { name: 'gray', value: '#7D848C' }
];

const INITIAL_HABITS = [
  { name: '☕ Coffee', color_name: 'brown' },
  { name: '🍷 Alcohol', color_name: 'red' },
  { name: '🥴 Got drunk', color_name: 'purple' },
  { name: '⚡ Episode', color_name: 'blue' },
  { name: '🪫 No-energy day', color_name: 'gray' },
  { name: '🍽️ Heavy overeating', color_name: 'orange' }
];

const state = {
  habits: [],
  events: [],
  selectedDate: todayISO(),
  calendarMonth: startOfMonth(new Date()),
  selectedColor: 'brown',
  editColor: 'brown',
  loading: false
};

const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', async () => {
  $('todayLabel').textContent = formatLongDate(todayISO());
  setupTabs();
  setupPalettes();
  setupForms();
  setupCalendarControls();
  setupStatsControls();
  $('refreshBtn').addEventListener('click', loadAll);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  await loadAll();
});

function apiReady() {
  return typeof API_URL !== 'undefined' && API_URL && !API_URL.includes('PASTE_');
}

async function api(action, payload = {}, method = 'POST') {
  if (!apiReady()) throw new Error('Add your Apps Script Web App URL in config.js first.');

  if (method === 'GET') {
    const url = new URL(API_URL);
    Object.entries({ action, ...payload }).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'API request failed');
    return data;
  }

  // text/plain avoids CORS preflight for Apps Script Web Apps.
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API request failed');
  return data;
}

async function loadAll() {
  if (state.loading) return;
  state.loading = true;
  try {
    if (!apiReady()) {
      state.habits = INITIAL_HABITS.map((h, index) => ({
        id: `demo-${index + 1}`,
        name: h.name,
        color_name: h.color_name,
        color_value: colorValue(h.color_name),
        is_active: true,
        created_at: new Date().toISOString(),
        archived_at: ''
      }));
      state.events = [];
      render();
      toast('Demo mode: add API_URL in config.js');
      return;
    }
    const [habitsRes, eventsRes] = await Promise.all([
      api('GET_HABITS', {}, 'GET'),
      api('GET_EVENTS', {}, 'GET')
    ]);
    state.habits = habitsRes.habits || [];
    state.events = (eventsRes.events || []).filter((e) => !e.deleted_at);
    render();
  } catch (err) {
    console.error(err);
    toast(err.message);
  } finally {
    state.loading = false;
  }
}

function render() {
  renderToday();
  renderCalendar();
  renderDayEvents();
  renderStats();
  renderHabits();
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    });
  });
}

function setupPalettes() {
  createPalette($('colorPalette'), 'selectedColor');
  createPalette($('editColorPalette'), 'editColor');
}

function createPalette(el, stateKey) {
  el.innerHTML = '';
  COLOR_OPTIONS.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-choice';
    button.style.background = color.value;
    button.title = color.name;
    button.setAttribute('aria-label', color.name);
    button.addEventListener('click', () => {
      state[stateKey] = color.name;
      [...el.children].forEach((child) => child.classList.toggle('selected', child === button));
    });
    if (color.name === state[stateKey]) button.classList.add('selected');
    el.appendChild(button);
  });
}

function setupForms() {
  $('habitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await createHabit($('habitName').value.trim(), state.selectedColor);
    $('habitForm').reset();
  });

  $('eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateEvent($('eventId').value, $('eventDate').value, $('eventComment').value.trim());
    $('eventDialog').close();
  });

  $('deleteEventBtn').addEventListener('click', async () => {
    await deleteEvent($('eventId').value);
    $('eventDialog').close();
  });

  $('editHabitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateHabit($('editHabitId').value, $('editHabitName').value.trim(), state.editColor);
    $('habitDialog').close();
  });
}

function setupCalendarControls() {
  $('prevMonth').addEventListener('click', () => {
    state.calendarMonth = addMonths(state.calendarMonth, -1);
    renderCalendar();
  });
  $('nextMonth').addEventListener('click', () => {
    state.calendarMonth = addMonths(state.calendarMonth, 1);
    renderCalendar();
  });
}

function setupStatsControls() {
  $('periodSelect').addEventListener('change', () => {
    $('customRange').classList.toggle('hidden', $('periodSelect').value !== 'custom');
    renderStats();
  });
  $('customStart').addEventListener('change', renderStats);
  $('customEnd').addEventListener('change', renderStats);
}

function renderToday() {
  const activeHabits = state.habits.filter((h) => isActive(h));
  const todayEvents = state.events.filter((e) => e.date === todayISO()).sort(sortByCreated);
  const countByHabit = groupCount(todayEvents, 'habit_id');

  $('habitButtons').innerHTML = '';
  activeHabits.forEach((habit) => {
    const button = document.createElement('button');
    button.className = 'log-button';
    button.style.background = habit.color_value || colorValue(habit.color_name);
    const count = countByHabit[habit.id] || 0;
    button.innerHTML = `${escapeHTML(habit.name)}<small>${count ? '+ Add another yes event' : 'Tap to log today'}</small>`;
    button.addEventListener('click', () => createEvent(habit.id, todayISO(), ''));
    $('habitButtons').appendChild(button);
  });

  $('todayCount').textContent = String(todayEvents.length);
  renderEventList($('todayEvents'), todayEvents);
}

function renderCalendar() {
  const first = startOfMonth(state.calendarMonth);
  const title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('calendarTitle').textContent = title;
  const gridStart = mondayOfWeek(first);
  const month = first.getMonth();
  $('calendarGrid').innerHTML = '';

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const iso = toISO(date);
    const events = state.events.filter((e) => e.date === iso);
    const button = document.createElement('button');
    button.className = 'day-cell';
    if (date.getMonth() !== month) button.classList.add('outside');
    if (iso === state.selectedDate) button.classList.add('selected');
    button.innerHTML = `<span class="day-number">${date.getDate()}</span><span class="day-dots"></span>`;
    const dots = button.querySelector('.day-dots');
    events.slice(0, 6).forEach((event) => {
      const habit = habitById(event.habit_id);
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = habit?.color_value || colorValue(habit?.color_name);
      dot.title = habit?.name || 'Archived habit';
      dots.appendChild(dot);
    });
    if (events.length > 6) {
      const more = document.createElement('span');
      more.className = 'more-dot';
      more.textContent = `+${events.length - 6}`;
      dots.appendChild(more);
    }
    button.addEventListener('click', () => {
      state.selectedDate = iso;
      renderCalendar();
      renderDayEvents();
    });
    $('calendarGrid').appendChild(button);
  }
}

function renderDayEvents() {
  $('selectedDayTitle').textContent = formatLongDate(state.selectedDate);
  const events = state.events.filter((e) => e.date === state.selectedDate).sort(sortByCreated);
  renderEventList($('dayEvents'), events);
}

function renderEventList(container, events) {
  container.innerHTML = '';
  events.forEach((event) => {
    const habit = habitById(event.habit_id) || { name: 'Archived habit', color_name: 'gray', color_value: colorValue('gray') };
    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
      <span class="event-dot" style="background:${habit.color_value || colorValue(habit.color_name)}"></span>
      <div>
        <div class="event-title">${escapeHTML(habit.name)}</div>
        <div class="event-meta">${formatLongDate(event.date)}${event.comment ? ' · ' + escapeHTML(event.comment) : ''}</div>
      </div>
      <button class="ghost-button" type="button">Edit</button>
    `;
    card.querySelector('button').addEventListener('click', () => openEventDialog(event));
    container.appendChild(card);
  });
}

function renderStats() {
  const period = selectedPeriod();
  const previous = previousPeriod(period);
  const periodEvents = eventsBetween(period.start, period.end);
  const previousEvents = eventsBetween(previous.start, previous.end);
  const maxCount = Math.max(1, ...state.habits.map((h) => countEvents(periodEvents, h.id)));

  $('statsCards').innerHTML = '';
  state.habits.forEach((habit) => {
    const currentCount = countEvents(periodEvents, habit.id);
    const prevCount = countEvents(previousEvents, habit.id);
    const diff = currentCount - prevCount;
    const last = lastLoggedDate(habit.id);
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class="stat-top">
        <div class="stat-name">${escapeHTML(habit.name)}</div>
        ${isActive(habit) ? '' : '<span class="pill">archived</span>'}
      </div>
      <div class="stat-grid">
        <div class="stat-metric"><b>${currentCount}</b><span>events</span></div>
        <div class="stat-metric"><b>${diff === 0 ? 'same' : diff > 0 ? '+' + diff : diff}</b><span>vs previous</span></div>
        <div class="stat-metric"><b>${last ? shortDate(last) : '—'}</b><span>last logged</span></div>
        <div class="stat-metric"><b>${currentNoEventStreak(habit.id)}</b><span>quiet days now</span></div>
        <div class="stat-metric"><b>${longestNoEventStreak(habit.id, period.start, period.end)}</b><span>longest quiet streak</span></div>
        <div class="stat-metric"><b>${periodLabel(period)}</b><span>period</span></div>
      </div>`;
    $('statsCards').appendChild(card);
  });

  renderBars($('barChart'), state.habits.map((habit) => ({
    label: habit.name,
    value: countEvents(periodEvents, habit.id),
    color: habit.color_value || colorValue(habit.color_name)
  })), maxCount);

  renderHeatmap(period.start, period.end);

  const comparisonRows = state.habits.map((habit) => ({
    label: habit.name,
    current: countEvents(periodEvents, habit.id),
    previous: countEvents(previousEvents, habit.id),
    color: habit.color_value || colorValue(habit.color_name)
  }));
  renderComparison(comparisonRows);
}

function renderBars(container, rows, max) {
  container.innerHTML = '';
  rows.forEach((row) => {
    const el = document.createElement('div');
    el.className = 'bar-row';
    el.innerHTML = `
      <span>${escapeHTML(row.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(row.value / max) * 100}%; background:${row.color}"></span></span>
      <span>${row.value}</span>`;
    container.appendChild(el);
  });
}

function renderHeatmap(start, end) {
  const container = $('heatmap');
  container.innerHTML = '';
  for (let d = parseISO(start); toISO(d) <= end; d = addDays(d, 1)) {
    const iso = toISO(d);
    const events = state.events.filter((e) => e.date === iso);
    const habit = events.length ? habitById(events[0].habit_id) : null;
    const tile = document.createElement('div');
    tile.className = 'heat-day';
    tile.innerHTML = `<span>${d.getDate()}</span><span class="heat-fill" style="background:${events.length ? (habit?.color_value || colorValue(habit?.color_name)) : 'transparent'}"></span>`;
    tile.title = `${formatLongDate(iso)} · ${events.length} event${events.length === 1 ? '' : 's'}`;
    container.appendChild(tile);
  }
}

function renderComparison(rows) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.current, r.previous]));
  const container = $('comparisonChart');
  container.innerHTML = '';
  rows.forEach((row) => {
    const el = document.createElement('div');
    el.className = 'stat-card';
    el.innerHTML = `
      <div class="stat-name">${escapeHTML(row.label)}</div>
      <div class="bar-row"><span>Current</span><span class="bar-track"><span class="bar-fill" style="width:${(row.current / max) * 100}%; background:${row.color}"></span></span><span>${row.current}</span></div>
      <div class="bar-row"><span>Previous</span><span class="bar-track"><span class="bar-fill" style="width:${(row.previous / max) * 100}%; background:#cfc5b7"></span></span><span>${row.previous}</span></div>`;
    container.appendChild(el);
  });
}

function renderHabits() {
  renderHabitList($('activeHabits'), state.habits.filter(isActive), false);
  renderHabitList($('archivedHabits'), state.habits.filter((h) => !isActive(h)), true);
}

function renderHabitList(container, habits, archived) {
  container.innerHTML = '';
  habits.forEach((habit) => {
    const row = document.createElement('div');
    row.className = 'habit-row';
    row.innerHTML = `
      <span class="event-dot" style="background:${habit.color_value || colorValue(habit.color_name)}"></span>
      <div><div class="event-title">${escapeHTML(habit.name)}</div><div class="event-meta">${habit.color_name || 'color'}</div></div>
      <div class="habit-actions">
        <button class="ghost-button edit">Edit</button>
        <button class="${archived ? 'primary-button restore' : 'danger-button archive'}">${archived ? 'Restore' : 'Archive'}</button>
      </div>`;
    row.querySelector('.edit').addEventListener('click', () => openHabitDialog(habit));
    const actionBtn = row.querySelector(archived ? '.restore' : '.archive');
    actionBtn.addEventListener('click', () => archived ? restoreHabit(habit.id) : archiveHabit(habit.id));
    container.appendChild(row);
  });
}

async function createEvent(habitId, date, comment) {
  try {
    if (!apiReady()) throw new Error('Connect config.js before logging real events.');
    await api('POST_EVENT', { habit_id: habitId, date, comment });
    await loadAll();
    toast('Logged');
  } catch (err) { toast(err.message); }
}

async function updateEvent(id, date, comment) {
  try {
    await api('PATCH_EVENT', { id, date, comment });
    await loadAll();
    toast('Updated');
  } catch (err) { toast(err.message); }
}

async function deleteEvent(id) {
  try {
    await api('DELETE_EVENT', { id });
    await loadAll();
    toast('Deleted softly');
  } catch (err) { toast(err.message); }
}

async function createHabit(name, colorName) {
  try {
    if (!name) return;
    await api('POST_HABIT', { name, color_name: colorName, color_value: colorValue(colorName) });
    await loadAll();
    toast('Added');
  } catch (err) { toast(err.message); }
}

async function updateHabit(id, name, colorName) {
  try {
    await api('PATCH_HABIT', { id, name, color_name: colorName, color_value: colorValue(colorName) });
    await loadAll();
    toast('Saved');
  } catch (err) { toast(err.message); }
}

async function archiveHabit(id) {
  try {
    await api('ARCHIVE_HABIT', { id });
    await loadAll();
    toast('Archived');
  } catch (err) { toast(err.message); }
}

async function restoreHabit(id) {
  try {
    await api('RESTORE_HABIT', { id });
    await loadAll();
    toast('Restored');
  } catch (err) { toast(err.message); }
}

function openEventDialog(event) {
  $('eventId').value = event.id;
  $('eventDate').value = event.date;
  $('eventComment').value = event.comment || '';
  $('eventDialog').showModal();
}

function openHabitDialog(habit) {
  $('editHabitId').value = habit.id;
  $('editHabitName').value = habit.name;
  state.editColor = habit.color_name || 'brown';
  createPalette($('editColorPalette'), 'editColor');
  $('habitDialog').showModal();
}

function selectedPeriod() {
  const value = $('periodSelect').value;
  const today = parseISO(todayISO());
  if (value === '7') return { start: toISO(addDays(today, -6)), end: toISO(today) };
  if (value === '30') return { start: toISO(addDays(today, -29)), end: toISO(today) };
  if (value === 'currentMonth') return { start: toISO(startOfMonth(today)), end: toISO(endOfMonth(today)) };
  if (value === 'previousMonth') {
    const prev = addMonths(startOfMonth(today), -1);
    return { start: toISO(prev), end: toISO(endOfMonth(prev)) };
  }
  const start = $('customStart').value || toISO(addDays(today, -29));
  const end = $('customEnd').value || todayISO();
  return start <= end ? { start, end } : { start: end, end: start };
}

function previousPeriod(period) {
  const start = parseISO(period.start);
  const end = parseISO(period.end);
  const days = daysBetween(period.start, period.end) + 1;
  return { start: toISO(addDays(start, -days)), end: toISO(addDays(start, -1)) };
}

function eventsBetween(start, end) {
  return state.events.filter((e) => e.date >= start && e.date <= end);
}

function countEvents(events, habitId) {
  return events.filter((e) => e.habit_id === habitId).length;
}

function lastLoggedDate(habitId) {
  const dates = state.events.filter((e) => e.habit_id === habitId).map((e) => e.date).sort();
  return dates.at(-1) || '';
}

function currentNoEventStreak(habitId) {
  let count = 0;
  for (let d = parseISO(todayISO()); ; d = addDays(d, -1)) {
    const iso = toISO(d);
    if (state.events.some((e) => e.habit_id === habitId && e.date === iso)) return count;
    count += 1;
    if (count > 5000) return count;
  }
}

function longestNoEventStreak(habitId, start, end) {
  let best = 0, current = 0;
  for (let d = parseISO(start); toISO(d) <= end; d = addDays(d, 1)) {
    const iso = toISO(d);
    const happened = state.events.some((e) => e.habit_id === habitId && e.date === iso);
    if (happened) current = 0;
    else { current += 1; best = Math.max(best, current); }
  }
  return best;
}

function habitById(id) { return state.habits.find((h) => h.id === id); }
function isActive(habit) { return habit.is_active === true || habit.is_active === 'TRUE' || habit.is_active === 'true'; }
function colorValue(name) { return COLOR_OPTIONS.find((c) => c.name === name)?.value || COLOR_OPTIONS[0].value; }
function groupCount(items, key) { return items.reduce((acc, item) => { acc[item[key]] = (acc[item[key]] || 0) + 1; return acc; }, {}); }
function sortByCreated(a, b) { return String(a.created_at).localeCompare(String(b.created_at)); }
function todayISO() { return toISO(new Date()); }
function toISO(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10); }
function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + months); return startOfMonth(d); }
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function mondayOfWeek(date) { const d = new Date(date); const day = (d.getDay() + 6) % 7; return addDays(d, -day); }
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function formatLongDate(iso) { return parseISO(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function shortDate(iso) { return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function periodLabel(p) { return `${shortDate(p.start)}–${shortDate(p.end)}`; }
function escapeHTML(str = '') { return String(str).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2400); }
