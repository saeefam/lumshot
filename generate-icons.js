// generate-icons.js — regenerate every app/tray/installer icon from the Lumshot
// logo SVG. Run with:  node generate-icons.js
//
// Outputs (all under assets/):
//   icon.ico            multi-size Windows icon (16,24,32,48,64,128,256)
//   icon.png            512x512 colour logo (installer + About dialog)
//   tray.png            16x16 colour logo  (+ tray@2x.png 32x32 for HiDPI)
//
// Requires: sharp, png-to-ico  (devDependencies)

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = typeof pngToIcoMod === 'function' ? pngToIcoMod : pngToIcoMod.default;

const ASSETS = path.join(__dirname, 'assets');

// ── Source logo ────────────────────────────────────────────────────────────
const SVG = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M140 158.543V260H20V158.543C20 148.212 26.993 140 35.79 140h88.421c8.797 0 15.789 8.212 15.789 18.543M380 140v101.416C380 251.77 373.008 260 364.211 260h-88.422c-8.797 0-15.789-8.23-15.789-18.584V140z" fill="#21d2bb"/><path d="M380 140H260v40h120z" fill="url(#a)"/><path d="M20 260h120v-40H20z" fill="url(#b)"/><path d="M260 275.789v88.422c0 8.797-7.012 15.789-15.834 15.789h-91.838c-7.691 0-14.929-2.932-20.358-8.346L20 260h224.166c8.822 0 15.834 7.218 15.834 15.789" fill="#21d2bb"/><path d="M260 275.789v88.422c0 8.797-7.012 15.789-15.834 15.789h-91.838c-7.691 0-14.929-2.932-20.358-8.346L20 260h224.166c8.822 0 15.834 7.218 15.834 15.789" fill="url(#c)"/><path d="M380 140H155.834c-8.822 0-15.834-6.992-15.834-15.789V35.789C140 26.992 147.012 20 155.834 20h92.064c7.691 0 14.93 2.932 20.358 8.346z" fill="#21d2bb"/><path d="M380 140H155.834c-8.822 0-15.834-6.992-15.834-15.789V35.789C140 26.992 147.012 20 155.834 20h92.064c7.691 0 14.93 2.932 20.358 8.346z" fill="url(#d)"/><defs><linearGradient id="a" x1="319.988" y1="174.603" x2="319.988" y2="16.96" gradientUnits="userSpaceOnUse"><stop offset=".05" stop-color="#21d2bb"/><stop offset=".615" stop-color="#011512"/></linearGradient><linearGradient id="b" x1="80.011" y1="225.397" x2="80.011" y2="383.039" gradientUnits="userSpaceOnUse"><stop offset=".05" stop-color="#21d2bb"/><stop offset=".615" stop-color="#011512"/></linearGradient><linearGradient id="c" x1="102.863" y1="353.565" x2="122.313" y2="334.292" gradientUnits="userSpaceOnUse"><stop stop-color="#21d2bb"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="d" x1="292.058" y1="50.452" x2="273.322" y2="69.732" gradientUnits="userSpaceOnUse"><stop stop-color="#21d2bb"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs></svg>`;

const svgBuffer = Buffer.from(SVG);

// Render the colour logo to a square PNG buffer at the given size.
function colorPng(size) {
  return sharp(svgBuffer, { density: 384 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function main() {
  fs.mkdirSync(ASSETS, { recursive: true });
  const written = [];
  const save = (name, buf) => { fs.writeFileSync(path.join(ASSETS, name), buf); written.push(`${name} (${buf.length} bytes)`); };

  // 1) Windows .ico (multiple sizes packed into one file)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoPngs = await Promise.all(icoSizes.map(colorPng));
  save('icon.ico', await pngToIco(icoPngs));

  // 2) 512x512 colour logo (installer + About dialog)
  save('icon.png', await colorPng(512));

  // 3) Tray icon — full-colour logo (base 16x16 + @2x 32x32 for HiDPI)
  save('tray.png',    await colorPng(16));
  save('tray@2x.png', await colorPng(32));

  console.log('Icons generated in assets/:');
  written.forEach(w => console.log('  ✓ ' + w));
}

main().catch((err) => { console.error('Icon generation failed:', err); process.exit(1); });
