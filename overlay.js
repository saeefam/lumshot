// overlay.js — capture control bar + region selector drawn over the LIVE desktop.
//
// The window is transparent, so a semi-opaque fill dims the real desktop and the
// selection rectangle is "punched through" (clearRect) to reveal it at full
// brightness. No screenshot is loaded here — the actual pixels are grabbed and
// cropped in the main process. We only report the selected rectangle + the chosen
// capture mode.

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const hint = document.getElementById('hint');
const modeButtons = Array.from(document.querySelectorAll('.mode'));
const scrollActions = document.getElementById('scroll-actions');

let dragging = false;
let startX = 0, startY = 0, curX = 0, curY = 0;

// Cursor position in CSS px, tracked window-wide so the precision aids follow
// the mouse before/without a drag. -1 until the first move of a session, so
// nothing is ever drawn at a stale or (0,0) position.
let mouseX = -1, mouseY = -1;
let mouseOnCanvas = false; // false while hovering the control bar / confirm bar

// ─── Precision aids (crosshair / magnifier) ────────────────────────────────────
// Region-capture-only helpers, configured in Preferences and quick-toggled with
// C / M while the overlay is open. Deliberately no on-screen controls — the bar
// stays minimal. State is re-applied on every reset via the overlay-reset payload.
const aids = { crosshair: true, magnifier: false };
const AID_SETTING_KEYS = {
  crosshair: 'captureCrosshair',
  magnifier: 'captureMagnifier',
};

// The background grab at physical resolution — the SAME frame main crops the
// final capture from. Every session paints it as a frozen backdrop (moving
// content holds still, and what you see is exactly what gets captured); the
// magnifier samples it. Freezing is automatic, not a user-facing option.
let frameCanvas = null;  // offscreen canvas holding the decoded frame
let frameReady  = false; // false until this session's frame has arrived

// rAF-batched redraw: mousemove can fire far above the display refresh rate.
let rafPending = false;
function scheduleDraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; draw(); });
}

// In scroll mode the selection is "frozen" after the drag so the user can review
// it and press Start (rather than capturing immediately like region).
let frozenRect = null;

// True while a scroll capture is running: the overlay is HELD on screen as
// continuous feedback (dimmed surroundings + the bright frozen selection), with
// every control hidden. Set via onOverlayCapturing from main.
let capturing = false;

// ─── AI-workflow state ─────────────────────────────────────────────────────────
// aiTargets: the running AI apps ({ appName, icon, img }), most recently used
// first — the destination badge and Tab cycling draw from it. Arrives either
// inline in overlay-reset (Ctrl+Shift+A entry — badge ready on frame one) or
// via onOverlayAiTargets (normal entry, resolved just after reveal). Empty →
// the AI tab is unavailable. aiIndex is the current pick, reported back with
// the selection (region-selected carries it when mode is 'ai').
let aiTargets = [];
let aiIndex = 0;
const aiModeBtn = modeButtons.find((b) => b.dataset.mode === 'ai');

function setAiTargets(list) {
  aiTargets = Array.isArray(list) ? list.map((t) => {
    const o = { appName: (t && t.appName) || 'App', img: null };
    if (t && t.icon) {
      o.img = new Image();
      o.img.onload = () => scheduleDraw(); // repaint the badge once decoded
      o.img.src = t.icon;
    }
    return o;
  }) : [];
  aiIndex = 0;
  if (aiModeBtn) aiModeBtn.classList.toggle('unavailable', aiTargets.length === 0);
  if (mode === 'ai') { updateHint(); scheduleDraw(); }
}

window.electronAPI.onOverlayAiTargets((targets) => setAiTargets(targets));

// Current capture mode. Drag-based modes draw a selection rectangle; immediate
// modes fire as soon as the bar button is clicked. 'ai' is the dedicated AI
// Screenshot workflow: drag like region, then the capture is pasted straight
// into the chosen AI app (it also swaps the bar — see body.ai-workflow CSS).
let mode = 'region';
// Drag-based modes draw a selection rectangle. OCR is one of them: the user drags
// an area, which is then captured and opened in the editor's OCR (text) flow.
const DRAG_MODES = new Set(['region', 'scroll', 'ocr', 'ai']);

