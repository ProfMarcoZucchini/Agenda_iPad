export function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i]?.x) || 0;
    const yi = Number(polygon[i]?.y) || 0;
    const xj = Number(polygon[j]?.x) || 0;
    const yj = Number(polygon[j]?.y) || 0;
    const crosses = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-10) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return b.x <= Math.max(a.x, c.x) + 1e-10 && b.x + 1e-10 >= Math.min(a.x, c.x)
    && b.y <= Math.max(a.y, c.y) + 1e-10 && b.y + 1e-10 >= Math.min(a.y, c.y);
}

export function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

export function polygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += (Number(polygon[j]?.x) || 0) * (Number(polygon[i]?.y) || 0)
      - (Number(polygon[i]?.x) || 0) * (Number(polygon[j]?.y) || 0);
  }
  return Math.abs(sum) / 2;
}

export function isClosedLasso(points, widthPx, heightPx, thresholdPx = 30) {
  if (!Array.isArray(points) || points.length < 6) return false;
  const first = points[0];
  const last = points.at(-1);
  const dx = ((Number(last?.x) || 0) - (Number(first?.x) || 0)) * Math.max(1, widthPx || 1);
  const dy = ((Number(last?.y) || 0) - (Number(first?.y) || 0)) * Math.max(1, heightPx || 1);
  return Math.hypot(dx, dy) <= thresholdPx && polygonArea(points) >= 0.00005;
}

export function strokeIntersectsPolygon(stroke, polygon) {
  if (!stroke || !Array.isArray(polygon) || polygon.length < 3) return false;
  if (stroke.kind === 'text' || stroke.tool === 'keyboard-text' || stroke.tool === 'voice-text') {
    return pointInPolygon({ x: Number(stroke.x) || 0, y: Number(stroke.y) || 0 }, polygon);
  }
  const points = Array.isArray(stroke.points) ? stroke.points : [];
  if (!points.length) return false;
  if (points.some((point) => pointInPolygon(point, polygon))) return true;
  for (let i = 1; i < points.length; i++) {
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j];
      const b = polygon[(j + 1) % polygon.length];
      if (segmentsIntersect(points[i - 1], points[i], a, b)) return true;
    }
  }
  return false;
}

export function imageIntersectsPolygon(image, polygon) {
  if (!image || !Array.isArray(polygon) || polygon.length < 3) return false;
  const x = Number(image.x) || 0;
  const y = Number(image.y) || 0;
  const w = Number(image.w) || 0;
  const h = Number(image.h) || 0;
  const corners = [
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x: x + w / 2, y: y + h / 2 }
  ];
  if (corners.some((point) => pointInPolygon(point, polygon))) return true;
  if (polygon.some((point) => point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h)) return true;
  const rectEdges = [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
  for (const [a, b] of rectEdges) {
    for (let j = 0; j < polygon.length; j++) {
      if (segmentsIntersect(a, b, polygon[j], polygon[(j + 1) % polygon.length])) return true;
    }
  }
  return false;
}

export function selectionBounds(strokes = [], images = []) {
  const points = [];
  for (const stroke of strokes) {
    if (stroke?.kind === 'text' || stroke?.tool === 'keyboard-text' || stroke?.tool === 'voice-text') {
      points.push({ x: Number(stroke.x) || 0, y: Number(stroke.y) || 0 });
    } else {
      for (const point of Array.isArray(stroke?.points) ? stroke.points : []) points.push(point);
    }
  }
  for (const image of images) {
    const x = Number(image?.x) || 0, y = Number(image?.y) || 0, w = Number(image?.w) || 0, h = Number(image?.h) || 0;
    points.push({ x, y }, { x: x + w, y: y + h });
  }
  if (!points.length) return null;
  const xs = points.map((p) => Number(p.x) || 0);
  const ys = points.map((p) => Number(p.y) || 0);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function translateStroke(stroke, dx, dy) {
  const copy = globalThis.structuredClone ? structuredClone(stroke) : JSON.parse(JSON.stringify(stroke));
  if (copy?.kind === 'text' || copy?.tool === 'keyboard-text' || copy?.tool === 'voice-text') {
    copy.x = Math.max(0, Math.min(1, (Number(copy.x) || 0) + dx));
    copy.y = Math.max(0, Math.min(1, (Number(copy.y) || 0) + dy));
  } else if (Array.isArray(copy?.points)) {
    copy.points = copy.points.map((point) => ({
      ...point,
      x: Math.max(0, Math.min(1, (Number(point.x) || 0) + dx)),
      y: Math.max(0, Math.min(1, (Number(point.y) || 0) + dy))
    }));
  }
  copy.modifiedAt = new Date().toISOString();
  return copy;
}

export function translateImage(image, dx, dy) {
  const copy = { ...image };
  const w = Math.max(0, Number(copy.w) || 0);
  const h = Math.max(0, Number(copy.h) || 0);
  copy.x = Math.max(0, Math.min(1 - w, (Number(copy.x) || 0) + dx));
  copy.y = Math.max(0, Math.min(1 - h, (Number(copy.y) || 0) + dy));
  copy.modifiedAt = new Date().toISOString();
  return copy;
}
