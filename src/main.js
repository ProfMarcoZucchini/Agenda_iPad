import { initBackupFoundation } from './backup.js';
import { initSyncFoundation } from './sync-core.js';
import { initLanSyncTransport } from './lan-sync.js';
import { initCloudSyncTransport } from './cloud-sync.js';
import { decodeCloudJoinCode } from './cloud-crypto.js';
import { structuralErase } from './ink-erase.js';
import { dataUrlToBlob, sha256Blob, isSha256Hash } from './blob-store.js';
import { SHAPE_TYPES, SHAPE_LABELS, buildShapePoints, shapePathData, shapeIconPathData } from './shapes.js';
const APP_VERSION = '0.1.69';
const DB_NAME = 'AgendaIPadReintegrationDB';
const DB_VERSION = 3;
const STORE = 'pages';
const SYNC_EVENT_STORE = 'syncEvents';
const SYNC_META_STORE = 'syncMeta';
const SYNC_BLOB_STORE = 'syncBlobs';
const SYNC_STATE_KEY = 'sync-state-v1';
const LAN_STATE_KEY = 'lan-transport-state-v1';
const LAN_CONFIG_STORAGE_KEY = 'agenda-ipad-lan-sync-config-v1';
const CLOUD_STATE_KEY = 'cloud-transport-state-v1';
const CLOUD_CONFIG_STORAGE_KEY = 'agenda-ipad-cloud-sync-config-v1';
const CLOUD_CREDENTIALS_META_KEY = 'cloud-credentials-backup-v1';
const SYNC_RESTORE_GUARD_STORAGE_KEY = 'agenda-ipad-sync-restore-guard-v1';
const SAINT_CACHE_STORAGE_KEY = 'agenda-ipad-saint-cache-v1';
const HISTORY_CACHE_STORAGE_KEY = 'agenda-ipad-history-cache-v1';
const SHARED_WEEKLY_TIMETABLE_KEY = '::shared-weekly-timetable-v3';
const WEEKLY_TIMETABLE_MAX_PAGES = 10;
const SHARED_WEEKLY_TIMETABLE_ROWS = 11;
const SHARED_WEEKLY_TIMETABLE_DAYS = 5;
const WEEKLY_TIMETABLE_INK_COLOR = '#ffffff';
const WEEKLY_TIMETABLE_INK_WIDTH = 2.2;
const WEEKLY_TIMETABLE_INK_MAX_POINTS = 4096;
const SAINT_API_URL = 'https://www.santodelgiorno.it/santi.json';
const WIKIPEDIA_API_URL = 'https://it.wikipedia.org/w/api.php';
const WIKIPEDIA_ONTHISDAY_URL = 'https://it.wikipedia.org/api/rest_v1/feed/onthisday';
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_MAX_FORECAST_DAYS = 15;
const CLOUD_DEFAULT_ENDPOINT = 'https://www.marcozucchini.it/agenda-sync/api';
const PEN_COLOR = '#111111';
const PEN_WIDTH = 2.5;
const HIGHLIGHTER_COLOR = '#f0d84f';
const HIGHLIGHTER_WIDTH = 15;
const HIGHLIGHTER_OPACITY = 0.30;
const ERASER_WIDTH = 22;
const TOOL_STYLE_STORAGE_KEY = 'agenda-ipad-reintegration-tool-style-v1';
const SHAPE_TYPE_STORAGE_KEY = 'agenda-ipad-shape-type-v1';
const CALENDAR_VISIBILITY_STORAGE_KEY = 'agenda-ipad-calendar-visible-v1';
const ALLOWED_STYLE_VALUES = Object.freeze({
  pen: { colors: ['#111111', '#174f9b', '#a52b2b', '#23724b', '#f5f3eb'], widths: [1.4, 1.8, 2.5, 3.6, 5] },
  highlighter: { colors: ['#f0d84f', '#7fd38b', '#ef91b2', '#7fc8e8', '#f3a65a'], widths: [8, 12, 15, 20, 26] },
  eraser: { widths: [12, 16, 22, 30, 40] }
});
const UNDO_LIMIT = 10;
const REDO_LIMIT = 10;
const CROSS_PLATFORM_TEXT_FONT_PX = 38;

const DEFAULT_PAGE_STYLE = Object.freeze({ color: 'yellow', template: 'ruled' });
const ALLOWED_PAGE_COLORS = Object.freeze(['yellow', 'white', 'black']);
const ALLOWED_PAGE_TEMPLATES = Object.freeze(['ruled', 'grid', 'blank']);
const SAVE_IDLE_MS = 2400;
const FOOTER_PX = 46;
const MIN_DATE = '2026-01-01';
const MAX_DATE = '2028-12-31';
const PAGE_TURN_MS = 280;
const NOTE_TURN_MS = 260;
const NOTES_META_SUFFIX = '::notes-meta';
const GLOBAL_PAGE_STYLE_KEY = '::global-page-style';
const PLANNER_MODES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);
const PAPER_TOOL_DEFAULTS = Object.freeze({
  yellow: { pen: '#111111', highlighter: '#7fc8e8' },
  white: { pen: '#111111', highlighter: '#f0d84f' },
  black: { pen: '#f5f3eb', highlighter: '#f0d84f' }
});