// Hint text shown beneath the bar. Region/Window/Full Screen fall through to
// the baseline "Esc · cancel" hint (per the General-overlay hint strip spec);
// the drag modes that need extra instruction override it.
const HINT_DOT = ' <span class="hint-dot">&middot;</span> ';
const BASE_HINT = '<kbd>Esc</kbd> cancel';
const HINTS = {
  scroll: 'Drag to select the area to scroll-capture' + HINT_DOT + BASE_HINT,
  ocr:    'Drag to select text to extract' + HINT_DOT + BASE_HINT,
};

// The canvas backing store is at the display's PHYSICAL resolution (CSS px ×
// devicePixelRatio) while all interaction logic stays in CSS px (== DIP, which
// is also what the main process expects in the reported rect). Without this,
// every stroke, label and the frozen backdrop would be composited up by the OS
// display scale (125% / 150% / 175%…) and visibly blurred.
let dpr = window.devicePixelRatio || 1;
// Align a CSS coordinate to the device-pixel grid so edges land on whole pixels.
const snap = (v) => Math.round(v * dpr) / dpr;

function sizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(window.innerWidth  * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

window.addEventListener('resize', () => { sizeCanvas(); draw(); });
sizeCanvas();
draw();

// Main re-shows this (reused) window for each capture — reset selection state.
// The payload carries the persisted precision-aid toggles so the overlay opens
// with them already applied (no async fetch, no visible flip).
window.electronAPI.onOverlayReset((aidState) => {
  dragging = false;
  startX = startY = curX = curY = 0;
  frozenRect = null;
  mouseX = mouseY = -1;
  mouseOnCanvas = false;
  frameReady = false; // last session's pixels are stale — never show them
  // Clear any leftover held-capture state so the reused overlay starts clean
  // (bar/hint/cursor restored) even if the previous session was a scroll capture.
  if (capturing) {
    capturing = false;
    document.getElementById('bar').style.display = '';
    document.body.style.cursor = '';
  }
  aids.crosshair = !!(aidState && aidState.crosshair);
  aids.magnifier = !!(aidState && aidState.magnifier);
  // Inline on AI-hotkey entry; null on normal entry (arrives via
  // onOverlayAiTargets moments later — the AI tab is unavailable until then).
  setAiTargets(aidState && aidState.aiTargets);
  // Every capture selects on the frozen frame — fetch it unconditionally.
  window.electronAPI.requestOverlayFrame();
  hideScrollActions();
  setMode('region');
  sizeCanvas();
  draw();
});

// Main → overlay: switch to a specific mode after reset (used by the Capture
// Scroll and Capture-in-OCR-Mode menu items).
window.electronAPI.onOverlaySetMode((m) => setMode(m));

// Main → overlay: enter/leave the scroll-capture "hold" state. On enter we strip
// the overlay down to just the frozen selection over the dimmed desktop — no bar,
// hint, confirm buttons, corner handles, size label or precision aids — matching
// exactly what the user saw at selection time, and hold it there for the whole
// capture. On leave main hides the window, so we just reset the flag.
window.electronAPI.onOverlayCapturing((on) => {
  capturing = !!on;
  if (capturing) {
    hideScrollActions();
    hint.style.display = 'none';
    document.getElementById('bar').style.display = 'none';
    document.body.style.cursor = 'default';
  } else {
    document.getElementById('bar').style.display = '';
    document.body.style.cursor = '';
  }
  draw();
});

// ─── Mode selection ───────────────────────────────────────────────────────────
function setMode(m) {
  // Crossfade the tab row when Region/AI Snap switch between the General and
  // AI overlays — the two have different tab sets, so a bare swap reads as a
  // flicker. Immaterial for same-overlay mode changes (window/scroll/ocr/…).
  const switchingOverlay = (mode === 'ai') !== (m === 'ai');
  mode = m;
  frozenRect = null;
  hideScrollActions();
  // The AI workflow gets its own dedicated bar (AI + Region only, AI first).
  document.body.classList.toggle('ai-workflow', m === 'ai');
  modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  updateHint();
  draw();
  if (switchingOverlay) {
    document.body.classList.add('switching');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.body.classList.remove('switching');
    }));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function updateHint() {
  // AI workflow: the hint names the destination (custom exe names are
  // user-supplied, hence the escape) and how to switch it.
  if (mode === 'ai') {
    hint.style.display = 'flex';
    if (aiTargets.length) {
      hint.innerHTML = 'Sends to <b>' + escapeHtml(aiTargets[aiIndex].appName) + '</b>'
        + (aiTargets.length > 1 ? HINT_DOT + '<kbd>Tab</kbd> switch app' : '')
        + HINT_DOT + BASE_HINT;
    } else {
      hint.innerHTML = BASE_HINT;
    }
    return;
  }
  hint.style.display = 'flex';
  hint.innerHTML = HINTS[mode] || BASE_HINT;
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const m = btn.dataset.mode;
    if (DRAG_MODES.has(m)) {
      // Drag modes: just switch — the user then drags a selection.
      dragging = false;
      setMode(m);
    } else {
      // Immediate modes (window / fullscreen): fire right away. Main takes over
      // (hides the overlay, opens the picker, …).
      setMode(m);
      window.electronAPI.captureWithMode(m);
    }
  });
});

