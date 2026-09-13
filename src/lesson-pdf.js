import { planLessonPdf,lessonPdfTitle,localPdfStroke } from './lesson-pdf-layout.js';
export { planLessonPdf,lessonPdfTitle } from './lesson-pdf-layout.js';
// PDF on demand. No registration in the Ink loop and no network dependency.
const PDF_WIDTH = 1654; // A4, approximately 200 dpi; one canvas at a time.
const PDF_HEIGHT = 2339;
const PDF_FOLDER = 'Note iPad PDF';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Operazione annullata', 'AbortError'); };

export function lessonPdfFilename(lesson, now = new Date()) {
  const clean = value => String(value || '').normalize('NFC').replace(/[\u0000-\u001f<>:"/\\|?*#%]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim();
  const label = clean(`${lesson.acquisitionDate || ''} ${lesson.subject || 'Lezione'} - ${lesson.topic || 'Appunti'}`).slice(0, 140).trim();
  // Distinct exports never overwrite a previous OneDrive file silently.
  return `${label || 'Lezione'}_${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}_${String(now.getMilliseconds()).padStart(3, '0')}.pdf`;
}

async function loadPdfImage(value, blobs, { signal, loadImage }) {
  checkAbort(signal);
  let source = value.src;
  let ownedUrl = '';
  const blob = blobs?.get(value.blobHash);
  if (blob instanceof Blob || !source || !/^(data:image\/|blob:)/.test(source)) {
    if (!(blob instanceof Blob)) throw new Error(`Immagine “${value.name || value.id || ''}” non disponibile localmente. Completa la sincronizzazione e riprova.`);
    source = ownedUrl = URL.createObjectURL(blob);
  }
  try {
    return await loadImage(source, signal);
  } finally { if (ownedUrl) URL.revokeObjectURL(ownedUrl); }
}

function browserLoadImage(source, signal) {
  return new Promise((resolve,reject) => {
    const img = new Image();
    const finish = (error) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      img.onload = img.onerror = null;
      if (error) { img.src = ''; reject(error); } else resolve(img);
    };
    const abort = () => finish(new DOMException('Operazione annullata','AbortError'));
    const timer = setTimeout(() => finish(new Error('Lettura immagine scaduta. Riprova dopo averne verificato la disponibilità.')), 30000);
    img.onload = () => finish(); img.onerror = () => finish(new Error('Immagine non leggibile: il PDF non è stato esportato.'));
    signal?.addEventListener('abort', abort, { once:true });
    img.src = source;
  });
}

function canvasBlob(canvas) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Memoria insufficiente per creare il PDF.')), 'image/jpeg', .96));
}

function titleLayout(ctx,title) {
  let size=42,lines=[];
  do {
    ctx.font=`italic ${size}px Georgia, "Times New Roman", serif`;
    lines=[''];
    for (const word of title.split(/\s+/)) {
      const last=lines.at(-1),candidate=last ? `${last} ${word}` : word;
      if (last && ctx.measureText(candidate).width>PDF_WIDTH-144) lines.push(word);
      else lines[lines.length-1]=candidate;
    }
    if (lines.length<=4 || size<=28) break;
    size-=2;
  } while(true);
  return {size,lines,lineHeight:size*1.25,firstTop:72+lines.length*size*1.25+44};
}

