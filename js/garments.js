// Garment shapes, drawn flat as seen from the front.
// Units: roughly 1 unit = 66 cm. x > 0 is the viewer's right (the wearer's left).
// Each outline runs from the neck point down the right side to the bottom center;
// the left side is mirrored. A third value of 1 keeps a sharp corner.

// Long-sleeve body with arms hanging slightly out from the body.
function longSleeve({ neck = 0.16, chest = 0.40, hem = -0.60, shoulderY = 0.615,
  J = [0.43, 0.47], W = [0.70, -0.38], hw0 = 0.088, hw1 = 0.052 }) {
  const dx = W[0] - J[0], dy = W[1] - J[1], L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux; // n points away from the body
  const at = (t, s) => {
    const hw = hw0 + (hw1 - hw0) * t;
    return [J[0] + dx * t + s * nx * hw, J[1] + dy * t + s * ny * hw];
  };
  // where the inner edge of the sleeve meets the side of the body
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; (at(m, -1)[0] < chest ? lo = m : hi = m); }
  const tA = hi, pit = at(tA, -1);
  const top = at(0, 1);
  const pts = [
    [neck, 0.69, 1],
    [neck + (chest - neck) * 0.55, 0.655],
    [chest, shoulderY],
    [(chest + top[0]) / 2 + 0.012, (shoulderY + top[1]) / 2 + 0.012],
    top, at(0.25, 1), at(0.5, 1), at(0.75, 1),
    [...at(1, 1), 1], [...at(1, -1), 1],
    at(0.75, -1), at(0.5, -1), at(tA + (0.5 - tA) * 0.45, -1),
    [pit[0] + 0.004, pit[1] - 0.012],
    [chest - 0.003, pit[1] - 0.12],
    [chest - 0.006, 0.0],
    [chest - 0.002, -0.30],
    [chest + 0.004, hem, 1],
    [chest * 0.5, hem - 0.006],
    [0, hem - 0.009],
  ];
  return { pts, cuff: [at(1, 1), at(1, -1)], sleeveMid: at(0.42, 0), sleeveAngle: Math.atan2(dx, -dy) * 180 / Math.PI };
}

const ls = longSleeve({});
const crew = longSleeve({ neck: 0.165, chest: 0.43, hem: -0.61, shoulderY: 0.62, J: [0.46, 0.47], W: [0.74, -0.40], hw0: 0.098, hw1: 0.06 });
const hood = longSleeve({ neck: 0.175, chest: 0.44, hem: -0.62, shoulderY: 0.625, J: [0.47, 0.47], W: [0.755, -0.40], hw0: 0.10, hw1: 0.062 });

const teeOutline = [[0.165, 0.69, 1], [0.30, 0.655], [0.41, 0.605], [0.50, 0.545], [0.60, 0.45], [0.69, 0.335, 1], [0.585, 0.205, 1], [0.49, 0.27], [0.425, 0.325], [0.41, 0.22], [0.405, 0.05], [0.41, -0.30], [0.415, -0.60, 1], [0.2, -0.607], [0, -0.61]];
const ovsOutline = [[0.18, 0.70, 1], [0.33, 0.67], [0.47, 0.62], [0.55, 0.56], [0.66, 0.40], [0.765, 0.215, 1], [0.645, 0.08, 1], [0.55, 0.15], [0.475, 0.215], [0.462, 0.10], [0.46, -0.30], [0.47, -0.60, 1], [0.25, -0.605], [0, -0.607]];
const tankOutline = [[0.15, 0.69, 1], [0.25, 0.685, 1], [0.262, 0.62], [0.28, 0.52], [0.315, 0.42], [0.36, 0.345], [0.395, 0.30], [0.402, 0.20], [0.392, 0.0], [0.40, -0.30], [0.41, -0.60, 1], [0.2, -0.607], [0, -0.61]];

// Print spots. x/y are the center of the art, w its width. Back spots are in
// back-view coordinates (as you see the back of the shirt).
function spots(o = {}) {
  return {
    'Center chest': { side: 'front', x: 0, y: 0.33, w: 0.30, ...o.chest },
    'Left chest': { side: 'front', x: 0.16, y: 0.43, w: 0.10, ...o.left },
    'Full front': { side: 'front', x: 0, y: 0.12, w: 0.50, ...o.full },
    'Upper back': { side: 'back', x: 0, y: 0.50, w: 0.26, ...o.yoke },
    'Full back': { side: 'back', x: 0, y: 0.10, w: 0.54, ...o.back },
    ...(o.sleeve ? { 'Sleeve': { side: 'front', ...o.sleeve } } : {}),
    'Lower hem': { side: 'front', x: 0.27, y: -0.50, w: 0.08, ...o.hem },
  };
}

