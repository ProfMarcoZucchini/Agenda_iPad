const DEG = 180 / Math.PI;
const RULER_HEIGHT = 76;
const SCREEN_MARGIN_PX = 14;
const INK_CAPTURE_PX = 42;
const END_ROTATE_MIN_PX = 58;
const END_ROTATE_MAX_PX = 112;
const END_ROTATE_RATIO = 0.14;
const DOUBLE_TAP_WINDOW_MS = 430;
const DOUBLE_TAP_DISTANCE_PX = 46;
const TAP_MOVE_TOLERANCE_PX = 9;
const TAP_DURATION_MS = 500;

export const RULER_MODES = Object.freeze(['ruler', 'protractor', 'triangle306090', 'triangle4545']);

export function normalizeAngleDeg(value) {
  let angle = Number(value) || 0;
  angle %= 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return angle;
}

export function rotatePoint(x, y, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: x * c - y * s, y: x * s + y * c };
}

function clampDimension(value, min, max) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeMin = Math.min(safeMax, Math.max(1, Number(min) || 1));
  return Math.max(safeMin, Math.min(safeMax, Number(value) || safeMin));
}

function dimensionsForMode(mode, availableWidth) {
  const maxWidth = Math.max(220, availableWidth - SCREEN_MARGIN_PX * 2);
  if (mode === 'ruler') return { width:maxWidth, height:RULER_HEIGHT };
  if (mode === 'protractor') {
    const width = clampDimension(availableWidth * 0.76, 360, Math.min(760, maxWidth));
    return { width, height:Math.max(190, width * 0.51) };
  }
  if (mode === 'triangle306090') {
    const width = clampDimension(availableWidth * 0.72, 350, Math.min(740, maxWidth));
    return { width, height:width / Math.sqrt(3) };
  }
  const width = clampDimension(availableWidth * 0.70, 340, Math.min(700, maxWidth));
  return { width, height:width / 2 };
}

function pointInTriangle(point, a, b, c) {
  const sign = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function shapeContainsLocal(local, state, halo = 0) {
  const halfW = state.width / 2;
  const halfH = state.height / 2;
  if (state.mode === 'ruler') return Math.abs(local.x) <= halfW + halo && Math.abs(local.y) <= halfH + halo;
  if (state.mode === 'protractor') {
    const rx = Math.max(1, halfW + halo);
    const ry = Math.max(1, state.height + halo * 2);
    const dy = local.y - halfH;
    return local.y <= halfH + halo && (local.x * local.x) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.08;
  }
  if (state.mode === 'triangle306090') {
    return pointInTriangle(local,
      { x:-halfW - halo, y:halfH + halo },
      { x:halfW + halo, y:halfH + halo },
      { x:-halfW - halo, y:-halfH - halo });
  }
  return pointInTriangle(local,
    { x:-halfW - halo, y:halfH + halo },
    { x:halfW + halo, y:halfH + halo },
    { x:0, y:-halfH - halo });
}

export function clientToRulerLocal(clientX, clientY, state, paperRect) {
  const cx = paperRect.left + state.cx;
  const cy = paperRect.top + state.cy;
  return rotatePoint(clientX - cx, clientY - cy, -(state.angleDeg || 0) / DEG);
}

export function rulerHitTest(clientX, clientY, state, paperRect) {
  if (!state?.enabled || !paperRect) return null;
  const local = clientToRulerLocal(clientX, clientY, state, paperRect);
  if (!shapeContainsLocal(local, state, 12)) return null;
  const halfW = state.width / 2;
  const rotateZone = Math.min(END_ROTATE_MAX_PX, Math.max(END_ROTATE_MIN_PX, state.width * END_ROTATE_RATIO));
  if (local.x <= -halfW + rotateZone || local.x >= halfW - rotateZone) {
    return { mode:'rotate', end:local.x < 0 ? 'left' : 'right', local };
  }
  return { mode:'move', local };
}

function edgeSegments(state) {
  const halfW = state.width / 2;
  const halfH = state.height / 2;
  if (state.mode === 'ruler') {
    return [
      [{ x:-halfW, y:-halfH }, { x:halfW, y:-halfH }],
      [{ x:-halfW, y:halfH }, { x:halfW, y:halfH }]
    ];
  }
  if (state.mode === 'protractor') {
    // Il bordo rettilineo del goniometro resta utilizzabile come guida Ink.
    return [[{ x:-halfW, y:halfH }, { x:halfW, y:halfH }]];
  }
  if (state.mode === 'triangle306090') {
    const a = { x:-halfW, y:halfH }, b = { x:halfW, y:halfH }, c = { x:-halfW, y:-halfH };
    return [[a,b],[a,c],[c,b]];
  }
  const a = { x:-halfW, y:halfH }, b = { x:halfW, y:halfH }, c = { x:0, y:-halfH };
  return [[a,b],[a,c],[c,b]];
}

function nearestPointOnSegment(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-9) return { x:a.x, y:a.y, t:0, distance:Math.hypot(point.x-a.x, point.y-a.y) };
  const t = Math.max(0, Math.min(1, ((point.x-a.x)*vx + (point.y-a.y)*vy) / len2));
  const x = a.x + vx * t;
  const y = a.y + vy * t;
  return { x, y, t, distance:Math.hypot(point.x-x, point.y-y) };
}

