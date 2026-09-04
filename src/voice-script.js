const VOICE_SCRIPT_SETTINGS_KEY = 'agenda-ipad-voice-script-settings-v1';
const PREVIEW_THROTTLE_MS = 180;
const FINALIZE_RETRY_MS = 120;
const RESTART_DELAY_MS = 180;
const SMART_RESTART_MIN_CYCLE_MS = 14000;
const SMART_RESTART_AFTER_FINAL_MS = 420;
const MAX_CONTEXT_PHRASES = 80;
const CONTEXT_BOOST = 5.5;

const DEFAULTS = Object.freeze({
  language: 'it-IT',
  fontFamily: 'Snell Roundhand',
  fontSizePx: 32,
  colorMode: 'pen',
  showInterim: true,
  personalVocabulary: ''
});

function loadConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOICE_SCRIPT_SETTINGS_KEY) || '{}');
    return { ...DEFAULTS, ...(parsed || {}) };
  } catch { return { ...DEFAULTS }; }
}

function saveConfig(config) {
  try { localStorage.setItem(VOICE_SCRIPT_SETTINGS_KEY, JSON.stringify(config)); } catch {}
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function joinSpeech(left, right) {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

// Evita che Safari ripeta le ultime parole quando una sessione viene riavviata.
function mergeSpeech(left, right) {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (!a) return b;
  if (!b) return a;
  const aw = a.split(' ');
  const bw = b.split(' ');
  const max = Math.min(8, aw.length, bw.length);
  let overlap = 0;
  for (let size = max; size >= 1; size--) {
    const tail = aw.slice(-size).join(' ').toLocaleLowerCase();
    const head = bw.slice(0, size).join(' ').toLocaleLowerCase();
    if (tail === head) { overlap = size; break; }
  }
  return `${a} ${bw.slice(overlap).join(' ')}`.trim();
}

function errorLabel(code) {
  const value = String(code || '');
  if (value === 'not-allowed' || value === 'service-not-allowed') return 'permesso microfono non concesso';
  if (value === 'audio-capture') return 'microfono non disponibile';
  if (value === 'network') return 'servizio di riconoscimento non raggiungibile';
  if (value === 'no-speech') return 'nessuna voce rilevata';
  if (value === 'language-not-supported') return 'lingua non supportata';
  if (value === 'aborted') return 'riconoscimento interrotto';
  return value || 'errore riconoscimento vocale';
}

function vocabularyTerms(value) {
  const seen = new Set();
  const terms = [];
  for (const raw of String(value || '').split(/[\n,;]+/)) {
    const term = normalizedText(raw);
    const key = term.toLocaleLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= MAX_CONTEXT_PHRASES) break;
  }
  return terms;
}

function bestAlternative(result) {
  if (!result || !result.length) return { transcript:'', confidence:0 };
  let best = result[0] || { transcript:'', confidence:0 };
  let bestConfidence = Number(best.confidence);
  const confidenceAvailable = Number.isFinite(bestConfidence) && bestConfidence > 0;
  if (!confidenceAvailable) bestConfidence = 0;
  for (let i = 1; i < result.length; i++) {
    const candidate = result[i];
    const confidence = Number(candidate?.confidence);
    if (Number.isFinite(confidence) && confidence > 0 && confidence > bestConfidence) {
      best = candidate;
      bestConfidence = confidence;
    }
  }
  return {
    transcript: normalizedText(best?.transcript || result[0]?.transcript || ''),
    confidence: Math.max(0, Number.isFinite(Number(best?.confidence)) ? Number(best.confidence) : 0)
  };
}

export function initVoiceScript(options = {}) {
  const {
    getPageDescriptor = () => ({ key:'unknown', kind:'agenda', date:'' }),
    getPenColor = () => '#111111',
    isRealtimeBusy = () => false,
    isAudioRecorderActive = () => false,
    onCommit = async () => false,
    onStatus = () => {},
    onStateChange = () => {}
  } = options;

  const SpeechRecognitionCtor = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
  const SpeechRecognitionPhraseCtor = globalThis.SpeechRecognitionPhrase || null;
  const button = document.getElementById('voiceScriptToolButton');
  const overlay = document.getElementById('voiceScriptOverlay');
  const preview = document.getElementById('voiceScriptPreview');
  const languageSelect = document.getElementById('voiceScriptLanguage');
  const fontSelect = document.getElementById('voiceScriptFont');
  const fontSizeSelect = document.getElementById('voiceScriptFontSize');
  const colorSelect = document.getElementById('voiceScriptColor');
  const interimCheckbox = document.getElementById('voiceScriptInterim');
  const vocabularyInput = document.getElementById('voiceScriptVocabulary');
  const settingsStatus = document.getElementById('voiceScriptSettingsStatus');

  let config = loadConfig();
  let session = null;
  let recognition = null;
  let previewTimer = 0;
  let finalizeTimer = 0;
  let restartTimer = 0;
  let pendingPreview = false;
  let pendingFinalize = false;
  let pendingRestart = false;
  let destroyed = false;

  function supported() { return Boolean(SpeechRecognitionCtor); }
  function isListening() { return Boolean(session && session.listening); }
  function isActive() { return Boolean(session); }

  function setSettingsStatus(message) {
    if (settingsStatus) settingsStatus.textContent = message;
  }

  function contextBiasAvailable() {
    if (!SpeechRecognitionCtor || !SpeechRecognitionPhraseCtor) return false;
    try {
      const probe = new SpeechRecognitionCtor();
      return 'phrases' in probe;
    } catch { return false; }
  }

  function syncSettingsUi() {
    if (languageSelect) languageSelect.value = config.language || 'it-IT';
    if (fontSelect) fontSelect.value = config.fontFamily;
    if (fontSizeSelect) fontSizeSelect.value = String(config.fontSizePx);
    if (colorSelect) colorSelect.value = config.colorMode;
    if (interimCheckbox) interimCheckbox.checked = Boolean(config.showInterim);
    if (vocabularyInput) vocabularyInput.value = config.personalVocabulary || '';
    const vocabCount = vocabularyTerms(config.personalVocabulary).length;
    const bias = vocabCount ? (contextBiasAvailable() ? ` · vocabolario contestuale ${vocabCount} termini` : ' · vocabolario salvato, bias non supportato da questo Safari') : '';
    setSettingsStatus(supported()
      ? `Riconoscimento disponibile · it-IT predefinito · 3 alternative · priorità Ink attiva${bias}.`
      : 'Voice Script non disponibile in questa versione di Safari/iPadOS.');
  }

  function readSettingsUi() {
    config = {
      language: languageSelect?.value || 'it-IT',
      fontFamily: fontSelect?.value || DEFAULTS.fontFamily,
      fontSizePx: Math.max(18, Math.min(56, Number(fontSizeSelect?.value) || DEFAULTS.fontSizePx)),
      colorMode: colorSelect?.value || DEFAULTS.colorMode,
      showInterim: Boolean(interimCheckbox?.checked),
      personalVocabulary: String(vocabularyInput?.value || '').slice(0, 4000)
    };
    saveConfig(config);
    syncSettingsUi();
  }

  for (const input of [languageSelect, fontSelect, fontSizeSelect, colorSelect, interimCheckbox, vocabularyInput]) {
    input?.addEventListener('change', readSettingsUi);
  }
  vocabularyInput?.addEventListener('blur', readSettingsUi);
  syncSettingsUi();

  function setButtonState() {
    if (!button) return;
    button.classList.toggle('voice-listening', isListening());
    button.classList.toggle('voice-session-active', isActive());
    if (isListening()) {
      button.setAttribute('aria-label', 'Voice Script attivo. Tocca per terminare');
      button.title = 'Voice Script attivo · tocca per terminare';
    } else {
      button.setAttribute('aria-label', 'Voice Script');
      button.title = 'Voice Script · scegli la posizione e detta';
    }
    onStateChange({ listening:isListening(), active:isActive() });
  }

  function hidePreview() {
    clearTimeout(previewTimer); previewTimer = 0;
    pendingPreview = false;
    if (overlay) overlay.hidden = true;
    if (preview) {
      preview.textContent = '';
      preview.style.transform = '';
    }
  }

  function sessionText(includeInterim = true) {
    if (!session) return '';
    return includeInterim ? joinSpeech(session.finalText, session.interimText) : normalizedText(session.finalText);
  }

  function renderPreviewNow() {
    previewTimer = 0;
    if (!session || !preview || !overlay) return;
    if (isRealtimeBusy()) { pendingPreview = true; return; }
    pendingPreview = false;
    const text = config.showInterim ? sessionText(true) : sessionText(false);
    preview.textContent = text || 'Parla…';
    preview.style.left = `${session.x * 100}%`;
    preview.style.top = `${session.y * 100}%`;
    // Il punto scelto è la baseline, non il bordo superiore del box.
    preview.style.transform = 'translateY(-0.82em)';
    preview.style.maxWidth = `${Math.max(12, (1 - session.x) * 100 - 1)}%`;
    preview.style.fontFamily = `"${session.fontFamily}", "Snell Roundhand", "Apple Chancery", "Segoe Script", cursive`;
    preview.style.fontSize = `${session.fontSizePx}px`;
    preview.style.color = session.color;
    overlay.hidden = false;
  }

  function schedulePreview() {
    if (!session) return;
    if (isRealtimeBusy()) { pendingPreview = true; return; }
    if (previewTimer) return;
    previewTimer = setTimeout(renderPreviewNow, PREVIEW_THROTTLE_MS);
  }

  function clearRecognition() {
    if (!recognition) return null;
    const current = recognition;
    current.onstart = null;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    recognition = null;
    return current;
  }

  function applyContextBias(rec) {
    const terms = vocabularyTerms(config.personalVocabulary);
    if (!terms.length || !SpeechRecognitionPhraseCtor || !('phrases' in rec)) return false;
    try {
      rec.phrases = terms.map((term) => new SpeechRecognitionPhraseCtor(term, CONTEXT_BOOST));
      return true;
    } catch (err) {
      console.info('Voice Script: contextual bias non disponibile', err);
      return false;
    }
  }

  async function finalizeWhenIdle(reason = 'stop') {
    clearTimeout(finalizeTimer); finalizeTimer = 0;
    clearTimeout(restartTimer); restartTimer = 0;
    pendingRestart = false;
    if (!session || session.finalizing) return;
    if (isRealtimeBusy()) {
      pendingFinalize = true;
      finalizeTimer = setTimeout(() => finalizeWhenIdle(reason), FINALIZE_RETRY_MS);
      return;
    }
    pendingFinalize = false;
    session.finalizing = true;
    const current = session;
    const text = normalizedText(joinSpeech(current.finalText, current.interimText));
    hidePreview();
    session = null;
    setButtonState();
    if (!text) {
      onStatus(reason === 'error' ? 'Voice Script terminato' : 'Voice Script: nessun testo acquisito');
      return;
    }
    try {
      const ok = await onCommit({
        descriptor: current.descriptor,
        x: current.x,
        y: current.y,
        text,
        fontFamily: current.fontFamily,
        fontSizePx: current.fontSizePx,
        color: current.color,
        language: current.language,
        createdAt: current.createdAt,
        confidence: current.lastConfidence || 0,
        anchorMode: 'baseline'
      });
      onStatus(ok === false ? 'Voice Script: salvataggio non riuscito' : 'Voice Script salvato');
    } catch (err) {
      console.warn('Voice Script commit non riuscito', err);
      onStatus('Voice Script: errore salvataggio');
    }
  }

  function requestRecognitionRestart(reason = 'smart') {
    if (!session || session.stopRequested || destroyed) return false;
    if (isRealtimeBusy()) { pendingRestart = true; return true; }
    if (restartTimer || session.restartRequested) return true;
    session.restartRequested = true;
    restartTimer = setTimeout(() => {
      restartTimer = 0;
      if (!session || session.stopRequested || destroyed) return;
      if (isRealtimeBusy()) { session.restartRequested = false; pendingRestart = true; return; }
      if (recognition) {
        try { recognition.stop(); return; } catch {}
      }
      session.restartRequested = false;
      startRecognitionCycle(reason);
    }, reason === 'final' ? SMART_RESTART_AFTER_FINAL_MS : RESTART_DELAY_MS);
    return true;
  }

  function handleResult(event) {
    if (!session || destroyed) return;
    let interim = '';
    let sawFinal = false;
    let bestConfidence = session.lastConfidence || 0;
    for (let i = Number(event.resultIndex) || 0; i < event.results.length; i++) {
      const result = event.results[i];
      const selected = bestAlternative(result);
      const transcript = selected.transcript;
      if (!transcript) continue;
      if (result.isFinal) {
        session.finalText = mergeSpeech(session.finalText, transcript);
        sawFinal = true;
        if (selected.confidence > 0) bestConfidence = selected.confidence;
      } else interim = joinSpeech(interim, transcript);
    }
    session.interimText = interim;
    session.lastConfidence = bestConfidence;
    schedulePreview();
    if (sawFinal && performance.now() - session.cycleStartedAt >= SMART_RESTART_MIN_CYCLE_MS) requestRecognitionRestart('final');
  }

  function startRecognitionCycle(reason = 'start') {
    if (!session || session.stopRequested || destroyed) return false;
    if (isRealtimeBusy()) { pendingRestart = true; return true; }
    pendingRestart = false;
    clearTimeout(restartTimer); restartTimer = 0;
    try {
      recognition = new SpeechRecognitionCtor();
      recognition.lang = session.language || 'it-IT';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      applyContextBias(recognition);
      session.cycleStartedAt = performance.now();
      session.restartRequested = false;
      recognition.onstart = () => {
        if (!session) return;
        session.listening = true;
        setButtonState();
        renderPreviewNow();
        onStatus(reason === 'start' ? 'Voice Script in ascolto · puoi continuare a scrivere' : 'Voice Script in ascolto · riconoscimento aggiornato');
      };
      recognition.onresult = handleResult;
      recognition.onerror = (event) => {
        if (!session) return;
        const code = String(event?.error || '');
        const label = errorLabel(code);
        if (code === 'no-speech') {
          onStatus('Voice Script in ascolto · nessuna voce rilevata');
          return;
        }
        if (code === 'aborted' && (session.stopRequested || session.restartRequested)) return;
        onStatus(`Voice Script: ${label}`);
        if (['not-allowed','service-not-allowed','audio-capture','network','language-not-supported'].includes(code)) session.stopRequested = true;
      };
      recognition.onend = () => {
        if (!session) { clearRecognition(); return; }
        const shouldFinalize = Boolean(session.stopRequested);
        const wasRestart = Boolean(session.restartRequested);
        session.listening = false;
        setButtonState();
        clearRecognition();
        if (shouldFinalize) { void finalizeWhenIdle('end'); return; }
        session.restartRequested = false;
        // Le parti intermedie non confermate non vengono committate durante un riavvio.
        if (wasRestart) session.interimText = '';
        requestRecognitionRestart(wasRestart ? 'smart' : 'unexpected-end');
      };
      recognition.start();
      return true;
    } catch (err) {
      console.warn('Avvio ciclo Voice Script non riuscito', err);
      clearRecognition();
      if (session && !session.stopRequested) {
        pendingRestart = true;
        restartTimer = setTimeout(() => { restartTimer = 0; if (!isRealtimeBusy()) startRecognitionCycle('retry'); }, 350);
        return true;
      }
      return false;
    }
  }

  function startAt(position = {}) {
    if (!supported()) {
      onStatus('Voice Script non disponibile su questo Safari/iPadOS');
      setSettingsStatus('Voice Script non disponibile in questa versione di Safari/iPadOS.');
      return false;
    }
    if (isAudioRecorderActive()) {
      onStatus('Termina prima la registrazione audio');
      return false;
    }
    if (session) stopAndFinalize('nuova-dettatura');

    const x = Math.max(0, Math.min(1, Number(position.x) || 0));
    const y = Math.max(0, Math.min(1, Number(position.y) || 0));
    const descriptor = { ...(position.descriptor || getPageDescriptor()) };
    const color = config.colorMode === 'pen' ? (position.penColor || getPenColor() || '#111111') : config.colorMode;
    session = {
      descriptor,
      x, y,
      color,
      language: config.language || 'it-IT',
      fontFamily: config.fontFamily,
      fontSizePx: config.fontSizePx,
      finalText: '',
      interimText: '',
      lastConfidence: 0,
      listening: false,
      stopRequested: false,
      restartRequested: false,
      finalizing: false,
      cycleStartedAt: performance.now(),
      createdAt: new Date().toISOString()
    };

    setButtonState();
    const ok = startRecognitionCycle('start');
    if (!ok) {
      hidePreview();
      session = null;
      setButtonState();
      onStatus('Voice Script: impossibile avviare il riconoscimento');
      return false;
    }
    return true;
  }

  function stopAndFinalize(reason = 'stop') {
    if (!session) return false;
    session.stopRequested = true;
    clearTimeout(restartTimer); restartTimer = 0;
    pendingRestart = false;
    if (recognition) {
      try { recognition.stop(); return true; } catch {}
    }
    void finalizeWhenIdle(reason);
    return true;
  }

  function cancel() {
    if (!session) return false;
    clearTimeout(restartTimer); restartTimer = 0;
    session.finalText = '';
    session.interimText = '';
    session.stopRequested = true;
    const current = clearRecognition();
    if (current) { try { current.abort(); } catch {} }
    hidePreview();
    session = null;
    pendingRestart = false;
    setButtonState();
    onStatus('Voice Script annullato');
    return true;
  }

  function flushIfIdle() {
    if (isRealtimeBusy()) return false;
    if (pendingPreview) renderPreviewNow();
    if (pendingFinalize) void finalizeWhenIdle('ink-idle');
    if (pendingRestart && session && !session.stopRequested) {
      pendingRestart = false;
      requestRecognitionRestart('ink-idle');
    }
    return true;
  }

  function destroy() {
    destroyed = true;
    clearTimeout(previewTimer);
    clearTimeout(finalizeTimer);
    clearTimeout(restartTimer);
    const current = clearRecognition();
    if (current) { try { current.abort(); } catch {} }
    hidePreview();
    session = null;
    pendingRestart = false;
    setButtonState();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session) stopAndFinalize('pagina-nascosta');
  });

  setButtonState();

  return {
    isSupported: supported,
    isListening,
    isActive,
    startAt,
    stopAndFinalize,
    cancel,
    flushIfIdle,
    getConfig: () => ({ ...config }),
    destroy
  };
}