const stage = document.querySelector('.stage');
const paper = document.getElementById('paper');
const header = document.getElementById('pageHeader');
const canvas = document.getElementById('inkCanvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const versionButton = document.getElementById('versionButton');
const authorCreditsButton = document.getElementById('authorCreditsButton');
const infoCreditsOverlay = document.getElementById('infoCreditsOverlay');
const idleCoverOverlay = document.getElementById('idleCoverOverlay');
const statusLabel = document.getElementById('statusLabel');
const reportPanel = document.getElementById('reportPanel');
const reportText = document.getElementById('reportText');
const copyReportButton = document.getElementById('copyReportButton');
const closeReportButton = document.getElementById('closeReportButton');
const markLagButton = document.getElementById('markLagButton');
const clearPageButton = document.getElementById('clearPageButton');
const baselineLabel = document.querySelector('.baseline-label');
const toolButtons = [...document.querySelectorAll('.tool-button[data-tool]')];
const eraserToolButton = document.getElementById('eraserToolButton');
const shapeToolButton = document.getElementById('shapeToolButton');
const shapePalette = document.getElementById('shapePalette');
const shapeChoiceButtons = [...document.querySelectorAll('[data-shape-type]')];
const shapeOverlay = document.getElementById('shapeOverlay');
const shapePreviewPath = document.getElementById('shapePreviewPath');
const undoButton = document.getElementById('undoButton');
const redoButton = document.getElementById('redoButton');
const calendarButton = document.getElementById('calendarButton');
const miniCalendar = document.getElementById('miniCalendar');
const styleButton = document.getElementById('styleButton');
const stylePanel = document.getElementById('stylePanel');
const stylePanelTitle = document.getElementById('stylePanelTitle');
const styleGroups = [...document.querySelectorAll('[data-style-for]')];
const colorSwatches = [...document.querySelectorAll('[data-style-color]')];
const widthChoices = [...document.querySelectorAll('[data-style-width]')];
const pageColorChoices = [...document.querySelectorAll('[data-page-color]')];
const pageTemplateChoices = [...document.querySelectorAll('[data-page-template]')];
const pageScopeChoices = [...document.querySelectorAll('[data-page-scope]')];
const pageStyleGroup = document.getElementById('pageStyleGroup');
const plannerModeBar = document.getElementById('plannerModeBar');
const plannerLayer = document.getElementById('plannerLayer');
const plannerModeButtons = [...document.querySelectorAll('[data-planner-mode]')];
const imageToolButton = document.getElementById('imageToolButton');
const imageLayer = document.getElementById('imageLayer');
const imageFileInput = document.getElementById('imageFileInput');
const imageInspector = document.getElementById('imageInspector');
const importImageButton = document.getElementById('importImageButton');
const cropImageButton = document.getElementById('cropImageButton');
const imageCropOverlay = document.getElementById('imageCropOverlay');
const imageCropStage = document.getElementById('imageCropStage');
const imageCropPreview = document.getElementById('imageCropPreview');
const imageCropSelection = document.getElementById('imageCropSelection');
const cancelImageCropButton = document.getElementById('cancelImageCropButton');
const applyImageCropButton = document.getElementById('applyImageCropButton');
const rotateImageLeftButton = document.getElementById('rotateImageLeftButton');
const rotateImageRightButton = document.getElementById('rotateImageRightButton');
const deleteImageButton = document.getElementById('deleteImageButton');
const startupOverlay = document.getElementById('startupOverlay');
const coverScreen = document.getElementById('coverScreen');
const creditsScreen = document.getElementById('creditsScreen');
const creditsHint = document.getElementById('creditsHint');
const lanHubUrlInput = document.getElementById('lanHubUrl');
const lanSyncKeyInput = document.getElementById('lanSyncKey');
const lanTestButton = document.getElementById('lanTestButton');
const lanSyncNowButton = document.getElementById('lanSyncNowButton');
const lanSyncStatus = document.getElementById('lanSyncStatus');
const cloudEndpointInput = document.getElementById('cloudEndpoint');
const cloudJoinCodeInput = document.getElementById('cloudJoinCode');
const cloudSyncModeSelect = document.getElementById('cloudSyncMode');
const cloudCreateGroupButton = document.getElementById('cloudCreateGroupButton');
const cloudCopyJoinCodeButton = document.getElementById('cloudCopyJoinCodeButton');
const cloudSelectJoinCodeButton = document.getElementById('cloudSelectJoinCodeButton');
const cloudRecoverJoinCodeButton = document.getElementById('cloudRecoverJoinCodeButton');
const cloudTestButton = document.getElementById('cloudTestButton');
const cloudSyncNowButton = document.getElementById('cloudSyncNowButton');
const cloudSyncStatus = document.getElementById('cloudSyncStatus');
const saintNameButton = document.getElementById('saintNameButton');
const weatherBadge = document.getElementById('weatherBadge');
const weatherIcon = document.getElementById('weatherIcon');
const weatherDetailPanel = document.getElementById('weatherDetailPanel');
const weatherDetailTitle = document.getElementById('weatherDetailTitle');
const weatherDetailDate = document.getElementById('weatherDetailDate');
const weatherDetailStatus = document.getElementById('weatherDetailStatus');
const weatherTimeBands = document.getElementById('weatherTimeBands');
const weatherWeek = document.getElementById('weatherWeek');
const closeWeatherDetailButton = document.getElementById('closeWeatherDetailButton');
const historyEventButton = document.getElementById('historyEventButton');
const historyEventLabel = historyEventButton?.querySelector('.history-event-label');
const saintDetailPanel = document.getElementById('saintDetailPanel');
const saintDetailTitle = document.getElementById('saintDetailTitle');
const saintDetailDate = document.getElementById('saintDetailDate');
const saintDetailName = document.getElementById('saintDetailName');
const saintDetailText = document.getElementById('saintDetailText');
const saintDetailSource = document.getElementById('saintDetailSource');
const closeSaintDetailButton = document.getElementById('closeSaintDetailButton');
const historyDetailPanel = document.getElementById('historyDetailPanel');
const historyDetailTitle = document.getElementById('historyDetailTitle');
const historyDetailDate = document.getElementById('historyDetailDate');
const historyDetailName = document.getElementById('historyDetailName');
const historyDetailText = document.getElementById('historyDetailText');
const historyDetailSource = document.getElementById('historyDetailSource');
const closeHistoryDetailButton = document.getElementById('closeHistoryDetailButton');


let db = null;
let currentDate = localISODate(new Date());
let currentPageKind = 'agenda';
let currentNoteIndex = 0;
let currentNoteTotal = 0;
const notesCountCache = new Map();
let strokes = [];
let images = [];
let selectedImageId = null;
let imageGesture = null;
let imageBusy = false;
let imageCropEditor = null;
let imageCropGesture = null;
let drawing = false;
let pointerId = null;
// 0.1.17 — i tap Apple Pencil sui controlli UI sono gestiti esplicitamente.
// Non ci affidiamo alla sintesi di `click` di Safari/iPadOS.
const pencilUiPointers = new Map();
const recentPencilUiActivation = new WeakMap();
const PENCIL_UI_TAP_MAX_DISTANCE = 28;
const PENCIL_UI_TAP_MAX_DURATION_MS = 1400;
// 0.1.44 — triplo tap Apple Pencil sulla Gomma = pulizia completa della pagina corrente.
// Il gesto viene riconosciuto solo sulla toolbar, mai nel pointermove Ink.
const ERASER_TRIPLE_TAP_WINDOW_MS = 1200;
const ERASER_TRIPLE_TAP_MIN_INTERVAL_MS = 130;
let eraserPenTapTimes = [];
let eraserPenTapPageKey = '';
let eraserClearBusy = false;

let rect = null;
let protectedTop = 0;
let lastPoint = null;
let activeStroke = null;
let saveTimer = 0;
let idleHandle = 0;
let dpr = 1;
let storageBusy = false;
let saintFetchController = null;
let saintBioFetchController = null;
let saintRefreshTimer = 0;
let saintRequestSerial = 0;
let saintCache = loadSaintCache();
let historyCache = loadHistoryCache();
const weatherForecastCache = new Map();
let weatherLocationState = 'unknown';
let weatherCoords = null;
let weatherCoordsAt = 0;
let weatherLocationKey = '';
let weatherForecastLocationKey = '';
let weatherLocationLastFailureAt = 0;
let weatherLocationPromise = null;
let weatherFetchController = null;
let weatherRefreshTimer = 0;
let weatherDetailFetchController = null;
let weatherDetailCache = { locationKey:'', fetchedAt:0, payload:null };
let historyFetchController = null;
let historyDetailFetchController = null;
let historyRefreshTimer = 0;
let historyRequestSerial = 0;
let weeklyTimetableReturnDescriptor = null;
let currentTimetableIndex = 1;
let pageDoubleTapLastTap = null;
let ready = false;
let rafPrev = performance.now();
let currentStrokeDiag = null;
let completedDiagnostics = [];
let lagMarks = [];
let lastHandlerArrival = 0;
let dirty = false;
let pageSwipe = null;
let pageTurning = false;
let previewPage = null;
let nativeTouchGestureId = null;
let shapeGesture = null;
let lastPenPointerDownAt = -Infinity;
const NATIVE_TOUCH_POINTER_ID = -2147483000;
let activeTool = 'pen';
let selectedShapeType = loadSelectedShapeType();
let undoHistory = [];
let redoHistory = [];
let toolStyles = loadToolStyles();
let pageStyle = { ...DEFAULT_PAGE_STYLE };
let globalPageStyle = { ...DEFAULT_PAGE_STYLE };
let pageStyleScope = 'current';
let backupFoundation = null;
let syncFoundation = null;
let syncStats = null;
let lanTransport = null;
let lanStats = null;
let cloudTransport = null;
let cloudStats = null;
let cloudHeartbeatTimer = 0;
let syncRestoreGuard = loadSyncRestoreGuard();
let syncRecoveryRebuildActive = false;
const syncRecoveryRebuiltPages = new Set();
let pageStyleBulkBusy = false;
let currentPlannerMode = 'daily';
let calendarVisiblePreference = false;
let calendarViewDate = null;
try { calendarVisiblePreference = localStorage.getItem(CALENDAR_VISIBILITY_STORAGE_KEY) === '1'; } catch {}

const session = {
  startedAt: new Date().toISOString(),
  totalPointerDown: 0,
  totalPointerUp: 0,
  totalPointerCancel: 0,
  recoveredStaleDown: 0,
  recoveredMoveStart: 0,
  recoveredPointerSwitch: 0,
  strokesCompleted: 0,
  storageWrites: 0,
  storageReads: 0,
  storageErrors: 0,
  maxStorageCallMs: 0,
  maxStorageTxMs: 0,
  strokesStartedWhileStorageBusy: 0,
  maxRafGapMs: 0,
  rafGapsOver34: 0,
  rafGapsOver60: 0,
  handlerGapsOver34: 0,
  maxHandlerGapMs: 0,
  pageTurns: 0,
  pageTurnCancels: 0,
  noteTurns: 0,
  notesCreated: 0,
  imagesImported: 0,
  imageTransforms: 0,
  imageCrops: 0,
  imagesDeleted: 0,
  shapesInserted: 0,
  structuralErasures: 0,
  structuralEraseTouched: 0,
  structuralEraseFragments: 0,
  maxStructuralEraseMs: 0
};

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return `stroke-${crypto.randomUUID()}`;
  return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeImageId() {
  if (globalThis.crypto?.randomUUID) return `image-${crypto.randomUUID()}`;
  return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneImageObject(image) {
  return image ? { ...image } : null;
}

function normalizeImageObject(value) {
  if (!value || typeof value !== 'object' || typeof value.src !== 'string') return null;
  const n = (x, fallback) => Number.isFinite(Number(x)) ? Number(x) : fallback;
  const w = Math.min(.92, Math.max(.06, n(value.w, .42)));
  const h = Math.min(.92, Math.max(.06, n(value.h, .32)));
  const x = Math.min(1 - w, Math.max(0, n(value.x, .12)));
  const y = Math.min(1 - h, Math.max(0, n(value.y, .12)));
  return {
    id: String(value.id || makeImageId()),
    name: String(value.name || 'Immagine'),
    mimeType: String(value.mimeType || 'image/webp'),
    src: value.src,
    blobHash: isSha256Hash(value.blobHash) ? String(value.blobHash).toLowerCase() : null,
    blobSize: Math.max(0, Number(value.blobSize) || 0),
    x, y, w, h,
    rotation: n(value.rotation, 0),
    createdAt: value.createdAt || new Date().toISOString(),
    modifiedAt: value.modifiedAt || new Date().toISOString()
  };
}

function imagesFromRecord(record) {
  return Array.isArray(record?.images) ? record.images.map(normalizeImageObject).filter(Boolean) : [];
}


function nearestAllowedWidth(tool, value, fallback) {
  const widths = ALLOWED_STYLE_VALUES[tool]?.widths ?? [];
  const n = Number(value);
  return widths.includes(n) ? n : fallback;
}

function allowedColor(tool, value, fallback) {
  const colors = ALLOWED_STYLE_VALUES[tool]?.colors ?? [];
  return colors.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : fallback;
}

function loadToolStyles() {
  const defaults = {
    pen: { color: PEN_COLOR, width: PEN_WIDTH, opacity: 1 },
    highlighter: { color: HIGHLIGHTER_COLOR, width: HIGHLIGHTER_WIDTH, opacity: HIGHLIGHTER_OPACITY },
    eraser: { color: '#000000', width: ERASER_WIDTH, opacity: 1 }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(TOOL_STYLE_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      pen: {
        ...defaults.pen,
        color: allowedColor('pen', saved.pen?.color, defaults.pen.color),
        width: nearestAllowedWidth('pen', saved.pen?.width, defaults.pen.width)
      },
      highlighter: {
        ...defaults.highlighter,
        color: allowedColor('highlighter', saved.highlighter?.color, defaults.highlighter.color),
        width: nearestAllowedWidth('highlighter', saved.highlighter?.width, defaults.highlighter.width)
      },
      eraser: {
        ...defaults.eraser,
        width: nearestAllowedWidth('eraser', saved.eraser?.width, defaults.eraser.width)
      }
    };
  } catch {
    return defaults;
  }
}

function saveToolStyles() {
  try {
    localStorage.setItem(TOOL_STYLE_STORAGE_KEY, JSON.stringify(toolStyles));
  } catch {}
}

function loadSelectedShapeType() {
  try {
    const saved = localStorage.getItem(SHAPE_TYPE_STORAGE_KEY);
    return SHAPE_TYPES.includes(saved) ? saved : 'rectangle';
  } catch {
    return 'rectangle';
  }
}

function saveSelectedShapeType() {
  try { localStorage.setItem(SHAPE_TYPE_STORAGE_KEY, selectedShapeType); } catch {}
}


function normalizePageStyle(value) {
  const color = ALLOWED_PAGE_COLORS.includes(value?.color) ? value.color : DEFAULT_PAGE_STYLE.color;
  const template = ALLOWED_PAGE_TEMPLATES.includes(value?.template) ? value.template : DEFAULT_PAGE_STYLE.template;
  return { color, template };
}

function pageStyleFromRecord(record) {
  return record?.pageStyle ? normalizePageStyle({ ...globalPageStyle, ...record.pageStyle }) : { ...globalPageStyle };
}

function paperToolDefaults(color) {
  return PAPER_TOOL_DEFAULTS[color] ?? PAPER_TOOL_DEFAULTS.yellow;
}

function applyToolDefaultsForPaper(color) {
  const defaults = paperToolDefaults(color);
  toolStyles.pen = { ...toolStyles.pen, color: defaults.pen };
  toolStyles.highlighter = { ...toolStyles.highlighter, color: defaults.highlighter };
  saveToolStyles();
  updateStyleUi();
}

function applyPageStyle(target = paper, value = pageStyle) {
  if (!target) return;
  const normalized = normalizePageStyle(value);
  target.dataset.paperColor = normalized.color;
  target.dataset.pageTemplate = normalized.template;
}

function updatePageStyleUi() {
  for (const button of pageScopeChoices) {
    const selected = button.dataset.pageScope === pageStyleScope;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
  if (pageStyleGroup) pageStyleGroup.classList.toggle('bulk-busy', pageStyleBulkBusy);
  for (const button of pageColorChoices) {
    const selected = button.dataset.pageColor === pageStyle.color;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
  for (const button of pageTemplateChoices) {
    const selected = button.dataset.pageTemplate === pageStyle.template;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function setPageStyleScope(scope) {
  if (!['current', 'all'].includes(scope) || drawing || pageTurning || pageStyleBulkBusy) return;
  pageStyleScope = scope;
  updatePageStyleUi();
  statusLabel.textContent = scope === 'all' ? 'ambito: tutta l’agenda' : 'ambito: pagina corrente';
}

function isInkPageRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.kind === 'agenda-day-ink' || record.kind === 'day-note-ink') return true;
  const key = String(record.date ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(key) || /::note::\d+$/.test(key);
}

async function applyGlobalPageStyleField(field, value) {
  await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let updated = 0;
    const globalRecord = {
      date: GLOBAL_PAGE_STYLE_KEY,
      kind: 'global-page-style',
      pageStyle: normalizePageStyle(globalPageStyle),
      version: APP_VERSION,
      modifiedAt: new Date().toISOString()
    };
    store.put(globalRecord);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const record = cursor.value;
      if (isInkPageRecord(record)) {
        const base = record?.pageStyle ? normalizePageStyle({ ...globalPageStyle, ...record.pageStyle }) : { ...globalPageStyle };
        record.pageStyle = normalizePageStyle({ ...base, [field]: value });
        record.version = APP_VERSION;
        record.modifiedAt = new Date().toISOString();
        cursor.update(record);
        updated++;
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Aggiornamento globale annullato'));
  });
}

async function setPageColor(color) {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning || pageStyleBulkBusy || !ALLOWED_PAGE_COLORS.includes(color)) return;
  pageStyle = { ...pageStyle, color };
  applyPageStyle();
  updatePageStyleUi();
  applyToolDefaultsForPaper(color);
  // Il cambio tema ridisegna immediatamente gli stroke esistenti con il
  // contrasto appropriato, senza modificarne il colore memorizzato.
  renderAll();
  dirty = true;

  if (pageStyleScope === 'all') {
    pageStyleBulkBusy = true;
    updatePageStyleUi();
    statusLabel.textContent = 'applico colore a tutta l’agenda…';
    cancelPendingSave();
    const descriptor = pageDescriptor();
    const currentOk = await persistSnapshot(descriptor, strokes, false, pageStyle);
    if (!currentOk) {
      pageStyleBulkBusy = false;
      updatePageStyleUi();
      statusLabel.textContent = 'salvataggio pagina non riuscito';
      scheduleSave();
      return;
    }
    globalPageStyle = { ...globalPageStyle, color };
    try {
      const updated = await applyGlobalPageStyleField('color', color);
      session.storageWrites++;
      statusLabel.textContent = `colore applicato a tutta l’agenda (${updated} pagine salvate)`;
      dirty = false;
    } catch (err) {
      session.storageErrors++;
      console.warn('Applicazione globale colore carta non riuscita', err);
      statusLabel.textContent = 'errore applicazione globale';
      dirty = true;
      scheduleSave();
    } finally {
      pageStyleBulkBusy = false;
      updatePageStyleUi();
    }
    return;
  }

  syncFoundation?.recordPageProperty(pageDescriptor(), 'color', color, 'current');
  scheduleSave();
  statusLabel.textContent = 'colore carta impostato sulla pagina';
}

async function setPageTemplate(template) {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning || pageStyleBulkBusy || !ALLOWED_PAGE_TEMPLATES.includes(template)) return;
  pageStyle = { ...pageStyle, template };
  applyPageStyle();
  updatePageStyleUi();
  dirty = true;

  if (pageStyleScope === 'all') {
    pageStyleBulkBusy = true;
    updatePageStyleUi();
    statusLabel.textContent = 'applico modello a tutta l’agenda…';
    cancelPendingSave();
    const descriptor = pageDescriptor();
    const currentOk = await persistSnapshot(descriptor, strokes, false, pageStyle);
    if (!currentOk) {
      pageStyleBulkBusy = false;
      updatePageStyleUi();
      statusLabel.textContent = 'salvataggio pagina non riuscito';
      scheduleSave();
      return;
    }
    globalPageStyle = { ...globalPageStyle, template };
    try {
      const updated = await applyGlobalPageStyleField('template', template);
      session.storageWrites++;
      statusLabel.textContent = `modello applicato a tutta l’agenda (${updated} pagine salvate)`;
      dirty = false;
    } catch (err) {
      session.storageErrors++;
      console.warn('Applicazione globale modello pagina non riuscita', err);
      statusLabel.textContent = 'errore applicazione globale';
      dirty = true;
      scheduleSave();
    } finally {
      pageStyleBulkBusy = false;
      updatePageStyleUi();
    }
    return;
  }

  syncFoundation?.recordPageProperty(pageDescriptor(), 'template', template, 'current');
  scheduleSave();
  statusLabel.textContent = 'modello pagina impostato sulla pagina';
}

function updateStyleUi() {
  if (!stylePanel) return;
  const styleTool = activeTool === 'shape' ? 'pen' : activeTool;
  const names = { pen: 'Penna', highlighter: 'Evidenziatore', eraser: 'Gomma', shape: 'Figure', image: 'Immagine' };
  if (stylePanelTitle) stylePanelTitle.textContent = `Stile ${names[activeTool] ?? 'Penna'}`;
  for (const group of styleGroups) group.hidden = group.dataset.styleFor !== styleTool;
  const effectiveColor = currentPageKind === 'planner-timetable' && styleTool === 'pen'
    ? WEEKLY_TIMETABLE_INK_COLOR
    : toolStyles[styleTool]?.color;
  for (const swatch of colorSwatches) {
    const matches = swatch.dataset.styleTool === styleTool && swatch.dataset.styleColor?.toLowerCase() === effectiveColor?.toLowerCase();
    swatch.classList.toggle('selected', matches);
    swatch.setAttribute('aria-pressed', matches ? 'true' : 'false');
  }
  for (const choice of widthChoices) {
    const matches = choice.dataset.styleTool === styleTool && Number(choice.dataset.styleWidth) === Number(toolStyles[styleTool]?.width);
    choice.classList.toggle('selected', matches);
    choice.setAttribute('aria-pressed', matches ? 'true' : 'false');
  }
  if (styleButton) {
    const color = styleTool === 'eraser' ? '#e7dfd1' : effectiveColor ?? PEN_COLOR;
    styleButton.style.setProperty('--active-style-color', color);
  }
  updatePageStyleUi();
}

function setStyleColor(tool, color) {
  if (drawing || pageTurning || !ALLOWED_STYLE_VALUES[tool]?.colors?.includes(color)) return;
  toolStyles[tool] = { ...toolStyles[tool], color };
  saveToolStyles();
  updateStyleUi();
  statusLabel.textContent = 'colore impostato';
}

function setStyleWidth(tool, width) {
  const n = Number(width);
  if (drawing || pageTurning || !ALLOWED_STYLE_VALUES[tool]?.widths?.includes(n)) return;
  toolStyles[tool] = { ...toolStyles[tool], width: n };
  saveToolStyles();
  updateStyleUi();
  statusLabel.textContent = 'spessore impostato';
}

function closeStylePanel() {
  if (!stylePanel) return;
  if (!stylePanel.hidden) stylePanel.hidden = true;
  styleButton?.setAttribute('aria-expanded', 'false');
  if (shapePalette && activeTool === 'shape') shapePalette.hidden = false;
}

function toggleStylePanel() {
  if (!stylePanel || drawing || pageTurning) return;
  const willOpen = stylePanel.hidden;
  stylePanel.hidden = !willOpen;
  if (shapePalette && activeTool === 'shape') shapePalette.hidden = willOpen;
  styleButton?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  if (willOpen) updateStyleUi();
}

function isPlannerKind(kind = currentPageKind) {
  return typeof kind === 'string' && kind.startsWith('planner-');
}


function agendaDateEligibleForWeather(dateString) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
  const target = new Date(`${dateString}T12:00:00`);
  const days = Math.round((target - base) / 86400000);
  return Number.isFinite(days) && days >= 0 && days <= WEATHER_MAX_FORECAST_DAYS;
}

function weatherVisualForCode(code) {
  const n = Number(code);
  if (n === 0) return { asset:'sun.svg', label:'Sereno' };
  if (n === 1) return { asset:'sun.svg', label:'Prevalentemente sereno' };
  if (n === 2) return { asset:'sun-cloud.svg', label:'Parzialmente nuvoloso' };
  if (n === 3) return { asset:'cloud.svg', label:'Coperto' };
  if (n === 45) return { asset:'fog.svg', label:'Nebbia' };
  if (n === 48) return { asset:'fog.svg', label:'Nebbia con brina' };
  if ([51,53,55].includes(n)) return { asset:'rain.svg', label:n === 51 ? 'Pioviggine debole' : n === 53 ? 'Pioviggine moderata' : 'Pioviggine intensa' };
  if ([56,57].includes(n)) return { asset:'rain.svg', label:'Pioviggine gelata' };
  if ([61,63,65].includes(n)) return { asset:'rain.svg', label:n === 61 ? 'Pioggia debole' : n === 63 ? 'Pioggia moderata' : 'Pioggia intensa' };
  if ([66,67].includes(n)) return { asset:'rain.svg', label:'Pioggia gelata' };
  if ([71,73,75].includes(n)) return { asset:'snow.svg', label:n === 71 ? 'Neve debole' : n === 73 ? 'Neve moderata' : 'Neve intensa' };
  if (n === 77) return { asset:'snow.svg', label:'Granelli di neve' };
  if ([80,81,82].includes(n)) return { asset:'rain.svg', label:n === 80 ? 'Rovesci deboli' : n === 81 ? 'Rovesci moderati' : 'Rovesci forti' };
  if ([85,86].includes(n)) return { asset:'snow.svg', label:'Rovesci di neve' };
  if (n === 95) return { asset:'rain.svg', label:'Temporale' };
  if ([96,99].includes(n)) return { asset:'rain.svg', label:'Temporale con grandine' };
  return { asset:'cloud.svg', label:'Variabile' };
}

function setWeatherBadgeFor(root, dateString, pageKind = currentPageKind) {
  const badge = root?.querySelector?.('.weather-badge');
  const img = root?.querySelector?.('.weather-icon');
  if (!badge || !img) return;
  const forecast = weatherForecastCache.get(dateString);
  const visible = root === document && pageKind === 'agenda' && Boolean(forecast);
  badge.hidden = !visible;
  if (!visible) return;
  const visual = weatherVisualForCode(forecast.code);
  img.src = `./assets/weather/${visual.asset}`;
  img.alt = `Previsione: ${visual.label}`;
  badge.title = `${visual.label} · tocca per i dettagli`;
  badge.setAttribute('aria-label', `Previsione meteo locale: ${visual.label}. Tocca per i dettagli`);
}

function closeWeatherDetails() {
  weatherDetailFetchController?.abort();
  weatherDetailFetchController = null;
  if (weatherDetailPanel) weatherDetailPanel.hidden = true;
}

function weatherRepresentativeCode(codes) {
  const valid = codes.map(Number).filter(Number.isFinite);
  if (!valid.length) return 3;
  const counts = new Map();
  for (const code of valid) counts.set(code, (counts.get(code) || 0) + 1);
  const severity = (code) => {
    if ([95,96,99].includes(code)) return 9;
    if ([65,67,82,86].includes(code)) return 8;
    if ([63,66,75,81,85].includes(code)) return 7;
    if ([61,71,73,80].includes(code)) return 6;
    if ([51,53,55,56,57,77].includes(code)) return 5;
    if ([45,48].includes(code)) return 4;
    if (code === 3) return 3;
    if (code === 2) return 2;
    if (code === 1) return 1;
    return 0;
  };
  return [...counts.entries()].sort((a,b) => b[1] - a[1] || severity(b[0]) - severity(a[0]))[0][0];
}

function finiteValues(values) { return values.map(Number).filter(Number.isFinite); }
function roundedWeatherValue(value) { return Number.isFinite(Number(value)) ? Math.round(Number(value)) : null; }
function weatherTempRange(values) {
  const nums = finiteValues(values);
  if (!nums.length) return '—';
  const lo = Math.round(Math.min(...nums));
  const hi = Math.round(Math.max(...nums));
  return lo === hi ? `${lo}°C` : `${lo}–${hi}°C`;
}
function weatherMaxLabel(values, suffix) {
  const nums = finiteValues(values);
  if (!nums.length) return '—';
  return `${Math.round(Math.max(...nums))}${suffix}`;
}

function weatherBandRows(payload, dateString) {
  const times = Array.isArray(payload?.hourly?.time) ? payload.hourly.time : [];
  const codes = Array.isArray(payload?.hourly?.weather_code) ? payload.hourly.weather_code : [];
  const temps = Array.isArray(payload?.hourly?.temperature_2m) ? payload.hourly.temperature_2m : [];
  const rain = Array.isArray(payload?.hourly?.precipitation_probability) ? payload.hourly.precipitation_probability : [];
  const wind = Array.isArray(payload?.hourly?.wind_speed_10m) ? payload.hourly.wind_speed_10m : [];
  const bands = [
    { title:'Notte', hours:'00–05', from:0, to:5 },
    { title:'Mattina', hours:'06–11', from:6, to:11 },
    { title:'Pomeriggio', hours:'12–17', from:12, to:17 },
    { title:'Sera', hours:'18–23', from:18, to:23 }
  ];
  return bands.map((band) => {
    const indices = [];
    for (let i=0; i<times.length; i++) {
      if (typeof times[i] !== 'string' || !times[i].startsWith(`${dateString}T`)) continue;
      const hour = Number(times[i].slice(11,13));
      if (Number.isFinite(hour) && hour >= band.from && hour <= band.to) indices.push(i);
    }
    return {
      ...band,
      code: weatherRepresentativeCode(indices.map(i => codes[i])),
      temp: weatherTempRange(indices.map(i => temps[i])),
      rain: weatherMaxLabel(indices.map(i => rain[i]), '%'),
      wind: weatherMaxLabel(indices.map(i => wind[i]), ' km/h'),
      available: indices.length > 0
    };
  });
}

function weatherWeekRows(payload, dateString) {
  const daily = payload?.daily || {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const mins = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const maxs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const rain = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : [];
  const wind = Array.isArray(daily.wind_speed_10m_max) ? daily.wind_speed_10m_max : [];
  const rows = [];
  for (let i=0; i<times.length && rows.length<7; i++) {
    if (typeof times[i] !== 'string' || times[i] < dateString) continue;
    rows.push({ date:times[i], code:Number(codes[i]), min:roundedWeatherValue(mins[i]), max:roundedWeatherValue(maxs[i]), rain:roundedWeatherValue(rain[i]), wind:roundedWeatherValue(wind[i]) });
  }
  return rows;
}

function weatherDayLabel(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  const text = new Intl.DateTimeFormat('it-IT', { weekday:'short', day:'numeric', month:'short' }).format(d).replace(/\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weatherImg(code, className='weather-detail-icon') {
  const visual = weatherVisualForCode(code);
  const img = document.createElement('img');
  img.className = className;
  img.src = `./assets/weather/${visual.asset}`;
  img.alt = visual.label;
  img.draggable = false;
  return img;
}

function renderWeatherDetails(payload, dateString) {
  if (!weatherTimeBands || !weatherWeek || !weatherDetailStatus) return;
  weatherTimeBands.replaceChildren();
  weatherWeek.replaceChildren();
  const bands = weatherBandRows(payload, dateString);
  for (const band of bands) {
    const card = document.createElement('article');
    card.className = 'weather-band-card';
    card.append(weatherImg(band.code));
    const text = document.createElement('div');
    text.className = 'weather-band-copy';
    const head = document.createElement('div'); head.className='weather-band-head';
    const title = document.createElement('strong'); title.textContent = band.title;
    const hours = document.createElement('span'); hours.textContent = band.hours;
    head.append(title, hours);
    const desc = document.createElement('div'); desc.className='weather-band-desc'; desc.textContent = band.available ? weatherVisualForCode(band.code).label : 'Dati non disponibili';
    const metrics = document.createElement('div'); metrics.className='weather-band-metrics';
    metrics.textContent = band.available ? `${band.temp}  ·  pioggia ${band.rain}  ·  vento ${band.wind}` : '—';
    text.append(head, desc, metrics); card.append(text); weatherTimeBands.append(card);
  }
  const weekRows = weatherWeekRows(payload, dateString);
  for (const row of weekRows) {
    const card = document.createElement('article'); card.className='weather-day-card';
    const day = document.createElement('div'); day.className='weather-day-name'; day.textContent=weatherDayLabel(row.date);
    card.append(day, weatherImg(row.code, 'weather-week-icon'));
    const copy = document.createElement('div'); copy.className='weather-day-copy';
    const visual=weatherVisualForCode(row.code);
    const desc=document.createElement('strong'); desc.textContent=visual.label;
    const temp=document.createElement('span'); temp.textContent = row.min === null || row.max === null ? '—' : `${row.min}° / ${row.max}°`;
    const metrics=document.createElement('small'); metrics.textContent=`Pioggia ${row.rain ?? '—'}% · vento ${row.wind ?? '—'} km/h`;
    copy.append(desc,temp,metrics); card.append(copy); weatherWeek.append(card);
  }
  weatherDetailStatus.textContent = weekRows.length ? 'Previsione aggiornata per la posizione attuale.' : 'Previsione disponibile solo parzialmente.';
  weatherDetailStatus.classList.remove('error');
}

async function fetchWeatherDetailPayload(coords, signal) {
  const cacheFresh = weatherDetailCache.payload && weatherDetailCache.locationKey === weatherLocationKey && Date.now() - weatherDetailCache.fetchedAt < 15 * 60 * 1000;
  if (cacheFresh) return weatherDetailCache.payload;
  const params = new URLSearchParams({
    latitude:String(coords.lat), longitude:String(coords.lon), timezone:'auto', forecast_days:'16',
    hourly:'weather_code,temperature_2m,precipitation_probability,wind_speed_10m',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'
  });
  const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`, { method:'GET', mode:'cors', credentials:'omit', cache:'no-store', signal });
  if (!response.ok) throw new Error(`Meteo HTTP ${response.status}`);
  const payload = await response.json();
  weatherDetailCache = { locationKey:weatherLocationKey, fetchedAt:Date.now(), payload };
  return payload;
}

async function openWeatherDetails() {
  if (currentPageKind !== 'agenda' || !weatherDetailPanel) return;
  const dateString = currentDate;
  weatherDetailTitle.textContent = 'Previsioni meteo';
  weatherDetailDate.textContent = saintDateLabel(dateString);
  weatherDetailStatus.textContent = 'Caricamento previsioni dettagliate…';
  weatherDetailStatus.classList.remove('error');
  weatherTimeBands?.replaceChildren();
  weatherWeek?.replaceChildren();
  weatherDetailPanel.hidden = false;
  if (!agendaDateEligibleForWeather(dateString)) {
    weatherDetailStatus.textContent = 'Le previsioni dettagliate sono disponibili per oggi e per i prossimi 15 giorni.';
    weatherDetailStatus.classList.add('error');
    return;
  }
  const coords = await getDeviceWeatherPosition();
  if (!coords || weatherDetailPanel.hidden || currentDate !== dateString) {
    if (!weatherDetailPanel.hidden && currentDate === dateString) {
      weatherDetailStatus.textContent = weatherLocationState === 'denied' ? 'Per il meteo dettagliato abilita la posizione per Agenda iPad.' : 'Posizione non disponibile in questo momento.';
      weatherDetailStatus.classList.add('error');
    }
    return;
  }
  weatherDetailFetchController?.abort();
  const controller = new AbortController();
  weatherDetailFetchController = controller;
  try {
    const payload = await fetchWeatherDetailPayload(coords, controller.signal);
    if (weatherDetailPanel.hidden || currentDate !== dateString) return;
    renderWeatherDetails(payload, dateString);
  } catch (err) {
    if (err?.name !== 'AbortError' && !weatherDetailPanel.hidden && currentDate === dateString) {
      weatherDetailStatus.textContent = navigator.onLine ? 'Previsioni dettagliate momentaneamente non disponibili.' : 'Previsioni dettagliate non disponibili offline.';
      weatherDetailStatus.classList.add('error');
    }
  } finally {
    if (weatherDetailFetchController === controller) weatherDetailFetchController = null;
  }
}

function scheduleWeatherRefresh(delay = 800) {
  window.clearTimeout(weatherRefreshTimer);
  weatherRefreshTimer = window.setTimeout(() => {
    weatherRefreshTimer = 0;
    void refreshWeatherForCurrentDate();
  }, delay);
}

function getDeviceWeatherPosition() {
  const now = Date.now();
  if (weatherCoords && now - weatherCoordsAt < 10 * 60 * 1000) return Promise.resolve(weatherCoords);
  if (weatherLocationState === 'denied') return Promise.resolve(null);
  if (weatherLocationState === 'unavailable' && now - weatherLocationLastFailureAt < 5 * 60 * 1000) return Promise.resolve(null);
  if (weatherLocationState === 'unavailable') weatherLocationState = 'unknown';
  if (weatherLocationPromise) return weatherLocationPromise;
  if (!navigator.geolocation || !window.isSecureContext) {
    weatherLocationState = 'unavailable';
    return Promise.resolve(null);
  }
  weatherLocationState = 'pending';
  weatherLocationPromise = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = Number(position?.coords?.latitude);
      const lon = Number(position?.coords?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const nextKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        if (weatherLocationKey && nextKey !== weatherLocationKey) weatherForecastCache.clear();
        weatherCoords = { lat, lon };
        weatherCoordsAt = Date.now();
        weatherLocationKey = nextKey;
        weatherLocationState = 'ready';
        resolve(weatherCoords);
      } else {
        weatherLocationState = 'unavailable';
        weatherLocationLastFailureAt = Date.now();
        resolve(null);
      }
    }, (error) => {
      weatherLocationState = error?.code === 1 ? 'denied' : 'unavailable';
      weatherLocationLastFailureAt = Date.now();
      resolve(null);
    }, { enableHighAccuracy:false, timeout:7000, maximumAge:30 * 60 * 1000 });
  }).finally(() => { weatherLocationPromise = null; });
  return weatherLocationPromise;
}

async function refreshWeatherForCurrentDate() {
  const dateString = currentDate;
  if (currentPageKind !== 'agenda' || !agendaDateEligibleForWeather(dateString)) {
    setWeatherBadgeFor(document, dateString, currentPageKind);
    return;
  }
  const locationIsFresh = weatherCoords && Date.now() - weatherCoordsAt < 10 * 60 * 1000;
  if (weatherForecastCache.has(dateString) && locationIsFresh && weatherForecastLocationKey === weatherLocationKey) {
    setWeatherBadgeFor(document, dateString, currentPageKind);
    return;
  }
  const coords = await getDeviceWeatherPosition();
  if (!coords || currentPageKind !== 'agenda' || currentDate !== dateString) {
    setWeatherBadgeFor(document, dateString, currentPageKind);
    return;
  }
  if (weatherForecastCache.has(dateString) && weatherForecastLocationKey === weatherLocationKey) {
    setWeatherBadgeFor(document, dateString, currentPageKind);
    return;
  }
  weatherFetchController?.abort();
  const controller = new AbortController();
  weatherFetchController = controller;
  try {
    const params = new URLSearchParams({
      latitude: String(coords.lat), longitude: String(coords.lon),
      daily: 'weather_code', timezone: 'auto', forecast_days: '16'
    });
    const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`, {
      method:'GET', mode:'cors', credentials:'omit', cache:'no-store', signal:controller.signal
    });
    if (!response.ok) throw new Error(`Meteo HTTP ${response.status}`);
    const payload = await response.json();
    const times = Array.isArray(payload?.daily?.time) ? payload.daily.time : [];
    const codes = Array.isArray(payload?.daily?.weather_code) ? payload.daily.weather_code : [];
    weatherForecastCache.clear();
    weatherForecastLocationKey = weatherLocationKey;
    for (let i = 0; i < Math.min(times.length, codes.length); i++) {
      if (typeof times[i] === 'string' && Number.isFinite(Number(codes[i]))) weatherForecastCache.set(times[i], { code:Number(codes[i]) });
    }
  } catch (err) {
    if (err?.name !== 'AbortError') console.warn('Previsione meteo non disponibile', err);
  } finally {
    if (weatherFetchController === controller) weatherFetchController = null;
  }
  if (currentPageKind === 'agenda' && currentDate === dateString) setWeatherBadgeFor(document, dateString, currentPageKind);
}

function loadHistoryCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_CACHE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function historyDayKey(dateString) { return String(dateString || '').slice(5); }

function cleanHistoryText(value, maxLength = 1200) {
  const raw = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (raw.length <= maxLength) return raw;
  const cut = raw.slice(0, maxLength);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return `${(sentence > maxLength * .55 ? cut.slice(0, sentence + 1) : cut).trim()}…`;
}

function shortHistoryText(value, maxLength = 78) {
  const raw = cleanHistoryText(value, 260).replace(/^\d{3,4}\s*[–—:-]\s*/, '');
  if (raw.length <= maxLength) return raw;
  const cut = raw.slice(0, maxLength);
  const split = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf(','));
  return `${(split > maxLength * .6 ? cut.slice(0, split) : cut).trim()}…`;
}

function cachedHistoryInfo(dateString) {
  const value = historyCache?.[historyDayKey(dateString)];
  if (!value || typeof value !== 'object') return { year:'', text:'', short:'', detail:'', pageTitle:'', source:'' };
  return {
    year: String(value.year ?? '').trim(),
    text: cleanHistoryText(value.text, 1200),
    short: cleanHistoryText(value.short, 120),
    detail: cleanHistoryText(value.detail, 1800),
    pageTitle: cleanHistoryText(value.pageTitle, 220),
    source: cleanHistoryText(value.source, 100) || 'Wikipedia'
  };
}

function cacheHistoryInfo(dateString, info) {
  const key = historyDayKey(dateString);
  if (!key || !info?.text) return;
  historyCache[key] = {
    year: String(info.year ?? '').trim(),
    text: cleanHistoryText(info.text, 1200),
    short: shortHistoryText(info.short || info.text),
    detail: cleanHistoryText(info.detail, 1800),
    pageTitle: cleanHistoryText(info.pageTitle, 220),
    source: cleanHistoryText(info.source, 100) || 'Wikipedia'
  };
  try { localStorage.setItem(HISTORY_CACHE_STORAGE_KEY, JSON.stringify(historyCache)); } catch {}
}

function principalHistoryEvent(payload, fieldHint = '') {
  const candidateLists = [payload?.selected, payload?.events, payload?.all].filter(Array.isArray);
  const list = candidateLists.find((items) => items.length) || [];
  const item = list[0];
  if (!item) return null;
  const text = cleanHistoryText(item?.text ?? item?.description ?? item?.title, 1200);
  if (!text) return null;
  const pages = Array.isArray(item?.pages) ? item.pages : [];
  const firstPage = pages[0] || {};
  const pageTitle = cleanHistoryText(firstPage?.normalizedtitle ?? firstPage?.title, 220);
  const extract = cleanHistoryText(firstPage?.extract, 1500);
  return {
    year: item?.year ?? '', text, short: shortHistoryText(text),
    detail: extract ? `${text}\n\n${extract}` : text,
    pageTitle, source: 'Wikipedia italiana', fieldHint
  };
}

function setHistoryLabel(root, dateString, state = 'cached', pageKind = currentPageKind) {
  const button = root?.querySelector?.('.history-event');
  const label = root?.querySelector?.('.history-event-label');
  if (!button || !label) return;
  if (root !== document || pageKind !== 'agenda') { button.hidden = true; return; }
  const info = cachedHistoryInfo(dateString);
  if (!info.text) { button.hidden = true; button.disabled = true; return; }
  const prefix = info.year ? `${info.year} · ` : '';
  label.textContent = `${prefix}${info.short || shortHistoryText(info.text)}`;
  button.hidden = false;
  button.disabled = false;
  button.dataset.historyState = state;
}

function scheduleHistoryRefresh(delay = 1250) {
  window.clearTimeout(historyRefreshTimer);
  historyRefreshTimer = window.setTimeout(() => {
    historyRefreshTimer = 0;
    void refreshHistoryForCurrentDate();
  }, delay);
}

async function fetchHistoryFeed(type, mm, dd, signal) {
  const response = await fetch(`${WIKIPEDIA_ONTHISDAY_URL}/${type}/${mm}/${dd}`, {
    method:'GET', mode:'cors', credentials:'omit', cache:'force-cache', signal,
    headers:{ 'Accept':'application/json' }
  });
  if (!response.ok) throw new Error(`Wikipedia OnThisDay HTTP ${response.status}`);
  return response.json();
}

async function refreshHistoryForCurrentDate() {
  const dateString = currentDate;
  setHistoryLabel(document, dateString, 'cached', currentPageKind);
  if (currentPageKind !== 'agenda' || cachedHistoryInfo(dateString).text || !navigator.onLine) return;
  historyFetchController?.abort();
  const controller = new AbortController();
  historyFetchController = controller;
  const serial = ++historyRequestSerial;
  const [, mm, dd] = dateString.split('-');
  try {
    let info = null;
    try { info = principalHistoryEvent(await fetchHistoryFeed('selected', mm, dd, controller.signal), 'selected'); }
    catch (selectedError) {
      if (selectedError?.name === 'AbortError') throw selectedError;
    }
    if (!info) info = principalHistoryEvent(await fetchHistoryFeed('events', mm, dd, controller.signal), 'events');
    if (info) cacheHistoryInfo(dateString, info);
  } catch (err) {
    if (err?.name !== 'AbortError') console.warn('Evento storico non disponibile', err);
  } finally {
    if (historyFetchController === controller) historyFetchController = null;
  }
  if (serial === historyRequestSerial && currentDate === dateString && currentPageKind === 'agenda') setHistoryLabel(document, dateString, 'ready', currentPageKind);
}

function closeHistoryDetails() {
  historyDetailFetchController?.abort();
  historyDetailFetchController = null;
  if (historyDetailPanel) historyDetailPanel.hidden = true;
}

async function fetchHistoryPageSummary(pageTitle, signal) {
  if (!pageTitle) return '';
  const params = new URLSearchParams({
    action:'query', format:'json', origin:'*', redirects:'1',
    prop:'extracts', exintro:'1', explaintext:'1', titles:pageTitle
  });
  const response = await fetch(`${WIKIPEDIA_API_URL}?${params.toString()}`, {
    method:'GET', mode:'cors', credentials:'omit', cache:'force-cache', signal
  });
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
  const payload = await response.json();
  const page = Object.values(payload?.query?.pages || {}).find((item) => item && !item.missing);
  return cleanHistoryText(page?.extract, 1500);
}

async function openHistoryDetails() {
  if (currentPageKind !== 'agenda' || !historyDetailPanel) return;
  const dateString = currentDate;
  const info = cachedHistoryInfo(dateString);
  if (!info.text) return;
  historyDetailTitle.textContent = 'Evento nella storia';
  historyDetailDate.textContent = saintDateLabel(dateString);
  historyDetailName.textContent = `${info.year ? `${info.year} · ` : ''}${info.short || shortHistoryText(info.text, 100)}`;
  historyDetailText.textContent = info.detail || info.text;
  historyDetailSource.textContent = info.source ? `Fonte: ${info.source}` : '';
  historyDetailPanel.hidden = false;
  if (info.detail && info.detail.length > info.text.length + 80) return;
  if (!navigator.onLine || !info.pageTitle) return;
  historyDetailFetchController?.abort();
  const controller = new AbortController();
  historyDetailFetchController = controller;
  try {
    const summary = await fetchHistoryPageSummary(info.pageTitle, controller.signal);
    if (!summary) return;
    const detail = summary.includes(info.text) ? summary : `${info.text}\n\n${summary}`;
    cacheHistoryInfo(dateString, { ...info, detail });
    if (currentDate === dateString && !historyDetailPanel.hidden) historyDetailText.textContent = cleanHistoryText(detail, 1800);
  } catch (err) {
    if (err?.name !== 'AbortError') console.warn('Approfondimento evento storico non disponibile', err);
  } finally {
    if (historyDetailFetchController === controller) historyDetailFetchController = null;
  }
}

function loadSaintCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAINT_CACHE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cleanSaintText(value, maxLength = 900) {
  const raw = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (raw.length <= maxLength) return raw;
  const cut = raw.slice(0, maxLength);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return `${(sentence > maxLength * .55 ? cut.slice(0, sentence + 1) : cut).trim()}…`;
}

function cachedSaintInfo(dateString) {
  const value = saintCache?.[dateString];
  if (typeof value === 'string') return { name: value.trim(), summary: '', source: 'SantoDelGiorno.it' };
  if (!value || typeof value !== 'object') return { name: '', summary: '', source: '' };
  return {
    name: cleanSaintText(value.name, 180),
    summary: cleanSaintText(value.summary, 900),
    source: cleanSaintText(value.source, 80) || 'SantoDelGiorno.it'
  };
}

function cachedSaintName(dateString) {
  return cachedSaintInfo(dateString).name;
}

function cacheSaintInfo(dateString, info) {
  const previous = cachedSaintInfo(dateString);
  const clean = {
    name: cleanSaintText(info?.name || previous.name, 180),
    summary: cleanSaintText(info?.summary || previous.summary, 900),
    source: cleanSaintText(info?.source || previous.source, 80) || 'SantoDelGiorno.it'
  };
  if (!dateString || !clean.name) return;
  saintCache[dateString] = clean;
  try { localStorage.setItem(SAINT_CACHE_STORAGE_KEY, JSON.stringify(saintCache)); } catch {}
}

function principalSaintInfo(payload, preferredName = '') {
  const list = Array.isArray(payload) ? payload
    : Array.isArray(payload?.santi) ? payload.santi
    : Array.isArray(payload?.data) ? payload.data
    : [];
  const normalizedPreferred = cleanSaintText(preferredName, 180).toLocaleLowerCase('it-IT');
  const primary = (normalizedPreferred && list.find((item) => cleanSaintText(item?.nome ?? item?.name ?? item?.titolo, 180).toLocaleLowerCase('it-IT') === normalizedPreferred))
    || list.find((item) => String(item?.default ?? item?.principale ?? '') === '1')
    || list[0];
  if (!primary) return { name: '', summary: '', source: '' };
  const summaryCandidates = [
    primary?.descrizione, primary?.description, primary?.riassunto, primary?.summary,
    primary?.biografia, primary?.bio, primary?.agiografia, primary?.testo,
    primary?.excerpt, primary?.introduzione, primary?.intro
  ];
  return {
    name: cleanSaintText(primary?.nome ?? primary?.name ?? primary?.titolo, 180),
    summary: cleanSaintText(summaryCandidates.find((value) => cleanSaintText(value, 900)), 900),
    source: 'SantoDelGiorno.it'
  };
}

function principalSaintName(payload) {
  return principalSaintInfo(payload).name;
}

function setSaintLabel(root, dateString, state = 'cached', pageKind = currentPageKind) {
  const label = root?.querySelector?.('.saint-name');
  if (!label) return;
  const hiddenForNotes = pageKind === 'note';
  label.hidden = hiddenForNotes;
  if (hiddenForNotes) return;
  const name = cachedSaintName(dateString);
  if (name) {
    label.textContent = `✝ ${name}`;
    label.dataset.saintState = 'ready';
    label.disabled = false;
    return;
  }
  label.textContent = '✝ …';
  label.dataset.saintState = state;
  label.disabled = true;
}

function scheduleSaintRefresh(delay = 80) {
  window.clearTimeout(saintRefreshTimer);
  saintRefreshTimer = window.setTimeout(() => {
    saintRefreshTimer = 0;
    refreshSaintForCurrentDate();
  }, delay);
}

function fetchSaintViaWidgetScript(dateString, signal) {
  return new Promise((resolve, reject) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const box = document.createElement('div');
    box.id = 'BoxSantoDelGiorno';
    box.hidden = true;
    const image = document.createElement('img');
    image.id = 'Immagine';
    const text = document.createElement('p');
    text.id = 'SantoDelGiorno';
    box.append(image, text);
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.santodelgiorno.it/_scriptjs/santodelgiorno.php?v=${day}/${month}/${year}`;
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      script.remove();
      box.remove();
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onAbort = () => finish(reject, new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    script.onerror = () => finish(reject, new Error('widget santo non raggiungibile'));
    script.onload = () => {
      const clone = text.cloneNode(true);
      clone.querySelectorAll('i, em').forEach((node) => node.remove());
      const name = String(clone.textContent || '').replace(/\s+/g, ' ').trim();
      if (name) finish(resolve, name);
      else finish(reject, new Error('widget santo senza nome principale'));
    };
    timer = window.setTimeout(() => finish(reject, new Error('timeout widget santo')), 9000);
    document.body.appendChild(box);
    box.appendChild(script);
  });
}

async function refreshSaintForCurrentDate() {
  const dateString = currentDate;
  setSaintLabel(document, dateString);
  if (cachedSaintName(dateString)) return;
  if (!navigator.onLine) {
    setSaintLabel(document, dateString, 'offline');
    return;
  }

  saintFetchController?.abort();
  saintBioFetchController?.abort();
  const controller = new AbortController();
  saintFetchController = controller;
  const serial = ++saintRequestSerial;
  try {
    let name = '';
    try {
      const response = await fetch(`${SAINT_API_URL}?data=${encodeURIComponent(dateString)}`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const info = principalSaintInfo(await response.json());
      name = info.name;
      if (!name) throw new Error('santo principale non presente nella risposta');
      cacheSaintInfo(dateString, info);
    } catch (apiError) {
      if (apiError?.name === 'AbortError') throw apiError;
      // Fallback compatibile con Safari/iPadOS: il sito sorgente documenta anche
      // un widget <script>, che non dipende dalle regole CORS della fetch JSON.
      name = await fetchSaintViaWidgetScript(dateString, controller.signal);
    }
    if (!cachedSaintName(dateString)) cacheSaintInfo(dateString, { name, source: 'SantoDelGiorno.it' });
    if (serial === saintRequestSerial && currentDate === dateString) setSaintLabel(document, dateString);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('Santo del giorno non disponibile', err);
    if (serial === saintRequestSerial && currentDate === dateString) setSaintLabel(document, dateString, navigator.onLine ? 'unavailable' : 'offline');
  } finally {
    if (saintFetchController === controller) saintFetchController = null;
  }
}

async function fetchSaintSummaryFromSource(dateString, name, signal) {
  try {
    const response = await fetch(`${SAINT_API_URL}?q=${encodeURIComponent(name)}`, {
      method: 'GET', mode: 'cors', credentials: 'omit', cache: 'force-cache', signal
    });
    if (response.ok) {
      const info = principalSaintInfo(await response.json(), name);
      if (info.summary) return info;
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', redirects: '1',
    prop: 'extracts', exintro: '1', explaintext: '1', titles: name
  });
  const response = await fetch(`${WIKIPEDIA_API_URL}?${params.toString()}`, {
    method: 'GET', mode: 'cors', credentials: 'omit', cache: 'force-cache', signal
  });
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
  const payload = await response.json();
  const page = Object.values(payload?.query?.pages || {}).find((item) => item && !item.missing);
  const summary = cleanSaintText(page?.extract, 900);
  return { name, summary, source: summary ? 'Wikipedia italiana' : '' };
}

function saintDateLabel(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(d);
}

function closeSaintDetails() {
  saintBioFetchController?.abort();
  saintBioFetchController = null;
  if (saintDetailPanel) saintDetailPanel.hidden = true;
}

async function openSaintDetails() {
  if (currentPageKind === 'note' || isPlannerKind()) return;
  const dateString = currentDate;
  const initial = cachedSaintInfo(dateString);
  if (!initial.name || !saintDetailPanel) return;
  saintDetailTitle.textContent = 'Santo del giorno';
  saintDetailDate.textContent = saintDateLabel(dateString);
  saintDetailName.textContent = initial.name;
  saintDetailText.textContent = initial.summary || 'Caricamento breve descrizione…';
  saintDetailSource.textContent = initial.summary && initial.source ? `Fonte: ${initial.source}` : '';
  saintDetailPanel.hidden = false;
  if (initial.summary || !navigator.onLine) {
    if (!initial.summary) saintDetailText.textContent = 'Breve descrizione non disponibile offline.';
    return;
  }

  saintBioFetchController?.abort();
  const controller = new AbortController();
  saintBioFetchController = controller;
  try {
    const info = await fetchSaintSummaryFromSource(dateString, initial.name, controller.signal);
    if (!info?.summary) throw new Error('descrizione non disponibile');
    cacheSaintInfo(dateString, info);
    if (currentDate === dateString && !saintDetailPanel.hidden) {
      saintDetailText.textContent = info.summary;
      saintDetailSource.textContent = `Fonte: ${info.source || 'SantoDelGiorno.it'}`;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
    if (currentDate === dateString && !saintDetailPanel.hidden) {
      saintDetailText.textContent = 'Breve descrizione momentaneamente non disponibile.';
      saintDetailSource.textContent = '';
    }
  } finally {
    if (saintBioFetchController === controller) saintBioFetchController = null;
  }
}

function plannerModeFromKind(kind = currentPageKind) {
  return isPlannerKind(kind) ? kind.slice('planner-'.length) : null;
}

function plannerKind(mode = 'daily') {
  return `planner-${PLANNER_MODES.includes(mode) ? mode : 'daily'}`;
}

function mondayOf(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + delta);
  return localISODate(d);
}

function plannerPeriodKey(dateString, mode, timetableIndex = currentTimetableIndex) {
  if (mode === 'daily') return `planner::day::${dateString}`; // 0.1.66: Ink indipendente dall'Agenda
  if (mode === 'weekly') return `planner::week::${mondayOf(dateString)}`;
  if (mode === 'monthly') return `planner::month::${dateString.slice(0, 7)}`;
  if (mode === 'timetable') {
    const index = Math.min(WEEKLY_TIMETABLE_MAX_PAGES, Math.max(1, Number(timetableIndex) || 1));
    // La prima tabella conserva la chiave storica: nessun orario della 0.1.52 viene perso.
    return index === 1 ? SHARED_WEEKLY_TIMETABLE_KEY : `${SHARED_WEEKLY_TIMETABLE_KEY}::${index}`;
  }
  return `planner::year::${dateString.slice(0, 4)}`;
}

function setHeaderFor(root, dateString, pageKind = 'agenda', noteIndex = 0, noteTotal = 0) {
  const d = new Date(`${dateString}T12:00:00`);
  const dayName = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(d).toLocaleUpperCase('it-IT');
  const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(d);
  root.querySelector('.day-number').textContent = String(d.getDate());
  root.querySelector('.day-name').textContent = dayName;
  root.querySelector('.month-name').textContent = monthName;
  root.querySelector('.year-label').textContent = String(d.getFullYear());
  setSaintLabel(root, dateString, 'cached', pageKind);
  setHistoryLabel(root, dateString, 'cached', pageKind);
  setWeatherBadgeFor(root, dateString, pageKind);
  const kindLabel = root.querySelector('.page-kind-label');
  const noteCounter = root.querySelector('.note-counter');
  const hours = root.querySelector('.hours');
  if (kindLabel) {
    if (pageKind === 'note') kindLabel.textContent = `Nota del giorno ${noteIndex}/${Math.max(noteIndex, noteTotal)}`;
    else if (isPlannerKind(pageKind)) {
      const mode = plannerModeFromKind(pageKind);
      const plannerDate = new Date(`${dateString}T12:00:00`);
      if (mode === 'daily') {
        const weekday = new Intl.DateTimeFormat('it-IT', { weekday:'long' }).format(plannerDate);
        const dayMonth = new Intl.DateTimeFormat('it-IT', { day:'numeric', month:'long' }).format(plannerDate);
        kindLabel.textContent = `Planner giornaliero - ${weekday} ${dayMonth}`;
      } else if (mode === 'weekly') kindLabel.textContent = plannerModeTitle('weekly', dateString);
      else if (mode === 'timetable') kindLabel.textContent = 'Orario settimanale';
      else if (mode === 'monthly') kindLabel.textContent = plannerModeTitle('monthly', dateString);
      else kindLabel.textContent = plannerModeTitle('yearly', dateString);
    } else kindLabel.textContent = '';
  }
  if (noteCounter) noteCounter.textContent = '';
  if (hours) hours.hidden = pageKind === 'note' || isPlannerKind(pageKind);
  if (pageKind === 'note') requestAnimationFrame(() => alignNoteTitleToPen(root));
  else if (kindLabel) kindLabel.style.removeProperty('left');
}

function alignNoteTitleToPen(root = document) {
  const pageRoot = root?.classList?.contains?.('paper') ? root : root?.querySelector?.('.paper');
  const label = root?.querySelector?.('.page-kind-label');
  const toolbar = root?.querySelector?.('.quick-toolbar');
  const pen = root?.querySelector?.('[data-tool="pen"]');
  if (!pageRoot || !label || !toolbar || !pen || !pageRoot.classList.contains('note-view')) return;
  const x = Number(toolbar.offsetLeft || 0) + Number(pen.offsetLeft || 0);
  if (x > 0) label.style.left = `${Math.round(x)}px`;
}

function plannerModeTitle(mode, dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  if (mode === 'daily') {
    const weekday = new Intl.DateTimeFormat('it-IT', { weekday:'long' }).format(d);
    const dayMonth = new Intl.DateTimeFormat('it-IT', { day:'numeric', month:'long' }).format(d);
    return `Planner giornaliero - ${weekday} ${dayMonth}`;
  }
  if (mode === 'weekly') {
    const monday = new Date(`${mondayOf(dateString)}T12:00:00`);
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
    const left = new Intl.DateTimeFormat('it-IT', { day:'numeric', month:'short' }).format(monday);
    const right = new Intl.DateTimeFormat('it-IT', { day:'numeric', month:'short', year:'numeric' }).format(sunday);
    return `Planning settimanale · ${left} – ${right}`;
  }
  if (mode === 'monthly') return `Planning mensile · ${new Intl.DateTimeFormat('it-IT', { month:'long', year:'numeric' }).format(d)}`;
  if (mode === 'timetable') return 'Orario settimanale';
  return `Planning annuale · ${d.getFullYear()}`;
}

function plannerDailyDateLabel(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  const weekday = new Intl.DateTimeFormat('it-IT', { weekday:'long' }).format(d).toLocaleUpperCase('it-IT');
  const month = new Intl.DateTimeFormat('it-IT', { month:'long' }).format(d);
  return `${d.getDate()} ${weekday} · ${month} ${d.getFullYear()}`;
}

function buildDailyPlannerHtml(dateString) {
  const rows = ['<div class="planner-time-row planner-time-row-blank"><span></span><i></i></div>']
    .concat(Array.from({ length: 12 }, (_, i) => 7 + i)
      .map((h) => `<div class="planner-time-row"><span>${String(h).padStart(2,'0')}:00</span><i></i></div>`))
    .join('');
  return `<div class="planner-daily-grid">
      <section class="planner-timeline"><h3>Programma</h3><div class="planner-time-rows">${rows}</div><div class="planner-time-bottom-label"><span>19:00</span><i></i></div></section>
      <aside class="planner-daily-side">
        <section class="planner-box planner-priority"><h3>Priorità del giorno</h3><div>1.</div><div>2.</div><div>3.</div></section>
        <section class="planner-box planner-todo"><h3>To-do</h3><div>□</div><div>□</div><div>□</div><div>□</div></section>
        <section class="planner-box planner-ideas"><h3>Note / Idee</h3></section>
      </aside>
    </div><div class="planner-sync-label">Ink indipendente dalla pagina Agenda del giorno</div>`;
}

function buildWeeklyPlannerHtml(dateString) {
  const monday = new Date(`${mondayOf(dateString)}T12:00:00`);
  const fmt = new Intl.DateTimeFormat('it-IT', { weekday:'short', day:'numeric' });
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    return `<section class="planner-week-day"><h3>${fmt.format(d).replace('.', '').toUpperCase()}</h3><div class="planner-week-lines"></div></section>`;
  }).join('');
  return `<div class="planner-week-grid">${cols}</div>
    <div class="planner-week-bottom"><section class="planner-box"><h3>To-do della settimana</h3></section><section class="planner-box"><h3>Obiettivi / Note</h3></section></div>`;
}

function buildMonthlyPlannerHtml(dateString) {
  const [year, month] = dateString.split('-').map(Number);
  const first = new Date(year, month - 1, 1, 12);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first); gridStart.setDate(1 - startOffset);
  const labels = ['LUN','MAR','MER','GIO','VEN','SAB','DOM'].map((x)=>`<div class="planner-month-weekday">${x}</div>`).join('');
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const outside = d.getMonth() !== month - 1 ? ' outside' : '';
    const today = localISODate(d) === dateString ? ' reference' : '';
    return `<div class="planner-month-cell${outside}${today}"><span>${d.getDate()}</span></div>`;
  }).join('');
  return `<div class="planner-month-grid">${labels}${cells}</div>
    <div class="planner-month-bottom"><section class="planner-box"><h3>Obiettivi del mese</h3></section><section class="planner-box"><h3>Note / Riepilogo</h3></section></div>`;
}

function miniMonthHtml(year, monthIndex) {
  const first = new Date(year, monthIndex, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0, 12).getDate();
  const monthName = new Intl.DateTimeFormat('it-IT', { month:'long' }).format(first).toUpperCase();
  const trailing = Math.max(0, 42 - offset - days);
  const leadingBlanks = Array.from({ length: offset }, () => '<i></i>').join('');
  const nums = Array.from({ length: days }, (_, i) => `<span>${i + 1}</span>`).join('');
  const trailingBlanks = Array.from({ length: trailing }, () => '<i></i>').join('');
  const weekdayLabels = ['L','M','M','G','V','S','D'].map((label) => `<span>${label}</span>`).join('');
  return `<section class="planner-mini-month"><h3>${monthName}</h3><div class="planner-mini-week">${weekdayLabels}</div><div class="planner-mini-days">${leadingBlanks}${nums}${trailingBlanks}</div></section>`;
}

function buildYearlyPlannerHtml(dateString) {
  const year = Number(dateString.slice(0,4));
  const months = Array.from({ length: 12 }, (_, i) => miniMonthHtml(year, i)).join('');
  return `<div class="planner-year-grid">${months}</div>
    <div class="planner-year-bottom"><section class="planner-box"><h3>Obiettivi annuali</h3></section><section class="planner-box"><h3>Progetti principali</h3></section><section class="planner-box"><h3>Note strategiche</h3></section></div>`;
}

function buildSharedWeeklyTimetablePlannerHtml(timetableIndex = currentTimetableIndex) {
  const headers = ['ORARI','LUNEDÌ','MARTEDÌ','MERCOLEDÌ','GIOVEDÌ','VENERDÌ'];
  const heads = headers.map((label) => `<div class="planner-timetable-head">${label}</div>`).join('');
  const rows = Array.from({ length: SHARED_WEEKLY_TIMETABLE_ROWS }, (_, row) => {
    const compact = row === 3 || row === 6 ? ' break-row' : '';
    return Array.from({ length: 6 }, (_, col) => `<div class="planner-timetable-cell${compact}${col === 0 ? ' time-column' : ''}"></div>`).join('');
  }).join('');
  return `<div class="planner-timetable-page">
    <div class="planner-timetable-title">Orario settimanale <span>${timetableIndex}/${WEEKLY_TIMETABLE_MAX_PAGES}</span></div>
    <div class="planner-timetable-grid">
      <div class="planner-timetable-owner-row"><strong>Nome e cognome</strong><div aria-hidden="true"></div></div>
      ${heads}${rows}
    </div>
  </div>`;
}

function plannerHtml(mode, dateString, timetableIndex = currentTimetableIndex) {
  if (mode === 'weekly') return buildWeeklyPlannerHtml(dateString);
  if (mode === 'monthly') return buildMonthlyPlannerHtml(dateString);
  if (mode === 'yearly') return buildYearlyPlannerHtml(dateString);
  if (mode === 'timetable') return buildSharedWeeklyTimetablePlannerHtml(timetableIndex);
  return buildDailyPlannerHtml(dateString);
}


async function loadDescriptorAsCurrentPage(target, forcedStyle = null, preserveToolStyles = false) {
  const enteringTimetable = currentPageKind !== 'planner-timetable' && target.kind === 'planner-timetable';
  await openDb();
  const record = await getRecord(target.key);
  session.storageReads++;
  currentPageKind = target.kind;
  currentPlannerMode = target.plannerMode ?? plannerModeFromKind(target.kind) ?? currentPlannerMode;
  currentTimetableIndex = target.kind === 'planner-timetable' ? (Number(target.timetableIndex) || 1) : currentTimetableIndex;
  if (enteringTimetable) activeTool = 'pen';
  if (enteringTimetable) {
    cancelShapeGesture();
    if (shapePalette) shapePalette.hidden = true;
    shapeOverlay?.setAttribute('hidden', '');
    shapeToolButton?.setAttribute('aria-expanded', 'false');
    paper?.classList.remove('shape-mode');
  }
  currentNoteIndex = target.kind === 'note' ? target.noteIndex : 0;
  currentNoteTotal = target.kind === 'note' ? target.noteTotal : 0;
  strokes = Array.isArray(record?.strokes) ? record.strokes : [];
  images = imagesFromRecord(record);
  selectedImageId = null;
  const previousPaperColor = pageStyle.color;
  pageStyle = forcedStyle ? normalizePageStyle(forcedStyle) : pageStyleFromRecord(record);
  applyPageStyle();
  updatePageStyleUi();
  if (pageStyle.color !== previousPaperColor && !preserveToolStyles) applyToolDefaultsForPaper(pageStyle.color);
  resetUndoHistory();
  dirty = false;
  await migrateLegacyErasersOnCurrentPage();
  updateHeader();
  resizeCanvas();
  renderAll();
  renderImages();
  updateToolUi();
  updateStyleUi();
}

async function openWeeklyTimetable() {
  if (drawing || pageTurning || pageStyleBulkBusy || currentPageKind === 'planner-timetable') return;
  pageTurning = true;
  closeStylePanel();
  cancelPendingSave();
  const oldDescriptor = pageDescriptor();
  const saveOk = dirty ? await persistSnapshot(oldDescriptor, strokes, false, pageStyle, images) : true;
  if (!saveOk) {
    pageTurning = false;
    statusLabel.textContent = 'salvataggio non riuscito';
    if (dirty) scheduleSave();
    return;
  }
  weeklyTimetableReturnDescriptor = { ...oldDescriptor };
  const target = pageDescriptor(currentDate, 'planner-timetable', 0, 0, 1);
  try {
    await loadDescriptorAsCurrentPage(target, { color:'black', template:'blank' }, true);
    statusLabel.textContent = strokes.length ? 'orario settimanale caricato' : 'orario settimanale';
  } catch (err) {
    session.storageErrors++;
    console.warn('Orario settimanale non disponibile', err);
    statusLabel.textContent = 'orario settimanale non disponibile';
  } finally {
    pageTurning = false;
  }
}

async function closeWeeklyTimetable() {
  if (currentPageKind !== 'planner-timetable' || drawing || pageTurning) return;
  pageTurning = true;
  cancelPendingSave();
  const currentDescriptor = pageDescriptor();
  const saveOk = dirty ? await persistSnapshot(currentDescriptor, strokes, false, pageStyle, images) : true;
  if (!saveOk) {
    pageTurning = false;
    statusLabel.textContent = 'salvataggio orario non riuscito';
    if (dirty) scheduleSave();
    return;
  }
  const fallback = pageDescriptor(currentDate, 'planner-weekly', 0, 0);
  const target = isPlannerKind(weeklyTimetableReturnDescriptor?.kind) && weeklyTimetableReturnDescriptor.kind !== 'planner-timetable'
    ? weeklyTimetableReturnDescriptor
    : fallback;
  weeklyTimetableReturnDescriptor = null;
  try {
    await loadDescriptorAsCurrentPage(target, null, true);
    statusLabel.textContent = 'Planner settimanale';
  } catch (err) {
    session.storageErrors++;
    console.warn('Ritorno al Planner settimanale non riuscito', err);
    statusLabel.textContent = 'Planner non disponibile';
  } finally {
    pageTurning = false;
  }
}

function isWeeklyTimetableTitleTarget(target) {
  return (currentPageKind === 'planner-weekly' || currentPageKind === 'planner-timetable')
    && target instanceof Element
    && Boolean(target.closest('.page-kind-label'));
}

function registerPageDoubleTap(target, x, y) {
  if (!(target instanceof Element) || !paper.contains(target) || isUiControlTarget(target)) return false;
  const now = performance.now();
  const pageKey = `${currentPageKind}|${currentDate}|${currentNoteIndex}`;
  const previous = pageDoubleTapLastTap;
  pageDoubleTapLastTap = { at: now, x, y, title: isWeeklyTimetableTitleTarget(target), pageKey };
  if (!previous) return false;
  const closeInTime = now - previous.at <= 430;
  const closeInSpace = Math.hypot(x - previous.x, y - previous.y) <= 42;
  const samePage = previous.pageKey === pageKey;
  if (!closeInTime || !closeInSpace || !samePage) return false;
  pageDoubleTapLastTap = null;

  // 0.1.50 — nessun doppio tap apre più l'Orario settimanale.
  // L'Orario si richiama esclusivamente con swipe verso il basso dal Planning settimanale.

  // Agenda, Note e qualunque Planner: doppio tap sul corpo pagina = copertina privacy.
  if (currentPageKind === 'agenda' || currentPageKind === 'note' || isPlannerKind(currentPageKind)) {
    showIdleCover(true);
    return true;
  }
  return false;
}

function calendarMonthDate(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

function shiftMonthDate(dateString, delta) {
  const d = calendarMonthDate(dateString);
  d.setMonth(d.getMonth() + delta);
  return localISODate(d);
}

function buildMiniCalendarHtml(selectedDateString, viewDateString = selectedDateString, interactive = false) {
  const selected = new Date(`${selectedDateString}T12:00:00`);
  const view = calendarMonthDate(viewDateString);
  const year = view.getFullYear();
  const month = view.getMonth();
  const selectedDay = selected.getFullYear() === year && selected.getMonth() === month ? selected.getDate() : -1;
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const monthTitle = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(first);
  const weekdayLabels = ['L','M','M','G','V','S','D'].map((label) => `<span class="mini-calendar-weekday">${label}</span>`).join('');
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<i class="mini-calendar-empty" aria-hidden="true"></i>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateString = localISODate(new Date(year, month, day, 12));
    const selectedClass = day === selectedDay ? ' selected' : '';
    if (interactive) {
      cells.push(`<button type="button" class="mini-calendar-day${selectedClass}" data-calendar-date="${dateString}" aria-label="Apri ${day} ${monthTitle}">${day}</button>`);
    } else {
      cells.push(`<span class="mini-calendar-day${selectedClass}">${day}</span>`);
    }
  }
  while (cells.length % 7) cells.push('<i class="mini-calendar-empty" aria-hidden="true"></i>');
  const prevMonth = shiftMonthDate(localISODate(first), -1);
  const nextMonth = shiftMonthDate(localISODate(first), 1);
  const prevDisabled = prevMonth < MIN_DATE.slice(0, 7) + '-01';
  const nextDisabled = nextMonth > MAX_DATE.slice(0, 7) + '-01';
  const title = interactive
    ? `<div class="mini-calendar-title"><button type="button" class="mini-calendar-nav" data-calendar-shift="-1" ${prevDisabled ? 'disabled aria-disabled="true"' : ''} aria-label="Mese precedente">‹</button><strong>${monthTitle}</strong><button type="button" class="mini-calendar-nav" data-calendar-shift="1" ${nextDisabled ? 'disabled aria-disabled="true"' : ''} aria-label="Mese successivo">›</button></div>`
    : `<div class="mini-calendar-title"><strong>${monthTitle}</strong></div>`;
  return `${title}<div class="mini-calendar-grid">${weekdayLabels}${cells.join('')}</div>`;
}

function syncCalendarForRoot(root, descriptor) {
  const panel = root.querySelector('.mini-calendar');
  const button = root.querySelector('#calendarButton, .calendar-button');
  const isAgenda = descriptor.kind === 'agenda';
  const shown = isAgenda && calendarVisiblePreference;
  if (button) {
    button.hidden = !isAgenda;
    button.classList.toggle('active', shown);
    button.setAttribute('aria-pressed', shown ? 'true' : 'false');
    button.title = shown ? 'Nascondi calendario' : 'Mostra calendario';
  }
  if (panel) {
    panel.hidden = !shown;
    panel.setAttribute('aria-hidden', shown ? 'false' : 'true');
    const interactive = root === paper;
    const viewDate = interactive ? (calendarViewDate ?? descriptor.date) : descriptor.date;
    panel.innerHTML = shown ? buildMiniCalendarHtml(descriptor.date, viewDate, interactive) : '';
  }
}

function syncCalendarUi() {
  syncCalendarForRoot(paper, pageDescriptor());
}

function toggleCalendar() {
  if (drawing || pageTurning || currentPageKind !== 'agenda') return;
  closeStylePanel();
  calendarVisiblePreference = !calendarVisiblePreference;
  if (calendarVisiblePreference) calendarViewDate = currentDate;
  try { localStorage.setItem(CALENDAR_VISIBILITY_STORAGE_KEY, calendarVisiblePreference ? '1' : '0'); } catch {}
  syncCalendarUi();
  statusLabel.textContent = calendarVisiblePreference ? 'calendario visibile' : 'calendario nascosto';
}

async function navigateToAgendaDate(targetDate) {
  if (!dateInRange(targetDate) || drawing || pageTurning || pageStyleBulkBusy) return;
  if (targetDate === currentDate && currentPageKind === 'agenda') {
    calendarViewDate = targetDate;
    syncCalendarUi();
    return;
  }
  pageTurning = true;
  closeStylePanel();
  cancelPendingSave();
  const oldDescriptor = pageDescriptor();
  const saveOk = dirty ? await persistSnapshot(oldDescriptor, strokes, false, pageStyle, images) : true;
  if (!saveOk) {
    pageTurning = false;
    statusLabel.textContent = 'salvataggio non riuscito';
    if (dirty) scheduleSave();
    return;
  }
  try {
    await openDb();
    const [record, noteTotal] = await Promise.all([getRecord(targetDate), ensureNotesCount(targetDate)]);
    session.storageReads++;
    currentDate = targetDate;
    currentPageKind = 'agenda';
    currentNoteIndex = 0;
    currentNoteTotal = noteTotal ?? 0;
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    images = imagesFromRecord(record);
    selectedImageId = null;
    const previousPaperColor = pageStyle.color;
    pageStyle = pageStyleFromRecord(record);
    applyPageStyle();
    updatePageStyleUi();
    if (pageStyle.color !== previousPaperColor) applyToolDefaultsForPaper(pageStyle.color);
    resetUndoHistory();
    dirty = false;
    await migrateLegacyErasersOnCurrentPage();
    calendarViewDate = targetDate;
    updateHeader();
    resizeCanvas();
    renderAll();
    renderImages();
    statusLabel.textContent = strokes.length ? 'pagina caricata' : 'pagina nuova';
  } catch (err) {
    session.storageErrors++;
    console.warn('Navigazione calendario non riuscita', err);
    statusLabel.textContent = 'pagina non disponibile';
  } finally {
    pageTurning = false;
  }
}

function shiftMiniCalendar(delta) {
  if (!calendarVisiblePreference || currentPageKind !== 'agenda') return;
  const base = calendarViewDate ?? currentDate;
  const next = shiftMonthDate(base, delta);
  const minMonth = `${MIN_DATE.slice(0, 7)}-01`;
  const maxMonth = `${MAX_DATE.slice(0, 7)}-01`;
  if (next < minMonth || next > maxMonth) return;
  calendarViewDate = next;
  syncCalendarUi();
}

function handleCalendarCommand(button) {
  if (!(button instanceof HTMLButtonElement)) return false;
  if (button.matches('[data-calendar-date]')) {
    void navigateToAgendaDate(button.dataset.calendarDate);
    return true;
  }
  if (button.matches('[data-calendar-shift]')) {
    shiftMiniCalendar(Number(button.dataset.calendarShift) || 0);
    return true;
  }
  return false;
}

function configurePageRoot(root, descriptor) {
  const planner = isPlannerKind(descriptor.kind);
  const mode = planner ? plannerModeFromKind(descriptor.kind) : null;
  root.classList.toggle('planner-view', planner);
  root.classList.toggle('note-view', descriptor.kind === 'note');
  for (const m of PLANNER_MODES) root.classList.toggle(`planner-${m}`, planner && mode === m);
  root.classList.toggle('planner-timetable', planner && mode === 'timetable');
  const layer = root.querySelector('.planner-layer');
  if (layer) {
    layer.hidden = !planner;
    layer.setAttribute('aria-hidden', planner ? 'false' : 'true');
    layer.innerHTML = planner ? plannerHtml(mode, descriptor.date, descriptor.timetableIndex) : '';
  }
  const modeBar = root.querySelector('.planner-mode-bar');
  if (modeBar) modeBar.hidden = !planner || mode === 'timetable';
  syncCalendarForRoot(root, descriptor);
  root.querySelectorAll('.planner-mode-button').forEach((button) => {
    const selected = planner && button.dataset.plannerMode === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  const hours = root.querySelector('.hours');
  if (hours) hours.hidden = descriptor.kind === 'note' || planner;
}

function updateHeader() {
  setHeaderFor(document, currentDate, currentPageKind, currentNoteIndex, currentNoteTotal);
  configurePageRoot(paper, pageDescriptor());
  if (currentPageKind === 'agenda') {
    scheduleSaintRefresh();
    scheduleHistoryRefresh();
    scheduleWeatherRefresh();
  } else {
    saintFetchController?.abort(); saintBioFetchController?.abort();
    historyFetchController?.abort(); historyDetailFetchController?.abort();
    weatherFetchController?.abort();
    weatherDetailFetchController?.abort();
    if (weatherDetailPanel) weatherDetailPanel.hidden = true;
    setHistoryLabel(document, currentDate, 'hidden', currentPageKind);
    setWeatherBadgeFor(document, currentDate, currentPageKind);
  }
  if (baselineLabel) {
    if (currentPageKind === 'note') baselineLabel.textContent = `Note del giorno ${currentNoteIndex}/${Math.max(currentNoteIndex, currentNoteTotal)}`;
    else if (isPlannerKind()) baselineLabel.textContent = currentPlannerMode === 'timetable' ? 'ORARIO SETTIMANALE · INK NATIVO' : `PLANNER · ${plannerModeTitle(currentPlannerMode, currentDate).toUpperCase()}`;
    else baselineLabel.textContent = 'AGENDA · PLANNER · INK STABILE';
  }
}

function notesMetaKey(dateString) {
  return `${dateString}${NOTES_META_SUFFIX}`;
}

function noteKey(dateString, noteIndex) {
  return `${dateString}::note::${String(noteIndex).padStart(4, '0')}`;
}

function pageKey(dateString, pageKind = 'agenda', noteIndex = 0, timetableIndex = currentTimetableIndex) {
  if (pageKind === 'note') return noteKey(dateString, noteIndex);
  if (isPlannerKind(pageKind)) return plannerPeriodKey(dateString, plannerModeFromKind(pageKind), timetableIndex);
  return dateString;
}

function pageDescriptor(dateString = currentDate, pageKind = currentPageKind, noteIndex = currentNoteIndex, noteTotal = currentNoteTotal, timetableIndex = currentTimetableIndex) {
  const plannerMode = isPlannerKind(pageKind) ? plannerModeFromKind(pageKind) : null;
  return {
    date: dateString,
    kind: pageKind,
    plannerMode,
    timetableIndex: pageKind === 'planner-timetable'
      ? Math.min(WEEKLY_TIMETABLE_MAX_PAGES, Math.max(1, Number(timetableIndex) || 1))
      : 0,
    noteIndex: pageKind === 'note' ? noteIndex : 0,
    noteTotal: pageKind === 'note' ? noteTotal : 0,
    key: pageKey(dateString, pageKind, noteIndex, timetableIndex),
    createNote: false
  };
}

function currentPageKey() {
  return pageKey(currentDate, currentPageKind, currentNoteIndex, currentTimetableIndex);
}

function addDays(dateString, delta) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localISODate(d);
}

function dateInRange(dateString) {
  return dateString >= MIN_DATE && dateString <= MAX_DATE;
}

function openDb() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'date' });
      if (!database.objectStoreNames.contains(SYNC_EVENT_STORE)) {
        const events = database.createObjectStore(SYNC_EVENT_STORE, { keyPath: 'eventId' });
        events.createIndex('status', 'status', { unique: false });
        events.createIndex('replicaId', 'replicaId', { unique: false });
        events.createIndex('replicaSequence', 'replicaSequence', { unique: false });
        events.createIndex('entityId', 'entityId', { unique: false });
        events.createIndex('hlcWallMs', 'hlcWallMs', { unique: false });
      }
      if (!database.objectStoreNames.contains(SYNC_META_STORE)) database.createObjectStore(SYNC_META_STORE, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(SYNC_BLOB_STORE)) {
        const blobs = database.createObjectStore(SYNC_BLOB_STORE, { keyPath: 'hash' });
        blobs.createIndex('mimeType', 'mimeType', { unique: false });
        blobs.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function getRecord(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(date);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function putRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transazione IndexedDB annullata'));
  });
}

function getSyncMeta(key = SYNC_STATE_KEY) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_META_STORE, 'readonly');
    const req = tx.objectStore(SYNC_META_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function putSyncMeta(row) {
  if (!row) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_META_STORE, 'readwrite');
    tx.objectStore(SYNC_META_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Persistenza identità Sync annullata'));
  });
}

function countPendingSyncEvents() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readonly');
    const req = tx.objectStore(SYNC_EVENT_STORE).index('status').count('pending');
    req.onsuccess = () => resolve(Number(req.result) || 0);
    req.onerror = () => reject(req.error);
  });
}

function listPendingSyncEvents(limit = 200) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readonly');
    const req = tx.objectStore(SYNC_EVENT_STORE).index('status').getAll('pending', Math.max(1, Math.min(500, Number(limit) || 200)));
    req.onsuccess = () => resolve((Array.isArray(req.result) ? req.result : []).sort((a, b) => (Number(a.replicaSequence) || 0) - (Number(b.replicaSequence) || 0) || String(a.eventId || '').localeCompare(String(b.eventId || ''))));
    req.onerror = () => reject(req.error);
  });
}

function markSyncEventsSent(eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))];
  if (!ids.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_EVENT_STORE);
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result;
        if (!row || row.status !== 'pending') return;
        row.status = 'sent';
        row.sentAt = new Date().toISOString();
        store.put(row);
      };
    }
    tx.oncomplete = () => {
      countPendingSyncEvents().then((pending) => syncFoundation?.setStoredPending(pending)).catch(() => {}).finally(resolve);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Aggiornamento outbox LAN annullato'));
  });
}

function getSyncEvent(eventId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readonly');
    const req = tx.objectStore(SYNC_EVENT_STORE).get(eventId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function getSyncEventsByEntity(entityId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readonly');
    const req = tx.objectStore(SYNC_EVENT_STORE).index('entityId').getAll(String(entityId || ''));
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

function putSyncBlob(row) {
  if (!row?.hash || !(row.blob instanceof Blob)) return Promise.reject(new Error('Blob Sync non valido'));
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_BLOB_STORE, 'readwrite');
    tx.objectStore(SYNC_BLOB_STORE).put({
      hash: String(row.hash).toLowerCase(),
      mimeType: String(row.mimeType || row.blob.type || 'application/octet-stream'),
      size: Math.max(0, Number(row.size) || row.blob.size || 0),
      blob: row.blob,
      createdAt: row.createdAt || new Date().toISOString(),
      verifiedAt: new Date().toISOString()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Persistenza blob Sync annullata'));
  });
}

function getSyncBlob(hash) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_BLOB_STORE, 'readonly');
    const req = tx.objectStore(SYNC_BLOB_STORE).get(String(hash || '').toLowerCase());
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function hasSyncBlob(hash) {
  return getSyncBlob(hash).then(Boolean);
}

async function registerBlob(blob, mimeType = '') {
  const hash = await sha256Blob(blob);
  const row = { hash, blob, mimeType: mimeType || blob.type || 'application/octet-stream', size: blob.size };
  await putSyncBlob(row);
  return row;
}

async function ensureImageBlob(image) {
  if (!image?.src) return false;
  if (isSha256Hash(image.blobHash) && await hasSyncBlob(image.blobHash).catch(() => false)) return false;
  const before = cloneImageObject(image);
  const blob = dataUrlToBlob(image.src);
  const row = await registerBlob(blob, image.mimeType || blob.type);
  image.blobHash = row.hash;
  image.blobSize = row.size;
  image.mimeType = row.mimeType;
  image.modifiedAt = image.modifiedAt || new Date().toISOString();
  syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', image, { before, blobMigration: true });
  dirty = true;
  return true;
}

async function ensureCurrentPageImageBlobs() {
  if (!images.length) return 0;
  let changed = 0;
  for (const image of images) {
    if (drawing || pageTurning) throw new DOMException('Ink priority', 'AbortError');
    if (await ensureImageBlob(image)) changed++;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return changed;
}

function getLanPullCursor(hubId) {
  return getSyncMeta(LAN_STATE_KEY).then((row) => row?.hubId === hubId ? (Number(row.cursor) || 0) : 0);
}

async function setLanPullCursor(hubId, cursor) {
  const old = await getSyncMeta(LAN_STATE_KEY).catch(() => null);
  return putSyncMeta({ ...old, key: LAN_STATE_KEY, hubId: String(hubId || ''), cursor: Math.max(0, Number(cursor) || 0), modifiedAt: new Date().toISOString() });
}

function getLanGroupEpoch(hubId) {
  return getSyncMeta(LAN_STATE_KEY).then((row) => row?.hubId === hubId ? String(row?.groupEpoch || '') : '');
}

async function setLanGroupEpoch(hubId, epoch) {
  const old = await getSyncMeta(LAN_STATE_KEY).catch(() => null);
  return putSyncMeta({ ...old, key: LAN_STATE_KEY, hubId: String(hubId || old?.hubId || ''), groupEpoch: String(epoch || ''), cursor: Math.max(0, Number(old?.cursor) || 0), modifiedAt: new Date().toISOString() });
}

function compareHlcDeterministic(a, b) {
  const aw = Number(a?.hlcWallMs) || 0;
  const bw = Number(b?.hlcWallMs) || 0;
  if (aw !== bw) return aw - bw;
  const al = Number(a?.hlcLogical) || 0;
  const bl = Number(b?.hlcLogical) || 0;
  if (al !== bl) return al - bl;
  return String(a?.eventId || '').localeCompare(String(b?.eventId || ''));
}

function buildEmptyPageRecord(descriptor) {
  const d = descriptor || {};
  return {
    date: String(d.key || d.date || ''),
    kind: d.kind === 'note' ? 'day-note-ink'
      : d.kind === 'planner-daily' ? 'planner-day-ink'
      : d.kind === 'planner-weekly' ? 'planner-week-ink'
      : d.kind === 'planner-monthly' ? 'planner-month-ink'
      : d.kind === 'planner-yearly' ? 'planner-year-ink'
      : d.kind === 'planner-timetable' ? 'planner-timetable-ink'
      : 'agenda-day-ink',
    referenceDate: String(d.date || ''),
    plannerMode: d.plannerMode ?? null,
    noteIndex: d.kind === 'note' ? (Number(d.noteIndex) || 0) : 0,
    version: APP_VERSION,
    pipeline: 'coalesced-retina-storage-sync-v1',
    strokes: [],
    images: [],
    pageStyle: d.kind === 'planner-timetable' ? { color:'black', template:'blank' } : { ...DEFAULT_PAGE_STYLE },
    modifiedAt: new Date().toISOString()
  };
}

function descriptorFromStoredRecord(record) {
  const key = String(record?.date || '');
  const kind = String(record?.kind || '');
  const referenceDate = String(record?.referenceDate || (key.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || currentDate));
  let pageKind = 'agenda';
  if (kind === 'day-note-ink') pageKind = 'note';
  else if (kind === 'planner-day-ink') pageKind = 'planner-daily';
  else if (kind === 'planner-week-ink') pageKind = 'planner-weekly';
  else if (kind === 'planner-month-ink') pageKind = 'planner-monthly';
  else if (kind === 'planner-year-ink') pageKind = 'planner-yearly';
  else if (kind === 'planner-timetable-ink') pageKind = 'planner-timetable';
  const timetableMatch = key.match(/::shared-weekly-timetable-v3(?:::(\d+))?$/);
  const timetableIndex = pageKind === 'planner-timetable' ? Math.max(1, Number(timetableMatch?.[1]) || 1) : 0;
  return {
    key, date: referenceDate, kind: pageKind,
    plannerMode: pageKind.startsWith('planner-') ? plannerModeFromKind(pageKind) : null,
    timetableIndex,
    noteIndex: pageKind === 'note' ? Math.max(1, Number(record?.noteIndex) || Number(key.match(/::note::(\d+)$/)?.[1]) || 1) : 0,
    noteTotal: 0, createNote: false
  };
}

async function ensureSnapshotRecordImageBlobs(record) {
  if (!Array.isArray(record?.images) || !record.images.length) return record;
  let changed = false;
  const next = { ...record, images: record.images.map(cloneImageObject) };
  for (const image of next.images) {
    if (!image?.src) continue;
    let row = null;
    if (isSha256Hash(image.blobHash)) row = await getSyncBlob(image.blobHash).catch(() => null);
    if (!row?.blob) {
      const blob = await dataUrlToBlob(image.src);
      row = await registerBlob(blob, image.mimeType || blob.type || 'image/webp');
    }
    if (row?.hash && image.blobHash !== row.hash) { image.blobHash = row.hash; changed = true; }
    const size = Number(row?.size) || row?.blob?.size || 0;
    if (size && Number(image.blobSize) !== size) { image.blobSize = size; changed = true; }
  }
  if (changed) {
    next.version = APP_VERSION; next.modifiedAt = new Date().toISOString();
    await putRecord(next);
  }
  return next;
}

async function queueAuthoritativeGroupSnapshot() {
  const records = await readAllMainRecords();
  let queued = 0;
  for (const original of records) {
    const record = await ensureSnapshotRecordImageBlobs(original);
    const descriptor = descriptorFromStoredRecord(record);
    syncFoundation?.recordPageSnapshot(descriptor, record);
    for (const stroke of Array.isArray(record?.strokes) ? record.strokes : []) {
      if (stroke?.id) syncFoundation?.recordStrokeAdded(descriptor, stroke);
    }
    const commit = syncFoundation?.prepareAtomicCommit(descriptor.key) || { events: [], eventIds: [], stateRow: null };
    if (commit.events.length) {
      await putRecordWithSync(record, commit);
      syncFoundation?.markAtomicCommitSucceeded(commit.eventIds, 0);
      queued += commit.events.length;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { records: records.length, events: queued };
}

function putRemoteEventResult(event, status, pageRecord = null, detail = null) {
  return new Promise((resolve, reject) => {
    const stores = pageRecord ? [STORE, SYNC_EVENT_STORE, SYNC_META_STORE] : [SYNC_EVENT_STORE, SYNC_META_STORE];
    const tx = db.transaction(stores, 'readwrite');
    if (pageRecord) tx.objectStore(STORE).put(pageRecord);
    const remoteRow = {
      ...event,
      status,
      source: 'lan-remote',
      receivedAt: new Date().toISOString(),
      remoteDetail: detail || null
    };
    tx.objectStore(SYNC_EVENT_STORE).put(remoteRow);
    if (syncFoundation) tx.objectStore(SYNC_META_STORE).put(syncFoundation.getStateRow());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Applicazione evento LAN annullata'));
  });
}

function maximalEntityEvents(events) {
  const all = (events || []).filter((event) => event?.versionVector && event?.eventId);
  return all.filter((candidate, i) => !all.some((other, j) => {
    if (i === j) return false;
    return syncFoundation?.compareVersionVectors(candidate.versionVector, other.versionVector) === 'before';
  }));
}


async function applyRemoteSharedWeeklyTimetableEvent(event) {
  // Compatibilità 0.1.41–0.1.45: i vecchi eventi cella appartengono alla tecnologia dismessa.
  await putRemoteEventResult(event, 'ignored-legacy', null, 'orario v1 dismesso: le versioni successive usano normali stroke del Planning');
  return { ignored: 1 };
}

async function applyRemoteSharedWeeklyTimetableInkStrokeEvent(event) {
  // Compatibilità 0.1.44–0.1.45: nessun canvas per cella viene più ricostruito.
  await putRemoteEventResult(event, 'ignored-legacy', null, 'Ink per-cella v1 dismesso: usa superficie Ink unica v2');
  return { ignored: 1 };
}

async function applyRemoteStrokeEvent(event) {
  const descriptor = event.descriptor || {};
  const pageKeyValue = String(descriptor.key || '');
  if (!pageKeyValue) {
    await putRemoteEventResult(event, 'deferred', null, 'descriptor pagina mancante');
    return { deferred: 1 };
  }
  const [record, history] = await Promise.all([getRecord(pageKeyValue), getSyncEventsByEntity(event.entityId)]);
  const frontier = maximalEntityEvents([...history, event]);
  const adds = frontier.filter((row) => row.operation === 'stroke.add' && row.payload?.stroke?.id);
  const deletes = frontier.filter((row) => row.operation === 'stroke.delete');
  const conflict = adds.length > 0 && deletes.length > 0;
  const page = record ? { ...record } : buildEmptyPageRecord(descriptor);
  const pageStrokes = Array.isArray(page.strokes) ? [...page.strokes] : [];
  const strokeId = String(event.payload?.stroke?.id || event.payload?.strokeId || event.entityId?.replace(/^stroke:/, '') || '');
  const existingIndex = pageStrokes.findIndex((stroke) => String(stroke?.id || '') === strokeId);

  if (adds.length) {
    const winner = [...adds].sort(compareHlcDeterministic).at(-1);
    const stroke = winner?.payload?.stroke;
    if (stroke?.id) {
      if (existingIndex >= 0) pageStrokes[existingIndex] = stroke;
      else pageStrokes.push(stroke);
    }
  } else if (existingIndex >= 0) {
    pageStrokes.splice(existingIndex, 1);
  }

  page.strokes = pageStrokes;
  page.version = APP_VERSION;
  page.modifiedAt = new Date().toISOString();
  await putRemoteEventResult(event, conflict ? 'conflict-preserved' : 'applied', page, conflict ? 'add/delete concorrenti: stroke preservato' : null);
  if (currentPageKey() === pageKeyValue && !drawing && !pageTurning && !dirty) {
    // Il pull remoto avviene fuori dal percorso realtime. Se la pagina corrente non ha
    // modifiche locali pendenti, aggiorniamo subito la vista anche per testo Windows.
    strokes = pageStrokes;
    renderAll();
  }
  return conflict ? { applied: 1, conflicts: 1 } : { applied: 1 };
}

async function applyRemotePageClear(event) {
  const descriptor = event.descriptor || {};
  const pageKeyValue = String(descriptor.key || '');
  if (!pageKeyValue) {
    await putRemoteEventResult(event, 'deferred', null, 'descriptor pagina mancante');
    return { deferred: 1 };
  }
  const record = await getRecord(pageKeyValue);
  const page = record ? { ...record } : buildEmptyPageRecord(descriptor);
  const strokeIds = new Set((event.payload?.removedStrokeIds || []).map(String));
  const imageIds = new Set((event.payload?.removedImageIds || []).map(String));
  page.strokes = (Array.isArray(page.strokes) ? page.strokes : []).filter((stroke) => !strokeIds.has(String(stroke?.id || '')));
  page.images = (Array.isArray(page.images) ? page.images : []).filter((image) => !imageIds.has(String(image?.id || '')));
  page.version = APP_VERSION;
  page.modifiedAt = new Date().toISOString();
  await putRemoteEventResult(event, 'applied', page);
  return { applied: 1 };
}

async function applyRemotePageProperty(event) {
  const descriptor = event.descriptor || {};
  const field = String(event.payload?.field || '');
  const scope = String(event.payload?.scope || 'current');
  if (!descriptor.key || !field || scope !== 'current' || !['color', 'template'].includes(field)) {
    await putRemoteEventResult(event, 'deferred', null, scope === 'all' ? 'proprietà globale rinviata' : 'proprietà non supportata');
    return { deferred: 1 };
  }
  const history = await getSyncEventsByEntity(event.entityId);
  const comparable = [...history, event].filter((row) => row.operation === 'page.property.set' && String(row.payload?.field || '') === field && String(row.payload?.scope || 'current') === 'current');
  const winner = comparable.sort(compareHlcDeterministic).at(-1);
  if (winner?.eventId !== event.eventId) {
    await putRemoteEventResult(event, 'ignored-lww', null, `LWW-HLC: vince ${winner?.eventId || 'evento locale'}`);
    return { ignored: 1 };
  }
  const record = await getRecord(descriptor.key);
  const page = record ? { ...record } : buildEmptyPageRecord(descriptor);
  const style = normalizePageStyle(page.pageStyle || globalPageStyle);
  if (field === 'color' && ALLOWED_PAGE_COLORS.includes(event.payload?.value)) style.color = event.payload.value;
  else if (field === 'template' && ALLOWED_PAGE_TEMPLATES.includes(event.payload?.value)) style.template = event.payload.value;
  else {
    await putRemoteEventResult(event, 'ignored-invalid', null, 'valore proprietà non valido');
    return { ignored: 1 };
  }
  page.pageStyle = normalizePageStyle(style);
  page.version = APP_VERSION;
  page.modifiedAt = new Date().toISOString();
  await putRemoteEventResult(event, 'applied', page);
  return { applied: 1 };
}

function stableLegacyFragmentId(parentId, eraserId, index) {
  const text = `${String(parentId || '')}|${String(eraserId || '')}|${Number(index) || 0}`;
  const hash = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return `stroke-legacy-frag-${hash(2166136261)}${hash(2246822519)}-${(Number(index) || 0) + 1}`;
}

async function migrateLegacyErasersOnCurrentPage() {
  const legacy = strokes.filter((stroke) => stroke?.tool === 'eraser' && stroke?.id && Array.isArray(stroke?.points) && stroke.points.length);
  if (!legacy.length || !syncFoundation || drawing || dirty) return false;

  const descriptor = pageDescriptor();
  const initial = [...strokes];
  const initialIndex = new Map(initial.map((stroke, index) => [String(stroke?.id || ''), index]));
  const eventByStrokeId = new Map();

  await Promise.all(initial.filter((stroke) => stroke?.id).map(async (stroke) => {
    const history = await getSyncEventsByEntity(`stroke:${stroke.id}`).catch(() => []);
    const add = history
      .filter((row) => row.operation === 'stroke.add' && row.payload?.stroke?.id === stroke.id)
      .sort(compareHlcDeterministic)
      .at(-1) || null;
    eventByStrokeId.set(String(stroke.id), add);
  }));

  const orderedLegacy = [...legacy].sort((a, b) => {
    const ae = eventByStrokeId.get(String(a.id));
    const be = eventByStrokeId.get(String(b.id));
    if (ae && be) return compareHlcDeterministic(ae, be);
    return (initialIndex.get(String(a.id)) ?? 0) - (initialIndex.get(String(b.id)) ?? 0);
  });

  const birthEventById = new Map(eventByStrokeId);
  let normalized = [...initial];
  for (const eraser of orderedLegacy) {
    const eraserEvent = eventByStrokeId.get(String(eraser.id));
    const eraserOriginalIndex = initialIndex.get(String(eraser.id)) ?? Number.MAX_SAFE_INTEGER;
    const result = structuralErase(normalized, eraser, {
      // Geometria canonica: la migrazione legacy deve produrre la stessa proiezione
      // su iPad e PC anche se le dimensioni CSS dei due canvas sono differenti.
      widthPx: 1366,
      heightPx: 1024,
      makeFragmentId: (stroke, eraseStroke, fragmentIndex) => stableLegacyFragmentId(stroke?.id, eraseStroke?.id, fragmentIndex),
      eligible: (stroke) => {
        if (!stroke?.id || stroke.tool === 'eraser' || stroke.id === eraser.id) return false;
        const birth = birthEventById.get(String(stroke.id));
        if (eraserEvent && birth?.versionVector) {
          return syncFoundation.compareVersionVectors(birth.versionVector, eraserEvent.versionVector) === 'before';
        }
        const sourceId = String(stroke.fragmentOf || stroke.id);
        return (initialIndex.get(sourceId) ?? -1) < eraserOriginalIndex;
      }
    });
    for (const change of result.changes) {
      const birth = birthEventById.get(String(change.original?.id));
      for (const fragment of change.fragments || []) birthEventById.set(String(fragment.id), birth || null);
    }
    normalized = result.strokes.filter((stroke) => stroke?.id !== eraser.id);
  }

  if (normalized.length === initial.length && normalized.every((stroke, i) => stroke === initial[i])) return false;
  strokes = normalized;
  renderAll();
  try {
    const record = await getRecord(descriptor.key);
    if (record) {
      await putRecord({ ...record, strokes: normalized, version: APP_VERSION, modifiedAt: new Date().toISOString() });
      session.storageWrites++;
    }
  } catch (err) {
    session.storageErrors++;
    console.warn('Migrazione eraser legacy non persistita', err);
  }
  return true;
}

function imageEventChangedFields(event) {
  if (event?.operation === 'image.add') return ['name','mimeType','blobHash','blobSize','x','y','w','h','rotation','createdAt','modifiedAt'];
  const fields = Array.isArray(event?.payload?.changedFields) ? event.payload.changedFields.map(String) : [];
  return fields.length ? fields : ['name','mimeType','blobHash','blobSize','x','y','w','h','rotation','modifiedAt'];
}

async function applyRemoteImageEvent(event) {
  const descriptor = event.descriptor || {};
  const pageKeyValue = String(descriptor.key || '');
  const imageId = String(event.payload?.image?.id || event.payload?.imageId || event.entityId?.replace(/^image:/, '') || '');
  if (!pageKeyValue || !imageId) {
    await putRemoteEventResult(event, 'deferred', null, 'descriptor/ID immagine mancante');
    return { deferred: 1 };
  }

  const [record, history] = await Promise.all([getRecord(pageKeyValue), getSyncEventsByEntity(event.entityId)]);
  const relevant = [...history, event].filter((row) => row?.entityType === 'image-object');
  const frontier = maximalEntityEvents(relevant);
  const frontierMutations = frontier.filter((row) => row.operation === 'image.add' || row.operation === 'image.update');
  const allMutations = relevant.filter((row) => row.operation === 'image.add' || row.operation === 'image.update');
  const deletes = frontier.filter((row) => row.operation === 'image.delete');
  const conflict = frontierMutations.length > 0 && deletes.length > 0;
  const page = record ? { ...record } : buildEmptyPageRecord(descriptor);
  const pageImages = Array.isArray(page.images) ? [...page.images] : [];
  const index = pageImages.findIndex((image) => String(image?.id || '') === imageId);

  if (!frontierMutations.length) {
    if (index >= 0) pageImages.splice(index, 1);
    page.images = pageImages;
    page.version = APP_VERSION;
    page.modifiedAt = new Date().toISOString();
    await putRemoteEventResult(event, 'applied', page);
    return { applied: 1 };
  }

  // Merge per proprietà: per ogni campo vince l'evento causale massimo; tra eventi
  // concorrenti il tie-break HLC/eventId rende il risultato identico su tutte le repliche.
  const fields = ['name','mimeType','blobHash','blobSize','x','y','w','h','rotation','createdAt','modifiedAt'];
  const base = index >= 0 ? cloneImageObject(pageImages[index]) : { id: imageId };
  for (const field of fields) {
    const candidates = allMutations.filter((row) => imageEventChangedFields(row).includes(field) && row.payload?.image?.[field] !== undefined);
    if (!candidates.length) continue;
    const fieldFrontier = maximalEntityEvents(candidates);
    const winner = fieldFrontier.sort(compareHlcDeterministic).at(-1);
    base[field] = winner.payload.image[field];
  }
  base.id = imageId;

  if (isSha256Hash(base.blobHash)) {
    const blobRow = await getSyncBlob(base.blobHash);
    if (!blobRow?.blob) {
      await putRemoteEventResult(event, 'deferred-media', null, `blob ${base.blobHash} non disponibile localmente`);
      return { deferred: 1 };
    }
    base.src = await dataUrlFromBlob(blobRow.blob);
    base.mimeType = base.mimeType || blobRow.mimeType || blobRow.blob.type || 'image/webp';
    base.blobSize = Number(base.blobSize) || Number(blobRow.size) || blobRow.blob.size || 0;
  } else if (!base.src) {
    await putRemoteEventResult(event, 'deferred-media', null, 'evento immagine senza blobHash');
    return { deferred: 1 };
  }

  const normalized = normalizeImageObject(base);
  if (!normalized) {
    await putRemoteEventResult(event, 'ignored-invalid', null, 'metadata immagine non validi');
    return { ignored: 1 };
  }
  if (index >= 0) pageImages[index] = normalized;
  else pageImages.push(normalized);
  page.images = pageImages;
  page.version = APP_VERSION;
  page.modifiedAt = new Date().toISOString();
  await putRemoteEventResult(event, conflict ? 'conflict-preserved' : 'applied', page, conflict ? 'delete/update concorrenti: immagine preservata' : null);
  return conflict ? { applied: 1, conflicts: 1 } : { applied: 1 };
}

async function applyRemotePageSnapshotEvent(event) {
  const raw = event?.payload?.record;
  if (!raw || typeof raw !== 'object' || !raw.date) {
    await putRemoteEventResult(event, 'ignored-invalid', null, 'snapshot pagina non valido');
    return { ignored: 1 };
  }
  const record = globalThis.structuredClone ? globalThis.structuredClone(raw) : JSON.parse(JSON.stringify(raw));
  if (Array.isArray(record.images)) {
    const hydrated = [];
    for (const image of record.images) {
      if (!image || typeof image !== 'object') continue;
      const next = { ...image };
      if (isSha256Hash(next.blobHash)) {
        const row = await getSyncBlob(next.blobHash);
        if (!row?.blob) {
          await putRemoteEventResult(event, 'deferred-media', null, `blob ${next.blobHash} non disponibile localmente`);
          return { deferred: 1 };
        }
        next.src = await dataUrlFromBlob(row.blob);
        next.mimeType = next.mimeType || row.mimeType || row.blob.type || 'image/webp';
        next.blobSize = Number(next.blobSize) || Number(row.size) || row.blob.size || 0;
      }
      hydrated.push(next);
    }
    record.images = hydrated;
  }
  record.version = APP_VERSION;
  record.modifiedAt = record.modifiedAt || new Date().toISOString();
  await putRemoteEventResult(event, 'applied', record, 'snapshot autorevole della generazione gruppo');
  return { applied: 1 };
}

async function applyRemoteSyncEvents(events) {
  const totals = { applied: 0, deferred: 0, ignored: 0, conflicts: 0 };
  await openDb();
  for (const event of events || []) {
    if (drawing || pageTurning || imageBusy || imageGesture) throw new DOMException('Ink priority', 'AbortError');
    if (!event?.eventId || Number(event.protocolVersion) !== 1) { totals.ignored++; continue; }
    await prepareRestoreRecoveryPage(event);
    const duplicate = await getSyncEvent(event.eventId);
    if (duplicate) { totals.ignored++; continue; }
    syncFoundation?.observeRemoteEvent(event);
    let result;
    if (event.operation === 'page.snapshot.set') result = await applyRemotePageSnapshotEvent(event);
    else if (event.operation === 'stroke.add' || event.operation === 'stroke.delete') result = await applyRemoteStrokeEvent(event);
    else if (event.operation === 'planner.timetable.cell.set') result = await applyRemoteSharedWeeklyTimetableEvent(event);
    else if (event.operation === 'planner.timetable.ink.stroke.add') result = await applyRemoteSharedWeeklyTimetableInkStrokeEvent(event);
    else if (event.operation === 'page.clear') result = await applyRemotePageClear(event);
    else if (event.operation === 'page.property.set') result = await applyRemotePageProperty(event);
    else if (event.entityType === 'image-object') result = await applyRemoteImageEvent(event);
    else {
      await putRemoteEventResult(event, 'deferred', null, 'tipo evento non ancora applicato');
      result = { deferred: 1 };
    }
    for (const key of Object.keys(totals)) totals[key] += Number(result?.[key]) || 0;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (events?.length) await loadInitialPage();
  return totals;
}



function loadSyncRestoreGuard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_RESTORE_GUARD_STORAGE_KEY) || 'null');
    return parsed && parsed.pending ? parsed : null;
  } catch { return null; }
}

function updateSyncRestoreConfigLock() {
  const locked = isSyncRestorePending();
  if (cloudEndpointInput) cloudEndpointInput.readOnly = locked;
  if (cloudJoinCodeInput) cloudJoinCodeInput.readOnly = locked;
  if (cloudSyncModeSelect) cloudSyncModeSelect.disabled = locked;
  if (cloudCreateGroupButton) cloudCreateGroupButton.disabled = locked;
  if (cloudRecoverJoinCodeButton) cloudRecoverJoinCodeButton.disabled = locked;
  if (lanHubUrlInput) lanHubUrlInput.readOnly = locked;
  if (lanSyncKeyInput) lanSyncKeyInput.readOnly = locked;
}

function saveSyncRestoreGuard(value) {
  syncRestoreGuard = value && value.pending ? { ...value, pending: true } : null;
  try {
    if (syncRestoreGuard) localStorage.setItem(SYNC_RESTORE_GUARD_STORAGE_KEY, JSON.stringify(syncRestoreGuard));
    else localStorage.removeItem(SYNC_RESTORE_GUARD_STORAGE_KEY);
  } catch {}
  updateSyncRestoreConfigLock();
  return syncRestoreGuard;
}

function isSyncRestorePending() {
  return Boolean(syncRestoreGuard?.pending);
}

function denyMutationDuringSyncRecovery() {
  if (!isSyncRestorePending()) return false;
  statusLabel.textContent = 'ripristino protetto · sola lettura finché Sync non è riallineata';
  return true;
}

function beginSyncRestoreGuard(details = {}) {
  const cloud = loadCloudConfig();
  const lan = loadLanConfig();
  const cloudConfigured = Boolean(String(cloud.joinCode || '').trim());
  const lanConfigured = Boolean(String(lan.endpoint || '').trim() && String(lan.syncKey || '').trim());
  // Se entrambi sono configurati, rispetta Cloud quando è attivo; se Cloud è
  // esplicitamente disattivato preferisce LAN. Se resta soltanto un gruppo Cloud
  // disattivato, lo usa comunque come fonte autorevole prima di sbloccare il restore.
  const transport = cloudConfigured && cloud.mode !== 'off' ? 'cloud'
    : (lanConfigured ? 'lan' : (cloudConfigured ? 'cloud' : 'none'));
  return saveSyncRestoreGuard({
    pending: true,
    mode: 'local-restore',
    phase: 'restore-applied',
    transport,
    createdAt: new Date().toISOString(),
    backupFileName: String(details.fileName || ''),
    backupCreatedAt: String(details.manifest?.createdAt || ''),
    recordCount: Number(details.recordCount) || 0
  });
}

function beginGlobalGroupRestoreGuard(details = {}) {
  const cloud = loadCloudConfig();
  const lan = loadLanConfig();
  const cloudConfigured = Boolean(String(cloud.joinCode || '').trim());
  const lanConfigured = Boolean(String(lan.endpoint || '').trim() && String(lan.syncKey || '').trim());
  const cloudActive = cloudConfigured && cloud.mode !== 'off';
  if (cloudActive && lanConfigured) {
    throw new Error('Ripristino globale bloccato per sicurezza: risultano configurati sia Cloud sia LAN. Per imporre un backup al gruppo deve esserci un solo canale Sync autorevole; disattiva Cloud oppure rimuovi temporaneamente endpoint/chiave LAN, poi ripeti.');
  }
  const transport = cloudActive ? 'cloud'
    : (lanConfigured ? 'lan' : (cloudConfigured ? 'cloud' : 'none'));
  if (transport === 'none') throw new Error('Per ripristinare tutto il gruppo deve essere configurata almeno una sincronizzazione Cloud o LAN.');
  const restoreId = `restore-${(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')}`;
  return saveSyncRestoreGuard({
    pending: true,
    mode: 'global-authoritative',
    phase: 'global-restore-applied',
    transport, restoreId,
    createdAt: new Date().toISOString(),
    backupFileName: String(details.fileName || ''),
    backupCreatedAt: String(details.manifest?.createdAt || ''),
    recordCount: Number(details.recordCount) || 0
  });
}

function beginRemoteGroupEpochGuard(details = {}) {
  return saveSyncRestoreGuard({
    pending: true,
    mode: 'group-authoritative',
    phase: 'epoch-mismatch',
    transport: String(details.transport || 'none'),
    remoteEpoch: String(details.remoteEpoch || ''),
    hubId: String(details.hubId || ''),
    clearAllPagesBeforeReconcile: true,
    createdAt: new Date().toISOString()
  });
}

function updateSyncRestoreGuard(patch = {}) {
  if (!isSyncRestorePending()) return null;
  return saveSyncRestoreGuard({ ...syncRestoreGuard, ...patch, pending: true, modifiedAt: new Date().toISOString() });
}

function clearSyncRestoreGuard() {
  saveSyncRestoreGuard(null);
}

function recoveryEventTouchesPage(event) {
  if (!event || !event.descriptor?.key) return false;
  if (event.operation === 'stroke.add' || event.operation === 'stroke.delete') return true;
  if (event.operation === 'page.clear' || event.operation === 'page.property.set' || event.operation === 'page.snapshot.set') return true;
  return event.entityType === 'image-object';
}

async function prepareRestoreRecoveryPage(event) {
  if (!syncRecoveryRebuildActive || !recoveryEventTouchesPage(event)) return;
  const key = String(event.descriptor?.key || '');
  if (!key || syncRecoveryRebuiltPages.has(key)) return;
  await deleteRecord(key);
  syncRecoveryRebuiltPages.add(key);
}

async function rebuildNotesMetadataFromPages() {
  await openDb();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const counts = new Map();
  const metaKeys = [];
  for (const row of records) {
    const key = String(row?.date || '');
    if (row?.kind === 'day-notes-meta' || key.endsWith(NOTES_META_SUFFIX)) {
      metaKeys.push(key);
      continue;
    }
    const match = key.match(/^(\d{4}-\d{2}-\d{2})::note::(\d{4})$/);
    if (!match) continue;
    const day = String(row?.referenceDate || match[1]);
    const index = Math.max(1, Number(row?.noteIndex) || Number(match[2]) || 1);
    counts.set(day, Math.max(counts.get(day) || 0, index));
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const key of metaKeys) store.delete(key);
    for (const [day, count] of counts) {
      store.put({
        date: notesMetaKey(day), kind: 'day-notes-meta', referenceDate: day, count,
        version: APP_VERSION, modifiedAt: new Date().toISOString()
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Ricostruzione indice Note annullata'));
  });
  notesCountCache.clear();
  for (const [day, count] of counts) notesCountCache.set(day, count);
}

async function runPendingGlobalGroupRestore() {
  if (!isSyncRestorePending() || syncRestoreGuard.mode !== 'global-authoritative') return { skipped: 'not-global' };
  const transport = String(syncRestoreGuard.transport || 'none');
  const restoreId = String(syncRestoreGuard.restoreId || '');
  if (!restoreId || transport === 'none') throw new Error('Sessione di ripristino globale non valida.');
  updateSyncRestoreGuard({ phase: 'global-publishing', attemptAt: new Date().toISOString() });
  try {
    const snapshot = await queueAuthoritativeGroupSnapshot();
    let result;
    if (transport === 'cloud') {
      if (!cloudTransport) throw new Error('Cloud Sync non inizializzato.');
      result = await cloudTransport.publishAndCommitGlobalRestore(restoreId);
    } else if (transport === 'lan') {
      if (!lanTransport) throw new Error('Sync LAN non inizializzato.');
      result = await lanTransport.publishAndCommitGlobalRestore(restoreId);
    } else throw new Error('Trasporto ripristino globale non riconosciuto.');
    clearSyncRestoreGuard();
    await loadInitialPage();
    statusLabel.textContent = `ripristino globale completato · ${snapshot.records} record pubblicati`;
    return { ...result, snapshotRecords: snapshot.records, snapshotEvents: snapshot.events };
  } catch (err) {
    updateSyncRestoreGuard({ phase: 'global-publish-failed', lastError: String(err?.message || err) });
    statusLabel.textContent = 'ripristino globale sospeso · sola lettura';
    console.warn('Ripristino globale gruppo non riuscito', err);
    return { error: String(err?.message || err), pushed: 0, pulled: 0, globalRestore: true };
  }
}

async function handleRemoteGroupEpochMismatch(details = {}) {
  if (isSyncRestorePending()) return;
  beginRemoteGroupEpochGuard(details);
  lanTransport?.suspendForInk();
  cloudTransport?.suspendForInk();
  await resetSyncStores();
  location.reload();
}

async function runPendingRestoreReconciliation() {
  if (!isSyncRestorePending()) return { skipped: 'none' };
  if (syncRestoreGuard.mode === 'global-authoritative') return runPendingGlobalGroupRestore();
  const recoveryMode = String(syncRestoreGuard.mode || 'local-restore');
  const transport = String(syncRestoreGuard.transport || 'none');
  if (transport === 'none') {
    clearSyncRestoreGuard();
    return { skipped: 'no-sync-group' };
  }
  updateSyncRestoreGuard({ phase: 'reconciling', attemptAt: new Date().toISOString() });
  if (syncRestoreGuard.clearAllPagesBeforeReconcile) await clearAllMainRecords();
  syncRecoveryRebuildActive = true;
  syncRecoveryRebuiltPages.clear();
  try {
    let result;
    if (transport === 'cloud') {
      if (!cloudTransport) throw new Error('Cloud Sync non inizializzato.');
      result = await cloudTransport.recoverPullOnly();
    } else if (transport === 'lan') {
      if (!lanTransport) throw new Error('Sync LAN non inizializzato.');
      result = await lanTransport.recoverPullOnly();
    } else {
      throw new Error('Trasporto di riallineamento non riconosciuto.');
    }
    await rebuildNotesMetadataFromPages();
    clearSyncRestoreGuard();
    syncRecoveryRebuildActive = false;
    syncRecoveryRebuiltPages.clear();
    await loadInitialPage();
    statusLabel.textContent = recoveryMode === 'group-authoritative'
      ? `gruppo riallineato · ricevuti ${Number(result?.pulled) || 0}`
      : `ripristino riallineato · ricevuti ${Number(result?.pulled) || 0}`;
    return result;
  } catch (err) {
    syncRecoveryRebuildActive = false;
    syncRecoveryRebuiltPages.clear();
    updateSyncRestoreGuard({ phase: 'reconcile-failed', lastError: String(err?.message || err) });
    statusLabel.textContent = 'ripristino locale · Sync sospesa';
    console.warn('Riallineamento post-ripristino non riuscito', err);
    return { error: String(err?.message || err), pulled: 0, pushed: 0 };
  }
}

async function retryPendingRestoreReconciliation() {
  if (!isSyncRestorePending()) return false;
  updateSyncRestoreGuard({ phase: 'restore-applied', lastError: '', retryAt: new Date().toISOString() });
  await resetSyncStores();
  location.reload();
  return true;
}

function loadCloudConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_CONFIG_STORAGE_KEY) || '{}');
    return {
      endpoint: String(parsed.endpoint || CLOUD_DEFAULT_ENDPOINT),
      joinCode: String(parsed.joinCode || ''),
      mode: ['auto','manual','off'].includes(parsed.mode) ? parsed.mode : 'manual'
    };
  } catch { return { endpoint: CLOUD_DEFAULT_ENDPOINT, joinCode: '', mode: 'manual' }; }
}

function cloudCredentialsFromUi() {
  const code = String(cloudJoinCodeInput?.value || '').trim();
  if (!code) return { groupId: '', authKey: '', encryptionKey: '' };
  return decodeCloudJoinCode(code);
}

function cloudTransportConfig() {
  let credentials = { groupId: '', authKey: '', encryptionKey: '' };
  try { credentials = cloudCredentialsFromUi(); } catch {}
  return {
    endpoint: String(cloudEndpointInput?.value || CLOUD_DEFAULT_ENDPOINT).trim(),
    mode: String(cloudSyncModeSelect?.value || 'manual'),
    ...credentials
  };
}

function saveCloudConfig() {
  const config = {
    endpoint: String(cloudEndpointInput?.value || CLOUD_DEFAULT_ENDPOINT).trim(),
    joinCode: String(cloudJoinCodeInput?.value || '').trim(),
    mode: String(cloudSyncModeSelect?.value || 'manual')
  };
  try { localStorage.setItem(CLOUD_CONFIG_STORAGE_KEY, JSON.stringify(config)); } catch {}
  // 0.1.37: seconda copia persistente del codice Cloud nel DB principale.
  // Non sovrascriviamo mai il backup IndexedDB con una stringa vuota.
  if (db && config.joinCode) {
    void putSyncMeta({
      key: CLOUD_CREDENTIALS_META_KEY,
      joinCode: config.joinCode,
      endpoint: config.endpoint,
      mode: config.mode,
      modifiedAt: new Date().toISOString()
    }).catch(() => {});
  }
  return config;
}

function selectTextControl(control) {
  if (!control) return false;
  const value = String(control.value || '');
  if (!value) return false;
  try {
    try { control.focus({ preventScroll: true }); } catch { control.focus?.(); }
    if (typeof control.setSelectionRange === 'function') control.setSelectionRange(0, value.length, 'forward');
    else if (typeof control.select === 'function') control.select();
    requestAnimationFrame(() => {
      try {
        if (typeof control.setSelectionRange === 'function') control.setSelectionRange(0, value.length, 'forward');
      } catch {}
    });
    return true;
  } catch { return false; }
}

function legacyClipboardCopy(value, fallbackControl = null) {
  let temp = null;
  try {
    const control = fallbackControl || (() => {
      temp = document.createElement('textarea');
      temp.value = value;
      temp.setAttribute('aria-hidden', 'true');
      temp.style.position = 'fixed';
      temp.style.left = '0';
      temp.style.top = '0';
      temp.style.width = '2px';
      temp.style.height = '2px';
      temp.style.opacity = '0.01';
      temp.style.zIndex = '-1';
      document.body.appendChild(temp);
      return temp;
    })();
    if (!selectTextControl(control)) return false;
    return Boolean(document.execCommand?.('copy'));
  } catch {
    return false;
  } finally {
    temp?.remove();
  }
}

async function copyTextToClipboard(text, fallbackControl = null) {
  const value = String(text || '');
  if (!value) throw new Error('Nessun contenuto da copiare.');
  if (navigator.clipboard?.writeText && globalThis.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}
  }
  if (legacyClipboardCopy(value, fallbackControl)) return true;
  if (fallbackControl) selectTextControl(fallbackControl);
  throw new Error('Copia automatica non disponibile su questo iPad.');
}

