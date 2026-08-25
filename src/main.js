const APP_VERSION = '0.1.2';
const SCHEMA_VERSION = 5;
const MIN_DATE = '2026-01-01';
const MAX_DATE = '2028-12-31';
const DB_NAME = 'AgendaIPadDB';
const DB_VERSION = 4;
const STORE_PAGES = 'pages';
const STORE_NOTES = 'notePages';
const STORE_MEDIA = 'media';
const STORE_VAULT = 'passwordVault';
const VAULT_RECORD_ID = 'main';
const VAULT_ITERATIONS = 250000;
const MAX_UNDO = 5;

const DEFAULT_LAYOUT = 'lined';
const DEFAULT_PAPER = 'antique';
const DEFAULT_COLOR = '#111111';
const DEFAULT_WIDTH = 3;
const COVER_SPLASH_MS = 2000;
const WELCOME_SPLASH_MS = 2000;
const MAX_IMAGE_DIMENSION = 2200;
const IMAGE_WEBP_QUALITY = 0.86;
const AUDIO_BITRATE = 64000;
const AUDIO_MIME_CANDIDATES = ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];

const splashStartedAt = performance.now();
const app = document.querySelector('#app');
app.innerHTML = `
  <div class="intro-screen cover-splash" id="coverSplash" aria-label="Copertina Agenda iPad">
    <div class="cover-card">
      <img src="./assets/cover-agenda-ipad.png" alt="Copertina ornamentale Agenda iPad" />
      <div class="cover-owner" aria-label="Possessore agenda">di Marco Zucchini</div>
      <div class="cover-year" aria-label="Anno 2026">2026</div>
    </div>
  </div>

  <div class="intro-screen welcome-splash" id="welcomeSplash" aria-label="Pagina di benvenuto Agenda iPad" hidden>
    <div class="welcome-card" id="welcomeCard">
      <img src="./assets/welcome-agenda-ipad.png" alt="Pagina di benvenuto Agenda iPad con crediti dello sviluppatore" />
      <div class="welcome-pause-mark" id="welcomePauseMark" aria-hidden="true">Ⅱ</div>
    </div>
  </div>

  <div class="app-shell" id="appShell" hidden>
    <main class="page-stage" aria-label="Agenda giornaliera">
      <section class="page-wrap" id="pageWrap" data-layout="${DEFAULT_LAYOUT}" data-paper="${DEFAULT_PAPER}" data-mode="daily">
        <div class="paper-background" aria-hidden="true"></div>

        <header class="page-header" aria-hidden="true">
          <div class="date-block">
            <div class="day-number" id="dayNumber">24</div>
            <div class="day-text">
              <div class="day-name" id="dayName">LUNEDÌ</div>
              <div class="month-name" id="monthName">agosto</div>
              <div class="saint-name" id="saintName" title="Santo principale del giorno"></div>
              <div class="page-kind-label" id="pageKindLabel"></div>
            </div>
          </div>
          <div class="year-label" id="yearLabel">2026</div>
        </header>

        <div class="page-toolbar" id="pageToolbar" aria-label="Strumenti rapidi della pagina">
          <button class="page-tool-button" id="quickPenBtn" type="button" data-quick-tool="pen" aria-label="Penna" title="Penna">✏️</button>
          <button class="page-tool-button" id="quickHighlighterBtn" type="button" data-quick-tool="highlighter" aria-label="Evidenziatore" title="Evidenziatore">🖍️</button>
          <button class="page-tool-button" id="quickEraserBtn" type="button" data-quick-tool="eraser" aria-label="Gomma" title="Gomma"><svg class="icon-eraser" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8.5a2.5 2.5 0 0 1 2.5 2.5V11H10.5A2.5 2.5 0 0 0 8 13.5V19H7.5A2.5 2.5 0 0 1 5 16.5V8a3 3 0 0 1 3-3Z"/><path d="M10.5 12H19v4.5A2.5 2.5 0 0 1 16.5 19H9v-4.5a2.5 2.5 0 0 1 1.5-2.3Z"/></svg></button>
          <button class="page-tool-button" id="quickUndoBtn" type="button" aria-label="Annulla ultima modifica" title="Annulla ultima modifica">↶</button>
        </div>

        <div class="hours" aria-hidden="true">
          ${Array.from({length:13}, (_,i)=>`<div>${String(i+8).padStart(2,'0')}:00</div>`).join('')}
        </div>

        <div class="object-layer" id="objectLayer" aria-label="Oggetti multimediali della pagina"></div>
        <canvas id="inkCanvas" aria-label="Pagina di scrittura. Apple Pencil per scrivere; dito per sfogliare. Su PC il mouse scrive per impostazione predefinita."></canvas>

        <section class="mini-calendar" id="miniCalendar" aria-label="Mini calendario" hidden>
          <div class="mini-calendar-header">
            <button class="mini-month-nav" id="miniPrevMonth" type="button" aria-label="Mese precedente">‹</button>
            <button class="mini-month-label" id="miniMonthLabel" type="button" title="Scegli direttamente una data"></button>
            <button class="mini-month-nav" id="miniNextMonth" type="button" aria-label="Mese successivo">›</button>
          </div>
          <div class="mini-weekdays" aria-hidden="true">
            <span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span>
          </div>
          <div class="mini-days" id="miniDays"></div>
          <input class="quick-date-input" id="quickDateInput" type="date" min="${MIN_DATE}" max="${MAX_DATE}" tabindex="-1" aria-hidden="true" />
        </section>

        <div class="page-statusbar" aria-label="Barra di stato">
          <button class="notes-button" id="notesBtn" type="button" aria-label="Pagine note associate">
            <span class="notes-glyph" aria-hidden="true">▤</span>
            <span class="notes-badge" id="notesBadge" hidden>0</span>
          </button>
          <button class="vault-jump-button" id="vaultJumpBtn" type="button" aria-label="Apri rubrica password" title="Rubrica password">🔐</button>
          <button class="audio-page-button" id="audioPageBtn" type="button" aria-label="Registrazioni audio della pagina" title="Audio">
            <span aria-hidden="true">🎙</span><span class="audio-badge" id="audioBadge" hidden>0</span>
          </button>
          <button class="calendar-toggle-button" id="calendarToggleBtn" type="button" aria-label="Mostra o nascondi mini calendario" title="Calendario">📅</button>
          <button class="view-mode-button" id="viewModeBtn" type="button" aria-label="Cambia visualizzazione" title="Pagina singola/doppia">▣</button>
          <button class="pin-page-button" id="pinPageBtn" type="button" aria-label="Fissa o sblocca pagina" title="Fissa pagina">📌</button>
          <button class="gear-button" id="gearBtn" type="button" aria-label="Impostazioni pagina e penna" aria-expanded="false">⚙</button>
          <span class="save-status" id="saveStatus">Pronto</span>
        </div>

        <section class="password-book" id="passwordBook" aria-label="Rubrica password A-Z" hidden>
          <div class="password-paper-head">
            <div>
              <div class="password-kicker">RUBRICA RISERVATA</div>
              <h2>🔒 PASSWORD</h2>
            </div>
            <div class="password-head-actions">
              <button type="button" id="vaultLockBtn" class="password-icon-button" title="Blocca rubrica" aria-label="Blocca rubrica">🔒</button>
              <button type="button" id="vaultBackBtn" class="password-icon-button" title="Torna all’agenda" aria-label="Torna all’agenda">↩</button>
            </div>
          </div>

          <div class="alphabet-tabs" id="alphabetTabs" aria-label="Indice alfabetico"></div>

          <section class="vault-gate" id="vaultGate">
            <div class="vault-gate-card">
              <div class="vault-lock-mark">🔐</div>
              <h3 id="vaultGateTitle">Rubrica protetta</h3>
              <p id="vaultGateText">Inserisci la password master per aprire la rubrica. I dati sono cifrati localmente prima di essere salvati.</p>
              <label class="vault-field-label" for="vaultSecret">Password master</label>
              <input id="vaultSecret" type="password" autocomplete="current-password" inputmode="text" />
              <label class="vault-field-label" id="vaultConfirmLabel" for="vaultSecretConfirm" hidden>Conferma password master</label>
              <input id="vaultSecretConfirm" type="password" autocomplete="new-password" hidden />
              <div class="vault-gate-actions">
                <button type="button" id="vaultUnlockBtn" class="vault-primary">Sblocca</button>
              </div>
              <div class="vault-message" id="vaultMessage" role="status" aria-live="polite"></div>
              <div class="vault-security-note">AES-GCM + PBKDF2 · la password master non viene memorizzata.<br><strong>Release di sviluppo:</strong> per ora usa credenziali di test; recovery key e backup cifrato arriveranno nelle fasi di sicurezza.</div>
            </div>
          </section>

          <section class="vault-content" id="vaultContent" hidden>
            <aside class="vault-list-panel">
              <div class="vault-list-head">
                <div><span class="vault-letter" id="vaultLetter">A</span><span class="vault-count" id="vaultCount">0 voci</span></div>
                <button type="button" id="vaultAddBtn" class="vault-add">＋ Nuova</button>
              </div>
              <div class="vault-entry-list" id="vaultEntryList"></div>
            </aside>

            <form class="vault-editor" id="vaultEditor">
              <input type="hidden" id="vaultEntryId" />
              <div class="vault-editor-grid">
                <label><span>Sito / Servizio</span><input id="vaultService" autocomplete="off" /></label>
                <label><span>App</span><input id="vaultApp" autocomplete="off" /></label>
                <label><span>Username</span><input id="vaultUsername" autocomplete="off" /></label>
                <label class="vault-password-field"><span>Password</span><span class="vault-password-input"><input id="vaultPassword" type="password" autocomplete="off" /><button type="button" id="vaultShowPassword" aria-label="Mostra o nascondi password">◉</button></span></label>
                <label><span>Email</span><input id="vaultEmail" type="email" autocomplete="off" /></label>
                <label><span>Domanda segreta / risposta</span><input id="vaultSecretQuestion" autocomplete="off" /></label>
                <label class="vault-notes-field"><span>Note</span><textarea id="vaultNotes" rows="5"></textarea></label>
              </div>
              <div class="vault-editor-actions">
                <button type="submit" class="vault-primary">Salva</button>
                <button type="button" id="vaultDeleteBtn" class="vault-danger" disabled>Elimina</button>
                <span class="vault-save-message" id="vaultSaveMessage" role="status" aria-live="polite"></span>
              </div>
              <div class="vault-scribble-note">I campi sono compatibili con tastiera e con Scribble di iPadOS usando Apple Pencil.</div>
            </form>
          </section>
        </section>

        <section class="settings-panel" id="settingsPanel" aria-label="Impostazioni">
          <div class="settings-title"><span>Impostazioni pagina</span><button class="settings-close" id="settingsClose" type="button" aria-label="Chiudi impostazioni">×</button></div>

          <div class="setting-row">
            <div class="setting-label">Strumento</div>
            <div class="segmented">
              <button class="setting-button tool-choice" data-tool="pen" type="button" aria-pressed="true">✎ Penna</button>
              <button class="setting-button tool-choice" data-tool="highlighter" type="button" aria-pressed="false">🖍 Evidenziatore</button>
              <button class="setting-button tool-choice" data-tool="eraser" type="button" aria-pressed="false">▭ Gomma</button>
              <button class="setting-button tool-choice" data-tool="select" type="button" aria-pressed="false">↖ Oggetti</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">Penna</div>
            <div class="segmented">
              <button class="color-button" data-color="#111111" type="button" aria-label="Nero" aria-pressed="true"></button>
              <button class="color-button" data-color="#174ea6" type="button" aria-label="Blu" aria-pressed="false"></button>
              <button class="color-button" data-color="#b4232b" type="button" aria-label="Rosso" aria-pressed="false"></button>
            </div>
          </div>

          <div class="setting-row">
            <label class="setting-label" for="widthRange">Spessore</label>
            <div class="width-setting"><input id="widthRange" type="range" min="1" max="12" step="1" value="${DEFAULT_WIDTH}" /><span class="width-value" id="widthValue">${DEFAULT_WIDTH}</span></div>
          </div>

          <div class="setting-row">
            <div class="setting-label">Layout</div>
            <div class="segmented">
              <button class="setting-button layout-choice" data-layout="lined" type="button" aria-pressed="true">Righe</button>
              <button class="setting-button layout-choice" data-layout="grid" type="button" aria-pressed="false">Quadretti</button>
              <button class="setting-button layout-choice" data-layout="plain" type="button" aria-pressed="false">Libera</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">Carta</div>
            <div class="segmented">
              <button class="setting-button paper-choice" data-paper="antique" type="button" aria-pressed="true">Giallino antico</button>
              <button class="setting-button paper-choice" data-paper="white" type="button" aria-pressed="false">Bianca</button>
              <button class="setting-button paper-choice" data-paper="dark" type="button" aria-pressed="false">Scura</button>
            </div>
          </div>

          <div class="setting-row media-setting-row">
            <div class="setting-label">Immagini</div>
            <div class="media-settings-body">
              <div class="segmented">
                <button class="setting-button" id="importImageBtn" type="button">▧ Importa</button>
                <button class="setting-button" id="capturePhotoBtn" type="button">◉ Scatta foto</button>
                <button class="setting-button" id="rotateImageBtn" type="button" disabled>↻ Ruota</button>
                <button class="setting-button danger-button" id="deleteImageBtn" type="button" disabled>Elimina</button>
              </div>
              <div class="media-info" id="mediaInfo">Nessuna immagine nella pagina.</div>
              <input id="imageFileInput" class="hidden-media-input" type="file" accept="image/*" />
              <input id="cameraFileInput" class="hidden-media-input" type="file" accept="image/*" capture="environment" />
            </div>
          </div>

          <div class="setting-row audio-setting-row" id="audioSettingRow">
            <div class="setting-label">Audio</div>
            <div class="audio-settings-body">
              <div class="segmented">
                <button class="setting-button" id="audioRecordBtn" type="button">● Registra</button>
                <button class="setting-button" id="audioPauseBtn" type="button" disabled>Ⅱ Pausa</button>
                <button class="setting-button" id="audioStopBtn" type="button" disabled>■ Stop</button>
              </div>
              <div class="audio-record-status" id="audioRecordStatus">Nessuna registrazione in corso.</div>
              <div class="audio-list" id="audioList" aria-label="Registrazioni audio associate alla pagina"></div>
              <div class="setting-hint audio-hint">Audio associato alla pagina corrente. Qualità voce compressa; nessun upload esterno.</div>
            </div>
          </div>

          <div class="setting-row notes-setting-row">
            <div class="setting-label">Pagine note</div>
            <div class="notes-settings-body">
              <div class="segmented">
                <button class="setting-button" id="addNoteBtn" type="button">＋ Nota</button>
                <button class="setting-button" id="openNotesBtn" type="button">Apri</button>
                <button class="setting-button" id="returnDailyBtn" type="button">Agenda</button>
                <button class="setting-button" id="prevNoteBtn" type="button">‹ Nota</button>
                <button class="setting-button" id="nextNoteBtn" type="button">Nota ›</button>
                <button class="setting-button danger-button" id="deleteNoteBtn" type="button">Elimina</button>
              </div>
              <div class="notes-info" id="notesInfo">Nessuna pagina nota associata.</div>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">Rubrica</div>
            <div class="segmented">
              <button class="setting-button" id="openVaultBtn" type="button">🔐 Password A–Z</button>
            </div>
            <div class="setting-hint">Sezione riservata in calce all’agenda, protetta con cifratura locale.</div>
          </div>

          <div class="setting-row">
            <div class="setting-label">Visualizzazione</div>
            <div class="segmented">
              <button class="setting-button view-choice" data-view="single" type="button" aria-pressed="true">▯ Singola</button>
              <button class="setting-button view-choice" data-view="double" type="button" aria-pressed="false">▣ Doppia</button>
            </div>
            <div class="segmented pin-settings">
              <button class="setting-button pin-choice" data-pin="none" type="button" aria-pressed="true">Pin off</button>
              <button class="setting-button pin-choice" data-pin="left" type="button" aria-pressed="false">📌 Sinistra</button>
              <button class="setting-button pin-choice" data-pin="right" type="button" aria-pressed="false">📌 Destra</button>
            </div>
            <div class="setting-hint">Doppia pagina per iPad grandi. Il pin mantiene una pagina fissa mentre l’altra resta sfogliabile.</div>
          </div>

          <div class="setting-row">
            <div class="setting-label">Mouse PC</div>
            <div class="segmented">
              <button class="setting-button mouse-choice" data-mouse="ink" type="button" aria-pressed="true">Scrittura</button>
              <button class="setting-button mouse-choice" data-mouse="page" type="button" aria-pressed="false">Sfoglia</button>
            </div>
            <div class="setting-hint">Serve solo per i test su PC: su iPad la Pencil scrive e il dito sfoglia.</div>
          </div>

          <div class="setting-row">
            <div class="setting-label">Modifiche</div>
            <div class="segmented">
              <button class="setting-button" id="undoBtn" type="button" disabled>↶ Annulla</button>
              <button class="setting-button" id="redoBtn" type="button" disabled>↷ Ripeti</button>
            </div>
          </div>

          <div class="setting-row ipad-test-row">
            <div class="setting-label">iPad / PWA</div>
            <div class="ipad-test-body">
              <div class="ipad-test-line"><span>Versione</span><strong>${APP_VERSION}</strong></div>
              <div class="ipad-test-line"><span>Avvio</span><strong id="pwaModeStatus">Browser</strong></div>
              <div class="ipad-test-line"><span>Offline</span><strong id="pwaOfflineStatus">Verifica…</strong></div>
              <div class="ipad-test-line"><span>Archivio</span><strong id="storagePersistStatus">Verifica…</strong></div>
              <div class="ipad-test-line"><span>Spazio locale</span><strong id="storageUsageStatus">—</strong></div>
              <div class="setting-hint">Su iPad: pubblicare via HTTPS, aprire in Safari e scegliere Condividi → Aggiungi a Home. I dati IndexedDB restano separati dagli aggiornamenti dell’app.</div>
            </div>
          </div>
        </section>
      </section>

      <section class="page-wrap companion-page" id="companionPageWrap" data-layout="lined" data-paper="antique" data-mode="daily" hidden aria-label="Seconda pagina agenda">
        <div class="paper-background" aria-hidden="true"></div>
        <header class="page-header" aria-hidden="true">
          <div class="date-block">
            <div class="day-number" id="companionDayNumber">25</div>
            <div class="day-text">
              <div class="day-name" id="companionDayName">MARTEDÌ</div>
              <div class="month-name" id="companionMonthName">agosto</div>
              <div class="saint-name" id="companionSaintName" title="Santo principale del giorno"></div>
              <div class="page-kind-label" id="companionKindLabel">Pagina di consultazione</div>
            </div>
          </div>
          <div class="year-label" id="companionYearLabel">2026</div>
        </header>
        <div class="page-toolbar" aria-label="Strumenti seconda pagina">
          <button class="page-tool-button companion-tool" data-tool="pen" type="button" aria-label="Modifica con penna" title="Attiva questa pagina con Penna">✏️</button>
          <button class="page-tool-button companion-tool" data-tool="highlighter" type="button" aria-label="Modifica con evidenziatore" title="Attiva questa pagina con Evidenziatore">🖍️</button>
          <button class="page-tool-button companion-tool" data-tool="eraser" type="button" aria-label="Modifica con gomma" title="Attiva questa pagina con Gomma"><svg class="icon-eraser" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8.5a2.5 2.5 0 0 1 2.5 2.5V11H10.5A2.5 2.5 0 0 0 8 13.5V19H7.5A2.5 2.5 0 0 1 5 16.5V8a3 3 0 0 1 3-3Z"/><path d="M10.5 12H19v4.5A2.5 2.5 0 0 1 16.5 19H9v-4.5a2.5 2.5 0 0 1 1.5-2.3Z"/></svg></button>
          <button class="page-tool-button" id="companionUndoBtn" type="button" aria-label="Attiva pagina e annulla" title="Attiva pagina e Annulla">↶</button>
        </div>
        <div class="hours" aria-hidden="true">
          ${Array.from({length:13}, (_,i)=>`<div>${String(i+8).padStart(2,'0')}:00</div>`).join('')}
        </div>
        <div class="object-layer companion-object-layer" id="companionObjectLayer" aria-hidden="true"></div>
        <canvas id="companionCanvas" class="companion-canvas" aria-label="Seconda pagina. Tocca uno strumento per modificarla."></canvas>
        <section class="mini-calendar companion-mini-calendar" id="companionMiniCalendar" aria-label="Mini calendario seconda pagina" hidden>
          <div class="mini-calendar-header">
            <button class="mini-month-nav" id="companionPrevMonth" type="button" aria-label="Mese precedente">‹</button>
            <button class="mini-month-label" id="companionMonthLabel" type="button" aria-label="Data seconda pagina"></button>
            <button class="mini-month-nav" id="companionNextMonth" type="button" aria-label="Mese successivo">›</button>
          </div>
          <div class="mini-weekdays" aria-hidden="true"><span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span></div>
          <div class="mini-days" id="companionMiniDays"></div>
        </section>
        <div class="page-statusbar companion-statusbar">
          <button class="calendar-toggle-button" id="companionCalendarToggleBtn" type="button" aria-label="Mostra o nascondi mini calendario" title="Calendario">📅</button>
          <button class="pin-page-button" id="companionPinBtn" type="button" aria-label="Fissa questa pagina" title="Fissa questa pagina">📌</button>
          <button class="activate-page-button" id="activateCompanionBtn" type="button" aria-label="Attiva seconda pagina" title="Modifica questa pagina">✎</button>
          <span class="save-status" id="companionStatus">Consultazione</span>
        </div>
      </section>
    </main>
  </div>`;

