export function dataUrlToBlob(dataUrl) {
  const text = String(dataUrl || '');
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(text);
  if (!match) throw new Error('Data URL immagine non valido');
  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  let bytes;
  if (isBase64) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    const decoded = decodeURIComponent(payload);
    bytes = new TextEncoder().encode(decoded);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function sha256Blob(blob) {
  if (!(blob instanceof Blob)) throw new Error('Blob non valido');
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 non disponibile');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export function isSha256Hash(value) {
  return /^sha256:[0-9a-f]{64}$/i.test(String(value || ''));
}
