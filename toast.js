// toast.js — renderer for the transient system toast (see showSystemToast in
// main.js). Receives one message and fades in; main destroys the window itself
// after the display timeout, so there is nothing else to manage here.
window.electronAPI.onToastShow((msg) => {
  document.getElementById('msg').textContent = msg;
  requestAnimationFrame(() => document.getElementById('toast').classList.add('visible'));
});
