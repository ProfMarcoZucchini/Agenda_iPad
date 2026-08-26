const APP_VERSION = '0.1.9';
const TEST_DB_NAME = 'AgendaIPadInkRobustDB';
const TEST_DB_VERSION = 1;
const TEST_STORE = 'pages';
const PEN_COLOR = '#111111';
const PEN_WIDTH = 2.5;
const SAVE_IDLE_MS = 2400;
const CACHE_PREFIX = 'agenda-ipad-ink-robust-';
const FOOTER_PX = 50;

const paper = document.getElementById('paper');
const header = document.getElementById('pageHeader');
const canvas = document.getElementById('inkCanvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const coldResetButton = document.getElementById('coldResetButton');
const inkOnlyButton = document.getElementById('inkOnlyButton');
const inkStorageButton = document.getElementById('inkStorageButton');
const lagButton = document.getElementById('lagButton');
const reportButton = document.getElementById('reportButton');
const reportPanel = document.getElementById('reportPanel');
const reportText = document.getElementById('reportText');
const copyReportButton = document.getElementById('copyReportButton');
const closeReportButton = document.getElementById('closeReportButton');

let db = null;
let currentDate = localISODate(new Date());
let mode = 'ink-only';
let strokes = [];
let drawing = false;
let pointerId = null;
let rect = null;
let protectedTop = 0;
let lastPoint = null;
let activeStroke = null;
let saveTimer = 0;
let idleHandle = 0;
let dpr = 1;
let resetInProgress = false;
let storageBusy = false;
let rafPrev = performance.now();
let currentStrokeDiag = null;
let completedDiagnostics = [];
let lagMarks = [];
let lastHandlerArrival = 0;

const session = {
  startedAt: new Date().toISOString(),
  totalPointerDown: 0,
  totalPointerUp: 0,
  totalPointerCancel: 0,
  recoveredStaleDown: 0,
  recoveredMoveStart: 0,
  recoveredPointerSwitch: 0,
  strokesCompleted: 0,
  storageWrites: 0,
  storageErrors: 0,
  maxStorageCallMs: 0,
  maxStorageTxMs: 0,
  strokesStartedWhileStorageBusy: 0,
  maxRafGapMs: 0,
  rafGapsOver34: 0,
  rafGapsOver60: 0,
  handlerGapsOver34: 0,
  maxHandlerGapMs: 0
};

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
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TEST_DB_NAME, TEST_DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(TEST_STORE)) database.createObjectStore(TEST_STORE, { keyPath: 'date' });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
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

function setupStrokeStyle(stroke) {
  ctx.strokeStyle = stroke.color ?? PEN_COLOR;
  ctx.fillStyle = stroke.color ?? PEN_COLOR;
  ctx.globalAlpha = stroke.opacity ?? 1;
  ctx.lineWidth = stroke.width ?? PEN_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function cssPoint(point) {
  return { x: point.x * canvas.clientWidth, y: point.y * canvas.clientHeight };
}

function drawStoredStroke(stroke) {
  const points = stroke?.points ?? [];
  if (!points.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, canvas.clientWidth, Math.max(0, canvas.clientHeight - protectedTop - FOOTER_PX));
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
  rect = canvas.getBoundingClientRect();
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
  return y >= protectedTop && y <= rect.height - FOOTER_PX;
}

function pointInsideWritableArea(ev) {
  if (!rect) rect = canvas.getBoundingClientRect();
  return ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top + protectedTop && ev.clientY <= rect.bottom - FOOTER_PX;
}

function noteHandlerArrival() {
  const now = performance.now();
  if (drawing && lastHandlerArrival) {
    const gap = now - lastHandlerArrival;
    if (gap > session.maxHandlerGapMs) session.maxHandlerGapMs = gap;
    if (gap > 34) session.handlerGapsOver34++;
    if (currentStrokeDiag && gap > currentStrokeDiag.maxHandlerGapMs) currentStrokeDiag.maxHandlerGapMs = gap;
  }
  lastHandlerArrival = now;
}

function noteSampleGap(point) {
  if (!currentStrokeDiag) return;
  const prev = currentStrokeDiag.lastSampleTs;
  if (Number.isFinite(prev) && Number.isFinite(point.t)) {
    const gap = Math.max(0, point.t - prev);
    currentStrokeDiag.maxSampleGapMs = Math.max(currentStrokeDiag.maxSampleGapMs, gap);
    if (gap > 24) currentStrokeDiag.sampleGapsOver24++;
    if (gap > 40) currentStrokeDiag.sampleGapsOver40++;
    if (gap > 80) currentStrokeDiag.sampleGapsOver80++;
  }
  currentStrokeDiag.lastSampleTs = point.t;
}

function drawDot(point) {
  if (!pointAllowed(point)) return;
  const p = pointToCss(point);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, rect.width, Math.max(0, rect.height - protectedTop - FOOTER_PX));
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
  const drawStart = performance.now();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, rect.width, Math.max(0, rect.height - protectedTop - FOOTER_PX));
  ctx.clip();
  ctx.strokeStyle = PEN_COLOR;
  ctx.globalAlpha = 1;
  ctx.lineWidth = PEN_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const lp = pointToCss(lastPoint);
  ctx.moveTo(lp.x, lp.y);
  let accepted = 0;
  for (const sample of events) {
    if (sample.pointerId !== pointerId) continue;
    const point = normalizeEvent(sample);
    noteSampleGap(point);
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
  if (currentStrokeDiag) {
    currentStrokeDiag.samples += accepted;
    currentStrokeDiag.batches++;
    const drawMs = performance.now() - drawStart;
    currentStrokeDiag.maxDrawBatchMs = Math.max(currentStrokeDiag.maxDrawBatchMs, drawMs);
  }
}

function cancelPendingSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (idleHandle && 'cancelIdleCallback' in window) cancelIdleCallback(idleHandle);
  idleHandle = 0;
}

async function persistNow() {
  if (mode !== 'ink-storage' || resetInProgress || drawing) return;
  try {
    await openTestDb();
    const snapshot = strokes;
    const txStart = performance.now();
    storageBusy = true;
    const putStart = performance.now();
    const promise = putRecord({
      date: currentDate,
      kind: 'ink-robust',
      version: APP_VERSION,
      pipeline: 'coalesced-retina',
      strokes: snapshot,
      modifiedAt: new Date().toISOString()
    });
    const putCallMs = performance.now() - putStart;
    session.maxStorageCallMs = Math.max(session.maxStorageCallMs, putCallMs);
    await promise;
    session.maxStorageTxMs = Math.max(session.maxStorageTxMs, performance.now() - txStart);
    session.storageWrites++;
  } catch (err) {
    session.storageErrors++;
    console.warn('Persistenza diagnostica non riuscita', err);
  } finally {
    storageBusy = false;
  }
}

function scheduleSave() {
  if (mode !== 'ink-storage' || resetInProgress) return;
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

function newStrokeDiag(ev, reason) {
  return {
    id: makeId(),
    reason,
    startedAt: performance.now(),
    pointerId: ev.pointerId,
    pointerType: ev.pointerType,
    samples: 1,
    batches: 0,
    maxSampleGapMs: 0,
    sampleGapsOver24: 0,
    sampleGapsOver40: 0,
    sampleGapsOver80: 0,
    maxHandlerGapMs: 0,
    maxDrawBatchMs: 0,
    maxRafGapMs: 0,
    endedBy: '',
    durationMs: 0,
    points: 1
  };
}

function startStroke(ev, reason = 'pointerdown') {
  if (resetInProgress) return false;
  if (ev.pointerType === 'touch') return false;
  if (ev.pointerType === 'mouse' && ev.button !== 0 && reason === 'pointerdown') return false;
  if (!pointInsideWritableArea(ev)) return false;

  if (drawing) {
    session.recoveredStaleDown++;
    finalizeStroke('stale-recovered-before-new-start');
  }

  cancelPendingSave();
  if (storageBusy) session.strokesStartedWhileStorageBusy++;
  drawing = true;
  pointerId = ev.pointerId;
  rect = canvas.getBoundingClientRect();
  const point = normalizeEvent(ev);
  if (!pointAllowed(point)) {
    drawing = false;
    pointerId = null;
    return false;
  }
  lastPoint = point;
  activeStroke = {
    id: makeId(),
    tool: 'pen',
    color: PEN_COLOR,
    width: PEN_WIDTH,
    opacity: 1,
    pointerType: ev.pointerType,
    points: [point]
  };
  currentStrokeDiag = newStrokeDiag(ev, reason);
  currentStrokeDiag.lastSampleTs = point.t;
  lastHandlerArrival = performance.now();
  drawDot(point);
  return true;
}

function finalizeStroke(reason = 'pointerup') {
  if (!drawing) return;
  drawing = false;
  if (activeStroke?.points?.length) strokes.push(activeStroke);
  if (currentStrokeDiag) {
    currentStrokeDiag.endedBy = reason;
    currentStrokeDiag.durationMs = performance.now() - currentStrokeDiag.startedAt;
    currentStrokeDiag.points = activeStroke?.points?.length ?? 0;
    delete currentStrokeDiag.lastSampleTs;
    completedDiagnostics.push(currentStrokeDiag);
    if (completedDiagnostics.length > 120) completedDiagnostics.shift();
    session.strokesCompleted++;
  }
  activeStroke = null;
  currentStrokeDiag = null;
  pointerId = null;
  lastPoint = null;
  lastHandlerArrival = 0;
  scheduleSave();
}

function handlePointerDown(ev) {
  if (ev.pointerType === 'touch') return;
  session.totalPointerDown++;
  noteHandlerArrival();
  if (startStroke(ev, 'pointerdown')) ev.preventDefault();
}

function handlePointerMove(ev) {
  if (ev.pointerType === 'touch') return;
  noteHandlerArrival();

  const penIsDown = ev.pointerType === 'pen' && (ev.pressure > 0 || (ev.buttons & 1) === 1);
  const mouseIsDown = ev.pointerType === 'mouse' && (ev.buttons & 1) === 1;

  if (!drawing) {
    if ((penIsDown || mouseIsDown) && pointInsideWritableArea(ev)) {
      session.recoveredMoveStart++;
      if (startStroke(ev, 'recovered-from-move')) ev.preventDefault();
    }
    return;
  }

  if (ev.pointerId !== pointerId) {
    if (penIsDown && pointInsideWritableArea(ev)) {
      session.recoveredPointerSwitch++;
      finalizeStroke('pointer-switch-recovery');
      if (startStroke(ev, 'recovered-pointer-switch')) ev.preventDefault();
    }
    return;
  }

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

function handlePointerUp(ev) {
  if (ev.pointerType === 'touch') return;
  session.totalPointerUp++;
  noteHandlerArrival();
  if (!drawing) return;
  if (ev.pointerId !== pointerId) return;
  finalizeStroke('pointerup');
  ev.preventDefault();
}

function handlePointerCancel(ev) {
  if (ev.pointerType === 'touch') return;
  session.totalPointerCancel++;
  noteHandlerArrival();
  if (!drawing) return;
  if (ev.pointerId !== pointerId) return;
  finalizeStroke('pointercancel');
  ev.preventDefault();
}

function setMode(nextMode) {
  if (drawing || resetInProgress) return;
  mode = nextMode;
  cancelPendingSave();
  inkOnlyButton.classList.toggle('active', mode === 'ink-only');
  inkStorageButton.classList.toggle('active', mode === 'ink-storage');
  if (mode === 'ink-storage') openTestDb().catch(() => {});
}

function markLag() {
  if (drawing) finalizeStroke('manual-lag-mark');
  lagMarks.push({
    at: new Date().toISOString(),
    mode,
    strokeIndex: completedDiagnostics.length,
    recent: completedDiagnostics.slice(-4)
  });
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function buildReport() {
  const recent = completedDiagnostics.slice(-20);
  const lines = [
    `Agenda iPad INK ROBUST v${APP_VERSION}`,
    `Sessione: ${session.startedAt}`,
    `Modalità attuale: ${mode === 'ink-storage' ? 'INK + STORAGE' : 'INK ONLY'}`,
    `DPR canvas: ${fmt(dpr, 2)}`,
    `Tratti completati: ${session.strokesCompleted}`,
    `pointerdown/up/cancel: ${session.totalPointerDown}/${session.totalPointerUp}/${session.totalPointerCancel}`,
    `Recovery stale-down: ${session.recoveredStaleDown}`,
    `Recovery da pointermove: ${session.recoveredMoveStart}`,
    `Recovery cambio pointerId: ${session.recoveredPointerSwitch}`,
    `Max gap handler: ${fmt(session.maxHandlerGapMs)} ms (>${34} ms: ${session.handlerGapsOver34})`,
    `Max gap RAF: ${fmt(session.maxRafGapMs)} ms (>34: ${session.rafGapsOver34}, >60: ${session.rafGapsOver60})`,
    `Storage writes/errori: ${session.storageWrites}/${session.storageErrors}`,
    `Max put() call: ${fmt(session.maxStorageCallMs)} ms`,
    `Max transazione storage: ${fmt(session.maxStorageTxMs)} ms`,
    `Tratti iniziati mentre storage busy: ${session.strokesStartedWhileStorageBusy}`,
    `Lag segnalati manualmente: ${lagMarks.length}`,
    '',
    'ULTIMI TRATTI:',
    ...recent.map((d, i) => {
      const n = completedDiagnostics.length - recent.length + i + 1;
      return `#${n} ${d.reason}->${d.endedBy} dur=${fmt(d.durationMs)}ms punti=${d.points} campioni=${d.samples} maxSampleGap=${fmt(d.maxSampleGapMs)}ms >24/40/80=${d.sampleGapsOver24}/${d.sampleGapsOver40}/${d.sampleGapsOver80} maxHandler=${fmt(d.maxHandlerGapMs)}ms maxRAF=${fmt(d.maxRafGapMs)}ms drawMax=${fmt(d.maxDrawBatchMs, 2)}ms`;
    }),
    '',
    'LAG SEGNALATI:',
    ...(lagMarks.length ? lagMarks.map((m, i) => `L${i + 1} ${m.at} ${m.mode} dopo tratto #${m.strokeIndex}`) : ['nessuno'])
  ];
  return lines.join('\n');
}

function showReport() {
  reportText.value = buildReport();
  reportPanel.hidden = false;
}

async function copyReport() {
  const text = buildReport();
  reportText.value = text;
  try {
    await navigator.clipboard.writeText(text);
    copyReportButton.textContent = 'COPIATO';
    setTimeout(() => { copyReportButton.textContent = 'COPIA REPORT'; }, 1200);
  } catch {
    reportText.focus();
    reportText.select();
  }
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

async function clearRobustCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
}

async function unregisterCurrentServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const scope = new URL('./', window.location.href).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter((registration) => registration.scope === scope).map((registration) => registration.unregister()));
}

async function resetAsFirstRun() {
  if (resetInProgress) return;
  resetInProgress = true;
  cancelPendingSave();
  finalizeStroke('cold-reset');
  strokes = [];
  completedDiagnostics = [];
  lagMarks = [];
  renderAll();
  coldResetButton.disabled = true;
  coldResetButton.textContent = 'RESET…';
  try {
    await deleteTestDatabase();
    await clearRobustCaches();
    await unregisterCurrentServiceWorker();
    const freshUrl = new URL(window.location.href);
    freshUrl.searchParams.set('coldstart', String(Date.now()));
    window.location.replace(freshUrl.href);
  } catch (err) {
    console.error('Reset da zero non riuscito', err);
    resetInProgress = false;
    coldResetButton.disabled = false;
    coldResetButton.textContent = 'RIPROVA RESET';
  }
}

function rafWatchdog(now) {
  const gap = now - rafPrev;
  rafPrev = now;
  if (drawing) {
    session.maxRafGapMs = Math.max(session.maxRafGapMs, gap);
    if (gap > 34) session.rafGapsOver34++;
    if (gap > 60) session.rafGapsOver60++;
    if (currentStrokeDiag) currentStrokeDiag.maxRafGapMs = Math.max(currentStrokeDiag.maxRafGapMs, gap);
  }
  requestAnimationFrame(rafWatchdog);
}

window.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
window.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
window.addEventListener('pointerup', handlePointerUp, { passive: false, capture: true });
window.addEventListener('pointercancel', handlePointerCancel, { passive: false, capture: true });

inkOnlyButton.addEventListener('click', () => setMode('ink-only'));
inkStorageButton.addEventListener('click', () => setMode('ink-storage'));
lagButton.addEventListener('click', markLag);
reportButton.addEventListener('click', showReport);
copyReportButton.addEventListener('click', copyReport);
closeReportButton.addEventListener('click', () => { reportPanel.hidden = true; });
coldResetButton.addEventListener('click', resetAsFirstRun);

document.addEventListener('touchmove', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gestureend', (ev) => ev.preventDefault(), { passive: false });

window.addEventListener('resize', () => {
  if (drawing) return;
  resizeCanvas();
});

window.addEventListener('blur', () => {
  if (drawing) finalizeStroke('window-blur');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (drawing) finalizeStroke('visibility-hidden');
    if (mode === 'ink-storage' && !resetInProgress) persistNow();
  }
});

window.addEventListener('pagehide', () => {
  if (drawing) finalizeStroke('pagehide');
  if (mode === 'ink-storage' && !resetInProgress) persistNow();
});

async function boot() {
  if (window.location.search.includes('coldstart=')) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  }
  updateHeader();
  resizeCanvas();
  setMode('ink-only');
  requestAnimationFrame(rafWatchdog);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
  }
}

boot();
console.info(`Agenda iPad Ink Robust ${APP_VERSION} · Coalesced + Retina · global pointer recovery`);
