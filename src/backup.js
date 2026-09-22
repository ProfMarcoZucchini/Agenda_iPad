import { createGoogleDriveAuth, createOneDriveAuth } from './cloud-auth.js';
const BACKUP_DB_NAME = 'AgendaIPadBackupDB';
const BACKUP_DB_VERSION = 1;
const ARCHIVE_STORE = 'archives';
const SETTINGS_STORE = 'settings';
const SETTINGS_KEY = 'backup-config-v1';
const DIRECTORY_KEY = 'local-directory-handle-v1';
const BACKUP_FORMAT = 'agenda-ipad-backup';
const BACKUP_FORMAT_VERSION = 2;
const SUPPORTED_BACKUP_FORMAT_VERSIONS = new Set([1, 2]);
const LOCAL_IMAGE_CLIPBOARD_DB = 'AgendaIPadLocalImageClipboardDB';
const LOCAL_IMAGE_CLIPBOARD_STORE = 'clipboard';
const LOCAL_LASSO_CLIPBOARD_DB = 'AgendaIPadLocalLassoClipboardDB';
const LOCAL_LASSO_CLIPBOARD_STORE = 'clipboard';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ENCRYPTED_BACKUP_MAGIC = 'AGENDAIPADENC1\n';
const ENCRYPTED_BACKUP_FORMAT = 'agenda-ipad-encrypted-backup';
const BACKUP_KDF_ITERATIONS = 350000;
const NON_PORTABLE_PREFERENCE_KEYS = new Set([
  'agenda-ipad-cloud-sync-config-v1',
  'agenda-ipad-lan-sync-config-v1',
  'agenda-ipad-sync-restore-guard-v1',
  'agenda-ipad-lifecycle-journal-v1'
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
  lastBackupId: null,
  lastLocalSnapshotAt: null,
  lastLocalSnapshotId: null,
  lastDisasterSafeBackupAt: null,
  lastDisasterSafeBackupId: null,
  backupPassphrase: ''
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
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

async function backupPut(store, value) {
  const db = await openBackupDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Backup DB transaction aborted'));
    });
  } finally { db.close(); }
}

async function backupDelete(store, key) {
  const db = await openBackupDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function listArchives() {
  const db = await openBackupDb();
  try {
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE, 'readonly');
      const req = tx.objectStore(ARCHIVE_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } finally { db.close(); }
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


async function readStoreRecords(dbName, storeName) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName, { keyPath:'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (!db.objectStoreNames.contains(storeName)) return [];
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

async function replaceStoreRecords(dbName, storeName, records = []) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName, { keyPath:'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (!db.objectStoreNames.contains(storeName)) throw new Error(`Archivio locale ${dbName}/${storeName} non disponibile`);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of Array.isArray(records) ? records : []) store.put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error(`Ripristino ${dbName}/${storeName} annullato`));
    });
  } finally { db.close(); }
}

async function collectLocalClipboards() {
  return {
    schemaVersion: 1,
    image: await readStoreRecords(LOCAL_IMAGE_CLIPBOARD_DB, LOCAL_IMAGE_CLIPBOARD_STORE).catch(() => []),
    lasso: await readStoreRecords(LOCAL_LASSO_CLIPBOARD_DB, LOCAL_LASSO_CLIPBOARD_STORE).catch(() => [])
  };
}

async function restoreLocalClipboards(snapshot) {
  if (!snapshot || Number(snapshot.schemaVersion) !== 1) return;
  await replaceStoreRecords(LOCAL_IMAGE_CLIPBOARD_DB, LOCAL_IMAGE_CLIPBOARD_STORE, snapshot.image || []);
  await replaceStoreRecords(LOCAL_LASSO_CLIPBOARD_DB, LOCAL_LASSO_CLIPBOARD_STORE, snapshot.lasso || []);
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
  const desired = new Map(Object.entries(preferences).filter(([key]) => isPortablePreferenceKey(key)));
  try {
    const removable = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (isPortablePreferenceKey(key) && !desired.has(key)) removable.push(key);
    }
    for (const key of removable) localStorage.removeItem(key);
  } catch {}
  for (const [key, value] of desired) {
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


function b64urlEncodeBytes(bytes) {
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+chunk)));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecodeBytes(value) {
  const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=text + '='.repeat((4-text.length%4)%4);
  const binary=atob(padded); const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) out[i]=binary.charCodeAt(i);
  return out;
}
async function deriveBackupEncryptionKey(passphrase, salt, iterations = BACKUP_KDF_ITERATIONS) {
  if (String(passphrase||'').length < 8) throw new Error('Password backup troppo corta: minimo 8 caratteri');
  const base=await crypto.subtle.importKey('raw', encoder.encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'}, base, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
async function isEncryptedBackupBlob(blob) {
  if (!(blob instanceof Blob) || blob.size < ENCRYPTED_BACKUP_MAGIC.length + 4) return false;
  const prefix=decoder.decode(new Uint8Array(await blob.slice(0, ENCRYPTED_BACKUP_MAGIC.length).arrayBuffer()));
  return prefix === ENCRYPTED_BACKUP_MAGIC;
}
async function encryptBackupBlob(zipBlob, passphrase) {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const header={format:ENCRYPTED_BACKUP_FORMAT,version:1,kdf:'PBKDF2-SHA256',iterations:BACKUP_KDF_ITERATIONS,salt:b64urlEncodeBytes(salt),iv:b64urlEncodeBytes(iv),cipher:'AES-256-GCM',innerType:'application/zip'};
  const headerBytes=encoder.encode(JSON.stringify(header));
  const key=await deriveBackupEncryptionKey(passphrase,salt,header.iterations);
  const plaintext=await zipBlob.arrayBuffer();
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:headerBytes},key,plaintext));
  const len=new Uint8Array(4); new DataView(len.buffer).setUint32(0,headerBytes.length,true);
  return new Blob([encoder.encode(ENCRYPTED_BACKUP_MAGIC),len,headerBytes,ciphertext],{type:'application/vnd.agenda-ipad.encrypted-backup'});
}
async function decryptBackupBlob(blob, passphrase) {
  if (!(await isEncryptedBackupBlob(blob))) return blob;
  const all=new Uint8Array(await blob.arrayBuffer());
  const magicLen=encoder.encode(ENCRYPTED_BACKUP_MAGIC).length;
  const view=new DataView(all.buffer,all.byteOffset,all.byteLength);
  const headerLen=view.getUint32(magicLen,true);
  const headerStart=magicLen+4, headerEnd=headerStart+headerLen;
  if (headerEnd>=all.length) throw new Error('Header backup cifrato non valido');
  const headerBytes=all.slice(headerStart,headerEnd);
  const header=JSON.parse(decoder.decode(headerBytes));
  if(header?.format!==ENCRYPTED_BACKUP_FORMAT || Number(header?.version)!==1) throw new Error('Formato backup cifrato non compatibile');
  const salt=b64urlDecodeBytes(header.salt), iv=b64urlDecodeBytes(header.iv);
  const key=await deriveBackupEncryptionKey(passphrase,salt,Number(header.iterations)||BACKUP_KDF_ITERATIONS);
  let plain;
  try { plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:headerBytes},key,all.slice(headerEnd)); }
  catch { throw new Error('Password backup non corretta oppure archivio cifrato alterato'); }
  return new Blob([plain],{type:'application/zip'});
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


