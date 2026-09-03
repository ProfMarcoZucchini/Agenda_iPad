const TAU = Math.PI * 2;

export const SHAPE_TYPES = Object.freeze([
  'line', 'curve', 'ellipse', 'rectangle', 'rounded-rectangle', 'right-triangle', 'triangle',
  'left-triangle', 'diamond', 'pentagon', 'hexagon', 'arrow-right', 'arrow-left', 'arrow-up',
  'arrow-down', 'sparkle', 'star', 'burst', 'speech-rect', 'speech-oval', 'thought-cloud',
  'heart', 'lightning'
]);

export const SHAPE_LABELS = Object.freeze({
  line:'Linea', curve:'Curva', ellipse:'Cerchio o ellisse', rectangle:'Rettangolo',
  'rounded-rectangle':'Rettangolo arrotondato', 'right-triangle':'Triangolo rettangolo', triangle:'Triangolo',
  'left-triangle':'Triangolo sinistro', diamond:'Rombo', pentagon:'Pentagono', hexagon:'Esagono',
  'arrow-right':'Freccia destra', 'arrow-left':'Freccia sinistra', 'arrow-up':'Freccia su',
  'arrow-down':'Freccia giù', sparkle:'Scintilla', star:'Stella', burst:'Esplosione',
  'speech-rect':'Fumetto rettangolare', 'speech-oval':'Fumetto ovale', 'thought-cloud':'Fumetto pensiero',
  heart:'Cuore', lightning:'Fulmine'
});

const close = (points) => points.length ? [...points, { ...points[0] }] : points;
const point = (x, y) => ({ x, y });

function sampleArc(cx, cy, rx, ry, start, end, count, includeStart = true) {
  const points = [];
  for (let i = includeStart ? 0 : 1; i <= count; i++) {
    const a = start + (end - start) * (i / count);
    points.push(point(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return points;
}

function ellipsePoints(count = 48) {
  return close(sampleArc(.5, .5, .46, .43, -Math.PI / 2, Math.PI * 1.5, count));
}

function polygonPoints(sides, rotation = -Math.PI / 2, radius = .46) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + i * TAU / sides;
    points.push(point(.5 + Math.cos(a) * radius, .5 + Math.sin(a) * radius));
  }
  return close(points);
}

function starPoints(spikes, innerRadius, outerRadius = .47, rotation = -Math.PI / 2) {
  const points = [];
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 ? innerRadius : outerRadius;
    const a = rotation + i * Math.PI / spikes;
    points.push(point(.5 + Math.cos(a) * radius, .5 + Math.sin(a) * radius));
  }
  return close(points);
}

function roundedRectanglePoints() {
  const points = [];
  const arcs = [
    [.18,.18,-Math.PI,-Math.PI/2], [.82,.18,-Math.PI/2,0],
    [.82,.82,0,Math.PI/2], [.18,.82,Math.PI/2,Math.PI]
  ];
  for (const [cx,cy,start,end] of arcs) points.push(...sampleArc(cx,cy,.14,.14,start,end,6,points.length === 0));
  return close(points);
}

function cubicCurvePoints(count = 36) {
  const p0 = point(.04,.72), p1 = point(.28,.04), p2 = point(.64,.98), p3 = point(.96,.28);
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    points.push(point(
      u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y
    ));
  }
  return points;
}

function speechOvalPoints() {
  const points = sampleArc(.5,.46,.45,.34,-Math.PI/2,Math.PI*1.5,40);
  const insertAt = 21;
  points.splice(insertAt, 0, point(.36,.92), point(.48,.77));
  return close(points);
}

function thoughtCloudPoints() {
  const points = [];
  const count = 56;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + i * TAU / count;
    const ripple = 1 + .11 * Math.cos(8 * a);
    points.push(point(.5 + Math.cos(a) * .43 * ripple, .45 + Math.sin(a) * .32 * ripple));
  }
  points.splice(30, 0, point(.34,.91), point(.44,.76));
  return close(points);
}

