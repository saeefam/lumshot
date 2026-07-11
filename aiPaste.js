// aiPaste.js — target resolution + focus-restore + paste for "Capture to AI"
// (main process).
//
// Platform interface consumed by main.js:
//   isSupported()               → this platform has an implementation
//   warmUp()                    → pre-spawn the helper off the capture path
//   findTargets(customApps, ms) → ranked candidate targets (see below), or []
//   focusAndPaste(hwnd, ms)     → { ok: true } | { ok: false, reason }
//   stop()                      → shut the helper down (app quit)
//
// Target model: the destination of a capture is "the AI tool the user is
// working with", which is deliberately NOT the foreground window — in the real
// workflow the user captures FROM a browser/preview/terminal TO the AI app
// they were just in. So candidates come from enumerating open windows in
// Z-ORDER (Windows Z-order encodes activation recency) and keeping only
// whitelisted AI/code apps: candidates[0] is the most recently used AI tool.
// Browsers and other general apps are never candidates.
//
// Only win32 is implemented. Everything degrades safely: on other platforms —
// or whenever the helper is missing/wedged — findTargets resolves [] and
// focusAndPaste resolves { ok: false }, so callers fall back to the normal
// capture flow / clipboard toast and never throw.
//
// The win32 backend drives focushelper.ps1, a resident PowerShell helper in the
// same pattern as screenshot.ps1 (spawned once, READY handshake, id-matched
// OK/ERR replies, per-request timeout so a wedged helper never hangs a capture).

const path = require('path');

const IS_WIN = process.platform === 'win32';

let helper      = null;  // the resident PowerShell process
let helperReady = null;  // Promise<boolean> — resolves true once it prints READY
let requestSeq  = 0;     // request id counter
const pending   = new Map(); // id → { resolve, timer }

function helperScriptPath() {
  // Same asar treatment as screenshot.ps1: an external process can't read from
  // the app.asar archive, so point PowerShell at the asarUnpack'd on-disk copy.
  return path.join(__dirname, 'focushelper.ps1')
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

// Match a helper reply ("OK <id> [payload]" | "ERR <id> [reason]") to its request.
function handleHelperLine(line) {
  const m = line.match(/^(OK|ERR)\s+(\S+)\s*(.*)$/);
  if (!m) return;
  const p = pending.get(m[2]);
  if (!p) return;                    // already timed out — ignore
  pending.delete(m[2]);
  clearTimeout(p.timer);
  p.resolve({ ok: m[1] === 'OK', payload: m[3] || '' });
}

// Spawn (once) and warm the resident helper; resolves true when READY.
function startHelper() {
  if (!IS_WIN) return Promise.resolve(false);
  if (helperReady) return helperReady;
  helperReady = new Promise((resolve) => {
    const { spawn } = require('child_process');
    let ps;
    try {
      ps = spawn('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperScriptPath()],
        { windowsHide: true });
    } catch (err) {
      console.error('focus helper spawn failed:', err);
      helperReady = null;            // allow a later retry
      return resolve(false);
    }
    helper = ps;
    let buf = '', ready = false;
    ps.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        if (!ready && line === 'READY') { ready = true; resolve(true); continue; }
        handleHelperLine(line);
      }
    });
    ps.on('error', (err) => { console.error('focus helper error:', err); });
    ps.on('exit', () => {
      helper = null; helperReady = null;
      if (!ready) resolve(false);
      // Fail any in-flight requests so their captures fall back gracefully.
      for (const [, p] of pending) { clearTimeout(p.timer); p.resolve(null); }
      pending.clear();
    });
  });
  return helperReady;
}

