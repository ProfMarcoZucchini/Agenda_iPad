const EPS = 1e-9;

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function cssPoint(point, widthPx, heightPx) {
  return { x: clamp01(point?.x) * widthPx, y: clamp01(point?.y) * heightPx };
}

function interpolatePoint(a, b, t) {
  const mix = (x, y) => Number.isFinite(Number(x)) && Number.isFinite(Number(y))
    ? Number(x) + (Number(y) - Number(x)) * t
    : (Number.isFinite(Number(x)) ? Number(x) : Number(y) || 0);
  return {
    x: clamp01(mix(a?.x, b?.x)),
    y: clamp01(mix(a?.y, b?.y)),
    p: mix(a?.p, b?.p),
    t: mix(a?.t, b?.t)
  };
}

function distanceSqPointSegment(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const vv = vx * vx + vy * vy;
  if (vv <= EPS) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return dx * dx + dy * dy;
  }
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  const dx = p.x - (a.x + t * vx);
  const dy = p.y - (a.y + t * vy);
  return dx * dx + dy * dy;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

function distanceSqSegmentSegment(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    distanceSqPointSegment(a, c, d),
    distanceSqPointSegment(b, c, d),
    distanceSqPointSegment(c, a, b),
    distanceSqPointSegment(d, a, b)
  );
}

function segmentNearEraser(a, b, eraserCss, radiusPx) {
  const thresholdSq = radiusPx * radiusPx;
  if (eraserCss.length === 1) return distanceSqPointSegment(eraserCss[0], a, b) <= thresholdSq;
  for (let i = 1; i < eraserCss.length; i++) {
    if (distanceSqSegmentSegment(a, b, eraserCss[i - 1], eraserCss[i]) <= thresholdSq) return true;
  }
  return false;
}

function perpendicularDistanceSq(p, a, b) {
  return distanceSqPointSegment(p, a, b);
}

function rdpIndices(points, tolerancePx) {
  if (points.length <= 2) return points.map((_, i) => i);
  const tolSq = tolerancePx * tolerancePx;
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceSq(points[i], points[start], points[end]);
      if (d > maxDist) { maxDist = d; maxIndex = i; }
    }
    if (maxIndex > 0 && maxDist > tolSq) {
      keep.add(maxIndex);
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

function simplifyNormalizedPoints(points, widthPx, heightPx, tolerancePx = 0.35) {
  if (!Array.isArray(points) || points.length <= 2) return points || [];
  const css = points.map((p) => cssPoint(p, widthPx, heightPx));
  const indices = rdpIndices(css, tolerancePx);
  return indices.map((i) => points[i]);
}

function bboxOfCssPoints(points) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function expandedBbox(box, amount) {
  return box ? {
    minX: box.minX - amount,
    minY: box.minY - amount,
    maxX: box.maxX + amount,
    maxY: box.maxY + amount
  } : null;
}

function boxesOverlap(a, b) {
  return Boolean(a && b && a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY);
}

function pointErased(cssPointValue, eraserCss, radiusPx) {
  const thresholdSq = radiusPx * radiusPx;
  if (eraserCss.length === 1) {
    const dx = cssPointValue.x - eraserCss[0].x;
    const dy = cssPointValue.y - eraserCss[0].y;
    return dx * dx + dy * dy <= thresholdSq;
  }
  for (let i = 1; i < eraserCss.length; i++) {
    if (distanceSqPointSegment(cssPointValue, eraserCss[i - 1], eraserCss[i]) <= thresholdSq) return true;
  }
  return false;
}

function densifyStrokePoints(points, widthPx, heightPx, maxStepPx) {
  if (!points.length) return [];
  if (points.length === 1) return [points[0]];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const ac = cssPoint(a, widthPx, heightPx);
    const bc = cssPoint(b, widthPx, heightPx);
    const len = Math.hypot(bc.x - ac.x, bc.y - ac.y);
    const steps = Math.max(1, Math.ceil(len / maxStepPx));
    for (let k = 1; k <= steps; k++) result.push(interpolatePoint(a, b, k / steps));
  }
  return result;
}

function pathLengthPx(points, widthPx, heightPx) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = cssPoint(points[i - 1], widthPx, heightPx);
    const b = cssPoint(points[i], widthPx, heightPx);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function defaultFragmentId(stroke, eraserStroke, index) {
  return `${String(stroke?.id || 'stroke')}-fragment-${String(eraserStroke?.id || 'erase')}-${index + 1}`;
}

