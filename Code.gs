/**
 * Rare Yes Tracker backend for Google Sheets + Google Apps Script Web App.
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * API uses action names because Apps Script Web Apps expose doGet/doPost, not true HTTP PATCH/DELETE handlers.
 */

const SHEETS = {
  habits: 'habits',
  events: 'events'
};

const HEADERS = {
  habits: ['id', 'name', 'color_name', 'color_value', 'is_active', 'created_at', 'archived_at'],
  events: ['id', 'date', 'habit_id', 'comment', 'created_at', 'updated_at', 'deleted_at']
};

const DEFAULT_HABITS = [
  ['☕ Coffee', 'brown', '#9A6B4F'],
  ['🍷 Alcohol', 'red', '#D8665B'],
  ['🥴 Got drunk', 'purple', '#9B74D1'],
  ['⚡ Episode', 'blue', '#5E8DD6'],
  ['🪫 No-energy day', 'gray', '#7D848C'],
  ['🍽️ Heavy overeating', 'orange', '#D68B45']
];

function doGet(e) {
  try {
    setup_();
    const action = String(e.parameter.action || '').toUpperCase();
    if (action === 'GET_HABITS') return json_({ ok: true, habits: getRows_(SHEETS.habits) });
    if (action === 'GET_EVENTS') return json_({ ok: true, events: getRows_(SHEETS.events) });
    if (action === 'HEALTH') return json_({ ok: true, status: 'ready' });
    return json_({ ok: false, error: 'Unknown GET action.' });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    setup_();
    const body = parseBody_(e);
    const action = String(body.action || '').toUpperCase();

    if (action === 'POST_EVENT') return json_({ ok: true, event: postEvent_(body) });
    if (action === 'PATCH_EVENT') return json_({ ok: true, event: patchEvent_(body) });
    if (action === 'DELETE_EVENT') return json_({ ok: true, event: softDeleteEvent_(body.id) });

    if (action === 'POST_HABIT') return json_({ ok: true, habit: postHabit_(body) });
    if (action === 'PATCH_HABIT') return json_({ ok: true, habit: patchHabit_(body) });
    if (action === 'ARCHIVE_HABIT') return json_({ ok: true, habit: archiveHabit_(body.id) });
    if (action === 'RESTORE_HABIT') return json_({ ok: true, habit: restoreHabit_(body.id) });

    return json_({ ok: false, error: 'Unknown POST action.' });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function setup() {
  setup_(true);
}

function setup_(force) {
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('RARE_YES_SETUP_DONE') === 'true') return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.habits, HEADERS.habits);
  ensureSheet_(ss, SHEETS.events, HEADERS.events);
  seedHabitsIfEmpty_();
  props.setProperty('RARE_YES_SETUP_DONE', 'true');
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = headers.some((h, i) => firstRow[i] !== h);
  if (needsHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function seedHabitsIfEmpty_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.habits);
  if (sheet.getLastRow() > 1) return;
  const now = now_();
  const rows = DEFAULT_HABITS.map(([name, colorName, colorValue]) => [uuid_(), name, colorName, colorValue, true, now, '']);
  sheet.getRange(2, 1, rows.length, HEADERS.habits.length).setValues(rows);
}

function parseBody_(e) {
  if (e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  return e.parameter || {};
}

function getRows_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(cell => cell !== '')).map(row => {
    const obj = {};
    headers.forEach((header, i) => obj[header] = normalizeCell_(row[i]));
    return obj;
  });
}

function normalizeCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value;
}

function postEvent_(body) {
  require_(body.date, 'date is required');
  require_(body.habit_id, 'habit_id is required');
  const habit = findById_(SHEETS.habits, body.habit_id);
  if (!habit) throw new Error('Habit not found.');
  const now = now_();
  const row = {
    id: uuid_(),
    date: body.date,
    habit_id: body.habit_id,
    comment: body.comment || '',
    created_at: now,
    updated_at: now,
    deleted_at: ''
  };
  appendObject_(SHEETS.events, HEADERS.events, row);
  return row;
}

