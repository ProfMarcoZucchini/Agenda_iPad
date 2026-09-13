// Read-only document geometry for PDF export. Never used by the live Ink loop.
export const PDF_GEOMETRY = Object.freeze({ width:1654, height:2339, margin:72, bottom:94, firstTop:226, gap:28, maxGap:42 });
const numeric = (value,fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const isText = item => item?.kind === 'text' || item?.tool === 'keyboard-text';
const union = (a,b) => ({ left:Math.min(a.left,b.left),top:Math.min(a.top,b.top),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom) });

export function lessonPdfTitle(lesson) {
  const raw = String(lesson.acquisitionDate || '').trim();
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
  const day = date ? `${date[3]}/${date[2]}/${date[1]}` : raw || 'data non indicata';
  return `Nota di ${lesson.subject || 'Lezione'} - ${lesson.topic || 'Appunti'} del ${day}`;
}

export function pdfTextStyle(item,metrics) {
  const beautify = item?.source === 'beautify';
  const size = Math.max(beautify ? 14 : 18,Math.min(beautify ? 92 : 72,numeric(item?.fontSizeNorm,38 / metrics.paperHeight) * metrics.paperHeight));
  const family = String(item?.fontFamily || '').trim();
  const validFamily = /^[A-Za-z0-9 _.-]{1,80}$/.test(family) ? `"${family}", ` : '';
  return { size,font:`${size}px ${validFamily}"Snell Roundhand", "Apple Chancery", "Segoe Script", "Segoe Print", cursive`,
    baseline:item?.anchorMode === 'baseline' ? 'alphabetic' : 'top' };
}

function sectionsFor(records,lesson,metrics) {
  const prefix = `lesson::${lesson.id}::`;
  const segments = new Map(), extras = [];
  for (const record of records) {
    if (String(record?.lessonId || '') !== String(lesson.id) && !String(record?.date || '').startsWith(prefix)) continue;
    if (record.kind === 'agenda-day-ink') {
      const keyIndex = /::(?:segment|board)::(\d+)$/.exec(String(record.date || ''));
      const index = Math.max(1,numeric(record.lessonBoardIndex,numeric(keyIndex?.[1],1)));
      const previous = segments.get(index);
      if (!previous || String(record.modifiedAt || '') >= String(previous.modifiedAt || '')) segments.set(index,record);
    } else if (/^(day-note|planner-day)-ink$/.test(String(record.kind))) extras.push(record);
  }
  const sections = [{ label:'',records:[...segments].sort((a,b)=>a[0]-b[0]).map(([index,record])=>({record,offset:(index-1)*metrics.height})) }];
  for (const record of extras.sort((a,b)=>String(a.date).localeCompare(String(b.date)))) {
    sections.push({label:record.kind === 'planner-day-ink' ? 'Obiettivi della lezione' : `Note ${numeric(record.noteIndex,1)}`,
      records:[{record,offset:0}]});
  }
  return sections;
}

function strokeItem(value,offset,order,metrics,measureText) {
  if (isText(value)) {
    const text = String(value.text || '');
    if (!text.trim()) return null;
    const typography = pdfTextStyle(value,metrics), size = typography.size;
    const x = Math.max(0,Math.min(metrics.width,numeric(value.x) * metrics.width));
    const y = offset + Math.max(0,Math.min(metrics.paperHeight,numeric(value.y) * metrics.paperHeight)) - metrics.top;
    let bounds = null;
    text.split(/\r?\n/).forEach((line,index)=>{
      const measured = measureText?.(line || ' ',typography) || {width:Array.from(line).length * size * .75};
      const width = Math.max(size*.35,numeric(measured.width));
      const target = value.source === 'beautify' ? numeric(value.targetWidthNorm)*metrics.width : 0;
      const squeeze = target > 1 ? Math.min(1,target / width) : 1;
      const lineY = y + index * size * 1.05;
      // Include italic overhangs, accents and descenders. Never clamp to a tile.
      const left = Math.max(size*.18,numeric(measured.actualBoundingBoxLeft)*squeeze);
      const right = Math.max(width,numeric(measured.actualBoundingBoxRight))*squeeze + size*.18;
      const ascent = typography.baseline === 'alphabetic' ? Math.max(size,numeric(measured.actualBoundingBoxAscent)) : Math.max(size*.18,numeric(measured.actualBoundingBoxAscent));
      const descent = typography.baseline === 'alphabetic' ? Math.max(size*.3,numeric(measured.actualBoundingBoxDescent)) : Math.max(size*1.3,numeric(measured.actualBoundingBoxDescent));
      const box = {left:x-left-2,top:lineY-ascent-2,right:x+right+2,bottom:lineY+descent+2};
      bounds = bounds ? union(bounds,box) : box;
    });
    return {kind:'stroke',value,order,x,y,typography,bounds};
  }
  if (!Array.isArray(value?.points) || !value.points.length) return null;
  const points = value.points.map(point=>{
    if (!Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) throw new Error('Tratto con coordinate non valide: PDF interrotto.');
    return {...point,x:Number(point.x)*metrics.width,y:offset+Number(point.y)*metrics.paperHeight-metrics.top};
  });
  const pad = Math.max(.7,numeric(value.width,2.5)/2)+3;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for (const point of points) {left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y);}
  return {kind:'stroke',value,points,order,bounds:{left:left-pad,top:top-pad,right:right+pad,bottom:bottom+pad}};
}