function heartPoints(count = 64) {
  const raw = [];
  for (let i = 0; i <= count; i++) {
    const t = i * TAU / count;
    raw.push(point(16 * Math.sin(t) ** 3, -(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))));
  }
  const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return raw.map((p) => point(.06 + .88*(p.x-minX)/(maxX-minX), .05 + .90*(p.y-minY)/(maxY-minY)));
}

export function localShapePoints(type) {
  switch (type) {
    case 'line': return [point(.05,.92),point(.95,.08)];
    case 'curve': return cubicCurvePoints();
    case 'ellipse': return ellipsePoints();
    case 'rectangle': return close([point(.06,.08),point(.94,.08),point(.94,.92),point(.06,.92)]);
    case 'rounded-rectangle': return roundedRectanglePoints();
    case 'right-triangle': return close([point(.07,.08),point(.07,.92),point(.94,.92)]);
    case 'triangle': return close([point(.5,.05),point(.95,.93),point(.05,.93)]);
    case 'left-triangle': return close([point(.05,.08),point(.94,.92),point(.05,.92)]);
    case 'diamond': return close([point(.5,.04),point(.96,.5),point(.5,.96),point(.04,.5)]);
    case 'pentagon': return polygonPoints(5);
    case 'hexagon': return polygonPoints(6);
    case 'arrow-right': return close([point(.05,.34),point(.62,.34),point(.62,.12),point(.96,.5),point(.62,.88),point(.62,.66),point(.05,.66)]);
    case 'arrow-left': return close([point(.95,.34),point(.38,.34),point(.38,.12),point(.04,.5),point(.38,.88),point(.38,.66),point(.95,.66)]);
    case 'arrow-up': return close([point(.34,.95),point(.34,.38),point(.12,.38),point(.5,.04),point(.88,.38),point(.66,.38),point(.66,.95)]);
    case 'arrow-down': return close([point(.34,.05),point(.34,.62),point(.12,.62),point(.5,.96),point(.88,.62),point(.66,.62),point(.66,.05)]);
    case 'sparkle': return starPoints(4,.16,.47);
    case 'star': return starPoints(5,.21,.47);
    case 'burst': return starPoints(10,.30,.48);
    case 'speech-rect': return close([point(.14,.10),point(.86,.10),point(.94,.20),point(.94,.65),point(.85,.75),point(.58,.75),point(.38,.94),point(.42,.75),point(.14,.75),point(.06,.65),point(.06,.20)]);
    case 'speech-oval': return speechOvalPoints();
    case 'thought-cloud': return thoughtCloudPoints();
    case 'heart': return heartPoints();
    case 'lightning': return close([point(.58,.03),point(.18,.55),point(.45,.55),point(.31,.97),point(.84,.38),point(.56,.38)]);
    default: return close([point(.06,.08),point(.94,.08),point(.94,.92),point(.06,.92)]);
  }
}

export function buildShapePoints(type, bounds) {
  const left = Number(bounds?.left) || 0;
  const top = Number(bounds?.top) || 0;
  const right = Number.isFinite(Number(bounds?.right)) ? Number(bounds.right) : left;
  const bottom = Number.isFinite(Number(bounds?.bottom)) ? Number(bounds.bottom) : top;
  const width = right - left;
  const height = bottom - top;
  return localShapePoints(SHAPE_TYPES.includes(type) ? type : 'rectangle').map((p) => ({
    x: Math.max(0, Math.min(1, left + p.x * width)),
    y: Math.max(0, Math.min(1, top + p.y * height))
  }));
}

export function shapePathData(points, width, height, yOffset = 0) {
  if (!Array.isArray(points) || !points.length) return '';
  return points.map((p, index) => `${index ? 'L' : 'M'} ${(Number(p.x)*width).toFixed(2)} ${(Number(p.y)*height-yOffset).toFixed(2)}`).join(' ');
}

export function shapeIconPathData(type, size = 32, padding = 3) {
  const scale = Math.max(1, size - padding * 2);
  return localShapePoints(type).map((p, index) => `${index ? 'L' : 'M'} ${(padding+p.x*scale).toFixed(2)} ${(padding+p.y*scale).toFixed(2)}`).join(' ');
}
