const APP_VERSION = '0.1.12';
const DB_NAME = 'AgendaIPadReintegrationDB';
const DB_VERSION = 1;
const STORE = 'pages';
const PEN_COLOR = '#111111';
const PEN_WIDTH = 2.5;
const SAVE_IDLE_MS = 2400;
const FOOTER_PX = 46;
const MIN_DATE = '2026-01-01';
const MAX_DATE = '2028-12-31';
const PAGE_TURN_MS = 280;
const NOTE_TURN_MS = 260;
const NOTES_META_SUFFIX = '::notes-meta';

const stage = document.querySelector('.stage');
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
const baselineLabel = document.querySelector('.baseline-label');

let db = null;
let currentDate = localISODate(new Date());
let currentPageKind = 'agenda';
let currentNoteIndex = 0;
let currentNoteTotal = 0;
const notesCountCache = new Map();
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
let dirty = false;
let pageSwipe = null;
let pageTurning = false;
let previewPage = null;

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
  maxHandlerGapMs: 0,
  pageTurns: 0,
  pageTurnCancels: 0,
  noteTurns: 0,
  notesCreated: 0
};

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return `stroke-${crypto.randomUUID()}`;
  return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setHeaderFor(root, dateString, pageKind = 'agenda', noteIndex = 0, noteTotal = 0) {
  const d = new Date(`${dateString}T12:00:00`);
  const dayName = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(d).toLocaleUpperCase('it-IT');
  const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(d);
  root.querySelector('.day-number').textContent = String(d.getDate());
  root.querySelector('.day-name').textContent = dayName;
  root.querySelector('.month-name').textContent = monthName;
  root.querySelector('.year-label').textContent = String(d.getFullYear());
  const kindLabel = root.querySelector('.page-kind-label');
  const noteCounter = root.querySelector('.note-counter');
  const hours = root.querySelector('.hours');
  if (kindLabel) kindLabel.textContent = pageKind === 'note' ? 'NOTE DEL GIORNO' : '';
  if (noteCounter) noteCounter.textContent = pageKind === 'note' ? `${noteIndex}/${Math.max(noteIndex, noteTotal)}` : '';
  if (hours) hours.hidden = pageKind === 'note';
}

function updateHeader() {
  setHeaderFor(document, currentDate, currentPageKind, currentNoteIndex, currentNoteTotal);
  if (baselineLabel) {
    baselineLabel.textContent = currentPageKind === 'note'
      ? `NOTE DEL GIORNO ${currentNoteIndex}/${Math.max(currentNoteIndex, currentNoteTotal)}`
      : 'AGENDA · INK + PAGE TURN + NOTE';
  }
}

function notesMetaKey(dateString) {
  return `${dateString}${NOTES_META_SUFFIX}`;
}

function noteKey(dateString, noteIndex) {
  return `${dateString}::note::${String(noteIndex).padStart(4, '0')}`;
}

function pageKey(dateString, pageKind = 'agenda', noteIndex = 0) {
  return pageKind === 'note' ? noteKey(dateString, noteIndex) : dateString;
}

function pageDescriptor(dateString = currentDate, pageKind = currentPageKind, noteIndex = currentNoteIndex, noteTotal = currentNoteTotal) {
  return {
    date: dateString,
    kind: pageKind,
    noteIndex: pageKind === 'note' ? noteIndex : 0,
    noteTotal: pageKind === 'note' ? noteTotal : 0,
    key: pageKey(dateString, pageKind, noteIndex),
    createNote: false
  };
}

function currentPageKey() {
  return pageKey(currentDate, currentPageKind, currentNoteIndex);
}

function addDays(dateString, delta) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localISODate(d);
}