function audioExtensionForMime(mimeType = '') {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  return 'audio';
}

async function prepareAudioBackup(audioSnapshot) {
  if (!audioSnapshot) return { index:null, entries:[], count:0, bytes:0 };
  if (Number(audioSnapshot.schemaVersion) !== 1 || !Array.isArray(audioSnapshot.recordings)) throw new Error('Snapshot audio non compatibile');
  const entries = [];
  const recordings = [];
  let totalBytes = 0;
  for (const item of audioSnapshot.recordings) {
    const blob = item?.blob;
    const metadata = item?.metadata && typeof item.metadata === 'object' ? structuredClone(item.metadata) : null;
    if (!metadata || !(blob instanceof Blob) || !blob.size) throw new Error('Backup audio incompleto: registrazione senza file');
    const id = String(metadata.id || crypto.randomUUID?.() || `audio-${recordings.length + 1}`).replace(/[^A-Za-z0-9._-]/g, '_');
    const mimeType = String(metadata.mimeType || blob.type || 'application/octet-stream');
    const path = `media/audio/${id}.${audioExtensionForMime(mimeType)}`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    totalBytes += bytes.length;
    entries.push({ name:path, bytes });
    delete metadata.blob;
    recordings.push({ ...metadata, mediaPath:path, mimeType, size:bytes.length });
  }
  return {
    index: { schemaVersion:1, settings:Array.isArray(audioSnapshot.settings) ? audioSnapshot.settings : [], recordings },
    entries,
    count:recordings.length,
    bytes:totalBytes
  };
}

function hydrateAudioBackup(index, files) {
  if (!index) return null;
  if (Number(index.schemaVersion) !== 1 || !Array.isArray(index.recordings)) throw new Error('Indice audio del backup non compatibile');
  return {
    schemaVersion:1,
    settings:Array.isArray(index.settings) ? index.settings : [],
    recordings:index.recordings.map((metadata) => {
      const mediaPath = String(metadata?.mediaPath || '');
      const bytes = files.get(mediaPath);
      if (!mediaPath || !bytes) throw new Error(`File audio mancante: ${mediaPath || '?'}`);
      const clean = { ...metadata };
      delete clean.mediaPath;
      return { metadata:clean, blob:new Blob([bytes], { type:String(metadata.mimeType || 'application/octet-stream') }) };
    })
  };
}

function backupFileName(appVersion, createdAt) {
  const stamp = createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `Agenda_iPad_FULL_${stamp}_app-${appVersion}_fmt-${BACKUP_FORMAT_VERSION}.zip`;
}

function encryptedBackupFileName(zipName) { return String(zipName || 'Agenda_iPad_FULL.zip').replace(/\.zip$/i,'.agendaipadbackup'); }

