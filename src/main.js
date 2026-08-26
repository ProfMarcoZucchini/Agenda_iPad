const APP_VERSION = '0.1.10';
const DB_NAME = 'AgendaIPadReintegrationDB';
const DB_VERSION = 1;
const STORE = 'pages';
const PEN_COLOR = '#111111';
const PEN_WIDTH = 2.5;
const SAVE_IDLE_MS = 2400;
const FOOTER_PX = 46;

const paper = document.getElementById('paper');
const header = document.getElementById('pageHeader');
const canvas = document.getElementById('inkCanvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const versionButton = document.getElementById('versionButton');
const statusLabel = document.getElementById('statusLabel');
const reportPanel = document.getElementById('reportPanel');
const reportText = document.getElementById('reportText');
const copyReportButton = document.getElementById('copyReportButton');
const closeReportButton = document.getElementById('closeReportButton');
const markLagButton = document.getElementById('markLagButton');
const clearPageButton = document.getElementById('clearPageButton');

let db = null;
let currentDate = localISODate(new Date());
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
let storageBusy = false;
let ready = false;
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
  storageReads: 0,
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

function openDb() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'date' });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function getRecord(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(date);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function putRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transazione IndexedDB annullata'));
  });
}

function deleteRecord(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(date);
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
  if (!ready || drawing) return;
  try {
    await openDb();
    const snapshot = strokes;
    const txStart = performance.now();
    storageBusy = true;
    const putStart = performance.now();
    const promise = putRecord({
      date: currentDate,
      kind: 'agenda-day-ink',
      version: APP_VERSION,
      pipeline: 'coalesced-retina-storage',
      strokes: snapshot,
      modifiedAt: new Date().toISOString()
    });
    const putCallMs = performance.now() - putStart;
    session.maxStorageCallMs = Math.max(session.maxStorageCallMs, putCallMs);
    await promise;
    session.maxStorageTxMs = Math.max(session.maxStorageTxMs, performance.now() - txStart);
    session.storageWrites++;
    statusLabel.textContent = 'salvato';
  } catch (err) {
    session.storageErrors++;
    statusLabel.textContent = 'errore salvataggio';
    console.warn('Persistenza reintegrazione non riuscita', err);
  } finally {
    storageBusy = false;
  }
}

function scheduleSave() {
  if (!ready) return;
  cancelPendingSave();
  statusLabel.textContent = 'da salvare';
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
    id: makeId(), reason, startedAt: performance.now(), pointerId: ev.pointerId, pointerType: ev.pointerType,
    samples: 1, batches: 0, maxSampleGapMs: 0, sampleGapsOver24: 0, sampleGapsOver40: 0,
    sampleGapsOver80: 0, maxHandlerGapMs: 0, maxDrawBatchMs: 0, maxRafGapMs: 0,
    endedBy: '', durationMs: 0, points: 1
  };
}

function startStroke(ev, reason = 'pointerdown') {
  if (!ready) return false;
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
    id: makeId(), tool: 'pen', color: PEN_COLOR, width: PEN_WIDTH, opacity: 1,
    pointerType: ev.pointerType, points: [point]
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
    if (completedDiagnostics.length > 160) completedDiagnostics.shift();
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
  if (!drawing || ev.pointerId !== pointerId) return;
  finalizeStroke('pointerup');
  ev.preventDefault();
}

function handlePointerCancel(ev) {
  if (ev.pointerType === 'touch') return;
  session.totalPointerCancel++;
  noteHandlerArrival();
  if (!drawing || ev.pointerId !== pointerId) return;
  finalizeStroke('pointercancel');
  ev.preventDefault();
}

