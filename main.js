const electronApi = require('electron');

// Safety guard: if Electron was launched in "run as node" mode, the API object
// is replaced by a path string and every API below would be undefined.
if (typeof electronApi === 'string') {
  console.error('Lumshot must be started with "npm start" (Electron is running as plain Node.js).');
  process.exit(1);
}

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  clipboard,
  dialog,
  nativeImage,
  screen,
  shell,
  Tray,
  Menu,
  nativeTheme,
  protocol,
} = electronApi;
const path = require('path');
const fs = require('fs');

// Custom scheme that serves the bundled OCR runtime (Tesseract worker, WASM
// cores, language data) to the editor renderer. The browser build of
// Tesseract.js loads its core via importScripts and its .traineddata via
// fetch() — neither works from a file:// origin (Chromium blocks local-resource
// fetch and cross-origin CORS), so we expose the assets over this fetch-capable,
// CORS-enabled scheme instead. Must be declared before app "ready".
protocol.registerSchemesAsPrivileged([
  // corsEnabled is required so the editor (a file:// origin) can fetch() the
  // .traineddata across origins into Tesseract's worker. Without it, Chromium
  // (strict since the Electron 43 upgrade) blocks the cross-origin fetch —
  // "Cross origin requests are only supported for protocol schemes: …" — and
  // OCR spins forever without ever extracting text.
  { scheme: 'ocr', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true } },
]);

// Platform branches: Windows draws its own HTML dropdown menus (custom title bar,
// no native chevron gutter); macOS/Linux use the native system menu bar.
const IS_WINDOWS = process.platform === 'win32';
const IS_MAC     = process.platform === 'darwin';
const IS_LINUX   = process.platform === 'linux';

// True only when this process was launched by the OS's "run at login" mechanism
// (see the `args: ['--hidden']` passed to setLoginItemSettings below) — a normal
// double-click from the Start Menu, desktop, or taskbar never carries this flag.
// Electron's `wasOpenedAtLogin`/`wasOpenedAsHidden` login-item fields are
// macOS-only, so a marker arg is the only reliable cross-platform signal.
// Gates only the *initial* auto-show on first paint (see createEditorWindow) —
// every explicit showEditor() afterwards (tray click, "Open Lumshot", a second
// launch attempt, a capture that wants the editor) works exactly as before.
const LAUNCHED_SILENTLY = process.argv.includes('--hidden');

const license = require('./license');
const { POLAR_CHECKOUT_URL } = require('./secrets');
const settings = require('./settings');
const captureHistory = require('./captureHistory');
const aiPaste = require('./aiPaste');
const getStore = require('./store');
// electron-updater is lazy-required where used (setupAutoUpdate / tray / menu) so
// its dependency subtree never loads on the startup path — and never at all in
// development, where the updater is disabled.
const { version } = require('./package.json');

// Optional startup profiler — set LUMSHOT_PERF=1 to print elapsed-ms milestones
// (process start → whenReady → window created → first paint) to stderr. Zero
// overhead when the flag is off; kept in the tree so startup can be re-measured
// after any change without rebuilding instrumentation.
const PERF = process.env.LUMSHOT_PERF === '1';
const perfT0 = Date.now();
const perf = PERF ? (label) => console.error(`[perf] +${Date.now() - perfT0}ms  ${label}`) : () => {};

// Shared webPreferences for every BrowserWindow. Beyond the security baseline
// (contextIsolation on, nodeIntegration off), this disables two Chromium
// subsystems the app never uses so they don't cost startup time, memory, or
// background CPU:
//   • spellcheck — no window relies on the red-squiggle checker (every text
//     input already sets spellcheck="false"); leaving it on spins up the
//     spellcheck service and its dictionary loading on each renderer.
//   • backgroundThrottling — the app lives in the tray with windows hidden;
//     Chromium would otherwise throttle timers/rAF in the hidden overlay and
//     editor, which delayed the first post-idle frame (capture warm-up, toast
//     animations). Keeping renderers un-throttled makes hidden→shown instant.
const BASE_WEB_PREFERENCES = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  spellcheck: false,
  backgroundThrottling: false,
};

let editorWindow      = null;
let editorReady       = false;   // editor has painted its first frame (per-creation)
let editorFocusPending = false;  // showEditor() ran before the first paint — finish on ready
let overlayWindow     = null;    // persistent, pre-created at startup; shown/hidden per capture
let overlayVisible    = false;   // true while the region-selection overlay is on screen
let overlayCapturing  = false;   // true while the overlay is held as scroll-capture feedback
let pendingOverlayBounds = null; // display bounds to position the overlay before showing
let overlayReady      = false;   // overlay has loaded + painted its first full-size frame
let overlayShowPending = false;  // a show was requested before the overlay was ready
let pendingOverlayMode = 'region'; // mode to open the overlay in once it's revealed
let pendingCapture    = null;    // Promise<{image, scaleFactor, bounds}> of the in-flight grab
let captureSession    = 0;       // increments per startCapture(); guards against stale frame pushes
let overlayFrameJob   = 0;       // captureSession whose frame push is already queued/sent
let windowPickerWindow = null;
let tray              = null;
let isQuitting        = false;   // true only during a real Quit (from tray / app.quit)
let activeShortcut    = null;    // the global accelerator currently registered
let activeAiShortcut  = null;    // "Capture to AI" accelerator currently registered
let aiHotkeyUnavailable = false; // AI hotkey failed to register (conflict) — surfaced in settings
let aiCandidates      = [];      // ranked AI-app targets for the in-flight capture (badge + Tab cycling)
let pendingAiTargets  = null;    // [{ appName, icon }] for the overlay reset payload (AI-hotkey entry)
const aiIconCache     = new Map(); // exe path → icon dataURL | null (getFileIcon is not free)
let aiToastWindow     = null;    // short-lived "Sent to …" system toast window
let updateReady       = false;   // an update has finished downloading and is ready to install
let appMenu           = null;    // built once in app.whenReady(), applied to each editor window
let menuActions       = {};      // id → click handler for the custom HTML menu (renderer-drawn)
let pinWindow         = null;    // floating "Pin to Screen" window (only one at a time)
let pinImage          = null;    // dataURL currently shown in the pin (raw, then beautified)
let pinDragTimer      = null;    // setInterval id while the pin is being dragged (custom drag)
let editorHasImage    = false;   // true once a screenshot has been loaded into the editor doc
let editorVisibleBeforeCapture = false; // editor visibility at the instant a capture began
let pendingOcrCapture = false;   // next capture should open straight into the editor's OCR Mode
let scrollWindow      = null;    // scroll-capture control window
let scrollSession     = null;    // in-flight scroll capture state (see startScrollCapture)

// ─── Single-instance lock ─────────────────────────────────────────────────────
// The app keeps running in the tray after all its windows close. Without this lock,
// launching it again spawns a second process that fails to register the global
// capture shortcut (the first process still owns it) — so the new editor opens
// without its "Ctrl+Shift+S" hint. Instead, hand the launch off to the running
// instance and quit this duplicate.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // A second launch was attempted — surface the existing editor window.
    showEditor();
  });
}

// ─── Windows ────────────────────────────────────────────────────────────────
// Native window background per theme. MUST match --bg in editor.html (dark /
// light blocks): this is the colour the OS paints before the renderer's first
// frame and in resize gutters, so any mismatch shows up as a flash.
const EDITOR_BG = { dark: '#0C0C10', light: '#E7E7EA' };

function editorBgColor() {
  try { return EDITOR_BG[getEffectiveTheme()] || EDITOR_BG.dark; }
  catch { return EDITOR_BG.dark; }
}

function createEditorWindow() {
  editorReady = false;
  editorWindow = new BrowserWindow({
    width: 1140,        // 820 main preview + 320 controls sidebar
    height: 720,
    // Narrowest width where the whole toolbar row still fits without clipping:
    // the fixed 316px right cluster (aligned to the sidebar, so it reaches the
    // window edge) sits flush against the Tool Properties panel with no gap:
    //   15 pad + 127 left + 32 min palette margin + 440 palette + 12 + 156
    //   tool-props = 782 (props right edge), + 316 right cluster = 1098.
    // Below this the right cluster would overlap tool-props (which then clips).
    // 1104 (not 1098) leaves a few px so sub-pixel rounding never clips Save.
    minWidth: 1104,
    minHeight: 580,
    title: 'Lumshot',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: editorBgColor(),
    // Never show an unpainted window: reveal on 'ready-to-show' below, when the
    // first frame (with the correct theme, see the inline <head> script in
    // editor.html) has already been rendered. Eliminates the startup flash.
    show: false,
    // Launched silently at Windows startup: stay off the taskbar too, matching
    // the state a manual close() leaves it in (see the 'close' handler below).
    // showEditor() flips this back to false the moment the user actually opens it.
    skipTaskbar: LAUNCHED_SILENTLY,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: BASE_WEB_PREFERENCES,
  });

  editorWindow.once('ready-to-show', () => {
    if (!editorWindow || editorWindow.isDestroyed()) return;
    perf('editor ready-to-show (first paint)');
    editorReady = true;
    // A capture that began before the first paint hid the editor on purpose —
    // don't pop it up over the capture overlay; the post-capture flow reshows it.
    if (overlayVisible) return;
    // Silent startup launch, and nobody has asked to see it yet (editorFocusPending
    // would be true if showEditor() ran while we were still loading — that always
    // wins over staying hidden). The window is fully loaded and warm in the tray;
    // it just never gets its first .show() until the user actually asks for it.
    if (LAUNCHED_SILENTLY && !editorFocusPending) return;
    editorWindow.show();
    if (editorFocusPending) {
      editorFocusPending = false;
      editorWindow.setSkipTaskbar(false);
      editorWindow.focus();
    }
  });

  // Apply the menu for this window. On Windows the bar is hidden (the custom
  // title bar + HTML dropdowns replace it) while accelerators stay active; on
  // macOS/Linux applyAppMenu() drives the native system menu bar instead.
  if (appMenu) applyAppMenu();

  // Apply the persisted "Always on Top" state to this window, and sync the
  // View-menu checkbox so it reflects the stored value on every window open.
  const onTop = !!settings.getSettings().alwaysOnTop;
  editorWindow.setAlwaysOnTop(onTop);
  if (appMenu) {
    const view = appMenu.items.find(i => i.label === 'View');
    const item = view && view.submenu && view.submenu.items.find(i => i.label === 'Always on Top');
    if (item) item.checked = onTop;
  }

  editorWindow.loadFile('editor.html');
  if (PERF) editorWindow.webContents.on('did-finish-load', () => perf('editor did-finish-load'));

  // Notify the custom title bar when the window is maximised / restored.
  editorWindow.on('maximize',   () => { if (editorWindow && !editorWindow.isDestroyed()) editorWindow.webContents.send('window:maximized', true);  });
  editorWindow.on('unmaximize', () => { if (editorWindow && !editorWindow.isDestroyed()) editorWindow.webContents.send('window:maximized', false); });

  // On some GPUs/drivers, a window revealed after being hidden a while (close-
  // to-tray then reopened, or the silent-startup path — see LAUNCHED_SILENTLY)
  // can come back with parts of the chrome (notably the toolbar) never painted,
  // because Chromium skips compositing work for a hidden window and the first
  // frame after `.show()` doesn't always pick everything back up on affected
  // hardware. Forcing a full repaint on every show is cheap and fixes it
  // unconditionally rather than only for machines we can reproduce it on.
  editorWindow.on('show', () => {
    if (editorWindow && !editorWindow.isDestroyed()) editorWindow.webContents.invalidate();
  });

  // Closing the window minimizes to tray instead of quitting.
  editorWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      editorWindow.hide();
      if (process.platform === 'win32') editorWindow.setSkipTaskbar(true);
    }
  });

  editorWindow.on('closed', () => { editorWindow = null; editorReady = false; });
}

// Show + focus the editor, taking it out of "tray-only" state.
function showEditor() {
  if (!editorWindow || editorWindow.isDestroyed()) createEditorWindow();
  // Freshly (re)created and not yet painted — showing now would flash the bare
  // window background. 'ready-to-show' above completes the show + focus.
  if (!editorReady) { editorFocusPending = true; return; }
  editorWindow.show();
  editorWindow.setSkipTaskbar(false);
  editorWindow.focus();
}

// Push an image into the editor document and remember that it now holds one.
function loadIntoEditor(dataUrl) {
  if (editorWindow && !editorWindow.isDestroyed()) {
    // `ocr` tells the editor to open this capture directly in OCR Mode. The flag
    // is one-shot: consumed (and cleared) by whichever capture path lands here.
    editorWindow.webContents.send('load-screenshot', { dataUrl, ocr: pendingOcrCapture });
    pendingOcrCapture = false;
    editorHasImage = true;
  }
}

// ─── Pin to Screen ───────────────────────────────────────────────────────────
// A small always-on-top window that mirrors the latest capture / export. Only
// one exists at a time — a new capture destroys the previous pin and makes a
// fresh one (per spec).
//
// Window layout (sizes match pin.html's CSS):
//   SHADOW (10px transparent margin, room for the subtle drop shadow)
//     └─ image card (radius 12px) — the screenshot fills it, no frame/border.
function showPin(dataUrl, imgW, imgH) {
  pinImage = dataUrl;

  if (pinWindow && !pinWindow.isDestroyed()) { pinWindow.destroy(); pinWindow = null; }

  const SHADOW = 10;          // transparent margin for the (subtle) drop shadow
  const CARD_W = 250;         // image card width (slightly smaller than the old 280)
  const ratio  = (imgW && imgH) ? (imgH / imgW) : 0.6;
  const cardH  = Math.max(60, Math.min(200, Math.round(CARD_W * ratio)));
  const winW   = CARD_W + SHADOW * 2;
  const winH   = cardH  + SHADOW * 2;

  const area = screen.getPrimaryDisplay().workArea;
  const x = area.x + area.width  - winW - 20;
  const y = area.y + area.height - winH - 20;

  pinWindow = new BrowserWindow({
    x, y, width: winW, height: winH,
    frame: false, transparent: true, resizable: false, backgroundColor: '#00000000',
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    fullscreenable: false, maximizable: false, minimizable: false,
    movable: true, show: false,
    webPreferences: BASE_WEB_PREFERENCES,
  });
  pinWindow.setAlwaysOnTop(true, 'screen-saver'); // floats above all apps
  pinWindow.loadFile('pin.html');
  pinWindow.webContents.once('did-finish-load', () => {
    if (!pinWindow || pinWindow.isDestroyed()) return;
    pinWindow.webContents.send('pin:show', dataUrl);
    pinWindow.showInactive(); // appear without stealing focus from the editor
  });
  pinWindow.on('closed', () => { pinWindow = null; });
}

