// license.js — license validation for Lumshot (main process only).
//
// All Polar calls go through our license proxy (a Cloudflare Worker that holds the
// Polar API token server-side) — the app never carries any Polar credentials:
//   First use  → POST {LICENSE_API_BASE}/activate    (reserves a slot, returns activationId)
//   Weekly     → POST {LICENSE_API_BASE}/validate    (confirms key + activation still granted)
//   On request → POST {LICENSE_API_BASE}/deactivate  (releases this device's slot)
//
// The proxy returns only normalized, minimal fields ({ status, granted, … }) so no
// raw customer data reaches the client. The activationId obtained during activate()
// is stored in electron-store and sent on every validate/deactivate.

const https = require('https');
const getStore = require('./store');
const { LICENSE_API_BASE } = require('./secrets');

const VALIDATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

function isLicensed() {
  const lic = getStore().get('license');
  return !!(lic && lic.licenseKey);
}

// Mask everything except the last 6 characters, preserving the dash structure:
//   LUMSHOT-7D9E9A1B-B682-433C-B5DC-D54B7412C7  →  LUMSHOT-****-****-****-****-7412C7
function maskKey(key) {
  if (!key) return '';
  const tail = key.slice(-6);
  const parts = key.split('-');
  if (parts.length <= 1) return '****' + tail;
  return parts
    .map((p, i) => (i === 0 ? p : i === parts.length - 1 ? tail : '****'))
    .join('-');
}

// Full status for the renderer. Activation usage/limit and activatedAt are read
// straight from electron-store (cached during activate) — no API call needed.
function getStatus() {
  const lic = getStore().get('license');
  if (!lic || !lic.licenseKey) return { licensed: false };
  return {
    licensed: true,
    maskedKey: maskKey(lic.licenseKey),
    activatedAt: lic.activatedAt || null,
    usage: Number.isFinite(lic.usage) ? lic.usage : null,
    limitActivations: Number.isFinite(lic.limitActivations) ? lic.limitActivations : null,
  };
}

// POST JSON to the license proxy (no credentials — the proxy holds the Polar
// token). Resolves the proxy's normalized JSON body, e.g. { status, granted, … }.
function proxyPost(pathname, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(LICENSE_API_BASE + pathname);
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw || '{}')); }
          catch { reject(new Error(`Bad response from license server (HTTP ${res.statusCode})`)); }
        });
      }
    );
    req.on('error', (err) => {
      console.error('[License] Network error:', err.message);
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

// Called when the user enters a key for the first time.
// POSTs to /activate (not /validate) — this reserves one slot from the
// activation limit and returns an activation_id stored for future re-checks.
async function activate(rawKey) {
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) return { ok: false, error: 'Invalid license key. Please check and try again.' };

  try {
    const r = await proxyPost('/activate', { key });

    // The proxy normalizes Polar's response: granted === true on a successful grant.
    if (r.granted) {
      getStore().set('license', {
        licenseKey: key,
        activationId: r.activationId,   // UUID — required for future /validate + /deactivate calls
        activatedAt: Date.now(),
        lastValidatedAt: Date.now(),
        consecutiveFailures: 0,
        // Cache activation usage so the License modal needs no extra API call
        usage: Number.isFinite(r.usage) ? r.usage : null,
        limitActivations: Number.isFinite(r.limitActivations) ? r.limitActivations : null,
      });
      return { ok: true };
    }

    // 403 = activation limit already reached for this key
    if (r.status === 403) {
      return {
        ok: false,
        error: 'This key has reached its activation limit. Deactivate another device at polar.sh.',
      };
    }
  } catch (err) {
    console.error('[License] Activate call failed:', err.message);
  }

  return { ok: false, error: 'Invalid license key. Please check and try again.' };
}

// Called once on app start. Re-validates against Polar if 7+ days have passed.
// Tolerates up to MAX_CONSECUTIVE_FAILURES before deactivating locally.
// Returns { deactivated: true } if the license was revoked; { ok: true } otherwise.
async function revalidateIfDue() {
  const store = getStore();
  const lic = store.get('license');
  if (!lic || !lic.licenseKey) return { ok: true };

  const now = Date.now();
  if (now - (lic.lastValidatedAt || 0) < VALIDATION_INTERVAL_MS) return { ok: true };

  try {
    const r = await proxyPost('/validate', { key: lic.licenseKey, activationId: lic.activationId });

    if (r.granted) {
      store.set('license', { ...lic, lastValidatedAt: now, consecutiveFailures: 0 });
      return { ok: true };
    }

    throw new Error(`License server rejected key — HTTP ${r.status}`);
  } catch (err) {
    const failures = (lic.consecutiveFailures || 0) + 1;

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      store.delete('license');
      return { deactivated: true };
    }

    store.set('license', { ...lic, consecutiveFailures: failures });
    return { ok: true }; // stay licensed offline until the threshold is hit
  }
}

// Release this device's activation slot at Polar, then clear the local license.
async function deactivate() {
  const store = getStore();
  const lic = store.get('license');
  if (!lic || !lic.licenseKey) return { ok: true }; // already free

  try {
    const r = await proxyPost('/deactivate', { key: lic.licenseKey, activationId: lic.activationId });

    if (r.ok) {
      store.delete('license');
      return { ok: true };
    }

    return { ok: false, error: 'Could not deactivate this device. Please try again.' };
  } catch (err) {
    console.error('[License] Deactivate call failed:', err.message);
    return { ok: false, error: 'Network error — could not reach the license server.' };
  }
}

module.exports = { getStatus, isLicensed, activate, deactivate, revalidateIfDue };