function markLag() {
  if (drawing) finalizeStroke('manual-lag-mark');
  lagMarks.push({ at: new Date().toISOString(), strokeIndex: completedDiagnostics.length, recent: completedDiagnostics.slice(-4) });
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function buildReport() {
  const recent = completedDiagnostics.slice(-24);
  return [
    `Agenda iPad REINTEGRATION v${APP_VERSION}`,
    `Data pagina: ${currentDate}`,
    `Sessione: ${session.startedAt}`,
    `Pipeline: Coalesced + Retina + Storage differito`,
    `DPR canvas: ${fmt(dpr, 2)}`,
    `Tratti pagina: ${strokes.length}`,
    `Tratti completati sessione: ${session.strokesCompleted}`,
    `pointerdown/up/cancel: ${session.totalPointerDown}/${session.totalPointerUp}/${session.totalPointerCancel}`,
    `Recovery stale-down: ${session.recoveredStaleDown}`,
    `Recovery da pointermove: ${session.recoveredMoveStart}`,
    `Recovery cambio pointerId: ${session.recoveredPointerSwitch}`,
    `Max gap handler: ${fmt(session.maxHandlerGapMs)} ms (>34 ms: ${session.handlerGapsOver34})`,
    `Max gap RAF: ${fmt(session.maxRafGapMs)} ms (>34: ${session.rafGapsOver34}, >60: ${session.rafGapsOver60})`,
    `Storage read/write/errori: ${session.storageReads}/${session.storageWrites}/${session.storageErrors}`,
    `Max put() call: ${fmt(session.maxStorageCallMs)} ms`,
    `Max transazione storage: ${fmt(session.maxStorageTxMs)} ms`,
    `Tratti iniziati mentre storage busy: ${session.strokesStartedWhileStorageBusy}`,
    `Lag segnalati: ${lagMarks.length}`,
    '',
    'ULTIMI TRATTI:',
    ...recent.map((d, i) => {
      const n = completedDiagnostics.length - recent.length + i + 1;
      return `#${n} ${d.reason}->${d.endedBy} dur=${fmt(d.durationMs)}ms punti=${d.points} campioni=${d.samples} maxSampleGap=${fmt(d.maxSampleGapMs)}ms >24/40/80=${d.sampleGapsOver24}/${d.sampleGapsOver40}/${d.sampleGapsOver80} maxHandler=${fmt(d.maxHandlerGapMs)}ms maxRAF=${fmt(d.maxRafGapMs)}ms drawMax=${fmt(d.maxDrawBatchMs, 2)}ms`;
    }),
    '',
    'LAG SEGNALATI:',
    ...(lagMarks.length ? lagMarks.map((m, i) => `L${i + 1} ${m.at} dopo tratto #${m.strokeIndex}`) : ['nessuno'])
  ].join('\n');
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

async function clearCurrentPage() {
  if (drawing || !ready) return;
  if (!window.confirm('Cancellare soltanto la pagina di test di oggi?')) return;
  cancelPendingSave();
  strokes = [];
  renderAll();
  try {
    await openDb();
    await deleteRecord(currentDate);
    statusLabel.textContent = 'pagina vuota';
  } catch (err) {
    statusLabel.textContent = 'errore cancellazione';
    console.warn(err);
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

document.addEventListener('touchmove', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gestureend', (ev) => ev.preventDefault(), { passive: false });

versionButton.addEventListener('click', showReport);
markLagButton.addEventListener('click', markLag);
copyReportButton.addEventListener('click', copyReport);
closeReportButton.addEventListener('click', () => { reportPanel.hidden = true; });
clearPageButton.addEventListener('click', clearCurrentPage);

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
    if (ready) persistNow();
  }
});

window.addEventListener('pagehide', () => {
  if (drawing) finalizeStroke('pagehide');
  if (ready) persistNow();
});

async function loadToday() {
  statusLabel.textContent = 'caricamento';
  try {
    await openDb();
    const record = await getRecord(currentDate);
    session.storageReads++;
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    renderAll();
    statusLabel.textContent = strokes.length ? 'pagina caricata' : 'pagina nuova';
  } catch (err) {
    session.storageErrors++;
    strokes = [];
    renderAll();
    statusLabel.textContent = 'storage non disponibile';
    console.warn('Caricamento pagina non riuscito', err);
  }
}

async function boot() {
  updateHeader();
  resizeCanvas();
  requestAnimationFrame(rafWatchdog);
  await loadToday();
  ready = true;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
console.info(`Agenda iPad ${APP_VERSION} · reintegrazione 1 · Coalesced + Retina + storage differito`);
