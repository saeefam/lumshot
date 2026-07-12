// editor.js — Lumshot editor renderer

// Beta release: pricing is fully disabled and every feature behaves as if
// licensed (no export watermark, watermark controls unlocked). The real
// license system underneath is untouched — flip this back to false to
// restore normal pricing behavior.
const BETA_FREE_MODE = true;

// ─── DOM references ────────────────────────────────────────────────────────────
const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');

// Brand accent for canvas-drawn chrome (crop frame, selection overlay) —
// canvas styles can't use CSS var(), so read the token from theme.css once.
const CANVAS_ACCENT = getComputedStyle(document.documentElement)
  .getPropertyValue('--accent-hover').trim() || '#52EAC4';
const placeholder   = document.getElementById('placeholder');
const copyBtn       = document.getElementById('tb-copy-btn');
const saveBtn       = document.getElementById('tb-save-btn');
const toolbarStack  = document.getElementById('annotation-bar');
const annProps      = document.getElementById('tool-props');
const annPropsWrap  = document.getElementById('tool-props-wrap');
const abTools       = document.getElementById('ab-tools');
const tbarLeft      = document.querySelector('#annotation-bar .tbar-left');
const tbarRight     = document.querySelector('#annotation-bar .tbar-right');
const canvasArea    = document.getElementById('canvas-area');
const dragOutHandle = document.getElementById('drag-out-handle');
const textInput     = document.getElementById('text-input');
const annTextOpts   = document.getElementById('ann-text-opts');
const advTextOpts             = document.getElementById('adv-text-opts');
const advTextPaletteSlot      = document.getElementById('adv-text-palette-slot');
const advTextFontSizeEl       = document.getElementById('adv-text-fontsize');
const advTextFontSizeVal      = document.getElementById('adv-text-fontsize-val');
const advTextOutlineToggleEl  = document.getElementById('adv-text-outline-toggle');
const advTextOutlineGroupEl   = document.getElementById('adv-text-outline-group');
const advTextOutlinePaletteSlot = document.getElementById('adv-text-outline-palette-slot');
const annBlurOpts    = document.getElementById('ann-blur-opts');
const blurHardnessSegEl = annBlurOpts.querySelector('.blur-hardness-seg');
const advBlurOpts             = document.getElementById('adv-blur-opts');
const advBlurTypeSegEl        = document.getElementById('adv-blur-type-seg');
const advBlurHardnessEl       = document.getElementById('adv-blur-hardness');
const advBlurHardnessVal      = document.getElementById('adv-blur-hardness-val');

// ── Redesign tool-property panels & controls (Stage 2) ──
const annColors      = document.getElementById('ann-colors');
const annShapeOpts   = document.getElementById('ann-shape-opts');
const annCropOpts    = document.getElementById('ann-crop-opts');
const annArrowOpts   = document.getElementById('ann-arrow-opts');
// Shape-type picker (merged Shape tool: Line / Rectangle / Circle). Selects by
// [data-shape] rather than a class so it picks up BOTH instances — the
// toolbar's compact icon buttons (.shapetype-btn) and the Advanced Properties
// segmented control (.seg-btn) — under one shared active-state/click wiring.
const annShapeTypeOpts = document.getElementById('ann-shapetype-opts');
const shapeTypeBtns    = Array.from(document.querySelectorAll('[data-shape]'));
const cropCancelEl   = document.getElementById('crop-cancel');
const cropConfirmEl  = document.getElementById('crop-confirm');
// Advanced Properties (right sidebar) — always the first section, body swaps per tool.
const advPropsSection = document.getElementById('adv-props-section');
const advPropsBadgeText = document.getElementById('adv-props-badge-text');
const advCropOpts     = document.getElementById('adv-crop-opts');
const advCropCancelEl  = document.getElementById('adv-crop-cancel');
const advCropConfirmEl = document.getElementById('adv-crop-confirm');
const advCropPaletteSlot = document.getElementById('adv-crop-palette-slot');
const advArrowOpts        = document.getElementById('adv-arrow-opts');
const advArrowPaletteSlot = document.getElementById('adv-arrow-palette-slot');
const advArrowTextToggleEl = document.getElementById('adv-arrow-text-toggle');
const advArrowTextGroupEl  = document.getElementById('adv-arrow-text-group');
const advArrowTextSizeEl   = document.getElementById('adv-arrow-text-size');
const advArrowTextSizeVal  = document.getElementById('adv-arrow-text-size-val');
const advArrowStyleSegEl   = document.getElementById('adv-arrow-style-seg');
const advShapeOpts         = document.getElementById('adv-shape-opts');
const advShapeLineOptsEl   = document.getElementById('adv-shape-line-opts');
const advShapeLinePaletteSlot = document.getElementById('adv-shape-line-palette-slot');
const advShapeLineWeightEl = document.getElementById('adv-shape-line-weight');
const advShapeLineWeightVal = document.getElementById('adv-shape-line-weight-val');
const advShapeLineOpacityEl = document.getElementById('adv-shape-line-opacity');
const advShapeLineOpacityVal = document.getElementById('adv-shape-line-opacity-val');
const advShapeRectEllipseOptsEl = document.getElementById('adv-shape-rectellipse-opts');
const advShapeFillToggleEl = document.getElementById('adv-shape-fill-toggle');
const advShapeFillColorGroupEl = document.getElementById('adv-shape-fill-color-group');
const advShapeFillPaletteSlot = document.getElementById('adv-shape-fill-palette-slot');
const advShapeOutlineToggleEl = document.getElementById('adv-shape-outline-toggle');
const advShapeOutlineGroupEl = document.getElementById('adv-shape-outline-group');
const advShapeOutlinePaletteSlot = document.getElementById('adv-shape-outline-palette-slot');
const advShapeOutlineWidthEl = document.getElementById('adv-shape-outline-width');
const advShapeOutlineWidthVal = document.getElementById('adv-shape-outline-width-val');
const advShapeRadiusGroupEl = document.getElementById('adv-shape-radius-group');
const advShapeRadiusEl = document.getElementById('adv-shape-radius');
const advShapeRadiusVal = document.getElementById('adv-shape-radius-val');
const advShapeOpacityEl = document.getElementById('adv-shape-opacity');
const advShapeOpacityVal = document.getElementById('adv-shape-opacity-val');
const annCounterOpts = document.getElementById('ann-counter-opts');
const counterSizeEl  = document.getElementById('counter-size');
const counterSizeVal = document.getElementById('counter-size-val');
const advCounterOpts        = document.getElementById('adv-counter-opts');
const advCounterPaletteSlot = document.getElementById('adv-counter-palette-slot');
// Highlight (marker) options
const annHighlightOpts    = document.getElementById('ann-highlight-opts');
const highlightWidthEl    = document.getElementById('highlight-width');
const highlightWidthVal   = document.getElementById('highlight-width-val');
const advHighlightOpts        = document.getElementById('adv-highlight-opts');
const advHighlightPaletteSlot = document.getElementById('adv-highlight-palette-slot');
// Free Draw options
const annDrawOpts      = document.getElementById('ann-draw-opts');
const drawWidthEl      = document.getElementById('draw-width');
const drawWidthVal     = document.getElementById('draw-width-val');
const drawOpacityEl    = document.getElementById('draw-opacity');
const drawOpacityVal   = document.getElementById('draw-opacity-val');
const drawSmoothingEl  = document.getElementById('draw-smoothing');
const drawSmoothingVal = document.getElementById('draw-smoothing-val');
const advDrawOpts         = document.getElementById('adv-draw-opts');
const advDrawPaletteSlot  = document.getElementById('adv-draw-palette-slot');

// ─── Background state (Stage 2) ────────────────────────────────────────────────
let screenshotImg = null;       // the captured screenshot Image
let bgType        = 'gradient'; // 'gradient' | 'mesh' | 'solid' | 'transparent' | 'image'
let bgSolidColor  = '#ffffff';
let bgMeshLayers  = null;       // explicit mesh preset layers (see presets.js), when bgType === 'mesh'
let bgColor1      = '#a78bfa'; // active 'gradient'-type preset's endpoint colours + direction
let bgColor2      = '#f472b6';
let bgGradientDir = 'diagonal';
let bgImage       = null;
let cropRatio     = null;       // null = freeform; else width/height ratio
let cropRatioKey  = 'free';     // which aspect-ratio button is selected (for highlight + tabs)

// Canvas Fill for the Crop tool — what fills the area dragged beyond the original
// image bounds. 'transparent' (default) exports with an alpha channel; 'solid'
// paints the chosen colour. The mode + last colour are remembered across sessions.
let cropFillMode  = 'transparent';  // 'transparent' | 'solid'
let cropFillColor = '#ffffff';

// Master "Background" switch (the toolbar toggle). When false the whole
// background/beautify treatment is suppressed — the canvas shows just the raw
// screenshot — and the right-hand controls sidebar (all of which act on the
// background) is hidden.
let backgroundEnabled = true;

// ─── Annotation state (Stage 3) ────────────────────────────────────────────────
//
// Coordinates are stored NORMALISED (0..1) relative to the screenshot's own
// top-left corner. This means annotations automatically track changes to
// padding, corner radius and the window frame, and stay correct at any export
// resolution. Visual sizes (stroke width, font size) are stored in "design px"
// and scaled by `view.annScale` at draw time so they grow with the image.
const ANN_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
// Weight for text annotations — semibold reads cleaner over a screenshot than
// regular. Used everywhere the text is measured, drawn and previewed so the
// caret/width stay in sync. (Counters set their own heavier weight.)
const ANN_FONT_WEIGHT = 600;
// Thickness of the text-outline halo as a fraction of the font size. The stroke
// is centred on the glyph path and the fill is painted over it, so the visible
// outer halo is roughly half this — ~12% of the cap height, a clean contrast
// edge that separates text from the screenshot without the weight of a pill.
const TEXT_OUTLINE_RATIO = 0.25;

const COLORS = ['#ff3b30', '#000000', '#ffffff', '#ffd60a'];

let annotations = [];     // committed annotation objects
let draft       = null;   // in-progress annotation being drawn
let selectedId  = null;   // id of the currently selected annotation
let activeTool  = null;   // null = idle (no tool chosen, nothing highlighted); 'select' = explicit Select tool; else 'arrow'|'text'|'blur'|'highlight'|…

// The just-created object stays a silent "still live" edit target for the
// Properties panel — no outline/handles (those only ever key off `selectedId`),
// but property edits apply to it AND become the tool's new default, until the
// user switches tools (setActiveTool clears this) or switches tabs. Mutually
// exclusive with `selectedId` by construction: real selection only gets set
// inside the Select-tool interaction code, which a creation tool never reaches.
let editTargetId = null;
function editTarget() {
  const id = selectedId || editTargetId;
  return id ? annotations.find(a => a.id === id) : null;
}
function isSoftEditTarget() {
  return !selectedId && !!editTargetId;
}
let currentColor = COLORS[0];

let history     = [];     // undo stack of JSON snapshots
let redoStack   = [];     // redo stack — cleared by any new action
let idCounter   = 1;
const newId = () => 'a' + (idCounter++);

// ─── Annotation clipboard ─────────────────────────────────────────────────────
// In-memory only; lost on app close. Holds a deep copy of the last cut/copied
// annotation. Paste creates a new annotation with a fresh id.
let annotationClipboard = null;

// Last canvas-pointer position in fractional screenshot-space coords.
// Updated on every canvas mousemove so paste lands near the cursor.
let lastPasteFx = 0.5;
let lastPasteFy = 0.5;

// When true, the next Delete/Backspace clears all annotations (Select All mode).
let multiSelectAll = false;

// Pointer interaction state
let mode      = null;     // 'create' | 'move' | 'resize' | null
let dragInfo  = null;     // scratch data for the active interaction

// Default blur strength for new blur annotations; `blurAdjusting` lets us push
// a single undo entry per slider drag rather than one per tick.
let blurDefaultStrength = 20;
let blurAdjusting = false;
// Default redaction effect for new blur annotations — see drawBlur's dispatch.
let blurDefaultType = 'pixelated';

// The merged Shape tool remembers which primitive to draw next (Line / Rectangle
// / Circle). Line, Rectangle and Circle stay separate internal tool values — the
// single toolbar button and the panel's shape-type picker just switch between
// them. Clicking the Shape button re-activates whichever was last used.
let lastShapeTool    = 'rect';

// The Advanced Properties sidebar keeps showing the last real tool's panel even
// after activeTool reverts to idle/null from an incidental click-away (see
// commitAndDismiss) — only explicitly picking a new tool (including Select,
// which has no panel of its own) replaces it. Updated only in setActiveTool()
// when the incoming tool is non-null, so an implicit setActiveTool(null) never
// touches it. See updateTextOptsVisibility()'s advTool.
let lastAdvPropsTool = null;

// Shape (rect/ellipse) defaults for new shapes
let shapeStrokeOn    = true;
let shapeStrokeWidth = 3;
let shapeFillOn      = false;
let shapeFillColor   = '#ff3b30';
// Corner radius (Rectangle only, design px) — 8 matches the old hardcoded
// look exactly, so existing rects with no stored radius (a.radius undefined)
// render identically via the `?? 8` fallback in drawShape.
let shapeRadius      = 8;
// Opacity (Rectangle/Circle) — separate from Line's own opacity default,
// mirroring how strokeWidth/lineWeight are already independent per type.
let shapeOpacity     = 1;

// Line tool default. Arrows no longer carry weight/taper/head — they auto-scale
// their whole silhouette from the drawn length (see arrowMetrics).
//   lineWeight — plain-line stroke thickness (design px)
let lineWeight     = 4;
let lineOpacity    = 1;

// Counter tool: next number to drop, plus the badge size (base radius in design
// px, scaled by view.annScale at draw time). Default bumped up from the old 13
// so badges read clearly without manual resizing.
let nextCounter = 1;
const COUNTER_DEFAULT_SIZE = 16;
let counterSize = COUNTER_DEFAULT_SIZE;

// Free Draw (freehand pen) defaults for new strokes. Colour follows the shared
// `currentColor` like the other tools; width is in design px (scaled by
// view.annScale at draw time), opacity 0..1, smoothing 0..1.
//   • width     — stroke thickness
//   • opacity   — stroke alpha
//   • smoothing — how aggressively the captured path is sampled + averaged; 0 is
//                 faithful/jittery, 1 is very smooth. See drawMinDist/smoothPoints.
let drawWidth     = 5;
let drawOpacity   = 1;
let drawSmoothing = 0.5;

// Highlight (marker) tool. The highlight is a straight chisel-tip stroke from
// start → end (not a filled rectangle), so it reads like a real highlighter pen.
// Colour is independent of the shared `currentColor` so the marker stays yellow
// by default regardless of what the other tools are set to.
//   • highlightColor — marker ink (default yellow, matching a real highlighter)
//   • highlightWidth — pen/nib thickness (design px, scaled by view.annScale)
// Opacity is a fixed soft value (not a user control — properties stay simple) and
// the nib is held at a fixed chisel angle so the stroke ends come out slanted.
let highlightColor = '#ffd60a';
let highlightWidth = 18;
const HIGHLIGHT_OPACITY = 0.45;
// Nib tilt — kept very subtle so the ends are gently angled like a real marker,
// not steeply cut. Corner-rounding (in drawHighlight) softens the tips further.
const HIGHLIGHT_CHISEL_ANGLE = 8 * Math.PI / 180;

// Outline (halo) colour for the text tool. null = follow the theme default
// (white on dark, black on light); set to a hex once the user picks a colour.
let currentOutlineColor = null;
function defaultOutlineColor() {
  return document.documentElement.classList.contains('light') ? '#000000' : '#ffffff';
}
function resolveOutlineColor(v) { return v || defaultOutlineColor(); }

// Arrow tail-text defaults — seed new arrows; each arrow then carries its own
// values once drawn. Independent from the Text tool's own defaults (an arrow's
// label no longer has to match its stroke colour). Off by default — the label
// editor no longer opens automatically after drawing an arrow; the user opts in
// via Advanced Properties' "Add text to tail" toggle.
let arrowTextEnabled = false;
let arrowTextFontSize = 20;
let arrowTextColor = '#ffffff';

// Arrow line style — 'straight' (the original tapered silhouette) or 'bent'
// (an elbow connector: tail → corner → head, see drawArrowShapeBent).
let arrowStyle = 'straight';

// Badge radius (screen px) for a counter annotation, honouring its own size.
function counterRadius(a) {
  return Math.max(11, ((a && a.size) || COUNTER_DEFAULT_SIZE) * view.annScale);
}

// Crop tool state: a pending crop region (fractional, in screenshot space)
let cropRect = null;

// Text editing state
let editing   = null;     // { isNew, id?, fx, fy, fontSize, color, outline }
let editingId = null;     // id of annotation hidden while it's being edited

// Layout for the current frame (updated every render)
let view = { ox: 0, oy: 0, iw: 0, ih: 0, totalW: 0, annScale: 1, titleBarH: 0 };
let suppressUI = false;   // when true, selection handles are not drawn (for export)

// ─── Annotation / watermark auto-scale ──────────────────────────────────────
// Every tool's default size is authored in "design px" and multiplied by this
// scale at draw time, so a new annotation is naturally proportioned to the image
// instead of a fixed pixel size that looks tiny on large shots and huge on tiny
// ones. The scale is the image's padded width divided by a REFERENCE width: at
// exactly the reference the defaults render at their authored baseline; larger
// images scale up, smaller ones down (never below the floor).
//
// The reference was 1000px, but typical screenshots are narrower than that, so
// every default was being scaled DOWN and read too small — users had to bump the
// size on almost every annotation. Lowering it to 640 (a common screenshot
// width) makes the baselines land right for the everyday case, and raising the
// floor keeps even small crops from collapsing the defaults to nothing. The
// watermark shares the same reference (see drawWatermark) so it tracks in step.
//
// Growth is capped with a SOFT CEILING: below the reference the scale is linear
// (small/medium images get exactly the corrected size), but the portion ABOVE
// 1.0 is compressed to 60%, so very large shots (e.g. 2400px+) don't get
// oversized, heavy-looking defaults. A big image still gets larger annotations
// than a small one — just with diminishing growth rather than a straight 1.56×
// blow-up of the old proportions.
const ANN_SCALE_REF    = 640;  // px — image width at which defaults hit their authored size
const ANN_SCALE_FLOOR  = 0.85; // never shrink defaults below this, however small the image
const ANN_SCALE_GROWTH = 0.6;  // compression applied to the part of the scale above 1.0
function computeAnnScale(paddedWidth) {
  const raw = paddedWidth / ANN_SCALE_REF;
  const eased = raw > 1 ? 1 + (raw - 1) * ANN_SCALE_GROWTH : raw;
  return Math.max(ANN_SCALE_FLOOR, eased);
}

// ─── OCR Mode state ─────────────────────────────────────────────────────────────
// Per-tab (mirrored via saveLiveStateToTab/loadTabIntoLive); see the OCR Mode
// section near the end of the file for the behaviour.
let ocrModeActive  = false;  // is the active tab showing the inline text layer
let ocrData        = null;   // { img, lines:[{text,x0,y0,x1,y1}], confidence }
let ocrSearchActive = false; // find bar visible

// PII categories currently live-redacted via the sidebar "Redact sensitive data"
// section. Per-tab (mirrored through saveLiveStateToTab/loadTabIntoLive). Toggling
// a category re-runs applyRedactions(); see the Redact section near the OCR code.
let redactEnabledTypes = new Set();

// ─── Zoom state ───────────────────────────────────────────────────────────────
// null = fit-to-area (default); number = explicit scale factor (1 = 100%)
let zoomScale = null;

// Ratio of the canvas BACKING pixels to the full composition resolution.
// In fit mode we cap the backing to the preview pane's *physical* pixels so the
// screenshot is downscaled once (high quality) rather than soft-scaled by CSS on
// HiDPI displays. 1 = full resolution (used for export and explicit zoom).
let previewScale = 1;

function applyZoom() {
  if (!screenshotImg) return;
  const dpr = window.devicePixelRatio || 1;
  if (zoomScale === null) {
    // Fit: render() sized the backing store for the pane's physical pixels —
    // display it at exactly backing/dpr CSS px so every canvas pixel maps 1:1
    // onto a device pixel and CSS never resamples it. (max-width:100% only
    // approximated this, softening HiDPI text; small captures used to be
    // CSS-upscaled by the OS display scale and blurred.)
    canvas.style.width     = (canvas.width  / dpr) + 'px';
    canvas.style.height    = (canvas.height / dpr) + 'px';
    canvas.style.maxWidth  = 'none';
    canvas.style.maxHeight = 'none';
    canvasArea.style.overflow = 'hidden';
  } else {
    // Explicit zoom: 100% = one image pixel per DEVICE pixel — true actual
    // size and zero interpolation, matching how the pixels were captured.
    canvas.style.width     = ((canvas.width  / previewScale) * zoomScale / dpr) + 'px';
    canvas.style.height    = ((canvas.height / previewScale) * zoomScale / dpr) + 'px';
    canvas.style.maxWidth  = 'none';
    canvas.style.maxHeight = 'none';
    canvasArea.style.overflow = 'auto';
  }
  updateZoomLabel();
}

// The zoomScale equivalent of fit mode (used so zoom in/out steps continue
// smoothly from the fit view). With applyZoom's device-pixel mapping, fit
// displays logical content at exactly previewScale.
function getFitScale() {
  return (previewScale > 0 && isFinite(previewScale)) ? Math.min(previewScale, 1) : 1;
}

// Reflect the current zoom into the floating zoom control's % readout.
function updateZoomLabel() {
  const el = document.getElementById('zoom-value');
  if (!el) return;
  const eff = zoomScale ?? getFitScale();
  el.textContent = Math.round(eff * 100) + '%';
}

// Fit mode sizes the backing store to the pane's physical pixels and pins the
// CSS size to it (see applyZoom), so a pane resize must recompute the render —
// CSS alone no longer rescales the canvas (that rescale is exactly what used
// to soften the preview). Debounced: resizing fires continuously.
let fitResizeTimer = null;
window.addEventListener('resize', () => {
  positionToolbar();
  if (!screenshotImg || zoomScale !== null) return; // only fit mode tracks the pane
  clearTimeout(fitResizeTimer);
  fitResizeTimer = setTimeout(() => {
    if (screenshotImg && zoomScale === null) render();
  }, 80);
});

// ─── Responsive toolbar position ────────────────────────────────────────────
// The tool palette (#ab-tools) sits in the toolbar's middle section — the space
// between the left cluster (.tbar-left: New/Open) and the right cluster
// (.tbar-right: Undo/Redo/BG/Copy/Save). Its horizontal position is a pure
// function of window width (never of the active tool / props-panel width) and
// behaves in two phases:
//
//   • Wide windows  → the palette is centered BY ITSELF in the cluster gap,
//     with equal slack on both sides (symmetric). The Tool Properties panel just
//     fills whatever room remains to its right; it does not pull the palette off
//     centre.
//   • As the window narrows → once the symmetric-centre position would leave the
//     palette's right edge closer than TOOLBAR_PROPS_MARGIN to the right cluster
//     (i.e. the props panel would lose its room), the palette stops centring and
//     shifts LEFT to preserve that gap, reaching TOOLBAR_MIN_MARGIN (32px) at the
//     minimum window width.
//
// Implemented as `min(centreMargin, capMargin)` clamped to the floor, where
// capMargin is the largest margin that still keeps a TOOLBAR_PROPS_MARGIN gap to
// the right cluster. On wide windows centreMargin is the smaller of the two, so
// the palette is symmetric; on narrow windows the cap wins and drives the shift.
// The two meet smoothly at the crossover (no jump). All inputs are window/bar
// geometry + the clusters' fixed widths — see the margin-pollution note below —
// so the CSS margin-left transition (editor.html) animates every resize cleanly.
const TOOLBAR_MIN_MARGIN   = 32;  // px — left floor: reached at the minimum window width
const TOOLBAR_PROPS_MARGIN = 200; // px — right gap kept for the props panel once the window is tight
function positionToolbar() {
  // Only meaningful while the toolbar row is actually laid out (it's hidden in
  // the empty/no-image state, where getBoundingClientRect would read zeros).
  if (!abTools || document.body.classList.contains('no-image')) return;
  const toolsW = abTools.getBoundingClientRect().width;
  if (toolsW === 0) return;
  const barRect   = toolbarStack.getBoundingClientRect();
  const barStyle  = getComputedStyle(toolbarStack);
  const padLeft   = parseFloat(barStyle.paddingLeft)  || 0;
  const padRight  = parseFloat(barStyle.paddingRight) || 0;
  const leftRect  = tbarLeft  && tbarLeft.getBoundingClientRect();
  const rightRect = tbarRight && tbarRight.getBoundingClientRect();
  // Both bounds must be derived ONLY from the window/bar geometry and the two
  // clusters' WIDTHS — never from anything whose on-screen POSITION depends on
  // #ab-tools' own margin, or we get a feedback loop that leaves the palette
  // stuck centered after a maximize→restore:
  //
  //   The bar is [ .tbar-left | #ab-tools (margin M) | #tool-props (shrink) |
  //   .tbar-right (margin-left:auto, fixed 301px) ]. When the window restores to
  //   a narrow width while #ab-tools still carries its large *maximized* margin M,
  //   the row's fixed content overflows, margin-left:auto collapses, and
  //   .tbar-right is PUSHED right — so its measured .left reads as if the window
  //   were still wide. Feeding that back in recomputes another large margin, and
  //   the palette never returns left. So we compute .tbar-right's left edge from
  //   the bar's right edge minus padding minus the cluster's (stable) width
  //   instead of trusting its margin-polluted measured position. Likewise the
  //   left cluster's right edge = bar-left + padding + its width.
  let margin;
  if (leftRect && rightRect && leftRect.width && rightRect.width) {
    const leftEdge  = barRect.left  + padLeft  + leftRect.width;   // .tbar-left right edge
    const rightEdge = barRect.right - padRight - rightRect.width;  // .tbar-right left edge
    // Phase 1 — symmetric centre in the cluster gap.
    const centreMargin = (leftEdge + rightEdge) / 2 - toolsW / 2 - leftEdge;
    // Phase 2 — cap that keeps a TOOLBAR_PROPS_MARGIN gap to the right cluster,
    // so as the window narrows the palette shifts left instead of crowding the
    // props panel. On wide windows centreMargin is the smaller of the two (→
    // symmetric); on narrow windows this cap wins (→ shift left). They meet
    // smoothly at the crossover, so there's no jump.
    const capMargin = rightEdge - leftEdge - toolsW - TOOLBAR_PROPS_MARGIN;
    margin = Math.max(TOOLBAR_MIN_MARGIN, Math.min(centreMargin, capMargin));
  } else {
    // Fall back to centring the palette on the canvas area if either cluster
    // isn't laid out yet. leftEdge from the bar's own padding, not #ab-tools'
    // live (possibly animating) geometry — same margin-pollution reason as above.
    const area = canvasArea.getBoundingClientRect();
    if (area.width === 0) return;
    const leftEdge = barRect.left + padLeft + (leftRect ? leftRect.width : 0);
    const canvasCentre = area.left + area.width / 2;
    margin = Math.max(TOOLBAR_MIN_MARGIN, canvasCentre - toolsW / 2 - leftEdge);
  }
  abTools.style.marginLeft = margin + 'px';
  // First placement is applied WITHOUT the CSS transition (the .toolbar-ready
  // gate in editor.html is still off), so the palette renders directly at its
  // final margin — no animated fallback→computed shift on startup. Arm the
  // transition on the next frame so every LATER positionToolbar() (window
  // resize, sidebar/OCR toggle) still slides smoothly.
  if (!toolbarStack.classList.contains('toolbar-ready')) {
    requestAnimationFrame(() => toolbarStack.classList.add('toolbar-ready'));
  }
}

// Re-render when the window lands on a display with a different scale factor,
// so the 1:1 device-pixel mapping (and the fit backing resolution) stay true.
(function watchDpr() {
  const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener('change', () => {
    if (screenshotImg) render();
    watchDpr(); // re-arm for the next display change
  }, { once: true });
})();

function handleZoom(action) {
  if (!screenshotImg) return;
  if (action === 'fit') {
    zoomScale = null;
  } else if (action === '100') {
    zoomScale = 1;
  } else {
    const cur = zoomScale ?? getFitScale();
    if (action === 'in')  zoomScale = Math.min(cur * 1.25, 8);
    if (action === 'out') zoomScale = Math.max(cur / 1.25, 0.1);
  }
  render();      // recompute the backing resolution for the new zoom/fit mode
  applyZoom();   // then set the CSS display size (resets to fit when zoomScale is null)
}

// ─── Undo / Redo helpers ───────────────────────────────────────────────────────
function snapshot()    { return JSON.stringify(annotations); }

function notifyUndoRedoState() {
  window.electronAPI.sendUndoRedoState({ canUndo: history.length > 0, canRedo: redoStack.length > 0 });
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > 60) history.shift();
  redoStack = []; // any new committed action discards the redo stack
  notifyUndoRedoState();
}

function undo() {
  if (!history.length) return;
  redoStack.push(snapshot());
  if (redoStack.length > 60) redoStack.shift();
  annotations = JSON.parse(history.pop());
  selectedId = null;
  render();
  refreshRedactUI(); // the AI-redaction count may have changed
  notifyUndoRedoState();
}

function redo() {
  if (!redoStack.length) return;
  history.push(snapshot());
  annotations = JSON.parse(redoStack.pop());
  selectedId = null;
  render();
  refreshRedactUI();
  notifyUndoRedoState();
}

function clearAll() {
  if (!annotations.length) return;
  pushHistory();
  annotations = [];
  selectedId = null;
  // Clearing every annotation also removes the auto-redactions, so drop the
  // live-toggle intent too (otherwise a category would read "on" with 0 boxes).
  redactEnabledTypes = new Set();
  render();
  refreshRedactUI();
}

function deleteSelected() {
  if (!selectedId) return;
  pushHistory();
  annotations = annotations.filter(a => a.id !== selectedId);
  selectedId = null;
  render();
  refreshRedactUI();
}

function copyAnnotation() {
  const sel = annotations.find(a => a.id === selectedId);
  if (!sel) return false;
  annotationClipboard = JSON.parse(JSON.stringify(sel));
  return true;
}

function cutAnnotation() {
  if (!copyAnnotation()) return;
  deleteSelected(); // pushHistory is called inside deleteSelected
}

function pasteAnnotation() {
  if (!annotationClipboard) return;
  const src = annotationClipboard;
  const pasted = JSON.parse(JSON.stringify(src));
  pasted.id = newId();

  if ('fx1' in src) {
    // Two-point annotation (arrow, line, highlight): translate midpoint to cursor.
    const midFx = (src.fx1 + src.fx2) / 2;
    const midFy = (src.fy1 + src.fy2) / 2;
    const dx = lastPasteFx - midFx;
    const dy = lastPasteFy - midFy;
    pasted.fx1 = src.fx1 + dx;
    pasted.fy1 = src.fy1 + dy;
    pasted.fx2 = src.fx2 + dx;
    pasted.fy2 = src.fy2 + dy;
  } else if ('fw' in src) {
    // Box annotation (rect, ellipse, blur): center box on cursor.
    pasted.fx = lastPasteFx - src.fw / 2;
    pasted.fy = lastPasteFy - src.fh / 2;
  } else {
    // Point annotation (text, counter): place directly at cursor.
    pasted.fx = lastPasteFx;
    pasted.fy = lastPasteFy;
  }

  pushHistory();
  annotations.push(pasted);
  selectedId = pasted.id;
  render();
}

function selectAllAnnotations() {
  if (!annotations.length) return;
  multiSelectAll = true;
  selectedId = null;
  render();
  showToast('All annotations selected — press Delete to clear all, Esc to cancel');
}

// ─── Gradient presets ──────────────────────────────────────────────────────────
// Shared preset list (defined in presets.js, loaded before this script)
const PRESETS = window.LUMSHOT_PRESETS || [];
const presetButtons = []; // the swatch <button> for each preset, by index

function selectSwatch(el) {
  document.querySelectorAll('.preset-btn.selected')
    .forEach(s => s.classList.remove('selected'));
  if (el) el.classList.add('selected');
}

// Apply a preset to the background state (gradient, explicit mesh, or solid).
function applyPreset(p) {
  if (p.type === 'solid') {
    bgType = 'solid';
    bgSolidColor = p.color;
  } else if (p.type === 'mesh') {
    bgType = 'mesh';
    bgMeshLayers = p.layers;
  } else {
    bgColor1 = p.c1;
    bgColor2 = p.c2;
    if (p.dir) bgGradientDir = p.dir;
    bgType = 'gradient';
  }
}

const presetGrid = document.getElementById('preset-grid');
PRESETS.forEach((p, i) => {
  // A tactile swatch button (no name label — swatches only).
  const btn = document.createElement('button');
  btn.className = 'preset-btn';
  btn.style.background = (p.type === 'solid')
    ? p.color
    : (p.type === 'mesh')
      ? meshLayersToCss(p.layers)
      : meshCss(p.c1, p.c2);
  btn.title = p.name;
  btn.addEventListener('click', () => {
    applyPreset(p);
    selectSwatch(btn);
    render();
  });

  presetGrid.appendChild(btn);
  presetButtons.push(btn);
  if (i === 0) btn.classList.add('selected');
});

// ─── Coordinate helpers ──────────────────────────────────────────────────────────

// Mouse event → logical (full-resolution) canvas coordinates. We divide by
// previewScale so callers always work in full-res space regardless of how much
// the backing store was capped for display.
function toCanvasCoords(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = (canvas.width  / previewScale) / rect.width;
  const scaleY = (canvas.height / previewScale) / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

// Logical canvas coordinates → CSS position within #canvas-area (for text input).
function toAreaCoords(cx, cy) {
  const canvasRect = canvas.getBoundingClientRect();
  const areaRect   = canvasArea.getBoundingClientRect();
  const scaleX     = (canvas.width  / previewScale) / canvasRect.width;
  const scaleY     = (canvas.height / previewScale) / canvasRect.height;
  return {
    x: (canvasRect.left - areaRect.left) + cx / scaleX,
    y: (canvasRect.top  - areaRect.top)  + cy / scaleY,
  };
}

// Logical canvas pixels per CSS pixel — used to keep handles/hit-areas a
// constant on-screen size regardless of how much the canvas is scaled down.
function viewScale() {
  const r = canvas.getBoundingClientRect();
  return r.width ? (canvas.width / previewScale) / r.width : 1;
}

// Mouse event → screenshot-space pixel coordinates (origin at screenshot top-left).
function toShotPx(e) {
  const c = toCanvasCoords(e);
  return { x: c.x - view.ox, y: c.y - view.oy };
}

// Convert a normalised annotation point to screenshot-space pixels.
const nx = fx => fx * view.iw;
const ny = fy => fy * view.ih;

// ─── Beautification settings ──────────────────────────────────────────────────
function getSettings() {
  return {
    color1:        bgColor1,
    color2:        bgColor2,
    gradientDir:   bgGradientDir,
    padding:      +document.getElementById('padding').value,
    radius:       +document.getElementById('radius').value,
    shadowBlur:   +document.getElementById('shadow-blur').value,
    shadowOffsetY:+document.getElementById('shadow-offset').value,
    shadowOpacity:+document.getElementById('shadow-opacity').value / 100,
  };
}

function roundedRectPath(x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// Like roundedRectPath but with independent per-corner radii ({tl,tr,br,bl}).
// Used by the watermark banner, which squares off the corners flush against an
// image edge (Savvyshot-style anchored tab) while rounding the interior ones.
function roundedRectPathCorners(x, y, w, h, { tl = 0, tr = 0, br = 0, bl = 0 } = {}) {
  const max = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
  tl = Math.min(tl, max); tr = Math.min(tr, max); br = Math.min(br, max); bl = Math.min(bl, max);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);   ctx.arcTo(x + w, y,     x + w, y + h, tr);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x,     y + h, br);
  ctx.lineTo(x + bl, y + h);    ctx.arcTo(x,     y + h, x,     y,     bl);
  ctx.lineTo(x, y + tl);        ctx.arcTo(x,     y,     x + w, y,     tl);
  ctx.closePath();
}

// ─── Mesh-gradient palette helpers ─────────────────────────────────────────────
// A premium background is more than a two-stop line: we derive a small, harmonious
// palette from the preset's two endpoint colours, then paint several soft radial
// "blobs" over a base wash to build a multi-gradient (mesh) with subtle depth and
// lighting. Built on the existing HSV helpers (hoisted below), so every preset and
// any custom colour pair gets the upgraded look for free.
function _clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function _rgba(rgb, a) { return `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${a})`; }
function _mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function _lighten(rgb, dv, ds) {            // brighter + gently desaturated tint
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  return hsvToRgb(h, _clamp01(s * (1 - (ds || 0))), _clamp01(v + (dv || 0)));
}
function _darken(rgb, dv) {                  // deeper + slightly richer shade
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  return hsvToRgb(h, _clamp01(s * 1.05), _clamp01(v - dv));
}
function _hueShift(rgb, deg) {               // subtle extra hue for the mesh
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  return hsvToRgb((h + deg + 360) % 360, s, v);
}

// Paint a multi-gradient mesh onto the canvas: a smooth 3-stop base wash, soft
// overlapping radial blobs (the multi-colour depth), then a gentle top sheen and
// vignette for atmosphere. Stays restrained on neutral palettes (the derived hues
// inherit the originals' low saturation) so it enhances rather than competes.
function paintMeshGradient(c1, c2, dir, w, h) {
  const A = hexToRgb(c1) || [124, 132, 156];
  const B = hexToRgb(c2) || [42, 46, 64];
  const mid    = _mix(A, B, 0.5);
  const glow   = _lighten(A, 0.14, 0.25);  // bright highlight near the light source
  const accent = _hueShift(mid, 24);       // a quiet third hue, keyed off the midtone
  const deep   = _darken(B, 0.14);         // corner depth

  // 1. Base wash — a 3-stop linear so the whole field already transitions smoothly.
  let base;
  if (dir === 'horizontal')    base = ctx.createLinearGradient(0, 0, w, 0);
  else if (dir === 'vertical') base = ctx.createLinearGradient(0, 0, 0, h);
  else                         base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0,   _rgba(A, 1));
  base.addColorStop(0.5, _rgba(mid, 1));
  base.addColorStop(1,   _rgba(B, 1));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 2. Soft radial blobs — overlapping, each fading to transparent, build the mesh.
  const R = Math.max(w, h);
  const blob = (cx, cy, rad, rgb, a) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0,   _rgba(rgb, a));
    g.addColorStop(0.5, _rgba(rgb, a * 0.45));
    g.addColorStop(1,   _rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  blob(w * 0.12, h * 0.10, R * 0.95, A,      0.85);
  blob(w * 0.92, h * 0.08, R * 0.85, accent, 0.55);
  blob(w * 0.08, h * 0.96, R * 0.95, B,      0.80);
  blob(w * 0.96, h * 0.92, R * 0.80, deep,   0.70);
  blob(w * 0.42, h * 0.30, R * 0.55, glow,   0.30);  // central lift / lighting

  // 3. Atmosphere — a soft top sheen and a gentle vignette for depth.
  const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, R * 0.30, w * 0.5, h * 0.5, R * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; }
  else if (h <120) { r = x; g = c; }
  else if (h <180) { g = c; b = x; }
  else if (h <240) { g = x; b = c; }
  else if (h <300) { r = x; b = c; }
  else             { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// CSS for an explicit mesh preset (see presets.js) — reconstructed verbatim from
// its layer list so the swatch matches the source gradient exactly.
function meshLayersToCss(layers) {
  return layers.map(({ x, y, h, s, l }) =>
    `radial-gradient(at ${x}% ${y}%, hsla(${h}, ${s}%, ${l}%, 1) 0%, hsla(${h}, ${s}%, ${l}%, 0) 100%)`
  ).join(', ');
}

// Canvas rendering of an explicit mesh preset: paint each blob back-to-front (CSS
// lists the topmost layer first, so we walk in reverse), each a radial gradient
// sized to the farthest corner from its centre — matching default CSS
// radial-gradient sizing — fading from full colour to transparent.
function paintMeshLayers(layers, w, h) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const { x, y, h: hue, s, l } = layers[i];
    const [r, g, b] = hslToRgb(hue, s, l);
    const cx = w * x / 100, cy = h * y / 100;
    const dx = Math.max(cx, w - cx), dy = Math.max(cy, h - cy);
    const rad = Math.sqrt(dx * dx + dy * dy);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

// CSS equivalent of the mesh, used to preview a gradient preset in its swatch.
function meshCss(c1, c2) {
  const A = hexToRgb(c1) || [124, 132, 156];
  const B = hexToRgb(c2) || [42, 46, 64];
  const glow   = _lighten(A, 0.14, 0.25);
  const accent = _hueShift(_mix(A, B, 0.5), 24);
  return [
    `radial-gradient(circle at 14% 12%, ${_rgba(A, 0.95)} 0%, ${_rgba(A, 0)} 55%)`,
    `radial-gradient(circle at 90% 10%, ${_rgba(accent, 0.85)} 0%, ${_rgba(accent, 0)} 55%)`,
    `radial-gradient(circle at 10% 92%, ${_rgba(B, 0.90)} 0%, ${_rgba(B, 0)} 60%)`,
    `radial-gradient(circle at 60% 34%, ${_rgba(glow, 0.55)} 0%, ${_rgba(glow, 0)} 50%)`,
    `linear-gradient(135deg, ${c1}, ${c2})`,
  ].join(', ');
}

// ─── Background painting ───────────────────────────────────────────────────────
function drawBackground(s, w, h) {
  if (bgType === 'transparent') { canvas.classList.add('transparent-bg'); return; }
  canvas.classList.remove('transparent-bg');

  if (bgType === 'solid') {
    ctx.fillStyle = bgSolidColor;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bgType === 'image' && bgImage) {
    const scale = Math.max(w / bgImage.naturalWidth, h / bgImage.naturalHeight);
    const dw = bgImage.naturalWidth * scale, dh = bgImage.naturalHeight * scale;
    ctx.drawImage(bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }
  if (bgType === 'mesh' && bgMeshLayers) {
    paintMeshLayers(bgMeshLayers, w, h);
    return;
  }
  // Premium multi-gradient (mesh) — replaces the old flat two-stop linear.
  paintMeshGradient(s.color1, s.color2, s.gradientDir, w, h);
}

function drawTrafficLights(x, y, barHeight) {
  const r = Math.max(5, Math.round(barHeight * 0.16));
  const cy = y + barHeight / 2, gap = r * 3.4, startX = x + r * 3;
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((color, i) => {
    ctx.beginPath();
    ctx.arc(startX + i * gap, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

// ─── Window frame styles (design: Frame — None / Browser / macOS / Windows) ───
// Persisted like Balance; drawn as a light chrome bar above the screenshot.
let frameStyle = 'none';
try {
  const f = localStorage.getItem('lumshot-frame');
  if (['none', 'browser', 'mac', 'win'].includes(f)) frameStyle = f;
} catch { /* default none */ }

function drawWindowChrome(x, y, w, barH) {
  // Light chrome bar with a hairline bottom border (design's frame chrome).
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(x, y, w, barH);
  ctx.fillStyle = '#e7e9ed';
  ctx.fillRect(x, y + barH - 1, w, 1);

  if (frameStyle === 'mac') {
    drawTrafficLights(x, y, barH);
  } else if (frameStyle === 'browser') {
    // Three neutral dots + an empty URL pill.
    const r = Math.max(4, Math.round(barH * 0.15));
    const cy = y + barH / 2, gap = r * 2.9, startX = x + r * 3;
    ctx.fillStyle = '#dcdfe4';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * gap, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const pillH = barH * 0.56;
    const pillX = startX + 2 * gap + r * 3;
    const pillW = w - (pillX - x) - r * 3;
    if (pillW > 40) {
      ctx.fillStyle = '#e9ebee';
      roundedRectPath(pillX, cy - pillH / 2, pillW, pillH, pillH / 2);
      ctx.fill();
    }
  } else if (frameStyle === 'win') {
    // Windows caption glyphs (─ ▢ ✕), right-aligned.
    const s = Math.max(5, barH * 0.22);
    const cy = y + barH / 2;
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = Math.max(1, barH * 0.04);
    ctx.lineCap = 'round';
    let cx = x + w - barH * 0.75;
    ctx.beginPath(); // close ✕
    ctx.moveTo(cx - s / 2, cy - s / 2); ctx.lineTo(cx + s / 2, cy + s / 2);
    ctx.moveTo(cx + s / 2, cy - s / 2); ctx.lineTo(cx - s / 2, cy + s / 2);
    ctx.stroke();
    cx -= barH * 0.85;
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s); // maximize ▢
    cx -= barH * 0.85;
    ctx.beginPath(); // minimize ─
    ctx.moveTo(cx - s / 2, cy); ctx.lineTo(cx + s / 2, cy);
    ctx.stroke();
  }
}

// ─── Balance — automatic composition ──────────────────────────────────────────
// One-toggle auto-balance: a capture often carries uneven runs of "empty"
// background inside itself — e.g. a dialog snapped with a big blank strip
// underneath — which makes the beautified card look lopsided even though
// render() centres it. Balance measures how much uniform background runs in
// from each edge and virtually trims every side down to the SMALLEST of the
// four margins, so the visual content ends up with identical breathing room
// all round (the Padding slider then adds its symmetric frame on top).
//
// Non-destructive by design: the screenshot pixels and the normalised
// annotation coordinates are never touched — render() simply offsets the full
// image inside a smaller card and lets the card clip do the cropping, so
// toggling the switch (or the master Background toggle) restores the original
// instantly.
let balanceEnabled = true;
try { balanceEnabled = localStorage.getItem('lumshot-balance') !== '0'; } catch { /* default on */ }

const _balanceCache = new WeakMap(); // Image → {x,y,w,h} | null (null = already balanced)

function computeBalanceRect(img) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (iw < 48 || ih < 48) return null; // tiny captures: nothing worth trimming

  // Analyse a downscaled copy — margin detection doesn't need pixel precision,
  // and ≤640px keeps getImageData cheap enough to run synchronously once per image.
  const scale = Math.min(1, 640 / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.drawImage(img, 0, 0, w, h);
  let data;
  try { data = octx.getImageData(0, 0, w, h).data; } catch { return null; }

  const TOL    = 14;    // per-channel tolerance — absorbs AA fringes / capture noise
  const PURITY = 0.985; // fraction of a line that must match to count as "empty"

  // How many consecutive lines from one edge are uniform background. axis 'y'
  // walks rows from the top (dir 1) or bottom (dir -1); axis 'x' walks columns.
  // The reference colour is the outermost line's own average, so each side may
  // sit on a different backdrop (white page bottom vs dark app top, etc.); a
  // noisy edge line simply fails the purity check and yields a zero margin.
  const margin = (axis, dir) => {
    const lines  = axis === 'y' ? h : w;
    const length = axis === 'y' ? w : h;
    const start  = dir === 1 ? 0 : lines - 1;
    const idx    = (line, j) => 4 * (axis === 'y' ? line * w + j : j * w + line);

    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < length; j++) {
      const i = idx(start, j);
      r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
    }
    r /= length; g /= length; b /= length; a /= length;

    let count = 0;
    for (let n = 0; n < lines; n++) {
      const line = start + n * dir;
      let hits = 0;
      for (let j = 0; j < length; j++) {
        const i = idx(line, j);
        if (Math.abs(data[i]     - r) <= TOL &&
            Math.abs(data[i + 1] - g) <= TOL &&
            Math.abs(data[i + 2] - b) <= TOL &&
            Math.abs(data[i + 3] - a) <= TOL) hits++;
      }
      if (hits / length < PURITY) break;
      count++;
    }
    return count;
  };

  const top  = margin('y', 1), bottom = margin('y', -1);
  const left = margin('x', 1), right  = margin('x', -1);

  // A side swallowed the whole image → blank/near-blank capture, leave it be.
  if (top + bottom >= h || left + right >= w) return null;

  // Equalise: every side keeps the smallest margin; the excess is trimmed away.
  const keep = Math.min(top, bottom, left, right);
  const inv  = 1 / scale;
  const tx = Math.round((left   - keep) * inv);
  const ty = Math.round((top    - keep) * inv);
  const bx = Math.round((right  - keep) * inv);
  const by = Math.round((bottom - keep) * inv);

  // Only act when the trim is visually meaningful — a few pixels of slack is
  // not an unbalanced composition, and a no-op rect would just churn layout.
  const minGain = Math.max(8, Math.round(Math.min(iw, ih) * 0.015));
  if (tx < minGain && ty < minGain && bx < minGain && by < minGain) return null;

  const rect = { x: tx, y: ty, w: iw - tx - bx, h: ih - ty - by };
  // Never collapse the card to a sliver (e.g. a lone cursor on a blank desktop).
  if (rect.w < Math.max(32, iw * 0.08) || rect.h < Math.max(32, ih * 0.08)) return null;
  return rect;
}

// Cached accessor for the active screenshot. Keyed on the Image object itself,
// so crops (which build a new Image) and tab switches invalidate naturally.
function getBalanceRect() {
  if (!screenshotImg) return null;
  if (!_balanceCache.has(screenshotImg)) {
    let r = null;
    try { r = computeBalanceRect(screenshotImg); } catch { /* analysis is best-effort */ }
    _balanceCache.set(screenshotImg, r);
  }
  return _balanceCache.get(screenshotImg);
}

// ─── Main render ──────────────────────────────────────────────────────────────
function render() {
  if (!screenshotImg) return;

  // Crop mode owns its own surface (raw image + live canvas-expansion preview).
  // Never taken during export — exporting dismisses the crop frame first.
  if (!suppressUI && activeTool === 'crop' && cropRect) { renderCropMode(); return; }

  const s  = getSettings();
  const iw = screenshotImg.naturalWidth;
  const ih = screenshotImg.naturalHeight;

  // OCR Mode always renders the raw screenshot (no beautify at all) so the text
  // stays pixel-aligned with the original — there's no background concept in OCR.
  // This is independent of the user's Background toggle, which is restored on exit.
  const bgOn = backgroundEnabled && !ocrModeActive;

  // When the background is off (or OCR Mode), strip the beautify treatment so the
  // canvas (and any export) is just the raw screenshot: no padding, rounding,
  // shadow, window frame or aspect-ratio canvas growth.
  if (!bgOn) {
    s.padding = 0;
    s.radius = 0;
    s.shadowBlur = 0;
  }

  // Balance (auto-composition): virtually trim the capture's own uneven empty
  // space so the content sits with equal margins — the card becomes a window
  // onto the full image (see computeBalanceRect). Null when already balanced.
  const bal  = (bgOn && balanceEnabled) ? getBalanceRect() : null;
  const balX = bal ? bal.x : 0,  balY = bal ? bal.y : 0;
  const balW = bal ? bal.w : iw, balH = bal ? bal.h : ih;

  const frameOn   = bgOn && frameStyle !== 'none';
  const titleBarH = frameOn ? Math.min(Math.round(Math.max(34, balW * 0.035)), 60) : 0;

  const cardW = balW, cardH = balH + titleBarH;

  // Natural canvas = card + padding on all sides (this is the freeform size)
  const baseW = cardW + s.padding * 2;
  const baseH = cardH + s.padding * 2;

  // Apply the selected aspect ratio (cropRatio = width/height, null = freeform).
  // The screenshot is never cropped or scaled — the canvas grows on whichever
  // axis is needed so the card still fits with at least `padding` margin.
  const effCropRatio = bgOn ? cropRatio : null;
  let totalW, totalH;
  if (!effCropRatio) {
    totalW = baseW;
    totalH = baseH;
  } else if (baseW / baseH >= effCropRatio) {
    totalW = baseW;
    totalH = Math.round(baseW / effCropRatio); // content too wide → grow height
  } else {
    totalH = baseH;
    totalW = Math.round(baseH * effCropRatio); // content too tall → grow width
  }

  // Decide the backing resolution. For export and explicit zoom we keep full
  // resolution; in fit mode we cap to the preview pane's physical pixels so the
  // screenshot is downscaled once with high quality instead of by CSS (which
  // softens text on HiDPI screens).
  const dpr = window.devicePixelRatio || 1;
  if (suppressUI || zoomScale !== null) {
    previewScale = 1;
  } else {
    // Match #canvas-area's padding (72px top clears the floating toolbar,
    // 48px bottom, 32px per side) so the fitted artboard never sits under it.
    const availW = Math.max(1, canvasArea.clientWidth  - 64) * dpr;
    const availH = Math.max(1, canvasArea.clientHeight - 120) * dpr;
    previewScale = Math.min(1, availW / totalW, availH / totalH);
  }
  if (!(previewScale > 0) || !isFinite(previewScale)) previewScale = 1;

  canvas.width  = Math.max(1, Math.round(totalW * previewScale));
  canvas.height = Math.max(1, Math.round(totalH * previewScale));

  // Draw everything in full-resolution ("logical") coordinates; this base
  // transform maps them onto the (possibly smaller) backing store.
  ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Centre the card (screenshot + optional title bar) within the canvas
  const cardX = Math.round((totalW - cardW) / 2);
  const cardY = Math.round((totalH - cardH) / 2);

  // Publish layout for the interaction handlers + annotation drawing. ox/oy is
  // where the FULL image's origin lands on the canvas — under Balance that sits
  // up/left of the card, and the card clip crops the trimmed sides away, so
  // screenshot-space coordinates (annotations, hit-testing) stay valid as-is.
  // annScale is keyed to the untrimmed natural width so changing the aspect
  // ratio or toggling Balance only re-centres annotations — never resizes them.
  view = {
    ox: cardX - balX, oy: cardY + titleBarH - balY,
    iw, ih, totalW,
    annScale: computeAnnScale(iw + s.padding * 2),
    titleBarH,
  };

  if (bgOn) {
    drawBackground(s, totalW, totalH);
  } else {
    canvas.classList.add('transparent-bg'); // raw screenshot, no background fill
  }

  // Drop shadow under the whole card
  if (s.shadowBlur > 0) {
    ctx.save();
    ctx.shadowColor   = `rgba(0,0,0,${s.shadowOpacity})`;
    ctx.shadowBlur    = s.shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = s.shadowOffsetY;
    roundedRectPath(cardX, cardY, cardW, cardH, s.radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  // Everything inside the rounded card
  ctx.save();
  roundedRectPath(cardX, cardY, cardW, cardH, s.radius);
  ctx.clip();

  // Screenshot
  ctx.drawImage(screenshotImg, view.ox, view.oy, iw, ih);

  // Annotations — clipped to the screenshot content rect so they sit ON the
  // screenshot but stay BELOW the window frame (drawn next).
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.ox, view.oy, iw, ih);
  ctx.clip();
  ctx.translate(view.ox, view.oy);
  drawAnnotations();
  // Live WYSIWYG preview of the text currently being typed — drawn with the very
  // same drawText() path so the outline, font and position are pixel-identical to
  // the committed result (the <input> overlay is transparent; it only holds the
  // caret). Never part of an export (suppressUI).
  if (!suppressUI) drawEditingText();
  ctx.restore();

  // Window chrome (Browser / macOS / Windows) on top of annotations
  if (frameOn) drawWindowChrome(cardX, cardY, cardW, titleBarH);
  ctx.restore();

  // Watermark — drawn on top of the composited image (screenshot + annotations +
  // frame), exactly as it's burned into exports, so the editor is WYSIWYG. Drawn
  // here (before the transient selection/crop UI below) so handles stay on top and
  // are never obscured. computeWatermark() returns null when there's nothing to
  // show (licensed + custom watermark off). It honours suppressUI implicitly: the
  // pill is part of the final image, so it's intentionally kept during export.
  // Hidden from the on-screen OCR view: that workflow is about extracting text, not
  // producing an exported image, so the watermark (and its controls) don't belong.
  // It is still burned into any actual image export (suppressUI) so OCR Mode can't
  // be used to bypass the free-tier watermark.
  if (!ocrModeActive || suppressUI) {
    const wm = computeWatermark();
    if (wm) drawWatermark(wm);
  }

  // Selection handles — on-screen only, never in the exported image. Hidden
  // while a text annotation is being edited (the live preview is the feedback).
  if (!suppressUI && selectedId && !editing) {
    ctx.save();
    ctx.translate(view.ox, view.oy);
    drawSelectionOverlay();
    ctx.restore();
  }

  // (Crop mode renders on its own surface via renderCropMode(), returned early
  // above — so there's no crop overlay to draw here.)

  // Sync the CSS display size after canvas.width/height changed (handles both
  // fit mode — reset to max-width:100% — and explicit zoom).
  applyZoom();

  // Keep the OCR text overlay aligned with the (re)positioned image.
  if (ocrModeActive && typeof positionOcrLayer === 'function') positionOcrLayer();
}

// ─── Crop-mode surface ────────────────────────────────────────────────────────
// A dedicated render path used only while the Crop tool is active. It shows the
// raw screenshot (beautify is applied afterwards, to the cropped result) and grows
// the canvas to fit a frame dragged beyond the image, previewing the Canvas Fill
// in the expanded area in real time. The surrounding dim, rule-of-thirds guides
// and CleanShot-style handles are UI only and never exported.
function renderCropMode() {
  const iw = screenshotImg.naturalWidth;
  const ih = screenshotImg.naturalHeight;

  // Frame edges in image pixels (any may fall outside [0,iw]/[0,ih]).
  const clPx = cropRect.fx * iw, ctPx = cropRect.fy * ih;
  const crPx = (cropRect.fx + cropRect.fw) * iw, cbPx = (cropRect.fy + cropRect.fh) * ih;

  // Working surface = union of the image and the frame, plus a margin so the
  // handles never sit flush against (and get clipped by) the canvas edge.
  const cm = Math.round(Math.max(48, Math.min(iw, ih) * 0.08));
  const left   = Math.min(0, clPx) - cm;
  const top    = Math.min(0, ctPx) - cm;
  const right  = Math.max(iw, crPx) + cm;
  const bottom = Math.max(ih, cbPx) + cm;
  const totalW = Math.round(right - left);
  const totalH = Math.round(bottom - top);
  const ox = Math.round(-left), oy = Math.round(-top); // image origin within canvas

  // Match the non-crop annotation scale so annotations don't jump size on enter/exit.
  const s = getSettings();
  const pad = (backgroundEnabled && !ocrModeActive) ? s.padding : 0;
  view = { ox, oy, iw, ih, totalW, annScale: computeAnnScale(iw + pad * 2), titleBarH: 0 };

  // Backing resolution: full-res for explicit zoom, capped to the pane in fit mode.
  const dpr = window.devicePixelRatio || 1;
  if (zoomScale !== null) {
    previewScale = 1;
  } else {
    // Match #canvas-area's padding (72px top clears the floating toolbar,
    // 48px bottom, 32px per side) so the fitted artboard never sits under it.
    const availW = Math.max(1, canvasArea.clientWidth  - 64) * dpr;
    const availH = Math.max(1, canvasArea.clientHeight - 120) * dpr;
    previewScale = Math.min(1, availW / totalW, availH / totalH);
  }
  if (!(previewScale > 0) || !isFinite(previewScale)) previewScale = 1;

  canvas.width  = Math.max(1, Math.round(totalW * previewScale));
  canvas.height = Math.max(1, Math.round(totalH * previewScale));
  // The margin is dimmed over the editor backdrop — not a checkerboard, so drop the
  // transparent-bg helper a previous render may have left on.
  canvas.classList.remove('transparent-bg');

  ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, totalW, totalH);

  // Frame in logical canvas coords.
  const rx = ox + clPx, ry = oy + ctPx;
  const rw = cropRect.fw * iw, rh = cropRect.fh * ih;

  // 1. Canvas fill — shows wherever the frame extends beyond the image. Painted
  //    across the whole frame; the image (drawn next) covers its overlapping part.
  if (cropFillMode === 'solid') ctx.fillStyle = cropFillColor;
  else                          ctx.fillStyle = checkerPattern();
  ctx.fillRect(rx, ry, rw, rh);

  // 2. The screenshot at its position within the (possibly expanded) canvas.
  ctx.drawImage(screenshotImg, ox, oy, iw, ih);

  // 3. Annotations, clipped to the image content rect (they live in image space).
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, iw, ih); ctx.clip();
  ctx.translate(ox, oy);
  drawAnnotations();
  ctx.restore();

  const lw = Math.max(1, 1.5 * viewScale());

  // 4. Dim everything outside the kept region (whole canvas, hole at the frame).
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.rect(0, 0, totalW, totalH);
  ctx.rect(rx, ry, rw, rh);
  ctx.fill('evenodd');

  // 5. Rule-of-thirds guides inside the frame.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(0.5, lw * 0.5);
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(rx + (rw * i) / 3, ry); ctx.lineTo(rx + (rw * i) / 3, ry + rh);
    ctx.moveTo(rx, ry + (rh * i) / 3); ctx.lineTo(rx + rw, ry + (rh * i) / 3);
  }
  ctx.stroke();

  // 6. Frame border + premium pill/bracket handles.
  ctx.strokeStyle = CANVAS_ACCENT;
  ctx.lineWidth = lw;
  ctx.strokeRect(rx, ry, rw, rh);
  drawCropHandles(rx, ry, rw, rh);

  applyZoom();
}

// CleanShot-style crop handles: rounded L-brackets hugging the four corners and a
// single pill bar centred on each edge. Sized in CSS pixels (× viewScale → logical)
// so they stay a constant on-screen size at any zoom. Visual only — hit-testing
// still uses the handle centre points in cropHandles().
function drawCropHandles(rx, ry, rw, rh) {
  const sc  = viewScale();
  const T   = 4  * sc;   // bar thickness
  const ARM = 18 * sc;   // corner bracket arm length
  const PILL= 22 * sc;   // edge pill length
  const r   = T / 2;     // fully-rounded caps

  // A rounded-rect bar, centred on the frame line, filled white with a soft shadow
  // so it reads as a raised handle over both light and dark content.
  const bar = (x, y, w, h) => {
    roundedRectPath(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
  };

  ctx.save();
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth   = Math.max(0.5, sc);
  ctx.lineJoin    = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur  = 4 * sc;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1 * sc;

  const right = rx + rw, bottom = ry + rh, midX = rx + rw / 2, midY = ry + rh / 2;

  // Corner brackets — two overlapping bars per corner, straddling the frame edges.
  // Top-left
  bar(rx - T / 2,        ry - T / 2, ARM, T);   // horizontal arm
  bar(rx - T / 2,        ry - T / 2, T, ARM);   // vertical arm
  // Top-right
  bar(right + T / 2 - ARM, ry - T / 2, ARM, T);
  bar(right - T / 2,     ry - T / 2, T, ARM);
  // Bottom-left
  bar(rx - T / 2,        bottom + T / 2 - T, ARM, T);
  bar(rx - T / 2,        bottom + T / 2 - ARM, T, ARM);
  // Bottom-right
  bar(right + T / 2 - ARM, bottom + T / 2 - T, ARM, T);
  bar(right - T / 2,     bottom + T / 2 - ARM, T, ARM);

  // Edge pills — centred on each edge midpoint.
  bar(midX - PILL / 2, ry - T / 2,     PILL, T);   // top
  bar(midX - PILL / 2, bottom - T / 2, PILL, T);   // bottom
  bar(rx - T / 2,      midY - PILL / 2, T, PILL);   // left
  bar(right - T / 2,   midY - PILL / 2, T, PILL);   // right

  ctx.restore();
}

// Coalesce high-frequency interactive redraws (slider scrubs, annotation drags,
// crop handles) onto a single animation frame. render() rebuilds the full-res
// canvas (drawImage + shadowBlur), so calling it directly on every mousemove /
// input event causes redundant work and jank — this caps it at the display
// refresh rate. Use render() directly only where a synchronous result is needed
// (e.g. the export round-trip).
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

// ─── Annotation drawing ─────────────────────────────────────────────────────────
function drawAnnotations() {
  const list = draft ? annotations.concat([draft]) : annotations;
  for (const a of list) {
    if (a.id && a.id === editingId) continue; // hidden while being edited
    if      (a.type === 'blur')      drawBlur(a);
    else if (a.type === 'highlight') drawHighlight(a);
    else if (a.type === 'arrow')     drawArrow(a);
    else if (a.type === 'line')      drawLine(a);
    else if (a.type === 'rect')      drawShape(a);
    else if (a.type === 'ellipse')   drawShape(a);
    else if (a.type === 'counter')   drawCounter(a);
    else if (a.type === 'text')      drawText(a);
    else if (a.type === 'draw')      drawFree(a);
  }
}

// ─── Free Draw (freehand pen) ───────────────────────────────────────────────────
// Min spacing (canvas px) between captured points while drawing. Higher smoothing
// samples more sparsely, which trims pointer jitter and keeps strokes light. The
// floor stays tiny so input feels immediate; everything scales with the image.
function drawMinDist() {
  return (0.75 + drawSmoothing * 6) * view.annScale;
}

// Render-time smoothing: a few moving-average passes over the (fractional) points,
// strength + pass-count keyed off the stroke's own `smoothing`. Endpoints are
// pinned so the stroke still starts/ends exactly where drawn. Returns a NEW array
// (never mutates a.pts) so the stored path stays the raw captured input — this is
// what lets the Smoothing slider restyle an already-drawn stroke.
function smoothPoints(pts, sm) {
  if (!sm || pts.length <= 2) return pts;
  const t = 0.5 * Math.min(1, sm);          // neighbour blend weight
  const passes = sm > 0.6 ? 2 : 1;
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const out = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      out.push({
        x: cur[i].x * (1 - t) + (cur[i - 1].x + cur[i + 1].x) * 0.5 * t,
        y: cur[i].y * (1 - t) + (cur[i - 1].y + cur[i + 1].y) * 0.5 * t,
      });
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

// Freehand stroke: a rounded, anti-jitter polyline drawn as a single path. Joints
// use quadratic midpoints so the line reads as a continuous smooth curve rather
// than connected segments. A lone point renders as a dot so a quick tap leaves a
// mark.
function drawFree(a) {
  const raw = a.pts;
  if (!raw || !raw.length) return;
  const lw = Math.max(1, (a.width || drawWidth) * view.annScale);

  ctx.save();
  ctx.globalAlpha = a.opacity ?? 1;
  ctx.strokeStyle = a.color;
  ctx.fillStyle   = a.color;
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (raw.length === 1) {
    ctx.beginPath();
    ctx.arc(nx(raw[0].x), ny(raw[0].y), lw / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const pts = smoothPoints(raw, a.smoothing ?? drawSmoothing);
  ctx.beginPath();
  ctx.moveTo(nx(pts[0].x), ny(pts[0].y));
  if (pts.length === 2) {
    ctx.lineTo(nx(pts[1].x), ny(pts[1].y));
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const cx = nx(pts[i].x),     cy = ny(pts[i].y);
      const mx = (cx + nx(pts[i + 1].x)) / 2, my = (cy + ny(pts[i + 1].y)) / 2;
      ctx.quadraticCurveTo(cx, cy, mx, my);
    }
    ctx.lineTo(nx(pts[pts.length - 1].x), ny(pts[pts.length - 1].y));
  }
  ctx.stroke();
  ctx.restore();
}

// Selection bounding box (canvas px) for a freehand stroke — used for the dashed
// selection outline + hit padding. Derived from the raw captured points.
function drawBoundsPx(a) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of a.pts) {
    if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
    if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
  }
  const pad = (a.width || drawWidth) / 2 * view.annScale + 2;
  return { x: nx(minx) - pad, y: ny(miny) - pad,
           w: nx(maxx - minx) + pad * 2, h: ny(maxy - miny) + pad * 2 };
}

// Straight line (arrow without the head).
function drawLine(a) {
  const x1 = nx(a.fx1), y1 = ny(a.fy1), x2 = nx(a.fx2), y2 = ny(a.fy2);
  if (Math.hypot(x2 - x1, y2 - y1) < 1) return;
  ctx.save();
  ctx.globalAlpha = a.opacity ?? 1;
  ctx.strokeStyle = a.color;
  ctx.lineWidth   = Math.max(2, (a.strokeWidth || 3) * view.annScale);
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// Rectangle / ellipse with optional fill + outline.
function drawShape(a) {
  const x = nx(a.fx), y = ny(a.fy), w = nx(a.fw), h = ny(a.fh);
  if (w < 1 || h < 1) return;
  // Corner radius only applies to rects; `?? 8` matches the old hardcoded
  // look exactly, so existing rects with no stored radius are unaffected.
  const r = a.type === 'ellipse' ? 0 : Math.min((a.radius ?? 8) * view.annScale, w / 2, h / 2);
  ctx.save();
  ctx.globalAlpha = a.opacity ?? 1;
  ctx.beginPath();
  if (a.type === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    roundedRectPath(x, y, w, h, r);
  }
  if (a.fill) {
    ctx.fillStyle = a.fillColor || a.color;
    ctx.fill();
  }
  if (a.stroke !== false) {
    ctx.strokeStyle = a.color;
    ctx.lineWidth   = Math.max(1, (a.strokeWidth || 3) * view.annScale);
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

// Numbered counter badge (filled circle + white number).
function drawCounter(a) {
  const x = nx(a.fx), y = ny(a.fy);
  const rad = counterRadius(a);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fillStyle = a.color;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3 * view.annScale;
  ctx.shadowOffsetY = 1 * view.annScale;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = (a.color === '#ffffff' || a.color === '#ffd60a') ? '#000000' : '#ffffff';
  ctx.font = `700 ${Math.round(rad * 1.1)}px ${ANN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(a.n), x, y + 0.5 * view.annScale);
  ctx.restore();
}

// Auto-scaled arrow geometry (canvas px). Everything keys off the on-screen
// length, so a single drag yields a balanced arrow — a thin tapered tail that
// swells into a bold, proportional head — with no manual weight/taper/head
// controls. Absolute floors/caps are multiplied by annScale so the proportions
// stay consistent across screenshot resolutions.
function arrowMetrics(len) {
  const s = view.annScale;
  const headHalf  = Math.min(Math.max(len * 0.10, 5 * s), 26 * s);  // half head width
  const headLen   = Math.min(headHalf * 1.9, len * 0.55);           // head length
  const shaftHalf = Math.min(Math.max(len * 0.03, 1.4 * s), headHalf * 0.42); // shaft @ neck
  const tailHalf  = Math.max(0.6 * s, shaftHalf * 0.18);            // near-point tail
  return { headHalf, headLen, shaftHalf, tailHalf };
}

// Trace a closed polygon with smoothly rounded corners (per-vertex radius via the
// `radius(i)` callback, auto-clamped to the adjacent edges). Each corner is eased
// with a quadratic toward the sharp vertex — handles convex and concave corners
// alike. Leaves the path ready to fill.
function roundedPolyPath(pts, radius) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1x = p0.x - p1.x, v1y = p0.y - p1.y, l1 = Math.hypot(v1x, v1y) || 1;
    const v2x = p2.x - p1.x, v2y = p2.y - p1.y, l2 = Math.hypot(v2x, v2y) || 1;
    const rr  = Math.min(radius(i), l1 / 2, l2 / 2);
    const t1x = p1.x + (v1x / l1) * rr, t1y = p1.y + (v1y / l1) * rr;
    const t2x = p1.x + (v2x / l2) * rr, t2y = p1.y + (v2y / l2) * rr;
    if (i === 0) ctx.moveTo(t1x, t1y); else ctx.lineTo(t1x, t1y);
    ctx.quadraticCurveTo(p1.x, p1.y, t2x, t2y);
  }
  ctx.closePath();
}

// Pure arrow silhouette (no label) — the geometry half of drawArrow() below.
// Elbow variant: tail → corner → head, corner at (x2, y1) so the shaft runs
// horizontal-then-vertical. Rendered as a round-jointed stroke (which naturally
// gives a smoothly rounded elbow and tail cap) topped with the same triangular
// wing head used by the straight silhouette, sized from arrowMetrics so both
// styles read as the same "weight" of arrow.
function drawArrowShapeBent(a, x1, y1, x2, y2) {
  const corner = { x: x2, y: y1 };
  const totalLen = Math.hypot(corner.x - x1, corner.y - y1) + Math.hypot(x2 - corner.x, y2 - corner.y);
  if (totalLen < 1) return false;

  const dx2 = x2 - corner.x, dy2 = y2 - corner.y;
  const len2 = Math.hypot(dx2, dy2);
  if (len2 < 1) return false; // head segment degenerates (pure vertical/horizontal drag) — fall back to straight

  const { headHalf, headLen, shaftHalf } = arrowMetrics(totalLen);
  const ux2 = dx2 / len2, uy2 = dy2 / len2;
  const shaftEndX = x2 - ux2 * headLen * 0.85, shaftEndY = y2 - uy2 * headLen * 0.85;

  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = shaftHalf * 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(corner.x, corner.y);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.stroke();

  const px = -uy2, py = ux2;
  const bx = x2 - ux2 * headLen, by = y2 - uy2 * headLen;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(bx + px * headHalf, by + py * headHalf);
  ctx.lineTo(bx - px * headHalf, by - py * headHalf);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return true;
}

function drawArrowShape(a) {
  const x1 = nx(a.fx1), y1 = ny(a.fy1), x2 = nx(a.fx2), y2 = ny(a.fy2);
  if (a.style === 'bent' && drawArrowShapeBent(a, x1, y1, x2, y2)) return;

  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const ux = dx / len, uy = dy / len;   // unit tail→tip
  const px = -uy, py = ux;              // unit perpendicular
  const { headHalf, headLen, shaftHalf, tailHalf } = arrowMetrics(len);

  // Barbs sit `headLen` behind the tip; the shaft joins a little ahead of them so
  // the head reads as a swept-back wing rather than a flat-backed triangle.
  const bx = x2 - ux * headLen,        by = y2 - uy * headLen;          // barb line
  const cx = x2 - ux * headLen * 0.70, cy = y2 - uy * headLen * 0.70;   // shaft neck

  // One continuous silhouette: rounded tail → linear taper → swept head → tip.
  const pts = [
    { x: x1 + px * tailHalf,  y: y1 + py * tailHalf  },  // 0 tail top
    { x: cx + px * shaftHalf, y: cy + py * shaftHalf },  // 1 neck top
    { x: bx + px * headHalf,  y: by + py * headHalf  },  // 2 wing top
    { x: x2,                  y: y2                  },  // 3 tip
    { x: bx - px * headHalf,  y: by - py * headHalf  },  // 4 wing bottom
    { x: cx - px * shaftHalf, y: cy - py * shaftHalf },  // 5 neck bottom
    { x: x1 - px * tailHalf,  y: y1 - py * tailHalf  },  // 6 tail bottom
  ];
  const radius = (i) => {
    if (i === 3)             return shaftHalf * 0.7;   // tip — kept crisp
    if (i === 2 || i === 4)  return shaftHalf * 1.3;   // wing tips — softly rounded
    if (i === 1 || i === 5)  return shaftHalf * 0.9;   // neck notch
    return tailHalf;                                   // tail — fully rounded
  };

  ctx.save();
  ctx.fillStyle = a.color;
  roundedPolyPath(pts, radius);
  ctx.fill();
  ctx.restore();
}

// Vertical metrics of the annotation font at a given on-screen size, in canvas
// px. fontBoundingBox* is a property of the FONT, not the typed string, so the
// glyph box height stays constant while editing — the text never shifts up/down
// as characters are added. `asc` is the distance from the drawing anchor (font-
// box top) down to the baseline. Falls back to typical ratios if a browser ever
// omits the metrics.
function textVMetrics(fs) {
  ctx.save();
  ctx.font = `${ANN_FONT_WEIGHT} ${fs}px ${ANN_FONT}`;
  const m = ctx.measureText('Hg');
  ctx.restore();
  const asc  = m.fontBoundingBoxAscent  > 0 ? m.fontBoundingBoxAscent  : fs * 0.92;
  const desc = m.fontBoundingBoxDescent > 0 ? m.fontBoundingBoxDescent : fs * 0.21;
  return { asc, desc, height: asc + desc };
}

// The text's drawing anchor (nx(fx), ny(fy)) is the TOP of the font box. The
// selection/edit box wraps that font box with an equal margin on every side, so
// the glyphs sit dead-centre. Margin tracks the outline halo when present.
function textBox(a) {
  const fs = a.fontSize * view.annScale;
  ctx.save();
  ctx.font = `${ANN_FONT_WEIGHT} ${fs}px ${ANN_FONT}`;
  const tw = ctx.measureText(a.text || ' ').width;
  ctx.restore();
  const vm  = textVMetrics(fs);
  const pad = Math.max(3 * view.annScale,
                       a.outline ? Math.max(2, fs * TEXT_OUTLINE_RATIO) / 2 : 0);
  return { x: nx(a.fx) - pad, y: ny(a.fy) - pad,
           w: tw + pad * 2,   h: vm.height + pad * 2, fs };
}

// Core label renderer: draws `text` with the outline halo at the canvas-px anchor
// (x, y), honouring a horizontal alignment ('left'|'right'|'center') and a
// vertical anchor ('top'|'middle'|'bottom' — how y relates to the glyph
// font-box). Shared by the standalone Text tool, the live editing preview and
// arrow labels, so all three look identical.
function drawLabelText(text, x, y, o) {
  if (!text) return;
  const fs = o.fontSize * view.annScale;
  const vm = textVMetrics(fs);
  const baseline = o.vAnchor === 'middle' ? y + (vm.asc - vm.desc) / 2
                 : o.vAnchor === 'bottom' ? y - vm.desc
                 :                          y + vm.asc;          // 'top'
  ctx.save();
  ctx.font         = `${o.fontWeight || ANN_FONT_WEIGHT} ${fs}px ${ANN_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign    = o.align || 'left';
  ctx.globalAlpha  = o.opacity ?? 1;
  if (o.outline) {
    // Thick contrasting halo stroked around the glyphs, then the text filled on
    // top so the inner half of the stroke is covered — leaves a clean outer
    // outline that lifts the text off the screenshot. Lighter than a pill fill.
    ctx.strokeStyle = o.outlineColor || defaultOutlineColor();
    ctx.lineWidth   = Math.max(2, fs * TEXT_OUTLINE_RATIO);
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.strokeText(text, x, baseline);
  } else {
    // No outline: a subtle drop shadow still gives a little separation.
    ctx.shadowColor   = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur    = 3 * view.annScale;
    ctx.shadowOffsetY = 1 * view.annScale;
  }
  ctx.fillStyle = o.color;
  ctx.fillText(text, x, baseline);
  ctx.restore();
}

function drawText(a) {
  // Standalone text: anchor is the font-box top-left, left-aligned.
  drawLabelText(a.text, nx(a.fx), ny(a.fy), {
    fontSize: a.fontSize, color: a.color,
    outline: a.outline, outlineColor: a.outlineColor, align: 'left', vAnchor: 'top',
  });
}

// Ghost hint shown at the tail while an arrow's label field is empty (see
// drawEditingText) — invites an optional label without suggesting one is required.
const ARROW_LABEL_PLACEHOLDER = 'Add text (optional)';
const ARROW_LABEL_PLACEHOLDER_OPACITY = 0.4;

// Where an arrow's label sits + how it aligns, derived from the arrow direction so
// the label always hugs the TAIL on the side away from the head and reads
// naturally. Returns a canvas-px anchor (x, y), horizontal align + vertical anchor.
function arrowLabelLayout(a) {
  const x1 = nx(a.fx1), y1 = ny(a.fy1), x2 = nx(a.fx2), y2 = ny(a.fy2);
  const dx = x2 - x1, dy = y2 - y1;
  const gap = Math.max(6 * view.annScale, a.fontSize * view.annScale * 0.45);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { x: x1 - gap, y: y1, align: 'right',  vAnchor: 'middle' }  // → points right: label LEFT, right-aligned
      : { x: x1 + gap, y: y1, align: 'left',   vAnchor: 'middle' }; // ← points left:  label RIGHT, left-aligned
  }
  return dy >= 0
    ? { x: x1, y: y1 - gap, align: 'center', vAnchor: 'bottom' }    // ↓ points down: label ABOVE, centred
    : { x: x1, y: y1 + gap, align: 'center', vAnchor: 'top' };      // ↑ points up:   label BELOW, centred
}

// Bounding box (canvas px) of an arrow's label, for hit-testing + selection.
function arrowLabelBox(a) {
  if (!a.textEnabled || !a.text) return null;
  const lay = arrowLabelLayout(a);
  const fs  = a.fontSize * view.annScale;
  ctx.save();
  ctx.font = `${ANN_FONT_WEIGHT} ${fs}px ${ANN_FONT}`;
  const tw = ctx.measureText(a.text).width;
  ctx.restore();
  const vm  = textVMetrics(fs);
  const pad = Math.max(3 * view.annScale, a.outline ? Math.max(2, fs * TEXT_OUTLINE_RATIO) / 2 : 0);
  const left = lay.align === 'right'  ? lay.x - tw
             : lay.align === 'center' ? lay.x - tw / 2
             :                          lay.x;
  const top  = lay.vAnchor === 'middle' ? lay.y - vm.height / 2
             : lay.vAnchor === 'bottom' ? lay.y - vm.height
             :                            lay.y;
  return { x: left - pad, y: top - pad, w: tw + pad * 2, h: vm.height + pad * 2 };
}

// Every arrow, with an optional auto-positioned tail label (opt-in via
// Advanced Properties' "Add text to tail" — textEnabled false or empty text
// leaves a plain arrow).
function drawArrow(a) {
  drawArrowShape(a);   // reuses fx1..fy2 + color
  // While the label is being edited the live preview stands in for it.
  if (editing && editing.kind === 'arrowlabel' && editing.id === a.id) return;
  if (!a.textEnabled || !a.text) return;
  const lay = arrowLabelLayout(a);
  drawLabelText(a.text, lay.x, lay.y, {
    fontSize: a.fontSize, color: a.textColor || a.color,
    outline: a.outline, outlineColor: a.outlineColor, align: lay.align, vAnchor: lay.vAnchor,
  });
}

// Reusable offscreen canvases for the redact effect (avoids per-frame allocation
// during drags). _bSmall = downscaled average, _bBlocks = upscaled hard blocks,
// _bOut = blurred + feathered result that gets composited onto the canvas.
const _bSmall  = document.createElement('canvas');
const _bBlocks = document.createElement('canvas');
const _bOut    = document.createElement('canvas');

// CleanShot-style redaction: a true pixelation pass (each block = the average
// colour of its source region, which is what actually obscures/secures the
// content) softened by a tiny Gaussian blur on top, with the outer edge
// feathered so the region melts into the screenshot rather than cutting off in
// a hard rectangle. The strength slider (2..60) scales block size and blur
// radius together. The blur is purely cosmetic — it stays small enough that the
// averaged blocks can never bleed back into readable detail.
// Auto-Redact marker: a dashed green outline + 🤖 badge so AI-suggested
// redactions read as "review me", distinct from manual blurs. UI-only — never
// baked into the export (suppressUI is true during the export round-trip), so
// the delivered image is a clean redaction with no outline. Shared by every
// blur type (solid/blur/pixelated) since it's independent of the effect itself.
function drawBlurAIMarker(a, x, y, w, h) {
  if (!a.isAIDetected || suppressUI) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(76, 175, 80, 0.95)';
  ctx.lineWidth = Math.max(1.5, 2 * view.annScale);
  ctx.setLineDash([5 * view.annScale, 4 * view.annScale]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.font = `${Math.round(12 * view.annScale)}px ${ANN_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('🤖', x + 2 * view.annScale, y + 2 * view.annScale);
  ctx.restore();
}

// Dispatch to whichever redaction effect the annotation is set to — Pixelated
// is the original, always-available effect; Blur is a real, distinct renderer
// (not just a Pixelated re-skin).
function drawBlur(a) {
  const type = a.blurType || 'pixelated';
  if (type === 'blur') drawBlurGaussian(a);
  else drawBlurPixelated(a);
}

// Blur: a genuine smooth Gaussian blur of the source region — no pixelation
// step, unlike Pixelated below. Same edge-feathering approach so it blends
// into the screenshot the same way the other two modes do.
function drawBlurGaussian(a) {
  const x = nx(a.fx), y = ny(a.fy), w = nx(a.fw), h = ny(a.fh);
  if (w < 1 || h < 1) return;

  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));

  // Slider 2..60 → a real blur radius (much larger than Pixelated's cosmetic
  // touch-up blur, since here the blur itself IS the whole redaction effect).
  const t       = Math.max(0, Math.min(1, ((a.strength || 20) - 2) / 58));
  const blurRad = (4 + 28 * t) * view.annScale;
  const feather = Math.min(5 * view.annScale, W / 2, H / 2);

  const sw0 = screenshotImg.naturalWidth  || screenshotImg.width;
  const sh0 = screenshotImg.naturalHeight || screenshotImg.height;
  const sx = Math.max(0, Math.min(sw0, a.fx * sw0));
  const sy = Math.max(0, Math.min(sh0, a.fy * sh0));
  const sw = Math.max(1, Math.min(sw0 - sx, a.fw * sw0));
  const sh = Math.max(1, Math.min(sh0 - sy, a.fh * sh0));

  _bOut.width = W; _bOut.height = H;
  const octx = _bOut.getContext('2d');
  octx.clearRect(0, 0, W, H);
  octx.filter = `blur(${blurRad}px)`;
  octx.drawImage(screenshotImg, sx, sy, sw, sh, 0, 0, W, H);
  octx.filter = 'none';

  if (feather > 0.5) {
    octx.globalCompositeOperation = 'destination-out';
    const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = octx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      octx.fillStyle = g;
      octx.fillRect(rx, ry, rw, rh);
    };
    fade(0, 0, feather, 0, 0, 0, feather, H);
    fade(W, 0, W - feather, 0, W - feather, 0, feather, H);
    fade(0, 0, 0, feather, 0, 0, W, feather);
    fade(0, H, 0, H - feather, 0, H - feather, W, feather);
    octx.globalCompositeOperation = 'source-over';
  }

  ctx.drawImage(_bOut, 0, 0, W, H, x, y, w, h);
  drawBlurAIMarker(a, x, y, w, h);
}

// Pixelated (the original, only-ever-implemented effect): true pixelation
// (each block = the average colour of its source region) softened by a tiny
// cosmetic blur, with the outer edge feathered into the screenshot.
function drawBlurPixelated(a) {
  const x = nx(a.fx), y = ny(a.fy), w = nx(a.fw), h = ny(a.fh);
  if (w < 1 || h < 1) return;

  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));

  // Slider 2..60 → ~6..20px blocks + ~1..3px blur, scaled with the image so the
  // effect keeps the same visual weight on hi-res screenshots.
  const t       = Math.max(0, Math.min(1, ((a.strength || 20) - 2) / 58));
  const block   = Math.max(3, (6 + 14 * t) * view.annScale);
  const blurRad = (2 + 3 * t) * view.annScale;
  const feather = Math.min(5 * view.annScale, W / 2, H / 2);

  // Source region in the screenshot's own pixels (Image → naturalWidth, or a
  // post-crop canvas → width). Clamp so a region nudged past the edge is safe.
  const sw0 = screenshotImg.naturalWidth  || screenshotImg.width;
  const sh0 = screenshotImg.naturalHeight || screenshotImg.height;
  const sx = Math.max(0, Math.min(sw0, a.fx * sw0));
  const sy = Math.max(0, Math.min(sh0, a.fy * sh0));
  const sw = Math.max(1, Math.min(sw0 - sx, a.fw * sw0));
  const sh = Math.max(1, Math.min(sh0 - sy, a.fh * sh0));

  // ── Step 1: pixelate. Downscale the region so each on-screen block collapses
  // to a single averaged pixel (high-quality smoothing = area average → the
  // content is genuinely destroyed), then upscale with nearest-neighbour so it
  // paints back as solid colour blocks.
  const smallW = Math.max(1, Math.round(W / block));
  const smallH = Math.max(1, Math.round(H / block));
  _bSmall.width = smallW; _bSmall.height = smallH;
  const sctx = _bSmall.getContext('2d');
  sctx.clearRect(0, 0, smallW, smallH);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(screenshotImg, sx, sy, sw, sh, 0, 0, smallW, smallH);

  _bBlocks.width = W; _bBlocks.height = H;
  const blkctx = _bBlocks.getContext('2d');
  blkctx.clearRect(0, 0, W, H);
  blkctx.imageSmoothingEnabled = false;            // nearest = hard-edged blocks
  blkctx.drawImage(_bSmall, 0, 0, smallW, smallH, 0, 0, W, H);

  // ── Step 2: light Gaussian blur ON TOP of the blocks — softens the hard block
  // edges so it reads as smooth rather than a sharp checkerboard, without
  // un-obscuring anything (radius stays tiny relative to the block size).
  _bOut.width = W; _bOut.height = H;
  const octx = _bOut.getContext('2d');
  octx.clearRect(0, 0, W, H);
  octx.filter = blurRad > 0.05 ? `blur(${blurRad}px)` : 'none';
  octx.drawImage(_bBlocks, 0, 0);
  octx.filter = 'none';

  // ── Step 3: feather the outer edge. Erase the alpha across the outer `feather`
  // px on each side (corners fall off naturally where two edges overlap) so the
  // effect fades into the original screenshot drawn underneath.
  if (feather > 0.5) {
    octx.globalCompositeOperation = 'destination-out';
    const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = octx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,1)');           // boundary → fully erased
      g.addColorStop(1, 'rgba(0,0,0,0)');           // inward   → kept
      octx.fillStyle = g;
      octx.fillRect(rx, ry, rw, rh);
    };
    fade(0, 0, feather, 0, 0, 0, feather, H);                 // left
    fade(W, 0, W - feather, 0, W - feather, 0, feather, H);   // right
    fade(0, 0, 0, feather, 0, 0, W, feather);                 // top
    fade(0, H, 0, H - feather, 0, H - feather, W, feather);   // bottom
    octx.globalCompositeOperation = 'source-over';
  }

  // Composite the finished effect. The feathered alpha lets the original
  // screenshot (already painted beneath) show through at the edges.
  ctx.drawImage(_bOut, 0, 0, W, H, x, y, w, h);
  drawBlurAIMarker(a, x, y, w, h);
}

// Real-highlighter stroke: a straight translucent band swept by a fixed-angle
// chisel nib from start (fx1,fy1) → end (fx2,fy2). Because the nib keeps a fixed
// orientation, the two end caps come out slightly slanted — the natural marker
// look — instead of a flat rectangle. Thickness stays ≈ the pen width whatever
// direction the user drags. Rendered live while dragging (WYSIWYG, no box).
function drawHighlight(a) {
  const x1 = nx(a.fx1), y1 = ny(a.fy1), x2 = nx(a.fx2), y2 = ny(a.fy2);
  let dx = x2 - x1, dy = y2 - y1;
  let len = Math.hypot(dx, dy);
  if (len < 0.5) { dx = 1; dy = 0; len = 1; }   // tap → stamp a single nib width

  const wpx = Math.max(2, (a.width || highlightWidth) * view.annScale);
  const ux = dx / len, uy = dy / len;            // along the stroke
  const px = -uy, py = ux;                        // perpendicular to the stroke
  // Nib = perpendicular tilted toward the stroke direction by the chisel angle,
  // half-width on each side. This is what slants the end caps.
  const ca = Math.cos(HIGHLIGHT_CHISEL_ANGLE), sa = Math.sin(HIGHLIGHT_CHISEL_ANGLE);
  const nbx = (px * ca + ux * sa) * (wpx / 2);
  const nby = (py * ca + uy * sa) * (wpx / 2);

  // Four corners of the band, traced with a slight corner radius so the tips read
  // as a soft marker nib rather than sharp 90° edges. (roundedPolyPath clamps the
  // radius to half the shortest adjacent edge, so it's safe on tiny strokes.)
  const corners = [
    { x: x1 + nbx, y: y1 + nby },
    { x: x2 + nbx, y: y2 + nby },
    { x: x2 - nbx, y: y2 - nby },
    { x: x1 - nbx, y: y1 - nby },
  ];
  const radius = wpx * 0.3;

  ctx.save();
  ctx.globalAlpha = a.opacity ?? HIGHLIGHT_OPACITY;
  ctx.fillStyle = a.color;
  roundedPolyPath(corners, () => radius);
  ctx.fill();
  ctx.restore();
}

// ─── Selection overlay (handles) ─────────────────────────────────────────────────
function getHandles(a) {
  if (a.type === 'arrow' || a.type === 'line' || a.type === 'highlight') {
    return [
      { name: 'p1', x: nx(a.fx1), y: ny(a.fy1) },
      { name: 'p2', x: nx(a.fx2), y: ny(a.fy2) },
    ];
  }
  if (a.type === 'blur' || a.type === 'rect' || a.type === 'ellipse') {
    const x = nx(a.fx), y = ny(a.fy), w = nx(a.fw), h = ny(a.fh);
    return [
      { name: 'nw', x: x,     y: y     },
      { name: 'ne', x: x + w, y: y     },
      { name: 'sw', x: x,     y: y + h },
      { name: 'se', x: x + w, y: y + h },
    ];
  }
  return []; // text: move only
}

function drawSelectionOverlay() {
  const a = annotations.find(x => x.id === selectedId);
  if (!a) return;

  const accent = CANVAS_ACCENT;
  const hs = 9 * viewScale();          // handle size, constant on screen
  const lw = Math.max(1, 1.5 * viewScale());

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = lw;
  ctx.setLineDash([6 * viewScale(), 4 * viewScale()]);

  // This overlay is drawn ONLY for the object the user has explicitly selected in
  // select mode (objects are never auto-selected on creation), so it always means
  // "this is what a move / resize / delete will act on" — never a creation-time
  // container. The dashed box gives that confirmation for move-only objects (text,
  // counter, free-draw) and shows the resize bounds for box shapes. Arrows, lines
  // and highlight strokes get no box: their two endpoint grips below are both the
  // selection cue and the resize affordance, so a box tracing the visible stroke
  // would just be noise.
  if (a.type === 'text') {
    const b = textBox(a);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  } else if (a.type === 'blur' || a.type === 'rect' || a.type === 'ellipse') {
    ctx.strokeRect(nx(a.fx), ny(a.fy), nx(a.fw), ny(a.fh));
  } else if (a.type === 'counter') {
    const rad = counterRadius(a);
    ctx.strokeRect(nx(a.fx) - rad, ny(a.fy) - rad, rad * 2, rad * 2);
  } else if (a.type === 'draw') {
    const b = drawBoundsPx(a);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }

  // Resize grips — endpoint handles for arrows/lines, corner handles for shapes.
  // getHandles() returns [] for move-only types, so they show only the box above.
  ctx.setLineDash([]);
  for (const hnd of getHandles(a)) {
    ctx.fillStyle   = '#fff';
    ctx.strokeStyle = accent;
    ctx.fillRect(hnd.x - hs / 2, hnd.y - hs / 2, hs, hs);
    ctx.strokeRect(hnd.x - hs / 2, hnd.y - hs / 2, hs, hs);
  }
  ctx.restore();
}

// ─── Hit testing (all in screenshot-space pixels) ────────────────────────────────
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTest(sx, sy) {
  const tol = 8 * viewScale();
  // Topmost first
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    if (a.type === 'arrow' || a.type === 'line') {
      // Arrows auto-scale their thickness from length; plain lines use strokeWidth.
      const half = a.type === 'line'
        ? ((a.strokeWidth || 3) / 2 + 2) * view.annScale
        : arrowMetrics(Math.hypot(nx(a.fx2) - nx(a.fx1), ny(a.fy2) - ny(a.fy1))).headHalf;
      if (distToSegment(sx, sy, nx(a.fx1), ny(a.fy1), nx(a.fx2), ny(a.fy2)) <= tol + half) return a;
      // An arrow's label (if any) is also grabbable by its text box
      if (a.type === 'arrow') {
        const lb = arrowLabelBox(a);
        if (lb && sx >= lb.x && sx <= lb.x + lb.w && sy >= lb.y && sy <= lb.y + lb.h) return a;
      }
    } else if (a.type === 'highlight') {
      // Marker stroke: grabbable anywhere along the band (half its pen width).
      const half = (a.width || highlightWidth) / 2 * view.annScale;
      if (distToSegment(sx, sy, nx(a.fx1), ny(a.fy1), nx(a.fx2), ny(a.fy2)) <= tol + half) return a;
    } else if (a.type === 'text') {
      const b = textBox(a);
      if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return a;
    } else if (a.type === 'counter') {
      const rad = counterRadius(a);
      if (Math.hypot(sx - nx(a.fx), sy - ny(a.fy)) <= rad + tol) return a;
    } else if (a.type === 'draw') {
      const half = ((a.width || drawWidth) / 2 + 2) * view.annScale;
      const pts = a.pts || [];
      if (pts.length === 1) {
        if (Math.hypot(sx - nx(pts[0].x), sy - ny(pts[0].y)) <= tol + half) return a;
      }
      for (let j = 0; j < pts.length - 1; j++) {
        if (distToSegment(sx, sy, nx(pts[j].x), ny(pts[j].y), nx(pts[j + 1].x), ny(pts[j + 1].y)) <= tol + half) return a;
      }
    } else { // blur / rect / ellipse
      const x = nx(a.fx), y = ny(a.fy), w = nx(a.fw), h = ny(a.fh);
      if (sx >= x - tol && sx <= x + w + tol && sy >= y - tol && sy <= y + h + tol) return a;
    }
  }
  return null;
}

function handleAt(a, sx, sy) {
  const tol = 9 * viewScale();
  for (const hnd of getHandles(a)) {
    if (Math.hypot(sx - hnd.x, sy - hnd.y) <= tol) return hnd.name;
  }
  return null;
}

// ─── Tool selection ───────────────────────────────────────────────────────────
// Drag-to-create shapes (text and counter are click-placed; crop is its own mode).
function isDrawingTool(t) {
  return t === 'arrow' || t === 'line' || t === 'rect' || t === 'ellipse'
      || t === 'blur'  || t === 'highlight';
}
// The three primitives folded into the single "Shape" toolbar button.
function isShapeGroupTool(t) { return t === 'line' || t === 'rect' || t === 'ellipse'; }
function isAnnTool(t)     { return isDrawingTool(t) || t === 'text' || t === 'counter' || t === 'draw'; }

function setActiveTool(tool) {
  multiSelectAll = false;
  const prev = activeTool;
  activeTool = tool;
  // A tool's own Advanced Properties panel (Crop/Arrow/Shape/etc.) may steal
  // the shared color-picker out of the Background section's slot via its own
  // dockColorPicker call further down this function's callers — collapse
  // Background's tile/slot proactively so they don't show stale open state.
  collapseBgColorPicker();
  // Any tool switch drops the soft edit target — switching back later requires
  // an explicit Select-tool click, same as any other previously-placed object.
  editTargetId = null;
  // Only a real, explicit tool choice updates the Advanced-Properties memory —
  // an implicit revert to idle (tool === null, e.g. from commitAndDismiss/Escape)
  // must leave it alone so the sidebar keeps showing the last tool's panel.
  if (tool !== null) lastAdvPropsTool = tool;

  // Remember the last-used Shape primitive so the single toolbar button and its
  // keyboard shortcuts restore the right one next time.
  if (isShapeGroupTool(tool)) lastShapeTool = tool;

  // Choosing any annotation tool clears the current selection
  if (isAnnTool(tool)) selectedId = null;

  // Crop is a dedicated mode (drag a region, then confirm/cancel)
  if (tool === 'crop') startCropMode();
  else if (prev === 'crop') endCropMode(false);

  // Highlight the active toolbar button. In the neutral idle state
  // (activeTool === null) no button's data-tool matches, so nothing is
  // highlighted; 'select' is a real, explicitly-chosen tool that lights up its
  // own button like any other. The merged Shape button owns three tool values
  // (line/rect/ellipse), so it's highlighted separately below.
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === activeTool);
  });
  const shapeBtn = document.querySelector('.tool-btn[data-tool="shape"]');
  if (shapeBtn) shapeBtn.classList.toggle('active', isShapeGroupTool(activeTool));

  updateTextOptsVisibility();

  canvas.style.cursor = tool === 'text' ? 'text'
                      : tool === 'crop' ? 'move'
                      : (isDrawingTool(tool) || tool === 'counter' || tool === 'draw') ? 'crosshair'
                      : 'grab'; // select mode: the image is draggable out to other apps
  render();
}

// Advanced Properties header badge: plain name of whichever tool the panel's
// body currently belongs to (Crop / Arrow / Line / Rectangle / Circle).
const ADV_BADGE_LABELS = { crop: 'Crop', arrow: 'Arrow', line: 'Line', rect: 'Rectangle', ellipse: 'Circle', draw: 'Draw', highlight: 'Highlight', counter: 'Counter', text: 'Text', blur: 'Blur' };
function setAdvPropsBadge(tool) {
  if (advPropsBadgeText) advPropsBadgeText.textContent = ADV_BADGE_LABELS[tool] || tool;
}

function updateTextOptsVisibility() {
  const sel = editTarget();
  const isOn = (k) => activeTool === k || (sel && sel.type === k);

  const showText  = isOn('text');
  const showBlur  = isOn('blur');
  const showShape = isOn('rect') || isOn('ellipse');
  const showLineShape = isOn('line');   // plain Line only — Arrow has its own panel now
  const showArrow = isOn('arrow');
  // The shape-type picker belongs to the tool (what to draw next), not to a
  // placed object — so it shows only while the Shape tool itself is active.
  const showShapeType = isShapeGroupTool(activeTool);
  const showCounter = isOn('counter');
  const showDraw  = isOn('draw');
  const showHighlight = isOn('highlight');
  const showCrop  = activeTool === 'crop';

  // Line/Rectangle/Circle now share one Basic-properties panel (just the
  // colour palette) and one Advanced Properties panel (segmented control +
  // whichever primitive's own controls) — see [[advanced-properties-redesign]].
  const showShapeAny = showShape || showLineShape;

  // Advanced Properties (sidebar) has its own, more forgiving notion of "current
  // tool": it falls back to lastAdvPropsTool whenever activeTool has reverted to
  // idle (e.g. clicking empty canvas), so the panel keeps showing the last real
  // tool's controls instead of disappearing — only an explicit new tool choice
  // (setActiveTool with a non-null tool, including Select) replaces it.
  const advTool = activeTool || lastAdvPropsTool;
  const isOnAdv = (k) => advTool === k || (sel && sel.type === k);
  const showTextAdv      = isOnAdv('text');
  const showBlurAdv      = isOnAdv('blur');
  const showShapeAdv     = isOnAdv('rect') || isOnAdv('ellipse') || isOnAdv('line');
  const showArrowAdv     = isOnAdv('arrow');
  const showCounterAdv   = isOnAdv('counter');
  const showDrawAdv      = isOnAdv('draw');
  const showHighlightAdv = isOnAdv('highlight');
  const showCropAdv      = advTool === 'crop';

  annTextOpts.style.display = showText ? 'flex' : 'none';
  annBlurOpts.style.display = showBlur ? 'flex' : 'none';
  if (annShapeTypeOpts) annShapeTypeOpts.style.display = showShapeType ? 'flex' : 'none';
  if (annShapeOpts) annShapeOpts.style.display = showShapeAny ? 'flex' : 'none';
  if (annArrowOpts) annArrowOpts.style.display = showArrow ? 'flex' : 'none';
  if (annCounterOpts) annCounterOpts.style.display = showCounter ? 'flex' : 'none';
  if (annDrawOpts)  annDrawOpts.style.display   = showDraw ? 'flex' : 'none';
  if (annHighlightOpts) annHighlightOpts.style.display = showHighlight ? 'flex' : 'none';
  if (annCropOpts)  annCropOpts.style.display  = showCrop  ? 'flex' : 'none';
  if (advCropOpts)  advCropOpts.style.display  = showCropAdv  ? 'flex' : 'none';
  if (advArrowOpts) advArrowOpts.style.display = showArrowAdv ? 'flex' : 'none';
  if (advShapeOpts) advShapeOpts.style.display = showShapeAdv ? 'flex' : 'none';
  if (advDrawOpts)  advDrawOpts.style.display  = showDrawAdv  ? 'flex' : 'none';
  if (advHighlightOpts) advHighlightOpts.style.display = showHighlightAdv ? 'flex' : 'none';
  if (advCounterOpts)   advCounterOpts.style.display   = showCounterAdv   ? 'flex' : 'none';
  if (advTextOpts)      advTextOpts.style.display      = showTextAdv     ? 'flex' : 'none';
  if (advBlurOpts)      advBlurOpts.style.display      = showBlurAdv     ? 'flex' : 'none';

  // Colourable tools whose colour is the shared `currentColor`. Every one of these
  // now has its own colour control, so the legacy 4-preset quick-swatch row
  // (#ann-colors) is never shown — Highlight, the last tool that used it, now has
  // its own colour + width panel and an independent (yellow) colour.
  const colourable = showArrow || showShapeAny || isOn('text') || isOn('counter') || isOn('draw');
  const showColors = colourable && !showShapeAny && !showArrow && !showText && !showCounter && !showDraw;
  if (annColors) annColors.style.display = showColors ? 'flex' : 'none';

  const shapeSel = sel && (sel.type === 'rect' || sel.type === 'ellipse' || sel.type === 'line') ? sel : null;
  if (showShapeAny || showShapeAdv) syncShapeOpts(shapeSel);
  if (showArrow || showArrowAdv) syncArrowOpts(sel && sel.type === 'arrow' ? sel : null);
  if (showText  || showTextAdv)  syncTextOpts(sel && sel.type === 'text' ? sel : null);
  if (showCounter || showCounterAdv) syncCounterOpts(sel && sel.type === 'counter' ? sel : null);
  if (showDraw  || showDrawAdv)  syncDrawOpts(sel && sel.type === 'draw' ? sel : null);
  if (showHighlight || showHighlightAdv) syncHighlightOpts(sel && sel.type === 'highlight' ? sel : null);
  if (showBlur || showBlurAdv) syncBlurOpts(sel && sel.type === 'blur' ? sel : null);
  // Broader than showShapeType alone: the Advanced instance of this segmented
  // control stays visible while a shape is merely selected, or while the
  // Advanced panel is showing the last Shape tool from idle (see syncShapeTypeSeg
  // and setAdvPropsBadge's own shapeTool fallback).
  if (showShapeType || showShapeAny || showShapeAdv) syncShapeTypeSeg();

  // The whole tool-props panel appears when any tool needs it. It's an
  // inline flex sibling of #ab-tools/.tbar-right now (not a floating overlay),
  // so no anchoring/positioning math is needed — the bar's own flex layout
  // handles it.
  const showProps = colourable || showBlur || showCrop || showHighlight || showShapeType;
  annProps.style.display = showProps ? 'flex' : 'none';
  if (annPropsWrap) annPropsWrap.style.display = showProps ? 'block' : 'none';

  // Advanced Properties (sidebar): always the first #controls section, hidden
  // only when even the fallback advTool has no advanced controls of its own
  // (idle with no prior tool, or the user explicitly picked Select/Crop-less state).
  const showAdvProps = showCropAdv || showArrowAdv || showShapeAdv || showDrawAdv || showHighlightAdv || showCounterAdv || showTextAdv || showBlurAdv;
  if (advPropsSection) advPropsSection.hidden = !showAdvProps;
  if (showCropAdv) setAdvPropsBadge('crop');
  else if (showArrowAdv) setAdvPropsBadge('arrow');
  else if (showShapeAdv) {
    const shapeTool = isShapeGroupTool(advTool) ? advTool
                     : (sel && (sel.type === 'line' || sel.type === 'rect' || sel.type === 'ellipse')) ? sel.type
                     : lastShapeTool;
    setAdvPropsBadge(shapeTool || 'rect');
  } else if (showDrawAdv) setAdvPropsBadge('draw');
  else if (showHighlightAdv) setAdvPropsBadge('highlight');
  else if (showCounterAdv) setAdvPropsBadge('counter');
  else if (showTextAdv) setAdvPropsBadge('text');
  else if (showBlurAdv) setAdvPropsBadge('blur');

  // Dock/undock the shared full colour picker into whichever tool's Advanced
  // Properties panel needs it — only one tool is ever active, so the singleton
  // just gets reparented. dockColorPicker() itself is idempotent/cheap to call
  // repeatedly (it only reparents/resizes the canvas when the container
  // actually changed) and never fires onChange on its own, so calling it here
  // on every visibility refresh just keeps it correctly seeded.
  if (showCropAdv) {
    dockColorPicker(advCropPaletteSlot, cropFillColor, (col) => {
      cropFillColor = col;
      cropFillMode = 'solid';
      saveCropFill();
      scheduleRender();
    });
  } else if (showArrowAdv) {
    const a = sel && sel.type === 'arrow' ? sel : null;
    dockColorPicker(advArrowPaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncArrowOpts(a);
    });
  } else if (showShapeAdv) {
    // Already handled above by syncShapeOpts(shapeSel) → dockShapeColorPicker,
    // which knows about Fill vs Outline contention for the shared picker (a
    // plain kind-based dock here would ignore which one is actually active).
  } else if (showDrawAdv) {
    const a = sel && sel.type === 'draw' ? sel : null;
    dockColorPicker(advDrawPaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncDrawOpts(a);
    });
  } else if (showHighlightAdv) {
    const a = sel && sel.type === 'highlight' ? sel : null;
    dockColorPicker(advHighlightPaletteSlot, a ? a.color : highlightColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) highlightColor = col; render(); }
      else highlightColor = col;
      syncHighlightOpts(a);
    });
  } else if (showCounterAdv) {
    const a = sel && sel.type === 'counter' ? sel : null;
    dockColorPicker(advCounterPaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncCounterOpts(a);
    });
  } else if (showTextAdv) {
    // Already handled above by syncTextOpts(...) → dockTextColorPicker, which
    // knows about Text-color vs Outline contention for the shared picker.
  } else if (cpPopover && cpPopover.classList.contains('cp-docked')) {
    closeColorPicker();
  }
}

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.tool;
    // Annotation tools act on the image, not the OCR text layer — choosing one
    // while OCR Mode is on leaves OCR Mode first (mirrors how picking a tool
    // already ends Crop mode below).
    if (ocrModeActive) exitOcrMode();
    // The merged Shape button maps to three internal tools: toggle it against the
    // whole group and re-open with the last-used primitive.
    if (t === 'shape') {
      setActiveTool(isShapeGroupTool(activeTool) ? null : lastShapeTool);
      return;
    }
    // Every other tool — Select included — toggles: click to choose it, click
    // again to return to the neutral idle state where no tool is highlighted.
    setActiveTool(activeTool === t ? null : t);
  });
});

// Basic Properties (#tool-props): click-and-drag horizontal panning. Its native
// scrollbar is hidden (see #tool-props-wrap's fade), so without this, a plain
// mouse with no horizontal scroll wheel would have no way at all to reach
// content that overflows to the right. Same click-vs-drag threshold trick as
// the canvas's own native drag-out (DRAG_OUT_THRESHOLD) — a plain click on a
// swatch/tool button still registers normally; only a real drag pans the strip
// and swallows the trailing click so it doesn't also activate whatever the
// pointer happens to land on.
if (annProps) {
  const DRAG_PAN_THRESHOLD = 4;
  let panDown = false, panning = false, panStartX = 0, panStartScrollLeft = 0;
  annProps.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    panDown = true; panning = false;
    panStartX = e.clientX;
    panStartScrollLeft = annProps.scrollLeft;
  });
  window.addEventListener('mousemove', (e) => {
    if (!panDown) return;
    const dx = e.clientX - panStartX;
    if (!panning && Math.abs(dx) > DRAG_PAN_THRESHOLD) {
      panning = true;
      annProps.classList.add('panning');
    }
    if (panning) annProps.scrollLeft = panStartScrollLeft - dx;
  });
  window.addEventListener('mouseup', () => {
    if (panning) {
      const suppressClick = (e) => { e.preventDefault(); e.stopPropagation(); };
      annProps.addEventListener('click', suppressClick, { capture: true, once: true });
    }
    panDown = false; panning = false;
    annProps.classList.remove('panning');
  });
}

// "Commit" the in-progress annotation: it stays applied (last state kept), but
// its selection outline/handles and the floating property panel are dismissed,
// and the active drawing tool steps back to plain select mode. Used whenever the
// user moves their attention elsewhere. Crop is excluded — it has its own
// confirm/cancel flow.
function commitAndDismiss() {
  const hadSelection = selectedId !== null;
  // 'select' counts as idle here: it has nothing in-progress to commit, so
  // clicking away deselects any object but leaves the Select tool active rather
  // than snapping it back to idle.
  const hadTool      = activeTool !== null && activeTool !== 'crop' && activeTool !== 'select';
  if (!hadSelection && !hadTool) return;
  selectedId = null;
  if (hadTool) {
    setActiveTool(null);          // also updates buttons + panel + re-renders
  } else {
    updateTextOptsVisibility();   // hide the panel (no tool, no selection left)
    render();
  }
}

// Clicking anywhere outside the active editing surfaces commits & dismisses the
// current annotation — another tool, an action button, the sidebar, or any empty
// chrome. Exempt surfaces manage their own selection/state: the canvas (its own
// mousedown handles in-image selection), the tool buttons (they toggle tools),
// the property panel and colour picker (being edited), the Advanced Properties
// sidebar section (same category as the toolbar's own property panel — just
// relocated — see [[advanced-properties-redesign]]), the title bar (window
// management — see below), and open modals.
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!screenshotImg || editing) return;
  if (document.body.classList.contains('modal-open')) return;
  const t = e.target instanceof Element ? e.target : null;
  if (t && (
        t.closest('#canvas') ||
        t.closest('#tool-props') ||
        t.closest('#color-picker-popover') ||
        t.closest('#adv-props-section') ||
        t.closest('.tool-btn[data-tool]') ||
        // The title bar is window-management chrome (logo/menu/tabs/theme + the
        // min/max/close controls), NOT part of the editing surface. Its drag
        // region doesn't emit DOM mouse events, but its no-drag buttons do —
        // clicking Maximize/Restore (a resize) would otherwise commit & deselect
        // the active tool, which broke the workflow: resizing the window must
        // never reset the tool or hide its Basic/Advanced Properties.
        t.closest('#titlebar') ||
        t.closest('.sp-overlay'))) return;
  commitAndDismiss();
}, true);

// ─── Colour swatches (Highlight / Counter) ──────────────────────────────────────
// Four fixed presets plus a 5th editable "custom" swatch that opens the full
// colour picker. The custom swatch remembers the last custom colour and lights up
// (active ring) whenever the current colour isn't one of the four presets.
const swatchEls = document.querySelectorAll('.swatch');
const customSwatchEl = document.getElementById('ann-custom-swatch');

// Reflect `currentColor` onto the swatch row: activate the matching preset, or
// the custom swatch (and paint it) when the colour is a custom one.
function syncColorSwatches() {
  let matched = false;
  swatchEls.forEach(s => {
    const on = s.dataset.color === currentColor;
    s.classList.toggle('active', on);
    if (on) matched = true;
  });
  if (customSwatchEl) {
    customSwatchEl.classList.toggle('active', !matched);
    if (!matched) customSwatchEl.style.background = currentColor; // show the picked colour
  }
}

swatchEls.forEach((sw, i) => {
  if (i === 0) sw.classList.add('active');
  sw.addEventListener('click', () => {
    currentColor = sw.dataset.color;
    syncColorSwatches();
    // Recolour the selected annotation, if any
    const sel = editTarget();
    if (sel && 'color' in sel) { pushHistory(); sel.color = currentColor; render(); }
  });
});

// 5th option: open the shared colour editor for a fully custom colour.
if (customSwatchEl) customSwatchEl.addEventListener('click', () => openColorPicker(customSwatchEl, (col) => {
  currentColor = col;
  const sel = editTarget();
  if (sel && 'color' in sel) { pushHistory(); sel.color = col; render(); }
  syncColorSwatches();
}));

// ─── Reusable "Color Palette" component (2026-07-06 onward) ────────────────────
// Compact circular swatch row: fixed presets + a trailing "current colour"
// indicator that rings itself whenever the live colour isn't one of the presets.
// This is THE Color Palette component — call createColorPalette() for any
// tool's Basic Properties colour control instead of a bespoke swatch row. Its
// Advanced Properties counterpart is the full picker (dockColorPicker).
const COLOR_PALETTE_PRESETS = ['#ff3b30', '#ff9500', '#34c759', '#007aff', '#000000'];

function createColorPalette(container, getValue, onPick) {
  if (!container) return { sync() {} };
  container.innerHTML = '';
  const swatches = COLOR_PALETTE_PRESETS.map(hex => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-palette-swatch';
    b.style.background = hex;
    b.dataset.color = hex;
    b.title = hex;
    b.addEventListener('click', () => { onPick(hex); sync(); });
    container.appendChild(b);
    return b;
  });

  // Always just the 5 presets — a custom color (from the Color Picker) simply
  // leaves all of them unselected. The picker's own preview swatch already
  // shows the current color, so there's no need for a 6th "current color"
  // swatch duplicating it here.
  function sync() {
    const val = getValue();
    swatches.forEach(s => s.classList.toggle('active', s.dataset.color === val));
  }
  sync();
  return { sync };
}

// textColorPalette + dockTextColorPicker + the font-size/outline-toggle
// listeners live further down, after cpPopover is declared (syncTextOpts
// references it) — see [[editor-js-tdz-hazard]] for why calling them here
// would throw.

// Blur: toolbar Basic Properties is three quick hardness presets; Advanced
// Properties has the continuous slider + the Solid/Blur/Pixelated type
// picker. Both the presets and the slider write the same `strength` field,
// so either one stays in sync with the other (same rule as every other tool).
function setBlurStrength(v) {
  const sel = editTarget();
  if (sel && sel.type === 'blur' && !blurAdjusting) { pushHistory(); blurAdjusting = true; }
  blurDefaultStrength = v;
  if (sel && sel.type === 'blur') { sel.strength = v; scheduleRender(); }
  syncBlurOpts(sel && sel.type === 'blur' ? sel : null);
}
if (blurHardnessSegEl) blurHardnessSegEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.blur-hardness-btn');
  if (!btn) return;
  setBlurStrength(+btn.dataset.hardness);
});
if (advBlurHardnessEl) {
  advBlurHardnessEl.addEventListener('input', () => setBlurStrength(+advBlurHardnessEl.value));
  advBlurHardnessEl.addEventListener('change', () => { blurAdjusting = false; });
  updateSliderFill(advBlurHardnessEl);
}
if (advBlurTypeSegEl) advBlurTypeSegEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  const type = btn.dataset.blurtype;
  const sel = editTarget();
  const a = sel && sel.type === 'blur' ? sel : null;
  blurDefaultType = type;
  if (a) { pushHistory(); a.blurType = type; render(); }
  syncBlurOpts(a);
});

// Reflect a blur's (or the new-blur defaults') hardness + redaction type into
// both the toolbar presets and the Advanced Properties controls.
function syncBlurOpts(a) {
  const strength = a ? (a.strength ?? blurDefaultStrength) : blurDefaultStrength;
  if (advBlurHardnessEl)  { advBlurHardnessEl.value = strength; updateSliderFill(advBlurHardnessEl); }
  if (advBlurHardnessVal) advBlurHardnessVal.textContent = strength + 'px';
  if (blurHardnessSegEl) {
    blurHardnessSegEl.querySelectorAll('.blur-hardness-btn').forEach(b => {
      b.classList.toggle('active', +b.dataset.hardness === strength);
    });
  }

  const type = a ? (a.blurType || 'pixelated') : blurDefaultType;
  if (advBlurTypeSegEl) {
    advBlurTypeSegEl.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.blurtype === type);
    });
  }
}
syncBlurOpts(null);

// Shape (Line/Rectangle/Circle) Basic + Advanced Properties wiring lives after
// the colour-picker-popover section below (dockColorPicker/cpPopover) — see
// the Shape block near the Arrow one, and [[editor-js-tdz-hazard]] for why.

// ─── Counter size + colour options ─────────────────────────────────────────────
// Size sets the badge radius; the colour preview opens the shared HSV picker.
// Both update the selected counter live (when one is selected) and the defaults
// used for the next badge.
if (counterSizeEl) {
  counterSizeEl.addEventListener('input', () => {
    const v = +counterSizeEl.value;
    counterSize = v;
    if (counterSizeVal) counterSizeVal.textContent = v + 'px';
    updateSliderFill(counterSizeEl);
    const sel = editTarget();
    if (sel && sel.type === 'counter') { sel.size = v; scheduleRender(); }
  });
  updateSliderFill(counterSizeEl);
}
// counterColorPalette + the initial syncCounterOpts(null) call live further
// down, after cpPopover is declared (syncCounterOpts references it) — see
// [[editor-js-tdz-hazard]] for why calling it here would throw.

// ─── Highlight (marker) pen width + colour ─────────────────────────────────────
// Width sets the nib thickness. Colour is kept independent of `currentColor`
// so the marker stays yellow by default.
const selectedHighlight = () => {
  const sel = editTarget();
  return sel && sel.type === 'highlight' ? sel : null;
};
if (highlightWidthEl) {
  highlightWidthEl.addEventListener('input', () => {
    const w = +highlightWidthEl.value;
    highlightWidth = w;
    if (highlightWidthVal) highlightWidthVal.textContent = w + 'px';
    updateSliderFill(highlightWidthEl);
    const sel = selectedHighlight();
    if (sel) { sel.width = w; scheduleRender(); }
  });
  updateSliderFill(highlightWidthEl);
}
// highlightColorPalette + the initial syncHighlightOpts(null) call live
// further down too, for the same reason.

// ─── Free Draw width / opacity / smoothing / colour ────────────────────────────
// Each control updates the selected stroke live (when one is selected) and the
// defaults used for the next stroke. Smoothing restyles even an existing stroke
// because it's applied at render time over the stored raw points.
const selectedDraw = () => {
  const sel = editTarget();
  return sel && sel.type === 'draw' ? sel : null;
};
if (drawWidthEl) {
  drawWidthEl.addEventListener('input', () => {
    const w = +drawWidthEl.value;
    drawWidth = w;
    if (drawWidthVal) drawWidthVal.textContent = w + 'px';
    updateSliderFill(drawWidthEl);
    const sel = selectedDraw();
    if (sel) { sel.width = w; scheduleRender(); }
  });
  updateSliderFill(drawWidthEl);
}
if (drawOpacityEl) {
  drawOpacityEl.addEventListener('input', () => {
    const v = +drawOpacityEl.value;
    drawOpacity = v / 100;
    if (drawOpacityVal) drawOpacityVal.textContent = v + '%';
    updateSliderFill(drawOpacityEl);
    const sel = selectedDraw();
    if (sel) { sel.opacity = drawOpacity; scheduleRender(); }
  });
  updateSliderFill(drawOpacityEl);
}
if (drawSmoothingEl) {
  drawSmoothingEl.addEventListener('input', () => {
    const v = +drawSmoothingEl.value;
    drawSmoothing = v / 100;
    if (drawSmoothingVal) drawSmoothingVal.textContent = v + '%';
    updateSliderFill(drawSmoothingEl);
    const sel = selectedDraw();
    if (sel) { sel.smoothing = drawSmoothing; scheduleRender(); }
  });
  updateSliderFill(drawSmoothingEl);
}
// drawColorPalette + the initial syncDrawOpts(null) call live further down,
// after cpPopover is declared (syncDrawOpts references it) — see
// [[editor-js-tdz-hazard]] for why calling it here would throw.

// Crop's Canvas Fill mode/colour (transparent vs solid) has no dedicated UI
// any more — the docked colour palette below is the only control; touching it
// implies solid (see dockColorPicker's onChange). Just restore the persisted
// preference (defaults to transparent until the palette is used).
loadCropFill();

// ─── Custom colour-picker popover (HSV) ─────────────────────────────────────────
const cpPopover  = document.getElementById('color-picker-popover');
const cpSvCanvas = document.getElementById('cp-sv-canvas');
const cpSvThumb  = document.getElementById('cp-sv-thumb');
const cpHueEl    = document.getElementById('cp-hue');
const cpAlphaEl  = document.getElementById('cp-alpha');
const cpHexEl    = document.getElementById('cp-hex');
const cpPreview  = document.getElementById('cp-preview-fill');
const cpCompactSwatchEl = document.getElementById('cp-compact-swatch');
const cpCompactHexEl    = document.getElementById('cp-compact-hex');
const cpEyedropperEl    = document.getElementById('cp-eyedropper-btn');
let cpExpanded = false;
// Pristine backing-store size (matches the <canvas width height> attributes in
// editor.html) — restored on undock so a later floating popup use doesn't
// inherit a docked, stretched resolution.
const CP_SV_DEFAULT_W = cpSvCanvas ? cpSvCanvas.width  : 152;
const CP_SV_DEFAULT_H = cpSvCanvas ? cpSvCanvas.height : 100;
let cpHue = 0, cpSat = 1, cpVal = 1, cpOnChange = null;

function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; }
  else if (h <120) { r = x; g = c; }
  else if (h <180) { g = c; b = x; }
  else if (h <240) { g = x; b = c; }
  else if (h <300) { r = x; b = c; }
  else             { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join(''); }
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r)      h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * (((b - r) / d) + 2);
    else                h = 60 * (((r - g) / d) + 4);
  }
  if (h < 0) h += 360;
  return [h, max ? d / max : 0, max];
}
function cpCurrentHex() { const [r, g, b] = hsvToRgb(cpHue, cpSat, cpVal); return rgbToHex(r, g, b); }
function cpRenderSV() {
  if (!cpSvCanvas) return;
  const c = cpSvCanvas.getContext('2d'), w = cpSvCanvas.width, h = cpSvCanvas.height;
  const [br, bg, bb] = hsvToRgb(cpHue, 1, 1);
  c.fillStyle = `rgb(${br},${bg},${bb})`; c.fillRect(0, 0, w, h);
  let gx = c.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, '#fff'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gx; c.fillRect(0, 0, w, h);
  let gy = c.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(1, '#000');
  c.fillStyle = gy; c.fillRect(0, 0, w, h);
  // Percent, not pixels: the thumb is positioned relative to .cp-sv-wrap's
  // rendered CSS box, which is often a different size than the canvas's own
  // backing-store width/height (e.g. docked panels stretch the canvas via CSS
  // width:100% without the backing store being resized to match at every
  // resize). Pixel math against `w`/`h` here previously left the thumb unable
  // to reach the right/bottom edge whenever the rendered box was wider/taller
  // than the backing store.
  if (cpSvThumb) { cpSvThumb.style.left = `${cpSat * 100}%`; cpSvThumb.style.top = `${(1 - cpVal) * 100}%`; }
}
function cpEmit() {
  const hex = cpCurrentHex();
  if (cpHexEl)   cpHexEl.value = hex;
  if (cpPreview) cpPreview.style.background = hex;
  if (cpCompactSwatchEl) cpCompactSwatchEl.style.background = hex;
  if (cpCompactHexEl)    cpCompactHexEl.value = hex;
  if (cpOnChange) cpOnChange(hex);
}
// Seeds every displayed part of the picker (hue slider, SV thumb, hex text,
// preview swatch) from a hex value, WITHOUT notifying cpOnChange — this is a
// display sync, not a user-driven change. (cpEmit does the reverse: reads the
// current hue/sat/val back out and notifies cpOnChange — that's the one that
// should fire on real interaction.)
function cpSetFromHex(hex) {
  const rgb = hexToRgb(hex); if (!rgb) return;
  [cpHue, cpSat, cpVal] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  if (cpHueEl) cpHueEl.value = Math.round(cpHue);
  cpRenderSV();
  if (cpHexEl)   cpHexEl.value = hex;
  if (cpPreview) cpPreview.style.background = hex;
  if (cpCompactSwatchEl) cpCompactSwatchEl.style.background = hex;
  if (cpCompactHexEl)    cpCompactHexEl.value = hex;
}
function openColorPicker(anchorEl, onChange) {
  if (!cpPopover) return;
  cpOnChange = onChange;
  cpPopover.hidden = false;
  const r = anchorEl.getBoundingClientRect();
  cpPopover.style.left = `${Math.round(Math.min(r.left, window.innerWidth - 200))}px`;
  cpPopover.style.top  = `${Math.round(r.bottom + 6)}px`;
  cpRenderSV();
  cpEmit();
}
function closeColorPicker() {
  if (!cpPopover) return;
  if (cpPopover.classList.contains('cp-docked')) {
    // Undock back to <body> so it's ready to float again next time a swatch opens it.
    cpPopover.classList.remove('cp-docked');
    document.body.appendChild(cpPopover);
    // Restore the pristine backing-store size — otherwise a stretched/docked
    // resolution would leak into the next floating popup use and distort it.
    if (cpSvCanvas) { cpSvCanvas.width = CP_SV_DEFAULT_W; cpSvCanvas.height = CP_SV_DEFAULT_H; }
    cpSetExpanded(false);
  }
  cpPopover.hidden = true;
  cpOnChange = null;
}
// Docked mode collapses behind the compact swatch/hex/eyedropper row by
// default (see .cp-compact-row) — clicking the swatch reveals .cp-panel
// (SV/hue/alpha/presets) below it, clicking again collapses it back.
function cpSetExpanded(v) {
  cpExpanded = v;
  if (cpPopover) cpPopover.classList.toggle('cp-expanded', v);
}
// Reparent the shared popover inline into a sidebar panel (full width, no card
// chrome — see .cp-docked) instead of floating it next to a swatch. Used by
// panels with plenty of horizontal room, e.g. Crop's and Arrow's Advanced
// Properties. Safe to call repeatedly (e.g. once per updateTextOptsVisibility
// while the owning tool stays active) — it only reparents/resizes the canvas
// when the target container actually changed, and it never fires onChange on
// its own (see cpSetFromHex), so re-seeding the displayed value on every call
// can't spuriously mutate state that the user didn't touch.
function dockColorPicker(container, hex, onChange) {
  if (!cpPopover || !container) return;
  const alreadyThere = cpPopover.classList.contains('cp-docked') && cpPopover.parentElement === container;
  cpPopover.classList.add('cp-docked');
  if (!alreadyThere) {
    container.appendChild(cpPopover);
    cpPopover.hidden = false;
    cpSetExpanded(false); // start collapsed behind the compact row for a newly-docked tool/target
    // The SV canvas's backing store must match its rendered box once stretched
    // to fill the panel, otherwise the thumb position (derived from
    // canvas.width/height) drifts off the visible gradient.
    if (cpSvCanvas) {
      cpSvCanvas.width  = cpSvCanvas.clientWidth  || cpSvCanvas.width;
      cpSvCanvas.height = cpSvCanvas.clientHeight || cpSvCanvas.height;
    }
  }
  cpOnChange = onChange;
  cpSetFromHex(hex);
}
if (cpHueEl) cpHueEl.addEventListener('input', () => { cpHue = +cpHueEl.value; cpRenderSV(); cpEmit(); });
if (cpHexEl) cpHexEl.addEventListener('change', () => { cpSetFromHex(cpHexEl.value.trim()); cpEmit(); });
if (cpCompactSwatchEl) cpCompactSwatchEl.addEventListener('click', () => cpSetExpanded(!cpExpanded));
if (cpCompactHexEl) cpCompactHexEl.addEventListener('change', () => { cpSetFromHex(cpCompactHexEl.value.trim()); cpEmit(); });
// Real screen color-sampling via the browser's EyeDropper API (supported in
// Electron's Chromium since ~v95) — not just a decorative icon. Hidden
// entirely on older runtimes that lack it.
if (cpEyedropperEl) {
  if (typeof window.EyeDropper !== 'function') {
    cpEyedropperEl.hidden = true;
  } else {
    cpEyedropperEl.addEventListener('click', async () => {
      try {
        const result = await new window.EyeDropper().open();
        cpSetFromHex(result.sRGBHex);
        cpEmit();
      } catch { /* user cancelled (Escape) — no-op */ }
    });
  }
}
if (cpSvCanvas) {
  const pick = (e) => {
    const r = cpSvCanvas.getBoundingClientRect();
    cpSat = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    cpVal = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    cpRenderSV(); cpEmit();
  };
  cpSvCanvas.addEventListener('mousedown', (e) => {
    pick(e);
    const mv = (ev) => pick(ev);
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });
}
document.addEventListener('mousedown', (e) => {
  if (!cpPopover || cpPopover.hidden) return;
  if (cpPopover.classList.contains('cp-docked')) return; // part of the panel now, not a dismissible popover
  if (!cpPopover.contains(e.target)) {
    closeColorPicker();
  }
});

// ─── Arrow: Basic palette + Advanced Properties (full picker + tail-text) ──────
// The Basic Color Palette (toolbar) and the Advanced full picker/tail-text
// group (sidebar) all read/write the same state — the selected arrow, or the
// shared defaults when nothing is selected — so either one can be changed and
// both stay in sync (see [[advanced-properties-redesign]]). Must come after
// the colour-picker-popover section above (dockColorPicker/cpPopover) since
// syncArrowOpts uses them — a `const` used before its declaration line throws
// (temporal dead zone), which previously halted the whole script here and
// broke everything wired further down the file (window controls, capture→
// editor flow, etc.). See [[arrow-basic-panel-tdz-crash]].
// If `a`'s label is the one currently being live-edited on canvas, re-seed the
// editing snapshot (editingLayout/drawEditingText read from `editing`, not `a`,
// so a style change made in the sidebar while the inline editor is open would
// otherwise not show up until the edit is committed) and re-lay-out the
// (transparent) input + repaint the preview.
function refreshArrowLabelEditing(a) {
  if (!a || !editing || editing.kind !== 'arrowlabel' || editing.id !== a.id) return;
  editing.fontSize = a.fontSize;
  editing.color = a.textColor || a.color;
  editing.outline = a.outline;
  editing.outlineColor = a.outlineColor;
  syncTextInputLayout();
  render();
}

// Basic Properties (toolbar): compact Color Palette, same component as
// Shape/Arrow — the full picker lives in Advanced Properties instead.
const drawColorPalette = createColorPalette(
  document.getElementById('draw-color-palette'),
  () => { const sel = selectedDraw(); return sel ? sel.color : currentColor; },
  (hex) => {
    const sel = selectedDraw();
    if (sel) { pushHistory(); sel.color = hex; if (isSoftEditTarget()) currentColor = hex; render(); }
    else currentColor = hex;
    syncDrawOpts(sel);
  }
);
syncDrawOpts(null);

const counterColorPalette = createColorPalette(
  document.getElementById('counter-color-palette'),
  () => {
    const sel = editTarget();
    return (sel && sel.type === 'counter') ? sel.color : currentColor;
  },
  (hex) => {
    const sel = editTarget();
    const a = sel && sel.type === 'counter' ? sel : null;
    if (a) { pushHistory(); a.color = hex; if (isSoftEditTarget()) currentColor = hex; render(); }
    else currentColor = hex;
    syncCounterOpts(a);
  }
);
syncCounterOpts(null);

const highlightColorPalette = createColorPalette(
  document.getElementById('highlight-color-palette'),
  () => { const sel = selectedHighlight(); return sel ? sel.color : highlightColor; },
  (hex) => {
    const sel = selectedHighlight();
    if (sel) { pushHistory(); sel.color = hex; if (isSoftEditTarget()) highlightColor = hex; render(); }
    else highlightColor = hex;
    syncHighlightOpts(sel);
  }
);
syncHighlightOpts(null);

const arrowColorPalette = createColorPalette(
  document.getElementById('arrow-color-palette'),
  () => {
    const sel = editTarget();
    return (sel && sel.type === 'arrow') ? sel.color : currentColor;
  },
  (hex) => {
    const sel = editTarget();
    const a = sel && sel.type === 'arrow' ? sel : null;
    if (a) { pushHistory(); a.color = hex; if (isSoftEditTarget()) currentColor = hex; render(); }
    else currentColor = hex;
    syncArrowOpts(a);
  }
);
const arrowTextColorPalette = createColorPalette(
  document.getElementById('adv-arrow-text-color-palette'),
  () => {
    const sel = editTarget();
    return (sel && sel.type === 'arrow') ? (sel.textColor || sel.color) : arrowTextColor;
  },
  (hex) => {
    const sel = editTarget();
    const a = sel && sel.type === 'arrow' ? sel : null;
    if (a) { pushHistory(); a.textColor = hex; if (isSoftEditTarget()) arrowTextColor = hex; render(); }
    else arrowTextColor = hex;
    syncArrowOpts(a);
    refreshArrowLabelEditing(a);
  }
);
// Reflect a selected arrow's (or the new-arrow defaults') stroke colour, style
// + tail-text state into the Basic palette and every Advanced Properties control.
function syncArrowOpts(a) {
  arrowColorPalette.sync();
  // If the docked full picker is currently showing Arrow's stroke colour, keep
  // its displayed value in step too (cpSetFromHex doesn't fire onChange, so
  // this can't loop back into a spurious change).
  if (cpPopover && cpPopover.classList.contains('cp-docked') && cpPopover.parentElement === advArrowPaletteSlot) {
    cpSetFromHex(a ? a.color : currentColor);
  }

  const style = a ? (a.style || 'straight') : arrowStyle;
  if (advArrowStyleSegEl) {
    advArrowStyleSegEl.querySelectorAll('.adv-arrow-style-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.arrowStyle === style);
    });
  }

  const enabled = a ? !!a.textEnabled : arrowTextEnabled;
  if (advArrowTextToggleEl) advArrowTextToggleEl.checked = enabled;
  if (advArrowTextGroupEl) advArrowTextGroupEl.classList.toggle('open', enabled);

  const fontSize = a ? (a.fontSize || 20) : arrowTextFontSize;
  if (advArrowTextSizeEl) { advArrowTextSizeEl.value = fontSize; updateSliderFill(advArrowTextSizeEl); }
  if (advArrowTextSizeVal) advArrowTextSizeVal.textContent = fontSize + 'px';

  arrowTextColorPalette.sync();
}

// "Add text to tail" — updates the selected arrow live, or the default for the
// next one drawn. Turning it on with an arrow selected jumps straight into the
// same live, click-to-type canvas editor a freshly-drawn arrow used to open
// automatically — a faint placeholder ("Add text (optional)") shows at the
// tail immediately, already focused, so typing can start with no extra click.
// Turning it off mid-edit commits whatever's typed first, so toggling back on
// restores it. No Apply/Cancel: Undo/Redo (or deleting the annotation) reverts
// a change, same as everywhere else in the app.
if (advArrowTextToggleEl) advArrowTextToggleEl.addEventListener('change', () => {
  const sel = editTarget();
  const a = sel && sel.type === 'arrow' ? sel : null;
  const on = advArrowTextToggleEl.checked;
  const wasEditingThis = editing && editing.kind === 'arrowlabel' && a && editing.id === a.id;
  if (!on && wasEditingThis) commitText();
  if (a) {
    pushHistory();
    a.textEnabled = on;
    // Seed the same outline defaults the standalone Text tool starts new text
    // with — an arrow drawn before "Add text to tail" existed (or toggled on
    // here rather than at draw time) otherwise never gets these fields set.
    if (on && a.outline === undefined) {
      a.outline = advTextOutlineToggleEl.checked;
      a.outlineColor = resolveOutlineColor(currentOutlineColor);
    }
    if (isSoftEditTarget()) arrowTextEnabled = on;
    render();
  }
  else arrowTextEnabled = on;
  syncArrowOpts(a);
  if (a && on) openArrowLabelEditor(a, false);
});

if (advArrowTextSizeEl) advArrowTextSizeEl.addEventListener('input', () => {
  const v = +advArrowTextSizeEl.value;
  arrowTextFontSize = v;
  if (advArrowTextSizeVal) advArrowTextSizeVal.textContent = v + 'px';
  updateSliderFill(advArrowTextSizeEl);
  const sel = editTarget();
  const a = sel && sel.type === 'arrow' ? sel : null;
  if (a) { a.fontSize = v; scheduleRender(); refreshArrowLabelEditing(a); }
});

if (advArrowStyleSegEl) advArrowStyleSegEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.adv-arrow-style-btn');
  if (!btn) return;
  const style = btn.dataset.arrowStyle;
  const sel = editTarget();
  const a = sel && sel.type === 'arrow' ? sel : null;
  if (a) { pushHistory(); a.style = style; if (isSoftEditTarget()) arrowStyle = style; render(); }
  else arrowStyle = style;
  syncArrowOpts(a);
});

syncArrowOpts(null);

// ─── Shape (Line/Rectangle/Circle): Basic palette + Advanced Properties ────────
// One shared Basic Properties colour palette (toolbar) and one Advanced
// Properties panel (segmented control + whichever primitive's own controls)
// serve all three primitives — see [[advanced-properties-redesign]]. Must come
// after the colour-picker-popover section above, same reason as the Arrow
// block — see [[editor-js-tdz-hazard]].

// Which primitive the Advanced panel should show right now: the selected
// annotation's own type, else whichever the Shape tool is currently set to
// draw, else the last-used primitive (so the panel shows something sensible
// even before the Shape tool itself has been clicked this session).
function currentShapeKind(a) {
  if (a) return a.type;
  if (isShapeGroupTool(activeTool)) return activeTool;
  return lastShapeTool;
}

const shapeColorPalette = createColorPalette(
  document.getElementById('shape-color-palette'),
  () => {
    const sel = editTarget();
    const s = sel && (sel.type === 'rect' || sel.type === 'ellipse' || sel.type === 'line') ? sel : null;
    return s ? s.color : currentColor;
  },
  (hex) => {
    const sel = editTarget();
    const s = sel && (sel.type === 'rect' || sel.type === 'ellipse' || sel.type === 'line') ? sel : null;
    if (s) { pushHistory(); s.color = hex; if (isSoftEditTarget()) currentColor = hex; render(); }
    else currentColor = hex;
    syncShapeOpts(s);
  }
);
// Rect/Ellipse only: which of Fill/Outline currently holds the single shared
// color picker — both can be enabled simultaneously, but the picker (SV/hue/
// alpha canvas etc.) is one singleton instance, so whichever was most
// recently toggled on (or whose swatch was most recently clicked) wins the
// dock; the other shows a plain static swatch that reclaims it when clicked.
// (Text's Text-color/Outline pair below uses the same contention model via
// its own advTextColorTarget + the generic helpers just below.)
let advShapeColorTarget = 'outline';

// Safe to call even when `slot` currently holds the real shared picker (a
// no-op then) — only clears stale placeholder buttons left behind from a
// previous sync when this slot wasn't the active target. Generic: used by
// any tool with two colors contending for the one shared picker (Shape's
// Fill/Outline, Text's Text-color/Outline).
function clearColorDockSlot(slot) {
  if (slot && !slot.contains(cpPopover)) slot.innerHTML = '';
}

// Same visual language as the shared picker's own compact row (swatch + hex +
// eyedropper) — a fully independent, always-functional static instance for
// whichever of a tool's two colors does NOT currently hold the live SV/hue/
// alpha panel, so neither one ever looks "reduced" to a bare swatch. Clicking
// the swatch claims the shared picker into this slot (via onClaim); the hex
// input and eyedropper work immediately regardless of which slot is active.
const SHARED_EYEDROPPER_SVG = '<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M224 67.3a35.8 35.8 0 0 0-11.26-25.66c-14-13.28-36.72-12.78-50.62 1.13L142.8 62.2a24 24 0 0 0-33.14.77l-9 9a16 16 0 0 0 0 22.64l2 2.06-51 51a39.75 39.75 0 0 0-10.53 38l-8 18.41A13.68 13.68 0 0 0 36 219.3a15.92 15.92 0 0 0 17.71 3.35L71.23 215a39.89 39.89 0 0 0 37.06-10.75l51-51 2.06 2.06a16 16 0 0 0 22.62 0l9-9a24 24 0 0 0 .74-33.18l19.75-19.87A35.75 35.75 0 0 0 224 67.3M97 193a24 24 0 0 1-24 6 8 8 0 0 0-5.55.31l-18.1 7.91L57 189.41a8 8 0 0 0 .25-5.75A23.88 23.88 0 0 1 63 159l51-51 33.94 34ZM202.13 82l-25.37 25.52a8 8 0 0 0 0 11.3l4.89 4.89a8 8 0 0 1 0 11.32l-9 9L112 83.26l9-9a8 8 0 0 1 11.31 0l4.89 4.89a8 8 0 0 0 11.33 0l24.94-25.09c7.81-7.82 20.5-8.18 28.29-.81a20 20 0 0 1 .39 28.7Z"/></svg>';

function renderColorStaticRow(slot, hex, onPick, onClaim) {
  if (!slot) return;
  slot.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'adv-color-static-row';

  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'cp-compact-swatch';
  swatch.style.background = hex;
  swatch.title = 'Edit color';
  swatch.addEventListener('click', onClaim);

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'cp-compact-hex';
  hexInput.maxLength = 9;
  hexInput.spellcheck = false;
  hexInput.autocomplete = 'off';
  hexInput.value = hex;
  hexInput.addEventListener('change', () => onPick(hexInput.value.trim()));

  const eyedropper = document.createElement('button');
  eyedropper.type = 'button';
  eyedropper.className = 'cp-eyedropper-btn';
  eyedropper.title = 'Pick a color from the screen';
  eyedropper.innerHTML = SHARED_EYEDROPPER_SVG;
  if (typeof window.EyeDropper !== 'function') {
    eyedropper.hidden = true;
  } else {
    eyedropper.addEventListener('click', async () => {
      try {
        const result = await new window.EyeDropper().open();
        swatch.style.background = result.sRGBHex;
        hexInput.value = result.sRGBHex;
        onPick(result.sRGBHex);
      } catch { /* user cancelled — no-op */ }
    });
  }

  row.append(swatch, hexInput, eyedropper);
  slot.appendChild(row);
}

// Dock the shared color picker into whichever Shape slot is relevant right
// now (Line's own slot, or Fill/Outline for Rect/Circle per advShapeColorTarget).
function dockShapeColorPicker(a) {
  const kind = currentShapeKind(a);
  if (kind === 'line') {
    dockColorPicker(advShapeLinePaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncShapeOpts(a);
    });
    return;
  }

  const fillOn = a ? !!a.fill : shapeFillOn;
  const outlineOn = a ? (a.stroke !== false) : shapeStrokeOn;
  if (advShapeColorTarget === 'fill' && !fillOn) advShapeColorTarget = outlineOn ? 'outline' : null;
  if (advShapeColorTarget === 'outline' && !outlineOn) advShapeColorTarget = fillOn ? 'fill' : null;
  if (!advShapeColorTarget) advShapeColorTarget = fillOn ? 'fill' : (outlineOn ? 'outline' : null);

  if (advShapeColorTarget === 'fill') {
    clearColorDockSlot(advShapeFillPaletteSlot); // drop any stale placeholder left from a prior sync
    dockColorPicker(advShapeFillPaletteSlot, a ? (a.fillColor || '#ff3b30') : shapeFillColor, (col) => {
      if (a) { pushHistory(); a.fillColor = col; if (isSoftEditTarget()) shapeFillColor = col; render(); }
      else shapeFillColor = col;
      syncShapeOpts(a);
    });
    renderColorStaticRow(advShapeOutlinePaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncShapeOpts(a);
    }, () => {
      advShapeColorTarget = 'outline'; syncShapeOpts(a);
    });
  } else if (advShapeColorTarget === 'outline') {
    clearColorDockSlot(advShapeOutlinePaletteSlot); // drop any stale placeholder left from a prior sync
    dockColorPicker(advShapeOutlinePaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncShapeOpts(a);
    });
    renderColorStaticRow(advShapeFillPaletteSlot, a ? (a.fillColor || '#ff3b30') : shapeFillColor, (col) => {
      if (a) { pushHistory(); a.fillColor = col; if (isSoftEditTarget()) shapeFillColor = col; render(); }
      else shapeFillColor = col;
      syncShapeOpts(a);
    }, () => {
      advShapeColorTarget = 'fill'; syncShapeOpts(a);
    });
  } else {
    // Neither Fill nor Outline enabled — nothing to dock or show.
    if (cpPopover && cpPopover.classList.contains('cp-docked') &&
        (cpPopover.parentElement === advShapeFillPaletteSlot || cpPopover.parentElement === advShapeOutlinePaletteSlot)) {
      closeColorPicker();
    }
    if (advShapeFillPaletteSlot) advShapeFillPaletteSlot.innerHTML = '';
    if (advShapeOutlinePaletteSlot) advShapeOutlinePaletteSlot.innerHTML = '';
  }
}

// ─── Text: Basic palette + Advanced Properties (Font size, Text color, Outline) ─
// Text color is always relevant (no toggle); Outline is optional and defaults
// on. Both can be visible at once, so they contend for the shared picker via
// the same most-recent-wins model as Shape's Fill/Outline.
const textColorPalette = createColorPalette(
  document.getElementById('text-color-palette'),
  () => {
    const sel = editTarget();
    return (sel && sel.type === 'text') ? sel.color : currentColor;
  },
  (hex) => {
    const sel = editTarget();
    const a = sel && sel.type === 'text' ? sel : null;
    if (a) { pushHistory(); a.color = hex; if (isSoftEditTarget()) currentColor = hex; render(); }
    else currentColor = hex;
    syncTextOpts(a);
  }
);
let advTextColorTarget = 'text';

function dockTextColorPicker(a) {
  const outlineOn = a ? !!a.outline : advTextOutlineToggleEl.checked;
  if (advTextColorTarget === 'outline' && !outlineOn) advTextColorTarget = 'text';

  if (advTextColorTarget === 'outline') {
    clearColorDockSlot(advTextOutlinePaletteSlot);
    dockColorPicker(advTextOutlinePaletteSlot, a ? resolveOutlineColor(a.outlineColor) : resolveOutlineColor(currentOutlineColor), (col) => {
      if (a) { pushHistory(); a.outlineColor = col; if (isSoftEditTarget()) currentOutlineColor = col; render(); }
      else currentOutlineColor = col;
      syncTextOpts(a);
    });
    renderColorStaticRow(advTextPaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncTextOpts(a);
    }, () => {
      advTextColorTarget = 'text'; syncTextOpts(a);
    });
  } else {
    clearColorDockSlot(advTextPaletteSlot);
    dockColorPicker(advTextPaletteSlot, a ? a.color : currentColor, (col) => {
      if (a) { pushHistory(); a.color = col; if (isSoftEditTarget()) currentColor = col; render(); }
      else currentColor = col;
      syncTextOpts(a);
    });
    if (outlineOn) {
      renderColorStaticRow(advTextOutlinePaletteSlot, a ? resolveOutlineColor(a.outlineColor) : resolveOutlineColor(currentOutlineColor), (col) => {
        if (a) { pushHistory(); a.outlineColor = col; if (isSoftEditTarget()) currentOutlineColor = col; render(); }
        else currentOutlineColor = col;
        syncTextOpts(a);
      }, () => {
        advTextColorTarget = 'outline'; syncTextOpts(a);
      });
    } else if (advTextOutlinePaletteSlot) {
      advTextOutlinePaletteSlot.innerHTML = '';
    }
  }
}

if (advTextFontSizeEl) advTextFontSizeEl.addEventListener('input', () => {
  const v = +advTextFontSizeEl.value;
  if (advTextFontSizeVal) advTextFontSizeVal.textContent = v + 'px';
  updateSliderFill(advTextFontSizeEl);
  const sel = editTarget();
  if (sel && sel.type === 'text') { sel.fontSize = v; scheduleRender(); }
});
if (advTextOutlineToggleEl) advTextOutlineToggleEl.addEventListener('change', () => {
  const on = advTextOutlineToggleEl.checked;
  if (on) advTextColorTarget = 'outline'; // just turned on — claim the shared picker
  const sel = editTarget();
  const a = sel && sel.type === 'text' ? sel : null;
  if (a) { pushHistory(); a.outline = on; render(); }
  syncTextOpts(a);
});
syncTextOpts(null);

// Reflect the current shape's (or the relevant new-shape defaults') state into
// the Basic palette and every Advanced Properties control. `a` is the selected
// rect/ellipse/line annotation, or null when none is selected.
function syncShapeOpts(a) {
  shapeColorPalette.sync();

  const kind = currentShapeKind(a);
  const isLine = kind === 'line';
  if (advShapeLineOptsEl) advShapeLineOptsEl.classList.toggle('open', isLine);
  if (advShapeRectEllipseOptsEl) advShapeRectEllipseOptsEl.classList.toggle('open', !isLine);

  dockShapeColorPicker(a);

  if (isLine) {
    const weight = a ? (a.strokeWidth || lineWeight) : lineWeight;
    if (advShapeLineWeightEl) { advShapeLineWeightEl.value = weight; updateSliderFill(advShapeLineWeightEl); }
    if (advShapeLineWeightVal) advShapeLineWeightVal.textContent = weight + 'px';

    const opPct = Math.round((a ? (a.opacity ?? lineOpacity) : lineOpacity) * 100);
    if (advShapeLineOpacityEl) { advShapeLineOpacityEl.value = opPct; updateSliderFill(advShapeLineOpacityEl); }
    if (advShapeLineOpacityVal) advShapeLineOpacityVal.textContent = opPct + '%';
    return;
  }

  // Rectangle / Circle
  const fillOn = a ? !!a.fill : shapeFillOn;
  if (advShapeFillToggleEl) advShapeFillToggleEl.checked = fillOn;
  if (advShapeFillColorGroupEl) advShapeFillColorGroupEl.style.display = fillOn ? 'block' : 'none';

  const strokeOn = a ? (a.stroke !== false) : shapeStrokeOn;
  if (advShapeOutlineToggleEl) advShapeOutlineToggleEl.checked = strokeOn;
  if (advShapeOutlineGroupEl) advShapeOutlineGroupEl.style.display = strokeOn ? 'flex' : 'none';

  const strokeW = a ? (a.strokeWidth || shapeStrokeWidth) : shapeStrokeWidth;
  if (advShapeOutlineWidthEl) { advShapeOutlineWidthEl.value = strokeW; updateSliderFill(advShapeOutlineWidthEl); }
  if (advShapeOutlineWidthVal) advShapeOutlineWidthVal.textContent = strokeW + 'px';

  if (advShapeRadiusGroupEl) advShapeRadiusGroupEl.style.display = kind === 'rect' ? 'block' : 'none';
  if (kind === 'rect') {
    const radius = a ? (a.radius ?? shapeRadius) : shapeRadius;
    if (advShapeRadiusEl) { advShapeRadiusEl.value = radius; updateSliderFill(advShapeRadiusEl); }
    if (advShapeRadiusVal) advShapeRadiusVal.textContent = radius + 'px';
  }

  const opPct = Math.round((a ? (a.opacity ?? shapeOpacity) : shapeOpacity) * 100);
  if (advShapeOpacityEl) { advShapeOpacityEl.value = opPct; updateSliderFill(advShapeOpacityEl); }
  if (advShapeOpacityVal) advShapeOpacityVal.textContent = opPct + '%';
}

// Apply a change to the selected rect/ellipse (or update the shared defaults
// for the next one drawn).
function updateShapeProp(fn) {
  const sel = editTarget();
  const s = sel && (sel.type === 'rect' || sel.type === 'ellipse') ? sel : null;
  if (s) { pushHistory(); fn(s); if (isSoftEditTarget()) fn(null); render(); }
  else fn(null);
  syncShapeOpts(s);
}

if (advShapeFillToggleEl) advShapeFillToggleEl.addEventListener('change', () => {
  if (advShapeFillToggleEl.checked) advShapeColorTarget = 'fill'; // just turned on — claim the shared picker
  updateShapeProp(s => { if (s) s.fill = advShapeFillToggleEl.checked; else shapeFillOn = advShapeFillToggleEl.checked; });
});
if (advShapeOutlineToggleEl) advShapeOutlineToggleEl.addEventListener('change', () => {
  if (advShapeOutlineToggleEl.checked) advShapeColorTarget = 'outline'; // just turned on — claim the shared picker
  updateShapeProp(s => { if (s) s.stroke = advShapeOutlineToggleEl.checked; else shapeStrokeOn = advShapeOutlineToggleEl.checked; });
});
if (advShapeOutlineWidthEl) advShapeOutlineWidthEl.addEventListener('input', () => {
  const w = +advShapeOutlineWidthEl.value;
  shapeStrokeWidth = w;
  if (advShapeOutlineWidthVal) advShapeOutlineWidthVal.textContent = w + 'px';
  updateSliderFill(advShapeOutlineWidthEl);
  const sel = editTarget();
  if (sel && (sel.type === 'rect' || sel.type === 'ellipse')) { sel.strokeWidth = w; scheduleRender(); }
});
if (advShapeOutlineWidthEl) updateSliderFill(advShapeOutlineWidthEl);

if (advShapeRadiusEl) advShapeRadiusEl.addEventListener('input', () => {
  const r = +advShapeRadiusEl.value;
  shapeRadius = r;
  if (advShapeRadiusVal) advShapeRadiusVal.textContent = r + 'px';
  updateSliderFill(advShapeRadiusEl);
  const sel = editTarget();
  if (sel && sel.type === 'rect') { sel.radius = r; scheduleRender(); }
});
if (advShapeRadiusEl) updateSliderFill(advShapeRadiusEl);

if (advShapeOpacityEl) advShapeOpacityEl.addEventListener('input', () => {
  const v = +advShapeOpacityEl.value;
  shapeOpacity = v / 100;
  if (advShapeOpacityVal) advShapeOpacityVal.textContent = v + '%';
  updateSliderFill(advShapeOpacityEl);
  const sel = editTarget();
  if (sel && (sel.type === 'rect' || sel.type === 'ellipse')) { sel.opacity = shapeOpacity; scheduleRender(); }
});
if (advShapeOpacityEl) updateSliderFill(advShapeOpacityEl);

if (advShapeLineWeightEl) advShapeLineWeightEl.addEventListener('input', () => {
  const w = +advShapeLineWeightEl.value;
  lineWeight = w;
  if (advShapeLineWeightVal) advShapeLineWeightVal.textContent = w + 'px';
  updateSliderFill(advShapeLineWeightEl);
  const sel = editTarget();
  if (sel && sel.type === 'line') { sel.strokeWidth = w; scheduleRender(); }
});
if (advShapeLineWeightEl) updateSliderFill(advShapeLineWeightEl);

if (advShapeLineOpacityEl) advShapeLineOpacityEl.addEventListener('input', () => {
  const v = +advShapeLineOpacityEl.value;
  lineOpacity = v / 100;
  if (advShapeLineOpacityVal) advShapeLineOpacityVal.textContent = v + '%';
  updateSliderFill(advShapeLineOpacityEl);
  const sel = editTarget();
  if (sel && sel.type === 'line') { sel.opacity = lineOpacity; scheduleRender(); }
});
if (advShapeLineOpacityEl) updateSliderFill(advShapeLineOpacityEl);

syncShapeOpts(null);

// ─── Crop tool ──────────────────────────────────────────────────────────────────
// Selecting the Crop tool drops a crop frame around the whole image; the user
// then drags the frame (move) or its 8 handles (resize) to keep a region, and
// confirms. Handles may be dragged BEYOND the image to expand the canvas — the new
// area is filled per the Canvas Fill setting. Any tool switch / export clears it.
function startCropMode() { cropRect = { fx: 0, fy: 0, fw: 1, fh: 1 }; }
function endCropMode() { cropRect = null; mode = null; }

// Canvas Fill preference persistence (mode + last solid colour).
const CROP_FILL_STORE_KEY = 'lumshot.crop.fill';
function loadCropFill() {
  try {
    const o = JSON.parse(localStorage.getItem(CROP_FILL_STORE_KEY) || '{}');
    if (o.mode === 'solid' || o.mode === 'transparent') cropFillMode = o.mode;
    if (typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color)) cropFillColor = o.color;
  } catch { /* private mode / malformed — keep defaults */ }
}
function saveCropFill() {
  try { localStorage.setItem(CROP_FILL_STORE_KEY, JSON.stringify({ mode: cropFillMode, color: cropFillColor })); }
  catch { /* private mode, etc. */ }
}

// Cached checkerboard pattern used to preview the transparent canvas fill (and as
// the swatch backdrop). Built once against the main context.
let _checkerPattern = null;
function checkerPattern() {
  if (_checkerPattern) return _checkerPattern;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 16;
  const t = tile.getContext('2d');
  t.fillStyle = '#ffffff'; t.fillRect(0, 0, 16, 16);
  t.fillStyle = '#cbd0d6'; t.fillRect(0, 0, 8, 8); t.fillRect(8, 8, 8, 8);
  _checkerPattern = ctx.createPattern(tile, 'repeat');
  return _checkerPattern;
}

// 8 resize handles (4 corners + 4 edge midpoints) in screenshot-space pixels.
function cropHandles(r) {
  const x = nx(r.fx), y = ny(r.fy), w = nx(r.fw), h = ny(r.fh);
  return [
    { name: 'nw', x: x,         y: y         },
    { name: 'n',  x: x + w / 2, y: y         },
    { name: 'ne', x: x + w,     y: y         },
    { name: 'e',  x: x + w,     y: y + h / 2 },
    { name: 'se', x: x + w,     y: y + h     },
    { name: 's',  x: x + w / 2, y: y + h     },
    { name: 'sw', x: x,         y: y + h     },
    { name: 'w',  x: x,         y: y + h / 2 },
  ];
}
const CROP_CURSORS = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};
function cropHandleAt(sx, sy) {
  if (!cropRect) return null;
  const tol = 13 * viewScale();   // forgiving grab radius for the chunky pill handles
  for (const hnd of cropHandles(cropRect)) {
    if (Math.hypot(sx - hnd.x, sy - hnd.y) <= tol) return hnd.name;
  }
  return null;
}
function insideCrop(sx, sy) {
  if (!cropRect) return false;
  const x = nx(cropRect.fx), y = ny(cropRect.fy), w = nx(cropRect.fw), h = ny(cropRect.fh);
  return sx >= x && sx <= x + w && sy >= y && sy <= y + h;
}
// How far (in image-widths/heights) the crop frame may be dragged past each edge.
// Bounds a runaway drag so the expanded canvas can't balloon without limit.
const CROP_EXPAND_LIMIT = 3;
// Resize the crop frame by dragging the named handle to fraction point (fx,fy).
// fx/fy may fall outside [0,1] — that expands the canvas beyond the image.
function resizeCrop(handle, fx, fy) {
  fx = Math.max(-CROP_EXPAND_LIMIT, Math.min(1 + CROP_EXPAND_LIMIT, fx));
  fy = Math.max(-CROP_EXPAND_LIMIT, Math.min(1 + CROP_EXPAND_LIMIT, fy));
  const minW = 8 / Math.max(1, view.iw), minH = 8 / Math.max(1, view.ih);
  let left = cropRect.fx, top = cropRect.fy;
  let right = cropRect.fx + cropRect.fw, bottom = cropRect.fy + cropRect.fh;
  if (handle.includes('w')) left   = Math.min(fx, right - minW);
  if (handle.includes('e')) right  = Math.max(fx, left + minW);
  if (handle.includes('n')) top    = Math.min(fy, bottom - minH);
  if (handle.includes('s')) bottom = Math.max(fy, top + minH);
  cropRect.fx = left; cropRect.fy = top;
  cropRect.fw = right - left; cropRect.fh = bottom - top;
}
// Move the whole crop frame. It may sit partly outside the image (canvas
// expansion); clamp only so it always keeps a sliver overlapping the image and
// can't be flung entirely out of reach.
function moveCrop(dfx, dfy) {
  const keep = 0.05; // min fraction of the image that must stay inside the frame's span
  const nfx = Math.max(keep - cropRect.fw, Math.min(1 - keep, cropRect._ox + dfx));
  const nfy = Math.max(keep - cropRect.fh, Math.min(1 - keep, cropRect._oy + dfy));
  cropRect.fx = nfx; cropRect.fy = nfy;
}
function applyCrop() {
  if (!cropRect || !screenshotImg) return;
  // sx/sy are the crop origin in original-image pixels — NEGATIVE when the frame
  // was dragged past the top/left edge (the canvas expanded that way).
  const sx = Math.round(cropRect.fx * view.iw);
  const sy = Math.round(cropRect.fy * view.ih);
  const sw = Math.round(cropRect.fw * view.iw);
  const sh = Math.round(cropRect.fh * view.ih);
  if (sw < 2 || sh < 2) return;
  const off = document.createElement('canvas');
  off.width = sw; off.height = sh;
  const octx = off.getContext('2d');
  // Paint the canvas fill first; for 'transparent' the canvas is left clear so the
  // expanded area exports with a real alpha channel. Then place the original image
  // so its (sx,sy) pixel lands at the crop origin — with expansion the image is
  // offset inward and the chosen fill surrounds it.
  if (cropFillMode === 'solid') { octx.fillStyle = cropFillColor; octx.fillRect(0, 0, sw, sh); }
  octx.drawImage(screenshotImg, -sx, -sy, view.iw, view.ih);
  // Remap existing annotations from the old image space into the cropped space.
  const remap = (fx, fy) => [ (fx * view.iw - sx) / sw, (fy * view.ih - sy) / sh ];
  for (const a of annotations) {
    if (a.fx1 !== undefined) { [a.fx1, a.fy1] = remap(a.fx1, a.fy1); [a.fx2, a.fy2] = remap(a.fx2, a.fy2); }
    if (a.fx  !== undefined) {
      const [nfx, nfy] = remap(a.fx, a.fy);
      a.fw = (a.fw || 0) * view.iw / sw; a.fh = (a.fh || 0) * view.ih / sh;
      a.fx = nfx; a.fy = nfy;
    }
  }
  const cropped = new Image();
  cropped.onload = () => {
    screenshotImg = cropped;
    cropRect = null;
    // The image changed; undo history (annotations only) can't span the crop.
    history = []; redoStack = [];
    notifyUndoRedoState();
    setActiveTool(null);
    render();
  };
  cropped.src = off.toDataURL('image/png');
}
if (cropConfirmEl) cropConfirmEl.addEventListener('click', () => { applyCrop(); });
if (cropCancelEl)  cropCancelEl.addEventListener('click',  () => { setActiveTool(null); });
// Advanced Properties panel: same actions, duplicated so both locations stay in sync.
if (advCropConfirmEl) advCropConfirmEl.addEventListener('click', () => { applyCrop(); });
if (advCropCancelEl)  advCropCancelEl.addEventListener('click',  () => { setActiveTool(null); });

// Crop tool hover feedback: directional cursor over handles, move cursor inside
// the frame, default elsewhere (only while not actively dragging).
canvas.addEventListener('mousemove', (e) => {
  if (activeTool !== 'crop' || mode || !cropRect || !screenshotImg) return;
  const p = toShotPx(e);
  const hname = cropHandleAt(p.x, p.y);
  canvas.style.cursor = hname ? CROP_CURSORS[hname]
                      : insideCrop(p.x, p.y) ? 'move'
                      : 'default';
});

// Track cursor fractional position for paste-at-cursor behavior.
canvas.addEventListener('mousemove', (e) => {
  if (!screenshotImg || !view.iw || !view.ih) return;
  const p = toShotPx(e);
  lastPasteFx = Math.max(0, Math.min(1, p.x / view.iw));
  lastPasteFy = Math.max(0, Math.min(1, p.y / view.ih));
});

// Ctrl+scroll to zoom
canvasArea.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  handleZoom(e.deltaY < 0 ? 'in' : 'out');
}, { passive: false });

// Floating zoom control (bottom-left of the canvas)
document.getElementById('zoom-out').addEventListener('click', () => handleZoom('out'));
document.getElementById('zoom-in').addEventListener('click',  () => handleZoom('in'));
document.getElementById('zoom-fit').addEventListener('click', () => handleZoom('fit'));

// ─── Pointer interaction ────────────────────────────────────────────────────────
// ── Native drag-out ───────────────────────────────────────────────────────────
// Hand the rendered screenshot to the OS as a real file drag, so it drops into
// any app that accepts an image (Slack, Gmail, Explorer, Figma, …). Two entry
// points feed the same path: grabbing the image directly in select mode (the
// mousedown handler below arms a 'dragout' candidate that fires past a small
// threshold) and the floating drag handle (HTML5 dragstart). Both export a full-
// resolution PNG — quality and transparency preserved — and let main do the
// startDrag. A guard prevents starting two drags from one gesture.
const DRAG_OUT_THRESHOLD = 5; // px of movement before a select-mode drag-out begins
let dragOutInFlight = false;

function startNativeDragOut() {
  if (dragOutInFlight || !screenshotImg) return;
  dragOutInFlight = true;
  window.electronAPI.startCanvasDrag(exportDataURL('png'));
  // The OS takes over the pointer once the drag begins, so our mouseup may not
  // arrive; clear the flag shortly after instead of relying on it.
  setTimeout(() => { dragOutInFlight = false; }, 400);
}

// Drag handle: HTML5 drag is the canonical way to kick off webContents.startDrag
// — preventDefault the web drag-image, then hand off to the native file drag.
dragOutHandle.addEventListener('dragstart', (e) => {
  e.preventDefault();
  startNativeDragOut();
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;          // left button only
  if (!screenshotImg || editing) return;
  multiSelectAll = false;

  // Stop the browser's default mousedown focus handling. Without this, focusing
  // the text input (below) is immediately undone — the canvas isn't focusable, so
  // focus moves to <body>, the input blurs, and commitText() hides it instantly.
  e.preventDefault();

  const p = toShotPx(e);
  const fx = p.x / view.iw, fy = p.y / view.ih;

  // Crop tool: drag a handle to resize, or the frame's interior to move it.
  if (activeTool === 'crop') {
    if (!cropRect) return;
    const hname = cropHandleAt(p.x, p.y);
    if (hname) {
      mode = 'crop-resize';
      dragInfo = { handle: hname };
      return;
    }
    if (insideCrop(p.x, p.y)) {
      mode = 'crop-move';
      dragInfo = { startFx: fx, startFy: fy };
      cropRect._ox = cropRect.fx; cropRect._oy = cropRect.fy;
      return;
    }
    // Clicked off the frame, in the dimmed surround — a no-op; the frame is kept.
    // (The canvas now carries an intentional expand margin all around, so an
    // outside-image click no longer cancels — use Esc or the ✕ button for that.)
    return;
  }

  // Text tool: place a new text box on click
  if (activeTool === 'text') { openTextEditorNew(fx, fy); return; }

  // Counter tool: drop a numbered badge on click. Left unselected so the canvas
  // stays clean (WYSIWYG) — the badge is the result, no editing container.
  if (activeTool === 'counter') {
    pushHistory();
    const a = { id: newId(), type: 'counter', color: currentColor, size: counterSize, fx, fy, n: nextCounter++ };
    annotations.push(a);
    editTargetId = a.id; // stays the soft edit target until the tool switches
    updateTextOptsVisibility(); // re-dock the Advanced picker's callback onto this new target
    render();
    return;
  }

  // Free Draw tool: begin capturing a freehand stroke (point-by-point on drag).
  if (activeTool === 'draw') {
    draft = { id: newId(), type: 'draw', color: currentColor,
              width: drawWidth, opacity: drawOpacity, smoothing: drawSmoothing,
              pts: [{ x: fx, y: fy }] };
    mode = 'draw';
    scheduleRender();
    return;
  }

  // Other drawing tools: start a drag-to-create
  if (isDrawingTool(activeTool)) {
    if (activeTool === 'arrow') {
      // Arrows carry no weight/taper/head — the silhouette auto-scales from length.
      // The tail label is opt-in via Advanced Properties' "Add text to tail"
      // toggle (arrowTextEnabled); when on, the tail editor auto-opens on mouseup.
      // outline/outlineColor mirror the standalone Text tool's own current
      // defaults (openTextEditorNew) so drawLabelText — the renderer already
      // shared by both — renders an identical halo, not just identical code.
      draft = { id: newId(), type: 'arrow', color: currentColor, style: arrowStyle,
                textEnabled: arrowTextEnabled, text: '',
                fontSize: arrowTextFontSize, textColor: arrowTextColor,
                outline: advTextOutlineToggleEl.checked, outlineColor: resolveOutlineColor(currentOutlineColor),
                fx1: fx, fy1: fy, fx2: fx, fy2: fy };
    } else if (activeTool === 'line') {
      draft = { id: newId(), type: 'line', color: currentColor,
                strokeWidth: lineWeight, opacity: lineOpacity,
                fx1: fx, fy1: fy, fx2: fx, fy2: fy };
    } else if (activeTool === 'rect' || activeTool === 'ellipse') {
      draft = {
        id: newId(), type: activeTool, color: currentColor,
        stroke: shapeStrokeOn, strokeWidth: shapeStrokeWidth,
        fill: shapeFillOn, fillColor: shapeFillColor,
        radius: shapeRadius, opacity: shapeOpacity,
        fx, fy, fw: 0, fh: 0, _ox: fx, _oy: fy,
      };
    } else if (activeTool === 'blur') {
      draft = { id: newId(), type: 'blur', fx, fy, fw: 0, fh: 0, strength: blurDefaultStrength, blurType: blurDefaultType, _ox: fx, _oy: fy };
    } else if (activeTool === 'highlight') {
      // Marker stroke: two-point (start → end) like a line, not a box.
      draft = { id: newId(), type: 'highlight', color: highlightColor,
                width: highlightWidth, opacity: HIGHLIGHT_OPACITY,
                fx1: fx, fy1: fy, fx2: fx, fy2: fy };
    }
    mode = 'create';
    return;
  }

  // ── Select mode ──
  const sel = annotations.find(a => a.id === selectedId);
  if (sel) {
    const hname = handleAt(sel, p.x, p.y);
    if (hname) {
      // History is pushed on the first actual mousemove, not here — otherwise a
      // bare select-click would create a redundant (dead) undo entry.
      mode = 'resize';
      dragInfo = { handle: hname, pushed: false };
      return;
    }
  }

  const hit = hitTest(p.x, p.y);
  if (hit) {
    selectedId = hit.id;
    syncToolbarToSelection(hit);
    // History is pushed on the first actual mousemove, not here, so simply
    // selecting an annotation doesn't add a dead undo entry.
    mode = 'move';
    dragInfo = { startFx: fx, startFy: fy, orig: JSON.parse(JSON.stringify(hit)), pushed: false };
    render();
  } else {
    selectedId = null;
    updateTextOptsVisibility();
    render();
    // Arm a native drag-out: grabbing the bare image (no annotation here) and
    // moving past a small threshold drags the rendered screenshot out to the OS.
    // A plain click (no movement) still just deselects, as before. Disabled in
    // OCR mode, where dragging is text selection on the overlay.
    if (!ocrModeActive) {
      mode = 'dragout';
      dragInfo = { startX: e.clientX, startY: e.clientY };
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (!mode || !screenshotImg) return;
  // Drag-out candidate: once the pointer moves past the threshold, hand the image
  // to the OS drag loop. Below threshold it's still just a deselect-click.
  if (mode === 'dragout') {
    if (dragInfo && Math.hypot(e.clientX - dragInfo.startX, e.clientY - dragInfo.startY) > DRAG_OUT_THRESHOLD) {
      mode = null; dragInfo = null;
      startNativeDragOut();
    }
    return;
  }

  const p = toShotPx(e);
  const fx = p.x / view.iw, fy = p.y / view.ih;

  if (mode === 'crop-resize' && cropRect && dragInfo) {
    resizeCrop(dragInfo.handle, fx, fy);
    scheduleRender();
  } else if (mode === 'crop-move' && cropRect && dragInfo) {
    moveCrop(fx - dragInfo.startFx, fy - dragInfo.startFy);
    scheduleRender();
  } else if (mode === 'draw' && draft) {
    // Append a point only once it's far enough from the last sample — keeps the
    // path light (low latency) and trims pointer jitter; smoothing widens the gap.
    const last = draft.pts[draft.pts.length - 1];
    if (Math.hypot(nx(fx) - nx(last.x), ny(fy) - ny(last.y)) >= drawMinDist()) {
      draft.pts.push({ x: fx, y: fy });
      scheduleRender();
    }
  } else if (mode === 'create' && draft) {
    if (draft.type === 'arrow' || draft.type === 'line' || draft.type === 'highlight') {
      draft.fx2 = fx; draft.fy2 = fy;
    } else {
      // Remember the raw cursor so a Shift press/release with no pointer movement
      // can re-run the box math (see the Shift key listeners below).
      draft._cx = fx; draft._cy = fy;
      updateCreateBox(e.shiftKey);
    }
    scheduleRender();
  } else if (mode === 'move' && dragInfo) {
    const a = annotations.find(x => x.id === selectedId);
    if (a) {
      if (!dragInfo.pushed) { pushHistory(); dragInfo.pushed = true; } // capture pre-drag state once
      applyMove(a, dragInfo.orig, fx - dragInfo.startFx, fy - dragInfo.startFy);
      scheduleRender();
    }
  } else if (mode === 'resize' && dragInfo) {
    const a = annotations.find(x => x.id === selectedId);
    if (a) {
      if (!dragInfo.pushed) { pushHistory(); dragInfo.pushed = true; } // capture pre-resize state once
      applyResize(a, dragInfo.handle, fx, fy);
      scheduleRender();
    }
  }
});

// Recompute the in-progress box shape (rect/ellipse/blur) from its anchor
// (_ox/_oy) to the last cursor (_cx/_cy). When `square` is true the box is
// constrained to equal on-screen width/height — a perfect square (Rectangle) or
// circle (Circle), the standard Shift-to-constrain behavior.
//
// The 1:1 constraint MUST be computed in pixel space, not in the fractional
// fx/fy coordinates: fw/fh are fractions of the image's width/height, and those
// two axes have different pixel scales (nx = fx*iw, ny = fy*ih). Equalizing the
// *fractions* would give a box of side*iw by side*ih px — a shape stretched to
// the image's aspect ratio, not a square. So convert the drag deltas to pixels,
// equalize there, then divide each axis back by its own scale so the final
// fw*iw === fh*ih (a true 1:1 pixel box) for any image/zoom/viewport. Signs are
// preserved per axis so the box always grows toward the cursor from the anchor.
function updateCreateBox(square) {
  if (!draft || draft._cx === undefined) return;
  let dx = draft._cx - draft._ox;
  let dy = draft._cy - draft._oy;
  if (square) {
    const pxSide = Math.max(Math.abs(dx) * view.iw, Math.abs(dy) * view.ih);
    dx = Math.sign(dx) * (pxSide / view.iw);
    dy = Math.sign(dy) * (pxSide / view.ih);
  }
  draft.fx = Math.min(draft._ox, draft._ox + dx);
  draft.fy = Math.min(draft._oy, draft._oy + dy);
  draft.fw = Math.abs(dx);
  draft.fh = Math.abs(dy);
}

// Shift pressed/released mid-drag with no pointer movement still needs to
// apply/release the square constraint live, so react to the key itself too.
// Only relevant while a box shape is being drawn (mode 'create', box draft).
function onShiftConstrain(e) {
  if (e.key !== 'Shift') return;
  if (mode !== 'create' || !draft || draft._cx === undefined) return;
  updateCreateBox(e.shiftKey);
  scheduleRender();
}
window.addEventListener('keydown', onShiftConstrain);
window.addEventListener('keyup', onShiftConstrain);

window.addEventListener('mouseup', () => {
  if (mode === 'crop-resize' || mode === 'crop-move') {
    mode = null;
    dragInfo = null;
    render();
    return;
  }
  if (mode === 'draw' && draft) {
    // Commit only a stroke with real extent — a bare click (no drag) is discarded,
    // consistent with the other drag-to-create tools.
    const b = drawBoundsPx(draft);
    if (draft.pts.length >= 2 && Math.hypot(b.w, b.h) > 6) {
      pushHistory();
      annotations.push(draft);
      // Left unselected: the finished stroke just stays on the canvas. A selection
      // outline only appears later if the user explicitly clicks it in select mode.
      editTargetId = draft.id; // stays the soft edit target until the tool switches
      updateTextOptsVisibility(); // re-dock the Advanced picker's callback onto this new target
    }
    draft = null;
    mode = null;
    dragInfo = null;
    render();
    return;
  }
  if (mode === 'create' && draft) {
    const twoPoint = draft.type === 'arrow' || draft.type === 'line' || draft.type === 'highlight';
    const ok = twoPoint
      ? Math.hypot(nx(draft.fx2 - draft.fx1), ny(draft.fy2 - draft.fy1)) > 6
      : (nx(draft.fw) > 6 && ny(draft.fh) > 6);
    if (ok) {
      pushHistory();
      delete draft._ox; delete draft._oy; delete draft._cx; delete draft._cy;
      annotations.push(draft);
      editTargetId = draft.id; // stays the soft edit target until the tool switches
      const justDrew = draft;
      draft = null;
      // The finished shape/line/arrow just stays on the canvas, unselected — no
      // auto-shown bounding box. Selection happens only on an explicit click.
      updateTextOptsVisibility(); // re-dock the Advanced picker's callback onto this new target
      // Arrow with "Add text to tail" on: jump straight into the same live,
      // click-to-type tail editor a manual toggle-on opens (see
      // advArrowTextToggleEl's change handler) — a blinking caret at the tail,
      // ready to type immediately, no extra click needed.
      if (justDrew.type === 'arrow' && justDrew.textEnabled) {
        openArrowLabelEditor(justDrew, true);
      }
    } else {
      draft = null;
    }
    render();
  }
  mode = null;
  dragInfo = null;
});

function applyMove(a, orig, dfx, dfy) {
  if (a.type === 'arrow' || a.type === 'line' || a.type === 'highlight') {
    a.fx1 = orig.fx1 + dfx; a.fy1 = orig.fy1 + dfy;
    a.fx2 = orig.fx2 + dfx; a.fy2 = orig.fy2 + dfy;
  } else if (a.type === 'draw') {
    for (let i = 0; i < a.pts.length; i++) {
      a.pts[i].x = orig.pts[i].x + dfx;
      a.pts[i].y = orig.pts[i].y + dfy;
    }
  } else {
    a.fx = orig.fx + dfx; a.fy = orig.fy + dfy;
  }
}

function applyResize(a, handle, fx, fy) {
  if (a.type === 'arrow' || a.type === 'line' || a.type === 'highlight') {
    if (handle === 'p1') { a.fx1 = fx; a.fy1 = fy; }
    else                 { a.fx2 = fx; a.fy2 = fy; }
    return;
  }
  // rect-style: recompute from the dragged corner against the opposite corner
  let x1 = a.fx, y1 = a.fy, x2 = a.fx + a.fw, y2 = a.fy + a.fh;
  if (handle === 'nw') { x1 = fx; y1 = fy; }
  if (handle === 'ne') { x2 = fx; y1 = fy; }
  if (handle === 'sw') { x1 = fx; y2 = fy; }
  if (handle === 'se') { x2 = fx; y2 = fy; }
  a.fx = Math.min(x1, x2); a.fy = Math.min(y1, y2);
  a.fw = Math.abs(x2 - x1); a.fh = Math.abs(y2 - y1);
}

// Reflect a selected annotation's properties back into the toolbar controls
function syncToolbarToSelection(a) {
  // Highlight keeps its own (independent) colour, so it must not push into the
  // shared currentColor — that would tint the next arrow/shape yellow.
  if ('color' in a && a.type !== 'highlight') {
    currentColor = a.color;
    syncColorSwatches();
  }
  if (a.type === 'text') syncTextOpts(a);
  if (a.type === 'blur') syncBlurOpts(a);
  if (a.type === 'rect' || a.type === 'ellipse' || a.type === 'line') syncShapeOpts(a);
  if (a.type === 'arrow') syncArrowOpts(a);
  if (a.type === 'counter') syncCounterOpts(a);
  if (a.type === 'draw') syncDrawOpts(a);
  if (a.type === 'highlight') syncHighlightOpts(a);
  updateTextOptsVisibility();
}

// Reflect a text annotation's (or the new-text defaults') colour/size/outline
// into the panel. `a` is null when no text annotation is selected.
function syncTextOpts(a) {
  textColorPalette.sync();
  dockTextColorPicker(a);

  const fontSize = a ? a.fontSize : (+advTextFontSizeEl.value || 20);
  if (advTextFontSizeEl)  { advTextFontSizeEl.value = fontSize; updateSliderFill(advTextFontSizeEl); }
  if (advTextFontSizeVal) advTextFontSizeVal.textContent = fontSize + 'px';

  // Outline colour group: only relevant (and shown) while the outline is enabled.
  const outlineOn = a ? !!a.outline : advTextOutlineToggleEl.checked;
  if (advTextOutlineToggleEl) advTextOutlineToggleEl.checked = outlineOn;
  if (advTextOutlineGroupEl) advTextOutlineGroupEl.style.display = outlineOn ? 'flex' : 'none';
}

// Reflect a counter's (or the new-counter defaults') size + colour into the panel.
// `a` is null when no counter annotation is selected.
function syncCounterOpts(a) {
  counterColorPalette.sync();
  if (cpPopover && cpPopover.classList.contains('cp-docked') && cpPopover.parentElement === advCounterPaletteSlot) {
    cpSetFromHex(a ? a.color : currentColor);
  }
  const size = a ? (a.size || COUNTER_DEFAULT_SIZE) : counterSize;
  if (counterSizeEl) { counterSizeEl.value = size; updateSliderFill(counterSizeEl); }
  if (counterSizeVal) counterSizeVal.textContent = size + 'px';
}

// Reflect a highlight stroke's (or the new-stroke defaults') colour + pen width
// into the panel. `a` is null when no highlight is selected.
function syncHighlightOpts(a) {
  highlightColorPalette.sync();
  if (cpPopover && cpPopover.classList.contains('cp-docked') && cpPopover.parentElement === advHighlightPaletteSlot) {
    cpSetFromHex(a ? a.color : highlightColor);
  }
  const width = a ? (a.width ?? highlightWidth) : highlightWidth;
  if (highlightWidthEl)  { highlightWidthEl.value = width; updateSliderFill(highlightWidthEl); }
  if (highlightWidthVal) highlightWidthVal.textContent = width + 'px';
}

// Reflect a freehand stroke's (or the new-stroke defaults') colour, width,
// opacity and smoothing into the panel. `a` is null when nothing's selected.
function syncDrawOpts(a) {
  drawColorPalette.sync();
  // If the docked full picker is currently showing Draw's stroke colour, keep
  // its displayed value in step (cpSetFromHex doesn't fire onChange, so this
  // can't loop back into a spurious change).
  if (cpPopover && cpPopover.classList.contains('cp-docked') && cpPopover.parentElement === advDrawPaletteSlot) {
    cpSetFromHex(a ? a.color : currentColor);
  }

  const width = a ? (a.width ?? drawWidth) : drawWidth;
  if (drawWidthEl)  { drawWidthEl.value = width; updateSliderFill(drawWidthEl); }
  if (drawWidthVal) drawWidthVal.textContent = width + 'px';

  const opacity = a ? (a.opacity ?? drawOpacity) : drawOpacity;
  const opPct = Math.round(opacity * 100);
  if (drawOpacityEl)  { drawOpacityEl.value = opPct; updateSliderFill(drawOpacityEl); }
  if (drawOpacityVal) drawOpacityVal.textContent = opPct + '%';

  const smoothing = a ? (a.smoothing ?? drawSmoothing) : drawSmoothing;
  const smPct = Math.round(smoothing * 100);
  if (drawSmoothingEl)  { drawSmoothingEl.value = smPct; updateSliderFill(drawSmoothingEl); }
  if (drawSmoothingVal) drawSmoothingVal.textContent = smPct + '%';
}

// Highlight the shape-type picker button matching the current primitive, on
// both instances (toolbar icons + the Advanced Properties segmented control —
// see shapeTypeBtns above). The toolbar instance is only ever visible while
// the Shape tool itself is active (activeTool alone decides it), but the
// Advanced instance stays visible while a line/rect/ellipse is merely
// selected too — so this reads the selection as a fallback via
// currentShapeKind, the same helper syncShapeOpts uses.
function syncShapeTypeSeg() {
  const sel = editTarget();
  const shapeSel = sel && (sel.type === 'rect' || sel.type === 'ellipse' || sel.type === 'line') ? sel : null;
  // Only ever called while a shape's panel is actually showing (see the
  // showShapeType/showShapeAny/showShapeAdv gate at the call site), so falling
  // back to lastShapeTool here matches currentShapeKind()'s own fallback — e.g.
  // idle with the Advanced panel still showing the last-used Shape tool.
  const kind = isShapeGroupTool(activeTool) ? activeTool : (shapeSel ? shapeSel.type : lastShapeTool);
  shapeTypeBtns.forEach(b => b.classList.toggle('active', b.dataset.shape === kind));
}
// Picking a primitive from either picker switches the Shape tool's draw type.
shapeTypeBtns.forEach(b => {
  b.addEventListener('click', () => setActiveTool(b.dataset.shape));
});

// syncShapeOpts/updateShapeProp for Line/Rectangle/Circle live after the
// colour-picker-popover section below, alongside the Arrow block — see
// [[editor-js-tdz-hazard]] for why.

// Right-click deletes the annotation under the cursor
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!screenshotImg) return;
  const p = toShotPx(e);
  const hit = hitTest(p.x, p.y);
  if (hit) {
    pushHistory();
    annotations = annotations.filter(a => a.id !== hit.id);
    if (selectedId === hit.id) selectedId = null;
    render();
  }
});

// Double-click a text annotation, or an arrow with tail text enabled, to edit it
canvas.addEventListener('dblclick', (e) => {
  if (!screenshotImg) return;
  const p = toShotPx(e);
  const hit = hitTest(p.x, p.y);
  if (hit && hit.type === 'text') openTextEditorEdit(hit);
  else if (hit && hit.type === 'arrow' && hit.textEnabled) openArrowLabelEditor(hit, false);
});

// ─── Custom title-bar window controls ────────────────────────────────────────
// Menu buttons: render fully-custom HTML dropdowns (no native chevron gutter).
// The menu structure + live state (Theme radio, Undo/Redo enabled, Always-on-Top
// checkbox) comes from main via getMenu(); clicks dispatch back via menuAction().
const menuOverlay = document.getElementById('menu-overlay');
let menuData = [];            // [{ id, label, submenu }] top-level menus
let openColumns = [];         // open dropdown columns, outermost first
let activeMenuButton = null;  // the highlighted .menu-btn, or null when closed
let activeColumnIndex = -1;   // column that has keyboard focus (deepest by default)

// Build one item row inside a column. `colObj` is resolved to its live index at
// event time (it may not be in openColumns yet while the column is being built).
function buildMenuRow(item, colObj, idx) {
  const row = document.createElement('div');
  row.className = 'menu-item';
  if (item.enabled === false) row.classList.add('disabled');

  // Radio items always show a circle (filled when active, outline when not) so
  // the group stays aligned. Checkbox marks are inline: a ✓ only on the checked
  // row, which shifts just that row's label — unchecked rows stay flush-left.
  if (item.type === 'radio') {
    const radio = document.createElement('span');
    radio.className = 'menu-radio' + (item.checked ? ' checked' : '');
    row.appendChild(radio);
  } else if (item.type === 'checkbox' && item.checked) {
    const check = document.createElement('span');
    check.className = 'menu-check';
    check.textContent = '✓';
    row.appendChild(check);
  }

  const label = document.createElement('span');
  label.className = 'menu-label';
  label.textContent = item.label;
  row.appendChild(label);

  if (item.type === 'submenu') {
    const arrow = document.createElement('span');
    arrow.className = 'menu-arrow';
    arrow.textContent = '›';
    row.appendChild(arrow);
  } else if (item.accelerator) {
    const accel = document.createElement('span');
    accel.className = 'menu-accel';
    accel.textContent = item.accelerator;
    row.appendChild(accel);
  }

  row.addEventListener('mouseenter', () => onMenuItemHover(openColumns.indexOf(colObj), idx));
  row.addEventListener('mousedown', (e) => e.preventDefault()); // don't steal focus
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    activateMenuItem(openColumns.indexOf(colObj), idx);
  });
  return row;
}

// Create a dropdown column for `items`, position it near (x, y) clamped to the
// viewport, and push it onto the stack. `opts.parentRect` enables left-flip for
// submenus that would overflow the right edge.
function openMenuColumn(items, x, y, parentItemIndex = null, opts = {}) {
  const colObj = { items, rows: [], focusIndex: -1, parentItemIndex, el: null };
  const el = document.createElement('div');
  el.className = 'menu-dropdown';
  if (opts.menuClass) el.classList.add(opts.menuClass); // per-menu hook (e.g. width)
  el.addEventListener('click', (e) => e.stopPropagation()); // clicks on padding don't dismiss

  // Expandable (submenu) items get a divider above and below to set them apart
  // from regular actions. Dividers dedupe against existing/template separators,
  // and a last item gets only a divider above (nothing below to separate).
  // The app-menu root (File, Edit, … plus flat actions like Settings/Exit) draws
  // ONLY the dividers explicitly placed in the template (main.js) — it's forced
  // here rather than inferred, since it now mixes submenus with flat actions.
  const allSubmenus = opts.menuClass === 'menu-root'
    ? true
    : items.every((it) => it.type === 'submenu' || it.type === 'separator');
  let lastWasSeparator = true; // start "separated" so there's no leading divider
  const appendSeparator = () => {
    const sep = document.createElement('div');
    sep.className = 'menu-separator';
    el.appendChild(sep);
    lastWasSeparator = true;
  };
  items.forEach((item, idx) => {
    if (item.type === 'separator') {
      if (!lastWasSeparator) appendSeparator();
      colObj.rows[idx] = null;
      return;
    }
    if (!allSubmenus && item.type === 'submenu' && !lastWasSeparator) appendSeparator(); // divider above
    const row = buildMenuRow(item, colObj, idx);
    colObj.rows[idx] = row;
    el.appendChild(row);
    lastWasSeparator = false;
    // Divider below, unless this is the last item or a separator already follows.
    if (!allSubmenus && item.type === 'submenu' && idx < items.length - 1 && items[idx + 1].type !== 'separator') {
      appendSeparator();
    }
  });

  el.style.visibility = 'hidden';
  el.style.left = '0px';
  el.style.top = '0px';
  menuOverlay.appendChild(el);
  colObj.el = el;

  const w = el.offsetWidth, h = el.offsetHeight;
  let px = x, py = y;
  if (px + w > window.innerWidth - 4) {
    px = opts.parentRect ? (opts.parentRect.left - w + 4) : (window.innerWidth - w - 4);
  }
  if (py + h > window.innerHeight - 4) py = window.innerHeight - h - 4;
  el.style.left = Math.max(4, px) + 'px';
  el.style.top = Math.max(4, py) + 'px';
  el.style.visibility = 'visible';

  openColumns.push(colObj);
  return colObj;
}

// Remove every column past index k (collapse nested submenus).
function closeColumnsBeyond(k) {
  while (openColumns.length > k + 1) {
    const col = openColumns.pop();
    if (col.el) col.el.remove();
  }
}

function clearMenuColumns() {
  for (const col of openColumns) { if (col.el) col.el.remove(); }
  openColumns = [];
}

function closeMenu() {
  clearMenuColumns();
  menuOverlay.style.display = 'none';
  document.body.classList.remove('menu-open');
  document.querySelectorAll('.menu-btn.active').forEach((b) => b.classList.remove('active'));
  activeMenuButton = null;
  activeColumnIndex = -1;
}

// Highlight the focused row in a column and mark it the keyboard-active column.
function setMenuFocus(colIndex, idx) {
  const col = openColumns[colIndex];
  if (!col) return;
  activeColumnIndex = colIndex;
  col.focusIndex = idx;
  col.rows.forEach((row, i) => {
    if (row) row.classList.toggle('active', i === idx);
  });
}

function firstFocusableIndex(col) {
  for (let i = 0; i < col.items.length; i++) {
    const it = col.items[i];
    if (col.rows[i] && it.enabled !== false) return i;
  }
  return -1;
}

function focusMenuColumn(colIndex, idx) {
  const col = openColumns[colIndex];
  if (!col) return;
  const target = (typeof idx === 'number' && idx >= 0) ? idx : firstFocusableIndex(col);
  setMenuFocus(colIndex, target);
}

// Open the submenu of item `itemIndex` in column `parentColIndex` to its right.
function openChildMenuColumn(parentColIndex, itemIndex) {
  const parentCol = openColumns[parentColIndex];
  if (!parentCol) return;
  const item = parentCol.items[itemIndex];
  const row = parentCol.rows[itemIndex];
  if (!item || item.type !== 'submenu' || !row || item.enabled === false) return;
  const rect = row.getBoundingClientRect();
  openMenuColumn(item.submenu, rect.right - 4, rect.top - 5, itemIndex, { parentRect: rect });
}

function onMenuItemHover(colIndex, idx) {
  if (colIndex < 0) return;
  const col = openColumns[colIndex];
  const item = col.items[idx];
  if (!item || item.type === 'separator') return;
  closeColumnsBeyond(colIndex);
  setMenuFocus(colIndex, idx);
  if (item.type === 'submenu' && item.enabled !== false) openChildMenuColumn(colIndex, idx);
}

function activateMenuItem(colIndex, idx) {
  if (colIndex < 0) return;
  const col = openColumns[colIndex];
  const item = col && col.items[idx];
  if (!item || item.type === 'separator' || item.enabled === false) return;

  if (item.type === 'submenu') {
    closeColumnsBeyond(colIndex);
    openChildMenuColumn(colIndex, idx);
    focusMenuColumn(colIndex + 1);
    return;
  }
  if (item.type === 'checkbox' || item.type === 'radio') {
    // Toggle in place: keep the menu open; main fires menu:changed to re-render.
    if (item.id) window.electronAPI.menuAction(item.id);
    return;
  }
  if (item.id) window.electronAPI.menuAction(item.id);
  closeMenu();
}

// The app menu is one compact dropdown (the chevron beside the logo): its root
// column lists the top-level menus (File, Edit, …) as rows that expand to the
// right, reusing the ordinary submenu machinery. Top-level entries can also be
// flat actions (e.g. Settings, Exit) or separators (grouping dividers) — those
// pass through as-is instead of being coerced into a submenu row.
function menuRootItems() {
  return menuData.map((m) => (m.submenu && m.submenu.length)
    ? { label: m.label, type: 'submenu', submenu: m.submenu }
    : m); // separators and flat actions (Settings, Exit) pass through as-is
}

// The trigger sits mid-bar, but the bar is opaque and stacks above the dropdown
// layer while a menu is open — anchor the root column just below the bar so its
// top edge can't be hidden underneath it.
function menuAnchorY() {
  const bar = document.getElementById('titlebar');
  return (bar ? bar.getBoundingClientRect().bottom : 52) + 6;
}

// Open the app-menu dropdown, or close it if it's already open.
async function openTopMenu(btn) {
  const wasActive = activeMenuButton === btn;
  clearMenuColumns();
  document.querySelectorAll('.menu-btn.active').forEach((b) => b.classList.remove('active'));
  if (wasActive) { closeMenu(); return; } // clicking the open menu's button closes it

  const data = await window.electronAPI.getMenu();
  menuData = Array.isArray(data) ? data : [];
  const rootItems = menuRootItems();
  if (!rootItems.length) { closeMenu(); return; }

  activeMenuButton = btn;
  btn.classList.add('active');
  document.body.classList.add('menu-open');
  menuOverlay.style.display = 'block';
  const r = btn.getBoundingClientRect();
  openMenuColumn(rootItems, r.left, menuAnchorY(), null, { menuClass: 'menu-root' });
  focusMenuColumn(0, -1);
}

// Re-render the open menu in place (after Theme/Always-on-Top changed state),
// preserving which submenu path and row were focused.
async function refreshOpenMenu() {
  if (!activeMenuButton) return;
  const btn = activeMenuButton;
  const path = openColumns.slice(1).map((c) => c.parentItemIndex);
  const deepFocus = openColumns.length ? openColumns[openColumns.length - 1].focusIndex : -1;

  const data = await window.electronAPI.getMenu();
  if (!activeMenuButton) return; // closed while awaiting
  menuData = Array.isArray(data) ? data : [];
  const rootItems = menuRootItems();
  if (!rootItems.length) { closeMenu(); return; }

  clearMenuColumns();
  const r = btn.getBoundingClientRect();
  openMenuColumn(rootItems, r.left, menuAnchorY(), null, { menuClass: 'menu-root' });
  let items = rootItems;
  for (const idx of path) {
    const it = items[idx];
    if (!it || it.type !== 'submenu') break;
    openChildMenuColumn(openColumns.length - 1, idx);
    items = it.submenu;
  }
  focusMenuColumn(openColumns.length - 1, deepFocus);
}

function moveMenuFocus(col, dir) {
  const n = col.items.length;
  let i = col.focusIndex;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (col.rows[i] && col.items[i].enabled !== false) { setMenuFocus(activeColumnIndex, i); return; }
  }
}

function jumpMenuToLetter(col, letter) {
  const n = col.items.length;
  const want = letter.toLowerCase();
  for (let step = 1; step <= n; step++) {
    const i = (col.focusIndex + step + n) % n;
    const it = col.items[i];
    if (col.rows[i] && it.enabled !== false && (it.label || '').toLowerCase().startsWith(want)) {
      setMenuFocus(activeColumnIndex, i);
      return;
    }
  }
}

function onMenuKeydown(e) {
  if (!activeMenuButton) return;
  const col = openColumns[activeColumnIndex];
  if (!col) return;
  switch (e.key) {
    case 'Escape':
      e.preventDefault(); e.stopPropagation(); closeMenu(); break;
    case 'ArrowDown':
      e.preventDefault(); e.stopPropagation(); moveMenuFocus(col, +1); break;
    case 'ArrowUp':
      e.preventDefault(); e.stopPropagation(); moveMenuFocus(col, -1); break;
    case 'ArrowRight': {
      e.preventDefault(); e.stopPropagation();
      const item = col.items[col.focusIndex];
      if (item && item.type === 'submenu') {
        closeColumnsBeyond(activeColumnIndex);
        openChildMenuColumn(activeColumnIndex, col.focusIndex);
        focusMenuColumn(activeColumnIndex + 1);
      }
      break;
    }
    case 'ArrowLeft':
      e.preventDefault(); e.stopPropagation();
      if (activeColumnIndex > 0) {
        const parent = activeColumnIndex - 1;
        closeColumnsBeyond(parent);
        focusMenuColumn(parent, openColumns[parent].focusIndex);
      } else {
        closeMenu(); // at the root column there's nothing further left — back out
      }
      break;
    case 'Enter':
    case ' ':
      e.preventDefault(); e.stopPropagation();
      if (col.focusIndex >= 0) activateMenuItem(activeColumnIndex, col.focusIndex);
      break;
    default:
      // Type-ahead: jump to the next item starting with the typed letter.
      // Ignore modifier combos so the user's accelerators still pass through.
      if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.stopPropagation();
        jumpMenuToLetter(col, e.key);
      }
  }
}

{
  const menuTrigger = document.getElementById('menu-trigger');
  if (menuTrigger) {
    menuTrigger.addEventListener('click', (e) => { e.stopPropagation(); openTopMenu(menuTrigger); });
  }
}

// Backdrop click (anywhere outside a dropdown) dismisses the menu.
menuOverlay.addEventListener('click', () => closeMenu());
menuOverlay.addEventListener('contextmenu', (e) => e.preventDefault());
// Capture phase so menu keys win over the editor's global shortcuts while open.
document.addEventListener('keydown', onMenuKeydown, true);
// Main toggled Theme/Always-on-Top: re-render the open menu with fresh state.
window.electronAPI.onMenuChanged(() => { if (activeMenuButton) refreshOpenMenu(); });

// Cross-platform: on macOS/Linux the native system menu bar replaces the custom
// title-bar buttons, so hide them. (The HTML-dropdown code stays inert there —
// it only ever runs in response to a button click that can no longer happen.)
(async () => {
  const platform = await window.electronAPI.getPlatform();
  if (platform === 'darwin' || platform === 'linux') {
    document.getElementById('titlebar-menu')?.classList.add('platform-hidden');
  }
})();

document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
document.getElementById('btn-close').addEventListener('click',    () => window.electronAPI.closeWindow());

const btnMaximize = document.getElementById('btn-maximize');
btnMaximize.addEventListener('click', () => window.electronAPI.maximizeWindow());
window.electronAPI.onWindowMaximized((isMaximized) => {
  btnMaximize.classList.toggle('maximized', isMaximized);
  // Recalculate the toolbar position on the exact maximize/restore transition,
  // in addition to the window 'resize' handler. This is an authoritative signal
  // straight from main.js (window.on('maximize'/'unmaximize')), so it fires even
  // if a resize event's timing is unreliable across the state change. Deferred a
  // frame so the flex row has finished re-laying out at the new window width
  // before we measure it.
  requestAnimationFrame(positionToolbar);
});

// ─── Text input overlay ─────────────────────────────────────────────────────────
// The on-screen text is drawn on the canvas by drawEditingText() (so it looks
// exactly like the committed annotation). The <input> overlay is kept
// transparent and only supplies the blinking caret + keystroke capture, sitting
// directly on top of the canvas-drawn glyphs.
// Canvas-px anchor + alignment for whatever is currently being edited: a
// standalone text box (anchored top-left at its click point) or an arrow label
// (derived live from the arrow's direction, so it tracks the arrow as it moves).
function editingLayout() {
  if (editing.kind === 'arrowlabel') {
    const a = annotations.find(x => x.id === editing.id);
    if (a) return arrowLabelLayout(a);
  }
  return { x: nx(editing.fx), y: ny(editing.fy), align: 'left', vAnchor: 'top' };
}

function drawEditingText() {
  if (!editing || textInput.style.display === 'none') return;
  const text = textInput.value;
  const lay = editingLayout();
  if (!text) {
    // Arrow label only: a faint placeholder invites an optional label without
    // suggesting one is required. The Text tool has no such hint — an empty
    // click-to-place box is just the caret, as before.
    if (editing.kind === 'arrowlabel') {
      drawLabelText(ARROW_LABEL_PLACEHOLDER, lay.x, lay.y, {
        fontSize: editing.fontSize, color: editing.color, opacity: ARROW_LABEL_PLACEHOLDER_OPACITY,
        align: lay.align, vAnchor: lay.vAnchor, fontWeight: 400, // placeholder only — real text keeps ANN_FONT_WEIGHT
      });
    }
    return;
  }
  drawLabelText(text, lay.x, lay.y, {
    fontSize: editing.fontSize, color: editing.color,
    outline: editing.outline, outlineColor: editing.outlineColor,
    align: lay.align, vAnchor: lay.vAnchor,
  });
}

// Set the input's static styles (font, height, alignment, caret) from `editing`,
// then lay it out. The text itself is drawn on the canvas; the transparent input
// only carries the caret.
function positionTextInput() {
  const fs      = editing.fontSize * view.annScale;
  const cssFont = fs / viewScale();
  const cssVh   = textVMetrics(fs).height / viewScale();   // font-box height in CSS px
  const lay     = editingLayout();
  textInput.style.fontFamily = ANN_FONT;          // match the canvas font metrics
  textInput.style.fontWeight = ANN_FONT_WEIGHT;
  textInput.style.fontSize   = cssFont + 'px';
  textInput.style.height     = cssVh + 'px';      // content box == glyph font-box
  textInput.style.lineHeight = cssVh + 'px';      // centre the (transparent) caret
  textInput.style.textAlign  = lay.align;
  textInput.style.color      = 'transparent';     // text is drawn on the canvas
  textInput.style.caretColor = editing.color;
  textInput.style.display    = 'block';
  syncTextInputLayout();
  textInput.focus();
}

// Re-fit the input to its content and place it so the caret sits on the canvas
// text, honouring the alignment (right/centre keep the anchored edge fixed as the
// text grows). Repaints the live preview. Called on open and on every keystroke.
function syncTextInputLayout() {
  if (!editing) return;
  const fs = editing.fontSize * view.annScale;
  ctx.save();
  ctx.font = `${ANN_FONT_WEIGHT} ${fs}px ${ANN_FONT}`;
  const tw = ctx.measureText(textInput.value || '').width;   // canvas px
  ctx.restore();
  const vm  = textVMetrics(fs);
  const lay = editingLayout();
  const { x: sx, y: sy } = toAreaCoords(view.ox + lay.x, view.oy + lay.y);
  const w     = tw / viewScale() + 4;             // +caret slack
  const cssVh = vm.height / viewScale();
  const left = lay.align === 'right'  ? sx - w
             : lay.align === 'center' ? sx - w / 2
             :                          sx;
  const top  = lay.vAnchor === 'middle' ? sy - cssVh / 2
             : lay.vAnchor === 'bottom' ? sy - cssVh
             :                            sy;
  const cs = getComputedStyle(textInput);
  const offL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
  const offT = parseFloat(cs.paddingTop)  + parseFloat(cs.borderTopWidth);
  textInput.style.width = w + 'px';
  textInput.style.left  = (left - offL) + 'px';
  textInput.style.top   = (top  - offT) + 'px';
  scheduleRender();
}

function openTextEditorNew(fx, fy) {
  editing = { kind: 'text', isNew: true, fx, fy, fontSize: +advTextFontSizeEl.value || 20, color: currentColor,
              outline: advTextOutlineToggleEl.checked, outlineColor: resolveOutlineColor(currentOutlineColor) };
  textInput.value = '';
  positionTextInput();
}

function openTextEditorEdit(a) {
  // Carry the annotation's style onto `editing` so the live preview matches it.
  editing = { kind: 'text', isNew: false, id: a.id, fx: a.fx, fy: a.fy, fontSize: a.fontSize,
              color: a.color, outline: a.outline, outlineColor: a.outlineColor };
  editingId = a.id;          // hide the original while editing
  textInput.value = a.text;
  positionTextInput();
  render();
}

// Edit the label of an arrow+text annotation. `isNew` = just drawn (the arrow was
// already pushed to history on creation, so committing the label doesn't push
// again — one undo removes the whole thing). The arrow stays visible while typing;
// only its label is suppressed (drawArrowText) in favour of the live preview.
function openArrowLabelEditor(a, isNew) {
  editing = { kind: 'arrowlabel', isNew: !!isNew, id: a.id,
              fontSize: a.fontSize, color: a.textColor || a.color,
              outline: a.outline, outlineColor: a.outlineColor };
  // A brand-new arrow stays unselected after its label is typed (clean finish);
  // editing an existing one keeps the selection the user already made by clicking.
  // (The overlay is hidden while editing regardless, via the `!editing` guard.)
  if (!isNew) selectedId = a.id;
  textInput.value = a.text || '';
  positionTextInput();
  render();
}

function commitText() {
  if (!editing) return;
  const val = textInput.value.trim();

  if (editing.kind === 'arrowlabel') {
    const a = annotations.find(x => x.id === editing.id);
    if (a) {
      if (!editing.isNew) pushHistory();   // a brand-new arrow was already pushed on creation
      a.text = val;                        // empty just leaves a plain arrow
      // Only an existing arrow being re-edited stays selected; a brand-new one
      // finishes clean and unselected.
      if (!editing.isNew) { selectedId = a.id; syncToolbarToSelection(a); }
    }
  } else if (editing.isNew) {
    if (val) {
      pushHistory();
      const a = { id: newId(), type: 'text', fx: editing.fx, fy: editing.fy,
                  text: val, fontSize: editing.fontSize, color: editing.color,
                  outline: editing.outline, outlineColor: editing.outlineColor };
      annotations.push(a);
      editTargetId = a.id; // stays the soft edit target until the tool switches
      updateTextOptsVisibility(); // re-dock the Advanced picker's callback onto this new target
      // New text stays unselected — no auto bounding box; it's just the result.
    }
  } else {
    const a = annotations.find(x => x.id === editing.id);
    if (a) {
      pushHistory();
      if (val) a.text = val;
      else { annotations = annotations.filter(x => x.id !== a.id); selectedId = null; }
    }
  }
  editing = null;
  editingId = null;
  textInput.style.display = 'none';
  textInput.value = '';
  render();
}

function cancelText() {
  editing = null;
  editingId = null;
  textInput.style.display = 'none';
  textInput.value = '';
  render();
}

textInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter')  commitText();
  if (e.key === 'Escape') cancelText();
});
// Live preview: re-fit the box and repaint the canvas text on every edit.
textInput.addEventListener('input', syncTextInputLayout);
textInput.addEventListener('blur', () => { if (editing) commitText(); });

// ─── Global keyboard shortcuts ────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (document.activeElement === textInput) return;
  // Typing in the OCR find box: let the browser handle everything (typing, caret,
  // native clipboard). Ctrl+Shift+O still toggles OCR Mode.
  if (document.activeElement === ocrSearchInput) {
    if (e.key === 'O' && e.shiftKey && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleOcrMode(); }
    return;
  }
  const typingInField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);

  // While focus is in a text field, the browser must own the standard editing
  // combos (Ctrl/Cmd + A/C/V/X/Z/Y). Bail before any app shortcut runs so e.g.
  // "Open from Clipboard" (Ctrl+V) or Redo (Ctrl+Y) can't steal them and block
  // native copy/paste — this is what made the license-key box impossible to paste
  // into. We never call preventDefault here, so the field pastes/copies natively.
  if (typingInField && (e.ctrlKey || e.metaKey) && !e.altKey
      && ['a', 'c', 'v', 'x', 'z', 'y'].includes((e.key || '').toLowerCase())) {
    return;
  }

  if (e.key === 'Escape') {
    if (ocrSearchActive) { toggleOcrSearch(false); return; }
    if (editing) { cancelText(); return; }
    if (multiSelectAll) { multiSelectAll = false; return; }
    if (ocrModeActive) { exitOcrMode(); return; }
    selectedId = null;
    setActiveTool(null);
    return;
  }

  // Enter confirms an active crop selection — same action as the Apply button, so
  // mouse and keyboard stay in sync (both call applyCrop). Only while the Crop
  // tool is active with a valid selection, and never while typing in a field.
  if (e.key === 'Enter' && !typingInField && activeTool === 'crop' && cropRect) {
    e.preventDefault();
    applyCrop();
    return;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && !typingInField) {
    if (multiSelectAll) { e.preventDefault(); multiSelectAll = false; clearAll(); return; }
    if (selectedId)     { e.preventDefault(); deleteSelected(); return; }
  }

  // Redo (not exposed in the editable shortcuts panel)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }

  // Data-driven, user-customizable shortcuts (see SHORTCUT_DEFS / scBindings)
  const combo = eventToCombo(e);
  if (!combo) return;
  const single = !combo.includes('+');
  // In OCR Mode the annotation single-key tool shortcuts stay inert — the user
  // is normally reading/selecting extracted text, not choosing a tool, so a
  // stray letterkey shouldn't yank them out of OCR Mode. Clicking a toolbar
  // button is a deliberate choice and does exit OCR Mode (see the click
  // handler above); keep Ctrl-combos (Copy, Save, OCR toggle, …) working here.
  for (const def of SHORTCUT_DEFS) {
    if (def.kind === 'readonly' || def.kind === 'global') continue;
    if (bindingFor(def.id) !== combo) continue;
    if (typingInField && single) continue; // don't steal letters while typing in a field
    if (ocrModeActive && def.kind === 'tool') continue; // annotation tools are inert in OCR Mode
    e.preventDefault();
    runShortcut(def);
    return;
  }
});

// ─── Sliders ────────────────────────────────────────────────────────────────────
function updateSliderFill(slider) {
  const min = +slider.min || 0, max = +slider.max || 100;
  const pct = max > min ? ((slider.value - min) / (max - min)) * 100 : 0;
  slider.style.setProperty('--fill', pct + '%');
}

function wireSlider(id, valId, suffix) {
  const slider = document.getElementById(id);
  const display = document.getElementById(valId);
  slider.addEventListener('input', () => {
    display.textContent = slider.value + suffix;
    updateSliderFill(slider);
    scheduleRender();
  });
  updateSliderFill(slider);
}

wireSlider('padding',        'padding-val',        'px');
wireSlider('radius',         'radius-val',         'px');
wireSlider('shadow-blur',    'shadow-blur-val',    'px');
wireSlider('shadow-offset',  'shadow-offset-val',  'px');
wireSlider('shadow-opacity', 'shadow-opacity-val', '%');

// Custom image background. The redesign provides the hidden file input only; the
// picker tile lives inside #preset-grid (created here) so colours and the custom
// image share one unified grid.
const customBgInput = document.getElementById('custom-bg-input');
const customBgBtn = document.createElement('button');
customBgBtn.className = 'preset-btn custom-image-btn';
customBgBtn.title = 'Custom image background';
customBgBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M216 40H40a16 16 0 0 0-16 16v144a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16m0 16v102.75l-26.07-26.06a16 16 0 0 0-22.63 0l-20 20-44-44a16 16 0 0 0-22.62 0L40 149.37V56ZM40 172l52-52 76 76H40Zm176 28h-51.37l-14-14 20-20L216 210.37V200Zm-72-100a12 12 0 1 1 12 12 12 12 0 0 1-12-12"/></svg>';
customBgBtn.addEventListener('click', () => customBgInput.click());

// Solid-color tile — docks the shared color-picker component (same one used
// throughout Advanced Properties — see dockColorPicker) into
// #adv-bg-palette-slot, right below the preset grid. Click again to collapse
// (mirrors the compact-swatch expand/collapse toggle dockColorPicker already
// gives every other panel).
const advBgPaletteSlot = document.getElementById('adv-bg-palette-slot');
const customBgColorBtn = document.createElement('button');
customBgColorBtn.className = 'preset-btn custom-image-btn';
customBgColorBtn.title = 'Solid background color';
customBgColorBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M224 67.3a35.8 35.8 0 0 0-11.26-25.66c-14-13.28-36.72-12.78-50.62 1.13L142.8 62.2a24 24 0 0 0-33.14.77l-9 9a16 16 0 0 0 0 22.64l2 2.06-51 51a39.75 39.75 0 0 0-10.53 38l-8 18.41A13.68 13.68 0 0 0 36 219.3a15.92 15.92 0 0 0 17.71 3.35L71.23 215a39.89 39.89 0 0 0 37.06-10.75l51-51 2.06 2.06a16 16 0 0 0 22.62 0l9-9a24 24 0 0 0 .74-33.18l19.75-19.87A35.75 35.75 0 0 0 224 67.3M97 193a24 24 0 0 1-24 6 8 8 0 0 0-5.55.31l-18.1 7.91L57 189.41a8 8 0 0 0 .25-5.75A23.88 23.88 0 0 1 63 159l51-51 33.94 34ZM202.13 82l-25.37 25.52a8 8 0 0 0 0 11.3l4.89 4.89a8 8 0 0 1 0 11.32l-9 9L112 83.26l9-9a8 8 0 0 1 11.31 0l4.89 4.89a8 8 0 0 0 11.33 0l24.94-25.09c7.81-7.82 20.5-8.18 28.29-.81a20 20 0 0 1 .39 28.7Z"/></svg>';

// True while the shared picker is actually still docked in Background's own
// slot — false once another panel's dockColorPicker call has reparented it
// elsewhere (tool switches call collapseBgColorPicker() to reconcile this).
function bgColorPickerOpenHere() {
  return !!(advBgPaletteSlot && !advBgPaletteSlot.hidden
    && cpPopover && cpPopover.classList.contains('cp-docked')
    && cpPopover.parentElement === advBgPaletteSlot);
}
function collapseBgColorPicker() {
  if (!advBgPaletteSlot || advBgPaletteSlot.hidden) return;
  if (bgColorPickerOpenHere()) closeColorPicker();
  advBgPaletteSlot.hidden = true;
  customBgColorBtn.classList.remove('selected');
}
customBgColorBtn.addEventListener('click', () => {
  if (bgColorPickerOpenHere()) { collapseBgColorPicker(); return; }
  advBgPaletteSlot.hidden = false;
  dockColorPicker(advBgPaletteSlot, bgSolidColor, (col) => {
    bgType = 'solid';
    bgSolidColor = col;
    selectSwatch(null);
    render();
  });
  cpSetExpanded(true);
  customBgColorBtn.classList.add('selected');
});

{
  const pg = document.getElementById('preset-grid');
  if (pg) { pg.appendChild(customBgBtn); pg.appendChild(customBgColorBtn); }
}
customBgInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    bgImage = new Image();
    bgImage.onload = () => { bgType = 'image'; selectSwatch(null); render(); };
    bgImage.src = reader.result;
  };
  reader.readAsDataURL(file);
  customBgInput.value = '';
});

// ─── Frame segmented control (None / Browser / macOS / Windows) ───────────────
const frameSegButtons = document.querySelectorAll('#frame-seg .seg-btn');
function syncFrameSeg() {
  frameSegButtons.forEach(b => b.classList.toggle('active', b.dataset.frame === frameStyle));
}
frameSegButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    frameStyle = btn.dataset.frame;
    try { localStorage.setItem('lumshot-frame', frameStyle); } catch { /* best-effort */ }
    syncFrameSeg();
    render();
  });
});
syncFrameSeg();

// ─── Shadow presets (None / Soft / Medium / Dramatic) + custom disclosure ─────
// A preset just drives the three custom sliders; touching any slider directly
// switches to "custom" (no preset highlighted), exactly like the design.
const SHADOW_PRESETS = {
  none:   { 'shadow-blur': 0,  'shadow-offset': 0,  'shadow-opacity': 0  },
  soft:   { 'shadow-blur': 24, 'shadow-offset': 8,  'shadow-opacity': 22 },
  medium: { 'shadow-blur': 40, 'shadow-offset': 16, 'shadow-opacity': 35 },
  drama:  { 'shadow-blur': 80, 'shadow-offset': 30, 'shadow-opacity': 52 },
};
const shadowSegButtons = document.querySelectorAll('#shadow-preset-seg .seg-btn');
const shadowSliderIds  = ['shadow-blur', 'shadow-offset', 'shadow-opacity'];
shadowSegButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = SHADOW_PRESETS[btn.dataset.shadow];
    if (!preset) return;
    shadowSegButtons.forEach(b => b.classList.toggle('active', b === btn));
    for (const [id, v] of Object.entries(preset)) {
      const slider = document.getElementById(id);
      slider.value = v;
      slider.dispatchEvent(new Event('input')); // updates the readout + fill + render
    }
  });
});
// Dragging a slider directly = custom shadow → clear the preset highlight.
shadowSliderIds.forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    if (e.isTrusted) shadowSegButtons.forEach(b => b.classList.remove('active'));
  });
});
const shadowCustomToggle = document.getElementById('shadow-custom-toggle');
const shadowCustomPanel  = document.getElementById('shadow-custom');
shadowCustomToggle.addEventListener('click', () => {
  const open = shadowCustomPanel.hidden;
  shadowCustomPanel.hidden = !open;
  shadowCustomToggle.setAttribute('aria-expanded', String(open));
  shadowCustomToggle.lastChild.textContent = open ? ' Hide custom settings' : ' Customize shadow…';
});

// ─── Top-bar actions: undo / redo / theme toggle ──────────────────────────────
document.getElementById('tb-undo').addEventListener('click', () => undo());
document.getElementById('tb-redo').addEventListener('click', () => redo());
document.getElementById('tb-theme-btn').addEventListener('click', () => {
  // Flip the resolved theme; routes through the same View ▸ Theme action the
  // menu uses so the preference persists and every window follows.
  const next = document.documentElement.className === 'dark' ? 'light' : 'dark';
  window.electronAPI.menuAction('view.theme.' + next);
});
// Background/sidebar toggle (toolbar icon button) — routes through the same
// persisted View ▸ Screenshot Background action as the menu checkbox; the
// button's own on/off look is reflected by applyBackgroundState().
document.getElementById('tb-bg-toggle').addEventListener('click', () => {
  window.electronAPI.menuAction('view.background');
});

// Balance (auto-composition) toggle — a persisted user preference like the
// crop fill; the per-image analysis itself lives in getBalanceRect().
const balanceToggle = document.getElementById('balance-toggle');
balanceToggle.checked = balanceEnabled;
balanceToggle.addEventListener('change', () => {
  balanceEnabled = balanceToggle.checked;
  try { localStorage.setItem('lumshot-balance', balanceEnabled ? '1' : '0'); } catch { /* private mode, etc. */ }
  render();
});

// ─── Master "Background" toggle (View ▸ Screenshot Background) ────────────────
// Off  → suppress the background/beautify treatment (raw screenshot) and hide the
//        right-hand controls sidebar, since every control there acts on the
//        background. On → restore the previous treatment.
// Lives in the View menu as a persisted checkbox (like Always on Top), so the
// state arrives with the settings on startup and via the settings broadcast.
function applyBackgroundState(on) {
  on = on !== false; // default ON when the setting has never been written
  const btn = document.getElementById('tb-bg-toggle');
  if (btn) {
    btn.classList.toggle('active', on);
    btn.title = on ? 'Hide background & sidebar' : 'Show background & sidebar';
  }
  if (on === backgroundEnabled) return;
  backgroundEnabled = on;
  document.body.classList.toggle('bg-off', !on);
  positionToolbar(); // sidebar shown/hidden → canvas width changed → re-center
  if (screenshotImg) render();
}

// ─── Aspect ratio / social crop ───────────────────────────────────────────────
const CROP_RATIOS = {
  'free':      null,
  '16:9':      16 / 9,
  '1:1':       1,
  '4:3':       4 / 3,
  'facebook':  1200 / 630,   // Facebook link/feed image (1.91:1)
  'instagram': 1080 / 1350,  // Instagram portrait feed post (4:5)
  'linkedin':  1200 / 627,   // LinkedIn shared image (1.91:1)
  'x':         1600 / 900,   // X (Twitter) timeline image post (16:9)
};

const cropButtons = document.querySelectorAll('.crop-btn');
cropButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    cropRatioKey = btn.dataset.ratio;
    cropRatio = CROP_RATIOS[cropRatioKey];
    cropButtons.forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
});

// Highlight the button matching the current selection. Tracked by KEY (not the
// numeric ratio) because several platforms share a ratio (X / 16:9 coincide;
// Reddit / 4:3 coincide) and value-matching would light up all of them.
function syncCropRatioButtons() {
  cropButtons.forEach(b => b.classList.toggle('active', b.dataset.ratio === cropRatioKey));
}

// ─── Capture button & shortcut display ───────────────────────────────────────
document.getElementById('tb-capture-btn').addEventListener('click', () => {
  // From OCR Mode, "New" starts another OCR capture (overlay opens with OCR
  // preselected); otherwise it's a normal capture (overlay defaults to Region).
  if (ocrModeActive) window.electronAPI.triggerCaptureOcr();
  else window.electronAPI.triggerCapture();
});

window.electronAPI.onShortcutInfo((shortcut) => {
  // The redesign dropped the separate #shortcut-hint line; guard it.
  const hintEl = document.getElementById('shortcut-hint');
  const placeholderH = document.getElementById('placeholder-hint');
  if (shortcut) {
    if (hintEl) hintEl.textContent = `or press ${shortcut}`;
    if (placeholderH) placeholderH.innerHTML = `Press <kbd>${shortcut}</kbd> or the + button`;
  } else {
    if (hintEl) hintEl.textContent = '(no global shortcut available)';
    if (placeholderH) placeholderH.textContent = 'Press the + button to start';
  }
});

// ─── Open Image (file picker) ─────────────────────────────────────────────────
document.getElementById('tb-open-btn').addEventListener('click', () => window.electronAPI.openImage());
// (The empty-state placeholder is now the launcher; its tiles carry the actions.)

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}
window.electronAPI.onShowToast(showToast);

// ─── Menu-triggered actions ───────────────────────────────────────────────────
window.electronAPI.onMenuSave(() => doSave());
window.electronAPI.onMenuSaveJpg(() => doSaveJpg());
window.electronAPI.onMenuCopy(() => doCopy());
window.electronAPI.onMenuDelete(() => { if (document.activeElement !== textInput) deleteSelected(); });

// The Edit menu registers Ctrl+C/V/X/A as accelerators that run annotation/OCR
// clipboard actions — and Electron consumes those keystrokes before a focused
// text field (the license key box, hotkey field, watermark text, the OCR note,
// etc.) can handle them natively. So when one of those fields is focused we do the
// edit on the field ourselves instead of the annotation action.
function editableFieldFocused() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'url', 'tel', 'email', 'password', 'number', ''].includes(t);
  }
  return false;
}

// Ctrl+V was swallowed by the accelerator, so read the clipboard (main-process
// read first — most reliable in a packaged build — then the web API) and insert
// the text at the focused field's caret.
async function pasteTextIntoFocusedField() {
  const el = document.activeElement;
  if (!el) return;
  let text = '';
  try { text = await window.electronAPI.readClipboardText(); } catch {}
  if (!text) { try { text = await navigator.clipboard.readText(); } catch {} }
  if (!text) return;
  el.focus();
  const start = el.selectionStart, end = el.selectionEnd;
  if (typeof start === 'number' && typeof end === 'number') {
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
  } else if (!document.execCommand || !document.execCommand('insertText', false, text)) {
    el.value += text;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// In OCR Mode the clipboard/select keys operate on extracted text, not
// annotations. The find box is the only editable field, so when it's focused we
// defer to the browser's native handling (and paste into it programmatically,
// since the Edit menu's Ctrl+V accelerator would otherwise swallow the key).
const inOcrSearch = () => document.activeElement === ocrSearchInput;
window.electronAPI.onMenuAnnCut(()       => { if (editableFieldFocused()) { try { document.execCommand('cut'); document.activeElement.dispatchEvent(new Event('input', { bubbles: true })); } catch {} return; } if (ocrModeActive) { copyOcrSelectionOrAll(); return; } cutAnnotation(); });
window.electronAPI.onMenuAnnCopy(()      => { if (editableFieldFocused()) { try { document.execCommand('copy'); } catch {} return; } if (ocrModeActive) { copyOcrSelectionOrAll(); return; } copyAnnotation(); });
window.electronAPI.onMenuAnnPaste(()     => { if (inOcrSearch()) { ocrPasteIntoSearch(); return; } if (editableFieldFocused()) { pasteTextIntoFocusedField(); return; } if (ocrModeActive) return; pasteAnnotation(); });
window.electronAPI.onMenuAnnSelectAll(() => { if (editableFieldFocused()) { const el = document.activeElement; if (el.select) el.select(); return; } if (ocrModeActive) { selectAllOcrText(); return; } selectAllAnnotations(); });

window.electronAPI.onMenuSaveAs(async () => {
  if (!screenshotImg) return;
  const pick = await window.electronAPI.pickSaveAsPath();
  if (!pick || pick.canceled || !pick.filePath) return;
  const ext = pick.filePath.split('.').pop().toLowerCase();
  const fmt = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'webp' ? 'webp' : 'png';
  const saved = await window.electronAPI.writeImageToPath(exportDataURL(fmt), pick.filePath);
  if (saved) showToast('Saved');
});

// Undo/Redo — guard skips if annotation text input is focused (let browser handle it)
window.electronAPI.onMenuUndo(() => { if (document.activeElement !== textInput) undo(); });
window.electronAPI.onMenuRedo(() => { if (document.activeElement !== textInput) redo(); });

window.electronAPI.onMenuTool((tool) => setActiveTool(tool));
window.electronAPI.onMenuClearAll(() => clearAll());
window.electronAPI.onMenuZoom((action) => handleZoom(action));

// ═══ Multi-tab document model ═══════════════════════════════════════════════════
// Each tab owns its own document state: the loaded image, the annotation array,
// the undo/redo stacks, the zoom level, and the crop state (frame + aspect
// ratio). Tool defaults, the background/beautify settings, the annotation
// clipboard and licensing all stay GLOBAL — they are user preferences, not
// per-document state. On every tab switch the live globals are saved back into
// the outgoing tab, then the incoming tab's state is copied into those same
// globals, so the rest of the editor keeps operating on the globals unchanged.
let tabs        = [];     // open tabs, in display order
let activeTabId = null;   // id of the tab currently shown on the canvas
let tabIdSeq    = 0;      // unique tab id source (this window)
let tabLabelSeq = 0;      // "Screenshot N" label counter (this window)

const tabBarEl = document.getElementById('tab-bar');

function newTabId() { return 't' + (++tabIdSeq); }

// Copy the live document globals into a tab object (called before leaving a tab).
function saveLiveStateToTab(tab) {
  if (!tab) return;
  tab.screenshotImg = screenshotImg;
  tab.annotations   = annotations;
  tab.history       = history;
  tab.redoStack     = redoStack;
  tab.zoomScale     = zoomScale;
  tab.selectedId    = selectedId;
  tab.activeTool    = activeTool;
  tab.cropRect      = cropRect;
  tab.cropRatio     = cropRatio;
  tab.cropRatioKey  = cropRatioKey;
  tab.idCounter     = idCounter;
  tab.nextCounter   = nextCounter;
  tab.ocrModeActive = ocrModeActive;
  tab.ocrData       = ocrData;
  tab.redactEnabledTypes = redactEnabledTypes;
}

// Load a tab's stored document state into the live globals and refresh the UI.
function loadTabIntoLive(tab) {
  if (!tab) return;

  // Abandon any transient interaction that belonged to the previous tab.
  draft = null; editing = null; editingId = null;
  mode = null; dragInfo = null; multiSelectAll = false; editTargetId = null;
  if (cpPopover && !cpPopover.hidden) closeColorPicker();
  textInput.style.display = 'none'; textInput.value = '';

  screenshotImg = tab.screenshotImg;
  annotations   = tab.annotations;
  history       = tab.history;
  redoStack     = tab.redoStack;
  zoomScale     = tab.zoomScale;
  selectedId    = tab.selectedId;
  idCounter     = tab.idCounter;
  nextCounter   = tab.nextCounter;
  cropRect      = tab.cropRect;
  cropRatio     = tab.cropRatio;
  cropRatioKey  = tab.cropRatioKey || 'free';
  ocrModeActive = tab.ocrModeActive || false;
  ocrData       = tab.ocrData || null;
  redactEnabledTypes = tab.redactEnabledTypes || new Set();
  refreshRedactUI(); // reflect this tab's live-redaction toggles + count

  // Toggle the empty / loaded chrome to match this tab.
  if (screenshotImg) {
    placeholder.style.display = 'none';
    canvas.style.display      = 'block';
    toolbarStack.classList.remove('no-image');
    document.body.classList.remove('no-image');
  } else {
    canvas.style.display      = 'none';
    placeholder.style.display = '';
    toolbarStack.classList.add('no-image');
    document.body.classList.add('no-image');
  }
  // The toolbar row just (re)appeared and/or the sidebar visibility changed —
  // re-center the palette on the now-laid-out canvas. Call it SYNCHRONOUSLY here
  // (the no-image class flip above is synchronous, so the bar is already laid
  // out): getBoundingClientRect forces a layout and reads correct widths this
  // same tick, so the palette's final margin is set BEFORE the browser's first
  // paint of the loaded editor — no post-paint shift. A follow-up rAF re-runs it
  // once after fonts/layout fully settle, as a belt-and-suspenders correction
  // (identical value in the common case, so no visible movement).
  positionToolbar();
  requestAnimationFrame(positionToolbar);

  // Restore the active tool directly (not via setActiveTool — that would
  // start/end crop mode and clobber this tab's preserved crop frame).
  activeTool = tab.activeTool || null;
  lastAdvPropsTool = activeTool; // this tab's own Advanced-Properties memory, not the previous tab's
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === activeTool);
  });
  const shapeBtnR = document.querySelector('.tool-btn[data-tool="shape"]');
  if (shapeBtnR) shapeBtnR.classList.toggle('active', isShapeGroupTool(activeTool));
  canvas.style.cursor = activeTool === 'text' ? 'text'
                      : activeTool === 'crop' ? 'move'
                      : (isDrawingTool(activeTool) || activeTool === 'counter') ? 'crosshair'
                      : 'grab'; // select mode: the image is draggable out to other apps

  // Reflect this tab's aspect-ratio choice into the crop buttons (by key).
  syncCropRatioButtons();

  updateTextOptsVisibility();
  updateExportButtons();
  notifyUndoRedoState();
  syncColorSwatches();
  render();
  // Re-establish the OCR text layer/chrome for the incoming tab (after render so
  // `view` is current). Defined in the OCR Mode section near the end of the file.
  if (typeof syncOcrModeForTab === 'function') syncOcrModeForTab();
}

// Build the tab-bar DOM from the current `tabs` / `activeTabId`.
function renderTabBar() {
  if (!tabBarEl) return;
  // The strip lives inline in the title bar and doubles as the document title,
  // so it shows from the first open image; hidden only in the empty state.
  document.body.classList.toggle('has-tabs', tabs.length > 0);
  tabBarEl.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.id = tab.id;
    el.title = tab.label;

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.label;

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.title = 'Close tab';
    close.innerHTML = '<svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5"/></svg>';
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });

    el.append(label, close);
    el.addEventListener('click', () => switchToTab(tab.id));
    el.addEventListener('mousedown', (e) => {       // middle-click closes a tab
      if (e.button === 1) { e.preventDefault(); closeTab(tab.id); }
    });
    tabBarEl.appendChild(el);
  }
}

// Create a new tab for `dataUrl`, make it active, and load the image into it.
// `autoOcr` opens the tab directly in OCR Mode once the image decodes.
function createTab(dataUrl, autoOcr = false) {
  const cur = tabs.find(t => t.id === activeTabId);
  if (cur) saveLiveStateToTab(cur); // preserve the outgoing tab's live edits

  const tab = {
    id:          newTabId(),
    label:       'Screenshot ' + (++tabLabelSeq),
    screenshotImg: null,
    annotations: [],
    history:     [],
    redoStack:   [],
    zoomScale:   null,
    selectedId:  null,
    activeTool:  null,
    cropRect:    null,
    cropRatio:   null,   // new captures start as Freeform
    cropRatioKey:'free',
    idCounter:   1,
    nextCounter: 1,      // counter badges restart at 1 per tab
  };
  tabs.push(tab);
  activeTabId = tab.id;

  // Reset the live (non-image) document state to this new tab's empties NOW, so
  // a rapid second capture that saves the live state can't copy the previous
  // tab's annotations into this one (scenario 11). The canvas keeps showing the
  // previous image until this tab's image finishes decoding, avoiding a flash.
  annotations = []; history = []; redoStack = [];
  selectedId = null; cropRect = null; cropRatio = null; cropRatioKey = 'free';
  idCounter = 1; nextCounter = 1; zoomScale = null;
  draft = null; editing = null; editingId = null;
  mode = null; dragInfo = null; multiSelectAll = false;
  ocrModeActive = false; ocrData = null;
  redactEnabledTypes = new Set(); refreshRedactUI(); // fresh capture: nothing redacted
  renderTabBar();

  const img = new Image();
  img.onload = () => {
    tab.screenshotImg = img;
    // Only swap the canvas in if this tab is still the active one (the user may
    // have switched away while the image was decoding).
    if (activeTabId === tab.id) {
      screenshotImg = img;
      loadTabIntoLive(tab);
      if (autoOcr) enterOcrMode(); // capture was taken in OCR Mode
    }
    renderTabBar();
  };
  img.src = dataUrl;
}

// Switch the canvas to an existing tab.
function switchToTab(id) {
  if (id === activeTabId) return;
  const cur = tabs.find(t => t.id === activeTabId);
  if (cur) saveLiveStateToTab(cur);
  const next = tabs.find(t => t.id === id);
  if (!next) return;
  activeTabId = id;
  loadTabIntoLive(next);
  renderTabBar();
}

// Close a tab (with a discard prompt if it has unsaved annotations). Closing the
// active tab moves focus to the next (or previous) tab; closing the last tab
// closes the editor window.
function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  const wasActive = (tab.id === activeTabId);

  // Dirty = the tab has annotations the user might not have exported.
  const anns = wasActive ? annotations : tab.annotations;
  if (anns && anns.length && !window.confirm('Discard changes to this tab?')) return;

  tabs.splice(idx, 1);

  if (!tabs.length) {
    // Last tab closed → close the editor window and reset the document so the
    // next capture starts a fresh window with one tab.
    activeTabId   = null;
    screenshotImg = null;
    annotations = []; history = []; redoStack = [];
    selectedId = null; cropRect = null;
    document.body.classList.add('no-image');
    renderTabBar();
    window.electronAPI.closeAllTabs();
    return;
  }

  if (wasActive) {
    const nextTab = tabs[idx] || tabs[idx - 1]; // next one, else the new last
    activeTabId = nextTab.id;
    loadTabIntoLive(nextTab);
  }
  renderTabBar();
}

// ─── Receive screenshot from main process ─────────────────────────────────────
// Each capture / open / clipboard / history load arrives here and opens a NEW
// tab in this (single) editor window rather than replacing the canvas.
window.electronAPI.onLoadScreenshot((payload) => {
  // Main sends { dataUrl, ocr }; tolerate a bare string for safety.
  const dataUrl = typeof payload === 'string' ? payload : payload.dataUrl;
  const ocr     = typeof payload === 'object' && !!payload.ocr;
  createTab(dataUrl, ocr);
});

// ─── Export ─────────────────────────────────────────────────────────────────────
// Render once without selection UI — render() draws the watermark itself, so the
// export is burned with exactly what the editor previews — grab the image, then
// restore the on-screen view (selection handles, crop frame, etc.).
function exportDataURL(fmt) {
  if (activeTool === 'crop') setActiveTool(null); // exporting dismisses the crop frame
  suppressUI = true;
  render();                            // clean composite (no UI handles), watermark included
  const data = fmt === 'jpg'   ? canvas.toDataURL('image/jpeg', 0.92)
             : fmt === 'webp'  ? canvas.toDataURL('image/webp',  0.92)
             :                   canvas.toDataURL('image/png');
  suppressUI = false;
  render();                            // restore the interactive on-screen view
  return data;
}

// Decide which watermark (if any) to apply to an export:
//   • Free tier            → fixed "Made with Lumshot", bottom-centre.
//   • Licensed, custom off → none.
//   • Licensed, custom on  → the user's text / position / opacity / size.
function computeWatermark() {
  const DEFAULT_TEXT = (window.LUMSHOT_CONFIG && window.LUMSHOT_CONFIG.WATERMARK_TEXT) || 'Made with Lumshot';

  if (!isLicensed) {
    return { text: DEFAULT_TEXT, position: 'bottom-center', opacity: 0.7, size: 'medium' };
  }

  const s = appSettings;
  if (s && s.customWatermarkEnabled && (s.watermarkText || '').trim()) {
    return {
      text:     s.watermarkText.trim(),
      position: s.watermarkPosition || 'bottom-center',
      opacity:  (typeof s.watermarkOpacity === 'number' ? s.watermarkOpacity : 70) / 100,
      size:     s.watermarkSize || 'medium',
    };
  }
  return null; // licensed + custom watermark off
}

// Draw a watermark (dark pill + white caption) at the chosen 9-point anchor.
// Called from render(), so it shows live in the editor AND is burned into every
// export — true WYSIWYG. Works in full-res logical coordinates: canvas.width is the
// (possibly downscaled) backing store, so dividing by previewScale recovers the
// logical size render() draws in, keeping the pill positioned/sized identically at
// any preview zoom and at export.
function drawWatermark(wm) {
  const cw = canvas.width / previewScale, ch = canvas.height / previewScale;
  // Same reference + floor as annotations (computeAnnScale) so the watermark
  // tracks the image in step with everything else. cw here is the padded card
  // width (the composite's logical width), which matches the (iw + padding·2)
  // the annotation scale is keyed to.
  const scale = computeAnnScale(cw);

  const SIZE_PX = { small: 10, medium: 13, large: 18 };
  const fontPx  = Math.round((SIZE_PX[wm.size] || 13) * scale);
  const padX    = fontPx * 0.85;
  const padY    = fontPx * 0.5;

  ctx.save();
  ctx.font = `500 ${fontPx}px 'Inter', -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tw    = ctx.measureText(wm.text).width;
  const pillW = tw + padX * 2;
  const pillH = fontPx + padY * 2;

  // Map "vert-horiz" (e.g. "bottom-center") to an anchor. When the pill sits on an
  // image edge it hugs that edge (no margin) and squares off the corners touching
  // it — a banner flush with the edge (Savvyshot-style) rather than a floating pill.
  const [vert, horiz] = (wm.position || 'bottom-center').split('-');
  const flushTop = vert === 'top', flushBottom = vert === 'bottom';
  const flushLeft = horiz === 'left', flushRight = horiz === 'right';

  // Edge-anchored → 0 margin on the touched edge; otherwise the usual inset.
  let pillX, pillY;
  if (flushLeft)       pillX = 0;
  else if (flushRight) pillX = cw - pillW;
  else                 pillX = (cw - pillW) / 2;
  if (flushTop)        pillY = 0;
  else if (flushBottom) pillY = ch - pillH;
  else                  pillY = (ch - pillH) / 2;

  // A corner is squared when either adjacent edge is flush; interior corners get a
  // modest radius. A fully-floating badge (no flush edge) stays a full pill.
  const anyFlush = flushTop || flushBottom || flushLeft || flushRight;
  const rRound   = anyFlush ? Math.min(Math.round(pillH * 0.34), pillW / 2) : pillH / 2;
  const corner   = (a, b) => (a || b) ? 0 : rRound;
  const radii = {
    tl: corner(flushTop, flushLeft),  tr: corner(flushTop, flushRight),
    bl: corner(flushBottom, flushLeft), br: corner(flushBottom, flushRight),
  };

  ctx.globalAlpha = wm.opacity;

  roundedRectPathCorners(pillX, pillY, pillW, pillH, radii);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(wm.text, pillX + pillW / 2, pillY + pillH / 2 + 0.5);

  ctx.restore();
}

// Redesign: #copy-label/#save-label no longer exist. Copy is an icon-only button
// (feedback via toast); Save's own button text ("Save") doubles as the label.
const copyLabel = document.getElementById('copy-label');            // null in redesign
const saveLabel = document.getElementById('save-label') || saveBtn; // tb-save-btn text

function doCopy() {
  if (!screenshotImg) return;
  // In OCR Mode, Copy / Ctrl+C copies the text selection (or all text), not the image.
  if (ocrModeActive) { copyOcrSelectionOrAll(); return; }
  window.electronAPI.copyToClipboard(exportDataURL());
  if (copyLabel) {
    const orig = copyLabel.textContent;
    copyLabel.textContent = 'Copied!';
    setTimeout(() => (copyLabel.textContent = orig), 1600);
  } else {
    showToast('Copied to clipboard');
  }
}

async function doSave() {
  if (!screenshotImg) return;
  const saved = await window.electronAPI.saveImage(exportDataURL());
  if (saved && saveLabel) {
    const orig = saveLabel.textContent;
    saveLabel.textContent = 'Saved!';
    setTimeout(() => (saveLabel.textContent = orig), 1600);
  }
}

copyBtn.addEventListener('click', doCopy);
saveBtn.addEventListener('click', doSave);

// Save split-menu: the ▾ arrow opens a PNG/JPG dropdown anchored under the button.
const saveArrow = document.getElementById('tb-save-arrow');
const saveMenu  = document.getElementById('tb-save-menu');
if (saveArrow && saveMenu) {
  saveArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!screenshotImg) return;
    const open = saveMenu.classList.toggle('open');
    if (open) {
      const r = saveArrow.getBoundingClientRect();
      saveMenu.style.left  = 'auto';
      saveMenu.style.right = `${Math.round(window.innerWidth - r.right)}px`;
      saveMenu.style.top   = `${Math.round(r.bottom + 4)}px`;
    }
  });
  saveMenu.querySelectorAll('button[data-fmt]').forEach((b) => {
    b.addEventListener('click', async () => {
      saveMenu.classList.remove('open');
      if (!screenshotImg) return;
      const saved = await window.electronAPI.saveImage(exportDataURL(b.dataset.fmt), b.dataset.fmt);
      if (saved && saveLabel) {
        const orig = saveLabel.textContent;
        saveLabel.textContent = 'Saved!';
        setTimeout(() => (saveLabel.textContent = orig), 1600);
      }
    });
  });
  document.addEventListener('click', (e) => {
    if (saveMenu.classList.contains('open') && !saveMenu.contains(e.target) && e.target !== saveArrow) {
      saveMenu.classList.remove('open');
    }
  });
}

// ─── Licensing & watermark ────────────────────────────────────────────────────
let isLicensed  = false; // free tier (exports watermarked) until a license is activated
let appSettings = {};    // latest settings (used for the custom watermark)

// Copy/Save are enabled whenever a screenshot is loaded (no export blocking).
function updateExportButtons() {
  const enabled = !!screenshotImg;
  copyBtn.disabled = !enabled;
  saveBtn.disabled = !enabled;
  // Redesign save split-button: reflect enabled state on the container + arrow.
  const split = document.getElementById('tb-save-split');
  const arrow = document.getElementById('tb-save-arrow');
  if (split) split.classList.toggle('disabled', !enabled);
  if (arrow) arrow.disabled = !enabled;
}

function applyLicenseState(status) {
  isLicensed = BETA_FREE_MODE || !!status.licensed;
  spApplyLicense(status); // reflect into the settings panel (License + Watermark tab)
  // Licensing decides which watermark computeWatermark() returns (free default vs.
  // the user's custom one vs. none), so refresh the live preview when it changes.
  if (screenshotImg) scheduleRender();
}

// React to a license activated from the settings window (stops the watermark)
window.electronAPI.onLicenseUpdated(applyLicenseState);

// ─── Settings integration ─────────────────────────────────────────────────────
let lastAppliedPreset = null; // remember which default preset we last applied

// Apply the default preset to the editor background. Called on startup and only
// when the preset setting actually changes — NOT on every settings update, so
// unrelated changes (hotkey, folder) don't reset the user's background.
function applyDefaultPreset(s) {
  const idx = (s.defaultPreset >= 0 && s.defaultPreset < PRESETS.length) ? s.defaultPreset : 0;
  const p = PRESETS[idx];
  if (!p) return;
  applyPreset(p);
  selectSwatch(presetButtons[idx] || null);
  lastAppliedPreset = idx;
  if (screenshotImg) render();
}

// Apply a resolved theme ('dark'|'light') by toggling the class on <html>.
function applyTheme(t) {
  document.documentElement.className = t;
  // Cache for the inline <head> script so the NEXT launch paints its very
  // first frame in the right theme (the IPC theme arrives too late for that).
  try { localStorage.setItem('lumshot-theme', t); } catch (e) { /* best-effort */ }
}

// On startup: load settings (default preset + watermark) and license status.
(async function init() {
  // Apply stored theme before first render to avoid a flash of wrong colours.
  applyTheme(await window.electronAPI.getInitialTheme());
  appSettings = await window.electronAPI.getSettings();
  applyDefaultPreset(appSettings);
  applyBackgroundState(appSettings.backgroundEnabled);
  spFillForm(appSettings); // populate the settings panel controls
  applyLicenseState(await window.electronAPI.getLicenseStatus());
})();

// Keep theme in sync when the user switches from the menu or OS changes.
window.electronAPI.onThemeApply(applyTheme);

// Keep settings in sync; re-apply the default preset only when it changed.
window.electronAPI.onSettingsUpdated((s) => {
  appSettings = s;
  if (s.defaultPreset !== lastAppliedPreset) applyDefaultPreset(s);
  applyBackgroundState(s.backgroundEnabled); // View ▸ Screenshot Background
  spFillForm(s); // keep the panel controls in sync
  // The custom watermark (enabled/text/position/opacity/size) lives in settings and
  // is drawn live by render(), so any settings change must refresh the preview.
  if (screenshotImg) scheduleRender();
});

// ═══ Settings page ══════════════════════════════════════════════════════════════
// Settings is a dedicated full page that replaces the editor view (see
// #settings-page in editor.html), with a left-nav of 7 tabs. Every control
// writes straight back to the main process (electron-store); changes
// broadcast back via onSettingsUpdated.

const spWmSection        = document.getElementById('sp-wm-section');   // licensed controls
const spWmLocked         = document.getElementById('sp-wm-locked');    // unlicensed notice

// General
const spFolderEl  = document.getElementById('sp-export-folder');
const spPresetEl  = document.getElementById('sp-default-preset');
const spHotkeyEl  = document.getElementById('sp-hotkey-input');
const spHotkeyNote= document.getElementById('sp-hotkey-note');
const spLaunchEl  = document.getElementById('sp-launch-startup');
const spCrosshairEl = document.getElementById('sp-capture-crosshair');
const spMagnifierEl = document.getElementById('sp-capture-magnifier');
const spAiEnabledEl  = document.getElementById('sp-ai-enabled');
const spAiHotkeyEl   = document.getElementById('sp-ai-hotkey-input');
const spAiHotkeyNote = document.getElementById('sp-ai-hotkey-note');
const spAiCustomEl   = document.getElementById('sp-ai-custom-apps');
const stgThemeSeg    = document.getElementById('stg-theme-seg');

// License (body is rendered dynamically — see renderLicenseTab)
const spLicenseBody = document.getElementById('sp-license-body');

// Watermark
const spWmEnabled = document.getElementById('sp-wm-enabled');
const spWmControls= document.getElementById('sp-wm-controls');
const spWmText    = document.getElementById('sp-wm-text');
const spWmGrid    = document.getElementById('sp-wm-grid');
const spWmOpacity = document.getElementById('sp-wm-opacity');
const spWmOpacVal = document.getElementById('sp-wm-opacity-val');
const spWmSize    = document.getElementById('sp-wm-size');

// Electron accelerator → human-readable label
function spDisplayAccel(accel) {
  return accel ? accel.replace('CommandOrControl', 'Ctrl') : '';
}

// Populate the preset dropdown once
PRESETS.forEach((p, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = p.name;
  spPresetEl.appendChild(opt);
});

// ─── Non-settings modals (OCR "Create Note") ────────────────────────────────
// Still uses the original centred-modal chrome; the settings-family modals
// above were retired in favour of the full-page #settings-page below, and
// Capture History moved into its own sidebar (#history-controls, see
// enterHistoryMode/exitHistoryMode) rather than a modal.
const spOcrNoteOverlay  = document.getElementById('ocr-note-overlay');
const spOverlays = [spOcrNoteOverlay];

function openModal(overlay) {
  spOverlays.forEach(o => o.classList.remove('open')); // only one at a time
  overlay.classList.add('open');
  document.body.classList.add('modal-open');
  closeColorPicker();
  if (saveMenu) saveMenu.classList.remove('open');
}
function closeModals() {
  spOverlays.forEach(o => o.classList.remove('open'));
  document.body.classList.remove('modal-open');
  stopListeningShortcut(); // cancel any in-progress hotkey capture
}

spOverlays.forEach((ov) => {
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModals(); });
});
document.querySelectorAll('.sp-close').forEach(btn => btn.addEventListener('click', closeModals));
document.addEventListener('keydown', (e) => {
  const open = spOverlays.some(o => o.classList.contains('open'));
  if (e.key === 'Escape' && open) {
    e.stopPropagation();
    closeModals();
  }
}, true);

// ─── Update-ready toast ──────────────────────────────────────────────────────
// Non-blocking — docked bottom-right, no scrim, canvas stays interactive.
// Main sends this once an update has finished downloading. The tray balloon
// remains as a fallback for when the editor window doesn't exist yet.
const updateToast = document.getElementById('update-toast');
let updateToastShowRaf = null;

function showUpdateToast({ current, latest }) {
  document.getElementById('update-toast-message').textContent =
    `${latest} is ready. You're on ${current}. Update for the latest features and fixes.`;
  updateToast.classList.add('visible');
  cancelAnimationFrame(updateToastShowRaf);
  // Force layout before adding .shown so the slide/fade transition runs
  // instead of the toast just appearing already in its end state.
  updateToast.offsetHeight;
  updateToastShowRaf = requestAnimationFrame(() => updateToast.classList.add('shown'));
}
function hideUpdateToast() {
  updateToast.classList.remove('shown');
  setTimeout(() => updateToast.classList.remove('visible'), 200); // matches CSS transition
}

window.electronAPI.onUpdateReady(showUpdateToast);
document.getElementById('update-toast-install').addEventListener('click', () => {
  window.electronAPI.installUpdate();
});
document.getElementById('update-toast-later').addEventListener('click', hideUpdateToast);
document.getElementById('update-toast-close').addEventListener('click', hideUpdateToast);

// ─── Settings page: tabs + About sub-views ──────────────────────────────────────
const STG_TABS = {
  general:   { title: 'General',           desc: 'Where your exports go and how LumShot behaves on your computer.' },
  capture:   { title: 'Capture',            desc: 'Tune the region-capture experience and its shortcut.' },
  ai:        { title: 'Capture to AI',      desc: 'Send a screenshot straight into the app you were using, ready to prompt.' },
  shortcuts: { title: 'Keyboard Shortcuts', desc: 'Customize the shortcuts used for tools and actions throughout the editor.' },
  license:   { title: 'License',            desc: 'Activate LumShot to unlock custom watermarks and remove branding.' },
  watermark: { title: 'Watermark',          desc: 'Add your own watermark to exported images.' },
  about:     { title: 'About',              desc: 'Version, updates, and the fine print.' },
};
let stgActiveTab = 'general';
let stgLegalView = null; // null | 'privacy' | 'licenses' (About sub-view)

const stgTitleEl = document.getElementById('stg-title');
const stgDescEl  = document.getElementById('stg-desc');
const stgNavItems = document.querySelectorAll('.stg-nav-item');
const stgSections = document.querySelectorAll('.stg-section');
const stgAboutHome     = document.getElementById('stg-about-home');
const stgAboutPrivacy  = document.getElementById('stg-about-privacy');
const stgAboutLicenses = document.getElementById('stg-about-licenses');

function renderSettingsView() {
  const meta = STG_TABS[stgActiveTab] || STG_TABS.general;
  stgTitleEl.textContent = meta.title;
  stgDescEl.textContent = meta.desc;
  stgNavItems.forEach(b => b.classList.toggle('active', b.dataset.tab === stgActiveTab));
  stgSections.forEach(s => s.classList.toggle('active', s.id === `stg-section-${stgActiveTab}`));

  if (stgActiveTab === 'about') {
    stgAboutHome.hidden     = !!stgLegalView;
    stgAboutPrivacy.hidden  = stgLegalView !== 'privacy';
    stgAboutLicenses.hidden = stgLegalView !== 'licenses';
  }
  if (stgActiveTab === 'shortcuts') buildShortcutsPanel();
}

// Sidebar nav click: switch tab, always reset the About sub-view.
function selectSettingsTab(tab) {
  stgActiveTab = STG_TABS[tab] ? tab : 'general';
  stgLegalView = null;
  renderSettingsView();
}
stgNavItems.forEach(btn => btn.addEventListener('click', () => selectSettingsTab(btn.dataset.tab)));

// About sub-view navigation (link rows + "‹ About" back buttons)
document.querySelectorAll('.stg-link-row').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'privacy')       { stgLegalView = 'privacy';  renderSettingsView(); }
    else if (action === 'licenses') { stgLegalView = 'licenses'; renderSettingsView(); }
    else if (action === 'help')     { window.electronAPI.openExternal('https://lumshot.app/support'); showToast('Opening help center…'); }
    else if (action === 'website')  { window.electronAPI.openExternal('https://lumshot.app'); showToast('Opening help center…'); }
  });
});
document.querySelectorAll('.stg-subback').forEach((btn) => {
  btn.addEventListener('click', () => { stgLegalView = null; renderSettingsView(); });
});

// Menu/tray entry point — also used for deep links (privacy/licenses land on About).
function openSettingsPanel(which) {
  document.body.classList.add('settings-open');
  closeColorPicker();
  if (saveMenu) saveMenu.classList.remove('open');
  if (which === 'privacy')        { stgActiveTab = 'about'; stgLegalView = 'privacy'; }
  else if (which === 'licenses')  { stgActiveTab = 'about'; stgLegalView = 'licenses'; }
  else if (which === 'about')     { stgActiveTab = 'about'; stgLegalView = null; }
  else if (STG_TABS[which])       { stgActiveTab = which; stgLegalView = null; }
  else                            { stgActiveTab = 'general'; stgLegalView = null; }
  renderSettingsView();
}

function closeSettingsPage() {
  document.body.classList.remove('settings-open');
  stopListeningShortcut(); // cancel any in-progress hotkey capture
}
document.getElementById('stg-back').addEventListener('click', closeSettingsPage);

// Buy from the watermark "locked" notice
document.getElementById('sp-wm-buy-btn').addEventListener('click', () => {
  window.electronAPI.openBuyUrl();
  showToast('Opening lumshot.app…');
});

// Check for updates (About tab)
document.getElementById('stg-check-updates-btn').addEventListener('click', async () => {
  try { await window.electronAPI.checkForUpdates(); } catch {}
  showToast("You're on the latest version");
});

// App version → About identity block + sidebar footer (fetched once; it never
// changes at runtime).
(async function loadAppVersion() {
  try {
    const info = await window.electronAPI.getAppInfo();
    document.getElementById('stg-about-version').textContent = 'Version ' + info.version;
    document.getElementById('stg-footer-version').textContent = 'LumShot v' + info.version;
  } catch {}
})();

// Open from the Settings menu / tray
window.electronAPI.onOpenSettings(openSettingsPanel);

// ═══ Keyboard Shortcuts panel + editable bindings ═══════════════════════════════
const SHORTCUT_DEFS = [
  { group: 'Capture', id: 'newScreenshot',     label: 'New Screenshot',      def: 'Ctrl+Shift+S', kind: 'global' },
  { group: 'Capture', id: 'aiSnapshot',        label: 'AI Snapshot',         def: 'Ctrl+Shift+A', kind: 'global' },
  { group: 'Capture', id: 'regionCapture',     label: 'Region Capture',      def: 'In overlay',   kind: 'readonly' },
  { group: 'Capture', id: 'windowCapture',     label: 'Window Capture',      def: 'In overlay',   kind: 'readonly' },
  { group: 'Capture', id: 'fullscreenCapture', label: 'Full Screen Capture', def: 'In overlay',   kind: 'readonly' },
  { group: 'Capture', id: 'scrollCapture',     label: 'Scroll Capture',      def: 'In overlay',   kind: 'readonly' },

  { group: 'Editor', id: 'copy',          label: 'Copy to Clipboard',  def: 'Ctrl+C',       kind: 'action' },
  { group: 'Editor', id: 'savePng',       label: 'Save as PNG',        def: 'Ctrl+S',       kind: 'action' },
  { group: 'Editor', id: 'saveJpg',       label: 'Save as JPG',        def: 'Ctrl+Shift+J', kind: 'action' },
  { group: 'Editor', id: 'undo',          label: 'Undo',               def: 'Ctrl+Z',       kind: 'action' },
  { group: 'Editor', id: 'openImage',     label: 'Open Image',         def: 'Ctrl+O',       kind: 'action' },
  { group: 'Editor', id: 'openClipboard', label: 'Open from Clipboard',def: 'Ctrl+V',       kind: 'action' },
  { group: 'Editor', id: 'ocrMode',       label: 'Toggle OCR Mode',    def: 'Ctrl+Shift+O', kind: 'action' },
  { group: 'Editor', id: 'zoomIn',        label: 'Zoom In',            def: 'Ctrl+=',       kind: 'action' },
  { group: 'Editor', id: 'zoomOut',       label: 'Zoom Out',           def: 'Ctrl+-',       kind: 'action' },

  { group: 'Annotations', id: 'arrow',     label: 'Arrow',       def: 'A', kind: 'tool', tool: 'arrow' },
  { group: 'Annotations', id: 'text',      label: 'Text',        def: 'T', kind: 'tool', tool: 'text' },
  { group: 'Annotations', id: 'blur',      label: 'Blur',        def: 'B', kind: 'tool', tool: 'blur' },
  { group: 'Annotations', id: 'highlight', label: 'Highlight',   def: 'H', kind: 'tool', tool: 'highlight' },
  { group: 'Annotations', id: 'rect',      label: 'Rectangle',   def: 'R', kind: 'tool', tool: 'rect' },
  { group: 'Annotations', id: 'circle',    label: 'Circle',      def: 'C', kind: 'tool', tool: 'ellipse' },
  { group: 'Annotations', id: 'line',      label: 'Line',        def: 'L', kind: 'tool', tool: 'line' },
  { group: 'Annotations', id: 'draw',      label: 'Free Draw',   def: 'D', kind: 'tool', tool: 'draw' },
  { group: 'Annotations', id: 'counter',   label: 'Counter',     def: 'N', kind: 'tool', tool: 'counter' },
  { group: 'Annotations', id: 'crop',      label: 'Crop',        def: 'X', kind: 'tool', tool: 'crop' },
  { group: 'Annotations', id: 'select',    label: 'Select',      def: 'V', kind: 'tool', tool: 'select' },
  { group: 'Annotations', id: 'clearAll',  label: 'Clear All',   def: 'Ctrl+Delete', kind: 'action' },

  { group: 'App', id: 'openShortcuts', label: 'Open Shortcuts Panel', def: 'Ctrl+/', kind: 'action' },
  { group: 'App', id: 'openSettings',  label: 'Open Settings',        def: 'Ctrl+,', kind: 'action' },
  { group: 'App', id: 'minimizeTray',  label: 'Minimize to Tray',     def: 'Ctrl+W', kind: 'action' },
];
const SC_GROUPS = ['Capture', 'Editor', 'Annotations', 'App'];

let scOverrides = {}; // { id: combo } persisted custom bindings (excludes the global hotkey)
window.electronAPI.getShortcuts().then(m => { scOverrides = m || {}; }).catch(() => {});

function defOf(id) { const d = SHORTCUT_DEFS.find(x => x.id === id); return d ? d.def : ''; }
function globalHotkeyDisplay() { return (appSettings && appSettings.hotkey ? spDisplayAccel(appSettings.hotkey) : '') || 'Ctrl+Shift+S'; }
function aiHotkeyDisplay() {
  const hotkey = appSettings && appSettings.captureToAI && appSettings.captureToAI.hotkey;
  return (hotkey ? spDisplayAccel(hotkey) : '') || 'Ctrl+Shift+A';
}
function bindingFor(id) {
  if (id === 'newScreenshot') return globalHotkeyDisplay();
  if (id === 'aiSnapshot')    return aiHotkeyDisplay();
  return scOverrides[id] || defOf(id);
}

// keydown event → a normalized combo string ('Ctrl+Shift+J', 'A', 'Ctrl+/', …)
function eventToCombo(e) {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'Dead', 'AltGraph'].includes(k)) return null;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  // "+" arrives as Shift+"=" on a US layout (or bare "+" from the numpad, with
  // no Shift at all) — both mean "the plus key" for Zoom In, so fold either
  // one down to the same "=" the shortcut is registered against and drop the
  // incidental Shift instead of adding a separate "Ctrl+Shift+=" binding.
  const isPlusKey = k === '+' || (k === '=' && e.shiftKey);
  if (e.shiftKey && !isPlusKey) parts.push('Shift');
  if (e.altKey)   parts.push('Alt');
  let main;
  if (k === ' ')            main = 'Space';
  else if (k === 'Delete')  main = 'Delete';
  else if (k === 'Backspace') main = 'Backspace';
  else if (k === 'Enter')   main = 'Enter';
  else if (k === 'Tab')     main = 'Tab';
  else if (isPlusKey)       main = '=';
  else if (k.length === 1)  main = k.toUpperCase();
  else                      main = k; // ArrowUp, F1, …
  parts.push(main);
  return parts.join('+');
}

async function doSaveJpg() {
  if (!screenshotImg) return;
  const saved = await window.electronAPI.saveImage(exportDataURL('jpg'), 'jpg');
  if (saved && saveLabel) {
    const orig = saveLabel.textContent;
    saveLabel.textContent = 'Saved!';
    setTimeout(() => (saveLabel.textContent = orig), 1600);
  }
}

function runShortcut(def) {
  switch (def.id) {
    case 'copy':          doCopy(); break;
    case 'savePng':       doSave(); break;
    case 'saveJpg':       doSaveJpg(); break;
    case 'undo':          undo(); break;
    case 'openImage':     window.electronAPI.openImage(); break;
    case 'openClipboard': if (window.electronAPI.openFromClipboard) window.electronAPI.openFromClipboard(); break;
    case 'ocrMode':       toggleOcrMode(); break;
    case 'zoomIn':        handleZoom('in'); break;
    case 'zoomOut':       handleZoom('out'); break;
    case 'clearAll':      clearAll(); break;
    case 'openShortcuts': openSettingsPanel('shortcuts'); break;
    case 'openSettings':  openSettingsPanel('general'); break;
    case 'minimizeTray':  window.electronAPI.closeWindow(); break;
    default:              if (def.kind === 'tool') setActiveTool(def.tool);
  }
}

// ── Panel rendering ──
const scBody = document.getElementById('sp-shortcuts-body');
let scListenDef = null, scListenPill = null;

function buildShortcutsPanel() {
  scBody.innerHTML = '';
  for (const group of SC_GROUPS) {
    const defs = SHORTCUT_DEFS.filter(d => d.group === group);
    if (!defs.length) continue;
    const sec = document.createElement('div');
    sec.className = 'sc-group';
    const title = document.createElement('div');
    title.className = 'sc-group-title';
    title.textContent = group;
    sec.appendChild(title);
    for (const def of defs) sec.appendChild(buildShortcutRow(def));
    scBody.appendChild(sec);
  }
}

function buildShortcutRow(def) {
  const row = document.createElement('div');
  row.className = 'sc-row';
  row.dataset.id = def.id;

  const label = document.createElement('span');
  label.className = 'sc-label';
  label.textContent = def.label;

  const pill = document.createElement('button');
  pill.className = 'sc-pill';
  pill.textContent = bindingFor(def.id);
  if (def.kind === 'readonly') pill.classList.add('readonly');
  if (def.kind === 'global')   pill.classList.add('global');

  const reset = document.createElement('button');
  reset.className = 'sc-reset';
  reset.title = 'Reset to default';
  reset.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M2.1 11a6.25 6.25 0 1 0 1.09-7l1.09 1.03A4.75 4.75 0 1 1 3.45 9.4z"/><path d="M2.79 2.18l-.15 2.83a.75.75 0 0 0 .71.79l2.83.15a.75.75 0 0 0 .08-1.5l-2.08-.11.11-2.08a.75.75 0 0 0-1.5-.08z"/></svg>';

  if (def.kind === 'readonly') {
    reset.classList.add('hidden');
  } else {
    pill.addEventListener('click', () => startListeningShortcut(def, pill));
    reset.addEventListener('click', (e) => { e.stopPropagation(); resetShortcut(def); });
    // Hide reset when already at default (nothing to reset)
    const isDefault = def.id === 'newScreenshot' ? bindingFor('newScreenshot') === 'Ctrl+Shift+S'
      : def.id === 'aiSnapshot' ? bindingFor('aiSnapshot') === 'Ctrl+Shift+A'
      : !scOverrides[def.id];
    if (isDefault) reset.classList.add('hidden');
  }

  const pillWrap = document.createElement('div');
  pillWrap.className = 'sc-pill-wrap';
  pillWrap.append(pill, reset);
  row.append(label, pillWrap);
  return row;
}

function startListeningShortcut(def, pill) {
  stopListeningShortcut();
  scListenDef = def; scListenPill = pill;
  pill.classList.add('listening');
  pill.textContent = 'Press keys…';
  clearScWarning();
  document.addEventListener('keydown', scCaptureKey, true);
}

function stopListeningShortcut() {
  if (!scListenDef) return;
  document.removeEventListener('keydown', scCaptureKey, true);
  if (scListenPill) { scListenPill.classList.remove('listening'); scListenPill.textContent = bindingFor(scListenDef.id); }
  scListenDef = null; scListenPill = null;
}

function scCaptureKey(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { stopListeningShortcut(); return; }
  const combo = eventToCombo(e);
  if (!combo) return; // modifier alone — keep waiting
  const conflict = SHORTCUT_DEFS.find(d => d.id !== scListenDef.id && d.kind !== 'readonly' && bindingFor(d.id) === combo);
  if (conflict) { showScWarning(scListenPill, `Already used by ${conflict.label}`); stopListeningShortcut(); return; }
  setShortcut(scListenDef, combo);
}

async function setShortcut(def, combo) {
  if (def.id === 'newScreenshot' || def.id === 'aiSnapshot') {
    const accel = combo.replace('Ctrl', 'CommandOrControl');
    try {
      const res = def.id === 'newScreenshot'
        ? await window.electronAPI.setHotkey(accel)
        : await window.electronAPI.setAiHotkey(accel);
      if (res && res.settings) appSettings = res.settings;
      if (res && res.ok === false) showScWarning(scListenPill, 'That combination is unavailable');
    } catch {}
  } else {
    if (combo === def.def) delete scOverrides[def.id];
    else scOverrides[def.id] = combo;
    window.electronAPI.setShortcuts(scOverrides);
  }
  stopListeningShortcut();
  buildShortcutsPanel();
}

function resetShortcut(def) {
  if (def.id === 'newScreenshot') {
    window.electronAPI.setHotkey('CommandOrControl+Shift+S').then(res => {
      if (res && res.settings) appSettings = res.settings;
      buildShortcutsPanel();
    });
    return;
  }
  if (def.id === 'aiSnapshot') {
    window.electronAPI.setAiHotkey('CommandOrControl+Shift+A').then(res => {
      if (res && res.settings) appSettings = res.settings;
      buildShortcutsPanel();
    });
    return;
  }
  delete scOverrides[def.id];
  window.electronAPI.setShortcuts(scOverrides);
  buildShortcutsPanel();
}

function resetAllShortcuts() {
  scOverrides = {};
  window.electronAPI.setShortcuts(scOverrides);
  window.electronAPI.setHotkey('CommandOrControl+Shift+S').then(res => {
    if (res && res.settings) appSettings = res.settings;
  }).catch(() => {}).then(() =>
    window.electronAPI.setAiHotkey('CommandOrControl+Shift+A').then(res => {
      if (res && res.settings) appSettings = res.settings;
      buildShortcutsPanel();
    }).catch(() => buildShortcutsPanel())
  );
}

function showScWarning(pill, msg) {
  clearScWarning();
  const row = pill && pill.closest('.sc-row');
  if (!row) return;
  const w = document.createElement('div');
  w.className = 'sc-warning';
  w.textContent = msg;
  row.after(w);
  setTimeout(() => { if (w.parentNode) w.remove(); }, 3500);
}
function clearScWarning() { document.querySelectorAll('.sc-warning').forEach(w => w.remove()); }

document.getElementById('sp-reset-shortcuts').addEventListener('click', resetAllShortcuts);

// ─── Populate controls from a settings object ──────────────────────────────────
function spSetThemeSeg(theme) {
  stgThemeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}
stgThemeSeg.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    spSetThemeSeg(b.dataset.theme);
    window.electronAPI.setSetting('theme', b.dataset.theme);
  });
});

function spFillForm(s) {
  if (!s) return;
  spFolderEl.textContent = s.exportFolder || '';
  spFolderEl.title = s.exportFolder || '';
  spPresetEl.value = s.defaultPreset;
  if (!spHotkeyEl.classList.contains('recording')) spHotkeyEl.textContent = spDisplayAccel(s.hotkey);
  spLaunchEl.checked = !!s.launchAtStartup;
  spCrosshairEl.checked = s.captureCrosshair !== false;
  spMagnifierEl.checked = !!s.captureMagnifier;
  spSetThemeSeg(s.theme || 'system');
  const ai = s.captureToAI || {};
  spAiEnabledEl.checked = ai.enabled !== false;
  if (document.activeElement !== spAiCustomEl) {
    spAiCustomEl.value = (ai.customApps || []).join(', ');
  }
  if (!spAiHotkeyEl.classList.contains('recording')) {
    spAiHotkeyEl.textContent = spDisplayAccel(ai.hotkey || 'CommandOrControl+Shift+A');
  }
  // Surface a registration conflict (e.g. another app owned the key at startup).
  window.electronAPI.getAiHotkeyStatus()
    .then((st) => spAiUpdateNote(!st.unavailable))
    .catch(() => {});
  spFillWatermark(s);
  sbFillWatermark(s); // keep the sidebar watermark section in sync with the modal
}

function spFillWatermark(s) {
  spWmEnabled.checked = !!s.customWatermarkEnabled;
  if (document.activeElement !== spWmText) spWmText.value = s.watermarkText || '';
  spSetWmPos(s.watermarkPosition || 'bottom-center');
  const op = (typeof s.watermarkOpacity === 'number') ? s.watermarkOpacity : 70;
  spWmOpacity.value = op;
  spWmOpacVal.textContent = op + '%';
  updateSliderFill(spWmOpacity);
  spSetWmSize(s.watermarkSize || 'medium');
  spWmControls.style.display = spWmEnabled.checked ? 'block' : 'none';
}

function spSetWmPos(pos) {
  spWmGrid.querySelectorAll('.sp-wm-cell').forEach(c => c.classList.toggle('active', c.dataset.pos === pos));
}
function spSetWmSize(size) {
  spWmSize.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.size === size));
}

// ─── License state ─────────────────────────────────────────────────────────────
function spApplyLicense(status) {
  isLicensed = BETA_FREE_MODE || !!(status && status.licensed);
  // Watermark tab: show the controls when licensed, the locked notice otherwise
  spWmSection.hidden = !isLicensed;
  spWmLocked.hidden  = isLicensed;
  // Re-render the License tab body for the current state
  renderLicenseTab(status || { licensed: false });
  // Sidebar watermark section: lock/unlock for the current tier
  sbApplyWmLicense();
}

function spEscape(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Build the License tab contents for the licensed / free state and wire buttons.
function renderLicenseTab(status) {
  if (!spLicenseBody) return;

  // Beta release: pricing UI is hidden entirely and every feature is unlocked
  // for free. The license system underneath (license.js, this function's
  // licensed/unlicensed branches) is untouched — flip BETA_FREE_MODE off to
  // restore it.
  if (BETA_FREE_MODE) {
    spLicenseBody.innerHTML = `
      <div class="stg-card">
        <div class="stg-success-top">
          <div class="stg-success-badge">✓</div>
          <div style="flex:1;min-width:0;">
            <div class="stg-success-title">LumShot is free during the beta</div>
            <div class="stg-success-body">All features, including custom watermarks and export branding removal, are unlocked at no cost while LumShot is in beta. No license needed.</div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (status.licensed) {
    spLicenseBody.innerHTML = `
      <div class="stg-card">
        <div class="stg-success-top">
          <div class="stg-success-badge">✓</div>
          <div style="flex:1;min-width:0;">
            <div class="stg-success-title">LumShot is activated</div>
            <div class="stg-success-body">Custom watermarks are unlocked and export branding is removed. Thank you for supporting LumShot.</div>
          </div>
        </div>
        <div class="stg-divider"></div>
        <div class="stg-license-key-row">
          <div>
            <div class="stg-license-key-label">License key</div>
            <div class="stg-license-key-value">${spEscape(status.maskedKey || '—')}</div>
          </div>
          <button class="stg-deactivate-btn" id="stg-deactivate-btn">Deactivate</button>
        </div>
      </div>
    `;

    const btn = spLicenseBody.querySelector('#stg-deactivate-btn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Deactivating…';
      const res = await window.electronAPI.deactivateLicense();
      if (res.ok) {
        spApplyLicense(res.status); // switch UI back to free tier
        showToast('License deactivated');
      } else {
        btn.disabled = false;
        btn.textContent = 'Deactivate';
      }
    });
    return;
  }

  // ── Free / unlicensed (Inactive state) ──
  spLicenseBody.innerHTML = `
    <div class="stg-card">
      <div class="stg-lic-top">
        <div class="stg-lic-eyebrow">You're on LumShot Free</div>
        <div class="stg-lic-heading">Activate a one-time license</div>
        <div class="stg-feature-list">
          <div class="stg-feature-row"><span class="stg-feature-check">✓</span><span class="stg-feature-label">Add your own custom watermark</span></div>
          <div class="stg-feature-row"><span class="stg-feature-check">✓</span><span class="stg-feature-label">Remove the "Made with LumShot" badge</span></div>
          <div class="stg-feature-row"><span class="stg-feature-check">✓</span><span class="stg-feature-label">Every future update, free forever</span></div>
          <div class="stg-feature-row"><span class="stg-feature-check">✓</span><span class="stg-feature-label">Works fully offline after activation</span></div>
        </div>
        <div class="stg-activation-row">
          <input id="stg-license-input" type="text" class="stg-input mono" style="flex:1;min-width:0;height:42px;letter-spacing:.04em;"
                 placeholder="LUMS-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">
          <button class="stg-btn-outline" id="stg-activate-btn" style="height:42px;font-size:13px;font-weight:550;">Activate</button>
        </div>
        <div class="stg-license-error" id="stg-license-error"></div>
      </div>
      <div class="stg-divider"></div>
      <div class="stg-purchase-row">
        <div>
          <div class="stg-purchase-title">Don't have a license?</div>
          <div class="stg-purchase-sub">One payment, no subscription.</div>
        </div>
        <button class="stg-btn-accent" id="stg-buy-btn">Get LumShot — $19</button>
      </div>
    </div>
  `;

  const input = spLicenseBody.querySelector('#stg-license-input');
  const errEl = spLicenseBody.querySelector('#stg-license-error');

  input.addEventListener('input', () => { errEl.style.display = 'none'; });

  spLicenseBody.querySelector('#stg-activate-btn').addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) { showToast('Enter a license key first'); return; }
    const res = await window.electronAPI.activateLicense(key);
    if (res.ok) {
      spApplyLicense(res.status); // re-renders into the activated view
      showToast('License activated — thank you!');
    } else {
      errEl.textContent = res.error || 'Invalid license key. Please check and try again.';
      errEl.style.display = 'block';
    }
  });

  spLicenseBody.querySelector('#stg-buy-btn').addEventListener('click', () => {
    window.electronAPI.openBuyUrl();
    showToast('Opening lumshot.app…');
  });
}

// ─── General: export folder ────────────────────────────────────────────────────
document.getElementById('sp-change-folder').addEventListener('click', async () => {
  const s = await window.electronAPI.pickExportFolder();
  spFillForm(s);
});

// ─── General: default preset ───────────────────────────────────────────────────
spPresetEl.addEventListener('change', () => {
  window.electronAPI.setSetting('defaultPreset', +spPresetEl.value);
});

// ─── General: launch at startup ────────────────────────────────────────────────
spLaunchEl.addEventListener('change', () => {
  window.electronAPI.setSetting('launchAtStartup', spLaunchEl.checked);
});

// ─── General: region-capture precision aids (crosshair / magnifier) ────────────
spCrosshairEl.addEventListener('change', () => {
  window.electronAPI.setSetting('captureCrosshair', spCrosshairEl.checked);
});
spMagnifierEl.addEventListener('change', () => {
  window.electronAPI.setSetting('captureMagnifier', spMagnifierEl.checked);
});

// ─── General: Capture to AI ─────────────────────────────────────────────────────
// captureToAI is stored as one nested object, so each toggle writes the whole
// object back with just its field changed (main re-registers the hotkey on set).
function spAiSettings() {
  return (appSettings && appSettings.captureToAI)
    || { enabled: true, hotkey: 'CommandOrControl+Shift+A' };
}
spAiEnabledEl.addEventListener('change', () => {
  window.electronAPI.setSetting('captureToAI', { ...spAiSettings(), enabled: spAiEnabledEl.checked });
});
// Committed on change (Enter / focus leave), like the watermark text field.
spAiCustomEl.addEventListener('change', () => {
  const customApps = spAiCustomEl.value.split(',').map((x) => x.trim()).filter(Boolean);
  window.electronAPI.setSetting('captureToAI', { ...spAiSettings(), customApps });
});

// (License activate / deactivate / buy are wired inside renderLicenseTab.)

// ─── Watermark controls ────────────────────────────────────────────────────────
spWmEnabled.addEventListener('change', () => {
  spWmControls.style.display = spWmEnabled.checked ? 'block' : 'none';
  window.electronAPI.setSetting('customWatermarkEnabled', spWmEnabled.checked);
});

spWmText.addEventListener('change', () => window.electronAPI.setSetting('watermarkText', spWmText.value));

spWmGrid.querySelectorAll('.sp-wm-cell').forEach(cell => {
  cell.addEventListener('click', () => {
    spSetWmPos(cell.dataset.pos);
    window.electronAPI.setSetting('watermarkPosition', cell.dataset.pos);
  });
});

spWmOpacity.addEventListener('input', () => {
  spWmOpacVal.textContent = spWmOpacity.value + '%';
  updateSliderFill(spWmOpacity);
});
spWmOpacity.addEventListener('change', () => window.electronAPI.setSetting('watermarkOpacity', +spWmOpacity.value));

spWmSize.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    spSetWmSize(b.dataset.size);
    window.electronAPI.setSetting('watermarkSize', b.dataset.size);
  });
});

// ─── Sidebar watermark section ──────────────────────────────────────────────────
// Mirrors the Edit ▸ Watermark modal's enable/text/position controls, surfaced in
// the right sidebar for discoverability. Writes the same settings (which broadcast
// back via onSettingsUpdated → spFillForm), so the modal and sidebar stay in sync.
// Free tier: the watermark is fixed and the controls are locked behind a buy path.
const sbWmSection  = document.getElementById('sb-wm-section');
const sbWmEnabled  = document.getElementById('sb-wm-enabled');
const sbWmControls = document.getElementById('sb-wm-controls');
const sbWmText     = document.getElementById('sb-wm-text');
const sbWmGrid     = document.getElementById('sb-wm-grid');
const sbWmPos      = document.getElementById('sb-wm-pos');
const sbWmPremium  = document.getElementById('sb-wm-premium');
const sbWmBuy      = document.getElementById('sb-wm-buy');
const SB_WM_DEFAULT_TEXT =
  (window.LUMSHOT_CONFIG && window.LUMSHOT_CONFIG.WATERMARK_TEXT) || 'Made with Lumshot';

// Free-tier upsell card: clicking the locked toggle / text box flips it open or
// shut, so a second click on either dismisses it.
function sbWmTogglePremium() { sbWmPremium.hidden = !sbWmPremium.hidden; }

function sbSetWmPos(pos) {
  sbWmGrid.querySelectorAll('.sp-wm-cell').forEach(c =>
    c.classList.toggle('active', c.dataset.pos === pos));
}

// Lock/unlock the section for the current license tier.
function sbApplyWmLicense() {
  sbWmSection.classList.toggle('locked', !isLicensed);
  if (!isLicensed) {
    // Free tier: watermark always on, fixed text, no position choice.
    sbWmEnabled.checked = true;
    sbWmText.readOnly = true;
    sbWmText.value = SB_WM_DEFAULT_TEXT;
    sbWmControls.style.display = 'block';
    sbWmPos.style.display = 'none';
  } else {
    sbWmText.readOnly = false;
    sbWmPos.style.display = 'block';
    sbWmPremium.hidden = true;
    sbFillWatermark(appSettings); // populate from stored settings
  }
}

// Reflect stored watermark settings into the sidebar controls (licensed only;
// the free-tier locked state is owned by sbApplyWmLicense).
function sbFillWatermark(s) {
  if (!isLicensed) return;
  s = s || {};
  sbWmEnabled.checked = !!s.customWatermarkEnabled;
  if (document.activeElement !== sbWmText) sbWmText.value = s.watermarkText || '';
  sbSetWmPos(s.watermarkPosition || 'bottom-center');
  sbWmControls.style.display = sbWmEnabled.checked ? 'block' : 'none';
}

// Toggle: free → upsell (no state change); licensed → enable/disable watermark.
sbWmEnabled.addEventListener('click', (e) => {
  if (!isLicensed) { e.preventDefault(); sbWmTogglePremium(); }
});
sbWmEnabled.addEventListener('change', () => {
  if (!isLicensed) return;
  sbWmControls.style.display = sbWmEnabled.checked ? 'block' : 'none';
  window.electronAPI.setSetting('customWatermarkEnabled', sbWmEnabled.checked);
});

// Text: free → locked (upsell on interaction); licensed → editable + persisted.
sbWmText.addEventListener('mousedown', (e) => {
  if (!isLicensed) { e.preventDefault(); sbWmTogglePremium(); }
});
sbWmText.addEventListener('change', () => {
  if (!isLicensed) return;
  window.electronAPI.setSetting('watermarkText', sbWmText.value);
});

// Position grid: free → upsell; licensed → set + persist the anchor.
sbWmGrid.querySelectorAll('.sp-wm-cell').forEach(cell => {
  cell.addEventListener('click', () => {
    if (!isLicensed) { sbWmTogglePremium(); return; }
    sbSetWmPos(cell.dataset.pos);
    window.electronAPI.setSetting('watermarkPosition', cell.dataset.pos);
  });
});

sbWmBuy.addEventListener('click', () => window.electronAPI.openBuyUrl());

// Render the locked free-tier state immediately; applyLicenseState() unlocks it
// later if a license is active, avoiding a flash of editable controls on load.
sbApplyWmLicense();

// ─── Hotkey recorder ───────────────────────────────────────────────────────────
let spRecording = false;

// keydown → Electron accelerator string, or null if not a usable combination
function spEventToAccelerator(e) {
  const key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null; // modifier alone

  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (parts.length === 0) return null; // require a modifier

  let k = key;
  if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  else k = k.charAt(0).toUpperCase() + k.slice(1); // F1, ArrowUp, etc.

  parts.push(k);
  return parts.join('+');
}

spHotkeyEl.addEventListener('focus', () => {
  spRecording = true;
  spHotkeyEl.classList.add('recording');
  spHotkeyEl.textContent = 'Press keys…';
  spHotkeyNote.style.display = 'none';
});

spHotkeyEl.addEventListener('blur', () => {
  spRecording = false;
  spHotkeyEl.classList.remove('recording');
  spHotkeyEl.textContent = spDisplayAccel((appSettings && appSettings.hotkey) || '');
});

spHotkeyEl.addEventListener('keydown', async (e) => {
  if (!spRecording) return;
  e.preventDefault();

  if (e.key === 'Escape') { spHotkeyEl.blur(); return; }

  const accel = spEventToAccelerator(e);
  if (!accel) return; // wait for a valid combo

  const res = await window.electronAPI.setHotkey(accel);
  spHotkeyEl.textContent = res.display;
  if (!res.ok) {
    spHotkeyNote.textContent = `That shortcut was unavailable — using ${res.display} instead.`;
    spHotkeyNote.style.display = 'block';
  } else {
    spHotkeyNote.style.display = 'none';
  }
  spHotkeyEl.blur();
});

// ─── Capture-to-AI hotkey recorder ──────────────────────────────────────────────
// Same recipe as the capture hotkey above, but registration has NO fallback:
// a conflict leaves the feature dormant and shows "hotkey unavailable" here.
let spAiRecording = false;

function spAiUpdateNote(ok) {
  if (ok) { spAiHotkeyNote.style.display = 'none'; return; }
  spAiHotkeyNote.textContent = 'Hotkey unavailable — it may be in use by another app or shortcut.';
  spAiHotkeyNote.style.display = 'block';
}

spAiHotkeyEl.addEventListener('focus', () => {
  spAiRecording = true;
  spAiHotkeyEl.classList.add('recording');
  spAiHotkeyEl.textContent = 'Press keys…';
  spAiHotkeyNote.style.display = 'none';
});

spAiHotkeyEl.addEventListener('blur', () => {
  spAiRecording = false;
  spAiHotkeyEl.classList.remove('recording');
  spAiHotkeyEl.textContent = spDisplayAccel(spAiSettings().hotkey || '');
});

spAiHotkeyEl.addEventListener('keydown', async (e) => {
  if (!spAiRecording) return;
  e.preventDefault();

  if (e.key === 'Escape') { spAiHotkeyEl.blur(); return; }

  const accel = spEventToAccelerator(e);
  if (!accel) return; // wait for a valid combo

  const res = await window.electronAPI.setAiHotkey(accel);
  if (res && res.settings) appSettings = res.settings;
  spAiHotkeyEl.textContent = res.display;
  spAiUpdateNote(!!(res && res.ok));
  spAiHotkeyEl.blur();
});

// ═══ Capture History panel ═══════════════════════════════════════════════════════
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60)   return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60)   return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24)   return h + 'h ago';
  const d = Math.floor(h / 24);
  return d + 'd ago';
}

// History Mode is a sidebar swap, the same pattern as OCR Mode (see
// enterOcrMode/exitOcrMode): #controls (or #ocr-controls) is hidden and
// #history-controls takes its place via body.history-mode. Since #controls'
// own visibility is driven entirely by the no-image/bg-off/ocr-mode classes
// (untouched here), simply removing history-mode on exit naturally restores
// whatever was showing before — no separate "was it visible" flag needed.
let historyModeActive = false;
const historySbBody = document.getElementById('history-sb-body');

async function enterHistoryMode() {
  if (historyModeActive) return;
  historyModeActive = true;
  document.body.classList.add('history-mode');
  positionToolbar(); // sidebar swap → canvas width may have changed (e.g. from the no-image state)
  await renderHistorySidebar();
}

function exitHistoryMode() {
  if (!historyModeActive) return;
  historyModeActive = false;
  document.body.classList.remove('history-mode');
  positionToolbar();
}

async function renderHistorySidebar() {
  historySbBody.innerHTML = '<div class="hist-sb-empty">Loading…</div>';

  let entries;
  try { entries = await window.electronAPI.getHistoryIndex(); } catch { entries = []; }

  if (!entries || !entries.length) {
    historySbBody.innerHTML = '<div class="hist-sb-empty">No captures yet.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'hist-sb-grid';

  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'hist-sb-item';
    item.draggable = true;

    const img = document.createElement('img');
    img.alt = 'Capture';
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1px placeholder
    (async () => {
      try {
        const thumb = await window.electronAPI.getHistoryThumb(entry.id);
        if (thumb) img.src = thumb;
      } catch { /* keep placeholder */ }
    })();

    const info = document.createElement('div');
    info.className = 'hist-sb-item-info';
    const timeSpan = document.createElement('span');
    timeSpan.textContent = relativeTime(entry.timestamp);
    const delBtn = document.createElement('button');
    delBtn.className = 'hist-sb-item-del';
    delBtn.title = 'Delete';
    delBtn.setAttribute('aria-label', 'Delete capture');
    delBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>';
    info.appendChild(timeSpan);
    info.appendChild(delBtn);

    item.appendChild(img);
    item.appendChild(info);
    grid.appendChild(item);

    // Click a thumbnail: open it as a new tab (consistent with every other
    // history entry point — the launcher's Recents grid and the old modal —
    // so in-progress annotations on the current tab are never silently lost).
    item.addEventListener('click', async (e) => {
      if (e.target === delBtn || delBtn.contains(e.target)) return;
      try {
        const dataUrl = await window.electronAPI.loadFromHistory(entry.id);
        if (dataUrl) createTab(dataUrl);
      } catch { /* ignore */ }
    });

    // Drag-and-drop: an alternative to clicking, dropped onto the canvas. The
    // drop handler below resolves the full-res image itself (via entry.id) —
    // dragstart just needs to identify which entry is being dragged.
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-lumshot-history-id', entry.id);
    });

    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await window.electronAPI.deleteHistoryEntry(entry.id); } catch { /* ignore */ }
      item.remove();
      if (!grid.children.length) historySbBody.innerHTML = '<div class="hist-sb-empty">No captures yet.</div>';
    });
  }

  historySbBody.innerHTML = '';
  historySbBody.appendChild(grid);
}

document.getElementById('history-sb-close').addEventListener('click', exitHistoryMode);

// Canvas-area drop target for dragging a history thumbnail onto the canvas.
canvasArea.addEventListener('dragover', (e) => {
  if (!historyModeActive) return;
  if (!e.dataTransfer.types.includes('application/x-lumshot-history-id')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
canvasArea.addEventListener('drop', async (e) => {
  if (!historyModeActive) return;
  const id = e.dataTransfer.getData('application/x-lumshot-history-id');
  if (!id) return;
  e.preventDefault();
  try {
    const dataUrl = await window.electronAPI.loadFromHistory(id);
    if (dataUrl) createTab(dataUrl);
  } catch { /* ignore */ }
});

window.electronAPI.onMenuOpenHistory(() => enterHistoryMode());

// ═══ Launcher (empty state) ══════════════════════════════════════════════════════
// The empty editor (no image loaded) shows a launcher: four capture-action cards
// plus a Recent Images grid mirroring capture history. Cards fire the same actions
// as the Capture menu; recents reuse the history IPC (getHistoryIndex / -Thumb / load).
(function initLauncher() {
  const tileActions = {
    region: () => window.electronAPI.triggerCapture(),
    ai:     () => window.electronAPI.menuAction('cap.ai'),
    paste:  () => window.electronAPI.openFromClipboard(),
    ocr:    () => window.electronAPI.triggerCaptureOcr(),
  };
  document.querySelectorAll('#launcher-actions .launch-card').forEach(card => {
    card.addEventListener('click', () => {
      const fn = tileActions[card.dataset.action];
      if (fn) fn();
    });
  });

  const launcherInner = document.getElementById('launcher-inner');
  const recentSection = document.getElementById('launcher-recent');
  const recentGrid    = document.getElementById('launcher-recent-grid');
  const recentClear   = document.getElementById('launcher-recent-clear');
  const RECENT_MAX = 4;

  // Reveal the launcher once its final layout is known: recents populated (or
  // confirmed empty) AND the bundled webfonts have finished loading — see
  // .launcher-loading in editor.html. Without the fonts gate, the launcher
  // could reveal mid font-swap (Instrument Sans/JetBrains Mono use
  // font-display: swap for an instant fallback-font first paint): the
  // fallback and real fonts don't share metrics, so every text box's height
  // — and the whole centred column's total height — changes a frame or two
  // after reveal, reading as a small persistent "shake." document.fonts.ready
  // resolves once every @font-face load settles; both fonts are local files
  // bundled with the app, so this adds no perceptible delay in practice.
  // Idempotent: the fade only plays on the first reveal, later refreshes
  // just update in place.
  function revealLauncher() {
    if (!launcherInner.classList.contains('launcher-loading')) return;
    document.fonts.ready.then(() => {
      if (!launcherInner.classList.contains('launcher-loading')) return;
      launcherInner.classList.remove('launcher-loading');
      launcherInner.classList.add('launcher-reveal');
    });
  }

  // History entries carry no filename, so synthesize a stable, readable one.
  function fileNameFor(entry) {
    const d = new Date(entry.timestamp);
    const pad = n => String(n).padStart(2, '0');
    return `Capture-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.png`;
  }

  async function refreshRecents() {
    let entries;
    try { entries = await window.electronAPI.getHistoryIndex(); } catch { entries = []; }
    entries = (entries || []).slice(0, RECENT_MAX);
    recentGrid.innerHTML = '';
    // The whole group (actions + this section, when present) is always
    // centred by #placeholder's own layout — nothing to toggle here.
    if (!entries.length) { recentSection.classList.add('hidden'); revealLauncher(); return; }
    recentSection.classList.remove('hidden');

    for (const entry of entries) {
      const item = document.createElement('button');
      item.className = 'launch-recent-item';
      item.type = 'button';

      const thumb = document.createElement('div');
      thumb.className = 'launch-recent-thumb';

      const text = document.createElement('div');
      text.className = 'launch-recent-text';

      const name = document.createElement('div');
      name.className = 'launch-recent-name';
      name.textContent = fileNameFor(entry);

      const time = document.createElement('div');
      time.className = 'launch-recent-time';
      time.textContent = relativeTime(entry.timestamp);

      text.append(name, time);
      item.append(thumb, text);
      item.setAttribute('aria-label', `Open ${name.textContent}, ${time.textContent}`);
      recentGrid.appendChild(item);

      // Real thumbnail loads in over the striped placeholder background.
      (async () => {
        try {
          const t = await window.electronAPI.getHistoryThumb(entry.id);
          if (t) thumb.style.backgroundImage = `url("${t}")`;
        } catch { /* keep striped placeholder */ }
      })();

      item.addEventListener('click', async () => {
        try {
          const dataUrl = await window.electronAPI.loadFromHistory(entry.id);
          if (dataUrl) createTab(dataUrl);
        } catch { /* ignore */ }
      });
    }
    // Recent row is fully built (thumbnails stream in async but their tiles
    // already occupy final size) — reveal now, in the final centred layout.
    revealLauncher();
  }

  recentClear.addEventListener('click', async () => {
    let entries;
    try { entries = await window.electronAPI.getHistoryIndex(); } catch { entries = []; }
    for (const e of (entries || [])) {
      try { await window.electronAPI.deleteHistoryEntry(e.id); } catch { /* ignore */ }
    }
    refreshRecents();
  });

  // Populate on load, and again whenever the empty editor regains focus (e.g. it
  // was reopened from the tray after a capture updated the history cache).
  refreshRecents();
  // Safety net: never leave the launcher hidden if the recents IPC stalls or
  // throws before revealLauncher() runs (refreshRecents is best-effort). ~1ms
  // in practice, so this fires only in a genuine failure.
  setTimeout(revealLauncher, 400);
  window.addEventListener('focus', () => {
    if (document.body.classList.contains('no-image')) refreshRecents();
  });
})();

// ═══ Global drag-and-drop ════════════════════════════════════════════════════════
// Drop an image file anywhere on the window to open it as a new tab. A dashed
// overlay confirms the drop target while a file is dragged over.
(function initDropZone() {
  const overlay = document.getElementById('drop-overlay');
  let depth = 0;

  const carriesFile = (dt) => !!dt && Array.from(dt.types || []).includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (dragOutInFlight || !carriesFile(e.dataTransfer)) return;
    e.preventDefault();
    depth++;
    overlay.classList.add('active');
  });
  window.addEventListener('dragover', (e) => {
    if (dragOutInFlight || !carriesFile(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.classList.remove('active');
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer) return;
    const file = Array.from(e.dataTransfer.files || []).find(f => f.type.startsWith('image/'));
    // Always prevent the default (Electron would otherwise navigate to the file).
    e.preventDefault();
    depth = 0;
    overlay.classList.remove('active');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => createTab(reader.result);
    reader.readAsDataURL(file);
  });
})();

// ═══ OCR: Extract Text + Auto-Redact ════════════════════════════════════════════
// Two on-demand actions powered by the vendored, offline Tesseract.js runtime:
//   • Extract Text — full-image OCR → copyable text panel.
//   • Auto-Redact  — OCR + regex PII detection → dashed "AI-detected" blur boxes
//                    the user reviews (and can delete) before exporting.
// OCR runs inside Tesseract's own Web Worker, so the editor stays responsive.
// The worker, WASM core and eng.traineddata are served from the ocr:// scheme
// (registered in main.js) so the blob worker can importScripts/fetch them with
// no network access — see the comment on that handler for why file:// can't.

const OCR_PATHS = {
  workerPath: 'ocr://assets/worker.min.js',
  corePath:   'ocr://assets', // directory → worker auto-picks the right wasm core
  langPath:   'ocr://assets', // directory → holds eng.traineddata.gz
};

// Best-effort PII patterns. False positives are harmless (the user reviews and
// deletes); the dashed-outline + review-before-export model covers false
// negatives. Each is global so .exec() can walk every match on a line.
const PII_PATTERNS = {
  email:       /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Vendor-prefixed API keys: AWS access key ID, Google API key, Stripe (live/test
  // secret/publishable/restricted), and the "sk-" family (OpenAI, Anthropic's
  // "sk-ant-" variant). Prefix-anchored, so false positives are rare.
  apiKey:      /\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b|\b(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b|\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g,
  phoneNumber: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  // Best-effort US-style postal address: a street line ("123 Main St", optionally
  // with Apt/Suite/Unit) or a "City, ST 12345" line. Matched per OCR line, same as
  // every other pattern here, so the two halves of a multi-line address are each
  // caught (and boxed) independently.
  postalAddress: /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Way|Place|Pl|Square|Sq|Terrace|Ter|Highway|Hwy|Parkway|Pkwy|Trail|Trl)\.?\b(?:\s+(?:Apt|Suite|Ste|Unit|#)\.?\s*[A-Za-z0-9-]+)?|\b[A-Za-z][A-Za-z\s]{1,25},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi,
  creditCard:  /\b(?:\d[ -]?){13,16}\b/g,
  // Access/session tokens: JWTs (three dot-separated base64url segments), GitHub
  // PATs (classic ghp_/gho_/ghu_/ghs_/ghr_ and fine-grained github_pat_), Slack
  // OAuth tokens (xoxb-/xoxp-/xoxa-/xoxr-/xoxs-), Google OAuth (ya29.…).
  accessToken: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bya29\.[A-Za-z0-9_-]{20,}\b/g,
  ipv4:        /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  ssn:         /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
};

// The PII categories exposed as live toggles in the sidebar's "Redact sensitive
// data" section, in display order. Keys must match PII_PATTERNS (and the
// data-type attributes in editor.html) so a toggled category maps straight to a
// detection pattern. Redaction state is per-tab (redactEnabledTypes), not
// persisted — a fresh capture starts with nothing redacted, so no surprise OCR.
const REDACT_TYPE_KEYS = ['email', 'apiKey', 'phoneNumber', 'postalAddress', 'creditCard', 'accessToken', 'ipv4', 'ssn'];

let _ocrWorkerPromise = null;  // created lazily on first use, reused while active
let _tesseractLibPromise = null; // lazy <script> injection of the vendored lib

// The OCR engine (worker + WASM core + ~10 MB language model) is heavy, so once
// it has been idle for a while we tear it down to reclaim that memory; the next
// OCR action transparently re-creates it.
const OCR_IDLE_MS = 3 * 60 * 1000;
let _ocrIdleTimer = null;

// Inject the vendored Tesseract library on first use (it's intentionally NOT a
// <script> in editor.html, so it costs nothing at launch). Resolves once the
// `Tesseract` global is available.
function loadTesseractLib() {
  if (typeof Tesseract !== 'undefined') return Promise.resolve();
  if (_tesseractLibPromise) return _tesseractLibPromise;
  _tesseractLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'assets/ocr/tesseract.min.js';
    s.onload = () => resolve();
    s.onerror = () => { _tesseractLibPromise = null; reject(new Error('OCR engine failed to load.')); };
    document.head.appendChild(s);
  });
  return _tesseractLibPromise;
}

// Resolve (and cache) the shared Tesseract worker. On failure the cached promise
// is cleared so a later click can retry rather than reject forever.
function getOcrWorker() {
  touchOcrActivity();
  if (_ocrWorkerPromise) return _ocrWorkerPromise;
  _ocrWorkerPromise = loadTesseractLib().then(() => {
    if (typeof Tesseract === 'undefined') throw new Error('OCR engine failed to load.');
    return Tesseract.createWorker('eng', 1, {
      ...OCR_PATHS,
      gzip: true,
      cacheMethod: 'none', // always read the bundled file; skip the IndexedDB layer
    });
  });
  _ocrWorkerPromise.catch(() => { _ocrWorkerPromise = null; });
  return _ocrWorkerPromise;
}

// Push back the idle-termination timer on every OCR access.
function touchOcrActivity() {
  clearTimeout(_ocrIdleTimer);
  _ocrIdleTimer = setTimeout(terminateOcrWorker, OCR_IDLE_MS);
}

// Tear down the worker and free its WASM core + language model.
async function terminateOcrWorker() {
  clearTimeout(_ocrIdleTimer);
  const p = _ocrWorkerPromise;
  _ocrWorkerPromise = null;
  if (!p) return;
  try { const w = await p; if (w && w.terminate) await w.terminate(); } catch { /* already gone */ }
}

// Draw the raw screenshot to a natural-size canvas. Passing a canvas (rather than
// the <img>) avoids Tesseract re-fetching img.src and makes the OCR pixel space
// exactly naturalWidth × naturalHeight, so word boxes map cleanly to fractions.
function ocrSourceCanvas(img = screenshotImg) {
  const iw = img.naturalWidth  || img.width;
  const ih = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = iw; c.height = ih;
  c.getContext('2d').drawImage(img, 0, 0, iw, ih);
  return c;
}

// Flatten Tesseract's block tree (output:{blocks:true}) into lines, each a list
// of { text, x0, y0, x1, y1 } words in source-image pixels.
function collectOcrLines(data) {
  const lines = [];
  for (const block of (data.blocks || [])) {
    for (const para of (block.paragraphs || [])) {
      for (const line of (para.lines || [])) {
        const words = (line.words || [])
          .filter(w => w && w.text && w.bbox)
          .map(w => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
        if (words.length) lines.push(words);
      }
    }
  }
  return lines;
}

// Find PII per line and return the union bounding box (image px) of the words
// each match spans — handles both single-token (email, SSN) and space-separated
// matches (phone numbers OCR'd as several words).
function detectPIIBoxes(data, types) {
  const active = types ? new Set(types) : null; // null → all categories
  const boxes = [];
  for (const words of collectOcrLines(data)) {
    let text = '';
    const spans = [];
    words.forEach((w, i) => {
      if (i > 0) text += ' ';
      const start = text.length;
      text += w.text;
      spans.push({ start, end: text.length, w });
    });
    for (const [type, regex] of Object.entries(PII_PATTERNS)) {
      if (active && !active.has(type)) continue; // skip unselected categories
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const ms = m.index;
        const me = m.index + m[0].length;
        if (me === ms) { regex.lastIndex++; continue; } // guard against zero-width
        const hit = spans.filter(s => s.start < me && s.end > ms).map(s => s.w);
        if (!hit.length) continue;
        boxes.push({
          type,
          x0: Math.min(...hit.map(w => w.x0)),
          y0: Math.min(...hit.map(w => w.y0)),
          x1: Math.max(...hit.map(w => w.x1)),
          y1: Math.max(...hit.map(w => w.y1)),
        });
      }
    }
  }
  return dedupeBoxes(boxes);
}

// Drop boxes that mostly overlap an already-kept one (e.g. the same number
// matched by both the credit-card and phone patterns).
function dedupeBoxes(boxes) {
  const kept = [];
  const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const b of boxes) {
    const dup = kept.some((k) => {
      const ix = Math.max(0, Math.min(b.x1, k.x1) - Math.max(b.x0, k.x0));
      const iy = Math.max(0, Math.min(b.y1, k.y1) - Math.max(b.y0, k.y0));
      const inter = ix * iy;
      const minA = Math.min(area(b), area(k)) || 1;
      return inter / minA > 0.6;
    });
    if (!dup) kept.push(b);
  }
  return kept;
}

// Turn pixel PII boxes into AI-flagged blur annotations (fractional coords, with
// a little padding so glyph edges are covered). Pushed as one undo step.
function addRedactionBoxes(boxes) {
  const iw = screenshotImg.naturalWidth  || screenshotImg.width;
  const ih = screenshotImg.naturalHeight || screenshotImg.height;
  const padX = iw * 0.004;
  const padY = ih * 0.004;
  for (const box of boxes) {
    const fx = Math.max(0, (box.x0 - padX) / iw);
    const fy = Math.max(0, (box.y0 - padY) / ih);
    const fw = Math.min(1 - fx, (box.x1 - box.x0 + padX * 2) / iw);
    const fh = Math.min(1 - fy, (box.y1 - box.y0 + padY * 2) / ih);
    if (fw <= 0 || fh <= 0) continue;
    annotations.push({
      id: newId(), type: 'blur', fx, fy, fw, fh,
      strength: 40, blurType: 'pixelated', isAIDetected: true, detectionType: box.type,
    });
  }
}

// ── Live redaction (sidebar toggles) ─────────────────────────────────────────
// The old flow scanned once behind a modal and dumped every match in. The sidebar
// model instead treats each PII category as a live toggle: enabling one blurs its
// matches instantly, disabling one removes them. The expensive part — the on-device
// OCR pass — runs at most once per image and is cached, so subsequent toggles are
// just a regex re-scan over the cached word boxes and feel instant.

const isAiRedaction = (a) => !!a && a.type === 'blur' && a.isAIDetected;

// Cached OCR word data for redaction, keyed by the image it came from (a tab
// switch or new capture changes screenshotImg, so the cache misses and re-scans).
const _redactOcrCache = { img: null, data: null };
let _redactOcrPromise = null;   // in-flight OCR, so concurrent toggles share one pass
let _redactRunToken   = 0;      // guards against stale async applies

// Resolve (and cache) the OCR word data for `img`, running a single recognize()
// pass if needed. Concurrent callers for the same image share the one promise.
function ensureRedactOcr(img) {
  if (_redactOcrCache.img === img && _redactOcrCache.data) return Promise.resolve(_redactOcrCache.data);
  if (_redactOcrPromise && _redactOcrPromise.img === img) return _redactOcrPromise.p;
  const p = (async () => {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(ocrSourceCanvas(img), {}, { blocks: true });
    if (screenshotImg === img) { _redactOcrCache.img = img; _redactOcrCache.data = data; }
    return data;
  })();
  _redactOcrPromise = { img, p };
  p.catch(() => {}).finally(() => { if (_redactOcrPromise && _redactOcrPromise.p === p) _redactOcrPromise = null; });
  return p;
}

// Recompute every AI-redaction box from the currently-enabled categories and swap
// the old set for the new one as a single undo step. Called on each category
// checkbox change. No "scanning…" UI — expanding the section already warmed the
// OCR cache (see initRedactSidebar's setExpanded), so this normally resolves
// against already-recognized word data and reads as instant.
async function applyRedactions() {
  if (!screenshotImg) { refreshRedactUI(); return; }
  const token = ++_redactRunToken;
  const types = [...redactEnabledTypes];

  let boxes = [];
  if (types.length) {
    let data = (_redactOcrCache.img === screenshotImg) ? _redactOcrCache.data : null;
    if (!data) {
      try {
        data = await ensureRedactOcr(screenshotImg);
      } catch (err) {
        if (token === _redactRunToken) { showToast(`Redaction failed: ${err.message}`); refreshRedactUI(); }
        return;
      }
      // A newer toggle, tab switch or image swap happened while OCR ran — abandon.
      if (token !== _redactRunToken || _redactOcrCache.img !== screenshotImg) return;
    }
    boxes = detectPIIBoxes(data, types);
  }

  // Skip a redundant history entry when there's genuinely nothing to change
  // (e.g. toggling off the last empty category).
  const hadAi = annotations.some(isAiRedaction);
  if (!boxes.length && !hadAi) { refreshRedactUI(); return; }

  pushHistory();
  annotations = annotations.filter(a => !isAiRedaction(a));
  addRedactionBoxes(boxes);
  selectedId = null;
  render();
  refreshRedactUI();
}

// Mirror the live redaction state into the sidebar: category checkboxes follow
// redactEnabledTypes; "(found N)" reports the number of applied redaction boxes.
function refreshRedactUI() {
  const list = document.getElementById('sb-redact-list');
  if (list) list.querySelectorAll('input[data-type]').forEach((cb) => {
    cb.checked = redactEnabledTypes.has(cb.dataset.type);
  });
  const countEl = document.getElementById('sb-redact-count');
  if (!countEl) return;
  if (redactEnabledTypes.size === 0) {
    countEl.hidden = true;
    countEl.textContent = '';
  } else {
    const n = annotations.filter(isAiRedaction).length;
    countEl.hidden = false;
    countEl.textContent = `found ${n}`;
  }
}

// Copy arbitrary text to the clipboard, with an execCommand fallback.
function copyTextToClipboard(text, okMsg) {
  const done = () => { if (okMsg) showToast(okMsg); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done && done(); } catch {}
  document.body.removeChild(ta);
}

// ═══ OCR Mode — inline, selectable text over the captured image ══════════════════
// A first-class capture/editing mode (vs. the old Extract Text modal). The active
// tab's recognized text is rendered as absolutely-positioned, selectable/editable
// line elements on top of the canvas — like Windows Snipping Tool's text view.
// State lives on the tab (ocrModeActive + ocrData) so toggling is non-destructive
// and survives tab switches; annotations are untouched underneath.

const ocrLayerEl   = document.getElementById('ocr-layer');
const ocrSearchBar = document.getElementById('ocr-search-bar');
const ocrSearchInput = document.getElementById('ocr-search-input');
const ocrSearchCount = document.getElementById('ocr-search-count');
const ocrScanEl    = document.getElementById('ocr-scan');
const ocrSbMeta    = document.getElementById('ocr-sb-meta');
const ocrSbPreview = document.getElementById('ocr-sb-preview');
const ocrSbButtons = ['ocr-copy-all', 'ocr-search', 'ocr-note'].map(id => document.getElementById(id));

let ocrSearchMatches = [];   // current <mark> elements
let ocrSearchIndex   = -1;

// ── OCR scan animation (sweeping mint line over the image while recognizing) ──
// Size the scan overlay to the on-screen image (canvas) rect within #canvas-area.
function positionOcrScan() {
  if (!ocrScanEl || !screenshotImg) return;
  const cr = canvas.getBoundingClientRect();
  const ar = canvasArea.getBoundingClientRect();
  ocrScanEl.style.left   = (cr.left - ar.left) + 'px';
  ocrScanEl.style.top    = (cr.top  - ar.top)  + 'px';
  ocrScanEl.style.width  = cr.width  + 'px';
  ocrScanEl.style.height = cr.height + 'px';
}
function startOcrScan() {
  if (!ocrScanEl) return;
  positionOcrScan();
  ocrScanEl.classList.add('on');
}
function stopOcrScan() {
  if (ocrScanEl) ocrScanEl.classList.remove('on');
}

// ── OCR sidebar (right panel while OCR Mode is on — see #ocr-controls) ──
// A placeholder state (scanning / no text / failed): centred message, actions
// disabled. Recognized text is set via textContent, never innerHTML, so
// image content can't inject markup.
function setOcrSbActionsEnabled(on) {
  ocrSbButtons.forEach((b) => { if (b) b.disabled = !on; });
}
function renderOcrSidebarMessage(msg) {
  if (!ocrSbMeta) return;
  ocrSbMeta.textContent = msg;
  ocrSbPreview.textContent = '';
  ocrSbPreview.classList.add('empty');
  setOcrSbActionsEnabled(false);
}
// Reflect `ocrData` into the sidebar (block count + confidence, text preview,
// enabled actions), or fall back to the "no text" placeholder.
function renderOcrSidebar() {
  if (!ocrSbMeta) return;
  if (!ocrData || !ocrData.lines.length) { renderOcrSidebarMessage('No text detected'); return; }
  const n = ocrData.lines.length;
  ocrSbMeta.textContent = n + ' text block' + (n === 1 ? '' : 's')
    + (ocrData.confidence ? ' · ' + ocrData.confidence + '% confidence' : '');
  ocrSbPreview.textContent = ocrAllText();
  ocrSbPreview.classList.remove('empty');
  setOcrSbActionsEnabled(true);
}

// Reflect the current OCR-mode flags into the layer/search chrome. The
// toolbar/top bar are unchanged in OCR Mode — only the OCR button's own
// active state (like any other tool) and the sidebar/search overlay move.
function applyOcrChrome() {
  document.body.classList.toggle('ocr-mode', ocrModeActive);
  ocrLayerEl.classList.toggle('on', ocrModeActive);
  const enterBtn = document.getElementById('tool-ocr-enter');
  if (enterBtn) enterBtn.classList.toggle('active', ocrModeActive);
  document.getElementById('ocr-search').classList.toggle('active', ocrModeActive && ocrSearchActive);
  ocrSearchBar.classList.toggle('on', ocrModeActive && ocrSearchActive);
  positionToolbar(); // OCR sidebar (290px) differs from #controls (316px) → canvas width changed
}

// Build the OCR source canvas at natural size → exact pixel→fraction mapping.
function buildOcrLineData(data) {
  return collectOcrLines(data).map((words) => ({
    text: words.map(w => w.text).join(' '),
    x0: Math.min(...words.map(w => w.x0)),
    y0: Math.min(...words.map(w => w.y0)),
    x1: Math.max(...words.map(w => w.x1)),
    y1: Math.max(...words.map(w => w.y1)),
  }));
}

// (Re)create the line elements from ocrData. Called when entering OCR Mode or
// after the data changes — NOT on every reposition (that would drop selection).
function buildOcrLayer() {
  ocrLayerEl.innerHTML = '';
  ocrSearchMatches = []; ocrSearchIndex = -1;
  if (!ocrData) return;
  ocrData.lines.forEach((line, idx) => {
    const el = document.createElement('div');
    el.className = 'ocr-line';
    el.dataset.idx = idx;
    el.textContent = line.text;
    ocrLayerEl.appendChild(el);
  });
  positionOcrLayer();
}

// Position/size each line to match its recognized box in the current view. Cheap
// (geometry only) so it can run on every render/zoom/scroll without losing state.
function positionOcrLayer() {
  if (!ocrModeActive || !ocrData || !view || !screenshotImg) return;
  const els = ocrLayerEl.children;
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const line = ocrData.lines[+el.dataset.idx];
    if (!line) continue;
    const tl = toAreaCoords(view.ox + line.x0, view.oy + line.y0);
    const br = toAreaCoords(view.ox + line.x1, view.oy + line.y1);
    const w = br.x - tl.x, h = br.y - tl.y;
    el.style.left = tl.x + 'px';
    el.style.top = tl.y + 'px';
    el.style.width = Math.max(2, w) + 'px';
    el.style.height = Math.max(2, h) + 'px';
    el.style.fontSize = Math.max(7, h * 0.72) + 'px';
  }
}

async function runOcrForLayer() {
  startOcrScan();                        // sweeping scan-line over the image while we recognize
  renderOcrSidebarMessage('Scanning…');
  try {
    const worker = await getOcrWorker();
    const srcImg = screenshotImg;
    const { data } = await worker.recognize(ocrSourceCanvas(), {}, { blocks: true });
    if (screenshotImg !== srcImg) { stopOcrScan(); return; } // image changed mid-scan — abandon
    ocrData = { img: srcImg, lines: buildOcrLineData(data), confidence: Math.round(data.confidence || 0) };
    stopOcrScan();
    if (ocrModeActive) {
      buildOcrLayer();
      renderOcrSidebar();
      if (!ocrData.lines.length) showToast('No text detected');
    }
  } catch (err) {
    stopOcrScan();
    renderOcrSidebarMessage('Text extraction failed');
    showToast('Text extraction failed');
  }
}

async function enterOcrMode() {
  if (!screenshotImg || ocrModeActive) return;
  if (editing) cancelText();
  setActiveTool(null);
  selectedId = null;
  ocrModeActive = true;
  ocrSearchActive = false;
  applyOcrChrome();
  render();
  if (ocrData && ocrData.img === screenshotImg) {
    buildOcrLayer();       // cached result — reflect it immediately, nothing to scan
    renderOcrSidebar();
  } else {
    ocrData = null;
    ocrLayerEl.innerHTML = '';
    await runOcrForLayer();
  }
}

function exitOcrMode() {
  if (!ocrModeActive) return;
  ocrModeActive = false;
  ocrSearchActive = false;
  stopOcrScan();
  clearOcrSearch();
  applyOcrChrome();
  render();
}

function toggleOcrMode() {
  if (!screenshotImg) return;
  ocrModeActive ? exitOcrMode() : enterOcrMode();
}

// Re-establish OCR chrome/layer/sidebar for the active tab after a tab switch.
function syncOcrModeForTab() {
  ocrSearchActive = false;
  clearOcrSearch();
  stopOcrScan();
  applyOcrChrome();
  if (ocrModeActive) {
    if (ocrData && ocrData.img === screenshotImg) { buildOcrLayer(); renderOcrSidebar(); }
    else { ocrData = null; ocrLayerEl.innerHTML = ''; runOcrForLayer(); }
  } else {
    ocrLayerEl.innerHTML = '';
  }
}

// ── Text interactions ──
function ocrAllText() {
  return ocrData ? ocrData.lines.map(l => l.text).join('\n') : '';
}
function ocrSelectedText() {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && ocrLayerEl.contains(sel.anchorNode)) return sel.toString();
  return '';
}
// Select every line in the text layer (Ctrl+A / Select All in OCR Mode).
function selectAllOcrText() {
  if (!ocrLayerEl.children.length) return;
  const range = document.createRange();
  range.selectNodeContents(ocrLayerEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
// Ctrl+C / Copy in OCR Mode: copy the selection, or everything if none.
function copyOcrSelectionOrAll() {
  const sel = ocrSelectedText();
  const text = sel || ocrAllText();
  if (!text) return;
  copyTextToClipboard(text, sel ? 'Selection copied' : 'All text copied');
}

// ── Search ──
const escHtml = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function clearOcrSearch() {
  ocrSearchMatches = []; ocrSearchIndex = -1;
  if (ocrSearchInput) ocrSearchInput.value = '';
  if (ocrSearchCount) ocrSearchCount.textContent = '0/0';
  // Restore plain text (drop any <mark>s) without losing edits.
  if (ocrData) for (const el of ocrLayerEl.children) el.textContent = ocrData.lines[+el.dataset.idx].text;
}
function runOcrSearch(q) {
  ocrSearchMatches = []; ocrSearchIndex = -1;
  const query = q.trim();
  for (const el of ocrLayerEl.children) {
    const text = ocrData.lines[+el.dataset.idx].text;
    if (!query) { el.textContent = text; continue; }
    const lower = text.toLowerCase(), ql = query.toLowerCase();
    let out = '', from = 0, at;
    while ((at = lower.indexOf(ql, from)) !== -1) {
      out += escHtml(text.slice(from, at)) + '<mark class="ocr-find">' + escHtml(text.slice(at, at + query.length)) + '</mark>';
      from = at + query.length;
    }
    out += escHtml(text.slice(from));
    el.innerHTML = out;
  }
  if (query) ocrSearchMatches = Array.from(ocrLayerEl.querySelectorAll('mark.ocr-find'));
  if (ocrSearchMatches.length) gotoOcrMatch(0);
  else ocrSearchCount.textContent = query ? '0/0' : '0/0';
}
function gotoOcrMatch(i) {
  if (!ocrSearchMatches.length) return;
  ocrSearchMatches.forEach(m => m.classList.remove('active'));
  ocrSearchIndex = (i + ocrSearchMatches.length) % ocrSearchMatches.length;
  const m = ocrSearchMatches[ocrSearchIndex];
  m.classList.add('active');
  m.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  ocrSearchCount.textContent = `${ocrSearchIndex + 1}/${ocrSearchMatches.length}`;
}
function toggleOcrSearch(force) {
  ocrSearchActive = force !== undefined ? force : !ocrSearchActive;
  applyOcrChrome();
  if (ocrSearchActive) { ocrSearchInput.focus(); ocrSearchInput.select(); }
  else clearOcrSearch();
}

// Paste into the find box. The Edit menu's Ctrl+V accelerator consumes the key
// before the input can paste natively, so we read the clipboard and insert it.
async function ocrPasteIntoSearch() {
  if (document.activeElement !== ocrSearchInput) return;
  let text = '';
  try { text = await window.electronAPI.readClipboardText(); } catch {}
  if (!text) { try { text = await navigator.clipboard.readText(); } catch {} }
  if (!text) return;
  ocrSearchInput.focus();
  if (!document.execCommand || !document.execCommand('insertText', false, text)) {
    ocrSearchInput.value += text;
  }
  runOcrSearch(ocrSearchInput.value);
}

// ── Note dialog ──
function openOcrNote() {
  const ta = document.getElementById('ocr-note-text');
  const sel = ocrSelectedText();
  ta.value = sel || ocrAllText();
  document.getElementById('ocr-note-status').textContent = '';
  openModal(spOcrNoteOverlay);
  setTimeout(() => ta.focus(), 50);
}

// ── Redact sidebar (live PII toggles) ──
// The "+" expands the category list (and becomes "−"); each category switch is
// wired straight to applyRedactions() for real-time blur/un-blur. No "All" option
// and no explicit "Redact" button — enabling a category IS the action.
(function initRedactSidebar() {
  const section = document.getElementById('sb-redact-section');
  if (!section) return;
  const expandBtn = document.getElementById('sb-redact-expand');
  const list = document.getElementById('sb-redact-list');

  function setExpanded(open) {
    list.hidden = !open;
    expandBtn.classList.toggle('open', open);
    expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    expandBtn.title = open ? 'Hide data types' : 'Show data types';
    // Warm the OCR cache the moment the list opens — expanding is a strong signal
    // the user is about to check a category, so by the time they click one the
    // word data is usually already sitting in _redactOcrCache and applyRedactions()
    // just filters it, instead of paying for OCR startup + recognition on that click.
    if (open && screenshotImg) ensureRedactOcr(screenshotImg).catch(() => {});
  }
  expandBtn.addEventListener('click', () => setExpanded(list.hidden));

  list.querySelectorAll('input[data-type]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) redactEnabledTypes.add(cb.dataset.type);
      else redactEnabledTypes.delete(cb.dataset.type);
      applyRedactions();
    });
  });

  refreshRedactUI();
})();

// ── Wiring ──
document.getElementById('tool-ocr-enter').addEventListener('click', toggleOcrMode);
document.getElementById('ocr-copy-all').addEventListener('click', () => {
  const t = ocrAllText();
  if (t) copyTextToClipboard(t, 'All text copied');
});
document.getElementById('ocr-search').addEventListener('click', () => toggleOcrSearch());
document.getElementById('ocr-note').addEventListener('click', openOcrNote);

ocrSearchInput.addEventListener('input', () => runOcrSearch(ocrSearchInput.value));
ocrSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); gotoOcrMatch(ocrSearchIndex + (e.shiftKey ? -1 : 1)); }
  else if (e.key === 'Escape') { e.preventDefault(); toggleOcrSearch(false); }
});
document.getElementById('ocr-search-prev').addEventListener('click', () => gotoOcrMatch(ocrSearchIndex - 1));
document.getElementById('ocr-search-next').addEventListener('click', () => gotoOcrMatch(ocrSearchIndex + 1));
document.getElementById('ocr-search-close').addEventListener('click', () => toggleOcrSearch(false));

document.getElementById('ocr-note-copy').addEventListener('click', () => {
  copyTextToClipboard(document.getElementById('ocr-note-text').value, 'Note copied');
});
document.getElementById('ocr-note-save').addEventListener('click', async () => {
  const text = document.getElementById('ocr-note-text').value;
  const status = document.getElementById('ocr-note-status');
  try {
    const ok = await window.electronAPI.saveTextFile(text);
    status.textContent = ok ? 'Saved.' : '';
    if (ok) setTimeout(closeModals, 600);
  } catch { status.textContent = 'Save failed.'; }
});

// Keep the text layer aligned with the image through scroll (zoomed) + resize.
canvasArea.addEventListener('scroll', () => { if (ocrModeActive) { positionOcrLayer(); positionOcrScan(); } });
window.addEventListener('resize', () => { if (ocrModeActive) { positionOcrLayer(); positionOcrScan(); } });

// Toggle OCR Mode from the Tools/Capture menu.
window.electronAPI.onMenuOcrToggle(() => toggleOcrMode());