function localToClient(local, state, paperRect) {
  const rotated = rotatePoint(local.x, local.y, (state.angleDeg || 0) / DEG);
  return { x:paperRect.left + state.cx + rotated.x, y:paperRect.top + state.cy + rotated.y };
}

export function buildInkGuide(clientX, clientY, state, paperRect, tool) {
  if (!state?.enabled || !paperRect || !['pen', 'highlighter'].includes(tool)) return null;
  const local = clientToRulerLocal(clientX, clientY, state, paperRect);
  let best = null;
  for (const [a,b] of edgeSegments(state)) {
    const nearest = nearestPointOnSegment(local, a, b);
    if (!best || nearest.distance < best.nearest.distance) best = { a, b, nearest };
  }
  if (!best || best.nearest.distance > INK_CAPTURE_PX) return null;
  const start = localToClient(best.a, state, paperRect);
  const end = localToClient(best.b, state, paperRect);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx,dy);
  if (length <= 1e-6) return null;
  return {
    x:start.x,
    y:start.y,
    ux:dx / length,
    uy:dy / length,
    minT:0,
    maxT:length,
    mode:state.mode
  };
}

export function projectNormalizedPointToGuide(point, canvasRect, guide) {
  if (!guide || !canvasRect?.width || !canvasRect?.height) return point;
  const clientX = canvasRect.left + point.x * canvasRect.width;
  const clientY = canvasRect.top + point.y * canvasRect.height;
  let t = (clientX - guide.x) * guide.ux + (clientY - guide.y) * guide.uy;
  t = Math.max(guide.minT, Math.min(guide.maxT, t));
  const x = guide.x + guide.ux * t;
  const y = guide.y + guide.uy * t;
  return {
    ...point,
    x:Math.min(1, Math.max(0, (x - canvasRect.left) / canvasRect.width)),
    y:Math.min(1, Math.max(0, (y - canvasRect.top) / canvasRect.height))
  };
}

