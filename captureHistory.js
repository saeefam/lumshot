// captureHistory.js — main-process capture cache.
// Saves the last 50 captures (full PNG + JPEG thumbnail) under
// %APPDATA%/lumshot/capture-cache/ with an index.json manifest.
// All public functions are safe to call before app.whenReady() returns
// (they resolve paths lazily inside each call).

const fs   = require('fs');
const path = require('path');

const MAX_ENTRIES = 50;
const THUMB_W     = 200; // thumbnail max width px

function getCacheDir() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'capture-cache');
}
function getIndexPath() { return path.join(getCacheDir(), 'index.json'); }

function ensureDir() {
  const dir = getCacheDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readIndex() {
  try {
    const p = getIndexPath();
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  } catch { return []; }
}

function writeIndex(entries) {
  try { fs.writeFileSync(getIndexPath(), JSON.stringify(entries)); } catch { /* non-fatal */ }
}

function deleteFiles(entry) {
  const dir = getCacheDir();
  for (const f of [entry.file, entry.thumb].filter(Boolean)) {
    try { const fp = path.join(dir, f); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* ignore */ }
  }
}

// Remove cache files not referenced in index.json (called once on startup).
function cleanup() {
  try {
    const dir = getCacheDir();
    if (!fs.existsSync(dir)) return;
    const known = new Set(['index.json']);
    for (const e of readIndex()) { if (e.file) known.add(e.file); if (e.thumb) known.add(e.thumb); }
    for (const f of fs.readdirSync(dir)) {
      if (!known.has(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ } }
    }
  } catch { /* non-fatal */ }
}

// Save a capture. Fire-and-forget: never blocks the capture flow.
function saveCapture(dataUrl, imgW, imgH) {
  (async () => {
    try {
      const { nativeImage } = require('electron');
      const dir  = ensureDir();
      const ts   = Date.now();
      const id   = String(ts);

      // Full-size PNG
      const base64   = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buf      = Buffer.from(base64, 'base64');
      const fileName = `capture-${id}.png`;
      fs.writeFileSync(path.join(dir, fileName), buf);

      // JPEG thumbnail via nativeImage (no external deps)
      const thumbName = `capture-${id}-thumb.jpg`;
      try {
        const img    = nativeImage.createFromDataURL(dataUrl);
        const sz     = img.getSize();
        const scale  = THUMB_W / sz.width;
        const thumbH = Math.max(1, Math.round(sz.height * scale));
        const thumb  = img.resize({ width: THUMB_W, height: thumbH });
        fs.writeFileSync(path.join(dir, thumbName), thumb.toJPEG(70));
      } catch {
        fs.copyFileSync(path.join(dir, fileName), path.join(dir, thumbName));
      }

      // Update index
      const index   = readIndex();
      index.unshift({ id, timestamp: ts, width: imgW, height: imgH, file: fileName, thumb: thumbName });
      const trimmed = index.slice(0, MAX_ENTRIES);
      for (const e of index.slice(MAX_ENTRIES)) deleteFiles(e);
      writeIndex(trimmed);
    } catch (err) {
      console.error('captureHistory.saveCapture error:', err);
    }
  })();
}

function getImage(id) {
  try {
    const entry = readIndex().find(e => e.id === id);
    if (!entry) return null;
    const fp = path.join(getCacheDir(), entry.file);
    return fs.existsSync(fp) ? 'data:image/png;base64,' + fs.readFileSync(fp).toString('base64') : null;
  } catch { return null; }
}

function getThumb(id) {
  try {
    const entry = readIndex().find(e => e.id === id);
    if (!entry) return null;
    const fname = entry.thumb || entry.file;
    const fp    = path.join(getCacheDir(), fname);
    if (!fs.existsSync(fp)) return null;
    const mime  = fname.endsWith('.jpg') ? 'jpeg' : 'png';
    return `data:image/${mime};base64,` + fs.readFileSync(fp).toString('base64');
  } catch { return null; }
}

function deleteEntry(id) {
  try {
    const index = readIndex();
    const entry = index.find(e => e.id === id);
    if (entry) deleteFiles(entry);
    writeIndex(index.filter(e => e.id !== id));
    return true;
  } catch { return false; }
}

module.exports = { readIndex, saveCapture, getImage, getThumb, deleteEntry, cleanup };