function patchEvent_(body) {
  require_(body.id, 'id is required');
  const found = findRow_(SHEETS.events, body.id);
  if (!found) throw new Error('Event not found.');
  const current = rowToObject_(SHEETS.events, found.rowValues);
  if (current.deleted_at) throw new Error('Deleted events cannot be edited.');
  const next = Object.assign({}, current, {
    date: body.date || current.date,
    comment: body.comment === undefined ? current.comment : body.comment,
    updated_at: now_()
  });
  writeObjectToRow_(SHEETS.events, found.rowNumber, HEADERS.events, next);
  return next;
}

function softDeleteEvent_(id) {
  require_(id, 'id is required');
  const found = findRow_(SHEETS.events, id);
  if (!found) throw new Error('Event not found.');
  const current = rowToObject_(SHEETS.events, found.rowValues);
  const now = now_();
  const next = Object.assign({}, current, { updated_at: now, deleted_at: now });
  writeObjectToRow_(SHEETS.events, found.rowNumber, HEADERS.events, next);
  return next;
}

function postHabit_(body) {
  require_(body.name, 'name is required');
  const now = now_();
  const colorName = body.color_name || 'brown';
  const row = {
    id: uuid_(),
    name: body.name,
    color_name: colorName,
    color_value: body.color_value || colorValue_(colorName),
    is_active: true,
    created_at: now,
    archived_at: ''
  };
  appendObject_(SHEETS.habits, HEADERS.habits, row);
  return row;
}

function patchHabit_(body) {
  require_(body.id, 'id is required');
  const found = findRow_(SHEETS.habits, body.id);
  if (!found) throw new Error('Habit not found.');
  const current = rowToObject_(SHEETS.habits, found.rowValues);
  const colorName = body.color_name || current.color_name || 'brown';
  const next = Object.assign({}, current, {
    name: body.name || current.name,
    color_name: colorName,
    color_value: body.color_value || colorValue_(colorName)
  });
  writeObjectToRow_(SHEETS.habits, found.rowNumber, HEADERS.habits, next);
  return next;
}

function archiveHabit_(id) {
  require_(id, 'id is required');
  const found = findRow_(SHEETS.habits, id);
  if (!found) throw new Error('Habit not found.');
  const current = rowToObject_(SHEETS.habits, found.rowValues);
  const next = Object.assign({}, current, { is_active: false, archived_at: current.archived_at || now_() });
  writeObjectToRow_(SHEETS.habits, found.rowNumber, HEADERS.habits, next);
  return next;
}

function restoreHabit_(id) {
  require_(id, 'id is required');
  const found = findRow_(SHEETS.habits, id);
  if (!found) throw new Error('Habit not found.');
  const current = rowToObject_(SHEETS.habits, found.rowValues);
  const next = Object.assign({}, current, { is_active: true, archived_at: '' });
  writeObjectToRow_(SHEETS.habits, found.rowNumber, HEADERS.habits, next);
  return next;
}

function findById_(sheetName, id) {
  const found = findRow_(sheetName, id);
  return found ? rowToObject_(sheetName, found.rowValues) : null;
}

function findRow_(sheetName, id) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const idIndex = values[0].indexOf('id');
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIndex]) === String(id)) return { rowNumber: r + 1, rowValues: values[r] };
  }
  return null;
}

function rowToObject_(sheetName, row) {
  const headers = HEADERS[sheetName];
  const obj = {};
  headers.forEach((header, i) => obj[header] = normalizeCell_(row[i]));
  return obj;
}

function appendObject_(sheetName, headers, obj) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  sheet.appendRow(headers.map(h => obj[h] === undefined ? '' : obj[h]));
}

function writeObjectToRow_(sheetName, rowNumber, headers, obj) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(h => obj[h] === undefined ? '' : obj[h])]);
}

function now_() {
  return new Date().toISOString();
}

function uuid_() {
  return Utilities.getUuid();
}

function require_(value, message) {
  if (value === undefined || value === null || value === '') throw new Error(message);
}

function colorValue_(name) {
  const map = {
    brown: '#9A6B4F', red: '#D8665B', blue: '#5E8DD6', purple: '#9B74D1', green: '#5EA878',
    orange: '#D68B45', pink: '#D879A6', teal: '#4BA7A1', yellow: '#C9A447', gray: '#7D848C'
  };
  return map[name] || map.brown;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