function imageItem(value,offset,order,metrics) {
  const x=Number(value.x)*metrics.width,y=offset+Number(value.y)*metrics.height,w=Number(value.w)*metrics.width,h=Number(value.h)*metrics.height;
  if (![x,y,w,h].every(Number.isFinite) || w<=0 || h<=0) throw new Error('Immagine con dimensioni non valide: PDF interrotto.');
  const angle=numeric(value.rotation)*Math.PI/180;
  const halfX=(Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle)))/2;
  const halfY=(Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle)))/2;
  return {kind:'image',value,order,x,y,w,h,angle,
    bounds:{left:x+w/2-halfX-3,top:y+h/2-halfY-3,right:x+w/2+halfX+3,bottom:y+h/2+halfY+3}};
}

function contentBlocks(section,metrics,measureText) {
  const groups = new Map(), erasers = []; let order=0;
  for (const {record,offset} of section.records) {
    for (const stroke of record.strokes || []) {
      const item = strokeItem(stroke,offset,order++,metrics,measureText);
      if (!item) continue;
      if (stroke.tool === 'eraser') {erasers.push(item);continue;}
      // Fragments of one logical stroke must always remain on the same sheet.
      const key = stroke.continuousStrokeGroupId ? `group:${stroke.continuousStrokeGroupId}` : `item:${item.order}`;
      const group = groups.get(key);
      if (group) {group.items.push(item);group.bounds=union(group.bounds,item.bounds);}
      else groups.set(key,{items:[item],bounds:item.bounds});
    }
    for (const image of record.images || []) {
      const item=imageItem(image,offset,order++,metrics);
      groups.set(`item:${item.order}`,{items:[item],bounds:item.bounds});
    }
  }
  const blocks=[], joinGap=Math.max(10,Math.min(24,metrics.height*.022));
  for (const group of [...groups.values()].sort((a,b)=>a.bounds.top-b.bounds.top || a.bounds.left-b.bounds.left)) {
    const previous=blocks.at(-1);
    // A page break is allowed only across a clear horizontal band. Connected
    // or nearby parts of a drawing, words and overlapping images stay together.
    if (previous && group.bounds.top<=previous.bounds.bottom+joinGap) {
      previous.items.push(...group.items);previous.bounds=union(previous.bounds,group.bounds);
    } else blocks.push({items:[...group.items],bounds:{...group.bounds},label:''});
  }
  if (blocks.length) blocks[0].label=section.label;
  for (const block of blocks) {
    // An eraser contributes no occupied area. Replay it only in affected blocks,
    // in its original paint order, without erasing images underneath the Ink.
    for (const eraser of erasers) if (eraser.bounds.top<=block.bounds.bottom && eraser.bounds.bottom>=block.bounds.top) block.items.push(eraser);
    block.items.sort((a,b)=>a.order-b.order);
  }
  return blocks;
}

