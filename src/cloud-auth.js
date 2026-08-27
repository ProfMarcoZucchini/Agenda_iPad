const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const MS_GRAPH_SCOPE = 'Files.ReadWrite';
const MS_AUTH_STATE_KEY = 'agenda-ipad-ms-auth-state-v1';
const MS_AUTH_VERIFIER_KEY = 'agenda-ipad-ms-auth-verifier-v1';
const MS_AUTH_REDIRECT_KEY = 'agenda-ipad-ms-auth-redirect-v1';
const MS_AUTH_CLIENT_KEY = 'agenda-ipad-ms-auth-client-v1';
const MS_AUTH_TENANT_KEY = 'agenda-ipad-ms-auth-tenant-v1';
const MS_AUTH_OPEN_SETTINGS_KEY = 'agenda-ipad-ms-auth-open-settings-v1';

let googleLoadPromise = null;

function nowMs() { return Date.now(); }
function randomBase64Url(byteLength = 48) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let binary = '';
  for (const b of hash) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function cleanCurrentUrl() {
  const url = new URL(location.href);
  for (const key of ['code', 'state', 'error', 'error_description', 'session_state']) url.searchParams.delete(key);
  history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function redirectUriForCurrentApp() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

export async function loadGoogleIdentityServices() {
  if (globalThis.google?.accounts?.oauth2) return globalThis.google;
  if (googleLoadPromise) return googleLoadPromise;
  googleLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalThis.google), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity Services non disponibile')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(globalThis.google);
    script.onerror = () => reject(new Error('Impossibile caricare Google Identity Services'));
    document.head.appendChild(script);
  });
  return googleLoadPromise;
}

export function createGoogleDriveAuth({ getClientId, onChange = () => {} } = {}) {
  let token = null;
  let expiresAt = 0;
  let tokenClient = null;

  const emit = () => onChange({ connected: Boolean(token && expiresAt > nowMs() + 15000), expiresAt });

  function currentToken() {
    if (!token || expiresAt <= nowMs() + 15000) {
      token = null; expiresAt = 0; emit(); return '';
    }
    return token;
  }

  async function connect({ prompt = 'consent' } = {}) {
    const clientId = String(getClientId?.() || '').trim();
    if (!clientId) throw new Error('Inserire prima il Client ID Google');
    const google = await loadGoogleIdentityServices();
    if (!google?.accounts?.oauth2?.initTokenClient) throw new Error('Google Identity Services non inizializzato');
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timeout autenticazione Google'));
      }, 120000);
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPE,
        include_granted_scopes: true,
        callback: (response) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (response?.error) { reject(new Error(response.error_description || response.error)); return; }
          token = response?.access_token || '';
          expiresAt = nowMs() + Math.max(60, Number(response?.expires_in) || 3600) * 1000;
          emit(); resolve({ accessToken: token, expiresAt, scope: response?.scope || GOOGLE_SCOPE });
        },
        error_callback: (error) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          reject(new Error(error?.message || error?.type || 'Autenticazione Google annullata'));
        }
      });
      try { tokenClient.requestAccessToken({ prompt }); }
      catch (err) { clearTimeout(timer); settled = true; reject(err); }
    });
  }

  async function test() {
    const accessToken = currentToken();
    if (!accessToken) throw new Error('Google Drive non connesso in questa sessione');
    const response = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1&spaces=drive&fields=files(id,name)', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`Google Drive: HTTP ${response.status}`);
    return true;
  }

  async function disconnect() {
    const oldToken = token;
    token = null; expiresAt = 0; emit();
    try {
      const google = globalThis.google;
      if (oldToken && google?.accounts?.oauth2?.revoke) {
        await new Promise((resolve) => google.accounts.oauth2.revoke(oldToken, () => resolve()));
      }
    } catch {}
  }

  return { connect, test, disconnect, preload: loadGoogleIdentityServices, getAccessToken: currentToken, getExpiresAt: () => expiresAt };
}

