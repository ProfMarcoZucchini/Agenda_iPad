const VERSION = '0.1.9';
const DB_NAME = 'AgendaIPadInkStorageTestDB';
const DB_VERSION = 1;
const STORE = 'strokes';
const SESSION = 'ink-storage-test';

// Baseline fissata dal test reale 0.1.7: Coalesced + Retina.
const MAX_DPR = 2;
const FLOATS_PER_POINT = 4; // x, y, pressure, dt
const MAX_POINTS_PER_STROKE = 16384;
const POOL_SIZE = 24;
const STORAGE_IDLE_MS = 1600;

const canvas = document.getElementById('inkCanvas');
const paper = document.getElementById('paper');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const hint = document.getElementById('startHint');
const supportInfo = document.getElementById('supportInfo');
const strokeInfo = document.getElementById('strokeInfo');
const storageInfo = document.getElementById('storageInfo');
const clearBtn = document.getElementById('clearBtn');
const resetStorageBtn = document.getElementById('resetStorageBtn');
const widthSlider = document.getElementById('widthSlider');
const modeButtons = [...document.querySelectorAll('.mode-btn')];

let mode = 'ink';
let scale = 1;
let drawing = false;
let activePointerId = null;
let activePointerType = null;
let rect = null;
let lastX = 0;
let lastY = 0;
let strokeStartStamp = 0;
let strokeStartedAt = 0;
let sampleCount = 0;
let eventCount = 0;
let maxGap = 0;
let lastEventStamp = 0;
let truncated = false;

let db = null;
let dbReady = false;
let storageInitializing = false;
let persistedCount = 0;
let storageTimer = 0;
let idleHandle = 0;
let storageBusy = false;
let lastStorageMs = 0;
let maxStorageMs = 0;

// Pool preallocato: nessuna nuova struttura per campione nel percorso realtime.
const buffers = Array.from(
  { length: POOL_SIZE },
  () => new Float32Array(MAX_POINTS_PER_STROKE * FLOATS_PER_POINT)
);
const freeBufferIds = Array.from({ length: POOL_SIZE }, (_, index) => index);
const pending = [];
let activeBufferId = -1;
let activeBuffer = null;
let activePointCount = 0;

const coalescedSupported = typeof PointerEvent !== 'undefined' && 'getCoalescedEvents' in PointerEvent.prototype;
supportInfo.textContent = `Coalesced ${coalescedSupported ? '✓' : '✗'} · Retina ≤${MAX_DPR}× · pool ${POOL_SIZE}×${MAX_POINTS_PER_STROKE}`;

function makeId() {
  if (globalThis.crypto?.randomUUID) return `stroke-${crypto.randomUUID()}`;
  return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentPenWidth() {
  return Number(widthSlider.value) || 2.5;
}

function resizeCanvas({ preserve = false } = {}) {
  if (drawing) return;
  const r = paper.getBoundingClientRect();
  let snapshot = null;
  if (preserve && canvas.width > 0 && canvas.height > 0) {
    snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);
  }

  scale = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DPR));
  canvas.width = Math.max(1, Math.round(r.width * scale));
  canvas.height = Math.max(1, Math.round(r.height * scale));
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111111';

  if (snapshot) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
}

function clearCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  hint.classList.remove('hidden');
}