async function handleCloudCopyJoinCode() {
  const code = String(cloudJoinCodeInput?.value || '').trim();
  if (!code) return updateCloudStatus('Nessun Codice gruppo Cloud da copiare. Crea un nuovo gruppo oppure incolla un codice esistente.');
  try {
    await copyTextToClipboard(code, cloudJoinCodeInput);
    updateCloudStatus('Codice gruppo Cloud copiato negli appunti ✓\nConservalo in un luogo sicuro: contiene anche la chiave di cifratura E2EE.');
  } catch (err) {
    selectTextControl(cloudJoinCodeInput);
    updateCloudStatus(`Copia automatica non riuscita: ${err?.message || err}\nIl codice è stato selezionato: usa Copia dal menu di iPadOS.`);
  }
}

function handleCloudSelectJoinCode() {
  const code = String(cloudJoinCodeInput?.value || '').trim();
  if (!code) return updateCloudStatus('Nessun Codice gruppo Cloud da selezionare.');
  selectTextControl(cloudJoinCodeInput);
  updateCloudStatus('Codice gruppo Cloud selezionato ✓\nPuoi copiarlo con il comando Copia di iPadOS.');
}

async function handleCloudRecoverSavedJoinCode() {
  const saved = loadCloudConfig();
  let code = String(saved.joinCode || '').trim();
  let source = 'memoria web';
  if (!code && db) {
    const backup = await getSyncMeta(CLOUD_CREDENTIALS_META_KEY).catch(() => null);
    code = String(backup?.joinCode || '').trim();
    source = 'database locale Agenda';
  }
  if (!code) return updateCloudStatus('Nessun Codice gruppo Cloud recuperabile su questo dispositivo. Se il vecchio codice non è stato salvato, crea un nuovo gruppo Cloud.');
  if (cloudJoinCodeInput) cloudJoinCodeInput.value = code;
  saveCloudConfig();
  selectTextControl(cloudJoinCodeInput);
  updateCloudStatus(`Codice gruppo Cloud recuperato dalla ${source} ✓\nIl codice è selezionato e pronto per essere copiato.`);
}

