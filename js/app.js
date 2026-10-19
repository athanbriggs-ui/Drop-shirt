import { GARMENTS, GARMENT_ORDER, FABRICS, WASHES, COLORS, FONTS, FINISHES } from './garments.js';
import { buildGarment } from './mesh.js';
import { Compositor, layerSize, hitLayer, clearTextCache } from './textures.js';
import { Stage, LIGHTS, BACKDROPS } from './scene.js';
import * as store from './store.js';
import * as ex from './export.js';

const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const slug = s => (s || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
const INCH = 26; // garment units → inches of print width

const INKS = [['Black', '#111111'], ['White', '#FFFFFF'], ['Cream', '#EFE6D2'], ['Red', '#C8282E'], ['Navy', '#1D2A4D'], ['Gold', '#D8A33A'], ['Forest', '#2D4A35'], ['Pink', '#EBA6BE'], ['Sky', '#8DB5DD']];
const ICON = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
};
const svg = (p, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

// ---------- state ----------
const S = { design: null, assets: {}, selected: null, side: 'front', tab: 'art', undo: [], redo: [], view: 'front', thumb: null, result: null };
const images = new Map();
let stage, comp, shape, HI = 2048;
const shapes = new Map();

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function textLayer(d, o = {}) {
  return { id: uid(), type: 'text', side: 'front', text: 'Your brand', font: 'Anton', size: 0.075, fill: luminance(d.color) < 0.45 ? '#FFFFFF' : '#111111', autoInk: true, stroke: '#111111', strokeW: 0, spacing: 0.02, arc: 0, align: 'center', x: 0, y: 0.33, rot: 0, opacity: 1, finish: 'print', visible: true, ...o };
}
function newDesign(name = 'Drop 01', first = false) {
  const d = {
    id: uid(), name, created: Date.now(), updated: Date.now(),
    garment: 'tee', color: '#F5F5F2', colorName: 'White', heather: false, fabric: 'jersey', wash: 'clean', layers: [],
    scene: { bg: 'paper', bgColor: '#E6E5E1', light: 'studio', shadow: 'floor' },
    exp: { photo: 'portrait', transparent: false, motion: 'spin', seconds: 6, vsize: 'portrait', colorway: ['#F5F5F2', '#1A1A1C', '#B8BABC', '#1E2943'] },
  };
  if (first) d.layers.push(textLayer(d));
  return d;
}
function migrate(d) {
  const base = newDesign(d.name);
  return { ...base, ...d, scene: { ...base.scene, ...d.scene }, exp: { ...base.exp, ...d.exp }, layers: d.layers || [] };
}
const layer = id => S.design.layers.find(l => l.id === id);
// text you haven't recolored follows the garment: dark ink on light shirts, white on dark
function autoInk() { const light = luminance(S.design.color) >= 0.45; for (const l of S.design.layers) if (l.type === 'text' && l.autoInk) l.fill = light ? '#111111' : '#FFFFFF'; }
const sel = () => layer(S.selected);

// ---------- shape + textures ----------
function shapeFor(d) {
  const key = d.garment + '|' + d.fabric;
  if (!shapes.has(key)) shapes.set(key, buildGarment(GARMENTS[d.garment], FABRICS[d.fabric]));
  return shapes.get(key);
}
function applyShape() {
  shape = shapeFor(S.design);
  stage.setShape(shape);
  applyFabric();
  queueTex();
}
function applyFabric() { stage.setFabric(S.design.color, FABRICS[S.design.fabric], S.design.wash); }
function applyScene() {
  const sc = S.design.scene;
  stage.backdrop({ id: sc.bg, color: sc.bgColor });
  stage.light(sc.light);
  stage.shadow(sc.shadow);
}

let texPending = new Set(), texRaf = 0, hiTimer = 0, exporting = false;
const guidesOn = () => S.tab === 'art' && !!S.selected && !exporting;
function paint(side, size, guides) {
  const cs = comp.render(side, { design: S.design, shape, images, S: size, guides, selectedId: S.selected, fabric: FABRICS[S.design.fabric], heather: S.design.heather });
  stage.setTextures(side, cs);
}
function queueTex(sides = ['front', 'back']) {
  sides.forEach(s => texPending.add(s));
  if (!texRaf) texRaf = requestAnimationFrame(flushTex);
  clearTimeout(hiTimer);
  hiTimer = setTimeout(() => { if (HI > 2048 && stage.framed === false && !exporting) { paint('front', HI, guidesOn()); paint('back', HI, guidesOn()); } }, 1200);
}
function flushTex() {
  texRaf = 0;
  if (exporting) return;
  for (const side of texPending) paint(side, 2048, guidesOn());
  texPending.clear();
}
function paintNow() { cancelAnimationFrame(texRaf); texRaf = 0; texPending.clear(); paint('front', 2048, guidesOn()); paint('back', 2048, guidesOn()); }

const fontsReady = new Set();
function ensureFonts() {
  for (const l of S.design.layers) {
    if (l.type !== 'text' || fontsReady.has(l.font)) continue;
    const f = FONTS.find(x => x.family === l.font) || FONTS[0];
    fontsReady.add(l.font);
    document.fonts.load(`${f.style || 'normal'} ${f.weight || 400} 40px "${f.family}"`).then(() => { clearTextCache(); queueTex(); refreshOutputs(); }).catch(() => {});
  }
}

async function loadAsset(id) {
  if (images.has(id) || !S.assets[id]) return;
  const img = new Image();
  img.src = S.assets[id];
  try { await img.decode(); images.set(id, img); } catch { /* broken image: layer is skipped */ }
}

// ---------- history + saving ----------
let lastSnap = null, saveT = 0;
const snapshot = () => JSON.stringify(S.design);
function commit() {
  const snap = snapshot();
  if (snap === lastSnap) return;
  if (lastSnap) S.undo.push(lastSnap);
  if (S.undo.length > 60) S.undo.shift();
  S.redo = []; lastSnap = snap;
  scheduleSave(); renderTop();
}
function restore(snap) {
  const prev = S.design;
  S.design = JSON.parse(snap);
  if (!sel()) S.selected = S.design.layers.at(-1)?.id || null;
  if (prev.garment !== S.design.garment || prev.fabric !== S.design.fabric) applyShape();
  applyFabric(); applyScene(); ensureFonts(); queueTex(); renderAll(); scheduleSave();
}
function undo() { if (!S.undo.length) return; S.redo.push(lastSnap); lastSnap = S.undo.pop(); restore(lastSnap); }
function redo() { if (!S.redo.length) return; S.undo.push(lastSnap); lastSnap = S.redo.pop(); restore(lastSnap); }
function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(saveNow, 700); }
async function saveNow() {
  clearTimeout(saveT);
  const d = S.design; d.updated = Date.now();
  const assets = {};
  for (const l of d.layers) if (l.assetId && S.assets[l.assetId]) assets[l.assetId] = S.assets[l.assetId];
  try { await store.saveDesign({ ...d, assets, thumb: S.thumb }); await store.setMeta('current', d.id); }
  catch (e) { toast('Couldn’t save on this device. Storage may be full.'); console.error(e); }
}
async function makeThumb() {
  exporting = true; paint('front', 2048, false); paint('back', 2048, false);
  S.thumb = stage.still(400, 500).toDataURL('image/jpeg', 0.82);
  exporting = false; paintNow();
}

