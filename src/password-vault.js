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
  const changePinButton = document.getElementById('passwordVaultChangePinButton');
  const securityStatus = document.getElementById('passwordVaultSecurityStatus');
  const vaultStatus = document.getElementById('passwordVaultStatus');
  const searchInput = document.getElementById('passwordVaultSearch');
  const azBar = document.getElementById('passwordVaultAz');
  const entryList = document.getElementById('passwordVaultList');
  const newButton = document.getElementById('passwordVaultNewButton');
  const editor = document.getElementById('passwordVaultEditor');
  const serviceInput = document.getElementById('passwordVaultService');
  const usernameInput = document.getElementById('passwordVaultUsername');
  const passwordInput = document.getElementById('passwordVaultPassword');
  const notesInput = document.getElementById('passwordVaultNotes');
  const saveButton = document.getElementById('passwordVaultSaveButton');
  const deleteButton = document.getElementById('passwordVaultDeleteButton');
  const cancelEditButton = document.getElementById('passwordVaultCancelEditButton');
  const revealButton = document.getElementById('passwordVaultRevealButton');
  const copyUserButton = document.getElementById('passwordVaultCopyUserButton');
  const copyPasswordButton = document.getElementById('passwordVaultCopyPasswordButton');

  let configRow = null;
  let dataRow = null;
  let localAuthRow = null;
  let masterKeyBytes = null;
  let entries = [];
  let selectedId = '';
  let activeLetter = 'TUTTE';
  let autoLockTimer = 0;
  let destroyed = false;
  let lastKeyDirectOpenAt = -Infinity;

  function sanitizePinControl(control) {
    if (!control) return;
    const filtered = String(control.value || '').replace(/\D+/g, '').slice(0, 4);
    if (control.value !== filtered) control.value = filtered;
  }

  function bindFullKeyboardPin(control) {
    if (!control) return;
    // iPadOS: inputmode=numeric/pattern=[0-9]* richiama la tastiera numerica compatta.
    // Usiamo la tastiera testuale estesa e filtriamo comunque il valore a 4 sole cifre.
    control.setAttribute('inputmode', 'text');
    control.removeAttribute('pattern');
    control.setAttribute('autocapitalize', 'off');
    control.setAttribute('autocorrect', 'off');
    control.setAttribute('spellcheck', 'false');
    control.addEventListener('input', () => sanitizePinControl(control));
  }

  function setStatus(message) {
    if (vaultStatus) vaultStatus.textContent = String(message || '');
    try { onStatus(String(message || '')); } catch {}
  }

  function clearSecretInputs() {
    if (pinInput) pinInput.value = '';
    if (setupPin) setupPin.value = '';
    if (setupPinConfirm) setupPinConfirm.value = '';
    if (passwordInput) { passwordInput.value = ''; passwordInput.type = 'password'; }
    if (usernameInput) usernameInput.value = '';
    if (notesInput) notesInput.value = '';
    if (serviceInput) serviceInput.value = '';
  }

  function armAutoLock() {
    clearTimeout(autoLockTimer);
    if (!masterKeyBytes) return;
    autoLockTimer = setTimeout(() => lock('timeout'), AUTO_LOCK_MS);
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
        ? 'Biometria dispositivo configurata · PIN 4 cifre disponibile come recupero'
        : initialized ? 'PIN 4 cifre attivo · biometria non ancora associata a questo dispositivo' : 'Crea prima il PIN di 4 cifre';
    }
  }

  function entryInitial(entry) {
    const s = String(entry?.service || '').trim();
    const ch = s ? s[0].toLocaleUpperCase('it-IT') : '#';
    return /^[A-ZÀ-ÖØ-Ý]$/i.test(ch) ? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : '#';
  }

  function renderEntries() {
    if (!entryList) return;
    const q = String(searchInput?.value || '').trim().toLocaleLowerCase('it-IT');
    const filtered = sortEntries(entries).filter((entry) => {
      if (activeLetter !== 'TUTTE' && entryInitial(entry) !== activeLetter) return false;
      if (!q) return true;
      return `${entry.service}\n${entry.username}\n${entry.notes}`.toLocaleLowerCase('it-IT').includes(q);
    });
    entryList.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'password-vault-empty';
      empty.textContent = entries.length ? 'Nessuna voce corrispondente.' : 'Rubrica vuota. Tocca “Nuova voce”.';
      entryList.appendChild(empty);
      return;
    }
    for (const entry of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `password-vault-entry${entry.id === selectedId ? ' selected' : ''}`;
      button.dataset.vaultEntryId = entry.id;
      const strong = document.createElement('strong'); strong.textContent = entry.service || '(senza nome)';
      const small = document.createElement('small'); small.textContent = entry.username || '—';
      button.append(strong, small);
      entryList.appendChild(button);
    }
  }

  function hideEditor() {
    selectedId = '';
    if (editor) editor.hidden = true;
    clearSecretInputs();
    renderEntries();
  }

  function editEntry(id = '') {
    const found = entries.find((entry) => entry.id === id) || null;
    selectedId = found?.id || '';
    if (editor) editor.hidden = false;
    if (serviceInput) serviceInput.value = found?.service || '';
    if (usernameInput) usernameInput.value = found?.username || '';
    if (passwordInput) { passwordInput.value = found?.password || ''; passwordInput.type = 'password'; }
    if (notesInput) notesInput.value = found?.notes || '';
    if (deleteButton) deleteButton.hidden = !found;
    renderEntries();
    setTimeout(() => serviceInput?.focus?.({ preventScroll: true }), 0);
  }

  async function persistEntries(nextEntries) {
    if (!masterKeyBytes || !configRow || !dataRow) throw new Error('Rubrica bloccata');
    const nextRevision = Math.max(1, Number(dataRow.revision) || 1) + 1;
    const encrypted = await encryptVaultEntries(masterKeyBytes, configRow.vaultId, nextEntries.map(sanitizeEntry), nextRevision);
    await commitPortableRows([encrypted]);
    dataRow = { ...encrypted };
    entries = nextEntries.map(sanitizeEntry);
    armAutoLock();
  }

  async function readLocalSecurityState() {
    return await getRow(VAULT_LOCAL_STATE_KEY).catch(() => null) || { key: VAULT_LOCAL_STATE_KEY, failedAttempts: 0, lockedUntil: 0 };
  }

  async function notePinFailure() {
    const state = await readLocalSecurityState();
    const failedAttempts = Math.max(0, Number(state.failedAttempts) || 0) + 1;
    let waitMs = 0;
    if (failedAttempts >= 8) waitMs = 5 * 60 * 1000;
    else if (failedAttempts >= 5) waitMs = 30 * 1000;
    const row = { key: VAULT_LOCAL_STATE_KEY, failedAttempts, lockedUntil: waitMs ? Date.now() + waitMs : 0, modifiedAt: new Date().toISOString() };
    await putLocalRow(row).catch(() => {});
    return row;
  }

  async function clearPinFailures() {
    await putLocalRow({ key: VAULT_LOCAL_STATE_KEY, failedAttempts: 0, lockedUntil: 0, modifiedAt: new Date().toISOString() }).catch(() => {});
  }

  async function ensurePinAllowed() {
    const state = await readLocalSecurityState();
    const until = Math.max(0, Number(state.lockedUntil) || 0);
    if (until > Date.now()) {
      const seconds = Math.ceil((until - Date.now()) / 1000);
      throw new Error(`Troppi tentativi errati. Riprova tra ${seconds} s.`);
    }
  }

  async function unlockWithMasterKey(rawKey, method) {
    const loadedEntries = await decryptVaultEntries(rawKey, dataRow);
    if (masterKeyBytes) masterKeyBytes.fill(0);
    masterKeyBytes = new Uint8Array(rawKey);
    entries = loadedEntries.map(sanitizeEntry);
    selectedId = '';
    renderMode();
    renderEntries();
    hideEditor();
    armAutoLock();
    setStatus(`Rubrica sbloccata · ${method} · ${entries.length} ${entries.length === 1 ? 'voce' : 'voci'}`);
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
      await unlockWithMasterKey(raw, 'Touch ID / biometria');
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
      setStatus('Rubrica creata e cifrata. Puoi ora associare Touch ID / biometria.');
    } catch (err) { setStatus(`Creazione rubrica non riuscita: ${err?.message || err}`); }
  }

  async function enableBiometric() {
    try {
      if (!masterKeyBytes || !configRow) throw new Error('Sblocca prima la rubrica con il PIN');
      setStatus('Conferma l’autenticazione biometrica di iPadOS…');
      const row = await createBiometricWrapper(masterKeyBytes, configRow.vaultId);
      await putLocalRow(row);
      localAuthRow = row;
      renderMode();
      setStatus('Touch ID / biometria associata a questo dispositivo ✓');
    } catch (err) {
      if (err?.name === 'NotAllowedError') setStatus('Configurazione biometrica annullata.');
      else setStatus(`Biometria non configurata: ${err?.message || err}`);
    }
  }

  async function changePin() {
    if (!masterKeyBytes || !configRow) return;
    const first = window.prompt('Nuovo PIN della Rubrica Password (4 cifre):');
    if (first === null) return;
    const second = window.prompt('Ripeti il nuovo PIN (4 cifre):');
    if (second === null) return;
    if (!/^\d{4}$/.test(first) || first !== second) return setStatus('Cambio PIN annullato: inserire due PIN identici di 4 cifre.');
    try {
      const nextConfig = await rewrapMasterKeyWithPin(configRow, masterKeyBytes, first);
      await commitPortableRows([nextConfig]);
      configRow = nextConfig;
      setStatus('PIN aggiornato ✓ · Backup e Sync useranno solo la nuova chiave avvolta.');
    } catch (err) { setStatus(`Cambio PIN non riuscito: ${err?.message || err}`); }
  }

  async function saveEditor() {
    if (!masterKeyBytes) return;
    const service = String(serviceInput?.value || '').trim();
    if (!service) return setStatus('Inserisci almeno il nome del servizio/sito.');
    const now = new Date().toISOString();
    const existing = entries.find((entry) => entry.id === selectedId) || null;
    const entry = sanitizeEntry({
      id: existing?.id,
      service,
      username: usernameInput?.value || '',
      password: passwordInput?.value || '',
      notes: notesInput?.value || '',
      createdAt: existing?.createdAt || now,
      modifiedAt: now
    });
    const next = existing ? entries.map((item) => item.id === existing.id ? entry : item) : [...entries, entry];
    try {
      await persistEntries(next);
      hideEditor();
      setStatus(`Voce “${entry.service}” salvata in forma cifrata ✓`);
    } catch (err) { setStatus(`Salvataggio non riuscito: ${err?.message || err}`); }
  }

  async function deleteEditorEntry() {
    const existing = entries.find((entry) => entry.id === selectedId);
    if (!existing) return;
    if (!window.confirm(`Eliminare “${existing.service}” dalla Rubrica Password?`)) return;
    try {
      await persistEntries(entries.filter((item) => item.id !== existing.id));
      hideEditor();
      setStatus('Voce eliminata ✓');
    } catch (err) { setStatus(`Eliminazione non riuscita: ${err?.message || err}`); }
  }

  async function copyValue(value, label) {
    const text = String(value || '');
    if (!text) return setStatus(`${label}: campo vuoto.`);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copiato negli appunti.`);
    } catch { setStatus(`Copia ${label.toLowerCase()} non disponibile automaticamente.`); }
    armAutoLock();
  }

  function lock(reason = 'manual') {
    clearTimeout(autoLockTimer);
    if (masterKeyBytes) masterKeyBytes.fill(0);
    masterKeyBytes = null;
    entries = [];
    selectedId = '';
    clearSecretInputs();
    if (editor) editor.hidden = true;
    renderMode();
    renderEntries();
    if (reason === 'timeout') setStatus('Rubrica bloccata automaticamente per inattività.');
    else if (reason === 'background') setStatus('Rubrica bloccata perché Agenda è passata in background.');
    else setStatus('Rubrica bloccata.');
  }

  async function open() {
    if (destroyed || !panel) return;
    await refreshRows();
    try { onOpen(); } catch {}
    panel.hidden = false;
    renderMode();
    if (masterKeyBytes) { renderEntries(); armAutoLock(); }
    else setStatus(configRow && dataRow ? 'Rubrica protetta: usa Touch ID / biometria oppure PIN di 4 cifre.' : 'Prima configurazione: crea il PIN di 4 cifre.');
  }

  function close() {
    if (!panel) return;
    lock('manual');
    panel.hidden = true;
    try { onClose(); } catch {}
  }

  async function handleRemoteUpdate(key) {
    if (key !== VAULT_CONFIG_KEY && key !== VAULT_DATA_KEY) return;
    await refreshRows();
    if (masterKeyBytes) lock('remote');
    setStatus('Rubrica aggiornata dal Sync. Sblocca nuovamente per visualizzare i dati ricevuti.');
  }

  bindFullKeyboardPin(setupPin);
  bindFullKeyboardPin(setupPinConfirm);
  bindFullKeyboardPin(pinInput);

  // 0.1.96 — l'icona Chiave deve rispondere immediatamente anche ad Apple Pencil.
  // Il click resta per mouse/tastiera; pointerdown/touchstart coprono iPadOS senza
  // dipendere dalla sintesi del click dopo il contatto Pencil.
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
    if (performance.now() - lastKeyDirectOpenAt < 220) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
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
  closeButton?.addEventListener('click', close);
  lockButton?.addEventListener('click', () => lock('manual'));
  createButton?.addEventListener('click', () => void setupVault());
  pinUnlockButton?.addEventListener('click', () => void unlockPin());
  pinInput?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); void unlockPin(); } });
  biometricUnlockButton?.addEventListener('click', () => void unlockBiometric());
  biometricSetupButton?.addEventListener('click', () => void enableBiometric());
  changePinButton?.addEventListener('click', () => void changePin());
  newButton?.addEventListener('click', () => editEntry(''));
  cancelEditButton?.addEventListener('click', hideEditor);
  saveButton?.addEventListener('click', () => void saveEditor());
  deleteButton?.addEventListener('click', () => void deleteEditorEntry());
  revealButton?.addEventListener('click', () => {
    if (!passwordInput) return;
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    revealButton.setAttribute('aria-pressed', passwordInput.type === 'text' ? 'true' : 'false');
    armAutoLock();
  });
  copyUserButton?.addEventListener('click', () => void copyValue(usernameInput?.value, 'Utente'));
  copyPasswordButton?.addEventListener('click', () => void copyValue(passwordInput?.value, 'Password'));
  searchInput?.addEventListener('input', () => { renderEntries(); armAutoLock(); });
  entryList?.addEventListener('click', (ev) => {
    const button = ev.target instanceof Element ? ev.target.closest('[data-vault-entry-id]') : null;
    if (!button) return;
    editEntry(button.dataset.vaultEntryId || '');
    armAutoLock();
  });
  azBar?.addEventListener('click', (ev) => {
    const button = ev.target instanceof Element ? ev.target.closest('[data-vault-letter]') : null;
    if (!button) return;
    activeLetter = String(button.dataset.vaultLetter || 'TUTTE');
    for (const item of azBar.querySelectorAll('[data-vault-letter]')) item.classList.toggle('active', item === button);
    renderEntries();
    armAutoLock();
  });
  panel?.addEventListener('pointerdown', armAutoLock, { passive: true });
  panel?.addEventListener('keydown', armAutoLock, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && masterKeyBytes) lock('background'); });

  void refreshRows().then(renderMode);

  return {
    open,
    close,
    lock,
    isUnlocked: () => Boolean(masterKeyBytes),
    handleRemoteUpdate,
    refresh: async () => { await refreshRows(); renderMode(); },
    destroy: () => { destroyed = true; lock('manual'); }
  };
}
