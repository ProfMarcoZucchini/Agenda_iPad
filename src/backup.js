import { createGoogleDriveAuth, createOneDriveAuth } from './cloud-auth.js';
const BACKUP_DB_NAME = 'AgendaIPadBackupDB';
const BACKUP_DB_VERSION = 1;
const ARCHIVE_STORE = 'archives';
const SETTINGS_STORE = 'settings';
const SETTINGS_KEY = 'backup-config-v1';
const DIRECTORY_KEY = 'local-directory-handle-v1';
const BACKUP_FORMAT = 'agenda-ipad-backup';
const BACKUP_FORMAT_VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NON_PORTABLE_PREFERENCE_KEYS = new Set([
  'agenda-ipad-cloud-sync-config-v1',
  'agenda-ipad-lan-sync-config-v1',
  'agenda-ipad-sync-restore-guard-v1'
]);

function isPortablePreferenceKey(key) {
  return Boolean(key) && key.startsWith('agenda-ipad-') && !key.includes('backup') && !NON_PORTABLE_PREFERENCE_KEYS.has(key);
}

const DEFAULT_CONFIG = Object.freeze({
  frequency: 'daily',
  customDays: 3,
  retention: 30,
  backupOnStartup: true,
  verifyAfterBackup: true,
  destinations: { localFolder: false, googleDrive: false, oneDrive: false },
  google: { clientId: '', folderId: '', folderName: 'Agenda iPad Backups' },
  oneDrive: { clientId: '', tenant: 'common', folder: 'Agenda iPad Backups' },
  lastBackupAt: null,
  lastBackupId: null
});

function cloneConfig(value = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...value,
    destinations: { ...DEFAULT_CONFIG.destinations, ...(value.destinations || {}) },
    google: { ...DEFAULT_CONFIG.google, ...(value.google || {}) },
    oneDrive: { ...DEFAULT_CONFIG.oneDrive, ...(value.oneDrive || {}) }
  };
}

function openBackupDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ARCHIVE_STORE)) db.createObjectStore(ARCHIVE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function backupGet(store, key) {
  const db = await openBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function backupPut(store, value) {
  const db = await openBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Backup DB transaction aborted'));
  });
}

async function backupDelete(store, key) {
  const db = await openBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listArchives() {
  const db = await openBackupDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(ARCHIVE_STORE, 'readonly');
    const req = tx.objectStore(ARCHIVE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function readMainRecords(dbName, storeName) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function replaceMainRecords(dbName, storeName, records) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Ripristino IndexedDB annullato'));
    });
  } finally {
    db.close();
  }
}

function collectPortablePreferences() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isPortablePreferenceKey(key)) continue;
      out[key] = localStorage.getItem(key);
    }
  } catch {}
  return out;
}

function restorePortablePreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') return;
  for (const [key, value] of Object.entries(preferences)) {
    if (!isPortablePreferenceKey(key)) continue;
    try { localStorage.setItem(key, String(value)); } catch {}
  }
}

async function sha256Hex(bytesOrBlob) {
  const bytes = bytesOrBlob instanceof Blob
    ? new Uint8Array(await bytesOrBlob.arrayBuffer())
    : bytesOrBlob instanceof Uint8Array ? bytesOrBlob : new Uint8Array(bytesOrBlob);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

function concatBytes(parts) {
  const size = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  const dt = dosDateTime();
  const u16 = (view, off, value) => view.setUint16(off, value, true);
  const u32 = (view, off, value) => view.setUint32(off, value >>> 0, true);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
    const crc = crc32(data);
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
    u16(lv, 10, dt.time); u16(lv, 12, dt.date); u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length);
    u16(lv, 26, nameBytes.length); u16(lv, 28, 0);
    const local = concatBytes([lh, nameBytes, data]);
    locals.push(local);

    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u16(cv, 12, dt.time); u16(cv, 14, dt.date); u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length);
    u16(cv, 28, nameBytes.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, localOffset);
    centrals.push(concatBytes([ch, nameBytes]));
    localOffset += local.length;
  }

  const central = concatBytes(centrals);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, central.length, true); ev.setUint32(16, localOffset, true); ev.setUint16(20, 0, true);
  return new Blob([...locals, central, eocd], { type: 'application/zip' });
}

async function parseStoredZip(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    if (offset + 30 > bytes.length) throw new Error('Header ZIP incompleto');
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    if (method !== 0) throw new Error('Backup compresso non supportato da questo lettore');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error('Contenuto ZIP incompleto');
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
    files.set(name, bytes.slice(dataStart, dataEnd));
    offset = dataEnd;
  }
  return files;
}

function jsonBytes(value) { return encoder.encode(JSON.stringify(value, null, 2)); }
function parseJsonBytes(bytes, name) {
  if (!bytes) throw new Error(`File ${name} mancante`);
  return JSON.parse(decoder.decode(bytes));
}


function clonePortableRecords(records) {
  try { return structuredClone(records); } catch { return JSON.parse(JSON.stringify(records)); }
}

function dataUrlToMedia(src) {
  if (typeof src !== 'string' || !src.startsWith('data:')) return null;
  const comma = src.indexOf(',');
  if (comma < 0) return null;
  const header = src.slice(5, comma);
  const payload = src.slice(comma + 1);
  const parts = header.split(';');
  const mimeType = parts[0] || 'application/octet-stream';
  const isBase64 = parts.includes('base64');
  try {
    if (isBase64) {
      const raw = atob(payload);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return { mimeType, bytes };
    }
    return { mimeType, bytes: encoder.encode(decodeURIComponent(payload)) };
  } catch { return null; }
}

function mediaToDataUrl(bytes, mimeType) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function extensionForMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic')) return 'heic';
  return 'bin';
}

function safeFileToken(value) {
  return String(value || 'item').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100);
}

