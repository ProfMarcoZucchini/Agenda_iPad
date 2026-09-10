const te = new TextEncoder();
const td = new TextDecoder();

export const VAULT_CONFIG_KEY = 'password-vault-config-v1';
export const VAULT_DATA_KEY = 'password-vault-data-v1';
export const VAULT_LOCAL_AUTH_KEY = 'password-vault-local-auth-v1';
export const VAULT_LOCAL_STATE_KEY = 'password-vault-local-state-v1';
export const VAULT_SYNC_KEY = '::password-vault';
export const VAULT_SCHEMA_VERSION = 1;
export const VAULT_PIN_ITERATIONS = 600000;
const AUTO_LOCK_MS = 2 * 60 * 1000;

function randomBytes(length) {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

function bytesToB64url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(value) {
  const raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function clone(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

async function importAesKey(rawBytes, usages = ['encrypt', 'decrypt']) {
  const raw = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
  if (raw.byteLength !== 32) throw new Error('Chiave vault non valida');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages);
}

async function derivePinKey(pin, saltBytes, iterations = VAULT_PIN_ITERATIONS) {
  if (!/^\d{4}$/.test(String(pin || ''))) throw new Error('Il codice deve contenere esattamente 4 cifre');
  const baseKey = await crypto.subtle.importKey('raw', te.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: Math.max(100000, Number(iterations) || VAULT_PIN_ITERATIONS), hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function aesEncryptBytes(key, plaintextBytes, aadText) {
  const iv = randomBytes(12);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(String(aadText || '')) },
    key,
    plaintextBytes
  ));
  return { alg: 'AES-256-GCM', iv: bytesToB64url(iv), ciphertext: bytesToB64url(ciphertext), aadVersion: 1 };
}

async function aesDecryptBytes(key, envelope, aadText) {
  if (!envelope || envelope.alg !== 'AES-256-GCM') throw new Error('Formato cifratura vault non supportato');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlToBytes(envelope.iv), additionalData: te.encode(String(aadText || '')) },
    key,
    b64urlToBytes(envelope.ciphertext)
  );
  return new Uint8Array(plaintext);
}

function wrapAad(vaultId, purpose) {
  return `Agenda iPad Password Vault|v1|${String(vaultId || '')}|${String(purpose || '')}`;
}

export async function createVaultMaterial(pin) {
  const vaultId = `vault-${bytesToB64url(randomBytes(18))}`;
  const masterKeyBytes = randomBytes(32);
  const pinSalt = randomBytes(24);
  const pinKey = await derivePinKey(pin, pinSalt, VAULT_PIN_ITERATIONS);
  const pinWrap = await aesEncryptBytes(pinKey, masterKeyBytes, wrapAad(vaultId, 'pin-wrap'));
  const createdAt = new Date().toISOString();
  const configRow = {
    key: VAULT_CONFIG_KEY,
    schemaVersion: VAULT_SCHEMA_VERSION,
    vaultId,
    pinKdf: { name: 'PBKDF2-SHA256', iterations: VAULT_PIN_ITERATIONS, salt: bytesToB64url(pinSalt) },
    pinWrap,
    createdAt,
    modifiedAt: createdAt
  };
  const dataRow = await encryptVaultEntries(masterKeyBytes, vaultId, [], 1);
  return { masterKeyBytes, configRow, dataRow };
}

export async function unwrapMasterKeyWithPin(configRow, pin) {
  if (!isPortableVaultRow(configRow) || configRow.key !== VAULT_CONFIG_KEY) throw new Error('Configurazione rubrica non valida');
  const salt = b64urlToBytes(configRow.pinKdf?.salt);
  const key = await derivePinKey(pin, salt, configRow.pinKdf?.iterations);
  const raw = await aesDecryptBytes(key, configRow.pinWrap, wrapAad(configRow.vaultId, 'pin-wrap'));
  if (raw.byteLength !== 32) throw new Error('Chiave rubrica non valida');
  return raw;
}

export async function rewrapMasterKeyWithPin(configRow, masterKeyBytes, newPin) {
  const salt = randomBytes(24);
  const pinKey = await derivePinKey(newPin, salt, VAULT_PIN_ITERATIONS);
  const pinWrap = await aesEncryptBytes(pinKey, masterKeyBytes, wrapAad(configRow.vaultId, 'pin-wrap'));
  return {
    ...portableVaultRow(configRow),
    pinKdf: { name: 'PBKDF2-SHA256', iterations: VAULT_PIN_ITERATIONS, salt: bytesToB64url(salt) },
    pinWrap,
    modifiedAt: new Date().toISOString()
  };
}

