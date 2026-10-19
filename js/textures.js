// Paints each side of the garment into canvases that become its textures:
// color (fabric color, washes, trims, your art), bump (knit grain, ribbing, puff and stitch relief)
// and roughness (ink is a little shinier than cotton, thread shinier still).
import { SPAN, CY, FONTS } from './garments.js';

const mk = (w, h = w) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// ---------- tileable noise ----------
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function tnoise(x, y, P, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = i => ((i % P) + P) % P;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(size, P0, oct, s) {
  const out = new Float32Array(size * size);
  let norm = 0, amp = 1;
  for (let o = 0; o < oct; o++) { norm += amp; amp *= 0.5; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, a = 1, P = P0;
    for (let o = 0; o < oct; o++) { v += a * tnoise(x / size * P, y / size * P, P, s + o * 31); a *= 0.5; P *= 2; }
    out[y * size + x] = v / norm;
  }
  return out;
}
function toCanvas(size, f) {
  const c = mk(size), g = c.getContext('2d'), im = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const [r, gg, b, a] = f(i); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = a; }
  g.putImageData(im, 0, 0);
  return c;
}

const tex = {};
function T(name) {
  if (tex[name]) return tex[name];
  const N = 512;
  if (name === 'grain') {
    const n = fbm(N, 96, 2, 3);
    tex.grain = toCanvas(N, i => { const v = 128 + (n[i] - 0.5) * 70 + (hash(i, 7, 1) - 0.5) * 60; return [v, v, v, 255]; });
  } else if (name === 'mottle') {
    const n = fbm(N, 5, 5, 11);
    tex.mottle = toCanvas(N, i => [255, 255, 255, Math.max(0, Math.min(255, (n[i] - 0.38) * 2.4 * 255))]);
  } else if (name === 'acid') {
    const n = fbm(N, 4, 5, 21), m = fbm(N, 9, 3, 23);
    tex.acid = toCanvas(N, i => {
      const r = 1 - Math.abs(2 * n[i] - 1), r2 = 1 - Math.abs(2 * m[i] - 1);
      const v = Math.pow(r, 3.2) * 0.75 + Math.pow(r2, 7) * 0.35;
      return [255, 255, 255, Math.min(255, v * 255)];
    });
  } else if (name === 'crack') {
    const n = fbm(N, 20, 3, 41), m = fbm(N, 7, 4, 43);
    tex.crack = toCanvas(N, i => {
      const ridge = 1 - Math.abs(2 * m[i] - 1);
      const hole = n[i] > 0.67 ? Math.min(1, (n[i] - 0.67) * 14) : 0;
      const line = ridge > 0.972 ? Math.min(1, (ridge - 0.972) * 45) : 0;
      return [0, 0, 0, Math.max(hole, line) * 255];
    });
  } else if (name === 'heather') {
    tex.heather = toCanvas(N, i => {
      const x = i % N, y = (i / N) | 0;
      const streak = tnoise(x / N * 300, y / N * 40, 300, 51);
      const r = hash(x, y, 53);
      if (r > 0.86 && streak > 0.5) return [255, 255, 255, 85];
      if (r < 0.12 && streak < 0.5) return [0, 0, 0, 70];
      return [0, 0, 0, 0];
    });
  } else if (name === 'thread') {
    const S = 48;
    tex.thread = toCanvas(S, i => {
      const x = i % S, y = (i / S) | 0, t = ((x + y) % 8) / 8;
      const v = Math.sin(t * Math.PI);
      return v > 0.5 ? [255, 255, 255, (v - 0.5) * 2 * 70] : [0, 0, 0, (0.5 - v) * 2 * 90];
    });
  } else if (name === 'threadBump') {
    const S = 48;
    tex.threadBump = toCanvas(S, i => { const x = i % S, y = (i / S) | 0, v = 140 + Math.sin(((x + y) % 8) / 8 * Math.PI) * 90; return [v, v, v, 255]; });
  }
  return tex[name];
}

// ---------- art layers ----------
export const fontOf = fam => FONTS.find(f => f.family === fam) || FONTS[0];
const fontCss = (fam, px) => { const f = fontOf(fam); return `${f.style || 'normal'} ${f.weight || 400} ${px}px "${f.family}"`; };

