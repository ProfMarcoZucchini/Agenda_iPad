const AUDIO_DB_NAME = 'AgendaIPadAudioDB';
const AUDIO_DB_VERSION = 1;
const RECORDINGS_STORE = 'recordings';
const CHUNKS_STORE = 'chunks';
const SETTINGS_STORE = 'settings';
const SETTINGS_KEY = 'audio-settings-v1';
const MIN_FREE_RATIO = 0.05;
const EMERGENCY_FREE_RATIO = 0.03;
const CHUNK_MS = 10000;
const AUDIO_OPEN_SETTINGS_KEY = 'agenda-ipad-audio-open-settings-v1';
const AUDIO_QUICK_DOUBLE_TAP_MS = 350;

const DEFAULT_AUDIO_CONFIG = Object.freeze({
  destination: 'local',
  codecProfile: 'opus48',
  channels: 1,
  autoStopMinutes: 0,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  namePrefix: 'Registrazione',
  googleFolder: 'Agenda iPad Registrazioni',
  oneDriveFolder: 'Agenda iPad Registrazioni'
});

const DESTINATIONS = Object.freeze({
  local: { label: 'Locale', provider: '', keepLocal: true },
  google: { label: 'Google Drive', provider: 'google', keepLocal: false },
  onedrive: { label: 'Microsoft OneDrive', provider: 'onedrive', keepLocal: false },
  'local-google': { label: 'Locale + Google Drive', provider: 'google', keepLocal: true },
  'local-onedrive': { label: 'Locale + Microsoft OneDrive', provider: 'onedrive', keepLocal: true }
});

const CODEC_PROFILES = Object.freeze([
  { id:'opus32', label:'Opus 32 kbit/s · compatto', bitrate:32000, candidates:['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4;codecs=opus'] },
  { id:'opus48', label:'Opus 48 kbit/s · lezione consigliato', bitrate:48000, candidates:['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4;codecs=opus'] },
  { id:'opus64', label:'Opus 64 kbit/s · alta qualità', bitrate:64000, candidates:['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4;codecs=opus'] },
  { id:'opus96', label:'Opus 96 kbit/s · qualità molto alta', bitrate:96000, candidates:['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4;codecs=opus'] },
  { id:'aac64', label:'AAC-LC 64 kbit/s · compatibilità Apple', bitrate:64000, candidates:['audio/mp4;codecs=mp4a.40.2','audio/mp4'] },
  { id:'aac96', label:'AAC-LC 96 kbit/s · alta qualità', bitrate:96000, candidates:['audio/mp4;codecs=mp4a.40.2','audio/mp4'] },
  { id:'aac128', label:'AAC-LC 128 kbit/s · qualità molto alta', bitrate:128000, candidates:['audio/mp4;codecs=mp4a.40.2','audio/mp4'] },
  { id:'alac', label:'ALAC · lossless', bitrate:0, candidates:['audio/mp4;codecs=alac'] },
  { id:'pcm', label:'PCM · non compresso', bitrate:0, candidates:['audio/mp4;codecs=pcm'] },
  { id:'browser', label:'Automatico browser', bitrate:0, candidates:[''] }
]);

function cloneConfig(value = {}) {
  return { ...DEFAULT_AUDIO_CONFIG, ...(value || {}) };
}

function openAudioDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
        const store = db.createObjectStore(RECORDINGS_STORE, { keyPath:'id' });
        store.createIndex('pageKey', 'pageKey', { unique:false });
        store.createIndex('createdAt', 'createdAt', { unique:false });
      }
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const chunks = db.createObjectStore(CHUNKS_STORE, { keyPath:['sessionId','index'] });
        chunks.createIndex('sessionId', 'sessionId', { unique:false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath:'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, value) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Audio DB transaction aborted'));
  });
}

async function dbDelete(storeName, key) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listRecordingsForPage(pageKey) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDINGS_STORE, 'readonly');
    const index = tx.objectStore(RECORDINGS_STORE).index('pageKey');
    const req = index.getAll(IDBKeyRange.only(pageKey));
    req.onsuccess = () => resolve((req.result || []).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    req.onerror = () => reject(req.error);
  });
}

async function listChunks(sessionId) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readonly');
    const index = tx.objectStore(CHUNKS_STORE).index('sessionId');
    const req = index.getAll(IDBKeyRange.only(sessionId));
    req.onsuccess = () => resolve((req.result || []).sort((a,b) => Number(a.index)-Number(b.index)));
    req.onerror = () => reject(req.error);
  });
}

async function deleteChunks(sessionId) {
  const rows = await listChunks(sessionId);
  for (const row of rows) await dbDelete(CHUNKS_STORE, [row.sessionId, row.index]);
}

function makeId(prefix='aud') {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}