export async function encryptVaultEntries(masterKeyBytes, vaultId, entries, revision = 1) {
  const key = await importAesKey(masterKeyBytes);
  const rev = Math.max(1, Number(revision) || 1);
  const payload = te.encode(JSON.stringify({ schemaVersion: VAULT_SCHEMA_VERSION, entries: clone(entries || []) }));
  const envelope = await aesEncryptBytes(key, payload, wrapAad(vaultId, `data:${rev}`));
  return {
    key: VAULT_DATA_KEY,
    schemaVersion: VAULT_SCHEMA_VERSION,
    vaultId: String(vaultId || ''),
    revision: rev,
    envelope,
    modifiedAt: new Date().toISOString()
  };
}

export async function decryptVaultEntries(masterKeyBytes, dataRow) {
  if (!isPortableVaultRow(dataRow) || dataRow.key !== VAULT_DATA_KEY) throw new Error('Archivio password non valido');
  const key = await importAesKey(masterKeyBytes);
  const plain = await aesDecryptBytes(key, dataRow.envelope, wrapAad(dataRow.vaultId, `data:${dataRow.revision}`));
  const parsed = JSON.parse(td.decode(plain));
  if (Number(parsed?.schemaVersion) !== VAULT_SCHEMA_VERSION || !Array.isArray(parsed?.entries)) throw new Error('Contenuto rubrica non compatibile');
  return parsed.entries;
}

function safeEnvelope(value) {
  if (!value || value.alg !== 'AES-256-GCM') return null;
  if (!/^[A-Za-z0-9_-]+$/.test(String(value.iv || '')) || !/^[A-Za-z0-9_-]+$/.test(String(value.ciphertext || ''))) return null;
  return { alg: 'AES-256-GCM', iv: String(value.iv), ciphertext: String(value.ciphertext), aadVersion: 1 };
}

export function portableVaultRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.key === VAULT_CONFIG_KEY) {
    const pinWrap = safeEnvelope(row.pinWrap);
    if (!pinWrap || !row.vaultId || !row.pinKdf?.salt) return null;
    return {
      key: VAULT_CONFIG_KEY,
      schemaVersion: VAULT_SCHEMA_VERSION,
      vaultId: String(row.vaultId),
      pinKdf: {
        name: 'PBKDF2-SHA256',
        iterations: Math.max(100000, Number(row.pinKdf.iterations) || VAULT_PIN_ITERATIONS),
        salt: String(row.pinKdf.salt)
      },
      pinWrap,
      createdAt: String(row.createdAt || ''),
      modifiedAt: String(row.modifiedAt || '')
    };
  }
  if (row.key === VAULT_DATA_KEY) {
    const envelope = safeEnvelope(row.envelope);
    if (!envelope || !row.vaultId) return null;
    return {
      key: VAULT_DATA_KEY,
      schemaVersion: VAULT_SCHEMA_VERSION,
      vaultId: String(row.vaultId),
      revision: Math.max(1, Number(row.revision) || 1),
      envelope,
      modifiedAt: String(row.modifiedAt || '')
    };
  }
  return null;
}

export function isPortableVaultRow(row) {
  return Boolean(portableVaultRow(row));
}

export function buildVaultBackupPayload(rows) {
  const byKey = new Map((rows || []).map((row) => [row?.key, portableVaultRow(row)]));
  const config = byKey.get(VAULT_CONFIG_KEY);
  const data = byKey.get(VAULT_DATA_KEY);
  if (!config || !data) return null;
  if (config.vaultId !== data.vaultId) throw new Error('Rubrica cifrata incoerente');
  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    encrypted: true,
    encryption: 'AES-256-GCM',
    keyProtection: 'PBKDF2-SHA256 + AES-256-GCM',
    config,
    data
  };
}

export function rowsFromVaultBackupPayload(payload) {
  if (!payload) return [];
  if (Number(payload.schemaVersion) !== VAULT_SCHEMA_VERSION || payload.encrypted !== true) throw new Error('Rubrica password del backup non compatibile');
  const config = portableVaultRow(payload.config);
  const data = portableVaultRow(payload.data);
  if (!config || !data || config.vaultId !== data.vaultId) throw new Error('Rubrica password cifrata del backup non valida');
  return [config, data];
}