function dateInRange(dateString) {
  return dateString >= MIN_DATE && dateString <= MAX_DATE;
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

async function ensureNotesCount(dateString) {
  if (notesCountCache.has(dateString)) return notesCountCache.get(dateString);
  try {
    await openDb();
    const record = await getRecord(notesMetaKey(dateString));
    session.storageReads++;
    const count = Math.max(0, Number(record?.count) || 0);
    notesCountCache.set(dateString, count);
    return count;
  } catch (err) {
    session.storageErrors++;
    console.warn('Conteggio Note del giorno non disponibile', err);
    notesCountCache.set(dateString, 0);
    return 0;
  }
}

async function persistNotesCount(dateString, count) {
  try {
    await openDb();
    await putRecord({
      date: notesMetaKey(dateString),
      kind: 'day-notes-meta',
      referenceDate: dateString,
      count,
      version: APP_VERSION,
      modifiedAt: new Date().toISOString()
    });
    session.storageWrites++;
    notesCountCache.set(dateString, count);
    return true;
  } catch (err) {
    session.storageErrors++;
    console.warn('Salvataggio conteggio Note del giorno non riuscito', err);
    return false;
  }
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

async function persistSnapshot(descriptor, pageStrokes, updateStatus = true) {
  try {
    await openDb();
    const txStart = performance.now();
    storageBusy = true;
    const putStart = performance.now();
    const promise = putRecord({
      date: descriptor.key,
      kind: descriptor.kind === 'note' ? 'day-note-ink' : 'agenda-day-ink',
      referenceDate: descriptor.date,
      noteIndex: descriptor.kind === 'note' ? descriptor.noteIndex : 0,
      version: APP_VERSION,
      pipeline: 'coalesced-retina-storage',
      strokes: pageStrokes,
      modifiedAt: new Date().toISOString()
    });
    const putCallMs = performance.now() - putStart;
    session.maxStorageCallMs = Math.max(session.maxStorageCallMs, putCallMs);
    await promise;
    session.maxStorageTxMs = Math.max(session.maxStorageTxMs, performance.now() - txStart);
    session.storageWrites++;
    if (updateStatus) statusLabel.textContent = 'salvato';
    return true;
  } catch (err) {
    session.storageErrors++;
    if (updateStatus) statusLabel.textContent = 'errore salvataggio';
    console.warn('Persistenza reintegrazione non riuscita', err);
    return false;
  } finally {
    storageBusy = false;
  }
}

async function persistNow() {
  if (!ready || drawing || pageTurning) return;
  const descriptor = pageDescriptor();
  const saveKey = descriptor.key;
  const snapshot = strokes;
  const ok = await persistSnapshot(descriptor, snapshot, true);
  if (ok && currentPageKey() === saveKey && strokes === snapshot) dirty = false;
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
  if (!ready || pageTurning) return false;
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
  dirty = true;
  scheduleSave();
}

function handlePointerDown(ev) {
  if (ev.pointerType === 'touch') { startPageSwipe(ev); return; }
  session.totalPointerDown++;
  noteHandlerArrival();
  if (startStroke(ev, 'pointerdown')) ev.preventDefault();
}

function handlePointerMove(ev) {
  if (ev.pointerType === 'touch') { movePageSwipe(ev); return; }
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
  if (ev.pointerType === 'touch') { endPageSwipe(ev, false); return; }
  session.totalPointerUp++;
  noteHandlerArrival();
  if (!drawing || ev.pointerId !== pointerId) return;
  finalizeStroke('pointerup');
  ev.preventDefault();
}

function handlePointerCancel(ev) {
  if (ev.pointerType === 'touch') { endPageSwipe(ev, true); return; }
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
    `Tipo pagina: ${currentPageKind === 'note' ? `Nota ${currentNoteIndex}/${currentNoteTotal}` : 'Agenda'}`,
    `Chiave pagina: ${currentPageKey()}`,
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
    `Cambi giorno completati/annullati: ${session.pageTurns}/${session.pageTurnCancels}`,
    `Cambi note completati: ${session.noteTurns}`,
    `Note create: ${session.notesCreated}`,
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
  const label = currentPageKind === 'note' ? `Nota ${currentNoteIndex}/${currentNoteTotal}` : 'pagina Agenda';
  if (!window.confirm(`Cancellare soltanto ${label} del ${currentDate}?`)) return;
  cancelPendingSave();
  strokes = [];
  renderAll();
  try {
    await openDb();
    await deleteRecord(currentPageKey());
    dirty = false;
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

function removePreview() {
  if (previewPage?.isConnected) previewPage.remove();
  previewPage = null;
  paper.style.zIndex = '';
}

function drawPreviewInk(preview, previewStrokes) {
  const previewCanvas = preview.querySelector('canvas');
  const previewHeader = preview.querySelector('.page-header');
  const pr = preview.getBoundingClientRect();
  const hr = previewHeader.getBoundingClientRect();
  const pdpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  previewCanvas.width = Math.max(1, Math.round(pr.width * pdpr));
  previewCanvas.height = Math.max(1, Math.round(pr.height * pdpr));
  previewCanvas.style.width = `${pr.width}px`;
  previewCanvas.style.height = `${pr.height}px`;
  const pctx = previewCanvas.getContext('2d', { alpha: true, desynchronized: true });
  const pTop = Math.max(0, hr.bottom - pr.top);
  pctx.setTransform(pdpr, 0, 0, pdpr, 0, 0);
  for (const stroke of previewStrokes) {
    const points = stroke?.points ?? [];
    if (!points.length) continue;
    pctx.save();
    pctx.beginPath();
    pctx.rect(0, pTop, pr.width, Math.max(0, pr.height - pTop - FOOTER_PX));
    pctx.clip();
    pctx.strokeStyle = stroke.color ?? PEN_COLOR;
    pctx.fillStyle = stroke.color ?? PEN_COLOR;
    pctx.globalAlpha = stroke.opacity ?? 1;
    pctx.lineWidth = stroke.width ?? PEN_WIDTH;
    pctx.lineCap = 'round';
    pctx.lineJoin = 'round';
    const css = (pt) => ({ x: pt.x * pr.width, y: pt.y * pr.height });
    if (points.length === 1) {
      const q = css(points[0]);
      pctx.beginPath();
      pctx.arc(q.x, q.y, Math.max(.7, (stroke.width ?? PEN_WIDTH) / 2), 0, Math.PI * 2);
      pctx.fill();
    } else {
      let q = css(points[0]);
      pctx.beginPath();
      pctx.moveTo(q.x, q.y);
      for (let i = 1; i < points.length; i++) {
        q = css(points[i]);
        pctx.lineTo(q.x, q.y);
      }
      pctx.stroke();
    }
    pctx.restore();
  }
}

function footerTextFor(descriptor) {
  return descriptor.kind === 'note'
    ? `NOTE DEL GIORNO ${descriptor.noteIndex}/${Math.max(descriptor.noteIndex, descriptor.noteTotal)}`
    : 'AGENDA · ANTEPRIMA';
}

function createPreview(descriptor) {
  removePreview();
  const clone = paper.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.add('page-preview');
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  clone.querySelectorAll('button').forEach((el) => { el.tabIndex = -1; });
  setHeaderFor(clone, descriptor.date, descriptor.kind, descriptor.noteIndex, descriptor.noteTotal);
  const footer = clone.querySelector('.baseline-footer');
  if (footer) footer.innerHTML = `<span class="baseline-label">${footerTextFor(descriptor)}</span><span class="status-label">${descriptor.date}</span>`;
  const r = paper.getBoundingClientRect();
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: '0', zIndex: '1', pointerEvents: 'none'
  });
  paper.style.zIndex = '2';
  stage.appendChild(clone);
  previewPage = clone;
  return clone;
}

async function loadPageForPreview(descriptor, preview) {
  try {
    await openDb();
    const record = await getRecord(descriptor.key);
    session.storageReads++;
    const targetStrokes = Array.isArray(record?.strokes) ? record.strokes : [];
    if (preview?.isConnected) drawPreviewInk(preview, targetStrokes);
    return targetStrokes;
  } catch (err) {
    session.storageErrors++;
    console.warn('Anteprima pagina non disponibile', err);
    return [];
  }
}

function resetTurnStyles() {
  paper.style.transition = '';
  paper.style.transform = '';
  paper.style.transformOrigin = '';
  paper.style.filter = '';
  paper.style.boxShadow = '';
  if (previewPage) {
    previewPage.style.transition = '';
    previewPage.style.transform = '';
    previewPage.style.filter = '';
  }
}

function horizontalTarget(direction) {
  const targetDate = addDays(currentDate, direction);
  if (!dateInRange(targetDate)) return null;
  return pageDescriptor(targetDate, 'agenda', 0, 0);
}

function verticalTarget(direction) {
  const count = notesCountCache.get(currentDate) ?? currentNoteTotal ?? 0;
  if (direction < 0) {
    if (currentPageKind === 'agenda') return null;
    if (currentNoteIndex <= 1) return pageDescriptor(currentDate, 'agenda', 0, 0);
    return pageDescriptor(currentDate, 'note', currentNoteIndex - 1, Math.max(count, currentNoteTotal));
  }

  const nextIndex = currentPageKind === 'agenda' ? 1 : currentNoteIndex + 1;
  const createNote = nextIndex > count;
  const total = createNote ? nextIndex : Math.max(count, currentNoteTotal);
  const target = pageDescriptor(currentDate, 'note', nextIndex, total);
  target.createNote = createNote;
  return target;
}

function applySwipeVisual(dx, dy) {
  if (!pageSwipe?.locked || !previewPage) return;
  if (pageSwipe.axis === 'x') {
    const width = pageSwipe.width;
    const direction = pageSwipe.direction;
    const signed = direction === 1 ? Math.min(0, dx) : Math.max(0, dx);
    const progress = Math.min(1, Math.abs(signed) / width);
    const angle = (direction === 1 ? -1 : 1) * 13 * progress;
    paper.style.transition = 'none';
    paper.style.transformOrigin = direction === 1 ? '0% 50%' : '100% 50%';
    paper.style.transform = `perspective(1500px) translateX(${signed * 0.94}px) rotateY(${angle}deg)`;
    paper.style.filter = `brightness(${1 - progress * 0.055})`;
    paper.style.boxShadow = `${direction === 1 ? 18 : -18}px 10px ${28 + progress * 18}px rgba(42,34,24,${0.16 + progress * .18})`;
    previewPage.style.transition = 'none';
    previewPage.style.transform = `translateX(${direction * 18 * (1 - progress)}px) scale(${0.992 + progress * .008})`;
    previewPage.style.filter = `brightness(${0.96 + progress * .04})`;
    return;
  }

  const height = pageSwipe.height;
  const direction = pageSwipe.direction; // +1 = nota successiva (swipe su), -1 = pagina precedente (swipe giù)
  const signed = direction === 1 ? Math.min(0, dy) : Math.max(0, dy);
  const progress = Math.min(1, Math.abs(signed) / height);
  const angle = (direction === 1 ? 1 : -1) * 7 * progress;
  paper.style.transition = 'none';
  paper.style.transformOrigin = direction === 1 ? '50% 0%' : '50% 100%';
  paper.style.transform = `perspective(1600px) translateY(${signed * 0.96}px) rotateX(${angle}deg)`;
  paper.style.filter = `brightness(${1 - progress * 0.045})`;
  paper.style.boxShadow = `0 ${direction === 1 ? 18 : -18}px ${28 + progress * 16}px rgba(42,34,24,${0.14 + progress * .16})`;
  previewPage.style.transition = 'none';
  previewPage.style.transform = `translateY(${direction * 16 * (1 - progress)}px) scale(${0.993 + progress * .007})`;
  previewPage.style.filter = `brightness(${0.965 + progress * .035})`;
}

function startPageSwipe(ev) {
  if (!ready || drawing || pageTurning || reportPanel.hidden === false) return;
  if (ev.target.closest?.('button')) return;
  if (!paper.contains(ev.target)) return;
  cancelPendingSave();
  const r = paper.getBoundingClientRect();
  pageSwipe = {
    pointerId: ev.pointerId,
    startX: ev.clientX, startY: ev.clientY, lastX: ev.clientX, lastY: ev.clientY,
    startedAt: performance.now(), lastAt: performance.now(), width: r.width, height: r.height,
    locked: false, axis: '', direction: 0, target: null, targetStrokes: null, previewPromise: null
  };
}

function movePageSwipe(ev) {
  if (!pageSwipe || ev.pointerId !== pageSwipe.pointerId || pageTurning) return;
  const dx = ev.clientX - pageSwipe.startX;
  const dy = ev.clientY - pageSwipe.startY;
  pageSwipe.lastX = ev.clientX;
  pageSwipe.lastY = ev.clientY;
  pageSwipe.lastAt = performance.now();

  if (!pageSwipe.locked) {
    if (Math.hypot(dx, dy) < 10) return;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < ay * .9 && ay < ax * 1.12) return;

    let axis = '';
    let direction = 0;
    let target = null;
    if (ax > ay * 1.12) {
      axis = 'x';
      direction = dx < 0 ? 1 : -1;
      target = horizontalTarget(direction);
    } else if (ay > ax * 1.12) {
      axis = 'y';
      direction = dy < 0 ? 1 : -1;
      target = verticalTarget(direction);
    } else {
      return;
    }

    if (!target) {
      pageSwipe = null;
      if (dirty) scheduleSave();
      return;
    }

    pageSwipe.locked = true;
    pageSwipe.axis = axis;
    pageSwipe.direction = direction;
    pageSwipe.target = target;
    const preview = createPreview(target);
    if (axis === 'x') {
      preview.style.transform = `translateX(${direction * 18}px) scale(.992)`;
    } else {
      preview.style.transform = `translateY(${direction * 16}px) scale(.993)`;
    }
    preview.style.filter = 'brightness(.96)';
    pageSwipe.previewPromise = loadPageForPreview(target, preview).then((targetStrokes) => {
      if (pageSwipe?.target?.key === target.key) pageSwipe.targetStrokes = targetStrokes;
      return targetStrokes;
    });
    if (axis === 'x') statusLabel.textContent = direction === 1 ? 'giorno successivo' : 'giorno precedente';
    else statusLabel.textContent = target.kind === 'agenda' ? 'torna ad Agenda' : `Nota ${target.noteIndex}/${target.noteTotal}`;
  }

  applySwipeVisual(dx, dy);
  ev.preventDefault();
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cancelPageTurn() {
  if (!pageSwipe) return;
  session.pageTurnCancels++;
  pageTurning = true;
  const duration = pageSwipe.axis === 'y' ? 200 : 220;
  paper.style.transition = `transform ${duration}ms cubic-bezier(.22,.7,.22,1), filter ${duration}ms ease, box-shadow ${duration}ms ease`;
  paper.style.transform = 'perspective(1500px) translate3d(0,0,0) rotateX(0deg) rotateY(0deg)';
  paper.style.filter = 'brightness(1)';
  paper.style.boxShadow = '';
  if (previewPage) {
    previewPage.style.transition = `transform ${duration}ms cubic-bezier(.22,.7,.22,1), filter ${duration}ms ease`;
    if (pageSwipe.axis === 'x') previewPage.style.transform = `translateX(${pageSwipe.direction * 18}px) scale(.992)`;
    else previewPage.style.transform = `translateY(${pageSwipe.direction * 16}px) scale(.993)`;
    previewPage.style.filter = 'brightness(.96)';
  }
  await waitMs(duration + 10);
  resetTurnStyles();
  removePreview();
  pageSwipe = null;
  pageTurning = false;
  statusLabel.textContent = dirty ? 'da salvare' : 'salvato';
  if (dirty) scheduleSave();
}

async function commitPageTurn() {
  if (!pageSwipe?.locked || pageTurning) return;
  const swipe = pageSwipe;
  pageTurning = true;
  cancelPendingSave();
  const oldDescriptor = pageDescriptor();
  const oldStrokes = strokes;
  const target = swipe.target;
  const targetPromise = swipe.previewPromise ?? Promise.resolve([]);
  const savePromise = dirty ? persistSnapshot(oldDescriptor, oldStrokes, false) : Promise.resolve(true);
  const metaPromise = target.createNote ? persistNotesCount(target.date, target.noteTotal) : Promise.resolve(true);
  const duration = swipe.axis === 'y' ? NOTE_TURN_MS : PAGE_TURN_MS;

  if (swipe.axis === 'x') {
    const finalX = swipe.direction === 1 ? -swipe.width * 1.02 : swipe.width * 1.02;
    const finalAngle = swipe.direction === 1 ? -18 : 18;
    paper.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1), filter ${duration}ms ease, box-shadow ${duration}ms ease`;
    paper.style.transform = `perspective(1500px) translateX(${finalX}px) rotateY(${finalAngle}deg)`;
  } else {
    const finalY = swipe.direction === 1 ? -swipe.height * 1.02 : swipe.height * 1.02;
    const finalAngle = swipe.direction === 1 ? 9 : -9;
    paper.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1), filter ${duration}ms ease, box-shadow ${duration}ms ease`;
    paper.style.transform = `perspective(1600px) translateY(${finalY}px) rotateX(${finalAngle}deg)`;
  }
  paper.style.filter = 'brightness(.91)';
  if (previewPage) {
    previewPage.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1), filter ${duration}ms ease`;
    previewPage.style.transform = swipe.axis === 'x' ? 'translateX(0) scale(1)' : 'translateY(0) scale(1)';
    previewPage.style.filter = 'brightness(1)';
  }

  const [targetStrokes, , saveOk, metaOk] = await Promise.all([
    targetPromise, waitMs(duration + 20), savePromise, metaPromise
  ]);
  if ((dirty && !saveOk) || !metaOk) {
    resetTurnStyles();
    removePreview();
    pageSwipe = null;
    pageTurning = false;
    statusLabel.textContent = !metaOk ? 'creazione nota non riuscita' : 'salvataggio non riuscito';
    if (dirty) scheduleSave();
    return;
  }

  currentDate = target.date;
  currentPageKind = target.kind;
  currentNoteIndex = target.kind === 'note' ? target.noteIndex : 0;
  currentNoteTotal = target.kind === 'note' ? target.noteTotal : 0;
  strokes = Array.isArray(targetStrokes) ? targetStrokes : [];
  dirty = false;
  if (target.createNote) session.notesCreated++;
  updateHeader();

  paper.style.visibility = 'hidden';
  resetTurnStyles();
  renderAll();
  paper.style.visibility = 'visible';
  await new Promise((resolve) => requestAnimationFrame(resolve));
  removePreview();
  pageSwipe = null;
  if (swipe.axis === 'x') {
    session.pageTurns++;
    await ensureNotesCount(currentDate);
  } else {
    session.noteTurns++;
  }
  pageTurning = false;
  statusLabel.textContent = strokes.length ? 'pagina caricata' : (currentPageKind === 'note' ? 'nota nuova' : 'pagina nuova');
}

function endPageSwipe(ev, cancelled = false) {
  if (!pageSwipe || ev.pointerId !== pageSwipe.pointerId || pageTurning) return;
  if (!pageSwipe.locked) {
    pageSwipe = null;
    if (dirty) scheduleSave();
    return;
  }
  const delta = pageSwipe.axis === 'x'
    ? pageSwipe.lastX - pageSwipe.startX
    : pageSwipe.lastY - pageSwipe.startY;
  const span = pageSwipe.axis === 'x' ? pageSwipe.width : pageSwipe.height;
  const elapsed = Math.max(1, pageSwipe.lastAt - pageSwipe.startedAt);
  const velocity = Math.abs(delta) / elapsed;
  const threshold = pageSwipe.axis === 'x' ? .18 : .14;
  const velocityThreshold = pageSwipe.axis === 'x' ? .58 : .52;
  const commit = !cancelled && (Math.abs(delta) >= span * threshold || velocity >= velocityThreshold);
  if (commit) commitPageTurn();
  else cancelPageTurn();
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
  if (drawing || pageTurning) return;
  removePreview();
  pageSwipe = null;
  resizeCanvas();
});

window.addEventListener('blur', () => {
  if (drawing) finalizeStroke('window-blur');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (drawing) finalizeStroke('visibility-hidden');
    if (pageSwipe) { resetTurnStyles(); removePreview(); pageSwipe = null; pageTurning = false; }
    if (ready && dirty) persistNow();
  }
});

window.addEventListener('pagehide', () => {
  if (drawing) finalizeStroke('pagehide');
  if (ready && dirty) persistNow();
});

async function loadInitialPage() {
  statusLabel.textContent = 'caricamento';
  try {
    await openDb();
    const [record] = await Promise.all([
      getRecord(currentPageKey()),
      ensureNotesCount(currentDate)
    ]);
    session.storageReads++;
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    dirty = false;
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
  await loadInitialPage();
  ready = true;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
console.info(`Agenda iPad ${APP_VERSION} · reintegrazione 3 · Ink baseline + sfoglio giorni + Note del giorno`);
