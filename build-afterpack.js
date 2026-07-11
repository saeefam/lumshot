// build-afterpack.js — electron-builder afterPack hook.
//
// Strips Electron/Chromium runtime binaries that LumShot never uses, so they
// don't bloat the installer. electron-builder's `files` filter only applies to
// *app* content, not the Electron dist DLLs — those have to be deleted here,
// after the app is packed but before the NSIS installer is assembled.
//
// Only removed: the DirectX shader compiler used exclusively by WebGPU
// (dxcompiler.dll ~25 MB, dxil.dll ~1.5 MB). LumShot renders with 2D canvas
// only — verified no getContext('webgl'|'webgpu'), no requestAdapter, no 3D
// libs — so these can never load. The software-GL fallback (vk_swiftshader.dll,
// vulkan-1.dll) is intentionally KEPT so the canvas still renders on VMs, RDP
// sessions, and machines with broken GPU drivers.

const fs = require('fs');
const path = require('path');

// Chromium DLLs safe to drop for a WebGPU-free, 2D-canvas-only app.
const STRIP = ['dxcompiler.dll', 'dxil.dll'];

exports.default = async function afterPack(context) {
  const outDir = context.appOutDir;
  let freed = 0;
  for (const name of STRIP) {
    const p = path.join(outDir, name);
    try {
      const { size } = fs.statSync(p);
      fs.rmSync(p);
      freed += size;
      console.log(`  • afterPack: removed ${name} (${(size / 1048576).toFixed(1)} MB)`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e; // absent already is fine
    }
  }
  if (freed) console.log(`  • afterPack: freed ${(freed / 1048576).toFixed(1)} MB of unused WebGPU DLLs`);
};