// Send one command line and await its id-matched reply.
// Resolves { ok, payload } or null on any transport failure / timeout.
function sendRequest(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    startHelper().then((ready) => {
      if (!ready || !helper || !helper.stdin || !helper.stdin.writable) return resolve(null);
      const id = 'f' + (++requestSeq);
      const timer = setTimeout(() => {
        if (pending.delete(id)) resolve(null);
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      try {
        helper.stdin.write(`${cmd} ${id}${args ? ' ' + args : ''}\n`);
      } catch (err) {
        pending.delete(id);
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

function isSupported() { return IS_WIN; }

// Pre-spawn so the Add-Type compile happens at startup, not on the first
// hotkey press. Fire-and-forget.
function warmUp() { startHelper(); }

// Known AI-assistant / code-editor executables → friendly names. ONLY these
// (plus the user's captureToAI.customApps) are ever auto-paste targets: the
// feature exists for AI chat and coding workflows, so browsers, terminals and
// other general apps are never candidates. Keys are lowercased exe basenames.
const AI_APPS = {
  'cursor.exe':          'Cursor',
  'claude.exe':          'Claude',
  'chatgpt.exe':         'ChatGPT',
  'codex.exe':           'Codex',
  'code.exe':            'VS Code',
  'code - insiders.exe': 'VS Code Insiders',
  'windsurf.exe':        'Windsurf',
  'zed.exe':             'Zed',
  'antigravity ide.exe': 'Antigravity',
  'antigravity.exe':     'Antigravity',
  'trae.exe':            'Trae',
};

// "custom app" fallback label: "antigravity ide.exe" → "Antigravity Ide"
function titleCaseStem(base) {
  return base.replace(/\.exe$/, '').replace(/(^|[\s-_])\w/g, (c) => c.toUpperCase());
}

// Ranked candidate destinations for a capture. The helper reports every
// top-level window in Z-order (most recently activated first); we keep the
// most recent window per whitelisted app. hwnds stay strings — opaque tokens
// that only travel back to the helper.
async function findTargets(customApps, timeoutMs = 2000) {
  const res = await sendRequest('ENUM', '', timeoutMs);
  if (!res || !res.ok || !res.payload) return [];

  const allowed = new Map(Object.entries(AI_APPS));
  for (const raw of Array.isArray(customApps) ? customApps : []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    let name = raw.trim().toLowerCase();
    if (!name.endsWith('.exe')) name += '.exe';
    if (!allowed.has(name)) allowed.set(name, titleCaseStem(name));
  }

  const targets = [];
  const seen = new Set();
  // records: "<hwnd> <pid> <exePath>|<title>" joined by U+001E (see helper).
  for (const rec of res.payload.split('\u001E')) {
    const m = rec.match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const sep = m[3].indexOf('|');
    const exe = (sep >= 0 ? m[3].slice(0, sep) : m[3]).trim();
    const base = exe ? path.basename(exe).toLowerCase() : '';
    if (!allowed.has(base)) continue; // not an AI/code app — never a target
    if (seen.has(base)) continue;     // older window of the same app
    seen.add(base);
    targets.push({
      hwnd:    m[1],
      pid:     Number(m[2]),
      exe,
      title:   (sep >= 0 ? m[3].slice(sep + 1) : '').trim(),
      appName: allowed.get(base),
    });
  }
  return targets;
}

// Restore/focus the target and simulate Ctrl+V. The helper verifies the window
// still exists, refuses elevated targets (UIPI would eat the keystrokes
// silently), confirms the target is actually foreground before typing, and
// reports a typed reason on failure. The generous JS timeout only guards
// against a wedged helper — the helper's own budget is ~1s worst case.
async function focusAndPaste(hwnd, timeoutMs = 4000) {
  const res = await sendRequest('PASTE', String(hwnd), timeoutMs);
  if (!res) return { ok: false, reason: 'helper-unavailable' };
  return res.ok ? { ok: true } : { ok: false, reason: res.payload || 'unknown' };
}

function stop() {
  const ps = helper;
  helper = null; helperReady = null;
  if (ps) {
    try { ps.stdin.write('EXIT\n'); ps.stdin.end(); } catch (e) { /* already gone */ }
    try { ps.kill(); } catch (e) { /* ignore */ }
  }
}

module.exports = {
  isSupported,
  warmUp,
  findTargets,
  focusAndPaste,
  stop,
};
