import { createGoogleDriveAuth, createOneDriveAuth } from './cloud-auth.js';
const BACKUP_DB_NAME = 'AgendaIPadBackupDB';
const BACKUP_DB_VERSION = 1;
const ARCHIVE_STORE = 'archives';
const SETTINGS_STORE = 'settings';
const SETTINGS_KEY = 'backup-config-v1';
const DIRECTORY_KEY = 'local-directory-handle-v1';
const RESTORE_JOURNAL_KEY = 'restore-journal-v2';
const BACKUP_FORMAT = 'note-ipad-backup';
const LEGACY_BACKUP_FORMAT = 'agenda-ipad-backup';
const BACKUP_FORMAT_VERSION = 2;
const AUDIO_DB_NAME = 'AgendaIPadAudioDB';
const AUDIO_DB_VERSION = 1;
const AUDIO_RECORDINGS_STORE = 'recordings';
const AUDIO_CHUNKS_STORE = 'chunks';
const AUDIO_SETTINGS_STORE = 'settings';
const MAIN_SYNC_BLOB_STORE = 'syncBlobs';
const IMAGE_CLIPBOARD_DB_NAME = 'AgendaIPadLocalImageClipboardDB';
const LASSO_CLIPBOARD_DB_NAME = 'AgendaIPadLocalLassoClipboardDB';
const CLIPBOARD_STORE_NAME = 'clipboard';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const APP_PREFERENCE_PREFIXES = ['agenda-ipad-', 'lavagna-ipad-', 'note-ipad-'];
const NON_PORTABLE_PREFERENCE_KEYS = new Set([
  'agenda-ipad-cloud-sync-config-v1',
  'agenda-ipad-lan-sync-config-v1',
  'agenda-ipad-sync-restore-guard-v1',
  'agenda-ipad-local-restore-sync-quarantine-v1'
]);

function isPortablePreferenceKey(key) {
  const text = String(key || '');
  return APP_PREFERENCE_PREFIXES.some((prefix) => text.startsWith(prefix)) && !text.includes('backup') && !NON_PORTABLE_PREFERENCE_KEYS.has(text);
}

const DEFAULT_CONFIG = Object.freeze({
  frequency: 'daily',
  customDays: 3,
  retention: 30,
  backupOnStartup: true,
  verifyAfterBackup: true,
  destinations: { localFolder: false, googleDrive: false, oneDrive: false },
  google: { clientId: '', folderId: '', folderName: 'Note iPad Backups' },
  oneDrive: { clientId: '', tenant: 'common', folder: 'Note iPad Backups' },
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

async function openExistingDb(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readMainRecords(dbName, storeName) {
  const db = await openExistingDb(dbName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

async function readMainSnapshot(dbName, storeName) {
  const db = await openExistingDb(dbName);
  try {
    const names = [storeName];
    if (db.objectStoreNames.contains(MAIN_SYNC_BLOB_STORE)) names.push(MAIN_SYNC_BLOB_STORE);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(names, 'readonly');
      const pages = tx.objectStore(storeName).getAll();
      const blobs = names.length > 1 ? tx.objectStore(MAIN_SYNC_BLOB_STORE).getAll() : null;
      tx.oncomplete = () => resolve({ records: pages.result || [], imageBlobs: new Map((blobs?.result || []).map(row => [String(row.hash).toLowerCase(), row])) });
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Snapshot pagine/media non riuscito'));
    });
  } finally { db.close(); }
}

async function readMainBlobByHash(dbName, hash) {
  if (!hash) return null;
  const db = await openExistingDb(dbName);
  try {
    if (!db.objectStoreNames.contains(MAIN_SYNC_BLOB_STORE)) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(MAIN_SYNC_BLOB_STORE, 'readonly');
      const req = tx.objectStore(MAIN_SYNC_BLOB_STORE).get(String(hash).toLowerCase());
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

async function replaceMainRecords(dbName, storeName, records) {
  const db = await openExistingDb(dbName);
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
  } finally { db.close(); }
}

function openAudioBackupDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_RECORDINGS_STORE)) {
        const store = db.createObjectStore(AUDIO_RECORDINGS_STORE, { keyPath: 'id' });
        store.createIndex('pageKey', 'pageKey', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(AUDIO_CHUNKS_STORE)) {
        const chunks = db.createObjectStore(AUDIO_CHUNKS_STORE, { keyPath: ['sessionId', 'index'] });
        chunks.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains(AUDIO_SETTINGS_STORE)) db.createObjectStore(AUDIO_SETTINGS_STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAudioStore(storeName) {
  const db = await openAudioBackupDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

async function replaceAudioDatabase(snapshot) {
  const db = await openAudioBackupDb();
  const recordings = Array.isArray(snapshot?.recordings) ? snapshot.recordings : [];
  const chunks = Array.isArray(snapshot?.chunks) ? snapshot.chunks : [];
  const settings = Array.isArray(snapshot?.settings) ? snapshot.settings : [];
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([AUDIO_RECORDINGS_STORE, AUDIO_CHUNKS_STORE, AUDIO_SETTINGS_STORE], 'readwrite');
      const recStore = tx.objectStore(AUDIO_RECORDINGS_STORE);
      const chunkStore = tx.objectStore(AUDIO_CHUNKS_STORE);
      const settingsStore = tx.objectStore(AUDIO_SETTINGS_STORE);
      recStore.clear(); chunkStore.clear(); settingsStore.clear();
      for (const row of recordings) recStore.put(row);
      for (const row of chunks) chunkStore.put(row);
      for (const row of settings) settingsStore.put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Ripristino archivio audio annullato'));
    });
  } finally { db.close(); }
}

function openClipboardBackupDb(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLIPBOARD_STORE_NAME)) db.createObjectStore(CLIPBOARD_STORE_NAME, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error(`Clipboard DB non disponibile: ${dbName}`));
  });
}

async function readClipboardRows(dbName) {
  const db = await openClipboardBackupDb(dbName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CLIPBOARD_STORE_NAME, 'readonly');
      const req = tx.objectStore(CLIPBOARD_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

async function replaceClipboardRows(dbName, rows) {
  const db = await openClipboardBackupDb(dbName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CLIPBOARD_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CLIPBOARD_STORE_NAME);
      store.clear();
      for (const row of Array.isArray(rows) ? rows : []) store.put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error(`Ripristino clipboard annullato: ${dbName}`));
    });
  } finally { db.close(); }
}

async function readClipboardSnapshotRaw() {
  const [imageCut, lasso] = await Promise.all([
    readClipboardRows(IMAGE_CLIPBOARD_DB_NAME),
    readClipboardRows(LASSO_CLIPBOARD_DB_NAME)
  ]);
  return { imageCut, lasso };
}

async function replaceClipboardDatabases(snapshot) {
  await replaceClipboardRows(IMAGE_CLIPBOARD_DB_NAME, snapshot?.imageCut || []);
  await replaceClipboardRows(LASSO_CLIPBOARD_DB_NAME, snapshot?.lasso || []);
}

function collectPortablePreferences() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isPortablePreferenceKey(key)) continue;
      out[key] = localStorage.getItem(key);
    }
  } catch (err) { throw new Error(`Preferenze non leggibili: ${err.message || err}`); }
  return out;
}

function replacePortablePreferences(preferences) {
  const source = preferences && typeof preferences === 'object' ? preferences : {};
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (isPortablePreferenceKey(key)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(source)) {
      if (!isPortablePreferenceKey(key)) continue;
      localStorage.setItem(key, String(value));
    }
  } catch (err) { throw new Error(`Ripristino preferenze non riuscito: ${err.message || err}`); }
}

const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);