// ---------- open / new ----------
async function openRecord(rec) {
  const { assets = {}, thumb, ...d } = rec;
  S.design = migrate(d); S.assets = assets; S.thumb = thumb || null;
  images.clear();
  await Promise.all(Object.keys(assets).map(loadAsset));
  afterOpen();
}
function afterOpen() {
  S.selected = S.design.layers.at(-1)?.id || null;
  S.undo = []; S.redo = []; lastSnap = snapshot();
  S.side = 'front'; S.view = 'front';
  applyShape(); applyScene(); ensureFonts();
  stage.turn(0, false); stage.frame(false);
  renderAll();
  store.setMeta('current', S.design.id).catch(() => {});
}
async function nextName() {
  const list = await store.listDesigns().catch(() => []);
  return `Drop ${String(list.length + 1).padStart(2, '0')}`;
}

// ---------- rendering the panels ----------
function garmentIcon(k) {
  const g = GARMENTS[k];
  const right = g.outline.map(p => [p[0], p[1]]);
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  const nk = g.frontNeck.map(p => [p[0], p[1]]);
  const neckL = nk.slice(1).map(([x, y]) => [-x, y]);
  const neckR = nk.slice(1, -1).reverse();
  const d = 'M' + [...right, ...left, ...neckL, ...neckR].map(([x, y]) => `${x.toFixed(3)} ${(-y).toFixed(3)}`).join('L') + 'Z';
  let hood = '';
  if (g.hood) { const h = g.hood.map(p => [p[0], p[1]]); const all = [...h, ...h.slice(0, -1).reverse().map(([x, y]) => [-x, y])]; hood = `<path vector-effect="non-scaling-stroke" d="M${all.map(([x, y]) => `${x} ${-y}`).join('L')}Z"/>`; }
  return `<svg viewBox="-0.82 -0.98 1.64 1.66" aria-hidden="true">${hood}<path vector-effect="non-scaling-stroke" d="${d}"/></svg>`;
}

function renderTop() {
  $('#design-name').textContent = S.design.name;
  $('#undo-btn').disabled = !S.undo.length;
  $('#redo-btn').disabled = !S.redo.length;
}
function renderTabs() {
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === 'panel-' + S.tab));
}
const pressed = v => `aria-pressed="${!!v}"`;

function renderGarment() {
  const d = S.design;
  $('#panel-garment').innerHTML = `
    <h3>Garment</h3>
    <div class="garments">${GARMENT_ORDER.map(k => `<button type="button" class="gcard" data-action="garment" data-id="${k}" ${pressed(d.garment === k)}>${garmentIcon(k)}<span>${GARMENTS[k].name}</span></button>`).join('')}</div>
    <h3>Fabric</h3>
    <div class="seg">${Object.entries(FABRICS).map(([k, f]) => `<button type="button" data-action="fabric" data-id="${k}" ${pressed(d.fabric === k)}>${f.name}</button>`).join('')}</div>
    <h3>Wash</h3>
    <div class="seg">${Object.entries(WASHES).map(([k, n]) => `<button type="button" data-action="wash" data-id="${k}" ${pressed(d.wash === k)}>${n}</button>`).join('')}</div>`;
}

function renderColor() {
  const d = S.design;
  const custom = !COLORS.some(c => c[1].toLowerCase() === d.color.toLowerCase());
  $('#panel-color').innerHTML = `
    <h3>Garment color</h3>
    <div class="picked"><b>${esc(custom ? 'Custom' : d.colorName)}</b><span>${d.color.toUpperCase()}</span></div>
    <div class="swatches">${COLORS.map(([n, h, hz]) => `<button type="button" class="sw${hz ? ' heather' : ''}" style="--c:${h}" data-action="color" data-hex="${h}" data-name="${esc(n)}" data-heather="${hz ? 1 : 0}" aria-label="${esc(n)}" title="${esc(n)}" ${pressed(!custom && d.color.toLowerCase() === h.toLowerCase())}></button>`).join('')}
      <label class="sw custom" title="Pick any color" ${pressed(custom)}><input type="color" data-input="garment-color" value="${d.color}" aria-label="Custom garment color"></label></div>
    <label class="toggle"><span>Heather texture</span><input type="checkbox" data-input="heather" ${d.heather ? 'checked' : ''}></label>`;
}