async function makeBackupPackage({ appVersion, records, preferences, config, secureVault = null, audioSnapshot = null, clipboards = null }) {
  const createdAt = new Date().toISOString();
  const media = extractMediaFromRecords(records);
  const audio = await prepareAudioBackup(audioSnapshot);
  const pagesBytes = jsonBytes({ schemaVersion: 2, count: media.portableRecords.length, records: media.portableRecords });
  const prefBytes = jsonBytes({ schemaVersion: 1, values: preferences });
  const mediaBytes = jsonBytes({ schemaVersion: 2, items: [...media.mediaItems, ...(audio.index?.recordings || []).map((row) => ({ type:'audio', path:row.mediaPath, mimeType:row.mimeType, pageKey:row.pageKey || null, name:row.name || row.filename || null, size:row.size || 0 }))], layoutVersion: 2 });
  const secureVaultBytes = secureVault ? jsonBytes(secureVault) : null;
  const audioIndexBytes = audio.index ? jsonBytes(audio.index) : null;
  const clipboardBytes = jsonBytes(clipboards || { schemaVersion:1, image:[], lasso:[] });
  const safeConfig = {
    frequency: config.frequency, customDays: config.customDays, retention: config.retention,
    backupOnStartup:Boolean(config.backupOnStartup), verifyAfterBackup:Boolean(config.verifyAfterBackup),
    destinations: config.destinations,
    google: { clientId: config.google.clientId, folderId: config.google.folderId, folderName:config.google.folderName || 'Agenda iPad Backups' },
    oneDrive: { clientId: config.oneDrive.clientId, tenant: config.oneDrive.tenant, folder: config.oneDrive.folder }
  };
  const manifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    createdBy: { app: 'Agenda iPad', appVersion, platform: 'PWA' },
    reader: { minFormatVersion: 1 },
    backup: { type: 'full-state', immutable: true, recordCount: records.length, audioCount: audio.count, audioBytes:audio.bytes },
    collections: [
      { id: 'pages', path: 'data/pages.json', encoding: 'json', schemaVersion: 2 },
      { id: 'preferences', path: 'data/preferences.json', encoding: 'json', schemaVersion: 1 },
      { id: 'media', path: 'media/index.json', encoding: 'json-index', schemaVersion: 2, extensible: true },
      { id: 'local-clipboards', path: 'data/local-clipboards.json', encoding: 'json', schemaVersion: 1 },
      ...(audioIndexBytes ? [{ id:'audio', path:'data/audio.json', encoding:'json-index', schemaVersion:1, completeFiles:true }] : []),
      ...(secureVaultBytes ? [{ id: 'password-vault', path: 'data/password-vault.json', encoding: 'json-encrypted-envelope', schemaVersion: 1, encrypted: true }] : [])
    ],
    mediaLayout: { images: 'media/images/', audio: 'media/audio/', video: 'media/video/', attachments: 'media/attachments/' },
    backupSettingsSnapshot: safeConfig,
    restoreNotes: {
      appBinaryIncluded:false,
      biometricCredentialPortable:false,
      oauthSessionsPortable:false,
      syncCredentialsPortable:false
    },
    checksumAlgorithm: 'SHA-256'
  };
  const manifestBytes = jsonBytes(manifest);
  const checksumFiles = {
    'manifest.json': await sha256Hex(manifestBytes),
    'data/pages.json': await sha256Hex(pagesBytes),
    'data/preferences.json': await sha256Hex(prefBytes),
    'media/index.json': await sha256Hex(mediaBytes),
    'data/local-clipboards.json': await sha256Hex(clipboardBytes),
    ...(audioIndexBytes ? { 'data/audio.json': await sha256Hex(audioIndexBytes) } : {}),
    ...(secureVaultBytes ? { 'data/password-vault.json': await sha256Hex(secureVaultBytes) } : {})
  };
  for (const entry of [...media.mediaEntries, ...audio.entries]) checksumFiles[entry.name] = await sha256Hex(entry.bytes);
  const checksums = { algorithm: 'SHA-256', files: checksumFiles };
  const checksumBytes = jsonBytes(checksums);
  const blob = storedZip([
    { name: 'manifest.json', bytes: manifestBytes },
    { name: 'checksums.json', bytes: checksumBytes },
    { name: 'data/pages.json', bytes: pagesBytes },
    { name: 'data/preferences.json', bytes: prefBytes },
    { name: 'media/index.json', bytes: mediaBytes },
    { name: 'data/local-clipboards.json', bytes: clipboardBytes },
    ...(audioIndexBytes ? [{ name:'data/audio.json', bytes:audioIndexBytes }] : []),
    ...(secureVaultBytes ? [{ name: 'data/password-vault.json', bytes: secureVaultBytes }] : []),
    ...media.mediaEntries,
    ...audio.entries
  ]);
  return { createdAt, filename: backupFileName(appVersion, createdAt), blob, manifest, checksums, audioCount:audio.count };
}