function clipStroke(stroke, eraserStroke, geometry, makeFragmentId) {
  const { widthPx, heightPx, eraserCss, eraserBox } = geometry;
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  if (!points.length || stroke?.tool === 'eraser') return { changed: false, fragments: [stroke] };

  const targetCss = points.map((p) => cssPoint(p, widthPx, heightPx));
  const targetBox = bboxOfCssPoints(targetCss);
  const combinedRadius = Math.max(0.7, (Number(eraserStroke?.width) || 12) / 2 + (Number(stroke?.width) || 2) / 2);
  if (!boxesOverlap(expandedBbox(targetBox, combinedRadius), eraserBox)) return { changed: false, fragments: [stroke] };

  const stepPx = Math.max(0.8, Math.min(2.0, combinedRadius / 4));
  const groups = [];
  let current = [];
  let anyErased = false;
  let previousErased = pointErased(targetCss[0], eraserCss, combinedRadius);
  if (previousErased) anyErased = true;
  else current.push(points[0]);

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const ac = targetCss[i - 1];
    const bc = targetCss[i];
    const endpointErased = pointErased(bc, eraserCss, combinedRadius);
    const nearMask = previousErased || endpointErased || segmentNearEraser(ac, bc, eraserCss, combinedRadius);

    if (!nearMask) {
      if (!previousErased) current.push(b);
      previousErased = endpointErased;
      continue;
    }

    const len = Math.hypot(bc.x - ac.x, bc.y - ac.y);
    const steps = Math.max(1, Math.ceil(len / stepPx));
    for (let k = 1; k <= steps; k++) {
      const sample = k === steps ? b : interpolatePoint(a, b, k / steps);
      const erased = k === steps ? endpointErased : pointErased(cssPoint(sample, widthPx, heightPx), eraserCss, combinedRadius);
      if (erased) {
        anyErased = true;
        if (current.length) { groups.push(current); current = []; }
      } else {
        current.push(sample);
      }
      previousErased = erased;
    }
  }
  if (current.length) groups.push(current);
  if (!anyErased) return { changed: false, fragments: [stroke] };

  const fragments = [];
  for (const group of groups) {
    if (!group.length) continue;
    const simplified = simplifyNormalizedPoints(group, widthPx, heightPx, 0.3);
    const meaningful = simplified.length >= 2 ? pathLengthPx(simplified, widthPx, heightPx) >= 0.35 : points.length === 1;
    if (!meaningful) continue;
    const fragmentIndex = fragments.length;
    fragments.push({
      ...stroke,
      id: makeFragmentId(stroke, eraserStroke, fragmentIndex),
      fragmentOf: stroke.fragmentOf || stroke.id,
      points: simplified
    });
  }
  return { changed: true, fragments };
}

/**
 * Converte una passata di gomma raster in modifiche strutturali agli stroke.
 * La funzione NON conserva lo stroke gomma nello stato persistente.
 */
export function structuralErase(strokes, eraserStroke, options = {}) {
  const widthPx = Math.max(1, Number(options.widthPx) || 1024);
  const heightPx = Math.max(1, Number(options.heightPx) || 1366);
  const makeFragmentId = typeof options.makeFragmentId === 'function' ? options.makeFragmentId : defaultFragmentId;
  const eligible = typeof options.eligible === 'function' ? options.eligible : () => true;
  const eraserPoints = Array.isArray(eraserStroke?.points) ? eraserStroke.points : [];
  if (!eraserPoints.length) return { strokes: [...(strokes || [])], changes: [], touched: 0, fragments: 0 };

  const rawEraserCss = eraserPoints.map((p) => cssPoint(p, widthPx, heightPx));
  const simplifiedIndices = rdpIndices(rawEraserCss, 0.7);
  const eraserCss = simplifiedIndices.map((i) => rawEraserCss[i]);
  const eraserRadius = Math.max(0.7, (Number(eraserStroke?.width) || 12) / 2);
  const eraserBox = expandedBbox(bboxOfCssPoints(eraserCss), eraserRadius);
  const geometry = { widthPx, heightPx, eraserCss, eraserBox };

  const output = [];
  const changes = [];
  for (let index = 0; index < (strokes || []).length; index++) {
    const stroke = strokes[index];
    if (!eligible(stroke, index) || stroke?.tool === 'eraser') {
      output.push(stroke);
      continue;
    }
    const clipped = clipStroke(stroke, eraserStroke, geometry, makeFragmentId);
    if (!clipped.changed) {
      output.push(stroke);
      continue;
    }
    const at = output.length;
    output.push(...clipped.fragments);
    changes.push({ original: stroke, originalIndex: index, outputIndex: at, fragments: clipped.fragments });
  }

  return {
    strokes: output,
    changes,
    touched: changes.length,
    fragments: changes.reduce((sum, change) => sum + change.fragments.length, 0)
  };
}
