// config.js — app-wide constants, shared by renderer (via <script>) and Node.
// Change these in one place when the app is renamed / rebranded.

(function () {
  const CONFIG = {
    APP_NAME: 'Lumshot',
    // Text burned into exported images on the free tier:
    WATERMARK_TEXT: 'Made with Lumshot',
  };

  if (typeof window !== 'undefined') window.LUMSHOT_CONFIG = CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
})();