export function initRulerTool({ overlay, angleBadge, paper, getWritableBounds, onStateChange } = {}) {
  const state = {
    enabled:false,
    mode:'ruler',
    width:620,
    height:RULER_HEIGHT,
    cx:0,
    cy:0,
    angleDeg:0,
    initialized:false
  };
  let touch = null;
  let lastTap = null;

  function writableBounds() {
    const paperRect = paper?.getBoundingClientRect?.();
    if (!paperRect) return null;
    const supplied = getWritableBounds?.() || {};
    return {
      paperRect,
      left:0,
      right:paperRect.width,
      top:Math.max(0, Number(supplied.top) || 0),
      bottom:Math.min(paperRect.height, Number.isFinite(Number(supplied.bottom)) ? Number(supplied.bottom) : paperRect.height)
    };
  }

  function syncDimensions() {
    const b = writableBounds();
    if (!b) return;
    const d = dimensionsForMode(state.mode, Math.max(1, b.right - b.left));
    state.width = d.width;
    state.height = d.height;
  }

  function ensureInitialPosition() {
    if (state.initialized) return;
    const b = writableBounds();
    if (!b) return;
    syncDimensions();
    state.cx = b.paperRect.width / 2;
    state.cy = Math.min(b.bottom - 70, Math.max(b.top + 90, b.top + (b.bottom - b.top) * 0.32));
    state.angleDeg = 0;
    state.initialized = true;
  }

  function clampCenter() {
    const b = writableBounds();
    if (!b) return;
    const angle = (state.angleDeg || 0) / DEG;
    const c = Math.abs(Math.cos(angle));
    const si = Math.abs(Math.sin(angle));
    const localHalfW = state.width / 2;
    const localHalfH = state.height / 2;
    const extentX = c * localHalfW + si * localHalfH;
    const extentY = si * localHalfW + c * localHalfH;
    const availableW = Math.max(1, b.right - b.left);
    const availableH = Math.max(1, b.bottom - b.top);
    state.cx = extentX * 2 <= availableW
      ? Math.max(b.left + extentX, Math.min(b.right - extentX, state.cx))
      : b.left + availableW / 2;
    state.cy = extentY * 2 <= availableH
      ? Math.max(b.top + extentY, Math.min(b.bottom - extentY, state.cy))
      : b.top + availableH / 2;
  }

  function render() {
    if (!overlay) return;
    ensureInitialPosition();
    syncDimensions();
    clampCenter();
    overlay.hidden = !state.enabled;
    overlay.setAttribute?.('aria-hidden', state.enabled ? 'false' : 'true');
    if (!state.enabled) return;
    if (overlay.dataset) overlay.dataset.rulerMode = state.mode;
    overlay.style.setProperty('--ruler-width', `${state.width}px`);
    overlay.style.setProperty('--ruler-height', `${state.height}px`);
    overlay.style.transform = `translate3d(${state.cx - state.width / 2}px, ${state.cy - state.height / 2}px, 0) rotate(${state.angleDeg}deg)`;
    if (angleBadge) angleBadge.textContent = `${Math.round(normalizeAngleDeg(state.angleDeg))}°`;
  }

  function emit(reason = 'state') { onStateChange?.({ ...state }, { reason }); }

  function setEnabled(value) {
    state.enabled = Boolean(value);
    if (state.enabled) ensureInitialPosition();
    touch = null;
    lastTap = null;
    render();
    emit('enabled');
    return state.enabled;
  }

  function toggle() { return setEnabled(!state.enabled); }

  function setMode(mode, reason = 'mode') {
    const normalized = RULER_MODES.includes(mode) ? mode : 'ruler';
    if (state.mode === normalized) return state.mode;
    state.mode = normalized;
    syncDimensions();
    clampCenter();
    render();
    emit(reason);
    return state.mode;
  }

  function cycleMode() {
    const index = Math.max(0, RULER_MODES.indexOf(state.mode));
    return setMode(RULER_MODES[(index + 1) % RULER_MODES.length], 'double-tap-mode');
  }

  function registerTap(clientX, clientY, at) {
    if (lastTap && at - lastTap.at <= DOUBLE_TAP_WINDOW_MS && Math.hypot(clientX-lastTap.x, clientY-lastTap.y) <= DOUBLE_TAP_DISTANCE_PX) {
      lastTap = null;
      cycleMode();
      return true;
    }
    lastTap = { x:clientX, y:clientY, at };
    return false;
  }

  function beginTouch(nativeTouch) {
    if (!state.enabled || !nativeTouch) return false;
    const b = writableBounds();
    if (!b) return false;
    const hit = rulerHitTest(nativeTouch.clientX, nativeTouch.clientY, state, b.paperRect);
    if (!hit) return false;
    const cx = b.paperRect.left + state.cx;
    const cy = b.paperRect.top + state.cy;
    touch = {
      id:nativeTouch.identifier,
      mode:hit.mode,
      end:hit.end || '',
      startX:nativeTouch.clientX,
      startY:nativeTouch.clientY,
      startCx:state.cx,
      startCy:state.cy,
      startAngle:state.angleDeg,
      startPointerAngle:Math.atan2(nativeTouch.clientY - cy, nativeTouch.clientX - cx) * DEG,
      startedAt:performance.now(),
      moved:false
    };
    return true;
  }

  function moveTouch(nativeTouch) {
    if (!touch || !nativeTouch || nativeTouch.identifier !== touch.id) return false;
    const b = writableBounds();
    if (!b) return false;
    if (Math.hypot(nativeTouch.clientX-touch.startX, nativeTouch.clientY-touch.startY) > TAP_MOVE_TOLERANCE_PX) touch.moved = true;
    if (touch.mode === 'move') {
      state.cx = touch.startCx + (nativeTouch.clientX - touch.startX);
      state.cy = touch.startCy + (nativeTouch.clientY - touch.startY);
      clampCenter();
    } else {
      const cx = b.paperRect.left + state.cx;
      const cy = b.paperRect.top + state.cy;
      const nowAngle = Math.atan2(nativeTouch.clientY - cy, nativeTouch.clientX - cx) * DEG;
      const delta = normalizeAngleDeg(nowAngle - touch.startPointerAngle);
      state.angleDeg = normalizeAngleDeg(touch.startAngle + delta);
      clampCenter();
    }
    render();
    return true;
  }

  function endTouch(nativeTouch) {
    if (!touch || (nativeTouch && nativeTouch.identifier !== touch.id)) return false;
    const finished = touch;
    touch = null;
    const now = performance.now();
    const clientX = nativeTouch?.clientX ?? finished.startX;
    const clientY = nativeTouch?.clientY ?? finished.startY;
    if (!finished.moved && now - finished.startedAt <= TAP_DURATION_MS) registerTap(clientX, clientY, now);
    render();
    emit('touch-end');
    return true;
  }

  function prepareInkGuide(clientX, clientY, tool) {
    const b = writableBounds();
    return b ? buildInkGuide(clientX, clientY, state, b.paperRect, tool) : null;
  }

  function handleResize() {
    if (!state.enabled) return;
    ensureInitialPosition();
    syncDimensions();
    clampCenter();
    render();
    emit('resize');
  }

  return {
    state,
    toggle,
    setEnabled,
    setMode,
    cycleMode,
    render,
    beginTouch,
    moveTouch,
    endTouch,
    isTouching:() => Boolean(touch),
    prepareInkGuide,
    handleResize
  };
}
