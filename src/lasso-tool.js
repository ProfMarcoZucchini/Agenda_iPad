import {
  isClosedLasso,
  strokeIntersectsPolygon,
  imageIntersectsPolygon,
  selectionBounds,
  translateStroke,
  translateImage,
  pointInPolygon
} from './lasso.js';

const CLIPBOARD_DB = 'AgendaIPadLocalLassoClipboardDB';
const CLIPBOARD_STORE = 'clipboard';
const CLIPBOARD_KEY = 'lasso-cut-v1';

function deepClone(value) {
  if (globalThis.structuredClone) return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function openClipboardDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CLIPBOARD_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLIPBOARD_STORE)) db.createObjectStore(CLIPBOARD_STORE, { keyPath:'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Clipboard Lazo non disponibile'));
  });
}

async function saveClipboard(value) {
  const db = await openClipboardDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CLIPBOARD_STORE, 'readwrite');
      tx.objectStore(CLIPBOARD_STORE).put({ key:CLIPBOARD_KEY, ...value });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Salvataggio clipboard Lazo annullato'));
    });
  } finally { db.close(); }
}

async function loadClipboard() {
  const db = await openClipboardDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CLIPBOARD_STORE, 'readonly');
      const req = tx.objectStore(CLIPBOARD_STORE).get(CLIPBOARD_KEY);
      req.onsuccess = () => {
        const row = req.result || null;
        if (row) delete row.key;
        resolve(row);
      };
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

function normalizedPointFromEvent(ev, rect, writable) {
  const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
  const yRaw = (ev.clientY - rect.top) / Math.max(1, rect.height);
  const y = Math.max(writable.yMin, Math.min(writable.yMax, yRaw));
  return { x, y };
}

function svgPath(points, width, height, close = false) {
  if (!Array.isArray(points) || !points.length) return '';
  const chunks = points.map((p, i) => `${i ? 'L' : 'M'} ${(p.x * width).toFixed(2)} ${(p.y * height).toFixed(2)}`);
  if (close) chunks.push('Z');
  return chunks.join(' ');
}