function listCloudPendingEvents(limit = 120) {
  const replicaId = String(syncFoundation?.replicaId || '');
  if (!replicaId) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readonly');
    const req = tx.objectStore(SYNC_EVENT_STORE).index('replicaId').getAll(replicaId);
    req.onsuccess = () => {
      const rows = (Array.isArray(req.result) ? req.result : [])
        .filter((row) => !row.cloudSentAt)
        .sort((a, b) => (Number(a.replicaSequence) || 0) - (Number(b.replicaSequence) || 0) || String(a.eventId || '').localeCompare(String(b.eventId || '')))
        .slice(0, Math.max(1, Math.min(200, Number(limit) || 120)));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

function countCloudPendingEvents() {
  const replicaId = String(syncFoundation?.replicaId || '');
  if (!replicaId) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readonly');
    const req = tx.objectStore(SYNC_EVENT_STORE).index('replicaId').getAll(replicaId);
    req.onsuccess = () => resolve((Array.isArray(req.result) ? req.result : []).filter((row) => !row.cloudSentAt).length);
    req.onerror = () => reject(req.error);
  });
}

function markCloudEventsSent(eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))];
  if (!ids.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_EVENT_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_EVENT_STORE);
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return;
        row.cloudSentAt = row.cloudSentAt || new Date().toISOString();
        store.put(row);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Aggiornamento outbox Cloud annullato'));
  });
}

function getCloudPullCursor() {
  return getSyncMeta(CLOUD_STATE_KEY).then((row) => Math.max(0, Number(row?.cursor) || 0));
}

async function setCloudPullCursor(cursor) {
  const old = await getSyncMeta(CLOUD_STATE_KEY).catch(() => null);
  return putSyncMeta({ ...old, key: CLOUD_STATE_KEY, cursor: Math.max(0, Number(cursor) || 0), modifiedAt: new Date().toISOString() });
}

function getCloudGroupEpoch() {
  return getSyncMeta(CLOUD_STATE_KEY).then((row) => String(row?.groupEpoch || ''));
}

async function setCloudGroupEpoch(epoch) {
  const old = await getSyncMeta(CLOUD_STATE_KEY).catch(() => null);
  return putSyncMeta({ ...old, key: CLOUD_STATE_KEY, groupEpoch: String(epoch || ''), cursor: Math.max(0, Number(old?.cursor) || 0), modifiedAt: new Date().toISOString() });
}

function updateCloudStatus(message = '') {
  updateSyncRestoreConfigLock();
  if (!cloudSyncStatus) return;
  if (message) { cloudSyncStatus.textContent = message; return; }
  const lines = [
    ...(isSyncRestorePending() ? ['⚠ Ripristino backup: invio Sync bloccato fino al riallineamento protetto.'] : []),
    `Stato: ${cloudStats?.state || 'idle'} · modalità ${cloudSyncModeSelect?.value || 'manual'}`,
    `Gruppo: ${cloudStats?.groupId || 'non configurato'}`,
    `Push/Pull: ${cloudStats?.pushed || 0}/${cloudStats?.pulled || 0} · applicati ${cloudStats?.applied || 0}`,
    `Eventi cifrati up/down: ${cloudStats?.encryptedEventsUp || 0}/${cloudStats?.encryptedEventsDown || 0}`,
    `Batch Cloud inviati: ${cloudStats?.pushBatches || 0} · ultimo batch ${cloudStats?.lastPushBatchSize || 0} · timeout ${cloudStats?.timeoutAborts || 0}`,
    `Blob cifrati up/down: ${cloudStats?.blobsUploaded || 0}/${cloudStats?.blobsDownloaded || 0}`,
    `Differiti/conflitti: ${cloudStats?.deferred || 0}/${cloudStats?.conflicts || 0}`
  ];
  if (cloudStats?.lastSyncAt) lines.push(`Ultima sync: ${new Date(cloudStats.lastSyncAt).toLocaleString('it-IT')}`);
  if (cloudStats?.lastError) lines.push(`Nota: ${cloudStats.lastError}`);
  cloudSyncStatus.textContent = lines.join('\n');
}