class Sha256Incremental {
  constructor() {
    this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.totalBytes = 0n;
    this.words = new Uint32Array(64);
    this.finished = false;
  }
  _compress(block) {
    const w = this.words;
    for (let i=0;i<16;i++) {
      const j=i*4;
      w[i]=(((block[j]<<24)|(block[j+1]<<16)|(block[j+2]<<8)|block[j+3])>>>0);
    }
    for (let i=16;i<64;i++) {
      const x=w[i-15], y=w[i-2];
      const s0=((x>>>7)|(x<<25)) ^ ((x>>>18)|(x<<14)) ^ (x>>>3);
      const s1=((y>>>17)|(y<<15)) ^ ((y>>>19)|(y<<13)) ^ (y>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let a=this.h[0],b=this.h[1],c=this.h[2],d=this.h[3],e=this.h[4],f=this.h[5],g=this.h[6],h=this.h[7];
    for (let i=0;i<64;i++) {
      const S1=((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
      const ch=(e&f) ^ ((~e)&g);
      const t1=(h+S1+ch+SHA256_K[i]+w[i])>>>0;
      const S0=((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
      const maj=(a&b) ^ (a&c) ^ (b&c);
      const t2=(S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    this.h[0]=(this.h[0]+a)>>>0; this.h[1]=(this.h[1]+b)>>>0;
    this.h[2]=(this.h[2]+c)>>>0; this.h[3]=(this.h[3]+d)>>>0;
    this.h[4]=(this.h[4]+e)>>>0; this.h[5]=(this.h[5]+f)>>>0;
    this.h[6]=(this.h[6]+g)>>>0; this.h[7]=(this.h[7]+h)>>>0;
  }
  update(bytes) {
    if (this.finished) throw new Error('SHA-256 già finalizzato');
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    this.totalBytes += BigInt(bytes.byteLength);
    let offset=0;
    if (this.bufferLength) {
      const take=Math.min(64-this.bufferLength, bytes.length);
      this.buffer.set(bytes.subarray(0,take),this.bufferLength);
      this.bufferLength+=take; offset+=take;
      if (this.bufferLength===64) { this._compress(this.buffer); this.bufferLength=0; }
    }
    while (offset+64<=bytes.length) { this._compress(bytes.subarray(offset,offset+64)); offset+=64; }
    if (offset<bytes.length) {
      const rest=bytes.subarray(offset);
      this.buffer.set(rest,0); this.bufferLength=rest.length;
    }
    return this;
  }
  digestHex() {
    if (this.finished) throw new Error('SHA-256 già finalizzato');
    this.finished=true;
    const bitLength=this.totalBytes*8n;
    this.buffer[this.bufferLength++]=0x80;
    if (this.bufferLength>56) {
      this.buffer.fill(0,this.bufferLength,64); this._compress(this.buffer); this.bufferLength=0;
    }
    this.buffer.fill(0,this.bufferLength,56);
    for (let i=0;i<8;i++) this.buffer[63-i]=Number((bitLength>>BigInt(i*8))&0xffn);
    this._compress(this.buffer);
    return [...this.h].map((v)=>v.toString(16).padStart(8,'0')).join('');
  }
}

async function sha256Hex(bytesOrBlob) {
  if (!(bytesOrBlob instanceof Blob)) {
    const bytes = bytesOrBlob instanceof Uint8Array ? bytesOrBlob : new Uint8Array(bytesOrBlob);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Blob grandi (audio) vengono elaborati a blocchi: niente seconda copia completa in RAM.
  const sha = new Sha256Incremental();
  const chunkSize = 4 * 1024 * 1024;
  for (let offset=0; offset<bytesOrBlob.size; offset+=chunkSize) {
    sha.update(new Uint8Array(await bytesOrBlob.slice(offset, Math.min(bytesOrBlob.size, offset+chunkSize)).arrayBuffer()));
  }
  return sha.digestHex();
}

let crcTable = null;
function ensureCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32Update(state, bytes) {
  const table = ensureCrcTable();
  let c = state >>> 0;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

async function crc32Data(data) {
  if (!(data instanceof Blob)) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return (crc32Update(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
  }
  let c = 0xffffffff;
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < data.size; offset += chunkSize) {
    const bytes = new Uint8Array(await data.slice(offset, Math.min(data.size, offset + chunkSize)).arrayBuffer());
    c = crc32Update(c, bytes);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dataSize(data) {
  return data instanceof Blob ? data.size : (data instanceof Uint8Array ? data.byteLength : new Uint8Array(data).byteLength);
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

async function storedZip(entries) {
  if (entries.length > 65535) throw new Error('Backup troppo grande: troppi file per ZIP32');
  const parts = [];
  const centrals = [];
  let localOffset = 0;
  const dt = dosDateTime();
  const u16 = (view, off, value) => view.setUint16(off, value, true);
  const u32 = (view, off, value) => view.setUint32(off, value >>> 0, true);
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data ?? entry.bytes;
    const size = dataSize(data);
    if (size > 0xffffffff) throw new Error(`File troppo grande per ZIP32: ${entry.name}`);
    const crc = await crc32Data(data);
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
    u16(lv, 10, dt.time); u16(lv, 12, dt.date); u32(lv, 14, crc); u32(lv, 18, size); u32(lv, 22, size);
    u16(lv, 26, nameBytes.length); u16(lv, 28, 0);
    parts.push(lh, nameBytes, data);
    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u16(cv, 12, dt.time); u16(cv, 14, dt.date); u32(cv, 16, crc); u32(cv, 20, size); u32(cv, 24, size);
    u16(cv, 28, nameBytes.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, localOffset);
    centrals.push(concatBytes([ch, nameBytes]));
    localOffset += 30 + nameBytes.length + size;
    if (localOffset > 0xffffffff) throw new Error('Backup troppo grande per ZIP32 (>4 GB)');
  }
  const central = concatBytes(centrals);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, central.length, true); ev.setUint32(16, localOffset, true); ev.setUint16(20, 0, true);
  return new Blob([...parts, central, eocd], { type: 'application/zip' });
}

async function parseStoredZip(blob) {
  const files = new Map();
  let offset = 0;
  while (offset + 4 <= blob.size) {
    const sigBytes = new Uint8Array(await blob.slice(offset, offset + 4).arrayBuffer());
    if (sigBytes.length < 4) break;
    const sig = new DataView(sigBytes.buffer).getUint32(0, true);
    if (sig !== 0x04034b50) break;
    const header = new Uint8Array(await blob.slice(offset, offset + 30).arrayBuffer());
    if (header.length < 30) throw new Error('Header ZIP incompleto');
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const flags = view.getUint16(6, true);
    const method = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    const nameLen = view.getUint16(26, true);
    const extraLen = view.getUint16(28, true);
    if (flags & 0x0008) throw new Error('ZIP con data descriptor non supportato');
    if (method !== 0) throw new Error('Backup compresso non supportato da questo lettore');
    if (compressedSize !== uncompressedSize) throw new Error('Dimensioni ZIP incoerenti');
    const nameStart = offset + 30;
    const nameBytes = new Uint8Array(await blob.slice(nameStart, nameStart + nameLen).arrayBuffer());
    const name = decoder.decode(nameBytes);
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (files.has(name)) throw new Error(`ZIP ambiguo: percorso duplicato ${name}`);
    if (dataEnd > blob.size) throw new Error(`Contenuto ZIP incompleto: ${name}`);
    files.set(name, blob.slice(dataStart, dataEnd));
    offset = dataEnd;
  }
  const tailSize = Math.min(blob.size, 65557);
  const tail = new Uint8Array(await blob.slice(blob.size - tailSize).arrayBuffer());
  let eocdAt = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocdAt = i; break; }
  }
  if (eocdAt < 0) throw new Error('ZIP incompleto: directory centrale finale mancante');
  const eocd = new DataView(tail.buffer, tail.byteOffset + eocdAt, Math.min(22, tail.length - eocdAt));
  const entryCount = eocd.getUint16(10, true);
  const centralSize = eocd.getUint32(12, true);
  const centralOffset = eocd.getUint32(16, true);
  if (entryCount !== files.size) throw new Error(`ZIP incoerente: ${entryCount} entry dichiarate, ${files.size} lette`);
  if (centralOffset !== offset || centralOffset + centralSize > blob.size) throw new Error('ZIP incoerente: directory centrale non valida');
  return files;
}

function jsonBytes(value) { return encoder.encode(JSON.stringify(value, null, 2)); }
async function parseJsonEntry(entry, name) {
  if (!entry) throw new Error(`File ${name} mancante`);
  return JSON.parse(await entry.text());
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
      return { mimeType, blob: new Blob([bytes], { type: mimeType }) };
    }
    const bytes = encoder.encode(decodeURIComponent(payload));
    return { mimeType, blob: new Blob([bytes], { type: mimeType }) };
  } catch { return null; }
}

async function mediaBlobToDataUrl(blob, mimeType) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  return `data:${mimeType || blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function extensionForMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  return 'bin';
}

function safeFileToken(value) {
  return String(value || 'item').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100);
}

async function extractMediaFromRecords(records, mainDbName, imageBlobs = null) {
  const portableRecords = clonePortableRecords(records || []);
  const mediaEntries = [];
  const mediaItems = [];
  const paths = new Set();
  for (const record of portableRecords) {
    if (!Array.isArray(record?.images)) continue;
    for (const image of record.images) {
      let blob = null;
      let mimeType = image?.mimeType || '';
      const embedded = dataUrlToMedia(image?.src);
      if (embedded?.blob) { blob = embedded.blob; mimeType ||= embedded.mimeType; }
      if (!blob && image?.blobHash) {
        const row = imageBlobs ? imageBlobs.get(String(image.blobHash).toLowerCase()) : await readMainBlobByHash(mainDbName, image.blobHash);
        if (row?.blob instanceof Blob) { blob = row.blob; mimeType ||= row.mimeType || row.blob.type; }
      }
      if (!blob) throw new Error(`Backup incompleto: immagine ${image?.name || image?.id || '?'} non disponibile localmente`);
      const ext = extensionForMime(mimeType || blob.type);
      // Il percorso deriva dai byte reali, non da nomi normalizzati o hash obsoleti.
      const contentHash = await sha256Hex(blob);
      const imageToken = safeFileToken(image.id || `image-${mediaItems.length + 1}`);
      const path = `media/images/${contentHash}.${ext}`;
      image.blobHash = `sha256:${contentHash}`;
      if (!paths.has(path)) { mediaEntries.push({ name: path, data: blob }); paths.add(path); }
      mediaItems.push({
        id: image.id || imageToken, type: 'image', path, mimeType: mimeType || blob.type || 'application/octet-stream',
        pageKey: record.date || null, referenceDate: record.referenceDate || null, name: image.name || null, size: blob.size
      });
      image.mediaPath = path;
      image.mimeType = mimeType || blob.type || 'application/octet-stream';
      image.blobSize = Number(image.blobSize) || blob.size;
      delete image.src;
    }
  }
  return { portableRecords, mediaEntries, mediaItems };
}

async function hydrateMediaIntoRecords(records, files) {
  const hydrated = clonePortableRecords(records || []);
  for (const record of hydrated) {
    if (!Array.isArray(record?.images)) continue;
    for (const image of record.images) {
      if (typeof image.src === 'string' && image.src.startsWith('data:')) continue;
      if (!image.mediaPath) throw new Error('Immagine senza dati incorporati nel backup');
      const blob = files.get(image.mediaPath);
      if (!(blob instanceof Blob)) throw new Error(`Media immagine mancante: ${image.mediaPath}`);
      image.src = await mediaBlobToDataUrl(blob, image.mimeType || blob.type || 'application/octet-stream');
    }
  }
  return hydrated;
}

async function resolvePortableClipboardImage(image, mainDbName, ownerToken, mediaEntries, mediaItems, imageBlobs = null) {
  if (!image || typeof image !== 'object') return image;
  const portable = { ...image };
  let blob = null;
  let mimeType = portable.mimeType || '';
  const embedded = dataUrlToMedia(portable.src);
  if (embedded?.blob) { blob = embedded.blob; mimeType ||= embedded.mimeType; }
  if (!blob && portable.blobHash) {
    const row = imageBlobs ? imageBlobs.get(String(portable.blobHash).toLowerCase()) : await readMainBlobByHash(mainDbName, portable.blobHash);
    if (row?.blob instanceof Blob) { blob = row.blob; mimeType ||= row.mimeType || row.blob.type; }
  }
  if (!blob) throw new Error(`Backup incompleto: immagine in clipboard ${portable.name || portable.id || '?'} non disponibile localmente`);
  const path = `media/clipboard/${safeFileToken(ownerToken)}--${safeFileToken(portable.id || 'image')}.${extensionForMime(mimeType || blob.type)}`;
  mediaEntries.push({ name: path, data: blob });
  mediaItems.push({ id: portable.id || ownerToken, type:'image', owner:'clipboard', path, mimeType:mimeType || blob.type || 'application/octet-stream', name:portable.name || null, size:blob.size });
  portable.mediaPath = path;
  portable.mimeType = mimeType || blob.type || 'application/octet-stream';
  portable.blobSize = Number(portable.blobSize) || blob.size;
  delete portable.src;
  return portable;
}

async function collectClipboardSnapshot(mainDbName, rawSnapshot = null, imageBlobs = null) {
  const raw = rawSnapshot || await readClipboardSnapshotRaw();
  const mediaEntries = [];
  const mediaItems = [];
  const imageCut = [];
  for (let i = 0; i < (raw.imageCut || []).length; i++) {
    const source = globalThis.structuredClone ? structuredClone(raw.imageCut[i]) : JSON.parse(JSON.stringify(raw.imageCut[i]));
    if (source?.image) source.image = await resolvePortableClipboardImage(source.image, mainDbName, `image-cut-${i}`, mediaEntries, mediaItems, imageBlobs);
    imageCut.push(source);
  }
  const lasso = [];
  for (let i = 0; i < (raw.lasso || []).length; i++) {
    const source = globalThis.structuredClone ? structuredClone(raw.lasso[i]) : JSON.parse(JSON.stringify(raw.lasso[i]));
    if (Array.isArray(source?.images)) {
      const out = [];
      for (let j = 0; j < source.images.length; j++) out.push(await resolvePortableClipboardImage(source.images[j], mainDbName, `lasso-${i}-${j}`, mediaEntries, mediaItems, imageBlobs));
      source.images = out;
    }
    lasso.push(source);
  }
  return { schemaVersion:1, imageCut, lasso, mediaEntries, mediaItems };
}

async function hydrateClipboardSnapshot(snapshot, files) {
  const hydrateImage = async (source) => {
    if (!source || typeof source !== 'object') return source;
    const image = { ...source };
    if (image.mediaPath) {
      const blob = files.get(image.mediaPath);
      if (!(blob instanceof Blob)) throw new Error(`Media clipboard mancante: ${image.mediaPath}`);
      image.src = await mediaBlobToDataUrl(blob, image.mimeType || blob.type || 'application/octet-stream');
      delete image.mediaPath;
    }
    return image;
  };
  const imageCut = [];
  for (const source of Array.isArray(snapshot?.imageCut) ? snapshot.imageCut : []) {
    const row = { ...source };
    if (row.image) row.image = await hydrateImage(row.image);
    imageCut.push(row);
  }
  const lasso = [];
  for (const source of Array.isArray(snapshot?.lasso) ? snapshot.lasso : []) {
    const row = { ...source };
    if (Array.isArray(row.images)) row.images = await Promise.all(row.images.map(hydrateImage));
    lasso.push(row);
  }
  return { imageCut, lasso };
}

async function readAudioSnapshotRaw() {
  const [recordings, chunks, settings] = await Promise.all([
    readAudioStore(AUDIO_RECORDINGS_STORE), readAudioStore(AUDIO_CHUNKS_STORE), readAudioStore(AUDIO_SETTINGS_STORE)
  ]);
  return { recordings, chunks, settings };
}

async function collectAudioSnapshot({ downloadGoogle = null, downloadOneDrive = null, rawSnapshot = null } = {}) {
  const [recordingsRaw, chunksRaw, settingsRaw] = rawSnapshot
    ? [rawSnapshot.recordings || [], rawSnapshot.chunks || [], rawSnapshot.settings || []]
    : await Promise.all([
        readAudioStore(AUDIO_RECORDINGS_STORE), readAudioStore(AUDIO_CHUNKS_STORE), readAudioStore(AUDIO_SETTINGS_STORE)
      ]);
  const recordings = [];
  const chunks = [];
  const mediaEntries = [];
  const mediaItems = [];
  for (const source of recordingsRaw) {
    const row = { ...source };
    let blob = row.blob instanceof Blob && row.blob.size ? row.blob : null;
    let recoveredFromCloud = false;
    if (!blob && row.cloudProvider && row.cloudFileId) {
      try {
        if (row.cloudProvider === 'google' && downloadGoogle) blob = await downloadGoogle(row.cloudFileId);
        else if (row.cloudProvider === 'onedrive' && downloadOneDrive) blob = await downloadOneDrive(row.cloudFileId);
      } catch (err) {
        throw new Error(`Backup incompleto: audio “${row.name || row.filename || row.id}” è solo su ${row.cloudProvider} e non è scaricabile (${err.message || err})`);
      }
      recoveredFromCloud = Boolean(blob?.size);
    }
    if (!blob) throw new Error(`Backup incompleto: file audio mancante per “${row.name || row.filename || row.id}”`);
    if (blob) {
      const mimeType = row.mimeType || blob.type || 'application/octet-stream';
      const path = `media/audio/${safeFileToken(row.id || row.filename || `audio-${mediaItems.length + 1}`)}.${extensionForMime(mimeType)}`;
      mediaEntries.push({ name: path, data: blob });
      mediaItems.push({ id: row.id, type: 'audio', path, mimeType, name: row.name || row.filename || null, size: blob.size, pageKey: row.pageKey || null });
      row.backupMediaPath = path;
      row.backupRecoveredFromCloud = recoveredFromCloud;
      row.size = Number(row.size) || blob.size;
      row.mimeType = mimeType;
    }
    delete row.blob;
    recordings.push(row);
  }
  for (const source of chunksRaw) {
    const row = { ...source };
    const blob = row.blob instanceof Blob && row.blob.size ? row.blob : null;
    if (!blob) throw new Error(`Backup incompleto: frammento audio mancante (${row.sessionId || '?'} #${Number(row.index) || 0})`);
    if (blob) {
      const mimeType = blob.type || row.mimeType || 'application/octet-stream';
      const path = `media/audio/recovery/${safeFileToken(row.sessionId || 'session')}--${String(Number(row.index) || 0).padStart(6, '0')}.${extensionForMime(mimeType)}`;
      mediaEntries.push({ name: path, data: blob });
      mediaItems.push({ id: `${row.sessionId}:${row.index}`, type: 'audio-chunk', path, mimeType, size: blob.size });
      row.backupMediaPath = path;
      row.mimeType = mimeType;
    }
    delete row.blob;
    chunks.push(row);
  }
  const settings = clonePortableRecords(settingsRaw || []);
  return { schemaVersion: 1, recordings, chunks, settings, mediaEntries, mediaItems };
}

function hydrateAudioSnapshot(snapshot, files) {
  const recordings = [];
  for (const source of Array.isArray(snapshot?.recordings) ? snapshot.recordings : []) {
    const row = { ...source };
    if (row.backupMediaPath) {
      const blob = files.get(row.backupMediaPath);
      if (!(blob instanceof Blob)) throw new Error(`Media audio mancante: ${row.backupMediaPath}`);
      row.blob = blob.slice(0, blob.size, row.mimeType || blob.type || 'application/octet-stream');
      row.localStored = true;
      row.uploadStatus = 'restored-local';
      row.cloudProvider = '';
      row.cloudFileId = '';
      row.cloudName = '';
      row.uploadError = '';
    }
    delete row.backupMediaPath;
    delete row.backupRecoveredFromCloud;
    recordings.push(row);
  }
  const chunks = [];
  for (const source of Array.isArray(snapshot?.chunks) ? snapshot.chunks : []) {
    const row = { ...source };
    if (row.backupMediaPath) {
      const blob = files.get(row.backupMediaPath);
      if (!(blob instanceof Blob)) throw new Error(`Frammento audio mancante: ${row.backupMediaPath}`);
      row.blob = blob.slice(0, blob.size, row.mimeType || blob.type || 'application/octet-stream');
    }
    delete row.backupMediaPath;
    chunks.push(row);
  }
  return { recordings, chunks, settings: clonePortableRecords(snapshot?.settings || []) };
}

function backupFileName(appVersion, createdAt) {
  const stamp = createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `Note_iPad_FULL_${stamp}_app-${appVersion}_fmt-${BACKUP_FORMAT_VERSION}.zip`;
}

async function makeBackupPackage({ appVersion, records, preferences, config, secureVault = null, mainDbName, audioSnapshot, clipboardSnapshot = null, imageBlobs = null, capturedAt = null }) {
  const createdAt = capturedAt || new Date().toISOString();
  const media = await extractMediaFromRecords(records, mainDbName, imageBlobs);
  const combinedMediaEntries = [...media.mediaEntries, ...(audioSnapshot?.mediaEntries || []), ...(clipboardSnapshot?.mediaEntries || [])];
  const combinedMediaItems = [...media.mediaItems, ...(audioSnapshot?.mediaItems || []), ...(clipboardSnapshot?.mediaItems || [])];
  const mediaEntryNames = new Set();
  for (const entry of combinedMediaEntries) {
    const name = String(entry?.name || '');
    if (!name) throw new Error('Backup incompleto: media senza percorso ZIP');
    if (mediaEntryNames.has(name)) throw new Error(`Backup ambiguo: percorso media duplicato ${name}`);
    mediaEntryNames.add(name);
    if (!(entry.data instanceof Blob) && !(entry.data instanceof Uint8Array) && !(entry.data instanceof ArrayBuffer)) throw new Error(`Backup incompleto: payload media non valido ${name}`);
  }
  const audioPortable = audioSnapshot ? {
    schemaVersion: 1,
    recordings: audioSnapshot.recordings,
    chunks: audioSnapshot.chunks,
    settings: audioSnapshot.settings
  } : { schemaVersion: 1, recordings: [], chunks: [], settings: [] };
  const pagesBytes = jsonBytes({ schemaVersion: 3, count: media.portableRecords.length, records: media.portableRecords });
  const prefBytes = jsonBytes({ schemaVersion: 2, values: preferences });
  const audioBytes = jsonBytes(audioPortable);
  const clipboardBytes = jsonBytes({ schemaVersion:1, imageCut:clipboardSnapshot?.imageCut || [], lasso:clipboardSnapshot?.lasso || [] });
  const mediaBytes = jsonBytes({ schemaVersion: 2, items: combinedMediaItems, layoutVersion: 2 });
  const secureVaultBytes = secureVault ? jsonBytes(secureVault) : null;
  const safeConfig = {
    frequency: config.frequency, customDays: config.customDays, retention: config.retention,
    backupOnStartup: config.backupOnStartup, verifyAfterBackup: config.verifyAfterBackup,
    google: { clientId: config.google.clientId, folderId: config.google.folderId, folderName: config.google.folderName },
    oneDrive: { clientId: config.oneDrive.clientId, tenant: config.oneDrive.tenant, folder: config.oneDrive.folder }
  };
  const imageCount = combinedMediaItems.filter((item) => item.type === 'image').length;
  const audioCount = combinedMediaItems.filter((item) => item.type === 'audio').length;
  const audioBytesTotal = combinedMediaItems.filter((item) => item.type === 'audio' || item.type === 'audio-chunk').reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  const manifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    createdBy: { app: 'Note iPad', appVersion, platform: 'PWA' },
    reader: { minFormatVersion: 1, maxTestedFormatVersion: BACKUP_FORMAT_VERSION },
    backup: { type: 'full-disaster-recovery', immutable: true, complete: true, recordCount: records.length, imageCount, audioCount, audioBytes: audioBytesTotal },
    collections: [
      { id: 'pages', path: 'data/pages.json', encoding: 'json', schemaVersion: 3 },
      { id: 'preferences', path: 'data/preferences.json', encoding: 'json', schemaVersion: 2 },
      { id: 'audio', path: 'data/audio.json', encoding: 'json+media', schemaVersion: 1 },
      { id: 'clipboards', path: 'data/clipboards.json', encoding: 'json+media', schemaVersion: 1 },
      { id: 'media', path: 'media/index.json', encoding: 'json-index', schemaVersion: 2, extensible: true },
      ...(secureVaultBytes ? [{ id: 'password-vault', path: 'data/password-vault.json', encoding: 'json-encrypted-envelope', schemaVersion: 1, encrypted: true }] : [])
    ],
    mediaLayout: { images: 'media/images/', audio: 'media/audio/', clipboards: 'media/clipboard/', video: 'media/video/', attachments: 'media/attachments/' },
    backupSettingsSnapshot: safeConfig,
    checksumAlgorithm: 'SHA-256',
    disasterRecovery: { selfContained: true, requiresExternalCopyForFactoryReset: true, syncCredentialsIncluded: false, oauthTokensIncluded: false }
  };
  const manifestBytes = jsonBytes(manifest);
  const checksumFiles = {
    'manifest.json': await sha256Hex(manifestBytes),
    'data/pages.json': await sha256Hex(pagesBytes),
    'data/preferences.json': await sha256Hex(prefBytes),
    'data/audio.json': await sha256Hex(audioBytes),
    'data/clipboards.json': await sha256Hex(clipboardBytes),
    'media/index.json': await sha256Hex(mediaBytes),
    ...(secureVaultBytes ? { 'data/password-vault.json': await sha256Hex(secureVaultBytes) } : {})
  };
  for (const entry of combinedMediaEntries) checksumFiles[entry.name] = await sha256Hex(entry.data);
  const checksums = { algorithm: 'SHA-256', files: checksumFiles };
  const checksumBytes = jsonBytes(checksums);
  const blob = await storedZip([
    { name: 'manifest.json', data: manifestBytes },
    { name: 'checksums.json', data: checksumBytes },
    { name: 'data/pages.json', data: pagesBytes },
    { name: 'data/preferences.json', data: prefBytes },
    { name: 'data/audio.json', data: audioBytes },
    { name: 'data/clipboards.json', data: clipboardBytes },
    { name: 'media/index.json', data: mediaBytes },
    ...(secureVaultBytes ? [{ name: 'data/password-vault.json', data: secureVaultBytes }] : []),
    ...combinedMediaEntries
  ]);
  return { createdAt, filename: backupFileName(appVersion, createdAt), blob, manifest, checksums };
}

function validateCompletePayload(pages, audio, clipboards, preferences) {
  const unique = (rows, keyOf, name) => {
    if (!Array.isArray(rows)) throw new Error(`Raccolta ${name} non valida`);
    const seen = new Set();
    for (const row of rows) {
      const key = row && keyOf(row);
      if (!key || seen.has(key)) throw new Error(`Chiave mancante o duplicata in ${name}: ${key || '?'}`);
      seen.add(key);
    }
  };
  unique(pages.records, row => typeof row.date === 'string' && row.date, 'pagine');
  if (Number(pages.count) !== pages.records.length) throw new Error('Conteggio pagine incoerente');
  unique(audio.recordings, row => typeof row.id === 'string' && row.id, 'audio');
  unique(audio.chunks, row => typeof row.sessionId === 'string' && row.sessionId && Number.isInteger(row.index) && row.index >= 0 && `${row.sessionId}:${row.index}`, 'frammenti audio');
  unique(audio.settings, row => typeof row.key === 'string' && row.key, 'impostazioni audio');
  unique(clipboards.imageCut, row => typeof row.key === 'string' && row.key, 'clipboard immagini');
  unique(clipboards.lasso, row => typeof row.key === 'string' && row.key, 'clipboard Lazo');
  const checkImage = image => {
    if (!image || typeof image.mediaPath !== 'string' || !image.mediaPath) throw new Error('Backup incompleto: immagine senza file incorporato');
  };
  for (const row of pages.records) for (const image of row.images || []) checkImage(image);
  for (const row of clipboards.imageCut) if (row.image) checkImage(row.image);
  for (const row of clipboards.lasso) for (const image of row.images || []) checkImage(image);
  for (const row of [...audio.recordings, ...audio.chunks]) {
    if (typeof row.backupMediaPath !== 'string' || !row.backupMediaPath) throw new Error('Backup incompleto: audio senza file incorporato');
  }
  if (!preferences.values || typeof preferences.values !== 'object' || Array.isArray(preferences.values)) throw new Error('Preferenze backup non valide');
  for (const value of Object.values(preferences.values)) if (typeof value !== 'string') throw new Error('Valore preferenza backup non valido');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

async function verifyBackupBlob(blob) {
  const files = await parseStoredZip(blob);
  const manifest = await parseJsonEntry(files.get('manifest.json'), 'manifest.json');
  const formatVersion = Number(manifest.formatVersion) || 0;
  const isLegacy = manifest.format === LEGACY_BACKUP_FORMAT && formatVersion === 1;
  const isCurrent = manifest.format === BACKUP_FORMAT && formatVersion === BACKUP_FORMAT_VERSION;
  if (!isLegacy && !isCurrent) throw new Error(`Formato backup non compatibile (${manifest.format || '?'}/${manifest.formatVersion || '?'})`);
  const checksums = await parseJsonEntry(files.get('checksums.json'), 'checksums.json');
  const checksumMap = checksums.files && typeof checksums.files === 'object' ? checksums.files : {};
  const requiredChecksumEntries = ['manifest.json','data/pages.json','data/preferences.json'];
  if (isCurrent) requiredChecksumEntries.push('data/audio.json','data/clipboards.json','media/index.json');
  for (const name of requiredChecksumEntries) {
    if (!checksumMap[name]) throw new Error(`Indice checksum incompleto: ${name}`);
  }
  for (const [name, expected] of Object.entries(checksumMap)) {
    const entry = files.get(name);
    if (!(entry instanceof Blob)) throw new Error(`File ${name} mancante`);
    const actual = await sha256Hex(entry);
    if (actual !== expected) throw new Error(`Checksum non valido: ${name}`);
  }
  const pages = await parseJsonEntry(files.get('data/pages.json'), 'data/pages.json');
  const preferences = await parseJsonEntry(files.get('data/preferences.json'), 'data/preferences.json');
  const audio = files.has('data/audio.json') ? await parseJsonEntry(files.get('data/audio.json'), 'data/audio.json') : { schemaVersion: 0, recordings: [], chunks: [], settings: [] };
  const clipboards = files.has('data/clipboards.json') ? await parseJsonEntry(files.get('data/clipboards.json'), 'data/clipboards.json') : { schemaVersion:0, imageCut:[], lasso:[] };
  const mediaIndex = files.has('media/index.json') ? await parseJsonEntry(files.get('media/index.json'), 'media/index.json') : { items: [] };
  const passwordVault = files.has('data/password-vault.json') ? await parseJsonEntry(files.get('data/password-vault.json'), 'data/password-vault.json') : null;
  if (passwordVault && !checksumMap['data/password-vault.json']) throw new Error('Rubrica Password senza checksum');
  if (passwordVault && passwordVault.encrypted !== true) throw new Error('Rubrica Password del backup non risulta cifrata');
  const declared = Array.isArray(mediaIndex.items) ? mediaIndex.items : [];
  const declaredPaths = new Set();
  for (const item of declared) {
    const path = String(item?.path || '');
    if (!path || !files.has(path)) throw new Error(`Media dichiarato ma mancante: ${path || '?'}`);
    if (!checksumMap[path]) throw new Error(`Media senza checksum: ${path}`);
    const mediaBlob = files.get(path);
    if (Number(item.size) > 0 && mediaBlob.size !== Number(item.size)) throw new Error(`Dimensione media non valida: ${path}`);
    declaredPaths.add(path);
  }
  const referencedMediaPaths = [];
  for (const record of Array.isArray(pages.records) ? pages.records : []) {
    for (const image of Array.isArray(record?.images) ? record.images : []) if (image?.mediaPath) referencedMediaPaths.push(String(image.mediaPath));
  }
  for (const row of Array.isArray(audio?.recordings) ? audio.recordings : []) if (row?.backupMediaPath) referencedMediaPaths.push(String(row.backupMediaPath));
  for (const row of Array.isArray(audio?.chunks) ? audio.chunks : []) if (row?.backupMediaPath) referencedMediaPaths.push(String(row.backupMediaPath));
  for (const row of Array.isArray(clipboards?.imageCut) ? clipboards.imageCut : []) if (row?.image?.mediaPath) referencedMediaPaths.push(String(row.image.mediaPath));
  for (const row of Array.isArray(clipboards?.lasso) ? clipboards.lasso : []) for (const image of Array.isArray(row?.images) ? row.images : []) if (image?.mediaPath) referencedMediaPaths.push(String(image.mediaPath));
  for (const path of referencedMediaPaths) if (!declaredPaths.has(path)) throw new Error(`Media referenziato ma assente dall’indice: ${path}`);
  if (isCurrent) {
    validateCompletePayload(pages, audio, clipboards, preferences);
    const actualRecords = Array.isArray(pages.records) ? pages.records.length : 0;
    const actualImages = declared.filter((item) => item?.type === 'image').length;
    const actualAudio = declared.filter((item) => item?.type === 'audio').length;
    const actualAudioBytes = declared.filter((item) => item?.type === 'audio' || item?.type === 'audio-chunk').reduce((sum, item) => sum + (Number(item?.size) || 0), 0);
    if (manifest.backup?.complete !== true) throw new Error('Backup v2 non marcato come completo');
    if (Number(manifest.backup?.recordCount) !== actualRecords) throw new Error('Conteggio record backup incoerente');
    if (Number(manifest.backup?.imageCount) !== actualImages) throw new Error('Conteggio immagini backup incoerente');
    if (Number(manifest.backup?.audioCount) !== actualAudio) throw new Error('Conteggio audio backup incoerente');
    if (Number(manifest.backup?.audioBytes) !== actualAudioBytes) throw new Error('Dimensione audio backup incoerente');
  }
  if (Array.isArray(pages.records)) pages.records = await hydrateMediaIntoRecords(pages.records, files);
  const hydratedAudio = hydrateAudioSnapshot(audio, files);
  const hydratedClipboards = await hydrateClipboardSnapshot(clipboards, files);
  return { manifest, pages, preferences, audio: hydratedAudio, clipboards: hydratedClipboards, mediaIndex, passwordVault, files, isLegacy };
}

export const __backupTest = Object.freeze({
  storedZip, parseStoredZip, makeBackupPackage, verifyBackupBlob,
  isPortablePreferenceKey, extensionForMime, backupFileName, sha256Hex,
  collectAudioSnapshot, collectClipboardSnapshot, collectPortablePreferences, replacePortablePreferences, validateCompletePayload
});

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

async function ensureGoogleFolder(token, folderId, folderName = 'Note iPad Backups', signal = null) {
  if (folderId) return folderId;
  const safeName = String(folderName || 'Note iPad Backups').replace(/'/g, "\\'");
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
    body: JSON.stringify({ name: folderName || 'Note iPad Backups', mimeType: 'application/vnd.google-apps.folder' }), signal
  });
  if (!create.ok) throw new Error(`Google Drive crea cartella: HTTP ${create.status}`);
  return (await create.json()).id;
}

async function uploadGoogleDrive(blob, filename, token, folderId, folderName = 'Note iPad Backups', contentType = 'application/zip', signal = null) {
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
    await navigator.share({ files: [file], title: 'Backup Note iPad' });
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
    setRestoreOperationLocked = async () => {}, canStartBackup = () => true, canStartRestore = () => true,
    isRealtimeBusy = () => false, beginConsistentSnapshot = async () => {}, endConsistentSnapshot = async () => {},
    beforeRestoreApplied = async () => {}, afterRestoreApplied = async () => {},
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
  const restoreGroupInput = document.getElementById('restoreGroupBackupInput');
  const status = document.getElementById('backupStatus');
  const history = document.getElementById('backupHistory');

  let config = cloneConfig();
  let directoryHandle = null;
  let running = false;
  let restoring = false;
  let lastActivity = Date.now();
  let dueTimer = 0;
  let authCallbackMessage = '';
  let protectedArchiveId = '';
  let restoreLockHeld = false;
  let recoveryBlocked = false;
  const directActivations = new WeakMap();

  const setStatus = (text) => { if (status) status.textContent = text; if (restoreLockHeld && snapshotMessage) snapshotMessage.textContent = text; };

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
    verifyAfter.checked = true;
    verifyAfter.disabled = true;
    destLocal.checked = Boolean(config.destinations.localFolder);
    destGoogle.checked = Boolean(config.destinations.googleDrive);
    destOneDrive.checked = Boolean(config.destinations.oneDrive);
    googleClientId.value = config.google.clientId || '';
    googleFolderId.value = config.google.folderId || '';
    if (googleFolderName) googleFolderName.value = config.google.folderName || 'Note iPad Backups';
    oneClientId.value = config.oneDrive.clientId || '';
    oneTenant.value = config.oneDrive.tenant || 'common';
    oneFolder.value = config.oneDrive.folder || 'Note iPad Backups';
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
    config.verifyAfterBackup = true;
    config.destinations.localFolder = Boolean(destLocal.checked && ('showDirectoryPicker' in window));
    config.destinations.googleDrive = destGoogle.checked;
    config.destinations.oneDrive = destOneDrive.checked;
    config.google.clientId = googleClientId.value.trim();
    config.google.folderId = googleFolderId.value.trim();
    config.google.folderName = googleFolderName?.value.trim() || 'Note iPad Backups';
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
    let kept = 0;
    for (const row of rows) {
      if (row.id === protectedArchiveId || row.reason === 'pre-restore' || row.reason === 'imported') continue;
      if (kept < keep) { kept += 1; continue; }
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

  async function waitForBackupIdle(timeoutMs = 8000) {
    const started = performance.now();
    while (isRealtimeBusy()) {
      if (performance.now() - started > timeoutMs) throw new Error('Backup sospeso: termina la registrazione audio o l’operazione Ink in corso e riprova');
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  let snapshotGuard = null;
  let snapshotMessage = null;
  function showSnapshotGuard() {
    if (snapshotGuard?.isConnected) return;
    snapshotGuard = document.createElement('div');
    snapshotGuard.className = 'backup-snapshot-guard';
    snapshotGuard.setAttribute('role','status');
    snapshotGuard.setAttribute('aria-live','polite');
    snapshotGuard.innerHTML = '<div><strong>Snapshot di sicurezza</strong><span>Acquisizione stato corrente…</span></div>';
    snapshotMessage = snapshotGuard.firstElementChild.lastElementChild;
    document.body.appendChild(snapshotGuard);
  }

  function showRecoveryActions(safety = null) {
    showSnapshotGuard();
    if (snapshotGuard.dataset.recoveryActions) return;
    snapshotGuard.dataset.recoveryActions = '1';
    const add = (label, action) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.setAttribute('data-restore-recovery-action', '1');
      bindAction(button, action);
      snapshotGuard.firstElementChild.appendChild(button);
    };
    if (safety?.blob) add('Esporta backup di sicurezza', () => downloadOrShare(safety).catch(err => setStatus(`Esportazione non riuscita: ${err.message || err}`)));
    add('Riprova il recupero', () => location.reload());
  }

  function hideSnapshotGuard() {
    if (restoreLockHeld) return;
    snapshotGuard?.remove();
    snapshotGuard = null;
  }

  async function captureConsistentSnapshot() {
    await waitForBackupIdle();
    showSnapshotGuard();
    try {
      // Chiude l’eventuale race PEN DOWN avvenuta fra waitForBackupIdle e l’overlay.
      await new Promise((resolve) => (globalThis.requestAnimationFrame ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 16)));
      await waitForBackupIdle(5000);
      await flushCurrent();
      await waitForBackupIdle(5000);
      await beginConsistentSnapshot();
      try {
        const [mainSnapshot, audioRaw, clipboardRaw, secureVault] = await Promise.all([
          readMainSnapshot(mainDbName, mainStore),
          readAudioSnapshotRaw(),
          readClipboardSnapshotRaw(),
          getSecurePasswordVaultBackup()
        ]);
        const preferences = collectPortablePreferences();
        return { ...mainSnapshot, audioRaw, clipboardRaw, secureVault, preferences, configSnapshot:cloneConfig(config), capturedAt:new Date().toISOString() };
      } finally {
        await endConsistentSnapshot();
      }
    } finally {
      hideSnapshotGuard();
    }
  }

  async function ensureInternalArchiveCapacity(incomingSize) {
    await prune();
    if (!navigator.storage?.estimate) return;
    const reserve = Math.max(96 * 1024 * 1024, Math.ceil(incomingSize * 1.35));
    let estimate = await navigator.storage.estimate().catch(() => null);
    if (!estimate?.quota || !Number.isFinite(estimate.usage)) return;
    let free = Math.max(0, estimate.quota - estimate.usage);
    if (free >= reserve) return;
    const rows = (await listArchives()).slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    while (rows.length > 2 && free < reserve) {
      const victimIndex = rows.findIndex((row) => row.id !== protectedArchiveId && row.reason !== 'pre-restore' && row.reason !== 'imported');
      if (victimIndex < 0) break;
      const [victim] = rows.splice(victimIndex, 1);
      if (!victim) break;
      await backupDelete(ARCHIVE_STORE, victim.id);
      estimate = await navigator.storage.estimate().catch(() => null);
      if (!estimate?.quota || !Number.isFinite(estimate.usage)) break;
      free = Math.max(0, estimate.quota - estimate.usage);
    }
    if (estimate?.quota && Number.isFinite(estimate.usage) && Math.max(0, estimate.quota - estimate.usage) < Math.min(reserve, incomingSize + 32 * 1024 * 1024)) {
      throw new Error(`Spazio insufficiente per archiviare in sicurezza il backup completo (${humanBytes(incomingSize)}). Esporta/elimina backup precedenti o libera spazio sull’iPad.`);
    }
  }

  async function collectCompleteAudioSnapshot(rawSnapshot = null) {
    return collectAudioSnapshot({
      rawSnapshot,
      downloadGoogle: async (fileId) => downloadGoogleDriveFile(fileId, googleAuth.getAccessToken()),
      downloadOneDrive: async (fileId) => downloadOneDriveFile(fileId, oneDriveAuth.getAccessToken())
    });
  }

  async function runBackupTask(task, args) {
    if (typeof Worker === 'function') {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./backup-worker.js', import.meta.url), { type:'module' });
        worker.onmessage = ({ data }) => {
          worker.terminate();
          if (data.error) reject(new Error(data.error)); else resolve(data.result);
        };
        worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Elaborazione backup non riuscita')); };
        worker.onmessageerror = () => { worker.terminate(); reject(new Error('Risultato backup non trasferibile')); };
        worker.postMessage({ task, args });
      });
    }
    // Browser senza Worker: manteniamo lo schermo protetto durante i calcoli.
    showSnapshotGuard();
    try {
      if (task === 'verify') return await verifyBackupBlob(args.blob);
      const clipboardSnapshot = await collectClipboardSnapshot(args.mainDbName, args.clipboardRaw, args.imageBlobs);
      return await makeBackupPackage({ ...args, clipboardSnapshot });
    } finally { hideSnapshotGuard(); }
  }

  async function createBackup(reason = 'manual', { safety = false } = {}) {
    if (running || recoveryBlocked || (restoring && !safety)) return null;
    if (!canStartBackup()) { setStatus('Backup sospeso: attendi il completamento dell’avvio o del ripristino di gruppo.'); return null; }
    running = true;
    setStatus(`Backup ${reason === 'automatic' ? 'automatico' : 'manuale'} completo in corso…`);
    setAppStatus('backup in corso');
    try {
      const snapshot = await captureConsistentSnapshot();
      const { records } = snapshot;
      const audioSnapshot = await collectCompleteAudioSnapshot(snapshot.audioRaw);
      const pkg = await runBackupTask('build', { ...snapshot, audioSnapshot, appVersion, config:snapshot.configSnapshot, mainDbName });
      await runBackupTask('verify', { blob:pkg.blob, compact:true });
      await ensureInternalArchiveCapacity(pkg.blob.size);
      const id = `${pkg.createdAt}::${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      const archive = {
        id, filename: pkg.filename, createdAt: pkg.createdAt, size: pkg.blob.size,
        sha256: null, recordCount: records.length, formatVersion: BACKUP_FORMAT_VERSION,
        imageCount: Number(pkg.manifest.backup?.imageCount) || 0,
        audioCount: Number(pkg.manifest.backup?.audioCount) || 0,
        audioBytes: Number(pkg.manifest.backup?.audioBytes) || 0,
        verifiedAt: new Date().toISOString(), complete: true,
        reason: safety ? 'pre-restore' : reason, appVersion, blob: pkg.blob,
        externalProtected: false, factoryResetProtected: false
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
      archive.externalProtected = external.some((item) => item.ok && item.key !== 'internal');
      archive.factoryResetProtected = external.some((item) => item.ok && (item.key === 'google' || item.key === 'onedrive'));
      archive.deliveryUpdatedAt = new Date().toISOString();
      await backupPut(ARCHIVE_STORE, archive);
      await renderHistory();
      const deliveryText = external.map((item) => `${item.label} ${item.ok ? '✓' : '✗'}${item.ok ? '' : ` ${item.message}`}`).join(' · ');
      const externalWarning = !safety && !archive.externalProtected
        ? '\n⚠ Copia presente solo nell’app: NON sopravvive a un reset di fabbrica. Esporta e conserva lo ZIP in iCloud Drive, Google Drive, OneDrive, PC o unità esterna (NON soltanto “Su iPad”).'
        : '';
      setStatus(`Backup completo OK · ${archive.filename}\n${humanBytes(archive.size)} · ${archive.recordCount} record · ${archive.imageCount} immagini · ${archive.audioCount} audio (${humanBytes(archive.audioBytes)}) · SHA-256 verificato${deliveryText ? `\n${deliveryText}` : ''}${externalWarning}`);
      setAppStatus('backup completato');
      return archive;
    } catch (err) {
      console.error('Backup Note iPad', err);
      setStatus(`Backup NON creato: ${err.message || err}`);
      setAppStatus('errore backup');
      return null;
    } finally {
      running = false;
    }
  }

  async function verifyLatest() {
    const latest = await getLatest();
    if (!latest) { setStatus('Nessun backup da verificare.'); return; }
    setStatus('Verifica completa in corso…');
    try {
      const result = await runBackupTask('verify', { blob:latest.blob });
      const backup = result.manifest?.backup || {};
      latest.verifiedAt = new Date().toISOString();
      latest.complete = result.isLegacy ? false : backup.complete === true;
      latest.imageCount = Number(backup.imageCount) || latest.imageCount || 0;
      latest.audioCount = Number(backup.audioCount) || latest.audioCount || 0;
      latest.audioBytes = Number(backup.audioBytes) || latest.audioBytes || 0;
      await backupPut(ARCHIVE_STORE, latest);
      await renderHistory();
      setStatus(`Backup integro ✓\n${latest.filename}\n${result.pages.count ?? result.pages.records?.length ?? 0} record · ${latest.imageCount} immagini · ${latest.audioCount} audio (${humanBytes(latest.audioBytes)}) · formato ${result.manifest.formatVersion}`);
    } catch (err) { setStatus(`Backup NON valido: ${err.message}`); }
  }

  async function renderHistory() {
    if (!history) return;
    const rows = await listArchives().catch(() => []);
    if (!rows.length) { history.innerHTML = '<div class="backup-empty">Nessun backup ancora archiviato.</div>'; return; }
    history.innerHTML = rows.map((row) => {
      const external = row.externalProtected || row.reason === 'imported';
      const resetSafe = row.factoryResetProtected === true;
      const safetyText = resetSafe ? 'Reset-safe ✓' : external ? 'Fuori app ✓ · sede da verificare ⚠' : 'Solo app ✗';
      const integrity = row.verifiedAt ? 'Verificato ✓' : 'Da verificare';
      return `
      <div class="backup-item" data-backup-id="${String(row.id).replace(/"/g, '&quot;')}">
        <div class="backup-item-main">
          <strong>${escapeHtml(row.filename)}</strong>
          <small>${new Date(row.createdAt).toLocaleString('it-IT')} · ${humanBytes(row.size)} · ${row.recordCount ?? '?'} record · ${row.imageCount ?? 0} immagini · ${row.audioCount ?? 0} audio · ${escapeHtml(row.reason)}</small>
          <div class="delivery-badges">
            <span class="delivery-badge ${row.verifiedAt ? 'ok' : 'fail'}">${integrity}</span>
            <span class="delivery-badge ${resetSafe ? 'ok' : external ? '' : 'fail'}">${safetyText}</span>
            ${(row.deliveries || []).map((d) => `<span class="delivery-badge ${d.ok ? 'ok' : 'fail'}" title="${escapeHtml(d.message)}">${escapeHtml(d.label)} ${d.ok ? '✓' : '✗'}</span>`).join('')}
          </div>
        </div>
        <div class="backup-item-actions"><button type="button" class="primary" data-backup-restore="1">Ripristina</button><button type="button" data-backup-export="1">Esporta</button><button type="button" data-backup-delete="1">Elimina</button></div>
      </div>`;
    }).join('');
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
    archive.externalProtected = true;
    archive.factoryResetProtected = archive.factoryResetProtected === true;
    archive.manualExportedAt = new Date().toISOString();
    archive.deliveries = [...(archive.deliveries || []).filter((item) => item.key !== 'manual-export'), { key:'manual-export', label:'Esportato', ok:true, message:'copia consegnata fuori dall’app' }];
    await backupPut(ARCHIVE_STORE, archive);
    await renderHistory();
    setStatus(`Backup esportato ✓\n${archive.filename}\nPer protezione da reset, verifica di averlo salvato in iCloud Drive, Google Drive, OneDrive, PC o unità esterna. Una copia in “Su iPad” viene cancellata dal reset.`);
  }

  async function importBackupFile(file) {
    if (!file) return null;
    if (running || restoring || recoveryBlocked) throw new Error('Backup/Ripristino già in corso');
    running = true;
    try {
    setStatus('Verifica completa del backup da importare…');
    const parsed = await runBackupTask('verify', { blob:file });
    const manifestBackup = parsed.manifest?.backup || {};
    await ensureInternalArchiveCapacity(file.size);
    const createdAt = parsed.manifest?.createdAt || new Date().toISOString();
    const id = `${createdAt}::import::${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const archive = {
      id,
      filename: file.name || `Note_iPad_import_${Date.now()}.zip`,
      createdAt,
      size: file.size,
      sha256: null,
      recordCount: parsed.pages?.records?.length || 0,
      formatVersion: Number(parsed.manifest?.formatVersion) || 0,
      imageCount: Number(manifestBackup.imageCount) || (parsed.mediaIndex?.items || []).filter((item) => item.type === 'image').length,
      audioCount: Number(manifestBackup.audioCount) || (parsed.audio?.recordings || []).length,
      audioBytes: Number(manifestBackup.audioBytes) || (parsed.mediaIndex?.items || []).filter((item) => item.type === 'audio' || item.type === 'audio-chunk').reduce((sum, item) => sum + (Number(item.size) || 0), 0),
      verifiedAt: new Date().toISOString(),
      complete: !parsed.isLegacy && parsed.manifest?.backup?.complete === true,
      reason: 'imported',
      appVersion: parsed.manifest?.createdBy?.appVersion || '',
      blob: file.slice(0, file.size, 'application/zip'),
      externalProtected: true,
      factoryResetProtected: false,
      deliveries: [{ key:'import', label:'ZIP importato', ok:true, message:'origine esterna verificata' }]
    };
    await backupPut(ARCHIVE_STORE, archive);
    await renderHistory();
    const legacyWarning = parsed.isLegacy ? '\n⚠ Backup formato 1: non garantisce l’inclusione dell’archivio audio.' : '';
    setStatus(`Backup importato e verificato ✓\n${archive.filename}\n${archive.recordCount} record · ${archive.imageCount} immagini · ${archive.audioCount} audio${legacyWarning}\nPremi Ripristina accanto a questo backup per applicarlo.`);
    return archive;
    } finally { running = false; }
  }

  async function restoreArchiveById(id) {
    const archive = await backupGet(ARCHIVE_STORE, id);
    if (!archive?.blob) throw new Error('Backup non disponibile nell’archivio locale');
    protectedArchiveId = id;
    try {
      const file = new File([archive.blob], archive.filename, { type:'application/zip', lastModified: Date.now() });
      return await restoreFromFile(file, 'local');
    } finally { protectedArchiveId = ''; }
  }

  async function writeRestoreJournal(value) {
    await backupPut(SETTINGS_STORE, { key: RESTORE_JOURNAL_KEY, ...value, modifiedAt: new Date().toISOString() });
  }

  async function clearRestoreJournal() {
    await backupDelete(SETTINGS_STORE, RESTORE_JOURNAL_KEY);
  }

  async function restoreBackupSettingsSnapshot(manifest) {
    const snapshot = manifest?.backupSettingsSnapshot;
    if (!snapshot || typeof snapshot !== 'object') return;
    config = cloneConfig({
      ...snapshot,
      destinations: { localFolder:false, googleDrive:false, oneDrive:false },
      lastBackupAt: null,
      lastBackupId: null
    });
    await backupPut(SETTINGS_STORE, { key:SETTINGS_KEY, value:config, modifiedAt:new Date().toISOString() });
  }

  function estimateRestoreFootprint(parsed, safetySize = 0) {
    const items = Array.isArray(parsed?.mediaIndex?.items) ? parsed.mediaIndex.items : [];
    let imageBytes = 0;
    let audioBytes = 0;
    let otherMediaBytes = 0;
    for (const item of items) {
      const size = Math.max(0, Number(item?.size) || 0);
      if (item?.type === 'image' || item?.type === 'clipboard-image') imageBytes += size;
      else if (item?.type === 'audio' || item?.type === 'audio-chunk') audioBytes += size;
      else otherMediaBytes += size;
    }
    const jsonBytes = ['data/pages.json','data/preferences.json','data/audio.json','data/clipboards.json','data/password-vault.json']
      .reduce((sum, path) => sum + Math.max(0, Number(parsed?.files?.get?.(path)?.size) || 0), 0);
    // Le immagini vengono reidratate come data URL nei record IndexedDB (~4/3 + overhead).
    // Audio/chunk restano Blob. Aggiungiamo margine per transazioni IndexedDB, metadati e copie temporanee WebKit.
    const hydratedTarget = (imageBytes * 1.5) + audioBytes + otherMediaBytes + (jsonBytes * 2.0);
    const targetReserve = Math.ceil(hydratedTarget * 1.35) + (64 * 1024 * 1024);
    const rollbackReserve = Math.ceil(Math.max(0, Number(safetySize) || 0) * 1.35) + (64 * 1024 * 1024);
    return { imageBytes, audioBytes, otherMediaBytes, jsonBytes, hydratedTarget, requiredFree: Math.max(targetReserve, rollbackReserve) };
  }

  async function ensureRestoreHeadroom(parsed, safety) {
    if (!navigator.storage?.estimate) return;
    const estimate = await navigator.storage.estimate().catch(() => null);
    if (!estimate?.quota || !Number.isFinite(estimate.usage)) return;
    const free = Math.max(0, Number(estimate.quota) - Number(estimate.usage));
    const footprint = estimateRestoreFootprint(parsed, safety?.size || safety?.blob?.size || 0);
    if (free >= footprint.requiredFree) return;
    throw new Error(
      `Spazio insufficiente per un ripristino sicuro. Disponibili ${humanBytes(free)}, ` +
      `richiesti almeno ${humanBytes(footprint.requiredFree)} per applicare il backup e mantenere margine di rollback. ` +
      `Libera spazio sull’iPad e riprova: nessun dato è stato modificato.`
    );
  }

  async function applyParsedBackup(parsed, details, globalRestore = false) {
    const records = parsed.pages?.records;
    if (!Array.isArray(records)) throw new Error('Archivio senza record delle pagine');
    await replaceMainRecords(mainDbName, mainStore, records);
    await replaceAudioDatabase(parsed.audio || { recordings:[], chunks:[], settings:[] });
    await replaceClipboardDatabases(parsed.clipboards || { imageCut:[], lasso:[] });
    await restoreSecurePasswordVaultBackup(parsed.passwordVault);
    replacePortablePreferences(parsed.preferences?.values || {});
    await restoreBackupSettingsSnapshot(parsed.manifest);
    if (globalRestore) await afterGlobalRestoreApplied(details);
    else await afterRestoreApplied(details);
  }

  async function rollbackFromSafety(safety, details) {
    if (!safety?.blob) throw new Error('Backup di sicurezza non disponibile per rollback');
    const safeParsed = await runBackupTask('verify', { blob:safety.blob });
    const rollbackDetails = { ...details, rollback: true, fileName: safety.filename, manifest: safeParsed.manifest, recordCount: safeParsed.pages?.records?.length || 0 };
    await replaceMainRecords(mainDbName, mainStore, safeParsed.pages?.records || []);
    await replaceAudioDatabase(safeParsed.audio || { recordings:[], chunks:[], settings:[] });
    await replaceClipboardDatabases(safeParsed.clipboards || { imageCut:[], lasso:[] });
    await restoreSecurePasswordVaultBackup(safeParsed.passwordVault);
    replacePortablePreferences(safeParsed.preferences?.values || {});
    await restoreBackupSettingsSnapshot(safeParsed.manifest);
    await afterRestoreApplied(rollbackDetails);
  }

  async function restoreFromFile(file, mode = 'local') {
    if (!file) return;
    if (!canStartRestore()) { setStatus('Completa il ripristino di gruppo in corso prima di applicare un altro backup.'); return; }
    if (restoring || running || recoveryBlocked) { setStatus('Backup/Ripristino già in corso.'); return; }
    restoring = true;
    const globalRestore = mode === 'group';
    let safety = null;
    let mutationStarted = false;
    let details = null;
    setStatus(globalRestore ? 'Verifica backup per ripristino globale…' : 'Verifica integrale del backup…');
    try {
      await waitForBackupIdle();
      const parsed = await runBackupTask('verify', { blob:file });
      const records = parsed.pages?.records;
      if (!Array.isArray(records)) throw new Error('Archivio senza record pagina');
      const imageCount = Number(parsed.manifest?.backup?.imageCount) || (parsed.mediaIndex?.items || []).filter((item) => item.type === 'image').length;
      const audioCount = Number(parsed.manifest?.backup?.audioCount) || (parsed.audio?.recordings || []).length;
      if (globalRestore) {
        const warning = window.confirm(
          `ATTENZIONE: RIPRISTINO DI TUTTO IL GRUPPO\n\n` +
          `Le pagine e immagini del backup ${file.name} diventeranno lo stato autorevole del gruppo selezionato.\nGli audio saranno ripristinati su questo iPad: il protocollo Sync attuale non li trasferisce agli altri dispositivi.\n` +
          `Contenuto verificato: ${records.length} record, ${imageCount} immagini, ${audioCount} audio.\n\n` +
          `Verrà creato prima un backup completo di sicurezza dello stato corrente.\n\nContinuare?`
        );
        if (!warning) return;
        const typed = window.prompt('Conferma operazione distruttiva: scrivi esattamente RIPRISTINA GRUPPO');
        if (String(typed || '').trim() !== 'RIPRISTINA GRUPPO') { setStatus('Ripristino globale annullato: conferma testuale non valida.'); return; }
      } else {
        const legacy = parsed.isLegacy ? '\n\nATTENZIONE: è un backup legacy e potrebbe non contenere registrazioni audio.' : '';
        const ok = window.confirm(`Ripristinare questo iPad da “${file.name}”?\n\n${records.length} record · ${imageCount} immagini · ${audioCount} audio.\nIl contenuto è stato verificato con SHA-256.\n\nVerrà creato prima un backup completo di sicurezza dello stato corrente.${legacy}`);
        if (!ok) return;
      }
      await waitForBackupIdle();
      restoreLockHeld = true;
      showSnapshotGuard();
      await setRestoreOperationLocked(true);
      safety = await createBackup(globalRestore ? 'pre-group-restore' : 'pre-restore', { safety: true });
      if (!safety) throw new Error('Backup completo di sicurezza pre-ripristino non riuscito: nessun dato è stato modificato');
      // Il safety backup appena creato resta protetto dalla retention/capacity pruning fino a fine restore.
      protectedArchiveId = safety.id;
      await ensureRestoreHeadroom(parsed, safety);
      details = { fileName: file.name, manifest: parsed.manifest, recordCount: records.length, imageCount, audioCount, restoreMode: globalRestore ? 'group' : 'local' };
      await writeRestoreJournal({ phase:'prepared', safetyBackupId:safety.id, targetFile:file.name, restoreMode:details.restoreMode, startedAt:new Date().toISOString() });
      await writeRestoreJournal({ phase:'applying', safetyBackupId:safety.id, targetFile:file.name, restoreMode:details.restoreMode, startedAt:new Date().toISOString() });
      mutationStarted = true;
      if (globalRestore) await beforeGlobalRestoreApplied(details);
      else await beforeRestoreApplied(details);
      await applyParsedBackup(parsed, details, globalRestore);
      await writeRestoreJournal({ phase:'committed', safetyBackupId:safety.id, targetFile:file.name, restoreMode:details.restoreMode, startedAt:new Date().toISOString(), committedAt:new Date().toISOString() });
      await clearRestoreJournal();
      recoveryBlocked = true;
      setStatus(globalRestore
        ? 'Ripristino globale completato e verificato. Pubblicazione protetta al riavvio…'
        : 'Ripristino completato ✓ · note, immagini, audio e preferenze ripristinati. Riavvio protetto…');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      console.error(globalRestore ? 'Ripristino globale' : 'Ripristino', err);
      if (mutationStarted && safety) {
        setStatus(`Errore durante il ripristino: ${err.message || err}\nRipristino automatico dello stato precedente in corso…`);
        try {
          await rollbackFromSafety(safety, details || { restoreMode:'rollback' });
          await clearRestoreJournal();
          recoveryBlocked = true;
          setStatus(`Ripristino NON applicato: ${err.message || err}\nLo stato precedente è stato ripristinato dal backup di sicurezza. Riavvio…`);
          setTimeout(() => location.reload(), 900);
          return;
        } catch (rollbackError) {
          recoveryBlocked = true;
          document.documentElement.dataset.restoreCritical = '1';
          showRecoveryActions(safety);
          setStatus(`ERRORE CRITICO DI RIPRISTINO\n${err.message || err}\nRollback automatico non riuscito: ${rollbackError.message || rollbackError}\nNON cancellare l’app: il backup di sicurezza resta nell’Archivio backup.`);
          return;
        }
      }
      await clearRestoreJournal();
      setStatus(`${globalRestore ? 'Ripristino globale' : 'Ripristino'} non riuscito: ${err.message || err}\nNessun dato è stato modificato.`);
    } finally {
      if (!recoveryBlocked) {
        restoreLockHeld = false;
        await setRestoreOperationLocked(false);
        hideSnapshotGuard();
        protectedArchiveId = '';
        restoring = false;
      }
    }
  }

  async function recoverInterruptedRestore() {
    const journal = await backupGet(SETTINGS_STORE, RESTORE_JOURNAL_KEY);
    if (!journal) return false;
    if (!journal.safetyBackupId) throw new Error('Journal ripristino incompleto: backup di sicurezza non identificato');
    if (journal.phase === 'prepared') {
      await clearRestoreJournal();
      setStatus('Ripristino precedente interrotto prima di modificare i dati: stato locale invariato.');
      return false;
    }
    if (journal.phase === 'committed') {
      await clearRestoreJournal();
      setStatus('Ripristino precedente già completato: journal finalizzato.');
      return false;
    }
    recoveryBlocked = true;
    restoreLockHeld = true;
    showSnapshotGuard();
    await setRestoreOperationLocked(true);
    const safety = await backupGet(ARCHIVE_STORE, journal.safetyBackupId).catch(() => null);
    if (!safety?.blob) {
      document.documentElement.dataset.restoreCritical = '1';
      showRecoveryActions();
      setStatus('ERRORE CRITICO: rilevato ripristino interrotto ma backup di sicurezza non disponibile. Non eseguire altre operazioni e conserva eventuali ZIP esterni.');
      return true;
    }
    try {
      setStatus('Rilevato ripristino interrotto: recupero automatico dello stato precedente…');
      const parsed = await runBackupTask('verify', { blob:safety.blob });
      await replaceMainRecords(mainDbName, mainStore, parsed.pages?.records || []);
      await replaceAudioDatabase(parsed.audio || { recordings:[], chunks:[], settings:[] });
      await replaceClipboardDatabases(parsed.clipboards || { imageCut:[], lasso:[] });
      await restoreSecurePasswordVaultBackup(parsed.passwordVault);
      replacePortablePreferences(parsed.preferences?.values || {});
      await restoreBackupSettingsSnapshot(parsed.manifest);
      await afterRestoreApplied({ recovery:true, fileName:safety.filename, manifest:parsed.manifest, recordCount:parsed.pages?.records?.length || 0 });
      await clearRestoreJournal();
      setStatus('Recupero dello stato precedente completato. Riavvio…');
      setTimeout(() => location.reload(), 600);
      return true;
    } catch (err) {
      document.documentElement.dataset.restoreCritical = '1';
      showRecoveryActions(safety);
      setStatus(`ERRORE CRITICO: recupero del ripristino interrotto non riuscito: ${err.message || err}`);
      return true;
    }
  }

  function scheduleDueCheck(reason = 'automatic') {
    clearTimeout(dueTimer);
    if (!config.backupOnStartup || config.frequency === 'off') return;
    const run = async () => {
      if (!canStartBackup() || isRealtimeBusy() || Date.now() - lastActivity < 3500) { dueTimer = setTimeout(run, 2500); return; }
      if (dueAt(config).getTime() > Date.now()) { dueTimer = setTimeout(run, 60000); return; }
      if (running || restoring || recoveryBlocked) { dueTimer = setTimeout(run, 30000); return; }
      const archive = await createBackup(reason);
      dueTimer = setTimeout(run, archive ? 60000 : 300000);
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
  bindAction(exportLatest, async () => { const latest = await getLatest(); latest ? exportArchiveById(latest.id).catch((e) => setStatus(e.message)) : setStatus('Nessun backup disponibile.'); });
  bindAction(backupNow, async () => { await saveConfig(); await createBackup('manual'); });
  bindAction(verifyButton, verifyLatest);
  bindAction(importButton, () => importInput.click());
  importInput?.addEventListener('change', async () => { const file = importInput.files?.[0]; importInput.value = ''; if (!file) return; try { await importBackupFile(file); } catch (err) { setStatus(`Importazione non riuscita: ${err.message || err}`); } });
  bindAction(restoreGroupButton, () => restoreGroupInput.click());
  restoreGroupInput?.addEventListener('change', () => { const file = restoreGroupInput.files?.[0]; restoreGroupInput.value = ''; restoreFromFile(file, 'group'); });

  async function handleHistoryAction(ev) {
    const button = ev.target instanceof Element ? ev.target.closest('button') : null;
    const row = ev.target instanceof Element ? ev.target.closest('[data-backup-id]') : null;
    if (!button || !row) return;
    if (running || restoring || recoveryBlocked) { setStatus('Attendi il completamento dell’operazione.'); return; }
    const id = row.dataset.backupId;
    if (button.dataset.backupRestore) await restoreArchiveById(id).catch((e) => setStatus(e.message));
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
  window.addEventListener('pointerdown', () => { lastActivity = Date.now(); }, { capture: true, passive: true });
  window.addEventListener('touchstart', () => { lastActivity = Date.now(); }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadConfig().then(() => scheduleDueCheck('automatic')).catch(() => {});
    }
  });

  const initialized = recoverInterruptedRestore().then(async (recovering) => {
    if (recovering) return true;
    await loadConfig();
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
    return false;
  }).catch((err) => {
    recoveryBlocked = true; restoreLockHeld = true;
    document.documentElement.dataset.restoreCritical = '1';
    showRecoveryActions();
    setStatus(`Avvio bloccato: impossibile verificare il ripristino precedente: ${err.message || err}`);
    return true;
  });

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

  return { importBackupFile, restoreArchiveById, restoreFromFile, initialized, isRecoveryBlocked: () => recoveryBlocked, openSettings, closeSettings, createBackup, verifyLatest, scheduleDueCheck, cloudBridge };
}