function extractMediaFromRecords(records) {
  const portableRecords = clonePortableRecords(records || []);
  const mediaEntries = [];
  const mediaItems = [];
  for (const record of portableRecords) {
    if (!Array.isArray(record?.images)) continue;
    for (const image of record.images) {
      const media = dataUrlToMedia(image?.src);
      if (!media) continue;
      const ext = extensionForMime(image.mimeType || media.mimeType);
      const recordToken = safeFileToken(record.date || record.referenceDate || 'page');
      const imageToken = safeFileToken(image.id || `image-${mediaItems.length + 1}`);
      const path = `media/images/${recordToken}--${imageToken}.${ext}`;
      mediaEntries.push({ name: path, bytes: media.bytes });
      mediaItems.push({
        id: image.id || imageToken,
        type: 'image',
        path,
        mimeType: image.mimeType || media.mimeType,
        pageKey: record.date || null,
        referenceDate: record.referenceDate || null,
        name: image.name || null,
        size: media.bytes.length
      });
      image.mediaPath = path;
      image.mimeType = image.mimeType || media.mimeType;
      delete image.src;
    }
  }
  return { portableRecords, mediaEntries, mediaItems };
}

function hydrateMediaIntoRecords(records, files) {
  const hydrated = clonePortableRecords(records || []);
  for (const record of hydrated) {
    if (!Array.isArray(record?.images)) continue;
    for (const image of record.images) {
      if (typeof image.src === 'string' && image.src.startsWith('data:')) continue; // backup precedente/compatibile
      if (!image.mediaPath) continue;
      const bytes = files.get(image.mediaPath);
      if (!bytes) throw new Error(`Media immagine mancante: ${image.mediaPath}`);
      image.src = mediaToDataUrl(bytes, image.mimeType || 'application/octet-stream');
    }
  }
  return hydrated;
}

function backupFileName(appVersion, createdAt) {
  const stamp = createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `Agenda_iPad_FULL_${stamp}_app-${appVersion}_fmt-${BACKUP_FORMAT_VERSION}.zip`;
}

async function makeBackupPackage({ appVersion, records, preferences, config }) {
  const createdAt = new Date().toISOString();
  const media = extractMediaFromRecords(records);
  const pagesBytes = jsonBytes({ schemaVersion: 2, count: media.portableRecords.length, records: media.portableRecords });
  const prefBytes = jsonBytes({ schemaVersion: 1, values: preferences });
  const mediaBytes = jsonBytes({ schemaVersion: 1, items: media.mediaItems, layoutVersion: 1 });
  const safeConfig = {
    frequency: config.frequency, customDays: config.customDays, retention: config.retention,
    destinations: config.destinations,
    google: { clientId: config.google.clientId, folderId: config.google.folderId },
    oneDrive: { clientId: config.oneDrive.clientId, tenant: config.oneDrive.tenant, folder: config.oneDrive.folder }
  };
  const manifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    createdBy: { app: 'Agenda iPad', appVersion, platform: 'PWA' },
    reader: { minFormatVersion: 1 },
    backup: { type: 'full', immutable: true, recordCount: records.length },
    collections: [
      { id: 'pages', path: 'data/pages.json', encoding: 'json', schemaVersion: 2 },
      { id: 'preferences', path: 'data/preferences.json', encoding: 'json', schemaVersion: 1 },
      { id: 'media', path: 'media/index.json', encoding: 'json-index', schemaVersion: 1, extensible: true }
    ],
    mediaLayout: { images: 'media/images/', audio: 'media/audio/', video: 'media/video/', attachments: 'media/attachments/' },
    backupSettingsSnapshot: safeConfig,
    checksumAlgorithm: 'SHA-256'
  };
  const manifestBytes = jsonBytes(manifest);
  const checksumFiles = {
    'manifest.json': await sha256Hex(manifestBytes),
    'data/pages.json': await sha256Hex(pagesBytes),
    'data/preferences.json': await sha256Hex(prefBytes),
    'media/index.json': await sha256Hex(mediaBytes)
  };
  for (const entry of media.mediaEntries) checksumFiles[entry.name] = await sha256Hex(entry.bytes);
  const checksums = { algorithm: 'SHA-256', files: checksumFiles };
  const checksumBytes = jsonBytes(checksums);
  const blob = storedZip([
    { name: 'manifest.json', bytes: manifestBytes },
    { name: 'checksums.json', bytes: checksumBytes },
    { name: 'data/pages.json', bytes: pagesBytes },
    { name: 'data/preferences.json', bytes: prefBytes },
    { name: 'media/index.json', bytes: mediaBytes },
    ...media.mediaEntries
  ]);
  return { createdAt, filename: backupFileName(appVersion, createdAt), blob, manifest, checksums };
}

async function verifyBackupBlob(blob) {
  const files = await parseStoredZip(blob);
  const manifest = parseJsonBytes(files.get('manifest.json'), 'manifest.json');
  if (manifest.format !== BACKUP_FORMAT || Number(manifest.formatVersion) !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Formato backup non compatibile (${manifest.format || '?'}/${manifest.formatVersion || '?'})`);
  }
  const checksums = parseJsonBytes(files.get('checksums.json'), 'checksums.json');
  for (const [name, expected] of Object.entries(checksums.files || {})) {
    const bytes = files.get(name);
    if (!bytes) throw new Error(`File ${name} mancante`);
    const actual = await sha256Hex(bytes);
    if (actual !== expected) throw new Error(`Checksum non valido: ${name}`);
  }
  const pages = parseJsonBytes(files.get('data/pages.json'), 'data/pages.json');
  const preferences = parseJsonBytes(files.get('data/preferences.json'), 'data/preferences.json');
  if (Array.isArray(pages.records)) pages.records = hydrateMediaIntoRecords(pages.records, files);
  return { manifest, pages, preferences, files };
}

function dueAt(config) {
  if (!config.lastBackupAt) return new Date(0);
  const last = new Date(config.lastBackupAt);
  if (!Number.isFinite(last.getTime())) return new Date(0);
  const next = new Date(last);
  if (config.frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (config.frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (config.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (config.frequency === 'custom') next.setDate(next.getDate() + Math.max(1, Number(config.customDays) || 1));
  else return new Date(8640000000000000);
  return next;
}

function humanBytes(size) {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function safePathSegments(path) {
  return String(path || '').split('/').map((s) => s.trim()).filter(Boolean);
}

async function ensureOneDriveFolder(token, folderPath, signal = null) {
  const segments = safePathSegments(folderPath);
  if (!segments.length) return null;
  let parentId = 'root';
  let accumulated = '';
  for (const segment of segments) {
    accumulated += `/${segment}`;
    const lookup = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:${accumulated}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (lookup.ok) {
      const item = await lookup.json();
      parentId = item.id;
      continue;
    }
    if (lookup.status !== 404) throw new Error(`OneDrive cartella: HTTP ${lookup.status}`);
    const endpoint = parentId === 'root'
      ? 'https://graph.microsoft.com/v1.0/me/drive/root/children'
      : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children`;
    const created = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: segment, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }), signal
    });
    if (!created.ok) throw new Error(`OneDrive crea cartella: HTTP ${created.status}`);
    parentId = (await created.json()).id;
  }
  return parentId;
}

