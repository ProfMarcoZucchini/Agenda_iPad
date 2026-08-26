const APP_VERSION = '0.1.8';
const TEST_DB_NAME = 'AgendaIPadInkBaselineDB';
const TEST_DB_VERSION = 1;
const TEST_STORE = 'pages';
const PEN_COLOR = '#111111';
const PEN_WIDTH = 2.5;
const SAVE_IDLE_MS = 2200;
const BASELINE_CACHE_PREFIX = 'agenda-ipad-ink-baseline-';

const paper = document.getElementById('paper');
const header = document.getElementById('pageHeader');
const canvas = document.getElementById('inkCanvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const coldResetButton = document.getElementById('coldResetButton');

let db = null;
let currentDate = localISODate(new Date());
let strokes = [];
let drawing = false;
let pointerId = null;
let pointerType = null;
let rect = null;
let protectedTop = 0;
let lastPoint = null;
let activeStroke = null;
let saveTimer = 0;
let idleHandle = 0;
let dpr = 1;
let resetInProgress = false;

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return `stroke-${crypto.randomUUID()}`;
  return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateHeader() {
  const d = new Date(`${currentDate}T12:00:00`);
  const dayName = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(d).toLocaleUpperCase('it-IT');
  const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(d);
  document.getElementById('dayNumber').textContent = String(d.getDate());
  document.getElementById('dayName').textContent = dayName;
  document.getElementById('monthName').textContent = monthName;
  document.getElementById('yearLabel').textContent = String(d.getFullYear());
}

function openTestDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TEST_DB_NAME, TEST_DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(TEST_STORE)) database.createObjectStore(TEST_STORE, { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function loadRecord(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEST_STORE, 'readonly');
    const req = tx.objectStore(TEST_STORE).get(date);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function putRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEST_STORE, 'readwrite');
    tx.objectStore(TEST_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function cssPoint(point) {
  return { x: point.x * canvas.clientWidth, y: point.y * canvas.clientHeight };
}

function setupStrokeStyle(stroke) {
  ctx.strokeStyle = stroke.color ?? PEN_COLOR;
  ctx.fillStyle = stroke.color ?? PEN_COLOR;
  ctx.globalAlpha = stroke.opacity ?? 1;
  ctx.lineWidth = stroke.width ?? PEN_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawStoredStroke(stroke) {
  const points = stroke?.points ?? [];
  if (!points.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, canvas.clientWidth, Math.max(0, canvas.clientHeight - protectedTop - 34));
  ctx.clip();
  setupStrokeStyle(stroke);
  if (points.length === 1) {
    const p = cssPoint(points[0]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(.7, (stroke.width ?? PEN_WIDTH) / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  let p = cssPoint(points[0]);
  ctx.moveTo(p.x, p.y);
  for (let i = 1; i < points.length; i++) {
    p = cssPoint(points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function renderAll() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const stroke of strokes) drawStoredStroke(stroke);
}

function resizeCanvas() {
  const r = paper.getBoundingClientRect();
  const hr = header.getBoundingClientRect();
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  protectedTop = Math.max(0, Math.min(r.height, hr.bottom - r.top));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderAll();
}

function normalizeEvent(ev) {
  return {
    x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
    p: ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5,
    t: Number.isFinite(ev.timeStamp) ? ev.timeStamp : performance.now()
  };
}

function pointToCss(point) {
  return { x: point.x * rect.width, y: point.y * rect.height };
}

function pointAllowed(point) {
  const y = point.y * rect.height;
  return y >= protectedTop && y <= rect.height - 34;
}

function drawDot(point) {
  if (!pointAllowed(point)) return;
  const p = pointToCss(point);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, rect.width, Math.max(0, rect.height - protectedTop - 34));
  ctx.clip();
  ctx.fillStyle = PEN_COLOR;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(.7, PEN_WIDTH / 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBatch(events) {
  if (!drawing || !activeStroke || !events.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, rect.width, Math.max(0, rect.height - protectedTop - 34));
  ctx.clip();
  ctx.strokeStyle = PEN_COLOR;
  ctx.globalAlpha = 1;
  ctx.lineWidth = PEN_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let lp = pointToCss(lastPoint);
  ctx.moveTo(lp.x, lp.y);
  let accepted = 0;
  for (const sample of events) {
    if (sample.pointerId !== pointerId) continue;
    const point = normalizeEvent(sample);
    if (!pointAllowed(point)) continue;
    const dx = (point.x - lastPoint.x) * rect.width;
    const dy = (point.y - lastPoint.y) * rect.height;
    if ((dx * dx + dy * dy) < 0.01) continue;
    const cp = pointToCss(point);
    ctx.lineTo(cp.x, cp.y);
    activeStroke.points.push(point);
    lastPoint = point;
    accepted++;
  }
  if (accepted) ctx.stroke();
  ctx.restore();
}

function cancelPendingSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (idleHandle && 'cancelIdleCallback' in window) cancelIdleCallback(idleHandle);
  idleHandle = 0;
}

async function persistNow() {
  if (resetInProgress) return;
  if (!db || drawing) return scheduleSave();
  try {
    await putRecord({
      date: currentDate,
      kind: 'ink-baseline',
      version: APP_VERSION,
      pipeline: 'coalesced-retina',
      strokes,
      modifiedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Persistenza baseline non riuscita', err);
  }
}

function scheduleSave() {
  if (resetInProgress) return;
  cancelPendingSave();
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    const task = () => {
      idleHandle = 0;
      if (drawing) return scheduleSave();
      persistNow();
    };
    if ('requestIdleCallback' in window) idleHandle = requestIdleCallback(task, { timeout: 1800 });
    else task();
  }, SAVE_IDLE_MS);
}

function beginStroke(ev) {
  if (resetInProgress) return;
  if (ev.pointerType === 'touch') return;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  if (drawing) return;
  rect = canvas.getBoundingClientRect();
  const point = normalizeEvent(ev);
  if (!pointAllowed(point)) return;
  cancelPendingSave();
  drawing = true;
  pointerId = ev.pointerId;
  pointerType = ev.pointerType;
  lastPoint = point;
  activeStroke = {
    id: makeId(),
    tool: 'pen',
    color: PEN_COLOR,
    width: PEN_WIDTH,
    opacity: 1,
    pointerType,
    points: [point]
  };
  drawDot(point);
  ev.preventDefault();
}

function moveStroke(ev) {
  if (!drawing || ev.pointerId !== pointerId) return;
  let events = [ev];
  if (typeof ev.getCoalescedEvents === 'function') {
    try {
      const coalesced = ev.getCoalescedEvents();
      if (coalesced?.length) events = coalesced;
    } catch {}
  }
  drawBatch(events);
  ev.preventDefault();
}

function endStroke(ev) {
  if (!drawing || ev.pointerId !== pointerId) return;
  drawing = false;
  if (activeStroke?.points?.length) strokes.push(activeStroke);
  activeStroke = null;
  pointerId = null;
  pointerType = null;
  rect = null;
  lastPoint = null;
  scheduleSave();
  ev.preventDefault();
}


function deleteTestDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      try { db.close(); } catch {}
      db = null;
    }
    const req = indexedDB.deleteDatabase(TEST_DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error('Cancellazione IndexedDB non riuscita'));
    req.onblocked = () => reject(new Error('Database bloccato da un’altra istanza dell’app'));
  });
}

async function clearBaselineCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith(BASELINE_CACHE_PREFIX))
    .map((key) => caches.delete(key)));
}