document.getElementById('cancel').addEventListener('click', () => {
  window.electronAPI.cancelSelection();
});

// ─── Precision-aid quick toggles (C / M, region mode only) ────────────────────
// No on-screen buttons: the persistent switches live in Preferences; these keys
// exist so the aids can be flipped mid-capture without leaving the overlay.
function toggleAid(name) {
  aids[name] = !aids[name];
  // Persist so Preferences and the next capture reflect the change
  window.electronAPI.setSetting(AID_SETTING_KEYS[name], aids[name]);
  draw();
}

// Frame arrival: raw BGRA (Windows byte order) at physical resolution → RGBA
// ImageData on an offscreen canvas. Uint32 swizzle per pixel (LE): 0xAARRGGBB →
// 0xAABBGGRR, alpha forced opaque (BitBlt-sourced grabs can leave it at 0).
window.electronAPI.onOverlayFrame((d) => {
  if (!d || !d.buffer || d.buffer.byteLength < d.width * d.height * 4) return;
  // Uint32Array needs 4-byte alignment; a cloned Node Buffer may not have it.
  const u8 = d.buffer.byteOffset % 4 === 0 ? d.buffer : d.buffer.slice();
  if (!frameCanvas) frameCanvas = document.createElement('canvas');
  frameCanvas.width = d.width;
  frameCanvas.height = d.height;
  const fctx = frameCanvas.getContext('2d');
  const img = fctx.createImageData(d.width, d.height);
  const src = new Uint32Array(u8.buffer, u8.byteOffset, d.width * d.height);
  const dst = new Uint32Array(img.data.buffer);
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    dst[i] = 0xFF000000 | (v & 0x0000FF00) | ((v & 0xFF) << 16) | ((v >>> 16) & 0xFF);
  }
  fctx.putImageData(img, 0, 0);
  frameReady = true;
  draw();
});

// ─── Scroll-capture confirm bar ────────────────────────────────────────────────
function showScrollActions(r) {
  // Position just below the selection, clamped to the viewport.
  const barW = scrollActions.offsetWidth || 360;
  const barH = scrollActions.offsetHeight || 46;
  let left = r.x + r.w / 2 - barW / 2;
  let top  = r.y + r.h + 12;
  if (top + barH > window.innerHeight - 8) top = Math.max(8, r.y - barH - 12);
  left = Math.max(8, Math.min(left, window.innerWidth - barW - 8));
  scrollActions.style.left = `${left}px`;
  scrollActions.style.top  = `${top}px`;
  scrollActions.style.display = 'flex';
}
function hideScrollActions() { scrollActions.style.display = 'none'; }

