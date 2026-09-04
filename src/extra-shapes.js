const TAU = Math.PI * 2;
const point = (x, y) => ({ x, y });
const close = (points) => points.length ? [...points, { ...points[0] }] : points;

export const EXTRA_SHAPE_TYPES = Object.freeze([
  'trapezoid', 'parallelogram', 'octagon', 'plus', 'x-cross', 'check',
  'arrow-up-right', 'arrow-down-right', 'arrow-up-left', 'arrow-down-left',
  'arrow-double-horizontal', 'arrow-double-vertical'
]);

export const EXTRA_SHAPE_LABELS = Object.freeze({
  trapezoid:'Trapezio', parallelogram:'Parallelogramma', octagon:'Ottagono', plus:'Croce +',
  'x-cross':'Croce ×', check:'Spunta', 'arrow-up-right':'Freccia alto destra',
  'arrow-down-right':'Freccia basso destra', 'arrow-up-left':'Freccia alto sinistra',
  'arrow-down-left':'Freccia basso sinistra', 'arrow-double-horizontal':'Doppia freccia orizzontale',
  'arrow-double-vertical':'Doppia freccia verticale'
});

function polygonPoints(sides, rotation = -Math.PI / 2, radius = .46) {
  const pts=[];
  for (let i=0;i<sides;i++) {
    const a=rotation+i*TAU/sides;
    pts.push(point(.5+Math.cos(a)*radius,.5+Math.sin(a)*radius));
  }
  return close(pts);
}

function rotate(points, angle) {
  const c=Math.cos(angle), s=Math.sin(angle);
  return points.map((p)=>{
    const x=p.x-.5, y=p.y-.5;
    return point(.5+x*c-y*s,.5+x*s+y*c);
  });
}

function arrowRight() {
  return close([point(.08,.35),point(.60,.35),point(.60,.16),point(.94,.50),point(.60,.84),point(.60,.65),point(.08,.65)]);
}

function localExtraShapePoints(type) {
  switch(type) {
    case 'trapezoid': return close([point(.22,.08),point(.78,.08),point(.94,.92),point(.06,.92)]);
    case 'parallelogram': return close([point(.26,.08),point(.94,.08),point(.74,.92),point(.06,.92)]);
    case 'octagon': return polygonPoints(8, Math.PI/8);
    case 'plus': return close([point(.38,.06),point(.62,.06),point(.62,.38),point(.94,.38),point(.94,.62),point(.62,.62),point(.62,.94),point(.38,.94),point(.38,.62),point(.06,.62),point(.06,.38),point(.38,.38)]);
    case 'x-cross': return close([point(.20,.06),point(.50,.36),point(.80,.06),point(.94,.20),point(.64,.50),point(.94,.80),point(.80,.94),point(.50,.64),point(.20,.94),point(.06,.80),point(.36,.50),point(.06,.20)]);
    case 'check': return [point(.08,.55),point(.38,.84),point(.92,.12)];
    case 'arrow-up-right': return rotate(arrowRight(), -Math.PI/4);
    case 'arrow-down-right': return rotate(arrowRight(), Math.PI/4);
    case 'arrow-up-left': return rotate(arrowRight(), -3*Math.PI/4);
    case 'arrow-down-left': return rotate(arrowRight(), 3*Math.PI/4);
    case 'arrow-double-horizontal': return close([point(.04,.50),point(.30,.18),point(.30,.36),point(.70,.36),point(.70,.18),point(.96,.50),point(.70,.82),point(.70,.64),point(.30,.64),point(.30,.82)]);
    case 'arrow-double-vertical': return rotate(close([point(.04,.50),point(.30,.18),point(.30,.36),point(.70,.36),point(.70,.18),point(.96,.50),point(.70,.82),point(.70,.64),point(.30,.64),point(.30,.82)]), Math.PI/2);
    default: return close([point(.22,.08),point(.78,.08),point(.94,.92),point(.06,.92)]);
  }
}

export function buildExtraShapePoints(type, bounds) {
  const left=Number(bounds?.left)||0;
  const top=Number(bounds?.top)||0;
  const right=Number.isFinite(Number(bounds?.right))?Number(bounds.right):left;
  const bottom=Number.isFinite(Number(bounds?.bottom))?Number(bounds.bottom):top;
  const width=right-left, height=bottom-top;
  return localExtraShapePoints(EXTRA_SHAPE_TYPES.includes(type)?type:'trapezoid').map((p)=>({
    x:Math.max(0,Math.min(1,left+p.x*width)),
    y:Math.max(0,Math.min(1,top+p.y*height))
  }));
}

export function extraShapeIconPathData(type, size=32, padding=3) {
  const scale=Math.max(1,size-padding*2);
  return localExtraShapePoints(type).map((p,index)=>`${index?'L':'M'} ${(padding+p.x*scale).toFixed(2)} ${(padding+p.y*scale).toFixed(2)}`).join(' ');
}