async function unregisterCurrentServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const scope = new URL('./', window.location.href).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations
    .filter((registration) => registration.scope === scope)
    .map((registration) => registration.unregister()));
}

async function resetAsFirstRun() {
  if (resetInProgress) return;
  resetInProgress = true;
  cancelPendingSave();
  drawing = false;
  activeStroke = null;
  pointerId = null;
  pointerType = null;
  rect = null;
  lastPoint = null;
  strokes = [];
  renderAll();

  if (coldResetButton) {
    coldResetButton.disabled = true;
    coldResetButton.textContent = 'RESET…';
  }

  try {
    // Reset volutamente limitato alla build diagnostica: il database AgendaIPadDB
    // della versione completa non viene aperto né cancellato.
    await deleteTestDatabase();
    await clearBaselineCaches();
    await unregisterCurrentServiceWorker();

    const freshUrl = new URL(window.location.href);
    freshUrl.searchParams.set('coldstart', String(Date.now()));
    window.location.replace(freshUrl.href);
  } catch (err) {
    console.error('Reset da zero non riuscito', err);
    resetInProgress = false;
    if (coldResetButton) {
      coldResetButton.disabled = false;
      coldResetButton.textContent = 'RIPROVA RESET';
    }
  }
}

canvas.addEventListener('pointerdown', beginStroke, { passive: false });
canvas.addEventListener('pointermove', moveStroke, { passive: false });
if (coldResetButton) coldResetButton.addEventListener('click', resetAsFirstRun);
window.addEventListener('pointerup', endStroke, { passive: false, capture: true });
window.addEventListener('pointercancel', endStroke, { passive: false, capture: true });

document.addEventListener('touchmove', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gestureend', (ev) => ev.preventDefault(), { passive: false });

window.addEventListener('resize', () => {
  if (drawing) return;
  resizeCanvas();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !drawing && !resetInProgress) persistNow();
});
window.addEventListener('pagehide', () => {
  if (!drawing && !resetInProgress) persistNow();
});

async function boot() {
  if (window.location.search.includes('coldstart=')) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  }
  updateHeader();
  resizeCanvas();
  try {
    db = await openTestDb();
    const record = await loadRecord(currentDate);
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    renderAll();
  } catch (err) {
    console.warn('Baseline avviata senza persistenza', err);
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
  }
}

boot();
console.info(`Agenda iPad Ink Baseline ${APP_VERSION} RESET TEST · Coalesced + Retina`);
