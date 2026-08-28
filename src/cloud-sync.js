import { sha256Blob } from './blob-store.js';
import {
  cloudAuthHash,
  decryptBlobFromCloud,
  decryptEventEnvelope,
  encryptBlobForCloud,
  encryptEventEnvelope,
  generateCloudCredentials,
  encodeCloudJoinCode
} from './cloud-crypto.js';

const TRANSPORT_VERSION = 1;
const CLOUD_PUSH_BATCH_SIZE = 10;
const CLOUD_PUSH_TIMEOUT_MS = 60000;

function normalizeEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, globalThis.location?.href);
    if (url.protocol !== 'https:') return '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function apiUrl(base, file, query = '') {
  return `${base}/${file}${query ? `?${query}` : ''}`;
}

async function parseJson(response) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Risposta Cloud non valida (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(data?.error || `Errore Cloud HTTP ${response.status}`);
  return data;
}

export function initCloudSyncTransport(options = {}) {
  const protocolVersion = Number(options.protocolVersion) || 1;
  const getConfig = typeof options.getConfig === 'function' ? options.getConfig : () => ({});
  const getReplicaId = typeof options.getReplicaId === 'function' ? options.getReplicaId : () => '';
  const flushLocal = typeof options.flushLocal === 'function' ? options.flushLocal : async () => {};
  const loadPendingEvents = typeof options.loadPendingEvents === 'function' ? options.loadPendingEvents : async () => [];
  const markEventsSent = typeof options.markEventsSent === 'function' ? options.markEventsSent : async () => {};
  const getPullCursor = typeof options.getPullCursor === 'function' ? options.getPullCursor : async () => 0;
  const setPullCursor = typeof options.setPullCursor === 'function' ? options.setPullCursor : async () => {};
  const hasLocalBlob = typeof options.hasLocalBlob === 'function' ? options.hasLocalBlob : async () => false;
  const getLocalBlob = typeof options.getLocalBlob === 'function' ? options.getLocalBlob : async () => null;
  const putLocalBlob = typeof options.putLocalBlob === 'function' ? options.putLocalBlob : async () => {};
  const applyRemoteEvents = typeof options.applyRemoteEvents === 'function' ? options.applyRemoteEvents : async () => ({ applied: 0, deferred: 0, ignored: 0, conflicts: 0 });
  const isRealtimeBusy = typeof options.isRealtimeBusy === 'function' ? options.isRealtimeBusy : () => false;
  const onStats = typeof options.onStats === 'function' ? options.onStats : () => {};

  const stats = {
    transportVersion: TRANSPORT_VERSION,
    state: 'idle', endpoint: '', groupId: '', cloudId: '',
    lastTestAt: '', lastSyncAt: '', lastAutoReason: '', lastError: '',
    pushed: 0, pushDuplicates: 0, pulled: 0, applied: 0, deferred: 0, ignored: 0, conflicts: 0,
    syncRuns: 0, autoRuns: 0, inkInterruptions: 0, networkRequests: 0, maxRequestMs: 0,
    blobsUploaded: 0, blobBytesUploaded: 0, blobsDownloaded: 0, blobBytesDownloaded: 0,
    encryptedEventsUp: 0, encryptedEventsDown: 0,
    pushBatches: 0, lastPushBatchSize: 0, timeoutAborts: 0
  };

  let activeController = null;
  let running = false;
  let suspendedForInk = false;
  let autoTimer = 0;
  let autoQueuedReason = '';

  const emit = () => { try { onStats({ ...stats }); } catch {} };

  function config(requireCredentials = true) {
    const raw = getConfig() || {};
    const endpoint = normalizeEndpoint(raw.endpoint);
    const mode = String(raw.mode || 'manual');
    if (!endpoint) throw new Error('Endpoint Cloud HTTPS non valido.');
    const groupId = String(raw.groupId || '').trim();
    const authKey = String(raw.authKey || '').trim();
    const encryptionKey = String(raw.encryptionKey || '').trim();
    if (requireCredentials && (!groupId || !authKey || !encryptionKey)) throw new Error('Configurare o creare prima un gruppo Agenda Cloud.');
    stats.endpoint = endpoint;
    stats.groupId = groupId;
    return { endpoint, groupId, authKey, encryptionKey, mode };
  }

  async function request(file, init = {}, timeoutMs = 15000, requireCredentials = true) {
    if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
    const cfg = config(requireCredentials);
    const controller = new AbortController();
    activeController = controller;
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const started = performance.now();
    stats.networkRequests++;
    emit();
    try {
      const headers = { 'Accept': 'application/json', ...(init.headers || {}) };
      if (requireCredentials) {
        headers['X-Agenda-Group-ID'] = cfg.groupId;
        headers['X-Agenda-Auth-Key'] = cfg.authKey;
      }
      if (init.json !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(apiUrl(cfg.endpoint, file, init.query || ''), {
        method: init.method || 'GET', cache: 'no-store', signal: controller.signal, headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body
      });
      return init.raw ? response : await parseJson(response);
    } catch (err) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason === 'timeout') {
          stats.timeoutAborts++;
          throw new Error(`Timeout Cloud dopo ${Math.round(timeoutMs / 1000)} s.`);
        }
        if (reason === 'ink-priority' || suspendedForInk || isRealtimeBusy()) {
          throw new DOMException('Ink priority', 'AbortError');
        }
      }
      throw err;
    } finally {
      clearTimeout(timer);
      stats.maxRequestMs = Math.max(stats.maxRequestMs, performance.now() - started);
      if (activeController === controller) activeController = null;
      emit();
    }
  }

  async function healthCheck() {
    const health = await request('health.php', {}, 10000, false);
    if (health?.service !== 'agenda-sync-cloud') throw new Error('Endpoint non riconosciuto come Agenda Sync Cloud.');
    if (Number(health?.protocolVersion) !== protocolVersion) throw new Error(`Protocollo Cloud incompatibile: app ${protocolVersion}, server ${health?.protocolVersion ?? 'n/a'}.`);
    stats.cloudId = String(health.cloudId || 'aruba');
    return health;
  }

  async function createGroup() {
    if (running) throw new Error('Sincronizzazione già in corso.');
    const cfg = config(false);
    const credentials = generateCloudCredentials();
    const authHash = await cloudAuthHash(credentials.authKey);
    const result = await request('group_create.php', {
      method: 'POST', json: { protocolVersion, groupId: credentials.groupId, authHash }
    }, 15000, false);
    if (!result?.ok || String(result.groupId) !== credentials.groupId) throw new Error('Creazione gruppo Cloud non confermata.');
    return { ...credentials, joinCode: encodeCloudJoinCode(credentials) };
  }

  async function testConnection() {
    if (running) throw new Error('Sincronizzazione già in corso.');
    running = true; suspendedForInk = false; stats.state = 'testing'; stats.lastError = ''; emit();
    try {
      const health = await healthCheck();
      const group = await request('group_status.php', { method: 'GET' }, 10000, true);
      stats.lastTestAt = new Date().toISOString(); stats.state = 'idle'; stats.lastError = ''; emit();
      return { ...health, group };
    } catch (err) {
      stats.state = err?.name === 'AbortError' ? 'ink-paused' : 'error';
      stats.lastError = err?.name === 'AbortError' ? 'Operazione interrotta per priorità Ink.' : String(err?.message || err);
      emit(); throw err;
    } finally { running = false; }
  }

  function blobHashesFromEvents(events) {
    const hashes = new Set();
    for (const event of events || []) {
      if (event?.entityType !== 'image-object') continue;
      const hash = String(event?.payload?.blobHash || event?.payload?.image?.blobHash || '').toLowerCase();
      if (/^sha256:[0-9a-f]{64}$/.test(hash)) hashes.add(hash);
    }
    return [...hashes];
  }

  async function uploadBlobsForEvents(events, encryptionKey) {
    const hashes = blobHashesFromEvents(events);
    if (!hashes.length) return;
    const check = await request('blobs_has.php', { method: 'POST', json: { hashes } }, 15000);
    const present = new Set((Array.isArray(check?.present) ? check.present : []).map((x) => String(x).toLowerCase()));
    for (const hash of hashes) {
      if (present.has(hash)) continue;
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      const row = await getLocalBlob(hash);
      if (!row?.blob) throw new Error(`Blob locale mancante: ${hash}`);
      const encrypted = await encryptBlobForCloud(row.blob, encryptionKey);
      const query = new URLSearchParams({ hash }).toString();
      const result = await request('blob_put.php', {
        method: 'PUT', query, body: encrypted,
        headers: { 'Content-Type': 'application/octet-stream', 'X-Agenda-Blob-Mime': row.mimeType || row.blob.type || 'application/octet-stream' }
      }, 45000);
      if (String(result?.hash || '').toLowerCase() !== hash) throw new Error(`ACK blob Cloud non valido: ${hash}`);
      stats.blobsUploaded++; stats.blobBytesUploaded += Number(row.size) || row.blob.size || 0; emit();
    }
  }

  async function downloadBlobsForEvents(events, encryptionKey) {
    const hashes = blobHashesFromEvents(events);
    const mimeByHash = new Map();
    for (const event of events || []) {
      const hash = String(event?.payload?.blobHash || event?.payload?.image?.blobHash || '').toLowerCase();
      const mime = String(event?.payload?.image?.mimeType || '');
      if (hash && mime) mimeByHash.set(hash, mime);
    }
    for (const hash of hashes) {
      if (await hasLocalBlob(hash)) continue;
      const response = await request('blob_get.php', { method: 'GET', query: new URLSearchParams({ hash }).toString(), raw: true }, 45000);
      if (!response.ok) {
        let detail = ''; try { detail = (await response.json())?.error || ''; } catch {}
        throw new Error(detail || `Download blob Cloud HTTP ${response.status}`);
      }
      const encrypted = await response.blob();
      const mimeType = mimeByHash.get(hash) || response.headers.get('X-Agenda-Blob-Mime') || 'application/octet-stream';
      const plaintext = await decryptBlobFromCloud(encrypted, encryptionKey, mimeType);
      const actualHash = await sha256Blob(plaintext);
      if (actualHash !== hash) throw new Error(`Checksum blob Cloud non valido: atteso ${hash}, ottenuto ${actualHash}`);
      await putLocalBlob({ hash, blob: plaintext, mimeType, size: plaintext.size });
      stats.blobsDownloaded++; stats.blobBytesDownloaded += plaintext.size; emit();
    }
  }

  async function pushPending(encryptionKey) {
    let total = 0;
    while (true) {
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      // Aruba shared hosting: il primo Cloud Sync può includere tutto il backlog
      // delle release precedenti. Batch piccoli evitano un'unica POST lunga che
      // Safari potrebbe abortire prima dell'ACK. Ogni batch viene confermato e
      // marcato cloudSentAt prima di passare al successivo.
      const events = await loadPendingEvents(CLOUD_PUSH_BATCH_SIZE);
      if (!events.length) break;
      stats.lastPushBatchSize = events.length;
      await uploadBlobsForEvents(events, encryptionKey);
      const envelopes = [];
      for (const event of events) {
        envelopes.push(await encryptEventEnvelope(event, encryptionKey));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const result = await request('events_push.php', {
        method: 'POST', json: { protocolVersion, replicaId: String(getReplicaId() || ''), events: envelopes }
      }, CLOUD_PUSH_TIMEOUT_MS);
      const acknowledged = Array.isArray(result?.acknowledgedEventIds) ? result.acknowledgedEventIds : [];
      if (!acknowledged.length && events.length) throw new Error('Cloud non ha confermato gli eventi inviati.');
      await markEventsSent(acknowledged);
      stats.pushed += Number(result?.accepted) || 0;
      stats.pushDuplicates += Number(result?.duplicates) || 0;
      stats.encryptedEventsUp += envelopes.length;
      stats.pushBatches++;
      total += Number(result?.accepted) || 0;
      emit();
      // Yield tra batch: mantiene reattiva la UI e lascia priorità a Ink.
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return total;
  }

  async function pullRemote(encryptionKey) {
    let cursor = Number(await getPullCursor()) || 0;
    let pulled = 0;
    while (true) {
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      const query = new URLSearchParams({ after: String(cursor), limit: '160', excludeReplica: String(getReplicaId() || '') }).toString();
      const result = await request('events_pull.php', { method: 'GET', query }, 30000);
      const wrappers = Array.isArray(result?.events) ? result.events : [];
      const nextCursor = Number(result?.nextCursor);
      if (!Number.isSafeInteger(nextCursor) || nextCursor < cursor) throw new Error('Cursor Cloud non valido.');
      if (wrappers.length) {
        const events = [];
        for (const wrapper of wrappers) {
          events.push(await decryptEventEnvelope(wrapper, encryptionKey));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        await downloadBlobsForEvents(events, encryptionKey);
        const applied = await applyRemoteEvents(events);
        stats.pulled += events.length; stats.encryptedEventsDown += events.length;
        stats.applied += Number(applied?.applied) || 0; stats.deferred += Number(applied?.deferred) || 0;
        stats.ignored += Number(applied?.ignored) || 0; stats.conflicts += Number(applied?.conflicts) || 0;
        pulled += events.length;
      }
      await setPullCursor(nextCursor); cursor = nextCursor; emit();
      if (!result?.hasMore) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return pulled;
  }

  async function syncNow({ auto = false, reason = '' } = {}) {
    if (running) return { skipped: 'running', pushed: 0, pulled: 0 };
    const cfg = config(true);
    if (cfg.mode === 'off') return { skipped: 'off', pushed: 0, pulled: 0 };
    if (auto && cfg.mode !== 'auto') return { skipped: 'manual', pushed: 0, pulled: 0 };
    if (isRealtimeBusy()) {
      if (auto) { scheduleAuto(reason || 'busy-retry', 4500); return { skipped: 'busy', pushed: 0, pulled: 0 }; }
      throw new Error('Termina prima la scrittura o l’operazione corrente.');
    }
    running = true; suspendedForInk = false; stats.state = 'syncing'; stats.lastError = ''; stats.syncRuns++;
    if (auto) { stats.autoRuns++; stats.lastAutoReason = reason || 'auto'; }
    emit();
    try {
      await flushLocal();
      if (isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      await healthCheck();
      await request('group_status.php', { method: 'GET' }, 10000, true);
      const pushed = await pushPending(cfg.encryptionKey);
      const pulled = await pullRemote(cfg.encryptionKey);
      stats.lastSyncAt = new Date().toISOString(); stats.state = 'idle'; stats.lastError = ''; emit();
      return { pushed, pulled, groupId: cfg.groupId };
    } catch (err) {
      if (err?.name === 'AbortError') { stats.state = 'ink-paused'; stats.lastError = 'Cloud Sync interrotta: priorità Ink.'; }
      else { stats.state = 'error'; stats.lastError = String(err?.message || err); }
      emit();
      if (auto) return { error: stats.lastError, pushed: 0, pulled: 0 };
      throw err;
    } finally { running = false; activeController = null; }
  }

  function scheduleAuto(reason = 'change', delayMs = 5000) {
    const cfg = (() => { try { return config(true); } catch { return null; } })();
    if (!cfg || cfg.mode !== 'auto') return false;
    autoQueuedReason = String(reason || 'change');
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      autoTimer = 0;
      const why = autoQueuedReason; autoQueuedReason = '';
      void syncNow({ auto: true, reason: why });
    }, Math.max(1200, Number(delayMs) || 5000));
    return true;
  }

  function suspendForInk() {
    suspendedForInk = true;
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; autoQueuedReason = 'ink-resume'; }
    if (running) {
      stats.inkInterruptions++; stats.state = 'ink-paused'; stats.lastError = 'Cloud Sync interrotta: priorità Ink.';
      try { activeController?.abort('ink-priority'); } catch {}
      emit();
    }
  }

  function resumeAfterInk() {
    suspendedForInk = false;
    if (!running && stats.state === 'ink-paused') stats.state = 'idle';
    emit();
    if (autoQueuedReason) scheduleAuto(autoQueuedReason, 5000);
  }

  emit();
  return {
    createGroup, testConnection, syncNow, scheduleAuto, suspendForInk, resumeAfterInk,
    getDiagnostics: () => ({ ...stats }), normalizeEndpoint
  };
}