export function initLassoTool(options = {}) {
  const {
    button, overlay, path, boundsRect, inspector, cutButton, pasteButton, clearButton, hint,
    canvas, statusLabel,
    getPageKey, getDescriptor, getWritableBounds,
    getStrokes, setStrokes, getImages, setImages,
    makeStrokeId, makeImageId, cloneImage,
    recordStrokeAdded, recordStrokeDeleted, recordImageAdded, recordImageUpdated, recordImageDeleted,
    renderAll, renderImages, rememberUndo, scheduleSave, markDirty,
    onSelectionChanged
  } = options;

  let active = false;
  let gesture = null;
  let moveGesture = null;
  let selection = null;
  let clipboard = null;
  let moveRaf = 0;
  let pendingMovePoint = null;

  function pageRect() { return canvas.getBoundingClientRect(); }
  function writableBounds() { return getWritableBounds?.() || { yMin:0, yMax:1 }; }

  function currentSelectionItems() {
    if (!selection || selection.pageKey !== getPageKey()) return { strokes:[], images:[] };
    const strokeIds = new Set(selection.strokeIds || []);
    const imageIds = new Set(selection.imageIds || []);
    return {
      strokes: getStrokes().filter((item) => strokeIds.has(String(item?.id || ''))),
      images: getImages().filter((item) => imageIds.has(String(item?.id || '')))
    };
  }

  function updateUi() {
    const validSelection = selection && selection.pageKey === getPageKey();
    if (selection && !validSelection) selection = null;
    if (inspector) inspector.hidden = !active;
    if (cutButton) cutButton.disabled = !validSelection || (!(selection.strokeIds?.length) && !(selection.imageIds?.length));
    if (pasteButton) pasteButton.disabled = !clipboard || (!(clipboard.strokes?.length) && !(clipboard.images?.length));
    if (clearButton) clearButton.disabled = !validSelection;
    if (hint) {
      hint.textContent = validSelection
        ? `${selection.strokeIds.length + selection.imageIds.length} elementi · trascina per spostare`
        : clipboard ? 'Disegna un contorno chiuso · Incolla disponibile' : 'Disegna un contorno chiuso';
    }
    button?.classList.toggle('has-selection', Boolean(validSelection));
    onSelectionChanged?.(selection);
  }

  function hideOverlay() {
    if (overlay) overlay.hidden = true;
    if (path) path.setAttribute('d', '');
    if (boundsRect) boundsRect.hidden = true;
  }

  function drawSelectionOverlay() {
    if (!active) { hideOverlay(); return; }
    const r = pageRect();
    overlay?.setAttribute('viewBox', `0 0 ${Math.max(1,r.width)} ${Math.max(1,r.height)}`);
    if (gesture?.points?.length) {
      overlay.hidden = false;
      path.setAttribute('d', svgPath(gesture.points, r.width, r.height, false));
      path.classList.remove('closed');
      boundsRect.hidden = true;
      return;
    }
    if (!selection || selection.pageKey !== getPageKey() || !selection.bounds) { hideOverlay(); return; }
    overlay.hidden = false;
    if (selection.polygon?.length) {
      path.setAttribute('d', svgPath(selection.polygon, r.width, r.height, true));
      path.classList.add('closed');
    } else path.setAttribute('d','');
    const b = selection.bounds;
    boundsRect.setAttribute('x', String(b.x0 * r.width));
    boundsRect.setAttribute('y', String(b.y0 * r.height));
    boundsRect.setAttribute('width', String(Math.max(1, (b.x1 - b.x0) * r.width)));
    boundsRect.setAttribute('height', String(Math.max(1, (b.y1 - b.y0) * r.height)));
    boundsRect.hidden = false;
  }

  function setActive(value) {
    active = Boolean(value);
    if (!active) {
      gesture = null;
      moveGesture = null;
      selection = null;
      pendingMovePoint = null;
      if (moveRaf) cancelAnimationFrame(moveRaf);
      moveRaf = 0;
      hideOverlay();
    } else {
      syncPage();
      drawSelectionOverlay();
    }
    updateUi();
  }

  function syncPage() {
    if (selection && selection.pageKey !== getPageKey()) selection = null;
    if (active) drawSelectionOverlay();
    updateUi();
  }

  function clearSelection(message = '') {
    selection = null;
    gesture = null;
    moveGesture = null;
    hideOverlay();
    updateUi();
    if (message && statusLabel) statusLabel.textContent = message;
  }

  function selectFromPolygon(points) {
    const currentStrokes = getStrokes();
    const currentImages = getImages();
    const selectedStrokes = currentStrokes.filter((item) => strokeIntersectsPolygon(item, points));
    const selectedImages = currentImages.filter((item) => imageIntersectsPolygon(item, points));
    if (!selectedStrokes.length && !selectedImages.length) {
      clearSelection('Lazo chiuso · nessun elemento selezionato');
      return false;
    }
    const b = selectionBounds(selectedStrokes, selectedImages);
    selection = {
      pageKey:getPageKey(),
      strokeIds:selectedStrokes.map((item) => String(item.id)),
      imageIds:selectedImages.map((item) => String(item.id)),
      polygon:points.map((p) => ({...p})),
      bounds:b
    };
    drawSelectionOverlay();
    updateUi();
    if (statusLabel) statusLabel.textContent = `Lazo · ${selectedStrokes.length + selectedImages.length} elementi selezionati`;
    return true;
  }

  function pointerInSelection(point) {
    if (!selection?.bounds || selection.pageKey !== getPageKey()) return false;
    if (selection.polygon?.length && pointInPolygon(point, selection.polygon)) return true;
    const b=selection.bounds;
    return point.x >= b.x0 && point.x <= b.x1 && point.y >= b.y0 && point.y <= b.y1;
  }

  function beginMove(ev, point) {
    const items = currentSelectionItems();
    if (!items.strokes.length && !items.images.length) return false;
    moveGesture = {
      pointerId:ev.pointerId,
      start:point,
      beforeStrokes:items.strokes.map(deepClone),
      beforeImages:items.images.map((item) => cloneImage(item)),
      originalPolygon:selection.polygon.map((p)=>({...p})),
      originalBounds:{...selection.bounds},
      lastDx:0,
      lastDy:0
    };
    ev.preventDefault?.();
    ev.stopPropagation?.();
    return true;
  }

  function clampMove(dx, dy) {
    const b = moveGesture.originalBounds;
    const writable = writableBounds();
    return {
      dx:Math.max(-b.x0, Math.min(1 - b.x1, dx)),
      dy:Math.max(writable.yMin - b.y0, Math.min(writable.yMax - b.y1, dy))
    };
  }

  function applyMovePreview(point) {
    if (!moveGesture) return;
    const rawDx = point.x - moveGesture.start.x;
    const rawDy = point.y - moveGesture.start.y;
    const {dx,dy}=clampMove(rawDx,rawDy);
    moveGesture.lastDx=dx;
    moveGesture.lastDy=dy;
    const strokeMap = new Map(moveGesture.beforeStrokes.map((item)=>[String(item.id), translateStroke(item,dx,dy)]));
    const imageMap = new Map(moveGesture.beforeImages.map((item)=>[String(item.id), translateImage(item,dx,dy)]));
    setStrokes(getStrokes().map((item)=>strokeMap.get(String(item?.id||'')) || item));
    setImages(getImages().map((item)=>imageMap.get(String(item?.id||'')) || item));
    selection.polygon = moveGesture.originalPolygon.map((p)=>({x:p.x+dx,y:p.y+dy}));
    selection.bounds = {
      x0:moveGesture.originalBounds.x0+dx, y0:moveGesture.originalBounds.y0+dy,
      x1:moveGesture.originalBounds.x1+dx, y1:moveGesture.originalBounds.y1+dy
    };
    renderAll();
    renderImages();
    drawSelectionOverlay();
  }

  function scheduleMovePreview(point) {
    pendingMovePoint=point;
    if (moveRaf) return;
    moveRaf=requestAnimationFrame(()=>{
      moveRaf=0;
      const p=pendingMovePoint;
      pendingMovePoint=null;
      if (p) applyMovePreview(p);
    });
  }

  function handlePointerDown(ev) {
    if (!active) return false;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return true;
    const r=pageRect();
    const writable=writableBounds();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top + writable.yMin*r.height || ev.clientY > r.top + writable.yMax*r.height) return false;
    const p=normalizedPointFromEvent(ev,r,writable);
    if (selection && pointerInSelection(p)) return beginMove(ev,p);
    selection=null;
    gesture={pointerId:ev.pointerId, points:[p]};
    drawSelectionOverlay();
    updateUi();
    ev.preventDefault?.();
    ev.stopPropagation?.();
    return true;
  }

  function handlePointerMove(ev) {
    if (!active) return false;
    const r=pageRect();
    const writable=writableBounds();
    const p=normalizedPointFromEvent(ev,r,writable);
    if (moveGesture && ev.pointerId===moveGesture.pointerId) {
      scheduleMovePreview(p);
      ev.preventDefault?.();
      return true;
    }
    if (!gesture || ev.pointerId!==gesture.pointerId) return false;
    const last=gesture.points.at(-1);
    const dx=(p.x-last.x)*r.width, dy=(p.y-last.y)*r.height;
    if (dx*dx+dy*dy >= 2.25) gesture.points.push(p);
    drawSelectionOverlay();
    ev.preventDefault?.();
    return true;
  }

  function syncMovedItems(beforeStrokes,beforeImages) {
    const descriptor=getDescriptor();
    const currentStrokes=new Map(getStrokes().map((item)=>[String(item?.id||''),item]));
    const currentImages=new Map(getImages().map((item)=>[String(item?.id||''),item]));
    for (const before of beforeStrokes) {
      const after=currentStrokes.get(String(before.id));
      if (after) recordStrokeAdded(descriptor,after);
    }
    for (const before of beforeImages) {
      const after=currentImages.get(String(before.id));
      if (after) recordImageUpdated(descriptor,after,before);
    }
  }

  function finishMove() {
    if (!moveGesture) return true;
    if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf=0; }
    if (pendingMovePoint) { applyMovePreview(pendingMovePoint); pendingMovePoint=null; }
    const dx=moveGesture.lastDx, dy=moveGesture.lastDy;
    const beforeStrokes=moveGesture.beforeStrokes.map(deepClone);
    const beforeImages=moveGesture.beforeImages.map((item)=>cloneImage(item));
    const afterItems=currentSelectionItems();
    if (Math.abs(dx)>1e-6 || Math.abs(dy)>1e-6) {
      rememberUndo({
        type:'lasso-move',
        beforeStrokes,
        beforeImages,
        afterStrokes:afterItems.strokes.map(deepClone),
        afterImages:afterItems.images.map((item)=>cloneImage(item))
      });
      syncMovedItems(beforeStrokes,beforeImages);
      markDirty();
      scheduleSave();
      if (statusLabel) statusLabel.textContent='selezione spostata';
    }
    moveGesture=null;
    updateUi();
    return true;
  }

  function handlePointerUp(ev,cancelled=false) {
    if (!active) return false;
    if (moveGesture && ev.pointerId===moveGesture.pointerId) {
      if (cancelled) {
        const sMap=new Map(moveGesture.beforeStrokes.map((item)=>[String(item.id),item]));
        const iMap=new Map(moveGesture.beforeImages.map((item)=>[String(item.id),item]));
        setStrokes(getStrokes().map((item)=>sMap.get(String(item?.id||'')) || item));
        setImages(getImages().map((item)=>iMap.get(String(item?.id||'')) || item));
        if (selection) {
          selection.polygon = moveGesture.originalPolygon.map((p)=>({...p}));
          selection.bounds = {...moveGesture.originalBounds};
        }
        renderAll(); renderImages();
        drawSelectionOverlay();
        moveGesture.lastDx = 0;
        moveGesture.lastDy = 0;
      }
      return finishMove();
    }
    if (!gesture || ev.pointerId!==gesture.pointerId) return false;
    const r=pageRect();
    const pts=gesture.points;
    gesture=null;
    if (cancelled || !isClosedLasso(pts,r.width,r.height,30)) {
      clearSelection(cancelled ? 'Lazo annullato' : 'Lazo non chiuso · selezione annullata');
      return true;
    }
    const closed=[...pts,{...pts[0]}];
    selectFromPolygon(closed);
    return true;
  }

  async function cutSelection() {
    if (!selection || selection.pageKey!==getPageKey()) return false;
    const items=currentSelectionItems();
    if (!items.strokes.length && !items.images.length) return false;
    const currentStrokes=getStrokes();
    const currentImages=getImages();
    const strokeIds=new Set(items.strokes.map((item)=>String(item.id)));
    const imageIds=new Set(items.images.map((item)=>String(item.id)));
    const clip={
      version:1,
      sourcePageKey:getPageKey(),
      cutAt:new Date().toISOString(),
      bounds:selectionBounds(items.strokes,items.images),
      strokes:items.strokes.map(deepClone),
      images:items.images.map((item)=>cloneImage(item))
    };
    try {
      await saveClipboard(clip);
      clipboard=clip;
    } catch (err) {
      console.warn('Clipboard Lazo: salvataggio non riuscito',err);
      if (statusLabel) statusLabel.textContent='errore clipboard Lazo · nessun elemento rimosso';
      return false;
    }
    const action={
      type:'lasso-cut',
      strokes:items.strokes.map(deepClone),
      images:items.images.map((item)=>cloneImage(item)),
      strokeIndices:items.strokes.map((item)=>currentStrokes.findIndex((s)=>s.id===item.id)),
      imageIndices:items.images.map((item)=>currentImages.findIndex((img)=>img.id===item.id))
    };
    setStrokes(currentStrokes.filter((item)=>!strokeIds.has(String(item?.id||''))));
    setImages(currentImages.filter((item)=>!imageIds.has(String(item?.id||''))));
    const descriptor=getDescriptor();
    for (const item of items.strokes) recordStrokeDeleted(descriptor,item.id,'lasso-cut');
    for (const item of items.images) recordImageDeleted(descriptor,item.id);
    rememberUndo(action);
    markDirty();
    renderAll(); renderImages();
    clearSelection('selezione tagliata · pronta da incollare');
    scheduleSave();
    updateUi();
    return true;
  }

  function selectIds(strokeIds,imageIds) {
    const selectedStrokes=getStrokes().filter((s)=>strokeIds.has(String(s?.id||'')));
    const selectedImages=getImages().filter((img)=>imageIds.has(String(img?.id||'')));
    const b=selectionBounds(selectedStrokes,selectedImages);
    selection={
      pageKey:getPageKey(), strokeIds:[...strokeIds], imageIds:[...imageIds],
      polygon:b ? [{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x1,y:b.y1},{x:b.x0,y:b.y1},{x:b.x0,y:b.y0}] : [], bounds:b
    };
    drawSelectionOverlay(); updateUi();
  }

  async function pasteClipboard() {
    if (!clipboard) return false;
    const now=new Date().toISOString();
    const newStrokes=(clipboard.strokes||[]).map((source)=>({
      ...deepClone(source), id:makeStrokeId(), createdAt:now, modifiedAt:now
    }));
    const newImages=(clipboard.images||[]).map((source)=>({
      ...cloneImage(source), id:makeImageId(), createdAt:now, modifiedAt:now
    }));
    if (!newStrokes.length && !newImages.length) return false;
    const sIndex=getStrokes().length, iIndex=getImages().length;
    setStrokes([...getStrokes(),...newStrokes]);
    setImages([...getImages(),...newImages]);
    const descriptor=getDescriptor();
    for (const item of newStrokes) recordStrokeAdded(descriptor,item);
    for (const item of newImages) recordImageAdded(descriptor,item,clipboard.sourcePageKey);
    rememberUndo({type:'lasso-paste',strokes:newStrokes.map(deepClone),images:newImages.map((item)=>cloneImage(item)),strokeIndex:sIndex,imageIndex:iIndex});
    markDirty(); renderAll(); renderImages(); scheduleSave();
    selectIds(new Set(newStrokes.map((s)=>String(s.id))),new Set(newImages.map((img)=>String(img.id))));
    if (statusLabel) statusLabel.textContent='selezione incollata · trascina per spostarla';
    return true;
  }

  function restoreItems(strokeItems,imageItems,strokeIndices=[],imageIndices=[]) {
    const s=[...getStrokes()];
    const i=[...getImages()];
    strokeItems.forEach((item,index)=>{
      if (s.some((x)=>x.id===item.id)) return;
      const at=Math.max(0,Math.min(Number(strokeIndices[index])||0,s.length));
      s.splice(at,0,deepClone(item));
    });
    imageItems.forEach((item,index)=>{
      if (i.some((x)=>x.id===item.id)) return;
      const at=Math.max(0,Math.min(Number(imageIndices[index])||0,i.length));
      i.splice(at,0,cloneImage(item));
    });
    setStrokes(s); setImages(i);
    const d=getDescriptor();
    strokeItems.forEach((item)=>recordStrokeAdded(d,item));
    imageItems.forEach((item)=>recordImageAdded(d,item,'lasso-history'));
  }

  function removeItems(strokeItems,imageItems,reason) {
    const sids=new Set(strokeItems.map((x)=>String(x.id)));
    const iids=new Set(imageItems.map((x)=>String(x.id)));
    setStrokes(getStrokes().filter((x)=>!sids.has(String(x?.id||''))));
    setImages(getImages().filter((x)=>!iids.has(String(x?.id||''))));
    const d=getDescriptor();
    strokeItems.forEach((item)=>recordStrokeDeleted(d,item.id,reason));
    imageItems.forEach((item)=>recordImageDeleted(d,item.id));
  }

  function applyVersions(strokeItems,imageItems) {
    const sMap=new Map(strokeItems.map((x)=>[String(x.id),deepClone(x)]));
    const iMap=new Map(imageItems.map((x)=>[String(x.id),cloneImage(x)]));
    setStrokes(getStrokes().map((x)=>sMap.get(String(x?.id||'')) || x));
    setImages(getImages().map((x)=>iMap.get(String(x?.id||'')) || x));
    const d=getDescriptor();
    strokeItems.forEach((item)=>recordStrokeAdded(d,item));
    imageItems.forEach((item)=>recordImageUpdated(d,item,null));
  }

  function applyHistory(action,direction='undo') {
    if (!action?.type?.startsWith('lasso-')) return false;
    if (action.type==='lasso-cut') {
      if (direction==='undo') restoreItems(action.strokes||[],action.images||[],action.strokeIndices||[],action.imageIndices||[]);
      else removeItems(action.strokes||[],action.images||[],'redo-lasso-cut');
    } else if (action.type==='lasso-paste') {
      if (direction==='undo') removeItems(action.strokes||[],action.images||[],'undo-lasso-paste');
      else restoreItems(action.strokes||[],action.images||[],
        (action.strokes||[]).map((_,idx)=>(action.strokeIndex||0)+idx),
        (action.images||[]).map((_,idx)=>(action.imageIndex||0)+idx));
    } else if (action.type==='lasso-move') {
      applyVersions(direction==='undo' ? (action.beforeStrokes||[]) : (action.afterStrokes||[]),
        direction==='undo' ? (action.beforeImages||[]) : (action.afterImages||[]));
    } else return false;
    markDirty(); renderAll(); renderImages(); scheduleSave();
    clearSelection(direction==='undo' ? 'annullato' : 'ripristinato');
    return true;
  }


  loadClipboard().then((value)=>{clipboard=value;updateUi();}).catch((err)=>console.warn('Clipboard Lazo non caricata',err));
  updateUi();

  return {
    setActive, syncPage, clearSelection, updateUi,
    handlePointerDown, handlePointerMove, handlePointerUp,
    cutSelection, pasteClipboard, applyHistory,
    hasSelection:()=>Boolean(selection && selection.pageKey===getPageKey()),
    hasClipboard:()=>Boolean(clipboard)
  };
}