function drawDot(x, y, width) {
  ctx.save();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, width / 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function storePoint(x, y, pressure, stamp) {
  if (mode !== 'storage' || !activeBuffer) return;
  if (activePointCount >= MAX_POINTS_PER_STROKE) {
    truncated = true;
    return;
  }
  const offset = activePointCount * FLOATS_PER_POINT;
  activeBuffer[offset] = x;
  activeBuffer[offset + 1] = y;
  activeBuffer[offset + 2] = Number.isFinite(pressure) ? pressure : 0.5;
  activeBuffer[offset + 3] = Math.max(0, stamp - strokeStartStamp);
  activePointCount += 1;
}

function acquireStorageBuffer() {
  if (mode !== 'storage') return;
  activeBufferId = freeBufferIds.length ? freeBufferIds.pop() : -1;
  activeBuffer = activeBufferId >= 0 ? buffers[activeBufferId] : null;
  activePointCount = 0;
  truncated = activeBuffer === null;
}

function releaseBuffer(bufferId) {
  if (bufferId >= 0) freeBufferIds.push(bufferId);
}

function beginStroke(e) {
  if (storageInitializing) return;
  if (e.pointerType === 'touch') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (drawing) return;

  cancelStorageSchedule();
  drawing = true;
  activePointerId = e.pointerId;
  activePointerType = e.pointerType;
  rect = canvas.getBoundingClientRect(); // una sola lettura per tratto
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  strokeStartStamp = Number.isFinite(e.timeStamp) ? e.timeStamp : performance.now();
  strokeStartedAt = performance.now();
  sampleCount = 1;
  eventCount = 1;
  maxGap = 0;
  lastEventStamp = strokeStartStamp;
  truncated = false;

  acquireStorageBuffer();
  storePoint(lastX, lastY, e.pressure, strokeStartStamp);

  hint.classList.add('hidden');
  drawDot(lastX, lastY, currentPenWidth());
  e.preventDefault();
}

function drawEventBatch(hostEvent) {
  if (!drawing || hostEvent.pointerId !== activePointerId || !rect) return;

  let list = null;
  if (coalescedSupported && typeof hostEvent.getCoalescedEvents === 'function') {
    try {
      const coalesced = hostEvent.getCoalescedEvents();
      if (coalesced && coalesced.length) list = coalesced;
    } catch {}
  }
  if (!list) list = [hostEvent];

  const width = currentPenWidth();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);

  let accepted = 0;
  for (let i = 0; i < list.length; i += 1) {
    const sample = list[i];
    if (sample.pointerId !== activePointerId) continue;
    const x = sample.clientX - rect.left;
    const y = sample.clientY - rect.top;
    const dx = x - lastX;
    const dy = y - lastY;
    if ((dx * dx + dy * dy) < 0.0001) continue;

    ctx.lineTo(x, y);
    lastX = x;
    lastY = y;
    storePoint(x, y, sample.pressure, Number.isFinite(sample.timeStamp) ? sample.timeStamp : hostEvent.timeStamp);
    accepted += 1;
  }

  if (accepted) {
    ctx.stroke();
    sampleCount += accepted;
  }

  eventCount += 1;
  const stamp = Number.isFinite(hostEvent.timeStamp) ? hostEvent.timeStamp : performance.now();
  const gap = Math.max(0, stamp - lastEventStamp);
  if (gap > maxGap) maxGap = gap;
  lastEventStamp = stamp;
  hostEvent.preventDefault();
}

