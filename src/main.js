import { initBackupFoundation } from './backup.js';
import { initLessonPdf } from './lesson-pdf.js';
import { initSyncFoundation } from './sync-core.js';
import { initLanSyncTransport } from './lan-sync.js';
import { initCloudSyncTransport } from './cloud-sync.js';
import { decodeCloudJoinCode } from './cloud-crypto.js';
import { structuralErase } from './ink-erase.js';
import { dataUrlToBlob, sha256Blob, isSha256Hash } from './blob-store.js';
import { initAudioRecorder } from './audio-recorder.js';
import { initVoiceScript } from './voice-script.js';
import { initLassoTool } from './lasso-tool.js';
import { buildBeautifyPlan } from './beautify.js';
import { VAULT_CONFIG_KEY, VAULT_DATA_KEY, VAULT_LOCAL_AUTH_KEY, VAULT_LOCAL_STATE_KEY, VAULT_SYNC_KEY, portableVaultRow, isPortableVaultRow, buildVaultBackupPayload, rowsFromVaultBackupPayload } from './password-vault.js';
import { SHAPE_TYPES as BASE_SHAPE_TYPES, SHAPE_LABELS as BASE_SHAPE_LABELS, buildShapePoints as buildBaseShapePoints, shapePathData, shapeIconPathData as baseShapeIconPathData } from './shapes.js';
import { EXTRA_SHAPE_TYPES, EXTRA_SHAPE_LABELS, buildExtraShapePoints, extraShapeIconPathData } from './extra-shapes.js';
import { initRulerTool, projectNormalizedPointToGuide } from './ruler.js';
const SHAPE_TYPES = Object.freeze([...BASE_SHAPE_TYPES, ...EXTRA_SHAPE_TYPES]);
const SHAPE_LABELS = Object.freeze({ ...BASE_SHAPE_LABELS, ...EXTRA_SHAPE_LABELS });
const buildShapePoints = (type, bounds) => EXTRA_SHAPE_TYPES.includes(type) ? buildExtraShapePoints(type, bounds) : buildBaseShapePoints(type, bounds);
const shapeIconPathData = (type) => EXTRA_SHAPE_TYPES.includes(type) ? extraShapeIconPathData(type) : baseShapeIconPathData(type);
const APP_VERSION = '0.1.43';
const DB_NAME = 'AgendaIPadReintegrationDB';
const DB_VERSION = 4;
// 0.1.32 — CONTRATTO UPDATE NON DISTRUTTIVO: mantenere DB_NAME, DB_VERSION e chiavi storage compatibili.
// La sostituzione dei file in dist deve aggiornare il codice/PWA senza cancellare contenuti locali esistenti.
const DATA_COMPATIBILITY_GENERATION = 'note-continuous-v2';
const STORE = 'pages';
const LOCAL_IMAGE_CLIPBOARD_DB = 'AgendaIPadLocalImageClipboardDB';
const LOCAL_IMAGE_CLIPBOARD_STORE = 'clipboard';
const LOCAL_IMAGE_CLIPBOARD_KEY = 'image-cut-v1';
const SYNC_EVENT_STORE = 'syncEvents';
const SYNC_META_STORE = 'syncMeta';
const SYNC_BLOB_STORE = 'syncBlobs';
const PASSWORD_VAULT_STORE = 'passwordVault';
const SYNC_STATE_KEY = 'sync-state-v1';
const LAN_STATE_KEY = 'lan-transport-state-v1';
const LAN_CONFIG_STORAGE_KEY = 'agenda-ipad-lan-sync-config-v1';
const CLOUD_STATE_KEY = 'cloud-transport-state-v1';
const CLOUD_CONFIG_STORAGE_KEY = 'agenda-ipad-cloud-sync-config-v1';
const CLOUD_CREDENTIALS_META_KEY = 'cloud-credentials-backup-v1';
const SYNC_RESTORE_GUARD_STORAGE_KEY = 'agenda-ipad-sync-restore-guard-v1';
const LOCAL_RESTORE_SYNC_QUARANTINE_KEY = 'agenda-ipad-local-restore-sync-quarantine-v1';
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
const WEATHER_REVERSE_GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const WEATHER_LOCALITY_CACHE_STORAGE_KEY = 'agenda-ipad-weather-locality-cache-v1';
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
  pen: { colors: ['#111111','#8e8e8e','#a52b2b','#f02f37','#f07f31','#f2d21b','#23724b','#1698cf','#174f9b','#9c4ca8','#f5f3eb','#c7c7c7','#bd845f','#ef9fb6','#f3b82f','#eadca7','#9ccf24','#8fc9d8','#7696b7','#c1b6d6'], widths: [1.4, 1.8, 2.5, 3.6, 5] },
  highlighter: { colors: ['#111111','#8e8e8e','#a52b2b','#f03b43','#f3a65a','#f0d84f','#7fd38b','#38c286','#7fc8e8','#8b77d8','#f5f3eb','#c7c7c7','#bd845f','#ef91b2','#ffc84a','#eadca7','#b4dc38','#9bd8e4','#86a9c9','#c7b9df'], widths: [8, 12, 15, 20, 26] },
  eraser: { widths: [12, 16, 22, 30, 40] }
});
const UNDO_LIMIT = 10;
const REDO_LIMIT = 10;
const CROSS_PLATFORM_TEXT_FONT_PX = 38;

const DEFAULT_PAGE_STYLE = Object.freeze({ color: 'black', template: 'ruled' });
const ALLOWED_PAGE_COLORS = Object.freeze(['yellow', 'white', 'black']);
const ALLOWED_PAGE_TEMPLATES = Object.freeze(['ruled', 'grid', 'millimeter', 'blank']);
const SAVE_IDLE_MS = 2400;
const FOOTER_PX = 46;
const MIN_DATE = '2026-01-01';
const MAX_DATE = '2028-12-31';
const PAGE_TURN_MS = 280;
const NOTE_TURN_MS = 260;
const NOTES_META_SUFFIX = '::notes-meta';
const GLOBAL_PAGE_STYLE_KEY = '::global-page-style';
const LAVAGNA_PAPER_COLOR_STORAGE_KEY = 'lavagna-ipad-paper-color-v1';
const LESSON_SUBJECTS_STORAGE_KEY = 'lavagna-ipad-lesson-subjects-v1';
const LESSON_INDEX_STORAGE_KEY = 'lavagna-ipad-lesson-index-v1';
const ACTIVE_LESSON_STORAGE_KEY = 'lavagna-ipad-active-lesson-v1';
const DEFAULT_LESSON_SUBJECTS = Object.freeze(['Informatica 3G','Informatica 4G','Informatica 5G','Sistemi 3G','Sistemi 5I','TPSIT 5I','Note','Generica']);
const LESSON_SUBJECTS_DEFAULT_MIGRATION_KEY = 'lavagna-ipad-lesson-subjects-defaults-v0114';
const PLANNER_MODES = Object.freeze(['daily', 'weekly']);
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
const continuousViewport = document.getElementById('lessonContinuousViewport');
const continuousTrack = document.getElementById('lessonContinuousTrack');
const lessonHomeScreen = document.getElementById('lessonHomeScreen');
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
const lassoToolButton = document.getElementById('lassoToolButton');
const lassoOverlay = document.getElementById('lassoOverlay');
const lassoInputShield = document.getElementById('lassoInputShield');
const lassoPath = document.getElementById('lassoPath');
const lassoBounds = document.getElementById('lassoBounds');
const lassoInspector = document.getElementById('lassoInspector');
const lassoCutButton = document.getElementById('lassoCutButton');
const lassoPasteButton = document.getElementById('lassoPasteButton');
const lassoClearButton = document.getElementById('lassoClearButton');
const lassoHint = document.getElementById('lassoHint');
const voiceScriptToolButton = document.getElementById('voiceScriptToolButton');
const shapeToolButton = document.getElementById('shapeToolButton');
const shapePalette = document.getElementById('shapePalette');
const shapeChoiceButtons = [...document.querySelectorAll('[data-shape-type]')];
const shapeOverlay = document.getElementById('shapeOverlay');
const shapePreviewPath = document.getElementById('shapePreviewPath');
const rulerButton = document.getElementById('rulerButton');
const rulerOverlay = document.getElementById('rulerOverlay');
const rulerAngleBadge = document.getElementById('rulerAngleBadge');
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
const quickPaperChoices = [...document.querySelectorAll('[data-quick-template], [data-quick-color]')];
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
const cutImageButton = document.getElementById('cutImageButton');
const pasteImageButton = document.getElementById('pasteImageButton');
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
const audioPageIndicator = document.getElementById('audioPageIndicator');
const audioButton = document.getElementById('audioButton');
const beautifyButton = document.getElementById('beautifyButton');
const beautifyFeedback = document.getElementById('beautifyFeedback');
const newLessonButton = document.getElementById('newLessonButton');
const closeLessonButton = document.getElementById('closeLessonButton');
const lessonArchiveButton = document.getElementById('lessonArchiveButton');
const lessonHeader = document.getElementById('lessonHeader');
const lessonDateLabel = document.getElementById('lessonDateLabel');
const lessonMetaDisplay = document.getElementById('lessonMetaDisplay');
const lessonSubjectLabel = document.getElementById('lessonSubjectLabel');
const lessonTopicLabel = document.getElementById('lessonTopicLabel');
const lessonMetaEditor = document.getElementById('lessonMetaEditor');
const lessonSubjectSelect = document.getElementById('lessonSubjectSelect');
const lessonTopicInput = document.getElementById('lessonTopicInput');
const lessonNoteLabel = document.getElementById('lessonNoteLabel');
const lessonBoardProgress = document.getElementById('lessonBoardProgress');
const lessonSetupPanel = document.getElementById('lessonSetupPanel');
const lessonSetupDate = document.getElementById('lessonSetupDate');
const lessonSetupSubject = document.getElementById('lessonSetupSubject');
const lessonSetupTopic = document.getElementById('lessonSetupTopic');
const lessonSetupStartButton = document.getElementById('lessonSetupStartButton');
const lessonSetupResumeButton = document.getElementById('lessonSetupResumeButton');
const lessonSetupNewTabButton = document.getElementById('lessonSetupNewTabButton');
const lessonSetupOpenTabButton = document.getElementById('lessonSetupOpenTabButton');
const lessonSetupNewPanel = document.getElementById('lessonSetupNewPanel');
const lessonSetupOpenPanel = document.getElementById('lessonSetupOpenPanel');
const lessonSubjectPicker = document.getElementById('lessonSubjectPicker');
const lessonStartupArchiveBody = document.getElementById('lessonStartupArchiveBody');
const lessonSetupCloseButton = document.getElementById('lessonSetupCloseButton');
const lessonSetupStatus = document.getElementById('lessonSetupStatus');
const lessonArchivePanel = document.getElementById('lessonArchivePanel');
const lessonArchiveBody = document.getElementById('lessonArchiveBody');
const lessonArchiveCloseButton = document.getElementById('lessonArchiveCloseButton');
const settingsTabSubjectsButton = document.getElementById('settingsTabSubjectsButton');
const settingsSubjectsTab = document.getElementById('settingsSubjectsTab');
const lessonSubjectNewInput = document.getElementById('lessonSubjectNewInput');
const lessonSubjectAddButton = document.getElementById('lessonSubjectAddButton');
const lessonSubjectSettingsList = document.getElementById('lessonSubjectSettingsList');
const weatherLocationLabel = document.getElementById('weatherLocationLabel');
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
let lessonSubjects = loadLessonSubjects();
let lessonIndex = loadLessonIndex();
let activeLesson = loadActiveLesson();
let currentLessonBoardIndex = Math.max(1, Number(activeLesson?.currentBoardIndex) || 1);
if (activeLesson?.acquisitionDate) currentDate = activeLesson.acquisitionDate;
let lessonMetaRenderTimer = 0;
let lessonStartupPromptShown = false;
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
// 0.1.73 — clipboard immagini locale al solo dispositivo, su DB separato.
// Non entra in Sync né nei backup dell'Agenda e viene svuotata solo dopo un Incolla persistito.
let localImageCutClipboard = null;
let drawing = false;
let pointerId = null;
// 0.1.17 — i tap Apple Pencil sui controlli UI sono gestiti esplicitamente.
// Non ci affidiamo alla sintesi di `click` di Safari/iPadOS.
const pencilUiPointers = new Map();
const recentPencilUiActivation = new WeakMap();
const PENCIL_UI_TAP_MAX_DISTANCE = 28;
const PENCIL_UI_TAP_MAX_DURATION_MS = 1400;
// 0.1.42 — triplo tap/click sulla Gomma = pulizia completa del foglio corrente.
// Nel foglio continuo vengono rimossi TUTTI i segmenti tecnici della lezione;
// il gesto resta confinato alla toolbar e non entra mai nel pointermove Ink.
const ERASER_TRIPLE_TAP_WINDOW_MS = 1200;
const ERASER_TRIPLE_TAP_MIN_INTERVAL_MS = 75;
let eraserPenTapTimes = [];
let eraserPenTapPageKey = '';
let eraserClearBusy = false;

let rect = null;
let protectedTop = 0;
let inkBottomInset = FOOTER_PX;
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
let weatherLocalityFetchController = null;
let weatherLocalityCache = loadWeatherLocalityCache();
let weatherLocalityLabelText = '';
let weatherDetailCache = { locationKey:'', fetchedAt:0, payload:null };
let historyFetchController = null;
let historyDetailFetchController = null;
let historyRefreshTimer = 0;
let historyRequestSerial = 0;
let weeklyTimetableReturnDescriptor = null;
let lessonGoalsReturnDescriptor = null;
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
// 0.1.34 — Continuous Lesson. Una lezione è un solo foglio verticale; i segmenti
// sono unità tecniche invisibili di virtualizzazione/persistenza.
let continuousLessonActive = false;
let continuousSegmentHeight = 0;
let continuousVirtualCount = 3;
let continuousScrollRaf = 0;
let continuousPrefetchWindowKey = '';
let continuousPrefetchGeneration = 0;
let continuousScrollSettleTimer = 0;
let continuousMomentumRaf = 0;
let continuousTouch = null;
let continuousStrokeScrollTop = 0;
let continuousSwitchPromise = Promise.resolve();
let continuousPendingSwitchIndex = 0;
const continuousPendingInkStarts = new Map();
const continuousSegmentCache = new Map();
const continuousSegmentSlots = new Map();
const continuousDirtySegments = new Set();
let continuousSaveChain = Promise.resolve();
// 0.1.34 — sessione viewport per strumenti che devono ignorare i confini tecnici
// dei segmenti (Lazo/Immagini). I dati persistenti restano segmentati; la UI vede
// una sola superficie continua. Nessuna di queste strutture viene usata nel pointermove Ink.
let continuousViewportToolState = null;
let continuousPendingLassoUndoProxyAction = null;
let continuousInteractionCommitInProgress = false;
const CONTINUOUS_CACHE_RADIUS = 2;
const CONTINUOUS_STATIC_DPR = 1;
const CONTINUOUS_GROW_AHEAD = 2;
const CONTINUOUS_SCROLL_SETTLE_MS = 120;
let pageTurning = false;
let previewPage = null;
let nativeTouchGestureId = null;
let lassoPointerId = null;
let lassoPointerCaptureElement = null;
let lassoTouchId = null;
let lassoLastTouch = null;
let lastLassoPointerDownAt = -Infinity;
// 0.1.7 — stato autorevole del Lazo, indipendente da DOM/CSS/activeTool.
// Viene armato esclusivamente dalla scelta Lazo e disarmato scegliendo un altro strumento.
let lassoSessionArmed = false;
let shapeGesture = null;
let lastPenPointerDownAt = -Infinity;
const NATIVE_TOUCH_POINTER_ID = -2147483000;
const NATIVE_LASSO_TOUCH_POINTER_ID = -2147482999;
let activeTool = 'pen';
let selectedShapeType = loadSelectedShapeType();
let undoHistory = [];
let redoHistory = [];
let toolStyles = loadToolStyles();
let pageStyle = { ...DEFAULT_PAGE_STYLE };
let globalPageStyle = { ...DEFAULT_PAGE_STYLE };
let pageStyleScope = 'current';
let backupFoundation = null;
let audioRecorder = null;
let voiceScript = null;
let lassoTool = null;
let rulerTool = null;
let rulerInkGuide = null;
let passwordVault = null;
let lastVoicePlacementTouchAt = -Infinity;
let syncFoundation = null;
let beautifyBusy = false;
let beautifyAbortController = null;
let syncStats = null;
let lanTransport = null;
let lanStats = null;
let cloudTransport = null;
let cloudStats = null;
let cloudHeartbeatTimer = 0;
let syncRestoreGuard = loadSyncRestoreGuard();
let localRestoreSyncQuarantine = loadLocalRestoreSyncQuarantine();
let syncRecoveryRebuildActive = false;
let backupSnapshotFreeze = false;
let restoreOperationLocked = false;
let restoreMutationActive = false;
let lessonPdfController = null;
let lessonPdfBusy = false;
let lessonPdfSnapshotBusy = false;
for (const type of ['pointerdown', 'touchstart', 'click', 'keydown', 'input', 'change']) {
  window.addEventListener(type, event => {
    if (event.target?.closest?.('[data-restore-recovery-action]')) return;
    if (!restoreOperationLocked && document.documentElement.dataset.restoreCritical !== '1') return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, { capture:true, passive:false });
}
let syncRemoteApplyBusy = false;
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

function cleanLessonText(value, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function loadLessonSubjects() {
  try {
    const raw = JSON.parse(localStorage.getItem(LESSON_SUBJECTS_STORAGE_KEY) || '[]');
    const items = Array.isArray(raw) ? raw.map((v) => cleanLessonText(v, 80)).filter(Boolean) : [];
    const unique = [...new Set(items)];
    // Migrazione una tantum dalla vecchia baseline che proponeva soltanto "Informatica".
    // Eventuali materie personalizzate dall'utente non vengono mai eliminate.
    const oldDefaultOnly = unique.length === 1 && unique[0] === 'Informatica';
    let migrated = !unique.length || oldDefaultOnly ? [...DEFAULT_LESSON_SUBJECTS] : unique;
    // 0.1.14: aggiunge Note e Generica anche alle installazioni già esistenti,
    // senza rimuovere né riordinare le materie personalizzate dall'utente.
    for (const required of ['Note','Generica']) if (!migrated.includes(required)) migrated.push(required);
    if (!localStorage.getItem(LESSON_SUBJECTS_DEFAULT_MIGRATION_KEY) || oldDefaultOnly || !unique.length || migrated.length !== unique.length) {
      localStorage.setItem(LESSON_SUBJECTS_STORAGE_KEY, JSON.stringify(migrated));
      localStorage.setItem(LESSON_SUBJECTS_DEFAULT_MIGRATION_KEY, '1');
    }
    return migrated;
  } catch { return [...DEFAULT_LESSON_SUBJECTS]; }
}

function saveLessonSubjects() {
  lessonSubjects = [...new Set(lessonSubjects.map((v) => cleanLessonText(v, 80)).filter(Boolean))];
  if (!lessonSubjects.length) lessonSubjects = [...DEFAULT_LESSON_SUBJECTS];
  try { localStorage.setItem(LESSON_SUBJECTS_STORAGE_KEY, JSON.stringify(lessonSubjects)); } catch {}
}

function normalizeBeautifyLessonFontSize(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 14 && n <= 76 ? n : null;
}

function normalizeLesson(value) {
  if (!value || typeof value !== 'object') return null;
  const id = cleanLessonText(value.id, 120);
  if (!id) return null;
  const acquisitionDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value.acquisitionDate || '')) ? String(value.acquisitionDate) : localISODate(new Date());
  return {
    id,
    acquisitionDate,
    createdAt: String(value.createdAt || new Date().toISOString()),
    lastEditedAt: String(value.lastEditedAt || value.createdAt || new Date().toISOString()),
    subject: cleanLessonText(value.subject, 80) || lessonSubjects[0] || 'Informatica 3G',
    topic: cleanLessonText(value.topic, 160) || 'Nuova lezione',
    // 0.1.27: baseline Beautify persistente a livello di lezione.
    // null finché la prima conversione utile non stabilisce la misura.
    beautifyFontSizePx: normalizeBeautifyLessonFontSize(value.beautifyFontSizePx),
    dataGeneration: DATA_COMPATIBILITY_GENERATION,
    // 0.1.34: boardCount/currentBoardIndex diventano segmentCount/currentSegmentIndex
    // a livello semantico, ma manteniamo i nomi dei campi per ridurre la superficie
    // di modifica nei sottosistemi (backup/sync/strumenti). I segmenti non sono UI.
    boardCount: Math.max(1, Number(value.boardCount) || 1),
    currentBoardIndex: Math.max(1, Number(value.currentBoardIndex) || Number(value.lastScrollSegment) || 1),
    lastScrollSegment: Math.max(1, Number(value.lastScrollSegment) || Number(value.currentBoardIndex) || 1),
    lastScrollOffset: Math.max(0, Math.min(0.999999, Number(value.lastScrollOffset) || 0)),
    lastPageKind: ['agenda','planner-daily','planner-timetable'].includes(String(value.lastPageKind || '')) ? String(value.lastPageKind) : 'agenda',
    lastNoteIndex: 0,
    lastTimetableIndex: Math.max(1, Number(value.lastTimetableIndex) || 1)
  };
}