const coverSplash = document.querySelector('#coverSplash');
const welcomeSplash = document.querySelector('#welcomeSplash');
const welcomePauseMark = document.querySelector('#welcomePauseMark');
const appShell = document.querySelector('#appShell');
const canvas = document.querySelector('#inkCanvas');
const objectLayer = document.querySelector('#objectLayer');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const pageWrap = document.querySelector('#pageWrap');
const pageHeader = pageWrap.querySelector('.page-header');
const miniCalendar = document.querySelector('#miniCalendar');
const calendarToggleBtn = document.querySelector('#calendarToggleBtn');
const pageStage = document.querySelector('.page-stage');
const companionPageWrap = document.querySelector('#companionPageWrap');
const companionCanvas = document.querySelector('#companionCanvas');
const companionCtx = companionCanvas.getContext('2d', { alpha: true, desynchronized: true });
const companionObjectLayer = document.querySelector('#companionObjectLayer');
const companionDayNumber = document.querySelector('#companionDayNumber');
const companionDayName = document.querySelector('#companionDayName');
const companionMonthName = document.querySelector('#companionMonthName');
const companionSaintName = document.querySelector('#companionSaintName');
const companionMiniCalendar = document.querySelector('#companionMiniCalendar');
const companionCalendarToggleBtn = document.querySelector('#companionCalendarToggleBtn');
const companionPageHeader = companionPageWrap.querySelector('.page-header');
const companionYearLabel = document.querySelector('#companionYearLabel');
const companionKindLabel = document.querySelector('#companionKindLabel');
const companionMiniDays = document.querySelector('#companionMiniDays');
const companionMonthLabel = document.querySelector('#companionMonthLabel');
const companionPrevMonth = document.querySelector('#companionPrevMonth');
const companionNextMonth = document.querySelector('#companionNextMonth');
const companionPinBtn = document.querySelector('#companionPinBtn');
const activateCompanionBtn = document.querySelector('#activateCompanionBtn');
const companionUndoBtn = document.querySelector('#companionUndoBtn');
const companionStatus = document.querySelector('#companionStatus');
const quickPenBtn = document.querySelector('#quickPenBtn');
const quickHighlighterBtn = document.querySelector('#quickHighlighterBtn');
const quickEraserBtn = document.querySelector('#quickEraserBtn');
const quickUndoBtn = document.querySelector('#quickUndoBtn');
const dayNumber = document.querySelector('#dayNumber');
const dayName = document.querySelector('#dayName');
const monthName = document.querySelector('#monthName');
const saintName = document.querySelector('#saintName');
const pageKindLabel = document.querySelector('#pageKindLabel');
const yearLabel = document.querySelector('#yearLabel');
const saveStatus = document.querySelector('#saveStatus');
const notesBtn = document.querySelector('#notesBtn');
const notesBadge = document.querySelector('#notesBadge');
const gearBtn = document.querySelector('#gearBtn');
const viewModeBtn = document.querySelector('#viewModeBtn');
const pinPageBtn = document.querySelector('#pinPageBtn');
const settingsPanel = document.querySelector('#settingsPanel');
const settingsClose = document.querySelector('#settingsClose');
const widthRange = document.querySelector('#widthRange');
const widthValue = document.querySelector('#widthValue');
const undoBtn = document.querySelector('#undoBtn');
const redoBtn = document.querySelector('#redoBtn');
const miniDays = document.querySelector('#miniDays');
const miniMonthLabel = document.querySelector('#miniMonthLabel');
const miniPrevMonth = document.querySelector('#miniPrevMonth');
const miniNextMonth = document.querySelector('#miniNextMonth');
const quickDateInput = document.querySelector('#quickDateInput');
const addNoteBtn = document.querySelector('#addNoteBtn');
const openNotesBtn = document.querySelector('#openNotesBtn');
const returnDailyBtn = document.querySelector('#returnDailyBtn');
const prevNoteBtn = document.querySelector('#prevNoteBtn');
const nextNoteBtn = document.querySelector('#nextNoteBtn');
const deleteNoteBtn = document.querySelector('#deleteNoteBtn');
const notesInfo = document.querySelector('#notesInfo');
const importImageBtn = document.querySelector('#importImageBtn');
const capturePhotoBtn = document.querySelector('#capturePhotoBtn');
const rotateImageBtn = document.querySelector('#rotateImageBtn');
const deleteImageBtn = document.querySelector('#deleteImageBtn');
const mediaInfo = document.querySelector('#mediaInfo');
const imageFileInput = document.querySelector('#imageFileInput');
const cameraFileInput = document.querySelector('#cameraFileInput');
const vaultJumpBtn = document.querySelector('#vaultJumpBtn');
const audioPageBtn = document.querySelector('#audioPageBtn');
const audioBadge = document.querySelector('#audioBadge');
const audioSettingRow = document.querySelector('#audioSettingRow');
const audioRecordBtn = document.querySelector('#audioRecordBtn');
const audioPauseBtn = document.querySelector('#audioPauseBtn');
const audioStopBtn = document.querySelector('#audioStopBtn');
const audioRecordStatus = document.querySelector('#audioRecordStatus');
const audioList = document.querySelector('#audioList');
const openVaultBtn = document.querySelector('#openVaultBtn');
const passwordBook = document.querySelector('#passwordBook');
const alphabetTabs = document.querySelector('#alphabetTabs');
const vaultGate = document.querySelector('#vaultGate');
const vaultGateTitle = document.querySelector('#vaultGateTitle');
const vaultGateText = document.querySelector('#vaultGateText');
const vaultSecret = document.querySelector('#vaultSecret');
const vaultConfirmLabel = document.querySelector('#vaultConfirmLabel');
const vaultSecretConfirm = document.querySelector('#vaultSecretConfirm');
const vaultUnlockBtn = document.querySelector('#vaultUnlockBtn');
const vaultMessage = document.querySelector('#vaultMessage');
const vaultContent = document.querySelector('#vaultContent');
const vaultLockBtn = document.querySelector('#vaultLockBtn');
const vaultBackBtn = document.querySelector('#vaultBackBtn');
const vaultLetter = document.querySelector('#vaultLetter');
const vaultCount = document.querySelector('#vaultCount');
const vaultEntryList = document.querySelector('#vaultEntryList');
const vaultAddBtn = document.querySelector('#vaultAddBtn');
const vaultEditor = document.querySelector('#vaultEditor');
const vaultEntryId = document.querySelector('#vaultEntryId');
const vaultService = document.querySelector('#vaultService');
const vaultApp = document.querySelector('#vaultApp');
const vaultUsername = document.querySelector('#vaultUsername');
const vaultPassword = document.querySelector('#vaultPassword');
const vaultShowPassword = document.querySelector('#vaultShowPassword');
const vaultEmail = document.querySelector('#vaultEmail');
const vaultSecretQuestion = document.querySelector('#vaultSecretQuestion');
const vaultNotes = document.querySelector('#vaultNotes');
const vaultDeleteBtn = document.querySelector('#vaultDeleteBtn');
const vaultSaveMessage = document.querySelector('#vaultSaveMessage');
const pwaModeStatus = document.querySelector('#pwaModeStatus');
const pwaOfflineStatus = document.querySelector('#pwaOfflineStatus');
const storagePersistStatus = document.querySelector('#storagePersistStatus');
const storageUsageStatus = document.querySelector('#storageUsageStatus');

let db;
let currentDate = initialDate();
let calendarMonth = monthStart(currentDate);
let currentMode = 'daily';
let currentNoteId = null;
let currentNoteSortOrder = 0;
let currentNoteCreatedAt = null;
let notesForDate = [];

let viewMode = 'single';
let activeSide = 'left';
let pinnedSide = null;
let pinnedDate = null;
let mobileDate = currentDate;
let companionDate = null;
let companionCalendarMonth = monthStart(currentDate);
let companionRecord = null;
let companionRenderToken = 0;
const companionObjectUrls = new Map();
const historyCache = new Map();

