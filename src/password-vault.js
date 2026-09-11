import { buildShapePoints as buildBaseShapePoints, SHAPE_TYPES as BASE_SHAPE_TYPES, SHAPE_LABELS as BASE_SHAPE_LABELS } from './shapes.js';
import { buildExtraShapePoints, EXTRA_SHAPE_TYPES, EXTRA_SHAPE_LABELS } from './extra-shapes.js';

const SHAPE_TYPES = Object.freeze([...BASE_SHAPE_TYPES, ...EXTRA_SHAPE_TYPES]);
const SHAPE_LABELS = Object.freeze({ ...BASE_SHAPE_LABELS, ...EXTRA_SHAPE_LABELS });
const buildShapePoints = (type, bounds) => EXTRA_SHAPE_TYPES.includes(type) ? buildExtraShapePoints(type, bounds) : buildBaseShapePoints(type, bounds);

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
  const onUnlocked = typeof options.onUnlocked === 'function' ? options.onUnlocked : async () => {};
  const onBeforeLock = typeof options.onBeforeLock === 'function' ? options.onBeforeLock : async () => {};
  const onLocked = typeof options.onLocked === 'function' ? options.onLocked : async () => {};
  const isExternalPageActive = typeof options.isExternalPageActive === 'function' ? options.isExternalPageActive : () => false;
  const onExternalExit = typeof options.onExternalExit === 'function' ? options.onExternalExit : async () => {};

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
  const toolbar = document.getElementById('passwordVaultToolbar');
  const toolPopover = document.getElementById('passwordVaultToolPopover');
  const shapePalette = document.getElementById('passwordVaultShapePalette');
  const stylePalette = document.getElementById('passwordVaultStylePalette');
  const imageInput = document.getElementById('passwordVaultImageInput');
  const ctx = canvas?.getContext?.('2d', { alpha:true, desynchronized:true }) || null;

  let configRow = null;
  let dataRow = null;
  let localAuthRow = null;
  let masterKeyBytes = null;
  let notebook = emptyNotebook();
  let legacyEntries = [];
  let activeLetter = 'A';
  let activeGesture = null;
  let activeTouchId = null;
  let autoLockTimer = 0;
  let destroyed = false;
  let lastKeyDirectOpenAt = -Infinity;
  let lastPenPointerAt = -Infinity;
  let resizeObserver = null;
  let saveChain = Promise.resolve();
  let toastTimer = 0;
  let notebookDirty = false;
  let changeSerial = 0;
  let biometricOpening = false;
  let locking = false;
  let activeTool = 'pen';
  let lastInkTool = 'pen';
  let activeShapeType = 'rectangle';
  let toolStyle = {
    pen:{ color:'#24303a', width:2.2 },
    highlighter:{ color:'#f0d84f', width:15 },
    eraser:{ width:22 },
    shape:{ color:'#24303a', width:2.2 },
    text:{ color:'#24303a', size:24 }
  };
  let selectionIds = new Set();
  let lassoPoints = [];
  let undoByLetter = Object.fromEntries(LETTERS.map((l) => [l, []]));
  let redoByLetter = Object.fromEntries(LETTERS.map((l) => [l, []]));
  const imageCache = new Map();

  function emptyNotebook() {
    return { version:3, pages:Object.fromEntries(LETTERS.map((letter) => [letter, []])), pageStyles:{} };
  }

  function sanitizePoint(point = {}) {
    const out = {
      x:Math.max(0, Math.min(1, Number(point.x) || 0)),
      y:Math.max(0, Math.min(1, Number(point.y) || 0)),
      p:Math.max(0, Math.min(1, Number(point.p) || 0.5))
    };
    if (Number.isFinite(Number(point.t))) out.t = Number(point.t);
    return out;
  }

  function newId(prefix = 'rv') {
    return String(crypto.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  function sanitizeItem(item = {}) {
    const kind = String(item.kind || (Array.isArray(item.points) ? 'stroke' : 'stroke'));
    const base = {
      id:String(item.id || newId('rv')),
      kind,
      createdAt:String(item.createdAt || new Date().toISOString()),
      modifiedAt:String(item.modifiedAt || item.createdAt || new Date().toISOString())
    };
    if (kind === 'image') {
      return {
        ...base, src:String(item.src || '').slice(0, 14000000), name:String(item.name || 'Immagine Rubrica').slice(0,300),
        mimeType:String(item.mimeType || '').slice(0,120), rotation:Number(item.rotation) || 0,
        x:Math.max(0, Math.min(1, Number(item.x) || 0)), y:Math.max(0, Math.min(1, Number(item.y) || 0)),
        w:Math.max(.02, Math.min(1, Number(item.w) || .32)), h:Math.max(.02, Math.min(1, Number(item.h) || .24))
      };
    }
    if (kind === 'text') {
      return {
        ...base, text:String(item.text || '').slice(0, 4000),
        tool:String(item.tool || 'voice-text'), source:String(item.source || ''),
        x:Math.max(0, Math.min(1, Number(item.x) || .12)), y:Math.max(0, Math.min(1, Number(item.y) || .14)),
        color:String(item.color || '#24303a'), size:Math.max(12, Math.min(72, Number(item.size) || 24)),
        fontFamily:String(item.fontFamily || 'Snell Roundhand'),
        fontSizeNorm:Math.max(.008, Math.min(.12, Number(item.fontSizeNorm) || ((Number(item.size) || 24) / 1366))),
        anchorMode:String(item.anchorMode || 'baseline')
      };
    }
    if (kind === 'shape') {
      const shapeType = SHAPE_TYPES.includes(item.shapeType) ? item.shapeType : 'rectangle';
      const rawPoints = Array.isArray(item.points) ? item.points.slice(0, 30000).map(sanitizePoint) : [];
      if (rawPoints.length) {
        return {
          ...base, shapeType, shapeVersion:Number(item.shapeVersion) || 1, tool:'pen', points:rawPoints,
          color:String(item.color || '#24303a'), width:Math.max(.8, Math.min(40, Number(item.width) || 2.2)),
          opacity:Math.max(.05, Math.min(1, Number(item.opacity) || 1))
        };
      }
      return {
        ...base, shapeType,
        x:Math.max(0, Math.min(1, Number(item.x) || 0)), y:Math.max(0, Math.min(1, Number(item.y) || 0)),
        w:Math.max(.005, Math.min(1, Number(item.w) || .2)), h:Math.max(.005, Math.min(1, Number(item.h) || .15)),
        color:String(item.color || '#24303a'), width:Math.max(.8, Math.min(40, Number(item.width) || 2.2))
      };
    }
    const points = Array.isArray(item.points) ? item.points.slice(0, 30000).map(sanitizePoint) : [];
    return {
      ...base, kind:'stroke', tool:item.tool === 'highlighter' ? 'highlighter' : 'pen', points,
      color:String(item.color || (item.tool === 'highlighter' ? '#f0d84f' : '#24303a')),
      width:Math.max(.8, Math.min(50, Number(item.width) || (item.tool === 'highlighter' ? 15 : 2.2))),
      opacity:Math.max(.05, Math.min(1, Number(item.opacity) || (item.tool === 'highlighter' ? .30 : 1)))
    };
  }

  function sanitizeNotebook(value) {
    const out = emptyNotebook();
    const pages = value?.pages && typeof value.pages === 'object' ? value.pages : {};
    const styles = value?.pageStyles && typeof value.pageStyles === 'object' ? value.pageStyles : {};
    for (const letter of LETTERS) {
      const items = Array.isArray(pages[letter]) ? pages[letter] : [];
      out.pages[letter] = items.slice(0, 12000).map(sanitizeItem).filter((item) => item.kind !== 'stroke' || item.points.length > 0);
      const style = styles[letter] || {};
      out.pageStyles[letter] = {
        color:['yellow','white','black'].includes(style.color) ? style.color : 'yellow',
        template:['ruled','blank','grid'].includes(style.template) ? style.template : 'ruled'
      };
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
      key:VAULT_DATA_KEY, schemaVersion:VAULT_SCHEMA_VERSION, vaultId:String(vaultId || ''),
      revision:rev, envelope, modifiedAt:new Date().toISOString()
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
    if (!masterKeyBytes || locking) return;
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
        ? 'Biometria predefinita · PIN disponibile come accesso alternativo.'
        : initialized ? 'PIN attivo · biometria non associata a questo dispositivo.' : '';
    }
    if (unlocked) {
      ensureToolbar();
      updateTabs();
      updateToolbarUi();
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

  function currentItems() { return notebook.pages[activeLetter] || (notebook.pages[activeLetter] = []); }
  function pageSnapshot() { return clone(currentItems()); }

  function pushHistory(before) {
    const stack = undoByLetter[activeLetter];
    stack.push(clone(before));
    if (stack.length > 80) stack.shift();
    redoByLetter[activeLetter] = [];
  }

  function markChanged(before, message = '') {
    pushHistory(before);
    notebookDirty = true;
    changeSerial += 1;
    selectionIds.clear();
    if (message) setStatus(message, true);
    renderPage();
    void saveCurrentNotebook();
    armAutoLock();
  }

  async function persistNotebookSnapshot(snapshot, serialAtStart = changeSerial) {
    if (!masterKeyBytes || !configRow || !dataRow) return;
    const keyCopy = new Uint8Array(masterKeyBytes);
    saveChain = saveChain.then(async () => {
      try {
        const revision = Math.max(1, Number(dataRow?.revision) || 1) + 1;
        const encrypted = await encryptPayload(keyCopy, configRow.vaultId, {
          entries:clone(legacyEntries), notebook:snapshot
        }, revision);
        await commitPortableRows([encrypted]);
        dataRow = { ...encrypted };
        if (serialAtStart === changeSerial) notebookDirty = false;
      } finally { keyCopy.fill(0); }
    }).catch((err) => {
      notebookDirty = true;
      setStatus(`Salvataggio Rubrica non riuscito: ${err?.message || err}`);
    });
    return saveChain;
  }

  async function saveCurrentNotebook(force = false) {
    if (!masterKeyBytes || (!notebookDirty && !force)) return saveChain;
    const serial = changeSerial;
    const snapshot = sanitizeNotebook(notebook);
    return persistNotebookSnapshot(snapshot, serial);
  }

  async function flushNotebookBeforeExit() {
    if (activeGesture) finishGesture(null, false, true);
    if (notebookDirty) await saveCurrentNotebook(true);
    try { await saveChain; } catch {}
  }

  // 0.1.100 — ponte verso il motore pagina principale di Agenda/Note.
  // La Rubrica non disegna più sul canvas dedicato: espone la pagina A-Z al
  // motore Ink principale e riceve lo snapshot soltanto a fine gesto/salvataggio.
  function mainPageFromLetter(letter = activeLetter) {
    const safeLetter = LETTERS.includes(letter) ? letter : 'A';
    const strokes = [];
    const images = [];
    for (const raw of notebook.pages[safeLetter] || []) {
      const item = sanitizeItem(raw);
      if (item.kind === 'image') {
        images.push({
          id:item.id, name:String(item.name || 'Immagine Rubrica'), mimeType:String(item.mimeType || ''), src:item.src,
          blobHash:'', blobSize:0, x:item.x, y:item.y, w:item.w, h:item.h, rotation:Number(item.rotation) || 0,
          createdAt:item.createdAt, modifiedAt:item.modifiedAt
        });
        continue;
      }
      if (item.kind === 'shape' && !Array.isArray(item.points)) {
        const bounds={ left:item.x, top:item.y, right:item.x + item.w, bottom:item.y + item.h };
        strokes.push({
          id:item.id, kind:'shape', shapeType:item.shapeType, shapeVersion:1, tool:'pen', color:item.color, width:item.width, opacity:1,
          points:buildShapePoints(item.shapeType,bounds).map((p,index)=>({...sanitizePoint(p),t:index})),
          createdAt:item.createdAt, modifiedAt:item.modifiedAt
        });
      } else strokes.push(clone(item));
    }
    const style = notebook.pageStyles?.[safeLetter] || { color:'yellow', template:'ruled' };
    return { letter:safeLetter, strokes, images, pageStyle:clone(style) };
  }

  async function saveMainPage(letter, pageStrokes = [], pageImages = [], pageStyle = { color:'yellow', template:'ruled' }, flush = true) {
    if (!masterKeyBytes) throw new Error('Rubrica bloccata');
    const safeLetter = LETTERS.includes(letter) ? letter : activeLetter;
    const combined = [
      ...(Array.isArray(pageStrokes) ? pageStrokes : []).map((item)=>sanitizeItem(item)),
      ...(Array.isArray(pageImages) ? pageImages : []).map((image)=>sanitizeItem({ ...image, kind:'image' }))
    ];
    notebook.pages[safeLetter] = combined;
    notebook.pageStyles ||= {};
    notebook.pageStyles[safeLetter] = {
      color:['yellow','white','black'].includes(pageStyle?.color) ? pageStyle.color : 'yellow',
      template:['ruled','blank','grid'].includes(pageStyle?.template) ? pageStyle.template : 'ruled'
    };
    activeLetter = safeLetter;
    notebookDirty = true;
    changeSerial += 1;
    armAutoLock();
    if (flush) await saveCurrentNotebook(true);
    return true;
  }

  function setExternalLetter(letter) {
    if (!LETTERS.includes(letter)) return mainPageFromLetter(activeLetter);
    activeLetter = letter;
    updateTabs();
    armAutoLock();
    return mainPageFromLetter(activeLetter);
  }

  function canvasMetrics() {
    const rect = canvas?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : { left:0, top:0, width:1, height:1 };
  }

  function pointFromClient(clientX, clientY, pressure = 0.5) {
    const rect = canvasMetrics();
    return sanitizePoint({
      x:(clientX - rect.left) / Math.max(1, rect.width),
      y:(clientY - rect.top) / Math.max(1, rect.height),
      p:Number.isFinite(pressure) && pressure > 0 ? pressure : 0.5
    });
  }

  function drawStroke(item) {
    if (!ctx || !item?.points?.length) return;
    const width = canvas.width, height = canvas.height;
    const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    const pts = item.points;
    ctx.save();
    ctx.strokeStyle = item.color || '#24303a';
    ctx.fillStyle = item.color || '#24303a';
    ctx.globalAlpha = item.tool === 'highlighter' ? .34 : 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const baseWidth = Math.max(.8, Number(item.width) || 2.2) * dpr;
    if (pts.length === 1) {
      const p = pts[0]; ctx.beginPath(); ctx.arc(p.x * width, p.y * height, Math.max(1, baseWidth / 2), 0, Math.PI * 2); ctx.fill(); ctx.restore(); return;
    }
    ctx.lineWidth = baseWidth;
    ctx.beginPath(); ctx.moveTo(pts[0].x * width, pts[0].y * height);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x * width, pts[i].y * height);
    ctx.stroke(); ctx.restore();
  }

  function drawShape(item) {
    const bounds = { left:item.x, top:item.y, right:item.x + item.w, bottom:item.y + item.h };
    const points = buildShapePoints(item.shapeType, bounds);
    if (!points?.length) return;
    ctx.save();
    ctx.strokeStyle = item.color || '#24303a';
    ctx.lineWidth = Math.max(.8, Number(item.width) || 2.2) * Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath();
    points.forEach((p,i) => i ? ctx.lineTo(p.x*canvas.width,p.y*canvas.height) : ctx.moveTo(p.x*canvas.width,p.y*canvas.height));
    ctx.stroke(); ctx.restore();
  }

  function drawText(item) {
    ctx.save();
    const dpr=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1));
    ctx.fillStyle=item.color||'#24303a'; ctx.globalAlpha=1;
    ctx.font=`${Math.max(12,Number(item.size)||24)*dpr}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textBaseline='top';
    const maxWidth=Math.max(40, canvas.width*(1-item.x)-20*dpr);
    const words=String(item.text||'').split(/\s+/); let line='', y=item.y*canvas.height;
    const lh=Math.max(16,(Number(item.size)||24)*1.22)*dpr;
    for(const word of words){ const test=line?`${line} ${word}`:word; if(ctx.measureText(test).width>maxWidth && line){ctx.fillText(line,item.x*canvas.width,y);line=word;y+=lh;} else line=test; }
    if(line) ctx.fillText(line,item.x*canvas.width,y);
    ctx.restore();
  }

  function drawImage(item) {
    if (!item.src) return;
    let img=imageCache.get(item.src);
    if(!img){ img=new Image(); imageCache.set(item.src,img); img.onload=()=>renderPage(); img.src=item.src; }
    if(!img.complete || !img.naturalWidth) return;
    ctx.drawImage(img,item.x*canvas.width,item.y*canvas.height,item.w*canvas.width,item.h*canvas.height);
  }

  function itemBounds(item) {
    if (item.kind === 'image' || item.kind === 'shape') return {x0:item.x,y0:item.y,x1:item.x+item.w,y1:item.y+item.h};
    if (item.kind === 'text') return {x0:item.x,y0:item.y,x1:Math.min(1,item.x+.34),y1:Math.min(1,item.y+.10)};
    const pts=item.points||[]; if(!pts.length) return {x0:0,y0:0,x1:0,y1:0};
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y); return {x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};
  }

  function selectionBounds() {
    const selected=currentItems().filter(i=>selectionIds.has(i.id)); if(!selected.length) return null;
    const bb=selected.map(itemBounds); return {x0:Math.min(...bb.map(b=>b.x0)),y0:Math.min(...bb.map(b=>b.y0)),x1:Math.max(...bb.map(b=>b.x1)),y1:Math.max(...bb.map(b=>b.y1))};
  }

  function drawOverlays() {
    const dpr=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1));
    if(lassoPoints.length){ ctx.save();ctx.strokeStyle='#6d5238';ctx.lineWidth=1.8*dpr;ctx.setLineDash([6*dpr,5*dpr]);ctx.beginPath();lassoPoints.forEach((p,i)=>i?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height));ctx.stroke();ctx.restore(); }
    const b=selectionBounds();
    if(b){ctx.save();ctx.strokeStyle='#4f7fa1';ctx.lineWidth=1.7*dpr;ctx.setLineDash([5*dpr,4*dpr]);ctx.strokeRect(b.x0*canvas.width,b.y0*canvas.height,Math.max(1,(b.x1-b.x0)*canvas.width),Math.max(1,(b.y1-b.y0)*canvas.height));ctx.restore();}
  }

  function renderPage() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const item of currentItems()){
      if(item.kind==='stroke') drawStroke(item); else if(item.kind==='shape') drawShape(item); else if(item.kind==='image') drawImage(item); else if(item.kind==='text') drawText(item);
    }
    if(activeGesture?.previewItem){ const p=activeGesture.previewItem; if(p.kind==='shape') drawShape(p); }
    drawOverlays();
  }

  function resizeCanvas(force = false) {
    if (!canvas || !ctx || unlockedView?.hidden) return;
    const rect = canvas.getBoundingClientRect(); if(!rect.width||!rect.height)return;
    const dpr=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1)); const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(!force&&canvas.width===w&&canvas.height===h)return; canvas.width=w;canvas.height=h;renderPage();
  }

  function pointInPolygon(p, poly) {
    let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j]; const cross=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||Number.EPSILON)+a.x); if(cross)inside=!inside;
    } return inside;
  }

  function hitItem(item, p, pxRadius = 18) {
    const r=canvasMetrics(); const rx=pxRadius/Math.max(1,r.width), ry=pxRadius/Math.max(1,r.height);
    if(item.kind==='stroke') return (item.points||[]).some(q=>Math.abs(q.x-p.x)<=rx&&Math.abs(q.y-p.y)<=ry&&Math.hypot((q.x-p.x)*r.width,(q.y-p.y)*r.height)<=pxRadius);
    const b=itemBounds(item); return p.x>=b.x0-rx&&p.x<=b.x1+rx&&p.y>=b.y0-ry&&p.y<=b.y1+ry;
  }

  function selectedContainsPoint(p) { const b=selectionBounds(); return Boolean(b&&p.x>=b.x0&&p.x<=b.x1&&p.y>=b.y0&&p.y<=b.y1); }

  function translateItem(item, dx, dy) {
    const out=clone(item); const b=itemBounds(out); dx=Math.max(-b.x0,Math.min(1-b.x1,dx));dy=Math.max(-b.y0,Math.min(1-b.y1,dy));
    if(out.kind==='stroke') out.points=out.points.map(p=>({...p,x:p.x+dx,y:p.y+dy})); else {out.x+=dx;out.y+=dy;}
    out.modifiedAt=new Date().toISOString(); return out;
  }

  function appendGesturePoint(clientX,clientY,pressure=.5){
    if(!activeGesture)return; const p=pointFromClient(clientX,clientY,pressure); const pts=activeGesture.points||(activeGesture.points=[]); const last=pts.at(-1); const r=canvasMetrics();
    if(last&&Math.hypot((p.x-last.x)*r.width,(p.y-last.y)*r.height)<.7)return; pts.push(p);
    if(activeGesture.type==='ink') activeGesture.item.points=pts;
    if(activeGesture.type==='lasso') lassoPoints=pts;
  }

  function beginGesture(pointerId,clientX,clientY,pressure=.5,source='pointer'){
    if(!masterKeyBytes||activeGesture)return false; const p=pointFromClient(clientX,clientY,pressure); armAutoLock();
    if(activeTool==='image'){ imageInput?.click?.(); return false; }
    if(activeTool==='voice'){ startVoiceAt(p); return false; }
    if(activeTool==='lasso'){
      if(selectionIds.size&&selectedContainsPoint(p)){activeGesture={type:'move-selection',pointerId,source,start:p,before:pageSnapshot(),original:pageSnapshot()};return true;}
      selectionIds.clear();lassoPoints=[];activeGesture={type:'lasso',pointerId,source,points:[]};appendGesturePoint(clientX,clientY,pressure);renderPage();return true;
    }
    if(activeTool==='eraser'){activeGesture={type:'eraser',pointerId,source,before:pageSnapshot(),changed:false};eraseAt(p);return true;}
    if(activeTool==='shape'){activeGesture={type:'shape',pointerId,source,start:p,before:pageSnapshot(),previewItem:null};return true;}
    const tool=activeTool==='highlighter'?'highlighter':'pen'; lastInkTool=tool;
    const item=sanitizeItem({kind:'stroke',tool,color:toolStyle[tool].color,width:toolStyle[tool].width,points:[],createdAt:new Date().toISOString()});
    activeGesture={type:'ink',pointerId,source,item,points:item.points,before:pageSnapshot()};appendGesturePoint(clientX,clientY,pressure);renderPage();return true;
  }

  function eraseAt(p){
    if(!activeGesture||activeGesture.type!=='eraser')return; const radius=Math.max(8,Number(toolStyle.eraser.width)||22); const beforeCount=currentItems().length;
    notebook.pages[activeLetter]=currentItems().filter(item=>!hitItem(item,p,radius)); if(currentItems().length!==beforeCount){activeGesture.changed=true;selectionIds.clear();renderPage();}
  }

  function updateGesture(clientX,clientY,pressure=.5){
    if(!activeGesture)return; const p=pointFromClient(clientX,clientY,pressure);
    if(activeGesture.type==='ink'||activeGesture.type==='lasso'){appendGesturePoint(clientX,clientY,pressure);renderPage();return;}
    if(activeGesture.type==='eraser'){eraseAt(p);return;}
    if(activeGesture.type==='shape'){
      const s=activeGesture.start; const x=Math.min(s.x,p.x),y=Math.min(s.y,p.y),w=Math.max(.003,Math.abs(p.x-s.x)),h=Math.max(.003,Math.abs(p.y-s.y));
      activeGesture.previewItem=sanitizeItem({kind:'shape',shapeType:activeShapeType,x,y,w,h,color:toolStyle.shape.color,width:toolStyle.shape.width});renderPage();return;
    }
    if(activeGesture.type==='move-selection'){
      const dx=p.x-activeGesture.start.x,dy=p.y-activeGesture.start.y; const selected=new Set(selectionIds);
      notebook.pages[activeLetter]=activeGesture.original.map(item=>selected.has(item.id)?translateItem(item,dx,dy):clone(item));renderPage();
    }
  }

  function closeEnough(poly){if(poly.length<6)return false;const r=canvasMetrics(),a=poly[0],b=poly.at(-1);return Math.hypot((a.x-b.x)*r.width,(a.y-b.y)*r.height)<=52;}

  function finishGesture(ev,cancelled=false,internal=false){
    const g=activeGesture; if(!g)return; activeGesture=null;activeTouchId=null;
    if(cancelled){ if(g.before) notebook.pages[activeLetter]=clone(g.before); lassoPoints=[];renderPage();return; }
    if(g.type==='ink'){
      if(ev) appendGesturePoint(ev.clientX,ev.clientY,ev.pressure); if(g.item.points.length){notebook.pages[activeLetter].push(sanitizeItem(g.item));notebookDirty=true;changeSerial++;pushHistory(g.before);renderPage();void saveCurrentNotebook();}
    } else if(g.type==='eraser'){
      if(g.changed){notebookDirty=true;changeSerial++;pushHistory(g.before);setStatus('Cancellazione salvata.',true);void saveCurrentNotebook();} renderPage();
    } else if(g.type==='shape'){
      if(g.previewItem){notebook.pages[activeLetter].push(sanitizeItem(g.previewItem));notebookDirty=true;changeSerial++;pushHistory(g.before);renderPage();void saveCurrentNotebook();}
    } else if(g.type==='lasso'){
      const poly=[...g.points]; lassoPoints=[];
      if(closeEnough(poly)){selectionIds=new Set(currentItems().filter(item=>{if(item.kind==='stroke')return item.points.some(p=>pointInPolygon(p,poly));const b=itemBounds(item);return pointInPolygon({x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2},poly);}).map(i=>i.id));setStatus(`Lazo · ${selectionIds.size} elementi selezionati`,true);} else {selectionIds.clear();setStatus('Lazo non chiuso.',true);} renderPage();
    } else if(g.type==='move-selection'){
      const after=JSON.stringify(currentItems()); const before=JSON.stringify(g.before); if(after!==before){notebookDirty=true;changeSerial++;pushHistory(g.before);void saveCurrentNotebook();setStatus('Selezione spostata.',true);} renderPage();
    }
    if(!internal)armAutoLock();
  }

  function compatibleGesture(ev){return activeGesture&&(activeGesture.source==='touch'?ev.pointerType==='pen':ev.pointerId===activeGesture.pointerId);}

  function handleCanvasPointerDown(ev){
    if(!masterKeyBytes)return;if(ev.pointerType==='mouse'&&ev.button!==0)return;if(ev.pointerType==='touch')return;if(ev.pointerType==='pen')lastPenPointerAt=performance.now();
    if(!beginGesture(ev.pointerId,ev.clientX,ev.clientY,ev.pressure,'pointer'))return;try{canvas?.setPointerCapture?.(ev.pointerId);}catch{}ev.preventDefault();ev.stopPropagation();
  }
  function handleCanvasPointerMove(ev){if(!compatibleGesture(ev))return;const samples=typeof ev.getCoalescedEvents==='function'?ev.getCoalescedEvents():[ev];for(const s of samples.length?samples:[ev])updateGesture(s.clientX,s.clientY,s.pressure);ev.preventDefault();ev.stopPropagation();}
  function handleCanvasPointerUp(ev,cancelled=false){if(!compatibleGesture(ev))return;updateGesture(ev.clientX,ev.clientY,ev.pressure);try{if(canvas?.hasPointerCapture?.(ev.pointerId))canvas.releasePointerCapture(ev.pointerId);}catch{}finishGesture(ev,cancelled);ev.preventDefault();ev.stopPropagation();}
  function findTouch(list,id){if(!list)return null;for(const t of list)if(t.identifier===id)return t;return null;}
  function handleCanvasTouchStart(ev){if(!masterKeyBytes||activeGesture||performance.now()-lastPenPointerAt<180||ev.touches?.length!==1)return;const t=ev.touches[0];if(t.touchType&&t.touchType!=='stylus')return;activeTouchId=t.identifier;if(!beginGesture(`touch-${t.identifier}`,t.clientX,t.clientY,t.force,'touch'))return;ev.preventDefault();ev.stopPropagation();}
  function handleCanvasTouchMove(ev){if(!activeGesture||activeTouchId==null)return;const t=findTouch(ev.touches,activeTouchId);if(!t)return;updateGesture(t.clientX,t.clientY,t.force);ev.preventDefault();ev.stopPropagation();}
  function handleCanvasTouchEnd(ev,cancelled=false){if(!activeGesture||activeTouchId==null)return;const t=findTouch(ev.changedTouches,activeTouchId);if(t)updateGesture(t.clientX,t.clientY,t.force);finishGesture(t||null,cancelled);ev.preventDefault();ev.stopPropagation();}

  function selectLetter(letter){
    if(!LETTERS.includes(letter)||letter===activeLetter)return;if(activeGesture)finishGesture(null,false,true);selectionIds.clear();lassoPoints=[];activeLetter=letter;updateTabs();renderPage();armAutoLock();
  }

  function undo(){
    const stack=undoByLetter[activeLetter];if(!stack.length)return setStatus('Niente da annullare.',true);redoByLetter[activeLetter].push(pageSnapshot());notebook.pages[activeLetter]=stack.pop();selectionIds.clear();notebookDirty=true;changeSerial++;renderPage();void saveCurrentNotebook();setStatus('Annullato.',true);
  }
  function redo(){
    const stack=redoByLetter[activeLetter];if(!stack.length)return setStatus('Niente da ripristinare.',true);undoByLetter[activeLetter].push(pageSnapshot());notebook.pages[activeLetter]=stack.pop();selectionIds.clear();notebookDirty=true;changeSerial++;renderPage();void saveCurrentNotebook();setStatus('Ripristinato.',true);
  }

  function setActiveTool(tool){
    if(['pen','highlighter','eraser','lasso','shape','voice'].includes(tool)){activeTool=tool;if(tool==='pen'||tool==='highlighter')lastInkTool=tool;selectionIds.clear();lassoPoints=[];hideToolPopovers();updateToolbarUi();renderPage();setStatus(`Rubrica · ${toolLabel(tool)}`,true);}
  }
  function toolLabel(tool){return ({pen:'Penna',highlighter:'Evidenziatore',eraser:'Gomma',lasso:'Lazo',shape:'Figure',voice:'Voce'})[tool]||tool;}

  function toolbarSourceButton(id){return document.getElementById(id);}
  function cloneToolbarButton(id,tool){const source=toolbarSourceButton(id);if(!source)return null;const b=source.cloneNode(true);b.removeAttribute('id');b.dataset.vaultTool=tool;b.classList.remove('active');b.setAttribute('aria-pressed','false');return b;}
  function ensureToolbar(){
    if(!toolbar||toolbar.dataset.ready==='1')return; const specs=[['voiceScriptToolButton','voice'],['penToolButton','pen'],['highlighterToolButton','highlighter'],['eraserToolButton','eraser'],['lassoToolButton','lasso'],['shapeToolButton','shape'],['imageToolButton','image'],['undoButton','undo'],['redoButton','redo'],['styleButton','style']];
    for(const [id,tool] of specs){const b=cloneToolbarButton(id,tool);if(!b)continue;toolbar.appendChild(b);bindDirectAction(b,()=>toolbarAction(tool));}
    toolbar.dataset.ready='1'; buildShapePalette(); buildStylePalette(); updateToolbarUi();
  }

  function updateToolbarUi(){if(!toolbar)return;for(const b of toolbar.querySelectorAll('[data-vault-tool]')){const t=b.dataset.vaultTool;const selected=t===activeTool||(t==='image'&&activeTool==='image');b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected?'true':'false');}}
  function hideToolPopovers(){if(toolPopover)toolPopover.hidden=true;if(shapePalette)shapePalette.hidden=true;if(stylePalette)stylePalette.hidden=true;}
  function showPopover(kind){if(!toolPopover)return;toolPopover.hidden=false;if(shapePalette)shapePalette.hidden=kind!=='shape';if(stylePalette)stylePalette.hidden=kind!=='style';}

  function toolbarAction(tool){
    if(tool==='undo')return undo();if(tool==='redo')return redo();if(tool==='image'){activeTool='image';updateToolbarUi();hideToolPopovers();imageInput?.click?.();return;}
    if(tool==='shape'){activeTool='shape';updateToolbarUi();showPopover('shape');return;}
    if(tool==='style'){showPopover('style');return;}
    setActiveTool(tool);
  }

  function buildShapePalette(){
    if(!shapePalette||shapePalette.dataset.ready==='1')return;for(const type of SHAPE_TYPES){const b=document.createElement('button');b.type='button';b.dataset.vaultShape=type;b.textContent=SHAPE_LABELS[type]||type;b.classList.toggle('active',type===activeShapeType);bindDirectAction(b,()=>{activeShapeType=type;activeTool='shape';for(const x of shapePalette.querySelectorAll('[data-vault-shape]'))x.classList.toggle('active',x===b);hideToolPopovers();updateToolbarUi();setStatus(`Figura · ${SHAPE_LABELS[type]||type}`,true);});shapePalette.appendChild(b);}shapePalette.dataset.ready='1';
  }

  function buildStylePalette(){
    if(!stylePalette||stylePalette.dataset.ready==='1')return;const colors=['#111111','#8e8e8e','#a52b2b','#f03b43','#f3a65a','#f0d84f','#7fd38b','#38c286','#7fc8e8','#8b77d8','#f5f3eb','#bd845f','#ef91b2'];
    const title=document.createElement('div');title.className='password-vault-style-title';title.textContent='Colore';stylePalette.appendChild(title);const row=document.createElement('div');row.className='password-vault-style-colors';stylePalette.appendChild(row);
    for(const color of colors){const b=document.createElement('button');b.type='button';b.className='color-swatch';b.style.setProperty('--swatch',color);b.title=color;bindDirectAction(b,()=>{const target=lastInkTool==='highlighter'?'highlighter':activeTool==='shape'?'shape':'pen';toolStyle[target].color=color;hideToolPopovers();setStatus(`Colore ${target} aggiornato.`,true);});row.appendChild(b);}
    const wt=document.createElement('div');wt.className='password-vault-style-title';wt.textContent='Spessore';stylePalette.appendChild(wt);const widths=document.createElement('div');widths.className='password-vault-style-widths';stylePalette.appendChild(widths);
    for(const [label,width] of [['XS',2],['S',4],['M',8],['L',15],['XL',26]]){const b=document.createElement('button');b.type='button';b.textContent=label;bindDirectAction(b,()=>{const target=activeTool==='eraser'?'eraser':lastInkTool==='highlighter'?'highlighter':activeTool==='shape'?'shape':'pen';toolStyle[target].width=target==='highlighter'?Math.max(8,width):target==='eraser'?Math.max(12,width*1.5):width;hideToolPopovers();setStatus(`Spessore ${target} aggiornato.`,true);});widths.appendChild(b);}stylePalette.dataset.ready='1';
  }

  function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Lettura immagine non riuscita'));r.readAsDataURL(file);});}
  async function addImageFile(file){
    if(!file||!masterKeyBytes)return;try{const before=pageSnapshot();const src=await fileToDataUrl(file);const probe=new Image();await new Promise((res,rej)=>{probe.onload=res;probe.onerror=rej;probe.src=src;});const aspect=Math.max(.2,Math.min(5,probe.naturalWidth/Math.max(1,probe.naturalHeight)));let w=.34,h=w/aspect;if(h>.42){h=.42;w=h*aspect;}const item=sanitizeItem({kind:'image',src,x:.12,y:.16,w,h});notebook.pages[activeLetter].push(item);notebookDirty=true;changeSerial++;pushHistory(before);renderPage();void saveCurrentNotebook();setStatus('Immagine inserita nella Rubrica.',true);}catch(err){setStatus(`Immagine non inserita: ${err?.message||err}`);}finally{if(imageInput)imageInput.value='';activeTool=lastInkTool;updateToolbarUi();}
  }

  function startVoiceAt(point){
    const SR=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;if(!SR){setStatus('Dettatura non disponibile in questo browser.');activeTool=lastInkTool;updateToolbarUi();return;}
    try{const rec=new SR();rec.lang='it-IT';rec.interimResults=false;rec.maxAlternatives=1;setStatus('Dettatura Rubrica in ascolto…');rec.onresult=(e)=>{const text=String(e.results?.[0]?.[0]?.transcript||'').trim();if(!text)return;const before=pageSnapshot();notebook.pages[activeLetter].push(sanitizeItem({kind:'text',text,x:point.x,y:point.y,color:toolStyle.text.color,size:toolStyle.text.size}));notebookDirty=true;changeSerial++;pushHistory(before);renderPage();void saveCurrentNotebook();setStatus('Testo dettato inserito.',true);};rec.onerror=(e)=>setStatus(`Dettatura non riuscita: ${e.error||'errore'}`);rec.onend=()=>{activeTool=lastInkTool;updateToolbarUi();};rec.start();}catch(err){setStatus(`Dettatura non disponibile: ${err?.message||err}`);activeTool=lastInkTool;updateToolbarUi();}
  }

  async function readLocalSecurityState(){return await getRow(VAULT_LOCAL_STATE_KEY).catch(()=>null)||{key:VAULT_LOCAL_STATE_KEY,failedAttempts:0,lockedUntil:0};}
  async function notePinFailure(){const state=await readLocalSecurityState();const failedAttempts=Math.max(0,Number(state.failedAttempts)||0)+1;let waitMs=0;if(failedAttempts>=8)waitMs=5*60*1000;else if(failedAttempts>=5)waitMs=30000;const row={key:VAULT_LOCAL_STATE_KEY,failedAttempts,lockedUntil:waitMs?Date.now()+waitMs:0,modifiedAt:new Date().toISOString()};await putLocalRow(row).catch(()=>{});return row;}
  async function clearPinFailures(){await putLocalRow({key:VAULT_LOCAL_STATE_KEY,failedAttempts:0,lockedUntil:0,modifiedAt:new Date().toISOString()}).catch(()=>{});}
  async function ensurePinAllowed(){const state=await readLocalSecurityState();const until=Math.max(0,Number(state.lockedUntil)||0);if(until>Date.now())throw new Error(`Troppi tentativi errati. Riprova tra ${Math.ceil((until-Date.now())/1000)} s.`);}

  async function unlockWithMasterKey(rawKey,method){
    const payload=await decryptPayload(rawKey,dataRow);if(masterKeyBytes)masterKeyBytes.fill(0);masterKeyBytes=new Uint8Array(rawKey);legacyEntries=Array.isArray(payload.entries)?clone(payload.entries):[];notebook=sanitizeNotebook(payload.notebook);activeLetter='A';activeTool='pen';lastInkTool='pen';selectionIds.clear();undoByLetter=Object.fromEntries(LETTERS.map(l=>[l,[]]));redoByLetter=Object.fromEntries(LETTERS.map(l=>[l,[]]));notebookDirty=false;renderMode();armAutoLock();setStatus(`Rubrica sbloccata con ${method}.`,true);
    if(panel) panel.hidden=true;
    await onUnlocked({ method, letter:activeLetter, page:mainPageFromLetter(activeLetter) });
  }

  async function unlockPin(){try{await ensurePinAllowed();const pin=String(pinInput?.value||'');if(!/^\d{4}$/.test(pin))throw new Error('Inserisci le 4 cifre del PIN');const raw=await unwrapMasterKeyWithPin(configRow,pin);await clearPinFailures();if(pinInput)pinInput.value='';await unlockWithMasterKey(raw,'PIN');raw.fill(0);}catch(err){if(!String(err?.message||'').startsWith('Troppi tentativi'))await notePinFailure();setStatus(`Accesso non riuscito: ${err?.message||err}`);}}

  async function unlockBiometric(){
    if(biometricOpening)return;biometricOpening=true;try{if(!localAuthRow)throw new Error('Biometria non configurata su questo dispositivo');setStatus('Conferma impronta / biometria su iPad…');const raw=await unwrapMasterKeyWithBiometric(configRow,localAuthRow);await unlockWithMasterKey(raw,'biometria');raw.fill(0);}catch(err){if(err?.name==='NotAllowedError')setStatus('Accesso biometrico annullato. PIN disponibile come alternativa.');else setStatus(`Biometria non disponibile: ${err?.message||err}`);setTimeout(()=>pinInput?.focus?.({preventScroll:true}),60);}finally{biometricOpening=false;}
  }

  async function setupVault(){try{const pin=String(setupPin?.value||''),confirm=String(setupPinConfirm?.value||'');if(!/^\d{4}$/.test(pin))throw new Error('Il PIN deve contenere esattamente 4 cifre');if(pin!==confirm)throw new Error('I due PIN non coincidono');const material=await createVaultMaterial(pin);await commitPortableRows([material.configRow,material.dataRow]);configRow={...material.configRow};dataRow={...material.dataRow};
    if(!localAuthRow){try{const bio=await createBiometricWrapper(material.masterKeyBytes,configRow.vaultId);await putLocalRow(bio);localAuthRow=bio;}catch(err){console.warn('Biometria iniziale Rubrica non configurata',err);}}
    await unlockWithMasterKey(material.masterKeyBytes,'nuovo PIN');material.masterKeyBytes.fill(0);clearSecretInputs();}catch(err){setStatus(`Creazione Rubrica non riuscita: ${err?.message||err}`);}}

  async function enableBiometric(){try{if(!masterKeyBytes||!configRow)throw new Error('Sblocca prima la Rubrica con il PIN');setStatus('Conferma l’autenticazione biometrica di iPadOS…');const row=await createBiometricWrapper(masterKeyBytes,configRow.vaultId);await putLocalRow(row);localAuthRow=row;renderMode();setStatus('Impronta digitale / biometria associata e impostata come accesso predefinito.',true);}catch(err){if(err?.name==='NotAllowedError')setStatus('Configurazione biometrica annullata.');else setStatus(`Biometria non configurata: ${err?.message||err}`);}}

  async function lock(reason='manual'){
    if(locking)return;locking=true;
    try{
      clearTimeout(autoLockTimer);
      if(masterKeyBytes) await onBeforeLock(reason);
      await flushNotebookBeforeExit();if(masterKeyBytes)masterKeyBytes.fill(0);masterKeyBytes=null;notebook=emptyNotebook();legacyEntries=[];selectionIds.clear();lassoPoints=[];clearSecretInputs();renderMode();if(reason==='timeout')setStatus('Rubrica salvata e bloccata automaticamente.');else if(reason==='background')setStatus('Rubrica salvata e bloccata.');else setStatus('Rubrica salvata e protetta.');
      await onLocked(reason);
    }finally{locking=false;}
  }

  async function open(){
    if(destroyed||!panel)return;
    if(masterKeyBytes && isExternalPageActive()){ await onExternalExit(); return; }
    try{onOpen();}catch{}panel.hidden=false;
    if(!configRow||!dataRow)await refreshRows();else{const latestAuth=await getRow(VAULT_LOCAL_AUTH_KEY).catch(()=>localAuthRow);if(latestAuth)localAuthRow=latestAuth;}
    renderMode();
    if(masterKeyBytes){armAutoLock();requestAnimationFrame(()=>resizeCanvas(true));return;}
    if(configRow&&dataRow){
      if(localAuthRow){setStatus('Accesso biometrico predefinito…');void unlockBiometric();}
      else{setStatus('Accedi con il PIN. Puoi associare la biometria dopo lo sblocco.');setTimeout(()=>pinInput?.focus?.({preventScroll:true}),50);}
    }else{setStatus('Prima configurazione: crea il PIN di 4 cifre.');setTimeout(()=>setupPin?.focus?.({preventScroll:true}),50);}
  }

  async function close(){if(!panel)return;await flushNotebookBeforeExit();await lock('manual');panel.hidden=true;try{onClose();}catch{}}
  async function handleRemoteUpdate(key){if(key!==VAULT_CONFIG_KEY&&key!==VAULT_DATA_KEY)return;await refreshRows();if(masterKeyBytes)await lock('remote');setStatus('Rubrica aggiornata dal Sync. Accedi nuovamente.');}

  function bindDirectAction(element,action){if(!element)return;let lastDirect=-Infinity;element.addEventListener('pointerdown',(ev)=>{if(ev.pointerType==='mouse')return;lastDirect=performance.now();ev.preventDefault();ev.stopPropagation();action(ev);},{passive:false});element.addEventListener('click',(ev)=>{ev.preventDefault();if(performance.now()-lastDirect<650)return;action(ev);});}

  bindFullKeyboardPin(setupPin);bindFullKeyboardPin(setupPinConfirm);bindFullKeyboardPin(pinInput);
  keyButton?.addEventListener('pointerdown',(ev)=>{if(ev.pointerType==='mouse')return;lastKeyDirectOpenAt=performance.now();ev.preventDefault();ev.stopPropagation();void open();},{passive:false});
  keyButton?.addEventListener('pointerup',(ev)=>{if(ev.pointerType==='mouse')return;ev.preventDefault();ev.stopPropagation();},{passive:false});
  keyButton?.addEventListener('touchstart',(ev)=>{if(performance.now()-lastKeyDirectOpenAt<220){ev.preventDefault();ev.stopPropagation();return;}lastKeyDirectOpenAt=performance.now();ev.preventDefault();ev.stopPropagation();void open();},{passive:false});
  keyButton?.addEventListener('click',(ev)=>{ev.preventDefault();if(performance.now()-lastKeyDirectOpenAt<650)return;void open();});

  bindDirectAction(closeButton,()=>void close());bindDirectAction(lockButton,()=>void lock('manual'));bindDirectAction(createButton,()=>void setupVault());bindDirectAction(pinUnlockButton,()=>void unlockPin());bindDirectAction(biometricUnlockButton,()=>void unlockBiometric());bindDirectAction(biometricSetupButton,()=>void enableBiometric());
  pinInput?.addEventListener('keydown',(ev)=>{if(ev.key==='Enter'){ev.preventDefault();void unlockPin();}});
  if(azBar)for(const button of azBar.querySelectorAll('[data-vault-letter]'))bindDirectAction(button,()=>selectLetter(String(button.dataset.vaultLetter||'A')));
  imageInput?.addEventListener('change',()=>void addImageFile(imageInput.files?.[0]));

  canvas?.addEventListener('pointerdown',handleCanvasPointerDown,{passive:false});canvas?.addEventListener('pointermove',handleCanvasPointerMove,{passive:false});canvas?.addEventListener('pointerup',(ev)=>handleCanvasPointerUp(ev,false),{passive:false});canvas?.addEventListener('pointercancel',(ev)=>handleCanvasPointerUp(ev,true),{passive:false});canvas?.addEventListener('touchstart',handleCanvasTouchStart,{passive:false});canvas?.addEventListener('touchmove',handleCanvasTouchMove,{passive:false});canvas?.addEventListener('touchend',(ev)=>handleCanvasTouchEnd(ev,false),{passive:false});canvas?.addEventListener('touchcancel',(ev)=>handleCanvasTouchEnd(ev,true),{passive:false});
  panel?.addEventListener('pointerdown',armAutoLock,{passive:true});panel?.addEventListener('keydown',armAutoLock,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden&&masterKeyBytes)void lock('background');});
  if(typeof ResizeObserver!=='undefined'&&page){resizeObserver=new ResizeObserver(()=>resizeCanvas());resizeObserver.observe(page);}globalThis.visualViewport?.addEventListener?.('resize',()=>resizeCanvas());globalThis.addEventListener?.('orientationchange',()=>setTimeout(()=>resizeCanvas(true),60));

  void refreshRows().then(renderMode);

  return {
    open,close,lock,
    isUnlocked:()=>Boolean(masterKeyBytes),
    isWriting:()=>Boolean(activeGesture),
    getPage:(letter='A')=>mainPageFromLetter(letter),
    savePage:(letter,strokes,images,pageStyle,flush=true)=>saveMainPage(letter,strokes,images,pageStyle,flush),
    setActiveLetter:(letter)=>setExternalLetter(letter),
    noteActivity:()=>armAutoLock(),
    flush:()=>flushNotebookBeforeExit(),
    handleRemoteUpdate,
    refresh:async()=>{await refreshRows();renderMode();},
    destroy:()=>{destroyed=true;resizeObserver?.disconnect?.();void lock('manual');}
  };
}