export function planLessonPdf(records,lesson,metrics,{firstTop=PDF_GEOMETRY.firstTop,measureText}={}) {
  if (![metrics.width,metrics.paperHeight,metrics.height].every(value=>Number.isFinite(value)&&value>0)) throw new Error('Dimensioni del foglio non disponibili.');
  const g=PDF_GEOMETRY,bodyWidth=g.width-2*g.margin,normalCapacity=g.height-g.margin-g.bottom;
  const firstCapacity=g.height-firstTop-g.bottom;
  if (firstCapacity<=100) throw new Error('Titolo troppo esteso per la prima pagina.');
  const blocks=sectionsFor(records,lesson,metrics).flatMap(section=>contentBlocks(section,metrics,measureText));
  blocks.forEach((block,index)=>{
    block.left=Math.min(0,block.bounds.left);block.right=Math.max(metrics.width,block.bounds.right);
    block.top=block.bounds.top;block.sourceWidth=block.right-block.left;block.sourceHeight=Math.max(1,block.bounds.bottom-block.top);
    block.labelHeight=block.label ? 42 : 0;
    block.naturalScale=bodyWidth/block.sourceWidth;
    const capacity=index===0 ? firstCapacity : normalCapacity;
    block.scale=Math.min(block.naturalScale,(capacity-block.labelHeight)/block.sourceHeight);
    block.fitted=block.scale<block.naturalScale-1e-8;
    block.height=block.sourceHeight*block.scale+block.labelHeight;
    block.width=block.sourceWidth*block.scale;
  });
  if (!blocks.length) return [{blocks:[],top:firstTop,capacity:firstCapacity,used:0}];
  const n=blocks.length,prefix=[0];
  for (const block of blocks) prefix.push(prefix.at(-1)+block.height+g.gap);
  const used=(from,to)=>prefix[to]-prefix[from]-g.gap;
  // Minimum page count, preserving order and the integrity of every block.
  let count=0,start=0;
  while (start<n) {
    const cap=count===0 ? firstCapacity : normalCapacity;
    let end=start+1;
    while (end<n && used(start,end+1)<=cap+1e-7) end++;
    start=end;count++;
  }
  if (count>2000) throw new Error('Lezione troppo estesa per un singolo PDF.');
  // Linear sliding window + suffix counts avoids quadratic page-layout work.
  const next=new Array(n),suffix=new Array(n+1).fill(0);
  let end=0;
  for (let i=0;i<n;i++) {
    end=Math.max(end,i+1);
    while (end<n && used(i,end+1)<=normalCapacity+1e-7) end++;
    next[i]=end;
  }
  for (let i=n-1;i>=0;i--) suffix[i]=1+suffix[next[i]];
  const pages=[];start=0;
  for (let p=0;p<count;p++) {
    const remaining=count-p,cap=p===0 ? firstCapacity : normalCapacity;
    const target=(prefix[n]-prefix[start]-remaining*g.gap)/(cap+(remaining-1)*normalCapacity)*cap;
    let best=start+1,score=Infinity;
    for (let j=start+1;j<=n;j++) {
      const height=used(start,j);
      if (height>cap+1e-7) break;
      if (suffix[j]>remaining-1 || n-j<remaining-1) continue;
      const distance=Math.abs(height-target);
      if (distance<score) {best=j;score=distance;}
    }
    if (!Number.isFinite(score)) throw new Error('Impossibile impaginare la lezione senza dividere il contenuto.');
    const selected=blocks.slice(start,best),baseUsed=used(start,best);
    const gap=selected.length>1 ? Math.min(g.maxGap,g.gap+(cap-baseUsed)*.1/(selected.length-1)) : 0;
    let y=p===0 ? firstTop : g.margin;
    const placed=selected.map(block=>{const placed={...block,x:g.margin+(bodyWidth-block.width)/2,y};y+=block.height+gap;return placed;});
    pages.push({blocks:placed,top:p===0 ? firstTop : g.margin,capacity:cap,used:y-(p===0 ? firstTop : g.margin)-gap});
    start=best;
  }
  return pages;
}

export function localPdfStroke(item,block,metrics) {
  const value={...item.value};
  if (item.points) value.points=item.points.map(point=>({...point,x:(point.x-block.left)/block.sourceWidth,y:(point.y-block.top)/block.sourceHeight}));
  else {
    value.x=(item.x-block.left)/block.sourceWidth;value.y=(item.y-block.top)/block.sourceHeight;
    value.fontSizeNorm=item.typography.size/block.sourceHeight;
    value.targetWidthNorm=numeric(value.targetWidthNorm)*metrics.width/block.sourceWidth;
  }
  // Neutral white marks drawn on dark paper also need to survive white export.
  if (value.tool!=='eraser' && /^#(?:fff|ffffff|f[0-9a-f]f[0-9a-f]f[0-9a-f])$/i.test(String(value.color))) value.color='#202020';
  return value;
}