let strokes = [];
let objects = [];
let attachments = [];
let activeStroke = null;
let tool = 'pen';
let color = DEFAULT_COLOR;
let baseWidth = DEFAULT_WIDTH;
let pageLayout = DEFAULT_LAYOUT;
let paperTone = DEFAULT_PAPER;
let mouseMode = 'ink';
let undoStack = [];
let redoStack = [];
let saveTimer = null;
let pageGesture = null;
let pendingGestureTransition = false;
let activeInkPointerId = null;
let activeStrokeRenderedUntil = 0;
let eraserChanged = false;
let pageChanging = false;
let selectedObjectId = null;
let objectInteraction = null;
let objectRenderToken = 0;
const mediaObjectUrls = new Map();
const audioObjectUrls = new Map();
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let recordingStartedAt = 0;
let recordingPausedAt = 0;
let recordingPausedTotal = 0;
let recordingTimerId = 0;
let recordingMimeType = '';
let passwordReturnDate = currentDate;
let vaultKey = null;
let vaultEntries = [];
let vaultLetterSelected = 'A';
let vaultExists = false;
let vaultGesture = null;

function initialDate() {
  const now = new Date();
  const iso = formatISODate(now);
  if (iso >= MIN_DATE && iso <= MAX_DATE) return iso;
  return MIN_DATE;
}

function formatISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODate(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function clampDate(iso) {
  if (iso < MIN_DATE) return MIN_DATE;
  if (iso > MAX_DATE) return MAX_DATE;
  return iso;
}

function offsetDate(iso, delta) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + delta);
  return clampDate(formatISODate(d));
}

