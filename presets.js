// presets.js — the canonical background preset list, shared by the editor and
// the settings window. Loaded via <script> in both renderer pages (sets a
// global), and also requireable from Node if ever needed.
//
// The editor renders these as multi-gradient "mesh" backgrounds (see
// paintMeshGradient): c1/c2 are the endpoint colours and a small harmonious palette
// (highlight, a quiet third hue, corner depth) is derived from them at draw time.
//
// Each preset is either:
//   { type: 'gradient', name, c1, c2, dir }   — endpoints for the derived mesh
//   { type: 'solid',    name, color }          — flat fill
//   { type: 'mesh',     name, layers }         — explicit multi-blob mesh: layers is
//                                                 [{ x, y, h, s, l }, …] (position in
//                                                 %, HSL colour), rendered/previewed
//                                                 verbatim instead of derived from
//                                                 two endpoint colours (see
//                                                 meshLayersToCss/paintMeshLayers in
//                                                 editor.js)

(function () {
  const PRESETS = [
    // Sky blue upper-left → hot pink/magenta core → warm orange bottom-right.
    { type: 'mesh', name: 'Blaze', layers: [
      { x: 8,  y: 8,  h: 205, s: 90, l: 55 },
      { x: 45, y: 5,  h: 260, s: 60, l: 78 },
      { x: 90, y: 15, h: 35,  s: 90, l: 65 },
      { x: 70, y: 55, h: 335, s: 90, l: 55 },
      { x: 92, y: 92, h: 30,  s: 90, l: 60 },
      { x: 25, y: 70, h: 300, s: 40, l: 85 },
      { x: 10, y: 95, h: 280, s: 50, l: 80 },
    ] },
    { type: 'mesh', name: 'Ocean', layers: [
      { x: 16.98379390325139,  y: 66.68951769576474,  h: 276,                s: 100, l: 50 },
      { x: 19.523159535493974, y: 45.32084241825142,  h: 225,                s: 100, l: 40 },
      { x: 97.80447612332013,  y: 71.73600108070393,  h: 195.05882352941174, s: 100, l: 50 },
      { x: 35.558990084660266, y: 48.91873897954005,  h: 200,                s: 100, l: 50 },
      { x: 85.00157366568007,  y: 45.44129275356067,  h: 276,                s: 100, l: 50 },
      { x: 31.249406798342694, y: 32.91838665661224,  h: 225,                s: 100, l: 40 },
      { x: 24.474370928288103, y: 6.684014860124443,  h: 195.05882352941174, s: 100, l: 50 },
    ] },
    // Violet/purple swirl with a soft peach-pink highlight top and teal edge.
    { type: 'mesh', name: 'Amethyst', layers: [
      { x: 92, y: 8,  h: 195, s: 60, l: 68 },
      { x: 55, y: 5,  h: 25,  s: 70, l: 82 },
      { x: 35, y: 12, h: 345, s: 75, l: 75 },
      { x: 15, y: 35, h: 265, s: 80, l: 60 },
      { x: 55, y: 55, h: 280, s: 85, l: 55 },
      { x: 80, y: 75, h: 250, s: 75, l: 50 },
      { x: 20, y: 85, h: 255, s: 70, l: 45 },
    ] },
    // Dark navy top → red/crimson diagonal → cyan and magenta accents.
    { type: 'mesh', name: 'Eclipse', layers: [
      { x: 90, y: 10, h: 190, s: 85, l: 55 },
      { x: 50, y: 15, h: 230, s: 60, l: 25 },
      { x: 15, y: 10, h: 250, s: 55, l: 15 },
      { x: 8,  y: 60, h: 0,   s: 85, l: 45 },
      { x: 75, y: 70, h: 300, s: 85, l: 45 },
      { x: 45, y: 55, h: 250, s: 60, l: 25 },
      { x: 90, y: 90, h: 320, s: 70, l: 60 },
    ] },
    // Magenta/pink left → gold center → mint/cyan right — full-diagonal rainbow.
    { type: 'mesh', name: 'Spectrum', layers: [
      { x: 8,  y: 8,  h: 330, s: 90, l: 55 },
      { x: 30, y: 30, h: 350, s: 85, l: 60 },
      { x: 55, y: 15, h: 30,  s: 80, l: 65 },
      { x: 80, y: 10, h: 55,  s: 60, l: 75 },
      { x: 92, y: 45, h: 150, s: 55, l: 65 },
      { x: 90, y: 85, h: 175, s: 75, l: 60 },
      { x: 40, y: 80, h: 270, s: 65, l: 35 },
    ] },
    // Purple/blue wavy field with a warm orange band and a cyan base.
    { type: 'mesh', name: 'Tidal', layers: [
      { x: 15, y: 10, h: 35,  s: 80, l: 68 },
      { x: 50, y: 8,  h: 270, s: 75, l: 60 },
      { x: 85, y: 15, h: 250, s: 65, l: 30 },
      { x: 92, y: 55, h: 265, s: 70, l: 40 },
      { x: 55, y: 45, h: 280, s: 80, l: 45 },
      { x: 15, y: 65, h: 195, s: 85, l: 55 },
      { x: 50, y: 90, h: 190, s: 90, l: 48 },
    ] },
    // Deep indigo/navy field with a hot pink glowing core — dark, professional.
    { type: 'mesh', name: 'Midnight Glow', layers: [
      { x: 50, y: 8,  h: 280, s: 20, l: 12 },
      { x: 15, y: 25, h: 255, s: 30, l: 16 },
      { x: 85, y: 25, h: 255, s: 30, l: 16 },
      { x: 50, y: 45, h: 250, s: 45, l: 30 },
      { x: 55, y: 60, h: 330, s: 90, l: 48 },
      { x: 15, y: 75, h: 265, s: 25, l: 10 },
      { x: 85, y: 80, h: 260, s: 25, l: 12 },
    ] },
    // Magenta left → coral/gold center → cream → cyan right — bright diagonal.
    { type: 'mesh', name: 'Citrus Punch', layers: [
      { x: 8,  y: 12, h: 315, s: 90, l: 55 },
      { x: 30, y: 8,  h: 340, s: 85, l: 60 },
      { x: 55, y: 12, h: 20,  s: 80, l: 70 },
      { x: 78, y: 8,  h: 50,  s: 75, l: 82 },
      { x: 92, y: 40, h: 180, s: 65, l: 60 },
      { x: 85, y: 85, h: 185, s: 80, l: 55 },
      { x: 15, y: 85, h: 280, s: 60, l: 35 },
    ] },
  ];

  if (typeof window !== 'undefined') window.LUMSHOT_PRESETS = PRESETS;
  if (typeof module !== 'undefined' && module.exports) module.exports = PRESETS;
})();