async function uploadOneDrive(blob, filename, token, folderPath, contentType = 'application/zip', signal = null) {
  if (!token) throw new Error('Token OneDrive mancante');
  const folderId = await ensureOneDriveFolder(token, folderPath, signal);
  const endpoint = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(filename)}:/content`;
  const response = await fetch(endpoint, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType || blob?.type || 'application/octet-stream' }, body: blob, signal });
  if (!response.ok) throw new Error(`OneDrive upload: HTTP ${response.status}`);
  return response.json();
}

async function ensureGoogleFolder(token, folderId, folderName = 'Agenda iPad Backups', signal = null) {
  if (folderId) return folderId;
  const safeName = String(folderName || 'Agenda iPad Backups').replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const list = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)&pageSize=10`, {
    headers: { Authorization: `Bearer ${token}` }, signal
  });
  if (!list.ok) throw new Error(`Google Drive cartella: HTTP ${list.status}`);
  const existing = (await list.json()).files?.[0];
  if (existing?.id) return existing.id;
  const create = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName || 'Agenda iPad Backups', mimeType: 'application/vnd.google-apps.folder' }), signal
  });
  if (!create.ok) throw new Error(`Google Drive crea cartella: HTTP ${create.status}`);
  return (await create.json()).id;
}

async function uploadGoogleDrive(blob, filename, token, folderId, folderName = 'Agenda iPad Backups', contentType = 'application/zip', signal = null) {
  if (!token) throw new Error('Sessione Google Drive non connessa');
  const effectiveFolderId = await ensureGoogleFolder(token, folderId, folderName, signal);
  const effectiveType = contentType || blob?.type || 'application/octet-stream';
  const metadata = { name: filename, mimeType: effectiveType };
  if (effectiveFolderId) metadata.parents = [effectiveFolderId];
  const boundary = `agenda_ipad_${Date.now().toString(36)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${effectiveType}\r\n\r\n`, blob,
    `\r\n--${boundary}--`
  ]);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body, signal
  });
  if (!response.ok) throw new Error(`Google Drive upload: HTTP ${response.status}`);
  return response.json();
}

async function uploadGoogleDriveResumable(blob, filename, token, folderName = 'Agenda iPad Registrazioni', contentType = 'application/octet-stream', signal = null) {
  if (!token) throw new Error('Sessione Google Drive non connessa');
  const folderId = await ensureGoogleFolder(token, '', folderName, signal);
  const effectiveType = contentType || blob?.type || 'application/octet-stream';
  const metadata = { name: filename, mimeType: effectiveType };
  if (folderId) metadata.parents = [folderId];
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,modifiedTime', {
    method:'POST',
    headers:{
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json; charset=UTF-8',
      'X-Upload-Content-Type':effectiveType,
      'X-Upload-Content-Length':String(blob.size)
    },
    body:JSON.stringify(metadata), signal
  });
  if (!init.ok) throw new Error(`Google Drive avvio upload: HTTP ${init.status}`);
  const location = init.headers.get('Location');
  if (!location) throw new Error('Google Drive: sessione upload non restituita');
  const chunkSize = 5 * 1024 * 1024; // multiplo di 256 KiB
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(blob.size, offset + chunkSize);
    const chunk = blob.slice(offset, end, effectiveType);
    const response = await fetch(location, {
      method:'PUT',
      headers:{
        'Content-Type':effectiveType,
        'Content-Range':`bytes ${offset}-${end - 1}/${blob.size}`
      },
      body:chunk, signal
    });
    if (response.status === 308) { offset = end; continue; }
    if (!response.ok) throw new Error(`Google Drive upload: HTTP ${response.status}`);
    return response.json();
  }
  throw new Error('Google Drive: upload non finalizzato');
}

async function uploadOneDriveSession(blob, filename, token, folderPath, contentType = 'application/octet-stream', signal = null) {
  if (!token) throw new Error('Token OneDrive mancante');
  const folderId = await ensureOneDriveFolder(token, folderPath, signal);
  const createEndpoint = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/createUploadSession`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(filename)}:/createUploadSession`;
  const created = await fetch(createEndpoint, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ item:{ '@microsoft.graph.conflictBehavior':'rename', name:filename } }), signal
  });
  if (!created.ok) throw new Error(`OneDrive avvio upload: HTTP ${created.status}`);
  const uploadUrl = (await created.json()).uploadUrl;
  if (!uploadUrl) throw new Error('OneDrive: sessione upload non restituita');
  const effectiveType = contentType || blob?.type || 'application/octet-stream';
  const chunkSize = 5 * 1024 * 1024; // 16 × 320 KiB
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(blob.size, offset + chunkSize);
    const chunk = blob.slice(offset, end, effectiveType);
    const response = await fetch(uploadUrl, {
      method:'PUT',
      headers:{
        'Content-Range':`bytes ${offset}-${end - 1}/${blob.size}`
      },
      body:chunk, signal
    });
    if (response.status === 202) { offset = end; continue; }
    if (!response.ok) throw new Error(`OneDrive upload: HTTP ${response.status}`);
    return response.json();
  }
  throw new Error('OneDrive: upload non finalizzato');
}