function slider(key, label, min, max, step, val, out) {
  return `<div class="slider"><label for="s-${key}">${label}</label><output id="o-${key}">${out}</output><input id="s-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-slider="${key}"></div>`;
}
function fmt(key, L) {
  switch (key) {
    case 'size': return `${(layerSize(L, images).w * INCH).toFixed(1)} in wide`;
    case 'rot': return `${Math.round(L.rot || 0)}°`;
    case 'opacity': return `${Math.round((L.opacity ?? 1) * 100)}%`;
    case 'knockout': return L.knockout ? String(Math.round(L.knockout)) : 'Off';
    case 'strokeW': return L.strokeW ? `${Math.round(L.strokeW * 100)}` : 'None';
    case 'spacing': return `${Math.round((L.spacing || 0) * 100)}`;
    case 'arc': return L.arc ? `${Math.round(L.arc)}°` : 'Straight';
  }
  return '';
}
function inkRow(action, current, allowNone) {
  const isCustom = current && !INKS.some(i => i[1].toLowerCase() === current.toLowerCase());
  return `<div class="swatches">${allowNone ? `<button type="button" class="sw small none" data-action="${action}" data-hex="" aria-label="Original colors" title="Original colors" ${pressed(!current)}></button>` : ''}${INKS.map(([n, h]) => `<button type="button" class="sw small" style="--c:${h}" data-action="${action}" data-hex="${h}" aria-label="${n}" title="${n}" ${pressed(current && current.toLowerCase() === h.toLowerCase())}></button>`).join('')}<label class="sw small custom" title="Pick any color" ${pressed(isCustom)}><input type="color" data-input="${action}" value="${current || '#111111'}" aria-label="Custom ink color"></label></div>`;
}

function renderArt() {
  const d = S.design, L = sel();
  const list = d.layers.slice().reverse();
  const rows = list.map(l => {
    const thumb = l.type === 'image'
      ? (S.assets[l.assetId] ? `<img src="${S.assets[l.assetId]}" alt="">` : '')
      : `<span style="font-family:'${esc(l.font)}';color:${l.fill}">Aa</span>`;
    return `<li class="layer${l.id === S.selected ? ' on' : ''}${l.visible === false ? ' hidden-l' : ''}">
      <span class="lthumb">${thumb}</span>
      <button type="button" class="lname" data-action="select" data-id="${l.id}"><b>${esc(l.type === 'text' ? l.text.replace(/\n/g, ' ') : l.name || 'Image')}</b><small>${l.side === 'front' ? 'Front' : 'Back'}, ${FINISHES[l.finish || 'print'].toLowerCase()}</small></button>
      <button type="button" class="iconbtn" data-action="toggle-vis" data-id="${l.id}" aria-label="${l.visible === false ? 'Show' : 'Hide'}">${svg(l.visible === false ? ICON.eyeOff : ICON.eye)}</button>
      <button type="button" class="iconbtn" data-action="layer-up" data-id="${l.id}" aria-label="Bring forward" ${l === list[0] ? 'disabled' : ''}>${svg(ICON.up)}</button>
    </li>`;
  }).join('');
  let editor = '';
  if (L) {
    const spots = GARMENTS[d.garment].spots;
    const isText = L.type === 'text';
    const sizeMin = isText ? 0.015 : 0.02, sizeMax = isText ? 0.3 : 0.75, sizeVal = isText ? L.size : L.w;
    editor = `<div class="editor">
      ${isText ? `
        <h3>Text</h3>
        <label class="field"><span>Words</span><textarea data-input="text" rows="2" spellcheck="false">${esc(L.text)}</textarea></label>
        <div class="fonts">${FONTS.map(f => `<button type="button" data-action="font" data-id="${esc(f.family)}" style="font-family:'${esc(f.family)}';font-style:${f.style || 'normal'};font-weight:${f.weight || 400}" ${pressed(L.font === f.family)}>${f.label}</button>`).join('')}</div>
        <h3>Ink</h3>
        ${inkRow('fill', L.fill, false)}
        ${slider('strokeW', 'Outline', 0, 1, 0.01, L.strokeW || 0, fmt('strokeW', L))}
        ${L.strokeW ? inkRow('stroke', L.stroke, false) : ''}
        ${slider('spacing', 'Letter spacing', -0.05, 0.5, 0.005, L.spacing || 0, fmt('spacing', L))}
        ${slider('arc', 'Curve', -180, 180, 1, L.arc || 0, fmt('arc', L))}`
      : `
        <h3>Image</h3>
        ${slider('knockout', 'Remove background', 0, 100, 1, L.knockout || 0, fmt('knockout', L))}
        <p class="sub">Clears the color in the corners of your file, like a white box around a logo.</p>
        <h3>Ink color</h3>
        ${inkRow('tint', L.tint, true)}`}
      <h3>Finish</h3>
      <div class="seg">${Object.entries(FINISHES).map(([k, n]) => `<button type="button" data-action="finish" data-id="${k}" ${pressed((L.finish || 'print') === k)}>${n}</button>`).join('')}</div>
      <h3>Placement</h3>
      <div class="chips">${Object.keys(spots).map(k => `<button type="button" class="chip" data-action="place" data-id="${esc(k)}">${k}</button>`).join('')}</div>
      ${slider('size', 'Size', sizeMin, sizeMax, 0.001, sizeVal, fmt('size', L))}
      ${slider('rot', 'Rotate', -180, 180, 1, L.rot || 0, fmt('rot', L))}
      ${slider('opacity', 'Opacity', 0.1, 1, 0.01, L.opacity ?? 1, fmt('opacity', L))}
      <div class="row-btns">
        <button type="button" class="btn" data-action="center">Center</button>
        ${!isText ? '<button type="button" class="btn" data-action="flip">Flip</button>' : ''}
        <button type="button" class="btn" data-action="move-side">Move to ${L.side === 'front' ? 'back' : 'front'}</button>
      </div>
      <div class="row-btns">
        <button type="button" class="btn" data-action="duplicate">Duplicate</button>
        <button type="button" class="btn danger" data-action="delete">Delete</button>
      </div>
    </div>`;
  }
  $('#panel-art').innerHTML = `
    <div class="art-head"><div class="seg" role="group" aria-label="Side to add art to">
      <button type="button" data-action="side" data-id="front" ${pressed(S.side === 'front')}>Front</button>
      <button type="button" data-action="side" data-id="back" ${pressed(S.side === 'back')}>Back</button></div></div>
    <div class="add-row">
      <button type="button" class="btn" data-action="add-image">${svg(ICON.image)}Add image</button>
      <button type="button" class="btn" data-action="add-text">${svg(ICON.text)}Add text</button>
    </div>
    ${rows ? `<ul class="layers">${rows}</ul>` : '<p class="empty">Add your artwork or a line of text to start. PNGs with a transparent background look best.</p>'}
    ${editor}`;
}
function refreshOutputs() {
  const L = sel(); if (!L) return;
  for (const k of ['size', 'rot', 'opacity', 'knockout', 'strokeW', 'spacing', 'arc']) {
    const o = document.getElementById('o-' + k); if (o) o.textContent = fmt(k, L);
  }
  const sz = document.getElementById('s-size'); if (sz && document.activeElement !== sz) sz.value = L.type === 'text' ? L.size : L.w;
  const rt = document.getElementById('s-rot'); if (rt && document.activeElement !== rt) rt.value = L.rot || 0;
}