async function handleCloudCreateGroup() {
  if (!cloudTransport) return updateCloudStatus('Cloud Transport non inizializzato.');
  if (isSyncRestorePending()) return updateCloudStatus('Prima completa il riallineamento protetto del backup; non cambio gruppo durante un ripristino.');
  const existing = String(cloudJoinCodeInput?.value || '').trim();
  if (existing) {
    const proceed = globalThis.confirm('Esiste già un Codice gruppo Cloud su questo dispositivo. Creando un nuovo gruppo il codice locale verrà sostituito. Hai già copiato e conservato il vecchio codice?');
    if (!proceed) return updateCloudStatus('Creazione nuovo gruppo annullata. Il codice esistente è stato mantenuto.');
  }
  saveCloudConfig();
  updateCloudStatus('Creazione nuovo gruppo Agenda Cloud…');
  try {
    const created = await cloudTransport.createGroup();
    if (cloudJoinCodeInput) cloudJoinCodeInput.value = created.joinCode;
    saveCloudConfig();
    selectTextControl(cloudJoinCodeInput);
    updateCloudStatus(`Nuovo gruppo Cloud creato ✓\n${created.groupId}\nIl codice è visibile e selezionato. Premi “Copia codice gruppo” e conservalo in un luogo sicuro.`);
  } catch (err) { updateCloudStatus(`Creazione gruppo non riuscita: ${err?.message || err}`); }
}

async function handleCloudTest() {
  if (!cloudTransport) return updateCloudStatus('Cloud Transport non inizializzato.');
  saveCloudConfig(); updateCloudStatus('Test Cloud Aruba…');
  try {
    const result = await cloudTransport.testConnection();
    updateCloudStatus(`Cloud raggiunto ✓\nID: ${result.cloudId}\nEventi: ${result.group?.eventCount ?? 0} · blob: ${result.group?.blobCount ?? 0} · cursor: ${result.group?.cursor ?? 0}`);
  } catch (err) { updateCloudStatus(`Cloud non disponibile: ${err?.message || err}`); }
}

async function handleCloudSyncNow() {
  if (!cloudTransport) return updateCloudStatus('Cloud Transport non inizializzato.');
  if (isSyncRestorePending()) {
    saveCloudConfig();
    updateCloudStatus('Riprovo il riallineamento protetto del backup con il gruppo Cloud…');
    await retryPendingRestoreReconciliation();
    return;
  }
  saveCloudConfig(); updateCloudStatus('Sincronizzazione Cloud…');
  try {
    const result = await cloudTransport.syncNow({ auto: false, reason: 'manual' });
    const pending = await countCloudPendingEvents().catch(() => 0);
    updateCloudStatus(`Sincronizzazione Cloud completata ✓\nInviati: ${result.pushed || 0} · ricevuti: ${result.pulled || 0}\nOutbox Cloud residua: ${pending}`);
  } catch (err) {
    if (err?.name === 'AbortError') updateCloudStatus('Sync Cloud interrotta: priorità alla scrittura Ink.');
    else updateCloudStatus(`Sync Cloud non riuscita: ${err?.message || err}`);
  }
}

function scheduleCloudAuto(reason = 'change', delayMs = 5000) {
  if (isSyncRestorePending()) return false;
  return cloudTransport?.scheduleAuto(reason, delayMs) || false;
}

function startCloudHeartbeat() {
  if (cloudHeartbeatTimer) return;
  cloudHeartbeatTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') scheduleCloudAuto('heartbeat', 1200);
  }, 60000);
}

function loadLanConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAN_CONFIG_STORAGE_KEY) || '{}');
    return { endpoint: String(parsed.endpoint || ''), syncKey: String(parsed.syncKey || '') };
  } catch { return { endpoint: '', syncKey: '' }; }
}

function saveLanConfig() {
  const config = { endpoint: String(lanHubUrlInput?.value || '').trim(), syncKey: String(lanSyncKeyInput?.value || '').trim() };
  try { localStorage.setItem(LAN_CONFIG_STORAGE_KEY, JSON.stringify(config)); } catch {}
  return config;
}

function updateLanStatus(message = '') {
  updateSyncRestoreConfigLock();
  if (!lanSyncStatus) return;
  if (message) { lanSyncStatus.textContent = message; return; }
  const state = lanStats?.state || 'idle';
  const lines = [
    ...(isSyncRestorePending() ? ['⚠ Ripristino backup: invio Sync bloccato fino al riallineamento protetto.'] : []),
    `Stato: ${state}`,
    `Hub: ${lanStats?.hubId || 'non verificato'}`,
    `Push/Pull: ${lanStats?.pushed || 0}/${lanStats?.pulled || 0} · applicati ${lanStats?.applied || 0}`,
    `Blob up/down: ${lanStats?.blobsUploaded || 0}/${lanStats?.blobsDownloaded || 0}`,
    `Differiti/conflitti: ${lanStats?.deferred || 0}/${lanStats?.conflicts || 0}`
  ];
  if (lanStats?.lastSyncAt) lines.push(`Ultima sync: ${new Date(lanStats.lastSyncAt).toLocaleString('it-IT')}`);
  if (lanStats?.lastError) lines.push(`Nota: ${lanStats.lastError}`);
  lanSyncStatus.textContent = lines.join('\n');
}

async function handleLanTest() {
  if (!lanTransport) return updateLanStatus('Trasporto LAN non inizializzato.');
  saveLanConfig();
  updateLanStatus('Test connessione LAN…');
  try {
    const health = await lanTransport.testConnection();
    updateLanStatus(`Hub raggiunto ✓\nID: ${health.hubId}\nEventi hub: ${health.eventCount ?? 0} · trasporto ${health.transport || 'n/a'}`);
  } catch (err) {
    if (err?.name === 'AbortError') updateLanStatus('Test interrotto: priorità alla scrittura Ink.');
    else updateLanStatus(`LAN non disponibile: ${err?.message || err}`);
  }
}

async function handleLanSyncNow() {
  if (!lanTransport) return updateLanStatus('Trasporto LAN non inizializzato.');
  if (isSyncRestorePending()) {
    saveLanConfig();
    updateLanStatus('Riprovo il riallineamento protetto del backup con il gruppo LAN…');
    await retryPendingRestoreReconciliation();
    return;
  }
  saveLanConfig();
  updateLanStatus('Sincronizzazione LAN manuale…');
  try {
    const result = await lanTransport.syncNow();
    const pending = await countPendingSyncEvents().catch(() => 0);
    syncFoundation?.setStoredPending(pending);
    updateLanStatus(`Sincronizzazione completata ✓\nInviati: ${result.pushed} · ricevuti: ${result.pulled}\nOutbox locale residua: ${pending}`);
  } catch (err) {
    if (err?.name === 'AbortError') updateLanStatus('Sync interrotta: la scrittura Ink ha priorità. Ripremere “Sincronizza adesso” quando si è terminato di scrivere.');
    else updateLanStatus(`Sync LAN non riuscita: ${err?.message || err}`);
  }
}

async function readAllMainRecords() {
  await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearAllMainRecords() {
  await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Pulizia pagine per cambio generazione annullata'));
  });
  notesCountCache.clear();
}

function resetSyncStores() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SYNC_EVENT_STORE, SYNC_META_STORE, SYNC_BLOB_STORE], 'readwrite');
    tx.objectStore(SYNC_EVENT_STORE).clear();
    tx.objectStore(SYNC_META_STORE).clear();
    tx.objectStore(SYNC_BLOB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Reset Sync dopo restore annullato'));
  });
}

function putRecordWithSync(record, syncCommit) {
  const events = Array.isArray(syncCommit?.events) ? syncCommit.events : [];
  if (!events.length || !syncCommit?.stateRow) return putRecord(record);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, SYNC_EVENT_STORE, SYNC_META_STORE], 'readwrite');
    tx.objectStore(STORE).put(record);
    const syncStore = tx.objectStore(SYNC_EVENT_STORE);
    for (const event of events) syncStore.put(event);
    tx.objectStore(SYNC_META_STORE).put(syncCommit.stateRow);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Commit atomico Agenda + Sync annullato'));
  });
}

function deleteRecordWithSync(date, syncCommit) {
  const events = Array.isArray(syncCommit?.events) ? syncCommit.events : [];
  if (!events.length || !syncCommit?.stateRow) return deleteRecord(date);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, SYNC_EVENT_STORE, SYNC_META_STORE], 'readwrite');
    tx.objectStore(STORE).delete(date);
    const syncStore = tx.objectStore(SYNC_EVENT_STORE);
    for (const event of events) syncStore.put(event);
    tx.objectStore(SYNC_META_STORE).put(syncCommit.stateRow);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Cancellazione atomica Agenda + Sync annullata'));
  });
}

function deleteRecord(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(date);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ensureNotesCount(dateString) {
  if (notesCountCache.has(dateString)) return notesCountCache.get(dateString);
  try {
    await openDb();
    const record = await getRecord(notesMetaKey(dateString));
    session.storageReads++;
    const count = Math.max(0, Number(record?.count) || 0);
    notesCountCache.set(dateString, count);
    return count;
  } catch (err) {
    session.storageErrors++;
    console.warn('Conteggio Note del giorno non disponibile', err);
    notesCountCache.set(dateString, 0);
    return 0;
  }
}

async function persistNotesCount(dateString, count) {
  try {
    await openDb();
    await putRecord({
      date: notesMetaKey(dateString),
      kind: 'day-notes-meta',
      referenceDate: dateString,
      count,
      version: APP_VERSION,
      modifiedAt: new Date().toISOString()
    });
    session.storageWrites++;
    notesCountCache.set(dateString, count);
    return true;
  } catch (err) {
    session.storageErrors++;
    console.warn('Salvataggio conteggio Note del giorno non riuscito', err);
    return false;
  }
}

function setupStrokeStyle(stroke, targetCtx = ctx) {
  const tool = stroke?.tool ?? 'pen';
  targetCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  targetCtx.strokeStyle = stroke?.color ?? PEN_COLOR;
  targetCtx.fillStyle = stroke?.color ?? PEN_COLOR;
  targetCtx.globalAlpha = stroke?.opacity ?? 1;
  targetCtx.lineWidth = stroke?.width ?? PEN_WIDTH;
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';
}

// 0.1.51 — contrasto Ink adattivo al tema, applicato esclusivamente durante
// il ridisegno degli stroke gia' memorizzati. Nessuna conversione dei dati e
// nessun calcolo aggiuntivo nel percorso realtime pointermove/drawBatch.
function rgbFromHexColor(value) {
  const hex = String(value || '').trim().toLowerCase();
  const match = /^#([0-9a-f]{6})$/.exec(hex);
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeInkLuminance(value) {
  const rgb = rgbFromHexColor(value);
  if (!rgb) return null;
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function storedInkDisplayColor(stroke, paperColor = pageStyle.color) {
  const stored = stroke?.color ?? PEN_COLOR;
  if ((stroke?.tool ?? 'pen') !== 'pen') return stored;
  const luminance = relativeInkLuminance(stored);
  if (luminance == null) return stored;
  if (paperColor === 'black' && luminance < 0.48) return '#ffffff';
  if (paperColor !== 'black' && luminance > 0.72) return '#111111';
  return stored;
}

function setupStoredStrokeStyle(stroke, targetCtx = ctx, paperColor = pageStyle.color) {
  setupStrokeStyle(stroke, targetCtx);
  if ((stroke?.tool ?? 'pen') !== 'pen') return;
  const displayColor = storedInkDisplayColor(stroke, paperColor);
  targetCtx.strokeStyle = displayColor;
  targetCtx.fillStyle = displayColor;
}

function toolStrokeStyle(tool = activeTool) {
  const style = toolStyles[tool] ?? toolStyles.pen;
  const resolved = { tool: tool === 'eraser' ? 'eraser' : tool === 'highlighter' ? 'highlighter' : 'pen', ...style };
  // Orario settimanale: stesso motore Ink dell'Agenda, ma penna sempre bianca sul fondo nero.
  if (currentPageKind === 'planner-timetable' && resolved.tool === 'pen') resolved.color = WEEKLY_TIMETABLE_INK_COLOR;
  return resolved;
}


function imageLayerBounds(layer = imageLayer) {
  if (!layer) return null;
  const r = layer.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

function selectedImage() {
  return images.find((image) => image.id === selectedImageId) ?? null;
}

function updateImageInspector() {
  if (!imageInspector) return;
  const imageMode = activeTool === 'image';
  imageInspector.hidden = !imageMode;
  const hasSelection = Boolean(selectedImage());
  for (const button of [cropImageButton, rotateImageLeftButton, rotateImageRightButton, deleteImageButton]) {
    if (!button) continue;
    button.disabled = !hasSelection;
    button.setAttribute('aria-disabled', hasSelection ? 'false' : 'true');
  }
}

function renderImages(targetLayer = imageLayer, sourceImages = images, interactive = targetLayer === imageLayer && activeTool === 'image') {
  if (!targetLayer) return;
  targetLayer.replaceChildren();
  targetLayer.classList.toggle('interactive', interactive);
  for (const image of sourceImages) {
    const item = document.createElement('div');
    item.className = 'image-object';
    item.dataset.imageId = image.id;
    if (interactive && image.id === selectedImageId) item.classList.add('selected');
    item.style.left = `${image.x * 100}%`;
    item.style.top = `${image.y * 100}%`;
    item.style.width = `${image.w * 100}%`;
    item.style.height = `${image.h * 100}%`;
    item.style.transform = `rotate(${image.rotation || 0}deg)`;
    item.style.transformOrigin = '50% 50%';
    const img = document.createElement('img');
    img.src = image.src;
    img.alt = image.name || 'Immagine inserita';
    img.draggable = false;
    item.appendChild(img);
    if (interactive && image.id === selectedImageId) {
      const resize = document.createElement('span');
      resize.className = 'image-handle image-resize-handle';
      resize.dataset.imageAction = 'resize';
      resize.setAttribute('aria-hidden', 'true');
      item.appendChild(resize);
      const rotate = document.createElement('span');
      rotate.className = 'image-handle image-rotate-handle';
      rotate.dataset.imageAction = 'rotate';
      rotate.setAttribute('aria-hidden', 'true');
      item.appendChild(rotate);
    }
    targetLayer.appendChild(item);
  }
  if (targetLayer === imageLayer) updateImageInspector();
}

function updateImageElement(image) {
  if (!imageLayer || !image) return;
  const item = [...imageLayer.querySelectorAll('.image-object')].find((el) => el.dataset.imageId === image.id);
  if (!item) return;
  item.style.left = `${image.x * 100}%`;
  item.style.top = `${image.y * 100}%`;
  item.style.width = `${image.w * 100}%`;
  item.style.height = `${image.h * 100}%`;
  item.style.transform = `rotate(${image.rotation || 0}deg)`;
}

function setSelectedImage(id) {
  selectedImageId = images.some((image) => image.id === id) ? id : null;
  renderImages();
}

function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Lettura immagine non riuscita'));
    reader.readAsDataURL(blob);
  });
}

async function loadBitmapForImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // revoke is delayed by a microtask so Image.decode has fully consumed it on Safari.
    queueMicrotask(() => URL.revokeObjectURL(url));
  }
}

async function compressImageFile(file) {
  const source = await loadBitmapForImage(file);
  const sw = source.width || source.naturalWidth;
  const sh = source.height || source.naturalHeight;
  if (!sw || !sh) throw new Error('Dimensioni immagine non disponibili');
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  const work = document.createElement('canvas');
  work.width = width; work.height = height;
  const wctx = work.getContext('2d', { alpha: true });
  wctx.drawImage(source, 0, 0, width, height);
  if (typeof source.close === 'function') source.close();
  const toBlob = (type, quality) => new Promise((resolve) => work.toBlob(resolve, type, quality));
  let blob = await toBlob('image/webp', .86);
  let mimeType = blob?.type || 'image/webp';
  if (!blob || !blob.size) {
    blob = await toBlob(file.type === 'image/png' ? 'image/png' : 'image/jpeg', .90);
    mimeType = blob?.type || file.type || 'image/jpeg';
  }
  if (!blob) throw new Error('Compressione immagine non riuscita');
  return { src: await dataUrlFromBlob(blob), blob, mimeType, width, height };
}

function initialImageGeometry(pixelWidth, pixelHeight) {
  const r = imageLayerBounds();
  if (!r) return { x: .18, y: .16, w: .48, h: .36 };
  const aspect = Math.max(.05, pixelWidth / Math.max(1, pixelHeight));
  let w = Math.min(.58, Math.max(.24, 520 / r.width));
  let h = w * r.width / (aspect * r.height);
  if (h > .58) { h = .58; w = h * aspect * r.height / r.width; }
  w = Math.min(.82, Math.max(.12, w));
  h = Math.min(.82, Math.max(.10, h));
  return { x: (1 - w) / 2, y: Math.max(.04, (1 - h) / 2), w, h };
}

async function importImageFile(file) {
  if (denyMutationDuringSyncRecovery()) return;
  if (!file || !file.type?.startsWith('image/') || drawing || pageTurning || imageBusy) return;
  imageBusy = true;
  statusLabel.textContent = 'preparo immagine';
  try {
    const packed = await compressImageFile(file);
    const blobRow = await registerBlob(packed.blob, packed.mimeType);
    const geom = initialImageGeometry(packed.width, packed.height);
    const image = normalizeImageObject({
      id: makeImageId(), name: file.name || 'Immagine', mimeType: packed.mimeType, src: packed.src,
      blobHash: blobRow.hash, blobSize: blobRow.size,
      ...geom, rotation: 0, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString()
    });
    images.push(image);
    selectedImageId = image.id;
    rememberUndo({ type: 'add-image', image: cloneImageObject(image), index: images.length - 1 });
    session.imagesImported++;
    dirty = true;
    renderImages();
    statusLabel.textContent = 'immagine inserita';
    syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.add', image);
    scheduleSave();
  } catch (err) {
    console.warn('Importazione immagine non riuscita', err);
    statusLabel.textContent = 'errore immagine';
  } finally {
    imageBusy = false;
  }
}

function constrainImage(image) {
  image.w = Math.min(.96, Math.max(.055, image.w));
  image.h = Math.min(.96, Math.max(.055, image.h));
  image.x = Math.min(1 - image.w, Math.max(0, image.x));
  image.y = Math.min(1 - image.h, Math.max(0, image.y));
  image.rotation = ((Number(image.rotation) || 0) % 360 + 360) % 360;
  image.modifiedAt = new Date().toISOString();
}

function beginImageGesture(ev) {
  if (denyMutationDuringSyncRecovery()) return;
  if (activeTool !== 'image' || drawing || pageTurning || !imageLayer) return;
  const item = ev.target instanceof Element ? ev.target.closest('.image-object') : null;
  if (!item || !imageLayer.contains(item)) {
    setSelectedImage(null);
    return;
  }
  const id = item.dataset.imageId;
  const image = images.find((candidate) => candidate.id === id);
  if (!image) return;
  selectedImageId = id;
  renderImages();
  const layerRect = imageLayerBounds();
  if (!layerRect) return;
  const action = ev.target instanceof Element && ev.target.closest('[data-image-action]')?.dataset.imageAction || 'move';
  const centerX = layerRect.left + (image.x + image.w / 2) * layerRect.width;
  const centerY = layerRect.top + (image.y + image.h / 2) * layerRect.height;
  imageGesture = {
    pointerId: ev.pointerId, action, startX: ev.clientX, startY: ev.clientY,
    before: cloneImageObject(image), layerRect,
    centerX, centerY,
    startAngle: Math.atan2(ev.clientY - centerY, ev.clientX - centerX),
    baseRotation: image.rotation || 0
  };
  try { imageLayer.setPointerCapture?.(ev.pointerId); } catch {}
  ev.preventDefault();
  ev.stopPropagation();
}

function moveImageGesture(ev) {
  if (!imageGesture || ev.pointerId !== imageGesture.pointerId) return;
  const image = selectedImage();
  if (!image) return;
  const g = imageGesture;
  if (g.action === 'move') {
    image.x = g.before.x + (ev.clientX - g.startX) / g.layerRect.width;
    image.y = g.before.y + (ev.clientY - g.startY) / g.layerRect.height;
  } else if (g.action === 'resize') {
    const dx = (ev.clientX - g.startX) / g.layerRect.width;
    const desiredW = Math.max(.055, g.before.w + dx);
    const aspectCss = (g.before.w * g.layerRect.width) / Math.max(1, g.before.h * g.layerRect.height);
    image.w = desiredW;
    image.h = Math.max(.055, desiredW * g.layerRect.width / Math.max(.05, aspectCss * g.layerRect.height));
  } else if (g.action === 'rotate') {
    const angle = Math.atan2(ev.clientY - g.centerY, ev.clientX - g.centerX);
    image.rotation = g.baseRotation + (angle - g.startAngle) * 180 / Math.PI;
  }
  constrainImage(image);
  updateImageElement(image);
  ev.preventDefault();
  ev.stopPropagation();
}

function endImageGesture(ev, cancelled = false) {
  if (!imageGesture || (ev.pointerId != null && ev.pointerId !== imageGesture.pointerId)) return;
  const g = imageGesture;
  imageGesture = null;
  const image = selectedImage();
  if (!image) return;
  if (cancelled) Object.assign(image, g.before);
  const changed = ['x','y','w','h','rotation'].some((key) => Math.abs(Number(image[key]) - Number(g.before[key])) > .00001);
  if (!cancelled && changed) {
    rememberUndo({ type: 'update-image', id: image.id, before: g.before, after: cloneImageObject(image) });
    session.imageTransforms++;
    dirty = true;
    syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', image, { before: g.before });
    scheduleSave();
  }
  renderImages();
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
}

function rotateSelectedImage(delta) {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning) return;
  const image = selectedImage();
  if (!image) return;
  const before = cloneImageObject(image);
  image.rotation = (image.rotation || 0) + delta;
  constrainImage(image);
  rememberUndo({ type: 'update-image', id: image.id, before, after: cloneImageObject(image) });
  session.imageTransforms++;
  dirty = true;
  renderImages();
  syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', image, { before });
  scheduleSave();
}

function deleteSelectedImage() {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning) return;
  const index = images.findIndex((image) => image.id === selectedImageId);
  if (index < 0) return;
  const [image] = images.splice(index, 1);
  rememberUndo({ type: 'remove-image', image: cloneImageObject(image), index });
  selectedImageId = null;
  session.imagesDeleted++;
  dirty = true;
  renderImages();
  syncFoundation?.recordImageDeleted(pageDescriptor(), image.id);
  scheduleSave();
}


function cropRectIsFull(rect) {
  return rect && rect.x <= .0005 && rect.y <= .0005 && rect.w >= .999 && rect.h >= .999;
}

function renderImageCropSelection() {
  if (!imageCropSelection || !imageCropEditor) return;
  const r = imageCropEditor.rect;
  imageCropSelection.style.left = `${r.x * 100}%`;
  imageCropSelection.style.top = `${r.y * 100}%`;
  imageCropSelection.style.width = `${r.w * 100}%`;
  imageCropSelection.style.height = `${r.h * 100}%`;
  // 0.1.67 — il comando è applicabile solo quando esiste un ritaglio reale.
  if (applyImageCropButton) {
    const applicable = !cropRectIsFull(r) && !imageBusy;
    applyImageCropButton.disabled = !applicable;
    applyImageCropButton.setAttribute('aria-disabled', applicable ? 'false' : 'true');
  }
}

function sizeImageCropStage() {
  if (!imageCropStage || !imageCropPreview || !imageCropEditor) return false;
  const nw = imageCropPreview.naturalWidth;
  const nh = imageCropPreview.naturalHeight;
  if (!nw || !nh) return false;
  const maxW = Math.max(240, Math.min(980, window.innerWidth * .82));
  const maxH = Math.max(180, Math.min(680, window.innerHeight * .62));
  const scale = Math.min(maxW / nw, maxH / nh);
  imageCropStage.style.width = `${Math.max(1, Math.round(nw * scale))}px`;
  imageCropStage.style.height = `${Math.max(1, Math.round(nh * scale))}px`;
  return true;
}

function closeImageCropEditor(status = '') {
  imageCropGesture = null;
  imageCropEditor = null;
  if (imageCropOverlay) imageCropOverlay.hidden = true;
  if (imageCropPreview) imageCropPreview.removeAttribute('src');
  if (status) statusLabel.textContent = status;
}

async function openImageCropEditor() {
  if (activeTool !== 'image' || drawing || pageTurning || imageBusy) return;
  const image = selectedImage();
  if (!image || !imageCropOverlay || !imageCropPreview || !imageCropStage || !imageCropSelection) return;
  imageCropEditor = { imageId: image.id, rect: { x: 0, y: 0, w: 1, h: 1 } };
  imageCropOverlay.hidden = false;
  imageCropPreview.src = image.src;
  renderImageCropSelection();
  try {
    if (!imageCropPreview.complete || !imageCropPreview.naturalWidth) await imageCropPreview.decode();
    if (!imageCropEditor || imageCropEditor.imageId !== image.id) return;
    if (!sizeImageCropStage()) throw new Error('Anteprima immagine non disponibile');
    renderImageCropSelection();
    statusLabel.textContent = 'ritaglio immagine';
  } catch (err) {
    console.warn('Apertura ritaglio non riuscita', err);
    closeImageCropEditor('errore ritaglio');
  }
}

function cropMinimumFractions(image) {
  return {
    w: Math.min(1, Math.max(.055, .055 / Math.max(.055, Number(image?.w) || .055))),
    h: Math.min(1, Math.max(.055, .055 / Math.max(.055, Number(image?.h) || .055)))
  };
}

function beginImageCropGesture(ev) {
  if (!imageCropEditor || imageBusy || !imageCropSelection || !imageCropStage) return;
  if (!(ev.target instanceof Element) || !imageCropSelection.contains(ev.target)) return;
  const image = images.find((candidate) => candidate.id === imageCropEditor.imageId);
  if (!image) return;
  const stageRect = imageCropStage.getBoundingClientRect();
  if (!(stageRect.width > 0 && stageRect.height > 0)) return;
  const handle = ev.target.closest('[data-crop-handle]')?.dataset.cropHandle || 'move';
  imageCropGesture = {
    pointerId: ev.pointerId,
    action: handle,
    startX: ev.clientX,
    startY: ev.clientY,
    before: { ...imageCropEditor.rect },
    stageRect,
    minimum: cropMinimumFractions(image)
  };
  try { imageCropSelection.setPointerCapture?.(ev.pointerId); } catch {}
  ev.preventDefault();
  ev.stopPropagation();
}

function moveImageCropGesture(ev) {
  if (!imageCropGesture || !imageCropEditor || ev.pointerId !== imageCropGesture.pointerId) return;
  const g = imageCropGesture;
  const before = g.before;
  const dx = (ev.clientX - g.startX) / g.stageRect.width;
  const dy = (ev.clientY - g.startY) / g.stageRect.height;
  let { x, y, w, h } = before;
  if (g.action === 'move') {
    x = Math.min(1 - w, Math.max(0, before.x + dx));
    y = Math.min(1 - h, Math.max(0, before.y + dy));
  } else {
    const right = before.x + before.w;
    const bottom = before.y + before.h;
    if (g.action.includes('w')) {
      const left = Math.min(right - g.minimum.w, Math.max(0, before.x + dx));
      x = left; w = right - left;
    }
    if (g.action.includes('e')) {
      const newRight = Math.max(before.x + g.minimum.w, Math.min(1, right + dx));
      x = before.x; w = newRight - before.x;
    }
    if (g.action.includes('n')) {
      const top = Math.min(bottom - g.minimum.h, Math.max(0, before.y + dy));
      y = top; h = bottom - top;
    }
    if (g.action.includes('s')) {
      const newBottom = Math.max(before.y + g.minimum.h, Math.min(1, bottom + dy));
      y = before.y; h = newBottom - before.y;
    }
  }
  imageCropEditor.rect = { x, y, w, h };
  renderImageCropSelection();
  ev.preventDefault();
  ev.stopPropagation();
}

function endImageCropGesture(ev) {
  if (!imageCropGesture || (ev.pointerId != null && ev.pointerId !== imageCropGesture.pointerId)) return;
  try { imageCropSelection?.releasePointerCapture?.(imageCropGesture.pointerId); } catch {}
  imageCropGesture = null;
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
}

async function cropPreviewToData(rect, preferredMimeType) {
  if (!imageCropPreview?.naturalWidth || !imageCropPreview?.naturalHeight) throw new Error('Anteprima non decodificata');
  const sw = imageCropPreview.naturalWidth;
  const sh = imageCropPreview.naturalHeight;
  const sx = Math.max(0, Math.min(sw - 1, Math.round(rect.x * sw)));
  const sy = Math.max(0, Math.min(sh - 1, Math.round(rect.y * sh)));
  const cw = Math.max(1, Math.min(sw - sx, Math.round(rect.w * sw)));
  const ch = Math.max(1, Math.min(sh - sy, Math.round(rect.h * sh)));
  const work = document.createElement('canvas');
  work.width = cw;
  work.height = ch;
  const wctx = work.getContext('2d', { alpha: true });
  if (!wctx) throw new Error('Canvas ritaglio non disponibile');
  wctx.drawImage(imageCropPreview, sx, sy, cw, ch, 0, 0, cw, ch);
  const toBlob = (type, quality) => new Promise((resolve) => work.toBlob(resolve, type, quality));
  let blob = await toBlob('image/webp', .86);
  let mimeType = blob?.type || 'image/webp';
  if (!blob || !blob.size) {
    const fallbackType = preferredMimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    blob = await toBlob(fallbackType, fallbackType === 'image/jpeg' ? .90 : undefined);
    mimeType = blob?.type || fallbackType;
  }
  if (!blob) throw new Error('Esportazione ritaglio non riuscita');
  return { src: await dataUrlFromBlob(blob), blob, mimeType, width: cw, height: ch };
}

function applyCropGeometry(image, rect, layerRect) {
  const old = { x: image.x, y: image.y, w: image.w, h: image.h, rotation: image.rotation || 0 };
  const newW = old.w * rect.w;
  const newH = old.h * rect.h;
  let centerX = old.x + old.w / 2;
  let centerY = old.y + old.h / 2;
  if (layerRect?.width > 0 && layerRect?.height > 0) {
    const localX = (rect.x + rect.w / 2 - .5) * old.w * layerRect.width;
    const localY = (rect.y + rect.h / 2 - .5) * old.h * layerRect.height;
    const a = old.rotation * Math.PI / 180;
    const rotatedX = Math.cos(a) * localX - Math.sin(a) * localY;
    const rotatedY = Math.sin(a) * localX + Math.cos(a) * localY;
    centerX += rotatedX / layerRect.width;
    centerY += rotatedY / layerRect.height;
  } else {
    centerX = old.x + (rect.x + rect.w / 2) * old.w;
    centerY = old.y + (rect.y + rect.h / 2) * old.h;
  }
  image.w = newW;
  image.h = newH;
  image.x = centerX - newW / 2;
  image.y = centerY - newH / 2;
}

async function applyImageCrop() {
  if (denyMutationDuringSyncRecovery()) return;
  if (!imageCropEditor || imageBusy || drawing || pageTurning) return;
  const image = images.find((candidate) => candidate.id === imageCropEditor.imageId);
  if (!image) { closeImageCropEditor('immagine non disponibile'); return; }
  const rect = { ...imageCropEditor.rect };
  if (cropRectIsFull(rect)) { closeImageCropEditor('ritaglio annullato'); return; }
  imageBusy = true;
  if (applyImageCropButton) applyImageCropButton.disabled = true;
  if (cancelImageCropButton) cancelImageCropButton.disabled = true;
  statusLabel.textContent = 'applico ritaglio';
  try {
    const before = cloneImageObject(image);
    const packed = await cropPreviewToData(rect, image.mimeType);
    const blobRow = await registerBlob(packed.blob, packed.mimeType);
    applyCropGeometry(image, rect, imageLayerBounds());
    image.src = packed.src;
    image.mimeType = packed.mimeType;
    image.blobHash = blobRow.hash;
    image.blobSize = blobRow.size;
    constrainImage(image);
    rememberUndo({ type: 'update-image', id: image.id, before, after: cloneImageObject(image) });
    session.imageTransforms++;
    session.imageCrops++;
    dirty = true;
    closeImageCropEditor();
    renderImages();
    syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', image, { before, crop: true });
    scheduleSave();
    statusLabel.textContent = 'immagine ritagliata';
  } catch (err) {
    console.warn('Ritaglio immagine non riuscito', err);
    statusLabel.textContent = 'errore ritaglio';
  } finally {
    imageBusy = false;
    if (applyImageCropButton) {
      const applicable = Boolean(imageCropEditor) && !cropRectIsFull(imageCropEditor.rect);
      applyImageCropButton.disabled = !applicable;
      applyImageCropButton.setAttribute('aria-disabled', applicable ? 'false' : 'true');
    }
    if (cancelImageCropButton) cancelImageCropButton.disabled = false;
  }
}

function renderPreviewImages(preview, sourceImages) {
  const layer = preview?.querySelector('.image-layer');
  if (!layer) return;
  renderImages(layer, sourceImages || [], false);
}