export async function buildLessonPdf(snapshot, {
  drawStroke, signal, onProgress = () => {}, includePreview = false,
  createCanvas = () => document.createElement('canvas'), loadImage = browserLoadImage,
  encodeCanvas = canvasBlob
} = {}) {
  checkAbort(signal);
  const { PDFDocument } = await import('./vendor/pdf-lib.esm.min.js');
  const pdf = await PDFDocument.create();
  const { lesson,metrics:m,records,blobs }=snapshot;
  const previewPages=[],title=lessonPdfTitle(lesson);
  pdf.setTitle(title);pdf.setCreator('Note iPad');pdf.setProducer('Note iPad - PDF lezioni');
  const output=createCanvas();output.width=PDF_WIDTH;output.height=PDF_HEIGHT;
  const ink=createCanvas();
  try {
    const ctx=output.getContext('2d'),heading=titleLayout(ctx,title);
    const pages=planLessonPdf(records,lesson,m,{firstTop:heading.firstTop,measureText:(text,style)=>{
      ctx.font=style.font;ctx.textBaseline=style.baseline;return ctx.measureText(text);
    }});
    for(let n=0;n<pages.length;n++) {
      checkAbort(signal);onProgress(n,pages.length);await tick();
      ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,PDF_WIDTH,PDF_HEIGHT);
      ctx.textAlign='left';ctx.textBaseline='top';
      if(n===0) {
        ctx.font=`italic ${heading.size}px Georgia, "Times New Roman", serif`;ctx.fillStyle='#282828';
        heading.lines.forEach((line,index)=>ctx.fillText(line,72,72+index*heading.lineHeight,PDF_WIDTH-144));
      }
      for(const block of pages[n].blocks) {
        checkAbort(signal);await tick();
        if(block.label) {
          ctx.fillStyle='#454545';ctx.font='600 25px sans-serif';ctx.textBaseline='top';
          ctx.fillText(block.label,72,block.y);
        }
        const y=block.y+block.labelHeight;
        ctx.save();ctx.translate(block.x,y);ctx.scale(block.scale,block.scale);
        for(const item of block.items) {
          if(item.kind!=='image') continue;
          checkAbort(signal);
          const img=await loadPdfImage(item.value,blobs,{signal,loadImage});
          try {
            const naturalWidth=img.naturalWidth||img.width,naturalHeight=img.naturalHeight||img.height;
            const fit=Math.min(item.w/naturalWidth,item.h/naturalHeight);
            ctx.save();ctx.translate(item.x+item.w/2-block.left,item.y+item.h/2-block.top);ctx.rotate(item.angle);
            ctx.drawImage(img,-naturalWidth*fit/2,-naturalHeight*fit/2,naturalWidth*fit,naturalHeight*fit);ctx.restore();
          } finally {img.close?.();}
        }
        ctx.restore();
        // One transparent Ink surface per block. Erasers never alter images/paper.
        ink.width=Math.max(1,Math.ceil(block.width));ink.height=Math.max(1,Math.ceil(block.sourceHeight*block.scale));
        const strokeCtx=ink.getContext('2d');strokeCtx.setTransform(block.scale,0,0,block.scale,0,0);
        let count=0;
        for(const item of block.items) {
          if(item.kind!=='stroke') continue;
          if(count++%256===0) {checkAbort(signal);await tick();}
          drawStroke(strokeCtx,block.sourceWidth,block.sourceHeight,0,0,localPdfStroke(item,block,m),'white');
        }
        ctx.drawImage(ink,block.x,y);
      }
      ctx.fillStyle='#585858';ctx.font='24px sans-serif';ctx.textBaseline='alphabetic';ctx.textAlign='right';
      ctx.fillText(`Pagina ${n+1} di ${pages.length}`,PDF_WIDTH-72,PDF_HEIGHT-42);ctx.textAlign='left';
      const jpeg=await encodeCanvas(output);checkAbort(signal);
      if(includePreview)previewPages.push(jpeg);
      const embedded=await pdf.embedJpg(await jpeg.arrayBuffer());
      const sheet=pdf.addPage([595.28,841.89]);sheet.drawImage(embedded,{x:0,y:0,width:595.28,height:841.89});
      await pdf.flush();
    }
    checkAbort(signal);onProgress(pages.length,pages.length);
    const bytes=await pdf.save();checkAbort(signal);
    return {blob:new Blob([bytes],{type:'application/pdf'}),filename:lessonPdfFilename(lesson),pageCount:pages.length,previewPages,
      fittedCount:pages.flatMap(page=>page.blocks).filter(block=>block.fitted).length};
  } finally {output.width=output.height=ink.width=ink.height=1;}
}

export function canSharePdf(file, nav = globalThis.navigator) {
  try { return Boolean(nav?.share && nav?.canShare?.({ files:[file] })); } catch { return false; }
}

export async function savePdfLocally(file, win = window, doc = document) {
  if (typeof win.showSaveFilePicker === 'function') {
    const handle = await win.showSaveFilePicker({ suggestedName:file.name, types:[{ description:'Documento PDF', accept:{ 'application/pdf':['.pdf'] } }] });
    const stream = await handle.createWritable();
    try { await stream.write(file); await stream.close(); } catch (error) { await stream.abort?.().catch(() => {}); throw error; }
    return 'PDF salvato nella posizione scelta.';
  }
  const url = URL.createObjectURL(file), anchor = doc.createElement('a');
  anchor.href = url; anchor.download = file.name; anchor.target = '_blank'; anchor.rel = 'noopener';
  doc.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return 'Salvataggio avviato. Se il PDF si apre in anteprima, usa Condividi → Salva su File.';
}

