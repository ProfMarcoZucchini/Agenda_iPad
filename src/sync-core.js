const PROTOCOL_VERSION = 1;
const EVENT_SCHEMA_VERSION = 1;
const STATE_KEY = 'sync-state-v1';

function randomHex(bytesLength) {
  const bytes = new Uint8Array(bytesLength);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uuidV7(nowMs = Date.now()) {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);

  let ts = BigInt(Math.max(0, Math.trunc(nowMs)));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(ts & 0xffn);
    ts >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newReplicaId() {
  return `ipad-${randomHex(12)}`;
}

function normalizeVector(value) {
  if (!value || typeof value !== 'object') return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (key && Number.isSafeInteger(n) && n >= 0) result[key] = n;
  }
  return result;
}

export function compareVersionVectors(a, b) {
  const av = normalizeVector(a);
  const bv = normalizeVector(b);
  const keys = new Set([...Object.keys(av), ...Object.keys(bv)]);
  let aGreater = false;
  let bGreater = false;
  for (const key of keys) {
    const x = av[key] || 0;
    const y = bv[key] || 0;
    if (x > y) aGreater = true;
    if (y > x) bGreater = true;
  }
  if (!aGreater && !bGreater) return 'equal';
  if (aGreater && !bGreater) return 'after';
  if (!aGreater && bGreater) return 'before';
  return 'concurrent';
}

function pageEntityId(descriptor) {
  return `page:${String(descriptor?.key || descriptor?.date || 'unknown')}`;
}

function serializableDescriptor(descriptor) {
  return {
    key: String(descriptor?.key || ''),
    date: String(descriptor?.date || ''),
    kind: String(descriptor?.kind || 'agenda'),
    plannerMode: descriptor?.plannerMode ?? null,
    noteIndex: Number(descriptor?.noteIndex) || 0
  };
}