export const GARMENTS = {
  tee: {
    name: 'T-shirt',
    outline: teeOutline,
    frontNeck: [[0.165, 0.69], [0.13, 0.64], [0.07, 0.598], [0, 0.588]],
    backNeck: [[0.165, 0.69], [0.09, 0.662], [0, 0.652]],
    collar: 0.0135,
    stitches: [
      { a: [0.69, 0.335], b: [0.585, 0.205], insets: [0.022, 0.03] },
      { a: [0, -0.61], b: [0.415, -0.60], insets: [0.024, 0.032] },
    ],
    ribs: [],
    spots: spots({ sleeve: { x: 0.585, y: 0.39, w: 0.07, rot: 0 } }),
  },
  oversized: {
    name: 'Oversized tee',
    outline: ovsOutline,
    frontNeck: [[0.18, 0.70], [0.145, 0.655], [0.08, 0.613], [0, 0.603]],
    backNeck: [[0.18, 0.70], [0.10, 0.672], [0, 0.662]],
    collar: 0.018,
    stitches: [
      { a: [0.765, 0.215], b: [0.645, 0.08], insets: [0.026, 0.034] },
      { a: [0, -0.607], b: [0.47, -0.60], insets: [0.026, 0.034] },
    ],
    ribs: [],
    spots: spots({ chest: { y: 0.32, w: 0.32 }, full: { w: 0.56 }, back: { w: 0.6 }, left: { x: 0.18, y: 0.43 }, sleeve: { x: 0.65, y: 0.31, w: 0.08, rot: 0 } }),
  },
  longsleeve: {
    name: 'Long sleeve',
    outline: ls.pts,
    frontNeck: [[0.16, 0.69], [0.125, 0.64], [0.07, 0.6], [0, 0.59]],
    backNeck: [[0.16, 0.69], [0.09, 0.662], [0, 0.652]],
    collar: 0.0135,
    stitches: [{ a: [0, -0.609], b: [0.404, -0.60], insets: [0.024, 0.032] }],
    ribs: [{ a: ls.cuff[0], b: ls.cuff[1], w: 0.05 }],
    spots: spots({ sleeve: { x: ls.sleeveMid[0], y: ls.sleeveMid[1], w: 0.06, rot: -ls.sleeveAngle } }),
  },
  crewneck: {
    name: 'Crewneck',
    outline: crew.pts,
    frontNeck: [[0.165, 0.69], [0.13, 0.645], [0.075, 0.612], [0, 0.603]],
    backNeck: [[0.165, 0.69], [0.09, 0.664], [0, 0.655]],
    collar: 0.022,
    stitches: [],
    ribs: [{ a: crew.cuff[0], b: crew.cuff[1], w: 0.065 }, { a: [0, -0.619], b: [0.434, -0.61], w: 0.075 }],
    spots: spots({ chest: { y: 0.31, w: 0.32 }, full: { y: 0.10, w: 0.52 }, hem: { y: -0.44 }, sleeve: { x: crew.sleeveMid[0], y: crew.sleeveMid[1], w: 0.065, rot: -crew.sleeveAngle } }),
    fleece: true,
  },
  hoodie: {
    name: 'Hoodie',
    outline: hood.pts,
    frontNeck: [[0.175, 0.69], [0.15, 0.62], [0.09, 0.55], [0, 0.522]],
    backNeck: [[0.175, 0.69], [0.10, 0.668], [0, 0.66]],
    collar: 0.025,
    stitches: [],
    ribs: [{ a: hood.cuff[0], b: hood.cuff[1], w: 0.065 }, { a: [0, -0.629], b: [0.444, -0.62], w: 0.075 }],
    pocket: [[0, -0.15], [0.17, -0.15], [0.245, -0.36], [0.25, -0.54], [0, -0.54]],
    hood: [[0, 1.02], [0.12, 1.015], [0.22, 0.97], [0.275, 0.88], [0.285, 0.76], [0.25, 0.665], [0.15, 0.625], [0, 0.615]],
    strings: true,
    spots: spots({ chest: { y: 0.29, w: 0.30 }, full: { y: 0.18, w: 0.46 }, left: { x: 0.17, y: 0.41 }, yoke: { y: 0.46 }, hem: { x: 0.33, y: -0.47 }, sleeve: { x: hood.sleeveMid[0], y: hood.sleeveMid[1], w: 0.065, rot: -hood.sleeveAngle } }),
    fleece: true,
  },
  tank: {
    name: 'Tank top',
    outline: tankOutline,
    frontNeck: [[0.15, 0.69], [0.135, 0.60], [0.10, 0.525], [0.05, 0.488], [0, 0.48]],
    backNeck: [[0.15, 0.69], [0.11, 0.635], [0.05, 0.605], [0, 0.60]],
    collar: 0.009,
    binding: [[0.25, 0.685], [0.262, 0.62], [0.28, 0.52], [0.315, 0.42], [0.36, 0.345], [0.395, 0.30], [0.402, 0.25]],
    stitches: [{ a: [0, -0.61], b: [0.41, -0.60], insets: [0.024, 0.032] }],
    ribs: [],
    spots: spots({ chest: { y: 0.27, w: 0.28 }, left: { x: 0.15, y: 0.36, w: 0.09 }, full: { y: 0.06, w: 0.48 }, yoke: { y: 0.45, w: 0.22 } }),
  },
};