// Mirror a newly exported (beautified) image into the existing pin, if any.
function updatePin(dataUrl) {
  if (!dataUrl) return;
  pinImage = dataUrl;
  if (pinWindow && !pinWindow.isDestroyed()) pinWindow.webContents.send('pin:update', dataUrl);
}

// Common dispatch after any capture produces a final cropped/grabbed image:
// load it into the editor only if the editor was visible when capture began
// (Scenario 1); otherwise leave the editor hidden (Scenario 2) and mark its
// document stale so the pin's Edit button loads this fresh image. Pin unless the
// capture was for OCR — there the goal is the extracted text, not a floating
// image, so a Pin would just be noise. (Read the flag before loadIntoEditor
// consumes it.)
function dispatchCapture(dataUrl, imgW, imgH) {
  const isOcrCapture = pendingOcrCapture;
  captureHistory.saveCapture(dataUrl, imgW, imgH);
  // OCR captures always open the editor (that's where the extracted text lands)
  // since there's no Pin to fall back on; image captures keep the old behaviour.
  if (editorVisibleBeforeCapture || isOcrCapture) {
    showEditor();
    loadIntoEditor(dataUrl);
  } else {
    editorHasImage = false; // editor's current doc no longer matches the latest capture
  }
  if (!isOcrCapture) showPin(dataUrl, imgW, imgH);
}

// ─── Capture ───────────────────────────────────────────────────────────────
// Grab the primary display at native (physical) resolution. Returns the raw
// nativeImage plus the scaleFactor so callers can map DIP coords → image pixels.
// No toDataURL here — that PNG-encode of a 4K frame is ~0.8s and we avoid it by
// cropping natively (nativeImage.crop) and only encoding the small result.
//
// desktopCapturer is a *thumbnail* pipeline: per Electron's own docs the result
// "is not guaranteed [to match] thumbnailSize… depends on the scale of the
// screen", so it resamples the frame and softens text on HiDPI displays (verified:
// a 3840×2160 screen comes back as 3841×2161 on a 1.75× display — a fractional
// rescale that turns integer scrolls into sub-pixel offsets and wrecks stitch
// alignment). It's now only a FALLBACK: both single-shot grabs (grabFullScreenSharp)
// and the scroll-capture loop (scrollGrab) use the pixel-exact native BitBlt path
// first, dropping here only if the helper is unavailable.
async function grabFullScreen() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sf = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) },
  });
  if (!sources.length) return null;
  return { image: sources[0].thumbnail, scaleFactor: sf, bounds: display.bounds };
}

// ─── Persistent native-capture helper ──────────────────────────────────────────
// screenshot.ps1 is kept resident (like the scroll helper) so its one-time cost —
// PowerShell startup + Add-Type's C# compile — is paid ONCE, not on every grab.
// After warm-up each capture is just a BitBlt + PNG encode (~150–400 ms) instead
// of the ~0.5–1.5 s a fresh `powershell -File …` spawn used to cost.
let captureHelper      = null;  // the resident PowerShell process
let captureHelperReady = null;  // Promise<boolean> — resolves true once it prints READY
let captureSeq         = 0;     // request id counter
const capturePending   = new Map(); // id → { resolve, reject, outPath, timer }

// In a packaged build a .ps1 under `files` lives in app.asar (a virtual archive an
// external process can't read); asarUnpack extracts matching entries to a parallel
// app.asar.unpacked tree, so point PowerShell at the real on-disk copy. In dev
// (__dirname is the source dir) this replace is a no-op.
function helperScriptPath(name) {
  return path.join(__dirname, name)
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function captureHelperScriptPath() {
  return helperScriptPath('screenshot.ps1');
}

// Match a helper response line ("OK <id> <w> <h>" | "ERR <id> <msg>") to its request.
function handleCaptureResponse(line) {
  const ok = line.match(/^OK\s+(\S+)\s+(\d+)\s+(\d+)/);
  const er = line.match(/^ERR\s+(\S+)\s*(.*)/);
  const id = ok ? ok[1] : (er ? er[1] : null);
  if (!id) return;
  const p = capturePending.get(id);
  if (!p) return;                    // already timed out / unknown id — ignore
  capturePending.delete(id);
  clearTimeout(p.timer);
  if (ok) p.resolve({ w: +ok[2], h: +ok[3] });
  else    p.reject(new Error(er && er[2] ? er[2] : 'native capture failed'));
}

// Spawn (once) and warm the resident capture helper; resolves true when READY.
function startCaptureHelper() {
  if (captureHelperReady) return captureHelperReady;
  captureHelperReady = new Promise((resolve) => {
    const { spawn } = require('child_process');
    let ps;
    try {
      ps = spawn('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', captureHelperScriptPath()],
        { windowsHide: true });
    } catch (err) {
      console.error('capture helper spawn failed:', err);
      captureHelperReady = null;     // allow a later retry
      return resolve(false);
    }
    captureHelper = ps;
    let buf = '', ready = false;
    ps.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        if (!ready && line === 'READY') { ready = true; resolve(true); continue; }
        handleCaptureResponse(line);
      }
    });
    ps.on('error', (err) => { console.error('capture helper error:', err); });
    ps.on('exit', () => {
      captureHelper = null; captureHelperReady = null;
      if (!ready) resolve(false);
      // Fail any in-flight requests so their callers fall back to desktopCapturer.
      for (const [, p] of capturePending) { clearTimeout(p.timer); p.reject(new Error('capture helper exited')); }
      capturePending.clear();
    });
  });
  return captureHelperReady;
}

function stopCaptureHelper() {
  const ps = captureHelper;
  captureHelper = null; captureHelperReady = null;
  if (ps) {
    try { ps.stdin.write('EXIT\n'); ps.stdin.end(); } catch (e) { /* already gone */ }
    try { ps.kill(); } catch (e) { /* ignore */ }
  }
}

