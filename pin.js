// Renderer for the floating "Pin to Screen" window.
// It only displays the current image and forwards button clicks to main —
// main owns the image data, clipboard, and save dialog.

const img = document.getElementById('pin-img');
const hud = document.getElementById('scroll-hud');
const hudStatus = document.getElementById('hud-status');
const hudHeight = document.getElementById('hud-height');
const hudFill = document.getElementById('hud-fill');

// Main pushes the initial raw screenshot, then any beautified updates. Receiving
// a normal image clears any live scroll-preview state.
function showImage(dataUrl) {
  if (!dataUrl) return;
  document.body.classList.remove('scroll-preview');
  img.src = dataUrl;
}
window.electronAPI.onPinShow(showImage);
window.electronAPI.onPinUpdate(showImage);

// Live scroll-capture preview: the growing stitched image + progress HUD.
window.electronAPI.onPinScrollPreview(({ dataUrl, height, status, progress, done }) => {
  document.body.classList.add('scroll-preview');
  if (dataUrl) img.src = dataUrl;
  if (status) hudStatus.textContent = status;
  if (typeof height === 'number') hudHeight.textContent = `${height.toLocaleString()} px`;
  if (typeof progress === 'number' && progress > 0) {
    hud.classList.remove('indet');
    hudFill.style.width = `${Math.min(100, Math.round(progress * 100))}%`;
  }
  if (done) { hud.classList.remove('indet'); hud.classList.add('done'); }
});

document.getElementById('pin-edit').addEventListener('click',  () => window.electronAPI.pinEdit());
document.getElementById('pin-copy').addEventListener('click',  () => window.electronAPI.pinCopy());
document.getElementById('pin-save').addEventListener('click',  () => window.electronAPI.pinSave());
document.getElementById('pin-close').addEventListener('click', () => window.electronAPI.pinClose());

// ── Custom window dragging ──────────────────────────────────────────────────
// The pin card is no-drag (so the whole image can capture hover for the reveal
// overlay), so window moves are driven here: tell main to follow the cursor on
// mouse-down anywhere except an action button, and to stop on release. Main keeps
// a fixed grab offset and repositions the window until pinDragEnd().
const card = document.querySelector('.pin-card');
let dragging = false;

card.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;                // left button only
  if (e.target.closest('.pin-btn')) return;  // buttons perform actions, never drag
  dragging = true;
  document.body.classList.add('dragging');
  window.electronAPI.pinDragStart();
  e.preventDefault();                         // don't start a text/selection drag
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  document.body.classList.remove('dragging');
  window.electronAPI.pinDragEnd();
}
window.addEventListener('mouseup', endDrag);
window.addEventListener('blur', endDrag);     // safety net if the mouse-up is missed