document.getElementById('sc-start').addEventListener('click', () => {
  if (frozenRect) window.electronAPI.sendRegionSelected({ ...frozenRect, mode: 'scroll' });
});
document.getElementById('sc-reselect').addEventListener('click', () => {
  frozenRect = null;
  hideScrollActions();
  hint.style.display = 'flex';
  hint.innerHTML = HINTS.scroll;
  draw();
});
document.getElementById('sc-cancel').addEventListener('click', () => {
  window.electronAPI.cancelSelection();
});

// Brand accent for canvas-drawn chrome — canvas styles can't use CSS var(), so
// read the token from theme.css once. Falls back to the current brand teal.
const BRAND_RGB = getComputedStyle(document.documentElement)
  .getPropertyValue('--brand-rgb').trim() || '33, 210, 187';

// App --surface (editor.html's dark-theme panel color, #161619) for canvas-drawn
// chrome behind the AI badge / magnifier. Same rationale as BRAND_RGB above:
// canvas fillStyle can't consume CSS var(), so this is kept in sync by hand.
const SURFACE_HEX = '#161619';

// Accent colour for the selection chrome. OCR keeps a distinct green (it's a
// different kind of capture — text, not pixels); scroll and AI both use the
// brand mint so the capture chrome stays on-brand (no off-palette amber).
function modeColor() {
  if (mode === 'scroll') return BRAND_RGB;         // brand accent — scroll capture
  if (mode === 'ocr')    return '48, 209, 88';     // green — OCR text capture
  if (mode === 'ai')     return BRAND_RGB;         // brand accent — AI Screenshot
  return '255, 255, 255';                          // region — white
}

// Draw the dim + a selection rectangle. `rect` is either the live drag or the
// frozen scroll selection. When `minimal` (the held scroll-capture feedback), only
// the punch-through + border are drawn — no corner handles or size label — for a
// clean, unobtrusive "this is being captured" look that holds for the whole run.
function drawSelection(rect, rgb, minimal) {
  const { x, y, w, h } = rect;
  if (w < 1 || h < 1) return;

  // Punch through the tint → desktop shows at full brightness here. Done in
  // DEVICE space, 1:1 against the frozen frame (both are physical resolution),
  // so the revealed selection is pixel-exact — zero resampling. Without a frame
  // yet, clearRect reveals the live desktop as before.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dx = Math.round(x * dpr), dy = Math.round(y * dpr);
  const dw = Math.round(w * dpr), dh = Math.round(h * dpr);
  ctx.clearRect(dx, dy, dw, dh);
  // In the held capture state the selection must reveal the LIVE (scrolling) page,
  // so leave it transparent — don't paint the frozen start-of-capture frame here.
  if (frameReady && !minimal) ctx.drawImage(frameCanvas, dx, dy, dw, dh, dx, dy, dw, dh);
  ctx.restore();

  // Border around the selection — 1 logical px rendered as a whole number of
  // device pixels (1 @100%, 2 @150–200%), edges snapped to the device grid so
  // it stays hairline-thin and crisp at any display scale.
  const bw = Math.max(1, Math.round(dpr)) / dpr;
  ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
  ctx.lineWidth = bw;
  ctx.strokeRect(snap(x) + bw / 2, snap(y) + bw / 2, snap(w) - bw, snap(h) - bw);

  if (minimal) return; // held capture feedback: border only (no handles / label)

  // Small circles at each corner
  const hs = snap(7);
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath();
    ctx.arc(snap(cx), snap(cy), hs / 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Dimensions label
  if (w > 40 && h > 20) {
    const label = `${Math.round(w)} × ${Math.round(h)}`;
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const tw = ctx.measureText(label).width;
    const lx = snap(x + w / 2 - tw / 2 - 8);
    const ly = snap(y > 36 ? y - 34 : y + h + 8);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(lx, ly, snap(tw + 16), snap(24));
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, lx + 8, ly + 17);
  }
}

