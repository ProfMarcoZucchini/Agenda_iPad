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
  const applyRemoteEvents = typeof options.applyRemoteEvents === 'function' ? options.applyRemoteEvents : async () => ({ applied: 0, deferred: 0, ignored: 0, conflicts: 0 });
  const isRealtimeBusy = typeof options.isRealtimeBusy === 'function' ? options.isRealtimeBusy : () => false;
  const onStats = typeof options.onStats === 'function' ? options.onStats : () => {};

  const stats = {
    transportVersion: TRANSPORT_VERSION,
    state: 'idle',
    endpoint: '',
    hubId: '',
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
    maxRequestMs: 0
  };

  let activeController = null;
  let running = false;
  let suspendedForInk = false;

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

  async function pushPending() {
    let total = 0;
    while (true) {
      if (suspendedForInk || isRealtimeBusy()) throw new DOMException('Ink priority', 'AbortError');
      const events = await loadPendingEvents(200);
      if (!events.length) break;
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
    suspendForInk,
    resumeAfterInk,
    getDiagnostics: () => ({ ...stats }),
    normalizeEndpoint
  };
}