function monthStart(iso) {
  const d = parseISODate(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

function offsetMonth(iso, delta) {
  const d = parseISODate(iso);
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return formatISODate(d);
}

function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_PAGES)) {
        database.createObjectStore(STORE_PAGES, { keyPath: 'date' });
      }
      let notesStore;
      if (!database.objectStoreNames.contains(STORE_NOTES)) {
        notesStore = database.createObjectStore(STORE_NOTES, { keyPath: 'id' });
      } else {
        notesStore = req.transaction.objectStore(STORE_NOTES);
      }
      if (!notesStore.indexNames.contains('referenceDate')) {
        notesStore.createIndex('referenceDate', 'referenceDate', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_MEDIA)) {
        database.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_VAULT)) {
        database.createObjectStore(STORE_VAULT, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetDaily(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PAGES, 'readonly');
    const req = tx.objectStore(STORE_PAGES).get(date);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPutDaily(value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PAGES, 'readwrite');
    tx.objectStore(STORE_PAGES).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetNote(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readonly');
    const req = tx.objectStore(STORE_NOTES).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPutNote(value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    tx.objectStore(STORE_NOTES).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDeleteNote(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    tx.objectStore(STORE_NOTES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetMedia(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const req = tx.objectStore(STORE_MEDIA).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPutMedia(value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDeleteMedia(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetVault() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT, 'readonly');
    const req = tx.objectStore(STORE_VAULT).get(VAULT_RECORD_ID);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPutVault(value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT, 'readwrite');
    tx.objectStore(STORE_VAULT).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetNotesForDate(date) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readonly');
    const index = tx.objectStore(STORE_NOTES).index('referenceDate');
    const req = index.getAll(IDBKeyRange.only(date));
    req.onsuccess = () => {
      const result = (req.result ?? []).sort((a,b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
      resolve(result);
    };
    req.onerror = () => reject(req.error);
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveVaultKey(secret, saltBytes, iterations = VAULT_ITERATIONS) {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto non disponibile in questo browser.');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptVaultEntries(key, entries) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ version: 1, entries }));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

async function decryptVaultEntries(key, record) {
  const iv = base64ToBytes(record.iv);
  const data = base64ToBytes(record.data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error('Archivio rubrica non valido.');
  return parsed.entries;
}

async function createVault(secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey(secret, salt, VAULT_ITERATIONS);
  const encrypted = await encryptVaultEntries(key, []);
  await idbPutVault({
    id: VAULT_RECORD_ID,
    formatVersion: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: VAULT_ITERATIONS,
    salt: bytesToBase64(salt),
    cipher: 'AES-256-GCM',
    iv: encrypted.iv,
    data: encrypted.data,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  });
  vaultKey = key;
  vaultEntries = [];
  vaultExists = true;
}

async function unlockVault(secret) {
  const record = await idbGetVault();
  if (!record) throw new Error('Rubrica non inizializzata.');
  const salt = base64ToBytes(record.salt);
  const key = await deriveVaultKey(secret, salt, Number(record.iterations) || VAULT_ITERATIONS);
  const entries = await decryptVaultEntries(key, record);
  vaultKey = key;
  vaultEntries = entries;
  vaultExists = true;
}

async function persistVaultEntries() {
  if (!vaultKey) throw new Error('Rubrica bloccata.');
  const record = await idbGetVault();
  if (!record) throw new Error('Rubrica non inizializzata.');
  const encrypted = await encryptVaultEntries(vaultKey, vaultEntries);
  await idbPutVault({
    ...record,
    iv: encrypted.iv,
    data: encrypted.data,
    modifiedAt: new Date().toISOString()
  });
}

function normalizeVaultLetter(value, fallback = vaultLetterSelected) {
  const text = String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const first = text.match(/[A-Z]/)?.[0];
  return first || fallback || 'A';
}

function sortVaultEntries() {
  vaultEntries.sort((a, b) => {
    const la = a.letter || normalizeVaultLetter(a.service || a.app, 'A');
    const lb = b.letter || normalizeVaultLetter(b.service || b.app, 'A');
    return la.localeCompare(lb, 'it') || String(a.service || a.app || '').localeCompare(String(b.service || b.app || ''), 'it', { sensitivity: 'base' });
  });
}

function renderAlphabetTabs() {
  alphabetTabs.innerHTML = '';
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = letter;
    button.dataset.letter = letter;
    button.className = 'alphabet-tab';
    button.setAttribute('aria-pressed', String(letter === vaultLetterSelected));
    button.title = `Vai alla lettera ${letter}`;
    alphabetTabs.appendChild(button);
  }
}

function clearVaultEditor() {
  vaultEntryId.value = '';
  vaultService.value = '';
  vaultApp.value = '';
  vaultUsername.value = '';
  vaultPassword.value = '';
  vaultPassword.type = 'password';
  vaultEmail.value = '';
  vaultSecretQuestion.value = '';
  vaultNotes.value = '';
  vaultDeleteBtn.disabled = true;
  vaultSaveMessage.textContent = '';
}

function editVaultEntry(id) {
  const entry = vaultEntries.find(item => item.id === id);
  if (!entry) return;
  vaultEntryId.value = entry.id;
  vaultService.value = entry.service || '';
  vaultApp.value = entry.app || '';
  vaultUsername.value = entry.username || '';
  vaultPassword.value = entry.password || '';
  vaultPassword.type = 'password';
  vaultEmail.value = entry.email || '';
  vaultSecretQuestion.value = entry.secretQuestion || '';
  vaultNotes.value = entry.notes || '';
  vaultDeleteBtn.disabled = false;
  vaultSaveMessage.textContent = '';
  vaultService.focus({ preventScroll: true });
}

function renderVaultEntries() {
  if (!vaultKey) return;
  sortVaultEntries();
  const entries = vaultEntries.filter(entry => (entry.letter || normalizeVaultLetter(entry.service || entry.app, 'A')) === vaultLetterSelected);
  vaultLetter.textContent = vaultLetterSelected;
  vaultCount.textContent = `${entries.length} ${entries.length === 1 ? 'voce' : 'voci'}`;
  vaultEntryList.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'vault-empty';
    empty.textContent = `Nessuna voce nella sezione ${vaultLetterSelected}.`;
    vaultEntryList.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vault-entry-button';
    button.dataset.id = entry.id;
    const title = document.createElement('strong');
    title.textContent = entry.service || entry.app || 'Voce senza nome';
    const meta = document.createElement('span');
    meta.textContent = [entry.app && entry.app !== entry.service ? entry.app : '', entry.username || entry.email || ''].filter(Boolean).join(' · ');
    button.append(title, meta);
    vaultEntryList.appendChild(button);
  }
}

function configureVaultGate() {
  const creating = !vaultExists;
  vaultGateTitle.textContent = creating ? 'Crea la rubrica protetta' : 'Rubrica protetta';
  vaultGateText.textContent = creating
    ? 'Definisci una password master. Verrà usata solo per derivare la chiave di cifratura e non sarà salvata nell’app.'
    : 'Inserisci la password master per decifrare localmente la rubrica.';
  vaultConfirmLabel.hidden = !creating;
  vaultSecretConfirm.hidden = !creating;
  vaultUnlockBtn.textContent = creating ? 'Crea e sblocca' : 'Sblocca';
  vaultSecret.autocomplete = creating ? 'new-password' : 'current-password';
  vaultSecret.value = '';
  vaultSecretConfirm.value = '';
  vaultMessage.textContent = '';
}

function renderVaultState() {
  renderAlphabetTabs();
  const unlocked = Boolean(vaultKey);
  vaultGate.hidden = unlocked;
  vaultContent.hidden = !unlocked;
  vaultLockBtn.disabled = !unlocked;
  if (unlocked) {
    renderVaultEntries();
    clearVaultEditor();
  } else {
    configureVaultGate();
    setTimeout(() => vaultSecret.focus({ preventScroll: true }), 0);
  }
}

function lockVault(message = '') {
  vaultKey = null;
  vaultEntries = [];
  clearVaultEditor();
  if (currentMode === 'password') {
    renderVaultState();
    if (message) vaultMessage.textContent = message;
  }
}

async function openPasswordBook(direction = 'next', fromEnd = false) {
  if (pageChanging || currentMode === 'password') return;
  passwordReturnDate = fromEnd ? MAX_DATE : currentDate;
  await savePage(true);
  await animateSwitch(direction, async () => {
    currentMode = 'password';
    pageWrap.dataset.mode = 'password';
    passwordBook.hidden = false;
    setSettingsOpen(false);
    renderVaultState();
    saveStatus.textContent = vaultKey ? 'Rubrica aperta' : 'Rubrica bloccata';
    setMainCalendarVisible(false);
    notesBtn.hidden = true;
    vaultJumpBtn.hidden = true;
    audioPageBtn.hidden = true;
    await updateSpreadView();
  }, false);
}

async function closePasswordBook(direction = 'prev') {
  if (currentMode !== 'password') return;
  const returnDate = clampDate(passwordReturnDate || MAX_DATE);
  await animateSwitch(direction, () => loadDailyPage(returnDate), false);
}

function startVaultGesture(ev) {
  const interactive = ev.target.closest('button,input,textarea,label,form,.vault-entry-list');
  if (interactive) return;
  const allowed = ev.pointerType === 'touch' || (ev.pointerType === 'mouse' && mouseMode === 'page' && ev.button === 0);
  if (!allowed) return;
  vaultGesture = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: performance.now() };
  passwordBook.setPointerCapture(ev.pointerId);
}

async function finishVaultGesture(ev) {
  if (!vaultGesture || vaultGesture.id !== ev.pointerId) return;
  const g = vaultGesture;
  vaultGesture = null;
  const dx = ev.clientX - g.x0;
  const dy = ev.clientY - g.y0;
  const dt = performance.now() - g.t0;
  if (dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 1500) await closePasswordBook('prev');
}

function basePageFields() {
  return {
    schemaVersion: SCHEMA_VERSION,
    layout: pageLayout,
    background: paperTone,
    strokes,
    objects,
    attachments,
    modifiedAt: new Date().toISOString()
  };
}

function pageRecord() {
  if (currentMode === 'note') {
    return {
      ...basePageFields(),
      id: currentNoteId,
      kind: 'note',
      referenceDate: currentDate,
      sortOrder: currentNoteSortOrder,
      createdAt: currentNoteCreatedAt ?? new Date().toISOString(),
      template: pageLayout === 'lined' ? 'note-lined-v1' : pageLayout === 'grid' ? 'note-grid-v1' : 'note-plain-v1'
    };
  }
  return {
    ...basePageFields(),
    date: currentDate,
    kind: 'daily',
    template: pageLayout === 'lined' ? 'daily-lined-v1' : pageLayout === 'grid' ? 'daily-grid-v1' : 'daily-plain-v1'
  };
}

async function savePage(immediate = false) {
  if (currentMode === 'password') return;
  clearTimeout(saveTimer);
  const doSave = async () => {
    try {
      saveStatus.textContent = 'Salvataggio…';
      saveStatus.classList.add('warn');
      const record = pageRecord();
      if (currentMode === 'note') await idbPutNote(record);
      else await idbPutDaily(record);
      saveStatus.textContent = 'Salvato';
      saveStatus.classList.remove('warn');
    } catch (err) {
      console.error(err);
      saveStatus.textContent = 'Errore';
      saveStatus.classList.add('warn');
    }
  };
  if (immediate) await doSave();
  else saveTimer = setTimeout(doSave, 160);
}

function layoutFromLegacyRecord(record, fallback = DEFAULT_LAYOUT) {
  if (record?.layout) return record.layout;
  if (record?.template?.includes('grid')) return 'grid';
  if (record?.template?.includes('plain')) return 'plain';
  return fallback;
}

function paperFromLegacyRecord(record, fallback = DEFAULT_PAPER) {
  if (!record?.background) return fallback;
  if (record.background === 'ivory') return 'antique';
  if (['antique','white','dark'].includes(record.background)) return record.background;
  return fallback;
}

function currentHistoryKey() {
  if (currentMode === 'note' && currentNoteId) return `note:${currentNoteId}`;
  if (currentMode === 'daily' && currentDate) return `daily:${currentDate}`;
  return null;
}

function stashCurrentHistory() {
  const key = currentHistoryKey();
  if (!key) return;
  historyCache.set(key, { undo: structuredClone(undoStack), redo: structuredClone(redoStack) });
}

function restoreCurrentHistory() {
  const key = currentHistoryKey();
  const saved = key ? historyCache.get(key) : null;
  undoStack = saved ? structuredClone(saved.undo) : [];
  redoStack = saved ? structuredClone(saved.redo) : [];
  updateUndoRedo();
}

function loadContentFromRecord(record, fallbackLayout = DEFAULT_LAYOUT, fallbackPaper = DEFAULT_PAPER) {
  strokes = record?.strokes ?? [];
  objects = record?.objects ?? [];
  attachments = record?.attachments ?? [];
  pageLayout = layoutFromLegacyRecord(record, fallbackLayout);
  paperTone = paperFromLegacyRecord(record, fallbackPaper);
  undoStack = [];
  redoStack = [];
  activeStroke = null;
  selectedObjectId = null;
  objectInteraction = null;
  applyPageAppearance();
  updateSettingsUI();
  updateUndoRedo();
  renderAll();
  renderObjects().catch(err => console.error('Errore rendering oggetti:', err));
  renderAudioUI().catch(err => console.error('Errore rendering audio:', err));
}

async function refreshNotesForDate() {
  notesForDate = await idbGetNotesForDate(currentDate);
  updateNotesUI();
}

async function loadDailyPage(date) {
  stashCurrentHistory();
  passwordBook.hidden = true;
  notesBtn.hidden = false;
  vaultJumpBtn.hidden = false;
  audioPageBtn.hidden = false;
  currentDate = clampDate(date);
  currentMode = 'daily';
  currentNoteId = null;
  currentNoteSortOrder = 0;
  currentNoteCreatedAt = null;
  const record = await idbGetDaily(currentDate);
  loadContentFromRecord(record);
  restoreCurrentHistory();
  if (viewMode === 'pinned' && activeSide !== pinnedSide) mobileDate = currentDate;
  else if (viewMode !== 'pinned') mobileDate = currentDate;
  await refreshNotesForDate();
  updateDateUI();
  updatePageContextUI();
  await updateSpreadView();
}

async function loadNotePage(id) {
  stashCurrentHistory();
  passwordBook.hidden = true;
  notesBtn.hidden = false;
  vaultJumpBtn.hidden = false;
  audioPageBtn.hidden = false;
  const record = await idbGetNote(id);
  if (!record) {
    await loadDailyPage(currentDate);
    return;
  }
  currentMode = 'note';
  currentNoteId = record.id;
  currentDate = clampDate(record.referenceDate);
  currentNoteSortOrder = record.sortOrder ?? 1;
  currentNoteCreatedAt = record.createdAt ?? record.modifiedAt ?? new Date().toISOString();
  loadContentFromRecord(record, DEFAULT_LAYOUT, DEFAULT_PAPER);
  restoreCurrentHistory();
  await refreshNotesForDate();
  updateDateUI();
  updatePageContextUI();
  await updateSpreadView();
}

function applyPageAppearance() {
  pageWrap.dataset.layout = pageLayout;
  pageWrap.dataset.paper = paperTone;
  pageWrap.dataset.mode = currentMode;
  pageWrap.classList.toggle('object-editing', tool === 'select');
}

function saintCacheKey(iso) { return `agenda-ipad:saint:${iso}`; }

function extractSaintName(payload) {
  const pick = value => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.length ? pick(value[0]) : '';
    if (typeof value === 'object') {
      for (const key of ['nome','name','santo','saint','titolo','title','NomeSanto','nome_santo']) {
        const v = pick(value[key]); if (v) return v;
      }
      for (const key of ['santi','saints','results','result','data','items']) {
        const v = pick(value[key]); if (v) return v;
      }
    }
    return '';
  };
  return pick(payload);
}

async function updateSaintLabel(iso, element) {
  if (!element || !iso) return;
  element.dataset.saintDate = iso;
  const cached = localStorage.getItem(saintCacheKey(iso));
  if (cached) { element.textContent = `Santo del giorno · ${cached}`; return; }
  element.textContent = 'Santo del giorno · …';
  try {
    const response = await fetch(`https://www.santodelgiorno.it/santi.json?data=${encodeURIComponent(iso)}`, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const name = extractSaintName(payload);
    if (!name) throw new Error('Santo non riconosciuto');
    localStorage.setItem(saintCacheKey(iso), name);
    if (element.dataset.saintDate === iso) element.textContent = `Santo del giorno · ${name}`;
  } catch (error) {
    console.warn('Santo del giorno non disponibile:', error);
    if (element.dataset.saintDate === iso) element.textContent = cached ? `Santo del giorno · ${cached}` : 'Santo del giorno · non disponibile offline';
  }
}

function setMainCalendarVisible(show) {
  if (!miniCalendar) return;
  miniCalendar.hidden = !show;
  calendarToggleBtn?.classList.toggle('active', show);
  calendarToggleBtn?.setAttribute('aria-pressed', String(show));
}

function setCompanionCalendarVisible(show) {
  if (!companionMiniCalendar) return;
  companionMiniCalendar.hidden = !show;
  companionCalendarToggleBtn?.classList.toggle('active', show);
  companionCalendarToggleBtn?.setAttribute('aria-pressed', String(show));
}

function updateDateUI() {
  const d = parseISODate(currentDate);
  dayNumber.textContent = d.getDate();
  const weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(d);
  if (currentMode === 'note') {
    dayName.textContent = 'NOTE DI SUPPORTO';
    monthName.textContent = `${weekday.toLowerCase()} · ${month}`;
  } else {
    dayName.textContent = weekday;
    monthName.textContent = month;
  }
  yearLabel.textContent = d.getFullYear();
  updateSaintLabel(currentDate, saintName);
  setMainCalendarVisible(false);
  quickDateInput.value = currentDate;
  calendarMonth = monthStart(currentDate);
  renderMiniCalendar();
  updatePageContextUI();
}

function updatePageContextUI() {
  applyPageAppearance();
  const dailyViewControls = currentMode === 'daily';
  viewModeBtn.hidden = !dailyViewControls;
  pinPageBtn.hidden = !dailyViewControls;
  if (currentMode === 'note') {
    const pos = Math.max(0, notesForDate.findIndex(n => n.id === currentNoteId));
    const humanPos = pos + 1;
    pageKindLabel.textContent = `Pagina nota ${humanPos} · collegata al ${new Intl.DateTimeFormat('it-IT', {day:'numeric', month:'long', year:'numeric'}).format(parseISODate(currentDate))}`;
    notesBtn.setAttribute('aria-label', 'Torna alla pagina agenda');
    notesBtn.title = 'Torna alla pagina agenda';
  } else {
    pageKindLabel.textContent = '';
    notesBtn.setAttribute('aria-label', 'Apri o crea pagine note associate');
    notesBtn.title = notesForDate.length ? 'Apri pagine note associate' : 'Crea una pagina nota associata';
  }
  updateNotesUI();
  updateMediaUI();
}

function updateNotesUI() {
  const count = notesForDate.length;
  notesBadge.textContent = String(count);
  notesBadge.hidden = count === 0;
  const pos = currentMode === 'note' ? notesForDate.findIndex(n => n.id === currentNoteId) : -1;

  if (currentMode === 'daily') {
    notesInfo.textContent = count === 0 ? 'Nessuna pagina nota associata a questa giornata.' : `${count} ${count === 1 ? 'pagina nota associata' : 'pagine note associate'} alla giornata.`;
    openNotesBtn.hidden = count === 0;
    returnDailyBtn.hidden = true;
    prevNoteBtn.hidden = true;
    nextNoteBtn.hidden = true;
    deleteNoteBtn.hidden = true;
  } else {
    notesInfo.textContent = `Pagina nota ${pos + 1} di ${Math.max(1, count)} · riferimento ${currentDate}.`;
    openNotesBtn.hidden = true;
    returnDailyBtn.hidden = false;
    prevNoteBtn.hidden = false;
    nextNoteBtn.hidden = false;
    deleteNoteBtn.hidden = false;
    prevNoteBtn.disabled = pos <= 0;
    nextNoteBtn.disabled = pos < 0;
  }
}

function renderMiniCalendar() {
  const m = parseISODate(calendarMonth);
  const year = m.getFullYear();
  const month = m.getMonth();
  miniMonthLabel.textContent = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(m);

  const minMonth = monthStart(MIN_DATE);
  const maxMonth = monthStart(MAX_DATE);
  miniPrevMonth.disabled = calendarMonth <= minMonth;
  miniNextMonth.disabled = calendarMonth >= maxMonth;

  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const mondayIndex = (first.getDay() + 6) % 7;
  const todayIso = formatISODate(new Date());
  const cells = [];
  for (let i = 0; i < mondayIndex; i++) cells.push('<span class="mini-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const classes = ['mini-day'];
    if (iso === currentDate) classes.push('selected');
    if (iso === todayIso) classes.push('today');
    cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${iso}" aria-label="${iso}" ${iso < MIN_DATE || iso > MAX_DATE ? 'disabled' : ''}>${day}</button>`);
  }
  while (cells.length % 7) cells.push('<span class="mini-empty" aria-hidden="true"></span>');
  miniDays.innerHTML = cells.join('');
}


function safePrefGet(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function persistViewPreferences() {
  try {
    localStorage.setItem('agenda.viewMode', viewMode);
    localStorage.setItem('agenda.activeSide', activeSide);
    localStorage.setItem('agenda.pinnedSide', pinnedSide ?? '');
    localStorage.setItem('agenda.pinnedDate', pinnedDate ?? '');
    localStorage.setItem('agenda.mobileDate', mobileDate ?? currentDate);
  } catch {}
}

function loadViewPreferences() {
  const savedView = safePrefGet('agenda.viewMode', 'single');
  viewMode = ['single','double','pinned'].includes(savedView) ? savedView : 'single';
  const side = safePrefGet('agenda.activeSide', 'left');
  activeSide = ['left','right'].includes(side) ? side : 'left';
  const pinSide = safePrefGet('agenda.pinnedSide', '');
  pinnedSide = ['left','right'].includes(pinSide) ? pinSide : null;
  const pinDate = safePrefGet('agenda.pinnedDate', '');
  pinnedDate = pinDate ? clampDate(pinDate) : null;
  const savedMobile = safePrefGet('agenda.mobileDate', '');
  mobileDate = savedMobile ? clampDate(savedMobile) : currentDate;
  if (viewMode === 'pinned' && (!pinnedSide || !pinnedDate)) viewMode = 'double';
}

function oppositeSide(side) { return side === 'left' ? 'right' : 'left'; }

function spreadCompanionDate() {
  if (viewMode === 'single' || currentMode !== 'daily') return null;
  if (viewMode === 'pinned') {
    if (activeSide === pinnedSide) return mobileDate;
    return pinnedDate;
  }
  let target = activeSide === 'left' ? offsetDate(currentDate, 1) : offsetDate(currentDate, -1);
  if (target === currentDate) target = activeSide === 'left' ? offsetDate(currentDate, -1) : offsetDate(currentDate, 1);
  return target;
}

function updateViewControls() {
  document.querySelectorAll('.view-choice').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.view === (viewMode === 'single' ? 'single' : 'double'))));
  document.querySelectorAll('.pin-choice').forEach(btn => {
    const desired = btn.dataset.pin;
    const active = desired === 'none' ? viewMode !== 'pinned' : viewMode === 'pinned' && pinnedSide === desired;
    btn.setAttribute('aria-pressed', String(active));
  });
  viewModeBtn.textContent = viewMode === 'single' ? '▯' : '▣';
  viewModeBtn.title = viewMode === 'single' ? 'Passa a doppia pagina' : 'Passa a pagina singola';
  pinPageBtn.classList.toggle('active', viewMode === 'pinned' && activeSide === pinnedSide);
  pinPageBtn.title = viewMode === 'pinned' && activeSide === pinnedSide ? 'Sblocca pagina fissata' : 'Fissa questa pagina';
}

function protectedHeaderBoundary(targetCanvas = canvas) {
  const header = targetCanvas === companionCanvas ? companionPageHeader : pageHeader;
  if (!header || !targetCanvas) return 0;
  const canvasRect = targetCanvas.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  return Math.max(0, Math.min(canvasRect.height, headerRect.bottom - canvasRect.top));
}

function pointIsInProtectedHeader(ev, targetCanvas = canvas) {
  const boundary = protectedHeaderBoundary(targetCanvas);
  const rect = targetCanvas.getBoundingClientRect();
  return (ev.clientY - rect.top) < boundary;
}

function drawStrokeOnCanvas(targetCtx, targetCanvas, stroke) {
  const pts = stroke?.points ?? [];
  if (!pts.length) return;
  const rect = targetCanvas.getBoundingClientRect();
  const px = point => ({x: point.x * rect.width, y: point.y * rect.height});
  const widthAt = pressure => stroke.pointerType === 'pen' ? stroke.width * (0.72 + Math.max(0.05, pressure ?? .5) * .72) : stroke.width;
  targetCtx.save();
  const protectedTop = protectedHeaderBoundary(targetCanvas);
  targetCtx.beginPath();
  targetCtx.rect(0, protectedTop, rect.width, Math.max(0, rect.height - protectedTop));
  targetCtx.clip();
  targetCtx.strokeStyle = stroke.color ?? '#111';
  targetCtx.fillStyle = stroke.color ?? '#111';
  targetCtx.globalAlpha = stroke.opacity ?? 1;
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';
  if (pts.length === 1) {
    const p = px(pts[0]);
    targetCtx.beginPath();
    targetCtx.arc(p.x, p.y, Math.max(.7, widthAt(pts[0].p) / 2), 0, Math.PI * 2);
    targetCtx.fill();
  } else {
    for (let i = 1; i < pts.length; i++) {
      const a = px(pts[i-1]), b = px(pts[i]);
      targetCtx.lineWidth = widthAt(((pts[i-1].p ?? .5) + (pts[i].p ?? .5)) / 2);
      targetCtx.beginPath(); targetCtx.moveTo(a.x,a.y); targetCtx.lineTo(b.x,b.y); targetCtx.stroke();
    }
  }
  targetCtx.restore();
}

function resizeCompanionCanvas() {
  if (!companionPageWrap || companionPageWrap.hidden) return;
  const rect = companionCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (companionCanvas.width !== w || companionCanvas.height !== h) {
    companionCanvas.width = w; companionCanvas.height = h;
  }
  companionCtx.setTransform(dpr,0,0,dpr,0,0);
  companionCtx.clearRect(0,0,rect.width,rect.height);
  for (const stroke of companionRecord?.strokes ?? []) drawStrokeOnCanvas(companionCtx, companionCanvas, stroke);
}

function clearCompanionObjectUrls() {
  for (const url of companionObjectUrls.values()) URL.revokeObjectURL(url);
  companionObjectUrls.clear();
}

async function renderCompanionObjects(record) {
  const token = ++companionRenderToken;
  clearCompanionObjectUrls();
  companionObjectLayer.innerHTML = '';
  for (const obj of (record?.objects ?? []).filter(x => x.type === 'image')) {
    const media = await idbGetMedia(obj.mediaId);
    if (token !== companionRenderToken) return;
    if (!media?.blob) continue;
    const url = URL.createObjectURL(media.blob);
    companionObjectUrls.set(obj.id,url);
    const el=document.createElement('div');
    el.className='page-object image-object companion-preview-object';
    el.style.left=`${obj.x*100}%`; el.style.top=`${obj.y*100}%`; el.style.width=`${obj.w*100}%`; el.style.height=`${obj.h*100}%`; el.style.transform=`rotate(${obj.rotation ?? 0}deg)`;
    const img=document.createElement('img'); img.src=url; img.alt=media.originalName || 'Immagine'; img.draggable=false;
    el.appendChild(img); companionObjectLayer.appendChild(el);
  }
}

function renderCompanionMiniCalendar() {
  if (!companionDate) return;
  const m=parseISODate(companionCalendarMonth); const year=m.getFullYear(), month=m.getMonth();
  companionMonthLabel.textContent=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(m);
  companionPrevMonth.disabled=companionCalendarMonth<=monthStart(MIN_DATE);
  companionNextMonth.disabled=companionCalendarMonth>=monthStart(MAX_DATE);
  const first=new Date(year,month,1,12), days=new Date(year,month+1,0,12).getDate(), offset=(first.getDay()+6)%7;
  const cells=[]; for(let i=0;i<offset;i++) cells.push('<span class="mini-empty"></span>');
  const today=formatISODate(new Date());
  for(let d=1;d<=days;d++){
    const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls=['mini-day']; if(iso===companionDate) cls.push('selected'); if(iso===today) cls.push('today');
    cells.push(`<button type="button" class="${cls.join(' ')}" data-date="${iso}" ${iso<MIN_DATE||iso>MAX_DATE?'disabled':''}>${d}</button>`);
  }
  while(cells.length%7) cells.push('<span class="mini-empty"></span>');
  companionMiniDays.innerHTML=cells.join('');
}

async function renderCompanionPage() {
  companionDate = spreadCompanionDate();
  if (!companionDate) return;
  companionRecord = await idbGetDaily(companionDate);
  const d=parseISODate(companionDate);
  companionDayNumber.textContent=d.getDate();
  companionDayName.textContent=new Intl.DateTimeFormat('it-IT',{weekday:'long'}).format(d).toUpperCase();
  companionMonthName.textContent=new Intl.DateTimeFormat('it-IT',{month:'long'}).format(d);
  companionYearLabel.textContent=d.getFullYear();
  updateSaintLabel(companionDate, companionSaintName);
  setCompanionCalendarVisible(false);
  const companionSide=oppositeSide(activeSide);
  const isPinned=viewMode==='pinned' && companionSide===pinnedSide;
  companionKindLabel.textContent=isPinned ? '📌 PAGINA FISSATA' : 'Tocca uno strumento per modificarla';
  companionStatus.textContent=isPinned ? 'Fissata' : 'Consultazione';
  companionPinBtn.classList.toggle('active',isPinned);
  companionPageWrap.dataset.layout=layoutFromLegacyRecord(companionRecord,DEFAULT_LAYOUT);
  companionPageWrap.dataset.paper=paperFromLegacyRecord(companionRecord,DEFAULT_PAPER);
  companionCalendarMonth=monthStart(companionDate);
  renderCompanionMiniCalendar();
  resizeCompanionCanvas();
  await renderCompanionObjects(companionRecord);
}

async function updateSpreadView() {
  updateViewControls();
  const reallyShow = currentMode === 'daily' && viewMode !== 'single';
  companionPageWrap.hidden = !reallyShow;
  pageStage.classList.toggle('two-up', reallyShow);
  pageStage.dataset.activeSide = activeSide;
  pageStage.dataset.pinnedSide = pinnedSide ?? '';
  pageWrap.classList.toggle('active-sheet', true);
  companionPageWrap.classList.toggle('pinned-sheet', reallyShow && viewMode==='pinned' && oppositeSide(activeSide)===pinnedSide);
  if (reallyShow) await renderCompanionPage(); else clearCompanionObjectUrls();
  requestAnimationFrame(() => { resizeCanvas(); resizeCompanionCanvas(); });
}

async function setViewMode(next) {
  if (next === 'single') {
    viewMode='single'; pinnedSide=null; pinnedDate=null;
  } else {
    if (viewMode === 'single') activeSide='left';
    viewMode='double'; pinnedSide=null; pinnedDate=null; mobileDate=currentDate;
  }
  persistViewPreferences(); updateViewControls(); await updateSpreadView();
}

async function setPinnedSide(side) {
  if (!side || side === 'none') {
    if (viewMode === 'pinned' && activeSide === pinnedSide && mobileDate) {
      activeSide=oppositeSide(pinnedSide); await loadDailyPage(mobileDate);
    }
    viewMode='double'; pinnedSide=null; pinnedDate=null; persistViewPreferences(); await updateSpreadView(); return;
  }
  if (!['left','right'].includes(side)) return;
  if (viewMode === 'single') viewMode='double';
  const otherDate=spreadCompanionDate() ?? (side==='left' ? offsetDate(currentDate,1) : offsetDate(currentDate,-1));
  const otherSide=oppositeSide(activeSide);
  if (activeSide===side) { pinnedDate=currentDate; mobileDate=otherDate; }
  else if (otherSide===side) { pinnedDate=otherDate; mobileDate=currentDate; }
  else { pinnedDate=currentDate; mobileDate=otherDate; activeSide=side; }
  if (pinnedDate===mobileDate) mobileDate=side==='left' ? offsetDate(pinnedDate,1) : offsetDate(pinnedDate,-1);
  pinnedSide=side; viewMode='pinned';
  if (activeSide === pinnedSide) {
    activeSide = oppositeSide(pinnedSide);
    persistViewPreferences();
    await loadDailyPage(mobileDate);
  } else {
    persistViewPreferences();
    await updateSpreadView();
  }
}

async function activateCompanion(nextTool='pen', doUndo=false) {
  if (!companionDate || pageChanging || recordingActive()) return;
  await savePage(true);
  const target=companionDate;
  const targetSide=oppositeSide(activeSide);
  if (viewMode==='pinned') {
    if (activeSide===pinnedSide) mobileDate=target;
    else mobileDate=currentDate;
  }
  activeSide=targetSide;
  await loadDailyPage(target);
  setTool(nextTool);
  persistViewPreferences();
  if (doUndo) performUndo();
}

function clearMediaObjectUrls() {
  for (const url of mediaObjectUrls.values()) URL.revokeObjectURL(url);
  mediaObjectUrls.clear();
}

function getObjectById(id) {
  return objects.find(obj => obj.id === id) ?? null;
}

function updateMediaUI() {
  const images = objects.filter(obj => obj.type === 'image');
  const selected = selectedObjectId ? getObjectById(selectedObjectId) : null;
  mediaInfo.textContent = images.length === 0
    ? 'Nessuna immagine nella pagina.'
    : `${images.length} ${images.length === 1 ? 'immagine' : 'immagini'} · ${selected ? 'selezionata' : 'usa “Oggetti” per modificare'}.`;
  rotateImageBtn.disabled = !selected;
  deleteImageBtn.disabled = !selected;
}

function objectStyle(el, obj) {
  el.style.left = `${obj.x * 100}%`;
  el.style.top = `${obj.y * 100}%`;
  el.style.width = `${obj.w * 100}%`;
  el.style.height = `${obj.h * 100}%`;
  el.style.transform = `rotate(${obj.rotation ?? 0}deg)`;
}

async function renderObjects() {
  const token = ++objectRenderToken;
  clearMediaObjectUrls();
  objectLayer.innerHTML = '';
  const imageObjects = objects.filter(obj => obj.type === 'image');
  for (const obj of imageObjects) {
    const media = await idbGetMedia(obj.mediaId);
    if (token !== objectRenderToken) return;
    if (!media?.blob) continue;
    const url = URL.createObjectURL(media.blob);
    mediaObjectUrls.set(obj.id, url);
    const el = document.createElement('div');
    el.className = 'page-object image-object';
    if (obj.id === selectedObjectId) el.classList.add('selected');
    el.dataset.objectId = obj.id;
    objectStyle(el, obj);
    const img = document.createElement('img');
    img.alt = media.originalName || 'Immagine inserita';
    img.draggable = false;
    img.src = url;
    const handle = document.createElement('span');
    handle.className = 'object-resize';
    handle.setAttribute('aria-hidden', 'true');
    el.append(img, handle);
    objectLayer.appendChild(el);
  }
  updateMediaUI();
}

function updateObjectSelectionVisual() {
  objectLayer.querySelectorAll('.page-object').forEach(el => {
    el.classList.toggle('selected', el.dataset.objectId === selectedObjectId);
  });
  updateMediaUI();
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function beginObjectInteraction(ev) {
  if (tool !== 'select') return;
  const el = ev.target.closest('.page-object[data-object-id]');
  if (!el) return;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  const obj = getObjectById(el.dataset.objectId);
  if (!obj) return;
  ev.preventDefault();
  ev.stopPropagation();
  selectedObjectId = obj.id;
  updateObjectSelectionVisual();
  pushUndoSnapshot();
  objectInteraction = {
    pointerId: ev.pointerId,
    id: obj.id,
    mode: ev.target.closest('.object-resize') ? 'resize' : 'move',
    x0: ev.clientX,
    y0: ev.clientY,
    start: structuredClone(obj),
    el
  };
  objectLayer.setPointerCapture(ev.pointerId);
}

function updateObjectInteraction(ev) {
  if (!objectInteraction || objectInteraction.pointerId !== ev.pointerId) return;
  const obj = getObjectById(objectInteraction.id);
  if (!obj) return;
  ev.preventDefault();
  const rect = pageWrap.getBoundingClientRect();
  const dx = (ev.clientX - objectInteraction.x0) / rect.width;
  const dy = (ev.clientY - objectInteraction.y0) / rect.height;
  const start = objectInteraction.start;

  if (objectInteraction.mode === 'move') {
    obj.x = clampNumber(start.x + dx, 0, 1 - obj.w);
    obj.y = clampNumber(start.y + dy, 0, 1 - obj.h);
  } else {
    const minW = 0.09;
    const maxW = Math.max(minW, 1 - start.x);
    obj.w = clampNumber(start.w + dx, minW, maxW);
    const aspect = Math.max(0.05, obj.aspect || 1);
    obj.h = obj.w * rect.width / (aspect * rect.height);
    if (obj.h > 1 - start.y) {
      obj.h = 1 - start.y;
      obj.w = obj.h * aspect * rect.height / rect.width;
    }
    obj.h = Math.max(0.06, obj.h);
  }
  objectStyle(objectInteraction.el, obj);
}

async function finishObjectInteraction(ev) {
  if (!objectInteraction || objectInteraction.pointerId !== ev.pointerId) return;
  ev.preventDefault();
  objectInteraction = null;
  try { objectLayer.releasePointerCapture(ev.pointerId); } catch {}
  await savePage(true);
  updateMediaUI();
}

objectLayer.addEventListener('pointerdown', beginObjectInteraction);
objectLayer.addEventListener('pointermove', updateObjectInteraction);
objectLayer.addEventListener('pointerup', finishObjectInteraction);
objectLayer.addEventListener('pointercancel', ev => {
  if (!objectInteraction || objectInteraction.pointerId !== ev.pointerId) return;
  objectInteraction = null;
  renderObjects().catch(console.error);
});

function imageSourceFromFile(file) {
  return new Promise(async (resolve, reject) => {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        resolve({ source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close?.() });
        return;
      } catch {}
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato immagine non leggibile dal browser.')); };
    img.src = url;
  });
}

async function compressImageFile(file) {
  const decoded = await imageSourceFromFile(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const work = document.createElement('canvas');
    work.width = width;
    work.height = height;
    const wctx = work.getContext('2d', { alpha: true });
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = 'high';
    wctx.drawImage(decoded.source, 0, 0, width, height);
    let blob = await new Promise(resolve => work.toBlob(resolve, 'image/webp', IMAGE_WEBP_QUALITY));
    if (!blob) blob = await new Promise(resolve => work.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) blob = file;
    return { blob, width, height, aspect: width / height };
  } finally {
    decoded.cleanup?.();
  }
}

async function addImageFromFile(file, sourceKind = 'import') {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    window.alert('Il file selezionato non è un’immagine supportata.');
    return;
  }
  try {
    saveStatus.textContent = sourceKind === 'camera' ? 'Foto…' : 'Immagine…';
    saveStatus.classList.add('warn');
    const prepared = await compressImageFile(file);
    const mediaId = makeId('media');
    const createdAt = new Date().toISOString();
    await idbPutMedia({
      id: mediaId,
      kind: 'image',
      blob: prepared.blob,
      mimeType: prepared.blob.type || file.type || 'image/*',
      originalName: file.name || (sourceKind === 'camera' ? 'Foto' : 'Immagine'),
      originalSize: file.size || 0,
      storedSize: prepared.blob.size || 0,
      source: sourceKind,
      createdAt
    });

    const rect = pageWrap.getBoundingClientRect();
    let w = 0.58;
    let h = w * rect.width / (prepared.aspect * rect.height);
    if (h > 0.52) {
      h = 0.52;
      w = h * prepared.aspect * rect.height / rect.width;
    }
    w = Math.min(w, 0.78);
    h = Math.min(h, 0.62);
    pushUndoSnapshot();
    const obj = {
      id: makeId('image'),
      type: 'image',
      mediaId,
      x: (1 - w) / 2,
      y: clampNumber(0.22, 0.12, 1 - h - 0.08),
      w,
      h,
      aspect: prepared.aspect,
      rotation: 0,
      createdAt
    };
    objects.push(obj);
    attachments.push({
      id: mediaId,
      kind: 'image',
      mimeType: prepared.blob.type || file.type || 'image/*',
      name: file.name || (sourceKind === 'camera' ? 'Foto' : 'Immagine'),
      size: prepared.blob.size || 0,
      source: sourceKind,
      createdAt
    });
    selectedObjectId = obj.id;
    setTool('select');
    await savePage(true);
    await renderObjects();
    setSettingsOpen(false);
    saveStatus.textContent = 'Salvato';
    saveStatus.classList.remove('warn');
  } catch (err) {
    console.error(err);
    saveStatus.textContent = 'Errore immagine';
    saveStatus.classList.add('warn');
    window.alert(`Impossibile inserire l’immagine: ${err.message || err}`);
  }
}

async function deleteSelectedImage() {
  const obj = selectedObjectId ? getObjectById(selectedObjectId) : null;
  if (!obj || obj.type !== 'image') return;
  const ok = window.confirm('Eliminare l’immagine selezionata dalla pagina?');
  if (!ok) return;
  pushUndoSnapshot();
  objects = objects.filter(item => item.id !== obj.id);
  attachments = attachments.filter(item => item.id !== obj.mediaId);
  selectedObjectId = null;
  await savePage(true);
  await renderObjects();
}

async function rotateSelectedImage() {
  const obj = selectedObjectId ? getObjectById(selectedObjectId) : null;
  if (!obj || obj.type !== 'image') return;
  pushUndoSnapshot();
  obj.rotation = ((obj.rotation ?? 0) + 90) % 360;
  await savePage(true);
  await renderObjects();
}


function clearAudioObjectUrls() {
  for (const url of audioObjectUrls.values()) URL.revokeObjectURL(url);
  audioObjectUrls.clear();
}

function audioAttachments() {
  return attachments.filter(item => item?.kind === 'audio');
}

function formatDuration(ms = 0) {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function updateAudioBadge() {
  const count = audioAttachments().length;
  audioBadge.textContent = String(count);
  audioBadge.hidden = count === 0;
  audioPageBtn.title = count ? `${count} registrazion${count === 1 ? 'e' : 'i'} audio` : 'Audio';
}

function preferredAudioMimeType() {
  if (!globalThis.MediaRecorder) return '';
  for (const type of AUDIO_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported?.(type)) return type;
    } catch {}
  }
  return '';
}

function currentRecordingDurationMs() {
  if (!recordingStartedAt) return 0;
  const now = performance.now();
  const activePause = recordingPausedAt ? now - recordingPausedAt : 0;
  return Math.max(0, now - recordingStartedAt - recordingPausedTotal - activePause);
}

function updateRecordingStatus() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    audioRecordStatus.textContent = audioAttachments().length
      ? `${audioAttachments().length} registrazion${audioAttachments().length === 1 ? 'e' : 'i'} associate alla pagina.`
      : 'Nessuna registrazione in corso.';
    return;
  }
  const state = mediaRecorder.state === 'paused' ? 'In pausa' : 'Registrazione';
  audioRecordStatus.textContent = `${state} · ${formatDuration(currentRecordingDurationMs())}`;
}

function startRecordingTimer() {
  clearInterval(recordingTimerId);
  recordingTimerId = setInterval(updateRecordingStatus, 250);
  updateRecordingStatus();
}

function stopRecordingTimer() {
  clearInterval(recordingTimerId);
  recordingTimerId = 0;
}

function setAudioControlsForState() {
  const state = mediaRecorder?.state ?? 'inactive';
  const active = state !== 'inactive';
  audioRecordBtn.disabled = active;
  audioPauseBtn.disabled = !active;
  audioStopBtn.disabled = !active;
  audioPauseBtn.textContent = state === 'paused' ? '▶ Riprendi' : 'Ⅱ Pausa';
  updateRecordingStatus();
}

async function renderAudioUI() {
  clearAudioObjectUrls();
  updateAudioBadge();
  const items = audioAttachments();
  if (!items.length) {
    audioList.innerHTML = '<div class="audio-empty">Nessun audio associato a questa pagina.</div>';
    setAudioControlsForState();
    return;
  }
  audioList.innerHTML = '';
  for (const item of items) {
    const media = await idbGetMedia(item.id);
    if (!media?.blob) continue;
    const url = URL.createObjectURL(media.blob);
    audioObjectUrls.set(item.id, url);
    const row = document.createElement('div');
    row.className = 'audio-item';
    row.dataset.audioId = item.id;
    const head = document.createElement('div');
    head.className = 'audio-item-head';
    const name = document.createElement('strong');
    name.textContent = item.name || media.originalName || 'Registrazione';
    const meta = document.createElement('span');
    meta.textContent = `${formatDuration(item.durationMs ?? media.durationMs)} · ${formatBytes(item.size ?? media.storedSize)}`;
    head.append(name, meta);
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = url;
    const actions = document.createElement('div');
    actions.className = 'audio-item-actions';
    actions.innerHTML = `<button type="button" class="audio-rename" data-id="${item.id}">Rinomina</button><button type="button" class="audio-delete" data-id="${item.id}">Elimina</button>`;
    row.append(head, audio, actions);
    audioList.appendChild(row);
  }
  setAudioControlsForState();
}

function cleanupRecordingStream() {
  mediaStream?.getTracks?.().forEach(track => track.stop());
  mediaStream = null;
}

async function finalizeAudioRecording(blob, durationMs, mimeType) {
  if (!blob || blob.size === 0) throw new Error('La registrazione audio è vuota.');
  const id = makeId('audio');
  const createdAt = new Date().toISOString();
  const now = new Date();
  const labelDate = currentMode === 'note' ? `Nota ${currentNoteSortOrder || ''}`.trim() : currentDate;
  const name = `Audio ${labelDate} ${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
  await idbPutMedia({
    id,
    kind: 'audio',
    blob,
    mimeType: mimeType || blob.type || 'audio/*',
    originalName: name,
    originalSize: blob.size,
    storedSize: blob.size,
    durationMs,
    source: 'microphone',
    createdAt
  });
  attachments.push({
    id,
    kind: 'audio',
    mimeType: mimeType || blob.type || 'audio/*',
    name,
    size: blob.size,
    durationMs,
    source: 'microphone',
    target: 'page',
    createdAt
  });
  await savePage(true);
  await renderAudioUI();
  saveStatus.textContent = 'Audio salvato';
  saveStatus.classList.remove('warn');
}

async function startAudioRecording() {
  if (currentMode === 'password') return;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return;
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
    window.alert('Registrazione audio non supportata da questo browser/dispositivo.');
    return;
  }
  try {
    saveStatus.textContent = 'Microfono…';
    saveStatus.classList.add('warn');
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    recordingMimeType = preferredAudioMimeType();
    const options = { audioBitsPerSecond: AUDIO_BITRATE };
    if (recordingMimeType) options.mimeType = recordingMimeType;
    try {
      mediaRecorder = new MediaRecorder(mediaStream, options);
    } catch {
      mediaRecorder = new MediaRecorder(mediaStream);
      recordingMimeType = mediaRecorder.mimeType || '';
    }
    audioChunks = [];
    recordingStartedAt = performance.now();
    recordingPausedAt = 0;
    recordingPausedTotal = 0;
    mediaRecorder.addEventListener('dataavailable', ev => {
      if (ev.data?.size) audioChunks.push(ev.data);
    });
    mediaRecorder.addEventListener('pause', () => {
      recordingPausedAt = performance.now();
      setAudioControlsForState();
    });
    mediaRecorder.addEventListener('resume', () => {
      if (recordingPausedAt) recordingPausedTotal += performance.now() - recordingPausedAt;
      recordingPausedAt = 0;
      setAudioControlsForState();
    });
    mediaRecorder.addEventListener('stop', async () => {
      const durationMs = currentRecordingDurationMs();
      stopRecordingTimer();
      const type = mediaRecorder?.mimeType || recordingMimeType || audioChunks[0]?.type || 'audio/webm';
      const blob = new Blob(audioChunks, { type });
      cleanupRecordingStream();
      mediaRecorder = null;
      recordingStartedAt = 0;
      recordingPausedAt = 0;
      recordingPausedTotal = 0;
      audioChunks = [];
      setAudioControlsForState();
      try {
        await finalizeAudioRecording(blob, durationMs, type);
      } catch (err) {
        console.error(err);
        saveStatus.textContent = 'Errore audio';
        saveStatus.classList.add('warn');
        window.alert(`Impossibile salvare la registrazione: ${err.message || err}`);
      }
    }, { once: true });
    mediaRecorder.start(1000);
    startRecordingTimer();
    setAudioControlsForState();
    saveStatus.textContent = 'Registrazione…';
  } catch (err) {
    console.error(err);
    cleanupRecordingStream();
    mediaRecorder = null;
    stopRecordingTimer();
    setAudioControlsForState();
    saveStatus.textContent = 'Microfono negato';
    saveStatus.classList.add('warn');
    window.alert('Impossibile accedere al microfono. Verifica il permesso del browser/iPadOS.');
  }
}

function togglePauseAudioRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  if (mediaRecorder.state === 'recording') mediaRecorder.pause();
  else if (mediaRecorder.state === 'paused') mediaRecorder.resume();
}

function stopAudioRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  if (mediaRecorder.state === 'paused' && recordingPausedAt) {
    recordingPausedTotal += performance.now() - recordingPausedAt;
    recordingPausedAt = 0;
  }
  try { mediaRecorder.requestData?.(); } catch {}
  mediaRecorder.stop();
  audioPauseBtn.disabled = true;
  audioStopBtn.disabled = true;
  audioRecordStatus.textContent = 'Salvataggio registrazione…';
}

async function deleteAudioAttachment(id) {
  const item = attachments.find(a => a?.id === id && a.kind === 'audio');
  if (!item) return;
  if (!window.confirm(`Eliminare la registrazione “${item.name || 'Audio'}”?`)) return;
  attachments = attachments.filter(a => a?.id !== id);
  await idbDeleteMedia(id).catch(console.warn);
  await savePage(true);
  await renderAudioUI();
}

async function renameAudioAttachment(id) {
  const item = attachments.find(a => a?.id === id && a.kind === 'audio');
  if (!item) return;
  const next = window.prompt('Nome registrazione', item.name || 'Audio');
  if (next == null) return;
  const name = next.trim();
  if (!name) return;
  item.name = name;
  const media = await idbGetMedia(id);
  if (media) {
    media.originalName = name;
    await idbPutMedia(media);
  }
  await savePage(true);
  await renderAudioUI();
}

function recordingActive() {
  return Boolean(mediaRecorder && mediaRecorder.state !== 'inactive');
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderAll();
}

function normalizedPointFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
    p: ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5,
    t: performance.now()
  };
}

function pxPoint(point) {
  const rect = canvas.getBoundingClientRect();
  return { x: point.x * rect.width, y: point.y * rect.height };
}

function strokeWidth(stroke, pressure = 0.5) {
  if (stroke.pointerType === 'pen') return stroke.width * (0.72 + Math.max(0.05, pressure) * 0.72);
  return stroke.width;
}

function drawStroke(stroke) {
  const pts = stroke.points;
  if (!pts.length) return;
  ctx.save();
  const canvasRect = canvas.getBoundingClientRect();
  const protectedTop = protectedHeaderBoundary(canvas);
  ctx.beginPath();
  ctx.rect(0, protectedTop, canvasRect.width, Math.max(0, canvasRect.height - protectedTop));
  ctx.clip();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.globalAlpha = stroke.opacity ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (pts.length === 1) {
    const p = pxPoint(pts[0]);
    const w = strokeWidth(stroke, pts[0].p);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(.7, w / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let i = 1; i < pts.length; i++) {
    const a = pxPoint(pts[i - 1]);
    const b = pxPoint(pts[i]);
    const pressure = (pts[i - 1].p + pts[i].p) / 2;
    ctx.lineWidth = strokeWidth(stroke, pressure);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawActiveStrokeIncremental() {
  if (!activeStroke) return;
  const pts = activeStroke.points;
  if (!pts.length) return;
  ctx.save();
  const canvasRect = canvas.getBoundingClientRect();
  const protectedTop = protectedHeaderBoundary(canvas);
  ctx.beginPath();
  ctx.rect(0, protectedTop, canvasRect.width, Math.max(0, canvasRect.height - protectedTop));
  ctx.clip();
  ctx.strokeStyle = activeStroke.color;
  ctx.fillStyle = activeStroke.color;
  ctx.globalAlpha = activeStroke.opacity ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (activeStrokeRenderedUntil === 0 && pts.length === 1) {
    const p = pxPoint(pts[0]);
    const w = strokeWidth(activeStroke, pts[0].p);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(.7, w / 2), 0, Math.PI * 2);
    ctx.fill();
    activeStrokeRenderedUntil = 1;
    ctx.restore();
    return;
  }

  let start = Math.max(1, activeStrokeRenderedUntil);
  for (let i = start; i < pts.length; i++) {
    const a = pxPoint(pts[i - 1]);
    const b = pxPoint(pts[i]);
    const pressure = ((pts[i - 1].p ?? .5) + (pts[i].p ?? .5)) / 2;
    ctx.lineWidth = strokeWidth(activeStroke, pressure);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  activeStrokeRenderedUntil = pts.length;
  ctx.restore();
}

function renderAll() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of strokes) drawStroke(stroke);
  if (activeStroke) drawStroke(activeStroke);
  activeStrokeRenderedUntil = activeStroke?.points?.length ?? 0;
}

function pageSnapshot() {
  return structuredClone({
    strokes,
    objects,
    attachments: attachments.filter(item => item.kind !== 'audio')
  });
}

function restoreSnapshot(snapshot) {
  const audioAttachments = attachments.filter(item => item.kind === 'audio');
  strokes = structuredClone(snapshot?.strokes ?? []);
  objects = structuredClone(snapshot?.objects ?? []);
  attachments = [...structuredClone(snapshot?.attachments ?? []), ...structuredClone(audioAttachments)];
  activeStroke = null;
  selectedObjectId = null;
  renderAll();
  renderObjects().catch(console.error);
  renderAudioUI().catch(console.error);
  updateMediaUI();
}

function pushUndoSnapshot() {
  undoStack.push(pageSnapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
  updateUndoRedo();
}

function performUndo() {
  if (!undoStack.length) return;
  redoStack.push(pageSnapshot());
  restoreSnapshot(undoStack.pop());
  updateUndoRedo();
  savePage();
}

function performRedo() {
  if (!redoStack.length) return;
  undoStack.push(pageSnapshot());
  restoreSnapshot(redoStack.pop());
  updateUndoRedo();
  savePage();
}

function updateUndoRedo() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
  if (quickUndoBtn) quickUndoBtn.disabled = undoStack.length === 0;
}

function setTool(next) {
  tool = next;
  document.querySelectorAll('.tool-choice').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool)));
  [quickPenBtn, quickHighlighterBtn, quickEraserBtn].forEach(btn => {
    if (!btn) return;
    const active = btn.dataset.quickTool === tool;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('active', active);
  });
  canvas.classList.toggle('eraser', tool === 'eraser' && mouseMode === 'ink');
  pageWrap.classList.toggle('object-editing', tool === 'select');
  if (tool !== 'select') selectedObjectId = null;
  updateObjectSelectionVisual();
}

function setColor(next) {
  color = next;
  document.querySelectorAll('.color-button').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.color === color)));
  setTool('pen');
}

function setMouseMode(next) {
  mouseMode = next;
  document.querySelectorAll('.mouse-choice').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mouse === mouseMode)));
  canvas.classList.toggle('page-mouse', mouseMode === 'page');
  canvas.classList.toggle('eraser', mouseMode === 'ink' && tool === 'eraser');
}

function updateSettingsUI() {
  document.querySelectorAll('.layout-choice').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.layout === pageLayout)));
  document.querySelectorAll('.paper-choice').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.paper === paperTone)));
  document.querySelectorAll('.tool-choice').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool)));
  document.querySelectorAll('.color-button').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.color === color)));
  document.querySelectorAll('.mouse-choice').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mouse === mouseMode)));
  [quickPenBtn, quickHighlighterBtn, quickEraserBtn].forEach(btn => {
    if (!btn) return;
    const active = btn.dataset.quickTool === tool;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('active', active);
  });
  updateViewControls();
}

function distancePointToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.x - a.x, wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function eraseAt(point) {
  const rect = canvas.getBoundingClientRect();
  const p = {x: point.x * rect.width, y: point.y * rect.height};
  if (p.y < protectedHeaderBoundary(canvas)) return;
  const radius = Math.max(10, baseWidth * 3.2);
  const before = strokes.length;
  strokes = strokes.filter(stroke => {
    if (stroke.points.length === 1) {
      const a = pxPoint(stroke.points[0]);
      return Math.hypot(p.x - a.x, p.y - a.y) > radius;
    }
    for (let i = 1; i < stroke.points.length; i++) {
      const a = pxPoint(stroke.points[i - 1]);
      const b = pxPoint(stroke.points[i]);
      if (distancePointToSegment(p, a, b) <= radius) return false;
    }
    return true;
  });
  if (strokes.length !== before) {
    eraserChanged = true;
    renderAll();
  }
}

function shouldPageGesture(ev) {
  if (ev.pointerType === 'touch') return true;
  if (ev.pointerType === 'mouse') return mouseMode === 'page' && (ev.buttons & 1) === 1;
  return false;
}

function canInk(ev) {
  if (!['pen','highlighter','eraser'].includes(tool)) return false;
  if (ev.pointerType === 'pen') return true;
  if (ev.pointerType === 'mouse') return mouseMode === 'ink' && (ev.buttons & 1) === 1;
  return false;
}

function startPageGesture(ev) {
  pageGesture = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, t0: performance.now() };
  pageWrap.style.setProperty('--drag-y', '0px');
  canvas.setPointerCapture(ev.pointerId);
  pageWrap.classList.add('dragging');
}

function updatePageGesture(ev) {
  if (!pageGesture || pageGesture.id !== ev.pointerId) return;
  pageGesture.x = ev.clientX;
  pageGesture.y = ev.clientY;
  const rect = pageWrap.getBoundingClientRect();
  const rawDx = ev.clientX - pageGesture.x0;
  const rawDy = ev.clientY - pageGesture.y0;
  if (Math.abs(rawDy) > Math.abs(rawDx) * 1.08) {
    const dy = Math.max(-rect.height * .26, Math.min(rect.height * .26, rawDy));
    pageWrap.style.setProperty('--drag-x', '0px');
    pageWrap.style.setProperty('--drag-y', `${dy}px`);
    pageWrap.style.setProperty('--drag-rot', '0deg');
  } else {
    const dx = Math.max(-rect.width * .38, Math.min(rect.width * .38, rawDx));
    const rot = dx / rect.width * 13;
    pageWrap.style.setProperty('--drag-x', `${dx}px`);
    pageWrap.style.setProperty('--drag-y', '0px');
    pageWrap.style.setProperty('--drag-rot', `${rot}deg`);
  }
}

function clearPageGestureVisual() {
  pageWrap.classList.remove('dragging');
  pageWrap.style.setProperty('--drag-x', '0px');
  pageWrap.style.setProperty('--drag-y', '0px');
  pageWrap.style.setProperty('--drag-rot', '0deg');
}

async function finishPageGesture(ev) {
  if (!pageGesture || pageGesture.id !== ev.pointerId) return;
  const gesture = pageGesture;
  pageGesture = null;
  const dx = ev.clientX - gesture.x0;
  const dy = ev.clientY - gesture.y0;
  const dt = performance.now() - gesture.t0;
  const rect = pageWrap.getBoundingClientRect();
  const horizontalValid = Math.abs(dx) > Math.max(58, rect.width * .12) && Math.abs(dx) > Math.abs(dy) * 1.18 && dt < 1500;
  const verticalValid = Math.abs(dy) > Math.max(64, rect.height * .10) && Math.abs(dy) > Math.abs(dx) * 1.16 && dt < 1600;
  if (!horizontalValid && !verticalValid) { clearPageGestureVisual(); return; }
  pendingGestureTransition = true;

  if (verticalValid && currentMode !== 'password') {
    if (dy < 0) {
      if (currentMode === 'daily') await openOrCreateFirstNote();
      else await nextNoteOrCreate();
    } else if (currentMode === 'note') {
      await previousNoteOrDaily('down');
    } else {
      pendingGestureTransition = false;
      clearPageGestureVisual();
    }
    return;
  }

  if (currentMode === 'daily' && viewMode === 'pinned' && activeSide === pinnedSide) {
    pendingGestureTransition = false;
    clearPageGestureVisual();
    saveStatus.textContent = 'Pagina fissata';
    setTimeout(() => { if (saveStatus.textContent === 'Pagina fissata') saveStatus.textContent = 'Salvato'; }, 900);
    return;
  }

  // La navigazione orizzontale resta riservata ai giorni, anche quando si è in una nota.
  if (currentMode === 'note') {
    const targetDate = dx < 0 ? offsetDate(currentDate, 1) : offsetDate(currentDate, -1);
    await animateSwitch(dx < 0 ? 'next' : 'prev', () => loadDailyPage(targetDate));
    return;
  }
  if (dx < 0 && currentDate === MAX_DATE) {
    await openPasswordBook('next', true);
    return;
  }
  if (dx < 0) await changeDate(offsetDate(currentDate, 1), 'next');
  else await changeDate(offsetDate(currentDate, -1), 'prev');
}

canvas.addEventListener('pointerdown', ev => {
  if (tool === 'select' && ev.pointerType !== 'touch') {
    selectedObjectId = null;
    updateObjectSelectionVisual();
    return;
  }
  if (shouldPageGesture(ev)) {
    ev.preventDefault();
    startPageGesture(ev);
    return;
  }
  if (!canInk(ev)) return;
  if (pointIsInProtectedHeader(ev, canvas)) return;
  ev.preventDefault();
  activeInkPointerId = ev.pointerId;
  // Su Safari/iPad la pointer capture della Pencil può produrre interruzioni sporadiche.
  // Per la Pencil ascoltiamo gli eventi globalmente; manteniamo la capture solo per mouse.
  if (ev.pointerType !== 'pen') {
    try { canvas.setPointerCapture(ev.pointerId); } catch {}
  }
  pushUndoSnapshot();
  const point = normalizedPointFromEvent(ev);

  if (tool === 'eraser') {
    eraserChanged = false;
    activeStroke = null;
    eraseAt(point);
    return;
  }

  const isHighlighter = tool === 'highlighter';
  activeStroke = {
    id: makeId('stroke'),
    tool,
    color,
    width: isHighlighter ? Math.max(baseWidth * 3, baseWidth + 6) : baseWidth,
    opacity: isHighlighter ? 0.22 : 1,
    pointerType: ev.pointerType,
    points: [point]
  };
  activeStrokeRenderedUntil = 0;
  drawActiveStrokeIncremental();
});

function handleGlobalPointerMove(ev) {
  if (pageGesture && pageGesture.id === ev.pointerId) {
    ev.preventDefault();
    updatePageGesture(ev);
    return;
  }
  if (activeInkPointerId !== ev.pointerId || !canInk(ev)) return;
  ev.preventDefault();
  const events = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [ev];

  if (tool === 'eraser') {
    for (const e of events) eraseAt(normalizedPointFromEvent(e));
    return;
  }

  if (!activeStroke) return;
  for (const e of events) {
    const pt = normalizedPointFromEvent(e);
    const last = activeStroke.points[activeStroke.points.length - 1];
    if (!last || pt.x !== last.x || pt.y !== last.y || pt.t !== last.t) activeStroke.points.push(pt);
  }
  drawActiveStrokeIncremental();
}

async function finishPointer(ev) {
  if (pageGesture && pageGesture.id === ev.pointerId) {
    await finishPageGesture(ev);
    return;
  }

  if (activeInkPointerId !== null && ev.pointerId !== activeInkPointerId && !pageGesture) return;

  if (tool === 'eraser') {
    activeInkPointerId = null;
    if (eraserChanged) {
      eraserChanged = false;
      updateUndoRedo();
      savePage();
    }
    return;
  }

  if (!activeStroke) { activeInkPointerId = null; return; }
  strokes.push(activeStroke);
  activeStroke = null;
  activeStrokeRenderedUntil = 0;
  activeInkPointerId = null;
  updateUndoRedo();
  // Salvataggio differito: evita I/O IndexedDB tra due tratti consecutivi di Pencil.
  savePage();
}

window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false, capture: true });
window.addEventListener('pointerup', finishPointer, { capture: true });
window.addEventListener('pointercancel', ev => {
  if (pageGesture?.id === ev.pointerId) {
    pageGesture = null;
    pendingGestureTransition = false;
    clearPageGestureVisual();
    return;
  }
  // Safari può generare pointercancel durante rapidi cambi di contatto.
  // Conserviamo comunque il tratto acquisito fino a quel momento.
  finishPointer(ev);
}, { capture: true });
canvas.addEventListener('lostpointercapture', () => { /* la Pencil continua tramite listener globali */ });

function makePageTransitionGhost() {
  const rect = pageWrap.getBoundingClientRect();
  const ghost = pageWrap.cloneNode(true);
  ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  ghost.removeAttribute('id');
  ghost.classList.remove('dragging','flip-next-out','flip-prev-out','flip-next-in','flip-prev-in','transition-target-hidden');
  ghost.classList.add('page-transition-ghost');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
    margin: '0',
    transform: 'none',
    transformOrigin: 'center center'
  });
  const ghostCanvas = ghost.querySelector('canvas');
  if (ghostCanvas) {
    ghostCanvas.width = canvas.width;
    ghostCanvas.height = canvas.height;
    const gctx = ghostCanvas.getContext('2d');
    if (gctx) gctx.drawImage(canvas, 0, 0);
  }
  ghost.querySelectorAll('button,input,textarea').forEach(el => { el.tabIndex = -1; el.disabled = true; });
  document.body.appendChild(ghost);
  return ghost;
}

async function animateGestureSwitch(direction, loader, saveCurrent = true) {
  if (pageChanging) { clearPageGestureVisual(); return; }
  if (recordingActive()) {
    pendingGestureTransition = false;
    clearPageGestureVisual();
    window.alert('Termina la registrazione audio prima di cambiare pagina.');
    return;
  }
  pageChanging = true;
  if (saveCurrent) await savePage(true);
  setSettingsOpen(false);

  const ghost = makePageTransitionGhost();
  pageWrap.classList.add('transition-target-hidden');
  clearPageGestureVisual();

  try {
    await loader();
    // Il nuovo foglio viene mostrato solo quando dati, layout e companion sono pronti.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    pageWrap.classList.remove('transition-target-hidden');
    ghost.classList.add(direction === 'prev' ? 'ghost-prev-out' : direction === 'up' ? 'ghost-up-out' : direction === 'down' ? 'ghost-down-out' : 'ghost-next-out');
    await new Promise(resolve => setTimeout(resolve, 190));
  } finally {
    ghost.remove();
    pageWrap.classList.remove('transition-target-hidden');
    pageChanging = false;
  }
}

async function animateSwitch(direction, loader, saveCurrent = true) {
  if (pendingGestureTransition) {
    pendingGestureTransition = false;
    await animateGestureSwitch(direction, loader, saveCurrent);
    return;
  }
  if (pageChanging) return;
  if (recordingActive()) {
    window.alert('Termina la registrazione audio prima di cambiare pagina.');
    return;
  }
  pageChanging = true;
  if (saveCurrent) await savePage(true);
  setSettingsOpen(false);
  const outClass = direction === 'prev' ? 'flip-prev-out' : direction === 'up' ? 'flip-up-out' : direction === 'down' ? 'flip-down-out' : 'flip-next-out';
  const inClass = direction === 'prev' ? 'flip-prev-in' : direction === 'up' ? 'flip-up-in' : direction === 'down' ? 'flip-down-in' : 'flip-next-in';
  pageWrap.classList.add(outClass);
  await new Promise(r => setTimeout(r, 125));
  await loader();
  pageWrap.classList.remove(outClass);
  pageWrap.classList.add(inClass);
  setTimeout(() => pageWrap.classList.remove(inClass), 200);
  pageChanging = false;
}

async function changeDate(nextDate, direction = null) {
  nextDate = clampDate(nextDate);
  if (nextDate === currentDate && currentMode === 'daily') return;
  if (viewMode === 'pinned' && currentMode === 'daily') {
    if (activeSide === pinnedSide) pinnedDate = nextDate;
    else mobileDate = nextDate;
  }
  const dir = direction ?? (nextDate < currentDate ? 'prev' : 'next');
  await animateSwitch(dir, () => loadDailyPage(nextDate));
  persistViewPreferences();
}

async function openNote(id, direction = 'next') {
  if (!id || (currentMode === 'note' && currentNoteId === id)) return;
  await animateSwitch(direction, () => loadNotePage(id));
}

async function returnToDaily(direction = 'prev') {
  if (currentMode === 'daily') return;
  await animateSwitch(direction, () => loadDailyPage(currentDate));
}

async function addNotePage(direction = 'up') {
  if (pageChanging) return;
  await savePage(true);
  await refreshNotesForDate();
  const maxOrder = notesForDate.reduce((max, n) => Math.max(max, Number(n.sortOrder) || 0), 0);
  const note = {
    schemaVersion: SCHEMA_VERSION,
    id: makeId(`note-${currentDate}`),
    kind: 'note',
    referenceDate: currentDate,
    sortOrder: maxOrder + 1,
    template: 'note-lined-v1',
    layout: DEFAULT_LAYOUT,
    background: paperTone || DEFAULT_PAPER,
    strokes: [],
    objects: [],
    attachments: [],
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  };
  await idbPutNote(note);
  await refreshNotesForDate();
  await openNote(note.id, direction);
}

async function openOrCreateFirstNote() {
  if (currentMode !== 'daily') return;
  await refreshNotesForDate();
  if (notesForDate.length) await openNote(notesForDate[0].id, 'up');
  else await addNotePage('up');
}

async function previousNoteOrDaily(direction = 'down') {
  if (currentMode !== 'note') return;
  await refreshNotesForDate();
  const pos = notesForDate.findIndex(n => n.id === currentNoteId);
  if (pos > 0) await openNote(notesForDate[pos - 1].id, direction);
  else await returnToDaily(direction);
}

async function nextNote() {
  if (currentMode !== 'note') return;
  await refreshNotesForDate();
  const pos = notesForDate.findIndex(n => n.id === currentNoteId);
  if (pos >= 0 && pos < notesForDate.length - 1) await openNote(notesForDate[pos + 1].id, 'up');
}

async function nextNoteOrCreate() {
  if (currentMode !== 'note') return;
  await refreshNotesForDate();
  const pos = notesForDate.findIndex(n => n.id === currentNoteId);
  if (pos >= 0 && pos < notesForDate.length - 1) await openNote(notesForDate[pos + 1].id, 'up');
  else await addNotePage('up');
}

async function deleteCurrentNote() {
  if (currentMode !== 'note' || !currentNoteId) return;
  await refreshNotesForDate();
  const pos = notesForDate.findIndex(n => n.id === currentNoteId);
  const ok = window.confirm(`Eliminare la pagina nota ${pos + 1} collegata al ${currentDate}?`);
  if (!ok) return;
  const id = currentNoteId;
  for (const attachment of attachments) {
    if (attachment?.id) await idbDeleteMedia(attachment.id).catch(console.warn);
  }
  await idbDeleteNote(id);
  const remaining = await idbGetNotesForDate(currentDate);
  notesForDate = remaining;
  if (!remaining.length) {
    await animateSwitch('prev', () => loadDailyPage(currentDate), false);
    return;
  }
  const nextIndex = Math.min(pos, remaining.length - 1);
  await animateSwitch('prev', () => loadNotePage(remaining[nextIndex].id), false);
}

function setSettingsOpen(open) {
  settingsPanel.classList.toggle('open', open);
  gearBtn.setAttribute('aria-expanded', String(open));
}

gearBtn.addEventListener('click', () => setSettingsOpen(!settingsPanel.classList.contains('open')));
settingsClose.addEventListener('click', () => setSettingsOpen(false));

vaultJumpBtn.addEventListener('click', () => openPasswordBook('next', false));
openVaultBtn.addEventListener('click', () => openPasswordBook('next', false));
vaultBackBtn.addEventListener('click', () => closePasswordBook('prev'));
vaultLockBtn.addEventListener('click', () => lockVault('Rubrica bloccata.'));

alphabetTabs.addEventListener('click', ev => {
  const button = ev.target.closest('.alphabet-tab[data-letter]');
  if (!button || !vaultKey) return;
  vaultLetterSelected = button.dataset.letter;
  renderAlphabetTabs();
  renderVaultEntries();
  clearVaultEditor();
});

vaultUnlockBtn.addEventListener('click', async () => {
  const secret = vaultSecret.value;
  vaultMessage.textContent = '';
  if (secret.length < 6) {
    vaultMessage.textContent = 'Usa almeno 6 caratteri o cifre.';
    return;
  }
  try {
    vaultUnlockBtn.disabled = true;
    vaultMessage.textContent = vaultExists ? 'Sblocco…' : 'Creazione archivio cifrato…';
    if (!vaultExists) {
      if (secret !== vaultSecretConfirm.value) {
        vaultMessage.textContent = 'Le due password master non coincidono.';
        return;
      }
      await createVault(secret);
    } else {
      await unlockVault(secret);
    }
    vaultSecret.value = '';
    vaultSecretConfirm.value = '';
    renderVaultState();
    saveStatus.textContent = 'Rubrica aperta';
  } catch (err) {
    console.error(err);
    vaultMessage.textContent = 'Password non corretta oppure archivio non leggibile.';
  } finally {
    vaultUnlockBtn.disabled = false;
  }
});

vaultSecret.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && (vaultExists || !vaultSecretConfirm.hidden)) {
    ev.preventDefault();
    if (!vaultExists && !vaultSecretConfirm.value) vaultSecretConfirm.focus();
    else vaultUnlockBtn.click();
  }
});
vaultSecretConfirm.addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); vaultUnlockBtn.click(); }
});

vaultAddBtn.addEventListener('click', () => {
  clearVaultEditor();
  vaultService.focus({ preventScroll: true });
});

vaultEntryList.addEventListener('click', ev => {
  const button = ev.target.closest('.vault-entry-button[data-id]');
  if (button) editVaultEntry(button.dataset.id);
});

vaultShowPassword.addEventListener('click', () => {
  vaultPassword.type = vaultPassword.type === 'password' ? 'text' : 'password';
  vaultShowPassword.textContent = vaultPassword.type === 'password' ? '◉' : '◎';
});

vaultEditor.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!vaultKey) return;
  const service = vaultService.value.trim();
  const appName = vaultApp.value.trim();
  if (!service && !appName) {
    vaultSaveMessage.textContent = 'Indica almeno sito/servizio oppure app.';
    return;
  }
  const now = new Date().toISOString();
  const existingId = vaultEntryId.value;
  const existing = existingId ? vaultEntries.find(item => item.id === existingId) : null;
  const entry = {
    id: existing?.id || makeId('vault'),
    letter: normalizeVaultLetter(service || appName, vaultLetterSelected),
    service,
    app: appName,
    username: vaultUsername.value.trim(),
    password: vaultPassword.value,
    email: vaultEmail.value.trim(),
    secretQuestion: vaultSecretQuestion.value.trim(),
    notes: vaultNotes.value,
    createdAt: existing?.createdAt || now,
    modifiedAt: now
  };
  if (existing) Object.assign(existing, entry);
  else vaultEntries.push(entry);
  try {
    vaultSaveMessage.textContent = 'Salvataggio cifrato…';
    await persistVaultEntries();
    vaultLetterSelected = entry.letter;
    renderAlphabetTabs();
    renderVaultEntries();
    editVaultEntry(entry.id);
    vaultSaveMessage.textContent = 'Salvato e cifrato.';
  } catch (err) {
    console.error(err);
    vaultSaveMessage.textContent = 'Errore durante il salvataggio.';
  }
});

vaultDeleteBtn.addEventListener('click', async () => {
  if (!vaultKey || !vaultEntryId.value) return;
  const entry = vaultEntries.find(item => item.id === vaultEntryId.value);
  if (!entry) return;
  if (!window.confirm(`Eliminare la voce “${entry.service || entry.app || 'senza nome'}”?`)) return;
  vaultEntries = vaultEntries.filter(item => item.id !== entry.id);
  try {
    await persistVaultEntries();
    clearVaultEditor();
    renderVaultEntries();
    vaultSaveMessage.textContent = 'Voce eliminata.';
  } catch (err) {
    console.error(err);
    vaultSaveMessage.textContent = 'Errore durante l’eliminazione.';
  }
});

passwordBook.addEventListener('pointerdown', startVaultGesture);
passwordBook.addEventListener('pointerup', finishVaultGesture);
passwordBook.addEventListener('pointercancel', () => { vaultGesture = null; });


audioPageBtn.addEventListener('click', () => {
  setSettingsOpen(true);
  requestAnimationFrame(() => audioSettingRow.scrollIntoView({ block: 'center', behavior: 'smooth' }));
});
audioRecordBtn.addEventListener('click', startAudioRecording);
audioPauseBtn.addEventListener('click', togglePauseAudioRecording);
audioStopBtn.addEventListener('click', stopAudioRecording);
audioList.addEventListener('click', ev => {
  const rename = ev.target.closest('.audio-rename[data-id]');
  if (rename) { renameAudioAttachment(rename.dataset.id); return; }
  const del = ev.target.closest('.audio-delete[data-id]');
  if (del) deleteAudioAttachment(del.dataset.id);
});

importImageBtn.addEventListener('click', () => imageFileInput.click());
capturePhotoBtn.addEventListener('click', () => cameraFileInput.click());
rotateImageBtn.addEventListener('click', rotateSelectedImage);
deleteImageBtn.addEventListener('click', deleteSelectedImage);

imageFileInput.addEventListener('change', async () => {
  const file = imageFileInput.files?.[0] ?? null;
  imageFileInput.value = '';
  if (file) await addImageFromFile(file, 'import');
});
cameraFileInput.addEventListener('change', async () => {
  const file = cameraFileInput.files?.[0] ?? null;
  cameraFileInput.value = '';
  if (file) await addImageFromFile(file, 'camera');
});

notesBtn.addEventListener('click', async () => {
  if (currentMode === 'note') {
    await returnToDaily('down');
    return;
  }
  await openOrCreateFirstNote();
});

addNoteBtn.addEventListener('click', () => addNotePage('up'));
openNotesBtn.addEventListener('click', async () => {
  await refreshNotesForDate();
  if (notesForDate.length) await openNote(notesForDate[0].id, 'up');
});
returnDailyBtn.addEventListener('click', () => returnToDaily('down'));
prevNoteBtn.addEventListener('click', () => previousNoteOrDaily('down'));
nextNoteBtn.addEventListener('click', nextNoteOrCreate);
deleteNoteBtn.addEventListener('click', deleteCurrentNote);

document.querySelectorAll('.tool-choice').forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));
quickPenBtn?.addEventListener('click', () => setTool('pen'));
quickHighlighterBtn?.addEventListener('click', () => setTool('highlighter'));
quickEraserBtn?.addEventListener('click', () => setTool('eraser'));
viewModeBtn.addEventListener('click', () => setViewMode(viewMode === 'single' ? 'double' : 'single'));
pinPageBtn.addEventListener('click', () => {
  if (viewMode === 'pinned' && activeSide === pinnedSide) setPinnedSide('none');
  else setPinnedSide(activeSide);
});
document.querySelectorAll('.view-choice').forEach(btn => btn.addEventListener('click', () => setViewMode(btn.dataset.view)));
document.querySelectorAll('.pin-choice').forEach(btn => btn.addEventListener('click', () => setPinnedSide(btn.dataset.pin)));
document.querySelectorAll('.companion-tool').forEach(btn => btn.addEventListener('click', () => activateCompanion(btn.dataset.tool)));
activateCompanionBtn.addEventListener('click', () => activateCompanion(tool === 'select' ? 'pen' : tool));
companionUndoBtn.addEventListener('click', () => activateCompanion('pen', true));
companionPinBtn.addEventListener('click', () => {
  const side = oppositeSide(activeSide);
  if (viewMode === 'pinned' && pinnedSide === side) setPinnedSide('none');
  else setPinnedSide(side);
});
companionCanvas.addEventListener('click', () => activateCompanion(tool === 'select' ? 'pen' : tool));
companionMiniDays.addEventListener('click', async ev => {
  setCompanionCalendarVisible(false);
  const btn = ev.target.closest('.mini-day[data-date]');
  if (!btn) return;
  const date = clampDate(btn.dataset.date);
  const side = oppositeSide(activeSide);
  if (viewMode === 'pinned') {
    if (side === pinnedSide) pinnedDate = date;
    else mobileDate = date;
    companionDate = date;
    persistViewPreferences();
    await renderCompanionPage();
    return;
  }
  companionDate = date;
  await activateCompanion(tool === 'select' ? 'pen' : tool);
});
companionPrevMonth.addEventListener('click', () => { companionCalendarMonth = offsetMonth(companionCalendarMonth, -1); renderCompanionMiniCalendar(); });
companionNextMonth.addEventListener('click', () => { companionCalendarMonth = offsetMonth(companionCalendarMonth, 1); renderCompanionMiniCalendar(); });
companionMonthLabel.addEventListener('click', () => activateCompanion(tool === 'select' ? 'pen' : tool));

document.querySelectorAll('.color-button').forEach(btn => btn.addEventListener('click', () => setColor(btn.dataset.color)));
widthRange.addEventListener('input', () => {
  baseWidth = Number(widthRange.value);
  widthValue.textContent = String(baseWidth);
});

document.querySelectorAll('.layout-choice').forEach(btn => btn.addEventListener('click', () => {
  pageLayout = btn.dataset.layout;
  applyPageAppearance();
  updateSettingsUI();
  savePage();
}));

document.querySelectorAll('.paper-choice').forEach(btn => btn.addEventListener('click', () => {
  paperTone = btn.dataset.paper;
  applyPageAppearance();
  updateSettingsUI();
  savePage();
}));

document.querySelectorAll('.mouse-choice').forEach(btn => btn.addEventListener('click', () => setMouseMode(btn.dataset.mouse)));

undoBtn.addEventListener('click', performUndo);
redoBtn.addEventListener('click', performRedo);
quickUndoBtn?.addEventListener('click', performUndo);

calendarToggleBtn?.addEventListener('click', () => setMainCalendarVisible(Boolean(miniCalendar?.hidden)));
companionCalendarToggleBtn?.addEventListener('click', () => setCompanionCalendarVisible(Boolean(companionMiniCalendar?.hidden)));

miniDays.addEventListener('click', ev => {
  const btn = ev.target.closest('.mini-day[data-date]');
  if (!btn) return;
  const next = btn.dataset.date;
  setMainCalendarVisible(false);
  changeDate(next, next < currentDate ? 'prev' : 'next');
});

miniPrevMonth.addEventListener('click', () => {
  calendarMonth = offsetMonth(calendarMonth, -1);
  renderMiniCalendar();
});
miniNextMonth.addEventListener('click', () => {
  calendarMonth = offsetMonth(calendarMonth, 1);
  renderMiniCalendar();
});
miniMonthLabel.addEventListener('click', () => {
  quickDateInput.value = currentDate;
  if (typeof quickDateInput.showPicker === 'function') quickDateInput.showPicker();
  else quickDateInput.click();
});
quickDateInput.addEventListener('change', () => {
  const next = clampDate(quickDateInput.value || currentDate);
  changeDate(next, next < currentDate ? 'prev' : 'next');
});

document.addEventListener('keydown', ev => {
  const target = ev.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    ev.preventDefault();
    if (ev.shiftKey) redoBtn.click(); else undoBtn.click();
  }
  if (ev.key === 'Escape') setSettingsOpen(false);
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(pageWrap);
resizeObserver.observe(companionPageWrap);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 160));
window.addEventListener('pagehide', () => { if (recordingActive()) stopAudioRecording(); savePage(true).catch(console.warn); clearMediaObjectUrls(); clearAudioObjectUrls(); clearCompanionObjectUrls(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (recordingActive()) stopAudioRecording();
    savePage(true).catch(console.warn);
    if (vaultKey) lockVault();
  }
});

function formatStorageBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function refreshPwaDiagnostics() {
  if (pwaModeStatus) pwaModeStatus.textContent = isStandaloneMode() ? 'App installata' : 'Browser';

  if (pwaOfflineStatus) {
    if (!('serviceWorker' in navigator)) pwaOfflineStatus.textContent = 'Non supportato';
    else {
      try {
        await navigator.serviceWorker.ready;
        pwaOfflineStatus.textContent = 'Pronto';
      } catch {
        pwaOfflineStatus.textContent = 'Non pronto';
      }
    }
  }

  if (navigator.storage) {
    try {
      let persistent = typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : false;
      if (!persistent && typeof navigator.storage.persist === 'function') {
        try { persistent = await navigator.storage.persist(); } catch {}
      }
      if (storagePersistStatus) storagePersistStatus.textContent = persistent ? 'Persistente' : 'Standard';
      if (typeof navigator.storage.estimate === 'function') {
        const estimate = await navigator.storage.estimate();
        if (storageUsageStatus) storageUsageStatus.textContent = `${formatStorageBytes(estimate.usage || 0)} / ${formatStorageBytes(estimate.quota || 0)}`;
      }
    } catch (err) {
      console.warn('Diagnostica storage non disponibile:', err);
      if (storagePersistStatus) storagePersistStatus.textContent = 'Non disponibile';
    }
  } else if (storagePersistStatus) {
    storagePersistStatus.textContent = 'Non disponibile';
  }
}

async function registerPwaServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    refreshPwaDiagnostics().catch(console.warn);
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    try { await registration.update(); } catch {}
    await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('Service worker non disponibile:', err);
  } finally {
    refreshPwaDiagnostics().catch(console.warn);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function showWelcomeScreen() {
  welcomeSplash.hidden = false;
  requestAnimationFrame(() => welcomeSplash.classList.add('visible'));

  let paused = false;
  let finished = false;
  let timerId = 0;

  return new Promise(resolve => {
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timerId);
      welcomeSplash.removeEventListener('click', onClick);
      welcomeSplash.classList.add('leaving');
      setTimeout(() => {
        welcomeSplash.remove();
        resolve();
      }, 320);
    };

    const onClick = ev => {
      ev.preventDefault();
      if (!paused) {
        paused = true;
        clearTimeout(timerId);
        welcomeSplash.classList.add('paused');
        welcomePauseMark.setAttribute('aria-hidden', 'false');
        return;
      }
      finish();
    };

    welcomeSplash.addEventListener('click', onClick);
    timerId = setTimeout(finish, WELCOME_SPLASH_MS);
  });
}

async function runIntroSequence() {
  const elapsed = performance.now() - splashStartedAt;
  const remaining = Math.max(0, COVER_SPLASH_MS - elapsed);
  if (remaining) await wait(remaining);

  coverSplash.classList.add('leaving');
  await wait(300);
  coverSplash.remove();
  await showWelcomeScreen();
  if (appShell) {
    appShell.hidden = false;
    requestAnimationFrame(() => appShell.classList.add('ready'));
    await updateSpreadView();
    requestAnimationFrame(() => { resizeCanvas(); resizeCompanionCanvas(); });
  }
}

async function init() {
  try {
    db = await openDb();
    loadViewPreferences();
    vaultExists = Boolean(await idbGetVault());
    await loadDailyPage(currentDate);
    resizeCanvas();
    setTool('pen');
    setMouseMode('ink');
    setColor(DEFAULT_COLOR);
    setAudioControlsForState();
    saveStatus.textContent = 'Pronto';
  } catch (err) {
    console.error(err);
    saveStatus.textContent = 'Errore dati';
    saveStatus.classList.add('warn');
  } finally {
    runIntroSequence().catch(console.warn);
  }

  window.addEventListener('load', registerPwaServiceWorker, { once: true });
  window.addEventListener('pageshow', () => {
    setTimeout(resizeCanvas, 60);
    refreshPwaDiagnostics().catch(console.warn);
  });
}

init();