// Image with background knocked out and/or a single ink color applied.
const procCache = new Map();
function processed(layer, img) {
  const key = `${layer.assetId}|${layer.knockout || 0}|${layer.tint || ''}`;
  let c = procCache.get(key);
  if (c) return c;
  if (!layer.knockout && !layer.tint) return img;
  c = mk(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  if (layer.knockout) {
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data, W = c.width, Hh = c.height;
    // key color: the most common of the four corners
    const corners = [0, W - 1, (Hh - 1) * W, Hh * W - 1].map(p => [d[p * 4], d[p * 4 + 1], d[p * 4 + 2]]);
    let key3 = corners[0], best = -1;
    for (const a of corners) { const n = corners.filter(b => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40).length; if (n > best) { best = n; key3 = a; } }
    const tol = layer.knockout * 1.8, soft = 24;
    for (let p = 0; p < d.length; p += 4) {
      const dist = Math.hypot(d[p] - key3[0], d[p + 1] - key3[1], d[p + 2] - key3[2]);
      const a = Math.max(0, Math.min(1, (dist - tol) / soft));
      d[p + 3] = d[p + 3] * a;
    }
    g.putImageData(im, 0, 0);
  }
  if (layer.tint) { g.globalCompositeOperation = 'source-in'; g.fillStyle = layer.tint; g.fillRect(0, 0, c.width, c.height); }
  if (procCache.size > 24) procCache.delete(procCache.keys().next().value);
  procCache.set(key, c);
  return c;
}

// Text drawn at a given scale (pixels per garment unit), straight or on an arc.
const textCache = new Map();
export const clearTextCache = () => textCache.clear();
function textRaster(layer, ppu) {
  const key = JSON.stringify([layer.text, layer.font, layer.fill, layer.stroke, layer.strokeW, layer.spacing, layer.arc, layer.size, layer.align, Math.round(ppu)]);
  let r = textCache.get(key);
  if (r) return r;
  const fpx = Math.max(4, layer.size * ppu);
  const meas = mk(2).getContext('2d');
  meas.font = fontCss(layer.font, fpx);
  const sp = (layer.spacing || 0) * fpx;
  const sw = (layer.strokeW || 0) * fpx * 0.12;
  const asc = fpx * 0.82, desc = fpx * 0.26, lh = fpx * 1.08;
  const pad = sw + fpx * 0.12;
  const lines = String(layer.text || ' ').split('\n');
  const glyphs = []; // {ch, x, y, rot}
  const lineW = l => { let w = 0; const cs = [...l]; cs.forEach((ch, i) => { w += meas.measureText(ch).width + (i < cs.length - 1 ? sp : 0); }); return w; };
  const arc = (layer.arc || 0) * Math.PI / 180;
  if (Math.abs(arc) < 0.01 || lines.length > 1) {
    const widths = lines.map(lineW), maxW = Math.max(...widths, 1);
    lines.forEach((l, li) => {
      let x = layer.align === 'left' ? 0 : layer.align === 'right' ? maxW - widths[li] : (maxW - widths[li]) / 2;
      for (const ch of l) { const cw = meas.measureText(ch).width; glyphs.push({ ch, x: x + cw / 2, y: li * lh, rot: 0 }); x += cw + sp; }
    });
  } else {
    const l = lines[0], total = lineW(l), R = total / Math.abs(arc), up = arc > 0 ? 1 : -1;
    let s = -total / 2;
    for (const ch of l) {
      const cw = meas.measureText(ch).width, th = (s + cw / 2) / R;
      glyphs.push({ ch, x: R * Math.sin(th), y: up * (R - R * Math.cos(th)), rot: th * up });
      s += cw + sp;
    }
  }
  // bounds of every glyph box after rotation
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const gl of glyphs) {
    const cw = meas.measureText(gl.ch).width, c = Math.cos(gl.rot), s = Math.sin(gl.rot);
    for (const [px, py] of [[-cw / 2, -asc], [cw / 2, -asc], [-cw / 2, desc], [cw / 2, desc]]) {
      const X = gl.x + px * c - py * s, Y = gl.y + px * s + py * c;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
  }
  if (!glyphs.length) { x0 = 0; y0 = -asc; x1 = fpx * 0.3; y1 = desc; }
  const c = mk(x1 - x0 + pad * 2, y1 - y0 + pad * 2), g = c.getContext('2d');
  g.font = fontCss(layer.font, fpx);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  const pass = stroke => {
    for (const gl of glyphs) {
      g.save(); g.translate(gl.x - x0 + pad, gl.y - y0 + pad); g.rotate(gl.rot);
      if (stroke) g.strokeText(gl.ch, 0, 0); else g.fillText(gl.ch, 0, 0);
      g.restore();
    }
  };
  if (sw > 0) { g.strokeStyle = layer.stroke || '#000'; g.lineWidth = sw * 2; pass(true); }
  g.fillStyle = layer.fill || '#111'; pass(false);
  r = { canvas: c, w: c.width / ppu, h: c.height / ppu };
  if (textCache.size > 60) textCache.delete(textCache.keys().next().value);
  textCache.set(key, r);
  return r;
}

// Size of a layer in garment units.
export function layerSize(layer, images) {
  if (layer.type === 'text') { const r = textRaster(layer, 2048 / SPAN); return { w: r.w, h: r.h }; }
  const img = images.get(layer.assetId);
  const ar = img ? (img.naturalHeight || img.height) / (img.naturalWidth || img.width) : 1;
  return { w: layer.w, h: layer.w * ar };
}

// Is garment point (gx, gy) on this layer?
export function hitLayer(layer, images, gx, gy, slop = 0) {
  const { w, h } = layerSize(layer, images);
  const th = (layer.rot || 0) * Math.PI / 180;
  const dx = gx - layer.x, dy = gy - layer.y;
  const lx = dx * Math.cos(th) - dy * Math.sin(th), ly = dx * Math.sin(th) + dy * Math.cos(th);
  return Math.abs(lx) <= w / 2 + slop && Math.abs(ly) <= h / 2 + slop;
}

// Art for one layer, drawn into its own small canvas at the target's scale.
function scratch(layer, images, S) {
  const ppu = S / SPAN;
  let src, w, h;
  if (layer.type === 'text') { const r = textRaster(layer, ppu); src = r.canvas; w = r.w * ppu; h = r.h * ppu; }
  else {
    const img = images.get(layer.assetId);
    if (!img) return null;
    src = processed(layer, img);
    w = layer.w * ppu; h = w * (src.height || img.naturalHeight) / (src.width || img.naturalWidth);
  }
  const th = (layer.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const bw = w * c + h * s + 4, bh = w * s + h * c + 4;
  const cx = (layer.x / SPAN + 0.5) * S, cy = (0.5 - (layer.y - CY) / SPAN) * S;
  const cv = mk(bw, bh), g = cv.getContext('2d');
  g.translate(cv.width / 2, cv.height / 2); g.rotate(th); if (layer.flip) g.scale(-1, 1);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, -w / 2, -h / 2, w, h);
  return { cv, x: cx - cv.width / 2, y: cy - cv.height / 2, w, h, th };
}

function solid(sc, color) {
  const c = mk(sc.cv.width, sc.cv.height), g = c.getContext('2d');
  g.drawImage(sc.cv, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------- trims ----------
const toPx = (S, x, y) => [(x / SPAN + 0.5) * S, (0.5 - (y - CY) / SPAN) * S];
function pathPoly(g, S, poly) { g.beginPath(); poly.forEach((p, i) => { const [x, y] = toPx(S, p.x ?? p[0], p.y ?? p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
// inward normal of segment a→b (toward the garment's middle)
function inward(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  let nx = -dy / L, ny = dx / L;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  if ((0 - mx) * nx + (0.1 - my) * ny < 0) { nx = -nx; ny = -ny; }
  return [nx, ny, dx / L, dy / L, L];
}
function drawRibs(g, S, ribs, mode) {
  for (const rb of ribs) {
    const [nx, ny, tx, ty, L] = inward(rb.a, rb.b);
    const a = rb.a, b = rb.b, w = rb.w;
    const ext = 0.03; // run a little past the outline; the clip trims it
    const q = [[a[0] - tx * ext, a[1] - ty * ext], [b[0] + tx * ext, b[1] + ty * ext], [b[0] + tx * ext + nx * w, b[1] + ty * ext + ny * w], [a[0] - tx * ext + nx * w, a[1] - ty * ext + ny * w]];
    if (mode === 'map') {
      pathPoly(g, S, q); g.fillStyle = 'rgba(0,0,0,0.06)'; g.fill();
      g.beginPath(); g.moveTo(...toPx(S, q[3][0], q[3][1])); g.lineTo(...toPx(S, q[2][0], q[2][1]));
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = S / 1400; g.stroke();
    } else if (mode === 'bump') {
      const step = 0.0065, n = Math.ceil((L + ext * 2) / step);
      g.lineWidth = (step / SPAN) * S * 0.5;
      for (let i = 0; i <= n; i++) {
        const s = -ext + i * step, x = a[0] + tx * s, y = a[1] + ty * s;
        g.beginPath(); g.moveTo(...toPx(S, x, y)); g.lineTo(...toPx(S, x + nx * w, y + ny * w));
        g.strokeStyle = 'rgb(176,176,176)'; g.stroke();
      }
      g.beginPath(); g.moveTo(...toPx(S, q[3][0], q[3][1])); g.lineTo(...toPx(S, q[2][0], q[2][1]));
      g.strokeStyle = 'rgb(40,40,40)'; g.lineWidth = S / 900; g.stroke();
    }
  }
}
function drawStitches(g, S, stitches, mode) {
  const dash = (0.009 / SPAN) * S, gap = (0.004 / SPAN) * S;
  for (const st of stitches) {
    const [nx, ny, tx, ty] = inward(st.a, st.b);
    for (const ins of st.insets) {
      const a = [st.a[0] + nx * ins - tx * 0.03, st.a[1] + ny * ins - ty * 0.03], b = [st.b[0] + nx * ins + tx * 0.03, st.b[1] + ny * ins + ty * 0.03];
      g.beginPath(); g.moveTo(...toPx(S, ...a)); g.lineTo(...toPx(S, ...b));
      if (mode === 'map') { g.setLineDash([dash, gap]); g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = S / 1500; g.stroke(); g.setLineDash([]); }
      else if (mode === 'bump') {
        g.setLineDash([]); g.strokeStyle = 'rgb(96,96,96)'; g.lineWidth = S / 700; g.stroke();
        g.setLineDash([dash, gap]); g.strokeStyle = 'rgb(170,170,170)'; g.lineWidth = S / 1300; g.stroke(); g.setLineDash([]);
      }
    }
    if (mode === 'map') { // the fold of the hem
      const a = [st.a[0] + nx * st.insets[1] * 1.35 - tx * 0.03, st.a[1] + ny * st.insets[1] * 1.35 - ty * 0.03], b = [st.b[0] + nx * st.insets[1] * 1.35 + tx * 0.03, st.b[1] + ny * st.insets[1] * 1.35 + ty * 0.03];
      g.beginPath(); g.moveTo(...toPx(S, ...a)); g.lineTo(...toPx(S, ...b)); g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = S / 500; g.stroke();
    }
  }
}
function drawPocket(g, S, pocket, mode) {
  const full = [...pocket.map(p => [p[0], p[1]]), ...pocket.slice().reverse().map(p => [-p[0], p[1]])];
  const dash = (0.009 / SPAN) * S, gap = (0.004 / SPAN) * S;
  if (mode === 'map') {
    pathPoly(g, S, full); g.save(); g.clip();
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = S / 200; g.shadowOffsetY = S / 600;
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = S / 700; pathPoly(g, S, full); g.stroke(); g.restore();
    g.setLineDash([dash, gap]); g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = S / 1500;
    const inset = full.map(p => [p[0] * 0.965, (p[1] - (-0.345)) * 0.955 + (-0.345)]);
    pathPoly(g, S, inset); g.stroke(); g.setLineDash([]);
  } else if (mode === 'bump') {
    pathPoly(g, S, full); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
    g.strokeStyle = 'rgb(50,50,50)'; g.lineWidth = S / 600; g.stroke();
  }
}

// ---------- compositor ----------
const FINISH = {
  print: { bump: 'rgba(255,255,255,0.16)', rough: 'rgb(205,205,205)' },
  puff: { bump: 'rgba(255,255,255,1)', rough: 'rgb(232,232,232)' },
  embroidery: { bump: null, rough: 'rgb(150,150,150)' },
  distressed: { bump: 'rgba(255,255,255,0.08)', rough: 'rgb(225,225,225)' },
};

export class Compositor {
  constructor() { this.sides = {}; }
  canvases(side, S) {
    let s = this.sides[side];
    if (!s || s.S !== S) {
      s = this.sides[side] = { S, map: mk(S), bump: mk(S / 2), rough: mk(S / 2), resized: true };
    }
    return s;
  }

  render(side, { design, shape, images, S, guides, selectedId, fabric, heather }) {
    const cs = this.canvases(side, S);
    const layers = design.layers.filter(l => l.side === side && l.visible !== false);
    const m = cs.map.getContext('2d'), b = cs.bump.getContext('2d'), r = cs.rough.getContext('2d');
    const Sb = S / 2;
    const k = S / 2048;

    // fabric color
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1;
    m.fillStyle = design.color; m.fillRect(0, 0, S, S);
    if (heather) { const p = m.createPattern(T('heather'), 'repeat'); p.setTransform(new DOMMatrix().scale(k * 0.5)); m.fillStyle = p; m.fillRect(0, 0, S, S); }
    const grain = m.createPattern(T('grain'), 'repeat'); grain.setTransform(new DOMMatrix().scale(k));
    m.globalCompositeOperation = 'overlay'; m.globalAlpha = 0.12 * fabric.grain; m.fillStyle = grain; m.fillRect(0, 0, S, S);
    m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1;
    this.wash(m, S, design.wash, false);

    // bump base: knit grain
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1; b.filter = 'none';
    b.fillStyle = 'rgb(128,128,128)'; b.fillRect(0, 0, Sb, Sb);
    const bg = b.createPattern(T('grain'), 'repeat'); bg.setTransform(new DOMMatrix().scale(k * 0.5 * fabric.grain));
    b.globalAlpha = Math.min(1, 0.5 * fabric.grain); b.fillStyle = bg; b.fillRect(0, 0, Sb, Sb); b.globalAlpha = 1;
    r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'source-over'; r.globalAlpha = 1;
    r.fillStyle = fabric.sheen > 0.8 ? 'rgb(252,252,252)' : 'rgb(240,240,240)'; r.fillRect(0, 0, Sb, Sb);

    // trims, clipped to the garment
    for (const [g, s, mode] of [[m, S, 'map'], [b, Sb, 'bump']]) {
      g.save(); pathPoly(g, s, shape.outerPoly); g.clip();
      drawRibs(g, s, shape.ribs, mode);
      drawStitches(g, s, shape.stitches, mode);
      if (shape.pocket && side === 'front') drawPocket(g, s, shape.pocket, mode);
      g.restore();
    }

    // art
    for (const layer of layers) {
      const sc = scratch(layer, images, S);
      if (!sc) continue;
      const fin = layer.finish || 'print';
      const g = sc.cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (fin === 'distressed') {
        g.globalCompositeOperation = 'destination-out';
        const p = g.createPattern(T('crack'), 'repeat'); p.setTransform(new DOMMatrix().scale(k * 0.5));
        g.fillStyle = p; g.fillRect(0, 0, sc.cv.width, sc.cv.height);
      } else if (fin === 'embroidery') {
        g.globalCompositeOperation = 'source-atop';
        const p = g.createPattern(T('thread'), 'repeat'); p.setTransform(new DOMMatrix().scale(k * 0.55).rotate((layer.rot || 0) + 20));
        g.fillStyle = p; g.fillRect(0, 0, sc.cv.width, sc.cv.height);
      }
      g.globalCompositeOperation = 'source-over';
      m.save();
      m.globalAlpha = layer.opacity ?? 1;
      if (fin === 'embroidery' || fin === 'puff') {
        m.shadowColor = fin === 'puff' ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.4)';
        m.shadowBlur = (fin === 'puff' ? 5 : 2.2) * k; m.shadowOffsetY = (fin === 'puff' ? 2.5 : 1.1) * k; m.shadowOffsetX = 0.5 * k;
      }
      m.drawImage(sc.cv, sc.x, sc.y);
      m.restore();

      // relief and shine
      const f = FINISH[fin];
      b.save(); b.globalAlpha = (layer.opacity ?? 1);
      if (fin === 'puff') { b.filter = `blur(${Math.max(1, 3 * k)}px)`; b.drawImage(solid(sc, f.bump), sc.x / 2, sc.y / 2, sc.cv.width / 2, sc.cv.height / 2); b.filter = 'none'; }
      else if (fin === 'embroidery') {
        const c2 = mk(sc.cv.width, sc.cv.height), g2 = c2.getContext('2d');
        g2.drawImage(sc.cv, 0, 0); g2.globalCompositeOperation = 'source-in';
        const p = g2.createPattern(T('threadBump'), 'repeat'); p.setTransform(new DOMMatrix().scale(k * 0.55).rotate((layer.rot || 0) + 20));
        g2.fillStyle = p; g2.fillRect(0, 0, c2.width, c2.height);
        b.drawImage(c2, sc.x / 2, sc.y / 2, c2.width / 2, c2.height / 2);
      } else b.drawImage(solid(sc, f.bump), sc.x / 2, sc.y / 2, sc.cv.width / 2, sc.cv.height / 2);
      b.restore();
      r.save(); r.globalAlpha = layer.opacity ?? 1; r.drawImage(solid(sc, f.rough), sc.x / 2, sc.y / 2, sc.cv.width / 2, sc.cv.height / 2); r.restore();
    }

    this.wash(m, S, design.wash, true);
    // a whisper of knit over the ink so prints sit in the fabric
    m.globalCompositeOperation = 'overlay'; m.globalAlpha = 0.1 * fabric.grain; m.fillStyle = grain; m.fillRect(0, 0, S, S);
    m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1;

    if (guides && selectedId) {
      const layer = layers.find(l => l.id === selectedId);
      if (layer) this.guide(m, S, layer, images);
    }
    const resized = cs.resized; cs.resized = false;
    return { ...cs, resized };
  }

  wash(m, S, wash, after) {
    if (!wash || wash === 'clean') return;
    m.save();
    if (wash === 'vintage') {
      if (!after) { m.globalCompositeOperation = 'saturation'; m.globalAlpha = 0.28; m.fillStyle = '#808080'; m.fillRect(0, 0, S, S); }
      m.globalCompositeOperation = 'soft-light'; m.globalAlpha = after ? 0.2 : 0.45; m.drawImage(T('mottle'), 0, 0, S, S);
      m.globalCompositeOperation = 'screen'; m.globalAlpha = after ? 0.06 : 0.12; m.drawImage(T('mottle'), 0, 0, S, S);
    } else if (wash === 'acid' && !after) {
      m.globalCompositeOperation = 'saturation'; m.globalAlpha = 0.3; m.fillStyle = '#808080'; m.fillRect(0, 0, S, S);
      m.globalCompositeOperation = 'screen'; m.globalAlpha = 0.5; m.drawImage(T('acid'), 0, 0, S, S);
      m.globalCompositeOperation = 'soft-light'; m.globalAlpha = 0.5; m.drawImage(T('mottle'), 0, 0, S, S);
    }
    m.restore();
  }

  guide(m, S, layer, images) {
    const { w, h } = layerSize(layer, images);
    const ppu = S / SPAN, [cx, cy] = toPx(S, layer.x, layer.y), k = S / 2048;
    m.save(); m.translate(cx, cy); m.rotate((layer.rot || 0) * Math.PI / 180);
    const W = w * ppu, Hh = h * ppu;
    m.lineWidth = 2.4 * k; m.strokeStyle = 'rgba(255,255,255,0.95)'; m.shadowColor = 'rgba(0,0,0,0.6)'; m.shadowBlur = 3 * k;
    m.setLineDash([9 * k, 6 * k]); m.strokeRect(-W / 2, -Hh / 2, W, Hh); m.setLineDash([]);
    m.fillStyle = '#e0452f'; m.shadowBlur = 2 * k;
    const hs = 9 * k;
    for (const [x, y] of [[-W / 2, -Hh / 2], [W / 2, -Hh / 2], [W / 2, Hh / 2], [-W / 2, Hh / 2]]) { m.fillRect(x - hs / 2, y - hs / 2, hs, hs); }
    m.restore();
  }
}

// Small textures for the ribbed collar and cuffs.
export function ribTexture() {
  const c = mk(64, 8), g = c.getContext('2d');
  for (let x = 0; x < 64; x++) { const v = 128 + Math.sin(x / 64 * Math.PI * 8) * 100; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 8); }
  return c;
}