async function uploadAudioGoogleDrive(blob, filename, token, folderName, contentType, signal = null) {
  if (blob.size <= 5 * 1024 * 1024) return uploadGoogleDrive(blob, filename, token, '', folderName, contentType, signal);
  return uploadGoogleDriveResumable(blob, filename, token, folderName, contentType, signal);
}

async function uploadAudioOneDrive(blob, filename, token, folderPath, contentType, signal = null) {
  if (blob.size <= 200 * 1024 * 1024) return uploadOneDrive(blob, filename, token, folderPath, contentType, signal);
  return uploadOneDriveSession(blob, filename, token, folderPath, contentType, signal);
}

async function downloadGoogleDriveFile(fileId, token, signal = null) {
  if (!token) throw new Error('Sessione Google Drive non connessa');
  if (!fileId) throw new Error('ID file Google Drive mancante');
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }, signal
  });
  if (!response.ok) throw new Error(`Google Drive download: HTTP ${response.status}`);
  return response.blob();
}

async function deleteGoogleDriveFile(fileId, token, signal = null) {
  if (!token) throw new Error('Sessione Google Drive non connessa');
  if (!fileId) return;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method:'DELETE', headers:{ Authorization:`Bearer ${token}` }, signal
  });
  if (!response.ok && response.status !== 404) throw new Error(`Google Drive elimina: HTTP ${response.status}`);
}

async function downloadOneDriveFile(fileId, token, signal = null) {
  if (!token) throw new Error('Sessione OneDrive non connessa');
  if (!fileId) throw new Error('ID file OneDrive mancante');
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`, {
    headers:{ Authorization:`Bearer ${token}` }, signal
  });
  if (!response.ok) throw new Error(`OneDrive download: HTTP ${response.status}`);
  return response.blob();
}

async function deleteOneDriveFile(fileId, token, signal = null) {
  if (!token) throw new Error('Sessione OneDrive non connessa');
  if (!fileId) return;
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`, {
    method:'DELETE', headers:{ Authorization:`Bearer ${token}` }, signal
  });
  if (!response.ok && response.status !== 404) throw new Error(`OneDrive elimina: HTTP ${response.status}`);
}

async function downloadOrShare(archive) {
  if (!archive?.blob) throw new Error('Backup non disponibile');
  const file = new File([archive.blob], archive.filename, { type: 'application/zip', lastModified: Date.now() });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Backup Agenda iPad' });
    return 'condiviso';
  }
  const url = URL.createObjectURL(archive.blob);
  const a = document.createElement('a');
  a.href = url; a.download = archive.filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'scaricato';
}