function draw() {
  // Held scroll-capture feedback: dim only the SURROUNDINGS and leave the
  // selection fully transparent so the LIVE page scrolling underneath shows
  // through at full brightness (matching the reference). Drawn as a dim frame of
  // four rects around the selection, plus the accent border — no frozen backdrop
  // (that would freeze the moving page inside the selection).
  if (capturing && frozenRect) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = Math.round(frozenRect.x * dpr), sy = Math.round(frozenRect.y * dpr);
    const sw = Math.round(frozenRect.w * dpr), sh = Math.round(frozenRect.h * dpr);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, sy);                                   // top
    ctx.fillRect(0, sy + sh, canvas.width, canvas.height - (sy + sh));      // bottom
    ctx.fillRect(0, sy, sx, sh);                                           // left
    ctx.fillRect(sx + sw, sy, canvas.width - (sx + sw), sh);              // right
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSelection(frozenRect, modeColor(), true);
    return;
  }

  // Backdrop pass in DEVICE space. The frozen frame and the backing store are
  // both at physical resolution, so drawImage with no scaling is pixel-exact —
  // the desktop looks identical to live, it just holds still.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Frozen backdrop (automatic on every capture): the "desktop" the user dims
  // and selects on is the exact still that will be captured, so moving content
  // (video, animations) holds still. Until the frame arrives (a few hundred ms)
  // this falls through to the live desktop, which looks identical unless
  // something on screen is moving.
  if (frameReady) {
    ctx.drawImage(frameCanvas, 0, 0);
  }

  // Dim the (live or frozen) desktop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Everything below works in CSS coordinates, mapped onto the device grid.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rgb = modeColor();

  if (dragging) {
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const w = Math.abs(curX - startX);
    const h = Math.abs(curY - startY);
    drawSelection({ x, y, w, h }, rgb);
  } else if (frozenRect) {
    drawSelection(frozenRect, rgb, capturing);
  }

  if (!capturing) drawAids();
}

// ─── Precision-aid rendering ───────────────────────────────────────────────────
function drawAids() {
  if (mode !== 'region' && mode !== 'ai') return; // region/AI selection helpers only
  if (!mouseOnCanvas && !dragging) return; // hovering the bar, or cursor left the window
  const ax = dragging ? curX : mouseX;
  const ay = dragging ? curY : mouseY;
  if (ax < 0 || ay < 0) return;            // no cursor position yet this session

  if (aids.crosshair) drawCrosshair(ax, ay);
  if (mode === 'ai') {
    // AI workflow: the magnifier's spot by the cursor shows the destination
    // instead — where this capture will be pasted. Not an optional aid: the
    // destination should always be in view while selecting.
    drawAiBadge(ax, ay);
    if (aids.crosshair) drawCoordLabel(ax, ay);
    return;
  }
  if (aids.magnifier && frameReady) drawMagnifier(ax, ay);
  if (aids.crosshair || (aids.magnifier && frameReady)) drawCoordLabel(ax, ay);
}

// ─── AI destination badge ──────────────────────────────────────────────────────
// Replaces the magnifier in the AI workflow: a small card that follows the
// cursor showing the LOGO of the app this capture will be pasted into (the
// exe's real icon, provided by main). Falls back to the app's initial letter
// while the icon decodes or when the exe has none.
const BADGE_CSS  = 56;  // card side in CSS px
const BADGE_ICON = 34;  // logo side in CSS px

function drawAiBadge(x, y) {
  const t = aiTargets[aiIndex];
  if (!t) return;
  const size = Math.round(BADGE_CSS * dpr);
  const off  = Math.round(24 * dpr);
  const edge = Math.round(8 * dpr);

  // Cursor and card position in device px; flip per-axis near screen edges
  // (same placement rules as the magnifier it replaces).
  const dx = Math.round(x * dpr), dy = Math.round(y * dpr);
  let bx = dx + off, by = dy + off;
  if (bx + size > canvas.width  - edge) bx = dx - off - size;
  if (by + size > canvas.height - edge) by = dy - off - size;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r = Math.round(14 * dpr);
  ctx.beginPath();
  ctx.roundRect(bx, by, size, size, r);
  ctx.fillStyle = SURFACE_HEX;                        // app --surface
  ctx.fill();
  ctx.strokeStyle = `rgba(${BRAND_RGB}, 0.9)`;        // brand accent — destination
  ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr));
  ctx.stroke();

  const icon = Math.round(BADGE_ICON * dpr);
  const ix = bx + Math.round((size - icon) / 2);
  const iy = by + Math.round((size - icon) / 2);
  if (t.img && t.img.complete && t.img.naturalWidth) {
    ctx.drawImage(t.img, ix, iy, icon, icon);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.round(22 * dpr) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.appName.charAt(0).toUpperCase(), bx + size / 2, by + size / 2 + Math.round(dpr));
  }
  ctx.restore();
}