export function createOneDriveAuth({ getClientId, getTenant, onChange = () => {} } = {}) {
  let token = null;
  let expiresAt = 0;

  const emit = () => onChange({ connected: Boolean(token && expiresAt > nowMs() + 15000), expiresAt });

  function currentToken() {
    if (!token || expiresAt <= nowMs() + 15000) {
      token = null; expiresAt = 0; emit(); return '';
    }
    return token;
  }

  async function beginConnect() {
    const clientId = String(getClientId?.() || '').trim();
    const tenant = String(getTenant?.() || 'common').trim() || 'common';
    if (!clientId) throw new Error('Inserire prima il Client ID OneDrive');
    const verifier = randomBase64Url(64);
    const challenge = await sha256Base64Url(verifier);
    const state = randomBase64Url(24);
    const redirectUri = redirectUriForCurrentApp();
    sessionStorage.setItem(MS_AUTH_STATE_KEY, state);
    sessionStorage.setItem(MS_AUTH_VERIFIER_KEY, verifier);
    sessionStorage.setItem(MS_AUTH_REDIRECT_KEY, redirectUri);
    sessionStorage.setItem(MS_AUTH_CLIENT_KEY, clientId);
    sessionStorage.setItem(MS_AUTH_TENANT_KEY, tenant);
    sessionStorage.setItem(MS_AUTH_OPEN_SETTINGS_KEY, '1');
    const auth = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_mode', 'query');
    auth.searchParams.set('scope', MS_GRAPH_SCOPE);
    auth.searchParams.set('state', state);
    auth.searchParams.set('code_challenge', challenge);
    auth.searchParams.set('code_challenge_method', 'S256');
    auth.searchParams.set('prompt', 'select_account');
    location.assign(auth.href);
  }

  async function completeRedirectIfPresent() {
    const url = new URL(location.href);
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    if (!error && !code) return { handled: false, openSettings: sessionStorage.getItem(MS_AUTH_OPEN_SETTINGS_KEY) === '1' };
    const expectedState = sessionStorage.getItem(MS_AUTH_STATE_KEY) || '';
    const returnedState = url.searchParams.get('state') || '';
    if (error) {
      const message = url.searchParams.get('error_description') || error;
      cleanCurrentUrl();
      throw new Error(`OneDrive: ${message}`);
    }
    if (!expectedState || returnedState !== expectedState) {
      cleanCurrentUrl();
      throw new Error('OneDrive: controllo state OAuth non valido');
    }
    const verifier = sessionStorage.getItem(MS_AUTH_VERIFIER_KEY) || '';
    const redirectUri = sessionStorage.getItem(MS_AUTH_REDIRECT_KEY) || redirectUriForCurrentApp();
    const clientId = sessionStorage.getItem(MS_AUTH_CLIENT_KEY) || String(getClientId?.() || '').trim();
    const tenant = sessionStorage.getItem(MS_AUTH_TENANT_KEY) || String(getTenant?.() || 'common').trim() || 'common';
    if (!verifier || !clientId) throw new Error('OneDrive: dati PKCE mancanti');
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: MS_GRAPH_SCOPE
    });
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const payload = await response.json().catch(() => ({}));
    cleanCurrentUrl();
    for (const key of [MS_AUTH_STATE_KEY, MS_AUTH_VERIFIER_KEY, MS_AUTH_REDIRECT_KEY, MS_AUTH_CLIENT_KEY, MS_AUTH_TENANT_KEY]) sessionStorage.removeItem(key);
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || `OneDrive token: HTTP ${response.status}`);
    token = payload.access_token;
    expiresAt = nowMs() + Math.max(60, Number(payload.expires_in) || 3600) * 1000;
    emit();
    return { handled: true, connected: true, openSettings: sessionStorage.getItem(MS_AUTH_OPEN_SETTINGS_KEY) === '1' };
  }

  async function test() {
    const accessToken = currentToken();
    if (!accessToken) throw new Error('OneDrive non connesso in questa sessione');
    const response = await fetch('https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`OneDrive: HTTP ${response.status}`);
    return true;
  }

  function disconnect() {
    token = null; expiresAt = 0; emit();
    sessionStorage.removeItem(MS_AUTH_OPEN_SETTINGS_KEY);
  }

  function consumeOpenSettingsRequest() {
    const requested = sessionStorage.getItem(MS_AUTH_OPEN_SETTINGS_KEY) === '1';
    sessionStorage.removeItem(MS_AUTH_OPEN_SETTINGS_KEY);
    return requested;
  }

  return { beginConnect, completeRedirectIfPresent, test, disconnect, getAccessToken: currentToken, getExpiresAt: () => expiresAt, consumeOpenSettingsRequest };
}
