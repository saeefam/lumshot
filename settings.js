// settings.js — user settings persistence (main process), via electron-store.
//
// Stored under the "settings" key. Every getter falls back to a sensible
// default so the very first run works with no stored data.

const { app } = require('electron');
const getStore = require('./store');

const DEFAULT_HOTKEY = 'CommandOrControl+Shift+S';
const DEFAULT_AI_HOTKEY = 'CommandOrControl+Shift+A';

// The old Ctrl+Shift+X auto-fallback is no longer used. Earlier builds could save
// it as the user's hotkey when the preferred key was momentarily unavailable, so
// normalise any such persisted value back to the default capture shortcut.
const LEGACY_FALLBACK_HOTKEY = 'CommandOrControl+Shift+X';

function getSettings() {
  const data = getStore().get('settings') || {};
  const storedHotkey = data.hotkey === LEGACY_FALLBACK_HOTKEY ? DEFAULT_HOTKEY : data.hotkey;
  const ai = data.captureToAI || {};
  return {
    // Where "Save as PNG" defaults to
    exportFolder:    data.exportFolder || app.getPath('desktop'),
    // Index into the shared preset list (see presets.js)
    defaultPreset:   Number.isInteger(data.defaultPreset) ? data.defaultPreset : 0,
    // Global capture shortcut (Electron accelerator string)
    hotkey:          storedHotkey || DEFAULT_HOTKEY,
    // Start with Windows
    launchAtStartup: !!data.launchAtStartup,
    // UI colour scheme: 'system' | 'light' | 'dark'. Defaults to 'dark' (not
    // 'system') so a fresh install always opens dark regardless of the Windows
    // theme — the user can still switch to Light/System anytime in Settings.
    theme: data.theme || 'dark',
    // Keep the editor window floating above other windows
    alwaysOnTop: !!data.alwaysOnTop,
    // Screenshot background/beautify treatment (View menu checkbox). ON by
    // default; OFF shows the raw screenshot and hides the background sidebar.
    backgroundEnabled: data.backgroundEnabled !== false,

    // ── Capture precision aids (Preferences toggles + C / M during capture) ──
    // Region capture only. Crosshair defaults ON; magnifier is opt-in.
    // (Screen freezing is not a setting: the overlay always selects on the
    // frozen frame the capture is cropped from.)
    captureCrosshair: data.captureCrosshair !== false,
    captureMagnifier: !!data.captureMagnifier,

    // ── Capture to AI (hotkey → region select → auto-paste into the most recently
    // used AI/code app; see aiPaste.js for the target model) ──
    // Stored as one nested object so setSetting('captureToAI', {...}) replaces it
    // atomically; every field falls back so partial/first-run data always works.
    // customApps: extra exe names the user wants treated as paste targets, on
    // top of the built-in AI-app whitelist in aiPaste.js.
    captureToAI: {
      enabled:            ai.enabled !== false,
      hotkey:             (typeof ai.hotkey === 'string' && ai.hotkey) ? ai.hotkey : DEFAULT_AI_HOTKEY,
      customApps:         Array.isArray(ai.customApps)
        ? ai.customApps.filter((x) => typeof x === 'string' && x.trim())
        : [],
    },

    // ── Custom watermark (licensed users) ──
    customWatermarkEnabled: !!data.customWatermarkEnabled,
    watermarkText:          typeof data.watermarkText === 'string' ? data.watermarkText : '',
    watermarkPosition:      data.watermarkPosition || 'bottom-center',
    watermarkOpacity:       Number.isFinite(data.watermarkOpacity) ? data.watermarkOpacity : 70,
    watermarkSize:          data.watermarkSize || 'medium',
  };
}

function setSetting(key, value) {
  const store = getStore();
  const data = store.get('settings') || {};
  data[key] = value;
  store.set('settings', data);
  return getSettings();
}

module.exports = { getSettings, setSetting };
