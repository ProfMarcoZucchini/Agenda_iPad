// Note 0.1.27 — Beautify lesson-wide uniform font baseline.
// Modulo post-Ink: non registra listener Pencil/pointermove e non modifica il
// motore di scrittura. Lavora solo su una fotografia di tratti già conclusi.

const GOOGLE_HANDWRITING_API = 'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';
const FALLBACK_LINE_TIMEOUT_MS = 2800;
const FALLBACK_MAX_CONCURRENCY = 8;
const FALLBACK_GLOBAL_TIMEOUT_MS = 3800;
const FONT_SCALE = 0.70;
const MIN_FONT_PX = 14;
const MAX_FONT_PX = 76;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isRawPenStroke(stroke) {
  if (!stroke || typeof stroke !== 'object') return false;
  if (stroke.kind === 'text' || stroke.kind === 'shape') return false;
  if (stroke.tool && stroke.tool !== 'pen') return false;
  // Pencil taps can be the dots/accents of the same recognized handwriting.
  // Keep them in the source set so a successful line replacement removes them.
  return Array.isArray(stroke.points) && stroke.points.length >= 1;
}

function strokeBox(stroke, width, height, index) {
  const points = stroke.points || [];
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  let travel = 0;
  let previous = null;
  for (const p of points) {
    const x = Math.max(0, Math.min(width, finite(p?.x) * width));
    const y = Math.max(0, Math.min(height, finite(p?.y) * height));
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    if (previous) travel += Math.hypot(x - previous.x, y - previous.y);
    previous = { x, y };
  }
  if (!Number.isFinite(left)) return null;
  const boxWidth = Math.max(1, right - left);
  const boxHeight = Math.max(1, bottom - top);
  return {
    stroke, index, left, top, right, bottom,
    width: boxWidth, height: boxHeight,
    cx: (left + right) / 2, cy: (top + bottom) / 2, travel
  };
}

