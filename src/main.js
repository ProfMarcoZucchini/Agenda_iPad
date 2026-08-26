const VERSION = '0.1.7';
const canvas = document.getElementById('inkCanvas');
const paper = document.getElementById('paper');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const hint = document.getElementById('startHint');
const supportInfo = document.getElementById('supportInfo');
const strokeInfo = document.getElementById('strokeInfo');
const clearBtn = document.getElementById('clearBtn');
const widthSlider = document.getElementById('widthSlider');
const modeButtons = [...document.querySelectorAll('.mode-btn')];
const resButtons = [...document.querySelectorAll('.res-btn')];

let mode = 'coalesced';
let resolutionMode = '1';
let scale = 1;
let drawing = false;
let activePointerId = null;
let activePointerType = null;
let rect = null;
let lastPoint = null;
let rawSeen = false;
let stroke = null;
let lastAcceptedEventStamp = -1;

const rawSupported = 'onpointerrawupdate' in window;
const coalescedSupported = typeof PointerEvent !== 'undefined' && 'getCoalescedEvents' in PointerEvent.prototype;
const predictedSupported = typeof PointerEvent !== 'undefined' && 'getPredictedEvents' in PointerEvent.prototype;

supportInfo.textContent = `Pointer ${'PointerEvent' in window ? '✓' : '✗'} · Coalesced ${coalescedSupported ? '✓' : '✗'} · Raw ${rawSupported ? '✓' : '✗'} · Predicted ${predictedSupported ? '✓' : '✗'}`;

function currentScale() {
  if (resolutionMode === 'retina') return Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  return 1;
}

function resizeCanvas({ preserve = false } = {}) {
  const r = paper.getBoundingClientRect();
  const nextScale = currentScale();
  let snapshot = null;
  if (preserve && canvas.width > 0 && canvas.height > 0) {
    snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);
  }
  scale = nextScale;
  canvas.width = Math.max(1, Math.round(r.width * scale));
  canvas.height = Math.max(1, Math.round(r.height * scale));
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111';
  if (snapshot) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
}

function beginStroke(e) {
  if (e.pointerType === 'touch') return;
  if (drawing) return;
  drawing = true;
  activePointerId = e.pointerId;
  activePointerType = e.pointerType;
  rawSeen = false;
  rect = canvas.getBoundingClientRect(); // una sola lettura per tratto
  lastPoint = pointFromEvent(e);
  lastAcceptedEventStamp = e.timeStamp;
  stroke = {
    startedAt: performance.now(),
    eventCount: 1,
    sampleCount: 1,
    maxGap: 0,
    sumGap: 0,
    gapCount: 0,
    pressureSum: Number.isFinite(e.pressure) ? e.pressure : 0,
    pressureCount: Number.isFinite(e.pressure) ? 1 : 0
  };
  hint.classList.add('hidden');
  drawDot(lastPoint);
  e.preventDefault();
}

function pointFromEvent(e) {
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure ?? 0.5, t: e.timeStamp };
}

function updateMetrics(e, sampleCount) {
  if (!stroke) return;
  stroke.eventCount += 1;
  stroke.sampleCount += sampleCount;
  const gap = Math.max(0, e.timeStamp - lastAcceptedEventStamp);
  if (gap > 0) {
    stroke.maxGap = Math.max(stroke.maxGap, gap);
    stroke.sumGap += gap;
    stroke.gapCount += 1;
  }
  lastAcceptedEventStamp = e.timeStamp;
  if (Number.isFinite(e.pressure)) {
    stroke.pressureSum += e.pressure;
    stroke.pressureCount += 1;
  }
}

function drawDot(p) {
  const w = Number(widthSlider.value);
  ctx.save();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0.6, w / 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBatch(events, hostEvent) {
  if (!drawing || !rect || !events.length) return;
  const width = Number(widthSlider.value);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(lastPoint.x, lastPoint.y);
  let accepted = 0;
  for (const sample of events) {
    if (sample.pointerId !== activePointerId) continue;
    const p = pointFromEvent(sample);
    if (p.x === lastPoint.x && p.y === lastPoint.y) continue;
    ctx.lineTo(p.x, p.y);
    lastPoint = p;
    accepted += 1;
  }
  if (accepted) ctx.stroke();
  updateMetrics(hostEvent, accepted);
}

function handlePointerMove(e) {
  if (!drawing || e.pointerId !== activePointerId) return;
  if (mode === 'raw' && rawSupported && rawSeen) {
    e.preventDefault();
    return;
  }
  if (mode === 'coalesced' && coalescedSupported) {
    const list = e.getCoalescedEvents();
    drawBatch(list.length ? list : [e], e);
  } else {
    drawBatch([e], e);
  }
  e.preventDefault();
}

function handleRawUpdate(e) {
  if (mode !== 'raw' || !rawSupported) return;
  if (!drawing || e.pointerId !== activePointerId) return;
  rawSeen = true;
  drawBatch([e], e);
  e.preventDefault();
}

function endStroke(e, reason = 'up') {
  if (!drawing || e.pointerId !== activePointerId) return;
  drawing = false;
  const finished = stroke;
  activePointerId = null;
  activePointerType = null;
  rect = null;
  lastPoint = null;
  stroke = null;
  rawSeen = false;
  requestAnimationFrame(() => {
    if (!finished) return;
    const duration = Math.max(1, performance.now() - finished.startedAt);
    const sampleRate = Math.round((finished.sampleCount * 1000) / duration);
    const avgGap = finished.gapCount ? (finished.sumGap / finished.gapCount).toFixed(1) : '0.0';
    const avgPressure = finished.pressureCount ? (finished.pressureSum / finished.pressureCount).toFixed(2) : 'n/a';
    strokeInfo.textContent = `${activePointerType ?? e.pointerType} · ${mode} · ${finished.sampleCount} campioni · ${sampleRate} camp/s · gap medio ${avgGap} ms · max ${finished.maxGap.toFixed(1)} ms · p ${avgPressure}${reason === 'cancel' ? ' · CANCEL' : ''}`;
  });
  e.preventDefault();
}

canvas.addEventListener('pointerdown', beginStroke, { passive: false });
canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
canvas.addEventListener('pointerrawupdate', handleRawUpdate, { passive: false });
window.addEventListener('pointerup', (e) => endStroke(e, 'up'), { passive: false, capture: true });
window.addEventListener('pointercancel', (e) => endStroke(e, 'cancel'), { passive: false, capture: true });

// Blocca gesture/browser scroll senza fare lavoro nel percorso Pencil.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

modeButtons.forEach((btn) => btn.addEventListener('click', () => {
  mode = btn.dataset.mode;
  modeButtons.forEach((b) => b.classList.toggle('active', b === btn));
  if (mode === 'raw' && !rawSupported) strokeInfo.textContent = 'Raw non disponibile: verrà usato pointermove standard.';
}));

resButtons.forEach((btn) => btn.addEventListener('click', () => {
  resolutionMode = btn.dataset.res;
  resButtons.forEach((b) => b.classList.toggle('active', b === btn));
  resizeCanvas({ preserve: true });
}));

clearBtn.addEventListener('click', () => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  hint.classList.remove('hidden');
  strokeInfo.textContent = 'Canvas pulito';
});

window.addEventListener('resize', () => resizeCanvas({ preserve: true }));
resizeCanvas();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

console.info(`Agenda iPad Ink Test ${VERSION}`, { rawSupported, coalescedSupported, predictedSupported, devicePixelRatio: window.devicePixelRatio });
