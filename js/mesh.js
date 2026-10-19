// Turns a flat garment outline into a 3D shell.
// The outline is filled with an even triangle mesh, then "inflated": the height at each point
// comes from solving a Poisson equation inside the outline, whose square root gives round
// cross-sections that match the local width (narrow sleeves stay thin, the body gets depth).
import * as THREE from 'three';
import Delaunator from '../vendor/delaunator.js';
import { SPAN, CY } from './garments.js';

const H = 0.0135; // target spacing between mesh points

// ---------- curve helpers ----------
const P = (x, y, c = false) => ({ x, y, c });

// Chaikin corner cutting on an open curve; points marked c (and both ends) stay put.
function chaikin(pts, iters = 3) {
  let p = pts.map((q, i) => ({ ...q, c: q.c || i === 0 || i === pts.length - 1 }));
  for (let k = 0; k < iters; k++) {
    const out = [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (a.c) out.push(a);
      out.push(P(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      out.push(P(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

// Even spacing along an open curve, keeping corners exactly.
function resample(curve, step) {
  const runs = [];
  let cur = [curve[0]];
  for (let i = 1; i < curve.length; i++) {
    cur.push(curve[i]);
    if (curve[i].c && i < curve.length - 1) { runs.push(cur); cur = [curve[i]]; }
  }
  runs.push(cur);
  const out = [];
  runs.forEach((run, ri) => {
    const cum = [0];
    for (let i = 1; i < run.length; i++) cum.push(cum[i - 1] + Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y));
    const L = cum[cum.length - 1];
    const n = Math.max(1, Math.round(L / step));
    let j = 0;
    const last = ri === runs.length - 1;
    for (let s = 0; s <= n; s++) {
      if (s === n && !last) break;
      const d = (s / n) * L;
      while (j < run.length - 2 && cum[j + 1] < d) j++;
      const t = (d - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      out.push(P(run[j].x + (run[j + 1].x - run[j].x) * t, run[j].y + (run[j + 1].y - run[j].y) * t, s === 0 || s === n));
    }
  });
  return out;
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- smooth value noise for wrinkles ----------
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function wrinkle(x, y, s) {
  // stretched noise reads as soft folds rather than lumps
  return (vnoise(x * 5.5, y * 3.2, s) - 0.5) * 0.6 + (vnoise(x * 11 + 3, y * 7, s + 7) - 0.5) * 0.3 + (vnoise(x * 23, y * 19, s + 13) - 0.5) * 0.1;
}

// ---------- shape building ----------
function bodyCurve(outline) {
  const right = outline.map(p => P(p[0], p[1], !!p[2]));
  const left = [];
  for (let i = right.length - 2; i >= 0; i--) left.push(P(-right[i].x, right[i].y, right[i].c));
  return chaikin([...right, ...left], 3); // right neck point → hem → left neck point
}
function neckCurve(half) {
  // left neck point → center → right neck point
  const r = half.map(p => P(p[0], p[1]));
  const pts = [];
  for (let i = 0; i < r.length; i++) pts.push(P(-r[i].x, r[i].y));
  for (let i = r.length - 2; i >= 0; i--) pts.push(P(r[i].x, r[i].y));
  return chaikin(pts, 3);
}

// Raster inside/outside mask of a polygon, for fast lookups.
function polyMask(poly, cell) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  minX -= cell; minY -= cell; maxX += cell; maxY += cell;
  const nx = Math.ceil((maxX - minX) / cell), ny = Math.ceil((maxY - minY) / cell);
  const m = new Uint8Array(nx * ny);
  const xs = [];
  for (let j = 0; j < ny; j++) {
    const y = minY + (j + 0.5) * cell;
    xs.length = 0;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[i], b = poly[k];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      const i0 = Math.max(0, Math.ceil((xs[t] - minX) / cell - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[t + 1] - minX) / cell - 0.5));
      for (let i = i0; i <= i1; i++) m[j * nx + i] = 1;
    }
  }
  return (x, y) => {
    const i = Math.floor((x - minX) / cell), j = Math.floor((y - minY) / cell);
    return i >= 0 && j >= 0 && i < nx && j < ny && m[j * nx + i] === 1;
  };
}

// Bucketed distance-to-curve test: is (x, y) closer than r to any segment?
function nearTest(curves, r) {
  const cell = r * 2, map = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  for (const { pts, closed } of curves) {
    const n = pts.length, m = closed ? n : n - 1;
    for (let s = 0; s < m; s++) {
      const a = pts[s], b = pts[(s + 1) % n];
      const i0 = Math.floor((Math.min(a.x, b.x) - r) / cell), i1 = Math.floor((Math.max(a.x, b.x) + r) / cell);
      const j0 = Math.floor((Math.min(a.y, b.y) - r) / cell), j1 = Math.floor((Math.max(a.y, b.y) + r) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j); let l = map.get(k); if (!l) map.set(k, l = []); l.push(a, b);
      }
    }
  }
  return (x, y) => {
    const l = map.get(key(Math.floor(x / cell), Math.floor(y / cell)));
    if (!l) return false;
    for (let s = 0; s < l.length; s += 2) {
      const a = l[s], b = l[s + 1], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - a.x - dx * t, y - a.y - dy * t) < r) return true;
    }
    return false;
  };
}

// Fill an outline (plus optional extra fixed curve inside it) with triangles and solve heights.
function fillAndInflate(boundary, outerPoly, inner = []) {
  const pts = [];
  const isB = [];
  for (const p of boundary) { pts.push(p.x, p.y); isB.push(1); }
  for (const p of inner) { pts.push(p.x, p.y); isB.push(0); }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outerPoly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const inside = polyMask(outerPoly, H / 4);
  const near = nearTest([{ pts: outerPoly, closed: true }, ...(inner.length ? [{ pts: inner, closed: false }] : [])], H * 0.6);
  const dy = H * Math.sqrt(3) / 2;
  let row = 0;
  for (let y = minY + dy / 2; y < maxY; y += dy, row++) {
    for (let x = minX + (row % 2 ? H / 2 : 0); x < maxX; x += H) {
      if (!inside(x, y) || near(x, y)) continue;
      pts.push(x, y); isB.push(0);
    }
  }
  const coords = new Float64Array(pts);
  const del = new Delaunator(coords);
  const tris = [];
  const maxE2 = (H * 2.6) ** 2;
  for (let t = 0; t < del.triangles.length; t += 3) {
    const a = del.triangles[t], b = del.triangles[t + 1], c = del.triangles[t + 2];
    const ax = coords[a * 2], ay = coords[a * 2 + 1], bx = coords[b * 2], by = coords[b * 2 + 1], cx = coords[c * 2], cy = coords[c * 2 + 1];
    const e1 = (ax - bx) ** 2 + (ay - by) ** 2, e2 = (bx - cx) ** 2 + (by - cy) ** 2, e3 = (cx - ax) ** 2 + (cy - ay) ** 2;
    if (e1 > maxE2 || e2 > maxE2 || e3 > maxE2) continue;
    if (!inside((ax + bx + cx) / 3, (ay + by + cy) / 3)) continue;
    // counter-clockwise (y up) so the front faces +z
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    tris.push(cross > 0 ? [a, b, c] : [a, c, b]);
  }
  // neighbours
  const n = isB.length;
  const nb = Array.from({ length: n }, () => new Set());
  for (const [a, b, c] of tris) { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + nb[i].size;
  const adj = new Int32Array(start[n]);
  for (let i = 0; i < n; i++) { let k = start[i]; for (const j of nb[i]) adj[k++] = j; }
  // Poisson: laplacian(h) = -1 with h = 0 on the outline, solved by over-relaxation
  const h = new Float64Array(n);
  const src = 0.25 * H * H;
  const w = 1.93;
  for (let it = 0; it < 1400; it++) {
    let delta = 0;
    for (let i = 0; i < n; i++) {
      if (isB[i]) continue;
      const deg = start[i + 1] - start[i];
      if (!deg) continue;
      let s = 0;
      for (let k = start[i]; k < start[i + 1]; k++) s += h[adj[k]];
      const nh = s / deg + src;
      const d = w * (nh - h[i]);
      h[i] += d;
      if (Math.abs(d) > delta) delta = Math.abs(d);
    }
    if (delta < 2e-8) break;
  }
  return { coords, tris, h, isB };
}

function makePanel(coords, tris, zOf, side) {
  const used = new Map();
  const pos = [], uv = [], idx = [];
  const vid = i => {
    let v = used.get(i);
    if (v === undefined) {
      v = used.size; used.set(i, v);
      const x = coords[i * 2], y = coords[i * 2 + 1];
      pos.push(x, y, zOf(i));
      uv.push(side === 'front' ? x / SPAN + 0.5 : 0.5 - x / SPAN, (y - CY) / SPAN + 0.5);
    }
    return v;
  };
  for (const [a, b, c] of tris) {
    if (side === 'front') idx.push(vid(a), vid(b), vid(c));
    else idx.push(vid(a), vid(c), vid(b));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildGarment(g, fabric) {
  const body = bodyCurve(g.outline);
  const backNeck = neckCurve(g.backNeck);
  const frontNeck = neckCurve(g.frontNeck);
  const outerPoly = [...body, ...backNeck.slice(1, -1)];
  const frontPoly = [...body, ...frontNeck.slice(1, -1)];

  const bodyS = resample(body, H);
  const backS = resample(backNeck, H).slice(1, -1);
  const scoop = resample(frontNeck, H);
  const scoopIn = scoop.slice(1, -1);
  const boundary = [...bodyS, ...backS];

  const { coords, tris, h } = fillAndInflate(boundary, outerPoly, scoopIn);
  const amp = 0.011 * fabric.wrinkle;
  const kF = 0.68, kB = 0.55;
  const depth = i => Math.sqrt(2 * Math.max(0, h[i]));
  const fold = (i, s) => {
    const d = depth(i);
    return amp * wrinkle(coords[i * 2], coords[i * 2 + 1], s) * Math.min(1, d / 0.06);
  };
  const zF = i => kF * depth(i) + fold(i, 1);
  const zB = i => -(kB * depth(i) + fold(i, 2));

  const inFront = polyMask(frontPoly, H / 4);
  const frontTris = tris.filter(([a, b, c]) => inFront(
    (coords[a * 2] + coords[b * 2] + coords[c * 2]) / 3,
    (coords[a * 2 + 1] + coords[b * 2 + 1] + coords[c * 2 + 1]) / 3));
  const front = makePanel(coords, frontTris, zF, 'front');
  const back = makePanel(coords, tris, zB, 'back');

  // nearest-vertex height lookup for trims that sit on the front
  const nBody = bodyS.length + backS.length;
  const scoopIndex = scoopIn.map((_, k) => nBody + k);
  const frontZAt = (x, y) => {
    let best = Infinity, z = 0;
    for (let i = 0; i < coords.length / 2; i++) {
      const d = (coords[i * 2] - x) ** 2 + (coords[i * 2 + 1] - y) ** 2;
      if (d < best) { best = d; z = zF(i); }
    }
    return z;
  };

  // collar: one loop around the front scoop and the back neckline
  const r = g.collar;
  const loop = [];
  loop.push(new THREE.Vector3(scoop[0].x, scoop[0].y, 0));
  scoopIndex.forEach((vi, k) => loop.push(new THREE.Vector3(scoopIn[k].x, scoopIn[k].y + r * 0.35, zF(vi) + r * 0.25)));
  loop.push(new THREE.Vector3(scoop[scoop.length - 1].x, scoop[scoop.length - 1].y, 0));
  for (let k = backS.length - 1; k >= 0; k--) loop.push(new THREE.Vector3(backS[k].x, backS[k].y - r * 0.2, -r * 0.6));
  const collar = new THREE.CatmullRomCurve3(loop, true, 'centripetal');

  // tank armhole binding
  const bindings = [];
  if (g.binding) {
    const near = (p) => { let bi = 0, bd = Infinity; bodyS.forEach((q, i) => { const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
    const i0 = near(g.binding[0]), i1 = near(g.binding[g.binding.length - 1]);
    const seg = bodyS.slice(Math.min(i0, i1), Math.max(i0, i1) + 1);
    for (const sgn of [1, -1]) bindings.push(new THREE.CatmullRomCurve3(seg.map(q => new THREE.Vector3(q.x * sgn, q.y, 0))));
  }

  // hoodie drawstrings
  const strings = [];
  if (g.strings) {
    for (const sgn of [-1, 1]) {
      let bi = 0, bd = Infinity;
      scoopIn.forEach((q, k) => { const d = Math.abs(q.x - sgn * 0.05) + (q.y > 0.6 ? 1 : 0); if (d < bd) { bd = d; bi = k; } });
      const s0 = scoopIn[bi];
      const z0 = zF(scoopIndex[bi]) + r * 0.8;
      const pts = [new THREE.Vector3(s0.x, s0.y, z0)];
      for (const [t, dx] of [[0.09, 0.006], [0.18, 0.012], [0.27, 0.016]]) {
        const x = s0.x + sgn * dx, y = s0.y - t;
        pts.push(new THREE.Vector3(x, y, frontZAt(x, y) + 0.012 + 0.01 * (1 - t / 0.27)));
      }
      strings.push(new THREE.CatmullRomCurve3(pts));
    }
  }

  // hood, folded down behind the neck
  let hood = null;
  if (g.hood) {
    const half = g.hood.map(p => P(p[0], p[1]));
    const curve = [];
    for (let i = 0; i < half.length; i++) curve.push(P(half[i].x, half[i].y));
    for (let i = half.length - 2; i >= 0; i--) curve.push(P(-half[i].x, half[i].y));
    const sm = chaikin(curve, 3);
    const poly = sm.slice(0, -1);
    const bs = resample(sm, H).slice(0, -1);
    const f = fillAndInflate(bs, poly);
    const hd = i => Math.sqrt(2 * Math.max(0, f.h[i]));
    hood = {
      front: makePanel(f.coords, f.tris, i => 0.42 * hd(i), 'front'),
      back: makePanel(f.coords, f.tris, i => -0.12 * hd(i), 'back'),
    };
  }

  const ribs = (g.ribs || []).flatMap(rb => [rb, { ...rb, a: [-rb.a[0], rb.a[1]], b: [-rb.b[0], rb.b[1]] }]);
  const stitches = (g.stitches || []).flatMap(st => [st, { ...st, a: [-st.a[0], st.a[1]], b: [-st.b[0], st.b[1]] }]);
  return { front, back, collar, collarR: r, bindings, strings, hood, outerPoly, frontPoly, ribs, stitches, pocket: g.pocket };
}