function sanitizeEntry(entry = {}) {
  const id = String(entry.id || crypto.randomUUID?.() || `pw-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return {
    id,
    service: String(entry.service || '').slice(0, 200),
    username: String(entry.username || '').slice(0, 300),
    password: String(entry.password || '').slice(0, 2000),
    notes: String(entry.notes || '').slice(0, 4000),
    createdAt: String(entry.createdAt || new Date().toISOString()),
    modifiedAt: String(entry.modifiedAt || new Date().toISOString())
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => String(a.service || '').localeCompare(String(b.service || ''), 'it', { sensitivity: 'base' }) || String(a.username || '').localeCompare(String(b.username || ''), 'it', { sensitivity: 'base' }));
}

async function platformAuthenticatorAvailable() {
  try {
    return Boolean(globalThis.PublicKeyCredential && navigator.credentials && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch { return false; }
}

async function getPrfSecret(credentialId, prfSalt) {
  const idBytes = b64urlToBytes(credentialId);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: idBytes, transports: ['internal'] }],
      userVerification: 'required',
      extensions: { prf: { evalByCredential: { [credentialId]: { first: prfSalt.buffer.slice(prfSalt.byteOffset, prfSalt.byteOffset + prfSalt.byteLength) } } } }
    }
  });
  const output = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
  if (!output) throw new Error('PRF biometrica non disponibile su questo iPad/Safari');
  const secret = new Uint8Array(output);
  if (secret.byteLength !== 32) throw new Error('Chiave biometrica non valida');
  return secret;
}

async function createBiometricWrapper(masterKeyBytes, vaultId) {
  if (!await platformAuthenticatorAvailable()) throw new Error('Autenticazione biometrica WebAuthn non disponibile');
  const prfSalt = randomBytes(32);
  const userId = randomBytes(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Agenda iPad' },
      user: { id: userId, name: `agenda-vault-${vaultId.slice(-10)}`, displayName: 'Rubrica Password Agenda iPad' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      extensions: { prf: { eval: { first: prfSalt.buffer.slice(prfSalt.byteOffset, prfSalt.byteOffset + prfSalt.byteLength) } } }
    }
  });
  if (!credential?.rawId) throw new Error('Credenziale biometrica non creata');
  const credentialId = bytesToB64url(new Uint8Array(credential.rawId));
  let prfOutput = credential.getClientExtensionResults?.()?.prf?.results?.first;
  let secret = prfOutput ? new Uint8Array(prfOutput) : null;
  if (!secret || secret.byteLength !== 32) secret = await getPrfSecret(credentialId, prfSalt);
  const wrappingKey = await importAesKey(secret);
  secret.fill(0);
  const wrap = await aesEncryptBytes(wrappingKey, masterKeyBytes, wrapAad(vaultId, 'biometric-wrap'));
  return {
    key: VAULT_LOCAL_AUTH_KEY,
    schemaVersion: VAULT_SCHEMA_VERSION,
    vaultId,
    credentialId,
    prfSalt: bytesToB64url(prfSalt),
    wrap,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  };
}

async function unwrapMasterKeyWithBiometric(configRow, localAuthRow) {
  if (!localAuthRow?.credentialId || !localAuthRow?.prfSalt || !localAuthRow?.wrap) throw new Error('Biometria non configurata per questa rubrica');
  if (String(localAuthRow.vaultId) !== String(configRow.vaultId)) throw new Error('Associazione biometrica non valida per questa rubrica');
  const prfSalt = b64urlToBytes(localAuthRow.prfSalt);
  const secret = await getPrfSecret(localAuthRow.credentialId, prfSalt);
  const wrappingKey = await importAesKey(secret);
  secret.fill(0);
  const raw = await aesDecryptBytes(wrappingKey, localAuthRow.wrap, wrapAad(configRow.vaultId, 'biometric-wrap'));
  if (raw.byteLength !== 32) throw new Error('Chiave rubrica biometrica non valida');
  return raw;
}

export function initPasswordVault(options = {}) {
  const getRow = typeof options.getRow === 'function' ? options.getRow : async () => null;
  const putLocalRow = typeof options.putLocalRow === 'function' ? options.putLocalRow : async () => {};
  const deleteLocalRow = typeof options.deleteLocalRow === 'function' ? options.deleteLocalRow : async () => {};
  const commitPortableRows = typeof options.commitPortableRows === 'function' ? options.commitPortableRows : async () => {};
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  const onOpen = typeof options.onOpen === 'function' ? options.onOpen : () => {};
  const onClose = typeof options.onClose === 'function' ? options.onClose : () => {};

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const keyButton = document.getElementById('passwordVaultButton');
  const panel = document.getElementById('passwordVaultPanel');
  const closeButton = document.getElementById('passwordVaultCloseButton');
  const lockButton = document.getElementById('passwordVaultLockButton');
  const setupView = document.getElementById('passwordVaultSetup');
  const unlockView = document.getElementById('passwordVaultUnlock');
  const unlockedView = document.getElementById('passwordVaultUnlocked');
  const setupPin = document.getElementById('passwordVaultSetupPin');
  const setupPinConfirm = document.getElementById('passwordVaultSetupPinConfirm');
  const createButton = document.getElementById('passwordVaultCreateButton');
  const pinInput = document.getElementById('passwordVaultPin');
  const pinUnlockButton = document.getElementById('passwordVaultPinUnlockButton');
  const biometricUnlockButton = document.getElementById('passwordVaultBiometricUnlockButton');
  const biometricSetupButton = document.getElementById('passwordVaultBiometricSetupButton');
  const securityStatus = document.getElementById('passwordVaultSecurityStatus');
  const vaultStatus = document.getElementById('passwordVaultStatus');
  const azBar = document.getElementById('passwordVaultAz');
  const page = document.getElementById('passwordVaultPage');
  const canvas = document.getElementById('passwordVaultCanvas');
  const undoButton = document.getElementById('passwordVaultUndoButton');
  const ctx = canvas?.getContext?.('2d', { alpha:true, desynchronized:true }) || null;

  let configRow = null;
  let dataRow = null;
  let localAuthRow = null;
  let masterKeyBytes = null;
  let notebook = emptyNotebook();
  let legacyEntries = [];
  let activeLetter = 'A';
  let activeStroke = null;
  let activeTouchId = null;
  let autoLockTimer = 0;
  let destroyed = false;
  let lastKeyDirectOpenAt = -Infinity;
  let lastPenPointerAt = -Infinity;
  let resizeObserver = null;
  let saveChain = Promise.resolve();
  let toastTimer = 0;

  function emptyNotebook() {
    return { version:1, pages:Object.fromEntries(LETTERS.map((letter) => [letter, []])) };
  }

  function sanitizePoint(point = {}) {
    return {
      x:Math.max(0, Math.min(1, Number(point.x) || 0)),
      y:Math.max(0, Math.min(1, Number(point.y) || 0)),
      p:Math.max(0, Math.min(1, Number(point.p) || 0.5))
    };
  }

  function sanitizeStroke(stroke = {}) {
    const points = Array.isArray(stroke.points) ? stroke.points.slice(0, 30000).map(sanitizePoint) : [];
    return {
      id:String(stroke.id || crypto.randomUUID?.() || `rv-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      points,
      createdAt:String(stroke.createdAt || new Date().toISOString())
    };
  }

  function sanitizeNotebook(value) {
    const out = emptyNotebook();
    const pages = value?.pages && typeof value.pages === 'object' ? value.pages : {};
    for (const letter of LETTERS) {
      const strokes = Array.isArray(pages[letter]) ? pages[letter] : [];
      out.pages[letter] = strokes.slice(0, 10000).map(sanitizeStroke).filter((stroke) => stroke.points.length > 0);
    }
    return out;
  }

  async function decryptPayload(rawKey, row) {
    if (!isPortableVaultRow(row) || row.key !== VAULT_DATA_KEY) throw new Error('Archivio rubrica non valido');
    const key = await importAesKey(rawKey);
    const plain = await aesDecryptBytes(key, row.envelope, wrapAad(row.vaultId, `data:${row.revision}`));
    const parsed = JSON.parse(td.decode(plain));
    if (Number(parsed?.schemaVersion) !== VAULT_SCHEMA_VERSION) throw new Error('Contenuto rubrica non compatibile');
    return parsed;
  }

  async function encryptPayload(rawKey, vaultId, payload, revision) {
    const key = await importAesKey(rawKey);
    const rev = Math.max(1, Number(revision) || 1);
    const body = te.encode(JSON.stringify({ schemaVersion:VAULT_SCHEMA_VERSION, ...payload }));
    const envelope = await aesEncryptBytes(key, body, wrapAad(vaultId, `data:${rev}`));
    return {
      key:VAULT_DATA_KEY,
      schemaVersion:VAULT_SCHEMA_VERSION,
      vaultId:String(vaultId || ''),
      revision:rev,
      envelope,
      modifiedAt:new Date().toISOString()
    };
  }

  function sanitizePinControl(control) {
    if (!control) return;
    const filtered = String(control.value || '').replace(/\D+/g, '').slice(0, 4);
    if (control.value !== filtered) control.value = filtered;
  }

  function bindFullKeyboardPin(control) {
    if (!control) return;
    control.setAttribute('inputmode', 'text');
    control.removeAttribute('pattern');
    control.setAttribute('autocapitalize', 'off');
    control.setAttribute('autocorrect', 'off');
    control.setAttribute('spellcheck', 'false');
    control.addEventListener('input', () => sanitizePinControl(control));
  }

  function setStatus(message, transient = false) {
    const text = String(message || '');
    if (vaultStatus) {
      vaultStatus.textContent = text;
      vaultStatus.classList.toggle('visible', Boolean(text));
      clearTimeout(toastTimer);
      if (transient && masterKeyBytes) toastTimer = setTimeout(() => vaultStatus.classList.remove('visible'), 1800);
    }
    try { onStatus(text); } catch {}
  }

  function clearSecretInputs() {
    if (pinInput) pinInput.value = '';
    if (setupPin) setupPin.value = '';
    if (setupPinConfirm) setupPinConfirm.value = '';
  }

  function armAutoLock() {
    clearTimeout(autoLockTimer);
    if (!masterKeyBytes) return;
    autoLockTimer = setTimeout(() => void lock('timeout'), AUTO_LOCK_MS);
  }

  async function refreshRows() {
    configRow = await getRow(VAULT_CONFIG_KEY).catch(() => null);
    dataRow = await getRow(VAULT_DATA_KEY).catch(() => null);
    localAuthRow = await getRow(VAULT_LOCAL_AUTH_KEY).catch(() => null);
    if (localAuthRow && configRow && localAuthRow.vaultId !== configRow.vaultId) {
      await deleteLocalRow(VAULT_LOCAL_AUTH_KEY).catch(() => {});
      localAuthRow = null;
    }
  }

  function renderMode() {
    const initialized = Boolean(configRow && dataRow);
    const unlocked = Boolean(masterKeyBytes);
    if (setupView) setupView.hidden = initialized;
    if (unlockView) unlockView.hidden = !initialized || unlocked;
    if (unlockedView) unlockedView.hidden = !unlocked;
    if (lockButton) lockButton.hidden = !unlocked;
    if (biometricUnlockButton) biometricUnlockButton.hidden = !initialized || unlocked || !localAuthRow;
    if (biometricSetupButton) biometricSetupButton.hidden = !unlocked || Boolean(localAuthRow);
    if (securityStatus) {
      securityStatus.textContent = localAuthRow
        ? 'Impronta digitale / biometria già associata · PIN disponibile come alternativa.'
        : initialized ? 'PIN attivo · biometria non associata a questo dispositivo.' : '';
    }
    if (unlocked) {
      updateTabs();
      requestAnimationFrame(() => resizeCanvas(true));
    }
  }

  function updateTabs() {
    if (!azBar) return;
    for (const button of azBar.querySelectorAll('[data-vault-letter]')) {
      const selected = button.dataset.vaultLetter === activeLetter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    }
  }

  function canvasMetrics() {
    const rect = canvas?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : { left:0, top:0, width:1, height:1 };
  }

  function drawStroke(stroke) {
    if (!ctx || !stroke?.points?.length) return;
    const width = canvas.width;
    const height = canvas.height;
    const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    const pts = stroke.points;
    ctx.save();
    ctx.strokeStyle = '#24303a';
    ctx.fillStyle = '#24303a';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      const p = pts[0];
      const r = Math.max(1.05, 1.7 * (0.7 + p.p * 0.55)) * dpr;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.lineWidth = Math.max(1.4, 2.2 * (0.72 + ((a.p + b.p) * 0.5) * 0.5)) * dpr;
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPage() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of notebook.pages[activeLetter] || []) drawStroke(stroke);
  }

  function resizeCanvas(force = false) {
    if (!canvas || !ctx || unlockedView?.hidden) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (!force && canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    renderPage();
  }

  function pointFromClient(clientX, clientY, pressure = 0.5) {
    const rect = canvasMetrics();
    return sanitizePoint({
      x:(clientX - rect.left) / Math.max(1, rect.width),
      y:(clientY - rect.top) / Math.max(1, rect.height),
      p:Number.isFinite(pressure) && pressure > 0 ? pressure : 0.5
    });
  }

  function appendPoint(clientX, clientY, pressure = 0.5) {
    if (!activeStroke) return;
    const point = pointFromClient(clientX, clientY, pressure);
    const last = activeStroke.points.at(-1);
    const rect = canvasMetrics();
    if (last) {
      const dx = (point.x - last.x) * rect.width;
      const dy = (point.y - last.y) * rect.height;
      if (dx * dx + dy * dy < 0.20) return;
    }
    activeStroke.points.push(point);
    if (activeStroke.points.length === 1) drawStroke(activeStroke);
    else drawStroke({ points:[activeStroke.points.at(-2), activeStroke.points.at(-1)] });
  }

  function beginStroke(pointerId, clientX, clientY, pressure = 0.5, source = 'pointer') {
    if (!masterKeyBytes || activeStroke) return false;
    activeStroke = {
      id:String(crypto.randomUUID?.() || `rv-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      pointerId,
      source,
      points:[],
      createdAt:new Date().toISOString()
    };
    appendPoint(clientX, clientY, pressure);
    armAutoLock();
    return true;
  }

  async function persistNotebookSnapshot(snapshot) {
    if (!masterKeyBytes || !configRow || !dataRow) return;
    const keyCopy = new Uint8Array(masterKeyBytes);
    const baseRevision = Math.max(1, Number(dataRow.revision) || 1);
    saveChain = saveChain.then(async () => {
      try {
        const revision = Math.max(baseRevision + 1, Math.max(1, Number(dataRow?.revision) || 1) + 1);
        const encrypted = await encryptPayload(keyCopy, configRow.vaultId, {
          entries:clone(legacyEntries),
          notebook:snapshot
        }, revision);
        await commitPortableRows([encrypted]);
        dataRow = { ...encrypted };
      } finally {
        keyCopy.fill(0);
      }
    }).catch((err) => setStatus(`Salvataggio Rubrica non riuscito: ${err?.message || err}`));
    return saveChain;
  }

  function finishStroke(cancelled = false) {
    const stroke = activeStroke;
    activeStroke = null;
    activeTouchId = null;
    if (!stroke) return;
    if (cancelled || stroke.points.length < 1) {
      renderPage();
      return;
    }
    notebook.pages[activeLetter].push(sanitizeStroke(stroke));
    const snapshot = sanitizeNotebook(notebook);
    void persistNotebookSnapshot(snapshot);
    armAutoLock();
  }

  function handleCanvasPointerDown(ev) {
    if (!masterKeyBytes) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ev.pointerType === 'touch') return;
    if (ev.pointerType === 'pen') lastPenPointerAt = performance.now();
    if (!beginStroke(ev.pointerId, ev.clientX, ev.clientY, ev.pressure, 'pointer')) return;
    try { canvas?.setPointerCapture?.(ev.pointerId); } catch {}
    ev.preventDefault();
    ev.stopPropagation();
  }

  function handleCanvasPointerMove(ev) {
    if (!activeStroke) return;
    const compatible = activeStroke.source === 'touch' ? ev.pointerType === 'pen' : ev.pointerId === activeStroke.pointerId;
    if (!compatible) return;
    const samples = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [ev];
    for (const sample of samples.length ? samples : [ev]) appendPoint(sample.clientX, sample.clientY, sample.pressure);
    ev.preventDefault();
    ev.stopPropagation();
  }

  function handleCanvasPointerUp(ev, cancelled = false) {
    if (!activeStroke) return;
    const compatible = activeStroke.source === 'touch' ? ev.pointerType === 'pen' : ev.pointerId === activeStroke.pointerId;
    if (!compatible) return;
    appendPoint(ev.clientX, ev.clientY, ev.pressure);
    try { if (canvas?.hasPointerCapture?.(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId); } catch {}
    finishStroke(cancelled);
    ev.preventDefault();
    ev.stopPropagation();
  }

  function findTouch(list, id) {
    if (!list) return null;
    for (const touch of list) if (touch.identifier === id) return touch;
    return null;
  }

  function handleCanvasTouchStart(ev) {
    if (!masterKeyBytes || activeStroke || performance.now() - lastPenPointerAt < 180 || ev.touches?.length !== 1) return;
    const touch = ev.touches[0];
    if (touch.touchType && touch.touchType !== 'stylus') return;
    activeTouchId = touch.identifier;
    if (!beginStroke(`touch-${touch.identifier}`, touch.clientX, touch.clientY, touch.force, 'touch')) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  function handleCanvasTouchMove(ev) {
    if (!activeStroke || activeTouchId == null) return;
    const touch = findTouch(ev.touches, activeTouchId);
    if (!touch) return;
    appendPoint(touch.clientX, touch.clientY, touch.force);
    ev.preventDefault();
    ev.stopPropagation();
  }

  function handleCanvasTouchEnd(ev, cancelled = false) {
    if (!activeStroke || activeTouchId == null) return;
    const touch = findTouch(ev.changedTouches, activeTouchId);
    if (touch) appendPoint(touch.clientX, touch.clientY, touch.force);
    finishStroke(cancelled);
    ev.preventDefault();
    ev.stopPropagation();
  }

  function selectLetter(letter) {
    if (!LETTERS.includes(letter) || letter === activeLetter) return;
    if (activeStroke) finishStroke(false);
    activeLetter = letter;
    updateTabs();
    renderPage();
    armAutoLock();
  }

  function undoLastStroke() {
    if (!masterKeyBytes) return;
    const pageStrokes = notebook.pages[activeLetter] || [];
    if (!pageStrokes.length) return setStatus(`Pagina ${activeLetter} già vuota.`, true);
    pageStrokes.pop();
    renderPage();
    void persistNotebookSnapshot(sanitizeNotebook(notebook));
    setStatus('Ultimo tratto annullato.', true);
    armAutoLock();
  }

  async function readLocalSecurityState() {
    return await getRow(VAULT_LOCAL_STATE_KEY).catch(() => null) || { key:VAULT_LOCAL_STATE_KEY, failedAttempts:0, lockedUntil:0 };
  }

  async function notePinFailure() {
    const state = await readLocalSecurityState();
    const failedAttempts = Math.max(0, Number(state.failedAttempts) || 0) + 1;
    let waitMs = 0;
    if (failedAttempts >= 8) waitMs = 5 * 60 * 1000;
    else if (failedAttempts >= 5) waitMs = 30 * 1000;
    const row = { key:VAULT_LOCAL_STATE_KEY, failedAttempts, lockedUntil:waitMs ? Date.now() + waitMs : 0, modifiedAt:new Date().toISOString() };
    await putLocalRow(row).catch(() => {});
    return row;
  }

  async function clearPinFailures() {
    await putLocalRow({ key:VAULT_LOCAL_STATE_KEY, failedAttempts:0, lockedUntil:0, modifiedAt:new Date().toISOString() }).catch(() => {});
  }

  async function ensurePinAllowed() {
    const state = await readLocalSecurityState();
    const until = Math.max(0, Number(state.lockedUntil) || 0);
    if (until > Date.now()) throw new Error(`Troppi tentativi errati. Riprova tra ${Math.ceil((until - Date.now()) / 1000)} s.`);
  }

  async function unlockWithMasterKey(rawKey, method) {
    const payload = await decryptPayload(rawKey, dataRow);
    if (masterKeyBytes) masterKeyBytes.fill(0);
    masterKeyBytes = new Uint8Array(rawKey);
    legacyEntries = Array.isArray(payload.entries) ? clone(payload.entries) : [];
    notebook = sanitizeNotebook(payload.notebook);
    activeLetter = 'A';
    renderMode();
    armAutoLock();
    setStatus(`Rubrica sbloccata con ${method}.`, true);
  }

  async function unlockPin() {
    try {
      await ensurePinAllowed();
      const pin = String(pinInput?.value || '');
      if (!/^\d{4}$/.test(pin)) throw new Error('Inserisci le 4 cifre del PIN');
      const raw = await unwrapMasterKeyWithPin(configRow, pin);
      await clearPinFailures();
      if (pinInput) pinInput.value = '';
      await unlockWithMasterKey(raw, 'PIN');
      raw.fill(0);
    } catch (err) {
      if (!String(err?.message || '').startsWith('Troppi tentativi')) await notePinFailure();
      setStatus(`Accesso non riuscito: ${err?.message || err}`);
    }
  }

  async function unlockBiometric() {
    try {
      if (!localAuthRow) throw new Error('Biometria non configurata su questo dispositivo');
      const raw = await unwrapMasterKeyWithBiometric(configRow, localAuthRow);
      await unlockWithMasterKey(raw, 'biometria');
      raw.fill(0);
    } catch (err) {
      if (err?.name === 'NotAllowedError') setStatus('Accesso biometrico annullato. Puoi usare il PIN.');
      else setStatus(`Biometria non disponibile: ${err?.message || err}`);
    }
  }

  async function setupVault() {
    try {
      const pin = String(setupPin?.value || '');
      const confirm = String(setupPinConfirm?.value || '');
      if (!/^\d{4}$/.test(pin)) throw new Error('Il PIN deve contenere esattamente 4 cifre');
      if (pin !== confirm) throw new Error('I due PIN non coincidono');
      const material = await createVaultMaterial(pin);
      await commitPortableRows([material.configRow, material.dataRow]);
      configRow = { ...material.configRow };
      dataRow = { ...material.dataRow };
      await unlockWithMasterKey(material.masterKeyBytes, 'nuovo PIN');
      material.masterKeyBytes.fill(0);
      clearSecretInputs();
    } catch (err) { setStatus(`Creazione Rubrica non riuscita: ${err?.message || err}`); }
  }

  async function enableBiometric() {
    try {
      if (!masterKeyBytes || !configRow) throw new Error('Sblocca prima la Rubrica con il PIN');
      setStatus('Conferma l’autenticazione biometrica di iPadOS…');
      const row = await createBiometricWrapper(masterKeyBytes, configRow.vaultId);
      await putLocalRow(row);
      localAuthRow = row;
      renderMode();
      setStatus('Impronta digitale / biometria associata.', true);
    } catch (err) {
      if (err?.name === 'NotAllowedError') setStatus('Configurazione biometrica annullata.');
      else setStatus(`Biometria non configurata: ${err?.message || err}`);
    }
  }

  async function lock(reason = 'manual') {
    clearTimeout(autoLockTimer);
    if (activeStroke) finishStroke(false);
    const pending = saveChain;
    if (masterKeyBytes) masterKeyBytes.fill(0);
    masterKeyBytes = null;
    notebook = emptyNotebook();
    legacyEntries = [];
    clearSecretInputs();
    renderMode();
    try { await pending; } catch {}
    if (reason === 'timeout') setStatus('Rubrica bloccata automaticamente.');
    else if (reason === 'background') setStatus('Rubrica bloccata.');
    else setStatus('Rubrica protetta.');
  }

  async function open() {
    if (destroyed || !panel) return;
    await refreshRows();
    try { onOpen(); } catch {}
    panel.hidden = false;
    renderMode();
    if (masterKeyBytes) {
      armAutoLock();
      requestAnimationFrame(() => resizeCanvas(true));
    } else {
      setStatus(configRow && dataRow ? 'Accedi con impronta digitale / biometria oppure PIN.' : 'Prima configurazione: crea il PIN di 4 cifre.');
      setTimeout(() => (configRow && dataRow ? pinInput : setupPin)?.focus?.({ preventScroll:true }), 50);
    }
  }

  async function close() {
    if (!panel) return;
    await lock('manual');
    panel.hidden = true;
    try { onClose(); } catch {}
  }

  async function handleRemoteUpdate(key) {
    if (key !== VAULT_CONFIG_KEY && key !== VAULT_DATA_KEY) return;
    await refreshRows();
    if (masterKeyBytes) await lock('remote');
    setStatus('Rubrica aggiornata dal Sync. Accedi nuovamente.');
  }

  function bindDirectAction(element, action) {
    if (!element) return;
    let lastDirect = -Infinity;
    element.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;
      lastDirect = performance.now();
      ev.preventDefault();
      ev.stopPropagation();
      action(ev);
    }, { passive:false });
    element.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (performance.now() - lastDirect < 650) return;
      action(ev);
    });
  }

  bindFullKeyboardPin(setupPin);
  bindFullKeyboardPin(setupPinConfirm);
  bindFullKeyboardPin(pinInput);

  keyButton?.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    lastKeyDirectOpenAt = performance.now();
    ev.preventDefault();
    ev.stopPropagation();
    void open();
  }, { passive:false });
  keyButton?.addEventListener('pointerup', (ev) => {
    if (ev.pointerType === 'mouse') return;
    ev.preventDefault();
    ev.stopPropagation();
  }, { passive:false });
  keyButton?.addEventListener('touchstart', (ev) => {
    if (performance.now() - lastKeyDirectOpenAt < 220) { ev.preventDefault(); ev.stopPropagation(); return; }
    lastKeyDirectOpenAt = performance.now();
    ev.preventDefault();
    ev.stopPropagation();
    void open();
  }, { passive:false });
  keyButton?.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (performance.now() - lastKeyDirectOpenAt < 650) return;
    void open();
  });

  bindDirectAction(closeButton, () => void close());
  bindDirectAction(lockButton, () => void lock('manual'));
  bindDirectAction(createButton, () => void setupVault());
  bindDirectAction(pinUnlockButton, () => void unlockPin());
  bindDirectAction(biometricUnlockButton, () => void unlockBiometric());
  bindDirectAction(biometricSetupButton, () => void enableBiometric());
  bindDirectAction(undoButton, () => undoLastStroke());
  pinInput?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); void unlockPin(); } });

  if (azBar) for (const button of azBar.querySelectorAll('[data-vault-letter]')) {
    bindDirectAction(button, () => selectLetter(String(button.dataset.vaultLetter || 'A')));
  }

  canvas?.addEventListener('pointerdown', handleCanvasPointerDown, { passive:false });
  canvas?.addEventListener('pointermove', handleCanvasPointerMove, { passive:false });
  canvas?.addEventListener('pointerup', (ev) => handleCanvasPointerUp(ev, false), { passive:false });
  canvas?.addEventListener('pointercancel', (ev) => handleCanvasPointerUp(ev, true), { passive:false });
  canvas?.addEventListener('touchstart', handleCanvasTouchStart, { passive:false });
  canvas?.addEventListener('touchmove', handleCanvasTouchMove, { passive:false });
  canvas?.addEventListener('touchend', (ev) => handleCanvasTouchEnd(ev, false), { passive:false });
  canvas?.addEventListener('touchcancel', (ev) => handleCanvasTouchEnd(ev, true), { passive:false });

  panel?.addEventListener('pointerdown', armAutoLock, { passive:true });
  panel?.addEventListener('keydown', armAutoLock, { passive:true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && masterKeyBytes) void lock('background'); });

  if (typeof ResizeObserver !== 'undefined' && page) {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(page);
  }
  globalThis.visualViewport?.addEventListener?.('resize', () => resizeCanvas());
  globalThis.addEventListener?.('orientationchange', () => setTimeout(() => resizeCanvas(true), 60));

  void refreshRows().then(renderMode);

  return {
    open,
    close,
    lock,
    isUnlocked:() => Boolean(masterKeyBytes),
    isWriting:() => Boolean(activeStroke),
    handleRemoteUpdate,
    refresh:async () => { await refreshRows(); renderMode(); },
    destroy:() => { destroyed = true; resizeObserver?.disconnect?.(); void lock('manual'); }
  };
}
