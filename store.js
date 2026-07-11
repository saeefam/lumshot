// store.js — single shared electron-store instance for the whole main process.
//
// Created lazily on first use (after the app is ready, since electron-store
// reads app.getPath('userData')). Sharing one instance keeps license.js and
// settings.js reading/writing the same in-memory + on-disk data.

let store = null;

// One-time migration: the app was renamed ShotKit → Lumshot, which moves the
// userData folder (e.g. %APPDATA%/shotkit → %APPDATA%/lumshot). Copy any existing
// config from the old folder so licences and settings survive the rename.
function migrateLegacyConfig() {
  try {
    const { app } = require('electron');
    const fs = require('fs');
    const path = require('path');

    const newDir  = app.getPath('userData');           // .../lumshot
    const newFile = path.join(newDir, 'config.json');
    if (fs.existsSync(newFile)) return;                 // already have config — nothing to do

    const parent = path.dirname(newDir);
    // Folder names this app used before the rename (dev used 'shotkit',
    // a packaged build would have used 'ShotKit').
    for (const legacy of ['shotkit', 'ShotKit']) {
      const oldFile = path.join(parent, legacy, 'config.json');
      if (fs.existsSync(oldFile)) {
        fs.mkdirSync(newDir, { recursive: true });
        fs.copyFileSync(oldFile, newFile);
        return;
      }
    }
  } catch (e) {
    // Migration is best-effort; never block startup over it.
  }
}

module.exports = function getStore() {
  if (!store) {
    migrateLegacyConfig();
    const Store = require('electron-store');
    store = new Store();
  }
  return store;
};