function renderScene() {
  const sc = S.design.scene;
  const bgSw = Object.entries(BACKDROPS).map(([k, b]) => {
    const c = b.clear ? '' : b.grad ? `linear-gradient(${b.grad[0]}, ${b.grad[1]})` : b.color;
    return `<button type="button" class="sw${b.clear ? ' none' : ''}" style="--c:${c}" data-action="bg" data-id="${k}" aria-label="${b.name}" title="${b.name}" ${pressed(sc.bg === k)}></button>`;
  }).join('');
  $('#panel-scene').innerHTML = `
    <h3>Backdrop</h3>
    <div class="swatches">${bgSw}<label class="sw custom" title="Pick any color" ${pressed(sc.bg === 'custom')}><input type="color" data-input="bg-color" value="${sc.bgColor}" aria-label="Custom backdrop color"></label></div>
    <h3>Light</h3>
    <div class="chips">${Object.entries(LIGHTS).map(([k, l]) => `<button type="button" class="chip" data-action="light" data-id="${k}" ${pressed(sc.light === k)}>${l.name}</button>`).join('')}</div>
    <h3>Shadow</h3>
    <div class="seg">${[['floor', 'On the floor'], ['wall', 'On a wall'], ['none', 'None']].map(([k, n]) => `<button type="button" data-action="shadow" data-id="${k}" ${pressed(sc.shadow === k)}>${n}</button>`).join('')}</div>
    <p class="sub" style="margin-top:12px">Drag the shirt to turn it, pinch or scroll to zoom, two fingers to move it in the frame.</p>`;
}

function renderExport() {
  const e = S.design.exp;
  const vt = ex.videoType();
  $('#panel-export').innerHTML = `
    <h3>Photo</h3>
    <div class="chips">${Object.entries(ex.PHOTO_SIZES).map(([k, s]) => `<button type="button" class="chip" data-action="exp" data-key="photo" data-id="${k}" ${pressed(e.photo === k)}>${s.name}</button>`).join('')}</div>
    <label class="toggle"><span>Transparent background</span><input type="checkbox" data-input="transparent" ${e.transparent ? 'checked' : ''}></label>
    <button type="button" class="btn primary wide" data-action="export-photo">Save photo</button>
    <h3>Video</h3>
    ${vt ? `<p class="sub">Saves as ${vt.ext.toUpperCase()}.</p>` : '<p class="sub">This browser can’t record video. Chrome on Android or a computer can.</p>'}
    <div class="chips">${Object.entries(ex.MOTIONS).map(([k, n]) => `<button type="button" class="chip" data-action="exp" data-key="motion" data-id="${k}" ${pressed(e.motion === k)}>${n}</button>`).join('')}</div>
    <div class="chips" style="margin-top:8px">${[4, 6, 8, 10].map(s => `<button type="button" class="chip" data-action="exp" data-key="seconds" data-id="${s}" ${pressed(e.seconds === s)}>${s} seconds</button>`).join('')}</div>
    <div class="chips" style="margin-top:8px">${Object.entries(ex.VIDEO_SIZES).map(([k, s]) => `<button type="button" class="chip" data-action="exp" data-key="vsize" data-id="${k}" ${pressed(e.vsize === k)}>${s.name}</button>`).join('')}</div>
    <button type="button" class="btn primary wide" style="margin-top:12px" data-action="export-video" ${vt ? '' : 'disabled'}>Record video</button>
    <h3>Colorway sheet</h3>
    <p class="sub">Pick up to 6 colors. Your design is shot in each one, side by side.</p>
    <div class="swatches">${COLORS.map(([n, h, hz]) => `<button type="button" class="sw${hz ? ' heather' : ''}" style="--c:${h}" data-action="cw" data-hex="${h}" aria-label="${esc(n)}" title="${esc(n)}" ${pressed(e.colorway.includes(h))}></button>`).join('')}</div>
    <button type="button" class="btn primary wide" style="margin-top:12px" data-action="export-colorway" ${e.colorway.length ? '' : 'disabled'}>Make colorway sheet (${e.colorway.length})</button>
    ${installEvt ? '<button type="button" class="btn wide" style="margin-top:22px" data-action="install">Install Drop Studio on this device</button>' : ''}`;
}