function updateToolUi() {
  for (const button of toolButtons) {
    const selected = button.dataset.tool === activeTool;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
  // 0.1.19: Undo/Redo restano sempre target Pointer reali. Lo stato
  // disponibile/non disponibile è semantico e visivo, non usa HTML disabled.
  if (undoButton) {
    const available = undoHistory.length > 0;
    undoButton.disabled = false;
    undoButton.classList.toggle('history-unavailable', !available);
    undoButton.setAttribute('aria-disabled', available ? 'false' : 'true');
  }
  if (redoButton) {
    const available = redoHistory.length > 0;
    redoButton.disabled = false;
    redoButton.classList.toggle('history-unavailable', !available);
    redoButton.setAttribute('aria-disabled', available ? 'false' : 'true');
  }
}

function selectTool(tool) {
  if (!['pen', 'highlighter', 'eraser', 'shape', 'image'].includes(tool) || drawing || pageTurning) return;
  if (tool !== 'image' && imageCropEditor) closeImageCropEditor();
  if (tool !== 'shape') cancelShapeGesture();
  activeTool = tool;
  if (tool !== 'image') selectedImageId = null;
  closeStylePanel();
  paper?.classList.toggle('shape-mode', tool === 'shape');
  paper?.classList.toggle('image-edit-mode', tool === 'image');
  if (shapePalette) shapePalette.hidden = tool !== 'shape';
  shapeOverlay?.toggleAttribute('hidden', tool !== 'shape');
  shapeToolButton?.setAttribute('aria-expanded', tool === 'shape' ? 'true' : 'false');
  if (tool === 'shape') syncShapeOverlayBounds();
  renderImages();
  updateToolUi();
  updateStyleUi();
  statusLabel.textContent = tool === 'highlighter' ? 'evidenziatore'
    : tool === 'eraser' ? 'gomma'
    : tool === 'shape' ? `figure · ${SHAPE_LABELS[selectedShapeType]} · trascina o fai clic`
    : tool === 'image' ? 'modalità immagini' : 'penna';
}

function initializeShapePaletteIcons() {
  const namespace = 'http://www.w3.org/2000/svg';
  for (const button of shapeChoiceButtons) {
    const type = button.dataset.shapeType;
    if (!SHAPE_TYPES.includes(type)) continue;
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', shapeIconPathData(type));
    svg.appendChild(path);
    button.replaceChildren(svg);
  }
  updateShapePaletteUi();
}

function updateShapePaletteUi() {
  for (const button of shapeChoiceButtons) {
    const selected = button.dataset.shapeType === selectedShapeType;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function setSelectedShapeType(type) {
  if (!SHAPE_TYPES.includes(type) || drawing || pageTurning) return;
  cancelShapeGesture();
  selectedShapeType = type;
  saveSelectedShapeType();
  updateShapePaletteUi();
  statusLabel.textContent = `figura · ${SHAPE_LABELS[type]} · trascina o fai clic`;
}

function syncShapeOverlayBounds() {
  if (!shapeOverlay || !rect) return;
  const writableHeight = Math.max(1, rect.height - protectedTop - FOOTER_PX);
  shapeOverlay.style.top = `${protectedTop}px`;
  shapeOverlay.style.bottom = `${FOOTER_PX}px`;
  shapeOverlay.setAttribute('viewBox', `0 0 ${Math.max(1, rect.width)} ${writableHeight}`);
  const penStyle = toolStrokeStyle('pen');
  if (shapePreviewPath) {
    shapePreviewPath.style.stroke = storedInkDisplayColor(penStyle, pageStyle.color);
    shapePreviewPath.style.strokeWidth = String(penStyle.width);
  }
}

function shapePointFromPointer(ev) {
  if (!rect || !pointInsideWritableArea(ev)) return null;
  return {
    x: Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
  };
}

function shapeBoundsFromGesture(gesture) {
  const minWidth = 12 / Math.max(1, rect.width);
  const minHeight = 12 / Math.max(1, rect.height);
  let left = Math.min(gesture.start.x, gesture.current.x);
  let right = Math.max(gesture.start.x, gesture.current.x);
  let top = Math.min(gesture.start.y, gesture.current.y);
  let bottom = Math.max(gesture.start.y, gesture.current.y);
  if (right - left < minWidth && bottom - top < minHeight) {
    const halfWidth = Math.min(.09, 70 / Math.max(1, rect.width));
    const halfHeight = Math.min(.07, 42 / Math.max(1, rect.height));
    left = gesture.start.x - halfWidth;
    right = gesture.start.x + halfWidth;
    top = gesture.start.y - halfHeight;
    bottom = gesture.start.y + halfHeight;
  } else {
    if (right - left < minWidth) right = left + minWidth;
    if (bottom - top < minHeight) bottom = top + minHeight;
  }
  const writableTop = protectedTop / Math.max(1, rect.height);
  const writableBottom = (rect.height - FOOTER_PX) / Math.max(1, rect.height);
  const width = right - left;
  const height = bottom - top;
  left = Math.max(0, Math.min(1 - width, left));
  right = left + width;
  top = Math.max(writableTop, Math.min(writableBottom - height, top));
  bottom = top + height;
  return { left, top, right, bottom };
}

function updateShapePreview() {
  if (!shapeGesture || !shapePreviewPath || !rect) return;
  const points = buildShapePoints(selectedShapeType, shapeBoundsFromGesture(shapeGesture));
  shapePreviewPath.setAttribute('d', shapePathData(points, rect.width, rect.height, protectedTop));
}

function beginShapeGesture(ev) {
  if (activeTool !== 'shape' || shapeGesture || drawing || pageTurning || pageStyleBulkBusy) return;
  if (ev.isPrimary === false || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  const point = shapePointFromPointer(ev);
  if (!point) return;
  cancelPendingSave();
  shapeGesture = { pointerId: ev.pointerId, start: point, current: point };
  syncShapeOverlayBounds();
  updateShapePreview();
  try { shapeOverlay?.setPointerCapture?.(ev.pointerId); } catch {}
  ev.preventDefault();
  ev.stopPropagation();
}

function moveShapeGesture(ev) {
  if (!shapeGesture || ev.pointerId !== shapeGesture.pointerId) return;
  const x = Math.max(rect.left, Math.min(rect.right, ev.clientX));
  const y = Math.max(rect.top + protectedTop, Math.min(rect.bottom - FOOTER_PX, ev.clientY));
  shapeGesture.current = {
    x: (x - rect.left) / Math.max(1, rect.width),
    y: (y - rect.top) / Math.max(1, rect.height)
  };
  updateShapePreview();
  ev.preventDefault();
  ev.stopPropagation();
}

function cancelShapeGesture() {
  if (shapePreviewPath) shapePreviewPath.setAttribute('d', '');
  shapeGesture = null;
}

function endShapeGesture(ev, cancelled = false) {
  if (!shapeGesture || ev.pointerId !== shapeGesture.pointerId) return;
  const gesture = shapeGesture;
  if (!cancelled) moveShapeGesture(ev);
  try { shapeOverlay?.releasePointerCapture?.(gesture.pointerId); } catch {}
  if (cancelled) {
    cancelShapeGesture();
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  const style = toolStrokeStyle('pen');
  const now = performance.now();
  const shape = {
    id: makeId(),
    kind: 'shape',
    shapeType: selectedShapeType,
    shapeVersion: 1,
    tool: 'pen',
    color: style.color,
    width: style.width,
    opacity: style.opacity,
    points: buildShapePoints(selectedShapeType, shapeBoundsFromGesture(gesture)).map((point, index) => ({
      ...point, p: .5, t: now + index
    })),
    createdAt: new Date().toISOString()
  };
  cancelShapeGesture();
  strokes.push(shape);
  rememberUndo({ type: 'add-stroke', stroke: shape, index: strokes.length - 1 });
  syncFoundation?.recordStrokeAdded(pageDescriptor(), shape);
  session.shapesInserted++;
  renderAll();
  dirty = true;
  scheduleSave();
  statusLabel.textContent = `${SHAPE_LABELS[shape.shapeType]} inserita`;
  ev.preventDefault();
  ev.stopPropagation();
}

// 0.1.29 — import e ritaglio restano separati dal motore Ink.
// Viene invocata esclusivamente da un gesto utente sui comandi IMG/Importa.
function requestImageImport() {
  if (!imageFileInput || imageBusy || drawing || pageTurning || activeTool !== 'image') return;
  try {
    if (typeof imageFileInput.showPicker === 'function') {
      imageFileInput.showPicker();
      return;
    }
  } catch {}
  try { imageFileInput.click(); } catch {}
}

function activateImageTool() {
  selectTool('image');
  // Prima immagine: il comando IMG produce subito un effetto esplicito e apre
  // il selettore. Per immagini successive resta disponibile il pulsante Importa.
  if (activeTool === 'image' && images.length === 0) requestImageImport();
}

function resetUndoHistory() {
  undoHistory = [];
  redoHistory = [];
  updateToolUi();
}

function pushBounded(history, action, limit) {
  history.push(action);
  if (history.length > limit) history.shift();
}

function rememberUndo(action) {
  pushBounded(undoHistory, action, UNDO_LIMIT);
  // Come nei normali editor: una nuova modifica invalida la catena Redo.
  redoHistory = [];
  updateToolUi();
}

function undoLastModification() {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning || !ready || !undoHistory.length) return;
  const action = undoHistory.pop();
  if (action?.type === 'add-stroke' && action.stroke?.id) {
    const index = strokes.findIndex((stroke) => stroke.id === action.stroke.id);
    if (index >= 0) {
      const [removed] = strokes.splice(index, 1);
      pushBounded(redoHistory, { type: 'add-stroke', stroke: removed, index }, REDO_LIMIT);
      syncFoundation?.recordStrokeDeleted(pageDescriptor(), removed.id, 'undo');
    }
  } else if (action?.type === 'erase-strokes' && Array.isArray(action.changes)) {
    const descriptor = pageDescriptor();
    const fragmentIds = new Set(action.changes.flatMap((change) => (change.fragments || []).map((fragment) => fragment?.id).filter(Boolean)));
    strokes = strokes.filter((stroke) => !fragmentIds.has(stroke?.id));
    for (const change of [...action.changes].sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0))) {
      const original = change?.original;
      if (!original?.id || strokes.some((stroke) => stroke.id === original.id)) continue;
      const index = Math.max(0, Math.min(Number(change.originalIndex) || 0, strokes.length));
      strokes.splice(index, 0, original);
      syncFoundation?.recordStrokeAdded(descriptor, original);
      for (const fragment of change.fragments || []) {
        if (fragment?.id) syncFoundation?.recordStrokeDeleted(descriptor, fragment.id, 'undo-eraser');
      }
    }
    pushBounded(redoHistory, action, REDO_LIMIT);
  } else if (action?.type === 'add-image' && action.image?.id) {
    const index = images.findIndex((image) => image.id === action.image.id);
    if (index >= 0) {
      const [removed] = images.splice(index, 1);
      pushBounded(redoHistory, { type: 'add-image', image: cloneImageObject(removed), index }, REDO_LIMIT);
      if (selectedImageId === removed.id) selectedImageId = null;
      syncFoundation?.recordImageDeleted(pageDescriptor(), removed.id);
    }
  } else if (action?.type === 'remove-image' && action.image?.id) {
    const index = Math.max(0, Math.min(Number.isFinite(action.index) ? action.index : images.length, images.length));
    images.splice(index, 0, cloneImageObject(action.image));
    selectedImageId = action.image.id;
    pushBounded(redoHistory, { type: 'remove-image', image: cloneImageObject(action.image), index }, REDO_LIMIT);
    syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.add', action.image, { reason: 'undo-delete' });
  } else if (action?.type === 'update-image' && action.before?.id) {
    const index = images.findIndex((image) => image.id === action.before.id);
    if (index >= 0) images[index] = cloneImageObject(action.before);
    selectedImageId = action.before.id;
    pushBounded(redoHistory, { type: 'update-image', id: action.before.id, before: cloneImageObject(action.before), after: cloneImageObject(action.after) }, REDO_LIMIT);
    syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', action.before, { reason: 'undo-update' });
  }
  renderAll();
  renderImages();
  dirty = true;
  statusLabel.textContent = 'annullato';
  updateToolUi();
  scheduleSave();
}

function redoLastModification() {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning || !ready || !redoHistory.length) return;
  const action = redoHistory.pop();
  if (action?.type === 'add-stroke' && action.stroke?.id) {
    if (!strokes.some((stroke) => stroke.id === action.stroke.id)) {
      const index = Math.max(0, Math.min(Number.isFinite(action.index) ? action.index : strokes.length, strokes.length));
      strokes.splice(index, 0, action.stroke);
      pushBounded(undoHistory, { type: 'add-stroke', stroke: action.stroke, index }, UNDO_LIMIT);
      syncFoundation?.recordStrokeAdded(pageDescriptor(), action.stroke);
    }
  } else if (action?.type === 'erase-strokes' && Array.isArray(action.changes)) {
    const descriptor = pageDescriptor();
    for (const change of [...action.changes].sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0))) {
      const original = change?.original;
      if (!original?.id) continue;
      const index = strokes.findIndex((stroke) => stroke.id === original.id);
      if (index < 0) continue;
      strokes.splice(index, 1, ...(change.fragments || []));
      syncFoundation?.recordStrokeDeleted(descriptor, original.id, 'redo-eraser');
      for (const fragment of change.fragments || []) {
        if (fragment?.id) syncFoundation?.recordStrokeAdded(descriptor, fragment);
      }
    }
    pushBounded(undoHistory, action, UNDO_LIMIT);
  } else if (action?.type === 'add-image' && action.image?.id) {
    if (!images.some((image) => image.id === action.image.id)) {
      const index = Math.max(0, Math.min(Number.isFinite(action.index) ? action.index : images.length, images.length));
      images.splice(index, 0, cloneImageObject(action.image));
      selectedImageId = action.image.id;
      pushBounded(undoHistory, { type: 'add-image', image: cloneImageObject(action.image), index }, UNDO_LIMIT);
      syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.add', action.image, { reason: 'redo-add' });
    }
  } else if (action?.type === 'remove-image' && action.image?.id) {
    const index = images.findIndex((image) => image.id === action.image.id);
    if (index >= 0) images.splice(index, 1);
    if (selectedImageId === action.image.id) selectedImageId = null;
    pushBounded(undoHistory, { type: 'remove-image', image: cloneImageObject(action.image), index: action.index }, UNDO_LIMIT);
    syncFoundation?.recordImageDeleted(pageDescriptor(), action.image.id);
  } else if (action?.type === 'update-image' && action.after?.id) {
    const index = images.findIndex((image) => image.id === action.after.id);
    if (index >= 0) images[index] = cloneImageObject(action.after);
    selectedImageId = action.after.id;
    pushBounded(undoHistory, { type: 'update-image', id: action.after.id, before: cloneImageObject(action.before), after: cloneImageObject(action.after) }, UNDO_LIMIT);
    syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', action.after, { reason: 'redo-update' });
  }
  renderAll();
  renderImages();
  dirty = true;
  statusLabel.textContent = 'ripristinato';
  updateToolUi();
  scheduleSave();
}

function cssPoint(point) {
  return { x: point.x * canvas.clientWidth, y: point.y * canvas.clientHeight };
}

function isCrossPlatformTextItem(item) {
  return item?.kind === 'text' || item?.tool === 'keyboard-text';
}

function safeCanvasFontFamily(value) {
  const raw = String(value || '').trim();
  if (!raw || !/^[A-Za-z0-9 _.-]{1,80}$/.test(raw)) return '';
  return raw.replace(/"/g, '');
}

function drawCrossPlatformText(item, targetCtx, width, height, paperColor = pageStyle.color) {
  const x = Math.max(0, Math.min(width, Number(item?.x ?? 0) * width));
  const y = Math.max(0, Math.min(height, Number(item?.y ?? 0) * height));
  const normalizedSize = Number(item?.fontSizeNorm);
  const fontPx = Math.max(18, Math.min(72, (Number.isFinite(normalizedSize) ? normalizedSize : (CROSS_PLATFORM_TEXT_FONT_PX / Math.max(1, height))) * height));
  const lineHeight = fontPx * 1.05;
  const requestedFont = safeCanvasFontFamily(item?.fontFamily);
  const fontStack = [
    requestedFont ? `"${requestedFont}"` : '',
    '"Snell Roundhand"',
    '"Apple Chancery"',
    '"Segoe Script"',
    '"Segoe Print"',
    'cursive'
  ].filter(Boolean).join(', ');
  targetCtx.save();
  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.globalAlpha = 1;
  targetCtx.fillStyle = storedInkDisplayColor({ tool: 'pen', color: item?.color ?? PEN_COLOR }, paperColor);
  targetCtx.textBaseline = 'top';
  targetCtx.font = `${fontPx}px ${fontStack}`;
  String(item?.text ?? '').split(/\r?\n/).forEach((line, index) => {
    targetCtx.fillText(line, x, y + index * lineHeight);
  });
  targetCtx.restore();
}

function drawStoredStroke(stroke) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, canvas.clientWidth, Math.max(0, canvas.clientHeight - protectedTop - FOOTER_PX));
  ctx.clip();
  if (isCrossPlatformTextItem(stroke)) {
    drawCrossPlatformText(stroke, ctx, canvas.clientWidth, canvas.clientHeight, pageStyle.color);
    ctx.restore();
    return;
  }
  const points = stroke?.points ?? [];
  if (!points.length) { ctx.restore(); return; }
  setupStoredStrokeStyle(stroke, ctx, pageStyle.color);
  if (points.length === 1) {
    const p = cssPoint(points[0]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(.7, (stroke.width ?? PEN_WIDTH) / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  let p = cssPoint(points[0]);
  ctx.moveTo(p.x, p.y);
  for (let i = 1; i < points.length; i++) {
    p = cssPoint(points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function renderAll() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const stroke of strokes) drawStoredStroke(stroke);
}

function resizeCanvas() {
  const r = paper.getBoundingClientRect();
  const hr = header.getBoundingClientRect();
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  protectedTop = Math.max(0, Math.min(r.height, hr.bottom - r.top));
  rect = canvas.getBoundingClientRect();
  syncShapeOverlayBounds();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderAll();
}

function normalizeEvent(ev) {
  return {
    x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
    p: ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5,
    t: Number.isFinite(ev.timeStamp) ? ev.timeStamp : performance.now()
  };
}

function pointToCss(point) {
  return { x: point.x * rect.width, y: point.y * rect.height };
}

function pointAllowed(point) {
  const y = point.y * rect.height;
  return y >= protectedTop && y <= rect.height - FOOTER_PX;
}

function pointInsideWritableArea(ev) {
  if (!rect) rect = canvas.getBoundingClientRect();
  return ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top + protectedTop && ev.clientY <= rect.bottom - FOOTER_PX;
}

function noteHandlerArrival() {
  const now = performance.now();
  if (drawing && lastHandlerArrival) {
    const gap = now - lastHandlerArrival;
    if (gap > session.maxHandlerGapMs) session.maxHandlerGapMs = gap;
    if (gap > 34) session.handlerGapsOver34++;
    if (currentStrokeDiag && gap > currentStrokeDiag.maxHandlerGapMs) currentStrokeDiag.maxHandlerGapMs = gap;
  }
  lastHandlerArrival = now;
}

function noteSampleGap(point) {
  if (!currentStrokeDiag) return;
  const prev = currentStrokeDiag.lastSampleTs;
  if (Number.isFinite(prev) && Number.isFinite(point.t)) {
    const gap = Math.max(0, point.t - prev);
    currentStrokeDiag.maxSampleGapMs = Math.max(currentStrokeDiag.maxSampleGapMs, gap);
    if (gap > 24) currentStrokeDiag.sampleGapsOver24++;
    if (gap > 40) currentStrokeDiag.sampleGapsOver40++;
    if (gap > 80) currentStrokeDiag.sampleGapsOver80++;
  }
  currentStrokeDiag.lastSampleTs = point.t;
}

function drawDot(point) {
  if (!pointAllowed(point)) return;
  const p = pointToCss(point);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, rect.width, Math.max(0, rect.height - protectedTop - FOOTER_PX));
  ctx.clip();
  setupStrokeStyle(activeStroke);
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(.7, (activeStroke?.width ?? PEN_WIDTH) / 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBatch(events) {
  if (!drawing || !activeStroke || !events.length) return;
  const drawStart = performance.now();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, protectedTop, rect.width, Math.max(0, rect.height - protectedTop - FOOTER_PX));
  ctx.clip();
  setupStrokeStyle(activeStroke);
  ctx.beginPath();
  const lp = pointToCss(lastPoint);
  ctx.moveTo(lp.x, lp.y);
  let accepted = 0;
  for (const sample of events) {
    if (sample.pointerId !== pointerId) continue;
    const point = normalizeEvent(sample);
    noteSampleGap(point);
    if (!pointAllowed(point)) continue;
    const dx = (point.x - lastPoint.x) * rect.width;
    const dy = (point.y - lastPoint.y) * rect.height;
    if ((dx * dx + dy * dy) < 0.01) continue;
    const cp = pointToCss(point);
    ctx.lineTo(cp.x, cp.y);
    activeStroke.points.push(point);
    lastPoint = point;
    accepted++;
  }
  if (accepted) ctx.stroke();
  ctx.restore();
  if (currentStrokeDiag) {
    currentStrokeDiag.samples += accepted;
    currentStrokeDiag.batches++;
    const drawMs = performance.now() - drawStart;
    currentStrokeDiag.maxDrawBatchMs = Math.max(currentStrokeDiag.maxDrawBatchMs, drawMs);
  }
}

function cancelPendingSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (idleHandle && 'cancelIdleCallback' in window) cancelIdleCallback(idleHandle);
  idleHandle = 0;
}

async function persistSnapshot(descriptor, pageStrokes, updateStatus = true, pageStyleSnapshot = pageStyle, pageImages = images) {
  let syncCommit = null;
  try {
    await openDb();
    const txStart = performance.now();
    storageBusy = true;
    syncCommit = syncFoundation?.prepareAtomicCommit(descriptor.key) ?? { events: [], eventIds: [], stateRow: null };
    const putStart = performance.now();
    const promise = putRecordWithSync({
      date: descriptor.key,
      kind: descriptor.kind === 'note' ? 'day-note-ink'
        : descriptor.kind === 'planner-daily' ? 'planner-day-ink'
        : descriptor.kind === 'planner-weekly' ? 'planner-week-ink'
        : descriptor.kind === 'planner-monthly' ? 'planner-month-ink'
        : descriptor.kind === 'planner-yearly' ? 'planner-year-ink'
        : descriptor.kind === 'planner-timetable' ? 'planner-timetable-ink'
        : 'agenda-day-ink',
      referenceDate: descriptor.date,
      plannerMode: descriptor.plannerMode ?? null,
      noteIndex: descriptor.kind === 'note' ? descriptor.noteIndex : 0,
      version: APP_VERSION,
      pipeline: 'coalesced-retina-storage-sync-v1',
      strokes: pageStrokes,
      images: (pageImages || []).map(cloneImageObject),
      pageStyle: normalizePageStyle(pageStyleSnapshot),
      modifiedAt: new Date().toISOString()
    }, syncCommit);
    const putCallMs = performance.now() - putStart;
    session.maxStorageCallMs = Math.max(session.maxStorageCallMs, putCallMs);
    await promise;
    const txMs = performance.now() - txStart;
    session.maxStorageTxMs = Math.max(session.maxStorageTxMs, txMs);
    if (syncCommit.eventIds?.length) syncFoundation?.markAtomicCommitSucceeded(syncCommit.eventIds, txMs);
    session.storageWrites++;
    if (updateStatus) statusLabel.textContent = 'salvato';
    return true;
  } catch (err) {
    session.storageErrors++;
    if (syncCommit?.eventIds?.length) syncFoundation?.markAtomicCommitFailed();
    if (updateStatus) statusLabel.textContent = 'errore salvataggio';
    console.warn('Persistenza reintegrazione non riuscita', err);
    return false;
  } finally {
    storageBusy = false;
  }
}

async function persistNow() {
  if (!ready || drawing || pageTurning) return;
  const descriptor = pageDescriptor();
  const saveKey = descriptor.key;
  const snapshot = strokes;
  const imageSnapshot = images;
  const ok = await persistSnapshot(descriptor, snapshot, true, pageStyle, imageSnapshot);
  if (ok && currentPageKey() === saveKey && strokes === snapshot) {
    dirty = false;
    scheduleCloudAuto('local-commit', 5000);
  }
}

function scheduleSave() {
  if (!ready) return;
  cancelPendingSave();
  statusLabel.textContent = 'da salvare';
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    const task = () => {
      idleHandle = 0;
      if (drawing) return scheduleSave();
      persistNow();
    };
    if ('requestIdleCallback' in window) idleHandle = requestIdleCallback(task, { timeout: 1800 });
    else task();
  }, SAVE_IDLE_MS);
}

function newStrokeDiag(ev, reason) {
  return {
    id: makeId(), reason, startedAt: performance.now(), pointerId: ev.pointerId, pointerType: ev.pointerType,
    samples: 1, batches: 0, maxSampleGapMs: 0, sampleGapsOver24: 0, sampleGapsOver40: 0,
    sampleGapsOver80: 0, maxHandlerGapMs: 0, maxDrawBatchMs: 0, maxRafGapMs: 0,
    endedBy: '', durationMs: 0, points: 1
  };
}

function startStroke(ev, reason = 'pointerdown') {
  if (!ready || pageTurning || activeTool === 'image') return false;
  if (saintDetailPanel && !saintDetailPanel.hidden) return false;
  if (historyDetailPanel && !historyDetailPanel.hidden) return false;
  if (weatherDetailPanel && !weatherDetailPanel.hidden) return false;
  if (ev.pointerType === 'touch') return false;
  if (ev.pointerType === 'mouse' && ev.button !== 0 && reason === 'pointerdown') return false;
  if (!pointInsideWritableArea(ev)) return false;

  if (drawing) {
    session.recoveredStaleDown++;
    finalizeStroke('stale-recovered-before-new-start');
  }

  // 0.1.33 LAN Transport: al PEN DOWN una eventuale richiesta di rete manuale
  // viene abortita. Nessuna logica LAN entra nel pointermove.
  lanTransport?.suspendForInk();
  cloudTransport?.suspendForInk();
  // 0.1.44: anche il recupero del santo è subordinato alla Pencil.
  // Se parte un tratto, una eventuale richiesta esterna viene interrotta.
  saintFetchController?.abort();
  saintBioFetchController?.abort();
  historyFetchController?.abort();
  historyDetailFetchController?.abort();
  weatherFetchController?.abort();
  weatherDetailFetchController?.abort();

  cancelPendingSave();
  if (storageBusy) session.strokesStartedWhileStorageBusy++;
  drawing = true;
  pointerId = ev.pointerId;
  rect = canvas.getBoundingClientRect();
  const point = normalizeEvent(ev);
  if (!pointAllowed(point)) {
    drawing = false;
    pointerId = null;
    lanTransport?.resumeAfterInk();
    cloudTransport?.resumeAfterInk();
    return false;
  }
  lastPoint = point;
  const style = toolStrokeStyle(activeTool);
  activeStroke = {
    id: makeId(), ...style, pointerType: ev.pointerType, points: [point]
  };
  currentStrokeDiag = newStrokeDiag(ev, reason);
  currentStrokeDiag.lastSampleTs = point.t;
  lastHandlerArrival = performance.now();
  drawDot(point);
  return true;
}

function recordStructuralEraseChanges(changes, reason = 'eraser') {
  const descriptor = pageDescriptor();
  for (const change of changes || []) {
    if (change?.original?.id) syncFoundation?.recordStrokeDeleted(descriptor, change.original.id, reason);
    for (const fragment of change?.fragments || []) {
      if (fragment?.id) syncFoundation?.recordStrokeAdded(descriptor, fragment);
    }
  }
}

function applyCompletedEraser(eraserStroke) {
  const eraseStarted = performance.now();
  const before = strokes;
  const result = structuralErase(before, eraserStroke, {
    widthPx: Math.max(1, rect?.width || canvas.clientWidth || 1024),
    heightPx: Math.max(1, rect?.height || canvas.clientHeight || 1366),
    makeFragmentId: () => makeId()
  });

  // La gomma realtime usa ancora destination-out esclusivamente per il feedback
  // immediato. A PEN UP lo stato persistente diventa strutturale: lo stroke gomma
  // non viene mai aggiunto alla pagina e non potrà cancellare stroke concorrenti futuri.
  strokes = result.strokes;
  renderAll();
  const eraseMs = performance.now() - eraseStarted;
  session.structuralErasures++;
  session.structuralEraseTouched += result.touched || 0;
  session.structuralEraseFragments += result.fragments || 0;
  session.maxStructuralEraseMs = Math.max(session.maxStructuralEraseMs, eraseMs);
  if (!result.changes.length) return false;

  rememberUndo({ type: 'erase-strokes', changes: result.changes });
  recordStructuralEraseChanges(result.changes, 'eraser-structural');
  return true;
}

function finalizeStroke(reason = 'pointerup') {
  if (!drawing) return;
  drawing = false;
  const completedStroke = activeStroke?.points?.length ? activeStroke : null;
  let pageChanged = false;
  if (completedStroke?.tool === 'eraser') {
    pageChanged = applyCompletedEraser(completedStroke);
  } else if (completedStroke) {
    strokes.push(completedStroke);
    rememberUndo({ type: 'add-stroke', stroke: completedStroke, index: strokes.length - 1 });
    syncFoundation?.recordStrokeAdded(pageDescriptor(), completedStroke);
    pageChanged = true;
  }
  if (currentStrokeDiag) {
    currentStrokeDiag.endedBy = reason;
    currentStrokeDiag.durationMs = performance.now() - currentStrokeDiag.startedAt;
    currentStrokeDiag.points = activeStroke?.points?.length ?? 0;
    delete currentStrokeDiag.lastSampleTs;
    completedDiagnostics.push(currentStrokeDiag);
    if (completedDiagnostics.length > 160) completedDiagnostics.shift();
    session.strokesCompleted++;
  }
  activeStroke = null;
  currentStrokeDiag = null;
  pointerId = null;
  lastPoint = null;
  lastHandlerArrival = 0;
  dirty = dirty || pageChanged;
  // 0.1.33: nessuna logica Sync entra in pointermove. Penna/evidenziatore
  // generano un solo ADD al PEN UP; la gomma genera DELETE + eventuali ADD
  // dei frammenti residui soltanto dopo la conclusione della passata.
  lanTransport?.resumeAfterInk();
  cloudTransport?.resumeAfterInk();
  if (!cachedSaintName(currentDate)) scheduleSaintRefresh(700);
  if (!cachedHistoryInfo(currentDate).text) scheduleHistoryRefresh(850);
  if (agendaDateEligibleForWeather(currentDate)) scheduleWeatherRefresh(1000);
  if (pageChanged) scheduleSave();
}

function isUiControlTarget(target) {
  return target instanceof Element && Boolean(target.closest('button, input, select, textarea, .style-panel, .shape-palette, .shape-overlay, .report-panel, .mini-calendar, .settings-panel, .saint-detail-panel, .history-detail-panel, .image-layer, .image-inspector'));
}

function getUiButtonTarget(target) {
  return target instanceof Element ? target.closest('button') : null;
}

function activateUiButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (button === undoButton && !undoHistory.length) return;
  if (button === redoButton && !redoHistory.length) return;
  if (button === imageToolButton) {
    activateImageTool();
    return;
  }
  if (button.matches('.tool-button[data-tool]')) {
    selectTool(button.dataset.tool);
    return;
  }
  if (button === undoButton) {
    undoLastModification();
    return;
  }
  if (button === redoButton) {
    redoLastModification();
    return;
  }
  if (button === calendarButton) {
    toggleCalendar();
    return;
  }
  if (button === styleButton) {
    toggleStylePanel();
    return;
  }
  if (button.matches('[data-shape-type]')) {
    setSelectedShapeType(button.dataset.shapeType);
    return;
  }
  if (button.matches('.planner-mode-button')) {
    switchPlannerMode(button.dataset.plannerMode);
    return;
  }
  if (button.matches('.color-swatch')) {
    setStyleColor(button.dataset.styleTool, button.dataset.styleColor?.toLowerCase());
    return;
  }
  if (button.matches('.width-choice')) {
    setStyleWidth(button.dataset.styleTool, button.dataset.styleWidth);
    return;
  }
  if (button.matches('.page-scope-choice')) {
    setPageStyleScope(button.dataset.pageScope);
    return;
  }
  if (button.matches('.page-color-choice')) {
    setPageColor(button.dataset.pageColor);
    return;
  }
  if (button.matches('.page-template-choice')) {
    setPageTemplate(button.dataset.pageTemplate);
    return;
  }
  if (button === importImageButton) { requestImageImport(); return; }
  if (button === cropImageButton) { void openImageCropEditor(); return; }
  if (button === cancelImageCropButton) { closeImageCropEditor('ritaglio annullato'); return; }
  if (button === applyImageCropButton) { void applyImageCrop(); return; }
  if (button === rotateImageLeftButton) { rotateSelectedImage(-15); return; }
  if (button === rotateImageRightButton) { rotateSelectedImage(15); return; }
  if (button === deleteImageButton) { deleteSelectedImage(); return; }
  // Gli altri pulsanti mantengono il comportamento nativo esistente.
}

function wasJustActivatedByPencil(button) {
  const at = recentPencilUiActivation.get(button);
  return Number.isFinite(at) && performance.now() - at < 650;
}

function handlePointerDown(ev) {
  // I controlli UI vengono gestiti da listener DIRETTI sui pulsanti.
  // Il motore Ink non deve mai interpretare un contatto nato sulla toolbar/pannelli.
  if (isUiControlTarget(ev.target)) return;
  // Un'applicazione esplicita a tutta l'agenda può aggiornare molti record IndexedDB.
  // Per pochi istanti non avviamo un nuovo tratto, evitando competizione con la transazione bulk.
  if (pageStyleBulkBusy) { ev.preventDefault(); return; }
  // 0.1.17: appena Apple Pencil torna sul foglio, il pannello Stile si richiude.
  // L'operazione avviene una sola volta al pointerdown e non entra nel loop di rendering Ink.
  if (ev.pointerType === 'pen' && paper?.contains(ev.target)) closeStylePanel();
  // La navigazione a dito usa i Touch Events nativi del foglio.
  // Su iPadOS questo percorso è più affidabile dei Pointer Events per gesture lunghe
  // e resta completamente separato dalla pipeline Apple Pencil.
  if (ev.pointerType === 'touch') return;
  if (ev.pointerType === 'pen') lastPenPointerDownAt = performance.now();
  session.totalPointerDown++;
  noteHandlerArrival();
  if (startStroke(ev, 'pointerdown')) ev.preventDefault();
}

function handlePointerMove(ev) {
  if (pencilUiPointers.has(ev.pointerId)) {
    ev.preventDefault();
    return;
  }
  if (isUiControlTarget(ev.target) && !drawing) return;
  if (ev.pointerType === 'touch') return;
  noteHandlerArrival();

  const penIsDown = ev.pointerType === 'pen' && (ev.pressure > 0 || (ev.buttons & 1) === 1);
  const mouseIsDown = ev.pointerType === 'mouse' && (ev.buttons & 1) === 1;

  if (!drawing) {
    if ((penIsDown || mouseIsDown) && pointInsideWritableArea(ev)) {
      session.recoveredMoveStart++;
      if (startStroke(ev, 'recovered-from-move')) ev.preventDefault();
    }
    return;
  }

  if (ev.pointerId !== pointerId) {
    if (penIsDown && pointInsideWritableArea(ev)) {
      session.recoveredPointerSwitch++;
      finalizeStroke('pointer-switch-recovery');
      if (startStroke(ev, 'recovered-pointer-switch')) ev.preventDefault();
    }
    return;
  }

  let events = [ev];
  if (typeof ev.getCoalescedEvents === 'function') {
    try {
      const coalesced = ev.getCoalescedEvents();
      if (coalesced?.length) events = coalesced;
    } catch {}
  }
  drawBatch(events);
  ev.preventDefault();
}

function handlePointerUp(ev) {
  const uiTap = pencilUiPointers.get(ev.pointerId);
  if (uiTap) {
    pencilUiPointers.delete(ev.pointerId);
    // Il comando è già stato applicato al pointerdown. Il pointerup serve solo
    // a chiudere la sequenza UI e non deve eseguire una seconda attivazione.
    ev.preventDefault();
    return;
  }
  if (ev.pointerType === 'touch') return;
  session.totalPointerUp++;
  noteHandlerArrival();
  if (!drawing || ev.pointerId !== pointerId) return;
  finalizeStroke('pointerup');
  ev.preventDefault();
}