// Pixel-exact primary-display grab via the resident GDI BitBlt helper — the same
// path Windows Snipping Tool uses, with zero resampling, so captured text is as
// sharp as the source. Same return shape as grabFullScreen(). Rejects on any
// failure so the caller can fall back to desktopCapturer.
function grabFullScreenNative() {
  return new Promise((resolve, reject) => {
    startCaptureHelper().then((ready) => {
      if (!ready || !captureHelper || !captureHelper.stdin || !captureHelper.stdin.writable) {
        return reject(new Error('capture helper unavailable'));
      }
      const display = screen.getPrimaryDisplay();
      const sf = display.scaleFactor || 1;
      const id = 'c' + (++captureSeq);
      const outPath = path.join(app.getPath('temp'),
        `lumshot-cap-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);

      // Guard against a wedged helper so the caller still falls back.
      const timer = setTimeout(() => {
        if (!capturePending.has(id)) return;
        capturePending.delete(id);
        try { fs.unlinkSync(outPath); } catch (e) {}
        reject(new Error('native capture timed out'));
      }, 8000);

      capturePending.set(id, {
        outPath, timer,
        resolve: () => {
          let image;
          try { image = nativeImage.createFromPath(outPath); }
          catch (e) { try { fs.unlinkSync(outPath); } catch (e2) {} return reject(e); }
          fs.unlink(outPath, () => {}); // best-effort; bytes are already decoded
          if (!image || image.isEmpty()) return reject(new Error('native capture produced an empty image'));
          resolve({ image, scaleFactor: sf, bounds: display.bounds });
        },
        reject: (err) => { try { fs.unlinkSync(outPath); } catch (e) {} reject(err); },
      });

      try {
        captureHelper.stdin.write(`CAPTURE ${id} ${outPath}\n`);
      } catch (err) {
        capturePending.delete(id);
        clearTimeout(timer);
        try { fs.unlinkSync(outPath); } catch (e) {}
        reject(err);
      }
    }, reject);
  });
}

// Highest-fidelity grab for single-shot captures (region, full screen). Tries the
// native pixel-exact path first and only falls back to desktopCapturer if it ever
// fails — so worst case is today's behaviour, never a broken capture.
async function grabFullScreenSharp() {
  try {
    return await grabFullScreenNative();
  } catch (err) {
    console.error('Native capture failed; falling back to desktopCapturer:', err && err.message);
    return await grabFullScreen();
  }
}

// Region capture. The overlay appears INSTANTLY over the live desktop; the
// (slow) screen grab runs in the background while the user drags, so there is no
// perceived delay. The overlay is excluded from capture via setContentProtection,
// so it never appears in the grabbed frame.
async function startCapture(initialMode = 'region') {
  if (overlayVisible) return; // re-entry guard
  captureSession++;           // new session — invalidates any in-flight frame push

  // Remember whether the editor was on screen before we hide it for the grab —
  // this decides Scenario 1 (editor open) vs Scenario 2 (tray-only) below.
  editorVisibleBeforeCapture = !!(editorWindow && !editorWindow.isDestroyed() && editorWindow.isVisible());
  if (editorWindow) editorWindow.hide();

  // Show the selection overlay immediately (no waiting on a screenshot). The mode
  // it should open in (region / scroll / ocr) is applied as part of the reveal so
  // the overlay never visibly flips from region to the target mode.
  pendingOverlayMode   = initialMode;
  pendingOverlayBounds = screen.getPrimaryDisplay().bounds;
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
  requestShowOverlay();

  // Grab the real screen in the background. The 150ms delay lets the editor
  // finish hiding so it isn't in the shot; the overlay is content-protected.
  pendingCapture = (async () => {
    await new Promise((r) => setTimeout(r, 150));
    try { return await grabFullScreenSharp(); }
    catch (err) { console.error('Screen capture error:', err); return null; }
  })();
}

// Opens the capture overlay pre-set to scroll mode so the user immediately sees
// the scroll-select UI instead of having to click the Scroll mode button.
// The mode is applied atomically during the reveal (see revealOverlay).
function startCaptureScroll() { startCapture('scroll'); }

// Opens the capture overlay pre-set to OCR mode (the user then drags the area to
// extract text from), mirroring how Capture Scroll pre-selects scroll mode.
function startCaptureOcr() { startCapture('ocr'); }

// ─── Capture to AI ────────────────────────────────────────────────────────────
// A dedicated capture workflow (overlay mode 'ai') that auto-pastes into the
// AI/code app the user is working with — NOT the foreground window. In the
// real workflow the user captures FROM a browser/preview/terminal TO the AI
// tool they were just in, so the destination is resolved by
// aiPaste.findTargets(): whitelisted AI apps only, ranked by window Z-order
// (activation recency). The overlay shows the pick as a logo badge by the
// cursor; Tab cycles through the other running AI apps, and the Region tab
// drops back to the normal workflow. Every failure degrades: no AI app
// running / helper wedged → the plain capture flow; focus/paste failure →
// the image is already on the clipboard and a toast says to paste manually.
async function startCaptureToAI() {
  if (overlayVisible) return; // same re-entry guard as startCapture()
  const ai = settings.getSettings().captureToAI;
  if (!ai.enabled || !aiPaste.isSupported()) return startCapture();
  const candidates = await aiPaste.findTargets(ai.customApps, 1500);
  if (!candidates.length) return startCapture(); // no AI app running → normal workflow
  aiCandidates = candidates;
  // Resolved BEFORE the reveal so the AI overlay opens with its destination
  // badge ready on the first frame (atomic, like mode pre-selection).
  pendingAiTargets = await aiTargetsPayload(candidates);
  await startCapture('ai');
}

// The exe's real icon (as a dataURL) for the overlay's destination badge —
// authentic for any app, including user-added customApps, with nothing to
// bundle. null when the exe has no extractable icon; the badge then falls
// back to the app's initial letter.
async function iconForExe(exe) {
  if (aiIconCache.has(exe)) return aiIconCache.get(exe);
  let icon = null;
  try {
    const img = await app.getFileIcon(exe, { size: 'large' });
    if (img && !img.isEmpty()) icon = img.toDataURL();
  } catch (e) { /* no icon — badge falls back to the initial letter */ }
  aiIconCache.set(exe, icon);
  return icon;
}

function aiTargetsPayload(candidates) {
  return Promise.all(candidates.map(async (c) => ({
    appName: c.appName,
    icon: await iconForExe(c.exe),
  })));
}

// Normal-workflow entries (Ctrl+Shift+S, menu, tray) must reveal instantly, so
// their AI destinations are resolved AFTER the reveal and pushed to the
// overlay when ready (~ms on the warm helper) — the AI tab sits unavailable
// until they arrive. Session-guarded against stale deliveries.
function resolveAiTargetsLate() {
  const session = captureSession;
  const ai = settings.getSettings().captureToAI;
  if (!ai.enabled || !aiPaste.isSupported()) return;
  aiPaste.findTargets(ai.customApps, 1500).then(async (candidates) => {
    if (session !== captureSession || !overlayVisible) return;
    aiCandidates = candidates;
    const targets = await aiTargetsPayload(candidates);
    if (session !== captureSession || !overlayVisible) return;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay-ai-targets', targets);
    }
  }).catch(() => { /* AI tab simply stays unavailable this capture */ });
}

// Finish a Capture-to-AI region selection: clipboard → focus-restore → paste.
// Deliberately no editor and no pin — the point is that the user never leaves
// the target app; the image still lands in history.
async function finishAiCapture(crop, target) {
  captureHistory.saveCapture(crop.image.toDataURL(), crop.w, crop.h);
  editorHasImage = false; // editor's current doc no longer matches the latest capture

  clipboard.writeImage(crop.image);
  // Verify the clipboard really holds the image BEFORE touching foreground
  // state — the "press Ctrl+V yourself" fallback only works if it does.
  const clipOk = !clipboard.readImage().isEmpty();
  let paste = { ok: false, reason: 'clipboard-empty' };
  if (clipOk) {
    // The parked overlay is still technically "shown" and may retain foreground
    // — make sure it has yielded before the helper asserts the target.
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.blur();
    paste = await aiPaste.focusAndPaste(target.hwnd);
  }
  if (paste.ok) {
    showSystemToast(`Sent to ${target.appName}`);
  } else {
    console.error('Capture to AI: paste failed:', paste.reason);
    showSystemToast(clipOk
      ? `Copied to clipboard. Press Ctrl+V in ${target.appName}.`
      : 'Capture failed — clipboard unavailable');
  }
}

// ─── System toast ─────────────────────────────────────────────────────────────
// A small self-dismissing pill shown WITHOUT taking focus — focus is exactly
// what the paste flow just handed to the target app. Separate from the editor's
// in-window toast because the editor stays hidden in the direct send flow.
function showSystemToast(message) {
  if (aiToastWindow && !aiToastWindow.isDestroyed()) { aiToastWindow.destroy(); aiToastWindow = null; }
  const area = screen.getPrimaryDisplay().workArea;
  const winW = 460, winH = 56;
  const toast = new BrowserWindow({
    x: Math.round(area.x + area.width / 2 - winW / 2),
    y: area.y + area.height - winH - 24,
    width: winW, height: winH,
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: false,
    fullscreenable: false, maximizable: false, minimizable: false, show: false,
    webPreferences: BASE_WEB_PREFERENCES,
  });
  aiToastWindow = toast;
  toast.setAlwaysOnTop(true, 'screen-saver');
  toast.setIgnoreMouseEvents(true); // purely informational — never eats clicks
  toast.loadFile('toast.html');
  toast.webContents.once('did-finish-load', () => {
    if (toast.isDestroyed()) return;
    toast.webContents.send('toast:show', message);
    toast.showInactive();
  });
  toast.on('closed', () => { if (aiToastWindow === toast) aiToastWindow = null; });
  setTimeout(() => { if (!toast.isDestroyed()) toast.destroy(); }, 2600);
}

// Full-screen capture: no region selection, send the whole screen to the editor.
// `preserveFlag` keeps the editorVisibleBeforeCapture value already set by a
// prior startCapture() (used when this is triggered from the overlay control bar).
async function captureFullScreen(preserveFlag = false) {
  if (overlayVisible) return;

  if (!preserveFlag) {
    editorVisibleBeforeCapture = !!(editorWindow && !editorWindow.isDestroyed() && editorWindow.isVisible());
  }
  if (editorWindow) editorWindow.hide();
  await new Promise((r) => setTimeout(r, 180));

  try {
    const shot = await grabFullScreenSharp();
    if (!shot) { if (editorVisibleBeforeCapture) showEditor(); return; }
    const size = shot.image.getSize();
    dispatchCapture(shot.image.toDataURL(), size.width, size.height);
  } catch (err) {
    console.error('Full-screen capture error:', err);
    if (editorVisibleBeforeCapture) showEditor();
  }
}

// A rectangle far below every display. The overlay is parked here (same size as
// its target display, so revealing it is a move with no resize) while "hidden":
// off-screen it's invisible and inert, but staying shown lets us reveal it by
// moving rather than calling show() (which would trigger the OS open-animation).
function parkedBounds() {
  const b = pendingOverlayBounds || screen.getPrimaryDisplay().bounds;
  let maxBottom = 0;
  for (const d of screen.getAllDisplays()) maxBottom = Math.max(maxBottom, d.bounds.y + d.bounds.height);
  return { x: b.x, y: maxBottom + 2000, width: b.width, height: b.height };
}

// Create the region-selection overlay ONCE at startup, kept parked off-screen.
function createOverlayWindow() {
  const b = screen.getPrimaryDisplay().bounds;
  overlayWindow = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false, transparent: true, skipTaskbar: true,
    resizable: false, movable: false, hasShadow: false, fullscreenable: false,
    show: false,          // never appears until a capture is triggered
    alwaysOnTop: true,
    webPreferences: BASE_WEB_PREFERENCES,
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver'); // floats above everything
  // Exclude the overlay from screen capture (WDA_EXCLUDEFROMCAPTURE on Win10+),
  // so we can grab the screen while the overlay is visible.
  overlayWindow.setContentProtection(true);
  // Set the true bounds explicitly AFTER creation — a hidden frameless window is
  // otherwise clamped to the work area (excludes taskbar), which caused the
  // resize-on-show "shake". Now the window is already full-size before it shows.
  overlayWindow.setBounds(b);
  overlayWindow.loadFile('overlay.html');
  // Reveal-without-animation strategy: Windows plays a centered zoom-in
  // animation whenever a window goes hidden→shown via show(). On this full-screen
  // transparent window that animation makes the top-anchored bar appear to slide
  // up into place and drops frames — the "laggy entrance" the user sees. So we
  // call show() exactly ONCE here, while the window is parked OFF-SCREEN (the
  // animation plays where it can't be seen), and from then on reveal/hide purely
  // by MOVING the window (setBounds) — a position change never animates.
  // We wait for 'ready-to-show' so the first frame is already painted full-size.
  overlayWindow.once('ready-to-show', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    overlayWindow.setBounds(parkedBounds()); // park off-screen, full-size
    overlayWindow.showInactive();            // burn the OS open-animation off-screen
    overlayReady = true;
    if (overlayShowPending) { overlayShowPending = false; revealOverlay(); }
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null; overlayVisible = false;
    overlayReady = false; overlayShowPending = false;
  });
}

// Request the overlay be shown. To eliminate the cold-start "shake" (a blank or
// work-area-clamped window flashing before it settles), we never call show()
// until the overlay has loaded and painted a full-size frame (overlayReady, set
// on 'ready-to-show'). If it isn't ready yet, the reveal is deferred and runs the
// instant it becomes ready. Warm reuse (the common case) reveals immediately.
function requestShowOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayReady) revealOverlay();
  else overlayShowPending = true;
}

// The actual reveal — the window is already shown (parked off-screen) and painted
// at full size, so this is a pure MOVE onto the target display: instant, no OS
// open-animation, no resize, no flash.
function revealOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const b = pendingOverlayBounds || screen.getPrimaryDisplay().bounds;
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setBounds(b);     // parked (off-screen) → on-screen: a move, not a show()
  overlayWindow.focus();          // grab keyboard (Esc / drag); does not animate
  overlayVisible = true;
  // Reset selection state, then apply the requested mode in the same tick so the
  // overlay never visibly flips from region to scroll/ocr.
  // The precision-aid states ride along so the overlay opens with the persisted
  // preferences already applied (no async settings fetch, no visible flip).
  const s = settings.getSettings();
  overlayWindow.webContents.send('overlay-reset', {
    crosshair: !!s.captureCrosshair,
    magnifier: !!s.captureMagnifier,
    // AI-workflow destinations ({ appName, icon }, MRU first). Inline only for
    // the AI-hotkey entry, where they were resolved before the reveal — the
    // badge is ready on the first frame. Normal entries get null here and the
    // real list via resolveAiTargetsLate() below.
    aiTargets: pendingOverlayMode === 'ai' ? (pendingAiTargets || []) : null,
  });
  if (pendingOverlayMode && pendingOverlayMode !== 'region') {
    overlayWindow.webContents.send('overlay-set-mode', pendingOverlayMode);
  }
  if (pendingOverlayMode !== 'ai') resolveAiTargetsLate();
}

// Hide the overlay by parking it OFF-SCREEN rather than hide() — this keeps the
// window in the "shown" state so the next reveal is a plain move (no hidden→shown
// show() and therefore no Windows open-animation). Off-screen it's invisible and
// receives no input, so it behaves exactly like a hidden window.
function hideOverlay() {
  overlayVisible = false;
  overlayCapturing = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.setBounds(parkedBounds());
  }
}

// Scroll capture: instead of hiding the overlay when the user presses Start, hold
// it on screen showing the frozen selection (bright) + dimmed surroundings for the
// whole capture — continuous "this is what's being captured" feedback (like
// CleanShot). The overlay is already content-protected, so it never appears in the
// grabbed frames; we make it click-through so wheel events reach the page beneath,
// and tell the renderer to drop its controls down to just the selection visual.
function enterOverlayCaptureMode() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayCapturing = true;
  overlayVisible = false; // no longer the interactive selection overlay
  const b = pendingOverlayBounds || screen.getPrimaryDisplay().bounds;
  overlayWindow.setBounds(b);                 // keep it on-screen over the capture
  overlayWindow.setIgnoreMouseEvents(true);   // click-through: wheel hits the page
  overlayWindow.blur();                       // don't hold keyboard focus
  overlayWindow.webContents.send('overlay-capturing', true);
}

// ─── File / Clipboard open ────────────────────────────────────────────────────
async function openImageFromFile() {
  showEditor();
  if (!editorWindow || editorWindow.isDestroyed()) return;
  const result = await dialog.showOpenDialog(editorWindow, {
    title: 'Open Image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (result.canceled || !result.filePaths[0]) return;
  const fp  = result.filePaths[0];
  const ext = path.extname(fp).slice(1).toLowerCase();
  const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
             : ext === 'webp' ? 'image/webp' : 'image/png';
  const dataUrl = `data:${mime};base64,${fs.readFileSync(fp).toString('base64')}`;
  loadIntoEditor(dataUrl);
}

function openFromClipboard() {
  showEditor();
  if (!editorWindow || editorWindow.isDestroyed()) return;
  const img = clipboard.readImage();
  if (img.isEmpty()) {
    editorWindow.webContents.send('show-toast', 'No image found in clipboard');
    return;
  }
  loadIntoEditor(img.toDataURL());
}

// ─── Capture IPC ─────────────────────────────────────────────────────────────
// Crop the background full-screen grab to a DIP rect at native resolution.
// Returns { image, w, h } in physical pixels, or null if the grab failed.
async function cropPendingTo(rect) {
  const cap = await pendingCapture;
  pendingCapture = null;
  if (!cap || !cap.image) return null;

  const sf = cap.scaleFactor;
  const size = cap.image.getSize();
  // DIP rect → physical image pixels, clamped to the captured frame.
  let x = Math.round(rect.x * sf);
  let y = Math.round(rect.y * sf);
  let w = Math.round(rect.w * sf);
  let h = Math.round(rect.h * sf);
  x = Math.max(0, Math.min(x, size.width  - 1));
  y = Math.max(0, Math.min(y, size.height - 1));
  w = Math.max(1, Math.min(w, size.width  - x));
  h = Math.max(1, Math.min(h, size.height - y));

  return { image: cap.image.crop({ x, y, width: w, height: h }), w, h };
}

// The overlay sends the selected region as a rect in DIP (CSS) coordinates plus
// the active capture mode. Region → editor, Scroll → stitched long-page capture.
ipcMain.on('region-selected', async (event, rect) => {
  const mode = rect.mode || 'region';
  pendingOcrCapture = !!rect.ocr; // scroll ignores OCR (set false by the overlay)

  // Scroll capture: HOLD the overlay on screen as continuous capture feedback
  // (frozen selection bright, surroundings dimmed) instead of hiding it. Every
  // other mode hides the overlay immediately as before.
  if (mode === 'scroll') {
    enterOverlayCaptureMode();
    aiCandidates = [];
    pendingAiTargets = null;
    pendingCapture = null;
    startScrollCapture(rect);
    return;
  }

  hideOverlay();

  // AI workflow: the overlay reports mode 'ai' plus the destination index the
  // user settled on (Tab cycling). Everything else about the selection is a
  // plain region crop. Consume the session state either way so it can never
  // leak into a later capture.
  const aiTarget = mode === 'ai'
    ? (aiCandidates[Number.isInteger(rect.aiIndex) ? rect.aiIndex : 0] || aiCandidates[0] || null)
    : null;
  aiCandidates = [];
  pendingAiTargets = null;

  try {
    const crop = await cropPendingTo(rect);
    if (!crop) { if (editorVisibleBeforeCapture) showEditor(); return; }
    if (aiTarget) {
      await finishAiCapture(crop, aiTarget);
      return;
    }
    dispatchCapture(crop.image.toDataURL(), crop.w, crop.h);
  } catch (err) {
    console.error('Region capture error:', err);
    if (editorVisibleBeforeCapture) showEditor();
  }
});


// Overlay control bar → an "immediate" mode (no drag selection needed).
ipcMain.on('capture-with-mode', async (event, payload) => {
  // Back-compat: older callers sent a bare mode string.
  const mode = typeof payload === 'string' ? payload : payload.mode;
  pendingOcrCapture = typeof payload === 'object' && !!payload.ocr;
  // The overlay was showing in region mode; the editor is already hidden and the
  // visibility flag captured by startCapture(). Hand off to the chosen mode while
  // preserving that flag.
  hideOverlay();
  aiCandidates = []; // immediate modes never auto-paste
  pendingAiTargets = null;

  if (mode === 'fullscreen') {
    try {
      const cap = await pendingCapture;
      pendingCapture = null;
      if (cap && cap.image) {
        const s = cap.image.getSize();
        dispatchCapture(cap.image.toDataURL(), s.width, s.height);
        return;
      }
    } catch (err) { /* fall through to a fresh grab */ }
    captureFullScreen(true);
  } else if (mode === 'window') {
    pendingCapture = null;
    captureWindow(true);
  }
});

ipcMain.on('cancel-selection', () => {
  hideOverlay();
  pendingCapture = null;
  pendingOcrCapture = false;
  aiCandidates = [];
  pendingAiTargets = null;
  if (editorVisibleBeforeCapture) showEditor();
});

// Overlay → main: the overlay needs the captured frame's pixels — it paints
// them as the frozen backdrop of every capture session (and the magnifier
// samples them). The frame is the SAME image the final crop comes from
// (pendingCapture), so what the overlay shows is exactly what will be captured.
// Raw toBitmap (BGRA) — no PNG encode, which would cost ~0.8s at 4K. Kept
// pull-based so delivery is naturally gated on the overlay actually being
// revealed, with the session counter guarding against stale grabs.
ipcMain.on('overlay-request-frame', () => {
  if (overlayFrameJob === captureSession) return; // already queued for this capture
  const session = captureSession;
  const p = pendingCapture;
  if (!p || !overlayVisible) return;
  overlayFrameJob = session;
  p.then((cap) => {
    // Stale by the time the grab resolved (cancelled / new session / overlay gone)
    if (!cap || !cap.image) return;
    if (session !== captureSession || !overlayVisible) return;
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const size = cap.image.getSize();
    overlayWindow.webContents.send('overlay-frame', {
      buffer: cap.image.toBitmap(),   // raw BGRA at physical resolution
      width:  size.width,
      height: size.height,
    });
  }).catch(() => { /* grab failed — the capture itself will surface the error */ });
});

ipcMain.handle('trigger-capture', async () => { await startCapture(); });
ipcMain.handle('trigger-capture-ocr', async () => { await startCaptureOcr(); });
ipcMain.handle('file:open-image', () => openImageFromFile());

// ─── Export IPC ──────────────────────────────────────────────────────────────
// Shared save logic — used by the editor's Save button and the pin's Save icon.
async function saveDataUrlToFile(dataUrl, format = 'png', parentWin = null) {
  const fmt = format === 'jpg' ? 'jpg' : format === 'webp' ? 'webp' : 'png';
  const folder = settings.getSettings().exportFolder;
  const result = await dialog.showSaveDialog(parentWin || undefined, {
    title: 'Save Screenshot',
    defaultPath: path.join(folder, `Lumshot_${Date.now()}.${fmt}`),
    filters: fmt === 'jpg'
      ? [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }]
      : fmt === 'webp'
      ? [{ name: 'WebP Image', extensions: ['webp'] }]
      : [{ name: 'PNG Image', extensions: ['png'] }],
  });

  if (!result.canceled && result.filePath) {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
    return true;
  }
  return false;
}

ipcMain.on('copy-to-clipboard', (event, dataUrl) => {
  // Free tier exports include a watermark (applied in the renderer); no blocking.
  clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
  updatePin(dataUrl); // mirror the beautified result into the pin
});

ipcMain.handle('save-image', async (event, dataUrl, format = 'png') => {
  updatePin(dataUrl); // the exported image is the latest result regardless of dialog outcome
  return saveDataUrlToFile(dataUrl, format, editorWindow);
});

// OCR "Create Note" → write the (possibly edited) extracted text to a .txt file.
ipcMain.handle('notes:save-text', async (event, text) => {
  const folder = settings.getSettings().exportFolder;
  const result = await dialog.showSaveDialog(editorWindow || undefined, {
    title: 'Save Note',
    defaultPath: path.join(folder, `Lumshot_Note_${Date.now()}.txt`),
    filters: [{ name: 'Text File', extensions: ['txt'] }],
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, text != null ? String(text) : '', 'utf8');
    return true;
  }
  return false;
});

// ─── Save As IPC ─────────────────────────────────────────────────────────────
// Two-step: renderer asks main to show the dialog (step 1), gets back the chosen
// path, encodes the canvas in the right format, then asks main to write the bytes
// (step 2). Splitting it keeps all canvas/encoding work in the renderer.
ipcMain.handle('save-image-as:pick', async () => {
  const folder = settings.getSettings().exportFolder;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const result = await dialog.showSaveDialog(editorWindow || undefined, {
    title: 'Export screenshot',
    defaultPath: path.join(folder, `screenshot-${stamp}`),
    filters: [
      { name: 'PNG Image (*.png)',  extensions: ['png'] },
      { name: 'JPEG Image (*.jpg)', extensions: ['jpg'] },
      { name: 'WebP Image (*.webp)', extensions: ['webp'] },
      { name: 'All Files',          extensions: ['*'] },
    ],
  });
  return { canceled: result.canceled, filePath: result.filePath || null };
});

ipcMain.handle('save-image-as:write', (_event, dataUrl, filePath) => {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    const base64 = dataUrl.replace(/^data:image\/[\w+]+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    const dir = path.dirname(filePath);
    const newSettings = settings.setSetting('exportFolder', dir);
    broadcastSettings(newSettings);
    return true;
  } catch (err) {
    console.error('save-image-as:write error:', err);
    return false;
  }
});

// ─── Canvas drag-out (native OS drag-and-drop of the rendered image) ──────────
// Lets the user grab the composed screenshot straight off the editor canvas (or
// the floating drag handle) and drop it into any app that accepts an image file
// — Slack, Discord, Gmail, Explorer, Photoshop, Figma, Word, … The renderer hands
// us a full-resolution PNG data URL (PNG so quality + transparency are preserved);
// we write it to a real temp file and feed that file to the OS drag loop. The drag
// must be initiated here in the main process — startDrag is a webContents method —
// and the file has to exist on disk before the loop starts, so we write it
// synchronously. The icon is required (an empty one throws), so we hand startDrag a
// downscaled thumbnail of the same image as the cursor preview.
const DRAG_TMP_PREFIX = 'Lumshot-drag-';

function makeDragIcon(image) {
  const { width, height } = image.getSize();
  if (!width || !height) return image;
  const MAX = 220; // cap the longest side so the cursor preview stays a sane size
  const scale = Math.min(1, MAX / Math.max(width, height));
  if (scale >= 1) return image;
  return image.resize({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    quality: 'good',
  });
}

// Remove drag temp files from previous runs. The dropped file must outlive the
// drag (the target reads it asynchronously), so we never delete it inline — we
// sweep stale ones at startup instead. Best-effort; ignore anything in use.
function cleanupDragTempFiles() {
  try {
    const dir = app.getPath('temp');
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(DRAG_TMP_PREFIX)) {
        try { fs.unlinkSync(path.join(dir, name)); } catch (e) {}
      }
    }
  } catch (e) {}
}

ipcMain.on('canvas:drag-out', (event, dataUrl) => {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) return;

    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const filePath = path.join(app.getPath('temp'), `${DRAG_TMP_PREFIX}${stamp}.png`);
    const base64 = dataUrl.replace(/^data:image\/[\w+]+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

    updatePin(dataUrl); // the dragged image is the latest result — mirror it into the pin

    event.sender.startDrag({ file: filePath, icon: makeDragIcon(image) });
  } catch (err) {
    console.error('canvas:drag-out error:', err);
  }
});

// ─── Pin to Screen IPC ────────────────────────────────────────────────────────
ipcMain.on('pin:edit', () => {
  showEditor();
  // Only (re)load the pin image if the editor isn't already holding this capture
  // — avoids clobbering live edits in Scenario 1.
  if (!editorHasImage && pinImage) loadIntoEditor(pinImage);
});

ipcMain.on('pin:copy', () => {
  if (pinImage) clipboard.writeImage(nativeImage.createFromDataURL(pinImage));
});

ipcMain.on('pin:save', async () => {
  if (pinImage) await saveDataUrlToFile(pinImage, 'png', pinWindow);
});

ipcMain.on('pin:close', () => {
  if (pinDragTimer) { clearInterval(pinDragTimer); pinDragTimer = null; }
  if (pinWindow && !pinWindow.isDestroyed()) pinWindow.destroy();
  pinWindow = null;
});

// Custom window dragging for the pin. The pin card is intentionally no-drag (a
// Windows -webkit-app-region:drag region is hit-tested by the OS as the title bar,
// so the renderer gets no hover events over it — which broke the hover-to-reveal
// overlay), so we move the window ourselves: on mouse-down the renderer asks us to
// follow the cursor, keeping a fixed grab offset, until it reports mouse-up.
ipcMain.on('pin:drag-start', () => {
  if (!pinWindow || pinWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = pinWindow.getPosition();
  const [ww, wh] = pinWindow.getSize();   // capture the size ONCE, re-assert it every frame
  const off = { x: cursor.x - wx, y: cursor.y - wy };
  if (pinDragTimer) clearInterval(pinDragTimer);
  pinDragTimer = setInterval(() => {
    if (!pinWindow || pinWindow.isDestroyed()) { clearInterval(pinDragTimer); pinDragTimer = null; return; }
    const p = screen.getCursorScreenPoint();
    // Use setBounds with the original width/height (not setPosition): on Windows a
    // transparent, frameless window repositioned at fractional display scaling lets
    // its physical size creep upward each call (the layered-window HiDPI bug), which
    // made the pin appear to zoom while dragging. Pinning width/height every frame
    // keeps it a pure move — no scaling, ever.
    pinWindow.setBounds({ x: p.x - off.x, y: p.y - off.y, width: ww, height: wh });
  }, 16);
});
ipcMain.on('pin:drag-end', () => {
  if (pinDragTimer) { clearInterval(pinDragTimer); pinDragTimer = null; }
});

// ─── Theme ───────────────────────────────────────────────────────────────────
// Resolves the stored preference ('system'|'light'|'dark') to the actual
// rendered theme ('dark'|'light') by consulting nativeTheme when pref='system'.
function getEffectiveTheme() {
  const pref = settings.getSettings().theme || 'system';
  if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return pref;
}

// Push the resolved theme to every open window.
function broadcastTheme() {
  const t = getEffectiveTheme();
  for (const w of [editorWindow, windowPickerWindow]) {
    if (w && !w.isDestroyed()) {
      w.webContents.send('theme:apply', t);
      // Keep the native backing colour matched to the page background so
      // resize gutters and pre-paint frames never flash the old theme.
      w.setBackgroundColor(EDITOR_BG[t] || EDITOR_BG.dark);
    }
  }
}

ipcMain.handle('theme:get', () => {
  // Single source of truth: resolve through the same helper the menu radio
  // and broadcastTheme() use, so the saved value drives the radio checkmark
  // and the rendered theme identically at startup.
  try {
    return getEffectiveTheme();
  } catch {
    return 'dark';
  }
});

// ─── Custom title-bar window controls ───────────────────────────────────────
ipcMain.on('window:minimize', () => {
  if (editorWindow && !editorWindow.isDestroyed()) editorWindow.minimize();
});
ipcMain.on('window:maximize', () => {
  if (!editorWindow || editorWindow.isDestroyed()) return;
  editorWindow.isMaximized() ? editorWindow.unmaximize() : editorWindow.maximize();
});
ipcMain.on('window:close', () => {
  if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close(); // triggers close-to-tray logic
});
// The renderer closed its last tab: the editor document is now empty, so mark it
// stale (a later pin "Edit" will reload the latest capture) and close the window
// to the tray. The next capture/open starts a fresh single-tab document.
ipcMain.on('editor:close-all-tabs', () => {
  editorHasImage = false;
  if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close();
});
// Let the renderer know which platform it's on so it can hide the custom
// title-bar menu buttons where the native system menu bar takes over.
ipcMain.handle('get-platform', () => process.platform);

// Plain-text clipboard read (used by OCR Mode's edit-a-line paste, since the
// Edit menu's Ctrl+V accelerator consumes the key before the contentEditable
// element can paste natively).
ipcMain.handle('clipboard:read-text', () => clipboard.readText());

// The custom HTML menu IPC is Windows-only; macOS/Linux use native menus.
if (IS_WINDOWS) {
  // Hand the renderer the live menu structure to draw itself.
  ipcMain.handle('titlebar:get-menu', () => (appMenu ? serializeMenu(appMenu) : []));

  // Run the action for a clicked item (same closure the native accelerator would
  // fire). State-changing items (Theme, Always on Top) call rebuildMenu(), which
  // notifies the renderer to re-render any open menu.
  ipcMain.on('titlebar:menu-action', (event, id) => {
    const fn = menuActions[id];
    if (fn) fn();
  });
}

// ─── Licensing IPC ──────────────────────────────────────────────────────────
ipcMain.handle('license:get-status', () => license.getStatus());

ipcMain.handle('license:activate', async (event, key) => {
  const result = await license.activate(key);
  if (result.ok) {
    updateTrayMenu();
    broadcastLicense();
  }
  return { ...result, status: license.getStatus() };
});

ipcMain.handle('license:deactivate', async () => {
  const result = await license.deactivate();
  if (result.ok) {
    updateTrayMenu();
    broadcastLicense();
  }
  return { ...result, status: license.getStatus() };
});

// Push the current license status to all windows (e.g. after activation)
function broadcastLicense() {
  const status = license.getStatus();
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.webContents.send('license-updated', status);
  }
}

ipcMain.on('license:open-buy', () => shell.openExternal(POLAR_CHECKOUT_URL));

// ─── Settings IPC ────────────────────────────────────────────────────────────
function broadcastSettings(s) {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.webContents.send('settings-updated', s);
  }
}

ipcMain.handle('settings:get', () => settings.getSettings());

ipcMain.handle('settings:set', (event, key, value) => {
  const s = settings.setSetting(key, value);
  // args: launched-at-login should start silently in the tray, not pop the
  // editor open — see LAUNCHED_SILENTLY.
  if (key === 'launchAtStartup') app.setLoginItemSettings({ openAtLogin: !!value, args: ['--hidden'] });
  // Enabled toggle (or a whole-object write) may change hotkey registration.
  if (key === 'captureToAI') registerAiHotkey();
  if (key === 'theme') {
    // Drive native chrome appearance and push the resolved theme to every
    // window so the switch is instant. broadcastTheme() resolves 'system'
    // through nativeTheme just like startup does.
    nativeTheme.themeSource = value || 'system';
    broadcastTheme();
  }
  broadcastSettings(s);
  return s;
});

ipcMain.handle('settings:pick-folder', async () => {
  const win = editorWindow;
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: settings.getSettings().exportFolder,
  });
  if (!res.canceled && res.filePaths[0]) {
    const s = settings.setSetting('exportFolder', res.filePaths[0]);
    broadcastSettings(s);
    return s;
  }
  return settings.getSettings();
});

// Try to register a new hotkey. Returns whether the requested one took, plus
// whatever ended up active (it may fall back if the request was already taken).
ipcMain.handle('settings:set-hotkey', (event, accel) => {
  const active = registerHotkey(accel);
  // Persist the requested accelerator — never the fallback. Saving the fallback
  // would silently overwrite the user's choice (e.g. turn a requested Ctrl+Shift+S
  // into whatever registered when it was momentarily unavailable).
  if (active) settings.setSetting('hotkey', accel);
  // The main hotkey may have moved onto (or off) the AI hotkey's key — re-assert
  // the AI registration so the conflict state stays truthful.
  registerAiHotkey();
  const s = settings.getSettings();
  broadcastSettings(s);
  return { ok: active === accel, active, display: displayAccel(active), settings: s };
});

// Capture-to-AI hotkey. No fallback registration (see registerAiHotkey); the
// result carries ok/unavailable so the settings UI can show "hotkey unavailable".
ipcMain.handle('settings:set-ai-hotkey', (event, accel) => {
  const cur = settings.getSettings().captureToAI;
  settings.setSetting('captureToAI', { ...cur, hotkey: accel });
  registerAiHotkey();
  const s = settings.getSettings();
  broadcastSettings(s);
  return { ok: !!activeAiShortcut, unavailable: aiHotkeyUnavailable, display: displayAccel(accel), settings: s };
});

// Settings UI: current AI-hotkey registration state (e.g. a conflict at startup).
ipcMain.handle('settings:ai-hotkey-status', () => ({
  unavailable: aiHotkeyUnavailable,
  active: displayAccel(activeAiShortcut),
}));

// ─── App info / shortcuts persistence (Shortcuts + About panels) ───────────────
ipcMain.handle('app:get-info', () => {
  const os = require('os');
  return {
    version:  version,
    electron: process.versions.electron,
    node:     process.versions.node,
    chrome:   process.versions.chrome,
    platform: process.platform,
    osRelease: os.release(),
    arch:     process.arch,
  };
});

// Custom keyboard shortcuts live under a top-level `shortcuts` store key.
ipcMain.handle('shortcuts:get', () => getStore().get('shortcuts') || {});
ipcMain.handle('shortcuts:set', (event, map) => {
  getStore().set('shortcuts', map && typeof map === 'object' ? map : {});
  return getStore().get('shortcuts') || {};
});

// Open an external URL in the default browser (About panel links).
ipcMain.handle('app:open-external', (event, url) => {
  if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
});

// Settings ▸ About: "Check for updates" button — same check the Help menu
// triggers, just reachable from the page. Dev builds are a no-op (nothing to
// check against), so the renderer's "up to date" toast is shown regardless.
ipcMain.handle('app:check-updates', () => {
  if (app.isPackaged) {
    require('electron-updater').autoUpdater.checkForUpdatesAndNotify().catch(console.error);
  }
  return { ok: true };
});

// In-app update-ready toast → "Install Now": restart and apply immediately.
ipcMain.on('update:install', () => {
  if (updateReady) { isQuitting = true; require('electron-updater').autoUpdater.quitAndInstall(); }
});

// Renderer reports undo/redo stack availability so the Edit menu can gray items.
ipcMain.on('undo-redo-state', (_, { canUndo, canRedo }) => {
  if (!appMenu) return;
  const editMenu = appMenu.items.find(i => i.label === 'Edit');
  if (!editMenu) return;
  const items = editMenu.submenu.items;
  const undoItem = items.find(i => i.label === 'Undo');
  const redoItem = items.find(i => i.label === 'Redo');
  if (undoItem) undoItem.enabled = canUndo;
  if (redoItem) redoItem.enabled = canRedo;
});

// Load an image from the clipboard into the editor (customizable shortcut).
ipcMain.handle('clipboard:open', () => openFromClipboard());

// ─── Hotkey registration ──────────────────────────────────────────────────────
function displayAccel(accel) {
  return accel ? accel.replace('CommandOrControl', 'Ctrl') : null;
}

function registerHotkey(preferred) {
  if (activeShortcut) {
    try { globalShortcut.unregister(activeShortcut); } catch (e) { /* ignore */ }
    activeShortcut = null;
  }
  // Try the requested key first, then fall back to common alternatives.
  const candidates = [preferred, 'CommandOrControl+Shift+S', 'CommandOrControl+Alt+S']
    .filter(Boolean);
  for (const sc of candidates) {
    try { if (globalShortcut.register(sc, startCapture)) { activeShortcut = sc; break; } }
    catch (e) { /* invalid accelerator — skip */ }
  }
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.webContents.send('shortcut-info', displayAccel(activeShortcut));
  }
  return activeShortcut;
}

// "Capture to AI" hotkey. Unlike registerHotkey() there are NO fallback
// candidates: on conflict we log, leave the feature dormant and surface it in
// settings ("hotkey unavailable") — silently landing on a different key would
// make auto-paste fire from a shortcut the user never chose.
function registerAiHotkey() {
  if (activeAiShortcut) {
    try { globalShortcut.unregister(activeAiShortcut); } catch (e) { /* ignore */ }
    activeAiShortcut = null;
  }
  aiHotkeyUnavailable = false;
  const ai = settings.getSettings().captureToAI;
  if (!ai.enabled || !aiPaste.isSupported()) return;
  // Never fight our own capture shortcut for the key.
  if (ai.hotkey !== activeShortcut) {
    try { if (globalShortcut.register(ai.hotkey, startCaptureToAI)) activeAiShortcut = ai.hotkey; }
    catch (e) { /* invalid accelerator — falls through to unavailable */ }
  }
  if (!activeAiShortcut) {
    aiHotkeyUnavailable = true;
    console.error('Capture to AI hotkey unavailable:', ai.hotkey);
  }
}

// ─── Application menu ─────────────────────────────────────────────────────────
// Applied only to the editor window (not settings) so Ctrl+C, Ctrl+V, etc.
// are not intercepted in text-entry contexts like the license/hotkey fields.

// Apply the current appMenu the way each platform expects:
// - Windows: per-window menu so accelerators fire, but the bar is hidden — the
//   renderer draws custom HTML dropdowns instead.
// - macOS:   global application menu (top-of-screen system menu bar).
// - Linux:   application menu, shown as the window's native menu bar.
function applyAppMenu() {
  if (IS_WINDOWS) {
    if (editorWindow && !editorWindow.isDestroyed()) {
      editorWindow.setMenu(appMenu);
      editorWindow.setMenuBarVisibility(false);
    }
  } else {
    Menu.setApplicationMenu(appMenu);
  }
}

function rebuildMenu() {
  appMenu = buildAppMenu();
  applyAppMenu();
  if (editorWindow && !editorWindow.isDestroyed()) {
    // Tell the renderer the menu data changed so any open custom dropdown
    // re-renders with the new state (Theme radio, Always-on-Top checkbox).
    // (No-op on macOS/Linux, where no HTML dropdown is ever open.)
    editorWindow.webContents.send('menu:changed');
  }
}

function buildAppMenu() {
  const send = (ch, ...args) => {
    if (editorWindow && !editorWindow.isDestroyed()) editorWindow.webContents.send(ch, ...args);
  };
  const alwaysOnTop = !!settings.getSettings().alwaysOnTop;
  const themePref = settings.getSettings().theme || 'system';
  const bgEnabled = settings.getSettings().backgroundEnabled !== false;
  // Persist + apply a theme preference from the View > Theme menu, mirroring
  // the live-apply path in the 'settings:set' handler.
  const setTheme = (value) => {
    settings.setSetting('theme', value);
    nativeTheme.themeSource = value;
    broadcastTheme();
    broadcastSettings(settings.getSettings());
    rebuildMenu();
  };

  const template = [
    // ── Lumshot (macOS app menu) ────────────────────────────────────────────────
    // macOS only: the standard bold app menu before File. Spreads to nothing on
    // Windows/Linux, so File stays the first menu there. Labels use the literal
    // "Lumshot" (app.name is the lowercase npm package name). The role: items get
    // their conventional macOS behaviour and accelerators automatically.
    ...(IS_MAC ? [{
      label: 'Lumshot',
      submenu: [
        { label: 'About Lumshot',  role: 'about' },
        { type: 'separator' },
        { label: 'Settings',   accelerator: 'CmdOrCtrl+,',   click: () => openSettings('general') },
        { type: 'separator' },
        { label: 'Hide Lumshot',   accelerator: 'Command+H',     role: 'hide' },
        { label: 'Hide Others',    accelerator: 'Command+Alt+H', role: 'hideOthers' },
        { label: 'Show All',       role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Lumshot',   accelerator: 'Command+Q',     role: 'quit' },
      ],
    }] : []),
    // ── File ──────────────────────────────────────────────────────────────────
    {
      label: 'File',
      submenu: [
        { id: 'file.open',          label: 'Open Image…',             accelerator: 'CmdOrCtrl+O', click: () => openImageFromFile() },
        { id: 'file.openClipboard', label: 'Paste Image',     click: () => openFromClipboard() },
        { type: 'separator' },
        { id: 'file.save',          label: 'Save',                    accelerator: 'CmdOrCtrl+S',       click: () => send('trigger-save') },
        { id: 'file.saveAs',        label: 'Save As…',               click: () => send('trigger-save-as') },
        { id: 'file.copy',          label: 'Copy to Clipboard', click: () => send('trigger-copy') },
        { type: 'separator' },
        { id: 'file.close',         label: 'Close Window', click: () => { if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close(); } },
      ],
    },
    // ── Edit ──────────────────────────────────────────────────────────────────
    {
      label: 'Edit',
      submenu: [
        { id: 'edit.undo',      label: 'Undo',                      accelerator: 'CmdOrCtrl+Z', click: () => send('trigger-undo') },
        { id: 'edit.redo',      label: 'Redo',                      accelerator: 'CmdOrCtrl+Y', click: () => send('trigger-redo') },
        { type: 'separator' },
        { id: 'edit.cut',       label: 'Cut',                        accelerator: 'CmdOrCtrl+X', click: () => send('trigger-ann-cut') },
        { id: 'edit.copy',      label: 'Copy',                       accelerator: 'CmdOrCtrl+C', click: () => send('trigger-ann-copy') },
        { id: 'edit.paste',     label: 'Paste',                      accelerator: 'CmdOrCtrl+V', click: () => send('trigger-ann-paste') },
        { type: 'separator' },
        { id: 'edit.selectAll', label: 'Select All Annotations',     accelerator: 'CmdOrCtrl+A', click: () => send('trigger-ann-select-all') },
        { type: 'separator' },
        { id: 'edit.delete',    label: 'Delete',                                                  click: () => send('trigger-delete') },
        { id: 'edit.clearAll',  label: 'Clear All Annotations',  accelerator: 'CmdOrCtrl+Delete', click: () => send('trigger-clear-all') },
      ],
    },
    // ── Capture ───────────────────────────────────────────────────────────────
    {
      label: 'Capture',
      submenu: [
        { id: 'cap.region',     label: 'Capture Region',          accelerator: 'CmdOrCtrl+Shift+S', click: () => startCapture() },
        { id: 'cap.window',     label: 'Capture Window',      accelerator: 'CmdOrCtrl+Shift+W',         click: () => captureWindow() },
        { id: 'cap.fullscreen', label: 'Capture Full Screen', accelerator: 'CmdOrCtrl+Shift+F',         click: () => captureFullScreen() },
        { id: 'cap.scroll',     label: 'Capture Scroll',                                              click: () => startCaptureScroll() },
        // Global hotkey handled via registerAiHotkey (configurable, so no static
        // accelerator here — it would go stale and double-register the key).
        { id: 'cap.ai',         label: 'Capture to AI',                                               click: () => startCaptureToAI() },
        { type: 'separator' },
        { id: 'cap.ocr',        label: 'Capture in OCR Mode',                                         click: () => startCaptureOcr() },
        { type: 'separator' },
        { id: 'cap.history',    label: 'Capture History…',       accelerator: 'CmdOrCtrl+H',         click: () => send('trigger-history') },
      ],
    },
    // ── Tools ─────────────────────────────────────────────────────────────────
    {
      label: 'Tools',
      submenu: [
        // Single-key shortcuts are handled in the renderer; accelerator is display-only.
        { id: 'tool.select',    label: 'Selection Tool', accelerator: 'V', registerAccelerator: false, click: () => send('trigger-tool', 'select') },
        { id: 'tool.arrow',     label: 'Arrow Tool',     accelerator: 'A', registerAccelerator: false, click: () => send('trigger-tool', 'arrow') },
        { id: 'tool.text',      label: 'Text Tool',      accelerator: 'T', registerAccelerator: false, click: () => send('trigger-tool', 'text') },
        { id: 'tool.blur',      label: 'Blur / Redact',  accelerator: 'B', registerAccelerator: false, click: () => send('trigger-tool', 'blur') },
        { id: 'tool.highlight', label: 'Highlight',      accelerator: 'H', registerAccelerator: false, click: () => send('trigger-tool', 'highlight') },
        { id: 'tool.crop',      label: 'Crop',           accelerator: 'X', registerAccelerator: false, click: () => send('trigger-tool', 'crop') },
        {
          label: 'Shapes',
          submenu: [
            { id: 'tool.rect',    label: 'Rectangle', accelerator: 'R', registerAccelerator: false, click: () => send('trigger-tool', 'rect') },
            { id: 'tool.ellipse', label: 'Circle',    accelerator: 'C', registerAccelerator: false, click: () => send('trigger-tool', 'ellipse') },
            { id: 'tool.line',    label: 'Line',      accelerator: 'L', registerAccelerator: false, click: () => send('trigger-tool', 'line') },
          ],
        },
        { id: 'tool.counter',   label: 'Step Counter',   accelerator: 'N', registerAccelerator: false, click: () => send('trigger-tool', 'counter') },
        { type: 'separator' },
        // Single-key/modifier shortcut handled in the renderer; accelerator is display-only.
        { id: 'tool.ocr',       label: 'Toggle OCR Mode', accelerator: 'CmdOrCtrl+Shift+O', registerAccelerator: false, click: () => send('trigger-ocr-toggle') },
      ],
    },
    // ── View ──────────────────────────────────────────────────────────────────
    {
      label: 'View',
      submenu: [
        {
          id: 'view.alwaysOnTop', label: 'Always on Top', type: 'checkbox', checked: alwaysOnTop, accelerator: 'CmdOrCtrl+Alt+T',
          click: () => {
            const on = !alwaysOnTop;
            settings.setSetting('alwaysOnTop', on);
            if (editorWindow && !editorWindow.isDestroyed()) editorWindow.setAlwaysOnTop(on);
            rebuildMenu();
          },
        },
        // Screenshot background/beautify treatment — lives here (not the top bar)
        // so the bar stays lean. Persisted like Always on Top; the renderer picks
        // the change up from the settings broadcast.
        {
          id: 'view.background', label: 'Screenshot Background', type: 'checkbox', checked: bgEnabled,
          click: () => {
            broadcastSettings(settings.setSetting('backgroundEnabled', !bgEnabled));
            rebuildMenu();
          },
        },
        { type: 'separator' },
        { id: 'view.zoomIn',  label: 'Zoom In',                 accelerator: 'CmdOrCtrl+Equal', click: () => send('trigger-zoom', 'in') },
        { id: 'view.zoomOut', label: 'Zoom Out',                accelerator: 'CmdOrCtrl+-',     click: () => send('trigger-zoom', 'out') },
        { id: 'view.zoom100', label: 'Zoom to 100%',            accelerator: 'CmdOrCtrl+0',     click: () => send('trigger-zoom', '100') },
        { id: 'view.zoomFit', label: 'Zoom to Fit',             accelerator: 'CmdOrCtrl+1',     click: () => send('trigger-zoom', 'fit') },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: [
            { id: 'view.theme.light',  label: 'Light',  type: 'radio', checked: themePref === 'light',  click: () => setTheme('light') },
            { id: 'view.theme.dark',   label: 'Dark',   type: 'radio', checked: themePref === 'dark',   click: () => setTheme('dark') },
            { id: 'view.theme.system', label: 'System', type: 'radio', checked: themePref === 'system', click: () => setTheme('system') },
          ],
        },
      ],
    },
    { type: 'separator' },
    // ── Settings (top-level) ────────────────────────────────────────────────────
    { id: 'app.settings', label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => openSettings('general') },
    // ── Help ──────────────────────────────────────────────────────────────────
    {
      label: 'Help',
      submenu: [
        { id: 'help.docs',    label: 'Lumshot Documentation',          click: () => shell.openExternal('https://lumshot.app/docs') },
        { id: 'help.support', label: 'Support', click: () => shell.openExternal('https://lumshot.app/support') },
        { type: 'separator' },
        {
          id: 'help.updates', label: 'Check for Updates…',
          click: () => {
            if (!app.isPackaged) return;
            require('electron-updater').autoUpdater.checkForUpdatesAndNotify().catch(console.error);
          },
        },
        { id: 'help.license', label: 'Manage License…',                click: () => openSettings('license') },
      ],
    },
    { type: 'separator' },
    // ── Exit (top-level) ─────────────────────────────────────────────────────────
    { id: 'app.exit', label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } },
  ];

  // Collect id → click handlers so the custom HTML menu (renderer) can dispatch
  // the exact same action a native click/accelerator would run.
  menuActions = {};
  (function walk(items) {
    for (const it of items) {
      if (it.id && it.click) menuActions[it.id] = it.click;
      if (it.submenu) walk(it.submenu);
    }
  })(template);

  return Menu.buildFromTemplate(template);
}

// ── Custom HTML menu support ──────────────────────────────────────────────────
// The renderer draws its own dropdowns (no native chevron gutter), so we expose
// the live menu as plain data and run actions by id. Accelerators still register
// through the native menu set on the window, so keyboard shortcuts are unaffected.
function formatAccel(accel) {
  if (!accel) return '';
  return accel.split('+').map((t) => {
    switch (t) {
      case 'CmdOrCtrl':
      case 'CommandOrControl': return 'Ctrl';
      case 'Equal': return '=';
      case 'Minus': return '-';
      default: return t;
    }
  }).join('+');
}

// Serialize a built Menu into a structure the renderer can render. Reads the live
// MenuItem objects so dynamic state (Undo/Redo enabled, Theme radio, checkbox) is
// always current at the moment the menu is opened.
function serializeMenu(menu) {
  return menu.items.map((it) => {
    if (it.type === 'separator') return { type: 'separator' };
    const o = {
      id: it.id || null,
      label: it.label,
      type: it.submenu ? 'submenu' : (it.type || 'normal'),
      accelerator: formatAccel(it.accelerator),
      enabled: it.enabled !== false,
    };
    if (it.type === 'radio' || it.type === 'checkbox') o.checked = !!it.checked;
    if (it.submenu) o.submenu = serializeMenu(it.submenu);
    return o;
  });
}

// ─── Window capture ──────────────────────────────────────────────────────────
async function captureWindow(preserveFlag = false) {
  if (windowPickerWindow && !windowPickerWindow.isDestroyed()) {
    windowPickerWindow.focus();
    return;
  }

  if (!preserveFlag) {
    editorVisibleBeforeCapture = !!(editorWindow && !editorWindow.isDestroyed() && editorWindow.isVisible());
  }

  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 280, height: 180 },
    });
  } catch (err) {
    console.error('captureWindow: getSources failed:', err);
    return;
  }

  windowPickerWindow = new BrowserWindow({
    width: 680,
    height: 520,
    frame: true,
    resizable: false,
    title: 'Select a Window',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: editorBgColor(),
    parent: editorWindow || undefined,
    modal: false,
    webPreferences: BASE_WEB_PREFERENCES,
  });
  windowPickerWindow.setMenuBarVisibility(false);
  windowPickerWindow.loadFile('windowPicker.html');

  windowPickerWindow.webContents.once('did-finish-load', () => {
    if (!windowPickerWindow || windowPickerWindow.isDestroyed()) return;
    windowPickerWindow.webContents.send('window-sources', sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    })));
  });

  function cleanup() {
    ipcMain.off('window-source-selected', onSelected);
    ipcMain.off('window-source-cancel', onCancel);
  }

  const onSelected = async (_, sourceId) => {
    cleanup();
    if (windowPickerWindow && !windowPickerWindow.isDestroyed()) windowPickerWindow.close();
    windowPickerWindow = null;
    try {
      const fullSources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 3840, height: 2160 },
      });
      const src = fullSources.find(s => s.id === sourceId);
      if (src) {
        const size = src.thumbnail.getSize();
        dispatchCapture(src.thumbnail.toDataURL(), size.width, size.height);
      }
    } catch (err) {
      console.error('captureWindow: full-res capture failed:', err);
    }
  };

  const onCancel = () => {
    cleanup();
    if (windowPickerWindow && !windowPickerWindow.isDestroyed()) windowPickerWindow.close();
    windowPickerWindow = null;
  };

  ipcMain.on('window-source-selected', onSelected);
  ipcMain.on('window-source-cancel', onCancel);
  windowPickerWindow.on('closed', () => { cleanup(); windowPickerWindow = null; });
}

// ─── Scroll capture (auto-scroll long-page stitching) ──────────────────────────
// The overlay hides, a control bar + live preview pin appear, and we drive the
// page automatically: scroll a chunk → settle → grab the region → stitch the
// newly-revealed rows. Scrolling is calibrated (pixels-per-notch is learned) and
// stops automatically when the content can no longer scroll (smart end detection).
// Wheel events are sent via a tiny persistent PowerShell helper (no native deps).
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function startScrollCapture(rect) {
  const display = screen.getPrimaryDisplay();
  const sf = display.scaleFactor || 1;
  scrollSession = {
    rect,                            // DIP rect of the scrolling viewport
    sf,
    phys: {                          // physical-pixel rect (for grab + cursor)
      x: Math.round(rect.x * sf), y: Math.round(rect.y * sf),
      w: Math.round(rect.w * sf), h: Math.round(rect.h * sf),
    },
    canvas: null,                    // BGRA buffer of the stitched image (grows down)
    width: 0,                        // physical px width of the region
    height: 0,                       // physical px height of one captured frame
    totalHeight: 0,                  // physical px height accumulated so far
    lastFrame: null,                 // previous frame's BGRA buffer (offset detection)
    frames: 0,
    pxPerNotch: null,                // learned scroll distance per wheel notch
    noMoveCount: 0,                  // consecutive frames with no scroll → bottom
    lastPreviewAt: 0,
    stickyTop: 0,                    // px of a non-scrolling sticky header (excluded from alignment)
    stickyBottom: 0,                 // reserved (always 0 — sticky footers handled by offset detection)
    stickyLocked: false,             // sticky header confirmed (needs 2 consistent reads)
    stickyProbe: null,               // first sticky measurement, awaiting confirmation
    maxFrames: 600,                  // safety caps
    maxHeight: 200000,
    aborted: false,
    finishing: false,
    ps: null,                        // PowerShell input helper
  };
  openScrollWindow();
  ensureScrollPreviewPin();
  runScrollSession();
}

// Spawn the persistent PowerShell input helper and resolve true once it prints
// READY, or false if it fails to spawn, errors, exits early, or never reports
// READY within the timeout (a slow Add-Type compile shouldn't block forever, but a
// genuine failure must be distinguishable from "just slow" so callers can abort
// instead of silently producing a degenerate 1-frame "scroll capture").
function startScrollHelper() {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    let ps;
    try {
      ps = spawn('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperScriptPath('scrollhelper.ps1')],
        { windowsHide: true });
    } catch (err) {
      console.error('scroll helper spawn failed:', err);
      return resolve(false);
    }
    if (scrollSession) scrollSession.ps = ps;
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    const to = setTimeout(() => finish(false), 4000);
    ps.stdout.on('data', (d) => { if (d.toString().includes('READY')) { clearTimeout(to); finish(true); } });
    ps.stderr.on('data', (d) => console.error('scroll helper stderr:', d.toString().trim()));
    ps.on('error', (err) => { console.error('scroll helper error:', err); clearTimeout(to); finish(false); });
    ps.on('exit', (code) => {
      if (scrollSession && scrollSession.ps === ps) scrollSession.ps = null;
      if (!done) { console.error('scroll helper exited early, code', code); clearTimeout(to); finish(false); }
    });
  });
}

function scrollWrite(cmd) {
  const s = scrollSession;
  if (s && s.ps && s.ps.stdin && s.ps.stdin.writable) {
    try { s.ps.stdin.write(cmd + '\n'); } catch (e) { /* helper gone */ }
  }
}

function stopScrollHelper() {
  const s = scrollSession;
  if (s && s.ps) {
    try { scrollWrite('EXIT'); s.ps.stdin.end(); } catch (e) { /* ignore */ }
    try { s.ps.kill(); } catch (e) { /* ignore */ }
    s.ps = null;
  }
}

async function runScrollSession() {
  const s = scrollSession;
  if (!s) return;

  sendScrollUI({ status: 'Preparing…' });
  const helperReady = await startScrollHelper();
  if (!scrollSession || scrollSession.aborted) return;
  if (!helperReady) {
    // Auto-scroll can't be driven without the input helper — bail instead of
    // silently finalizing a single-frame "stitch" that looks like a plain
    // region capture with no explanation.
    sendScrollUI({ status: 'Scroll capture failed to start — try again', error: true, done: true });
    await delay(1400);
    scrollSession = null;
    endScrollSession();
    if (pinWindow && !pinWindow.isDestroyed()) { pinWindow.destroy(); pinWindow = null; }
    if (editorVisibleBeforeCapture) showEditor();
    return;
  }

  // Park the cursor in the centre of the region so wheel events hit the target
  // window (Windows "scroll inactive windows under pointer" is on by default).
  const cx = s.phys.x + Math.round(s.phys.w / 2);
  const cy = s.phys.y + Math.round(s.phys.h / 2);
  scrollWrite(`MOVE ${cx} ${cy}`);
  await delay(140); // let the overlay finish hiding + cursor settle

  // Seed with the first frame.
  await captureAndStitch(0);
  updateScrollPreview('Capturing…');

  while (scrollSession && !scrollSession.aborted && !scrollSession.finishing) {
    if (s.frames >= s.maxFrames || s.totalHeight >= s.maxHeight) break;

    // How far to scroll each step: ~55% of the SCROLLING band (viewport minus any
    // sticky header/footer). A smaller step keeps ~45% overlap between consecutive
    // frames, giving the offset detector far more content to align against — the
    // more overlap, the more reliable and pixel-accurate the stitch. Converted to
    // wheel notches once we've learned how many px a notch moves.
    const bandH = Math.max(40, s.height - s.stickyTop - s.stickyBottom || s.phys.h);
    const targetPx = Math.max(60, Math.round(bandH * 0.55));
    let notches = s.pxPerNotch && s.pxPerNotch > 0
      ? Math.max(1, Math.round(targetPx / s.pxPerNotch))
      : 3 + s.noMoveCount * 2; // not calibrated yet — nudge harder if nothing moved
    notches = Math.min(notches, 40);

    scrollWrite(`WHEEL ${-120 * notches}`);
    // grabSettledFrame() waits for the page to stop rendering, so a short fixed
    // delay here only needs to cover input→scroll latency, not full re-layout.
    await delay(60);
    if (!scrollSession || scrollSession.aborted || scrollSession.finishing) break;

    const moved = await captureAndStitch(notches);

    // Smart end detection: a few consecutive no-movement frames = bottom reached.
    if (moved <= 1) {
      s.noMoveCount++;
      if (s.noMoveCount >= 3) break;
    } else {
      s.noMoveCount = 0;
    }
    updateScrollPreview('Capturing…');
  }

  if (scrollSession && !scrollSession.aborted) finalizeScroll();
}

// One pixel-exact grab of the scroll region as a BGRA buffer.
//
// Uses the native GDI BitBlt helper (zero resampling — sharp text and, crucially
// for stitching, EXACT integer pixels so a scroll of N physical px lands at an
// integer offset). desktopCapturer is the fallback only; its resampled thumbnail
// can differ from the true framebuffer by ~1px in each axis (verified: 3840×2160
// screen → 3841×2161 thumbnail on a 1.75× display), which turns integer scrolls
// into fractional offsets and is the primary source of sub-pixel seams.
//
// Crop coordinates are derived from the ACTUAL returned image size, not an assumed
// rect×scaleFactor, so a non-integer display scale or a helper/desktopCapturer size
// mismatch can never shift or scale the crop.
async function scrollGrab() {
  const s = scrollSession;
  if (!s) return null;
  let shot;
  try { shot = await grabFullScreenNative(); }
  catch (e) {
    try { shot = await grabFullScreen(); } catch (e2) { return null; }
  }
  if (!scrollSession || !shot || !shot.image) return null;

  const size = shot.image.getSize();
  const disp = screen.getPrimaryDisplay();
  // Map the DIP selection rect onto the actual grabbed image via the true image /
  // DIP ratio (not display.scaleFactor, which can disagree with the real capture).
  const rx = size.width  / disp.size.width;
  const ry = size.height / disp.size.height;
  let x = Math.round(s.rect.x * rx);
  let y = Math.round(s.rect.y * ry);
  let w = Math.round(s.rect.w * rx);
  let h = Math.round(s.rect.h * ry);
  x = Math.max(0, Math.min(x, size.width  - 1));
  y = Math.max(0, Math.min(y, size.height - 1));
  w = Math.max(1, Math.min(w, size.width  - x));
  h = Math.max(1, Math.min(h, size.height - y));
  const bmp = shot.image.crop({ x, y, width: w, height: h }).toBitmap();
  return { bmp, w, h };
}

// Grab the region only once the page has stopped changing, so we never stitch a
// half-rendered frame (lazy images, reflow, scroll-anchored animations). Grabs
// repeatedly until two consecutive grabs are essentially identical (settled) or a
// time budget is spent. Returns the settled frame { bmp, w, h }.
async function grabSettledFrame() {
  const s = scrollSession;
  if (!s) return null;
  let prev = await scrollGrab();
  if (!prev) return null;
  const deadline = Date.now() + 320; // hard cap so a perpetually-animating page still progresses
  while (scrollSession && !scrollSession.aborted && !scrollSession.finishing && Date.now() < deadline) {
    await delay(45);
    const cur = await scrollGrab();
    if (!cur) return prev;
    if (cur.w === prev.w && cur.h === prev.h && framesEqual(prev.bmp, cur.bmp, cur.w, cur.h)) {
      return cur; // two identical grabs in a row → rendering has settled
    }
    prev = cur;
  }
  return prev;
}

// Measure sticky (non-scrolling) bands: rows at the very top / very bottom that are
// pixel-identical between two frames the content scrolled between. Fixed/sticky UI
// (nav bars, cookie bars) must be excluded from alignment + body or it gets matched
// wrong and duplicated down the image.
//
// A single frame pair can't tell a real sticky bar from a solid band that merely
// looked the same across a small scroll (false positive → trims real content). So
// this only reports the bands; the caller (captureAndStitch) requires the SAME band
// to be seen on two consecutive measurements before trusting it, and a hard minimum
// size, which together kill the false positives while still catching real bars.
function measureSticky(prev, cur, w, h) {
  const rowBytes = w * 4;
  const colStep = Math.max(4, Math.floor(w / 96)) * 4;
  const rowSame = (y) => {
    let sum = 0, n = 0;
    const base = y * rowBytes;
    for (let c = 0; c < rowBytes; c += colStep) { const d = cur[base + c] - prev[base + c]; sum += d < 0 ? -d : d; n++; }
    return n ? sum / n < 2 : true;
  };
  // A real sticky bar also has internal detail (it's UI, not a blank margin). Guard
  // against blank page margins by requiring the band to contain some horizontal
  // variation; otherwise a plain white/solid strip at the edge reads as "sticky".
  const rowHasDetail = (y) => {
    let mn = 255, mx = 0; const base = y * rowBytes;
    for (let c = 0; c < rowBytes; c += colStep) { const v = cur[base + c]; if (v < mn) mn = v; if (v > mx) mx = v; }
    return mx - mn > 24;
  };
  // We ONLY special-case a sticky HEADER: it's common (nav bars) and safe to exclude
  // from alignment + keep once at the top. A sticky FOOTER is rare and excising/
  // re-appending it is error-prone, so a normal footer is left to the (full-range,
  // prediction-anchored) offset detector, which handles it correctly.
  const maxBand = Math.floor(h * 0.4); // a sticky band shouldn't exceed 40% of the viewport
  let top = 0; while (top < maxBand && rowSame(top)) top++;
  // A real sticky bar needs a solid minimum height AND internal detail (it's UI, not
  // a blank page margin / solid background strip).
  const MIN = 12;
  let topDetail = false; for (let y = 0; y < top; y++) if (rowHasDetail(y)) { topDetail = true; break; }
  return { stickyTop: (top >= MIN && topDetail) ? top : 0, stickyBottom: 0 };
}

// Grab the region, stitch the newly-revealed rows, learn px-per-notch, and return
// how many pixels the content moved this step (0 = no scroll detected).
async function captureAndStitch(notchesSent) {
  const s = scrollSession;
  if (!s) return 0;

  const frame = await grabSettledFrame();
  if (!scrollSession || !frame) return 0;
  const { bmp, w, h } = frame;
  const rowBytes = w * 4;

  // Seed the canvas with the first frame immediately (full frame). We stitch from
  // frame 2 onward with no gap; the sticky header — if any — is excluded from
  // ALIGNMENT once confirmed, but is never duplicated because appends only add the
  // newly-revealed BOTTOM rows (which never contain the top header band).
  if (!s.canvas) {
    s.canvas = Buffer.from(bmp);
    s.lastFrame = Buffer.from(bmp);
    s.width = w; s.height = h; s.totalHeight = h; s.frames = 1;
    return h;
  }
  if (w !== s.width || h !== s.height) return 0; // resolution changed — skip

  // End-of-page guard: an unchanged frame means the page did not scroll — we're at
  // the bottom. Checked before findScrollOffset so a repeating footer can never
  // lock the alignment onto a spurious non-zero offset and re-stitch itself.
  if (framesEqual(s.lastFrame, bmp, w, h)) {
    s.lastFrame = Buffer.from(bmp);
    s.frames++;
    return 0;
  }

  // Confirm a sticky header before trusting it: require TWO consecutive measurements
  // to agree (±2px). A single frame pair can mistake a solid band for a fixed bar.
  // Until confirmed we align on the whole frame (sticky=0) — harmless, since the
  // scrolling content dominates the match and the header matches at every offset.
  if (!s.stickyLocked) {
    const sb = measureSticky(s.lastFrame, bmp, w, h);
    const near = (a, b) => Math.abs(a - b) <= 2;
    if (s.stickyProbe && near(s.stickyProbe.stickyTop, sb.stickyTop)) {
      s.stickyTop = Math.min(s.stickyProbe.stickyTop, sb.stickyTop);
      s.stickyLocked = true;
    } else {
      s.stickyProbe = sb; // keep aligning with current sticky (0) meanwhile
    }
  }

  const expected = (notchesSent && s.pxPerNotch) ? Math.round(s.pxPerNotch * notchesSent) : 0;
  const d = findScrollOffset(s.lastFrame, bmp, w, h, expected, s.stickyTop, s.stickyBottom);
  if (d > 0) {
    // Append the d newly-revealed rows from the bottom of this frame: rows
    // [h-d, h). These are the pixels that scrolled into view since the last frame,
    // so they join the canvas seamlessly right below what's already there.
    const revealStart = Math.max(0, h - d);
    const take = h - revealStart;
    if (take > 0) {
      s.canvas = Buffer.concat([s.canvas, bmp.subarray(revealStart * rowBytes, h * rowBytes)]);
      s.totalHeight += take;
    }
    if (notchesSent > 0) {
      const est = d / notchesSent;
      s.pxPerNotch = s.pxPerNotch ? (s.pxPerNotch * 0.6 + est * 0.4) : est;
    }
  }
  s.lastFrame = Buffer.from(bmp);
  s.frames++;
  return d;
}

// True when two frames are essentially identical (the page did not scroll — we're
// at the bottom). This is the authoritative end-of-page signal: at the true bottom
// a wheel event moves nothing, so consecutive grabs are pixel-for-pixel equal
// (allowing for a hair of BitBlt noise / caret blink). A dense grid is sampled; the
// mean absolute per-channel diff staying tiny AND almost no rows differing both have
// to hold, so a page that only changed a blinking cursor still reads as "no scroll"
// while a real 1px shift does not.
function framesEqual(prev, cur, w, h) {
  const rowBytes = w * 4;
  const colStep = Math.max(4, Math.floor(w / 64)) * 4; // ~64 columns
  const rowStep = Math.max(1, Math.floor(h / 120));    // ~120 rows
  let sum = 0, count = 0, changedRows = 0, totalRows = 0;
  for (let y = 0; y < h; y += rowStep) {
    const base = y * rowBytes;
    let rowDiff = 0, rowCount = 0;
    for (let c = 0; c < rowBytes; c += colStep) {
      const diff = cur[base + c] - prev[base + c];
      const a = diff < 0 ? -diff : diff;
      rowDiff += a; rowCount++;
    }
    sum += rowDiff; count += rowCount;
    totalRows++;
    if (rowCount && rowDiff / rowCount > 6) changedRows++; // this row visibly moved
  }
  if (!count) return true;
  const meanDiff = sum / count;
  const changedFrac = totalRows ? changedRows / totalRows : 0;
  // Identical enough overall AND fewer than ~4% of sampled rows changed.
  return meanDiff < 2.2 && changedFrac < 0.04;
}

// Find how many pixels content scrolled DOWN between two frames by aligning
// cur[y] against prev[y+d]. This is the heart of stitch accuracy, so it uses
// ROW-SIGNATURE correlation rather than a whole-frame SAD:
//
//   • Each row is reduced to a fixed-column luma signature.
//   • Each row gets a DISTINCTIVENESS weight = how much it differs from the row
//     above it (a vertical-edge / text measure). Flat bands — white footer gaps,
//     solid backgrounds — get ~0 weight, so they can't create false low-score
//     plateaus that a plain SAD locks onto.
//   • For each candidate d, the cost is the weighted mean abs-diff between cur[y]
//     and prev[y+d] over the overlap. Distinctive rows (text) dominate the cost,
//     giving a SHARP, unique minimum at the true offset.
//
// The search covers the FULL [1, maxD] range (the page can clamp to a tiny shift
// on any step — especially the last, at the footer — so a window around the
// predicted offset would miss the true small offset and duplicate content). The
// result is accepted only if the minimum is both strong AND clearly unique; an
// ambiguous/periodic overlap returns 0 so end-detection settles it rather than
// guessing. Only the scrolling band [stickyTop, h-stickyBottom) participates.
function findScrollOffset(prev, cur, w, h, expected, stickyTop, stickyBottom) {
  const rowBytes = w * 4;
  const top = stickyTop || 0;
  const bottomLimit = h - (stickyBottom || 0);          // exclusive
  const band = bottomLimit - top;                       // scrolling content height
  if (band < 16) return 0;
  const maxD = Math.min(band - 1, Math.floor(band * 0.9));

  // Fixed sample columns (same set for every row so signatures are comparable).
  const nCols = Math.min(160, w);
  const cols = new Int32Array(nCols);
  for (let i = 0; i < nCols; i++) cols[i] = Math.min(w - 1, Math.floor((i + 0.5) * w / nCols)) * 4;

  // Per-row luma signature (sum of R+G+B at each sample column) for both frames.
  const sig = (buf) => {
    const s = new Int32Array(h * nCols);
    for (let y = 0; y < h; y++) {
      const base = y * rowBytes, o = y * nCols;
      for (let i = 0; i < nCols; i++) { const c = base + cols[i]; s[o + i] = buf[c] + buf[c + 1] + buf[c + 2]; }
    }
    return s;
  };
  const P = sig(prev), C = sig(cur);

  // Distinctiveness weight per row of cur = mean abs vertical gradient (row vs the
  // row above). Text/edges → high; flat background → ~0. Used to weight the cost so
  // featureless bands don't sway the alignment.
  const wgt = new Float64Array(h);
  for (let y = top + 1; y < bottomLimit; y++) {
    const o = y * nCols, o1 = (y - 1) * nCols; let g = 0;
    for (let i = 0; i < nCols; i++) { const dd = C[o + i] - C[o1 + i]; g += dd < 0 ? -dd : dd; }
    wgt[y] = g / nCols;
  }

  // Weighted mean abs-diff of cur[y] vs prev[y+d] over the overlap band.
  const rowStep = Math.max(1, Math.floor(band / 140)); // ~140 rows sampled
  function costFor(d) {
    let num = 0, den = 0;
    const yEnd = bottomLimit - d;
    for (let y = top + 1; y < yEnd; y += rowStep) {
      const wq = wgt[y];
      if (wq < 6) continue;                 // skip near-flat rows entirely
      const oc = y * nCols, op = (y + d) * nCols;
      let s = 0;
      for (let i = 0; i < nCols; i++) { const dl = C[oc + i] - P[op + i]; s += dl < 0 ? -dl : dl; }
      num += (s / nCols) * wq; den += wq;
    }
    return den > 0 ? num / den : Infinity;
  }

  // ALWAYS search the full [1, maxD] range. The page can clamp to a much smaller
  // shift than requested on ANY step (most importantly the last one at the footer),
  // so a window centred on the predicted offset would miss the true small offset
  // and lock onto a spurious match — the classic duplicated/misaligned footer.
  const coarse = Math.max(1, Math.floor(maxD / 300)) * 2;
  let gMin = Infinity;
  const coarseScores = [];
  for (let d = 1; d <= maxD; d += coarse) { const c = costFor(d); coarseScores.push({ d, c }); if (c < gMin) gMin = c; }
  if (!isFinite(gMin)) return 0;            // no distinctive rows to align on

  // A "typical" (wrong-offset) cost = median of the coarse scan. The true offset
  // sits in a valley FAR below this; acceptance is judged RELATIVE to it, so the
  // detector works the same on dense text and on sparse footers (scale-independent)
  // instead of relying on an absolute pixel-diff threshold.
  const sortedC = coarseScores.map((s) => s.c).filter(isFinite).sort((a, b) => a - b);
  const median = sortedC[Math.floor(sortedC.length / 2)] || gMin;

  const cut = gMin + (median - gMin) * 0.5 + 2;   // "near the minimum" band (generous)
  const refine = (d0) => { let bd = d0, bc = Infinity; const lo = Math.max(1, d0 - coarse - 1), hi = Math.min(maxD, d0 + coarse + 1); for (let dd = lo; dd <= hi; dd++) { const cc = costFor(dd); if (cc < bc) { bc = cc; bd = dd; } } return { d: bd, c: bc }; };
  const basins = [];
  for (const { d, c } of coarseScores) {
    if (c > cut) continue;
    const b = refine(d);
    if (!basins.some((x) => Math.abs(x.d - b.d) <= 2)) basins.push(b);
  }
  // Always evaluate the basin AT the physical prediction, even if the coarse scan
  // didn't flag it — the true offset is usually right at `expected` mid-page, and a
  // slightly-higher-cost true basin must still be a candidate so selection can prefer
  // it over a spurious lower-cost echo elsewhere.
  if (expected && expected > 1 && expected < maxD) {
    const b = refine(expected);
    if (!basins.some((x) => Math.abs(x.d - b.d) <= 2)) basins.push(b);
  }
  if (!basins.length) return 0;
  basins.sort((a, b) => a.c - b.c);

  const best = basins[0];
  // Confidence: the minimum must be a CLEAR valley — well below the typical cost.
  const depth = median - best.c;
  if (depth < Math.max(4, median * 0.25)) return 0;

  // A basin is "good" if its cost is close to the best AND far below typical — a real
  // alignment, not a shallow dip. `goodCut` is generous so the true offset counts
  // even when a spurious echo scored a hair lower.
  const goodCut = Math.min(best.c + Math.max(6, depth * 0.5), gMin + (median - gMin) * 0.4);
  const good = basins.filter((b) => b.c <= goodCut);

  // Selection. The lowest-cost basin (`best`) is the strongest pixel match and is
  // the default answer. The PHYSICAL prediction only breaks TIES: when several
  // basins match almost equally well (repeating/periodic overlap), `expected` — the
  // known wheel distance — disambiguates. Crucially it does NOT override a clearly
  // better match: if the page actually clamped to a smaller scroll than requested,
  // that smaller offset has a distinctly lower cost and wins on its own. This keeps
  // both cases right: normal steps land on expected, the final partial step lands on
  // the real (smaller) shift.
  const tieCut = best.c + Math.max(4, depth * 0.18);      // "essentially as good as best"
  const tied = good.filter((b) => b.c <= tieCut);
  if (tied.length > 1) {
    if (expected && expected > 0) {
      const byPred = tied.slice().sort((a, b) => Math.abs(a.d - expected) - Math.abs(b.d - expected));
      if (Math.abs(byPred[0].d - expected) <= Math.max(14, expected * 0.3)) return byPred[0].d;
    }
    // No decisive prediction among the tied basins → smallest (avoid periodic echo).
    return tied.sort((a, b) => a.d - b.d)[0].d;
  }
  return best.d;
}

function sendScrollUI(payload) {
  if (scrollWindow && !scrollWindow.isDestroyed()) scrollWindow.webContents.send('scroll:status', payload);
}

// Push the growing stitch + progress into the live preview pin (throttled — the
// PNG encode of a tall image isn't free).
function updateScrollPreview(status) {
  const s = scrollSession;
  if (!s) return;
  const heightDip = Math.round(s.totalHeight / s.sf);
  sendScrollUI({ status, height: heightDip });

  const now = Date.now();
  let dataUrl = null;
  if (s.canvas && s.totalHeight > 0 && now - s.lastPreviewAt > 320) {
    try {
      const img = nativeImage.createFromBitmap(s.canvas, { width: s.width, height: s.totalHeight });
      dataUrl = img.resize({ width: 260 }).toDataURL();
      s.lastPreviewAt = now;
    } catch (e) { /* skip this preview frame */ }
  }
  if (pinWindow && !pinWindow.isDestroyed()) {
    pinWindow.webContents.send('pin:scroll-preview', { dataUrl, height: heightDip, status });
  }
}

function openScrollWindow() {
  if (scrollWindow && !scrollWindow.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const winW = 410, winH = 64;
  scrollWindow = new BrowserWindow({
    x: Math.round(area.x + area.width / 2 - winW / 2),
    y: area.y + 12,
    width: winW, height: winH,
    frame: false, transparent: true, resizable: false, movable: true,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    fullscreenable: false, maximizable: false, minimizable: false, show: false,
    webPreferences: BASE_WEB_PREFERENCES,
  });
  scrollWindow.setAlwaysOnTop(true, 'screen-saver');
  scrollWindow.setContentProtection(true); // excluded from the region grabs
  scrollWindow.loadFile('scroll.html');
  scrollWindow.once('ready-to-show', () => scrollWindow && scrollWindow.showInactive());
  scrollWindow.on('closed', () => { scrollWindow = null; });
}

// A portrait pin used purely as the live preview during scroll capture. It is
// content-protected so it never appears in the grabbed frames. dispatchCapture()
// replaces it with a normal pin holding the final stitched image.
function ensureScrollPreviewPin() {
  if (pinWindow && !pinWindow.isDestroyed()) { pinWindow.destroy(); pinWindow = null; }
  const SHADOW = 10, cardW = 260, cardH = 380;
  const winW = cardW + SHADOW * 2, winH = cardH + SHADOW * 2;
  const area = screen.getPrimaryDisplay().workArea;
  pinWindow = new BrowserWindow({
    x: area.x + area.width  - winW - 20,
    y: area.y + area.height - winH - 20,
    width: winW, height: winH,
    frame: false, transparent: true, resizable: false, backgroundColor: '#00000000',
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    fullscreenable: false, maximizable: false, minimizable: false, movable: true, show: false,
    webPreferences: BASE_WEB_PREFERENCES,
  });
  pinWindow.setAlwaysOnTop(true, 'screen-saver');
  pinWindow.setContentProtection(true);
  pinWindow.loadFile('pin.html');
  pinWindow.webContents.once('did-finish-load', () => {
    if (!pinWindow || pinWindow.isDestroyed()) return;
    pinWindow.webContents.send('pin:scroll-preview', { status: 'Starting…', height: 0 });
    pinWindow.showInactive();
  });
  pinWindow.on('closed', () => { pinWindow = null; });
}

function endScrollSession() {
  if (scrollWindow && !scrollWindow.isDestroyed()) scrollWindow.close();
  scrollWindow = null;
  // Release the held selection overlay (shown as capture feedback since Start).
  // Every scroll teardown path — finalize, cancel, helper-failed bail — routes
  // through here, so the overlay is always cleaned up exactly once.
  if (overlayCapturing) hideOverlay();
}

// Finish the capture using everything stitched so far → editor + final pin.
function finalizeScroll() {
  const s = scrollSession;
  if (!s || s.finishing) return;
  s.finishing = true;
  stopScrollHelper();
  sendScrollUI({ status: 'Done', height: Math.round(s.totalHeight / s.sf), done: true });
  scrollSession = null;
  endScrollSession();

  if (!s.canvas || s.totalHeight < 1) {
    if (pinWindow && !pinWindow.isDestroyed()) { pinWindow.destroy(); pinWindow = null; }
    if (editorVisibleBeforeCapture) showEditor();
    return;
  }
  // Always open the final long-page capture in the editor (per the scroll-capture
  // workflow), and replace the live preview pin with a normal pin of the result.
  const dataUrl = nativeImage.createFromBitmap(s.canvas, { width: s.width, height: s.totalHeight }).toDataURL();
  captureHistory.saveCapture(dataUrl, s.width, s.totalHeight);
  showEditor();
  loadIntoEditor(dataUrl);
  showPin(dataUrl, s.width, s.totalHeight);
}

ipcMain.on('scroll:done', () => finalizeScroll());

ipcMain.on('scroll:cancel', () => {
  const s = scrollSession;
  if (s) s.aborted = true;
  stopScrollHelper();
  scrollSession = null;
  endScrollSession();
  if (pinWindow && !pinWindow.isDestroyed()) { pinWindow.destroy(); pinWindow = null; }
  if (editorVisibleBeforeCapture) showEditor();
});

// ─── Capture History IPC ─────────────────────────────────────────────────────
ipcMain.handle('history:get-index', () => captureHistory.readIndex());
ipcMain.handle('history:get-thumb', (_event, id) => captureHistory.getThumb(id));
ipcMain.handle('history:load',      (_event, id) => captureHistory.getImage(id));
ipcMain.handle('history:delete',    (_event, id) => captureHistory.deleteEntry(id));

// ─── Tray ──────────────────────────────────────────────────────────────────
function trayImage() {
  // Full-colour logo (createFromPath auto-loads tray@2x.png on HiDPI displays).
  return nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('Lumshot');
  // A single left-click is the primary action (Windows tray convention) — right-
  // click still opens the context menu automatically via setContextMenu below.
  // 'double-click' also fires showEditor a second time in that case, which is a
  // harmless no-op (it just re-focuses an already-visible window).
  tray.on('click', showEditor);
  tray.on('double-click', showEditor);
  // Clicking the "update ready" balloon restarts + installs immediately
  tray.on('balloon-click', () => {
    if (updateReady) { isQuitting = true; require('electron-updater').autoUpdater.quitAndInstall(); }
  });
  updateTrayMenu();
  // Swap the icon and re-broadcast when the OS theme changes
  nativeTheme.on('updated', () => {
    if (tray) tray.setImage(trayImage());
    if ((settings.getSettings().theme || 'system') === 'system') {
      broadcastTheme();
      rebuildMenu();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const licensed = license.isLicensed();

  const items = [
    { label: 'Open Lumshot', click: () => showEditor() },
    { type: 'separator' },
    { label: 'Capture Screenshot', click: () => startCapture() },
    { label: 'Capture Full Screen', click: () => captureFullScreen() },
    { type: 'separator' },
    { label: 'Settings…', click: () => openSettings('general') },
    { type: 'separator' },
  ];

  // "Buy Lumshot" only for unlicensed users (hidden once licensed)
  if (!licensed) {
    items.push(
      { label: 'Buy Lumshot', click: () => shell.openExternal(POLAR_CHECKOUT_URL) },
      { type: 'separator' },
    );
  }

  items.push({ label: 'Quit Lumshot', click: () => { isQuitting = true; app.quit(); } });

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ─── Settings panel ──────────────────────────────────────────────────────────
// Settings now live inside the editor window as a slide-in panel. We just bring
// the editor forward and tell its renderer which tab to open. `tab` may be a
// string ('general' | 'license' | 'watermark'); menu/tray click handlers pass a
// MenuItem, which we ignore in favour of the default tab.
function openSettings(tab) {
  showEditor();
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.webContents.send('open-settings', typeof tab === 'string' ? tab : 'general');
  }
}

// ─── Auto-update (packaged builds only) ───────────────────────────────────────
function setupAutoUpdate() {
  // Never run the updater in development — only in the packaged app.
  if (!app.isPackaged) return;

  // Lazy-require here so electron-updater and its dependency subtree only load in
  // packaged builds, and never on the dev startup path.
  const { autoUpdater } = require('electron-updater');

  autoUpdater.on('update-available', () => {
    if (tray) tray.displayBalloon({
      iconType: 'info',
      title: 'Lumshot',
      content: 'A Lumshot update is available and downloading…',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    const latest = info && info.version ? `v${info.version}` : null;
    const current = `v${app.getVersion()}`;
    if (editorWindow && !editorWindow.isDestroyed()) {
      // Primary path: in-app toast inside the Lumshot window.
      editorWindow.webContents.send('update:ready', { current, latest: latest || current });
    } else if (tray) {
      // Fallback: no editor window to show the toast in (e.g. tray-only) —
      // the balloon still lets the user install without opening the app.
      tray.displayBalloon({
        iconType: 'info',
        title: 'Lumshot',
        content: 'Update ready — click here to restart and install (or it installs on next restart).',
      });
    }
  });

  // Never show an error dialog — just log to the console.
  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err == null ? 'unknown' : (err.stack || err).toString());
  });

  // Silent check, deferred off the launch path; downloads automatically and
  // notifies when ready.
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('Auto-update check failed:', err);
    });
  }, 4000);
}

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return; // a duplicate instance — it's already quitting
  perf('whenReady');
  captureHistory.cleanup();
  cleanupDragTempFiles(); // sweep leftover drag-out temp files from previous runs

  // Serve the bundled OCR runtime over the `ocr://` scheme. URLs look like
  // `ocr://assets/worker.min.js`; we map the basename onto assets/ocr on disk
  // (app.asar.unpacked in a packaged build, since these files are asarUnpack'd).
  // ACAO:* lets Tesseract's blob worker fetch the .traineddata cross-origin.
  protocol.handle('ocr', async (request) => {
    const fileName = path.basename(decodeURIComponent(new URL(request.url).pathname));
    let dir = path.join(app.getAppPath(), 'assets', 'ocr');
    if (dir.includes(`app.asar${path.sep}`)) {
      dir = dir.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    }
    try {
      const data = await fs.promises.readFile(path.join(dir, fileName));
      const type = fileName.endsWith('.js') ? 'text/javascript'
        : fileName.endsWith('.gz') ? 'application/gzip'
          : fileName.endsWith('.wasm') ? 'application/wasm'
            : 'application/octet-stream';
      return new Response(data, {
        headers: { 'content-type': type, 'access-control-allow-origin': '*' },
      });
    } catch (e) {
      return new Response(`OCR asset not found: ${fileName}`, { status: 404 });
    }
  });

  // Build the menu before the editor window opens so it's applied immediately.
  appMenu = buildAppMenu();
  if (IS_WINDOWS) {
    // No global menu: the editor window gets its own (hidden) menu for
    // accelerators, and the renderer draws the visible HTML dropdowns.
    Menu.setApplicationMenu(null);
  } else {
    // macOS/Linux: show the native system menu bar.
    applyAppMenu();
  }

  createEditorWindow();
  perf('editor window created + loadFile issued');
  createTray();

  const s = settings.getSettings();
  app.setLoginItemSettings({ openAtLogin: s.launchAtStartup, args: ['--hidden'] });
  registerHotkey(s.hotkey);
  registerAiHotkey();
  // Restore native chrome appearance from stored preference
  nativeTheme.themeSource = s.theme || 'system';

  // Send the active shortcut to the editor once it has loaded
  editorWindow.webContents.once('did-finish-load', async () => {
    editorWindow.webContents.send('shortcut-info', displayAccel(activeShortcut));
    // Warm up the capture overlay now that the editor has painted. It loads in its
    // own hidden renderer (off the editor's first-paint path) and finishes well
    // before the user can trigger a capture — so the first capture hits the warm
    // path: instant to appear and free of the cold-start shake.
    if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
    // Warm the resident capture helper too (Add-Type's C# compile runs now, off
    // the capture path) so the very first capture is already fast.
    startCaptureHelper();
    // Same for the Capture-to-AI focus helper, so the first hotkey press doesn't
    // pay its Add-Type compile. No-op when the feature is disabled.
    if (settings.getSettings().captureToAI.enabled) aiPaste.warmUp();
    const reval = await license.revalidateIfDue();
    if (reval.deactivated) {
      updateTrayMenu();
      broadcastLicense();
    }
  });

  setupAutoUpdate();
});

// Keep running in the tray when all windows are closed (quit only via tray).
app.on('window-all-closed', () => { /* intentionally empty */ });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopCaptureHelper();
  aiPaste.stop();
});