function humanBytes(size) {
  const n = Math.max(0, Number(size) || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n/1024**2).toFixed(1)} MB`;
  return `${(n/1024**3).toFixed(2)} GB`;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  const s = total%60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function formatDateTime(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(d);
}

function extensionForMime(mimeType='') {
  const mime = String(mimeType).toLowerCase();
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  return 'audio';
}

function safeFilenamePart(value) {
  return String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0,80) || 'Registrazione';
}

function supportedMime(candidate) {
  if (!candidate) return true;
  if (!globalThis.MediaRecorder) return false;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return candidate.startsWith('audio/mp4');
  try { return MediaRecorder.isTypeSupported(candidate); } catch { return false; }
}

function resolveProfile(profileId) {
  const profile = CODEC_PROFILES.find((item) => item.id === profileId) || CODEC_PROFILES.find((item) => item.id === 'opus48');
  const mimeType = profile.candidates.find(supportedMime);
  if (mimeType === undefined) return null;
  return { ...profile, mimeType };
}

async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    const quota = Number(estimate?.quota) || 0;
    const usage = Number(estimate?.usage) || 0;
    if (!(quota > 0)) return null;
    return { quota, usage, free:Math.max(0, quota-usage), freeRatio:Math.max(0, quota-usage)/quota };
  } catch { return null; }
}

async function waitForRealtimeIdle(isRealtimeBusy, timeoutMs=30000) {
  const started = performance.now();
  while (isRealtimeBusy?.()) {
    if (performance.now()-started > timeoutMs) throw new Error('Operazione audio rinviata: scrittura Pencil ancora attiva');
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
}

function destinationMeta(value) {
  return DESTINATIONS[value] || DESTINATIONS.local;
}

function pageLabel(descriptor) {
  if (!descriptor) return 'Pagina';
  if (descriptor.kind === 'note') return `Nota ${descriptor.noteIndex || 1} · ${descriptor.date}`;
  if (String(descriptor.kind || '').startsWith('planner-')) {
    if (descriptor.kind === 'planner-timetable') return `Orario ${descriptor.timetableIndex || 1}`;
    return `Planner · ${descriptor.date}`;
  }
  return `Agenda · ${descriptor.date}`;
}

export function initAudioRecorder(options = {}) {
  const {
    appVersion='0.0.0', getPageDescriptor=() => ({ key:'unknown', date:'', kind:'agenda' }),
    setAppStatus=() => {}, isRealtimeBusy=() => false, cloudBridge=null, onRecordingsChanged=() => {}
  } = options;

  const audioButton = document.getElementById('audioButton');
  const panel = document.getElementById('audioPanel');
  const recordButton = document.getElementById('audioRecordButton');
  const stopButton = document.getElementById('audioStopButton');
  const startButton = document.getElementById('audioStartButton');
  const backButton = document.getElementById('audioBackButton');
  const playButton = document.getElementById('audioPlayButton');
  const forwardButton = document.getElementById('audioForwardButton');
  const endButton = document.getElementById('audioEndButton');
  const folderButton = document.getElementById('audioFolderButton');
  const closePanelButton = document.getElementById('audioCloseButton');
  const destinationSelect = document.getElementById('audioQuickDestination');
  const audioStatus = document.getElementById('audioStatus');
  const audioTime = document.getElementById('audioTime');
  const player = document.getElementById('audioPlayer');

  const libraryPanel = document.getElementById('audioLibraryPanel');
  const libraryTitle = document.getElementById('audioLibraryTitle');
  const libraryList = document.getElementById('audioLibraryList');
  const libraryStatus = document.getElementById('audioLibraryStatus');
  const closeLibraryButton = document.getElementById('closeAudioLibraryButton');

  const tabSync = document.getElementById('settingsTabSyncBackupButton');
  const tabAudio = document.getElementById('settingsTabRecordingButton');
  const syncTab = document.getElementById('settingsSyncBackupTab');
  const audioTab = document.getElementById('settingsRecordingTab');
  const configDestination = document.getElementById('audioDefaultDestination');
  const codecSelect = document.getElementById('audioCodecProfile');
  const channelSelect = document.getElementById('audioChannels');
  const codecInfo = document.getElementById('audioCodecInfo');
  const autoStopSelect = document.getElementById('audioAutoStop');
  const noiseCheckbox = document.getElementById('audioNoiseSuppression');
  const echoCheckbox = document.getElementById('audioEchoCancellation');
  const gainCheckbox = document.getElementById('audioAutoGainControl');
  const prefixInput = document.getElementById('audioNamePrefix');
  const storageStatus = document.getElementById('audioStorageStatus');
  const refreshStorageButton = document.getElementById('audioRefreshStorageButton');
  const googleClientAudio = document.getElementById('audioGoogleClientId');
  const googleFolderAudio = document.getElementById('audioGoogleFolder');
  const googleConnectAudio = document.getElementById('audioGoogleConnectButton');
  const googleTestAudio = document.getElementById('audioGoogleTestButton');
  const googleDisconnectAudio = document.getElementById('audioGoogleDisconnectButton');
  const googleStatusAudio = document.getElementById('audioGoogleConnectionStatus');
  const oneClientAudio = document.getElementById('audioOneDriveClientId');
  const oneTenantAudio = document.getElementById('audioOneDriveTenant');
  const oneFolderAudio = document.getElementById('audioOneDriveFolder');
  const oneConnectAudio = document.getElementById('audioOneDriveConnectButton');
  const oneTestAudio = document.getElementById('audioOneDriveTestButton');
  const oneDisconnectAudio = document.getElementById('audioOneDriveDisconnectButton');
  const oneStatusAudio = document.getElementById('audioOneDriveConnectionStatus');
  const backupGoogleClient = document.getElementById('googleClientId');
  const backupOneClient = document.getElementById('oneDriveClientId');
  const backupOneTenant = document.getElementById('oneDriveTenant');

  let config = cloneConfig();
  let activeSession = null;
  let recordingTimer = 0;
  let autoStopTimer = 0;
  let playerObjectUrl = '';
  let loadedRecordingId = '';
  let networkController = null;
  let pendingRetryId = '';
  let retryTimer = 0;
  let directActivation = new WeakMap();
  let audioTapTimer = 0;
  let lastAudioTapAt = -Infinity;
  let recordingStartPending = false;

  const setStatus = (message) => { if (audioStatus) audioStatus.textContent = message; };
  const setLibraryStatus = (message) => { if (libraryStatus) libraryStatus.textContent = message; };
  const notifyRecordingsChanged = (pageKey) => { try { onRecordingsChanged?.(pageKey); } catch {} };

  function switchSettingsTab(name) {
    const audioActive = name === 'recording';
    if (syncTab) syncTab.hidden = audioActive;
    if (audioTab) audioTab.hidden = !audioActive;
    tabSync?.classList.toggle('active', !audioActive);
    tabAudio?.classList.toggle('active', audioActive);
    tabSync?.setAttribute('aria-selected', audioActive ? 'false' : 'true');
    tabAudio?.setAttribute('aria-selected', audioActive ? 'true' : 'false');
    if (audioActive) {
      refreshStorageStatus();
      refreshCloudUi();
    }
  }

  async function loadConfig() {
    const row = await dbGet(SETTINGS_STORE, SETTINGS_KEY).catch(() => null);
    config = cloneConfig(row?.value || {});
    syncForm();
  }

  async function saveConfig() {
    readForm();
    await dbPut(SETTINGS_STORE, { key:SETTINGS_KEY, value:config, modifiedAt:new Date().toISOString(), appVersion });
  }

  function populateCodecOptions() {
    if (!codecSelect) return;
    codecSelect.replaceChildren();
    for (const profile of CODEC_PROFILES) {
      const option = document.createElement('option');
      option.value = profile.id;
      const supported = Boolean(resolveProfile(profile.id));
      option.textContent = `${profile.label}${supported ? '' : ' · non disponibile'}`;
      option.disabled = !supported;
      codecSelect.appendChild(option);
    }
  }

  function codecInfoText(profileId = config.codecProfile) {
    const profile = CODEC_PROFILES.find((item) => item.id === profileId);
    if (!profile) return 'Codec non disponibile';
    if (profile.id === 'alac') return 'ALAC lossless · qualità senza perdita · dimensione variabile elevata';
    if (profile.id === 'pcm') return 'PCM non compresso · qualità massima · dimensione molto elevata';
    if (!profile.bitrate) return 'Formato scelto automaticamente dal browser';
    const channels = channelSelect?.value === '2' ? 2 : (config.channels === 2 ? 2 : 1);
    const mbHour = profile.bitrate * 3600 / 8 / 1_000_000;
    return `${profile.label} · ${channels === 1 ? 'mono' : 'stereo'} · circa ${mbHour.toFixed(1).replace('.', ',')} MB/ora`;
  }

  function updateCodecInfo() { if (codecInfo) codecInfo.textContent = codecInfoText(codecSelect?.value || config.codecProfile); }

  function syncForm() {
    if (configDestination) configDestination.value = DESTINATIONS[config.destination] ? config.destination : 'local';
    if (destinationSelect) destinationSelect.value = DESTINATIONS[config.destination] ? config.destination : 'local';
    if (!resolveProfile(config.codecProfile)) config.codecProfile = resolveProfile('opus48') ? 'opus48' : 'browser';
    if (codecSelect) codecSelect.value = config.codecProfile;
    if (channelSelect) channelSelect.value = String(config.channels === 2 ? 2 : 1);
    if (autoStopSelect) autoStopSelect.value = String([0,30,60,90,120].includes(Number(config.autoStopMinutes)) ? Number(config.autoStopMinutes) : 0);
    if (noiseCheckbox) noiseCheckbox.checked = Boolean(config.noiseSuppression);
    if (echoCheckbox) echoCheckbox.checked = Boolean(config.echoCancellation);
    if (gainCheckbox) gainCheckbox.checked = Boolean(config.autoGainControl);
    if (prefixInput) prefixInput.value = config.namePrefix || 'Registrazione';
    if (googleFolderAudio) googleFolderAudio.value = config.googleFolder || 'Agenda iPad Registrazioni';
    if (oneFolderAudio) oneFolderAudio.value = config.oneDriveFolder || 'Agenda iPad Registrazioni';
    if (googleClientAudio && backupGoogleClient) googleClientAudio.value = backupGoogleClient.value || '';
    if (oneClientAudio && backupOneClient) oneClientAudio.value = backupOneClient.value || '';
    if (oneTenantAudio && backupOneTenant) oneTenantAudio.value = backupOneTenant.value || 'common';
    updateCodecInfo();
    updateControls();
  }

  function readForm() {
    if (configDestination && DESTINATIONS[configDestination.value]) config.destination = configDestination.value;
    if (codecSelect && resolveProfile(codecSelect.value)) config.codecProfile = codecSelect.value;
    config.channels = channelSelect?.value === '2' ? 2 : 1;
    config.autoStopMinutes = Number(autoStopSelect?.value) || 0;
    config.noiseSuppression = Boolean(noiseCheckbox?.checked);
    config.echoCancellation = Boolean(echoCheckbox?.checked);
    config.autoGainControl = Boolean(gainCheckbox?.checked);
    config.namePrefix = safeFilenamePart(prefixInput?.value || 'Registrazione');
    config.googleFolder = safeFilenamePart(googleFolderAudio?.value || 'Agenda iPad Registrazioni');
    config.oneDriveFolder = String(oneFolderAudio?.value || 'Agenda iPad Registrazioni').trim() || 'Agenda iPad Registrazioni';
  }

  function syncCredentialFields(source, target) {
    if (!source || !target) return;
    target.value = source.value;
    target.dispatchEvent(new Event('change', { bubbles:true }));
  }

  async function refreshStorageStatus() {
    const estimate = await storageEstimate();
    if (!storageStatus) return estimate;
    if (!estimate) {
      storageStatus.textContent = 'Spazio locale non verificabile: registrazione bloccata per sicurezza.';
      return null;
    }
    storageStatus.textContent = `Disponibile ${humanBytes(estimate.free)} su quota ${humanBytes(estimate.quota)} (${Math.round(estimate.freeRatio*100)}%). Soglia minima: 5%.`;
    storageStatus.classList.toggle('storage-warning', estimate.freeRatio < MIN_FREE_RATIO);
    return estimate;
  }

  async function ensureStorageHeadroom() {
    const estimate = await refreshStorageStatus();
    if (!estimate) throw new Error('Impossibile verificare lo spazio locale disponibile');
    if (estimate.freeRatio < MIN_FREE_RATIO) throw new Error('Registrazione bloccata: spazio locale disponibile inferiore al 5%');
    return estimate;
  }

  async function refreshCloudUi() {
    if (!cloudBridge) {
      if (googleStatusAudio) googleStatusAudio.textContent = 'Servizio Cloud non disponibile';
      if (oneStatusAudio) oneStatusAudio.textContent = 'Servizio Cloud non disponibile';
      return;
    }
    const state = cloudBridge.getState?.() || {};
    if (googleStatusAudio) googleStatusAudio.textContent = state.googleConnected ? 'Connesso ✓' : 'Non connesso';
    if (oneStatusAudio) oneStatusAudio.textContent = state.oneDriveConnected ? 'Connesso ✓' : 'Non connesso';
  }

  async function ensureCloudReady(destination) {
    const meta = destinationMeta(destination);
    if (!meta.provider) return;
    if (!cloudBridge) throw new Error('Connessione Cloud non disponibile');
    if (meta.provider === 'google') {
      await cloudBridge.testGoogle();
      await cloudBridge.ensureGoogleFolder(config.googleFolder);
    }
    if (meta.provider === 'onedrive') {
      await cloudBridge.testOneDrive();
      await cloudBridge.ensureOneDriveFolder(config.oneDriveFolder);
    }
  }

  function beginNetworkOperation() {
    networkController?.abort();
    networkController = new AbortController();
    return networkController;
  }

  function finishNetworkOperation(controller) {
    if (networkController === controller) networkController = null;
  }

  function suspendForInk() {
    networkController?.abort();
    networkController = null;
  }

  function schedulePendingRetry() {
    clearTimeout(retryTimer);
    if (!pendingRetryId) return;
    retryTimer = setTimeout(async () => {
      if (activeSession || isRealtimeBusy?.()) return schedulePendingRetry();
      const recording = await dbGet(RECORDINGS_STORE, pendingRetryId).catch(() => null);
      if (!recording || recording.uploadStatus !== 'pending' || !recording.blob) { pendingRetryId=''; return; }
      try {
        await ensureCloudReady(recording.destination);
        await uploadRecording(recording);
        pendingRetryId='';
        setStatus('Trasferimento Cloud completato');
      } catch (err) {
        if (err?.name !== 'AbortError') setStatus(`Cloud da riprovare: ${err.message || err}`);
        schedulePendingRetry();
      }
    }, 3500);
  }

  function resumeAfterInk() { schedulePendingRetry(); }

  function updateControls() {
    const sessionActive = Boolean(activeSession);
    const capturing = Boolean(activeSession && !activeSession.stopping && activeSession.recorder?.state !== 'inactive');
    if (recordButton) recordButton.disabled = sessionActive;
    if (stopButton) stopButton.disabled = !capturing;
    const hasLoaded = Boolean(loadedRecordingId && player?.src);
    for (const button of [startButton, backButton, playButton, forwardButton, endButton]) if (button) button.disabled = sessionActive || !hasLoaded;
    if (destinationSelect) destinationSelect.disabled = sessionActive;
    // Rosso fino al consolidamento locale: l'eventuale upload Cloud non prolunga lo stato REC.
    audioButton?.classList.toggle('recording', sessionActive);
    audioButton?.setAttribute('aria-pressed', panel && !panel.hidden ? 'true' : 'false');
  }

  function openPanel() {
    if (!panel) return;
    panel.hidden = false;
    if (destinationSelect && !activeSession) destinationSelect.value = config.destination;
    updateControls();
  }

  function closePanel() {
    if (!panel || activeSession) return;
    panel.hidden = true;
    audioButton?.setAttribute('aria-pressed', 'false');
  }

  function togglePanel() {
    if (!panel) return;
    if (panel.hidden) openPanel(); else closePanel();
  }

  async function persistQueuedChunks(force=false) {
    const session = activeSession;
    if (!session || session.persisting) return;
    if (!force && isRealtimeBusy?.()) {
      clearTimeout(session.flushTimer);
      session.flushTimer = setTimeout(() => persistQueuedChunks(false), 400);
      return;
    }
    session.persisting = true;
    try {
      while (session.queue.length) {
        if (!force && isRealtimeBusy?.()) break;
        const chunk = session.queue.shift();
        await dbPut(CHUNKS_STORE, { sessionId:session.id, index:chunk.index, blob:chunk.blob, size:chunk.blob.size, createdAt:new Date().toISOString() });
      }
    } finally {
      session.persisting = false;
      if (session.queue.length) {
        clearTimeout(session.flushTimer);
        session.flushTimer = setTimeout(() => persistQueuedChunks(force), force ? 40 : 400);
      }
    }
  }

  function queueChunk(blob) {
    if (!activeSession || !blob?.size) return;
    activeSession.queue.push({ index:activeSession.nextChunkIndex++, blob });
    persistQueuedChunks(false).catch((err) => console.warn('Persistenza chunk audio', err));
  }

  function startRecordingClock() {
    clearInterval(recordingTimer);
    recordingTimer = setInterval(() => {
      if (!activeSession || isRealtimeBusy?.()) return;
      const elapsed = (Date.now()-activeSession.startedAtMs)/1000;
      if (audioTime) audioTime.textContent = `${formatTime(elapsed)} · REC`;
    }, 1000);
  }

  function stopRecordingClock() {
    clearInterval(recordingTimer); recordingTimer = 0;
    clearTimeout(autoStopTimer); autoStopTimer = 0;
  }

  async function startRecording({ quick=false } = {}) {
    if (activeSession || recordingStartPending) return;
    recordingStartPending = true;
    try {
      if (!globalThis.MediaRecorder || !navigator.mediaDevices?.getUserMedia) throw new Error('Registrazione audio non supportata da questo browser');
      await ensureStorageHeadroom();
      const destination = destinationSelect?.value && DESTINATIONS[destinationSelect.value] ? destinationSelect.value : config.destination;
      // Anche con destinazione Cloud la registrazione parte localmente: la rete viene verificata
      // solo dopo lo Stop, così un Cloud temporaneamente offline non impedisce di registrare.
      const profile = resolveProfile(config.codecProfile);
      if (!profile) throw new Error('Codec selezionato non supportato su questo iPad');
      const descriptor = { ...getPageDescriptor() };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: config.channels === 2 ? 2 : 1,
          noiseSuppression: Boolean(config.noiseSuppression),
          echoCancellation: Boolean(config.echoCancellation),
          autoGainControl: Boolean(config.autoGainControl)
        },
        video:false
      });
      const recorderOptions = {};
      if (profile.mimeType) recorderOptions.mimeType = profile.mimeType;
      if (profile.bitrate > 0) recorderOptions.audioBitsPerSecond = profile.bitrate;
      const recorder = new MediaRecorder(stream, recorderOptions);
      const id = makeId('aud-session');
      activeSession = {
        id, recorder, stream, descriptor, destination, profile, quickMode:Boolean(quick),
        startedAt:new Date().toISOString(), startedAtMs:Date.now(), queue:[], nextChunkIndex:0,
        persisting:false, flushTimer:0, stopReason:'manuale'
      };
      recorder.addEventListener('dataavailable', (event) => queueChunk(event.data));
      recorder.addEventListener('error', (event) => {
        setStatus(`Errore registrazione: ${event.error?.message || 'MediaRecorder'}`);
        stopRecording('errore').catch(() => {});
      });
      recorder.start(CHUNK_MS);
      if (quick) {
        if (panel) panel.hidden = true;
        audioButton?.setAttribute('aria-pressed', 'false');
      } else openPanel();
      setStatus(`${quick ? 'Registrazione veloce' : 'Registrazione'} in corso · ${pageLabel(descriptor)} · ${profile.label}`);
      setAppStatus('registrazione audio');
      if (audioTime) audioTime.textContent = '0:00 · REC';
      startRecordingClock();
      if (config.autoStopMinutes > 0) autoStopTimer = setTimeout(() => stopRecording('arresto automatico'), config.autoStopMinutes*60000);
      updateControls();
    } catch (err) {
      setStatus(err.message || String(err));
      setAppStatus('registrazione non avviata');
      updateControls();
    } finally {
      recordingStartPending = false;
    }
  }

  async function waitForRecorderStop(session) {
    if (session.recorder.state === 'inactive') return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      session.recorder.addEventListener('stop', () => { clearTimeout(timer); resolve(); }, { once:true });
      try { session.recorder.stop(); } catch { clearTimeout(timer); resolve(); }
    });
  }

  async function flushAllChunks(session) {
    const started = performance.now();
    while ((session.queue.length || session.persisting) && performance.now()-started < 15000) {
      if (!session.persisting && session.queue.length) await persistQueuedChunks(true);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    if (session.queue.length) throw new Error('Salvataggio frammenti audio non completato');
  }

  function recordingFilename(session, mimeType, sequence=1) {
    const d = new Date(session.startedAt);
    const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`;
    const page = safeFilenamePart(pageLabel(session.descriptor));
    const prefix = safeFilenamePart(config.namePrefix || 'Registrazione');
    return `${prefix}_${stamp}_${page}_${String(sequence).padStart(2,'0')}.${extensionForMime(mimeType)}`;
  }

  async function uploadRecording(recording) {
    const meta = destinationMeta(recording.destination);
    if (!meta.provider) return recording;
    if (!recording.blob) throw new Error('Blob locale temporaneo non disponibile');
    await waitForRealtimeIdle(isRealtimeBusy, 60000);
    const controller = beginNetworkOperation();
    let remote;
    try {
      if (meta.provider === 'google') remote = await cloudBridge.uploadGoogle(recording.blob, recording.filename, config.googleFolder, recording.mimeType, controller.signal);
      else remote = await cloudBridge.uploadOneDrive(recording.blob, recording.filename, config.oneDriveFolder, recording.mimeType, controller.signal);
    } finally { finishNetworkOperation(controller); }
    recording.cloudProvider = meta.provider;
    recording.cloudFileId = remote?.id || '';
    recording.cloudName = remote?.name || recording.filename;
    recording.uploadStatus = 'uploaded';
    recording.uploadedAt = new Date().toISOString();
    if (!meta.keepLocal) {
      recording.blob = null;
      recording.localStored = false;
    } else recording.localStored = true;
    await dbPut(RECORDINGS_STORE, recording);
    return recording;
  }

  async function stopRecording(reason='manuale') {
    const session = activeSession;
    if (!session || session.stopping) return;
    session.stopping = true;
    updateControls();
    stopRecordingClock();
    session.stopReason = reason;
    setStatus('Finalizzo registrazione…');
    try {
      await waitForRecorderStop(session);
      for (const track of session.stream?.getTracks?.() || []) try { track.stop(); } catch {}
      await waitForRealtimeIdle(isRealtimeBusy, 30000).catch(() => {});
      await flushAllChunks(session);
      const rows = await listChunks(session.id);
      if (!rows.length) throw new Error('Nessun dato audio registrato');
      const mimeType = session.recorder.mimeType || session.profile.mimeType || rows[0]?.blob?.type || 'audio/mp4';
      const blob = new Blob(rows.map((row) => row.blob), { type:mimeType });
      const elapsedMs = Math.max(0, Date.now()-session.startedAtMs);
      const pageExisting = await listRecordingsForPage(session.descriptor.key);
      const recording = {
        id:makeId('audio'), pageKey:session.descriptor.key, pageDate:session.descriptor.date, pageKind:session.descriptor.kind,
        noteIndex:session.descriptor.noteIndex || 0, timetableIndex:session.descriptor.timetableIndex || 0,
        name:`${config.namePrefix || 'Registrazione'} ${pageExisting.length+1}`,
        filename:recordingFilename(session, mimeType, pageExisting.length+1),
        createdAt:session.startedAt, completedAt:new Date().toISOString(), durationMs:elapsedMs,
        mimeType, size:blob.size, codecProfile:session.profile.id, codecLabel:session.profile.label,
        requestedBitrate:session.profile.bitrate || 0, actualBitrate:Number(session.recorder.audioBitsPerSecond)||0,
        channels:config.channels, destination:session.destination,
        localStored:true, cloudProvider:'', cloudFileId:'', cloudName:'', uploadStatus:destinationMeta(session.destination).provider ? 'pending' : 'local',
        blob, appVersion
      };
      await dbPut(RECORDINGS_STORE, recording);
      notifyRecordingsChanged(recording.pageKey);
      await deleteChunks(session.id);
      // La registrazione è ormai definitivamente consolidata nell'archivio locale.
      // Da questo punto l'icona microfono può tornare allo stato normale;
      // l'eventuale upload Cloud resta una fase separata e subordinata alla Pencil.
      if (activeSession === session) activeSession = null;
      updateControls();
      const cloudMeta = destinationMeta(session.destination);
      if (cloudMeta.provider) {
        setStatus(`Registrazione salvata localmente · trasferimento ${cloudMeta.label}…`);
        try {
          await ensureCloudReady(session.destination);
          await uploadRecording(recording);
          setStatus(`Registrazione completata · ${cloudMeta.label}${cloudMeta.keepLocal ? ' + locale' : ''}`);
        } catch (err) {
          recording.uploadStatus = 'pending';
          recording.uploadError = err?.name === 'AbortError' ? 'trasferimento sospeso per priorità Ink' : (err.message || String(err));
          recording.localStored = true;
          recording.blob = blob;
          await dbPut(RECORDINGS_STORE, recording);
          pendingRetryId = recording.id;
          schedulePendingRetry();
          setStatus(`Registrazione protetta localmente · Cloud da riprovare: ${recording.uploadError}`);
        }
      } else setStatus('Registrazione salvata localmente');
      setAppStatus('registrazione salvata');
      if (audioTime) audioTime.textContent = `${formatTime(elapsedMs/1000)} · salvata`;
    } catch (err) {
      setStatus(`Errore finalizzazione: ${err.message || err}`);
      setAppStatus('errore registrazione');
    } finally {
      clearTimeout(session.flushTimer);
      if (activeSession === session) activeSession = null;
      updateControls();
      refreshStorageStatus();
    }
  }

  async function emergencyStorageCheck() {
    if (!activeSession) return;
    const estimate = await storageEstimate();
    if (estimate && estimate.freeRatio < EMERGENCY_FREE_RATIO) {
      setStatus('Spazio locale critico: arresto registrazione di sicurezza…');
      await stopRecording('spazio critico');
    }
  }

  async function fetchRecordingBlob(recording) {
    if (recording.blob instanceof Blob && recording.blob.size) return recording.blob;
    if (!recording.cloudProvider || !recording.cloudFileId) throw new Error('File audio non disponibile localmente');
    await waitForRealtimeIdle(isRealtimeBusy, 30000);
    const controller = beginNetworkOperation();
    try {
      if (recording.cloudProvider === 'google') return await cloudBridge.downloadGoogle(recording.cloudFileId, controller.signal);
      if (recording.cloudProvider === 'onedrive') return await cloudBridge.downloadOneDrive(recording.cloudFileId, controller.signal);
    } finally { finishNetworkOperation(controller); }
    throw new Error('Provider Cloud non riconosciuto');
  }

  function clearPlayerUrl() {
    if (playerObjectUrl) URL.revokeObjectURL(playerObjectUrl);
    playerObjectUrl = '';
    if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    loadedRecordingId = '';
    updateControls();
  }

  async function openRecording(recording) {
    try {
      setLibraryStatus('Apro registrazione…');
      const blob = await fetchRecordingBlob(recording);
      clearPlayerUrl();
      playerObjectUrl = URL.createObjectURL(blob);
      player.src = playerObjectUrl;
      loadedRecordingId = recording.id;
      await player.play().catch(() => {});
      openPanel();
      if (libraryPanel) libraryPanel.hidden = true;
      setStatus(`${recording.name} · ${formatTime(recording.durationMs/1000)} · ${recording.codecLabel || recording.mimeType}`);
      updateControls();
    } catch (err) {
      setLibraryStatus(err.message || String(err));
    }
  }

  async function retryCloudUpload(recording) {
    if (!recording?.blob) throw new Error('Copia locale temporanea non disponibile');
    await ensureCloudReady(recording.destination);
    await uploadRecording(recording);
    if (pendingRetryId === recording.id) pendingRetryId = '';
  }

  async function deleteRecording(recording) {
    const remote = Boolean(recording.cloudProvider && recording.cloudFileId);
    if (remote) {
      if (!cloudBridge) throw new Error('Connessione Cloud non disponibile');
      await waitForRealtimeIdle(isRealtimeBusy, 30000);
      const controller = beginNetworkOperation();
      try {
        if (recording.cloudProvider === 'google') await cloudBridge.deleteGoogle(recording.cloudFileId, controller.signal);
        else if (recording.cloudProvider === 'onedrive') await cloudBridge.deleteOneDrive(recording.cloudFileId, controller.signal);
      } finally { finishNetworkOperation(controller); }
    }
    await dbDelete(RECORDINGS_STORE, recording.id);
    notifyRecordingsChanged(recording.pageKey);
    if (loadedRecordingId === recording.id) clearPlayerUrl();
  }

  function recordingStorageLabel(row) {
    if (row.uploadStatus === 'pending') return 'Locale · Cloud da trasferire';
    if (row.cloudProvider && row.localStored) return `Locale + ${row.cloudProvider === 'google' ? 'Drive' : 'OneDrive'}`;
    if (row.cloudProvider) return row.cloudProvider === 'google' ? 'Google Drive' : 'OneDrive';
    return 'Locale';
  }

  async function renderLibrary() {
    if (!libraryList) return;
    const descriptor = getPageDescriptor();
    if (libraryTitle) libraryTitle.textContent = `Registrazioni · ${pageLabel(descriptor)}`;
    const rows = await listRecordingsForPage(descriptor.key);
    libraryList.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'audio-library-empty';
      empty.textContent = 'Nessuna registrazione associata a questa pagina.';
      libraryList.appendChild(empty);
      setLibraryStatus('');
      return;
    }
    for (const row of rows) {
      const item = document.createElement('article');
      item.className = 'audio-library-row';
      item.dataset.audioId = row.id;
      const info = document.createElement('div');
      info.className = 'audio-library-info';
      const strong = document.createElement('strong'); strong.textContent = row.name || 'Registrazione';
      const meta = document.createElement('small');
      meta.textContent = `${formatDateTime(row.createdAt)} · ${formatTime(row.durationMs/1000)} · ${humanBytes(row.size)} · ${recordingStorageLabel(row)}`;
      info.append(strong, meta);
      const actions = document.createElement('div'); actions.className = 'audio-library-actions';
      const open = document.createElement('button'); open.type='button'; open.dataset.audioAction='open'; open.textContent='▶ Apri';
      actions.appendChild(open);
      if (row.uploadStatus === 'pending' && destinationMeta(row.destination).provider) {
        const retry = document.createElement('button'); retry.type='button'; retry.dataset.audioAction='retry'; retry.textContent='☁ Riprova'; actions.appendChild(retry);
      }
      const del = document.createElement('button'); del.type='button'; del.dataset.audioAction='delete'; del.className='danger'; del.textContent='⌫ Elimina'; actions.appendChild(del);
      item.append(info, actions);
      libraryList.appendChild(item);
    }
    setLibraryStatus(`${rows.length} registrazion${rows.length === 1 ? 'e' : 'i'}`);
  }

  async function openLibrary() {
    if (!libraryPanel) return;
    libraryPanel.hidden = false;
    setLibraryStatus('Caricamento…');
    try { await renderLibrary(); } catch (err) { setLibraryStatus(err.message || String(err)); }
  }

  async function handleLibraryAction(button) {
    const rowElement = button.closest('[data-audio-id]');
    const id = rowElement?.dataset.audioId;
    if (!id) return;
    const recording = await dbGet(RECORDINGS_STORE, id);
    if (!recording) return renderLibrary();
    const action = button.dataset.audioAction;
    if (action === 'open') return openRecording(recording);
    if (action === 'retry') {
      try { setLibraryStatus('Trasferimento Cloud…'); await retryCloudUpload(recording); await renderLibrary(); }
      catch (err) { setLibraryStatus(`Cloud: ${err.message || err}`); }
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Eliminare definitivamente “${recording.name || 'Registrazione'}”?`)) return;
      try { setLibraryStatus('Eliminazione…'); await deleteRecording(recording); await renderLibrary(); }
      catch (err) { setLibraryStatus(`Eliminazione non riuscita: ${err.message || err}`); }
    }
  }

  function seek(delta) {
    if (!player || !Number.isFinite(player.duration)) return;
    player.currentTime = Math.max(0, Math.min(player.duration, (Number(player.currentTime)||0)+delta));
  }

  function updatePlayerTime() {
    if (!player || activeSession) return;
    const cur = Number(player.currentTime)||0;
    const dur = Number.isFinite(player.duration) ? player.duration : 0;
    if (audioTime) audioTime.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    if (playButton) playButton.textContent = player.paused ? '▶' : '❚❚';
  }

  async function togglePlay() {
    if (!player?.src) return;
    if (player.paused) await player.play().catch(() => {}); else player.pause();
    updatePlayerTime();
  }

  function handleAudioButtonActivation(ev) {
    const now = performance.now();
    if (activeSession?.stopping) {
      setStatus('Finalizzo e salvo la registrazione…');
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      return;
    }
    // Durante la registrazione veloce un singolo tap conclude e salva subito.
    if (activeSession?.quickMode && !activeSession.stopping) {
      clearTimeout(audioTapTimer);
      audioTapTimer = 0;
      lastAudioTapAt = -Infinity;
      void stopRecording('registrazione veloce');
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      return;
    }
    // Durante una registrazione avviata dal pannello, il microfono riporta semplicemente al pannello.
    if (activeSession && !activeSession.stopping) {
      openPanel();
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      return;
    }
    if (recordingStartPending) {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      return;
    }
    if (now - lastAudioTapAt <= AUDIO_QUICK_DOUBLE_TAP_MS) {
      clearTimeout(audioTapTimer);
      audioTapTimer = 0;
      lastAudioTapAt = -Infinity;
      void startRecording({ quick:true });
    } else {
      lastAudioTapAt = now;
      clearTimeout(audioTapTimer);
      audioTapTimer = setTimeout(() => {
        audioTapTimer = 0;
        lastAudioTapAt = -Infinity;
        if (!activeSession && !recordingStartPending) togglePanel();
      }, AUDIO_QUICK_DOUBLE_TAP_MS);
    }
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
  }

  function bindAudioButtonQuickGesture() {
    if (!(audioButton instanceof HTMLButtonElement)) return;
    audioButton.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;
      directActivation.set(audioButton, performance.now());
      handleAudioButtonActivation(ev);
    }, { passive:false });
    audioButton.addEventListener('click', (ev) => {
      const last = directActivation.get(audioButton);
      if (Number.isFinite(last) && performance.now()-last < 650) { ev.preventDefault(); return; }
      handleAudioButtonActivation(ev);
    });
  }

  function bindButton(button, handler) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;
      directActivation.set(button, performance.now());
      handler(ev);
      ev.preventDefault(); ev.stopPropagation();
    }, { passive:false });
    button.addEventListener('click', (ev) => {
      const last = directActivation.get(button);
      if (Number.isFinite(last) && performance.now()-last < 650) { ev.preventDefault(); return; }
      handler(ev);
    });
  }

  bindAudioButtonQuickGesture();
  bindButton(closePanelButton, closePanel);
  bindButton(recordButton, () => startRecording());
  bindButton(stopButton, () => stopRecording('manuale'));
  bindButton(startButton, () => { if (player) player.currentTime = 0; });
  bindButton(backButton, () => seek(-10));
  bindButton(playButton, () => togglePlay());
  bindButton(forwardButton, () => seek(10));
  bindButton(endButton, () => { if (player && Number.isFinite(player.duration)) player.currentTime = player.duration; });
  bindButton(folderButton, openLibrary);
  bindButton(closeLibraryButton, () => { if (libraryPanel) libraryPanel.hidden = true; });
  bindButton(tabSync, () => switchSettingsTab('sync'));
  bindButton(tabAudio, () => switchSettingsTab('recording'));
  bindButton(refreshStorageButton, refreshStorageStatus);

  bindButton(googleConnectAudio, async () => {
    try {
      syncCredentialFields(googleClientAudio, backupGoogleClient);
      sessionStorage.setItem(AUDIO_OPEN_SETTINGS_KEY, '1');
      if (googleStatusAudio) googleStatusAudio.textContent='Connessione…';
      await cloudBridge.connectGoogle(); await cloudBridge.testGoogle();
      sessionStorage.removeItem(AUDIO_OPEN_SETTINGS_KEY);
      if (googleStatusAudio) googleStatusAudio.textContent='Connesso e verificato ✓';
    } catch (err) { if (googleStatusAudio) googleStatusAudio.textContent=err.message || String(err); }
  });
  bindButton(googleTestAudio, async () => {
    try { syncCredentialFields(googleClientAudio, backupGoogleClient); await cloudBridge.testGoogle(); await cloudBridge.ensureGoogleFolder(config.googleFolder); if (googleStatusAudio) googleStatusAudio.textContent='Connessione valida ✓'; }
    catch (err) { if (googleStatusAudio) googleStatusAudio.textContent=err.message || String(err); }
  });
  bindButton(googleDisconnectAudio, async () => { await cloudBridge.disconnectGoogle(); refreshCloudUi(); });
  bindButton(oneConnectAudio, async () => {
    try {
      syncCredentialFields(oneClientAudio, backupOneClient); syncCredentialFields(oneTenantAudio, backupOneTenant);
      sessionStorage.setItem(AUDIO_OPEN_SETTINGS_KEY, '1');
      if (oneStatusAudio) oneStatusAudio.textContent='Connessione…';
      await cloudBridge.connectOneDrive();
    } catch (err) { if (oneStatusAudio) oneStatusAudio.textContent=err.message || String(err); }
  });
  bindButton(oneTestAudio, async () => {
    try { syncCredentialFields(oneClientAudio, backupOneClient); syncCredentialFields(oneTenantAudio, backupOneTenant); await cloudBridge.testOneDrive(); await cloudBridge.ensureOneDriveFolder(config.oneDriveFolder); if (oneStatusAudio) oneStatusAudio.textContent='Connessione valida ✓'; }
    catch (err) { if (oneStatusAudio) oneStatusAudio.textContent=err.message || String(err); }
  });
  bindButton(oneDisconnectAudio, () => { cloudBridge.disconnectOneDrive(); refreshCloudUi(); });

  libraryList?.addEventListener('click', (ev) => {
    const button = ev.target instanceof Element ? ev.target.closest('button[data-audio-action]') : null;
    if (button) handleLibraryAction(button);
  });
  libraryList?.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const button = ev.target instanceof Element ? ev.target.closest('button[data-audio-action]') : null;
    if (!button) return;
    directActivation.set(button, performance.now());
    handleLibraryAction(button);
    ev.preventDefault(); ev.stopPropagation();
  }, { passive:false });

  player?.addEventListener('timeupdate', updatePlayerTime);
  player?.addEventListener('durationchange', updatePlayerTime);
  player?.addEventListener('play', updatePlayerTime);
  player?.addEventListener('pause', updatePlayerTime);
  player?.addEventListener('ended', updatePlayerTime);

  destinationSelect?.addEventListener('change', () => setStatus(`Destinazione nuova registrazione: ${destinationMeta(destinationSelect.value).label}`));

  const configFields = [configDestination, codecSelect, channelSelect, autoStopSelect, noiseCheckbox, echoCheckbox, gainCheckbox, prefixInput, googleFolderAudio, oneFolderAudio];
  for (const field of configFields) field?.addEventListener('change', () => saveConfig().then(() => {
    updateCodecInfo();
    if (configDestination && destinationSelect && !activeSession) destinationSelect.value = configDestination.value;
  }).catch(() => {}));

  googleClientAudio?.addEventListener('change', () => syncCredentialFields(googleClientAudio, backupGoogleClient));
  oneClientAudio?.addEventListener('change', () => syncCredentialFields(oneClientAudio, backupOneClient));
  oneTenantAudio?.addEventListener('change', () => syncCredentialFields(oneTenantAudio, backupOneTenant));

  // Controllo di emergenza molto lento: nessuna attività nel pointermove.
  const emergencyTimer = setInterval(() => { if (activeSession && !isRealtimeBusy?.()) emergencyStorageCheck().catch(() => {}); }, 30000);

  populateCodecOptions();
  loadConfig().then(() => {
    refreshStorageStatus(); refreshCloudUi();
    setTimeout(() => {
      if (googleClientAudio && backupGoogleClient && !googleClientAudio.value) googleClientAudio.value = backupGoogleClient.value || '';
      if (oneClientAudio && backupOneClient && !oneClientAudio.value) oneClientAudio.value = backupOneClient.value || '';
      if (oneTenantAudio && backupOneTenant && (!oneTenantAudio.value || oneTenantAudio.value === 'common')) oneTenantAudio.value = backupOneTenant.value || 'common';
      refreshCloudUi();
    }, 500);
    if (sessionStorage.getItem(AUDIO_OPEN_SETTINGS_KEY) === '1') {
      sessionStorage.removeItem(AUDIO_OPEN_SETTINGS_KEY);
      switchSettingsTab('recording');
    } else switchSettingsTab('sync');
  }).catch((err) => console.warn('Audio recorder init', err));
  updateControls();

  return {
    openPanel, closePanel, openLibrary, refreshStorageStatus,
    countForPage: async (pageKey) => (await listRecordingsForPage(pageKey)).length,
    isRecording:() => Boolean(activeSession && !activeSession.stopping && activeSession.recorder?.state !== 'inactive'),
    startQuickRecording:() => startRecording({ quick:true }),
    stopQuickRecording:() => stopRecording('registrazione veloce'),
    suspendForInk,
    resumeAfterInk,
    destroy:() => { clearInterval(emergencyTimer); clearTimeout(retryTimer); clearTimeout(audioTapTimer); suspendForInk(); stopRecordingClock(); clearPlayerUrl(); }
  };
}