function endStroke(e, reason = 'up') {
  if (!drawing || e.pointerId !== activePointerId) return;

  const finishedMode = mode;
  const finishedPointerType = activePointerType || e.pointerType;
  const finishedSampleCount = sampleCount;
  const finishedEventCount = eventCount;
  const finishedMaxGap = maxGap;
  const finishedStartedAt = strokeStartedAt;
  const finishedTruncated = truncated;
  const finishedRectWidth = rect?.width || canvas.clientWidth;
  const finishedRectHeight = rect?.height || canvas.clientHeight;
  const finishedPenWidth = currentPenWidth();
  const finishedBufferId = activeBufferId;
  const finishedPointCount = activePointCount;

  drawing = false;
  activePointerId = null;
  activePointerType = null;
  rect = null;
  activeBufferId = -1;
  activeBuffer = null;
  activePointCount = 0;

  if (finishedMode === 'storage' && finishedBufferId >= 0 && finishedPointCount > 0) {
    pending.push({
      id: makeId(),
      bufferId: finishedBufferId,
      pointCount: finishedPointCount,
      pageWidth: finishedRectWidth,
      pageHeight: finishedRectHeight,
      width: finishedPenWidth,
      createdAt: Date.now(),
      truncated: finishedTruncated
    });
    scheduleStorageDrain();
  } else if (finishedBufferId >= 0) {
    releaseBuffer(finishedBufferId);
  }

  // Diagnostica solo fuori dal percorso Pencil.
  requestAnimationFrame(() => {
    if (drawing) return;
    const duration = Math.max(1, performance.now() - finishedStartedAt);
    const sampleRate = Math.round((finishedSampleCount * 1000) / duration);
    strokeInfo.textContent = `${finishedPointerType} · ${finishedMode === 'storage' ? 'INK+STORAGE' : 'INK ONLY'} · ${finishedSampleCount} campioni · ${sampleRate} camp/s · max gap ${finishedMaxGap.toFixed(1)} ms · eventi ${finishedEventCount}${finishedTruncated ? ' · BUFFER LIMIT' : ''}${reason === 'cancel' ? ' · CANCEL' : ''}`;
    updateStorageInfo();
  });

  e.preventDefault();
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      let store;
      if (!database.objectStoreNames.contains(STORE)) {
        store = database.createObjectStore(STORE, { keyPath: 'id' });
      } else {
        store = req.transaction.objectStore(STORE);
      }
      if (!store.indexNames.contains('session')) store.createIndex('session', 'session', { unique: false });
      if (!store.indexNames.contains('createdAt')) store.createIndex('createdAt', 'createdAt', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getStoredStrokes() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).filter((item) => item.session === SESSION).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

function putStrokeRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function clearStorageRecords() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (cursor.value?.session === SESSION) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function drawStoredRecord(record) {
  if (!record?.data || !record.pointCount) return;
  const values = new Float32Array(record.data);
  const sx = canvas.clientWidth / Math.max(1, record.pageWidth || canvas.clientWidth);
  const sy = canvas.clientHeight / Math.max(1, record.pageHeight || canvas.clientHeight);
  const width = Number(record.width) || 2.5;
  const count = Math.min(record.pointCount, Math.floor(values.length / FLOATS_PER_POINT));
  if (count < 1) return;

  let offset = 0;
  let x = values[offset] * sx;
  let y = values[offset + 1] * sy;
  if (count === 1) {
    drawDot(x, y, width);
    return;
  }

  ctx.save();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i < count; i += 1) {
    offset = i * FLOATS_PER_POINT;
    x = values[offset] * sx;
    y = values[offset + 1] * sy;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function cancelStorageSchedule() {
  clearTimeout(storageTimer);
  storageTimer = 0;
  if (idleHandle && 'cancelIdleCallback' in window) cancelIdleCallback(idleHandle);
  idleHandle = 0;
}

function scheduleStorageDrain() {
  cancelStorageSchedule();
  if (!pending.length) return;
  storageTimer = window.setTimeout(() => {
    storageTimer = 0;
    const run = () => {
      idleHandle = 0;
      if (drawing) {
        scheduleStorageDrain();
        return;
      }
      drainOneStroke();
    };
    if ('requestIdleCallback' in window) {
      idleHandle = requestIdleCallback(run, { timeout: 1200 });
    } else {
      run();
    }
  }, STORAGE_IDLE_MS);
}

async function drainOneStroke() {
  if (storageBusy || drawing || !pending.length || !dbReady) {
    if (pending.length) scheduleStorageDrain();
    return;
  }

  storageBusy = true;
  const item = pending.shift();
  const started = performance.now();
  try {
    // La compattazione avviene esclusivamente fuori dal contatto Pencil.
    const full = buffers[item.bufferId];
    const compact = full.slice(0, item.pointCount * FLOATS_PER_POINT);
    await putStrokeRecord({
      id: item.id,
      session: SESSION,
      version: VERSION,
      pipeline: 'coalesced-retina-float32-per-stroke',
      createdAt: item.createdAt,
      pageWidth: item.pageWidth,
      pageHeight: item.pageHeight,
      width: item.width,
      pointCount: item.pointCount,
      truncated: item.truncated,
      data: compact.buffer
    });
    persistedCount += 1;
    lastStorageMs = performance.now() - started;
    maxStorageMs = Math.max(maxStorageMs, lastStorageMs);
  } catch (err) {
    console.warn('Salvataggio tratto non riuscito', err);
  } finally {
    releaseBuffer(item.bufferId);
    storageBusy = false;
    updateStorageInfo();
  }

  if (pending.length) {
    // Un solo tratto per tranche: mai una lunga transazione cumulativa.
    scheduleStorageDrain();
  }
}

function updateStorageInfo() {
  storageInfo.textContent = `Storage ${dbReady ? '✓' : '…'} · salvati ${persistedCount} · coda ${pending.length}${storageBusy ? ' +1 I/O' : ''} · last ${lastStorageMs.toFixed(1)} ms · max ${maxStorageMs.toFixed(1)} ms`;
}

async function ensureStorageReady() {
  if (dbReady) return true;
  if (storageInitializing) return false;
  storageInitializing = true;
  storageInfo.textContent = 'Storage: inizializzazione…';
  try {
    db = await openDb();
    const stored = await getStoredStrokes();
    persistedCount = stored.length;
    // Il replay avviene prima di abilitare la modalità Storage, mai durante un tratto.
    for (const record of stored) drawStoredRecord(record);
    if (stored.length) hint.classList.add('hidden');
    dbReady = true;
    if (pending.length) scheduleStorageDrain();
  } catch (err) {
    console.warn('Storage test non disponibile', err);
    dbReady = false;
  } finally {
    storageInitializing = false;
    updateStorageInfo();
  }
  return dbReady;
}

canvas.addEventListener('pointerdown', beginStroke, { passive: false });
canvas.addEventListener('pointermove', drawEventBatch, { passive: false });
window.addEventListener('pointerup', (e) => endStroke(e, 'up'), { passive: false, capture: true });
window.addEventListener('pointercancel', (e) => endStroke(e, 'cancel'), { passive: false, capture: true });

// Blocca gesture/browser scroll senza aggiungere lavoro al percorso Pencil.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

modeButtons.forEach((btn) => btn.addEventListener('click', async () => {
  if (drawing || storageInitializing) return;
  const requested = btn.dataset.mode === 'storage' ? 'storage' : 'ink';
  if (requested === 'storage' && !dbReady) {
    strokeInfo.textContent = 'Inizializzazione storage di test…';
    const ok = await ensureStorageReady();
    if (!ok) {
      mode = 'ink';
      modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === 'ink'));
      strokeInfo.textContent = 'Storage non disponibile · resta attivo INK ONLY';
      return;
    }
  }
  mode = requested;
  modeButtons.forEach((b) => b.classList.toggle('active', b === btn));
  strokeInfo.textContent = mode === 'storage'
    ? 'INK + STORAGE attivo · buffer Float32 + record per singolo tratto'
    : 'INK ONLY attivo · nessuna registrazione/persistenza';
  updateStorageInfo();
}));

