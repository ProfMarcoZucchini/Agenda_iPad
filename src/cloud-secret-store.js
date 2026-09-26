const DB_NAME = 'AgendaCloudSecretsDB';
const DB_VERSION = 1;
const KEY_STORE = 'keys';
const SECRET_STORE = 'secrets';
const WRAP_KEY_ID = 'device-wrap-key-v1';
const JOIN_CODE_ID = 'cloud-join-code-v1';
const te = new TextEncoder();
const td = new TextDecoder();

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SECRET_STORE)) db.createObjectStore(SECRET_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Database segreti Cloud non disponibile.'));
  });
}

function txRequest(db, storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let req;
    try { req = action(store); } catch (err) { reject(err); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Operazione segreti Cloud non riuscita.'));
    tx.onabort = () => reject(tx.error || new Error('Transazione segreti Cloud annullata.'));
  });
}

async function getOrCreateWrapKey(db) {
  const existing = await txRequest(db, KEY_STORE, 'readonly', (s) => s.get(WRAP_KEY_ID)).catch(() => null);
  if (existing?.key instanceof CryptoKey) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await txRequest(db, KEY_STORE, 'readwrite', (s) => s.put({ id: WRAP_KEY_ID, key, createdAt: new Date().toISOString() }));
  return key;
}

export async function storeProtectedCloudJoinCode(joinCode) {
  const value = String(joinCode || '').trim();
  if (!value) return clearProtectedCloudJoinCode();
  const db = await openDb();
  try {
    const key = await getOrCreateWrapKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(value)));
    await txRequest(db, SECRET_STORE, 'readwrite', (s) => s.put({
      id: JOIN_CODE_ID,
      algorithm: 'AES-GCM',
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertext),
      updatedAt: new Date().toISOString()
    }));
  } finally {
    db.close();
  }
}

export async function loadProtectedCloudJoinCode() {
  const db = await openDb();
  try {
    const [row, keyRow] = await Promise.all([
      txRequest(db, SECRET_STORE, 'readonly', (s) => s.get(JOIN_CODE_ID)).catch(() => null),
      txRequest(db, KEY_STORE, 'readonly', (s) => s.get(WRAP_KEY_ID)).catch(() => null)
    ]);
    if (!row?.ciphertext || !(keyRow?.key instanceof CryptoKey)) return '';
    const iv = new Uint8Array(row.iv || []);
    const ciphertext = new Uint8Array(row.ciphertext || []);
    if (iv.length !== 12 || !ciphertext.length) return '';
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyRow.key, ciphertext);
    return td.decode(plain).trim();
  } finally {
    db.close();
  }
}

export async function clearProtectedCloudJoinCode() {
  const db = await openDb();
  try { await txRequest(db, SECRET_STORE, 'readwrite', (s) => s.delete(JOIN_CODE_ID)); }
  finally { db.close(); }
}
