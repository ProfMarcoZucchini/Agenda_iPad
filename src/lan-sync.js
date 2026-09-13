import { sha256Blob } from './blob-store.js';
const TRANSPORT_VERSION = 1;
const API_PREFIX = '/agenda-sync/v1';

function normalizeEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, globalThis.location?.href);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function endpointUrl(base, path) {
  return `${base}${API_PREFIX}${path}`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Risposta LAN non valida (${response.status})`); }
  if (!response.ok) throw new Error(data?.error || `Errore LAN HTTP ${response.status}`);
  return data;
}

export function initLanSyncTransport(options = {}) {
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
  const getGroupEpoch = typeof options.getGroupEpoch === 'function' ? options.getGroupEpoch : async () => '';
  const setGroupEpoch = typeof options.setGroupEpoch === 'function' ? options.setGroupEpoch : async () => {};
  const onGroupEpochMismatch = typeof options.onGroupEpochMismatch === 'function' ? options.onGroupEpochMismatch : async () => {};

  const stats = {
    transportVersion: TRANSPORT_VERSION,
    state: 'idle',
    endpoint: '',
    hubId: '',
    groupEpoch: '',
    restoreState: 'ready',
    lastTestAt: '',
    lastSyncAt: '',
    lastError: '',
    pushed: 0,
    pushDuplicates: 0,
    pulled: 0,
    applied: 0,
    deferred: 0,
    ignored: 0,
    conflicts: 0,
    syncRuns: 0,
    inkInterruptions: 0,
    networkRequests: 0,
    maxRequestMs: 0,
    blobsUploaded: 0,
    blobBytesUploaded: 0,
    blobsDownloaded: 0,
    blobBytesDownloaded: 0
  };

  let activeController = null;
  let running = false;
  let suspendedForInk = false;
  let activeRestoreId = '';
  let activeRestoreEpoch = '';

  const emit = () => {
    try { onStats({ ...stats }); } catch {}
  };

  function validateConfig() {
    const config = getConfig() || {};
    const endpoint = normalizeEndpoint(config.endpoint);
    const syncKey = String(config.syncKey || '').trim();
    if (!endpoint) throw new Error('Inserire l’indirizzo HTTPS/HTTP dell’hub LAN.');
    if (!syncKey) throw new Error('Inserire il codice gruppo LAN.');
    if (globalThis.location?.protocol === 'https:' && endpoint.startsWith('http://')) {
      throw new Error('Agenda è aperta in HTTPS: Safari richiede un hub LAN HTTPS attendibile.');
    }
    stats.endpoint = endpoint;
    return { endpoint, syncKey };
  }

  async function request(path, init = {}, timeoutMs = 12000) {
    if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
    const { endpoint, syncKey } = validateConfig();
    const controller = new AbortController();
    activeController = controller;
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const started = performance.now();
    stats.networkRequests++;
    emit();
    try {
      const response = await fetch(endpointUrl(endpoint, path), {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'X-Agenda-Sync-Key': syncKey,
          ...((!init.skipEpoch && String(init.groupEpoch || activeRestoreEpoch || await getGroupEpoch() || '').trim())
            ? { 'X-Agenda-Group-Epoch': String(init.groupEpoch || activeRestoreEpoch || await getGroupEpoch()).trim() } : {}),
          ...((String(init.restoreId || activeRestoreId || '').trim())
            ? { 'X-Agenda-Restore-ID': String(init.restoreId || activeRestoreId).trim() } : {}),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers || {})
        }
      });
      return await readJsonResponse(response);
    } finally {
      clearTimeout(timer);
      stats.maxRequestMs = Math.max(stats.maxRequestMs, performance.now() - started);
      if (activeController === controller) activeController = null;
      emit();
    }
  }

  function assertProtocol(health) {
    if (health?.service !== 'agenda-sync-hub') throw new Error('Endpoint non riconosciuto come Agenda Sync Hub.');
    if (Number(health?.protocolVersion) !== protocolVersion) {
      throw new Error(`Protocollo incompatibile: app ${protocolVersion}, hub ${health?.protocolVersion ?? 'n/a'}.`);
    }
    if (!health?.hubId) throw new Error('Hub LAN senza identificatore persistente.');
    stats.hubId = String(health.hubId);
    return stats.hubId;
  }

  async function healthCheck() {
    const health = await request('/health', { method: 'GET' }, 8000);
    assertProtocol(health);
    stats.groupEpoch = String(health?.groupEpoch || 'legacy-1');
    stats.restoreState = String(health?.restoreState || 'ready');
    stats.lastTestAt = new Date().toISOString();
    stats.lastError = '';
    emit();
    return health;
  }

  async function testConnection() {
    if (running) throw new Error('Sincronizzazione già in corso.');
    running = true;
    suspendedForInk = false;
    stats.state = 'testing';
    stats.lastError = '';
    emit();
    try {
      const health = await healthCheck();
      stats.state = 'idle';
      emit();
      return health;
    } catch (err) {
      stats.state = err?.name === 'AbortError' ? 'ink-paused' : 'error';
      stats.lastError = err?.name === 'AbortError' ? 'Operazione interrotta per dare priorità alla scrittura.' : String(err?.message || err);
      emit();
      throw err;
    } finally {
      running = false;
    }
  }

  function blobHashesFromEvents(events) {
    const hashes = new Set();
    for (const event of events || []) {
      if (event?.entityType === 'agenda-page-snapshot' && Array.isArray(event?.payload?.record?.images)) {
        for (const image of event.payload.record.images) {
          const hash = String(image?.blobHash || '').toLowerCase();
          if (/^sha256:[0-9a-f]{64}$/.test(hash)) hashes.add(hash);
        }
        continue;
      }
      if (event?.entityType !== 'image-object') continue;
      const hash = String(event?.payload?.blobHash || event?.payload?.image?.blobHash || '').toLowerCase();
      if (/^sha256:[0-9a-f]{64}$/.test(hash)) hashes.add(hash);
    }
    return [...hashes];
  }

  async function uploadBlobsForEvents(events) {
    const hashes = blobHashesFromEvents(events);
    if (!hashes.length) return;
    const check = await request('/blobs/has', { method: 'POST', body: JSON.stringify({ hashes }) }, 15000);
    const present = new Set(Array.isArray(check?.present) ? check.present.map((x) => String(x).toLowerCase()) : []);
    for (const hash of hashes) {
      if (present.has(hash)) continue;
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      const row = await getLocalBlob(hash);
      if (!row?.blob) throw new Error(`Blob locale mancante: ${hash}`);
      const result = await request(`/blobs/${encodeURIComponent(hash)}`, {
        method: 'PUT',
        body: row.blob,
        headers: {
          'Content-Type': row.mimeType || row.blob.type || 'application/octet-stream',
          'X-Agenda-Blob-Mime': row.mimeType || row.blob.type || 'application/octet-stream'
        }
      }, 30000);
      if (String(result?.hash || '').toLowerCase() !== hash) throw new Error(`ACK blob non valido: ${hash}`);
      stats.blobsUploaded++;
      stats.blobBytesUploaded += Number(row.size) || row.blob.size || 0;
      emit();
    }
  }

  async function requestBlob(path, timeoutMs = 30000) {
    if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
    const { endpoint, syncKey } = validateConfig();
    const controller = new AbortController();
    activeController = controller;
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const started = performance.now();
    stats.networkRequests++;
    emit();
    try {
      const response = await fetch(endpointUrl(endpoint, path), {
        method: 'GET', cache: 'no-store', signal: controller.signal,
        headers: {
          'X-Agenda-Sync-Key': syncKey,
          ...((String(activeRestoreEpoch || await getGroupEpoch() || '').trim()) ? { 'X-Agenda-Group-Epoch': String(activeRestoreEpoch || await getGroupEpoch()).trim() } : {}),
          ...((String(activeRestoreId || '').trim()) ? { 'X-Agenda-Restore-ID': String(activeRestoreId).trim() } : {})
        }
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json())?.error || ''; } catch {}
        throw new Error(detail || `Errore LAN HTTP ${response.status}`);
      }
      return {
        blob: await response.blob(),
        hash: String(response.headers.get('X-Agenda-Blob-Hash') || '').toLowerCase(),
        mimeType: String(response.headers.get('Content-Type') || 'application/octet-stream')
      };
    } finally {
      clearTimeout(timer);
      stats.maxRequestMs = Math.max(stats.maxRequestMs, performance.now() - started);
      if (activeController === controller) activeController = null;
      emit();
    }
  }

  async function downloadBlobsForEvents(events) {
    const hashes = blobHashesFromEvents(events);
    const mimeByHash = new Map();
    for (const event of events || []) {
      if (event?.entityType === 'agenda-page-snapshot' && Array.isArray(event?.payload?.record?.images)) {
        for (const image of event.payload.record.images) {
          const hash = String(image?.blobHash || '').toLowerCase();
          const mime = String(image?.mimeType || '');
          if (hash && mime) mimeByHash.set(hash, mime);
        }
        continue;
      }
      const hash = String(event?.payload?.blobHash || event?.payload?.image?.blobHash || '').toLowerCase();
      const mime = String(event?.payload?.image?.mimeType || '');
      if (hash && mime) mimeByHash.set(hash, mime);
    }
    for (const hash of hashes) {
      if (await hasLocalBlob(hash)) continue;
      const remote = await requestBlob(`/blobs/${encodeURIComponent(hash)}`);
      if (remote.hash && remote.hash !== hash) throw new Error(`Hash blob remoto non coerente: ${hash}`);
      const mimeType = mimeByHash.get(hash) || remote.mimeType || 'application/octet-stream';
      const typedBlob = remote.blob.type === mimeType ? remote.blob : new Blob([await remote.blob.arrayBuffer()], { type: mimeType });
      const actualHash = await sha256Blob(typedBlob);
      if (actualHash !== hash) throw new Error(`Checksum blob ricevuto non valido: atteso ${hash}, ottenuto ${actualHash}`);
      await putLocalBlob({ hash, blob: typedBlob, mimeType, size: typedBlob.size });
      stats.blobsDownloaded++;
      stats.blobBytesDownloaded += typedBlob.size;
      emit();
    }
  }

  async function pushPending() {
    let total = 0;
    while (true) {
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      const events = await loadPendingEvents(200);
      if (!events.length) break;
      await uploadBlobsForEvents(events);
      const body = JSON.stringify({
        protocolVersion,
        replicaId: String(getReplicaId() || ''),
        events
      });
      const result = await request('/events/push', { method: 'POST', body }, 20000);
      const acknowledged = Array.isArray(result?.acknowledgedEventIds) ? result.acknowledgedEventIds : events.map((event) => event.eventId);
      await markEventsSent(acknowledged);
      const accepted = Number(result?.accepted) || 0;
      const duplicates = Number(result?.duplicates) || 0;
      stats.pushed += accepted;
      stats.pushDuplicates += duplicates;
      total += accepted;
      emit();
      if (!acknowledged.length) throw new Error('L’hub non ha confermato gli eventi inviati.');
    }
    return total;
  }

  async function pullRemote(hubId) {
    let cursor = await getPullCursor(hubId);
    cursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    let pulled = 0;
    while (true) {
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      const query = new URLSearchParams({
        after: String(cursor),
        limit: '200',
        excludeReplica: String(getReplicaId() || '')
      });
      const result = await request(`/events/pull?${query.toString()}`, { method: 'GET' }, 20000);
      const events = Array.isArray(result?.events) ? result.events : [];
      const nextCursor = Number(result?.nextCursor);
      if (!Number.isSafeInteger(nextCursor) || nextCursor < cursor) throw new Error('Cursor LAN non valido.');
      if (events.length) {
        await downloadBlobsForEvents(events);
        const applied = await applyRemoteEvents(events);
        stats.pulled += events.length;
        stats.applied += Number(applied?.applied) || 0;
        stats.deferred += Number(applied?.deferred) || 0;
        stats.ignored += Number(applied?.ignored) || 0;
        stats.conflicts += Number(applied?.conflicts) || 0;
        pulled += events.length;
      }
      await setPullCursor(hubId, nextCursor);
      cursor = nextCursor;
      emit();
      if (!result?.hasMore) break;
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return pulled;
  }

  async function reconcileEpochBeforeSync(health, hubId) {
    const remoteEpoch = String(health?.groupEpoch || 'legacy-1');
    const localEpoch = String(await getGroupEpoch(hubId) || '');
    if (!localEpoch) { await setGroupEpoch(hubId, remoteEpoch); return false; }
    if (localEpoch === remoteEpoch) return false;
    await onGroupEpochMismatch({ transport: 'lan', hubId, localEpoch, remoteEpoch, restoreState: String(health?.restoreState || 'ready') });
    return true;
  }

  async function syncNow() {
    if (running) throw new Error('Sincronizzazione già in corso.');
    if (isRealtimeBusy()) throw new Error('Termina prima la scrittura o l’operazione corrente.');
    running = true;
    suspendedForInk = false;
    stats.state = 'syncing';
    stats.lastError = '';
    stats.syncRuns++;
    emit();
    try {
      await flushLocal();
      if (isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      const health = await healthCheck();
      const hubId = assertProtocol(health);
      if (String(health?.restoreState || 'ready') === 'pending') throw new Error('Il gruppo LAN è in fase di ripristino globale su un altro dispositivo.');
      if (await reconcileEpochBeforeSync(health, hubId)) return { epochMismatch: true, pushed: 0, pulled: 0, hubId };
      const pushed = await pushPending();
      const pulled = await pullRemote(hubId);
      stats.lastSyncAt = new Date().toISOString();
      stats.state = 'idle';
      stats.lastError = '';
      emit();
      return { pushed, pulled, hubId };
    } catch (err) {
      if (err?.name === 'AbortError') {
        stats.state = 'ink-paused';
        stats.lastError = 'Sync interrotta: priorità alla scrittura Ink.';
      } else {
        stats.state = 'error';
        stats.lastError = String(err?.message || err);
      }
      emit();
      throw err;
    } finally {
      running = false;
      activeController = null;
    }
  }

  async function recoverPullOnly() {
    if (running) throw new Error('Sincronizzazione già in corso.');
    if (isRealtimeBusy()) throw new Error('Termina prima la scrittura o l’operazione corrente.');
    running = true; suspendedForInk = false; stats.state = 'recovering'; stats.lastError = ''; stats.syncRuns++; emit();
    try {
      const health = await healthCheck();
      const hubId = assertProtocol(health);
      if (String(health?.restoreState || 'ready') === 'pending' && !activeRestoreId) throw new Error('Il gruppo LAN è ancora in fase di ripristino globale.');
      await setGroupEpoch(hubId, String(health?.groupEpoch || 'legacy-1'));
      await setPullCursor(hubId, 0);
      const pulled = await pullRemote(hubId);
      stats.lastSyncAt = new Date().toISOString(); stats.state = 'idle'; stats.lastError = ''; emit();
      return { pushed: 0, pulled, hubId, recovery: true };
    } catch (err) {
      if (err?.name === 'AbortError') { stats.state = 'ink-paused'; stats.lastError = 'Riallineamento LAN interrotto: priorità Ink.'; }
      else { stats.state = 'error'; stats.lastError = String(err?.message || err); }
      emit();
      throw err;
    } finally {
      running = false; activeController = null;
    }
  }

  async function beginOrResumeGlobalRestore(restoreId) {
    const rid = String(restoreId || '').trim();
    if (!rid) throw new Error('Identificatore ripristino globale mancante.');
    const health = await healthCheck();
    const hubId = assertProtocol(health);
    if (String(health?.restoreState || 'ready') === 'pending') {
      if (String(health?.restoreId || '') !== rid) throw new Error('Il gruppo LAN è già in ripristino globale da un altro dispositivo.');
      activeRestoreId = rid; activeRestoreEpoch = String(health?.groupEpoch || '');
      await setGroupEpoch(hubId, activeRestoreEpoch);
      return { ...health, hubId };
    }
    const currentEpoch = String(health?.groupEpoch || 'legacy-1');
    const reset = await request('/group/reset', {
      method: 'POST', skipEpoch: true, body: JSON.stringify({ protocolVersion, confirm: 'RESTORE_GROUP', restoreId: rid, expectedEpoch: currentEpoch, replicaId: String(getReplicaId() || '') })
    }, 30000);
    if (!reset?.groupEpoch || reset?.restoreState !== 'pending') throw new Error('Reset generazione LAN non confermato.');
    activeRestoreId = rid; activeRestoreEpoch = String(reset.groupEpoch);
    stats.groupEpoch = activeRestoreEpoch; stats.restoreState = 'pending'; emit();
    await setGroupEpoch(hubId, activeRestoreEpoch);
    return { ...reset, hubId };
  }

  async function publishAndCommitGlobalRestore(restoreId) {
    if (running) throw new Error('Sincronizzazione già in corso.');
    if (isRealtimeBusy()) throw new Error('Termina prima la scrittura o l’operazione corrente.');
    running = true; suspendedForInk = false; stats.state = 'restoring-group'; stats.lastError = ''; emit();
    try {
      const group = await beginOrResumeGlobalRestore(restoreId);
      activeRestoreId = String(restoreId || ''); activeRestoreEpoch = String(group.groupEpoch || activeRestoreEpoch || '');
      const pushed = await pushPending();
      const commit = await request('/group/restore-commit', {
        method: 'POST', body: JSON.stringify({ protocolVersion, restoreId: activeRestoreId, groupEpoch: activeRestoreEpoch, replicaId: String(getReplicaId() || '') })
      }, 30000);
      if (!commit?.ok || commit?.restoreState !== 'ready') throw new Error('Commit ripristino globale LAN non confermato.');
      stats.restoreState = 'ready'; stats.lastSyncAt = new Date().toISOString(); stats.state = 'idle'; emit();
      return { pushed, pulled: 0, hubId: group.hubId, groupEpoch: activeRestoreEpoch, globalRestore: true, cursor: Number(commit.latestCursor) || 0 };
    } catch (err) {
      stats.state = err?.name === 'AbortError' ? 'ink-paused' : 'error'; stats.lastError = String(err?.message || err); emit(); throw err;
    } finally { running = false; activeController = null; activeRestoreId = ''; activeRestoreEpoch = ''; }
  }

  function suspendForInk() {
    suspendedForInk = true;
    if (running) {
      stats.inkInterruptions++;
      stats.state = 'ink-paused';
      stats.lastError = 'Sync interrotta: priorità alla scrittura Ink.';
      try { activeController?.abort('ink-priority'); } catch {}
      emit();
    }
  }

  function resumeAfterInk() {
    suspendedForInk = false;
    if (!running && stats.state === 'ink-paused') stats.state = 'idle';
    emit();
  }

  emit();
  return {
    testConnection,
    syncNow,
    recoverPullOnly,
    publishAndCommitGlobalRestore,
    suspendForInk,
    resumeAfterInk,
    getDiagnostics: () => ({ ...stats }),
    normalizeEndpoint
  };
}