export const GARMENT_ORDER = ['tee', 'oversized', 'longsleeve', 'crewneck', 'hoodie', 'tank'];

export const FABRICS = {
  jersey: { name: 'Jersey cotton', sheen: 0.55, sheenRough: 0.5, bump: 1.0, grain: 1.0, wrinkle: 1.0 },
  heavy: { name: 'Heavyweight', sheen: 0.4, sheenRough: 0.65, bump: 1.5, grain: 1.7, wrinkle: 0.55 },
  fleece: { name: 'Fleece', sheen: 0.8, sheenRough: 0.85, bump: 0.6, grain: 0.6, wrinkle: 0.8 },
};

export const WASHES = { clean: 'Clean', vintage: 'Vintage wash', acid: 'Acid wash' };

export const COLORS = [
  ['White', '#F5F5F2'], ['Natural', '#ECE4D3'], ['Bone', '#DDD5C5'], ['Ash', '#D5D6D4'],
  ['Heather gray', '#B8BABC', 1], ['Charcoal heather', '#4A4C50', 1], ['Black', '#1A1A1C'], ['Navy', '#1E2943'],
  ['Royal', '#2A4DA5'], ['Carolina', '#8DB5DD'], ['Denim', '#4C6989'], ['Forest', '#24412F'],
  ['Military green', '#5A5D3B'], ['Sage', '#A5B198'], ['Mint', '#B7DCC7'], ['Maroon', '#5B1E2A'],
  ['Red', '#B2232C'], ['Coral', '#E6735E'], ['Pink', '#E8B3C2'], ['Lavender', '#B7A8D5'],
  ['Orange', '#D8672A'], ['Gold', '#DFA72E'], ['Butter', '#F0DD8E'], ['Sand', '#CBB794'], ['Brown', '#5A3E2D'],
];

export const FONTS = [
  { family: 'Anton', file: 'anton.woff2', label: 'Anton' },
  { family: 'Bebas Neue', file: 'bebas-neue.woff2', label: 'Bebas' },
  { family: 'Archivo Black', file: 'archivo-black.woff2', label: 'Archivo' },
  { family: 'UnifrakturMaguntia', file: 'unifraktur.woff2', label: 'Gothic' },
  { family: 'Permanent Marker', file: 'permanent-marker.woff2', label: 'Marker' },
  { family: 'Pacifico', file: 'pacifico.woff2', label: 'Script' },
  { family: 'Playfair Display', file: 'playfair-800i.woff2', label: 'Serif', style: 'italic', weight: 800 },
  { family: 'Rubik Mono One', file: 'rubik-mono.woff2', label: 'Mono wide' },
  { family: 'Space Mono', file: 'space-mono-700.woff2', label: 'Typewriter', weight: 700 },
];

export const FINISHES = { print: 'Screen print', puff: 'Puff', embroidery: 'Embroidery', distressed: 'Distressed' };

// The texture covers this square of garment space on every garment, so art keeps its spot when you switch.
export const SPAN = 1.7;
export const CY = 0.06;