export function initBackupFoundation(options) {
  const {
    appVersion, mainDbName, mainStore, flushCurrent = async () => {}, setAppStatus = () => {},
    isRealtimeBusy = () => false, beforeRestoreApplied = async () => {}, afterRestoreApplied = async () => {},
    beforeGlobalRestoreApplied = async () => {}, afterGlobalRestoreApplied = async () => {}
  } = options;

  const settingsButton = document.getElementById('settingsButton');
  const panel = document.getElementById('settingsPanel');
  const closeButton = document.getElementById('closeSettingsButton');
  const frequency = document.getElementById('backupFrequency');
  const customDays = document.getElementById('backupCustomDays');
  const customDaysField = document.getElementById('customDaysField');
  const retention = document.getElementById('backupRetention');
  const onStartup = document.getElementById('backupOnStartup');
  const verifyAfter = document.getElementById('verifyAfterBackup');
  const destLocal = document.getElementById('destLocalFolder');
  const destGoogle = document.getElementById('destGoogleDrive');
  const destOneDrive = document.getElementById('destOneDrive');
  const chooseLocal = document.getElementById('chooseLocalFolderButton');
  const localStatus = document.getElementById('localFolderStatus');
  const exportLatest = document.getElementById('exportLatestButton');
  const googleClientId = document.getElementById('googleClientId');
  const googleFolderId = document.getElementById('googleFolderId');
  const googleFolderName = document.getElementById('googleFolderName');
  const googleConnect = document.getElementById('googleConnectButton');
  const googleTest = document.getElementById('googleTestButton');
  const googleDisconnect = document.getElementById('googleDisconnectButton');
  const googleConnectionStatus = document.getElementById('googleConnectionStatus');
  const oneClientId = document.getElementById('oneDriveClientId');
  const oneTenant = document.getElementById('oneDriveTenant');
  const oneFolder = document.getElementById('oneDriveFolder');
  const oneConnect = document.getElementById('oneDriveConnectButton');
  const oneTest = document.getElementById('oneDriveTestButton');
  const oneDisconnect = document.getElementById('oneDriveDisconnectButton');
  const oneConnectionStatus = document.getElementById('oneDriveConnectionStatus');
  const backupNow = document.getElementById('backupNowButton');
  const verifyButton = document.getElementById('verifyBackupButton');
  const restoreButton = document.getElementById('restoreBackupButton');
  const restoreInput = document.getElementById('restoreBackupInput');
  const restoreGroupButton = document.getElementById('restoreGroupBackupButton');
  const restoreGroupInput = document.getElementById('restoreGroupBackupInput');
  const status = document.getElementById('backupStatus');
  const history = document.getElementById('backupHistory');

  let config = cloneConfig();
  let directoryHandle = null;
  let running = false;
  let lastActivity = performance.now();
  let dueTimer = 0;
  let authCallbackMessage = '';
  const directActivations = new WeakMap();

  const setStatus = (text) => { if (status) status.textContent = text; };

  const cloudStateText = (connected, expiresAt) => connected
    ? `Connesso per questa sessione · scadenza ${new Date(expiresAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
    : 'Non connesso';

  const googleAuth = createGoogleDriveAuth({
    getClientId: () => googleClientId?.value || config.google.clientId,
    onChange: ({ connected, expiresAt }) => {
      if (googleConnectionStatus) googleConnectionStatus.textContent = cloudStateText(connected, expiresAt);
      googleConnect?.classList.toggle('connected', connected);
    }
  });
  const oneDriveAuth = createOneDriveAuth({
    getClientId: () => oneClientId?.value || config.oneDrive.clientId,
    getTenant: () => oneTenant?.value || config.oneDrive.tenant || 'common',
    onChange: ({ connected, expiresAt }) => {
      if (oneConnectionStatus) oneConnectionStatus.textContent = cloudStateText(connected, expiresAt);
      oneConnect?.classList.toggle('connected', connected);
    }
  });

  async function loadConfig() {
    const row = await backupGet(SETTINGS_STORE, SETTINGS_KEY).catch(() => null);
    config = cloneConfig(row?.value || {});
    directoryHandle = (await backupGet(SETTINGS_STORE, DIRECTORY_KEY).catch(() => null))?.handle || null;
    syncForm();
    await renderHistory();
  }

  function syncForm() {
    frequency.value = config.frequency;
    customDays.value = config.customDays;
    retention.value = config.retention;
    onStartup.checked = Boolean(config.backupOnStartup);
    verifyAfter.checked = Boolean(config.verifyAfterBackup);
    destLocal.checked = Boolean(config.destinations.localFolder);
    destGoogle.checked = Boolean(config.destinations.googleDrive);
    destOneDrive.checked = Boolean(config.destinations.oneDrive);
    googleClientId.value = config.google.clientId || '';
    googleFolderId.value = config.google.folderId || '';
    if (googleFolderName) googleFolderName.value = config.google.folderName || 'Agenda iPad Backups';
    oneClientId.value = config.oneDrive.clientId || '';
    oneTenant.value = config.oneDrive.tenant || 'common';
    oneFolder.value = config.oneDrive.folder || 'Agenda iPad Backups';
    if (googleConnectionStatus) googleConnectionStatus.textContent = cloudStateText(Boolean(googleAuth.getAccessToken()), googleAuth.getExpiresAt());
    if (oneConnectionStatus) oneConnectionStatus.textContent = cloudStateText(Boolean(oneDriveAuth.getAccessToken()), oneDriveAuth.getExpiresAt());
    customDaysField.hidden = config.frequency !== 'custom';
    if (!('showDirectoryPicker' in window)) {
      chooseLocal.disabled = true;
      destLocal.disabled = true;
      destLocal.checked = false;
      localStatus.textContent = 'Non disponibile in questa PWA iPad: usa “Esporta ultimo backup” per Files/Share.';
    } else {
      localStatus.textContent = directoryHandle ? 'Cartella autorizzata/configurata.' : 'Nessuna cartella selezionata.';
    }
  }

  function readFormIntoConfig() {
    config.frequency = frequency.value;
    config.customDays = Math.max(1, Math.min(365, Number(customDays.value) || 3));
    config.retention = Math.max(3, Math.min(120, Number(retention.value) || 30));
    config.backupOnStartup = onStartup.checked;
    config.verifyAfterBackup = verifyAfter.checked;
    config.destinations.localFolder = Boolean(destLocal.checked && ('showDirectoryPicker' in window));
    config.destinations.googleDrive = destGoogle.checked;
    config.destinations.oneDrive = destOneDrive.checked;
    config.google.clientId = googleClientId.value.trim();
    config.google.folderId = googleFolderId.value.trim();
    config.google.folderName = googleFolderName?.value.trim() || 'Agenda iPad Backups';
    config.oneDrive.clientId = oneClientId.value.trim();
    config.oneDrive.tenant = oneTenant.value.trim() || 'common';
    config.oneDrive.folder = oneFolder.value.trim();
  }

  async function saveConfig() {
    readFormIntoConfig();
    await backupPut(SETTINGS_STORE, { key: SETTINGS_KEY, value: config, modifiedAt: new Date().toISOString() });
    customDaysField.hidden = config.frequency !== 'custom';
  }

  async function prune() {
    const rows = await listArchives();
    const keep = Math.max(3, Number(config.retention) || 30);
    for (const row of rows.slice(keep)) await backupDelete(ARCHIVE_STORE, row.id);
  }

  async function getLatest() {
    return (await listArchives())[0] || null;
  }

  async function writeLocalFolder(archive) {
    if (!directoryHandle) throw new Error('Cartella locale non selezionata');
    let permission = await directoryHandle.queryPermission?.({ mode: 'readwrite' });
    if (permission !== 'granted') permission = await directoryHandle.requestPermission?.({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('Permesso cartella non concesso');
    const fileHandle = await directoryHandle.getFileHandle(archive.filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(archive.blob);
    await writable.close();
    return true;
  }

  async function deliverExternal(archive, reason) {
    const results = [{ key: 'internal', label: 'Archivio app', ok: true, message: 'salvato' }];
    if (config.destinations.localFolder) {
      try { await writeLocalFolder(archive); results.push({ key: 'local', label: 'Cartella locale', ok: true, message: 'salvato' }); }
      catch (err) { results.push({ key: 'local', label: 'Cartella locale', ok: false, message: err.message }); }
    }
    if (config.destinations.googleDrive) {
      try {
        const token = googleAuth.getAccessToken();
        if (!token) throw new Error('sessione non connessa: premi Connetti');
        const folderId = await ensureGoogleFolder(token, config.google.folderId, config.google.folderName);
        if (!config.google.folderId && folderId) {
          config.google.folderId = folderId;
          if (googleFolderId) googleFolderId.value = folderId;
          await backupPut(SETTINGS_STORE, { key: SETTINGS_KEY, value: config, modifiedAt: new Date().toISOString() });
        }
        await uploadGoogleDrive(archive.blob, archive.filename, token, folderId, config.google.folderName);
        results.push({ key: 'google', label: 'Google Drive', ok: true, message: 'caricato' });
      } catch (err) { results.push({ key: 'google', label: 'Google Drive', ok: false, message: err.message }); }
    }
    if (config.destinations.oneDrive) {
      try {
        const token = oneDriveAuth.getAccessToken();
        if (!token) throw new Error('sessione non connessa: premi Connetti');
        await uploadOneDrive(archive.blob, archive.filename, token, config.oneDrive.folder);
        results.push({ key: 'onedrive', label: 'OneDrive', ok: true, message: 'caricato' });
      } catch (err) { results.push({ key: 'onedrive', label: 'OneDrive', ok: false, message: err.message }); }
    }
    return results;
  }

  async function createBackup(reason = 'manual', { safety = false } = {}) {
    if (running) return null;
    running = true;
    setStatus(`Backup ${reason === 'automatic' ? 'automatico' : 'manuale'} in corso…`);
    setAppStatus('backup in corso');
    try {
      await flushCurrent();
      const records = await readMainRecords(mainDbName, mainStore);
      const preferences = collectPortablePreferences();
      const pkg = await makeBackupPackage({ appVersion, records, preferences, config });
      if (config.verifyAfterBackup) await verifyBackupBlob(pkg.blob);
      const zipHash = await sha256Hex(pkg.blob);
      const id = `${pkg.createdAt}::${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      const archive = {
        id, filename: pkg.filename, createdAt: pkg.createdAt, size: pkg.blob.size,
        sha256: zipHash, recordCount: records.length, formatVersion: BACKUP_FORMAT_VERSION,
        reason: safety ? 'pre-restore' : reason, appVersion, blob: pkg.blob
      };
      await backupPut(ARCHIVE_STORE, archive);
      if (!safety) {
        config.lastBackupAt = pkg.createdAt;
        config.lastBackupId = id;
        await backupPut(SETTINGS_STORE, { key: SETTINGS_KEY, value: config, modifiedAt: pkg.createdAt });
      }
      await prune();
      const external = safety
        ? [{ key: 'internal', label: 'Archivio app', ok: true, message: 'backup sicurezza' }]
        : await deliverExternal(archive, reason);
      archive.deliveries = external;
      archive.deliveryUpdatedAt = new Date().toISOString();
      await backupPut(ARCHIVE_STORE, archive);
      await renderHistory();
      const deliveryText = external.map((item) => `${item.label} ${item.ok ? '✓' : '✗'}${item.ok ? '' : ` ${item.message}`}`).join(' · ');
      setStatus(`Backup OK · ${archive.filename}\n${humanBytes(archive.size)} · ${archive.recordCount} record · SHA-256 verificato${deliveryText ? `\n${deliveryText}` : ''}`);
      setAppStatus('backup completato');
      return archive;
    } catch (err) {
      console.error('Backup Agenda iPad', err);
      setStatus(`Backup non riuscito: ${err.message || err}`);
      setAppStatus('errore backup');
      return null;
    } finally {
      running = false;
    }
  }

  async function verifyLatest() {
    const latest = await getLatest();
    if (!latest) { setStatus('Nessun backup da verificare.'); return; }
    setStatus('Verifica in corso…');
    try {
      const result = await verifyBackupBlob(latest.blob);
      const whole = await sha256Hex(latest.blob);
      if (latest.sha256 && whole !== latest.sha256) throw new Error('Checksum dell’archivio completo non valido');
      setStatus(`Backup integro ✓\n${latest.filename}\n${result.pages.count ?? result.pages.records?.length ?? 0} record · formato ${result.manifest.formatVersion}`);
    } catch (err) { setStatus(`Backup NON valido: ${err.message}`); }
  }

  async function renderHistory() {
    if (!history) return;
    const rows = await listArchives().catch(() => []);
    if (!rows.length) { history.innerHTML = '<div class="backup-empty">Nessun backup ancora archiviato.</div>'; return; }
    history.innerHTML = rows.slice(0, 12).map((row) => `
      <div class="backup-item" data-backup-id="${row.id.replace(/"/g, '&quot;')}">
        <div class="backup-item-main"><strong>${row.filename}</strong><small>${new Date(row.createdAt).toLocaleString('it-IT')} · ${humanBytes(row.size)} · ${row.recordCount} record · ${row.reason}</small><div class="delivery-badges">${(row.deliveries || [{label:'Archivio app',ok:true}]).map((d) => `<span class="delivery-badge ${d.ok ? 'ok' : 'fail'}" title="${String(d.message || '').replace(/"/g,'&quot;')}">${d.label} ${d.ok ? '✓' : '✗'}</span>`).join('')}</div></div>
        <div class="backup-item-actions"><button type="button" data-backup-export="1">Esporta</button><button type="button" data-backup-delete="1">Elimina</button></div>
      </div>`).join('');
  }

  async function openSettings() {
    await loadConfig();
    googleAuth.preload().catch(() => {});
    panel.hidden = false;
    settingsButton.setAttribute('aria-expanded', 'true');
    const next = dueAt(config);
    const nextText = config.frequency === 'off' ? 'Backup automatico disattivato.' : `Prossima scadenza: ${next.getTime() <= Date.now() ? 'adesso' : next.toLocaleString('it-IT')}`;
    setStatus(authCallbackMessage || (config.lastBackupAt ? `Ultimo backup: ${new Date(config.lastBackupAt).toLocaleString('it-IT')}\n${nextText}` : `Nessun backup automatico precedente.\n${nextText}`));
    authCallbackMessage = '';
  }

  function closeSettings() {
    panel.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
    saveConfig().catch(() => {});
  }

  async function chooseFolder() {
    if (!window.showDirectoryPicker) return;
    try {
      directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await backupPut(SETTINGS_STORE, { key: DIRECTORY_KEY, handle: directoryHandle, modifiedAt: new Date().toISOString() });
      localStatus.textContent = `Cartella selezionata: ${directoryHandle.name || 'locale'}`;
      destLocal.checked = true;
      await saveConfig();
    } catch (err) {
      if (err?.name !== 'AbortError') setStatus(`Cartella locale: ${err.message}`);
    }
  }

  async function exportArchiveById(id) {
    const archive = await backupGet(ARCHIVE_STORE, id);
    if (!archive) throw new Error('Backup non trovato');
    await downloadOrShare(archive);
  }

  async function restoreFromFile(file, mode = 'local') {
    if (!file) return;
    const globalRestore = mode === 'group';
    setStatus(globalRestore ? 'Verifica backup per ripristino globale…' : 'Verifica backup da ripristinare…');
    try {
      const parsed = await verifyBackupBlob(file);
      const records = parsed.pages?.records;
      if (!Array.isArray(records)) throw new Error('Archivio senza records pagina');
      if (globalRestore) {
        const warning = window.confirm(
          `ATTENZIONE: RIPRISTINO DI TUTTO IL GRUPPO\n\n` +
          `Il backup ${file.name} diventerà lo stato autorevole per TUTTI i dispositivi sincronizzati.\n` +
          `Le modifiche successive al backup verranno escluse dalla nuova generazione del gruppo.\n\n` +
          `Verrà creato prima un backup di sicurezza dello stato corrente.\n\nContinuare?`
        );
        if (!warning) return;
        const typed = window.prompt('Conferma operazione distruttiva: scrivi esattamente RIPRISTINA GRUPPO');
        if (String(typed || '').trim() !== 'RIPRISTINA GRUPPO') {
          setStatus('Ripristino globale annullato: conferma testuale non valida.');
          return;
        }
      } else {
        const ok = window.confirm(`Ripristinare ${records.length} record da ${file.name}?\n\nVerrà creato prima un backup di sicurezza dello stato corrente.`);
        if (!ok) return;
      }
      const safety = await createBackup(globalRestore ? 'pre-group-restore' : 'pre-restore', { safety: true });
      if (!safety) throw new Error('Backup di sicurezza pre-ripristino non riuscito');
      const details = { fileName: file.name, manifest: parsed.manifest, recordCount: records.length, restoreMode: globalRestore ? 'group' : 'local' };
      if (globalRestore) await beforeGlobalRestoreApplied(details);
      else await beforeRestoreApplied(details);
      await flushCurrent();
      await replaceMainRecords(mainDbName, mainStore, records);
      // Le credenziali e il gruppo Sync appartengono al dispositivo corrente, non allo snapshot.
      // I backup 0.1.58 e precedenti possono contenerli: vengono deliberatamente ignorati.
      restorePortablePreferences(parsed.preferences?.values || {});
      if (globalRestore) await afterGlobalRestoreApplied(details);
      else await afterRestoreApplied(details);
      setStatus(globalRestore
        ? 'Backup applicato localmente. Pubblicazione protetta come nuovo stato del gruppo al riavvio…'
        : 'Ripristino completato. Riallineamento Sync protetto al riavvio…');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      console.error(globalRestore ? 'Ripristino globale' : 'Ripristino', err);
      setStatus(`${globalRestore ? 'Ripristino globale' : 'Ripristino'} non riuscito: ${err.message || err}`);
    }
  }

  function scheduleDueCheck(reason = 'automatic') {
    clearTimeout(dueTimer);
    if (!config.backupOnStartup || config.frequency === 'off') return;
    const run = async () => {
      if (isRealtimeBusy() || Date.now() - lastActivity < 3500) { dueTimer = setTimeout(run, 2500); return; }
      if (dueAt(config).getTime() > Date.now()) return;
      await createBackup(reason);
    };
    dueTimer = setTimeout(run, 1800);
  }

  function bindAction(button, action) {
    if (!button) return;
    button.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;
      directActivations.set(button, performance.now());
      action(ev);
      ev.preventDefault(); ev.stopPropagation();
    }, { passive: false });
    button.addEventListener('touchstart', (ev) => {
      const last = directActivations.get(button);
      if (Number.isFinite(last) && performance.now() - last < 180) { ev.preventDefault(); return; }
      directActivations.set(button, performance.now());
      action(ev); ev.preventDefault(); ev.stopPropagation();
    }, { passive: false });
    button.addEventListener('click', (ev) => {
      const last = directActivations.get(button);
      if (Number.isFinite(last) && performance.now() - last < 650) { ev.preventDefault(); return; }
      action(ev);
    });
  }

  bindAction(googleConnect, async () => {
    try {
      await saveConfig();
      setStatus('Connessione Google Drive…');
      await googleAuth.connect({ prompt: 'consent' });
      destGoogle.checked = true; await saveConfig();
      await googleAuth.test();
      setStatus('Google Drive connesso ✓ · sessione pronta per i backup.');
    } catch (err) { setStatus(`Google Drive: ${err.message || err}`); }
  });
  bindAction(googleTest, async () => {
    try { setStatus('Test Google Drive…'); await googleAuth.test(); setStatus('Google Drive: connessione valida ✓'); }
    catch (err) { setStatus(`Google Drive: ${err.message || err}`); }
  });
  bindAction(googleDisconnect, async () => {
    await googleAuth.disconnect();
    setStatus('Google Drive disconnesso dalla sessione.');
  });

  bindAction(oneConnect, async () => {
    try {
      await saveConfig(); await flushCurrent();
      setStatus('Apertura accesso Microsoft…');
      await oneDriveAuth.beginConnect();
    } catch (err) { setStatus(`OneDrive: ${err.message || err}`); }
  });
  bindAction(oneTest, async () => {
    try { setStatus('Test OneDrive…'); await oneDriveAuth.test(); setStatus('OneDrive: connessione valida ✓'); }
    catch (err) { setStatus(`OneDrive: ${err.message || err}`); }
  });
  bindAction(oneDisconnect, () => {
    oneDriveAuth.disconnect();
    setStatus('OneDrive disconnesso dalla sessione.');
  });

  const saveFields = [frequency, customDays, retention, onStartup, verifyAfter, destLocal, destGoogle, destOneDrive, googleClientId, googleFolderId, googleFolderName, oneClientId, oneTenant, oneFolder];
  for (const field of saveFields) field?.addEventListener('change', () => saveConfig().catch(() => {}));
  frequency?.addEventListener('change', () => { customDaysField.hidden = frequency.value !== 'custom'; });

  bindAction(settingsButton, () => panel.hidden ? openSettings() : closeSettings());
  bindAction(closeButton, closeSettings);
  bindAction(chooseLocal, chooseFolder);
  bindAction(exportLatest, async () => { const latest = await getLatest(); latest ? downloadOrShare(latest).catch((e) => setStatus(e.message)) : setStatus('Nessun backup disponibile.'); });
  bindAction(backupNow, async () => { await saveConfig(); await createBackup('manual'); });
  bindAction(verifyButton, verifyLatest);
  bindAction(restoreButton, () => restoreInput.click());
  restoreInput?.addEventListener('change', () => { const file = restoreInput.files?.[0]; restoreInput.value = ''; restoreFromFile(file, 'local'); });
  bindAction(restoreGroupButton, () => restoreGroupInput.click());
  restoreGroupInput?.addEventListener('change', () => { const file = restoreGroupInput.files?.[0]; restoreGroupInput.value = ''; restoreFromFile(file, 'group'); });

  async function handleHistoryAction(ev) {
    const button = ev.target instanceof Element ? ev.target.closest('button') : null;
    const row = ev.target instanceof Element ? ev.target.closest('[data-backup-id]') : null;
    if (!button || !row) return;
    const id = row.dataset.backupId;
    if (button.dataset.backupExport) await exportArchiveById(id).catch((e) => setStatus(e.message));
    if (button.dataset.backupDelete) {
      if (!window.confirm('Eliminare questo backup dall’archivio locale dell’app?')) return;
      await backupDelete(ARCHIVE_STORE, id); await renderHistory();
    }
  }
  history?.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const button = ev.target instanceof Element ? ev.target.closest('button') : null;
    if (!button) return;
    directActivations.set(button, performance.now());
    handleHistoryAction(ev); ev.preventDefault(); ev.stopPropagation();
  }, { passive: false });
  history?.addEventListener('click', (ev) => {
    const button = ev.target instanceof Element ? ev.target.closest('button') : null;
    const last = button ? directActivations.get(button) : null;
    if (Number.isFinite(last) && performance.now() - last < 650) { ev.preventDefault(); return; }
    handleHistoryAction(ev);
  });
  window.addEventListener('pointerdown', () => { lastActivity = performance.now(); }, { capture: true, passive: true });
  window.addEventListener('touchstart', () => { lastActivity = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadConfig().then(() => scheduleDueCheck('automatic')).catch(() => {});
    }
  });

  loadConfig().then(async () => {
    try {
      const callback = await oneDriveAuth.completeRedirectIfPresent();
      if (callback.handled) {
        destOneDrive.checked = true;
        await saveConfig();
        await oneDriveAuth.test();
        authCallbackMessage = 'OneDrive connesso ✓ · sessione pronta per i backup.';
      }
      const openRequested = callback.openSettings || oneDriveAuth.consumeOpenSettingsRequest();
      if (callback.openSettings) oneDriveAuth.consumeOpenSettingsRequest();
      if (openRequested) setTimeout(() => openSettings().catch(() => {}), 80);
    } catch (err) {
      authCallbackMessage = `OneDrive: ${err.message || err}`;
      setTimeout(() => openSettings().catch(() => {}), 80);
    }
    scheduleDueCheck('automatic');
  }).catch((err) => console.warn('Backup foundation init', err));

  const cloudBridge = {
    async connectGoogle() { await saveConfig(); return googleAuth.connect({ prompt:'consent' }); },
    async testGoogle() { await saveConfig(); return googleAuth.test(); },
    async disconnectGoogle() { return googleAuth.disconnect(); },
    async connectOneDrive() { await saveConfig(); return oneDriveAuth.beginConnect(); },
    async testOneDrive() { await saveConfig(); return oneDriveAuth.test(); },
    disconnectOneDrive() { return oneDriveAuth.disconnect(); },
    getState() {
      return {
        googleConnected:Boolean(googleAuth.getAccessToken()),
        oneDriveConnected:Boolean(oneDriveAuth.getAccessToken()),
        googleExpiresAt:googleAuth.getExpiresAt(),
        oneDriveExpiresAt:oneDriveAuth.getExpiresAt()
      };
    },
    async uploadGoogle(blob, filename, folderName = 'Agenda iPad Registrazioni', contentType = blob?.type || 'application/octet-stream', signal = null) {
      const token = googleAuth.getAccessToken();
      if (!token) throw new Error('Google Drive non connesso in questa sessione');
      return uploadAudioGoogleDrive(blob, filename, token, folderName, contentType, signal);
    },
    async uploadOneDrive(blob, filename, folderPath = 'Agenda iPad Registrazioni', contentType = blob?.type || 'application/octet-stream', signal = null) {
      const token = oneDriveAuth.getAccessToken();
      if (!token) throw new Error('OneDrive non connesso in questa sessione');
      return uploadAudioOneDrive(blob, filename, token, folderPath, contentType, signal);
    },
    async ensureGoogleFolder(folderName = 'Agenda iPad Registrazioni', signal = null) {
      const token = googleAuth.getAccessToken();
      if (!token) throw new Error('Google Drive non connesso in questa sessione');
      return ensureGoogleFolder(token, '', folderName, signal);
    },
    async ensureOneDriveFolder(folderPath = 'Agenda iPad Registrazioni', signal = null) {
      const token = oneDriveAuth.getAccessToken();
      if (!token) throw new Error('OneDrive non connesso in questa sessione');
      return ensureOneDriveFolder(token, folderPath, signal);
    },
    async downloadGoogle(fileId, signal = null) { return downloadGoogleDriveFile(fileId, googleAuth.getAccessToken(), signal); },
    async downloadOneDrive(fileId, signal = null) { return downloadOneDriveFile(fileId, oneDriveAuth.getAccessToken(), signal); },
    async deleteGoogle(fileId, signal = null) { return deleteGoogleDriveFile(fileId, googleAuth.getAccessToken(), signal); },
    async deleteOneDrive(fileId, signal = null) { return deleteOneDriveFile(fileId, oneDriveAuth.getAccessToken(), signal); }
  };

  return { openSettings, closeSettings, createBackup, verifyLatest, scheduleDueCheck, cloudBridge };
}