export function initSyncFoundation(options = {}) {
  const appVersion = String(options.appVersion || 'unknown');
  const onStats = typeof options.onStats === 'function' ? options.onStats : () => {};
  const saved = options.persistedState && typeof options.persistedState === 'object' ? options.persistedState : {};
  const replicaId = saved.replicaId || newReplicaId();

  const state = {
    replicaId,
    replicaSequence: Number.isSafeInteger(saved.replicaSequence) ? saved.replicaSequence : 0,
    versionVector: normalizeVector(saved.versionVector),
    hlcWallMs: Number.isFinite(saved.hlcWallMs) ? saved.hlcWallMs : 0,
    hlcLogical: Number.isSafeInteger(saved.hlcLogical) ? saved.hlcLogical : 0
  };
  state.versionVector[replicaId] = Math.max(state.versionVector[replicaId] || 0, state.replicaSequence);

  const stats = {
    protocolVersion: PROTOCOL_VERSION,
    schemaVersion: EVENT_SCHEMA_VERSION,
    replicaId,
    queued: 0,
    persisted: 0,
    persistErrors: 0,
    atomicCommits: 0,
    memoryPending: 0,
    storedPending: Number(options.storedPending) || 0,
    maxQueueCallMs: 0,
    maxAtomicCommitMs: 0,
    pointerMoveSyncCalls: 0,
    lastEventHlc: '',
    lastPersistAt: ''
  };

  let memoryQueue = [];

  const emitStats = () => {
    stats.memoryPending = memoryQueue.length;
    try { onStats({ ...stats }); } catch {}
  };

  function nextHlc() {
    const now = Date.now();
    const wall = Math.max(now, state.hlcWallMs);
    if (wall === state.hlcWallMs) state.hlcLogical += 1;
    else state.hlcLogical = 0;
    state.hlcWallMs = wall;
    return {
      wallMs: wall,
      logical: state.hlcLogical,
      text: `${String(wall).padStart(13, '0')}:${String(state.hlcLogical).padStart(6, '0')}`
    };
  }

  function observeRemoteHlc(remoteHlc) {
    if (!remoteHlc) return;
    const rw = Number(remoteHlc.wallMs);
    const rl = Number(remoteHlc.logical);
    if (!Number.isFinite(rw) || !Number.isSafeInteger(rl)) return;
    const now = Date.now();
    const maxWall = Math.max(now, state.hlcWallMs, rw);
    let logical = 0;
    if (maxWall === state.hlcWallMs && maxWall === rw) logical = Math.max(state.hlcLogical, rl) + 1;
    else if (maxWall === state.hlcWallMs) logical = state.hlcLogical + 1;
    else if (maxWall === rw) logical = rl + 1;
    state.hlcWallMs = maxWall;
    state.hlcLogical = logical;
  }


  function observeRemoteEvent(event) {
    if (!event || typeof event !== 'object') return;
    observeRemoteHlc({ wallMs: event.hlcWallMs, logical: event.hlcLogical });
    const remoteVector = normalizeVector(event.versionVector);
    for (const [key, value] of Object.entries(remoteVector)) {
      state.versionVector[key] = Math.max(state.versionVector[key] || 0, value);
    }
    state.versionVector[state.replicaId] = Math.max(state.versionVector[state.replicaId] || 0, state.replicaSequence);
    emitStats();
  }

  function stateRow(sequenceLimit = state.replicaSequence, vectorSnapshot = state.versionVector, hlcWallMs = state.hlcWallMs, hlcLogical = state.hlcLogical) {
    return {
      key: STATE_KEY,
      protocolVersion: PROTOCOL_VERSION,
      replicaId: state.replicaId,
      replicaSequence: sequenceLimit,
      versionVector: { ...vectorSnapshot },
      hlcWallMs,
      hlcLogical,
      modifiedAt: new Date().toISOString()
    };
  }

  function queueEvent({ entityId, entityType, operation, payload, descriptor, flags }) {
    const started = performance.now();
    state.replicaSequence += 1;
    state.versionVector[state.replicaId] = state.replicaSequence;
    const hlc = nextHlc();
    const event = {
      eventId: uuidV7(hlc.wallMs),
      protocolVersion: PROTOCOL_VERSION,
      schemaVersion: EVENT_SCHEMA_VERSION,
      appVersion,
      replicaId: state.replicaId,
      replicaSequence: state.replicaSequence,
      entityId: String(entityId || 'unknown'),
      entityType: String(entityType || 'unknown'),
      operation: String(operation || 'unknown'),
      wallTimeUtc: new Date(hlc.wallMs).toISOString(),
      hlc: hlc.text,
      hlcWallMs: hlc.wallMs,
      hlcLogical: hlc.logical,
      versionVector: { ...state.versionVector },
      descriptor: descriptor ? serializableDescriptor(descriptor) : null,
      payload: payload ?? null,
      flags: flags ?? null,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    memoryQueue.push(event);
    stats.queued++;
    stats.lastEventHlc = hlc.text;
    stats.maxQueueCallMs = Math.max(stats.maxQueueCallMs, performance.now() - started);
    emitStats();
    return event.eventId;
  }

  function recordStrokeAdded(descriptor, stroke) {
    if (!stroke?.id) return null;
    return queueEvent({
      entityId: `stroke:${stroke.id}`,
      entityType: 'ink-stroke',
      operation: 'stroke.add',
      descriptor,
      payload: { pageEntityId: pageEntityId(descriptor), stroke }
    });
  }

  function recordStrokeDeleted(descriptor, strokeId, reason = 'delete') {
    if (!strokeId) return null;
    return queueEvent({
      entityId: `stroke:${strokeId}`,
      entityType: 'ink-stroke',
      operation: 'stroke.delete',
      descriptor,
      payload: { pageEntityId: pageEntityId(descriptor), strokeId: String(strokeId), tombstone: true, reason }
    });
  }

  function recordPageCleared(descriptor, removedStrokeIds = [], removedImageIds = []) {
    return queueEvent({
      entityId: pageEntityId(descriptor),
      entityType: 'agenda-page',
      operation: 'page.clear',
      descriptor,
      payload: {
        tombstone: true,
        removedStrokeIds: [...removedStrokeIds],
        removedImageIds: [...removedImageIds]
      }
    });
  }

  function recordImageMetadata(descriptor, operation, image, extra = null) {
    if (!image?.id) return null;
    const stripBlob = (value) => {
      if (!value || typeof value !== 'object') return value;
      const { src: _src, ...metadataOnly } = value;
      return metadataOnly;
    };
    const { src, ...metadata } = image;
    const safeExtra = extra && typeof extra === 'object' ? { ...extra } : {};
    if (safeExtra.before) safeExtra.before = stripBlob(safeExtra.before);
    if (safeExtra.after) safeExtra.after = stripBlob(safeExtra.after);
    const before = safeExtra.before && typeof safeExtra.before === 'object' ? safeExtra.before : null;
    const syncFields = ['name', 'mimeType', 'blobHash', 'blobSize', 'x', 'y', 'w', 'h', 'rotation', 'createdAt', 'modifiedAt'];
    const changedFields = operation === 'image.add'
      ? syncFields.filter((field) => metadata[field] !== undefined)
      : syncFields.filter((field) => !before || JSON.stringify(before[field]) !== JSON.stringify(metadata[field]));
    return queueEvent({
      entityId: `image:${image.id}`,
      entityType: 'image-object',
      operation,
      descriptor,
      payload: {
        pageEntityId: pageEntityId(descriptor),
        image: metadata,
        blobHash: typeof metadata.blobHash === 'string' ? metadata.blobHash : null,
        blobSize: Number(metadata.blobSize) || 0,
        changedFields,
        ...safeExtra
      },
      flags: { mediaBlobProtocol: metadata.blobHash ? 'sha256-v1' : 'metadata-only' }
    });
  }

  function recordImageDeleted(descriptor, imageId) {
    if (!imageId) return null;
    return queueEvent({
      entityId: `image:${imageId}`,
      entityType: 'image-object',
      operation: 'image.delete',
      descriptor,
      payload: { pageEntityId: pageEntityId(descriptor), imageId: String(imageId), tombstone: true }
    });
  }


  function recordPageSnapshot(descriptor, record) {
    if (!record || typeof record !== 'object') return null;
    const safeRecord = globalThis.structuredClone ? globalThis.structuredClone(record) : JSON.parse(JSON.stringify(record));
    // Lo snapshot porta struttura, stile e immagini; i tratti Ink vengono pubblicati
    // come eventi stroke.add separati per non creare payload monolitici.
    safeRecord.strokes = [];
    if (Array.isArray(safeRecord.images)) {
      safeRecord.images = safeRecord.images.map((image) => {
        if (!image || typeof image !== 'object') return image;
        const { src: _src, ...metadata } = image;
        return metadata;
      });
    }
    return queueEvent({
      entityId: `snapshot:${String(descriptor?.key || record.date || 'unknown')}`,
      entityType: 'agenda-page-snapshot',
      operation: 'page.snapshot.set',
      descriptor,
      payload: { record: safeRecord, authoritative: true }
    });
  }

  function recordPageProperty(descriptor, field, value, scope = 'current') {
    return queueEvent({
      entityId: scope === 'all' ? 'agenda:page-style-default' : pageEntityId(descriptor),
      entityType: scope === 'all' ? 'agenda-settings' : 'agenda-page',
      operation: 'page.property.set',
      descriptor,
      payload: { field: String(field), value, scope, conflictPolicy: 'lww-hlc-field' }
    });
  }

  // Il commit viene preparato nel normale percorso di persistenza Agenda.
  // Nessuna scrittura IndexedDB viene avviata dal Sync Core durante/tra gli stroke.
  function prepareAtomicCommit(pageKey) {
    const key = String(pageKey || '');
    const events = memoryQueue.filter((event) => String(event.descriptor?.key || '') === key);
    if (!events.length) return { events: [], stateRow: null, eventIds: [] };
    const last = events[events.length - 1];
    const vectorSnapshot = normalizeVector(last.versionVector);
    return {
      events: [...events],
      eventIds: events.map((event) => event.eventId),
      stateRow: stateRow(last.replicaSequence, vectorSnapshot, last.hlcWallMs, last.hlcLogical)
    };
  }

  function markAtomicCommitSucceeded(eventIds, elapsedMs = 0) {
    const ids = new Set(eventIds || []);
    if (!ids.size) return;
    const before = memoryQueue.length;
    memoryQueue = memoryQueue.filter((event) => !ids.has(event.eventId));
    const persisted = before - memoryQueue.length;
    stats.persisted += persisted;
    stats.storedPending += persisted;
    stats.atomicCommits++;
    stats.maxAtomicCommitMs = Math.max(stats.maxAtomicCommitMs, Number(elapsedMs) || 0);
    stats.lastPersistAt = new Date().toISOString();
    emitStats();
  }

  function markAtomicCommitFailed() {
    stats.persistErrors++;
    emitStats();
  }

  function setStoredPending(value) {
    stats.storedPending = Math.max(0, Number(value) || 0);
    emitStats();
  }

  function getUncommittedForPage(pageKey) {
    const key = String(pageKey || '');
    return memoryQueue.filter((event) => String(event.descriptor?.key || '') === key);
  }

  emitStats();

  return {
    protocolVersion: PROTOCOL_VERSION,
    replicaId,
    recordStrokeAdded,
    recordStrokeDeleted,
    recordPageCleared,
    recordImageMetadata,
    recordImageDeleted,
    recordPageSnapshot,
    recordPageProperty,
    queueEvent,
    observeRemoteHlc,
    observeRemoteEvent,
    compareVersionVectors,
    prepareAtomicCommit,
    markAtomicCommitSucceeded,
    markAtomicCommitFailed,
    setStoredPending,
    getUncommittedForPage,
    getStateRow: () => stateRow(),
    getDiagnostics: () => ({ ...stats, memoryPending: memoryQueue.length })
  };
}