// Full-height/width hairlines through the cursor, drawn in DEVICE space so the
// white line is exactly one physical pixel on the pixel grid. A soft dark
// under-stroke keeps it readable over light content inside the punched selection.
function drawCrosshair(x, y) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dx = Math.round(x * dpr) + 0.5;
  const dy = Math.round(y * dpr) + 0.5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(dx, 0); ctx.lineTo(dx, canvas.height);
  ctx.moveTo(0, dy); ctx.lineTo(canvas.width, dy);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dx, 0); ctx.lineTo(dx, canvas.height);
  ctx.moveTo(0, dy); ctx.lineTo(canvas.width, dy);
  ctx.stroke();
  ctx.restore();
}

// Cursor position in physical pixels, X stacked over Y beside the cursor.
// Text renders through the dpr transform → native-resolution glyphs.
function drawCoordLabel(x, y) {
  const lines = [String(Math.round(x * dpr)), String(Math.round(y * dpr))];
  const vw = canvas.width / dpr, vh = canvas.height / dpr; // viewport in CSS px
  ctx.save();
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const w = Math.max(ctx.measureText(lines[0]).width, ctx.measureText(lines[1]).width) + 14;
  const h = 34;
  let lx = x + 14, ly = y + 14;
  if (lx + w > vw - 4) lx = x - 14 - w;
  if (ly + h > vh - 4) ly = y - 14 - h;
  lx = snap(lx); ly = snap(ly);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.beginPath(); ctx.roundRect(lx, ly, snap(w), h, 6); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(lines[0], lx + 7, ly + 14);
  ctx.fillText(lines[1], lx + 7, ly + 28);
  ctx.restore();
}

// Zoomed pixel view around the cursor, sampled from the SAME frame the final
// capture is cropped from — the pixel the user lines up is the pixel they get.
// Drawn entirely in DEVICE space with an integer number of device pixels per
// source pixel, so cells are perfectly square and grid lines are hairline-crisp.
const MAG_SRC      = 15; // source pixels per side (odd → exact centre pixel)
const MAG_CSS_CELL = 9;  // target cell size in CSS px — rounded to whole device px

function drawMagnifier(x, y) {
  const cell = Math.max(4, Math.round(MAG_CSS_CELL * dpr)); // device px per source px
  const size = MAG_SRC * cell;
  const off  = Math.round(24 * dpr);
  const edge = Math.round(8 * dpr);

  // Cursor and box position in device px; flip per-axis near screen edges.
  const dx = Math.round(x * dpr), dy = Math.round(y * dpr);
  let bx = dx + off, by = dy + off;
  if (bx + size > canvas.width  - edge) bx = dx - off - size;
  if (by + size > canvas.height - edge) by = dy - off - size;

  // Centre source pixel under the cursor — frame px ARE device px (both physical)
  const sx = dx - (MAG_SRC - 1) / 2;
  const sy = dy - (MAG_SRC - 1) / 2;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r = Math.round(12 * dpr);
  ctx.beginPath();
  ctx.roundRect(bx, by, size, size, r);
  ctx.clip();

  // Backdrop shows through where the sample area runs past the screen edge
  ctx.fillStyle = SURFACE_HEX;                        // app --surface
  ctx.fillRect(bx, by, size, size);

  ctx.imageSmoothingEnabled = false; // blocky pixels — the whole point
  ctx.drawImage(frameCanvas, sx, sy, MAG_SRC, MAG_SRC, bx, by, size, size);

  // Pixel grid on integer device coordinates
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < MAG_SRC; i++) {
    ctx.moveTo(bx + i * cell + 0.5, by);
    ctx.lineTo(bx + i * cell + 0.5, by + size);
    ctx.moveTo(bx, by + i * cell + 0.5);
    ctx.lineTo(bx + size, by + i * cell + 0.5);
  }
  ctx.stroke();

  // Centre pixel: black outer + white inner outline so it reads on any colour
  const cc = (MAG_SRC - 1) / 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeRect(bx + cc * cell - 0.5, by + cc * cell - 0.5, cell + 1, cell + 1);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(bx + cc * cell + 0.5, by + cc * cell + 0.5, cell - 1, cell - 1);
  ctx.restore();

  // Border drawn outside the clip so it sits crisply on top
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx + 1, by + 1, size - 2, size - 2, Math.max(1, r - 1));
  ctx.stroke();
  ctx.restore();
}