function loadLessonIndex() {
  try {
    const raw = JSON.parse(localStorage.getItem(LESSON_INDEX_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(normalizeLesson).filter(Boolean) : [];
  } catch { return []; }
}

function saveLessonIndex() {
  try { localStorage.setItem(LESSON_INDEX_STORAGE_KEY, JSON.stringify(lessonIndex)); } catch {}
}

function loadActiveLesson() {
  try { return normalizeLesson(JSON.parse(localStorage.getItem(ACTIVE_LESSON_STORAGE_KEY) || 'null')); }
  catch { return null; }
}

function lessonBoardKey(lessonId, boardIndex = 1) {
  return `lesson::${String(lessonId)}::segment::${String(Math.max(1, Number(boardIndex) || 1)).padStart(5, '0')}`;
}

function lessonGoalsKey(lessonId) {
  return `lesson::${String(lessonId)}::goals`;
}

function lessonBoardNotesMetaKey(lessonId, boardIndex = 1) {
  return `${lessonBoardKey(lessonId, boardIndex)}${NOTES_META_SUFFIX}`;
}

function notesCacheKey(dateString, lessonId = '', boardIndex = 0) {
  return lessonId ? lessonBoardNotesMetaKey(lessonId, boardIndex) : `${dateString}${NOTES_META_SUFFIX}`;
}

function saveActiveLesson({ touch = false } = {}) {
  if (restoreMutationActive) return;
  if (!activeLesson) return;
  const scrollPosition = continuousLessonActive
    ? continuousCurrentScrollPosition()
    : {
        segment:Math.max(1, Number(activeLesson.lastScrollSegment) || Number(currentLessonBoardIndex) || 1),
        offset:Math.max(0, Math.min(.999999, Number(activeLesson.lastScrollOffset) || 0))
      };
  activeLesson = normalizeLesson({
    ...activeLesson,
    currentBoardIndex: currentLessonBoardIndex,
    boardCount: Math.max(Number(activeLesson.boardCount) || 1, currentLessonBoardIndex, scrollPosition.segment),
    lastScrollSegment: scrollPosition.segment,
    lastScrollOffset: scrollPosition.offset,
    lastPageKind: ['agenda','planner-daily','planner-timetable'].includes(currentPageKind) ? currentPageKind : (activeLesson.lastPageKind || 'agenda'),
    lastNoteIndex: 0,
    lastTimetableIndex: currentPageKind === 'planner-timetable' ? Math.max(1, Number(currentTimetableIndex) || 1) : Math.max(1, Number(activeLesson.lastTimetableIndex) || 1),
    lastEditedAt: touch ? new Date().toISOString() : activeLesson.lastEditedAt
  });
  const index = lessonIndex.findIndex((item) => item.id === activeLesson.id);
  if (index >= 0) lessonIndex[index] = { ...activeLesson };
  else lessonIndex.push({ ...activeLesson });
  saveLessonIndex();
  try { localStorage.setItem(ACTIVE_LESSON_STORAGE_KEY, JSON.stringify(activeLesson)); } catch {}
}

function makeLessonId() {
  const stamp = localISODate(new Date()).replaceAll('-', '');
  if (globalThis.crypto?.randomUUID) return `lesson-${stamp}-${crypto.randomUUID()}`;
  return `lesson-${stamp}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatLessonDate(dateString) {
  try {
    const d = new Date(`${dateString}T12:00:00`);
    return new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'long', year:'numeric' }).format(d);
  } catch { return String(dateString || ''); }
}

function fillSubjectSelect(select, selected = '') {
  if (!(select instanceof HTMLSelectElement)) return;
  const value = cleanLessonText(selected, 80);
  const values = [...lessonSubjects];
  if (value && !values.includes(value)) values.unshift(value);
  select.replaceChildren();
  for (const subject of values) {
    const option = document.createElement('option');
    option.value = subject;
    option.textContent = subject;
    select.appendChild(option);
  }
  if (value) select.value = value;
}

let lessonSetupNewSubjectSelected = true;
let lessonSetupNewSubjectExpanded = false;

function lessonSetupNewSubjectInput() {
  return document.getElementById('lessonSetupNewSubjectInput');
}

function setLessonSetupNewSubjectExpanded(expanded, { focus = false } = {}) {
  lessonSetupNewSubjectExpanded = Boolean(expanded);
  const creator = document.getElementById('lessonNewSubjectCreator');
  const toggle = lessonSubjectPicker?.querySelector?.('[data-lesson-new-subject]');
  if (creator) creator.hidden = !lessonSetupNewSubjectExpanded;
  if (toggle) toggle.setAttribute('aria-expanded', lessonSetupNewSubjectExpanded ? 'true' : 'false');
  if (focus && lessonSetupNewSubjectExpanded) {
    window.setTimeout(() => {
      const input = lessonSetupNewSubjectInput();
      if (!input) return;
      requestExpandedKeyboardFor(input);
      try { input.focus({ preventScroll:true }); } catch { input.focus(); }
    }, 30);
  }
}

function selectLessonSetupNewSubject({ expand = false, focus = false } = {}) {
  lessonSetupNewSubjectSelected = true;
  if (lessonSetupSubject) lessonSetupSubject.value = '';
  for (const button of lessonSubjectPicker?.querySelectorAll?.('[data-lesson-setup-subject]') || []) {
    button.classList.remove('selected');
    button.setAttribute('aria-selected', 'false');
  }
  const newButton = lessonSubjectPicker?.querySelector?.('[data-lesson-new-subject]');
  newButton?.classList.add('selected');
  newButton?.setAttribute('aria-selected', 'true');
  if (expand) setLessonSetupNewSubjectExpanded(true, { focus });
}

function commitLessonSetupNewSubject() {
  const input = lessonSetupNewSubjectInput();
  const value = cleanLessonText(input?.value, 80);
  if (!value) {
    if (lessonSetupStatus) lessonSetupStatus.textContent = 'Inserisci il nome della nuova materia.';
    setLessonSetupNewSubjectExpanded(true, { focus:true });
    return false;
  }
  const existing = lessonSubjects.find((subject) => subject.localeCompare(value, 'it', { sensitivity:'base' }) === 0);
  const subject = existing || value;
  if (!existing) {
    lessonSubjects.unshift(subject);
    saveLessonSubjects();
  }
  lessonSetupNewSubjectSelected = false;
  lessonSetupNewSubjectExpanded = false;
  renderLessonSubjectPicker(subject);
  selectLessonSetupSubject(subject);
  if (lessonSetupStatus) lessonSetupStatus.textContent = existing ? 'Materia già presente: selezionata.' : 'Nuova materia aggiunta e selezionata.';
  return true;
}

function renderLessonSubjectPicker(selected = '', { preferNew = false } = {}) {
  if (!lessonSubjectPicker) return;
  const preferred = cleanLessonText(selected, 80) || lessonSetupSubject?.value || lessonSubjects[0] || '';
  fillSubjectSelect(lessonSetupSubject, preferred);
  lessonSubjectPicker.replaceChildren();

  const newWrap = document.createElement('div');
  newWrap.className = 'lesson-new-subject-wrap';
  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'lesson-subject-choice lesson-new-subject-choice';
  newButton.dataset.lessonNewSubject = 'true';
  newButton.textContent = '＋ Nuova materia';
  newButton.setAttribute('role', 'option');
  newButton.setAttribute('aria-expanded', lessonSetupNewSubjectExpanded ? 'true' : 'false');
  const newSelected = preferNew || lessonSetupNewSubjectSelected;
  newButton.classList.toggle('selected', newSelected);
  newButton.setAttribute('aria-selected', newSelected ? 'true' : 'false');

  const creator = document.createElement('div');
  creator.id = 'lessonNewSubjectCreator';
  creator.className = 'lesson-new-subject-creator';
  creator.hidden = !lessonSetupNewSubjectExpanded;
  creator.innerHTML = `<label for="lessonSetupNewSubjectInput">Nome nuova materia</label><div class="lesson-new-subject-entry"><input id="lessonSetupNewSubjectInput" class="expanded-keyboard-input" type="text" inputmode="text" maxlength="80" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" placeholder="Scrivi con tastiera o Apple Pencil"><button id="lessonSetupAddNewSubjectButton" type="button">Aggiungi</button></div><small>Tastiera testuale estesa · compatibile con Scribble/Apple Pencil.</small>`;
  newWrap.append(newButton, creator);
  lessonSubjectPicker.appendChild(newWrap);

  for (const subject of lessonSubjects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-subject-choice';
    button.dataset.lessonSetupSubject = subject;
    button.textContent = subject;
    const isSelected = !newSelected && subject === (lessonSetupSubject?.value || preferred);
    button.classList.toggle('selected', isSelected);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    lessonSubjectPicker.appendChild(button);
  }
  if (newSelected && lessonSetupSubject) lessonSetupSubject.value = '';
  prepareExpandedKeyboards(creator);
}

function selectLessonSetupSubject(subject) {
  const value = cleanLessonText(subject, 80);
  if (!value || !lessonSubjects.includes(value)) return;
  lessonSetupNewSubjectSelected = false;
  lessonSetupNewSubjectExpanded = false;
  if (lessonSetupSubject) lessonSetupSubject.value = value;
  const creator = document.getElementById('lessonNewSubjectCreator');
  if (creator) creator.hidden = true;
  const newButton = lessonSubjectPicker?.querySelector?.('[data-lesson-new-subject]');
  newButton?.classList.remove('selected');
  newButton?.setAttribute('aria-selected', 'false');
  newButton?.setAttribute('aria-expanded', 'false');
  for (const button of lessonSubjectPicker?.querySelectorAll?.('[data-lesson-setup-subject]') || []) {
    const selected = button.dataset.lessonSetupSubject === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

function renderLessonHeaderFor(root = document, descriptor = null, forceStatic = false) {
  const desc = descriptor || pageDescriptor();
  const host = root?.classList?.contains?.('paper') ? root : root?.querySelector?.('.paper') || root;
  const wrap = host?.querySelector?.('.lesson-header');
  if (!wrap) return;
  const lessonSurface = (desc?.kind === 'agenda' || desc?.kind === 'note') && Boolean(activeLesson);
  wrap.hidden = !lessonSurface;
  if (closeLessonButton) closeLessonButton.hidden = !activeLesson;
  const progress = host?.querySelector?.('.lesson-board-progress');
  if (progress) progress.hidden = !lessonSurface;
  if (!lessonSurface) return;
  const dateEl = wrap.querySelector('.lesson-date-label');
  const display = wrap.querySelector('.lesson-meta-display');
  const editor = wrap.querySelector('.lesson-meta-editor');
  const subjectLabel = wrap.querySelector('.lesson-subject-label');
  const topicLabel = wrap.querySelector('.lesson-topic-label');
  const noteLabel = wrap.querySelector('.lesson-note-label');
  if (dateEl) dateEl.textContent = formatLessonDate(activeLesson.acquisitionDate);
  if (subjectLabel) subjectLabel.textContent = activeLesson.subject;
  if (topicLabel) topicLabel.textContent = activeLesson.topic;
  const boardIndex = Math.max(1, Number(desc.lessonBoardIndex) || currentLessonBoardIndex || 1);
  const boardCount = Math.max(boardIndex, Number(activeLesson.boardCount) || 1);
  // 0.1.20: nelle schermate Lavagna i metadati della lezione sono solo informativi.
  // Materia e Argomento si impostano esclusivamente in "Nuova lezione".
  const editable = false;
  if (display) display.hidden = false;
  if (editor) editor.hidden = true;
  if (noteLabel) {
    // Le continuazioni verticali sono segmenti tecnici della stessa pagina Note:
    // non vengono esposte come pagine Nota separate nell'interfaccia.
    noteLabel.hidden = true;
    noteLabel.textContent = '';
  }
  if (progress) { progress.textContent = `${boardIndex}/${boardCount}`; progress.setAttribute('aria-label', `Pagina Note ${boardIndex}/${boardCount}`); }
}
function notifyLessonSurfaceChanged(reason = 'lesson-meta') {
  clearTimeout(lessonMetaRenderTimer);
  lessonMetaRenderTimer = window.setTimeout(() => renderLessonHeaderFor(document), 120);
}

function updateActiveLessonMetadata(subject, topic, { touch = true, notify = true } = {}) {
  if (!activeLesson) return;
  const cleanSubject = cleanLessonText(subject, 80) || activeLesson.subject;
  const cleanTopic = cleanLessonText(topic, 160) || activeLesson.topic;
  activeLesson = { ...activeLesson, subject:cleanSubject, topic:cleanTopic };
  if (!lessonSubjects.includes(cleanSubject)) { lessonSubjects.push(cleanSubject); saveLessonSubjects(); renderLessonSubjectSettings(); }
  saveActiveLesson({ touch });
  renderLessonHeaderFor(document);
  if (notify) notifyLessonSurfaceChanged('lesson-meta-change');
}

function renderLessonSubjectSettings() {
  if (!lessonSubjectSettingsList) return;
  lessonSubjectSettingsList.replaceChildren();
  for (const subject of lessonSubjects) {
    const row = document.createElement('div');
    row.className = 'lesson-subject-settings-row';
    const label = document.createElement('span');
    label.textContent = subject;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.lessonSubjectRemove = subject;
    remove.textContent = 'Rimuovi';
    row.append(label, remove);
    lessonSubjectSettingsList.appendChild(row);
  }
  fillSubjectSelect(lessonSetupSubject, activeLesson?.subject || lessonSubjects[0]);
  renderLessonSubjectPicker(lessonSetupSubject?.value || activeLesson?.subject || lessonSubjects[0], { preferNew:false });
  fillSubjectSelect(lessonSubjectSelect, activeLesson?.subject || lessonSubjects[0]);
}

function createLessonRecord(subject, topic) {
  const now = new Date();
  return normalizeLesson({
    id: makeLessonId(),
    acquisitionDate: localISODate(now),
    createdAt: now.toISOString(),
    lastEditedAt: now.toISOString(),
    subject: cleanLessonText(subject, 80) || lessonSubjects[0] || 'Informatica 3G',
    topic: cleanLessonText(topic, 160) || 'Nuova lezione',
    boardCount: 1,
    currentBoardIndex: 1,
    lastScrollSegment: 1,
    lastScrollOffset: 0,
    lastPageKind: 'agenda',
    lastNoteIndex: 0,
    lastTimetableIndex: 1
  });
}


// -----------------------------------------------------------------------------
// 0.1.34 — CONTINUOUS LESSON CORE
// -----------------------------------------------------------------------------
// Un solo canvas Ink Retina rimane attivo. Il documento verticale è spezzato in
// segmenti tecnici della stessa altezza dell'area scrivibile: i segmenti vicini
// vengono mostrati con canvas statici DPR=1 e caricati fuori dal pointermove.
// La pipeline Apple Pencil (normalizeEvent -> drawBatch) non conosce lo scroll.

function continuousIsLessonSurface(kind = currentPageKind) {
  return Boolean(activeLesson?.id) && kind === 'agenda';
}

function continuousMetrics() {
  const paperRect = paper.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const top = Math.max(0, Math.min(paperRect.height, protectedTop || (headerRect.bottom - paperRect.top)));
  const bottom = FOOTER_PX;
  const height = Math.max(160, paperRect.height - top - bottom);
  return { width:Math.max(1, paperRect.width), paperHeight:Math.max(1, paperRect.height), top, bottom, height };
}

function continuousCurrentScrollPosition() {
  const segmentHeight = Math.max(1, continuousSegmentHeight || continuousMetrics().height);
  if (!continuousViewport || !continuousLessonActive) {
    return {
      segment: Math.max(1, Number(currentLessonBoardIndex) || 1),
      offset: Math.max(0, Math.min(.999999, Number(activeLesson?.lastScrollOffset) || 0))
    };
  }
  const logical = Math.max(0, Number(continuousViewport.scrollTop) || 0) / segmentHeight;
  const floor = Math.floor(logical);
  return { segment:floor + 1, offset:Math.max(0, Math.min(.999999, logical - floor)) };
}

function continuousInteractiveLayers() {
  // 0.1.34: tutti i layer interattivi restano fissi alla viewport. I confini
  // di persistenza non devono mai spostare Lazo/Figure/Voce/Immagini rispetto
  // alla Pencil o al dito; la conversione verso i segmenti avviene a fine gesto.
  return [];
}

function continuousResetInteractiveTransforms() {
  if (canvas) { canvas.style.transform = ''; canvas.style.willChange = ''; }
  for (const element of continuousInteractiveLayers()) {
    element.style.transform = '';
    element.style.willChange = '';
  }
  rect = canvas.getBoundingClientRect();
}

function continuousApplyInteractiveTransform() {
  if (!continuousLessonActive || !continuousViewport || !continuousSegmentHeight) return;
  const segmentTop = (Math.max(1, Number(currentLessonBoardIndex) || 1) - 1) * continuousSegmentHeight;
  const offset = segmentTop - continuousViewport.scrollTop;
  const transform = `translate3d(0, ${offset}px, 0)`;
  for (const element of continuousInteractiveLayers()) {
    element.style.willChange = 'transform';
    element.style.transform = transform;
  }
  // startStroke aggiorna comunque rect al PEN DOWN; questo valore serve agli
  // strumenti che possono essere armati subito dopo lo scroll.
  rect = canvas.getBoundingClientRect();
}

function continuousUpdateTrackHeight() {
  if (!continuousTrack || !continuousSegmentHeight) return;
  const count = Math.max(3, continuousVirtualCount, Number(activeLesson?.boardCount) || 1);
  continuousVirtualCount = count;
  continuousTrack.style.height = `${Math.ceil(count * continuousSegmentHeight)}px`;
}

function continuousEnsureVirtualGrowth(scrollTop = continuousViewport?.scrollTop || 0) {
  if (!continuousLessonActive || !continuousViewport || !continuousSegmentHeight) return;
  const viewportHeight = Math.max(1, continuousViewport.clientHeight || continuousSegmentHeight);
  const lastVisible = Math.floor((scrollTop + viewportHeight - 1) / continuousSegmentHeight) + 1;
  if (lastVisible >= continuousVirtualCount - 1) {
    continuousVirtualCount = Math.max(continuousVirtualCount + CONTINUOUS_GROW_AHEAD, lastVisible + CONTINUOUS_GROW_AHEAD);
    continuousUpdateTrackHeight();
  }
}

function continuousSegmentDescriptor(index) {
  return pageDescriptor(activeLesson?.acquisitionDate || currentDate, 'agenda', 0, 0, currentTimetableIndex, Math.max(1, Number(index) || 1));
}

function continuousCaptureActiveEntry() {
  if (!activeLesson?.id || currentPageKind !== 'agenda') return null;
  const index = Math.max(1, Number(currentLessonBoardIndex) || 1);
  const previous = continuousSegmentCache.get(index);
  const entry = {
    index,
    lessonId:String(activeLesson.id),
    key:lessonBoardKey(activeLesson.id, index),
    strokes,
    images,
    pageStyle:{ ...pageStyle },
    undoHistory:[...undoHistory],
    redoHistory:[...redoHistory],
    revision:Math.max(0, Number(previous?.revision) || 0),
    loaded:true
  };
  continuousSegmentCache.set(index, entry);
  if (dirty) {
    continuousDirtySegments.add(index);
    const slot = continuousSegmentSlots.get(index);
    if (slot) slot.renderedKey = '';
  }
  return entry;
}

async function continuousLoadSegment(index) {
  index = Math.max(1, Number(index) || 1);
  const lessonIdAtStart = String(activeLesson?.id || '');
  if (!lessonIdAtStart || !continuousLessonActive || currentPageKind !== 'agenda') return null;
  if (index === currentLessonBoardIndex && activeLesson?.id && String(activeLesson.id) === lessonIdAtStart) {
    return continuousCaptureActiveEntry();
  }
  const cached = continuousSegmentCache.get(index);
  if (cached?.loaded && String(cached.lessonId || lessonIdAtStart) === lessonIdAtStart) return cached;
  await openDb();
  // Un prefetch può terminare dopo chiusura/cambio lezione: non deve mai
  // contaminare la cache della nuova sessione.
  if (!continuousLessonActive || currentPageKind !== 'agenda' || String(activeLesson?.id || '') !== lessonIdAtStart) return null;
  const descriptor = continuousSegmentDescriptor(index);
  const record = await getRecord(descriptor.key).catch(() => null);
  session.storageReads++;
  if (!continuousLessonActive || currentPageKind !== 'agenda' || String(activeLesson?.id || '') !== lessonIdAtStart) return null;
  // A concurrent prefetch may already have populated this segment, followed by
  // Beautify/Lazo/eraser edits. A late disk snapshot must never replace it.
  if (index === currentLessonBoardIndex) return continuousCaptureActiveEntry();
  const current = continuousSegmentCache.get(index);
  if (current?.loaded && String(current.lessonId || lessonIdAtStart) === lessonIdAtStart) return current;
  const entry = {
    index,
    lessonId:lessonIdAtStart,
    key:descriptor.key,
    strokes:Array.isArray(record?.strokes) ? record.strokes : [],
    images:imagesFromRecord(record),
    pageStyle:pageStyleForDescriptor(record, descriptor),
    undoHistory:[],
    redoHistory:[],
    revision:0,
    loaded:true
  };
  continuousSegmentCache.set(index, entry);
  return entry;
}

function continuousDrawStaticStroke(targetCtx, width, height, topInset, bottomInset, stroke, paperColor) {
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.rect(0, topInset, width, Math.max(0, height - topInset - bottomInset));
  targetCtx.clip();
  if (isCrossPlatformTextItem(stroke)) {
    drawCrossPlatformText(stroke, targetCtx, width, height, paperColor);
    targetCtx.restore();
    return;
  }
  const points = stroke?.points ?? [];
  if (!points.length) { targetCtx.restore(); return; }
  setupStoredStrokeStyle(stroke, targetCtx, paperColor);
  if (points.length === 1) {
    const point = points[0];
    targetCtx.beginPath();
    targetCtx.arc(point.x * width, point.y * height, Math.max(.7, (stroke.width ?? PEN_WIDTH) / 2), 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.restore();
    return;
  }
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x * width, points[0].y * height);
  for (let i = 1; i < points.length; i++) targetCtx.lineTo(points[i].x * width, points[i].y * height);
  targetCtx.stroke();
  targetCtx.restore();
}

function continuousCreateSlot(index) {
  if (!continuousTrack) return null;
  let slot = continuousSegmentSlots.get(index);
  if (slot?.root?.isConnected) return slot;
  const root = document.createElement('div');
  root.className = 'continuous-segment-slot';
  root.dataset.segmentIndex = String(index);
  const staticCanvas = document.createElement('canvas');
  staticCanvas.className = 'continuous-static-canvas';
  const imageHost = document.createElement('div');
  imageHost.className = 'continuous-static-images';
  root.append(imageHost, staticCanvas);
  continuousTrack.appendChild(root);
  slot = { root, canvas:staticCanvas, imageHost, index, renderedKey:'' };
  continuousSegmentSlots.set(index, slot);
  return slot;
}

function continuousPositionSlot(slot) {
  if (!slot || !continuousSegmentHeight) return;
  const m = continuousMetrics();
  slot.root.style.top = `${(slot.index - 1) * continuousSegmentHeight}px`;
  slot.root.style.height = `${continuousSegmentHeight}px`;
  slot.root.style.width = `${m.width}px`;
  slot.canvas.style.left = '0px';
  slot.canvas.style.top = `${-m.top}px`;
  slot.canvas.style.width = `${m.width}px`;
  slot.canvas.style.height = `${m.paperHeight}px`;
}

function continuousRenderStaticSegment(index, entry = continuousSegmentCache.get(index)) {
  if (!continuousLessonActive || !entry?.loaded || !continuousTrack) return;
  const slot = continuousCreateSlot(index);
  if (!slot) return;
  continuousPositionSlot(slot);
  slot.root.hidden = false;
  // Le immagini persistenti appartengono ai tile statici anche nel segmento corrente.
  // Nasconderle qui causerebbe sparizioni al ritorno da Lazo/Immagini.
  slot.imageHost.style.visibility = '';
  const m = continuousMetrics();
  const ratio = CONTINUOUS_STATIC_DPR;
  const pxW = Math.max(1, Math.round(m.width * ratio));
  const pxH = Math.max(1, Math.round(m.paperHeight * ratio));
  const renderKey = `${entry.key}|${(entry.strokes||[]).length}|${(entry.images||[]).length}|${entry.pageStyle?.color}|${entry.pageStyle?.template}|${pxW}x${pxH}`;
  if (slot.renderedKey === renderKey) return;
  if (slot.canvas.width !== pxW) slot.canvas.width = pxW;
  if (slot.canvas.height !== pxH) slot.canvas.height = pxH;
  const targetCtx = slot.canvas.getContext('2d', { alpha:true, desynchronized:true });
  targetCtx.setTransform(1,0,0,1,0,0);
  targetCtx.clearRect(0,0,slot.canvas.width,slot.canvas.height);
  targetCtx.setTransform(ratio,0,0,ratio,0,0);
  for (const stroke of entry.strokes || []) continuousDrawStaticStroke(targetCtx, m.width, m.paperHeight, m.top, m.bottom, stroke, entry.pageStyle?.color || pageStyle.color);
  slot.imageHost.replaceChildren();
  renderImages(slot.imageHost, entry.images || [], false);
  slot.renderedKey = renderKey;
}

function continuousHideActiveStaticSlot() {
  // In modalità normale TUTTO il contenuto persistito (Ink + immagini) resta
  // nei tile statici, compreso il segmento corrente. Quando Lazo/Immagini sono
  // attivi la classe continuous-tool-preview nasconde i tile via CSS e mostra
  // la composizione unificata della viewport. Nessuna immagine deve quindi
  // sparire semplicemente perché il suo segmento è quello attivo.
  for (const [, slot] of continuousSegmentSlots) {
    slot.root.hidden = false;
    if (slot.imageHost) slot.imageHost.style.visibility = '';
  }
}

function continuousTrimCache(centerIndex) {
  const keepRadius = CONTINUOUS_CACHE_RADIUS + 2;
  for (const [index] of continuousSegmentCache) {
    if (index === currentLessonBoardIndex || continuousDirtySegments.has(index) || Math.abs(index - centerIndex) <= keepRadius) continue;
    continuousSegmentCache.delete(index);
    const slot = continuousSegmentSlots.get(index);
    slot?.root?.remove();
    continuousSegmentSlots.delete(index);
  }
}

async function continuousPrefetchAroundScroll({ force = false } = {}) {
  if (!continuousLessonActive || !continuousViewport || !continuousSegmentHeight || !activeLesson?.id) return;
  const lessonIdAtStart = String(activeLesson.id);
  const viewportHeight = Math.max(1, continuousViewport.clientHeight || continuousSegmentHeight);
  const first = Math.max(1, Math.floor(continuousViewport.scrollTop / continuousSegmentHeight) + 1);
  const last = Math.max(first, Math.floor((continuousViewport.scrollTop + viewportHeight - 1) / continuousSegmentHeight) + 1);
  const low = Math.max(1, first - CONTINUOUS_CACHE_RADIUS);
  const high = Math.min(continuousVirtualCount, last + CONTINUOUS_CACHE_RADIUS);
  const windowKey = `${lessonIdAtStart}:${low}:${high}:${continuousVirtualCount}`;
  if (!force && windowKey === continuousPrefetchWindowKey) return;
  continuousPrefetchWindowKey = windowKey;
  const generation = ++continuousPrefetchGeneration;
  const jobs = [];
  for (let index = low; index <= high; index++) {
    jobs.push(continuousLoadSegment(index).then((entry) => {
      if (entry && generation === continuousPrefetchGeneration && String(activeLesson?.id || '') === lessonIdAtStart) continuousRenderStaticSegment(index, entry);
    }).catch((err) => console.warn('Prefetch segmento continuo non riuscito', index, err)));
  }
  await Promise.all(jobs);
  // Un prefetch obsoleto non può effettuare trim sulla finestra più recente.
  if (generation !== continuousPrefetchGeneration || !continuousLessonActive || String(activeLesson?.id || '') !== lessonIdAtStart) return;
  continuousTrimCache(Math.floor((first + last) / 2));
}

function continuousQueueSave(index, entry) {
  if (!entry?.loaded || !activeLesson?.id) return continuousSaveChain;
  continuousDirtySegments.add(index);
  continuousSaveChain = continuousSaveChain.catch(() => {}).then(async () => {
    const current = continuousSegmentCache.get(index) || entry;
    if (!current?.loaded) return false;
    // Snapshot stabile + revisione: una modifica avvenuta mentre IndexedDB sta
    // scrivendo non può essere "coperta" dal completamento di un salvataggio più
    // vecchio. Il clone è fuori dal loop Ink e rende atomico il contenuto logico.
    const saveRevision = Math.max(0, Number(current.revision) || 0);
    const snapshot = {
      strokes:continuousDeepClone(current.strokes || []),
      images:continuousDeepClone(current.images || []),
      pageStyle:{ ...(current.pageStyle || pageStyle) }
    };
    // La revisione copre tutte le mutazioni native del nuovo core. Il fingerprint
    // completo copre anche eventuali percorsi legacy che modificano il record
    // mantenendo la stessa revisione: un commit vecchio non può mai pulire dati nuovi.
    const snapshotFingerprint = continuousObjectJson(snapshot);
    const descriptor = continuousSegmentDescriptor(index);
    const ok = await persistSnapshot(descriptor, snapshot.strokes, false, snapshot.pageStyle, snapshot.images);
    const latest = continuousSegmentCache.get(index) || current;
    const latestFingerprint = continuousObjectJson({
      strokes:latest.strokes || [],
      images:latest.images || [],
      pageStyle:{ ...(latest.pageStyle || pageStyle) }
    });
    const unchanged = Math.max(0, Number(latest.revision) || 0) === saveRevision && latestFingerprint === snapshotFingerprint;
    if (ok && unchanged) continuousDirtySegments.delete(index);
    else continuousDirtySegments.add(index);
    if (!ok) throw new Error(`Salvataggio segmento ${index} non riuscito`);
    return ok;
  }).catch((err) => {
    console.warn('Salvataggio foglio continuo non riuscito', err);
    return false;
  });
  return continuousSaveChain;
}

async function flushContinuousSegmentSaves() {
  if (continuousLessonActive && dirty) continuousCaptureActiveEntry();
  if (activeLesson?.id && currentPageKind === 'agenda') {
    for (const index of [...continuousDirtySegments]) {
      const entry = continuousSegmentCache.get(index);
      if (entry?.loaded) continuousQueueSave(index, entry);
    }
  }
  await continuousSaveChain.catch(() => false);
  const ok = continuousDirtySegments.size === 0;
  if (ok && currentPageKind === 'agenda') dirty = false;
  return ok;
}

async function continuousSwitchToSegment(index, { savePrevious = true, status = false } = {}) {
  if (!continuousLessonActive || !activeLesson?.id || currentPageKind !== 'agenda' || drawing) return false;
  index = Math.max(1, Number(index) || 1);
  if (index === currentLessonBoardIndex) {
    continuousApplyInteractiveTransform();
    return true;
  }
  continuousPendingSwitchIndex = index;
  continuousSwitchPromise = continuousSwitchPromise.catch(() => {}).then(async () => {
    if (!continuousLessonActive || continuousPendingSwitchIndex !== index) return false;
    const target = await continuousLoadSegment(index);
    if (!target || continuousPendingSwitchIndex !== index) return false;

    const oldIndex = currentLessonBoardIndex;
    const oldEntry = continuousCaptureActiveEntry();
    if (oldEntry) {
      continuousRenderStaticSegment(oldIndex, oldEntry);
      if (savePrevious && (dirty || continuousDirtySegments.has(oldIndex))) continuousQueueSave(oldIndex, oldEntry);
    }

    currentLessonBoardIndex = index;
    activeLesson = normalizeLesson({
      ...activeLesson,
      boardCount:Math.max(Number(activeLesson.boardCount) || 1, index),
      currentBoardIndex:index,
      lastScrollSegment:index
    });
    strokes = target.strokes || [];
    images = target.images || [];
    pageStyle = normalizePageStyle(target.pageStyle || pageStyle);
    undoHistory = Array.isArray(target.undoHistory) ? [...target.undoHistory] : [];
    redoHistory = Array.isArray(target.redoHistory) ? [...target.redoHistory] : [];
    dirty = continuousDirtySegments.has(index);
    selectedImageId = null;
    applyPageStyle();
    updatePageStyleUi();
    renderAll();
    renderImages();
    continuousHideActiveStaticSlot();
    continuousApplyInteractiveTransform();
    updateUndoRedoUi();
    saveActiveLesson({ touch:false });
    void continuousPrefetchAroundScroll();
    if (status) statusLabel.textContent = `foglio continuo · posizione ${index}`;
    return true;
  });
  return continuousSwitchPromise;
}

function continuousSegmentAtClientY(clientY) {
  if (!continuousViewport || !continuousSegmentHeight) return currentLessonBoardIndex;
  const vr = continuousViewport.getBoundingClientRect();
  const local = Math.max(0, Math.min(vr.height - 0.001, clientY - vr.top));
  return Math.max(1, Math.floor((continuousViewport.scrollTop + local) / continuousSegmentHeight) + 1);
}

function continuousScheduleSettleSwitch() {
  clearTimeout(continuousScrollSettleTimer);
  continuousScrollSettleTimer = window.setTimeout(() => {
    continuousScrollSettleTimer = 0;
    if (!continuousLessonActive || continuousTouch || drawing || !continuousSegmentHeight) return;
    const vr = continuousViewport.getBoundingClientRect();
    const index = continuousSegmentAtClientY(vr.top + vr.height * .5);
    void continuousSwitchToSegment(index, { savePrevious:true }).then(() => {
      if (activeTool === 'lasso' || activeTool === 'image') {
        continuousEnsureViewportToolState({ force:true });
        continuousSetToolPreview(true);
        renderAll();
        renderImages();
        lassoTool?.syncPage?.();
      }
    });
  }, CONTINUOUS_SCROLL_SETTLE_MS);
}

function continuousHandleScroll() {
  if (!continuousLessonActive || !continuousViewport) return;
  continuousEnsureVirtualGrowth(continuousViewport.scrollTop);
  if (continuousScrollRaf) return;
  continuousScrollRaf = requestAnimationFrame(() => {
    continuousScrollRaf = 0;
    continuousApplyInteractiveTransform();
    void continuousPrefetchAroundScroll();
    continuousScheduleSettleSwitch();
  });
}

function continuousStopMomentum() {
  if (continuousMomentumRaf) cancelAnimationFrame(continuousMomentumRaf);
  continuousMomentumRaf = 0;
}

function continuousStartMomentum(velocityPxMs) {
  continuousStopMomentum();
  let velocity = Number(velocityPxMs) || 0;
  let last = performance.now();
  const frame = (now) => {
    if (!continuousLessonActive || drawing || Math.abs(velocity) < .018) {
      continuousMomentumRaf = 0;
      continuousScheduleSettleSwitch();
      return;
    }
    const dt = Math.min(32, Math.max(1, now - last));
    last = now;
    const before = continuousViewport.scrollTop;
    continuousViewport.scrollTop = Math.max(0, before + velocity * dt);
    continuousEnsureVirtualGrowth(continuousViewport.scrollTop);
    continuousHandleScroll();
    if (continuousViewport.scrollTop === before && velocity < 0) velocity = 0;
    else velocity *= Math.pow(.93, dt / 16.67);
    continuousMomentumRaf = requestAnimationFrame(frame);
  };
  if (Math.abs(velocity) >= .018) continuousMomentumRaf = requestAnimationFrame(frame);
}

function continuousBeginTouchScroll(touch) {
  continuousStopMomentum();
  clearTimeout(continuousScrollSettleTimer);
  // Lo scroll cambia il sistema di coordinate viewport degli strumenti. Una
  // selezione Lazo non viene trascinata implicitamente durante lo swipe: viene
  // chiusa e ricostruita a scroll concluso, mentre i dati persistenti restano intatti.
  if (continuousViewportToolState) continuousClearViewportToolState({ clearSelection:true });
  continuousTouch = {
    id:touch.identifier,
    startX:touch.clientX,
    startY:touch.clientY,
    lastX:touch.clientX,
    lastY:touch.clientY,
    lastAt:performance.now(),
    startScrollTop:continuousViewport.scrollTop,
    moved:false,
    velocity:0
  };
}

function continuousMoveTouchScroll(touch) {
  const g = continuousTouch;
  if (!g || touch.identifier !== g.id) return false;
  const now = performance.now();
  const dy = touch.clientY - g.lastY;
  const dxTotal = touch.clientX - g.startX;
  const dyTotal = touch.clientY - g.startY;
  if (!g.moved && Math.hypot(dxTotal, dyTotal) > 7) g.moved = true;
  if (g.moved) {
    const dt = Math.max(1, now - g.lastAt);
    const instantaneous = (-dy) / dt;
    g.velocity = g.velocity * .72 + instantaneous * .28;
    continuousViewport.scrollTop = Math.max(0, continuousViewport.scrollTop - dy);
    continuousEnsureVirtualGrowth(continuousViewport.scrollTop);
    continuousHandleScroll();
  }
  g.lastX = touch.clientX;
  g.lastY = touch.clientY;
  g.lastAt = now;
  return g.moved;
}

function continuousEndTouchScroll(touch, cancelled = false) {
  const g = continuousTouch;
  if (!g || (touch && touch.identifier !== g.id)) return { handled:false, moved:false };
  continuousTouch = null;
  if (!cancelled && g.moved) continuousStartMomentum(g.velocity);
  else continuousScheduleSettleSwitch();
  return { handled:true, moved:g.moved };
}

function continuousClearRuntime({ keepLesson = false } = {}) {
  continuousStopMomentum();
  clearTimeout(continuousScrollSettleTimer);
  continuousScrollSettleTimer = 0;
  if (continuousScrollRaf) cancelAnimationFrame(continuousScrollRaf);
  continuousScrollRaf = 0;
  continuousPrefetchWindowKey = '';
  continuousPrefetchGeneration++;
  continuousTouch = null;
  continuousPendingInkStarts.clear();
  continuousClearViewportToolState({ clearSelection:true });
  continuousResetInteractiveTransforms();
  continuousLessonActive = false;
  paper.classList.remove('continuous-lesson-mode');
  if (continuousViewport) continuousViewport.hidden = true;
  if (!keepLesson) {
    continuousSegmentCache.clear();
    continuousDirtySegments.clear();
    for (const slot of continuousSegmentSlots.values()) slot.root?.remove();
    continuousSegmentSlots.clear();
    if (continuousTrack) continuousTrack.replaceChildren();
  }
}

async function continuousActivate({ segmentIndex = currentLessonBoardIndex, offset = 0, preserveCache = false } = {}) {
  if (!activeLesson?.id || currentPageKind !== 'agenda' || !continuousViewport || !continuousTrack) return false;
  continuousStopMomentum();
  if (!preserveCache) {
    continuousSegmentCache.clear();
    for (const slot of continuousSegmentSlots.values()) slot.root?.remove();
    continuousSegmentSlots.clear();
    continuousTrack.replaceChildren();
  }
  continuousLessonActive = true;
  // The ordinary page was drawn before activation. Remove that image layer
  // before showing the continuous tiles, and discard its old viewport geometry.
  continuousClearViewportToolState({ clearSelection:true });
  continuousPrefetchWindowKey = '';
  continuousPrefetchGeneration++;
  paper.classList.add('continuous-lesson-mode');
  continuousViewport.hidden = false;
  if (lessonBoardProgress) lessonBoardProgress.hidden = true;
  // Canvas resta della dimensione originale della paper: drawBatch/normalizeEvent
  // mantengono così la geometria e il clipping già collaudati.
  continuousResetInteractiveTransforms();
  resizeCanvas();
  const m = continuousMetrics();
  continuousSegmentHeight = m.height;
  segmentIndex = Math.max(1, Number(segmentIndex) || 1);
  offset = Math.max(0, Math.min(.999999, Number(offset) || 0));
  currentLessonBoardIndex = segmentIndex;
  activeLesson = normalizeLesson({
    ...activeLesson,
    boardCount:Math.max(Number(activeLesson.boardCount) || 1, segmentIndex),
    currentBoardIndex:segmentIndex,
    lastScrollSegment:segmentIndex,
    lastScrollOffset:offset
  });
  continuousVirtualCount = Math.max(3, Number(activeLesson.boardCount) || 1, segmentIndex + CONTINUOUS_GROW_AHEAD);
  continuousUpdateTrackHeight();
  continuousSegmentCache.set(segmentIndex, {
    index:segmentIndex,
    lessonId:String(activeLesson.id),
    key:lessonBoardKey(activeLesson.id, segmentIndex),
    strokes,
    images,
    pageStyle:{ ...pageStyle },
    undoHistory:[...undoHistory],
    redoHistory:[...redoHistory],
    revision:Math.max(0, Number(continuousSegmentCache.get(segmentIndex)?.revision) || 0),
    loaded:true
  });
  continuousViewport.scrollTop = (segmentIndex - 1 + offset) * continuousSegmentHeight;
  continuousEnsureVirtualGrowth(continuousViewport.scrollTop);
  continuousApplyInteractiveTransform();
  continuousHideActiveStaticSlot();
  const prefetch = continuousPrefetchAroundScroll({ force:true });
  const generation = continuousPrefetchGeneration;
  const lessonIdAtStart = String(activeLesson.id);
  saveActiveLesson({ touch:false });
  await prefetch;
  // A late activation must not redraw the document opened in the meantime.
  if (!continuousLessonActive || currentPageKind !== 'agenda' || generation !== continuousPrefetchGeneration || String(activeLesson?.id || '') !== lessonIdAtStart) return false;
  if (!continuousTouch && !drawing && !imageGesture && lassoPointerId == null && lassoTouchId == null && (activeTool === 'image' || isLassoUiArmed())) {
    continuousEnsureViewportToolState({ force:true });
    continuousSetToolPreview(true);
    renderAll();
  }
  renderImages();
  return true;
}


function continuousRelayoutAfterResize(position = continuousCurrentScrollPosition()) {
  if (!continuousLessonActive || !continuousViewport || !continuousTrack) return;
  const safePosition = {
    segment:Math.max(1, Number(position?.segment) || 1),
    offset:Math.max(0, Math.min(.999999, Number(position?.offset) || 0))
  };
  const m = continuousMetrics();
  continuousSegmentHeight = m.height;
  continuousVirtualCount = Math.max(3, continuousVirtualCount, Number(activeLesson?.boardCount) || 1, safePosition.segment + CONTINUOUS_GROW_AHEAD);
  continuousUpdateTrackHeight();
  for (const slot of continuousSegmentSlots.values()) {
    slot.renderedKey = '';
    continuousPositionSlot(slot);
  }
  continuousViewport.scrollTop = (safePosition.segment - 1 + safePosition.offset) * continuousSegmentHeight;
  continuousEnsureVirtualGrowth(continuousViewport.scrollTop);
  continuousPrefetchWindowKey = '';
  continuousApplyInteractiveTransform();
  continuousHideActiveStaticSlot();
  void continuousPrefetchAroundScroll({ force:true });
  saveActiveLesson({ touch:false });
}


function continuousVisibleSegmentRange(scrollTop = continuousViewport?.scrollTop || 0) {
  const h = Math.max(1, continuousSegmentHeight || continuousMetrics().height);
  const viewportHeight = Math.max(1, continuousViewport?.clientHeight || h);
  const first = Math.max(1, Math.floor(Math.max(0, scrollTop) / h) + 1);
  const last = Math.max(first, Math.floor((Math.max(0, scrollTop) + viewportHeight - 0.001) / h) + 1);
  return { first, last };
}

function continuousGetEntrySync(index, { createEmpty = false } = {}) {
  index = Math.max(1, Number(index) || 1);
  if (index === currentLessonBoardIndex && currentPageKind === 'agenda' && activeLesson?.id) {
    return continuousCaptureActiveEntry();
  }
  const cached = continuousSegmentCache.get(index);
  if (cached?.loaded) return cached;
  if (!createEmpty) return null;
  const descriptor = continuousSegmentDescriptor(index);
  const entry = {
    index,
    lessonId:String(activeLesson?.id || ''),
    key:descriptor.key,
    strokes:[],
    images:[],
    pageStyle:{ ...pageStyle },
    undoHistory:[],
    redoHistory:[],
    revision:0,
    loaded:true
  };
  continuousSegmentCache.set(index, entry);
  return entry;
}


function continuousDeepClone(value) {
  if (globalThis.structuredClone) return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function continuousStripRuntimeMeta(value) {
  const copy = continuousDeepClone(value);
  if (copy && typeof copy === 'object') {
    delete copy.__continuousOwnerIndex;
    delete copy.__continuousSourceId;
    delete copy.__continuousSources;
    delete copy.__continuousViewportProxy;
  }
  return copy;
}

function continuousStrokeToViewport(stroke, ownerIndex, scrollTop = continuousViewport?.scrollTop || 0, metrics = continuousMetrics()) {
  const copy = continuousDeepClone(stroke);
  const h = Math.max(1, continuousSegmentHeight || metrics.height);
  const convertY = (localY) => {
    const localPx = Number(localY || 0) * metrics.paperHeight - metrics.top;
    const docPx = (ownerIndex - 1) * h + localPx;
    return (metrics.top + docPx - scrollTop) / metrics.paperHeight;
  };
  if (isCrossPlatformTextItem(copy)) copy.y = convertY(copy.y);
  else if (Array.isArray(copy?.points)) copy.points = copy.points.map((point) => ({ ...point, y:convertY(point.y) }));
  copy.__continuousOwnerIndex = ownerIndex;
  copy.__continuousSourceId = String(stroke?.id || '');
  copy.__continuousSources = [{ id:String(stroke?.id || ''), ownerIndex }];
  copy.__continuousViewportProxy = true;
  return copy;
}

function continuousImageToViewport(image, ownerIndex, scrollTop = continuousViewport?.scrollTop || 0) {
  const copy = cloneImageObject(image);
  const h = Math.max(1, continuousSegmentHeight || continuousMetrics().height);
  const scrollUnits = Math.max(0, Number(scrollTop) || 0) / h;
  copy.y = (ownerIndex - 1) + Number(image?.y || 0) - scrollUnits;
  copy.__continuousOwnerIndex = ownerIndex;
  copy.__continuousSourceId = String(image?.id || '');
  copy.__continuousViewportProxy = true;
  return copy;
}

function continuousViewportTextToPersistent(stroke, scrollTop) {
  const metrics = continuousMetrics();
  const h = Math.max(1, continuousSegmentHeight || metrics.height);
  const raw = continuousStripRuntimeMeta(stroke);
  const docPx = Math.max(0, Number(scrollTop) + (Number(raw.y || 0) * metrics.paperHeight - metrics.top));
  const index = Math.max(1, Math.floor(docPx / h) + 1);
  const localPx = docPx - (index - 1) * h;
  raw.y = Math.max(0, Math.min(1, (metrics.top + localPx) / metrics.paperHeight));
  return [{ index, stroke:raw }];
}

function continuousViewportStrokeToPersistentPieces(stroke, scrollTop) {
  if (isCrossPlatformTextItem(stroke)) return continuousViewportTextToPersistent(stroke, scrollTop);
  return continuousSplitViewportStroke(continuousStripRuntimeMeta(stroke), scrollTop);
}

function continuousViewportImageToPersistent(image, scrollTop) {
  const h = Math.max(1, continuousSegmentHeight || continuousMetrics().height);
  const scrollUnits = Math.max(0, Number(scrollTop) || 0) / h;
  const docUnits = Math.max(0, scrollUnits + Number(image?.y || 0));
  const index = Math.max(1, Math.floor(docUnits) + 1);
  const raw = continuousStripRuntimeMeta(image);
  raw.y = Math.max(0, Math.min(.999999, docUnits - (index - 1)));
  raw.continuousOverflow = true;
  raw.modifiedAt = raw.modifiedAt || new Date().toISOString();
  return { index, image:raw };
}

function continuousViewportProxyVisible(item, isImage = false) {
  if (isImage) {
    const y = Number(item?.y || 0), h = Math.max(0, Number(item?.h || 0));
    return y + h >= -.08 && y <= 1.08;
  }
  if (isCrossPlatformTextItem(item)) return Number(item?.y || 0) >= -.08 && Number(item?.y || 0) <= 1.08;
  const points = Array.isArray(item?.points) ? item.points : [];
  if (!points.length) return false;
  let min = Infinity, max = -Infinity;
  for (const point of points) { const y = Number(point?.y || 0); min = Math.min(min, y); max = Math.max(max, y); }
  return max >= -.08 && min <= 1.08;
}

function continuousBuildViewportToolState() {
  if (!continuousLessonActive || !activeLesson?.id || !continuousViewport || !continuousSegmentHeight) return null;
  const { first, last } = continuousVisibleSegmentRange();
  const low = Math.max(1, first - 1);
  const high = Math.min(continuousVirtualCount, last + 1);
  const scrollTop = Math.max(0, Number(continuousViewport.scrollTop) || 0);
  const viewStrokes = [], viewImages = [];
  const grouped = new Map();
  for (let index = low; index <= high; index++) {
    const entry = continuousGetEntrySync(index);
    if (!entry?.loaded) continue;
    for (const stroke of entry.strokes || []) {
      if (isCrossPlatformTextItem(stroke) || !stroke?.continuousStrokeGroupId) {
        const proxy = continuousStrokeToViewport(stroke, index, scrollTop);
        if (continuousViewportProxyVisible(proxy, false)) viewStrokes.push(proxy);
        continue;
      }
      const groupId = String(stroke.continuousStrokeGroupId);
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      grouped.get(groupId).push({ index, stroke });
    }
    for (const image of entry.images || []) {
      const proxy = continuousImageToViewport(image, index, scrollTop);
      if (continuousViewportProxyVisible(proxy, true)) viewImages.push(proxy);
    }
  }
  // I frammenti creati esclusivamente dai confini tecnici del documento tornano
  // a essere un unico oggetto logico per Lazo/trasformazioni. I punti di giunzione
  // duplicati vengono eliminati, ma gli id persistenti dei frammenti restano tracciati.
  for (const [groupId, fragments] of grouped) {
    fragments.sort((a,b) => (Number(a.stroke?.continuousFragmentOrder) || 0) - (Number(b.stroke?.continuousFragmentOrder) || 0) || a.index - b.index);
    let proxy = null;
    const sources = [];
    for (const fragment of fragments) {
      const part = continuousStrokeToViewport(fragment.stroke, fragment.index, scrollTop);
      sources.push({ id:String(fragment.stroke?.id || ''), ownerIndex:fragment.index });
      if (!proxy) {
        proxy = part;
        proxy.id = groupId;
        proxy.points = Array.isArray(part.points) ? part.points.map((point) => ({...point})) : [];
      } else if (Array.isArray(part.points)) {
        const incoming = part.points.map((point) => ({...point}));
        if (proxy.points.length && incoming.length) {
          const a = proxy.points.at(-1), b = incoming[0];
          if (Math.abs(Number(a.x)-Number(b.x)) < 1e-8 && Math.abs(Number(a.y)-Number(b.y)) < 1e-8) incoming.shift();
        }
        proxy.points.push(...incoming);
      }
    }
    if (!proxy) continue;
    proxy.continuousStrokeGroupId = groupId;
    proxy.__continuousSourceId = sources[0]?.id || '';
    proxy.__continuousOwnerIndex = sources[0]?.ownerIndex || 1;
    proxy.__continuousSources = sources;
    proxy.__continuousViewportProxy = true;
    if (continuousViewportProxyVisible(proxy, false)) viewStrokes.push(proxy);
  }
  return {
    key:`lesson::${activeLesson.id}::viewport::${Math.round(scrollTop * 1000)}`,
    scrollTop,
    first, last, low, high,
    strokes:viewStrokes,
    images:viewImages,
    baselineStrokes:continuousDeepClone(viewStrokes),
    baselineImages:continuousDeepClone(viewImages)
  };
}

function continuousEnsureViewportToolState({ force = false } = {}) {
  if (!continuousLessonActive || currentPageKind !== 'agenda' || !activeLesson?.id) return null;
  if (!force && continuousViewportToolState) return continuousViewportToolState;
  continuousViewportToolState = continuousBuildViewportToolState();
  return continuousViewportToolState;
}

function continuousSetToolPreview(enabled) {
  paper?.classList.toggle('continuous-tool-preview', Boolean(enabled));
}

function continuousBeginEraserPreview() {
  if (!continuousLessonActive || currentPageKind !== 'agenda' || !activeLesson?.id) return;
  // Copy already-rendered Ink tiles once, at eraser DOWN. The existing live
  // destination-out path now erases visible Ink immediately. Images keep their
  // static owner; no database, cloning of point arrays or new work in drawBatch.
  const m = continuousMetrics();
  const scrollTop = Math.max(0, Number(continuousViewport?.scrollTop) || 0);
  const { first, last } = continuousVisibleSegmentRange(scrollTop);
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.rect(0,m.top,m.width,m.height);
  ctx.clip();
  for (let index = first; index <= last; index++) {
    const entry = continuousGetEntrySync(index);
    if (!entry?.loaded) continue;
    continuousRenderStaticSegment(index, entry);
    const tile = continuousSegmentSlots.get(index)?.canvas;
    if (tile) ctx.drawImage(tile,0,(index-1)*continuousSegmentHeight-scrollTop,m.width,m.paperHeight);
  }
  ctx.restore();
  paper?.classList.toggle('continuous-eraser-preview', true);
}

function continuousClearViewportToolState({ clearSelection = false } = {}) {
  continuousViewportToolState = null;
  continuousPendingLassoUndoProxyAction = null;
  continuousSetToolPreview(false);
  paper?.classList.toggle('continuous-eraser-preview', false);
  // The tiles own the images while scrolling/reading. Leaving the previous
  // tool image nodes here would show a stationary copy over the moving tiles.
  if (continuousLessonActive) {
    imageLayer?.replaceChildren();
    imageLayer?.classList.remove('interactive');
  }
  if (clearSelection) lassoTool?.clearSelection?.();
}

function continuousSnapshotSegment(index) {
  const entry = continuousGetEntrySync(index, { createEmpty:true });
  return {
    index,
    strokes:continuousDeepClone(entry?.strokes || []),
    images:continuousDeepClone(entry?.images || []),
    pageStyle:{ ...(entry?.pageStyle || pageStyle) }
  };
}

function continuousObjectJson(value) {
  try { return JSON.stringify(value); } catch { return ''; }
}

function continuousSyncSegmentReplacement(index, before, after, reason = 'continuous-tool') {
  const descriptor = continuousSegmentDescriptor(index);
  const beforeStrokes = new Map((before?.strokes || []).map((item) => [String(item?.id || ''), item]));
  const afterStrokes = new Map((after?.strokes || []).map((item) => [String(item?.id || ''), item]));
  for (const [id, item] of beforeStrokes) if (id && !afterStrokes.has(id)) syncFoundation?.recordStrokeDeleted(descriptor, id, reason);
  for (const [id, item] of afterStrokes) {
    const previous = beforeStrokes.get(id);
    if (!previous || continuousObjectJson(previous) !== continuousObjectJson(item)) syncFoundation?.recordStrokeAdded(descriptor, item);
  }
  const beforeImages = new Map((before?.images || []).map((item) => [String(item?.id || ''), item]));
  const afterImages = new Map((after?.images || []).map((item) => [String(item?.id || ''), item]));
  for (const [id] of beforeImages) if (id && !afterImages.has(id)) syncFoundation?.recordImageDeleted(descriptor, id);
  for (const [id, item] of afterImages) {
    const previous = beforeImages.get(id);
    if (!previous) syncFoundation?.recordImageMetadata(descriptor, 'image.add', item, { reason });
    else if (continuousObjectJson(previous) !== continuousObjectJson(item)) syncFoundation?.recordImageMetadata(descriptor, 'image.update', item, { before:previous, reason });
  }
}

function continuousApplySegmentSnapshots(snapshots, reason = 'history') {
  if (!Array.isArray(snapshots) || !snapshots.length) return false;
  for (const snapshot of snapshots) {
    const index = Math.max(1, Number(snapshot?.index) || 1);
    const entry = continuousGetEntrySync(index, { createEmpty:true });
    if (!entry) continue;
    const before = continuousSnapshotSegment(index);
    entry.strokes = continuousDeepClone(snapshot.strokes || []);
    entry.images = continuousDeepClone(snapshot.images || []);
    entry.pageStyle = normalizePageStyle(snapshot.pageStyle || entry.pageStyle || pageStyle);
    continuousMarkEntryChanged(index, entry);
    const after = continuousSnapshotSegment(index);
    continuousSyncSegmentReplacement(index, before, after, reason);
    for (let slotIndex = Math.max(1, index - 1); slotIndex <= Math.min(continuousVirtualCount, index + 1); slotIndex++) {
      const slot = continuousSegmentSlots.get(slotIndex); if (slot) slot.renderedKey = '';
      continuousRenderStaticSegment(slotIndex, continuousSegmentCache.get(slotIndex));
    }
  }
  continuousHideActiveStaticSlot();
  continuousClearViewportToolState({ clearSelection:true });
  if (continuousLessonActive && (activeTool === 'lasso' || activeTool === 'image')) {
    continuousEnsureViewportToolState({ force:true });
    continuousSetToolPreview(true);
  }
  renderAll();
  renderImages();
  lassoTool?.syncPage?.();
  scheduleSave();
  return true;
}

function continuousApplyToolHistory(action, direction = 'undo') {
  if (action?.type !== 'continuous-tool-snapshot') return false;
  return continuousApplySegmentSnapshots(direction === 'undo' ? action.before : action.after, `${direction}-${action.reason || 'continuous-tool'}`);
}

function continuousCommitDirectToolMutation(reason = 'continuous-tool') {
  continuousPendingLassoUndoProxyAction = { type:reason };
  const committed = continuousCommitViewportToolState(reason);
  if (!committed) continuousPendingLassoUndoProxyAction = null;
  return committed;
}

function continuousCommitViewportToolState(reason = 'continuous-tool') {
  if (!continuousViewportToolState || continuousInteractionCommitInProgress) return false;
  continuousInteractionCommitInProgress = true;
  try {
    const state = continuousViewportToolState;
    const oldStrokeOwners = new Map();
    const oldImageOwners = new Map();
    for (const item of state.baselineStrokes || []) {
      const sources = Array.isArray(item?.__continuousSources) && item.__continuousSources.length
        ? item.__continuousSources
        : [{ id:String(item?.__continuousSourceId || item?.id || ''), ownerIndex:Math.max(1, Number(item?.__continuousOwnerIndex) || 1) }];
      for (const source of sources) {
        const id = String(source?.id || '');
        const owner = Math.max(1, Number(source?.ownerIndex) || 1);
        if (id) oldStrokeOwners.set(id, owner);
      }
    }
    for (const item of state.baselineImages || []) {
      const id = String(item?.__continuousSourceId || item?.id || '');
      const owner = Math.max(1, Number(item?.__continuousOwnerIndex) || 1);
      if (id) oldImageOwners.set(id, owner);
    }

    const generatedStrokeGroups = [];
    const generatedStrokes = [];
    const generatedImages = [];
    for (const proxy of state.strokes || []) {
      const pieces = continuousViewportStrokeToPersistentPieces(proxy, state.scrollTop);
      generatedStrokeGroups.push({ proxy, pieces });
      generatedStrokes.push(...pieces);
    }
    for (const proxy of state.images || []) generatedImages.push({ proxy, ...continuousViewportImageToPersistent(proxy, state.scrollTop) });

    const affected = new Set([...oldStrokeOwners.values(), ...oldImageOwners.values(), ...generatedStrokes.map((x) => x.index), ...generatedImages.map((x) => x.index)]);
    if (!affected.size) return false;
    // Capture the active segment ONCE. Re-reading it while replacing its arrays
    // would copy the old global `strokes` back into the cache, resurrecting the
    // handwriting that Beautify/Lazo just removed. Prepare every segment first,
    // then publish the complete replacement to cache and active arrays together.
    const workingEntries = new Map();
    const snapshotOf = (index, entry) => ({ index,
      strokes:continuousDeepClone(entry.strokes || []),
      images:continuousDeepClone(entry.images || []),
      pageStyle:{ ...(entry.pageStyle || pageStyle) }
    });
    const beforeSnapshots = [];
    for (const index of [...affected].sort((a,b)=>a-b)) {
      const original = continuousGetEntrySync(index, { createEmpty:true });
      beforeSnapshots.push(snapshotOf(index, original));
      workingEntries.set(index, { ...original,
        strokes:continuousDeepClone(original.strokes || []),
        images:continuousDeepClone(original.images || []),
        pageStyle:{ ...(original.pageStyle || pageStyle) }
      });
    }

    for (const [id, owner] of oldStrokeOwners) {
      const entry = workingEntries.get(owner);
      entry.strokes = (entry.strokes || []).filter((item) => String(item?.id || '') !== id);
    }
    for (const [id, owner] of oldImageOwners) {
      const entry = workingEntries.get(owner);
      entry.images = (entry.images || []).filter((item) => String(item?.id || '') !== id);
    }
    for (const piece of generatedStrokes) {
      const entry = workingEntries.get(piece.index);
      entry.strokes.push(piece.stroke);
    }
    for (const piece of generatedImages) {
      const entry = workingEntries.get(piece.index);
      entry.images.push(piece.image);
    }
    // Aggiorna la mappa runtime senza ricostruire la selezione: un proxy Lazo
    // può corrispondere a più frammenti persistenti ma resta un solo oggetto UI.
    for (const group of generatedStrokeGroups) {
      group.proxy.__continuousSources = group.pieces.map((piece) => ({ id:String(piece.stroke?.id || ''), ownerIndex:piece.index }));
      group.proxy.__continuousSourceId = String(group.pieces[0]?.stroke?.id || group.proxy.id || '');
      group.proxy.__continuousOwnerIndex = Math.max(1, Number(group.pieces[0]?.index) || Number(group.proxy.__continuousOwnerIndex) || 1);
    }
    for (const piece of generatedImages) {
      piece.proxy.__continuousSourceId = String(piece.image?.id || piece.proxy.id || '');
      piece.proxy.__continuousOwnerIndex = piece.index;
    }

    const afterSnapshots = [...workingEntries].map(([index,entry]) => snapshotOf(index,entry));
    let changed = false;
    for (let i = 0; i < beforeSnapshots.length; i++) {
      if (continuousObjectJson(beforeSnapshots[i]) !== continuousObjectJson(afterSnapshots[i])) { changed = true; break; }
    }
    if (!changed) {
      state.baselineStrokes = continuousDeepClone(state.strokes || []);
      state.baselineImages = continuousDeepClone(state.images || []);
      continuousPendingLassoUndoProxyAction = null;
      return false;
    }

    for (const index of affected) {
      const entry = workingEntries.get(index);
      continuousMarkEntryChanged(index, entry);
      const before = beforeSnapshots.find((x) => x.index === index);
      const after = afterSnapshots.find((x) => x.index === index);
      continuousSyncSegmentReplacement(index, before, after, reason);
      for (let slotIndex = Math.max(1, index - 1); slotIndex <= Math.min(continuousVirtualCount, index + 1); slotIndex++) {
        const slot = continuousSegmentSlots.get(slotIndex); if (slot) slot.renderedKey = '';
      }
    }
    if (continuousPendingLassoUndoProxyAction) {
      rememberUndo({ type:'continuous-tool-snapshot', reason:continuousPendingLassoUndoProxyAction.type || reason, before:beforeSnapshots, after:afterSnapshots });
      continuousPendingLassoUndoProxyAction = null;
    }
    state.baselineStrokes = continuousDeepClone(state.strokes || []);
    state.baselineImages = continuousDeepClone(state.images || []);
    for (const index of affected) continuousRenderStaticSegment(index, continuousSegmentCache.get(index));
    continuousHideActiveStaticSlot();
    dirty = true;
    return true;
  } finally {
    continuousInteractionCommitInProgress = false;
  }
}

async function continuousEnsureVisibleEntries() {
  if (!continuousLessonActive || !continuousViewport || !activeLesson?.id) return true;
  const { first, last } = continuousVisibleSegmentRange();
  const jobs = [];
  for (let index = first; index <= last; index++) {
    if (continuousGetEntrySync(index)) continue;
    jobs.push(continuousLoadSegment(index));
  }
  if (jobs.length) await Promise.all(jobs);
  return true;
}

function continuousPointToDocument(point, scrollTop, metrics = continuousMetrics()) {
  const localWritableY = Number(point?.y || 0) * metrics.paperHeight - metrics.top;
  return {
    x:Math.max(0, Math.min(1, Number(point?.x) || 0)),
    docY:Math.max(0, Number(scrollTop) + localWritableY),
    p:Number.isFinite(Number(point?.p)) ? Number(point.p) : .5,
    t:Number.isFinite(Number(point?.t)) ? Number(point.t) : performance.now()
  };
}

function continuousDocumentPointToSegment(point, index, metrics = continuousMetrics(), localOverride = null) {
  const h = Math.max(1, continuousSegmentHeight || metrics.height);
  const local = localOverride == null ? point.docY - (index - 1) * h : localOverride;
  return {
    x:Math.max(0, Math.min(1, point.x)),
    y:Math.max(0, Math.min(1, (metrics.top + Math.max(0, Math.min(h, local))) / metrics.paperHeight)),
    p:point.p,
    t:point.t
  };
}

function continuousInterpolateDocumentPoint(a, b, docY) {
  const dy = b.docY - a.docY;
  const u = Math.abs(dy) < 1e-9 ? 0 : Math.max(0, Math.min(1, (docY - a.docY) / dy));
  return {
    x:a.x + (b.x - a.x) * u,
    docY,
    p:a.p + (b.p - a.p) * u,
    t:a.t + (b.t - a.t) * u
  };
}

function continuousSplitViewportStroke(stroke, scrollTop = continuousStrokeScrollTop) {
  const sourcePoints = Array.isArray(stroke?.points) ? stroke.points : [];
  if (!sourcePoints.length || !continuousSegmentHeight) return [];
  const metrics = continuousMetrics();
  const h = Math.max(1, continuousSegmentHeight);
  const globals = sourcePoints.map((point) => continuousPointToDocument(point, scrollTop, metrics));
  const fragments = [];
  let fragmentIndex = Math.max(1, Math.floor(globals[0].docY / h) + 1);
  let fragmentPoints = [continuousDocumentPointToSegment(globals[0], fragmentIndex, metrics)];

  const groupId = String(stroke?.continuousStrokeGroupId || stroke?.id || makeId());
  const pushFragment = () => {
    if (!fragmentPoints.length) return;
    const order = fragments.length;
    const fragment = {
      ...stroke,
      id:order ? makeId() : (stroke.id || makeId()),
      continuousStrokeGroupId:groupId,
      continuousFragmentOrder:order,
      points:fragmentPoints.map((point) => ({ ...point }))
    };
    fragments.push({ index:fragmentIndex, stroke:fragment });
  };

  for (let i = 1; i < globals.length; i++) {
    const a = globals[i - 1];
    const b = globals[i];
    const direction = Math.sign(b.docY - a.docY);
    if (!direction) {
      fragmentPoints.push(continuousDocumentPointToSegment(b, fragmentIndex, metrics));
      continue;
    }
    let nextBoundary = direction > 0 ? fragmentIndex * h : (fragmentIndex - 1) * h;
    const crosses = () => direction > 0 ? b.docY >= nextBoundary && a.docY < nextBoundary : b.docY <= nextBoundary && a.docY > nextBoundary;
    while (crosses()) {
      const boundaryPoint = continuousInterpolateDocumentPoint(a, b, nextBoundary);
      const edgeLocal = direction > 0 ? h : 0;
      fragmentPoints.push(continuousDocumentPointToSegment(boundaryPoint, fragmentIndex, metrics, edgeLocal));
      pushFragment();
      fragmentIndex += direction;
      fragmentIndex = Math.max(1, fragmentIndex);
      const nextLocal = direction > 0 ? 0 : h;
      fragmentPoints = [continuousDocumentPointToSegment(boundaryPoint, fragmentIndex, metrics, nextLocal)];
      nextBoundary = direction > 0 ? fragmentIndex * h : (fragmentIndex - 1) * h;
      if (fragmentIndex === 1 && direction < 0) break;
    }
    fragmentPoints.push(continuousDocumentPointToSegment(b, fragmentIndex, metrics));
  }
  pushFragment();
  return fragments;
}

function continuousMarkEntryChanged(index, entry) {
  if (!entry) return;
  entry.revision = Math.max(0, Number(entry.revision) || 0) + 1;
  continuousSegmentCache.set(index, entry);
  continuousDirtySegments.add(index);
  const slot = continuousSegmentSlots.get(index);
  if (slot) slot.renderedKey = '';
  if (index === currentLessonBoardIndex) {
    strokes = entry.strokes;
    images = entry.images;
    dirty = true;
  }
  if (activeLesson) {
    activeLesson = normalizeLesson({
      ...activeLesson,
      boardCount:Math.max(Number(activeLesson.boardCount) || 1, index),
      currentBoardIndex:currentLessonBoardIndex
    });
  }
  continuousVirtualCount = Math.max(continuousVirtualCount, index + CONTINUOUS_GROW_AHEAD);
  continuousUpdateTrackHeight();
}

function continuousCommitCompletedInkStroke(stroke) {
  const pieces = continuousSplitViewportStroke(stroke, continuousStrokeScrollTop);
  if (!pieces.length) return false;
  const action = { type:'continuous-add-stroke', pieces:[] };
  for (const piece of pieces) {
    const entry = continuousGetEntrySync(piece.index, { createEmpty:piece.index > Number(activeLesson?.boardCount || 1) });
    if (!entry) {
      console.warn('Segmento continuo non disponibile al PEN UP', piece.index);
      return false;
    }
    entry.strokes.push(piece.stroke);
    continuousMarkEntryChanged(piece.index, entry);
    syncFoundation?.recordStrokeAdded(continuousSegmentDescriptor(piece.index), piece.stroke);
    action.pieces.push({ index:piece.index, stroke:piece.stroke });
  }
  rememberUndo(action);
  for (const piece of pieces) continuousRenderStaticSegment(piece.index, continuousSegmentCache.get(piece.index));
  continuousHideActiveStaticSlot();
  renderAll();
  return true;
}

function continuousRecordEraseChanges(index, changes, reason = 'eraser-structural') {
  const descriptor = continuousSegmentDescriptor(index);
  for (const change of changes || []) {
    if (change?.original?.id) syncFoundation?.recordStrokeDeleted(descriptor, change.original.id, reason);
    for (const fragment of change?.fragments || []) {
      if (fragment?.id) syncFoundation?.recordStrokeAdded(descriptor, fragment);
    }
  }
}

function continuousApplyCompletedEraser(eraserStroke) {
  paper?.classList.toggle('continuous-eraser-preview', false);
  const pieces = continuousSplitViewportStroke(eraserStroke, continuousStrokeScrollTop);
  if (!pieces.length) return false;
  const eraseStarted = performance.now();
  const segmentActions = [];
  let touchedTotal = 0;
  let fragmentTotal = 0;

  for (const piece of pieces) {
    const entry = continuousGetEntrySync(piece.index);
    if (!entry) continue;
    const before = entry.strokes;
    const result = structuralErase(before, piece.stroke, {
      widthPx:Math.max(1, rect?.width || canvas.clientWidth || 1024),
      heightPx:Math.max(1, rect?.height || canvas.clientHeight || 1366),
      makeFragmentId:() => makeId(),
      eligible:(item) => !isCrossPlatformTextItem(item)
    });
    const textChanges = [];
    for (let index = 0; index < before.length; index++) {
      const item = before[index];
      if (!isCrossPlatformTextItem(item) || !item?.id) continue;
      if (textItemHitByEraser(item, piece.stroke)) textChanges.push({ original:item, originalIndex:index, fragments:[] });
    }
    const removedTextIds = new Set(textChanges.map((change) => String(change.original?.id || '')));
    const changes = [...result.changes, ...textChanges];
    if (!changes.length) continue;
    // Una cancellazione strutturale rompe intenzionalmente l'unità logica del
    // tratto originario. I frammenti residui ricevono gruppi propri: in questo
    // modo il Lazo non trascina parti ormai separate solo perché prima del colpo
    // di gomma appartenevano allo stesso stroke multi-segmento.
    for (const change of result.changes || []) {
      for (const fragment of change.fragments || []) {
        fragment.continuousStrokeGroupId = String(fragment.id || makeId());
        fragment.continuousFragmentOrder = 0;
      }
    }
    entry.strokes = result.strokes.filter((item) => !removedTextIds.has(String(item?.id || '')));
    touchedTotal += (result.touched || 0) + textChanges.length;
    fragmentTotal += result.fragments || 0;
    segmentActions.push({ index:piece.index, changes });
    continuousRecordEraseChanges(piece.index, changes);
    continuousMarkEntryChanged(piece.index, entry);
    continuousRenderStaticSegment(piece.index, entry);
  }

  const eraseMs = performance.now() - eraseStarted;
  session.structuralErasures++;
  session.structuralEraseTouched += touchedTotal;
  session.structuralEraseFragments += fragmentTotal;
  session.maxStructuralEraseMs = Math.max(session.maxStructuralEraseMs, eraseMs);
  if (!segmentActions.length) { renderAll(); return false; }
  rememberUndo({ type:'continuous-erase-strokes', segments:segmentActions });
  continuousHideActiveStaticSlot();
  renderAll();
  return true;
}

function continuousApplyInkHistory(action, direction = 'undo') {
  if (!action || !continuousLessonActive) return false;
  if (action.type === 'continuous-add-stroke') {
    for (const piece of action.pieces || []) {
      const entry = continuousGetEntrySync(piece.index);
      if (!entry) continue;
      if (direction === 'undo') {
        entry.strokes = entry.strokes.filter((item) => item?.id !== piece.stroke?.id);
        if (piece.stroke?.id) syncFoundation?.recordStrokeDeleted(continuousSegmentDescriptor(piece.index), piece.stroke.id, 'undo');
      } else if (piece.stroke?.id && !entry.strokes.some((item) => item?.id === piece.stroke.id)) {
        entry.strokes.push(piece.stroke);
        syncFoundation?.recordStrokeAdded(continuousSegmentDescriptor(piece.index), piece.stroke);
      }
      continuousMarkEntryChanged(piece.index, entry);
      continuousRenderStaticSegment(piece.index, entry);
    }
    continuousHideActiveStaticSlot();
    renderAll();
    return true;
  }
  if (action.type === 'continuous-erase-strokes') {
    for (const segment of action.segments || []) {
      const entry = continuousGetEntrySync(segment.index);
      if (!entry) continue;
      const descriptor = continuousSegmentDescriptor(segment.index);
      if (direction === 'undo') {
        const fragmentIds = new Set((segment.changes || []).flatMap((change) => (change.fragments || []).map((fragment) => fragment?.id).filter(Boolean)));
        entry.strokes = entry.strokes.filter((item) => !fragmentIds.has(item?.id));
        for (const change of [...(segment.changes || [])].sort((a,b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0))) {
          const original = change?.original;
          if (!original?.id || entry.strokes.some((item) => item.id === original.id)) continue;
          const at = Math.max(0, Math.min(Number(change.originalIndex) || 0, entry.strokes.length));
          entry.strokes.splice(at, 0, original);
          syncFoundation?.recordStrokeAdded(descriptor, original);
          for (const fragment of change.fragments || []) if (fragment?.id) syncFoundation?.recordStrokeDeleted(descriptor, fragment.id, 'undo-eraser');
        }
      } else {
        for (const change of [...(segment.changes || [])].sort((a,b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0))) {
          const original = change?.original;
          if (!original?.id) continue;
          const at = entry.strokes.findIndex((item) => item.id === original.id);
          if (at < 0) continue;
          entry.strokes.splice(at, 1, ...(change.fragments || []));
          syncFoundation?.recordStrokeDeleted(descriptor, original.id, 'redo-eraser');
          for (const fragment of change.fragments || []) if (fragment?.id) syncFoundation?.recordStrokeAdded(descriptor, fragment);
        }
      }
      continuousMarkEntryChanged(segment.index, entry);
      continuousRenderStaticSegment(segment.index, entry);
    }
    continuousHideActiveStaticSlot();
    renderAll();
    return true;
  }
  return false;
}

async function continuousPreparePointerSegment(ev) {
  if (!continuousLessonActive || !activeLesson?.id || currentPageKind !== 'agenda') return true;
  continuousStopMomentum();
  clearTimeout(continuousScrollSettleTimer);
  const targetIndex = continuousSegmentAtClientY(ev.clientY);
  if (targetIndex === currentLessonBoardIndex) {
    continuousApplyInteractiveTransform();
    return true;
  }
  const cached = continuousSegmentCache.get(targetIndex);
  if (!cached?.loaded) {
    // Non avviamo un tratto su dati non ancora caricati. Il caricamento avviene
    // al PEN DOWN, mai nel pointermove, e il prefetch rende questo caso eccezionale.
    statusLabel.textContent = 'preparo area di scrittura…';
    await continuousLoadSegment(targetIndex);
  }
  return continuousSwitchToSegment(targetIndex, { savePrevious:true });
}

async function loadLessonBoard(lesson, boardIndex = 1, statusText = 'lezione caricata') {
  if (!lesson) return false;
  await openDb();
  if (drawing) finalizeStroke('lesson-switch');
  // Voice/Lazo hanno stato runtime separato dal documento. Un cambio lavagna deve
  // chiudere solo la gesture/sessione pendente, senza modificare il motore Ink.
  if (voiceScript?.isActive?.()) voiceScript.stopAndFinalize('lesson-switch');
  if (lassoPointerId != null || lassoTouchId != null) resetLassoInputCapture();
  cancelPendingSave();
  if (continuousLessonActive && activeLesson?.id && currentPageKind === 'agenda') {
    const ok = await flushContinuousSegmentSaves();
    if (!ok) { statusLabel.textContent = 'salvataggio lezione non riuscito'; scheduleSave(); return false; }
  } else if (ready && dirty) {
    const ok = await persistSnapshot(pageDescriptor(), strokes, false, pageStyle, images);
    if (!ok) { statusLabel.textContent = 'salvataggio non riuscito'; scheduleSave(); return false; }
  }
  // Solo dopo conferma del flush la sessione può cambiare identità.
  continuousClearRuntime({ keepLesson:false });
  activeLesson = normalizeLesson(lesson);
  currentLessonBoardIndex = Math.max(1, Math.min(Number(activeLesson.boardCount) || 1, Number(boardIndex) || 1));
  currentDate = activeLesson.acquisitionDate;
  currentPageKind = 'agenda';
  currentNoteIndex = 0;
  currentNoteTotal = 0;
  saveActiveLesson();
  const key = lessonBoardKey(activeLesson.id, currentLessonBoardIndex);
  // 0.1.34 — una lezione usa esclusivamente segmenti virtuali del foglio continuo.
  // Nessuna pagina/Nota secondaria viene creata o conteggiata.
  const record = await getRecord(key).catch(() => null);
  session.storageReads++;
  currentNoteTotal = 0;
  strokes = Array.isArray(record?.strokes) ? record.strokes : [];
  images = imagesFromRecord(record);
  selectedImageId = null;
  pageStyle = pageStyleForDescriptor(record, pageDescriptor());
  applyPageStyle();
  applyToolDefaultsForPaper(pageStyle.color);
  updatePageStyleUi();
  resetUndoHistory();
  dirty = false;
  await migrateLegacyErasersOnCurrentPage();
  updateHeader();
  resizeCanvas();
  renderAll();
  renderImages();
  restoreAgendaInteractiveTools('lesson-board-loaded');
  await continuousActivate({ segmentIndex:currentLessonBoardIndex, offset:0, preserveCache:false });
  hideLessonHomeScreen();
  statusLabel.textContent = statusText;
  return true;
}

function lastEditedLesson() {
  const lessons = lessonIndex.map(normalizeLesson).filter(Boolean);
  if (!lessons.length) return null;
  lessons.sort((a, b) => String(b.lastEditedAt || b.createdAt).localeCompare(String(a.lastEditedAt || a.createdAt)));
  return lessons[0] || null;
}

function setLessonSetupMode(mode = 'new') {
  const openMode = mode === 'open';
  if (lessonSetupNewPanel) lessonSetupNewPanel.hidden = openMode;
  if (lessonSetupOpenPanel) lessonSetupOpenPanel.hidden = !openMode;
  lessonSetupNewTabButton?.classList.toggle('selected', !openMode);
  lessonSetupOpenTabButton?.classList.toggle('selected', openMode);
  lessonSetupNewTabButton?.setAttribute('aria-selected', !openMode ? 'true' : 'false');
  lessonSetupOpenTabButton?.setAttribute('aria-selected', openMode ? 'true' : 'false');
  if (openMode) renderLessonStartupArchive();
  else if (!lessonSetupNewSubjectSelected) window.setTimeout(() => lessonSetupTopic?.focus(), 60);
}

async function resumeLessonAtSavedPosition(lesson, statusText = 'lezione ripresa') {
  const normalized = normalizeLesson(lesson);
  if (!normalized) return false;
  const boardIndex = Math.max(1, Math.min(Number(normalized.boardCount) || 1, Number(normalized.lastScrollSegment) || Number(normalized.currentBoardIndex) || 1));
  const wantedKind = normalized.lastPageKind || 'agenda';
  const wantedTimetableIndex = Math.max(1, Number(normalized.lastTimetableIndex) || 1);
  const wantedOffset = Math.max(0, Math.min(.999999, Number(normalized.lastScrollOffset) || 0));
  const ok = await loadLessonBoard(normalized, boardIndex, statusText);
  if (!ok) return false;
  try {
    await continuousActivate({ segmentIndex:boardIndex, offset:wantedOffset, preserveCache:true });
    if (wantedKind === 'planner-daily') {
      await openLessonGoalsFromPage();
    } else if (wantedKind === 'planner-timetable') {
      await openLessonGoalsFromPage();
      await openWeeklyTimetable();
    }
    saveActiveLesson({ touch:false });
    statusLabel.textContent = statusText;
    return true;
  } catch (err) {
    console.warn('Ripresa posizione lezione non riuscita, uso la pagina principale', err);
    statusLabel.textContent = statusText;
    return true;
  }
}

async function resumeLastLessonFromStartup() {
  const lesson = lastEditedLesson();
  if (!lesson) {
    if (lessonSetupStatus) lessonSetupStatus.textContent = 'Nessuna lezione precedente da riprendere.';
    return;
  }
  if (lessonSetupStatus) lessonSetupStatus.textContent = 'Ripristino ultima posizione…';
  const ok = await resumeLessonAtSavedPosition(lesson, 'ultima lezione ripresa');
  if (!ok) return;
  if (lessonSetupPanel) lessonSetupPanel.hidden = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  restoreAgendaInteractiveTools('lesson-resumed-exact');
}

function showLessonHomeScreen(statusText = 'pronto') {
  if (!paper || !lessonHomeScreen) return;
  paper.classList.add('lesson-home-mode');
  lessonHomeScreen.hidden = false;
  lessonHomeScreen.setAttribute('aria-hidden', 'false');
  if (statusLabel && statusText) statusLabel.textContent = statusText;
}

function hideLessonHomeScreen() {
  if (!paper || !lessonHomeScreen) return;
  paper.classList.remove('lesson-home-mode');
  lessonHomeScreen.hidden = true;
  lessonHomeScreen.setAttribute('aria-hidden', 'true');
}

function nextGenericLessonTopic() {
  let maxTopic = 0;
  let genericCount = 0;
  for (const item of lessonIndex.map(normalizeLesson).filter(Boolean)) {
    if (String(item.subject || '').localeCompare('Generica', 'it', { sensitivity:'base' }) !== 0) continue;
    genericCount += 1;
    const match = /^Argomento\s+(\d+)$/i.exec(String(item.topic || '').trim());
    if (match) maxTopic = Math.max(maxTopic, Number(match[1]) || 0);
  }
  return `Argomento ${Math.max(maxTopic + 1, genericCount + 1, 1)}`;
}

function ensureGenericLessonSubject() {
  const existing = lessonSubjects.find((subject) => String(subject).localeCompare('Generica', 'it', { sensitivity:'base' }) === 0);
  if (existing) return existing;
  lessonSubjects.push('Generica');
  saveLessonSubjects();
  return 'Generica';
}

async function closeCurrentLessonToStartup() {
  if (!activeLesson) {
    showLessonHomeScreen('pronto');
    return;
  }
  if (drawing) finalizeStroke('lesson-close');
  if (continuousLessonActive) {
    const continuousSaved = await flushContinuousSegmentSaves();
    if (!continuousSaved) {
      statusLabel.textContent = 'salvataggio lezione non riuscito';
      scheduleSave();
      return;
    }
  }
  cancelPendingSave();
  if (ready && dirty) {
    await persistNow();
    if (dirty) {
      statusLabel.textContent = 'salvataggio lezione non riuscito';
      scheduleSave();
      return;
    }
  }
  saveActiveLesson({ touch:true });
  const closedId = activeLesson.id;
  continuousClearRuntime({ keepLesson:false });
  activeLesson = null;
  try { localStorage.removeItem(ACTIVE_LESSON_STORAGE_KEY); } catch {}
  renderLessonHeaderFor(document);
  closeLessonButton?.setAttribute('hidden', '');
  statusLabel.textContent = 'lezione salvata e chiusa';
  showLessonHomeScreen('lezione salvata e chiusa');
  if (lessonSetupStatus) lessonSetupStatus.textContent = lessonIndex.some((item) => item.id === closedId) ? 'Lezione salvata automaticamente.' : '';
}

async function startNewLessonFromDialog() {
  const requestedNewSubject = cleanLessonText(lessonSetupNewSubjectInput()?.value, 80);
  if (lessonSetupNewSubjectSelected && requestedNewSubject) {
    if (!commitLessonSetupNewSubject()) return;
  }
  let subject = cleanLessonText(lessonSetupSubject?.value, 80);
  let topic = cleanLessonText(lessonSetupTopic?.value, 160);

  // 0.1.43: Nuova lezione può partire senza selezioni. In quel caso viene
  // creata automaticamente Generica / Argomento N, senza modificare il flusso
  // delle lezioni per cui l'utente sceglie esplicitamente materia/argomento.
  const noExplicitSubject = !subject && !requestedNewSubject;
  if (noExplicitSubject) subject = ensureGenericLessonSubject();
  if (!topic && String(subject).localeCompare('Generica', 'it', { sensitivity:'base' }) === 0) {
    topic = nextGenericLessonTopic();
  }
  if (!subject) { if (lessonSetupStatus) lessonSetupStatus.textContent = 'Seleziona una materia.'; return; }
  if (!topic) { if (lessonSetupStatus) lessonSetupStatus.textContent = 'Inserisci l’argomento della lezione.'; lessonSetupTopic?.focus(); return; }

  const lesson = createLessonRecord(subject, topic);
  lessonIndex.push({ ...lesson });
  saveLessonIndex();
  const loaded = await loadLessonBoard(lesson, 1, 'nuova lezione');
  if (!loaded) return;
  if (lessonSetupPanel) lessonSetupPanel.hidden = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  restoreAgendaInteractiveTools('new-lesson-started');
}

function openLessonSetup({ startup = false, tab = 'new' } = {}) {
  if (voiceScript?.isActive?.()) voiceScript.stopAndFinalize('lesson-setup');
  if (isLassoUiArmed()) {
    resetLassoInputCapture();
    lassoTool?.setActive?.(false);
    setLassoInputShieldActive(false);
    if (activeTool === 'lasso') activeTool = 'pen';
    lassoSessionArmed = false;
  }
  renderLessonSubjectSettings();
  if (lessonSetupDate) lessonSetupDate.textContent = formatLessonDate(localISODate(new Date()));
  const defaultSubject = activeLesson?.subject || lastEditedLesson()?.subject || lessonSubjects[0] || '';
  lessonSetupNewSubjectSelected = true;
  lessonSetupNewSubjectExpanded = false;
  if (lessonSetupSubject) lessonSetupSubject.value = '';
  renderLessonSubjectPicker(defaultSubject, { preferNew:true });
  if (lessonSetupTopic) lessonSetupTopic.value = '';
  if (lessonSetupStatus) lessonSetupStatus.textContent = '';
  const resumable = Boolean(lastEditedLesson());
  if (lessonSetupResumeButton) {
    lessonSetupResumeButton.disabled = !resumable;
    lessonSetupResumeButton.setAttribute('aria-disabled', resumable ? 'false' : 'true');
  }
  if (lessonSetupCloseButton) lessonSetupCloseButton.hidden = startup;
  if (lessonSetupPanel) {
    lessonSetupPanel.dataset.startup = startup ? 'true' : 'false';
    lessonSetupPanel.hidden = false;
  }
  setLessonSetupMode(tab === 'open' ? 'open' : 'new');
}

function closeLessonSetup() {
  if (lessonSetupPanel) lessonSetupPanel.hidden = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (!activeLesson || paper?.classList.contains('lesson-home-mode')) showLessonHomeScreen('pronto');
  restoreAgendaInteractiveTools('lesson-dialog-close');
}

function renderLessonArchiveInto(body) {
  if (!body) return;
  body.replaceChildren();
  const lessons = lessonIndex.map(normalizeLesson).filter(Boolean);
  if (!lessons.length) {
    const empty = document.createElement('div'); empty.className='lesson-archive-empty'; empty.textContent='Nessuna lezione memorizzata.'; body.appendChild(empty); return;
  }
  const groups = new Map();
  for (const lesson of lessons) {
    const key = lesson.subject || 'Senza materia';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lesson);
  }
  for (const subject of [...groups.keys()].sort((a,b) => a.localeCompare(b,'it',{sensitivity:'base'}))) {
    const section = document.createElement('section'); section.className='lesson-archive-group';
    const title = document.createElement('h3'); title.textContent=subject; section.appendChild(title);
    const list = document.createElement('div'); list.className='lesson-archive-list';
    groups.get(subject).sort((a,b) => a.acquisitionDate.localeCompare(b.acquisitionDate) || a.createdAt.localeCompare(b.createdAt)).forEach((lesson) => {
      const item = document.createElement('div'); item.className='lesson-archive-item';
      // 0.1.18: la riga e' solo informativa. L'apertura non deve piu' essere
      // associata al tap/click della voce: esiste il pulsante Apri dedicato.
      const row = document.createElement('div'); row.className='lesson-archive-row'; row.setAttribute('role','group');
      const date = document.createElement('span'); date.className='lesson-archive-date'; date.textContent=formatLessonDate(lesson.acquisitionDate);
      const topic = document.createElement('span'); topic.className='lesson-archive-topic'; topic.textContent=lesson.topic;
      const pages = document.createElement('span'); pages.className='lesson-archive-pages'; pages.textContent='Foglio continuo';
      row.append(date,topic,pages);
      const actions = document.createElement('div'); actions.className='lesson-archive-actions';
      const open = document.createElement('button'); open.type='button'; open.className='lesson-archive-open'; open.dataset.lessonOpen=lesson.id; open.textContent='Apri'; open.setAttribute('aria-label',`Apri lezione ${lesson.subject} - ${lesson.topic}`);
      const openPdf = document.createElement('button'); openPdf.type='button'; openPdf.className='lesson-archive-open-pdf'; openPdf.dataset.lessonPdfOpen=lesson.id; openPdf.textContent='Apri PDF'; openPdf.setAttribute('aria-label',`Apri PDF della lezione ${lesson.subject} - ${lesson.topic}`);
      const exportPdf = document.createElement('button'); exportPdf.type='button'; exportPdf.className='lesson-archive-export-pdf'; exportPdf.dataset.lessonPdfExport=lesson.id; exportPdf.textContent='Esporta PDF'; exportPdf.setAttribute('aria-label',`Esporta PDF della lezione ${lesson.subject} - ${lesson.topic}`);
      const remove = document.createElement('button'); remove.type='button'; remove.className='lesson-archive-delete'; remove.dataset.lessonDelete=lesson.id; remove.textContent='Elimina'; remove.setAttribute('aria-label',`Elimina lezione ${lesson.subject} - ${lesson.topic}`);
      actions.append(open,openPdf,exportPdf,remove);
      item.append(row,actions);
      // I pulsanti Archivio NON usano bindDirectUiButton: quel percorso attiva
      // al pointerdown e impedirebbe alla Pencil di iniziare uno scroll.
      list.appendChild(item);
    });
    section.appendChild(list); body.appendChild(section);
  }
}


function renderLessonArchive() { renderLessonArchiveInto(lessonArchiveBody); }
function renderLessonStartupArchive() { renderLessonArchiveInto(lessonStartupArchiveBody); }

// A read-only export of one lesson. Persist pending edits before taking a
// consistent pages/Blob snapshot; never navigate the active lesson to export it.
async function captureLessonForPdf(lessonId) {
  if (!ready || backupSnapshotFreeze || restoreOperationLocked || isSyncRestorePending()) throw new Error('Attendi il completamento dell’avvio o del ripristino in corso.');
  if (beautifyBusy || imageBusy || imageGesture || shapeGesture || voiceScript?.isActive?.()) throw new Error('Attendi il completamento della modifica della lezione, poi riprova.');
  lessonPdfSnapshotBusy = true;
  try {
    await beginBackupSnapshotFreeze();
    if (drawing) finalizeStroke('lesson-pdf');
    cancelPendingSave();
    if (continuousLessonActive && activeLesson?.id && currentPageKind === 'agenda') {
      if (!await flushContinuousSegmentSaves()) throw new Error('La lezione non è ancora salvata: riprova prima di esportare il PDF.');
    } else if (dirty) {
      await persistNow();
      if (dirty) throw new Error('La pagina corrente non è ancora salvata.');
    }
    const lesson = normalizeLesson(lessonIndex.find(item => item.id === lessonId));
    if (!lesson) throw new Error('Lezione non più presente in archivio.');
    await openDb();
    const prefix = `lesson::${lesson.id}::`;
    const snapshot = await new Promise((resolve,reject) => {
      const tx = db.transaction([STORE,SYNC_BLOB_STORE],'readonly');
      const request = tx.objectStore(STORE).getAll(IDBKeyRange.bound(prefix,prefix + '\uffff'));
      let records = []; const blobs = new Map();
      request.onsuccess = () => {
        records = request.result || [];
        const hashes = new Set(records.flatMap(row => (row.images || []).map(image => image.blobHash)).filter(Boolean));
        for (const hash of hashes) {
          const imageRequest = tx.objectStore(SYNC_BLOB_STORE).get(hash);
          imageRequest.onsuccess = () => { if (imageRequest.result?.blob instanceof Blob) blobs.set(hash,imageRequest.result.blob); };
        }
      };
      tx.oncomplete = () => resolve({ records,blobs });
      tx.onerror = () => reject(tx.error || new Error('Lettura della lezione non riuscita.'));
      tx.onabort = () => reject(tx.error || new Error('Lettura della lezione annullata.'));
    });
    return { ...snapshot, lesson, metrics:continuousMetrics() };
  } finally { endBackupSnapshotFreeze(); lessonPdfSnapshotBusy = false; }
}

function openLessonPdf(lessonId, mode = 'export') {
  if (!lessonPdfController) lessonPdfController = initLessonPdf({
    captureLesson:captureLessonForPdf,
    drawStroke:continuousDrawStaticStroke,
    getCloudBridge:() => backupFoundation?.cloudBridge,
    onBusyChange:value => { lessonPdfBusy = value; },
    openSettings:() => {
      if (lessonArchivePanel) lessonArchivePanel.hidden = true;
      if (lessonSetupPanel) lessonSetupPanel.hidden = true;
      void backupFoundation?.openSettings();
    }
  });
  void lessonPdfController.open(lessonId,mode);
}

async function deleteLessonGroup(lessonId) {
  const id = cleanLessonText(lessonId, 120);
  const lesson = lessonIndex.map(normalizeLesson).find((item) => item?.id === id);
  if (!lesson) return false;
  const label = `${lesson.subject} - ${lesson.topic}`;
  if (!window.confirm(`Eliminare definitivamente la lezione “${label}” e tutto il relativo foglio continuo?`)) return false;

  await openDb();
  const deletingActive = activeLesson?.id === id;
  if (drawing) finalizeStroke('lesson-delete');
  if (voiceScript?.isActive?.()) voiceScript.stopAndFinalize('lesson-delete');
  if (lassoPointerId != null || lassoTouchId != null) resetLassoInputCapture();
  cancelPendingSave();
  if (deletingActive && continuousLessonActive) {
    // La cancellazione è intenzionalmente distruttiva, quindi non salviamo i dirty
    // ancora solo in RAM; attendiamo però qualsiasi write già partita per impedire
    // che completi DOPO il delete e ricrei un segmento della lezione cancellata.
    await continuousSaveChain.catch(() => false);
    continuousClearRuntime({ keepLesson:false });
  }

  const records = await readAllMainRecords();
  const prefix = `lesson::${id}::`;
  const targets = records.filter((row) => String(row?.lessonId || '') === id || String(row?.date || '').startsWith(prefix));
  let deleted = 0;
  try {
    for (const row of targets) {
      const key = String(row?.date || '');
      if (!key) continue;
      const isPage = row?.kind === 'agenda-day-ink' || row?.kind === 'day-note-ink' || row?.kind === 'planner-day-ink';
      if (isPage) {
        const descriptor = {
          date:String(row?.referenceDate || lesson.acquisitionDate),
          kind:row?.kind === 'day-note-ink' ? 'note' : row?.kind === 'planner-day-ink' ? 'planner-daily' : 'agenda',
          plannerMode:row?.kind === 'planner-day-ink' ? 'daily' : null,
          noteIndex:Number(row?.noteIndex) || 0,
          lessonId:id,
          lessonBoardIndex:row?.kind === 'planner-day-ink' ? 0 : Math.max(1,Number(row?.lessonBoardIndex) || 1),
          key
        };
        const removedStrokeIds = Array.isArray(row?.strokes) ? row.strokes.map((stroke) => stroke?.id).filter(Boolean) : [];
        const removedImageIds = Array.isArray(row?.images) ? row.images.map((image) => image?.id).filter(Boolean) : [];
        syncFoundation?.recordPageCleared(descriptor, removedStrokeIds, removedImageIds);
        const commit = syncFoundation?.prepareAtomicCommit(key) ?? { events:[], eventIds:[], stateRow:null };
        const started = performance.now();
        await deleteRecordWithSync(key, commit);
        if (commit.eventIds?.length) syncFoundation?.markAtomicCommitSucceeded(commit.eventIds, performance.now() - started);
      } else {
        await deleteRecord(key);
      }
      deleted++;
    }
  } catch (err) {
    syncFoundation?.markAtomicCommitFailed?.();
    console.warn('Eliminazione lezione non riuscita', err);
    statusLabel.textContent = 'errore eliminazione lezione';
    return false;
  }

  lessonIndex = lessonIndex.filter((item) => item?.id !== id);
  saveLessonIndex();
  notesCountCache.clear();

  if (deletingActive) {
    activeLesson = null;
    try { localStorage.removeItem(ACTIVE_LESSON_STORAGE_KEY); } catch {}
    currentLessonBoardIndex = 1;
    currentPageKind = 'agenda';
    currentNoteIndex = 0;
    currentNoteTotal = 0;
    strokes = [];
    images = [];
    selectedImageId = null;
    resetUndoHistory();
    dirty = false;
    renderAll();
    renderImages();
    renderLessonHeaderFor(document);
  }

  renderLessonArchive();
  statusLabel.textContent = `lezione eliminata · ${deleted} elementi`;
  return true;
}

function openLessonArchive() {
  // Modalita' archivio: non lasciare tool temporanei armati dietro il pannello.
  if (voiceScript?.isActive?.()) voiceScript.stopAndFinalize('lesson-archive');
  if (isLassoUiArmed()) {
    resetLassoInputCapture();
    lassoTool?.clearSelection?.();
    lassoTool?.setActive?.(false);
    setLassoInputShieldActive(false);
    if (activeTool === 'lasso') activeTool = 'pen';
    lassoSessionArmed = false;
  }
  renderLessonArchive();
  // Avoid stacking translucent modal surfaces over each other.
  if (lessonSetupPanel) lessonSetupPanel.hidden = true;
  const settings = document.getElementById('settingsPanel');
  if (settings) settings.hidden = true;
  if (lessonArchivePanel) lessonArchivePanel.hidden = false;
  updateToolUi();
}

// 0.1.5 — ripristino esplicito della parita' Agenda dopo qualsiasi cambio
// superficie/lezione. Non entra nel percorso Ink: nessuna chiamata da pointermove/drawBatch.
function restoreAgendaInteractiveTools(reason = 'surface-change') {
  resetLassoInputCapture();
  lassoTool?.syncPage?.();
  lassoSessionArmed = activeTool === 'lasso';
  if (activeTool === 'lasso') {
    lassoTool?.setActive?.(true);
    setLassoInputShieldActive(true);
    paper?.classList.add('lasso-mode');
  } else {
    setLassoInputShieldActive(false);
    paper?.classList.remove('lasso-mode');
  }
  paper?.classList.toggle('voice-script-armed', activeTool === 'voice');
  voiceScript?.flushIfIdle?.();
  updateToolUi();
  if (reason && paper) paper.dataset.interactiveRuntime = reason;
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
  // Nel foglio continuo un'immagine può attraversare il confine tecnico del
  // segmento che la possiede. continuousOverflow conserva quindi l'ancora Y
  // nel segmento senza obbligare l'intera immagine a rientrare nel tile.
  const continuousOverflow = value.continuousOverflow === true;
  const y = continuousOverflow
    ? Math.max(0, Math.min(.999999, n(value.y, .12)))
    : Math.min(1 - h, Math.max(0, n(value.y, .12)));
  return {
    id: String(value.id || makeImageId()),
    name: String(value.name || 'Immagine'),
    mimeType: String(value.mimeType || 'image/webp'),
    src: value.src,
    blobHash: isSha256Hash(value.blobHash) ? String(value.blobHash).toLowerCase() : null,
    blobSize: Math.max(0, Number(value.blobSize) || 0),
    x, y, w, h,
    continuousOverflow,
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


function openLocalImageClipboardDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_IMAGE_CLIPBOARD_DB, 1);
    req.onupgradeneeded = () => {
      const clipboardDb = req.result;
      if (!clipboardDb.objectStoreNames.contains(LOCAL_IMAGE_CLIPBOARD_STORE)) {
        clipboardDb.createObjectStore(LOCAL_IMAGE_CLIPBOARD_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Clipboard immagini locale non disponibile'));
  });
}

async function saveLocalImageCutClipboard(value = localImageCutClipboard) {
  if (!value?.image) return false;
  const clipboardDb = await openLocalImageClipboardDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = clipboardDb.transaction(LOCAL_IMAGE_CLIPBOARD_STORE, 'readwrite');
      tx.objectStore(LOCAL_IMAGE_CLIPBOARD_STORE).put({ key: LOCAL_IMAGE_CLIPBOARD_KEY, ...value });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Salvataggio clipboard immagini annullato'));
    });
    return true;
  } finally {
    clipboardDb.close();
  }
}

async function loadLocalImageCutClipboard() {
  const clipboardDb = await openLocalImageClipboardDb();
  try {
    const row = await new Promise((resolve, reject) => {
      const tx = clipboardDb.transaction(LOCAL_IMAGE_CLIPBOARD_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_IMAGE_CLIPBOARD_STORE).get(LOCAL_IMAGE_CLIPBOARD_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    const image = normalizeImageObject(row?.image);
    localImageCutClipboard = image ? { ...row, image, key: undefined } : null;
    if (localImageCutClipboard) delete localImageCutClipboard.key;
    return localImageCutClipboard;
  } finally {
    clipboardDb.close();
  }
}

async function clearLocalImageCutClipboard() {
  const clipboardDb = await openLocalImageClipboardDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = clipboardDb.transaction(LOCAL_IMAGE_CLIPBOARD_STORE, 'readwrite');
      tx.objectStore(LOCAL_IMAGE_CLIPBOARD_STORE).delete(LOCAL_IMAGE_CLIPBOARD_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Pulizia clipboard immagini annullata'));
    });
    localImageCutClipboard = null;
    return true;
  } finally {
    clipboardDb.close();
  }
}

async function reconcileLocalImageCutClipboard() {
  if (!localImageCutClipboard?.pendingImageId || !localImageCutClipboard?.pendingPageKey) return;
  try {
    const record = await getRecord(localImageCutClipboard.pendingPageKey);
    const pastePersisted = imagesFromRecord(record).some((image) => image?.id === localImageCutClipboard.pendingImageId);
    if (pastePersisted) {
      await clearLocalImageCutClipboard();
      return;
    }
    const { pendingImageId, pendingPageKey, pasteRequestedAt, ...rest } = localImageCutClipboard;
    localImageCutClipboard = rest;
    await saveLocalImageCutClipboard();
  } catch (err) {
    console.warn('Riconciliazione clipboard immagini non riuscita', err);
  }
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

function lavagnaPreferredPaperColor() {
  try {
    const saved = localStorage.getItem(LAVAGNA_PAPER_COLOR_STORAGE_KEY);
    return ALLOWED_PAGE_COLORS.includes(saved) ? saved : DEFAULT_PAGE_STYLE.color;
  } catch { return DEFAULT_PAGE_STYLE.color; }
}

function saveLavagnaPreferredPaperColor(color) {
  if (!ALLOWED_PAGE_COLORS.includes(color)) return;
  try { localStorage.setItem(LAVAGNA_PAPER_COLOR_STORAGE_KEY, color); } catch {}
}

function pageStyleFromRecord(record) {
  const base = record?.pageStyle ? normalizePageStyle({ ...globalPageStyle, ...record.pageStyle }) : { ...globalPageStyle };
  return normalizePageStyle({ ...base, color: lavagnaPreferredPaperColor() });
}

// 0.1.30 — le pagine Note di una lezione usano sempre carta gialla a quadretti.
// La scelta è applicata fuori dal percorso Ink e non modifica pointermove/drawBatch.
function pageStyleForDescriptor(record, descriptor = pageDescriptor()) {
  const base = pageStyleFromRecord(record);
  const lessonNoteSurface = (descriptor?.kind === 'agenda' || descriptor?.kind === 'note')
    && Boolean(descriptor?.lessonId || activeLesson?.id);
  return lessonNoteSurface
    ? normalizePageStyle({ ...base, color:'yellow', template:'grid' })
    : base;
}

function paperToolDefaults(color) {
  return PAPER_TOOL_DEFAULTS[color] ?? PAPER_TOOL_DEFAULTS.black;
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
  // 0.1.32 — la tonalità UI delle finestre segue la carta corrente, ma resta
  // completamente fuori dalla pipeline Ink. Serve solo a uniformare i pannelli.
  if (target === paper || target?.id === 'paper') {
    document.documentElement.dataset.noteUiTone = normalized.color;
  }
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
  for (const button of quickPaperChoices) {
    const selected = button.dataset.quickTemplate
      ? button.dataset.quickTemplate === pageStyle.template
      : button.dataset.quickColor === pageStyle.color;
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
  saveLavagnaPreferredPaperColor(color);
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
  const styleTool = (activeTool === 'shape' || activeTool === 'voice' || activeTool === 'lasso') ? 'pen' : activeTool;
  const names = { pen: 'Penna', highlighter: 'Evidenziatore', eraser: 'Gomma', lasso: 'Lazo', shape: 'Figure', voice: 'Voice Script', image: 'Immagine' };
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

function closeShapePalette() {
  if (shapePalette) shapePalette.hidden = true;
  shapeToolButton?.setAttribute('aria-expanded', 'false');
}

function closeStylePanel() {
  if (!stylePanel) return;
  if (!stylePanel.hidden) stylePanel.hidden = true;
  styleButton?.setAttribute('aria-expanded', 'false');
}

function toggleStylePanel() {
  if (!stylePanel || drawing || pageTurning) return;
  const willOpen = stylePanel.hidden;
  stylePanel.hidden = !willOpen;
  if (willOpen) closeShapePalette();
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

function loadWeatherLocalityCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_LOCALITY_CACHE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function saveWeatherLocalityCache() {
  try { localStorage.setItem(WEATHER_LOCALITY_CACHE_STORAGE_KEY, JSON.stringify(weatherLocalityCache)); } catch {}
}

function cleanWeatherLocality(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 64);
}

function localityFromReverseGeocode(payload) {
  const city = cleanWeatherLocality(payload?.city);
  const locality = cleanWeatherLocality(payload?.locality);
  const subdivision = cleanWeatherLocality(payload?.principalSubdivision);
  if (locality && city && locality.toLocaleLowerCase('it-IT') !== city.toLocaleLowerCase('it-IT')) return `${locality} · ${city}`;
  return locality || city || subdivision || '';
}

function abbreviatedWeatherLocality(value) {
  const full = cleanWeatherLocality(value);
  if (!full) return '';
  let short = full
    .replace(/\bSan\s+/gi, 'S. ')
    .replace(/\bSanta\s+/gi, 'S. ')
    .replace(/\bSanto\s+/gi, 'S. ')
    .replace(/\bSant’/gi, 'S’')
    .replace(/\bSant'/gi, "S'");
  if (short.length > 22 && short.includes(' · ')) short = short.split(' · ')[0];
  if (short.length > 22) short = `${short.slice(0, 21).trimEnd()}…`;
  return short;
}

function updateWeatherLocalityUi(label = weatherLocalityLabelText) {
  weatherLocalityLabelText = cleanWeatherLocality(label);
  if (!weatherLocationLabel) return;
  const full = weatherLocalityLabelText || 'Posizione';
  weatherLocationLabel.textContent = abbreviatedWeatherLocality(weatherLocalityLabelText) || 'Posizione';
  weatherLocationLabel.title = full;
}

async function ensureWeatherLocality(coords) {
  if (!coords || !weatherLocationKey) return '';
  const cached = weatherLocalityCache?.[weatherLocationKey];
  if (cached?.label && Date.now() - Number(cached.at || 0) < 24 * 60 * 60 * 1000) {
    updateWeatherLocalityUi(cached.label);
    return cached.label;
  }
  weatherLocalityFetchController?.abort();
  const controller = new AbortController();
  weatherLocalityFetchController = controller;
  try {
    const params = new URLSearchParams({
      latitude:String(coords.lat), longitude:String(coords.lon), localityLanguage:'it'
    });
    const response = await fetch(`${WEATHER_REVERSE_GEOCODE_URL}?${params.toString()}`, {
      method:'GET', mode:'cors', credentials:'omit', cache:'no-store', signal:controller.signal
    });
    if (!response.ok) throw new Error(`Località HTTP ${response.status}`);
    const payload = await response.json();
    const label = localityFromReverseGeocode(payload);
    if (!label) return '';
    weatherLocalityCache = { ...weatherLocalityCache, [weatherLocationKey]: { label, at:Date.now() } };
    const entries = Object.entries(weatherLocalityCache).sort((a,b) => Number(b[1]?.at || 0) - Number(a[1]?.at || 0)).slice(0, 8);
    weatherLocalityCache = Object.fromEntries(entries);
    saveWeatherLocalityCache();
    updateWeatherLocalityUi(label);
    return label;
  } catch (err) {
    if (err?.name !== 'AbortError') console.warn('Località meteo non disponibile', err);
    return '';
  } finally {
    if (weatherLocalityFetchController === controller) weatherLocalityFetchController = null;
  }
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
  updateWeatherLocalityUi();
  const place = weatherLocalityLabelText ? ` · ${weatherLocalityLabelText}` : '';
  badge.title = `${visual.label}${place} · tocca per i dettagli`;
  badge.setAttribute('aria-label', `Previsione meteo: ${visual.label}${place}. Tocca per i dettagli`);
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
  weatherDetailStatus.textContent = weekRows.length
    ? `Previsione aggiornata${weatherLocalityLabelText ? ` per ${weatherLocalityLabelText}` : ' per la posizione attuale'}.`
    : 'Previsione disponibile solo parzialmente.';
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
  void ensureWeatherLocality(coords);
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
        const cachedLocality = weatherLocalityCache?.[nextKey]?.label;
        if (cachedLocality) updateWeatherLocalityUi(cachedLocality);
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
    void ensureWeatherLocality(weatherCoords);
    setWeatherBadgeFor(document, dateString, currentPageKind);
    return;
  }
  const coords = await getDeviceWeatherPosition();
  if (coords) void ensureWeatherLocality(coords);
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
        kindLabel.textContent = 'Obiettivi della lezione';
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
    return 'Obiettivi della lezione';
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
  return `<section class="lesson-goals-sheet" aria-label="Obiettivi della lezione">
    <div class="lesson-goals-ruled" aria-hidden="true"></div>
  </section>`;
}

function buildWeeklyPlannerHtml(dateString) {
  const monday = new Date(`${mondayOf(dateString)}T12:00:00`);
  const fmt = new Intl.DateTimeFormat('it-IT', { weekday:'short', day:'numeric' });
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    return `<section class="planner-week-day"><h3>${fmt.format(d).replace('.', '').toUpperCase()}</h3><div class="planner-week-lines"></div></section>`;
  }).join('');
  const inlineTitle = plannerModeTitle('weekly', dateString);
  return `<div class="planner-week-inline-title">${inlineTitle}</div>
    <div class="planner-week-grid">${cols}</div>
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
  if (enteringTimetable && isLassoUiArmed()) { resetLassoInputCapture(); lassoTool?.setActive?.(false); setLassoInputShieldActive(false); }
  if (enteringTimetable) { activeTool = 'pen'; lassoSessionArmed = false; }
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
  pageStyle = forcedStyle ? normalizePageStyle(forcedStyle) : pageStyleForDescriptor(record, target);
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
  if (target.kind === 'agenda' && activeLesson?.id) {
    const pos = target.continuousScrollPosition || { segment:target.lessonBoardIndex || currentLessonBoardIndex, offset:0 };
    await continuousActivate({ segmentIndex:pos.segment, offset:pos.offset, preserveCache:true });
  }
}

async function openLessonGoalsFromPage() {
  if (!activeLesson?.id || currentPageKind !== 'agenda') return;
  if (drawing || pageTurning || pageStyleBulkBusy) return;
  const returnScroll = continuousLessonActive ? continuousCurrentScrollPosition() : { segment:currentLessonBoardIndex, offset:0 };
  if (continuousLessonActive) {
    const continuousSaved = await flushContinuousSegmentSaves();
    if (!continuousSaved) {
      statusLabel.textContent = 'salvataggio non riuscito: Obiettivi non aperti';
      scheduleSave();
      return;
    }
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
  const target = pageDescriptor(currentDate, 'planner-daily', 0, 0);
  const goalsStyle = normalizePageStyle({ color:pageStyle.color, template:'blank' });
  lessonGoalsReturnDescriptor = { ...oldDescriptor, continuousScrollPosition:returnScroll };
  weeklyTimetableReturnDescriptor = null;
  continuousClearRuntime({ keepLesson:true });
  try {
    await loadDescriptorAsCurrentPage(target, goalsStyle, true);
    saveActiveLesson({ touch:false });
    statusLabel.textContent = (strokes.length || images.length) ? 'Obiettivi della lezione caricati' : 'Obiettivi della lezione';
  } catch (err) {
    session.storageErrors++;
    console.warn('Obiettivi della lezione non disponibili', err);
    statusLabel.textContent = 'Obiettivi della lezione non disponibili';
  } finally {
    pageTurning = false;
  }
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
    saveActiveLesson({ touch:false });
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

  // 0.1.30 — navigazione didattica a doppio tap.
  // Pagina Note (compresi i segmenti verticali) -> Obiettivi della lezione.
  if (activeLesson?.id && (currentPageKind === 'agenda' || currentPageKind === 'note')) {
    void openLessonGoalsFromPage();
    return true;
  }
  // Obiettivi della lezione -> tabella/orario settimanale.
  if (currentPageKind === 'planner-daily') {
    void openWeeklyTimetable();
    return true;
  }

  // Le altre superfici conservano il doppio tap privacy precedente.
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
    const [record, noteTotal] = await Promise.all([getRecord(targetDate), ensureNotesCount(targetDate, '', 0)]);
    session.storageReads++;
    currentDate = targetDate;
    currentPageKind = 'agenda';
    currentNoteIndex = 0;
    currentNoteTotal = noteTotal ?? 0;
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    images = imagesFromRecord(record);
    selectedImageId = null;
    const previousPaperColor = pageStyle.color;
    pageStyle = pageStyleForDescriptor(record, pageDescriptor());
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
  root.classList.toggle('lesson-note-view', descriptor.kind === 'note' && Boolean(descriptor.lessonId || activeLesson?.id));
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

let audioIndicatorSerial = 0;
async function refreshAudioPageIndicator() {
  if (!audioPageIndicator) return;
  const serial = ++audioIndicatorSerial;
  const descriptor = pageDescriptor();
  if (!audioRecorder?.countForPage) { audioPageIndicator.hidden = true; return; }
  try {
    const count = await audioRecorder.countForPage(descriptor.key);
    if (serial !== audioIndicatorSerial || currentPageKey() !== descriptor.key) return;
    audioPageIndicator.hidden = !(count > 0);
    audioPageIndicator.title = count > 0 ? `${count} registrazion${count === 1 ? 'e' : 'i'} associat${count === 1 ? 'a' : 'e'} alla pagina` : '';
  } catch {
    if (serial === audioIndicatorSerial) audioPageIndicator.hidden = true;
  }
}

function updateHeader() {
  setHeaderFor(document, currentDate, currentPageKind, currentNoteIndex, currentNoteTotal);
  configurePageRoot(paper, pageDescriptor());
  renderLessonHeaderFor(document, pageDescriptor());
  if (currentPageKind === 'agenda' && !activeLesson) {
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
    if (currentPageKind === 'note') baselineLabel.textContent = activeLesson?.id ? 'NOTE · SCORRIMENTO VERTICALE' : `Note del giorno ${currentNoteIndex}/${Math.max(currentNoteIndex, currentNoteTotal)}`;
    else if (isPlannerKind()) baselineLabel.textContent = currentPlannerMode === 'timetable' ? 'ORARIO SETTIMANALE · INK NATIVO' : (currentPlannerMode === 'daily' ? 'OBIETTIVI DELLA LEZIONE · INK NATIVO' : `PLANNER · ${plannerModeTitle(currentPlannerMode, currentDate).toUpperCase()}`);
    else baselineLabel.textContent = 'NOTE · FOGLIO CONTINUO';
  }
  void refreshAudioPageIndicator();
}

function notesMetaKey(dateString, lessonId = '', lessonBoardIndex = 0) {
  return lessonId ? lessonBoardNotesMetaKey(lessonId, lessonBoardIndex) : `${dateString}${NOTES_META_SUFFIX}`;
}

function noteKey(dateString, noteIndex, lessonId = '', lessonBoardIndex = 0) {
  const suffix = `::note::${String(noteIndex).padStart(4, '0')}`;
  return lessonId ? `${lessonBoardKey(lessonId, lessonBoardIndex)}${suffix}` : `${dateString}${suffix}`;
}

function pageKey(dateString, pageKind = 'agenda', noteIndex = 0, timetableIndex = currentTimetableIndex, lessonBoardIndex = currentLessonBoardIndex) {
  if (pageKind === 'note') return noteKey(dateString, noteIndex, activeLesson?.id || '', lessonBoardIndex);
  // Gli Obiettivi appartengono alla lezione, non alla data: due lezioni nello
  // stesso giorno devono avere superfici e backup indipendenti.
  if (pageKind === 'planner-daily' && activeLesson?.id) return lessonGoalsKey(activeLesson.id);
  if (isPlannerKind(pageKind)) return plannerPeriodKey(dateString, plannerModeFromKind(pageKind), timetableIndex);
  if (pageKind === 'agenda' && activeLesson?.id) return lessonBoardKey(activeLesson.id, lessonBoardIndex);
  return dateString;
}

function pageDescriptor(dateString = currentDate, pageKind = currentPageKind, noteIndex = currentNoteIndex, noteTotal = currentNoteTotal, timetableIndex = currentTimetableIndex, lessonBoardIndex = currentLessonBoardIndex) {
  const plannerMode = isPlannerKind(pageKind) ? plannerModeFromKind(pageKind) : null;
  const lessonSurface = (pageKind === 'agenda' || pageKind === 'note' || pageKind === 'planner-daily') && Boolean(activeLesson?.id);
  const segmentedLessonSurface = pageKind === 'agenda' || pageKind === 'note';
  const boardIndex = lessonSurface && segmentedLessonSurface ? Math.max(1, Number(lessonBoardIndex) || 1) : 0;
  return {
    date: dateString,
    kind: pageKind,
    plannerMode,
    timetableIndex: pageKind === 'planner-timetable'
      ? Math.min(WEEKLY_TIMETABLE_MAX_PAGES, Math.max(1, Number(timetableIndex) || 1))
      : 0,
    noteIndex: pageKind === 'note' ? noteIndex : 0,
    noteTotal: pageKind === 'note' ? noteTotal : 0,
    lessonId: lessonSurface ? (activeLesson?.id || '') : '',
    lessonBoardIndex: boardIndex,
    key: pageKey(dateString, pageKind, noteIndex, timetableIndex, boardIndex || lessonBoardIndex),
    createNote: false,
    createLessonBoard: false
  };
}
function currentPageKey() {
  return pageKey(currentDate, currentPageKind, currentNoteIndex, currentTimetableIndex, currentLessonBoardIndex);
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
      if (!database.objectStoreNames.contains(PASSWORD_VAULT_STORE)) database.createObjectStore(PASSWORD_VAULT_STORE, { keyPath: 'key' });
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

function getPasswordVaultRow(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PASSWORD_VAULT_STORE, 'readonly');
    const req = tx.objectStore(PASSWORD_VAULT_STORE).get(String(key || ''));
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function putPasswordVaultLocalRow(row) {
  if (!row?.key) return Promise.reject(new Error('Record locale Rubrica Password non valido'));
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PASSWORD_VAULT_STORE, 'readwrite');
    tx.objectStore(PASSWORD_VAULT_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Persistenza locale Rubrica Password annullata'));
  });
}

function deletePasswordVaultLocalRow(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PASSWORD_VAULT_STORE, 'readwrite');
    tx.objectStore(PASSWORD_VAULT_STORE).delete(String(key || ''));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Eliminazione locale Rubrica Password annullata'));
  });
}

function vaultClockFromEvent(event) {
  if (!event?.eventId) return null;
  return {
    hlcWallMs: Number(event.hlcWallMs) || 0,
    hlcLogical: Number(event.hlcLogical) || 0,
    eventId: String(event.eventId)
  };
}

function compareVaultClocks(a, b) {
  return compareHlcDeterministic(a || {}, b || {});
}

async function readPasswordVaultPortableRows() {
  await openDb();
  const [configRow, dataRow] = await Promise.all([
    getPasswordVaultRow(VAULT_CONFIG_KEY),
    getPasswordVaultRow(VAULT_DATA_KEY)
  ]);
  return [configRow, dataRow].map(portableVaultRow).filter(Boolean);
}

async function getPasswordVaultBackupPayload() {
  const rows = await readPasswordVaultPortableRows();
  return buildVaultBackupPayload(rows);
}

async function restorePasswordVaultBackupPayload(payload) {
  const rows = payload ? rowsFromVaultBackupPayload(payload) : [];
  await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PASSWORD_VAULT_STORE, 'readwrite');
    const store = tx.objectStore(PASSWORD_VAULT_STORE);
    store.delete(VAULT_CONFIG_KEY);
    store.delete(VAULT_DATA_KEY);
    store.delete(VAULT_LOCAL_AUTH_KEY);
    store.delete(VAULT_LOCAL_STATE_KEY);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Ripristino Rubrica Password annullato'));
  });
  passwordVault?.lock?.('restore');
  if (passwordVault?.refresh) await passwordVault.refresh().catch(() => {});
  return { restored: rows.length };
}

async function commitPasswordVaultPortableRows(inputRows) {
  await openDb();
  const rows = (inputRows || []).map(portableVaultRow).filter(Boolean);
  if (!rows.length) return { rows: 0, events: 0 };
  const descriptor = { key: VAULT_SYNC_KEY, kind: 'password-vault', date: '' };
  for (const row of rows) {
    syncFoundation?.queueEvent({
      entityId: `password-vault:${row.key}`,
      entityType: 'password-vault',
      operation: 'vault.envelope.set',
      descriptor,
      payload: { row },
      flags: { sensitive: true, encryptedAtRest: true, payloadEncryption: 'AES-256-GCM' }
    });
  }
  const commit = syncFoundation?.prepareAtomicCommit(VAULT_SYNC_KEY) || { events: [], eventIds: [], stateRow: null };
  const eventByKey = new Map();
  for (const event of commit.events || []) {
    const rowKey = String(event?.payload?.row?.key || '');
    if (rowKey) eventByKey.set(rowKey, event);
  }
  const storedRows = rows.map((row) => {
    const event = eventByKey.get(row.key);
    return event ? { ...row, lastSyncClock: vaultClockFromEvent(event) } : row;
  });
  const stores = [PASSWORD_VAULT_STORE];
  if (commit.events?.length) stores.push(SYNC_EVENT_STORE, SYNC_META_STORE);
  const started = performance.now();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      const vaultStore = tx.objectStore(PASSWORD_VAULT_STORE);
      for (const row of storedRows) vaultStore.put(row);
      if (commit.events?.length) {
        const eventStore = tx.objectStore(SYNC_EVENT_STORE);
        for (const event of commit.events) eventStore.put(event);
        if (commit.stateRow) tx.objectStore(SYNC_META_STORE).put(commit.stateRow);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Commit Rubrica Password annullato'));
    });
    if (commit.eventIds?.length) syncFoundation?.markAtomicCommitSucceeded(commit.eventIds, performance.now() - started);
    return { rows: storedRows.length, events: commit.events?.length || 0 };
  } catch (err) {
    if (commit.eventIds?.length) syncFoundation?.markAtomicCommitFailed();
    throw err;
  }
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
    lessonId: String(d.lessonId || '') || null,
    lessonBoardIndex: Math.max(0, Number(d.lessonBoardIndex) || 0),
    lessonAcquisitionDate: d.lessonId ? String(d.date || '') : null,
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
    noteTotal: 0,
    lessonId: String(record?.lessonId || ''),
    lessonBoardIndex: Math.max(0, Number(record?.lessonBoardIndex) || Number(key.match(/::board::(\d{4})/)?.[1]) || 0),
    createNote: false
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
  const vaultRows = await readPasswordVaultPortableRows();
  if (vaultRows.length) {
    const vaultCommit = await commitPasswordVaultPortableRows(vaultRows);
    queued += Number(vaultCommit?.events) || 0;
  }
  return { records: records.length, events: queued, vaultRows: vaultRows.length };
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
    // modifiche locali pendenti, aggiorniamo subito la vista anche per il testo sincronizzato.
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

async function applyRemotePasswordVaultEvent(event) {
  const incoming = portableVaultRow(event?.payload?.row);
  if (!incoming || !isPortableVaultRow(incoming)) {
    await putRemoteEventResult(event, 'deferred', null, 'payload Rubrica Password cifrato non valido');
    return { deferred: 1 };
  }
  const existing = await getPasswordVaultRow(incoming.key).catch(() => null);
  const incomingClock = vaultClockFromEvent(event);
  if (existing?.lastSyncClock && compareVaultClocks(incomingClock, existing.lastSyncClock) <= 0) {
    await putRemoteEventResult(event, 'ignored', null, 'evento Rubrica Password precedente allo stato locale');
    return { ignored: 1 };
  }
  const storedRow = { ...incoming, lastSyncClock: incomingClock };
  await new Promise((resolve, reject) => {
    const tx = db.transaction([PASSWORD_VAULT_STORE, SYNC_EVENT_STORE, SYNC_META_STORE], 'readwrite');
    tx.objectStore(PASSWORD_VAULT_STORE).put(storedRow);
    tx.objectStore(SYNC_EVENT_STORE).put({
      ...event,
      status: 'applied',
      source: 'sync-remote',
      receivedAt: new Date().toISOString(),
      remoteDetail: 'payload Rubrica Password già cifrato end-to-end'
    });
    if (syncFoundation) tx.objectStore(SYNC_META_STORE).put(syncFoundation.getStateRow());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Applicazione Sync Rubrica Password annullata'));
  });
  await passwordVault?.handleRemoteUpdate?.(incoming.key);
  return { applied: 1 };
}

async function beginBackupSnapshotFreeze() {
  backupSnapshotFreeze = true;
  lanTransport?.suspendForInk();
  cloudTransport?.suspendForInk();
  const started = performance.now();
  while (syncRemoteApplyBusy) {
    if (performance.now() - started > 5000) {
      backupSnapshotFreeze = false;
      throw new Error('Snapshot backup sospeso: Sync remota ancora in applicazione');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function endBackupSnapshotFreeze() {
  backupSnapshotFreeze = false;
}

async function applyRemoteSyncEvents(events) {
  if (backupSnapshotFreeze || restoreOperationLocked || isLocalRestoreSyncQuarantined()) throw new DOMException('Backup snapshot priority', 'AbortError');
  const totals = { applied: 0, deferred: 0, ignored: 0, conflicts: 0 };
  syncRemoteApplyBusy = true;
  try {
    await openDb();
    for (const event of events || []) {
      if (backupSnapshotFreeze || restoreOperationLocked || isLocalRestoreSyncQuarantined() || drawing || pageTurning || imageBusy || imageGesture) throw new DOMException('Ink/backup priority', 'AbortError');
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
    else if (event.entityType === 'password-vault' && event.operation === 'vault.envelope.set') result = await applyRemotePasswordVaultEvent(event);
    else {
      await putRemoteEventResult(event, 'deferred', null, 'tipo evento non ancora applicato');
      result = { deferred: 1 };
    }
      for (const key of Object.keys(totals)) totals[key] += Number(result?.[key]) || 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (events?.length) await loadInitialPage();
    return totals;
  } finally {
    syncRemoteApplyBusy = false;
  }
}



function loadSyncRestoreGuard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_RESTORE_GUARD_STORAGE_KEY) || 'null');
    return parsed && parsed.pending ? parsed : null;
  } catch { return null; }
}

function loadLocalRestoreSyncQuarantine() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_RESTORE_SYNC_QUARANTINE_KEY) || 'null');
    return parsed && parsed.active ? parsed : null;
  } catch { return null; }
}

function saveLocalRestoreSyncQuarantine(value) {
  const next = value && value.active ? { ...value, active: true } : null;
  if (next) localStorage.setItem(LOCAL_RESTORE_SYNC_QUARANTINE_KEY, JSON.stringify(next));
  else localStorage.removeItem(LOCAL_RESTORE_SYNC_QUARANTINE_KEY);
  localRestoreSyncQuarantine = next;
  return next;
}

function isLocalRestoreSyncQuarantined() {
  return Boolean(localRestoreSyncQuarantine?.active);
}

function configuredSyncTransports() {
  const cloud = loadCloudConfig();
  const lan = loadLanConfig();
  const transports = [];
  if (String(cloud.joinCode || '').trim()) transports.push('cloud');
  if (String(lan.endpoint || '').trim() && String(lan.syncKey || '').trim()) transports.push('lan');
  return transports;
}

function beginLocalRestoreSyncQuarantine(details = {}) {
  const transports = configuredSyncTransports();
  return saveLocalRestoreSyncQuarantine({
    active: true,
    reason: details.recovery ? 'interrupted-restore-recovery' : (details.rollback ? 'restore-rollback' : 'local-restore'),
    createdAt: new Date().toISOString(),
    backupFileName: String(details.fileName || ''),
    backupCreatedAt: String(details.manifest?.createdAt || ''),
    transports
  });
}

function clearLocalRestoreSyncQuarantine() {
  return saveLocalRestoreSyncQuarantine(null);
}

function localRestoreSyncQuarantineMessage() {
  if (!isLocalRestoreSyncQuarantined()) return '';
  const names = (localRestoreSyncQuarantine?.transports || []).map((item) => item === 'cloud' ? 'Cloud' : 'LAN').join(' + ') || 'Sync';
  return `⚠ ${names} sospesa dopo un ripristino locale. I dati ripristinati restano autorevoli su questo iPad finché non riattivi esplicitamente la Sync.`;
}

function confirmResumeSyncAfterLocalRestore(channelLabel = 'Sync') {
  if (!isLocalRestoreSyncQuarantined()) return true;
  const ok = globalThis.confirm(
    `PROTEZIONE POST-RIPRISTINO\n\n${channelLabel} è sospesa perché questo iPad è stato ripristinato da un backup.\n\n` +
    `Riattivando la sincronizzazione, il gruppo remoto potrebbe contenere dati più recenti o diversi e modificare lo stato appena ripristinato.\n\n` +
    `Vuoi rimuovere la protezione? Per sicurezza, questa pressione NON avvierà ancora la sincronizzazione: dovrai premere “Sincronizza adesso” una seconda volta.`
  );
  if (!ok) return false;
  saveLocalRestoreSyncQuarantine({ ...localRestoreSyncQuarantine, resumeChannel: channelLabel });
  updateCloudStatus('Ripresa autorizzata; Sync ancora sospesa. Premi nuovamente “Sincronizza adesso” solo se vuoi riallineare questo iPad al gruppo Cloud.');
  updateLanStatus('Ripresa autorizzata; Sync ancora sospesa. Premi nuovamente “Sincronizza adesso” solo se vuoi riallineare questo iPad al gruppo LAN.');
  return false;
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
  if (syncRestoreGuard) localStorage.setItem(SYNC_RESTORE_GUARD_STORAGE_KEY, JSON.stringify(syncRestoreGuard));
  else localStorage.removeItem(SYNC_RESTORE_GUARD_STORAGE_KEY);
  updateSyncRestoreConfigLock();
  return syncRestoreGuard;
}

function isSyncRestorePending() {
  return Boolean(syncRestoreGuard?.pending);
}

function denyMutationDuringSyncRecovery() {
  if (!isSyncRestorePending() && !restoreOperationLocked) return false;
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
  if (cloudConfigured && lanConfigured) {
    throw new Error('Ripristino globale bloccato per sicurezza: risultano configurati sia Cloud sia LAN. Per imporre un backup al gruppo deve esserci un solo canale Sync autorevole; rimuovi temporaneamente il codice Cloud oppure endpoint/chiave LAN, poi ripeti.');
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
    safetyBackupId: String(details.safetyBackupId || ''),
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
  const legacyCounts = new Map();
  const lessonCounts = new Map();
  const metaKeys = [];
  for (const row of records) {
    const key = String(row?.date || '');
    if (row?.kind === 'day-notes-meta' || row?.kind === 'lesson-board-notes-meta' || key.endsWith(NOTES_META_SUFFIX)) {
      metaKeys.push(key);
      continue;
    }
    const lessonMatch = key.match(/^lesson::(.+?)::board::(\d{4})::note::(\d{4})$/);
    if (lessonMatch) {
      const lessonId = String(row?.lessonId || lessonMatch[1]);
      const boardIndex = Math.max(1, Number(row?.lessonBoardIndex) || Number(lessonMatch[2]) || 1);
      const index = Math.max(1, Number(row?.noteIndex) || Number(lessonMatch[3]) || 1);
      const scope = lessonBoardNotesMetaKey(lessonId, boardIndex);
      const prev = lessonCounts.get(scope);
      lessonCounts.set(scope, {
        lessonId, boardIndex, referenceDate:String(row?.referenceDate || row?.lessonAcquisitionDate || currentDate),
        count:Math.max(prev?.count || 0, index)
      });
      continue;
    }
    const match = key.match(/^(\d{4}-\d{2}-\d{2})::note::(\d{4})$/);
    if (!match) continue;
    const day = String(row?.referenceDate || match[1]);
    const index = Math.max(1, Number(row?.noteIndex) || Number(match[2]) || 1);
    legacyCounts.set(day, Math.max(legacyCounts.get(day) || 0, index));
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const key of metaKeys) store.delete(key);
    for (const [day, count] of legacyCounts) {
      store.put({ date:notesMetaKey(day), kind:'day-notes-meta', referenceDate:day, count, version:APP_VERSION, modifiedAt:new Date().toISOString() });
    }
    for (const [key, info] of lessonCounts) {
      store.put({ date:key, kind:'lesson-board-notes-meta', referenceDate:info.referenceDate, lessonId:info.lessonId, lessonBoardIndex:info.boardIndex, count:info.count, version:APP_VERSION, modifiedAt:new Date().toISOString() });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Ricostruzione indice Note annullata'));
  });
  notesCountCache.clear();
  for (const [day, count] of legacyCounts) notesCountCache.set(notesCacheKey(day), count);
  for (const [key, info] of lessonCounts) notesCountCache.set(key, info.count);
}

async function rebuildLessonIndexFromPages() {
  await openDb();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const found = new Map();
  for (const row of records) {
    const lessonId = cleanLessonText(row?.lessonId, 120);
    if (!lessonId) continue;
    const boardIndex = Math.max(1, Number(row?.lessonBoardIndex) || Number(String(row?.date||'').match(/::board::(\d{4})/)?.[1]) || 1);
    const acquisitionDate = /^\d{4}-\d{2}-\d{2}$/.test(String(row?.lessonAcquisitionDate || '')) ? String(row.lessonAcquisitionDate)
      : (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.referenceDate || '')) ? String(row.referenceDate) : localISODate(new Date()));
    const existing = found.get(lessonId);
    const createdAt = String(row?.lessonCreatedAt || existing?.createdAt || `${acquisitionDate}T12:00:00.000Z`);
    const lastEditedAt = [String(existing?.lastEditedAt || ''), String(row?.lessonLastEditedAt || ''), String(row?.modifiedAt || '')].filter(Boolean).sort().at(-1) || createdAt;
    found.set(lessonId, {
      id:lessonId, acquisitionDate, createdAt, lastEditedAt,
      subject:cleanLessonText(row?.lessonSubject,80) || existing?.subject || lessonSubjects[0] || 'Informatica 3G',
      topic:cleanLessonText(row?.lessonTopic,160) || existing?.topic || 'Nuova lezione',
      beautifyFontSizePx:normalizeBeautifyLessonFontSize(row?.lessonBeautifyFontSizePx) ?? existing?.beautifyFontSizePx ?? null,
      boardCount:Math.max(existing?.boardCount || 1, boardIndex),
      currentBoardIndex:Math.min(Math.max(1, Number(existing?.currentBoardIndex) || 1), Math.max(existing?.boardCount || 1, boardIndex))
    });
  }
  if (!found.size) {
    lessonIndex = [];
    saveLessonIndex();
    activeLesson = null;
    try { localStorage.removeItem(ACTIVE_LESSON_STORAGE_KEY); } catch {}
    return 0;
  }
  const previous = new Map(lessonIndex.map((item) => [item.id, item]));
  lessonIndex = [...found.values()].map((item) => normalizeLesson({
    ...item,
    currentBoardIndex:previous.get(item.id)?.currentBoardIndex || item.currentBoardIndex,
    beautifyFontSizePx:item.beautifyFontSizePx ?? previous.get(item.id)?.beautifyFontSizePx ?? null
  })).filter(Boolean);
  lessonIndex.sort((a,b) => a.acquisitionDate.localeCompare(b.acquisitionDate) || a.createdAt.localeCompare(b.createdAt));
  saveLessonIndex();
  for (const lesson of lessonIndex) if (!lessonSubjects.includes(lesson.subject)) lessonSubjects.push(lesson.subject);
  saveLessonSubjects();
  if (activeLesson?.id && found.has(activeLesson.id)) {
    const rebuilt = lessonIndex.find((item) => item.id === activeLesson.id);
    if (rebuilt) { activeLesson = { ...rebuilt, currentBoardIndex:Math.min(currentLessonBoardIndex, rebuilt.boardCount) }; saveActiveLesson(); }
  } else {
    const latest = lessonIndex.at(-1);
    if (latest) {
      activeLesson = { ...latest, currentBoardIndex:Math.max(1, Number(latest.currentBoardIndex) || 1) };
      currentLessonBoardIndex = activeLesson.currentBoardIndex;
      saveActiveLesson();
    }
  }
  renderLessonSubjectSettings();
  return lessonIndex.length;
}
async function runPendingGlobalGroupRestore() {
  if (!isSyncRestorePending() || syncRestoreGuard.mode !== 'global-authoritative') return { skipped: 'not-global' };
  const transport = String(syncRestoreGuard.transport || 'none');
  const restoreId = String(syncRestoreGuard.restoreId || '');
  if (!restoreId || transport === 'none') throw new Error('Sessione di ripristino globale non valida.');
  updateSyncRestoreGuard({ phase: 'global-publishing', attemptAt: new Date().toISOString() });
  try {
    const snapshot = syncRestoreGuard.snapshotQueued ? { records:syncRestoreGuard.snapshotRecords, events:syncRestoreGuard.snapshotEvents } : await queueAuthoritativeGroupSnapshot();
    if (!syncRestoreGuard.snapshotQueued) updateSyncRestoreGuard({ snapshotQueued:true, snapshotRecords:snapshot.records, snapshotEvents:snapshot.events });
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
  restoreOperationLocked = true;
  const safety = await backupFoundation?.createBackup('pre-group-reconciliation', { safety:true });
  if (!safety) { restoreOperationLocked = false; throw new Error('Riallineamento gruppo sospeso: backup di sicurezza locale non riuscito'); }
  beginRemoteGroupEpochGuard({ ...details, safetyBackupId:safety.id });
  lanTransport?.suspendForInk();
  cloudTransport?.suspendForInk();
  audioRecorder?.suspendForInk();
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
    await rebuildLessonIndexFromPages();
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
  if (syncRestoreGuard.mode !== 'global-authoritative') await resetSyncStores();
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
  // 0.1.39: seconda copia persistente del codice Cloud nel DB principale.
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
    ...(isSyncRestorePending() ? ['⚠ Ripristino backup di gruppo: invio Sync bloccato fino al riallineamento protetto.'] : []),
    ...(isLocalRestoreSyncQuarantined() ? [localRestoreSyncQuarantineMessage()] : []),
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
  if (isLocalRestoreSyncQuarantined()) {
    if (localRestoreSyncQuarantine.resumeChannel !== 'Cloud Sync') { confirmResumeSyncAfterLocalRestore('Cloud Sync'); return; }
    clearLocalRestoreSyncQuarantine();
  }
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
  if (isSyncRestorePending() || isLocalRestoreSyncQuarantined()) return false;
  if (restoreOperationLocked || backupSnapshotFreeze) return false;
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
    ...(isSyncRestorePending() ? ['⚠ Ripristino backup di gruppo: invio Sync bloccato fino al riallineamento protetto.'] : []),
    ...(isLocalRestoreSyncQuarantined() ? [localRestoreSyncQuarantineMessage()] : []),
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
  if (isLocalRestoreSyncQuarantined()) {
    if (localRestoreSyncQuarantine.resumeChannel !== 'Sync LAN') { confirmResumeSyncAfterLocalRestore('Sync LAN'); return; }
    clearLocalRestoreSyncQuarantine();
  }
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

async function ensureNotesCount(dateString, lessonId = '', lessonBoardIndex = 0) {
  const cacheKey = notesCacheKey(dateString, lessonId, lessonBoardIndex);
  if (notesCountCache.has(cacheKey)) return notesCountCache.get(cacheKey);
  try {
    await openDb();
    const record = await getRecord(notesMetaKey(dateString, lessonId, lessonBoardIndex));
    session.storageReads++;
    const count = Math.max(0, Number(record?.count) || 0);
    notesCountCache.set(cacheKey, count);
    return count;
  } catch (err) {
    session.storageErrors++;
    console.warn('Conteggio Note non disponibile', err);
    notesCountCache.set(cacheKey, 0);
    return 0;
  }
}

async function persistNotesCount(dateString, count, lessonId = '', lessonBoardIndex = 0) {
  try {
    await openDb();
    const lessonScoped = Boolean(lessonId);
    await putRecord({
      date: notesMetaKey(dateString, lessonId, lessonBoardIndex),
      kind: lessonScoped ? 'lesson-board-notes-meta' : 'day-notes-meta',
      referenceDate: dateString,
      lessonId: lessonScoped ? lessonId : null,
      lessonBoardIndex: lessonScoped ? Math.max(1, Number(lessonBoardIndex) || 1) : 0,
      count,
      version: APP_VERSION,
      modifiedAt: new Date().toISOString()
    });
    session.storageWrites++;
    notesCountCache.set(notesCacheKey(dateString, lessonId, lessonBoardIndex), count);
    return true;
  } catch (err) {
    session.storageErrors++;
    console.warn('Salvataggio conteggio Note non riuscito', err);
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

function interactiveImages() {
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return continuousEnsureViewportToolState()?.images || [];
  return images;
}

function setInteractiveImages(value) {
  const next = Array.isArray(value) ? value : [];
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    const state = continuousEnsureViewportToolState();
    if (state) state.images = next;
  } else images = next;
}

function selectedImage() {
  return interactiveImages().find((image) => image.id === selectedImageId) ?? null;
}

function updateImageInspector() {
  if (!imageInspector) return;
  const imageMode = activeTool === 'image';
  imageInspector.hidden = !imageMode;
  const hasSelection = Boolean(selectedImage());
  for (const button of [cropImageButton, rotateImageLeftButton, rotateImageRightButton]) {
    if (!button) continue;
    button.disabled = !hasSelection;
    button.setAttribute('aria-disabled', hasSelection ? 'false' : 'true');
  }
  if (cutImageButton) {
    const canCut = hasSelection && !localImageCutClipboard?.image;
    cutImageButton.disabled = !canCut;
    cutImageButton.setAttribute('aria-disabled', canCut ? 'false' : 'true');
  }
  if (pasteImageButton) {
    const canPaste = Boolean(localImageCutClipboard?.image) && !localImageCutClipboard?.pendingImageId;
    pasteImageButton.disabled = !canPaste;
    pasteImageButton.setAttribute('aria-disabled', canPaste ? 'false' : 'true');
  }
}

function renderImages(targetLayer = imageLayer, sourceImages = null, interactive = targetLayer === imageLayer && activeTool === 'image') {
  if (!targetLayer) return;
  if (sourceImages == null) {
    if (targetLayer === imageLayer && continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      // Drawing and visibility must follow the same owner. The selected tool
      // can stay armed during scrolling while its preview is temporarily off.
      sourceImages = paper?.classList.contains('continuous-tool-preview')
        ? (continuousEnsureViewportToolState()?.images || []) : [];
    } else sourceImages = images;
  }
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
  selectedImageId = interactiveImages().some((image) => image.id === id) ? id : null;
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
    const collection = interactiveImages();
    collection.push(image);
    setInteractiveImages(collection);
    selectedImageId = image.id;
    session.imagesImported++;
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      continuousCommitDirectToolMutation('image-add');
    } else {
      rememberUndo({ type: 'add-image', image: cloneImageObject(image), index: collection.length - 1 });
      dirty = true;
      syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.add', image);
    }
    renderImages();
    statusLabel.textContent = 'immagine inserita';
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
  if (continuousLessonActive && image?.__continuousViewportProxy) {
    // Nel foglio continuo il centro dell'immagine può attraversare un confine
    // tecnico: la limitiamo alla viewport solo quanto basta per mantenerla
    // recuperabile durante il gesto, poi al pointerup viene ri-assegnata al tile.
    const visibleGrip = Math.min(.08, Math.max(.035, image.h * .25));
    image.y = Math.min(1 - visibleGrip, Math.max(-image.h + visibleGrip, Number(image.y) || 0));
  } else image.y = Math.min(1 - image.h, Math.max(0, image.y));
  image.rotation = ((Number(image.rotation) || 0) % 360 + 360) % 360;
  image.modifiedAt = new Date().toISOString();
}

function beginImageGesture(ev) {
  if (denyMutationDuringSyncRecovery()) return;
  if (activeTool !== 'image' || drawing || pageTurning || !imageLayer) return;
  const item = ev.target instanceof Element ? ev.target.closest('.image-object') : null;
  if (!item || !imageLayer.contains(item)) {
    // 0.1.73 — un tap sul foglio chiude il menu Immagini senza iniziare un tratto Ink.
    setSelectedImage(null);
    selectTool('pen');
    statusLabel.textContent = 'menu immagini chiuso';
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    return;
  }
  const id = item.dataset.imageId;
  const image = interactiveImages().find((candidate) => candidate.id === id);
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
    session.imageTransforms++;
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      continuousCommitDirectToolMutation('image-update');
    } else {
      rememberUndo({ type: 'update-image', id: image.id, before: g.before, after: cloneImageObject(image) });
      dirty = true;
      syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', image, { before: g.before });
    }
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
  session.imageTransforms++;
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    continuousCommitDirectToolMutation('image-rotate');
  } else {
    rememberUndo({ type: 'update-image', id: image.id, before, after: cloneImageObject(image) });
    dirty = true;
    syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', image, { before });
  }
  renderImages();
  scheduleSave();
}

async function cutSelectedImage() {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning || imageBusy) return;
  if (localImageCutClipboard?.image) {
    statusLabel.textContent = 'incolla prima l’immagine già tagliata';
    return;
  }
  const collection = interactiveImages();
  const index = collection.findIndex((image) => image.id === selectedImageId);
  if (index < 0) return;
  const image = collection[index];
  const clipboard = {
    image: cloneImageObject(image),
    sourcePageKey: currentPageKey(),
    cutAt: new Date().toISOString()
  };
  imageBusy = true;
  try {
    await saveLocalImageCutClipboard(clipboard);
    localImageCutClipboard = clipboard;
    collection.splice(index, 1);
    setInteractiveImages(collection);
    selectedImageId = null;
    session.imagesDeleted++;
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      continuousCommitDirectToolMutation('image-cut');
    } else {
      rememberUndo({ type: 'remove-image', image: cloneImageObject(image), index });
      dirty = true;
      syncFoundation?.recordImageDeleted(pageDescriptor(), image.id);
    }
    renderImages();
    scheduleSave();
    updateImageInspector();
    statusLabel.textContent = 'immagine tagliata · pronta da incollare';
  } catch (err) {
    console.warn('Taglia immagine non riuscito', err);
    statusLabel.textContent = 'errore taglia · immagine non rimossa';
  } finally {
    imageBusy = false;
  }
}

async function ensureClipboardImageBlob(image) {
  if (!image?.src) throw new Error('Clipboard immagine non valida');
  if (isSha256Hash(image.blobHash) && await hasSyncBlob(image.blobHash).catch(() => false)) return image;
  const blob = dataUrlToBlob(image.src);
  const row = await registerBlob(blob, image.mimeType || blob.type);
  image.blobHash = row.hash;
  image.blobSize = row.size;
  image.mimeType = row.mimeType;
  return image;
}

async function pasteCutImage() {
  if (denyMutationDuringSyncRecovery()) return;
  if (drawing || pageTurning || imageBusy || !localImageCutClipboard?.image || localImageCutClipboard?.pendingImageId) return;
  imageBusy = true;
  const clipboardSnapshot = localImageCutClipboard;
  statusLabel.textContent = 'incollo immagine';
  try {
    const source = await ensureClipboardImageBlob(cloneImageObject(clipboardSnapshot.image));
    const now = new Date().toISOString();
    const image = normalizeImageObject({
      ...source,
      id: makeImageId(),
      createdAt: now,
      modifiedAt: now
    });
    if (!image) throw new Error('Immagine incollata non valida');
    // Prima di modificare la pagina, rendiamo persistente sul solo dispositivo
    // lo stato "incolla in attesa". Se l'app si interrompe qui, al riavvio la
    // riconciliazione ripristina automaticamente la possibilità di Incolla.
    const pendingClipboard = {
      ...clipboardSnapshot,
      pendingImageId: image.id,
      pendingPageKey: currentPageKey(),
      pasteRequestedAt: now
    };
    await saveLocalImageCutClipboard(pendingClipboard);
    localImageCutClipboard = pendingClipboard;
    const collection = interactiveImages();
    collection.push(image);
    setInteractiveImages(collection);
    selectedImageId = image.id;
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      continuousCommitDirectToolMutation('image-paste');
      const persistedProxy = continuousEnsureViewportToolState()?.images?.find((candidate) => candidate.id === image.id);
      const ownerIndex = Math.max(1, Number(persistedProxy?.__continuousOwnerIndex) || Number(currentLessonBoardIndex) || 1);
      localImageCutClipboard = { ...localImageCutClipboard, pendingPageKey:lessonBoardKey(activeLesson.id, ownerIndex) };
      await saveLocalImageCutClipboard(localImageCutClipboard);
    } else {
      rememberUndo({ type: 'add-image', image: cloneImageObject(image), index: collection.length - 1 });
      dirty = true;
      syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.add', image, {
        reason: 'local-cut-paste',
        sourcePageKey: clipboardSnapshot.sourcePageKey
      });
    }
    renderImages();
    // Non svuotiamo ancora la clipboard: persistSnapshot la elimina soltanto
    // dopo il commit locale riuscito della pagina di destinazione.
    updateImageInspector();
    scheduleSave();
    statusLabel.textContent = 'immagine incollata · salvataggio in corso';
  } catch (err) {
    console.warn('Incolla immagine non riuscito', err);
    statusLabel.textContent = 'errore incolla · immagine ancora in memoria';
    // In caso di errore la clipboard NON viene eliminata.
    updateImageInspector();
  } finally {
    imageBusy = false;
  }
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
  const image = interactiveImages().find((candidate) => candidate.id === imageCropEditor.imageId);
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
  const image = interactiveImages().find((candidate) => candidate.id === imageCropEditor.imageId);
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
    session.imageTransforms++;
    session.imageCrops++;
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      continuousCommitDirectToolMutation('image-crop');
    } else {
      rememberUndo({ type: 'update-image', id: image.id, before, after: cloneImageObject(image) });
      dirty = true;
      syncFoundation?.recordImageMetadata(pageDescriptor(), 'image.update', image, { before, crop: true });
    }
    closeImageCropEditor();
    renderImages();
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
  if (voiceScriptToolButton && voiceScript?.isListening?.()) {
    voiceScriptToolButton.classList.add('voice-listening');
    voiceScriptToolButton.setAttribute('aria-pressed', 'true');
  }
  if (rulerButton) {
    const enabled = Boolean(rulerTool?.state?.enabled);
    rulerButton.classList.toggle('active', enabled);
    rulerButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
  // 0.1.20: Undo/Redo restano sempre target Pointer reali. Lo stato
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

function toggleRulerTool() {
  if (drawing) finalizeStroke('ruler-toolbar-recovery');
  if (!rulerTool) return false;
  const enabled = rulerTool.toggle();
  updateToolUi();
  statusLabel.textContent = enabled
    ? (['pen', 'highlighter'].includes(activeTool)
      ? 'righello attivo · estremità ruotano · centro sposta · doppio tap cambia strumento'
      : 'righello attivo · doppio tap: goniometro / squadre · seleziona Penna o Evidenziatore per tracciare')
    : 'righello disattivato';
  return enabled;
}

function activateShapeTool() {
  if (drawing || pageTurning) return;
  if (activeTool !== 'shape') {
    selectTool('shape');
    return;
  }
  if (!shapePalette) return;
  const opening = shapePalette.hidden;
  shapePalette.hidden = !opening;
  shapeToolButton?.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (opening) updateShapePaletteUi();
}

// 0.1.88 — il Lazo dispone di un vero livello input sopra l'area scrivibile.
// Lo stato del livello è anche una seconda sorgente di verità: se Safari/UI
// desincronizzano activeTool, il primo contatto sullo shield riallinea il Lazo.
function syncLassoInputShieldBounds() {
  if (!lassoInputShield) return;
  // Usa gli stessi limiti reali dell'Ink: evita disallineamenti quando l'altezza
  // dell'intestazione cambia (Agenda/Planner/Orario o layout iPad compatto).
  lassoInputShield.style.top = `${Math.max(0, protectedTop)}px`;
  lassoInputShield.style.bottom = `${Math.max(0, FOOTER_PX)}px`;
}

function setLassoInputShieldActive(value) {
  if (!lassoInputShield) return;
  const enabled = Boolean(value);
  if (enabled) {
    syncLassoInputShieldBounds();
    // Strategia Agenda 0.1.92: su Safari/iPadOS non affidarsi solo alla
    // property .hidden. Rimuovere fisicamente l'attributo rende lo shield
    // immediatamente interattivo anche dopo ricomposizioni dei layer.
    lassoInputShield.removeAttribute('hidden');
    lassoInputShield.hidden = false;
  } else {
    lassoInputShield.setAttribute('hidden', '');
    lassoInputShield.hidden = true;
  }
  lassoInputShield.setAttribute('aria-hidden', enabled ? 'false' : 'true');
}

function isLassoInputShieldArmed() {
  return Boolean(lassoInputShield && !lassoInputShield.hidden);
}

function isLassoInputSurfaceTarget(target) {
  return Boolean(lassoInputShield && target instanceof Element && (target === lassoInputShield || lassoInputShield.contains(target)));
}

// 0.1.88 — sorgente di verità robusta del Lazo.
// Sul dispositivo reale è stato verificato che il pannello Lazo si apre anche
// quando il successivo contatto non entra nel controller. Perciò la UI visibile
// (inspector/button) arma il Lazo quanto activeTool/shield. Il router globale
// della Penna vede così lo stesso stato che vede l'utente.
function isLassoUiArmed() {
  return Boolean(
    lassoSessionArmed ||
    activeTool === 'lasso' ||
    isLassoInputShieldArmed() ||
    (lassoInspector && lassoInspector.hidden === false) ||
    lassoToolButton?.classList.contains('active') ||
    lassoToolButton?.getAttribute('aria-pressed') === 'true'
  );
}

function ensureLassoInputShieldRuntime() {
  if (!isLassoUiArmed()) return false;
  lassoSessionArmed = true;
  if (activeTool !== 'lasso') activeTool = 'lasso';
  if (!lassoTool?.isActive?.()) lassoTool?.setActive?.(true);
  setLassoInputShieldActive(true);
  paper?.classList.add('lasso-mode');
  lassoToolButton?.classList.add('active');
  lassoToolButton?.setAttribute('aria-pressed', 'true');
  if (lassoInspector) lassoInspector.hidden = false;
  return true;
}

function deactivatePageTool(reason = '') {
  if (drawing || pageTurning) return false;
  if (isLassoUiArmed()) { resetLassoInputCapture(); lassoTool?.setActive?.(false); setLassoInputShieldActive(false); }
  lassoSessionArmed = false;
  cancelShapeGesture();
  activeTool = 'none';
  selectedImageId = null;
  closeStylePanel();
  if (shapePalette) shapePalette.hidden = true;
  shapeOverlay?.setAttribute('hidden', '');
  shapeToolButton?.setAttribute('aria-expanded', 'false');
  paper?.classList.remove('shape-mode', 'lasso-mode', 'voice-script-armed', 'image-edit-mode');
  renderImages();
  updateToolUi();
  updateStyleUi();
  if (reason) statusLabel.textContent = reason;
  return true;
}

function activateVoiceScriptTool() {
  if (drawing || pageTurning) return;
  if (voiceScript?.isActive?.()) {
    voiceScript.stopAndFinalize('toolbar');
    deactivatePageTool();
    updateToolUi();
    return;
  }
  if (!voiceScript?.isSupported?.()) {
    statusLabel.textContent = 'Voice Script non disponibile su questo Safari/iPadOS';
    return;
  }
  if (audioRecorder?.isRecording?.()) {
    statusLabel.textContent = 'termina prima la registrazione audio';
    return;
  }
  deactivatePageTool();
  selectTool('voice');
  statusLabel.textContent = 'Voice Script · tocca con Pencil o dito il punto di inserimento';
}

// 0.1.82 — Lazo usa un'attivazione esplicita, come Figure/Immagini/Voce.
// Su Safari/iPadOS non dipende più esclusivamente dal ramo generico data-tool.
function activateLassoTool() {
  if (pageTurning) return false;
  lassoSessionArmed = true;
  if (drawing) finalizeStroke('lasso-toolbar-recovery');
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    void continuousEnsureVisibleEntries().then(() => {
      if (activeTool === 'lasso') {
        continuousEnsureViewportToolState({ force:true });
        continuousSetToolPreview(true);
        renderAll();
        renderImages();
        lassoTool?.syncPage?.();
      }
    });
  }
  if (drawing || pageTurning) return false;
  if (voiceScript?.isActive?.()) voiceScript.stopAndFinalize('lasso-tool');
  resetLassoInputCapture();
  selectTool('lasso');
  setLassoInputShieldActive(true);
  // Rinforzo intenzionale: se un browser ha perso uno dei passaggi UI,
  // lo stato del controller Lazo viene riallineato esplicitamente.
  lassoTool?.setActive?.(true);
  paper?.classList.add('lasso-mode');
  lassoToolButton?.classList.add('active');
  lassoToolButton?.setAttribute('aria-pressed', 'true');
  if (lassoInspector) lassoInspector.hidden = false;
  statusLabel.textContent = 'lazo · disegna un contorno chiuso';
  // Safari può ricomporre i layer dopo il pointerdown della toolbar. Un riarmo
  // al frame successivo è fuori dal motore Ink e rende stabile lo shield.
  requestAnimationFrame(() => {
    if (activeTool === 'lasso') ensureLassoInputShieldRuntime();
  });
  return true;
}

function selectTool(tool) {
  if (!['pen', 'highlighter', 'eraser', 'lasso', 'shape', 'voice', 'image'].includes(tool) || drawing || pageTurning) return;
  if (tool !== 'image' && imageCropEditor) closeImageCropEditor();
  if (tool !== 'shape') cancelShapeGesture();
  if (tool !== 'lasso') lassoSessionArmed = false;
  if (isLassoUiArmed() && tool !== 'lasso') { resetLassoInputCapture(); lassoTool?.setActive?.(false); setLassoInputShieldActive(false); }
  activeTool = tool;
  if (tool === 'lasso') { lassoSessionArmed = true; lassoTool?.setActive?.(true); setLassoInputShieldActive(true); }
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    if (tool === 'lasso' || tool === 'image') {
      continuousEnsureViewportToolState({ force:true });
      continuousSetToolPreview(true);
    } else {
      continuousClearViewportToolState({ clearSelection:tool !== 'lasso' });
    }
  }
  if (tool !== 'image') selectedImageId = null;
  closeStylePanel();
  paper?.classList.toggle('shape-mode', tool === 'shape');
  paper?.classList.toggle('lasso-mode', tool === 'lasso');
  paper?.classList.toggle('voice-script-armed', tool === 'voice');
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
    : tool === 'lasso' ? 'lazo · disegna un contorno chiuso'
    : tool === 'shape' ? `figure · ${SHAPE_LABELS[selectedShapeType]} · trascina o fai clic`
    : tool === 'voice' ? 'Voice Script · scegli il punto di inserimento'
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
  if (activeTool !== 'shape' || shapeGesture || drawing || pageTurning || pageStyleBulkBusy) return false;
  if (continuousLessonActive && currentPageKind === 'agenda' && ev.pointerType === 'touch') return false;
  if (isUiControlTarget(ev.target)) return false;
  if (ev.isPrimary === false || (ev.pointerType === 'mouse' && ev.button !== 0)) return false;
  const point = shapePointFromPointer(ev);
  if (!point) return false;
  cancelPendingSave();
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) continuousStrokeScrollTop = Math.max(0, Number(continuousViewport?.scrollTop) || 0);
  shapeGesture = { pointerId: ev.pointerId, start: point, current: point };
  syncShapeOverlayBounds();
  updateShapePreview();
  try { shapeOverlay?.setPointerCapture?.(ev.pointerId); } catch {}
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

function moveShapeGesture(ev) {
  if (!shapeGesture || ev.pointerId !== shapeGesture.pointerId) return false;
  const x = Math.max(rect.left, Math.min(rect.right, ev.clientX));
  const y = Math.max(rect.top + protectedTop, Math.min(rect.bottom - FOOTER_PX, ev.clientY));
  shapeGesture.current = {
    x: (x - rect.left) / Math.max(1, rect.width),
    y: (y - rect.top) / Math.max(1, rect.height)
  };
  updateShapePreview();
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

function cancelShapeGesture() {
  if (shapePreviewPath) shapePreviewPath.setAttribute('d', '');
  shapeGesture = null;
}

function endShapeGesture(ev, cancelled = false) {
  if (!shapeGesture || ev.pointerId !== shapeGesture.pointerId) return false;
  const gesture = shapeGesture;
  if (!cancelled) moveShapeGesture(ev);
  try { shapeOverlay?.releasePointerCapture?.(gesture.pointerId); } catch {}
  if (cancelled) {
    cancelShapeGesture();
    ev.preventDefault();
    ev.stopPropagation();
    return true;
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
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    continuousCommitCompletedInkStroke(shape);
  } else {
    strokes.push(shape);
    rememberUndo({ type: 'add-stroke', stroke: shape, index: strokes.length - 1 });
    syncFoundation?.recordStrokeAdded(pageDescriptor(), shape);
    dirty = true;
    renderAll();
  }
  session.shapesInserted++;
  scheduleSave();
  statusLabel.textContent = `${SHAPE_LABELS[shape.shapeType]} inserita`;
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

// 0.1.39 — import e ritaglio restano separati dal motore Ink.
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
  if (drawing || pageTurning) return;
  if (activeTool === 'image') {
    selectTool('pen');
    statusLabel.textContent = 'menu immagini chiuso';
    return;
  }
  selectTool('image');
  statusLabel.textContent = 'menu immagini';
}


let beautifyFeedbackTimer = 0;

function setBeautifyFeedback(message, state = 'busy', autoHideMs = 0) {
  const text = String(message || '').trim();
  // Il feedback deve essere visibile anche se il footer usa stacking/transform.
  if (beautifyFeedback && beautifyFeedback.parentElement !== document.body) {
    try { document.body.appendChild(beautifyFeedback); } catch {}
  }
  if (beautifyFeedbackTimer) {
    clearTimeout(beautifyFeedbackTimer);
    beautifyFeedbackTimer = 0;
  }
  if (beautifyFeedback) {
    beautifyFeedback.textContent = text;
    beautifyFeedback.dataset.state = state;
    beautifyFeedback.hidden = !text;
    beautifyFeedback.classList.toggle('is-visible', !!text);
  }
  if (beautifyButton) {
    beautifyButton.dataset.beautifyState = state;
    beautifyButton.setAttribute('aria-label', text || 'Beautify');
  }
  if (text) statusLabel.textContent = text;
  if (autoHideMs > 0 && text) {
    beautifyFeedbackTimer = setTimeout(() => {
      beautifyFeedback?.classList.remove('is-visible');
      if (beautifyFeedback) beautifyFeedback.hidden = true;
      if (beautifyButton) {
        delete beautifyButton.dataset.beautifyState;
        beautifyButton.setAttribute('aria-label', 'Beautify');
      }
      beautifyFeedbackTimer = 0;
    }, autoHideMs);
  }
}

function nextPaint() {
  // Safari può ritardare/sospendere un singolo RAF durante transizioni UI.
  // Non permettiamo che Beautify resti busy per sempre prima del try/finally.
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    try { requestAnimationFrame(finish); } catch {}
    setTimeout(finish, 60);
  });
}

function cloneStrokeForBeautify(value) {
  if (!value || typeof value !== 'object') return value;
  try { return structuredClone(value); } catch {}
  try { return JSON.parse(JSON.stringify(value)); } catch {}
  return { ...value, points:Array.isArray(value.points) ? value.points.map((point) => ({ ...point })) : value.points };
}

function makeBeautifiedTextItem(replacement) {
  const height = Math.max(1, canvas.clientHeight || rect?.height || 1366);
  return {
    id: makeId(),
    kind: 'text',
    tool: 'beautify-text',
    source: 'beautify',
    text: String(replacement?.text || '').trim(),
    x: Math.max(0, Math.min(1, Number(replacement?.x) || 0)),
    y: Math.max(0, Math.min(1, Number(replacement?.topY) || 0)),
    color: replacement?.color || toolStrokeStyle('pen').color || PEN_COLOR,
    fontFamily: 'Snell Roundhand',
    fontSizeNorm: Math.max(14, Math.min(92, Number(replacement?.fontSizePx) || 24)) / height,
    targetWidthNorm: Math.max(0, Math.min(1, Number(replacement?.targetWidthNorm) || 0)),
    language: 'it-IT',
    anchorMode: 'top',
    recognitionConfidence: 0,
    beautifyBounds: replacement?.bounds || null,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  };
}

function applyBeautifyHistory(action, mode) {
  if (!action || action.type !== 'beautify') return false;
  const descriptor = pageDescriptor();
  const removeEntries = mode === 'undo' ? action.after : action.before;
  const restoreEntries = mode === 'undo' ? action.before : action.after;
  const removeIds = new Set((removeEntries || []).map((entry) => entry?.stroke?.id).filter(Boolean));
  if (removeIds.size) {
    const removed = strokes.filter((stroke) => removeIds.has(stroke?.id));
    strokes = strokes.filter((stroke) => !removeIds.has(stroke?.id));
    for (const stroke of removed) syncFoundation?.recordStrokeDeleted(descriptor, stroke.id, `beautify-${mode}`);
  }
  for (const entry of [...(restoreEntries || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const stroke = cloneStrokeForBeautify(entry?.stroke);
    if (!stroke?.id || strokes.some((item) => item?.id === stroke.id)) continue;
    const index = Math.max(0, Math.min(Number(entry.index) || 0, strokes.length));
    strokes.splice(index, 0, stroke);
    syncFoundation?.recordStrokeAdded(descriptor, stroke);
  }
  return true;
}


async function beautifyContinuousViewport() {
  if (!continuousLessonActive || currentPageKind !== 'agenda' || !activeLesson?.id) return false;
  await continuousEnsureVisibleEntries();
  const state = continuousEnsureViewportToolState({ force:true });
  if (!state) return false;
  const startScrollTop = state.scrollTop;
  const lessonIdAtStart = String(activeLesson.id);
  const sourceSnapshot = (state.strokes || []).map((stroke) => cloneStrokeForBeautify(stroke));
  const sourceIdsAtStart = new Set(sourceSnapshot.map((stroke) => stroke?.id).filter(Boolean));
  beautifyAbortController?.abort?.();
  beautifyAbortController = new AbortController();
  const width = Math.max(1, canvas.clientWidth || rect?.width || 1024);
  const height = Math.max(1, canvas.clientHeight || rect?.height || 1366);
  const plan = await buildBeautifyPlan({
    strokes:sourceSnapshot,
    width,
    height,
    language:'it',
    preferredFontSizePx:normalizeBeautifyLessonFontSize(activeLesson?.beautifyFontSizePx),
    signal:beautifyAbortController.signal,
    onProgress:({ phase, index, total, mode }) => {
      if (phase === 'analysis') setBeautifyFeedback('Beautify · analisi righe…', 'busy');
      else if ((mode === 'fallback' || mode === 'concurrent') && index > 0) setBeautifyFeedback(`Beautify · riconoscimento ${index}/${total}`, 'busy');
      else setBeautifyFeedback('Beautify · riconoscimento…', 'busy');
    }
  });
  if (!continuousLessonActive || String(activeLesson?.id || '') !== lessonIdAtStart || Math.abs((continuousViewport?.scrollTop || 0) - startScrollTop) > 1 || drawing || pageTurning) {
    setBeautifyFeedback('Beautify non applicato · foglio modificato o spostato', 'error', 2600);
    return true;
  }
  // Rebuild from the actual document after recognition: an old proxy cannot
  // detect a stroke moved/erased or added while the request was in flight.
  const liveState = continuousEnsureViewportToolState({ force:true });
  const currentIds = new Set((liveState?.strokes || []).map((stroke) => stroke?.id).filter(Boolean));
  if ([...sourceIdsAtStart].some((id) => !currentIds.has(id)) || continuousObjectJson(sourceSnapshot) !== continuousObjectJson(liveState?.strokes || [])) {
    setBeautifyFeedback('Beautify non applicato · contenuto modificato', 'error', 2600);
    return true;
  }
  if (!plan?.replacements?.length) {
    setBeautifyFeedback(plan?.eligibleCount ? 'Beautify · nessun testo riconosciuto' : 'Beautify · nessuna scrittura da trasformare', 'info', 2600);
    return true;
  }
  if (activeLesson?.id && normalizeBeautifyLessonFontSize(activeLesson.beautifyFontSizePx) == null) {
    const established = normalizeBeautifyLessonFontSize(plan.uniformFontSizePx);
    if (established != null) {
      activeLesson = normalizeLesson({ ...activeLesson, beautifyFontSizePx:established });
      saveActiveLesson({ touch:false });
    }
  }
  const replacementSourceIds = new Set(plan.replacements.flatMap((item) => item.sourceIds || []));
  const beforeCount = liveState.strokes.length;
  liveState.strokes = liveState.strokes.filter((stroke) => !replacementSourceIds.has(stroke?.id));
  let added = 0;
  for (const replacement of plan.replacements) {
    const item = makeBeautifiedTextItem(replacement);
    if (!item.text) continue;
    item.__continuousViewportProxy = true;
    liveState.strokes.push(item);
    added++;
  }
  if (!added) {
    liveState.strokes = continuousDeepClone(liveState.baselineStrokes || []);
    setBeautifyFeedback('Beautify · riconoscimento non applicabile', 'info', 2400);
    return true;
  }
  continuousPendingLassoUndoProxyAction = { type:'beautify' };
  const committed = continuousCommitViewportToolState('beautify');
  if (!committed) {
    continuousPendingLassoUndoProxyAction = null;
    setBeautifyFeedback('Beautify non applicato · nessuna modifica persistibile', 'error', 2400);
    return true;
  }
  continuousSetToolPreview(activeTool === 'lasso' || activeTool === 'image');
  renderAll();
  renderImages();
  scheduleSave();
  const px = Number(plan?.uniformFontSizePx);
  const suffix = Number.isFinite(px) ? ` · font lezione ${Math.round(px)} px` : '';
  setBeautifyFeedback(`Beautify · ${added} ${added === 1 ? 'riga trasformata' : 'righe trasformate'}${suffix} · Undo disponibile`, 'ok', 3200);
  console.debug('Beautify continuous viewport', { beforeCount, added });
  return true;
}

async function beautifyCurrentBoard() {
  if (beautifyBusy) {
    setBeautifyFeedback('Beautify · elaborazione già in corso', 'busy', 1400);
    return;
  }
  if (!ready) {
    setBeautifyFeedback('Beautify · app ancora in inizializzazione', 'info', 1800);
    return;
  }
  if (pageTurning) {
    setBeautifyFeedback('Beautify · attendi il cambio lavagna', 'info', 1600);
    return;
  }
  if (drawing) finalizeStroke('beautify-command-recovery');
  if (denyMutationDuringSyncRecovery()) {
    setBeautifyFeedback('Beautify · temporaneamente bloccato dal ripristino Sync', 'info', 2200);
    return;
  }
  if (currentPageKind !== 'agenda') {
    setBeautifyFeedback('Beautify disponibile sulla pagina Note corrente', 'info', 2200);
    return;
  }
  if (!navigator.onLine) {
    setBeautifyFeedback('Beautify richiede una connessione Internet', 'error', 2600);
    return;
  }

  if (continuousLessonActive) {
    beautifyBusy = true;
    beautifyButton?.classList.add('is-busy');
    beautifyButton?.setAttribute('aria-busy', 'true');
    setBeautifyFeedback('Beautify · comando ricevuto', 'busy');
    try {
      await nextPaint();
      setBeautifyFeedback('Beautify · analisi…', 'busy');
      await beautifyContinuousViewport();
    } catch (error) {
      if (error?.name === 'AbortError') setBeautifyFeedback('Beautify annullato', 'info', 2000);
      else if (error?.name === 'BeautifyTimeoutError') setBeautifyFeedback('Beautify non applicato · rete/riconoscimento troppo lento', 'error', 3000);
      else {
        console.warn('Beautify continuous: riconoscimento non riuscito', error);
        setBeautifyFeedback('Beautify non disponibile in questo momento', 'error', 3000);
      }
    } finally {
      beautifyBusy = false;
      beautifyButton?.classList.remove('is-busy');
      beautifyButton?.removeAttribute('aria-busy');
      beautifyAbortController = null;
    }
    return;
  }

  beautifyBusy = true;
  beautifyButton?.classList.add('is-busy');
  beautifyButton?.setAttribute('aria-busy', 'true');
  setBeautifyFeedback('Beautify · comando ricevuto', 'busy');

  try {
    await nextPaint();
    setBeautifyFeedback('Beautify · analisi…', 'busy');
    const pageKeyAtStart = currentPageKey();
    const sourceSnapshot = strokes.map((stroke) => cloneStrokeForBeautify(stroke));
    const sourceIdsAtStart = new Set(sourceSnapshot.map((stroke) => stroke?.id).filter(Boolean));
    beautifyAbortController?.abort?.();
    beautifyAbortController = new AbortController();
    setBeautifyFeedback('Beautify · riconoscimento…', 'busy');
    const width = Math.max(1, canvas.clientWidth || rect?.width || 1024);
    const height = Math.max(1, canvas.clientHeight || rect?.height || 1366);
    const plan = await buildBeautifyPlan({
      strokes: sourceSnapshot,
      width,
      height,
      language:'it',
      preferredFontSizePx: normalizeBeautifyLessonFontSize(activeLesson?.beautifyFontSizePx),
      signal:beautifyAbortController.signal,
      onProgress:({ phase, index, total, mode }) => {
        if (phase === 'analysis') setBeautifyFeedback('Beautify · analisi righe…', 'busy');
        else if ((mode === 'fallback' || mode === 'concurrent') && index > 0) setBeautifyFeedback(`Beautify · riconoscimento ${index}/${total}`, 'busy');
        else setBeautifyFeedback('Beautify · riconoscimento…', 'busy');
      }
    });
    if (currentPageKey() !== pageKeyAtStart || drawing || pageTurning) {
      setBeautifyFeedback('Beautify non applicato · pagina o Ink modificati', 'error', 2600);
      return;
    }
    const currentIds = new Set(strokes.map((stroke) => stroke?.id).filter(Boolean));
    if ([...sourceIdsAtStart].some((id) => !currentIds.has(id))) {
      setBeautifyFeedback('Beautify non applicato · contenuto modificato', 'error', 2600);
      return;
    }
    if (!plan?.replacements?.length) {
      setBeautifyFeedback(plan?.eligibleCount ? 'Beautify · nessun testo riconosciuto' : 'Beautify · nessuna scrittura da trasformare', 'info', 2600);
      return;
    }

    // 0.1.27: la prima conversione valida della lezione fissa la baseline font.
    // Le lavagne successive riutilizzano esattamente questo valore: niente drift.
    if (activeLesson?.id && normalizeBeautifyLessonFontSize(activeLesson.beautifyFontSizePx) == null) {
      const established = normalizeBeautifyLessonFontSize(plan.uniformFontSizePx);
      if (established != null) {
        activeLesson = normalizeLesson({ ...activeLesson, beautifyFontSizePx: established });
        saveActiveLesson({ touch:false });
      }
    }

    setBeautifyFeedback('Beautify · applicazione…', 'busy');
    const replacementSourceIds = new Set(plan.replacements.flatMap((item) => item.sourceIds || []));
    const before = [];
    strokes.forEach((stroke, index) => {
      if (stroke?.id && replacementSourceIds.has(stroke.id)) before.push({ index, stroke:cloneStrokeForBeautify(stroke) });
    });
    if (!before.length) {
      setBeautifyFeedback('Beautify · nessun tratto sostituibile', 'info', 2200);
      return;
    }

    const descriptor = pageDescriptor();
    strokes = strokes.filter((stroke) => !replacementSourceIds.has(stroke?.id));
    for (const entry of before) syncFoundation?.recordStrokeDeleted(descriptor, entry.stroke.id, 'beautify');

    const after = [];
    for (const replacement of plan.replacements) {
      const item = makeBeautifiedTextItem(replacement);
      if (!item.text) continue;
      const sourcePositions = before
        .filter((entry) => (replacement.sourceIds || []).includes(entry.stroke?.id))
        .map((entry) => entry.index);
      const desiredIndex = sourcePositions.length ? Math.min(...sourcePositions) : strokes.length;
      const index = Math.max(0, Math.min(desiredIndex, strokes.length));
      strokes.splice(index, 0, item);
      after.push({ index, stroke:cloneStrokeForBeautify(item) });
      syncFoundation?.recordStrokeAdded(descriptor, item);
    }
    if (!after.length) {
      for (const entry of before.sort((a,b)=>a.index-b.index)) strokes.splice(Math.max(0, Math.min(entry.index, strokes.length)), 0, entry.stroke);
      setBeautifyFeedback('Beautify · riconoscimento non applicabile', 'info', 2400);
      return;
    }

    rememberUndo({ type:'beautify', before, after });
    renderAll();
    dirty = true;
    scheduleSave();
    const px = Number(plan?.uniformFontSizePx);
    const suffix = Number.isFinite(px) ? ` · font lezione ${Math.round(px)} px` : '';
    setBeautifyFeedback(`Beautify · ${after.length} ${after.length === 1 ? 'riga trasformata' : 'righe trasformate'}${suffix} · Undo disponibile`, 'ok', 3200);
  } catch (error) {
    if (error?.name === 'AbortError') setBeautifyFeedback('Beautify annullato', 'info', 2000);
    else if (error?.name === 'BeautifyTimeoutError') setBeautifyFeedback('Beautify non applicato · rete/riconoscimento troppo lento', 'error', 3000);
    else {
      console.warn('Beautify: riconoscimento non riuscito', error);
      setBeautifyFeedback('Beautify non disponibile in questo momento', 'error', 3000);
    }
  } finally {
    beautifyBusy = false;
    beautifyButton?.classList.remove('is-busy');
    beautifyButton?.removeAttribute('aria-busy');
    beautifyAbortController = null;
  }
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
  if (continuousApplyToolHistory(action, 'undo')) {
    pushBounded(redoHistory, action, REDO_LIMIT);
    statusLabel.textContent = 'annullato';
    updateToolUi();
    return;
  }
  if (lassoTool?.applyHistory?.(action, 'undo')) {
    pushBounded(redoHistory, action, REDO_LIMIT);
    updateToolUi();
    return;
  }
  if (continuousApplyInkHistory(action, 'undo')) {
    pushBounded(redoHistory, action, REDO_LIMIT);
    statusLabel.textContent = 'annullato';
    updateToolUi();
    scheduleSave();
    return;
  }
  if (action?.type === 'beautify') {
    if (applyBeautifyHistory(action, 'undo')) pushBounded(redoHistory, action, REDO_LIMIT);
  } else if (action?.type === 'add-stroke' && action.stroke?.id) {
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
  if (continuousApplyToolHistory(action, 'redo')) {
    pushBounded(undoHistory, action, UNDO_LIMIT);
    statusLabel.textContent = 'ripristinato';
    updateToolUi();
    return;
  }
  if (lassoTool?.applyHistory?.(action, 'redo')) {
    pushBounded(undoHistory, action, UNDO_LIMIT);
    updateToolUi();
    return;
  }
  if (continuousApplyInkHistory(action, 'redo')) {
    pushBounded(undoHistory, action, UNDO_LIMIT);
    statusLabel.textContent = 'ripristinato';
    updateToolUi();
    scheduleSave();
    return;
  }
  if (action?.type === 'beautify') {
    if (applyBeautifyHistory(action, 'redo')) pushBounded(undoHistory, action, UNDO_LIMIT);
  } else if (action?.type === 'add-stroke' && action.stroke?.id) {
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
  const maxFontPx = item?.source === 'beautify' ? 92 : 72;
  const minFontPx = item?.source === 'beautify' ? 14 : 18;
  const fontPx = Math.max(minFontPx, Math.min(maxFontPx, (Number.isFinite(normalizedSize) ? normalizedSize : (CROSS_PLATFORM_TEXT_FONT_PX / Math.max(1, height))) * height));
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
  const baselineAnchored = item?.anchorMode === 'baseline';
  targetCtx.textBaseline = baselineAnchored ? 'alphabetic' : 'top';
  targetCtx.font = `${fontPx}px ${fontStack}`;
  const targetWidth = item?.source === 'beautify' ? Math.max(0, Number(item?.targetWidthNorm || 0) * width) : 0;
  String(item?.text ?? '').split(/\r?\n/).forEach((line, index) => {
    const lineY = y + index * lineHeight;
    if (targetWidth > 1) targetCtx.fillText(line, x, lineY, targetWidth);
    else targetCtx.fillText(line, x, lineY);
  });
  targetCtx.restore();
}

function segmentIntersectsBox(a, b, box) {
  if (!a || !b || !box) return false;
  const inside = (point) => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
  if (inside(a) || inside(b)) return true;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, a.x - box.left) && clip(dx, box.right - a.x)
    && clip(-dy, a.y - box.top) && clip(dy, box.bottom - a.y) && t0 <= t1;
}

function crossPlatformTextLineBoxes(item, width, height) {
  if (!isCrossPlatformTextItem(item)) return [];
  const x = Math.max(0, Math.min(width, Number(item?.x ?? 0) * width));
  const y = Math.max(0, Math.min(height, Number(item?.y ?? 0) * height));
  const normalizedSize = Number(item?.fontSizeNorm);
  const maxFontPx = item?.source === 'beautify' ? 92 : 72;
  const minFontPx = item?.source === 'beautify' ? 14 : 18;
  const fontPx = Math.max(minFontPx, Math.min(maxFontPx, (Number.isFinite(normalizedSize) ? normalizedSize : (CROSS_PLATFORM_TEXT_FONT_PX / Math.max(1, height))) * height));
  const lineHeight = fontPx * 1.05;
  const requestedFont = safeCanvasFontFamily(item?.fontFamily);
  const fontStack = [requestedFont ? `"${requestedFont}"` : '', '"Snell Roundhand"', '"Apple Chancery"', '"Segoe Script"', '"Segoe Print"', 'cursive'].filter(Boolean).join(', ');
  const baselineAnchored = item?.anchorMode === 'baseline';
  ctx.save();
  ctx.font = `${fontPx}px ${fontStack}`;
  const boxes = String(item?.text ?? '').split(/\r?\n/).map((line, index) => {
    const metrics = ctx.measureText(line || ' ');
    const measuredWidth = Math.max(fontPx * .35, Number(metrics?.width) || 0);
    const targetWidth = item?.source === 'beautify' ? Math.max(0, Number(item?.targetWidthNorm || 0) * width) : 0;
    const widthPx = targetWidth > 1 ? Math.min(measuredWidth, targetWidth) : measuredWidth;
    const lineY = y + index * lineHeight;
    if (baselineAnchored) {
      const ascent = Math.max(fontPx * .72, Number(metrics?.actualBoundingBoxAscent) || 0);
      const descent = Math.max(fontPx * .18, Number(metrics?.actualBoundingBoxDescent) || 0);
      return { left:x, top:Math.max(0, lineY-ascent), right:Math.min(width, x+widthPx), bottom:Math.min(height, lineY+descent) };
    }
    return { left:x, top:lineY, right:Math.min(width, x + widthPx), bottom:Math.min(height, lineY + lineHeight) };
  });
  ctx.restore();
  return boxes;
}

function textItemHitByEraser(item, eraserStroke) {
  if (!isCrossPlatformTextItem(item)) return false;
  const width = Math.max(1, rect?.width || canvas.clientWidth || 1024);
  const height = Math.max(1, rect?.height || canvas.clientHeight || 1366);
  const points = Array.isArray(eraserStroke?.points) ? eraserStroke.points.map((point) => ({ x:(Number(point?.x)||0)*width, y:(Number(point?.y)||0)*height })) : [];
  if (!points.length) return false;
  const radius = Math.max(3, (Number(eraserStroke?.width) || ERASER_WIDTH) / 2);
  const boxes = crossPlatformTextLineBoxes(item, width, height).map((box) => ({ left:box.left-radius, top:box.top-radius, right:box.right+radius, bottom:box.bottom+radius }));
  if (points.length === 1) return boxes.some((box) => points[0].x >= box.left && points[0].x <= box.right && points[0].y >= box.top && points[0].y <= box.bottom);
  for (let index = 1; index < points.length; index++) {
    if (boxes.some((box) => segmentIntersectsBox(points[index - 1], points[index], box))) return true;
  }
  return false;
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
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    // Il canvas Retina è un overlay LIVE fisso. In uso normale l'Ink persistito
    // è nei tile statici; durante Lazo il canvas mostra invece la composizione
    // viewport unificata, così il confine tra segmenti resta invisibile.
    const entry = continuousCaptureActiveEntry();
    if (entry) continuousRenderStaticSegment(currentLessonBoardIndex, entry);
    if (paper?.classList.contains('continuous-tool-preview') && continuousViewportToolState) {
      for (const stroke of continuousViewportToolState.strokes || []) drawStoredStroke(stroke);
    }
    lassoTool?.syncPage?.();
    return;
  }
  for (const stroke of strokes) drawStoredStroke(stroke);
  lassoTool?.syncPage?.();
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
  if (isLassoInputShieldArmed()) syncLassoInputShieldBounds();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderAll();
  rulerTool?.handleResize?.();
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

function drawRulerBatch(events) {
  if (!drawing || !activeStroke || !events.length || !rulerInkGuide) return;
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
    const point = projectNormalizedPointToGuide(normalizeEvent(sample), rect, rulerInkGuide);
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

function drawBatch(events) {
  if (rulerInkGuide) return drawRulerBatch(events);
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
  if (restoreMutationActive) return false;
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
      lessonId: descriptor.lessonId || null,
      lessonBoardIndex: Number(descriptor.lessonBoardIndex) || 0,
      lessonAcquisitionDate: descriptor.lessonId ? activeLesson?.acquisitionDate || descriptor.date : null,
      lessonSubject: descriptor.lessonId ? activeLesson?.subject || '' : '',
      lessonTopic: descriptor.lessonId ? activeLesson?.topic || '' : '',
      lessonCreatedAt: descriptor.lessonId ? activeLesson?.createdAt || '' : '',
      lessonLastEditedAt: descriptor.lessonId ? activeLesson?.lastEditedAt || new Date().toISOString() : '',
      lessonBeautifyFontSizePx: descriptor.lessonId ? normalizeBeautifyLessonFontSize(activeLesson?.beautifyFontSizePx) : null,
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
    if (descriptor.lessonId && activeLesson?.id === descriptor.lessonId) saveActiveLesson({ touch:true });
    // 0.1.73 — una immagine tagliata resta nella clipboard locale fino a quando
    // la pagina di destinazione dell'Incolla è stata realmente persistita.
    if (localImageCutClipboard?.pendingImageId
        && localImageCutClipboard.pendingPageKey === descriptor.key
        && (pageImages || []).some((image) => image?.id === localImageCutClipboard.pendingImageId)) {
      await clearLocalImageCutClipboard().catch((err) => {
        console.warn('Pulizia clipboard immagini dopo Incolla non riuscita', err);
      });
      updateImageInspector();
    }
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
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    statusLabel.textContent = 'salvataggio';
    const ok = await flushContinuousSegmentSaves();
    statusLabel.textContent = ok ? 'salvato' : 'errore salvataggio';
    if (ok) scheduleCloudAuto('local-commit', 5000);
    return;
  }
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
  if (!ready || pageTurning || activeTool === 'image' || activeTool === 'lasso' || activeTool === 'none') return false;
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
  audioRecorder?.suspendForInk();
  // 0.1.44: anche il recupero del santo è subordinato alla Pencil.
  // Se parte un tratto, una eventuale richiesta esterna viene interrotta.
  saintFetchController?.abort();
  saintBioFetchController?.abort();
  historyFetchController?.abort();
  historyDetailFetchController?.abort();
  weatherFetchController?.abort();
  weatherDetailFetchController?.abort();
  weatherLocalityFetchController?.abort();

  cancelPendingSave();
  if (storageBusy) session.strokesStartedWhileStorageBusy++;
  drawing = true;
  pointerId = ev.pointerId;
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    continuousStrokeScrollTop = Math.max(0, Number(continuousViewport?.scrollTop) || 0);
  }
  rect = canvas.getBoundingClientRect();
  rulerInkGuide = rulerTool?.prepareInkGuide?.(ev.clientX, ev.clientY, activeTool) ?? null;
  let point = normalizeEvent(ev);
  if (rulerInkGuide) point = projectNormalizedPointToGuide(point, rect, rulerInkGuide);
  if (!pointAllowed(point)) {
    drawing = false;
    pointerId = null;
    rulerInkGuide = null;
    lanTransport?.resumeAfterInk();
    cloudTransport?.resumeAfterInk();
    audioRecorder?.resumeAfterInk();
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
  if (activeTool === 'eraser') continuousBeginEraserPreview();
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
    makeFragmentId: () => makeId(),
    eligible: (stroke) => !isCrossPlatformTextItem(stroke)
  });

  const textChanges = [];
  for (let index = 0; index < before.length; index++) {
    const item = before[index];
    if (!isCrossPlatformTextItem(item) || !item?.id) continue;
    if (textItemHitByEraser(item, eraserStroke)) textChanges.push({ original:item, originalIndex:index, fragments:[] });
  }
  const removedTextIds = new Set(textChanges.map((change) => String(change.original?.id || '')));
  const changes = [...result.changes, ...textChanges];

  // Il feedback realtime usa destination-out. Al rilascio la cancellazione
  // diventa strutturale anche per gli oggetti testo Voice Script.
  strokes = result.strokes.filter((stroke) => !removedTextIds.has(String(stroke?.id || '')));
  renderAll();
  const eraseMs = performance.now() - eraseStarted;
  session.structuralErasures++;
  session.structuralEraseTouched += (result.touched || 0) + textChanges.length;
  session.structuralEraseFragments += result.fragments || 0;
  session.maxStructuralEraseMs = Math.max(session.maxStructuralEraseMs, eraseMs);
  if (!changes.length) return false;

  rememberUndo({ type: 'erase-strokes', changes });
  recordStructuralEraseChanges(changes, 'eraser-structural');
  return true;
}

function finalizeStroke(reason = 'pointerup') {
  if (!drawing) return;
  drawing = false;
  const completedStroke = activeStroke?.points?.length ? activeStroke : null;
  let pageChanged = false;
  if (completedStroke && continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    pageChanged = completedStroke.tool === 'eraser'
      ? continuousApplyCompletedEraser(completedStroke)
      : continuousCommitCompletedInkStroke(completedStroke);
  } else if (completedStroke?.tool === 'eraser') {
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
  rulerInkGuide = null;
  lastPoint = null;
  lastHandlerArrival = 0;
  dirty = (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id)
    ? continuousDirtySegments.has(currentLessonBoardIndex)
    : (dirty || pageChanged);
  // 0.1.33: nessuna logica Sync entra in pointermove. Penna/evidenziatore
  // generano un solo ADD al PEN UP; la gomma genera DELETE + eventuali ADD
  // dei frammenti residui soltanto dopo la conclusione della passata.
  lanTransport?.resumeAfterInk();
  cloudTransport?.resumeAfterInk();
  audioRecorder?.resumeAfterInk();
  if (!cachedSaintName(currentDate)) scheduleSaintRefresh(700);
  if (!cachedHistoryInfo(currentDate).text) scheduleHistoryRefresh(850);
  if (agendaDateEligibleForWeather(currentDate)) scheduleWeatherRefresh(1000);
  if (pageChanged) scheduleSave();
}

function wrapVoiceScriptText(text, xNorm, fontFamily, fontSizePx) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const width = Math.max(1, canvas.clientWidth || rect?.width || 1024);
  const xPx = Math.max(0, Math.min(width, Number(xNorm) * width));
  const maxWidth = Math.max(90, width - xPx - 16);
  ctx.save();
  ctx.font = `${Math.max(18, Math.min(72, Number(fontSizePx) || 32))}px "${safeCanvasFontFamily(fontFamily) || 'Snell Roundhand'}", "Apple Chancery", "Segoe Script", cursive`;
  const words = raw.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines.join('\n');
}

function continuousCommitVoiceScriptText(payload, descriptor, wrappedText) {
  if (!continuousLessonActive || !activeLesson?.id || descriptor?.kind !== 'agenda') return false;
  const metrics = continuousMetrics();
  const segmentHeight = Math.max(1, continuousSegmentHeight || metrics.height);
  const capturedScrollTop = Number.isFinite(Number(descriptor?.continuousScrollTop))
    ? Math.max(0, Number(descriptor.continuousScrollTop))
    : Math.max(0, Number(continuousViewport?.scrollTop) || 0);
  const fontSizePx = Math.max(18, Math.min(72, Number(payload.fontSizePx) || 32));
  const lineHeightPx = Math.max(fontSizePx * 1.28, fontSizePx + 4);
  const lines = String(wrappedText || '').split('\n');
  const startDocPx = Math.max(0, capturedScrollTop + (Math.max(0, Math.min(1, Number(payload.y) || 0)) * metrics.paperHeight - metrics.top));
  let segmentIndex = Math.max(1, Math.floor(startDocPx / segmentHeight) + 1);
  let localPx = Math.max(0, startDocPx - (segmentIndex - 1) * segmentHeight);
  let cursor = 0;
  const pieces = [];
  while (cursor < lines.length) {
    const remainingPx = Math.max(lineHeightPx, segmentHeight - localPx);
    const capacity = Math.max(1, Math.floor(remainingPx / lineHeightPx));
    const chunk = lines.slice(cursor, cursor + capacity).join('\n');
    const item = {
      id:makeId(),
      kind:'text',
      tool:'voice-text',
      source:'voice-script',
      text:chunk,
      x:Math.max(0, Math.min(1, Number(payload.x) || 0)),
      y:Math.max(0, Math.min(1, (metrics.top + localPx) / metrics.paperHeight)),
      color:payload.color || toolStrokeStyle('pen').color || PEN_COLOR,
      fontFamily:payload.fontFamily || 'Snell Roundhand',
      fontSizeNorm:fontSizePx / Math.max(1, canvas.clientHeight || rect?.height || metrics.paperHeight),
      language:payload.language || 'it-IT',
      anchorMode:'top',
      recognitionConfidence:Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : 0,
      createdAt:payload.createdAt || new Date().toISOString(),
      modifiedAt:new Date().toISOString()
    };
    const entry = continuousGetEntrySync(segmentIndex, { createEmpty:true });
    entry.strokes.push(item);
    continuousMarkEntryChanged(segmentIndex, entry);
    syncFoundation?.recordStrokeAdded(continuousSegmentDescriptor(segmentIndex), item);
    pieces.push({ index:segmentIndex, stroke:item });
    cursor += capacity;
    segmentIndex += 1;
    localPx = 0;
  }
  if (!pieces.length) return false;
  rememberUndo({ type:'continuous-add-stroke', pieces });
  for (const piece of pieces) {
    for (let slotIndex = Math.max(1, piece.index - 1); slotIndex <= Math.min(continuousVirtualCount, piece.index + 1); slotIndex++) {
      const slot = continuousSegmentSlots.get(slotIndex); if (slot) slot.renderedKey = '';
      continuousRenderStaticSegment(slotIndex, continuousSegmentCache.get(slotIndex));
    }
  }
  continuousHideActiveStaticSlot();
  renderAll();
  scheduleSave();
  return true;
}

async function commitVoiceScriptText(payload = {}) {
  const descriptor = { ...(payload.descriptor || pageDescriptor()) };
  const text = wrapVoiceScriptText(payload.text, payload.x, payload.fontFamily, payload.fontSizePx);
  if (!text || !descriptor.key) return false;
  const height = Math.max(1, canvas.clientHeight || rect?.height || 1366);
  const item = {
    id: makeId(),
    kind: 'text',
    tool: 'voice-text',
    source: 'voice-script',
    text,
    x: Math.max(0, Math.min(1, Number(payload.x) || 0)),
    y: Math.max(0, Math.min(1, Number(payload.y) || 0)),
    color: payload.color || toolStrokeStyle('pen').color || PEN_COLOR,
    fontFamily: payload.fontFamily || 'Snell Roundhand',
    fontSizeNorm: Math.max(18, Math.min(72, Number(payload.fontSizePx) || 32)) / height,
    language: payload.language || 'it-IT',
    anchorMode: 'top',
    recognitionConfidence: Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : 0,
    createdAt: payload.createdAt || new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  };

  if (descriptor.lessonId && descriptor.kind === 'agenda' && Number.isFinite(Number(descriptor.continuousScrollTop))) {
    return continuousCommitVoiceScriptText(payload, descriptor, text);
  }

  if (descriptor.key === currentPageKey()) {
    strokes.push(item);
    rememberUndo({ type:'add-stroke', stroke:item, index:strokes.length - 1 });
    syncFoundation?.recordStrokeAdded(descriptor, item);
    renderAll();
    dirty = true;
    scheduleSave();
    return true;
  }

  try {
    await openDb();
    const record = await getRecord(descriptor.key);
    const pageStrokes = [...(Array.isArray(record?.strokes) ? record.strokes : []), item];
    const targetStyle = normalizePageStyle(record?.pageStyle || globalPageStyle);
    const targetImages = Array.isArray(record?.images) ? record.images : [];
    syncFoundation?.recordStrokeAdded(descriptor, item);
    return await persistSnapshot(descriptor, pageStrokes, false, targetStyle, targetImages);
  } catch (err) {
    console.warn('Voice Script: salvataggio pagina origine non riuscito', err);
    return false;
  }
}

function beginVoiceScriptPlacement(ev) {
  if (activeTool !== 'voice') return false;
  if (continuousLessonActive && currentPageKind === 'agenda' && ev.pointerType === 'touch') return false;
  if (!ready || pageTurning || pageStyleBulkBusy) { ev.preventDefault?.(); return true; }
  if (isUiControlTarget(ev.target)) return true;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return true;
  rect = canvas.getBoundingClientRect();
  if (!pointInsideWritableArea(ev)) { ev.preventDefault?.(); return true; }
  const point = normalizeEvent(ev);
  if (!pointAllowed(point)) { ev.preventDefault?.(); return true; }
  const style = toolStrokeStyle('pen');
  const started = voiceScript?.startAt?.({
    x: point.x,
    y: point.y,
    descriptor: {
      ...pageDescriptor(),
      ...(continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id
        ? { continuousScrollTop:Math.max(0, Number(continuousViewport?.scrollTop) || 0) }
        : {})
    },
    penColor: style.color
  });
  if (started) {
    if (ev.pointerType === 'touch') lastVoicePlacementTouchAt = performance.now();
    deactivatePageTool();
    // La dettatura resta attiva, ma nessun altro strumento pagina viene
    // riattivato automaticamente. Per scrivere durante la dettatura si
    // seleziona esplicitamente Penna (o un altro strumento).
    updateToolUi();
  }
  ev.preventDefault?.();
  ev.stopPropagation?.();
  return true;
}

function isUiControlTarget(target) {
  // L'overlay Lazo è puramente grafico (pointer-events:none) e NON deve mai
  // impedire al router di ricevere il gesto, anche su Safari/iPadOS.
  return target instanceof Element && Boolean(target.closest('button, input, select, textarea, .style-panel, .shape-palette, .shape-overlay, .lasso-inspector, .report-panel, .mini-calendar, .settings-panel, .saint-detail-panel, .history-detail-panel, .image-layer, .image-inspector, .lesson-archive-panel, .lesson-setup-panel, .lesson-pdf-panel'));
}

// Il Lazo deve poter iniziare anche sopra immagini, Figure e altri contenuti pagina.
// Per questo NON usa isUiControlTarget(), che correttamente blocca tali layer per l'Ink.
// Qui vengono esclusi soltanto i controlli UI reali.
function isLassoUiControlTarget(target) {
  if (!(target instanceof Element) || !paper?.contains(target)) return true;
  return Boolean(target.closest(
    'button, input, select, textarea, .style-panel, .shape-palette, .lasso-inspector, .report-panel, .mini-calendar, .settings-panel, .saint-detail-panel, .history-detail-panel, .image-inspector, .baseline-footer, .quick-toolbar, .planner-mode-bar'
  ));
}

function getUiButtonTarget(target) {
  return target instanceof Element ? target.closest('button') : null;
}

function activateUiButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.dataset.lessonPdfOpen) { openLessonPdf(button.dataset.lessonPdfOpen,'open'); return; }
  if (button.dataset.lessonPdfExport) { openLessonPdf(button.dataset.lessonPdfExport,'export'); return; }
  if (button.dataset.lessonDelete) { void deleteLessonGroup(button.dataset.lessonDelete); return; }
  if (button.dataset.lessonOpen) {
    const lesson = lessonIndex.find((item) => item.id === button.dataset.lessonOpen);
    if (!lesson) return;
    const boardIndex = Math.max(1, Number(lesson.currentBoardIndex) || 1);
    void resumeLessonAtSavedPosition(lesson, 'lezione aperta').then(() => {
      if (lessonArchivePanel) lessonArchivePanel.hidden = true;
      restoreAgendaInteractiveTools('lesson-archive-open');
    });
    return;
  }
  if (button !== shapeToolButton && !button.matches('[data-shape-type]')) closeShapePalette();
  if (button === rulerButton) { toggleRulerTool(); return; }
  if (button === undoButton && !undoHistory.length) return;
  if (button === redoButton && !redoHistory.length) return;
  if (button === imageToolButton) {
    activateImageTool();
    return;
  }
  if (button === shapeToolButton) {
    activateShapeTool();
    return;
  }
  if (button === lassoToolButton) {
    activateLassoTool();
    return;
  }
  if (button === lassoCutButton) { void lassoTool?.cutSelection?.(); return; }
  if (button === lassoPasteButton) { void lassoTool?.pasteClipboard?.(); return; }
  if (button === lassoClearButton) { lassoTool?.clearSelection?.('selezione annullata'); return; }
  if (button === voiceScriptToolButton) {
    activateVoiceScriptTool();
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
  if (button === beautifyButton) {
    void beautifyCurrentBoard();
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
  // 0.1.13 — gli sfondi rapidi devono essere attivabili anche con Apple Pencil.
  // La chiamata avviene solo al contatto UI diretto, fuori dal motore Ink.
  if (button.matches('.quick-paper-button')) {
    if (button.dataset.quickTemplate) void setPageTemplate(button.dataset.quickTemplate);
    else if (button.dataset.quickColor) void setPageColor(button.dataset.quickColor);
    return;
  }
  if (button === importImageButton) { requestImageImport(); return; }
  if (button === cropImageButton) { void openImageCropEditor(); return; }
  if (button === cancelImageCropButton) { closeImageCropEditor('ritaglio annullato'); return; }
  if (button === applyImageCropButton) { void applyImageCrop(); return; }
  if (button === rotateImageLeftButton) { rotateSelectedImage(-15); return; }
  if (button === rotateImageRightButton) { rotateSelectedImage(15); return; }
  if (button === cutImageButton) { void cutSelectedImage(); return; }
  if (button === pasteImageButton) { void pasteCutImage(); return; }
  if (button === newLessonButton) { void (async () => { if (ready && dirty) await persistNow(); openLessonSetup({ startup:false, tab:'new' }); })(); return; }
  if (button === closeLessonButton) { void closeCurrentLessonToStartup(); return; }
  if (button === lessonArchiveButton) { openLessonArchive(); return; }
  if (button === lessonSetupStartButton) { void startNewLessonFromDialog(); return; }
  if (button === lessonSetupResumeButton) { void resumeLastLessonFromStartup(); return; }
  if (button === lessonSetupNewTabButton) { setLessonSetupMode('new'); return; }
  if (button === lessonSetupOpenTabButton) { setLessonSetupMode('open'); return; }
  if (button === lessonSetupCloseButton) { closeLessonSetup(); return; }
  if (button === lessonArchiveCloseButton) { if (lessonArchivePanel) lessonArchivePanel.hidden = true; restoreAgendaInteractiveTools('lesson-archive-close'); return; }
  if (button === lessonSubjectAddButton) {
    const value = cleanLessonText(lessonSubjectNewInput?.value, 80);
    if (value) { if (!lessonSubjects.includes(value)) lessonSubjects.push(value); saveLessonSubjects(); if (lessonSubjectNewInput) lessonSubjectNewInput.value=''; renderLessonSubjectSettings(); }
    return;
  }
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
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    continuousStopMomentum();
    // Pencil ha priorità assoluta: un eventuale gesto dito in corso viene chiuso
    // prima del PEN DOWN e non può spostare il documento durante il tratto.
    continuousTouch = null;
    const { first, last } = continuousVisibleSegmentRange();
    let missingVisibleSegment = false;
    for (let index = first; index <= last; index++) {
      if (!continuousGetEntrySync(index)) { missingVisibleSegment = true; break; }
    }
    if (missingVisibleSegment) {
      ev.preventDefault();
      const pending = { downEvent:ev, latestEvent:ev };
      continuousPendingInkStarts.set(ev.pointerId, pending);
      void continuousEnsureVisibleEntries().then(() => {
        if (continuousPendingInkStarts.get(ev.pointerId) !== pending) return;
        continuousPendingInkStarts.delete(ev.pointerId);
        if (drawing) return;
        if (startStroke(pending.downEvent, 'pointerdown-continuous') && pending.latestEvent !== pending.downEvent) handlePointerMove(pending.latestEvent);
      }).catch((err) => {
        continuousPendingInkStarts.delete(ev.pointerId);
        console.warn('Preparazione viewport Ink non riuscita', err);
      });
      return;
    }
  }
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

  const pendingContinuousStart = continuousPendingInkStarts.get(ev.pointerId);
  if (pendingContinuousStart) {
    pendingContinuousStart.latestEvent = ev;
    ev.preventDefault();
    return;
  }

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
  if (continuousPendingInkStarts.has(ev.pointerId)) {
    continuousPendingInkStarts.delete(ev.pointerId);
    ev.preventDefault();
    return;
  }
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
  if (continuousPendingInkStarts.has(ev.pointerId)) {
    continuousPendingInkStarts.delete(ev.pointerId);
    ev.preventDefault();
    return;
  }
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
    `Note iPad v${APP_VERSION}`,
    `Data pagina: ${currentDate}`,
    `Tipo pagina: ${currentPageKind === 'note' ? `Nota ${currentNoteIndex}/${currentNoteTotal}` : isPlannerKind() ? (currentPlannerMode === 'daily' ? 'Obiettivi della lezione' : `Planner ${currentPlannerMode}`) : 'Lavagna'}`, 
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

async function clearContinuousLessonSheet({ requireConfirmation = true, reason = 'manual' } = {}) {
  if (!continuousLessonActive || currentPageKind !== 'agenda' || !activeLesson?.id) return false;
  if (drawing || !ready || eraserClearBusy) return false;
  const lessonId = String(activeLesson.id);
  if (requireConfirmation && !window.confirm(`Cancellare tutto il foglio continuo della lezione “${activeLesson.subject} - ${activeLesson.topic}”?`)) return false;

  eraserClearBusy = true;
  cancelPendingSave();
  continuousStopMomentum();
  clearTimeout(continuousScrollSettleTimer);
  continuousScrollSettleTimer = 0;
  continuousPrefetchGeneration++;

  try {
    // Una write già partita deve terminare PRIMA dei delete, altrimenti potrebbe
    // ricreare un segmento dopo la cancellazione. I dirty non ancora accodati,
    // invece, sono intenzionalmente scartati perché l'utente ha chiesto Clear All.
    await continuousSaveChain.catch(() => false);
    await openDb();
    const records = await readAllMainRecords();
    const prefix = `lesson::${lessonId}::segment::`;
    const persistedByIndex = new Map();
    for (const row of records) {
      const key = String(row?.date || '');
      if (row?.kind !== 'agenda-day-ink') continue;
      if (String(row?.lessonId || '') !== lessonId && !key.startsWith(prefix)) continue;
      const parsed = Number(row?.lessonBoardIndex) || Number(key.match(/::segment::(\d{5})/)?.[1]) || 1;
      persistedByIndex.set(Math.max(1, parsed), row);
    }

    // Un segmento può esistere solo in RAM (modificato ma non ancora persistito):
    // deve comunque ricevere l'evento Sync di clear e sparire insieme agli altri.
    const indexes = new Set([
      Math.max(1, Number(currentLessonBoardIndex) || 1),
      ...persistedByIndex.keys(),
      ...continuousSegmentCache.keys(),
      ...continuousDirtySegments.values()
    ]);

    for (const index of [...indexes].sort((a,b) => a-b)) {
      const persisted = persistedByIndex.get(index);
      const cached = continuousSegmentCache.get(index);
      const key = String(persisted?.date || lessonBoardKey(lessonId, index));
      const descriptor = { ...continuousSegmentDescriptor(index), key, lessonId, lessonBoardIndex:index };
      const removedStrokeIds = [...new Set([
        ...(Array.isArray(persisted?.strokes) ? persisted.strokes : []),
        ...(Array.isArray(cached?.strokes) ? cached.strokes : [])
      ].map((stroke) => stroke?.id).filter(Boolean))];
      const removedImageIds = [...new Set([
        ...(Array.isArray(persisted?.images) ? persisted.images : []),
        ...(Array.isArray(cached?.images) ? cached.images : [])
      ].map((image) => image?.id).filter(Boolean))];
      syncFoundation?.recordPageCleared(descriptor, removedStrokeIds, removedImageIds);
      const commit = syncFoundation?.prepareAtomicCommit(key) ?? { events: [], eventIds: [], stateRow: null };
      const txStart = performance.now();
      await deleteRecordWithSync(key, commit);
      if (commit.eventIds?.length) syncFoundation?.markAtomicCommitSucceeded(commit.eventIds, performance.now() - txStart);
    }

    // Solo dopo che tutti i record sono stati eliminati aggiorniamo la vista.
    continuousDirtySegments.clear();
    continuousSegmentCache.clear();
    for (const slot of continuousSegmentSlots.values()) slot.root?.remove();
    continuousSegmentSlots.clear();
    continuousTrack?.replaceChildren();
    continuousPrefetchWindowKey = '';
    currentLessonBoardIndex = 1;
    if (continuousViewport) continuousViewport.scrollTop = 0;
    strokes = [];
    images = [];
    selectedImageId = null;
    resetUndoHistory();
    dirty = false;
    activeLesson = normalizeLesson({
      ...activeLesson,
      boardCount:1,
      currentBoardIndex:1,
      lastScrollSegment:1,
      lastScrollOffset:0,
      lastEditedAt:new Date().toISOString()
    });
    saveActiveLesson({ touch:false });
    renderAll();
    renderImages();
    await continuousActivate({ segmentIndex:1, offset:0, preserveCache:false });
    statusLabel.textContent = reason === 'eraser-triple-tap'
      ? 'foglio continuo cancellato · triplo tap/click Gomma'
      : 'foglio continuo vuoto';
    return true;
  } catch (err) {
    syncFoundation?.markAtomicCommitFailed?.();
    statusLabel.textContent = 'errore cancellazione foglio completo';
    console.warn('Cancellazione foglio continuo non riuscita', err);
    return false;
  } finally {
    eraserClearBusy = false;
  }
}

async function clearCurrentPage(options = {}) {
  if (denyMutationDuringSyncRecovery()) return false;
  const requireConfirmation = options?.requireConfirmation !== false;
  const reason = String(options?.reason || 'manual');
  if (drawing || !ready || eraserClearBusy) return false;
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    return clearContinuousLessonSheet({ requireConfirmation, reason });
  }
  if (!strokes.length && !images.length) {
    statusLabel.textContent = 'pagina già vuota';
    return false;
  }
  const label = currentPageKind === 'note' ? `Nota ${currentNoteIndex}/${currentNoteTotal}` : isPlannerKind() ? currentPlannerMode === 'daily' ? 'Obiettivi della lezione' : `Planner ${currentPlannerMode}` : 'pagina Agenda';
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
    statusLabel.textContent = reason === 'eraser-triple-tap' ? 'pagina cancellata · triplo tap/click Gomma' : 'pagina vuota';
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
  if (descriptor.kind === 'note') return descriptor.lessonId ? `NOTA ${descriptor.noteIndex}/${Math.max(1, Number(descriptor.lessonBoardIndex) || 1)}` : `Note del giorno ${descriptor.noteIndex}/${Math.max(descriptor.noteIndex, descriptor.noteTotal)}`;
  if (isPlannerKind(descriptor.kind)) return `PLANNER · ${String(descriptor.plannerMode ?? 'daily').toUpperCase()}`;
  return 'NOTE · ANTEPRIMA';
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
  renderLessonHeaderFor(clone, descriptor, true);
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
        : pageStyleForDescriptor(record, descriptor)
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
  // 0.1.34 — dentro una lezione non esiste più una sequenza di pagine orizzontali:
  // tutta la scrittura vive nel foglio continuo verticale.
  if (activeLesson?.id && (currentPageKind === 'agenda' || currentPageKind === 'note')) return null;
  const targetDate = addDays(currentDate, direction);
  if (!dateInRange(targetDate)) return null;
  return pageDescriptor(targetDate, 'agenda', 0, 0);
}

function verticalTarget(direction) {
  // 0.1.53 — Orario settimanale raggiungibile con swipe verso il basso
  // da qualsiasi modalità di Planning. Lo swipe inverso torna esattamente alla modalità di partenza.
  // direction -1 = swipe verso il basso; direction +1 = swipe verso l'alto.
  if (isPlannerKind() && currentPageKind !== 'planner-timetable' && currentPageKind !== 'planner-daily' && direction < 0) {
    weeklyTimetableReturnDescriptor = pageDescriptor();
    return pageDescriptor(currentDate, 'planner-timetable', 0, 0, 1);
  }
  if (currentPageKind === 'planner-timetable' && direction > 0) {
    return isPlannerKind(weeklyTimetableReturnDescriptor?.kind) && weeklyTimetableReturnDescriptor.kind !== 'planner-timetable'
      ? { ...weeklyTimetableReturnDescriptor }
      : pageDescriptor(currentDate, 'planner-weekly', 0, 0);
  }

  // Dagli Obiettivi lo swipe verso l'alto torna esattamente al punto della pagina Note
  // da cui erano stati aperti; gli altri Planner conservano il ritorno all'Agenda.
  if (isPlannerKind()) {
    if (currentPageKind === 'planner-daily' && direction > 0 && lessonGoalsReturnDescriptor) {
      return { ...lessonGoalsReturnDescriptor };
    }
    return direction > 0 ? pageDescriptor(currentDate, 'agenda', 0, 0) : null;
  }

  // 0.1.34 — la pagina della lezione scorre direttamente nel viewport continuo.
  // Le gesture verticali legacy non devono creare Note o cambiare segmento.
  if (activeLesson?.id) return null;

  // Agenda non associata a una lezione: swipe verso il basso apre il Planner Giornaliero.
  if (currentPageKind === 'agenda' && direction < 0) {
    return pageDescriptor(currentDate, 'planner-daily', 0, 0);
  }

  const count = notesCountCache.get(notesCacheKey(currentDate, '', 0)) ?? currentNoteTotal ?? 0;

  // Note del giorno legacy: swipe verso il basso torna alla nota precedente/Agenda.
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
      : (activeLesson?.id && currentPageKind === 'agenda' ? (direction === 1 ? 'pagina Note successiva' : 'pagina Note precedente') : (direction === 1 ? 'giorno successivo' : 'giorno precedente'));
    else if (target.kind === 'agenda') statusLabel.textContent = 'torna ad Agenda';
    else if (target.kind === 'planner-daily') statusLabel.textContent = 'apri Obiettivi della lezione';
    else if (target.kind === 'planner-timetable') statusLabel.textContent = 'apri Orario settimanale';
    else if (target.kind === 'planner-weekly') statusLabel.textContent = 'torna al Planning settimanale';
    else statusLabel.textContent = activeLesson?.id ? 'scorri pagina Note' : `Nota ${target.noteIndex}/${target.noteTotal}`;
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
  statusLabel.textContent = mode === 'daily' ? 'apro Obiettivi della lezione' : `apro Planner ${mode}`;
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
    statusLabel.textContent = mode === 'daily' ? ((strokes.length || images.length) ? 'Obiettivi della lezione caricati' : 'Obiettivi della lezione') : ((strokes.length || images.length) ? `Planner ${mode} caricato` : `Planner ${mode}`);
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
  const metaPromise = target.createNote ? persistNotesCount(target.date, target.noteTotal, target.lessonId || '', target.lessonBoardIndex || 0) : Promise.resolve(true);
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
  if (target.kind === 'agenda' && activeLesson?.id) {
    currentLessonBoardIndex = Math.max(1, Number(target.lessonBoardIndex) || currentLessonBoardIndex);
    if (target.createLessonBoard || currentLessonBoardIndex > Number(activeLesson.boardCount || 1)) {
      activeLesson.boardCount = currentLessonBoardIndex;
      saveActiveLesson({ touch:true });
    } else {
      saveActiveLesson();
    }
  }
  currentPlannerMode = isPlannerKind(target.kind) ? (target.plannerMode ?? plannerModeFromKind(target.kind) ?? 'daily') : currentPlannerMode;
  currentTimetableIndex = target.kind === 'planner-timetable' ? (Number(target.timetableIndex) || 1) : currentTimetableIndex;
  if (enteringTimetable && isLassoUiArmed()) { resetLassoInputCapture(); lassoTool?.setActive?.(false); setLassoInputShieldActive(false); }
  if (enteringTimetable) { activeTool = 'pen'; lassoSessionArmed = false; }
  if (enteringTimetable) {
    cancelShapeGesture();
    if (shapePalette) shapePalette.hidden = true;
    shapeOverlay?.setAttribute('hidden', '');
    shapeToolButton?.setAttribute('aria-expanded', 'false');
    paper?.classList.remove('shape-mode');
  }
  currentNoteIndex = target.kind === 'note' ? target.noteIndex : 0;
  currentNoteTotal = target.kind === 'note' ? target.noteTotal : 0;
  if (activeLesson?.id && (target.kind === 'agenda' || target.kind === 'note' || target.kind === 'planner-daily' || target.kind === 'planner-timetable')) saveActiveLesson({ touch:false });
  strokes = Array.isArray(targetPage?.strokes) ? targetPage.strokes : [];
  images = Array.isArray(targetPage?.images) ? targetPage.images.map(normalizeImageObject).filter(Boolean) : [];
  selectedImageId = null;
  const previousPaperColor = pageStyle.color;
  pageStyle = target.kind === 'planner-timetable'
    ? normalizePageStyle({ color:'black', template:'blank' })
    : target.kind === 'planner-daily' && activeLesson?.id
      ? normalizePageStyle({ color:oldPageStyle.color, template:'blank' })
      : pageStyleForDescriptor(targetPage, target);
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
    // 0.1.30: ogni pagina Note mantiene il proprio conteggio di segmenti verticali.
    currentNoteTotal = activeLesson?.id
      ? await ensureNotesCount(currentDate, activeLesson.id, currentLessonBoardIndex)
      : await ensureNotesCount(currentDate, '', 0);
  } else {
    session.noteTurns++;
  }
  pageTurning = false;
  if (target.kind === 'agenda' && activeLesson?.id) {
    const returnPosition = target.continuousScrollPosition || {
      segment:Math.max(1, Number(target.lessonBoardIndex) || Number(activeLesson.lastScrollSegment) || 1),
      offset:Math.max(0, Math.min(.999999, Number(activeLesson.lastScrollOffset) || 0))
    };
    await continuousActivate({ segmentIndex:returnPosition.segment, offset:returnPosition.offset, preserveCache:true });
    restoreAgendaInteractiveTools('planner-return-continuous');
  }
  statusLabel.textContent = (strokes.length || images.length) ? 'pagina caricata' : (currentPageKind === 'note' ? (activeLesson?.id ? 'continuazione pagina Note' : 'nota nuova') : isPlannerKind() ? `planner ${currentPlannerMode}` : 'pagina nuova');
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


// 0.1.32a — gesture pagina affidate ai Touch Events nativi per il dito.
// La Pencil continua a usare esclusivamente Pointer Events. Questo evita che Safari/iPadOS
// perda o interrompa una sequenza verticale prima che il Planner venga agganciato.
function findNativeTouch(list, identifier) {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === identifier) return list[i];
  }
  return null;
}

function nativeTouchProxy(touch, originalEvent, pointerId = NATIVE_TOUCH_POINTER_ID) {
  return {
    pointerId,
    pointerType: 'touch',
    clientX: touch.clientX,
    clientY: touch.clientY,
    target: originalEvent.target,
    preventDefault: () => originalEvent.preventDefault(),
    stopPropagation: () => originalEvent.stopPropagation?.()
  };
}

// 0.1.86 — Lazo intercettato a livello Window in capture phase.
// Motivo: su iPadOS il target reale del contatto può essere canvas, immagine,
// layer Planner o un elemento di compatibilità Safari. Il Lazo non dipende più
// dal fatto che l'evento raggiunga fisicamente #inkCanvas.
function resetLassoInputCapture() {
  if (lassoPointerId != null) {
    try {
      if (lassoPointerCaptureElement?.hasPointerCapture?.(lassoPointerId)) {
        lassoPointerCaptureElement.releasePointerCapture(lassoPointerId);
      } else if (paper?.hasPointerCapture?.(lassoPointerId)) {
        paper.releasePointerCapture(lassoPointerId);
      } else if (canvas?.hasPointerCapture?.(lassoPointerId)) {
        canvas.releasePointerCapture(lassoPointerId);
      }
    } catch {}
  }
  lassoPointerId = null;
  lassoPointerCaptureElement = null;
  lassoTouchId = null;
  lassoLastTouch = null;
}

function lassoInputAllowed() {
  return isLassoUiArmed() && ready && !pageTurning && !pageStyleBulkBusy && reportPanel.hidden !== false;
}

function lassoBlockedStatus() {
  if (!ready) return 'lazo · pagina non ancora pronta';
  if (pageTurning) return 'lazo · attendi fine cambio pagina';
  if (pageStyleBulkBusy) return 'lazo · attendi applicazione stile pagina';
  if (reportPanel.hidden === false) return 'lazo · chiudi prima la diagnostica';
  return 'lazo · input temporaneamente non disponibile';
}

function updateLassoGestureStatus(prefix = 'lazo · contorno in corso') {
  const count = Number(lassoTool?.getGesturePointCount?.() || 0);
  const suffix = `${count} ${count === 1 ? 'punto' : 'punti'} · torna al punto iniziale`;
  statusLabel.textContent = `${prefix} · ${suffix}`;
  if (lassoHint) lassoHint.textContent = `Contorno in corso · ${suffix}`;
}

function handleLassoGlobalPointerDown(ev, captureElement = paper) {
  // Nel foglio continuo il dito è riservato allo scroll; il Lazo usa Pencil/mouse.
  if (continuousLessonActive && currentPageKind === 'agenda' && ev.pointerType === 'touch') return false;
  if (isLassoUiArmed()) ensureLassoInputShieldRuntime();
  if (!isLassoUiArmed() || isLassoUiControlTarget(ev.target)) return false;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return false;
  if (lassoHint) lassoHint.textContent = 'Contatto ricevuto · avvio Lazo';

  // Recupera in modo difensivo un eventuale tratto Penna rimasto aperto prima
  // dell'attivazione del Lazo. Non entra mai nel pointermove Ink.
  if (drawing) finalizeStroke('lasso-global-input-recovery');
  if (!lassoInputAllowed()) {
    statusLabel.textContent = lassoBlockedStatus();
    ev.preventDefault();
    ev.stopPropagation();
    return true;
  }

  // Un solo canale per gesto: Pointer è autorevole se è arrivato per primo.
  if (lassoPointerId != null || lassoTouchId != null) {
    ev.preventDefault();
    ev.stopPropagation();
    return true;
  }

  const handled = lassoTool?.handlePointerDown?.(ev);
  if (!handled) {
    statusLabel.textContent = 'lazo · inizia nell’area scrivibile';
    if (lassoHint) lassoHint.textContent = 'Inizia nell’area scrivibile';
    ev.preventDefault();
    ev.stopPropagation();
    return true;
  }

  lassoPointerId = ev.pointerId;
  lastLassoPointerDownAt = performance.now();
  lassoPointerCaptureElement = captureElement || paper || canvas || null;
  try { lassoPointerCaptureElement?.setPointerCapture?.(ev.pointerId); }
  catch {
    lassoPointerCaptureElement = paper || canvas || null;
    try { lassoPointerCaptureElement?.setPointerCapture?.(ev.pointerId); } catch {}
  }
  updateLassoGestureStatus();
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

function handleLassoGlobalPointerMove(ev) {
  if (isLassoUiArmed()) ensureLassoInputShieldRuntime();
  if (!isLassoUiArmed()) return false;
  if (lassoPointerId == null && lassoTouchId == null && !isLassoUiControlTarget(ev.target)) {
    const penIsDown = ev.pointerType === 'pen' && (ev.pressure > 0 || (ev.buttons & 1) === 1);
    const mouseIsDown = ev.pointerType === 'mouse' && (ev.buttons & 1) === 1;
    if (penIsDown || mouseIsDown) {
      if (lassoHint) lassoHint.textContent = 'Contatto recuperato dal movimento';
      return handleLassoGlobalPointerDown(ev, isLassoInputSurfaceTarget(ev.target) ? lassoInputShield : paper);
    }
  }
  if (lassoPointerId == null || ev.pointerId !== lassoPointerId) {
    // Impedisce comunque che un Pointer secondario cada nel router Ink.
    if (!isLassoUiControlTarget(ev.target)) ev.preventDefault();
    return true;
  }
  lassoTool?.handlePointerMove?.(ev);
  updateLassoGestureStatus();
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

function finishLassoGlobalPointer(ev, cancelled = false) {
  if (isLassoUiArmed()) ensureLassoInputShieldRuntime();
  if (!isLassoUiArmed()) return false;
  if (lassoPointerId == null || ev.pointerId !== lassoPointerId) return true;
  const id = lassoPointerId;
  lassoPointerId = null;
  const captureElement = lassoPointerCaptureElement;
  lassoPointerCaptureElement = null;
  try {
    if (captureElement?.hasPointerCapture?.(id)) captureElement.releasePointerCapture(id);
    else if (paper?.hasPointerCapture?.(id)) paper.releasePointerCapture(id);
    else if (canvas?.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  } catch {}
  lassoTool?.handlePointerUp?.(ev, cancelled);
  voiceScript?.flushIfIdle?.();
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

// Fallback Touch nativo, anch'esso su Window: copre i percorsi Safari/iPadOS
// nei quali il gesto lungo a dito/Pencil di compatibilità non raggiunge il canvas.
function handleLassoWindowTouchStart(ev, directSurface = false) {
  // 0.1.34 — nel foglio continuo il dito è sempre riservato allo scroll.
  // Il Lazo resta disponibile con Apple Pencil/Pointer senza catturare Touch nativi.
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return;
  if (isLassoUiArmed()) ensureLassoInputShieldRuntime();
  if (!isLassoUiArmed() || isLassoUiControlTarget(ev.target)) return;
  if (lassoHint) lassoHint.textContent = 'Contatto Touch ricevuto · avvio Lazo';
  if (drawing) finalizeStroke('lasso-global-touch-recovery');
  if (!lassoInputAllowed() || ev.touches.length !== 1) {
    if (!lassoInputAllowed()) statusLabel.textContent = lassoBlockedStatus();
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  if (lassoPointerId != null || lassoTouchId != null || performance.now() - lastLassoPointerDownAt < 280) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  const touch = ev.touches[0];
  const handled = lassoTool?.handlePointerDown?.(nativeTouchProxy(touch, ev, NATIVE_LASSO_TOUCH_POINTER_ID));
  if (handled) {
    lassoTouchId = touch.identifier;
    lassoLastTouch = { clientX: touch.clientX, clientY: touch.clientY, target: ev.target };
    updateLassoGestureStatus();
  } else {
    statusLabel.textContent = 'lazo · inizia nell’area scrivibile';
    if (lassoHint) lassoHint.textContent = 'Inizia nell’area scrivibile';
  }
  ev.preventDefault();
  ev.stopPropagation();
}

function handleLassoWindowTouchMove(ev, directSurface = false) {
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return;
  if (isLassoUiArmed()) ensureLassoInputShieldRuntime();
  if (!isLassoUiArmed()) return;
  if (lassoTouchId == null && lassoPointerId == null && ev.touches?.length === 1 && !isLassoUiControlTarget(ev.target)) {
    if (lassoHint) lassoHint.textContent = 'Touch recuperato dal movimento';
    handleLassoWindowTouchStart(ev, directSurface);
    if (lassoTouchId == null) return;
  }
  if (lassoTouchId == null) return;
  const touch = findNativeTouch(ev.touches, lassoTouchId);
  if (touch) {
    lassoLastTouch = { clientX: touch.clientX, clientY: touch.clientY, target: ev.target };
    lassoTool?.handlePointerMove?.(nativeTouchProxy(touch, ev, NATIVE_LASSO_TOUCH_POINTER_ID));
    updateLassoGestureStatus();
  }
  ev.preventDefault();
  ev.stopPropagation();
}

function finishLassoWindowTouch(ev, cancelled = false, directSurface = false) {
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return;
  if (isLassoUiArmed()) ensureLassoInputShieldRuntime();
  if (!isLassoUiArmed() || lassoTouchId == null) return;
  const ended = findNativeTouch(ev.changedTouches, lassoTouchId);
  const fallback = lassoLastTouch;
  lassoTouchId = null;
  lassoLastTouch = null;
  if (ended || fallback) {
    lassoTool?.handlePointerUp?.(nativeTouchProxy(ended || fallback, ev, NATIVE_LASSO_TOUCH_POINTER_ID), cancelled);
    voiceScript?.flushIfIdle?.();
  }
  ev.preventDefault();
  ev.stopPropagation();
}

function handlePaperTouchStart(ev) {
  if (!ready || drawing || pageTurning || pageStyleBulkBusy || reportPanel.hidden === false) return;
  if (ev.touches.length !== 1) return;
  if (isUiControlTarget(ev.target)) return;
  if (!paper.contains(ev.target)) return;

  // 0.1.36 — il dito sul righello manipola il righello; fuori dal righello
  // conserva la semantica di scroll/navigazione. La Pencil non entra mai qui.
  if (rulerTool?.beginTouch?.(ev.touches[0])) {
    if (continuousLessonActive) continuousStopMomentum();
    ev.preventDefault();
    return;
  }

  // 0.1.34 — nel foglio continuo il dito ha una semantica unica e prevedibile:
  // scroll verticale. Vale anche quando Lazo, Figure o Voce sono armati.
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
    if (performance.now() - lastPenPointerDownAt < 120) return;
    continuousBeginTouchScroll(ev.touches[0]);
    ev.preventDefault();
    return;
  }

  if (activeTool === 'shape') { ev.preventDefault(); return; }
  // Fuori dal foglio continuo il Lazo conserva il fallback Touch storico.
  if (isLassoUiArmed()) return;
  if (performance.now() - lastVoicePlacementTouchAt < 500) { ev.preventDefault(); return; }
  if (activeTool === 'voice') {
    const touch = ev.touches[0];
    beginVoiceScriptPlacement(nativeTouchProxy(touch, ev));
    ev.preventDefault();
    return;
  }

  // Protezione: se iPadOS producesse anche un touch compatibility-event subito dopo
  // Apple Pencil, non deve mai essere interpretato come gesto di navigazione.
  if (performance.now() - lastPenPointerDownAt < 120) return;

  const touch = ev.touches[0];
  nativeTouchGestureId = touch.identifier;
  startPageSwipe(nativeTouchProxy(touch, ev));
  if (pageSwipe) pageSwipe.nativeTouch = true;
}

function handlePaperTouchMove(ev) {
  if (rulerTool?.isTouching?.()) {
    const touch = ev.touches?.[0];
    if (touch && rulerTool.moveTouch(touch)) { ev.preventDefault(); return; }
  }
  if (continuousTouch && continuousLessonActive && currentPageKind === 'agenda') {
    const touch = findNativeTouch(ev.touches, continuousTouch.id);
    if (!touch) return;
    continuousMoveTouchScroll(touch);
    ev.preventDefault();
    return;
  }
  if (isLassoUiArmed()) return;
  if (nativeTouchGestureId == null || !pageSwipe || !pageSwipe.nativeTouch || pageTurning) return;
  const touch = findNativeTouch(ev.touches, nativeTouchGestureId);
  if (!touch) return;
  movePageSwipe(nativeTouchProxy(touch, ev));
  if (pageSwipe?.locked) ev.preventDefault();
}

function handlePaperTouchEnd(ev, cancelled = false) {
  if (rulerTool?.isTouching?.()) {
    const ended = ev.changedTouches?.[0] || null;
    rulerTool.endTouch(ended);
    ev.preventDefault();
    return;
  }
  if (continuousTouch && continuousLessonActive && currentPageKind === 'agenda') {
    const ended = findNativeTouch(ev.changedTouches, continuousTouch.id);
    const fallback = ended || { identifier:continuousTouch.id, clientX:continuousTouch.lastX, clientY:continuousTouch.lastY };
    const tapTarget = ev.target;
    const tapX = fallback?.clientX ?? 0;
    const tapY = fallback?.clientY ?? 0;
    const result = continuousEndTouchScroll(fallback, cancelled);
    if (!cancelled && result.handled && !result.moved) registerPageDoubleTap(tapTarget, tapX, tapY);
    ev.preventDefault();
    return;
  }
  if (isLassoUiArmed()) return;
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

function registerEraserTripleToolbarActivation(button, ev, source = 'pointer') {
  if (button !== eraserToolButton) return false;
  const pointerType = String(ev?.pointerType || source || 'unknown');
  if (!['pen','touch','mouse','click'].includes(pointerType) && source !== 'click') return false;
  const now = performance.now();
  const key = continuousLessonActive && activeLesson?.id
    ? `lesson::${activeLesson.id}::continuous-sheet`
    : currentPageKey();
  if (eraserPenTapPageKey !== key) {
    eraserPenTapPageKey = key;
    eraserPenTapTimes = [];
  }
  const last = eraserPenTapTimes.at(-1);
  // Scarta duplicati troppo ravvicinati ma conserva il normale ritmo di un triple-click mouse.
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
    registerEraserTripleToolbarActivation(button, ev, ev.pointerType || 'pointer');
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

lassoTool = initLassoTool({
  button: lassoToolButton,
  overlay: lassoOverlay,
  path: lassoPath,
  boundsRect: lassoBounds,
  inspector: lassoInspector,
  cutButton: lassoCutButton,
  pasteButton: lassoPasteButton,
  clearButton: lassoClearButton,
  hint: lassoHint,
  canvas,
  statusLabel,
  getPageKey: () => {
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      return continuousEnsureViewportToolState()?.key || `lesson::${activeLesson.id}::viewport`;
    }
    return currentPageKey();
  },
  getDescriptor: () => ({ ...pageDescriptor() }),
  getWritableBounds: () => {
    const h = Math.max(1, canvas.clientHeight || rect?.height || 1);
    return {
      yMin: Math.max(0, Math.min(1, protectedTop / h)),
      yMax: Math.max(0, Math.min(1, (h - FOOTER_PX) / h))
    };
  },
  getStrokes: () => {
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return continuousEnsureViewportToolState()?.strokes || [];
    return strokes;
  },
  setStrokes: (value) => {
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      const state = continuousEnsureViewportToolState();
      if (state) state.strokes = Array.isArray(value) ? value : [];
    } else strokes = Array.isArray(value) ? value : [];
  },
  getImages: () => {
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return continuousEnsureViewportToolState()?.images || [];
    return images;
  },
  setImages: (value) => {
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) {
      const state = continuousEnsureViewportToolState();
      if (state) state.images = Array.isArray(value) ? value : [];
    } else images = Array.isArray(value) ? value : [];
  },
  makeStrokeId: () => makeId(),
  makeImageId: () => makeImageId(),
  cloneImage: (image) => cloneImageObject(image),
  recordStrokeAdded: (descriptor, stroke) => {
    if (!(continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id)) syncFoundation?.recordStrokeAdded(descriptor, stroke);
  },
  recordStrokeDeleted: (descriptor, strokeId, reason) => {
    if (!(continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id)) syncFoundation?.recordStrokeDeleted(descriptor, strokeId, reason);
  },
  recordImageAdded: (descriptor, image, sourcePageKey) => {
    if (!(continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id)) syncFoundation?.recordImageMetadata(descriptor, 'image.add', image, { reason:'lasso-paste', sourcePageKey });
  },
  recordImageUpdated: (descriptor, image, before) => {
    if (!(continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id)) syncFoundation?.recordImageMetadata(descriptor, 'image.update', image, { before, reason:'lasso-move' });
  },
  recordImageDeleted: (descriptor, imageId) => {
    if (!(continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id)) syncFoundation?.recordImageDeleted(descriptor, imageId);
  },
  renderAll: () => { if (continuousLessonActive) continuousSetToolPreview(true); renderAll(); },
  renderImages: () => { if (continuousLessonActive) continuousSetToolPreview(true); renderImages(); },
  rememberUndo: (action) => {
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) continuousPendingLassoUndoProxyAction = action;
    else rememberUndo(action);
  },
  scheduleSave: () => scheduleSave(),
  markDirty: () => {
    if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) continuousCommitViewportToolState('lasso');
    else dirty = true;
  }
});

rulerTool = initRulerTool({
  overlay:rulerOverlay,
  angleBadge:rulerAngleBadge,
  paper,
  getWritableBounds:() => ({
    top:Math.max(0, protectedTop),
    bottom:Math.max(Math.max(0, protectedTop) + 1, (rect?.height || paper?.clientHeight || 1) - FOOTER_PX)
  }),
  onStateChange:(next, meta) => {
    updateToolUi();
    if (next?.enabled && meta?.reason === 'double-tap-mode') {
      const labels = { ruler:'righello', protractor:'goniometro', triangle306090:'squadra 30°/60°/90°', triangle4545:'squadra 45°/45°/90°' };
      statusLabel.textContent = `${labels[next.mode] || 'strumento geometrico'} · ${Math.round(next.angleDeg || 0)}°`;
    }
  }
});

const directUiButtons = [...new Set([
  calendarButton,
  ...toolButtons,
  rulerButton,
  ...shapeChoiceButtons,
  undoButton,
  redoButton,
  styleButton,
  ...plannerModeButtons,
  importImageButton, cropImageButton, rotateImageLeftButton, rotateImageRightButton, cutImageButton, pasteImageButton,
  lassoCutButton, lassoPasteButton, lassoClearButton,
  cancelImageCropButton, applyImageCropButton,
  ...quickPaperChoices,
  newLessonButton, closeLessonButton, lessonArchiveButton, lessonSetupStartButton, lessonSetupResumeButton, lessonSetupNewTabButton, lessonSetupOpenTabButton, lessonSetupCloseButton, lessonArchiveCloseButton, lessonSubjectAddButton
].filter(Boolean))];
for (const button of directUiButtons) bindDirectUiButton(button);

// 0.1.25 — Beautify ha un attivatore dedicato e deterministico.
// Un solo contatto deve produrre SEMPRE feedback immediato e una sola esecuzione,
// sia con dito, Apple Pencil, mouse o click sintetico Safari.
let beautifyLastActivationAt = -Infinity;
function triggerBeautifyCommand(ev, source = 'unknown') {
  const now = performance.now();
  if (now - beautifyLastActivationAt < 420) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    return;
  }
  beautifyLastActivationAt = now;
  recentPencilUiActivation.set(beautifyButton, now);
  if (drawing) finalizeStroke(`beautify-${source}-recovery`);
  setBeautifyFeedback('Beautify · comando ricevuto', 'busy');
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
  // Microtask: lascia terminare il dispatch del pointer senza dipendere da click.
  queueMicrotask(() => { void beautifyCurrentBoard(); });
}

beautifyButton?.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'mouse') return;
  pencilUiPointers.set(ev.pointerId, { button:beautifyButton, startedAt:performance.now() });
  triggerBeautifyCommand(ev, `pointerdown-${ev.pointerType || 'unknown'}`);
}, { passive:false, capture:true });
beautifyButton?.addEventListener('pointerup', (ev) => {
  if (!pencilUiPointers.has(ev.pointerId)) return;
  pencilUiPointers.delete(ev.pointerId);
  ev.preventDefault();
  ev.stopPropagation();
}, { passive:false, capture:true });
beautifyButton?.addEventListener('pointercancel', (ev) => {
  pencilUiPointers.delete(ev.pointerId);
}, { passive:true, capture:true });
beautifyButton?.addEventListener('touchstart', (ev) => {
  // Fallback solo se Safari non ha appena consegnato il Pointer Event.
  if (performance.now() - beautifyLastActivationAt < 420) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  triggerBeautifyCommand(ev, 'touchstart-fallback');
}, { passive:false, capture:true });
beautifyButton?.addEventListener('click', (ev) => {
  // Mouse/trackpad o click sintetico. I click compatibili dopo Pencil/touch vengono deduplicati.
  if (performance.now() - beautifyLastActivationAt < 650) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  triggerBeautifyCommand(ev, 'click');
});

// 0.1.26 — verifica runtime non invasiva dell'hit target Beautify.
// Non entra mai nel percorso Ink: controlla solo la geometria del footer dopo layout/resize.
function verifyBeautifyHitTarget() {
  if (!beautifyButton || !document.body?.contains(beautifyButton)) return;
  const r = beautifyButton.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  const ok = hit === beautifyButton || beautifyButton.contains(hit);
  beautifyButton.dataset.hitTargetOk = ok ? 'true' : 'false';
  if (!ok) {
    // Self-healing: il gruppo dei comandi rapidi deve prevalere su eventuali elementi decorativi.
    const actions = beautifyButton.closest('.footer-actions');
    if (actions instanceof HTMLElement) actions.style.zIndex = '20';
    beautifyButton.style.zIndex = '21';
    console.warn('Beautify hit target coperto; elevato automaticamente', hit);
  }
}
requestAnimationFrame(() => requestAnimationFrame(verifyBeautifyHitTarget));
window.addEventListener('resize', () => requestAnimationFrame(verifyBeautifyHitTarget), { passive:true });

// 0.1.7 — latch sincrono del Lazo sul controllo reale, prima di click/touch compatibili.
lassoToolButton?.addEventListener('pointerdown', () => { lassoSessionArmed = true; }, { capture:true, passive:true });
lassoToolButton?.addEventListener('touchstart', () => { lassoSessionArmed = true; }, { capture:true, passive:true });

// 0.1.77 — qualsiasi altro comando UI richiude la finestra Figure.
document.addEventListener('pointerdown', (ev) => {
  const button = getUiButtonTarget(ev.target);
  if (!button || button === shapeToolButton || button.matches('[data-shape-type]')) return;
  closeShapePalette();
}, { passive:true, capture:true });

// 0.1.20 — gestione delegata del pannello Stile. Pencil e dito applicano
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
  if (ev.target?.closest?.('[data-restore-recovery-action]')) return;
  if (restoreOperationLocked || backupSnapshotFreeze || ev.target?.closest?.('.backup-snapshot-guard')) { ev.preventDefault(); return; }
  if (isSyncRestorePending() && !isUiControlTarget(ev.target) && ev.pointerType !== 'touch') {
    denyMutationDuringSyncRecovery();
    ev.preventDefault();
    return;
  }
  if (isLassoUiArmed()) {
    // Strategia Agenda 0.1.93: Window in capture phase è AUTOREVOLE anche
    // quando il target reale è lo shield. Così un singolo router vede sempre
    // DOWN/MOVE/UP del gesto prima di canvas, immagini e compatibilità Safari.
    ensureLassoInputShieldRuntime();
    handleLassoGlobalPointerDown(ev, isLassoInputSurfaceTarget(ev.target) ? lassoInputShield : paper);
    return;
  }
  if (activeTool === 'voice') { beginVoiceScriptPlacement(ev); return; }
  if (beginShapeGesture(ev)) return;
  handlePointerDown(ev);
}
function routeGlobalPointerMove(ev) {
  if (isLassoUiArmed()) {
    ensureLassoInputShieldRuntime();
    handleLassoGlobalPointerMove(ev);
    return;
  }
  if (isSyncRestorePending() && ev.pointerType !== 'touch' && !drawing && !shapeGesture) {
    ev.preventDefault();
    return;
  }
  if (moveShapeGesture(ev)) return;
  handlePointerMove(ev);
}
function routeGlobalPointerUp(ev) {
  if (isLassoUiArmed()) {
    ensureLassoInputShieldRuntime();
    finishLassoGlobalPointer(ev, false);
    return;
  }
  if (endShapeGesture(ev, false)) { voiceScript?.flushIfIdle?.(); return; }
  handlePointerUp(ev);
  voiceScript?.flushIfIdle?.();
}
function routeGlobalPointerCancel(ev) {
  if (isLassoUiArmed()) {
    ensureLassoInputShieldRuntime();
    finishLassoGlobalPointer(ev, true);
    return;
  }
  if (endShapeGesture(ev, true)) { voiceScript?.flushIfIdle?.(); return; }
  handlePointerCancel(ev);
  voiceScript?.flushIfIdle?.();
}

// 0.1.8 — shield mantenuto come seconda rete di sicurezza.
// Il percorso autorevole è Window capture; se un engine non propaga il gesto
// come Pointer fino a Window, questi listener diretti restano disponibili.
function handleLassoShieldPointerDown(ev) {
  if (!ensureLassoInputShieldRuntime()) return;
  // Percorso primario reale: l'evento raggiunge lo shield e il capture resta
  // sullo shield per tutta la durata del gesto.
  handleLassoGlobalPointerDown(ev, lassoInputShield);
}
function handleLassoShieldPointerMove(ev) {
  if (!isLassoUiArmed()) return;
  ensureLassoInputShieldRuntime();
  handleLassoGlobalPointerMove(ev);
}
function handleLassoShieldPointerUp(ev, cancelled = false) {
  if (!isLassoUiArmed()) return;
  ensureLassoInputShieldRuntime();
  finishLassoGlobalPointer(ev, cancelled);
}
function handleLassoShieldTouchStart(ev) {
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return;
  if (!ensureLassoInputShieldRuntime()) return;
  handleLassoWindowTouchStart(ev, true);
}
function handleLassoShieldTouchMove(ev) {
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return;
  if (!isLassoUiArmed()) return;
  ensureLassoInputShieldRuntime();
  handleLassoWindowTouchMove(ev, true);
}
function handleLassoShieldTouchEnd(ev, cancelled = false) {
  if (continuousLessonActive && currentPageKind === 'agenda' && activeLesson?.id) return;
  if (!isLassoUiArmed()) return;
  ensureLassoInputShieldRuntime();
  finishLassoWindowTouch(ev, cancelled, true);
}

// 0.1.8 — listener DIRETTI sullo shield: fallback iPad/Pencil/dito.
lassoInputShield?.addEventListener('pointerdown', handleLassoShieldPointerDown, { passive:false, capture:true });
lassoInputShield?.addEventListener('pointermove', handleLassoShieldPointerMove, { passive:false, capture:true });
lassoInputShield?.addEventListener('pointerup', (ev) => handleLassoShieldPointerUp(ev, false), { passive:false, capture:true });
lassoInputShield?.addEventListener('pointercancel', (ev) => handleLassoShieldPointerUp(ev, true), { passive:false, capture:true });
lassoInputShield?.addEventListener('touchstart', handleLassoShieldTouchStart, { passive:false, capture:true });
lassoInputShield?.addEventListener('touchmove', handleLassoShieldTouchMove, { passive:false, capture:true });
lassoInputShield?.addEventListener('touchend', (ev) => handleLassoShieldTouchEnd(ev, false), { passive:false, capture:true });
lassoInputShield?.addEventListener('touchcancel', (ev) => handleLassoShieldTouchEnd(ev, true), { passive:false, capture:true });

// 0.1.8 — Touch Window capture autorevole, come nella strategia Agenda 0.1.93.
// Gli ID del gesto impediscono doppioni Pointer/Touch compatibili.
window.addEventListener('touchstart', handleLassoWindowTouchStart, { passive:false, capture:true });
window.addEventListener('touchmove', handleLassoWindowTouchMove, { passive:false, capture:true });
window.addEventListener('touchend', (ev) => finishLassoWindowTouch(ev, false), { passive:false, capture:true });
window.addEventListener('touchcancel', (ev) => finishLassoWindowTouch(ev, true), { passive:false, capture:true });

paper.addEventListener('wheel', (ev) => {
  if (!continuousLessonActive || currentPageKind !== 'agenda' || !activeLesson?.id || drawing || isUiControlTarget(ev.target)) return;
  continuousStopMomentum();
  continuousViewport.scrollTop = Math.max(0, continuousViewport.scrollTop + ev.deltaY);
  continuousEnsureVirtualGrowth(continuousViewport.scrollTop);
  continuousHandleScroll();
  ev.preventDefault();
}, { passive:false });

paper.addEventListener('touchstart', handlePaperTouchStart, { passive: false, capture: true });
paper.addEventListener('touchmove', handlePaperTouchMove, { passive: false, capture: true });
paper.addEventListener('touchend', (ev) => handlePaperTouchEnd(ev, false), { passive: false, capture: true });
paper.addEventListener('touchcancel', (ev) => handlePaperTouchEnd(ev, true), { passive: false, capture: true });

window.addEventListener('pointerdown', routeGlobalPointerDown, { passive: false, capture: true });
window.addEventListener('pointermove', routeGlobalPointerMove, { passive: false, capture: true });
window.addEventListener('pointerup', routeGlobalPointerUp, { passive: false, capture: true });
window.addEventListener('pointercancel', routeGlobalPointerCancel, { passive: false, capture: true });

document.addEventListener('touchmove', (ev) => {
  if (ev.target instanceof Element && ev.target.closest('.settings-scroll, .saint-detail-body, .history-detail-body, .audio-library-body, .lesson-archive-body, .lesson-pdf-body, .lesson-pdf-viewport')) return;
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
  // 0.1.34 — la stessa catena didattica vale anche quando iPadOS/Safari
  // traduce il doppio tap (anche Pencil) in dblclick.
  if (activeLesson?.id && currentPageKind === 'agenda') { void openLessonGoalsFromPage(); return; }
  if (currentPageKind === 'planner-daily') { void openWeeklyTimetable(); return; }
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
  button.addEventListener('click', (ev) => {
    if (wasJustActivatedByPencil(button)) return;
    if (button === eraserToolButton) registerEraserTripleToolbarActivation(button, { pointerType:'mouse' }, 'click');
    if (button === imageToolButton) activateImageTool();
    else if (button === shapeToolButton) activateShapeTool();
    else if (button === lassoToolButton) activateLassoTool();
    else if (button === voiceScriptToolButton) activateVoiceScriptTool();
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
cutImageButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(cutImageButton)) void cutSelectedImage(); });
pasteImageButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(pasteImageButton)) void pasteCutImage(); });
lassoCutButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lassoCutButton)) void lassoTool?.cutSelection?.(); });
lassoPasteButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lassoPasteButton)) void lassoTool?.pasteClipboard?.(); });
lassoClearButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lassoClearButton)) lassoTool?.clearSelection?.('selezione annullata'); });
imageFileInput?.addEventListener('change', () => {
  const file = imageFileInput.files?.[0];
  imageFileInput.value = '';
  if (file) void importImageFile(file);
});

// 0.1.32 — ogni contesto in cui si DIGITA TESTO richiede il layout testuale
// completo. iPadOS mantiene comunque il controllo finale sulla dimensione fisica
// della tastiera (completa/flottante): una PWA non può forzare quel toggle di sistema.
function requestExpandedKeyboardFor(element) {
  const isField = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element?.isContentEditable;
  if (!isField) return;
  if (element instanceof HTMLInputElement && ['file','checkbox','radio','range','color','date','time','month','week'].includes(element.type)) return;

  // I campi numerici reali restano numerici: non sono contesti di digitazione testo.
  // Tutti gli altri campi editabili, inclusi URL/password/search/email/tel, chiedono
  // esplicitamente la tastiera alfabetica standard a larghezza piena quando iPadOS la consente.
  if (!(element instanceof HTMLInputElement) || element.type !== 'number') {
    element.setAttribute('inputmode', 'text');
  }
  element.setAttribute('autocapitalize', element.getAttribute('autocapitalize') || 'sentences');
  if (!element.hasAttribute('enterkeyhint')) element.setAttribute('enterkeyhint', element.id === 'lessonTopicInput' || element.id === 'lessonSetupTopic' ? 'done' : 'next');
  element.classList?.add('expanded-keyboard-input');
}
function prepareExpandedKeyboards(root = document) {
  root.querySelectorAll?.('input,textarea,[contenteditable="true"]').forEach(requestExpandedKeyboardFor);
}
prepareExpandedKeyboards();
document.addEventListener('focusin', (ev) => requestExpandedKeyboardFor(ev.target), { capture:true });

// Anche i campi creati dinamicamente (Nuova materia e future finestre) ereditano
// automaticamente la richiesta di tastiera testuale completa.
const expandedKeyboardObserver = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes || []) {
      if (!(node instanceof Element)) continue;
      requestExpandedKeyboardFor(node);
      prepareExpandedKeyboards(node);
    }
  }
});
expandedKeyboardObserver.observe(document.documentElement, { childList:true, subtree:true });

newLessonButton?.addEventListener('click', async () => {
  if (wasJustActivatedByPencil(newLessonButton)) return;
  if (ready && dirty) await persistNow();
  openLessonSetup({ startup:false, tab:'new' });
});
closeLessonButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(closeLessonButton)) void closeCurrentLessonToStartup(); });
lessonArchiveButton?.addEventListener('click', () => {
  if (wasJustActivatedByPencil(lessonArchiveButton)) return;
  openLessonArchive();
});
lessonSetupStartButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lessonSetupStartButton)) void startNewLessonFromDialog(); });
lessonSetupResumeButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lessonSetupResumeButton)) void resumeLastLessonFromStartup(); });
lessonSetupNewTabButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lessonSetupNewTabButton)) setLessonSetupMode('new'); });
lessonSetupOpenTabButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lessonSetupOpenTabButton)) setLessonSetupMode('open'); });
lessonSetupCloseButton?.addEventListener('click', () => { if (!wasJustActivatedByPencil(lessonSetupCloseButton)) closeLessonSetup(); });
lessonArchiveCloseButton?.addEventListener('click', () => { if (wasJustActivatedByPencil(lessonArchiveCloseButton)) return; if (lessonArchivePanel) lessonArchivePanel.hidden = true; restoreAgendaInteractiveTools('lesson-archive-close'); });
let lessonArchivePenScroll = null;
let lessonArchivePenClickBlockedUntil = 0;

function finishLessonArchivePenScroll(ev) {
  if (!lessonArchivePenScroll || ev.pointerId !== lessonArchivePenScroll.pointerId) return;
  lessonArchivePenClickBlockedUntil = performance.now() + 800;
  try { lessonArchiveBody?.releasePointerCapture?.(ev.pointerId); } catch {}
  lessonArchivePenScroll = null;
}

// 0.1.18 — Apple Pencil nell'Archivio e' uno strumento di SCROLL, non di apertura.
// Il trascinamento modifica direttamente scrollTop ed e' completamente separato
// dal motore Ink. Il dito continua a usare lo scrolling nativo iPadOS.
lessonArchiveBody?.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType !== 'pen') return;
  lessonArchivePenScroll = {
    pointerId: ev.pointerId,
    startY: ev.clientY,
    startScrollTop: lessonArchiveBody.scrollTop,
    moved: false
  };
  try { lessonArchiveBody.setPointerCapture?.(ev.pointerId); } catch {}
  ev.stopPropagation();
}, { passive:false, capture:true });
lessonArchiveBody?.addEventListener('pointermove', (ev) => {
  const state = lessonArchivePenScroll;
  if (!state || ev.pointerId !== state.pointerId) return;
  const dy = ev.clientY - state.startY;
  if (!state.moved && Math.abs(dy) >= 3) state.moved = true;
  if (!state.moved) return;
  lessonArchiveBody.scrollTop = state.startScrollTop - dy;
  ev.preventDefault();
  ev.stopPropagation();
}, { passive:false, capture:true });
lessonArchiveBody?.addEventListener('pointerup', finishLessonArchivePenScroll, { passive:true, capture:true });
lessonArchiveBody?.addEventListener('pointercancel', finishLessonArchivePenScroll, { passive:true, capture:true });

lessonArchiveBody?.addEventListener('click', (ev) => {
  const target = ev.target instanceof Element ? ev.target : null;
  // Un click sintetico generato dalla Pencil dopo uno scroll/tap non apre e non
  // elimina nulla: la Pencil resta disponibile per scorrere l'elenco.
  if (performance.now() < lessonArchivePenClickBlockedUntil) { ev.preventDefault(); ev.stopPropagation(); return; }
  const pdfButton = target?.closest('button[data-lesson-pdf-open], button[data-lesson-pdf-export]');
  if (pdfButton) { activateUiButton(pdfButton); return; }
  const remove = target?.closest('button[data-lesson-delete]');
  if (remove) { void deleteLessonGroup(remove.dataset.lessonDelete); return; }
  const button = target?.closest('button[data-lesson-open]');
  if (!button) return;
  const lesson = lessonIndex.find((item) => item.id === button.dataset.lessonOpen);
  if (!lesson) return;
  const boardIndex = Math.max(1, Number(lesson.currentBoardIndex) || 1);
  void resumeLessonAtSavedPosition(lesson, 'lezione aperta').then((ok) => {
    if (!ok) return;
    hideLessonHomeScreen();
    if (lessonArchivePanel) lessonArchivePanel.hidden = true;
    restoreAgendaInteractiveTools('lesson-archive-open');
  });
});
lessonSubjectPicker?.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'mouse') return;
  const newButton = ev.target instanceof Element ? ev.target.closest('[data-lesson-new-subject]') : null;
  if (newButton) {
    selectLessonSetupNewSubject({ expand:true, focus:true });
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  const addButton = ev.target instanceof Element ? ev.target.closest('#lessonSetupAddNewSubjectButton') : null;
  if (addButton) {
    commitLessonSetupNewSubject();
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  const button = ev.target instanceof Element ? ev.target.closest('[data-lesson-setup-subject]') : null;
  if (!button) return;
  selectLessonSetupSubject(button.dataset.lessonSetupSubject || '');
  ev.preventDefault();
  ev.stopPropagation();
}, { passive:false });
lessonSubjectPicker?.addEventListener('click', (ev) => {
  const newButton = ev.target instanceof Element ? ev.target.closest('[data-lesson-new-subject]') : null;
  if (newButton) { selectLessonSetupNewSubject({ expand:true, focus:true }); return; }
  const addButton = ev.target instanceof Element ? ev.target.closest('#lessonSetupAddNewSubjectButton') : null;
  if (addButton) { commitLessonSetupNewSubject(); return; }
  const button = ev.target instanceof Element ? ev.target.closest('[data-lesson-setup-subject]') : null;
  if (!button) return;
  selectLessonSetupSubject(button.dataset.lessonSetupSubject || '');
});
lessonSubjectPicker?.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.target?.id !== 'lessonSetupNewSubjectInput') return;
  ev.preventDefault();
  commitLessonSetupNewSubject();
});
lessonStartupArchiveBody?.addEventListener('click', (ev) => {
  const pdfButton = ev.target instanceof Element ? ev.target.closest('button[data-lesson-pdf-open], button[data-lesson-pdf-export]') : null;
  if (pdfButton) { activateUiButton(pdfButton); return; }
  const button = ev.target instanceof Element ? ev.target.closest('button[data-lesson-open]') : null;
  if (!button) return;
  const lesson = lessonIndex.find((item) => item.id === button.dataset.lessonOpen);
  if (!lesson) return;
  void resumeLessonAtSavedPosition(lesson, 'lezione aperta').then((ok) => {
    if (!ok) return;
    if (lessonSetupPanel) lessonSetupPanel.hidden = true;
    restoreAgendaInteractiveTools('lesson-startup-open');
  });
});

lessonSubjectSelect?.addEventListener('change', () => updateActiveLessonMetadata(lessonSubjectSelect.value, lessonTopicInput?.value || activeLesson?.topic));
lessonTopicInput?.addEventListener('input', () => {
  if (!activeLesson || currentLessonBoardIndex !== 1) return;
  activeLesson = { ...activeLesson, topic: cleanLessonText(lessonTopicInput.value, 160) || activeLesson.topic };
  saveActiveLesson({ touch:true });
  clearTimeout(lessonMetaRenderTimer);
  lessonMetaRenderTimer = window.setTimeout(() => { renderLessonHeaderFor(document); }, 350);
});
lessonTopicInput?.addEventListener('change', () => updateActiveLessonMetadata(lessonSubjectSelect?.value || activeLesson?.subject, lessonTopicInput.value));
lessonSubjectAddButton?.addEventListener('click', () => {
  if (wasJustActivatedByPencil(lessonSubjectAddButton)) return;
  const value = cleanLessonText(lessonSubjectNewInput?.value, 80);
  if (!value) return;
  if (!lessonSubjects.includes(value)) lessonSubjects.push(value);
  saveLessonSubjects();
  if (lessonSubjectNewInput) lessonSubjectNewInput.value = '';
  renderLessonSubjectSettings();
});
lessonSubjectNewInput?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); lessonSubjectAddButton?.click(); } });
lessonSubjectSettingsList?.addEventListener('click', (ev) => {
  const button = ev.target instanceof Element ? ev.target.closest('button[data-lesson-subject-remove]') : null;
  if (!button) return;
  const value = button.dataset.lessonSubjectRemove;
  if (lessonSubjects.length <= 1) return;
  lessonSubjects = lessonSubjects.filter((item) => item !== value);
  saveLessonSubjects();
  renderLessonSubjectSettings();
});
settingsTabSubjectsButton?.addEventListener('click', () => {
  document.getElementById('settingsSyncBackupTab')?.setAttribute('hidden','');
  document.getElementById('settingsRecordingTab')?.setAttribute('hidden','');
  settingsSubjectsTab?.removeAttribute('hidden');
  document.getElementById('settingsTabSyncBackupButton')?.classList.remove('active');
  document.getElementById('settingsTabRecordingButton')?.classList.remove('active');
  settingsTabSubjectsButton.classList.add('active');
  document.getElementById('settingsTabSyncBackupButton')?.setAttribute('aria-selected','false');
  document.getElementById('settingsTabRecordingButton')?.setAttribute('aria-selected','false');
  settingsTabSubjectsButton.setAttribute('aria-selected','true');
  renderLessonSubjectSettings();
});

// 0.1.39 — i comandi nelle Impostazioni non usano il pointerdown della toolbar Ink.
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
for (const choice of quickPaperChoices) {
  choice.addEventListener('click', async () => {
    if (wasJustActivatedByPencil(choice) || drawing || pageTurning) return;
    if (choice.dataset.quickTemplate) await setPageTemplate(choice.dataset.quickTemplate);
    else if (choice.dataset.quickColor) await setPageColor(choice.dataset.quickColor);
  });
}

window.addEventListener('resize', () => {
  if (drawing || pageTurning) return;
  removePreview();
  pageSwipe = null;
  const continuousPosition = continuousLessonActive ? continuousCurrentScrollPosition() : null;
  resizeCanvas();
  renderImages();
  if (continuousPosition) continuousRelayoutAfterResize(continuousPosition);
  if (currentPageKind === 'note') requestAnimationFrame(() => alignNoteTitleToPen(document));
});

window.addEventListener('blur', () => {
  if (drawing) finalizeStroke('window-blur');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (drawing) finalizeStroke('visibility-hidden');
    if (pageSwipe) { resetTurnStyles(); removePreview(); pageSwipe = null; pageTurning = false; }
    if (continuousLessonActive) void flushContinuousSegmentSaves();
    else if (ready && dirty) persistNow();
    } else if (ready) {
    scheduleCloudAuto('foreground', 1200);
  }
});

window.addEventListener('online', () => { if (ready) scheduleCloudAuto('network-online', 1200); });

window.addEventListener('pagehide', () => {
  if (drawing) finalizeStroke('pagehide');
  if (continuousLessonActive) void flushContinuousSegmentSaves();
  else if (ready && dirty) persistNow();
});

async function loadInitialPage() {
  statusLabel.textContent = 'caricamento';
  try {
    await openDb();
    const [record, globalRecord, initialNoteTotal] = await Promise.all([
      getRecord(currentPageKey()),
      getRecord(GLOBAL_PAGE_STYLE_KEY),
      ensureNotesCount(currentDate, activeLesson?.id || '', currentLessonBoardIndex)
    ]);
    currentNoteTotal = Math.max(0, Number(initialNoteTotal) || 0);
    session.storageReads += 2;
    globalPageStyle = globalRecord?.pageStyle ? normalizePageStyle(globalRecord.pageStyle) : { ...DEFAULT_PAGE_STYLE };
    strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    images = imagesFromRecord(record);
    selectedImageId = null;
    pageStyle = pageStyleForDescriptor(record, pageDescriptor());
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

async function setRestoreOperationLocked(locked) {
  restoreOperationLocked = Boolean(locked);
  if (!locked) { restoreMutationActive = false; return; }
  lanTransport?.suspendForInk(); cloudTransport?.suspendForInk();
  const start = performance.now();
  while (syncRemoteApplyBusy || lanTransport?.isRunning?.() || cloudTransport?.isRunning?.()) {
    if (performance.now() - start > 8000) throw new Error('Ripristino sospeso: sincronizzazione ancora in chiusura');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function initializeBackupFoundation() {
  if (!backupFoundation) {
    backupFoundation = initBackupFoundation({
      appVersion: APP_VERSION,
      mainDbName: DB_NAME,
      mainStore: STORE,
      setRestoreOperationLocked,
      canStartBackup: () => ready && !isSyncRestorePending() && !lessonPdfBusy && !lessonPdfSnapshotBusy,
      canStartRestore: () => !isSyncRestorePending() && !lessonPdfSnapshotBusy,
      flushCurrent: async () => {
        cancelPendingSave();
        if (continuousLessonActive && activeLesson?.id && currentPageKind === 'agenda') {
          const ok = await flushContinuousSegmentSaves();
          if (!ok) throw new Error('Backup sospeso: uno o più segmenti della lezione non risultano ancora salvati');
          return;
        }
        if (dirty) { await persistNow(); if (dirty) throw new Error('Backup sospeso: pagina corrente non salvata'); }
      },
      setAppStatus: (message) => { statusLabel.textContent = message; },
      isRealtimeBusy: () => drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture) || Boolean(audioRecorder?.isBusy?.()) || Boolean(voiceScript?.isActive?.()) || beautifyBusy || lassoPointerId !== null || lassoTouchId !== null,
      beginConsistentSnapshot: beginBackupSnapshotFreeze,
      endConsistentSnapshot: async () => endBackupSnapshotFreeze(),
      getSecurePasswordVaultBackup: getPasswordVaultBackupPayload,
      restoreSecurePasswordVaultBackup: restorePasswordVaultBackupPayload,
      beforeRestoreApplied: async () => {
        // Un disaster recovery locale non deve mai innescare un pull automatico dal gruppo.
        // Sospendiamo soltanto i trasporti durante la sostituzione atomica dei dati.
        restoreMutationActive = true;
        cancelPendingSave();
        lanTransport?.suspendForInk();
        cloudTransport?.suspendForInk();
      },
      afterRestoreApplied: async (details) => {
        // Nel formato completo indici, metadati e preferenze sono già nello snapshot.
        // Ricostruirli con lo stato in memoria altera lezioni, posizione e font.
        if (Number(details.manifest?.formatVersion) < 2) {
          lessonSubjects = loadLessonSubjects(); lessonIndex = loadLessonIndex(); activeLesson = loadActiveLesson();
          await rebuildNotesMetadataFromPages(); await rebuildLessonIndexFromPages();
        }
        clearSyncRestoreGuard();
        // Dopo un restore riuscito (o un recovery/rollback) i cursori/outbox precedenti non
        // descrivono più con certezza lo stato locale. Li azzeriamo, ma NON eseguiamo alcun
        // pull: se esiste una configurazione Sync viene attivata una quarantena scrivibile.
        await resetSyncStores();
        beginLocalRestoreSyncQuarantine(details);
      },
      beforeGlobalRestoreApplied: async (details) => {
        // Operazione distruttiva esplicita: il backup locale diventerà una nuova generazione
        // autorevole del gruppo, ma soltanto dopo pubblicazione e commit remoto completi.
        beginGlobalGroupRestoreGuard(details);
        clearLocalRestoreSyncQuarantine();
        restoreMutationActive = true;
        cancelPendingSave();
        lanTransport?.suspendForInk();
        cloudTransport?.suspendForInk();
      },
      afterGlobalRestoreApplied: async (details) => {
        await resetSyncStores();
        updateSyncRestoreGuard({ phase: 'global-restore-applied', restoredAt: new Date().toISOString(), ...details });
      }
    });
  }
}

async function bootAgenda() {
  await openDb();
  initializeBackupFoundation();
  if (await backupFoundation.initialized) return;
  updateHeader();
  await loadLocalImageCutClipboard().catch((err) => console.warn('Clipboard immagini locale non caricata', err));
  updateToolUi();
  paper?.classList.toggle('image-edit-mode', activeTool === 'image');
  renderImages();
  updateStyleUi();
  applyPageStyle();
  resizeCanvas();
  requestAnimationFrame(rafWatchdog);
  await loadInitialPage();
  await reconcileLocalImageCutClipboard();
  updateImageInspector();
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
        onStats: (stats) => { syncStats = stats; },
      });
      syncStats = syncFoundation.getDiagnostics();
      // Identità replica persistita all'avvio, fuori dalla pipeline realtime Ink.
      await putSyncMeta(syncFoundation.getStateRow()).catch((err) => console.warn('Identità Sync non persistita', err));
      // La prima pagina è stata caricata prima dell'inizializzazione Sync: eseguiamo
      // ora l'eventuale normalizzazione degli eraser legacy 0.1.32.
      await migrateLegacyErasersOnCurrentPage().catch((err) => console.warn('Migrazione eraser legacy non riuscita', err));
    } catch (err) {
      console.warn('Agenda Sync Core non disponibile', err);
    }
  }


  // 0.1.10: Rubrica Password rimossa dall'app. I record legacy cifrati restano
  // compatibili con restore/sync, ma nessuna UI o sessione vault viene inizializzata.
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
      isRealtimeBusy: () => restoreOperationLocked || isLocalRestoreSyncQuarantined() || backupSnapshotFreeze || drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture) || Boolean(audioRecorder?.isRecording?.()),
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
      isRealtimeBusy: () => restoreOperationLocked || isLocalRestoreSyncQuarantined() || backupSnapshotFreeze || drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture) || Boolean(audioRecorder?.isRecording?.()),
      onStats: (stats) => { lanStats = stats; updateLanStatus(); }
    });
    lanStats = lanTransport.getDiagnostics();
    updateLanStatus();
    lanHubUrlInput?.addEventListener('change', saveLanConfig);
    lanSyncKeyInput?.addEventListener('change', saveLanConfig);
  }
  if (isSyncRestorePending()) {
    const pendingMode = String(syncRestoreGuard?.mode || 'group-authoritative');
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
  if (!audioRecorder) {
    audioRecorder = initAudioRecorder({
      appVersion: APP_VERSION,
      getPageDescriptor: () => ({ ...pageDescriptor() }),
      setAppStatus: (message) => { statusLabel.textContent = message; },
      isRealtimeBusy: () => restoreOperationLocked || backupSnapshotFreeze || drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture),
      cloudBridge: backupFoundation?.cloudBridge || null,
      onRecordingsChanged: (pageKey) => { if (pageKey === currentPageKey()) void refreshAudioPageIndicator(); }
    });
    void refreshAudioPageIndicator();
  }
  if (!voiceScript) {
    voiceScript = initVoiceScript({
      getPageDescriptor: () => ({ ...pageDescriptor() }),
      getPenColor: () => toolStrokeStyle('pen').color || PEN_COLOR,
      isRealtimeBusy: () => restoreOperationLocked || backupSnapshotFreeze || drawing || Boolean(shapeGesture) || pageTurning || storageBusy || pageStyleBulkBusy || imageBusy || Boolean(imageGesture),
      isAudioRecorderActive: () => Boolean(audioRecorder?.isRecording?.()),
      onCommit: commitVoiceScriptText,
      onStatus: (message) => { statusLabel.textContent = message; },
      onStateChange: () => updateToolUi()
    });
    audioButton?.addEventListener('pointerdown', () => {
      if (voiceScript?.isActive?.()) voiceScript.stopAndFinalize('registratore-audio');
      deactivatePageTool();
    }, { capture:true, passive:true });
  }
  // Allinea gli strumenti derivati da Agenda dopo l'inizializzazione asincrona.
  restoreAgendaInteractiveTools('boot-ready');
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
    if (backupFoundation?.isRecoveryBlocked?.()) { startup.finishing = false; return; }
    startup.phase = 'done';
    lastUserActivityAt = Date.now();
    scheduleIdleCover();
    startupOverlay.classList.add('startup-exit');
    document.body.classList.remove('startup-active');
    window.setTimeout(() => {
      startupOverlay.hidden = true;
      startupOverlay.remove();
      if (!lessonStartupPromptShown) {
        lessonStartupPromptShown = true;
        showLessonHomeScreen('pronto');
      }
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

window.addEventListener('pageshow', () => {
  if (startup.phase === 'done') window.setTimeout(() => restoreAgendaInteractiveTools('pageshow'), 0);
});

startupOverlay.addEventListener('click', handleStartupClick);
startup.timer = window.setTimeout(showCredits, 1900);

console.info(`Note iPad ${APP_VERSION} · CONTINUOUS LESSON · Ink prioritario · ${DATA_COMPATIBILITY_GENERATION}`);