async function verifyBackupBlob(blob, passphrase = '') {
  const zipBlob = await decryptBackupBlob(blob, passphrase);
  const files = await parseStoredZip(zipBlob);
  const manifest = parseJsonBytes(files.get('manifest.json'), 'manifest.json');
  const formatVersion = Number(manifest.formatVersion);
  if (manifest.format !== BACKUP_FORMAT || !SUPPORTED_BACKUP_FORMAT_VERSIONS.has(formatVersion)) {
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
  const passwordVault = files.has('data/password-vault.json')
    ? parseJsonBytes(files.get('data/password-vault.json'), 'data/password-vault.json')
    : null;
  if (passwordVault && passwordVault.encrypted !== true) throw new Error('Rubrica Password del backup non risulta cifrata');
  if (Array.isArray(pages.records)) pages.records = hydrateMediaIntoRecords(pages.records, files);
  const audioIndex = files.has('data/audio.json') ? parseJsonBytes(files.get('data/audio.json'), 'data/audio.json') : null;
  const audioBackup = audioIndex ? hydrateAudioBackup(audioIndex, files) : null;
  const clipboards = files.has('data/local-clipboards.json')
    ? parseJsonBytes(files.get('data/local-clipboards.json'), 'data/local-clipboards.json')
    : { schemaVersion:1, image:[], lasso:[] };
  return { manifest, pages, preferences, passwordVault, audioBackup, clipboards, files, formatVersion };
}

function dueAt(config) {
  const lastStamp = config.lastLocalSnapshotAt || config.lastBackupAt;
  if (!lastStamp) return new Date(0);
  const last = new Date(lastStamp);
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

async function listGoogleDriveBackups(token, folderId, folderName = 'Agenda iPad Backups', signal = null) {
  if (!token) throw new Error('Sessione Google Drive non connessa');
  const resolvedFolderId = await ensureGoogleFolder(token, folderId, folderName, signal);
  const q = `'${resolvedFolderId.replace(/'/g, "\'")}' in parents and trashed=false`;
  const params = new URLSearchParams({ q, fields:'files(id,name,size,modifiedTime,mimeType)', orderBy:'modifiedTime desc', pageSize:'1000' });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { headers:{ Authorization:`Bearer ${token}` }, signal });
  if (!response.ok) throw new Error(`Google Drive elenco backup: HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.files || []).filter((row) => /\.(zip|agendaipadbackup)$/i.test(String(row?.name || ''))).map((row) => ({ provider:'google', id:String(row.id || ''), name:String(row.name || ''), size:Number(row.size)||0, modifiedAt:String(row.modifiedTime || '') }));
}

async function listOneDriveBackups(token, folderPath, signal = null) {
  if (!token) throw new Error('Sessione OneDrive non connessa');
  const folderId = await ensureOneDriveFolder(token, folderPath, signal);
  const params = new URLSearchParams({ '$select':'id,name,size,lastModifiedDateTime,file', '$top':'999', '$orderby':'lastModifiedDateTime desc' });
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children?${params.toString()}`, { headers:{ Authorization:`Bearer ${token}` }, signal });
  if (!response.ok) throw new Error(`OneDrive elenco backup: HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.value || []).filter((row) => /\.(zip|agendaipadbackup)$/i.test(String(row?.name || ''))).map((row) => ({ provider:'onedrive', id:String(row.id || ''), name:String(row.name || ''), size:Number(row.size)||0, modifiedAt:String(row.lastModifiedDateTime || '') }));
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
    afterRestoreRollback = async () => {},
    beforeGlobalRestoreApplied = async () => {}, afterGlobalRestoreApplied = async () => {},
    getSecurePasswordVaultBackup = async () => null, restoreSecurePasswordVaultBackup = async () => ({ restored: 0 })
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
  const backupPassphraseInput = document.getElementById('backupEncryptionPassphrase');
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
  const importButton = document.getElementById('importBackupButton');
  const importInput = document.getElementById('importBackupInput');
  const restoreGroupButton = document.getElementById('restoreGroupBackupButton');
  const status = document.getElementById('backupStatus');
  const history = document.getElementById('backupHistory');
  const refreshRemoteBackupsButton = document.getElementById('refreshRemoteBackupsButton');
  const remoteBackupStatus = document.getElementById('remoteBackupStatus');
  const remoteBackupList = document.getElementById('remoteBackupList');

  let config = cloneConfig();
  let directoryHandle = null;
  let running = false;
  let lastActivity = performance.now();
  let dueTimer = 0;
  let authCallbackMessage = '';
  let audioProvider = null;
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
    if (backupPassphraseInput) backupPassphraseInput.value = config.backupPassphrase || '';
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
    if (backupPassphraseInput) config.backupPassphrase = String(backupPassphraseInput.value || '');
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

  async function deleteExternalCopies(row) {
    for (const delivery of (row?.deliveries || [])) {
      if (!delivery?.ok) continue;
      try {
        if (delivery.key === 'local' && directoryHandle?.removeEntry && row?.filename) {
          await directoryHandle.removeEntry(row.filename).catch(() => {});
        } else if (delivery.key === 'google' && delivery.remoteId && googleAuth.getAccessToken()) {
          await deleteGoogleDriveFile(delivery.remoteId, googleAuth.getAccessToken());
        } else if (delivery.key === 'onedrive' && delivery.remoteId && oneDriveAuth.getAccessToken()) {
          await deleteOneDriveFile(delivery.remoteId, oneDriveAuth.getAccessToken());
        }
      } catch (err) {
        console.warn('Retention backup remoto non riuscita', delivery.key, err);
      }
    }
  }

  async function prune() {
    const rows = await listArchives();
    const keep = Math.max(3, Number(config.retention) || 30);
    for (const row of rows.slice(keep)) {
      await deleteExternalCopies(row);
      await backupDelete(ARCHIVE_STORE, row.id);
    }
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
      try { await writeLocalFolder(archive); results.push({ key: 'local', label: 'Cartella locale', ok: true, message: 'salvato', remoteName:archive.filename }); }
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
        const uploaded = await uploadGoogleDrive(archive.blob, archive.filename, token, folderId, config.google.folderName);
        results.push({ key: 'google', label: 'Google Drive', ok: true, message: 'caricato', remoteId:String(uploaded?.id || ''), remoteName:String(uploaded?.name || archive.filename) });
      } catch (err) { results.push({ key: 'google', label: 'Google Drive', ok: false, message: err.message }); }
    }
    if (config.destinations.oneDrive) {
      try {
        const token = oneDriveAuth.getAccessToken();
        if (!token) throw new Error('sessione non connessa: premi Connetti');
        const uploaded = await uploadOneDrive(archive.blob, archive.filename, token, config.oneDrive.folder);
        results.push({ key: 'onedrive', label: 'OneDrive', ok: true, message: 'caricato', remoteId:String(uploaded?.id || ''), remoteName:String(uploaded?.name || archive.filename) });
      } catch (err) { results.push({ key: 'onedrive', label: 'OneDrive', ok: false, message: err.message }); }
    }
    return results;
  }

  async function requireBackupPassphrase({ allowPrompt = true } = {}) {
    let passphrase=String(backupPassphraseInput?.value || config.backupPassphrase || '');
    if(passphrase.length >= 8) return passphrase;
    if(!allowPrompt) throw new Error('Configura una password backup di almeno 8 caratteri prima di usare il backup automatico');
    const entered=window.prompt('Imposta/Inserisci la password dei backup cifrati (minimo 8 caratteri). Conservala fuori dall’iPad.');
    passphrase=String(entered || '');
    if(passphrase.length < 8) throw new Error('Password backup obbligatoria: minimo 8 caratteri');
    config.backupPassphrase=passphrase;
    if(backupPassphraseInput) backupPassphraseInput.value=passphrase;
    await backupPut(SETTINGS_STORE,{key:SETTINGS_KEY,value:config,modifiedAt:new Date().toISOString()});
    return passphrase;
  }

  async function verifyArchiveWithPassphrase(blob, { allowPrompt = true } = {}) {
    if (!(await isEncryptedBackupBlob(blob))) return verifyBackupBlob(blob, '');
    let passphrase=String(backupPassphraseInput?.value || config.backupPassphrase || '');
    for(let attempt=0;attempt<3;attempt++) {
      if(passphrase.length < 8) {
        if(!allowPrompt) throw new Error('Password backup richiesta');
        passphrase=String(window.prompt('Password del backup cifrato:') || '');
      }
      try {
        const parsed=await verifyBackupBlob(blob,passphrase);
        if(passphrase.length>=8 && passphrase!==config.backupPassphrase) {
          config.backupPassphrase=passphrase;
          if(backupPassphraseInput) backupPassphraseInput.value=passphrase;
          await backupPut(SETTINGS_STORE,{key:SETTINGS_KEY,value:config,modifiedAt:new Date().toISOString()});
        }
        return parsed;
      } catch(err) {
        if(!String(err?.message||'').includes('Password backup')) throw err;
        passphrase='';
        if(attempt===2) throw err;
      }
    }
    throw new Error('Password backup non valida');
  }

  async function ensureStorageCapacity(requiredBytes, operation = 'operazione') {
    if (!navigator?.storage?.estimate) return { supported:false };
    const estimate = await navigator.storage.estimate().catch(() => null);
    if (!estimate || !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return { supported:false };
    const free = Math.max(0, estimate.quota - estimate.usage);
    const required = Math.max(0, Number(requiredBytes) || 0);
    const reserve = Math.max(32 * 1024 * 1024, Math.ceil(required * 0.35));
    const needed = required + reserve;
    if (free < needed) {
      throw new Error(`${operation}: spazio locale insufficiente. Disponibili ${humanBytes(free)}, richiesti circa ${humanBytes(needed)} (incluso margine di sicurezza).`);
    }
    return { supported:true, free, required, reserve, quota:estimate.quota, usage:estimate.usage };
  }

  function estimateBackupPayloadBytes({ records, preferences, secureVault, audioSnapshot, clipboards }) {
    let bytes = 0;
    try { bytes += new Blob([JSON.stringify(records || [])]).size; } catch {}
    try { bytes += new Blob([JSON.stringify(preferences || {})]).size; } catch {}
    try { bytes += new Blob([JSON.stringify(secureVault || {})]).size; } catch {}
    try { bytes += new Blob([JSON.stringify(clipboards || {})]).size; } catch {}
    for (const item of audioSnapshot?.recordings || []) bytes += Math.max(0, Number(item?.blob?.size) || Number(item?.metadata?.size) || 0);
    // Manifest, checksums, metadati e cifratura aggiungono poco rispetto ai media;
    // il 15% evita una sottostima senza duplicare il margine di quota applicato sopra.
    return Math.ceil(bytes * 1.15) + (2 * 1024 * 1024);
  }

  async function createBackup(reason = 'manual', { safety = false } = {}) {
    if (running) return null;
    if (isRealtimeBusy()) {
      setStatus('Backup rinviato: termina prima scrittura, registrazione o altra operazione realtime.');
      return null;
    }
    if (!audioProvider?.exportBackup) {
      setStatus('Backup non disponibile: archivio audio non ancora inizializzato.');
      return null;
    }
    running = true;
    setStatus(`Backup ${reason === 'automatic' ? 'automatico' : 'manuale'} in corso…`);
    setAppStatus('backup in corso');
    try {
      const backupPassphrase = await requireBackupPassphrase({ allowPrompt: reason !== 'automatic' });
      await flushCurrent();
      const records = await readMainRecords(mainDbName, mainStore);
      const preferences = collectPortablePreferences();
      const secureVault = await getSecurePasswordVaultBackup();
      const clipboards = await collectLocalClipboards();
      const audioSnapshot = await audioProvider.exportBackup();
      const estimatedBytes = estimateBackupPayloadBytes({ records, preferences, secureVault, audioSnapshot, clipboards });
      await ensureStorageCapacity(estimatedBytes, 'Creazione backup');
      const pkg = await makeBackupPackage({ appVersion, records, preferences, config, secureVault, audioSnapshot, clipboards });
      const encryptedBlob = await encryptBackupBlob(pkg.blob, backupPassphrase);
      if (config.verifyAfterBackup) await verifyBackupBlob(encryptedBlob, backupPassphrase);
      const zipHash = await sha256Hex(encryptedBlob);
      const id = `${pkg.createdAt}::${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      const archive = {
        id, filename: encryptedBackupFileName(pkg.filename), createdAt: pkg.createdAt, size: encryptedBlob.size,
        sha256: zipHash, recordCount: records.length, audioCount:pkg.audioCount || 0, formatVersion: BACKUP_FORMAT_VERSION,
        encrypted:true, encryption:'AES-256-GCM', reason: safety ? 'pre-restore' : reason, appVersion, blob: encryptedBlob
      };
      await backupPut(ARCHIVE_STORE, archive);
      if (!safety) {
        config.lastLocalSnapshotAt = pkg.createdAt;
        config.lastLocalSnapshotId = id;
        config.lastBackupAt = pkg.createdAt;
        config.lastBackupId = id;
        await backupPut(SETTINGS_STORE, { key: SETTINGS_KEY, value: config, modifiedAt: pkg.createdAt });
      }
      await prune();
      const external = safety
        ? [{ key: 'internal', label: 'Archivio app', ok: true, message: 'backup sicurezza' }]
        : await deliverExternal(archive, reason);
      if (!safety) {
        const disasterSafe = external.some((item) => item?.ok && ['local','google','onedrive'].includes(String(item?.key || '')));
        if (disasterSafe) {
          config.lastDisasterSafeBackupAt = pkg.createdAt;
          config.lastDisasterSafeBackupId = id;
        }
        await backupPut(SETTINGS_STORE, { key: SETTINGS_KEY, value: config, modifiedAt: new Date().toISOString() });
      }
      archive.deliveries = external;
      archive.deliveryUpdatedAt = new Date().toISOString();
      await backupPut(ARCHIVE_STORE, archive);
      await renderHistory();
      const deliveryText = external.map((item) => `${item.label} ${item.ok ? '✓' : '✗'}${item.ok ? '' : ` ${item.message}`}`).join(' · ');
      setStatus(`Backup OK · ${archive.filename}\n${humanBytes(archive.size)} · ${archive.recordCount} record · ${archive.audioCount || 0} audio · SHA-256 verificato${deliveryText ? `\n${deliveryText}` : ''}`);
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
      const result = await verifyArchiveWithPassphrase(latest.blob);
      const whole = await sha256Hex(latest.blob);
      if (latest.sha256 && whole !== latest.sha256) throw new Error('Checksum dell’archivio completo non valido');
      setStatus(`Backup integro ✓\n${latest.filename}\n${result.pages.count ?? result.pages.records?.length ?? 0} record · formato ${result.manifest.formatVersion}`);
    } catch (err) { setStatus(`Backup NON valido: ${err.message}`); }
  }

  async function renderHistory() {
    if (!history) return;
    const rows = await listArchives().catch(() => []);
    history.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'backup-empty';
      empty.textContent = 'Nessun backup ancora archiviato.';
      history.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'backup-item';
      item.dataset.backupId = String(row.id || '');

      const main = document.createElement('div');
      main.className = 'backup-item-main';
      const title = document.createElement('strong');
      title.textContent = String(row.filename || 'Backup senza nome');
      const meta = document.createElement('small');
      meta.textContent = `${new Date(row.createdAt).toLocaleString('it-IT')} · ${humanBytes(row.size)} · ${Number(row.recordCount) || 0} record · ${Number(row.audioCount) || 0} audio · ${String(row.reason || '')}`;
      const badges = document.createElement('div');
      badges.className = 'delivery-badges';
      for (const delivery of (row.deliveries || [{label:'Archivio app',ok:true}])) {
        const badge = document.createElement('span');
        badge.className = `delivery-badge ${delivery?.ok ? 'ok' : 'fail'}`;
        badge.title = String(delivery?.message || '');
        badge.textContent = `${String(delivery?.label || 'Destinazione')} ${delivery?.ok ? '✓' : '✗'}`;
        badges.appendChild(badge);
      }
      main.append(title, meta, badges);

      const actions = document.createElement('div');
      actions.className = 'backup-item-actions';
      for (const [key, label] of [['restore','Ripristina'], ['export','Esporta'], ['delete','Elimina']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset[`backup${key[0].toUpperCase()}${key.slice(1)}`] = '1';
        button.textContent = label;
        actions.appendChild(button);
      }
      item.append(main, actions);
      history.appendChild(item);
    }
  }

  function renderRemoteBackups(rows = []) {
    if (!remoteBackupList) return;
    remoteBackupList.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('div'); empty.className='backup-empty'; empty.textContent='Nessun backup remoto trovato nelle destinazioni connesse.'; remoteBackupList.appendChild(empty); return;
    }
    for (const row of rows.sort((a,b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)))) {
      const item=document.createElement('div'); item.className='backup-item';
      const main=document.createElement('div'); main.className='backup-item-main';
      const title=document.createElement('strong'); title.textContent=row.name || 'Backup remoto';
      const meta=document.createElement('small'); meta.textContent=`${row.provider === 'google' ? 'Google Drive' : 'OneDrive'} · ${row.modifiedAt ? new Date(row.modifiedAt).toLocaleString('it-IT') : ''} · ${humanBytes(row.size)}`;
      main.append(title,meta);
      const actions=document.createElement('div'); actions.className='backup-item-actions';
      const button=document.createElement('button'); button.type='button'; button.textContent='Importa'; button.dataset.remoteBackupImport='1'; button.dataset.remoteProvider=row.provider; button.dataset.remoteId=row.id; button.dataset.remoteName=row.name;
      actions.appendChild(button); item.append(main,actions); remoteBackupList.appendChild(item);
    }
  }

  async function refreshRemoteBackups() {
    if (remoteBackupStatus) remoteBackupStatus.textContent='Caricamento backup remoti…';
    const rows=[]; const errors=[];
    if (config.destinations.googleDrive || googleAuth.getAccessToken()) {
      try { rows.push(...await listGoogleDriveBackups(googleAuth.getAccessToken(), config.google.folderId, config.google.folderName)); }
      catch (err) { errors.push(`Google: ${err.message || err}`); }
    }
    if (config.destinations.oneDrive || oneDriveAuth.getAccessToken()) {
      try { rows.push(...await listOneDriveBackups(oneDriveAuth.getAccessToken(), config.oneDrive.folder)); }
      catch (err) { errors.push(`OneDrive: ${err.message || err}`); }
    }
    renderRemoteBackups(rows);
    if (remoteBackupStatus) remoteBackupStatus.textContent=`${rows.length} backup remoti${errors.length ? ` · ${errors.join(' · ')}` : ''}`;
  }

  async function importRemoteBackup(button) {
    const provider=button?.dataset?.remoteProvider; const id=button?.dataset?.remoteId; const name=button?.dataset?.remoteName || 'Agenda_iPad_remote.zip';
    if (!provider || !id) return;
    if (remoteBackupStatus) remoteBackupStatus.textContent=`Scarico ${name}…`;
    const blob = provider === 'google' ? await downloadGoogleDriveFile(id, googleAuth.getAccessToken()) : await downloadOneDriveFile(id, oneDriveAuth.getAccessToken());
    const file = new File([blob], name, { type:'application/zip', lastModified:Date.now() });
    await importBackupFile(file);
    if (remoteBackupStatus) remoteBackupStatus.textContent=`${name} importato nell'Archivio Backup locale ✓`;
  }

  async function openSettings() {
    await loadConfig();
    googleAuth.preload().catch(() => {});
    panel.hidden = false;
    settingsButton.setAttribute('aria-expanded', 'true');
    const next = dueAt(config);
    const nextText = config.frequency === 'off' ? 'Backup automatico disattivato.' : `Prossima scadenza: ${next.getTime() <= Date.now() ? 'adesso' : next.toLocaleString('it-IT')}`;
    const localAt = config.lastLocalSnapshotAt || config.lastBackupAt;
    const safeAt = config.lastDisasterSafeBackupAt;
    const backupSummary = localAt
      ? `Ultimo snapshot locale: ${new Date(localAt).toLocaleString('it-IT')}\nBackup esterno/disaster-safe: ${safeAt ? new Date(safeAt).toLocaleString('it-IT') : 'non ancora disponibile'}\n${nextText}`
      : `Nessun backup automatico precedente.\nBackup esterno/disaster-safe: non ancora disponibile\n${nextText}`;
    setStatus(authCallbackMessage || backupSummary);
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

  async function restoreBackupSettingsSnapshot(snapshot, restoredAt) {
    if (!snapshot || typeof snapshot !== 'object') return;
    config = cloneConfig({
      ...snapshot,
      destinations:{ ...(snapshot.destinations || {}), localFolder:false },
      lastBackupAt:restoredAt || null,
      lastBackupId:null
    });
    directoryHandle = null;
    await backupPut(SETTINGS_STORE, { key:SETTINGS_KEY, value:config, modifiedAt:new Date().toISOString() });
    await backupDelete(SETTINGS_STORE, DIRECTORY_KEY).catch(() => {});
    syncForm();
  }

  async function applyBackupPayload(parsed) {
    const records = parsed.pages?.records;
    if (!Array.isArray(records)) throw new Error('Archivio senza records pagina');
    const legacy = Number(parsed.formatVersion) < 2;
    await replaceMainRecords(mainDbName, mainStore, records);
    if (parsed.passwordVault) await restoreSecurePasswordVaultBackup(parsed.passwordVault);
    if (!legacy) {
      if (!audioProvider?.restoreBackup) throw new Error('Modulo audio non inizializzato: ripristino completo non consentito');
      await audioProvider.restoreBackup(parsed.audioBackup || { schemaVersion:1, settings:[], recordings:[] });
      await restoreLocalClipboards(parsed.clipboards);
    }
    restorePortablePreferences(parsed.preferences?.values || {});
    await restoreBackupSettingsSnapshot(parsed.manifest?.backupSettingsSnapshot, parsed.manifest?.createdAt);
    return { legacy, recordCount:records.length };
  }

  async function applyParsedBackup(parsed, sourceLabel = 'backup') {
    const records = parsed.pages?.records;
    if (!Array.isArray(records)) throw new Error('Archivio senza records pagina');
    const audioCount = parsed.audioBackup?.recordings?.length || 0;
    const legacy = Number(parsed.formatVersion) < 2;
    const ok = window.confirm(
      `Ripristinare ${records.length} record${legacy ? '' : ` e ${audioCount} registrazioni audio`} da ${sourceLabel}?\n\n` +
      `Verrà creato prima un backup di sicurezza dello stato corrente.\n` +
      (legacy ? '\nATTENZIONE: questo è un backup precedente al formato completo 2 e non contiene necessariamente audio/clipboard.' : '')
    );
    if (!ok) return false;
    const safety = await createBackup('pre-restore', { safety:true });
    if (!safety?.blob) throw new Error('Backup di sicurezza pre-ripristino non riuscito');
    // Il backup di sicurezza viene verificato e parsato PRIMA di modificare qualunque
    // archivio: deve essere già pronto come rollback compensativo se una fase successiva fallisce.
    const safetyParsed = await verifyArchiveWithPassphrase(safety.blob);
    const details = { fileName:sourceLabel, manifest:parsed.manifest, recordCount:records.length, restoreMode:'local' };
    try {
      await beforeRestoreApplied(details);
      await flushCurrent();
      await applyBackupPayload(parsed);
      await afterRestoreApplied(details);
    } catch (err) {
      setStatus(`Ripristino interrotto: ${err?.message || err}. Ripristino automatico dello stato precedente…`);
      try {
        await applyBackupPayload(safetyParsed);
        await afterRestoreRollback({ ...details, rollbackAt:new Date().toISOString(), failedReason:String(err?.message || err) });
      } catch (rollbackErr) {
        throw new Error(`ERRORE CRITICO: ripristino incompleto (${err?.message || err}) e rollback non riuscito (${rollbackErr?.message || rollbackErr}). Usa il backup di sicurezza ${safety.filename}.`);
      }
      throw new Error(`Ripristino annullato: ${err?.message || err}. Lo stato precedente è stato ripristinato automaticamente.`);
    }
    setStatus(legacy
      ? 'Ripristino locale completato da backup legacy. Sync sospesa: verifica lo stato prima di riallineare il gruppo.'
      : 'Ripristino locale completo eseguito. Sync sospesa: puoi usare “Ripristina gruppo attivo” per rendere questo stato autorevole.');
    setTimeout(() => location.reload(), 700);
    return true;
  }

  async function restoreArchiveById(id) {
    const archive = await backupGet(ARCHIVE_STORE, id);
    if (!archive?.blob) throw new Error('Backup non trovato');
    setStatus('Verifica backup da ripristinare…');
    const parsed = await verifyArchiveWithPassphrase(archive.blob);
    return applyParsedBackup(parsed, archive.filename);
  }

  async function importBackupFile(file) {
    if (!file) return;
    setStatus('Verifica backup da importare…');
    try {
      await ensureStorageCapacity(Math.ceil((Number(file.size) || 0) * 1.2), 'Importazione backup');
      const parsed = await verifyArchiveWithPassphrase(file);
      const whole = await sha256Hex(file);
      const createdAt = String(parsed.manifest?.createdAt || new Date().toISOString());
      const id = `import::${createdAt}::${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      const archive = {
        id,
        filename:String(file.name || backupFileName(parsed.manifest?.createdBy?.appVersion || appVersion, createdAt)),
        createdAt,
        size:file.size,
        sha256:whole,
        recordCount:Number(parsed.pages?.count ?? parsed.pages?.records?.length ?? 0),
        audioCount:Number(parsed.audioBackup?.recordings?.length || parsed.manifest?.backup?.audioCount || 0),
        formatVersion:Number(parsed.formatVersion) || 1,
        encrypted:await isEncryptedBackupBlob(file),
        encryption:(await isEncryptedBackupBlob(file)) ? 'AES-256-GCM' : '',
        reason:'importato',
        appVersion:String(parsed.manifest?.createdBy?.appVersion || '?'),
        blob:file,
        deliveries:[{ key:'internal', label:'Archivio app', ok:true, message:'importato' }]
      };
      await backupPut(ARCHIVE_STORE, archive);
      await renderHistory();
      setStatus(`Backup importato e verificato ✓\n${archive.filename}`);
    } catch (err) {
      setStatus(`Importazione non riuscita: ${err.message || err}`);
    }
  }

  async function promoteCurrentStateToGroup() {
    const warning = window.confirm(
      'ATTENZIONE: RIPRISTINA GRUPPO ATTIVO\n\n' +
      'Lo stato ATTUALE di questo dispositivo diventerà la nuova verità per tutti i dispositivi sincronizzati.\n' +
      'Se hai appena ripristinato un backup storico, verrà pubblicato proprio quello stato.\n\n' +
      'Le modifiche successive presenti nel gruppo verranno escluse dalla nuova generazione.\n' +
      'Verrà creato prima un backup di sicurezza.\n\nContinuare?'
    );
    if (!warning) return;
    const typed = window.prompt('Conferma operazione distruttiva: scrivi esattamente RIPRISTINA GRUPPO');
    if (String(typed || '').trim() !== 'RIPRISTINA GRUPPO') {
      setStatus('Ripristino gruppo annullato: conferma testuale non valida.');
      return;
    }
    const safety = await createBackup('pre-group-restore', { safety:true });
    if (!safety) throw new Error('Backup di sicurezza pre-ripristino gruppo non riuscito');
    await flushCurrent();
    const records = await readMainRecords(mainDbName, mainStore);
    const details = {
      fileName:'stato locale corrente',
      manifest:{ createdAt:new Date().toISOString(), source:'current-device-state' },
      recordCount:records.length,
      restoreMode:'group-current'
    };
    await beforeGlobalRestoreApplied(details);
    await afterGlobalRestoreApplied(details);
    setStatus('Stato locale fissato. Pubblicazione protetta come nuova generazione del gruppo al riavvio…');
    setTimeout(() => location.reload(), 700);
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
      if (ev.pointerType !== 'pen') return;
      directActivations.set(button, performance.now());
      action(ev);
      ev.preventDefault(); ev.stopPropagation();
    }, { passive: false });
    // Touch/palmo: nessuna azione al contatto iniziale; il click conferma il tap.

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

  const saveFields = [frequency, customDays, retention, onStartup, verifyAfter, backupPassphraseInput, destLocal, destGoogle, destOneDrive, googleClientId, googleFolderId, googleFolderName, oneClientId, oneTenant, oneFolder];
  for (const field of saveFields) field?.addEventListener('change', () => saveConfig().catch(() => {}));
  frequency?.addEventListener('change', () => { customDaysField.hidden = frequency.value !== 'custom'; });

  bindAction(settingsButton, () => panel.hidden ? openSettings() : closeSettings());
  bindAction(closeButton, closeSettings);
  bindAction(chooseLocal, chooseFolder);
  bindAction(exportLatest, async () => { const latest = await getLatest(); latest ? downloadOrShare(latest).catch((e) => setStatus(e.message)) : setStatus('Nessun backup disponibile.'); });
  bindAction(backupNow, async () => { await saveConfig(); await createBackup('manual'); });
  bindAction(verifyButton, verifyLatest);
  // 0.1.101-fix8: il selettore file e' nativo e riceve direttamente il gesto utente.
  // Safari/iPadOS puo' rifiutare input.click() sintetici lanciati da pointerdown.
  refreshRemoteBackupsButton?.addEventListener('click', () => { void refreshRemoteBackups(); });
  remoteBackupList?.addEventListener('click', (ev) => {
    const button = ev.target instanceof Element ? ev.target.closest('button[data-remote-backup-import="1"]') : null;
    if (!button) return;
    void importRemoteBackup(button).catch((err) => { if (remoteBackupStatus) remoteBackupStatus.textContent=`Importazione remota non riuscita: ${err.message || err}`; });
  });

  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    setStatus(`Backup selezionato: ${file.name} · verifica in corso…`);
    try { await importBackupFile(file); }
    finally { importInput.value = ''; }
  });
  bindAction(restoreGroupButton, () => { void promoteCurrentStateToGroup().catch((e) => setStatus(`Ripristino gruppo non riuscito: ${e.message || e}`)); });

  async function handleHistoryAction(ev) {
    const button = ev.target instanceof Element ? ev.target.closest('button') : null;
    const row = ev.target instanceof Element ? ev.target.closest('[data-backup-id]') : null;
    if (!button || !row) return;
    const id = row.dataset.backupId;
    if (button.dataset.backupRestore) await restoreArchiveById(id).catch((e) => setStatus(`Ripristino non riuscito: ${e.message || e}`));
    if (button.dataset.backupExport) await exportArchiveById(id).catch((e) => setStatus(e.message));
    if (button.dataset.backupDelete) {
      if (!window.confirm('Eliminare questo backup dall’archivio locale dell’app?')) return;
      await backupDelete(ARCHIVE_STORE, id); await renderHistory();
    }
  }
  history?.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'pen') return;
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

  return {
    openSettings, closeSettings, createBackup, verifyLatest, scheduleDueCheck, cloudBridge,
    attachAudioProvider(provider = {}) {
      if (typeof provider.exportBackup !== 'function' || typeof provider.restoreBackup !== 'function') throw new Error('Provider audio backup non valido');
      audioProvider = { exportBackup:provider.exportBackup, restoreBackup:provider.restoreBackup };
    }
  };
}
