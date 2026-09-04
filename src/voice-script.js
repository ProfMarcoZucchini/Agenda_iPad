const VOICE_SCRIPT_SETTINGS_KEY = 'agenda-ipad-voice-script-settings-v1';
const PREVIEW_THROTTLE_MS = 220;
const FINALIZE_RETRY_MS = 120;

const DEFAULTS = Object.freeze({
  language: 'it-IT',
  fontFamily: 'Snell Roundhand',
  fontSizePx: 32,
  colorMode: 'pen',
  showInterim: true
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
  const button = document.getElementById('voiceScriptToolButton');
  const overlay = document.getElementById('voiceScriptOverlay');
  const preview = document.getElementById('voiceScriptPreview');
  const languageSelect = document.getElementById('voiceScriptLanguage');
  const fontSelect = document.getElementById('voiceScriptFont');
  const fontSizeSelect = document.getElementById('voiceScriptFontSize');
  const colorSelect = document.getElementById('voiceScriptColor');
  const interimCheckbox = document.getElementById('voiceScriptInterim');
  const settingsStatus = document.getElementById('voiceScriptSettingsStatus');

  let config = loadConfig();
  let session = null;
  let recognition = null;
  let previewTimer = 0;
  let finalizeTimer = 0;
  let pendingPreview = false;
  let pendingFinalize = false;
  let destroyed = false;

  function supported() { return Boolean(SpeechRecognitionCtor); }
  function isListening() { return Boolean(session && session.listening); }
  function isActive() { return Boolean(session); }

  function setSettingsStatus(message) {
    if (settingsStatus) settingsStatus.textContent = message;
  }

  function syncSettingsUi() {
    if (languageSelect) languageSelect.value = config.language;
    if (fontSelect) fontSelect.value = config.fontFamily;
    if (fontSizeSelect) fontSizeSelect.value = String(config.fontSizePx);
    if (colorSelect) colorSelect.value = config.colorMode;
    if (interimCheckbox) interimCheckbox.checked = Boolean(config.showInterim);
    setSettingsStatus(supported()
      ? 'Riconoscimento vocale disponibile · nessun salvataggio durante la scrittura Pencil.'
      : 'Voice Script non disponibile in questa versione di Safari/iPadOS.');
  }

  function readSettingsUi() {
    config = {
      language: languageSelect?.value || DEFAULTS.language,
      fontFamily: fontSelect?.value || DEFAULTS.fontFamily,
      fontSizePx: Math.max(18, Math.min(56, Number(fontSizeSelect?.value) || DEFAULTS.fontSizePx)),
      colorMode: colorSelect?.value || DEFAULTS.colorMode,
      showInterim: Boolean(interimCheckbox?.checked)
    };
    saveConfig(config);
    syncSettingsUi();
  }

  for (const input of [languageSelect, fontSelect, fontSizeSelect, colorSelect, interimCheckbox]) {
    input?.addEventListener('change', readSettingsUi);
  }
  syncSettingsUi();

  function resolvedColor() {
    if (config.colorMode === 'pen') return getPenColor() || '#111111';
    return config.colorMode;
  }

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
    if (preview) preview.textContent = '';
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
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition = null;
  }

  async function finalizeWhenIdle(reason = 'stop') {
    clearTimeout(finalizeTimer); finalizeTimer = 0;
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
        createdAt: current.createdAt
      });
      onStatus(ok === false ? 'Voice Script: salvataggio non riuscito' : 'Voice Script salvato');
    } catch (err) {
      console.warn('Voice Script commit non riuscito', err);
      onStatus('Voice Script: errore salvataggio');
    }
  }

  function handleResult(event) {
    if (!session || destroyed) return;
    let interim = '';
    for (let i = Number(event.resultIndex) || 0; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = normalizedText(result?.[0]?.transcript || '');
      if (!transcript) continue;
      if (result.isFinal) session.finalText = joinSpeech(session.finalText, transcript);
      else interim = joinSpeech(interim, transcript);
    }
    session.interimText = interim;
    schedulePreview();
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
      language: config.language,
      fontFamily: config.fontFamily,
      fontSizePx: config.fontSizePx,
      finalText: '',
      interimText: '',
      listening: false,
      stopRequested: false,
      finalizing: false,
      createdAt: new Date().toISOString()
    };

    try {
      recognition = new SpeechRecognitionCtor();
      recognition.lang = session.language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (!session) return;
        session.listening = true;
        setButtonState();
        renderPreviewNow();
        onStatus('Voice Script in ascolto · puoi continuare a scrivere');
      };
      recognition.onresult = handleResult;
      recognition.onerror = (event) => {
        if (!session) return;
        const label = errorLabel(event?.error);
        if (event?.error !== 'aborted' || !session.stopRequested) onStatus(`Voice Script: ${label}`);
        if (!['no-speech','aborted'].includes(String(event?.error || ''))) session.stopRequested = true;
      };
      recognition.onend = () => {
        if (!session) { clearRecognition(); return; }
        session.listening = false;
        setButtonState();
        clearRecognition();
        void finalizeWhenIdle('end');
      };
      setButtonState();
      recognition.start();
      return true;
    } catch (err) {
      console.warn('Avvio Voice Script non riuscito', err);
      clearRecognition();
      hidePreview();
      session = null;
      setButtonState();
      onStatus('Voice Script: impossibile avviare il riconoscimento');
      return false;
    }
  }

  function stopAndFinalize(reason = 'stop') {
    if (!session) return false;
    session.stopRequested = true;
    if (recognition) {
      try { recognition.stop(); return true; } catch {}
    }
    void finalizeWhenIdle(reason);
    return true;
  }

  function cancel() {
    if (!session) return false;
    session.finalText = '';
    session.interimText = '';
    session.stopRequested = true;
    if (recognition) { try { recognition.abort(); } catch {} }
    clearRecognition();
    hidePreview();
    session = null;
    setButtonState();
    onStatus('Voice Script annullato');
    return true;
  }

  function flushIfIdle() {
    if (isRealtimeBusy()) return false;
    if (pendingPreview) renderPreviewNow();
    if (pendingFinalize) void finalizeWhenIdle('ink-idle');
    return true;
  }

  function destroy() {
    destroyed = true;
    clearTimeout(previewTimer);
    clearTimeout(finalizeTimer);
    if (recognition) { try { recognition.abort(); } catch {} }
    clearRecognition();
    hidePreview();
    session = null;
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