function renderViews() {
  document.querySelectorAll('.views [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
  $('#spin-btn').setAttribute('aria-pressed', String(!!stage.spin));
}
function renderAll() { renderTop(); renderTabs(); renderGarment(); renderColor(); renderArt(); renderScene(); renderExport(); renderViews(); }

// ---------- feedback ----------
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
function busy(text, p = null, solid = false) {
  const b = $('#busy'); b.hidden = false; b.style.background = solid ? 'rgba(14,20,48,.94)' : '';
  $('#busy-text').textContent = text; $('#busy-bar').style.width = p == null ? '0' : `${Math.round(p * 100)}%`;
}
const unbusy = () => { $('#busy').hidden = true; };
let hintShown = false;
function hint(text) {
  if (hintShown) return; hintShown = true;
  const h = $('#hint'); h.textContent = text; h.hidden = false;
  setTimeout(() => { h.hidden = true; }, 4200);
}

// ---------- actions ----------
function setView(v) {
  S.view = v;
  if (v === 'front') { stage.turn(0); S.side = 'front'; }
  else if (v === 'back') { stage.turn(Math.PI); S.side = 'back'; }
  else if (v === 'angle') stage.turn(-0.62);
  else if (v === 'side') stage.turn(-Math.PI / 2);
  else if (v === 'close') {
    const L = sel();
    if (L) { const sz = layerSize(L, images); stage.closeUp(L.side, L.x, L.y, Math.max(sz.w, sz.h)); S.side = L.side; }
    else stage.closeUp('front', 0, 0.3, 0.35);
  }
  renderViews(); if (S.tab === 'art') renderArt();
}
function faceSide(side) {
  if (S.side === side && (S.view === 'front' || S.view === 'back' || S.view === 'close')) return;
  S.side = side; S.view = side; stage.turn(side === 'back' ? Math.PI : 0); renderViews();
}
function select(id) {
  S.selected = id;
  const L = sel(); if (L) faceSide(L.side);
  queueTex(); renderArt();
}
function spot(name) { return GARMENTS[S.design.garment].spots[name]; }
function placeLayer(L, sp) {
  L.side = sp.side; L.x = sp.x; L.y = sp.y; L.rot = sp.rot || 0;
  if (L.type === 'text') { const w = layerSize(L, images).w; L.size = clamp(L.size * sp.w / w, 0.015, 0.3); } else L.w = sp.w;
}

async function readImageFile(f) {
  const bmp = await createImageBitmap(f).catch(() => null);
  let w, h, src;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else { // SVG and anything createImageBitmap refuses
    const url = URL.createObjectURL(f), img = new Image(); img.src = url;
    await img.decode(); w = img.naturalWidth || 1600; h = img.naturalHeight || 1600; src = img;
    if (f.type === 'image/svg+xml') { const s = 2400 / Math.max(w, h); w *= s; h *= s; }
  }
  const s = Math.min(1, 2400 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
  // does it already have transparency, or a plain box around it?
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let transparent = false;
  for (let i = 3; i < px.length; i += 4 * 97) if (px[i] < 250) { transparent = true; break; }
  const corner = (x, y) => { const i = (y * c.width + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const cs = [corner(0, 0), corner(c.width - 1, 0), corner(0, c.height - 1), corner(c.width - 1, c.height - 1)];
  const plain = !transparent && cs.every(q => Math.abs(q[0] - cs[0][0]) + Math.abs(q[1] - cs[0][1]) + Math.abs(q[2] - cs[0][2]) < 30);
  const keepPng = transparent || /png|svg|gif|webp/.test(f.type);
  return { url: c.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.93), plain };
}
async function addImages(files) {
  const list = [...files].filter(f => f.type.startsWith('image/'));
  if (!list.length) return;
  busy(list.length > 1 ? `Adding ${list.length} images` : 'Adding image');
  let knocked = false;
  try {
    for (const f of list) {
      const { url, plain } = await readImageFile(f);
      const assetId = uid(); S.assets[assetId] = url; await loadAsset(assetId);
      const sp = S.side === 'back' ? spot('Upper back') : spot('Center chest');
      const L = { id: uid(), type: 'image', name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40), assetId, side: S.side, x: sp.x, y: sp.y, w: sp.w, rot: 0, opacity: 1, finish: 'print', knockout: plain ? 14 : 0, tint: null, flip: false, visible: true };
      if (sp.side !== S.side) { L.side = S.side; }
      knocked ||= plain;
      S.design.layers.push(L); S.selected = L.id;
    }
  } catch (e) { console.error(e); toast('That file couldn’t be opened. Try a PNG or JPG.'); }
  unbusy();
  queueTex(); renderArt(); commit();
  if (knocked) toast('Removed the plain background. Adjust it under Remove background.');
  hint('Drag art on the shirt to move it. Pinch to resize and turn.');
}
function addText() {
  const sp = S.side === 'back' ? { ...spot('Upper back') } : spot('Center chest');
  const L = textLayer(S.design, { side: S.side, x: sp.x, y: sp.y });
  S.design.layers.push(L); S.selected = L.id;
  ensureFonts(); queueTex(); renderArt(); commit();
  hint('Drag art on the shirt to move it. Pinch to resize and turn.');
  setTimeout(() => { const t = document.querySelector('[data-input="text"]'); t?.focus(); t?.select(); }, 50);
}

async function withExport(fn) {
  exporting = true;
  try {
    paint('front', HI, false); paint('back', HI, false);
    await nextFrame();
    return await fn();
  } finally {
    S.thumb = stage.still(400, 500).toDataURL('image/jpeg', 0.82);
    exporting = false; paintNow(); unbusy(); saveNow();
  }
}
function showResult(blob, name, title) {
  if (S.result?.url) URL.revokeObjectURL(S.result.url);
  const url = URL.createObjectURL(blob);
  S.result = { blob, name, url };
  $('#result-title').textContent = title;
  $('#result-view').innerHTML = blob.type.startsWith('video') ? `<video src="${url}" autoplay loop muted playsinline controls></video>` : `<img src="${url}" alt="Exported mockup">`;
  $('#result-dlg').showModal();
}
async function exportPhoto() {
  const e = S.design.exp;
  busy('Rendering photo');
  try {
    const blob = await withExport(() => ex.photo(stage, e.photo, e.transparent));
    showResult(blob, `${slug(S.design.name)}-${e.photo}.png`, 'Photo ready');
  } catch (err) { console.error(err); toast('The photo didn’t render. Try a smaller size.'); }
}
async function exportVideo() {
  const e = S.design.exp;
  const wasSpin = stage.spin; stage.spin = false;
  busy('Recording video', 0, true);
  try {
    const { blob, ext } = await withExport(() => ex.video(stage, { sizeId: e.vsize, motion: e.motion, seconds: e.seconds, onProgress: p => busy(`Recording video, ${Math.ceil(e.seconds * (1 - p))} s left`, p, true) }));
    showResult(blob, `${slug(S.design.name)}-${e.motion}.${ext}`, 'Video ready');
  } catch (err) { console.error(err); toast(err.message || 'The video didn’t record.'); }
  stage.spin = wasSpin;
}
async function exportColorway() {
  const d = S.design, e = d.exp;
  const picks = e.colorway.map(h => COLORS.find(c => c[1] === h) || ['Custom', h]).slice(0, 6);
  const orig = { color: d.color, heather: d.heather, fills: d.layers.map(l => l.fill) };
  busy('Shooting colorways', 0);
  try {
    const put = () => { d.color = orig.color; d.heather = orig.heather; d.layers.forEach((l, i) => { if (l.type === 'text') l.fill = orig.fills[i]; }); applyFabric(); paint('front', HI, false); paint('back', HI, false); };
    const blob = await withExport(async () => {
      try {
        return await ex.colorway(stage, picks, async ([, hex, hz]) => {
          d.color = hex; d.heather = !!hz; autoInk(); applyFabric();
          paint('front', HI, false); paint('back', HI, false);
          await nextFrame();
        }, { title: d.name, onProgress: p => busy('Shooting colorways', p) });
      } finally { put(); }
    });
    showResult(blob, `${slug(d.name)}-colorways.png`, 'Colorway sheet ready');
  } catch (err) { console.error(err); toast('The colorway sheet didn’t render.'); }
}

async function openDesigns() {
  await makeThumb(); await saveNow();
  const list = await store.listDesigns();
  $('#designs-list').innerHTML = list.map(r => `<div class="dcard${r.id === S.design.id ? ' cur' : ''}">
    <button type="button" class="open" data-action="open-design" data-id="${r.id}" aria-label="Open ${esc(r.name)}">${r.thumb ? `<img src="${r.thumb}" alt="">` : ''}</button>
    <div class="dmeta"><b>${esc(r.name)}</b><small>${GARMENTS[r.garment]?.name || ''}, ${new Date(r.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>
    <div class="dacts"><button type="button" data-action="dup-design" data-id="${r.id}">Duplicate</button><button type="button" data-action="del-design" data-id="${r.id}">Delete</button></div>
  </div>`).join('');
  const dlg = $('#designs-dlg'); if (!dlg.open) dlg.showModal();
}

let installEvt = null;
const actions = {
  tab: b => {
    if (S.tab === b.dataset.tab && matchMedia('(max-width: 959px)').matches) { $('#sheet').classList.toggle('collapsed'); return; }
    $('#sheet').classList.remove('collapsed');
    S.tab = b.dataset.tab; renderTabs(); queueTex();
    document.querySelector('.panels').scrollTop = 0;
    if (S.tab === 'art' && S.design.layers.length) hint('Drag art on the shirt to move it. Pinch to resize and turn.');
  },
  undo, redo,
  rename: () => { $('#rename-in').value = S.design.name; $('#rename-dlg').showModal(); $('#rename-in').select(); },
  designs: openDesigns,
  'close-dlg': b => b.closest('dialog').close(),
  'new-design': async () => {
    await saveNow();
    S.design = newDesign(await nextName()); S.assets = {}; S.thumb = null; images.clear();
    afterOpen(); await saveNow(); $('#designs-dlg').close(); S.tab = 'art'; renderTabs();
  },
  'open-design': async b => {
    if (b.dataset.id === S.design.id) { $('#designs-dlg').close(); return; }
    await saveNow();
    const rec = await store.getDesign(b.dataset.id); if (rec) await openRecord(rec);
    $('#designs-dlg').close();
  },
  'dup-design': async b => {
    const rec = await store.getDesign(b.dataset.id); if (!rec) return;
    await store.saveDesign({ ...rec, id: uid(), name: rec.name + ' copy', created: Date.now(), updated: Date.now() });
    openDesigns();
  },
  'del-design': async b => {
    const rec = (await store.listDesigns()).find(r => r.id === b.dataset.id);
    if (!rec || !confirm(`Delete “${rec.name}”? This can’t be undone.`)) return;
    await store.deleteDesign(rec.id);
    if (rec.id === S.design.id) {
      const left = await store.listDesigns();
      if (left.length) await openRecord(await store.getDesign(left[0].id));
      else { S.design = newDesign('Drop 01', true); S.assets = {}; S.thumb = null; images.clear(); afterOpen(); await saveNow(); }
    }
    openDesigns();
  },
  garment: b => {
    const d = S.design, k = b.dataset.id;
    if (d.garment === k) return;
    d.garment = k;
    if (GARMENTS[k].fleece && d.fabric === 'jersey') d.fabric = 'fleece';
    if (!GARMENTS[k].fleece && d.fabric === 'fleece') d.fabric = 'jersey';
    busy('Shaping garment');
    setTimeout(() => { applyShape(); stage.frame(true); unbusy(); renderGarment(); renderArt(); commit(); }, 30);
  },
  fabric: b => { S.design.fabric = b.dataset.id; applyShape(); renderGarment(); commit(); },
  wash: b => { S.design.wash = b.dataset.id; applyFabric(); queueTex(); renderGarment(); commit(); },
  color: b => { const d = S.design; d.color = b.dataset.hex; d.colorName = b.dataset.name; d.heather = b.dataset.heather === '1'; autoInk(); applyFabric(); queueTex(); renderColor(); commit(); },
  side: b => { faceSide(b.dataset.id); renderArt(); },
  'add-image': () => $('#file-in').click(),
  'add-text': addText,
  select: b => select(b.dataset.id),
  'toggle-vis': b => { const L = layer(b.dataset.id); L.visible = L.visible === false; queueTex([L.side]); renderArt(); commit(); },
  'layer-up': b => { const a = S.design.layers, i = a.findIndex(l => l.id === b.dataset.id); if (i < a.length - 1) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; queueTex(); renderArt(); commit(); } },
  font: b => { const L = sel(); L.font = b.dataset.id; ensureFonts(); queueTex([L.side]); renderArt(); commit(); },
  fill: b => { sel().fill = b.dataset.hex; sel().autoInk = false; queueTex([sel().side]); renderArt(); commit(); },
  stroke: b => { sel().stroke = b.dataset.hex; queueTex([sel().side]); renderArt(); commit(); },
  tint: b => { sel().tint = b.dataset.hex || null; queueTex([sel().side]); renderArt(); commit(); },
  finish: b => { sel().finish = b.dataset.id; queueTex([sel().side]); renderArt(); commit(); },
  place: b => { const L = sel(), from = L.side; placeLayer(L, spot(b.dataset.id)); queueTex(); faceSide(L.side); if (from !== L.side) renderArt(); else refreshOutputs(); commit(); },
  center: () => { sel().x = 0; queueTex([sel().side]); commit(); },
  flip: () => { const L = sel(); L.flip = !L.flip; queueTex([L.side]); commit(); },
  'move-side': () => { const L = sel(); L.side = L.side === 'front' ? 'back' : 'front'; faceSide(L.side); queueTex(); renderArt(); commit(); },
  duplicate: () => { const L = sel(); const c = { ...L, id: uid(), y: L.y - 0.05 }; S.design.layers.push(c); S.selected = c.id; queueTex([c.side]); renderArt(); commit(); },
  delete: () => {
    const a = S.design.layers, i = a.findIndex(l => l.id === S.selected); if (i < 0) return;
    a.splice(i, 1); S.selected = a[Math.min(i, a.length - 1)]?.id || null; queueTex(); renderArt(); commit();
  },
  bg: b => { S.design.scene.bg = b.dataset.id; applyScene(); renderScene(); commit(); },
  light: b => { S.design.scene.light = b.dataset.id; applyScene(); renderScene(); commit(); },
  shadow: b => { S.design.scene.shadow = b.dataset.id; applyScene(); renderScene(); commit(); },
  spin: () => { stage.spin = !stage.spin; renderViews(); },
  exp: b => { const e = S.design.exp, k = b.dataset.key; e[k] = k === 'seconds' ? +b.dataset.id : b.dataset.id; renderExport(); scheduleSave(); },
  cw: b => {
    const e = S.design.exp, h = b.dataset.hex, i = e.colorway.indexOf(h);
    if (i >= 0) e.colorway.splice(i, 1); else if (e.colorway.length < 6) e.colorway.push(h); else { toast('A sheet holds up to 6 colors.'); return; }
    renderExport(); scheduleSave();
  },
  'export-photo': exportPhoto,
  'export-video': exportVideo,
  'export-colorway': exportColorway,
  'share-result': async () => { const r = S.result; if (!r) return; const how = await ex.share(r.blob, r.name); if (how === 'downloaded') toast('Saved to your downloads.'); },
  'save-result': () => { const r = S.result; if (!r) return; ex.download(r.blob, r.name); toast('Saved to your downloads.'); },
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; renderExport(); },
};