function handlePointerCancel(ev) {
  if (pencilUiPointers.has(ev.pointerId)) {
    pencilUiPointers.delete(ev.pointerId);
    ev.preventDefault();
    return;
  }
  if (ev.pointerType === 'touch') return;
  session.totalPointerCancel++;
  noteHandlerArrival();
  if (!drawing || ev.pointerId !== pointerId) return;
  finalizeStroke('pointercancel');
  ev.preventDefault();
}

function markLag() {
  if (drawing) finalizeStroke('manual-lag-mark');
  lagMarks.push({ at: new Date().toISOString(), strokeIndex: completedDiagnostics.length, recent: completedDiagnostics.slice(-4) });
}

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function buildReport() {
  const recent = completedDiagnostics.slice(-24);
  return [
    `Agenda iPad CLOUD SYNC v${APP_VERSION}`,
    `Data pagina: ${currentDate}`,
    `Tipo pagina: ${currentPageKind === 'note' ? `Nota ${currentNoteIndex}/${currentNoteTotal}` : isPlannerKind() ? `Planner ${currentPlannerMode}` : 'Agenda'}`, 
    `Chiave pagina: ${currentPageKey()}`,
    `Sessione: ${session.startedAt}`,
    `Pipeline: Coalesced + Retina + Storage differito`,
    `Strumento attivo: ${activeTool}`,
    `Stile attivo: ${toolStyles[activeTool]?.color ?? 'n/a'} · ${toolStyles[activeTool]?.width ?? 'n/a'} px`,
    `Pagina: ${pageStyle.color} · ${pageStyle.template}`, 
    `Undo disponibili: ${undoHistory.length}/${UNDO_LIMIT}`,
    `Redo disponibili: ${redoHistory.length}/${REDO_LIMIT}`,
    `DPR canvas: ${fmt(dpr, 2)}`,
    `Tratti pagina: ${strokes.length}`,
    `Immagini pagina: ${images.length}`,
    `Immagini importate/trasformate/ritagliate/eliminate: ${session.imagesImported}/${session.imageTransforms}/${session.imageCrops}/${session.imagesDeleted}`, 
    `Tratti completati sessione: ${session.strokesCompleted}`,
    `Gomme strutturali/toccati/frammenti: ${session.structuralErasures}/${session.structuralEraseTouched}/${session.structuralEraseFragments}`,
    `Max conversione gomma a PEN UP: ${fmt(session.maxStructuralEraseMs, 2)} ms`,
    `pointerdown/up/cancel: ${session.totalPointerDown}/${session.totalPointerUp}/${session.totalPointerCancel}`,
    `Recovery stale-down: ${session.recoveredStaleDown}`,
    `Recovery da pointermove: ${session.recoveredMoveStart}`,
    `Recovery cambio pointerId: ${session.recoveredPointerSwitch}`,
    `Max gap handler: ${fmt(session.maxHandlerGapMs)} ms (>34 ms: ${session.handlerGapsOver34})`,
    `Max gap RAF: ${fmt(session.maxRafGapMs)} ms (>34: ${session.rafGapsOver34}, >60: ${session.rafGapsOver60})`,
    `Storage read/write/errori: ${session.storageReads}/${session.storageWrites}/${session.storageErrors}`,
    `Max put() call: ${fmt(session.maxStorageCallMs)} ms`,
    `Max transazione storage: ${fmt(session.maxStorageTxMs)} ms`,
    `Tratti iniziati mentre storage busy: ${session.strokesStartedWhileStorageBusy}`,
    `Cambi giorno completati/annullati: ${session.pageTurns}/${session.pageTurnCancels}`,
    `Cambi note completati: ${session.noteTurns}`,
    `Note create: ${session.notesCreated}`,
    `Sync protocol/schema: ${syncStats?.protocolVersion ?? 'n/a'}/${syncStats?.schemaVersion ?? 'n/a'}`,
    `Sync replica: ${syncStats?.replicaId ?? 'n/a'}`,
    `Sync eventi queued/persisted/errori: ${syncStats?.queued ?? 0}/${syncStats?.persisted ?? 0}/${syncStats?.persistErrors ?? 0}`,
    `Sync outbox memoria/persistita: ${syncStats?.memoryPending ?? 0}/${syncStats?.storedPending ?? 0}`,
    `Sync commit atomici: ${syncStats?.atomicCommits ?? 0}`,
    `Sync max queue call: ${fmt(syncStats?.maxQueueCallMs, 3)} ms`,
    `Sync max commit atomico: ${fmt(syncStats?.maxAtomicCommitMs, 2)} ms`,
    `Sync chiamate da pointermove: ${syncStats?.pointerMoveSyncCalls ?? 0}`,
    `Sync ultimo HLC: ${syncStats?.lastEventHlc || 'nessuno'}`,
    `CLOUD stato/gruppo: ${cloudStats?.state || 'n/a'} / ${cloudStats?.groupId || 'n/a'}`,
    `CLOUD push/pull/applicati: ${cloudStats?.pushed || 0}/${cloudStats?.pulled || 0}/${cloudStats?.applied || 0}`,
    `CLOUD cifrati up/down: ${cloudStats?.encryptedEventsUp || 0}/${cloudStats?.encryptedEventsDown || 0}`,
    `CLOUD blob up/down: ${cloudStats?.blobsUploaded || 0}/${cloudStats?.blobsDownloaded || 0}`,
    `CLOUD richieste/max: ${cloudStats?.networkRequests || 0}/${fmt(cloudStats?.maxRequestMs, 2)} ms`,
    `CLOUD auto run/interruzioni Ink: ${cloudStats?.autoRuns || 0}/${cloudStats?.inkInterruptions || 0}`,
    `LAN stato/hub: ${lanStats?.state || 'n/a'} / ${lanStats?.hubId || 'n/a'}`,
    `LAN push/pull/applicati: ${lanStats?.pushed || 0}/${lanStats?.pulled || 0}/${lanStats?.applied || 0}`,
    `LAN differiti/conflitti: ${lanStats?.deferred || 0}/${lanStats?.conflicts || 0}`,
    `LAN richieste/max: ${lanStats?.networkRequests || 0}/${fmt(lanStats?.maxRequestMs, 2)} ms`,
    `LAN blob up/down: ${lanStats?.blobsUploaded || 0}/${lanStats?.blobsDownloaded || 0}`,
    `LAN blob bytes up/down: ${lanStats?.blobBytesUploaded || 0}/${lanStats?.blobBytesDownloaded || 0}`,
    `LAN interruzioni per Ink: ${lanStats?.inkInterruptions || 0}`,
    `Lag segnalati: ${lagMarks.length}`,
    '',
    'ULTIMI TRATTI:',
    ...recent.map((d, i) => {
      const n = completedDiagnostics.length - recent.length + i + 1;
      return `#${n} ${d.reason}->${d.endedBy} dur=${fmt(d.durationMs)}ms punti=${d.points} campioni=${d.samples} maxSampleGap=${fmt(d.maxSampleGapMs)}ms >24/40/80=${d.sampleGapsOver24}/${d.sampleGapsOver40}/${d.sampleGapsOver80} maxHandler=${fmt(d.maxHandlerGapMs)}ms maxRAF=${fmt(d.maxRafGapMs)}ms drawMax=${fmt(d.maxDrawBatchMs, 2)}ms`;
    }),
    '',
    'LAG SEGNALATI:',
    ...(lagMarks.length ? lagMarks.map((m, i) => `L${i + 1} ${m.at} dopo tratto #${m.strokeIndex}`) : ['nessuno'])
  ].join('\n');
}

function showReport() {
  reportText.value = buildReport();
  reportPanel.hidden = false;
}

async function copyReport() {
  const text = buildReport();
  reportText.value = text;
  try {
    await navigator.clipboard.writeText(text);
    copyReportButton.textContent = 'COPIATO';
    setTimeout(() => { copyReportButton.textContent = 'COPIA REPORT'; }, 1200);
  } catch {
    reportText.focus();
    reportText.select();
  }
}

async function clearCurrentPage(options = {}) {
  if (denyMutationDuringSyncRecovery()) return false;
  const requireConfirmation = options?.requireConfirmation !== false;
  const reason = String(options?.reason || 'manual');
  if (drawing || !ready || eraserClearBusy) return false;
  if (!strokes.length && !images.length) {
    statusLabel.textContent = 'pagina già vuota';
    return false;
  }
  const label = currentPageKind === 'note' ? `Nota ${currentNoteIndex}/${currentNoteTotal}` : isPlannerKind() ? `Planner ${currentPlannerMode}${currentPlannerMode === 'daily' ? ' (indipendente da Agenda)' : ''}` : 'pagina Agenda';
  if (requireConfirmation && !window.confirm(`Cancellare soltanto ${label} del ${currentDate}?`)) return false;
  eraserClearBusy = true;
  cancelPendingSave();
  const clearedDescriptor = pageDescriptor();
  const removedStrokeIds = strokes.map((stroke) => stroke?.id).filter(Boolean);
  const removedImageIds = images.map((image) => image?.id).filter(Boolean);
  strokes = [];
  images = [];
  selectedImageId = null;
  resetUndoHistory();
  renderAll();
  renderImages();
  let clearCommit = null;
  try {
    await openDb();
    syncFoundation?.recordPageCleared(clearedDescriptor, removedStrokeIds, removedImageIds);
    clearCommit = syncFoundation?.prepareAtomicCommit(clearedDescriptor.key) ?? { events: [], eventIds: [], stateRow: null };
    const txStart = performance.now();
    await deleteRecordWithSync(clearedDescriptor.key, clearCommit);
    const txMs = performance.now() - txStart;
    if (clearCommit.eventIds?.length) syncFoundation?.markAtomicCommitSucceeded(clearCommit.eventIds, txMs);
    dirty = false;
    statusLabel.textContent = reason === 'eraser-triple-tap' ? 'pagina cancellata · triplo tap Gomma' : 'pagina vuota';
    return true;
  } catch (err) {
    if (clearCommit?.eventIds?.length) syncFoundation?.markAtomicCommitFailed();
    dirty = true;
    statusLabel.textContent = 'errore cancellazione';
    console.warn(err);
    return false;
  } finally {
    eraserClearBusy = false;
  }
}

function rafWatchdog(now) {
  const gap = now - rafPrev;
  rafPrev = now;
  if (drawing) {
    session.maxRafGapMs = Math.max(session.maxRafGapMs, gap);
    if (gap > 34) session.rafGapsOver34++;
    if (gap > 60) session.rafGapsOver60++;
    if (currentStrokeDiag) currentStrokeDiag.maxRafGapMs = Math.max(currentStrokeDiag.maxRafGapMs, gap);
  }
  requestAnimationFrame(rafWatchdog);
}

function removePreview() {
  if (previewPage?.isConnected) previewPage.remove();
  previewPage = null;
  paper.style.zIndex = '';
}

function drawPreviewInk(preview, previewStrokes) {
  const previewCanvas = preview.querySelector('canvas');
  const previewHeader = preview.querySelector('.page-header');
  const pr = preview.getBoundingClientRect();
  const hr = previewHeader.getBoundingClientRect();
  const pdpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  previewCanvas.width = Math.max(1, Math.round(pr.width * pdpr));
  previewCanvas.height = Math.max(1, Math.round(pr.height * pdpr));
  previewCanvas.style.width = `${pr.width}px`;
  previewCanvas.style.height = `${pr.height}px`;
  const pctx = previewCanvas.getContext('2d', { alpha: true, desynchronized: true });
  const pTop = Math.max(0, hr.bottom - pr.top);
  pctx.setTransform(pdpr, 0, 0, pdpr, 0, 0);
  for (const stroke of previewStrokes) {
    pctx.save();
    pctx.beginPath();
    pctx.rect(0, pTop, pr.width, Math.max(0, pr.height - pTop - FOOTER_PX));
    pctx.clip();
    if (isCrossPlatformTextItem(stroke)) {
      drawCrossPlatformText(stroke, pctx, pr.width, pr.height, preview.dataset.paperColor || pageStyle.color);
      pctx.restore();
      continue;
    }
    const points = stroke?.points ?? [];
    if (!points.length) { pctx.restore(); continue; }
    setupStoredStrokeStyle(stroke, pctx, preview.dataset.paperColor || pageStyle.color);
    const css = (pt) => ({ x: pt.x * pr.width, y: pt.y * pr.height });
    if (points.length === 1) {
      const q = css(points[0]);
      pctx.beginPath();
      pctx.arc(q.x, q.y, Math.max(.7, (stroke.width ?? PEN_WIDTH) / 2), 0, Math.PI * 2);
      pctx.fill();
    } else {
      let q = css(points[0]);
      pctx.beginPath();
      pctx.moveTo(q.x, q.y);
      for (let i = 1; i < points.length; i++) {
        q = css(points[i]);
        pctx.lineTo(q.x, q.y);
      }
      pctx.stroke();
    }
    pctx.restore();
  }
}

function footerTextFor(descriptor) {
  if (descriptor.kind === 'note') return `Note del giorno ${descriptor.noteIndex}/${Math.max(descriptor.noteIndex, descriptor.noteTotal)}`;
  if (isPlannerKind(descriptor.kind)) return `PLANNER · ${String(descriptor.plannerMode ?? 'daily').toUpperCase()}`;
  return 'AGENDA · ANTEPRIMA';
}

function createPreview(descriptor) {
  removePreview();
  const clone = paper.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.add('page-preview');
  clone.classList.remove('image-edit-mode');
  const previewInspector = clone.querySelector('.image-inspector');
  if (previewInspector) previewInspector.hidden = true;
  const previewImageLayer = clone.querySelector('.image-layer');
  if (previewImageLayer) previewImageLayer.replaceChildren();
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  clone.querySelectorAll('button').forEach((el) => { el.tabIndex = -1; });
  setHeaderFor(clone, descriptor.date, descriptor.kind, descriptor.noteIndex, descriptor.noteTotal);
  configurePageRoot(clone, descriptor);
  const footer = clone.querySelector('.baseline-footer');
  if (footer) {
    const author = footer.querySelector('.author-credits-button');
    const version = footer.querySelector('.footer-version-button, .version-button');
    if (author) author.textContent = '© Marco Zucchini';
    if (version) version.textContent = `V.${APP_VERSION}`;
    footer.querySelectorAll('button').forEach((button) => { button.disabled = true; button.setAttribute('aria-disabled', 'true'); });
  }
  const r = paper.getBoundingClientRect();
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: '0', zIndex: '1', pointerEvents: 'none'
  });
  paper.style.zIndex = '2';
  stage.appendChild(clone);
  previewPage = clone;
  return clone;
}

function sharesCurrentDailyInk(_descriptor) {
  // 0.1.66 — Agenda e Planner sono superfici indipendenti.
  // La funzione resta come guardia di compatibilità per non alterare la struttura
  // dello swipe, ma non condivide più stroke o immagini tra le due viste.
  return false;
}

async function loadPageForPreview(descriptor, preview) {
  if (sharesCurrentDailyInk(descriptor)) {
    const targetPage = { strokes, images, pageStyle: { ...pageStyle } };
    if (preview?.isConnected) {
      applyPageStyle(preview, targetPage.pageStyle);
      renderPreviewImages(preview, targetPage.images);
      drawPreviewInk(preview, targetPage.strokes);
    }
    return targetPage;
  }
  try {
    await openDb();
    const record = await getRecord(descriptor.key);
    session.storageReads++;
    const targetPage = {
      strokes: Array.isArray(record?.strokes) ? record.strokes : [],
      images: imagesFromRecord(record),
      pageStyle: descriptor.kind === 'planner-timetable'
        ? { color:'black', template:'blank' }
        : pageStyleFromRecord(record)
    };
    if (preview?.isConnected) {
      applyPageStyle(preview, targetPage.pageStyle);
      renderPreviewImages(preview, targetPage.images);
      drawPreviewInk(preview, targetPage.strokes);
    }
    return targetPage;
  } catch (err) {
    session.storageErrors++;
    console.warn('Anteprima pagina non disponibile', err);
    return { strokes: [], images: [], pageStyle: { ...globalPageStyle } };
  }
}

function resetTurnStyles() {
  paper.style.transition = '';
  paper.style.transform = '';
  paper.style.transformOrigin = '';
  paper.style.filter = '';
  paper.style.boxShadow = '';
  if (previewPage) {
    previewPage.style.transition = '';
    previewPage.style.transform = '';
    previewPage.style.filter = '';
  }
}

function horizontalTarget(direction) {
  if (currentPageKind === 'planner-timetable') {
    const nextIndex = currentTimetableIndex + direction;
    if (nextIndex < 1 || nextIndex > WEEKLY_TIMETABLE_MAX_PAGES) return null;
    return pageDescriptor(currentDate, 'planner-timetable', 0, 0, nextIndex);
  }
  if (isPlannerKind()) return null;
  const targetDate = addDays(currentDate, direction);
  if (!dateInRange(targetDate)) return null;
  return pageDescriptor(targetDate, 'agenda', 0, 0);
}

function verticalTarget(direction) {
  const count = notesCountCache.get(currentDate) ?? currentNoteTotal ?? 0;

  // 0.1.53 — Orario settimanale raggiungibile con swipe verso il basso
  // da qualsiasi modalità di Planning. Lo swipe inverso torna esattamente alla modalità di partenza.
  // direction -1 = swipe verso il basso; direction +1 = swipe verso l'alto.
  if (isPlannerKind() && currentPageKind !== 'planner-timetable' && direction < 0) {
    weeklyTimetableReturnDescriptor = pageDescriptor();
    return pageDescriptor(currentDate, 'planner-timetable', 0, 0, 1);
  }
  if (currentPageKind === 'planner-timetable' && direction > 0) {
    return isPlannerKind(weeklyTimetableReturnDescriptor?.kind) && weeklyTimetableReturnDescriptor.kind !== 'planner-timetable'
      ? { ...weeklyTimetableReturnDescriptor }
      : pageDescriptor(currentDate, 'planner-weekly', 0, 0);
  }

  // Gli altri Planner: swipe dal basso verso l'alto (direction +1) torna all'Agenda.
  if (isPlannerKind()) {
    return direction > 0 ? pageDescriptor(currentDate, 'agenda', 0, 0) : null;
  }

  // Agenda: swipe verso il basso apre sempre il Planner Giornaliero.
  if (currentPageKind === 'agenda' && direction < 0) {
    return pageDescriptor(currentDate, 'planner-daily', 0, 0);
  }

  // Note del giorno: swipe verso il basso torna alla nota precedente/Agenda.
  if (direction < 0) {
    if (currentPageKind === 'agenda') return null;
    if (currentNoteIndex <= 1) return pageDescriptor(currentDate, 'agenda', 0, 0);
    return pageDescriptor(currentDate, 'note', currentNoteIndex - 1, Math.max(count, currentNoteTotal));
  }

  // Agenda/Note: swipe verso l'alto apre o avanza nelle Note del giorno.
  const nextIndex = currentPageKind === 'agenda' ? 1 : currentNoteIndex + 1;
  const createNote = nextIndex > count;
  if (createNote && isSyncRestorePending()) return null;
  const total = createNote ? nextIndex : Math.max(count, currentNoteTotal);
  const target = pageDescriptor(currentDate, 'note', nextIndex, total);
  target.createNote = createNote;
  return target;
}

function applySwipeVisual(dx, dy) {
  if (!pageSwipe?.locked || !previewPage) return;
  if (pageSwipe.axis === 'x') {
    const width = pageSwipe.width;
    const direction = pageSwipe.direction;
    const signed = direction === 1 ? Math.min(0, dx) : Math.max(0, dx);
    const progress = Math.min(1, Math.abs(signed) / width);
    const angle = (direction === 1 ? -1 : 1) * 13 * progress;
    paper.style.transition = 'none';
    paper.style.transformOrigin = direction === 1 ? '0% 50%' : '100% 50%';
    paper.style.transform = `perspective(1500px) translateX(${signed * 0.94}px) rotateY(${angle}deg)`;
    paper.style.filter = `brightness(${1 - progress * 0.055})`;
    paper.style.boxShadow = `${direction === 1 ? 18 : -18}px 10px ${28 + progress * 18}px rgba(42,34,24,${0.16 + progress * .18})`;
    previewPage.style.transition = 'none';
    previewPage.style.transform = `translateX(${direction * 18 * (1 - progress)}px) scale(${0.992 + progress * .008})`;
    previewPage.style.filter = `brightness(${0.96 + progress * .04})`;
    return;
  }

  const height = pageSwipe.height;
  const direction = pageSwipe.direction; // +1 = nota successiva (swipe su), -1 = pagina precedente (swipe giù)
  const signed = direction === 1 ? Math.min(0, dy) : Math.max(0, dy);
  const progress = Math.min(1, Math.abs(signed) / height);
  const angle = (direction === 1 ? 1 : -1) * 7 * progress;
  paper.style.transition = 'none';
  paper.style.transformOrigin = direction === 1 ? '50% 0%' : '50% 100%';
  paper.style.transform = `perspective(1600px) translateY(${signed * 0.96}px) rotateX(${angle}deg)`;
  paper.style.filter = `brightness(${1 - progress * 0.045})`;
  paper.style.boxShadow = `0 ${direction === 1 ? 18 : -18}px ${28 + progress * 16}px rgba(42,34,24,${0.14 + progress * .16})`;
  previewPage.style.transition = 'none';
  previewPage.style.transform = `translateY(${direction * 16 * (1 - progress)}px) scale(${0.993 + progress * .007})`;
  previewPage.style.filter = `brightness(${0.965 + progress * .035})`;
}

function startPageSwipe(ev) {
  if (!ready || drawing || pageTurning || reportPanel.hidden === false) return;
  if (ev.target.closest?.('button')) return;
  if (!paper.contains(ev.target)) return;
  cancelPendingSave();
  const r = paper.getBoundingClientRect();
  pageSwipe = {
    pointerId: ev.pointerId,
    startX: ev.clientX, startY: ev.clientY, lastX: ev.clientX, lastY: ev.clientY,
    startedAt: performance.now(), lastAt: performance.now(), width: r.width, height: r.height,
    locked: false, axis: '', direction: 0, target: null, targetStrokes: null, previewPromise: null
  };
}

function movePageSwipe(ev) {
  if (!pageSwipe || ev.pointerId !== pageSwipe.pointerId || pageTurning) return;
  const dx = ev.clientX - pageSwipe.startX;
  const dy = ev.clientY - pageSwipe.startY;
  pageSwipe.lastX = ev.clientX;
  pageSwipe.lastY = ev.clientY;
  pageSwipe.lastAt = performance.now();

  if (!pageSwipe.locked) {
    if (Math.hypot(dx, dy) < 10) return;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < ay * .9 && ay < ax * 1.12) return;

    let axis = '';
    let direction = 0;
    let target = null;
    if (ax > ay * 1.12) {
      axis = 'x';
      direction = dx < 0 ? 1 : -1;
      target = horizontalTarget(direction);
    } else if (ay > ax * 1.12) {
      axis = 'y';
      direction = dy < 0 ? 1 : -1;
      target = verticalTarget(direction);
    } else {
      return;
    }

    if (!target) {
      pageSwipe = null;
      if (dirty) scheduleSave();
      return;
    }

    pageSwipe.locked = true;
    pageSwipe.axis = axis;
    pageSwipe.direction = direction;
    pageSwipe.target = target;
    const preview = createPreview(target);
    if (axis === 'x') {
      preview.style.transform = `translateX(${direction * 18}px) scale(.992)`;
    } else {
      preview.style.transform = `translateY(${direction * 16}px) scale(.993)`;
    }
    preview.style.filter = 'brightness(.96)';
    pageSwipe.previewPromise = loadPageForPreview(target, preview).then((targetPage) => {
      if (pageSwipe?.target?.key === target.key) pageSwipe.targetPage = targetPage;
      return targetPage;
    });
    if (axis === 'x') statusLabel.textContent = currentPageKind === 'planner-timetable'
      ? `Orario settimanale ${target.timetableIndex}/${WEEKLY_TIMETABLE_MAX_PAGES}`
      : (direction === 1 ? 'giorno successivo' : 'giorno precedente');
    else if (target.kind === 'agenda') statusLabel.textContent = 'torna ad Agenda';
    else if (target.kind === 'planner-daily') statusLabel.textContent = 'apri Planner giornaliero';
    else if (target.kind === 'planner-timetable') statusLabel.textContent = 'apri Orario settimanale';
    else if (target.kind === 'planner-weekly') statusLabel.textContent = 'torna al Planning settimanale';
    else statusLabel.textContent = `Nota ${target.noteIndex}/${target.noteTotal}`;
  }

  applySwipeVisual(dx, dy);
  ev.preventDefault();
}

