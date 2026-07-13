const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Main → overlay: reset selection state when the (reused) window is reshown.
  // Payload carries the persisted precision-aid toggles ({ crosshair, magnifier,
  // freeze }) so the overlay opens with them already applied.
  onOverlayReset: (cb) =>
    ipcRenderer.on('overlay-reset', (_, aids) => cb(aids)),

  // Main → overlay: set the active capture mode after reset (e.g. 'scroll', 'ocr')
  onOverlaySetMode: (cb) =>
    ipcRenderer.on('overlay-set-mode', (_, m) => cb(m)),

  // Main → overlay: enter/leave the scroll-capture "hold" state. While held, the
  // overlay keeps the frozen selection highlighted with the surroundings dimmed
  // (continuous capture feedback) but drops all its controls and stays click-
  // through so the scroll capture can drive the page underneath.
  onOverlayCapturing: (cb) =>
    ipcRenderer.on('overlay-capturing', (_, on) => cb(on)),

  // Overlay → main: magnifier/freeze needs the captured frame's pixels
  requestOverlayFrame: () =>
    ipcRenderer.send('overlay-request-frame'),

  // Main → overlay: raw BGRA bitmap of the background grab
  // ({ buffer, width, height } at physical resolution)
  onOverlayFrame: (cb) =>
    ipcRenderer.on('overlay-frame', (_, d) => cb(d)),

  // Overlay → main: user finished selecting a region (rect in DIP/CSS px)
  sendRegionSelected: (rect) =>
    ipcRenderer.send('region-selected', rect),

  // Overlay → main: user pressed Escape
  cancelSelection: () =>
    ipcRenderer.send('cancel-selection'),

  // Overlay → main: user picked an "immediate" capture mode from the control bar
  // ('window' | 'fullscreen').
  captureWithMode: (mode) =>
    ipcRenderer.send('capture-with-mode', { mode }),

  // Main → overlay: late-resolved AI destinations ([{ appName, icon }]) for
  // the current capture — normal-workflow entries only; the AI-hotkey path
  // inlines them in overlay-reset so the badge is ready on the first frame.
  onOverlayAiTargets: (cb) =>
    ipcRenderer.on('overlay-ai-targets', (_, targets) => cb(targets)),

  // Main → toast window: the transient system toast message
  onToastShow: (cb) =>
    ipcRenderer.on('toast:show', (_, msg) => cb(msg)),

  // ── Scroll-capture control window ──
  // Main → scroll window: progress update ({ frames, height })
  onScrollStatus: (cb) => ipcRenderer.on('scroll:status', (_, data) => cb(data)),
  // Scroll window → main: finish and stitch
  scrollDone:   () => ipcRenderer.send('scroll:done'),
  // Scroll window → main: abandon the scroll capture
  scrollCancel: () => ipcRenderer.send('scroll:cancel'),

  // Editor → main: the basic shell (title bar / toolbar frame / empty canvas)
  // has painted its first frame. Main shows the window on THIS (fired from a rAF
  // in editor.html, before editor.js's heavy top-level init runs) instead of
  // waiting for Chromium's 'ready-to-show', which only fires after all that init
  // finishes — the ~1.7s startup gap. See createEditorWindow in main.js.
  signalShellReady: () =>
    ipcRenderer.send('editor:shell-ready'),

  // Editor: receive a cropped screenshot to beautify
  onLoadScreenshot: (cb) =>
    ipcRenderer.on('load-screenshot', (_, data) => cb(data)),

  // Editor → main: copy rendered image to clipboard
  copyToClipboard: (dataUrl) =>
    ipcRenderer.send('copy-to-clipboard', dataUrl),

  // Editor → main: save rendered image (format 'png' | 'jpg'; returns promise)
  saveImage: (dataUrl, format) =>
    ipcRenderer.invoke('save-image', dataUrl, format),

  // Editor → main: begin a native OS drag of the rendered image out of the app.
  // Main materialises the PNG as a temp file and hands it to the OS drag loop via
  // webContents.startDrag, so it drops into any app that accepts an image file.
  startCanvasDrag: (dataUrl) =>
    ipcRenderer.send('canvas:drag-out', dataUrl),

  // Editor: receive which global shortcut was actually registered (or null if none)
  onShortcutInfo: (cb) =>
    ipcRenderer.on('shortcut-info', (_, sc) => cb(sc)),

  // Editor → main: trigger a capture from the in-app Capture button
  triggerCapture: () =>
    ipcRenderer.invoke('trigger-capture'),

  // Editor → main: trigger a capture with OCR mode preselected on the overlay
  triggerCaptureOcr: () =>
    ipcRenderer.invoke('trigger-capture-ocr'),

  // Editor → main: open a native file picker and load the chosen image
  openImage: () =>
    ipcRenderer.invoke('file:open-image'),

  // Main → editor: File menu "Save as PNG" (Ctrl+S) was triggered
  onMenuSave: (cb) =>
    ipcRenderer.on('trigger-save', () => cb()),

  // Main → editor: File menu "Save As…" was triggered
  onMenuSaveAs: (cb) =>
    ipcRenderer.on('trigger-save-as', () => cb()),

  // Main → editor: File menu "Save as JPG" was triggered
  onMenuSaveJpg: (cb) =>
    ipcRenderer.on('trigger-save-jpg', () => cb()),

  // Editor → main: open the Save As dialog (step 1 — returns { canceled, filePath })
  pickSaveAsPath: () =>
    ipcRenderer.invoke('save-image-as:pick'),

  // Editor → main: write encoded bytes to the chosen path (step 2 — returns bool)
  writeImageToPath: (dataUrl, filePath) =>
    ipcRenderer.invoke('save-image-as:write', dataUrl, filePath),

  // Editor → main: save plain text to a .txt file (OCR "Create Note"); returns bool
  saveTextFile: (text) =>
    ipcRenderer.invoke('notes:save-text', text),

  // Editor → main: read the clipboard as plain text (OCR edit-a-line paste)
  readClipboardText: () =>
    ipcRenderer.invoke('clipboard:read-text'),

  // Main → editor: File menu "Copy to Clipboard" (Ctrl+C) was triggered
  onMenuCopy: (cb) =>
    ipcRenderer.on('trigger-copy', () => cb()),

  // Main → editor: show a brief toast message (e.g. "No image found in clipboard")
  onShowToast: (cb) =>
    ipcRenderer.on('show-toast', (_, msg) => cb(msg)),

  // Main → editor: an auto-update finished downloading and is ready to install
  // (payload is { current, latest }, both version strings like "v1.0.1")
  onUpdateReady: (cb) =>
    ipcRenderer.on('update:ready', (_, versions) => cb(versions)),

  // Editor → main: user clicked "Install Now" on the update-ready toast
  installUpdate: () =>
    ipcRenderer.send('update:install'),

  // Main → editor: Edit menu Undo / Redo
  onMenuUndo: (cb) =>
    ipcRenderer.on('trigger-undo', () => cb()),
  onMenuRedo: (cb) =>
    ipcRenderer.on('trigger-redo', () => cb()),

  // Editor → main: report undo/redo stack availability for menu graying
  sendUndoRedoState: (state) =>
    ipcRenderer.send('undo-redo-state', state),

  // Main → editor: Edit menu annotation clipboard
  onMenuAnnCut:       (cb) => ipcRenderer.on('trigger-ann-cut',        () => cb()),
  onMenuAnnCopy:      (cb) => ipcRenderer.on('trigger-ann-copy',       () => cb()),
  onMenuAnnPaste:     (cb) => ipcRenderer.on('trigger-ann-paste',      () => cb()),
  onMenuAnnSelectAll: (cb) => ipcRenderer.on('trigger-ann-select-all', () => cb()),

  // Main → editor: Edit menu tool selection
  onMenuTool: (cb) =>
    ipcRenderer.on('trigger-tool', (_, tool) => cb(tool)),

  // Main → editor: Tools/Capture menu "Toggle OCR Mode"
  onMenuOcrToggle: (cb) =>
    ipcRenderer.on('trigger-ocr-toggle', () => cb()),

  // Main → editor: Edit > Delete selected annotation
  onMenuDelete: (cb) =>
    ipcRenderer.on('trigger-delete', () => cb()),

  // Main → editor: Edit menu clear all annotations
  onMenuClearAll: (cb) =>
    ipcRenderer.on('trigger-clear-all', () => cb()),

  // Main → editor: View menu zoom action ('in' | 'out' | 'fit' | '100')
  onMenuZoom: (cb) =>
    ipcRenderer.on('trigger-zoom', (_, action) => cb(action)),

  // Main → editor: open the settings slide-in panel on a given tab
  // ('general' | 'license' | 'watermark')
  onOpenSettings: (cb) =>
    ipcRenderer.on('open-settings', (_, tab) => cb(tab)),

  // ── Theme ──
  // Get the current effective theme ('dark'|'light') synchronously on load
  getInitialTheme: () => ipcRenderer.invoke('theme:get'),
  // Main → all windows: theme changed — apply the new value immediately
  onThemeApply: (cb) => ipcRenderer.on('theme:apply', (_, t) => cb(t)),

  // ── Custom title-bar window controls ──
  minimizeWindow:    () => ipcRenderer.send('window:minimize'),
  maximizeWindow:    () => ipcRenderer.send('window:maximize'),
  closeWindow:       () => ipcRenderer.send('window:close'),
  // Editor → main: the last tab was closed — close the window and reset the
  // editor document so the next capture starts a fresh window with one tab.
  closeAllTabs:      () => ipcRenderer.send('editor:close-all-tabs'),
  // Main → renderer: window was maximised or restored (true/false)
  onWindowMaximized: (cb) => ipcRenderer.on('window:maximized', (_, v) => cb(v)),
  // Renderer → main: which OS we're on ('win32' | 'darwin' | 'linux') — used to
  // hide the custom title-bar menu buttons where the native menu bar takes over.
  getPlatform:       () => ipcRenderer.invoke('get-platform'),
  // Renderer → main: fetch the live menu structure to draw a custom HTML dropdown
  getMenu:           () => ipcRenderer.invoke('titlebar:get-menu'),
  // Renderer → main: run the action for a clicked custom-menu item (by id)
  menuAction:        (id) => ipcRenderer.send('titlebar:menu-action', id),
  // Main → renderer: menu data changed (Theme/Always-on-Top toggled) — re-render
  // any open custom dropdown so its checkbox/radio state stays in sync.
  onMenuChanged:     (cb) => ipcRenderer.on('menu:changed', () => cb()),

  // ── Window picker ──
  // Main → window picker: list of capturable windows
  onWindowSources: (cb) =>
    ipcRenderer.on('window-sources', (_, sources) => cb(sources)),
  // Window picker → main: user selected a source
  selectWindowSource: (id) =>
    ipcRenderer.send('window-source-selected', id),
  // Window picker → main: user cancelled
  cancelWindowPicker: () =>
    ipcRenderer.send('window-source-cancel'),

  // ── Licensing ──
  // Get current trial/license status (returns a promise)
  getLicenseStatus: () =>
    ipcRenderer.invoke('license:get-status'),

  // Submit a license key for activation (returns { ok, error?, status })
  activateLicense: (key) =>
    ipcRenderer.invoke('license:activate', key),

  // Deactivate this device (returns { ok, error?, status })
  deactivateLicense: () =>
    ipcRenderer.invoke('license:deactivate'),

  // License changed (e.g. activated from the settings window)
  onLicenseUpdated: (cb) =>
    ipcRenderer.on('license-updated', (_, s) => cb(s)),

  // Open the purchase page in the default browser
  openBuyUrl: () =>
    ipcRenderer.send('license:open-buy'),

  // ── Pin to Screen ──
  // Main → pin: initial raw screenshot to display
  onPinShow:   (cb) => ipcRenderer.on('pin:show',   (_, d) => cb(d)),
  // Main → pin: updated (beautified) image after an export
  onPinUpdate: (cb) => ipcRenderer.on('pin:update', (_, d) => cb(d)),
  // Main → pin: live scroll-capture preview ({ dataUrl, height, status, progress, done })
  onPinScrollPreview: (cb) => ipcRenderer.on('pin:scroll-preview', (_, d) => cb(d)),
  // Pin → main: open the editor with the current pin image
  pinEdit:  () => ipcRenderer.send('pin:edit'),
  // Pin → main: copy the current pin image to the clipboard
  pinCopy:  () => ipcRenderer.send('pin:copy'),
  // Pin → main: open a save dialog for the current pin image
  pinSave:  () => ipcRenderer.send('pin:save'),
  // Pin → main: destroy this pin window
  pinClose: () => ipcRenderer.send('pin:close'),
  // Pin → main: custom window dragging (the card is no-drag so it can capture hover)
  pinDragStart: () => ipcRenderer.send('pin:drag-start'),
  pinDragEnd:   () => ipcRenderer.send('pin:drag-end'),

  // ── Settings ──
  getSettings: () =>
    ipcRenderer.invoke('settings:get'),

  setSetting: (key, value) =>
    ipcRenderer.invoke('settings:set', key, value),

  pickExportFolder: () =>
    ipcRenderer.invoke('settings:pick-folder'),

  setHotkey: (accelerator) =>
    ipcRenderer.invoke('settings:set-hotkey', accelerator),

  // Capture-to-AI hotkey: no-fallback registration (returns { ok, unavailable,
  // display, settings }); status exposes a conflict that happened at startup.
  setAiHotkey: (accelerator) =>
    ipcRenderer.invoke('settings:set-ai-hotkey', accelerator),
  getAiHotkeyStatus: () =>
    ipcRenderer.invoke('settings:ai-hotkey-status'),

  // Settings changed somewhere — re-sync any open window
  onSettingsUpdated: (cb) =>
    ipcRenderer.on('settings-updated', (_, s) => cb(s)),

  // ── App info / keyboard shortcuts / external links (Shortcuts + About panels) ──
  getAppInfo:   () => ipcRenderer.invoke('app:get-info'),
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  setShortcuts: (map) => ipcRenderer.invoke('shortcuts:set', map),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openFromClipboard: () => ipcRenderer.invoke('clipboard:open'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),

  // ── Capture History ──
  onMenuOpenHistory:    (cb) => ipcRenderer.on('trigger-history', () => cb()),
  getHistoryIndex:      ()   => ipcRenderer.invoke('history:get-index'),
  getHistoryThumb:      (id) => ipcRenderer.invoke('history:get-thumb', id),
  loadFromHistory:      (id) => ipcRenderer.invoke('history:load', id),
  deleteHistoryEntry:   (id) => ipcRenderer.invoke('history:delete', id),
});