// Mouse coordinates in CSS pixels relative to the canvas
function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('mousedown', (e) => {
  if (!DRAG_MODES.has(mode)) return; // immediate modes don't drag
  if (frozenRect) return;            // scroll selection awaiting Start — ignore
  const { x, y } = toCanvasCoords(e);
  dragging = true;
  startX = x; startY = y; curX = x; curY = y;
  hint.style.display = 'none';
});

canvas.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const { x, y } = toCanvasCoords(e);
  curX = x; curY = y;
  scheduleDraw();
});

// Window-level tracking so the aids follow the cursor before/without a drag.
// Over the control bar (target ≠ canvas) the aids hide — measuring the bar's
// own pixels is never what the user wants. With every aid off this schedules
// no redraws, preserving today's idle behaviour exactly.
window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  mouseOnCanvas = e.target === canvas;
  // AI mode always redraws: the destination badge follows the cursor even
  // with every optional aid switched off.
  if ((mode === 'region' && (aids.crosshair || aids.magnifier)) || mode === 'ai') scheduleDraw();
});

// Cursor left the window (e.g. onto a second monitor) — hide the aids.
window.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) { mouseOnCanvas = false; scheduleDraw(); }
});

canvas.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const { x, y } = toCanvasCoords(e);
  curX = x; curY = y;

  const rx = Math.min(startX, curX);
  const ry = Math.min(startY, curY);
  const rw = Math.abs(curX - startX);
  const rh = Math.abs(curY - startY);

  // Ignore tiny accidental clicks — restore the hint and keep waiting.
  if (rw < 10 || rh < 10) {
    draw();
    updateHint();
    return;
  }

  // Scroll mode: freeze the selection and ask the user to confirm with Start.
  if (mode === 'scroll') {
    frozenRect = { x: rx, y: ry, w: rw, h: rh };
    hint.style.display = 'none';
    draw();
    showScrollActions(frozenRect);
    return;
  }

  // Region / OCR / AI: report immediately. OCR carries the flag that opens the
  // editor's text-extraction flow; AI carries the chosen destination index.
  window.electronAPI.sendRegionSelected({
    x: rx, y: ry, w: rw, h: rh, mode,
    ocr: mode === 'ocr',
    ...(mode === 'ai' ? { aiIndex } : {}),
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.electronAPI.cancelSelection();
  if (e.key === 'Enter' && frozenRect) window.electronAPI.sendRegionSelected({ ...frozenRect, mode: 'scroll' });

  // AI workflow: Tab cycles the destination among the running AI apps (the
  // badge and hint follow). preventDefault keeps focus off the bar buttons.
  if (e.key === 'Tab' && mode === 'ai') {
    e.preventDefault();
    if (aiTargets.length > 1) {
      aiIndex = (aiIndex + 1) % aiTargets.length;
      updateHint();
      scheduleDraw();
    }
    return;
  }

  // Precision-aid quick toggles — bare keypresses. The crosshair applies to
  // both selection workflows; the magnifier is region-only (the AI workflow
  // shows the destination badge in its place).
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (mode !== 'region' && mode !== 'ai') return;
  const k = e.key.toLowerCase();
  if (k === 'c') toggleAid('crosshair');
  else if (k === 'm' && mode === 'region') toggleAid('magnifier');
});