async function switchPlannerMode(mode) {
  if (!PLANNER_MODES.includes(mode) || !isPlannerKind() || drawing || pageTurning || pageStyleBulkBusy) return;
  if (mode === currentPlannerMode) return;
  pageTurning = true;
  closeStylePanel();
  cancelPendingSave();
  const oldDescriptor = pageDescriptor();
  const saveOk = dirty ? await persistSnapshot(oldDescriptor, strokes, false, pageStyle, images) : true;
  if (!saveOk) {
    pageTurning = false;
    statusLabel.textContent = 'salvataggio non riuscito';
    if (dirty) scheduleSave();
    return;
  }
  const target = pageDescriptor(currentDate, plannerKind(mode), 0, 0);
  statusLabel.textContent = `apro Planner ${mode}`;
  try {
    await openDb();
    const record = await getRecord(target.key);
    session.storageReads++;
    currentPageKind = target.kind;
    currentPlannerMode = mode;
    currentNoteIndex = 0;
    currentNoteTotal = 0;
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    images = imagesFromRecord(record);
    selectedImageId = null;
    const previousPaperColor = pageStyle.color;
    pageStyle = pageStyleFromRecord(record);
    applyPageStyle();
    updatePageStyleUi();
    if (pageStyle.color !== previousPaperColor) applyToolDefaultsForPaper(pageStyle.color);
    resetUndoHistory();
    dirty = false;
    await migrateLegacyErasersOnCurrentPage();
    updateHeader();
    resizeCanvas();
    renderAll();
    renderImages();
    statusLabel.textContent = (strokes.length || images.length) ? `Planner ${mode} caricato` : `Planner ${mode}`;
  } catch (err) {
    session.storageErrors++;
    console.warn('Cambio modello Planner non riuscito', err);
    statusLabel.textContent = 'Planner non disponibile';
  } finally {
    pageTurning = false;
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cancelPageTurn() {
  if (!pageSwipe) return;
  session.pageTurnCancels++;
  pageTurning = true;
  const duration = pageSwipe.axis === 'y' ? 200 : 220;
  paper.style.transition = `transform ${duration}ms cubic-bezier(.22,.7,.22,1), filter ${duration}ms ease, box-shadow ${duration}ms ease`;
  paper.style.transform = 'perspective(1500px) translate3d(0,0,0) rotateX(0deg) rotateY(0deg)';
  paper.style.filter = 'brightness(1)';
  paper.style.boxShadow = '';
  if (previewPage) {
    previewPage.style.transition = `transform ${duration}ms cubic-bezier(.22,.7,.22,1), filter ${duration}ms ease`;
    if (pageSwipe.axis === 'x') previewPage.style.transform = `translateX(${pageSwipe.direction * 18}px) scale(.992)`;
    else previewPage.style.transform = `translateY(${pageSwipe.direction * 16}px) scale(.993)`;
    previewPage.style.filter = 'brightness(.96)';
  }
  await waitMs(duration + 10);
  resetTurnStyles();
  removePreview();
  pageSwipe = null;
  pageTurning = false;
  statusLabel.textContent = dirty ? 'da salvare' : 'salvato';
  if (dirty) scheduleSave();
}

async function commitPageTurn() {
  if (!pageSwipe?.locked || pageTurning) return;
  const swipe = pageSwipe;
  pageTurning = true;
  cancelPendingSave();
  const oldDescriptor = pageDescriptor();
  const oldStrokes = strokes;
  const oldImages = images;
  const oldPageStyle = { ...pageStyle };
  const target = swipe.target;
  const enteringTimetable = oldDescriptor.kind !== 'planner-timetable' && target.kind === 'planner-timetable';
  const targetPromise = swipe.previewPromise ?? Promise.resolve({ strokes: [], images: [], pageStyle: { ...globalPageStyle } });
  const savePromise = dirty ? persistSnapshot(oldDescriptor, oldStrokes, false, oldPageStyle, oldImages) : Promise.resolve(true);
  const metaPromise = target.createNote ? persistNotesCount(target.date, target.noteTotal) : Promise.resolve(true);
  const duration = swipe.axis === 'y' ? NOTE_TURN_MS : PAGE_TURN_MS;

  if (swipe.axis === 'x') {
    const finalX = swipe.direction === 1 ? -swipe.width * 1.02 : swipe.width * 1.02;
    const finalAngle = swipe.direction === 1 ? -18 : 18;
    paper.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1), filter ${duration}ms ease, box-shadow ${duration}ms ease`;
    paper.style.transform = `perspective(1500px) translateX(${finalX}px) rotateY(${finalAngle}deg)`;
  } else {
    const finalY = swipe.direction === 1 ? -swipe.height * 1.02 : swipe.height * 1.02;
    const finalAngle = swipe.direction === 1 ? 9 : -9;
    paper.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1), filter ${duration}ms ease, box-shadow ${duration}ms ease`;
    paper.style.transform = `perspective(1600px) translateY(${finalY}px) rotateX(${finalAngle}deg)`;
  }
  paper.style.filter = 'brightness(.91)';
  if (previewPage) {
    previewPage.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1), filter ${duration}ms ease`;
    previewPage.style.transform = swipe.axis === 'x' ? 'translateX(0) scale(1)' : 'translateY(0) scale(1)';
    previewPage.style.filter = 'brightness(1)';
  }

  const [targetPage, , saveOk, metaOk] = await Promise.all([
    targetPromise, waitMs(duration + 20), savePromise, metaPromise
  ]);
  if ((dirty && !saveOk) || !metaOk) {
    resetTurnStyles();
    removePreview();
    pageSwipe = null;
    pageTurning = false;
    statusLabel.textContent = !metaOk ? 'creazione nota non riuscita' : 'salvataggio non riuscito';
    if (dirty) scheduleSave();
    return;
  }

  currentDate = target.date;
  if (target.kind === 'agenda') calendarViewDate = target.date;
  currentPageKind = target.kind;
  currentPlannerMode = isPlannerKind(target.kind) ? (target.plannerMode ?? plannerModeFromKind(target.kind) ?? 'daily') : currentPlannerMode;
  currentTimetableIndex = target.kind === 'planner-timetable' ? (Number(target.timetableIndex) || 1) : currentTimetableIndex;
  if (enteringTimetable) activeTool = 'pen';
  if (enteringTimetable) {
    cancelShapeGesture();
    if (shapePalette) shapePalette.hidden = true;
    shapeOverlay?.setAttribute('hidden', '');
    shapeToolButton?.setAttribute('aria-expanded', 'false');
    paper?.classList.remove('shape-mode');
  }
  currentNoteIndex = target.kind === 'note' ? target.noteIndex : 0;
  currentNoteTotal = target.kind === 'note' ? target.noteTotal : 0;
  strokes = Array.isArray(targetPage?.strokes) ? targetPage.strokes : [];
  images = Array.isArray(targetPage?.images) ? targetPage.images.map(normalizeImageObject).filter(Boolean) : [];
  selectedImageId = null;
  const previousPaperColor = pageStyle.color;
  pageStyle = target.kind === 'planner-timetable'
    ? normalizePageStyle({ color:'black', template:'blank' })
    : normalizePageStyle(targetPage?.pageStyle ?? globalPageStyle);
  applyPageStyle();
  updatePageStyleUi();
  if (pageStyle.color !== previousPaperColor) applyToolDefaultsForPaper(pageStyle.color);
  resetUndoHistory();
  dirty = false;
  await migrateLegacyErasersOnCurrentPage();
  if (target.createNote) session.notesCreated++;
  updateHeader();
  updateToolUi();
  updateStyleUi();

  paper.style.visibility = 'hidden';
  resetTurnStyles();
  renderAll();
  renderImages();
  paper.style.visibility = 'visible';
  await new Promise((resolve) => requestAnimationFrame(resolve));
  removePreview();
  pageSwipe = null;
  if (swipe.axis === 'x') {
    session.pageTurns++;
    await ensureNotesCount(currentDate);
  } else {
    session.noteTurns++;
  }
  pageTurning = false;
  statusLabel.textContent = (strokes.length || images.length) ? 'pagina caricata' : (currentPageKind === 'note' ? 'nota nuova' : isPlannerKind() ? `planner ${currentPlannerMode}` : 'pagina nuova');
}

function endPageSwipe(ev, cancelled = false) {
  if (!pageSwipe || ev.pointerId !== pageSwipe.pointerId || pageTurning) return;
  if (!pageSwipe.locked) {
    pageSwipe = null;
    if (dirty) scheduleSave();
    return;
  }
  const delta = pageSwipe.axis === 'x'
    ? pageSwipe.lastX - pageSwipe.startX
    : pageSwipe.lastY - pageSwipe.startY;
  const span = pageSwipe.axis === 'x' ? pageSwipe.width : pageSwipe.height;
  const elapsed = Math.max(1, pageSwipe.lastAt - pageSwipe.startedAt);
  const velocity = Math.abs(delta) / elapsed;
  const openingPlanner = pageSwipe.axis === 'y'
    && currentPageKind === 'agenda'
    && pageSwipe.target?.kind === 'planner-daily'
    && pageSwipe.direction < 0;
  // Agenda → Planner deve reagire a un trascinamento naturale verso il basso:
  // soglia più bassa del normale cambio pagina, senza modificare gli altri gesture.
  const threshold = pageSwipe.axis === 'x' ? .18 : (openingPlanner ? .075 : .14);
  const velocityThreshold = pageSwipe.axis === 'x' ? .58 : (openingPlanner ? .34 : .52);
  const commit = !cancelled && (Math.abs(delta) >= span * threshold || velocity >= velocityThreshold);
  if (commit) commitPageTurn();
  else cancelPageTurn();
}


// 0.1.21a — gesture pagina affidate ai Touch Events nativi per il dito.
// La Pencil continua a usare esclusivamente Pointer Events. Questo evita che Safari/iPadOS
// perda o interrompa una sequenza verticale prima che il Planner venga agganciato.
function findNativeTouch(list, identifier) {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === identifier) return list[i];
  }
  return null;
}

function nativeTouchProxy(touch, originalEvent) {
  return {
    pointerId: NATIVE_TOUCH_POINTER_ID,
    pointerType: 'touch',
    clientX: touch.clientX,
    clientY: touch.clientY,
    target: originalEvent.target,
    preventDefault: () => originalEvent.preventDefault()
  };
}

function handlePaperTouchStart(ev) {
  if (activeTool === 'shape') { ev.preventDefault(); return; }
  if (!ready || drawing || pageTurning || pageStyleBulkBusy || reportPanel.hidden === false) return;
  if (ev.touches.length !== 1) return;
  if (isUiControlTarget(ev.target)) return;
  if (!paper.contains(ev.target)) return;

  // Protezione: se iPadOS producesse anche un touch compatibility-event subito dopo
  // Apple Pencil, non deve mai essere interpretato come gesto di navigazione.
  if (performance.now() - lastPenPointerDownAt < 120) return;

  const touch = ev.touches[0];
  nativeTouchGestureId = touch.identifier;
  startPageSwipe(nativeTouchProxy(touch, ev));
  if (pageSwipe) pageSwipe.nativeTouch = true;
}

function handlePaperTouchMove(ev) {
  if (nativeTouchGestureId == null || !pageSwipe || !pageSwipe.nativeTouch || pageTurning) return;
  const touch = findNativeTouch(ev.touches, nativeTouchGestureId);
  if (!touch) return;
  movePageSwipe(nativeTouchProxy(touch, ev));
  if (pageSwipe?.locked) ev.preventDefault();
}

function handlePaperTouchEnd(ev, cancelled = false) {
  if (nativeTouchGestureId == null) return;
  const ended = findNativeTouch(ev.changedTouches, nativeTouchGestureId);
  if (!ended && !cancelled) return;
  nativeTouchGestureId = null;
  if (!pageSwipe?.nativeTouch) return;
  const wasSwipeLocked = Boolean(pageSwipe.locked);
  const tapTarget = ev.target;
  const tapX = ended?.clientX ?? 0;
  const tapY = ended?.clientY ?? 0;
  endPageSwipe({ pointerId: NATIVE_TOUCH_POINTER_ID }, cancelled);
  if (!cancelled && !wasSwipeLocked) registerPageDoubleTap(tapTarget, tapX, tapY);
  ev.preventDefault();
}

// 0.1.17 — attivazione UI indipendente dalla pipeline Ink.
// Apple Pencil su iPadOS può essere esposta come `pen` oppure, in alcuni percorsi
// di compatibilità, arrivare come touch. Per questo tutti i pointer NON-mouse sui
// pulsanti vengono attivati direttamente al pointerdown. `touchstart` resta come
// fallback estremo nel caso in cui Safari non produca Pointer Events completi.
function activateUiFromDirectContact(button, ev, source = 'pointerdown') {
  if (!(button instanceof HTMLButtonElement)) return;
  const now = performance.now();
  const previous = recentPencilUiActivation.get(button);
  if (Number.isFinite(previous) && now - previous < 120) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    return;
  }

  // Se Safari ha perso il pointerup dell'ultimo tratto, non lasciamo che lo stato
  // `drawing=true` renda inerti tutti i pulsanti della toolbar.
  if (drawing) finalizeStroke(`ui-${source}-recovery`);

  recentPencilUiActivation.set(button, now);
  activateUiButton(button);
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
}

function registerEraserTriplePenTap(button, ev) {
  if (button !== eraserToolButton || ev?.pointerType !== 'pen') return false;
  const now = performance.now();
  const key = currentPageKey();
  if (eraserPenTapPageKey !== key) {
    eraserPenTapPageKey = key;
    eraserPenTapTimes = [];
  }
  const last = eraserPenTapTimes.at(-1);
  // Scarta eventuali pointerdown duplicati generati dalla compatibilità Safari.
  if (Number.isFinite(last) && now - last < ERASER_TRIPLE_TAP_MIN_INTERVAL_MS) return false;
  eraserPenTapTimes = eraserPenTapTimes.filter((at) => now - at <= ERASER_TRIPLE_TAP_WINDOW_MS);
  eraserPenTapTimes.push(now);
  if (eraserPenTapTimes.length < 3) return false;
  eraserPenTapTimes = [];
  eraserPenTapPageKey = '';
  void clearCurrentPage({ requireConfirmation: false, reason: 'eraser-triple-tap' });
  return true;
}

function bindDirectUiButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;

  button.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    pencilUiPointers.set(ev.pointerId, { button, startedAt: performance.now() });
    registerEraserTriplePenTap(button, ev);
    activateUiFromDirectContact(button, ev, `pointerdown-${ev.pointerType || 'unknown'}`);
  }, { passive: false });

  button.addEventListener('pointerup', (ev) => {
    if (!pencilUiPointers.has(ev.pointerId)) return;
    pencilUiPointers.delete(ev.pointerId);
    ev.preventDefault();
    ev.stopPropagation();
  }, { passive: false });

  button.addEventListener('pointercancel', (ev) => {
    if (!pencilUiPointers.has(ev.pointerId)) return;
    pencilUiPointers.delete(ev.pointerId);
    ev.preventDefault();
    ev.stopPropagation();
  }, { passive: false });

  button.addEventListener('touchstart', (ev) => {
    activateUiFromDirectContact(button, ev, 'touchstart-fallback');
  }, { passive: false });
}

const directUiButtons = [...new Set([
  calendarButton,
  ...toolButtons,
  ...shapeChoiceButtons,
  undoButton,
  redoButton,
  styleButton,
  ...plannerModeButtons,
  importImageButton, cropImageButton, rotateImageLeftButton, rotateImageRightButton, deleteImageButton,
  cancelImageCropButton, applyImageCropButton
].filter(Boolean))];
for (const button of directUiButtons) bindDirectUiButton(button);

// 0.1.19 — gestione delegata del pannello Stile. Pencil e dito applicano
// l'opzione al pointerdown, risalendo dal target interno al relativo button.
function handleStylePanelDirectPointer(ev) {
  if (ev.pointerType === 'mouse') return;
  const button = getUiButtonTarget(ev.target);
  if (!button || !stylePanel?.contains(button)) return;
  if (drawing) finalizeStroke(`style-panel-${ev.pointerType || 'pointer'}-recovery`);
  recentPencilUiActivation.set(button, performance.now());
  activateUiButton(button);
  ev.preventDefault();
  ev.stopPropagation();
}

function handleStylePanelTouchFallback(ev) {
  const button = getUiButtonTarget(ev.target);
  if (!button || !stylePanel?.contains(button)) return;
  const previous = recentPencilUiActivation.get(button);
  if (Number.isFinite(previous) && performance.now() - previous < 180) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  if (drawing) finalizeStroke('style-panel-touchstart-recovery');
  recentPencilUiActivation.set(button, performance.now());
  activateUiButton(button);
  ev.preventDefault();
  ev.stopPropagation();
}

function handleMiniCalendarDirectPointer(ev) {
  if (ev.pointerType === 'mouse') return;
  const button = getUiButtonTarget(ev.target);
  if (!button || !miniCalendar?.contains(button) || button.disabled) return;
  if (drawing) finalizeStroke(`calendar-${ev.pointerType || 'pointer'}-recovery`);
  recentPencilUiActivation.set(button, performance.now());
  if (handleCalendarCommand(button)) {
    ev.preventDefault();
    ev.stopPropagation();
  }
}

function handleMiniCalendarTouchFallback(ev) {
  const button = getUiButtonTarget(ev.target);
  if (!button || !miniCalendar?.contains(button) || button.disabled) return;
  const previous = recentPencilUiActivation.get(button);
  if (Number.isFinite(previous) && performance.now() - previous < 180) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  if (handleCalendarCommand(button)) {
    recentPencilUiActivation.set(button, performance.now());
    ev.preventDefault();
    ev.stopPropagation();
  }
}

miniCalendar?.addEventListener('pointerdown', handleMiniCalendarDirectPointer, { passive: false, capture: true });
miniCalendar?.addEventListener('touchstart', handleMiniCalendarTouchFallback, { passive: false, capture: true });
miniCalendar?.addEventListener('click', (ev) => {
  const button = getUiButtonTarget(ev.target);
  if (!button || !miniCalendar.contains(button) || button.disabled) return;
  if (wasJustActivatedByPencil(button)) return;
  if (handleCalendarCommand(button)) {
    ev.preventDefault();
    ev.stopPropagation();
  }
});

stylePanel?.addEventListener('pointerdown', handleStylePanelDirectPointer, { passive: false, capture: true });
stylePanel?.addEventListener('touchstart', handleStylePanelTouchFallback, { passive: false, capture: true });
initializeShapePaletteIcons();

// 0.1.47 — router globale condiviso: il motore Ink Agenda resta byte-per-byte invariato.
// 0.1.50 — Orario settimanale = normale pagina Planner.
// Nessun router Ink dedicato: tutti i Pointer Events passano dagli stessi handler core dell'Agenda.
function routeGlobalPointerDown(ev) {
  if (isSyncRestorePending() && !isUiControlTarget(ev.target) && ev.pointerType !== 'touch') {
    denyMutationDuringSyncRecovery();
    ev.preventDefault();
    return;
  }
  handlePointerDown(ev);
}
function routeGlobalPointerMove(ev) {
  if (isSyncRestorePending() && ev.pointerType !== 'touch' && !drawing) {
    ev.preventDefault();
    return;
  }
  handlePointerMove(ev);
}
function routeGlobalPointerUp(ev) { handlePointerUp(ev); }
function routeGlobalPointerCancel(ev) { handlePointerCancel(ev); }

paper.addEventListener('touchstart', handlePaperTouchStart, { passive: false, capture: true });
paper.addEventListener('touchmove', handlePaperTouchMove, { passive: false, capture: true });
paper.addEventListener('touchend', (ev) => handlePaperTouchEnd(ev, false), { passive: false, capture: true });
paper.addEventListener('touchcancel', (ev) => handlePaperTouchEnd(ev, true), { passive: false, capture: true });

window.addEventListener('pointerdown', routeGlobalPointerDown, { passive: false, capture: true });
window.addEventListener('pointermove', routeGlobalPointerMove, { passive: false, capture: true });
window.addEventListener('pointerup', routeGlobalPointerUp, { passive: false, capture: true });
window.addEventListener('pointercancel', routeGlobalPointerCancel, { passive: false, capture: true });

document.addEventListener('touchmove', (ev) => {
  if (ev.target instanceof Element && ev.target.closest('.settings-scroll, .saint-detail-body, .history-detail-body')) return;
  ev.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('gestureend', (ev) => ev.preventDefault(), { passive: false });

function activateWeatherDetailsFromPen(ev) {
  if (ev.pointerType !== 'pen' || weatherBadge?.hidden) return;
  void openWeatherDetails();
  ev.preventDefault();
  ev.stopPropagation();
}
weatherBadge?.addEventListener('pointerup', activateWeatherDetailsFromPen, { passive:false });
weatherBadge?.addEventListener('click', () => { if (!weatherBadge.hidden) void openWeatherDetails(); });
closeWeatherDetailButton?.addEventListener('pointerup', (ev) => {
  if (ev.pointerType !== 'pen') return;
  closeWeatherDetails(); ev.preventDefault(); ev.stopPropagation();
}, { passive:false });
closeWeatherDetailButton?.addEventListener('click', closeWeatherDetails);
weatherDetailPanel?.addEventListener('click', (ev) => { if (ev.target === weatherDetailPanel) closeWeatherDetails(); });

function activateSaintDetailsFromPen(ev) {
  if (ev.pointerType !== 'pen' || saintNameButton?.disabled) return;
  void openSaintDetails();
  ev.preventDefault();
  ev.stopPropagation();
}
saintNameButton?.addEventListener('pointerup', activateSaintDetailsFromPen, { passive:false });
saintNameButton?.addEventListener('click', () => { if (!saintNameButton.disabled) void openSaintDetails(); });
closeSaintDetailButton?.addEventListener('pointerup', (ev) => {
  if (ev.pointerType !== 'pen') return;
  closeSaintDetails(); ev.preventDefault(); ev.stopPropagation();
}, { passive:false });
closeSaintDetailButton?.addEventListener('click', closeSaintDetails);
saintDetailPanel?.addEventListener('click', (ev) => { if (ev.target === saintDetailPanel) closeSaintDetails(); });

function activateHistoryDetailsFromPen(ev) {
  if (ev.pointerType !== 'pen' || historyEventButton?.disabled) return;
  void openHistoryDetails();
  ev.preventDefault();
  ev.stopPropagation();
}
historyEventButton?.addEventListener('pointerup', activateHistoryDetailsFromPen, { passive:false });
historyEventButton?.addEventListener('click', () => { if (!historyEventButton.disabled) void openHistoryDetails(); });
closeHistoryDetailButton?.addEventListener('pointerup', (ev) => {
  if (ev.pointerType !== 'pen') return;
  closeHistoryDetails(); ev.preventDefault(); ev.stopPropagation();
}, { passive:false });
closeHistoryDetailButton?.addEventListener('click', closeHistoryDetails);
historyDetailPanel?.addEventListener('click', (ev) => { if (ev.target === historyDetailPanel) closeHistoryDetails(); });


paper?.addEventListener('dblclick', (ev) => {
  if (!(ev.target instanceof Element) || isUiControlTarget(ev.target)) return;
  ev.preventDefault();
  ev.stopPropagation();
  // 0.1.50 — doppio clic/tap sempre riservato alla copertina privacy.
  // L'Orario settimanale si apre soltanto con swipe verso il basso dal Planning settimanale.
  if (currentPageKind === 'agenda' || currentPageKind === 'note' || isPlannerKind(currentPageKind)) showIdleCover(true);
});

// Crediti dal footer + copertina privacy automatica e su doppio tap pagina.
// 0.1.45 — Crediti richiamabili dal nome autore e copertina privacy dopo 2 minuti di inattività.
const IDLE_COVER_MS = 2 * 60 * 1000;
let idleCoverTimer = 0;
let lastUserActivityAt = Date.now();
let lastAuthorPenActivationAt = -Infinity;

function showInfoCredits() {
  if (!infoCreditsOverlay) return;
  infoCreditsOverlay.hidden = false;
}

function hideInfoCredits(ev) {
  if (!infoCreditsOverlay || infoCreditsOverlay.hidden) return;
  infoCreditsOverlay.hidden = true;
  if (ev) { ev.preventDefault?.(); ev.stopPropagation?.(); }
  registerUserActivity();
}

function activateAuthorCreditsWithPen(ev) {
  if (ev.pointerType !== 'pen') return;
  lastAuthorPenActivationAt = performance.now();
  showInfoCredits();
  registerUserActivity();
  ev.preventDefault();
  ev.stopPropagation();
}

function clearIdleCoverTimer() {
  if (idleCoverTimer) window.clearTimeout(idleCoverTimer);
  idleCoverTimer = 0;
}

function scheduleIdleCover(delay = IDLE_COVER_MS) {
  clearIdleCoverTimer();
  if (startup.phase !== 'done' || document.visibilityState !== 'visible' || !idleCoverOverlay?.hidden) return;
  idleCoverTimer = window.setTimeout(showIdleCover, Math.max(250, delay));
}

function showIdleCover(manual = false) {
  clearIdleCoverTimer();
  if (startup.phase !== 'done' || document.visibilityState !== 'visible') return;
  if (!manual && (drawing || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture))) {
    lastUserActivityAt = Date.now();
    scheduleIdleCover();
    return;
  }
  if (dirty) void persistNow();
  closeStylePanel();
  if (infoCreditsOverlay && !infoCreditsOverlay.hidden) infoCreditsOverlay.hidden = true;
  idleCoverOverlay.hidden = false;
}

function dismissIdleCover(ev) {
  if (!idleCoverOverlay || idleCoverOverlay.hidden) return;
  idleCoverOverlay.hidden = true;
  lastUserActivityAt = Date.now();
  scheduleIdleCover();
  if (ev) { ev.preventDefault?.(); ev.stopPropagation?.(); }
}

function registerUserActivity() {
  if (startup.phase !== 'done') return;
  lastUserActivityAt = Date.now();
  if (idleCoverOverlay && !idleCoverOverlay.hidden) return;
  scheduleIdleCover();
}

authorCreditsButton?.addEventListener('pointerup', activateAuthorCreditsWithPen, { passive:false });
authorCreditsButton?.addEventListener('click', (ev) => {
  if (performance.now() - lastAuthorPenActivationAt < 700) { ev.preventDefault(); return; }
  showInfoCredits();
  registerUserActivity();
});
infoCreditsOverlay?.addEventListener('pointerup', (ev) => {
  if (ev.pointerType === 'pen') hideInfoCredits(ev);
}, { passive:false });
infoCreditsOverlay?.addEventListener('click', hideInfoCredits);
idleCoverOverlay?.addEventListener('pointerup', dismissIdleCover, { passive:false });
idleCoverOverlay?.addEventListener('click', dismissIdleCover);

window.addEventListener('pointerdown', () => registerUserActivity(), { capture:true, passive:true });
window.addEventListener('keydown', () => registerUserActivity(), { capture:true, passive:true });
document.addEventListener('input', () => registerUserActivity(), { capture:true, passive:true });
document.addEventListener('visibilitychange', () => {
  if (startup.phase !== 'done') return;
  if (document.visibilityState !== 'visible') { clearIdleCoverTimer(); return; }
  const elapsed = Date.now() - lastUserActivityAt;
  if (elapsed >= IDLE_COVER_MS) showIdleCover();
  else scheduleIdleCover(IDLE_COVER_MS - elapsed);
});

versionButton.addEventListener('click', showReport);
markLagButton.addEventListener('click', markLag);
copyReportButton.addEventListener('click', copyReport);
closeReportButton.addEventListener('click', () => { reportPanel.hidden = true; });
clearPageButton.addEventListener('click', clearCurrentPage);


for (const button of toolButtons) {
  button.addEventListener('click', () => {
    if (wasJustActivatedByPencil(button)) return;
    if (button === imageToolButton) activateImageTool();
    else selectTool(button.dataset.tool);
  });
}
undoButton?.addEventListener('click', () => {
  if (wasJustActivatedByPencil(undoButton)) return;
  undoLastModification();
});
redoButton?.addEventListener('click', () => {
  if (wasJustActivatedByPencil(redoButton)) return;
  redoLastModification();
});
for (const button of shapeChoiceButtons) {
  button.addEventListener('click', () => {
    if (wasJustActivatedByPencil(button)) return;
    setSelectedShapeType(button.dataset.shapeType);
  });
}
calendarButton?.addEventListener('click', () => {
  if (wasJustActivatedByPencil(calendarButton)) return;
  toggleCalendar();
});
styleButton?.addEventListener('click', () => {
  if (wasJustActivatedByPencil(styleButton)) return;
  toggleStylePanel();
});
for (const button of plannerModeButtons) {
  button.addEventListener('click', () => {
    if (wasJustActivatedByPencil(button)) return;
    switchPlannerMode(button.dataset.plannerMode);
  });
}
importImageButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(importImageButton)) requestImageImport(); });
cropImageButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(cropImageButton)) void openImageCropEditor(); });
cancelImageCropButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(cancelImageCropButton)) closeImageCropEditor('ritaglio annullato'); });
applyImageCropButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(applyImageCropButton)) void applyImageCrop(); });
rotateImageLeftButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(rotateImageLeftButton)) rotateSelectedImage(-15); });
rotateImageRightButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(rotateImageRightButton)) rotateSelectedImage(15); });
deleteImageButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(deleteImageButton)) deleteSelectedImage(); });
imageFileInput?.addEventListener('change', () => {
  const file = imageFileInput.files?.[0];
  imageFileInput.value = '';
  if (file) void importImageFile(file);
});

// 0.1.37 — i comandi nelle Impostazioni non usano il pointerdown della toolbar Ink.
// Dito/mouse: click nativo. Apple Pencil: pointerup.
const settingsCommandPenActivation = new WeakMap();
function bindSettingsCommand(button, action) {
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('pointerup', (ev) => {
    if (ev.pointerType !== 'pen') return;
    settingsCommandPenActivation.set(button, performance.now());
    action();
    ev.preventDefault();
    ev.stopPropagation();
  }, { passive: false });
  button.addEventListener('click', (ev) => {
    const lastPen = settingsCommandPenActivation.get(button);
    if (Number.isFinite(lastPen) && performance.now() - lastPen < 700) { ev.preventDefault(); return; }
    action();
  });
}

bindSettingsCommand(lanTestButton, () => void handleLanTest());
bindSettingsCommand(cloudCreateGroupButton, () => void handleCloudCreateGroup());
bindSettingsCommand(cloudCopyJoinCodeButton, () => void handleCloudCopyJoinCode());
bindSettingsCommand(cloudSelectJoinCodeButton, () => handleCloudSelectJoinCode());
bindSettingsCommand(cloudRecoverJoinCodeButton, () => void handleCloudRecoverSavedJoinCode());
bindSettingsCommand(cloudTestButton, () => void handleCloudTest());
bindSettingsCommand(cloudSyncNowButton, () => void handleCloudSyncNow());
bindSettingsCommand(lanSyncNowButton, () => void handleLanSyncNow());

shapeOverlay?.addEventListener('pointerdown', beginShapeGesture, { passive: false });
shapeOverlay?.addEventListener('pointermove', moveShapeGesture, { passive: false });
shapeOverlay?.addEventListener('pointerup', (ev) => endShapeGesture(ev, false), { passive: false });
shapeOverlay?.addEventListener('pointercancel', (ev) => endShapeGesture(ev, true), { passive: false });

imageLayer?.addEventListener('pointerdown', beginImageGesture, { passive: false });
imageLayer?.addEventListener('pointermove', moveImageGesture, { passive: false });
imageLayer?.addEventListener('pointerup', (ev) => endImageGesture(ev, false), { passive: false });
imageLayer?.addEventListener('pointercancel', (ev) => endImageGesture(ev, true), { passive: false });

imageCropSelection?.addEventListener('pointerdown', beginImageCropGesture, { passive: false });
imageCropSelection?.addEventListener('pointermove', moveImageCropGesture, { passive: false });
imageCropSelection?.addEventListener('pointerup', endImageCropGesture, { passive: false });
imageCropSelection?.addEventListener('pointercancel', endImageCropGesture, { passive: false });

for (const swatch of colorSwatches) {
  swatch.addEventListener('click', () => {
    if (wasJustActivatedByPencil(swatch)) return;
    setStyleColor(swatch.dataset.styleTool, swatch.dataset.styleColor?.toLowerCase());
  });
}
for (const choice of widthChoices) {
  choice.addEventListener('click', () => {
    if (wasJustActivatedByPencil(choice)) return;
    setStyleWidth(choice.dataset.styleTool, choice.dataset.styleWidth);
  });
}
for (const choice of pageScopeChoices) {
  choice.addEventListener('click', () => {
    if (wasJustActivatedByPencil(choice)) return;
    setPageStyleScope(choice.dataset.pageScope);
  });
}
for (const choice of pageColorChoices) {
  choice.addEventListener('click', () => {
    if (wasJustActivatedByPencil(choice)) return;
    setPageColor(choice.dataset.pageColor);
  });
}
for (const choice of pageTemplateChoices) {
  choice.addEventListener('click', () => {
    if (wasJustActivatedByPencil(choice)) return;
    setPageTemplate(choice.dataset.pageTemplate);
  });
}

window.addEventListener('resize', () => {
  if (drawing || pageTurning) return;
  removePreview();
  pageSwipe = null;
  resizeCanvas();
  renderImages();
  if (currentPageKind === 'note') requestAnimationFrame(() => alignNoteTitleToPen(document));
});

window.addEventListener('blur', () => {
  if (drawing) finalizeStroke('window-blur');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (drawing) finalizeStroke('visibility-hidden');
    if (pageSwipe) { resetTurnStyles(); removePreview(); pageSwipe = null; pageTurning = false; }
    if (ready && dirty) persistNow();
    } else if (ready) {
    scheduleCloudAuto('foreground', 1200);
  }
});

window.addEventListener('online', () => { if (ready) scheduleCloudAuto('network-online', 1200); });

window.addEventListener('pagehide', () => {
  if (drawing) finalizeStroke('pagehide');
  if (ready && dirty) persistNow();
});

async function loadInitialPage() {
  statusLabel.textContent = 'caricamento';
  try {
    await openDb();
    const [record, globalRecord] = await Promise.all([
      getRecord(currentPageKey()),
      getRecord(GLOBAL_PAGE_STYLE_KEY),
      ensureNotesCount(currentDate)
    ]);
    session.storageReads += 2;
    globalPageStyle = globalRecord?.pageStyle ? normalizePageStyle(globalRecord.pageStyle) : { ...DEFAULT_PAGE_STYLE };
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    images = imagesFromRecord(record);
    selectedImageId = null;
    pageStyle = pageStyleFromRecord(record);
    applyPageStyle();
    applyToolDefaultsForPaper(pageStyle.color);
    updatePageStyleUi();
    resetUndoHistory();
    dirty = false;
    await migrateLegacyErasersOnCurrentPage();
    renderAll();
    renderImages();
    statusLabel.textContent = (strokes.length || images.length) ? 'pagina caricata' : 'pagina nuova';
  } catch (err) {
    session.storageErrors++;
    strokes = [];
    images = [];
    selectedImageId = null;
    pageStyle = { ...DEFAULT_PAGE_STYLE };
    applyPageStyle();
    updatePageStyleUi();
    renderAll();
    renderImages();
    statusLabel.textContent = 'storage non disponibile';
    console.warn('Caricamento pagina non riuscito', err);
  }
}

async function bootAgenda() {
  updateHeader();
  updateToolUi();
  paper?.classList.toggle('image-edit-mode', activeTool === 'image');
  renderImages();
  updateStyleUi();
  applyPageStyle();
  resizeCanvas();
  requestAnimationFrame(rafWatchdog);
  await loadInitialPage();
  if (!syncFoundation) {
    try {
      const [persistedState, storedPending] = await Promise.all([
        getSyncMeta(SYNC_STATE_KEY).catch(() => null),
        countPendingSyncEvents().catch(() => 0)
      ]);
      syncFoundation = initSyncFoundation({
        appVersion: APP_VERSION,
        persistedState,
        storedPending,
        onStats: (stats) => { syncStats = stats; }
      });
      syncStats = syncFoundation.getDiagnostics();
      // Identità replica persistita all'avvio, fuori dalla pipeline realtime Ink.
      await putSyncMeta(syncFoundation.getStateRow()).catch((err) => console.warn('Identità Sync non persistita', err));
      // La prima pagina è stata caricata prima dell'inizializzazione Sync: eseguiamo
      // ora l'eventuale normalizzazione degli eraser legacy 0.1.31.
      await migrateLegacyErasersOnCurrentPage().catch((err) => console.warn('Migrazione eraser legacy non riuscita', err));
    } catch (err) {
      console.warn('Agenda Sync Core non disponibile', err);
    }
  }
  if (!cloudTransport && syncFoundation) {
    const config = loadCloudConfig();
    if (cloudEndpointInput) cloudEndpointInput.value = config.endpoint || CLOUD_DEFAULT_ENDPOINT;
    if (cloudJoinCodeInput) cloudJoinCodeInput.value = config.joinCode;
    if (cloudSyncModeSelect) cloudSyncModeSelect.value = config.mode;
    cloudTransport = initCloudSyncTransport({
      protocolVersion: syncFoundation.protocolVersion,
      getConfig: cloudTransportConfig,
      getReplicaId: () => syncFoundation?.replicaId || '',
      flushLocal: async () => { await ensureCurrentPageImageBlobs(); if (dirty) await persistNow(); },
      loadPendingEvents: listCloudPendingEvents,
      markEventsSent: markCloudEventsSent,
      getPullCursor: getCloudPullCursor,
      setPullCursor: setCloudPullCursor,
      getGroupEpoch: getCloudGroupEpoch,
      setGroupEpoch: setCloudGroupEpoch,
      onGroupEpochMismatch: handleRemoteGroupEpochMismatch,
      hasLocalBlob: hasSyncBlob,
      getLocalBlob: getSyncBlob,
      putLocalBlob: putSyncBlob,
      applyRemoteEvents: applyRemoteSyncEvents,
      isRealtimeBusy: () => drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture),
      onStats: (stats) => { cloudStats = stats; updateCloudStatus(); }
    });
    cloudStats = cloudTransport.getDiagnostics();
    updateCloudStatus();
    cloudEndpointInput?.addEventListener('change', () => { saveCloudConfig(); scheduleCloudAuto('config-change', 1200); });
    cloudEndpointInput?.addEventListener('input', () => saveCloudConfig());
    cloudJoinCodeInput?.addEventListener('change', () => { saveCloudConfig(); scheduleCloudAuto('group-change', 1200); });
    cloudJoinCodeInput?.addEventListener('input', () => saveCloudConfig());
    cloudJoinCodeInput?.addEventListener('dblclick', () => selectTextControl(cloudJoinCodeInput));
    cloudSyncModeSelect?.addEventListener('change', () => { saveCloudConfig(); updateCloudStatus(); scheduleCloudAuto('mode-change', 1200); });
  }
  if (!lanTransport && syncFoundation) {
    const config = loadLanConfig();
    if (lanHubUrlInput) lanHubUrlInput.value = config.endpoint;
    if (lanSyncKeyInput) lanSyncKeyInput.value = config.syncKey;
    lanTransport = initLanSyncTransport({
      protocolVersion: syncFoundation.protocolVersion,
      getConfig: () => ({ endpoint: lanHubUrlInput?.value || '', syncKey: lanSyncKeyInput?.value || '' }),
      getReplicaId: () => syncFoundation?.replicaId || '',
      flushLocal: async () => { await ensureCurrentPageImageBlobs(); if (dirty) await persistNow(); },
      loadPendingEvents: listPendingSyncEvents,
      markEventsSent: markSyncEventsSent,
      getPullCursor: getLanPullCursor,
      setPullCursor: setLanPullCursor,
      getGroupEpoch: getLanGroupEpoch,
      setGroupEpoch: setLanGroupEpoch,
      onGroupEpochMismatch: handleRemoteGroupEpochMismatch,
      hasLocalBlob: hasSyncBlob,
      getLocalBlob: getSyncBlob,
      putLocalBlob: putSyncBlob,
      applyRemoteEvents: applyRemoteSyncEvents,
      isRealtimeBusy: () => drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture),
      onStats: (stats) => { lanStats = stats; updateLanStatus(); }
    });
    lanStats = lanTransport.getDiagnostics();
    updateLanStatus();
    lanHubUrlInput?.addEventListener('change', saveLanConfig);
    lanSyncKeyInput?.addEventListener('change', saveLanConfig);
  }
  if (isSyncRestorePending()) {
    const pendingMode = String(syncRestoreGuard?.mode || 'local-restore');
    const result = await runPendingRestoreReconciliation();
    if (result?.error) {
      const title = pendingMode === 'global-authoritative'
        ? 'Ripristino globale non completato'
        : pendingMode === 'group-authoritative' ? 'Riallineamento alla nuova generazione non completato' : 'Ripristino locale completato, ma riallineamento Sync non riuscito';
      const text = `${title}.\nInvio bloccato e Agenda in sola lettura per sicurezza. Premi “Sincronizza adesso” per riprovare.\n${result.error}`;
      updateCloudStatus(text);
      updateLanStatus(text);
    }
  }
  startCloudHeartbeat();
  scheduleCloudAuto('startup', 1800);
  ready = true;
  if (!backupFoundation) {
    backupFoundation = initBackupFoundation({
      appVersion: APP_VERSION,
      mainDbName: DB_NAME,
      mainStore: STORE,
      flushCurrent: async () => { if (dirty) await persistNow(); },
      setAppStatus: (message) => { statusLabel.textContent = message; },
      isRealtimeBusy: () => drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture),
      beforeRestoreApplied: async (details) => {
        // Il gruppo Sync resta quello configurato sul dispositivo corrente: il backup non può
        // cambiare gruppo né propagare automaticamente uno snapshot storico.
        beginSyncRestoreGuard(details);
        lanTransport?.suspendForInk();
        cloudTransport?.suspendForInk();
      },
      afterRestoreApplied: async (details) => {
        // Lo snapshot ripristinato non genera eventi. Azzeriamo identità, cursori, outbox e blob Sync;
        // al riavvio una nuova replica eseguirà prima un pull-only completo del gruppo.
        await resetSyncStores();
        updateSyncRestoreGuard({ phase: 'restore-applied', restoredAt: new Date().toISOString(), ...details });
      },
      beforeGlobalRestoreApplied: async (details) => {
        // Operazione distruttiva esplicita: il backup locale diventerà una nuova generazione
        // autorevole del gruppo, ma soltanto dopo pubblicazione e commit remoto completi.
        beginGlobalGroupRestoreGuard(details);
        lanTransport?.suspendForInk();
        cloudTransport?.suspendForInk();
      },
      afterGlobalRestoreApplied: async (details) => {
        await resetSyncStores();
        updateSyncRestoreGuard({ phase: 'global-restore-applied', restoredAt: new Date().toISOString(), ...details });
      }
    });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

const startup = {
  phase: 'cover',
  timer: 0,
  creditsPaused: false,
  bootPromise: null,
  finishing: false
};

function clearStartupTimer() {
  if (startup.timer) window.clearTimeout(startup.timer);
  startup.timer = 0;
}

function beginAgendaBoot() {
  if (!startup.bootPromise) startup.bootPromise = bootAgenda();
  return startup.bootPromise;
}

function showCredits() {
  if (startup.phase !== 'cover') return;
  clearStartupTimer();
  startup.phase = 'credits';
  coverScreen.hidden = true;
  creditsScreen.hidden = false;
  creditsScreen.classList.add('startup-enter');
  beginAgendaBoot();
  startup.timer = window.setTimeout(() => finishStartup(), 2200);
}

async function finishStartup() {
  if (startup.finishing || startup.phase === 'done') return;
  startup.finishing = true;
  clearStartupTimer();
  try {
    await beginAgendaBoot();
  } finally {
    startup.phase = 'done';
    lastUserActivityAt = Date.now();
    scheduleIdleCover();
    startupOverlay.classList.add('startup-exit');
    document.body.classList.remove('startup-active');
    window.setTimeout(() => {
      startupOverlay.hidden = true;
      startupOverlay.remove();
    }, 260);
  }
}

function handleStartupClick(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (startup.phase === 'cover') {
    showCredits();
    return;
  }
  if (startup.phase !== 'credits') return;
  if (!startup.creditsPaused) {
    startup.creditsPaused = true;
    clearStartupTimer();
    creditsScreen.classList.add('paused');
    creditsHint.textContent = 'In pausa · tocca ancora per entrare';
    return;
  }
  finishStartup();
}

startupOverlay.addEventListener('click', handleStartupClick);
startup.timer = window.setTimeout(showCredits, 1900);

console.info(`Agenda iPad ${APP_VERSION} · Sync Core local-first + pointermove Ink invariato + eraser strutturale + backup portabile`);
