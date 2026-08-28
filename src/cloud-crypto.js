const te = new TextEncoder();
const td = new TextDecoder();

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

function randomBytes(length) {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

async function importAesKey(keyB64) {
  const raw = b64urlToBytes(keyB64);
  if (raw.length !== 32) throw new Error('Chiave cifratura Cloud non valida');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export function generateCloudCredentials() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto non disponibile');
  return {
    groupId: `ag-${bytesToB64url(randomBytes(15))}`,
    authKey: bytesToB64url(randomBytes(32)),
    encryptionKey: bytesToB64url(randomBytes(32))
  };
}

export function encodeCloudJoinCode(credentials) {
  const groupId = String(credentials?.groupId || '');
  const authKey = String(credentials?.authKey || '');
  const encryptionKey = String(credentials?.encryptionKey || '');
  if (!groupId || !authKey || !encryptionKey) return '';
  return `AGC1.${groupId}.${authKey}.${encryptionKey}`;
}

export function decodeCloudJoinCode(code) {
  const parts = String(code || '').trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'AGC1') throw new Error('Codice gruppo Cloud non valido');
  const [, groupId, authKey, encryptionKey] = parts;
  if (!/^ag-[A-Za-z0-9_-]{10,80}$/.test(groupId)) throw new Error('Group ID Cloud non valido');
  if (b64urlToBytes(authKey).length !== 32 || b64urlToBytes(encryptionKey).length !== 32) throw new Error('Chiavi Cloud non valide');
  return { groupId, authKey, encryptionKey };
}

export async function cloudAuthHash(authKey) {
  const bytes = te.encode(`agenda-cloud-auth-v1:${String(authKey || '')}`);
  return bytesToB64url(await sha256Bytes(bytes));
}

export async function encryptEventEnvelope(event, encryptionKey) {
  const key = await importAesKey(encryptionKey);
  const iv = randomBytes(12);
  const plaintext = te.encode(JSON.stringify(event));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    eventId: String(event?.eventId || ''),
    replicaId: String(event?.replicaId || ''),
    protocolVersion: Number(event?.protocolVersion) || 1,
    cipherVersion: 1,
    iv: bytesToB64url(iv),
    ciphertext: bytesToB64url(ciphertext)
  };
}

export async function decryptEventEnvelope(envelope, encryptionKey) {
  if (Number(envelope?.cipherVersion) !== 1) throw new Error('Formato evento Cloud cifrato non supportato');
  const key = await importAesKey(encryptionKey);
  const iv = b64urlToBytes(envelope.iv);
  const ciphertext = b64urlToBytes(envelope.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const event = JSON.parse(td.decode(plaintext));
  if (String(event?.eventId || '') !== String(envelope?.eventId || '')) throw new Error('Event ID Cloud non coerente');
  if (String(event?.replicaId || '') !== String(envelope?.replicaId || '')) throw new Error('Replica ID Cloud non coerente');
  return event;
}

// Blob container: ASCII "AGB1" + 12 byte IV + AES-GCM ciphertext.
export async function encryptBlobForCloud(blob, encryptionKey) {
  if (!(blob instanceof Blob)) throw new Error('Blob Cloud non valido');
  const key = await importAesKey(encryptionKey);
  const iv = randomBytes(12);
  const plaintext = await blob.arrayBuffer();
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return new Blob([te.encode('AGB1'), iv, ciphertext], { type: 'application/octet-stream' });
}

export async function decryptBlobFromCloud(blob, encryptionKey, mimeType = 'application/octet-stream') {
  if (!(blob instanceof Blob)) throw new Error('Blob Cloud cifrato non valido');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 32 || td.decode(bytes.subarray(0, 4)) !== 'AGB1') throw new Error('Contenitore blob Cloud non valido');
  const iv = bytes.subarray(4, 16);
  const ciphertext = bytes.subarray(16);
  const key = await importAesKey(encryptionKey);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Blob([plaintext], { type: mimeType || 'application/octet-stream' });
}