function wire() {
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view]');
    if (v) { setView(v.dataset.view); return; }
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    if (b.tagName === 'LABEL') return; // custom color pickers
    const fn = actions[b.dataset.action];
    if (fn) { e.preventDefault(); fn(b); }
  });
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => actions.tab(b)));

  // sliders: live while dragging, one undo step when released
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.slider) {
      const L = sel(); if (!L) return;
      const v = +t.value, k = t.dataset.slider;
      if (k === 'size') { if (L.type === 'text') L.size = v; else L.w = v; }
      else L[k] = v;
      queueTex([L.side]); refreshOutputs();
      return;
    }
    const k = t.dataset.input; if (!k) return;
    const d = S.design, L = sel();
    if (k === 'text' && L) { L.text = t.value; queueTex([L.side]); const nb = document.querySelector(`.layer.on .lname b`); if (nb) nb.textContent = t.value.replace(/\n/g, ' '); refreshOutputs(); }
    else if (k === 'garment-color') { d.color = t.value; d.colorName = 'Custom'; autoInk(); applyFabric(); queueTex(); }
    else if (k === 'bg-color') { d.scene.bg = 'custom'; d.scene.bgColor = t.value; applyScene(); }
    else if ((k === 'fill' || k === 'stroke' || k === 'tint') && L) { L[k] = t.value; if (k === 'fill') L.autoInk = false; queueTex([L.side]); }
  });
  document.addEventListener('change', e => {
    const t = e.target, k = t.dataset.input;
    if (t.dataset.slider) { commit(); if (['strokeW'].includes(t.dataset.slider)) renderArt(); return; }
    if (!k) return;
    const d = S.design;
    if (k === 'heather') { d.heather = t.checked; queueTex(); commit(); }
    else if (k === 'transparent') { d.exp.transparent = t.checked; scheduleSave(); }
    else if (k === 'garment-color') { renderColor(); commit(); }
    else if (k === 'bg-color') { renderScene(); commit(); }
    else if (k === 'text') { renderArt(); commit(); }
    else if (k === 'fill' || k === 'stroke' || k === 'tint') { renderArt(); commit(); }
  });

  $('#file-in').addEventListener('change', e => { addImages(e.target.files); e.target.value = ''; });
  $('#rename-form').addEventListener('submit', e => {
    const v = $('#rename-in').value.trim();
    if (v) { S.design.name = v; renderTop(); commit(); }
  });
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) d.close(); });

  // drag-and-drop and paste
  const dt = $('#drop-target');
  window.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dt.hidden = false; } });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) dt.hidden = true; });
  window.addEventListener('drop', e => { e.preventDefault(); dt.hidden = true; if (e.dataTransfer.files.length) { S.tab = 'art'; renderTabs(); addImages(e.dataTransfer.files); } });
  window.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length && !/input|textarea/i.test(document.activeElement?.tagName)) { e.preventDefault(); addImages(files); }
  });

  // keyboard
  let nudgeT = 0;
  document.addEventListener('keydown', e => {
    if (/input|textarea/i.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    const L = sel(); if (!L || S.tab !== 'art') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.delete(); return; }
    const step = e.shiftKey ? 0.02 : 0.004;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (mv) { e.preventDefault(); L.x += mv[0]; L.y += mv[1]; queueTex([L.side]); clearTimeout(nudgeT); nudgeT = setTimeout(commit, 400); }
  });

  // touch the art on the shirt to move it; two fingers to resize and turn
  const wrap = $('#stage-wrap');
  const ptrs = new Map(); let drag = null, foreign = 0;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  wrap.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target !== stage.canvas) return;
    if (drag) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.stopPropagation(); e.preventDefault();
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], L = layer(drag.id); drag.pinch = { d0: dist(a, b), a0: ang(a, b), w0: L.w, s0: L.size, r0: L.rot || 0 }; }
      return;
    }
    if (S.tab !== 'art' || foreign > 0 || stage.recording) { foreign++; return; }
    const hit = stage.pick(e.clientX, e.clientY);
    const cand = hit && hit.outside && S.design.layers.filter(l => l.side === hit.side && l.visible !== false).reverse().find(l => hitLayer(l, images, hit.x, hit.y, 0.012));
    if (!cand) { foreign++; return; }
    e.stopPropagation(); e.preventDefault();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { wrap.setPointerCapture(e.pointerId); } catch {}
    drag = { id: cand.id, last: hit, side: hit.side, moved: false };
    if (S.selected !== cand.id) { S.selected = cand.id; S.side = cand.side; queueTex(); renderArt(); }
  }, true);
  wrap.addEventListener('pointermove', e => {
    if (!drag || !ptrs.has(e.pointerId)) return;
    e.stopPropagation();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const L = layer(drag.id); if (!L) return;
    if (drag.pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], k = dist(a, b) / drag.pinch.d0;
      if (L.type === 'text') L.size = clamp(drag.pinch.s0 * k, 0.015, 0.3); else L.w = clamp(drag.pinch.w0 * k, 0.02, 0.75);
      let r = drag.pinch.r0 + ang(a, b) - drag.pinch.a0; while (r > 180) r -= 360; while (r < -180) r += 360;
      L.rot = Math.round(r);
    } else if (ptrs.size === 1) {
      const hit = stage.pick(e.clientX, e.clientY);
      if (hit && hit.side === drag.side) { L.x += hit.x - drag.last.x; L.y += hit.y - drag.last.y; drag.last = hit; }
    }
    drag.moved = true; queueTex([L.side]); refreshOutputs();
  }, true);
  const end = e => {
    if (!drag) { if (foreign > 0) foreign--; return; }
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); e.stopPropagation();
    if (ptrs.size === 0) { if (drag.moved) commit(); drag = null; }
    else if (drag.pinch) { drag.pinch = null; const p = [...ptrs.values()][0], hit = stage.pick(p.x, p.y); if (hit) drag.last = hit; }
  };
  wrap.addEventListener('pointerup', end, true);
  wrap.addEventListener('pointercancel', end, true);
  stage.onUserMove = () => { if (S.view !== 'free') { S.view = 'free'; renderViews(); } };

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderExport(); });
  window.addEventListener('pagehide', () => saveNow());
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
}

// ---------- start ----------
async function boot() {
  try { stage = new Stage($('#stage')); }
  catch (e) {
    console.error(e);
    $('#stage-wrap').innerHTML = '<p class="empty" style="margin:24px;background:#141c3a">This browser can’t show 3D (WebGL is off or unsupported). Try Chrome on Android or a computer.</p>';
    return;
  }
  comp = new Compositor();
  HI = stage.maxTex >= 8192 && (navigator.deviceMemory || 8) >= 4 ? 4096 : 2048;
  wire();
  let rec = null;
  try {
    const id = await store.getMeta('current');
    rec = id ? await store.getDesign(id) : null;
    if (!rec) { const list = await store.listDesigns(); if (list.length) rec = await store.getDesign(list[0].id); }
  } catch (e) { console.warn('storage unavailable', e); }
  if (rec) await openRecord(rec);
  else { S.design = newDesign('Drop 01', true); S.assets = {}; afterOpen(); saveNow(); }
  document.fonts.ready.then(() => { clearTextCache(); queueTex(); });
  window.__drop = { S, stage, actions, paintNow, addImages };
}
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