clearBtn.addEventListener('click', () => {
  if (drawing) return;
  clearCanvas();
  strokeInfo.textContent = 'Schermo pulito · storage non modificato';
});

resetStorageBtn.addEventListener('click', async () => {
  if (drawing || !dbReady) return;
  cancelStorageSchedule();
  if (storageBusy) {
    strokeInfo.textContent = 'Attendi la conclusione del salvataggio in corso e riprova.';
    return;
  }
  while (pending.length) {
    const item = pending.shift();
    releaseBuffer(item.bufferId);
  }
  try {
    await clearStorageRecords();
    persistedCount = 0;
    lastStorageMs = 0;
    maxStorageMs = 0;
    clearCanvas();
    strokeInfo.textContent = 'Storage test azzerato';
  } catch (err) {
    console.warn('Reset storage non riuscito', err);
    strokeInfo.textContent = 'Errore durante azzeramento storage';
  }
  updateStorageInfo();
});

window.addEventListener('resize', () => resizeCanvas({ preserve: true }));
window.addEventListener('pagehide', () => {
  // Nessun flush sincrono: non introdurre percorsi speciali che possano alterare il test.
});

resizeCanvas();
updateStorageInfo();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

console.info(`Agenda iPad Ink Storage Test ${VERSION}`, {
  pipeline: 'Coalesced + Retina',
  coalescedSupported,
  devicePixelRatio: window.devicePixelRatio,
  maxDpr: MAX_DPR,
  poolSize: POOL_SIZE,
  maxPointsPerStroke: MAX_POINTS_PER_STROKE
});