export function uploadLessonPdf(file, provider, bridge, signal) {
  if (!bridge) throw new Error('Apri Impostazioni e collega prima il tuo account Cloud.');
  const state = bridge.getState();
  if (provider === 'google' && state.googleConnected) return bridge.uploadGoogle(file,file.name,PDF_FOLDER,'application/pdf',signal);
  if (provider === 'onedrive' && state.oneDriveConnected) return bridge.uploadOneDrive(file,file.name,PDF_FOLDER,'application/pdf',signal);
  throw new Error(`${provider === 'google' ? 'Google Drive' : 'OneDrive'} non connesso. Ricollega l’account in Impostazioni, poi riprova.`);
}

export function initLessonPdf({ captureLesson, drawStroke, getCloudBridge, openSettings, onBusyChange = () => {} }) {
  const panel = document.getElementById('lessonPdfPanel');
  const status = document.getElementById('lessonPdfStatus');
  const title = document.getElementById('lessonPdfTitle');
  const detail = document.getElementById('lessonPdfDetail');
  const openLink = document.getElementById('lessonPdfOpenLink');
  const exportBody = document.getElementById('lessonPdfExportBody');
  const viewer = document.getElementById('lessonPdfViewer');
  const viewport = document.getElementById('lessonPdfViewport');
  const pageImage = document.getElementById('lessonPdfPageImage');
  const pageLabel = document.getElementById('lessonPdfPageLabel');
  const previousButton = document.getElementById('lessonPdfPreviousButton');
  const nextButton = document.getElementById('lessonPdfNextButton');
  const zoomOutButton = document.getElementById('lessonPdfZoomOutButton');
  const zoomInButton = document.getElementById('lessonPdfZoomInButton');
  const zoomLabel = document.getElementById('lessonPdfZoomLabel');
  const exportButton = document.getElementById('lessonPdfExportOptionsButton');
  const closeButton = document.getElementById('lessonPdfCloseButton');
  const saveButton = document.getElementById('lessonPdfSaveButton');
  const shareButton = document.getElementById('lessonPdfShareButton');
  const googleButton = document.getElementById('lessonPdfGoogleButton');
  const oneButton = document.getElementById('lessonPdfOneDriveButton');
  const settingsButton = document.getElementById('lessonPdfSettingsButton');
  const actionButtons = [saveButton,shareButton,googleButton,oneButton];
  let current = null, controller = null, busy = false, focusBefore = null;
  let previewPages = [], previewUrl = '', pageIndex = 0, zoom = 100;
  function renderPreviewPage() {
    if (!previewPages[pageIndex]) return;
    const previousUrl = previewUrl;
    previewUrl = URL.createObjectURL(previewPages[pageIndex]);
    pageImage.src = previewUrl;
    pageImage.alt = `PDF della lezione · pagina ${pageIndex + 1} di ${previewPages.length}`;
    pageImage.style.width = `${zoom}%`;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    pageLabel.textContent = `${pageIndex + 1} / ${previewPages.length}`;
    previousButton.disabled = pageIndex === 0; nextButton.disabled = pageIndex === previewPages.length - 1;
    zoomLabel.textContent = `${zoom}%`;
    zoomOutButton.disabled = zoom <= 100; zoomInButton.disabled = zoom >= 250;
    viewport.scrollTop = 0; viewport.scrollLeft = 0;
  }
  function showPreview(show) {
    const visible = Boolean(show && current && previewPages.length);
    viewer.hidden = !visible; exportBody.hidden = visible;
    panel.setAttribute('data-pdf-view',visible ? 'preview' : 'export');
    title.textContent = visible ? 'PDF della lezione' : 'Esporta PDF';
    if (visible) { renderPreviewPage(); viewport.focus(); }
  }
  function changePage(delta) {
    pageIndex = Math.max(0,Math.min(previewPages.length - 1,pageIndex + delta));
    renderPreviewPage();
  }
  function changeZoom(delta) {
    zoom = Math.max(100,Math.min(250,zoom + delta));
    pageImage.style.width = `${zoom}%`; zoomLabel.textContent = `${zoom}%`;
    zoomOutButton.disabled = zoom <= 100; zoomInButton.disabled = zoom >= 250;
  }
  function updateActions() {
    const state = getCloudBridge()?.getState?.() || {};
    for (const b of actionButtons) b.disabled = busy || !current;
    shareButton.disabled ||= !current || !canSharePdf(current);
    googleButton.disabled ||= !state.googleConnected;
    oneButton.disabled ||= !state.oneDriveConnected;
    openLink.hidden = !current; settingsButton.disabled = busy;
    detail.textContent = current
      ? `${current.name} · ${(current.size / 1048576).toFixed(1)} MB. Cloud: cartella “${PDF_FOLDER}”.${!state.googleConnected || !state.oneDriveConnected ? ' Collega gli account mancanti nelle Impostazioni.' : ''}${!canSharePdf(current) ? ' Condivisione file non disponibile in questo browser: salva il PDF e condividilo da File.' : ''}`
      : 'Tutte le pagine della lezione, con scrittura, testo e immagini.';
  }
  function setBusy(value) { busy = value; onBusyChange(value); panel.setAttribute('aria-busy',String(value)); updateActions(); }
  function close() {
    controller?.abort(); controller = null;
    panel.hidden = true; current = null; previewPages = []; setBusy(false);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
    pageImage.removeAttribute('src'); showPreview(false); focusBefore?.focus?.();
  }
  async function open(lessonId, mode = 'export') {
    if (!panel.hidden) return;
    focusBefore = document.activeElement;
    panel.hidden = false; current = null; status.textContent = 'Preparazione della lezione…';
    previewPages = []; pageIndex = 0; zoom = 100; showPreview(false);
    title.textContent = mode === 'open' ? 'Apri PDF' : 'Esporta PDF';
    controller = new AbortController(); const request = controller;
    setBusy(true); closeButton.focus();
    try {
      const snapshot = await captureLesson(lessonId); checkAbort(request.signal);
      const result = await buildLessonPdf(snapshot,{ drawStroke, signal:request.signal, includePreview:true,
        onProgress:(done,total) => { status.textContent = `Preparazione PDF: ${done} / ${total} pagine…`; } });
      checkAbort(request.signal);
      current = new File([result.blob],result.filename,{ type:'application/pdf' });
      previewPages = result.previewPages;
      status.textContent = `PDF pronto · ${result.pageCount} ${result.pageCount === 1 ? 'pagina' : 'pagine'}.${result.fittedCount ? ' I contenuti molto grandi sono stati ridotti per mantenerli interi.' : ''}`;
      if (mode === 'open') showPreview(true);
    } catch (error) {
      if (controller !== request) return;
      status.textContent = error.name === 'AbortError' ? 'Operazione annullata.' : `PDF non creato: ${error.message}`;
    } finally { if (controller === request) setBusy(false); }
  }
  async function action(run) {
    if (busy || !current) return;
    const request = controller;
    setBusy(true);
    try {
      const message = await run();
      if (controller === request) status.textContent = message;
    } catch (error) {
      if (controller === request) status.textContent = error.name === 'AbortError' ? 'Operazione annullata.' : error.message;
    } finally { if (controller === request) setBusy(false); }
  }
  saveButton.addEventListener('click', () => { void action(() => savePdfLocally(current)); });
  shareButton.addEventListener('click', () => { void action(async () => {
    // No await before share(): the already prepared File retains the user's gesture.
    await navigator.share({ files:[current], title:current.name });
    return 'PDF passato al menu di condivisione.';
  }); });
  googleButton.addEventListener('click', () => { void action(async () => { status.textContent = 'Caricamento su Google Drive…'; await uploadLessonPdf(current,'google',getCloudBridge(),controller.signal); return `PDF caricato su Google Drive / ${PDF_FOLDER}.`; }); });
  oneButton.addEventListener('click', () => { void action(async () => { status.textContent = 'Caricamento su OneDrive…'; await uploadLessonPdf(current,'onedrive',getCloudBridge(),controller.signal); return `PDF caricato su OneDrive / ${PDF_FOLDER}.`; }); });
  settingsButton.addEventListener('click', () => { close(); openSettings(); });
  openLink.addEventListener('click', () => showPreview(true));
  exportButton.addEventListener('click', () => { showPreview(false); saveButton.focus(); });
  previousButton.addEventListener('click', () => changePage(-1));
  nextButton.addEventListener('click', () => changePage(1));
  zoomOutButton.addEventListener('click', () => changeZoom(-25));
  zoomInButton.addEventListener('click', () => changeZoom(25));
  closeButton.addEventListener('click',close);
  panel.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
    if (!viewer.hidden && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) { ev.preventDefault(); changePage(ev.key === 'ArrowLeft' ? -1 : 1); }
    if (ev.key === 'Tab') {
      const elements = [...panel.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(el => !el.hidden && el.getClientRects().length > 0);
      const index = elements.indexOf(document.activeElement);
      if (ev.shiftKey && index <= 0) { ev.preventDefault(); elements.at(-1)?.focus(); }
      else if (!ev.shiftKey && index === elements.length - 1) { ev.preventDefault(); elements[0]?.focus(); }
    }
  });
  return { open,close,isBusy:() => busy,isOpen:() => !panel.hidden };
}