function verticalOverlap(a, b) {
  return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function canJoinLine(line, box) {
  const overlap = verticalOverlap(line, box);
  const minH = Math.max(1, Math.min(line.height, box.height));
  const centerDistance = Math.abs(line.cy - box.cy);
  return overlap / minH >= 0.26 || centerDistance <= Math.max(10, minH * 0.46);
}

function extendLine(line, box) {
  line.items.push(box);
  line.left = Math.min(line.left, box.left);
  line.top = Math.min(line.top, box.top);
  line.right = Math.max(line.right, box.right);
  line.bottom = Math.max(line.bottom, box.bottom);
  line.width = Math.max(1, line.right - line.left);
  line.height = Math.max(1, line.bottom - line.top);
  line.cx = (line.left + line.right) / 2;
  line.cy = (line.top + line.bottom) / 2;
}

function groupIntoLines(boxes) {
  const sorted = [...boxes].sort((a, b) => a.cy - b.cy || a.left - b.left || a.index - b.index);
  const lines = [];
  for (const box of sorted) {
    let best = null;
    let bestDistance = Infinity;
    for (const line of lines) {
      if (!canJoinLine(line, box)) continue;
      const d = Math.abs(line.cy - box.cy);
      if (d < bestDistance) { best = line; bestDistance = d; }
    }
    if (!best) {
      lines.push({
        items:[box], left:box.left, top:box.top, right:box.right, bottom:box.bottom,
        width:box.width, height:box.height, cx:box.cx, cy:box.cy
      });
    } else extendLine(best, box);
  }

  lines.sort((a, b) => a.top - b.top || a.left - b.left);
  const merged = [];
  for (const line of lines) {
    const previous = merged[merged.length - 1];
    if (previous) {
      const gap = line.top - previous.bottom;
      const small = Math.min(previous.height, line.height);
      const horizontalRelated = Math.abs(line.cx - previous.cx) < Math.max(28, Math.min(previous.width, line.width) * 0.45);
      const accentLike = small <= Math.max(14, Math.max(previous.height, line.height) * 0.35);
      if (gap >= 0 && gap <= Math.min(10, Math.max(previous.height, line.height) * 0.16) && horizontalRelated && accentLike) {
        for (const item of line.items) extendLine(previous, item);
        continue;
      }
    }
    merged.push(line);
  }
  return merged;
}

function makeInkForApi(line, pad = 10) {
  const left = Math.max(0, line.left - pad);
  const top = Math.max(0, line.top - pad);
  const traces = [...line.items]
    .sort((a, b) => a.index - b.index)
    .map(({ stroke }) => {
      const xs = [], ys = [], times = [];
      for (const point of stroke.points || []) {
        xs.push(finite(point?.x) * line.pageWidth - left);
        ys.push(finite(point?.y) * line.pageHeight - top);
        times.push(Math.max(0, Math.round(finite(point?.t, times.length ? times[times.length - 1] + 1 : 0))));
      }
      return [xs, ys, times];
    });
  return {
    ink: traces,
    width: Math.max(32, Math.ceil(line.right - left + pad)),
    height: Math.max(32, Math.ceil(line.bottom - top + pad))
  };
}

function normalizedRecognizedText(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function plausibleText(text, line) {
  if (!text) return false;
  const alnum = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  if (!alnum || text.length > 180) return false;
  if (alnum === 1 && line.items.length > 5) return false;
  const travel = line.items.reduce((sum, item) => sum + item.travel, 0);
  return travel >= 10;
}

function requestForLine(line, language) {
  const prepared = makeInkForApi(line);
  return {
    writing_guide:{ writing_area_width:prepared.width, writing_area_height:prepared.height },
    ink:prepared.ink,
    language:language || 'it'
  };
}

function parseResultEntry(entry) {
  if (!Array.isArray(entry)) return '';
  const matches = Array.isArray(entry[1]) ? entry[1] : null;
  return normalizedRecognizedText(Array.isArray(matches) ? matches[0] : '');
}

function parseBatchPayload(payload, expectedCount) {
  const results = Array.isArray(payload) ? payload[1] : null;
  if (!Array.isArray(results)) return [];
  // L'endpoint restituisce un elemento risultato per ciascuna request nello stesso
  // ordine. Se arriva un solo risultato a fronte di più richieste, il batch non è
  // supportato da quella risposta e il chiamante può usare il fallback rapido.
  const texts = results.slice(0, expectedCount).map(parseResultEntry);
  return texts.length === expectedCount ? texts : [];
}

async function fetchJsonWithTimeout(body, signal, timeoutMs, timeoutName) {
  const controller = new AbortController();
  let ownTimeout = false;
  const timer = setTimeout(() => { ownTimeout = true; controller.abort(); }, timeoutMs);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener?.('abort', abortFromParent, { once:true });
  try {
    const response = await fetch(GOOGLE_HANDWRITING_API, {
      method:'POST', mode:'cors', cache:'no-store', credentials:'omit',
      headers:{ 'Content-Type':'application/json' },
      signal:controller.signal,
      body:JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`recognition-http-${response.status}`);
    return await response.json();
  } catch (error) {
    if (ownTimeout && !signal?.aborted) {
      const timeoutError = new Error(timeoutName || 'Beautify timeout');
      timeoutError.name = timeoutName || 'BeautifyTimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromParent);
  }
}

async function recognizeBatch(lines, language, signal) {
  if (!lines.length) return [];
  const payload = await fetchJsonWithTimeout({
    options:'enable_pre_space',
    requests:lines.map((line) => requestForLine(line, language))
  }, signal, GLOBAL_TIMEOUT_MS, 'BeautifyTimeoutError');
  return parseBatchPayload(payload, lines.length);
}

async function recognizeOne(line, language, signal) {
  const payload = await fetchJsonWithTimeout({
    options:'enable_pre_space',
    requests:[requestForLine(line, language)]
  }, signal, FALLBACK_LINE_TIMEOUT_MS, 'BeautifyLineTimeoutError');
  const results = Array.isArray(payload) ? payload[1] : null;
  return normalizedRecognizedText(Array.isArray(results) && Array.isArray(results[0]) && Array.isArray(results[0][1]) ? results[0][1][0] : '');
}

async function recognizeFallback(lines, language, signal, onProgress) {
  const texts = new Array(lines.length).fill('');
  let cursor = 0;
  let completed = 0;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, FALLBACK_GLOBAL_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener?.('abort', abortFromParent, { once:true });
  const worker = async () => {
    while (!controller.signal.aborted) {
      const i = cursor++;
      if (i >= lines.length) return;
      try { texts[i] = await recognizeOne(lines[i], language, controller.signal); }
      catch (error) {
        if (controller.signal.aborted) return;
        if (error?.name !== 'BeautifyLineTimeoutError') console.debug?.('Beautify fallback line skipped', error);
      } finally {
        completed += 1;
        onProgress?.({ phase:'recognition', index:completed, total:lines.length });
      }
    }
  };
  try {
    const count = Math.max(1, Math.min(FALLBACK_MAX_CONCURRENCY, lines.length));
    await Promise.all(Array.from({ length:count }, () => worker()));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (timedOut && !texts.some(Boolean)) {
      const error = new Error('Beautify fallback timeout');
      error.name = 'BeautifyTimeoutError';
      throw error;
    }
    return texts;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromParent);
    controller.abort();
  }
}

function robustAverageLineHeight(lines) {
  const values = lines
    .map((line) => finite(line?.height))
    .filter((value) => value >= 6 && value <= 220)
    .sort((a, b) => a - b);
  if (!values.length) return 32;
  // Media robusta: elimina ~15% dei valori estremi per evitare che una lettera
  // molto alta/bassa cambi la dimensione di tutto il testo Beautify.
  const trim = values.length >= 7 ? Math.max(1, Math.floor(values.length * .15)) : 0;
  const core = trim ? values.slice(trim, values.length - trim) : values;
  const mean = core.reduce((sum, value) => sum + value, 0) / Math.max(1, core.length);
  return mean;
}

function replacementFor(line, text, pageWidth, pageHeight, uniformFontSizePx) {
  const sourceItems = [...line.items].sort((a, b) => a.index - b.index);
  const color = sourceItems.find((item) => item.stroke?.color)?.stroke?.color || '#ffffff';
  return {
    text,
    sourceIds:sourceItems.map((item) => item.stroke?.id).filter(Boolean),
    sourceIndices:sourceItems.map((item) => item.index),
    x:Math.max(0, Math.min(1, line.left / pageWidth)),
    topY:Math.max(0, Math.min(1, line.top / pageHeight)),
    fontSizePx:uniformFontSizePx,
    color,
    targetWidthNorm:Math.max(0, Math.min(1, line.width / pageWidth)),
    bounds:{
      left:line.left/pageWidth, top:line.top/pageHeight,
      right:line.right/pageWidth, bottom:line.bottom/pageHeight
    }
  };
}

/**
 * Restituisce solo un piano. Mutazione, Undo/Redo, Sync e salvataggio restano
 * responsabilità del chiamante.
 */
export async function buildBeautifyPlan({ strokes, width, height, language='it', signal, onProgress, preferredFontSizePx = null } = {}) {
  const pageWidth = Math.max(1, finite(width, 1024));
  const pageHeight = Math.max(1, finite(height, 1366));
  const boxes = [];
  (Array.isArray(strokes) ? strokes : []).forEach((stroke, index) => {
    if (!isRawPenStroke(stroke)) return;
    const box = strokeBox(stroke, pageWidth, pageHeight, index);
    if (box) boxes.push(box);
  });
  if (!boxes.length) return { replacements:[], eligibleCount:0, recognizedCount:0, lineCount:0, recognitionMode:'none' };

  const lines = groupIntoLines(boxes).map((line) => ({ ...line, pageWidth, pageHeight }));
  const averageHeight = robustAverageLineHeight(lines);
  const preferred = Number(preferredFontSizePx);
  const hasPreferred = Number.isFinite(preferred) && preferred >= MIN_FONT_PX && preferred <= MAX_FONT_PX;
  // 0.1.27: se la lezione possiede già una baseline Beautify, la riutilizziamo
  // esattamente. Solo la prima conversione utile della lezione calcola la misura.
  const uniformFontSizePx = hasPreferred
    ? preferred
    : Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, averageHeight * FONT_SCALE));
  onProgress?.({ phase:'analysis', index:0, total:lines.length, uniformFontSizePx, fontSource:hasPreferred ? 'lesson-baseline' : 'board-estimate' });

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // 0.1.26 — percorso affidabile: niente tentativo batch preliminare.
  // L'endpoint Google handwriting non gestisce in modo uniforme i batch multipli
  // su Safari/iPadOS; un batch lento poteva assorbire tutto il timeout e dare
  // l'impressione che il pulsante non avesse funzionato. Avviamo subito le righe
  // in parallelo con concorrenza limitata: stessa velocita percepita, meno stalli.
  const recognitionMode = 'concurrent';
  onProgress?.({ phase:'recognition', index:0, total:lines.length, mode:'concurrent' });
  const texts = await recognizeFallback(lines, language, signal, onProgress);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const replacements = [];
  for (let i = 0; i < lines.length; i++) {
    const text = normalizedRecognizedText(texts[i]);
    if (plausibleText(text, lines[i])) replacements.push(replacementFor(lines[i], text, pageWidth, pageHeight, uniformFontSizePx));
  }
  return {
    replacements,
    eligibleCount:boxes.length,
    recognizedCount:replacements.length,
    lineCount:lines.length,
    uniformFontSizePx,
    recognitionMode
  };
}
