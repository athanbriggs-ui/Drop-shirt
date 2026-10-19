// The 3D studio: garment meshes, fabric materials, lights, backdrop and camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { SPAN, CY } from './garments.js';
import { ribTexture } from './textures.js';

export const LIGHTS = {
  studio: { name: 'Studio', env: 0.36, key: 2.15, keyPos: [-2.3, 2.5, 1.5], keyColor: '#ffffff', rim: 0.9, rimPos: [1.8, 1.0, -1.6], shadow: 0.26, soft: 10 },
  dramatic: { name: 'Dramatic', env: 0.22, key: 3.4, keyPos: [-2.6, 1.3, 1.2], keyColor: '#ffffff', rim: 2.0, rimPos: [2.2, 1.4, -1.4], shadow: 0.42, soft: 6 },
  sun: { name: 'Sunlight', env: 0.55, key: 3.0, keyPos: [2.0, 3.0, 2.2], keyColor: '#fff0d9', rim: 0.35, rimPos: [-1.8, 1.0, -1.6], shadow: 0.4, soft: 4 },
  flat: { name: 'Catalog', env: 0.95, key: 0.9, keyPos: [0, 1.2, 3], keyColor: '#ffffff', rim: 0.2, rimPos: [0, 1, -2], shadow: 0.14, soft: 14 },
};

export const BACKDROPS = {
  paper: { name: 'Paper', color: '#E6E5E1' },
  concrete: { name: 'Concrete', grad: ['#C9C8C4', '#A9A8A4'] },
  ink: { name: 'Ink', color: '#16181D' },
  denim: { name: 'Indigo', grad: ['#33467A', '#1F2B4D'] },
  sand: { name: 'Sand', color: '#D9C9AC' },
  blush: { name: 'Blush', color: '#E8C8C2' },
  sky: { name: 'Sky', grad: ['#F2F6FB', '#C4D7EE'] },
  dusk: { name: 'Dusk', grad: ['#F4B78E', '#7B5EA7'] },
  clear: { name: 'Transparent', clear: true },
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.NeutralToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.maxTex = r.capabilities.maxTextureSize;

    const scene = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

    const cam = this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    scene.add(cam);
    this.key = new THREE.DirectionalLight('#fff', 2);
    this.key.castShadow = true;
    const sc = this.key.shadow;
    sc.mapSize.set(1024, 1024); sc.camera.left = -1.3; sc.camera.right = 1.3; sc.camera.top = 1.3; sc.camera.bottom = -1.3; sc.camera.near = 0.1; sc.camera.far = 12;
    sc.bias = -0.0005; sc.blurSamples = 16;
    this.rim = new THREE.DirectionalLight('#fff', 0.6);
    // soft light from straight above that throws the floor shadow under the garment
    this.top = new THREE.DirectionalLight('#fff', 0.22);
    this.top.position.set(0.15, 5, 0.9);
    this.top.shadow.mapSize.set(1024, 1024);
    Object.assign(this.top.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 0.5, far: 12 });
    this.top.shadow.bias = -0.0005; this.top.shadow.blurSamples = 16;
    cam.add(this.key); cam.add(this.rim); scene.add(this.top);

    this.group = new THREE.Group();
    scene.add(this.group);

    const shMat = () => new THREE.ShadowMaterial({ opacity: 0.25, transparent: true, depthWrite: false });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), shMat());
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true;
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), shMat());
    this.wall.position.z = -0.62; this.wall.receiveShadow = true;
    scene.add(this.floor, this.wall);

    const rib = new THREE.CanvasTexture(ribTexture());
    rib.wrapS = rib.wrapT = THREE.RepeatWrapping;
    this.ribTex = rib;
    this.panelMats = { front: this.fabricMat(), back: this.fabricMat() };
    this.trimMat = new THREE.MeshPhysicalMaterial({ roughness: 1, bumpMap: rib, bumpScale: 2, side: THREE.DoubleSide });
    this.plainMat = this.fabricMat(true);
    this.agletMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.4, metalness: 0.15 });
    this.liningMat = this.fabricMat(true);

    const ctl = this.controls = new OrbitControls(cam, canvas);
    ctl.enableDamping = true; ctl.dampingFactor = 0.09;
    ctl.minDistance = 0.45; ctl.maxDistance = 8; ctl.screenSpacePanning = true;
    ctl.rotateSpeed = 0.8;
    ctl.addEventListener('change', () => { this.dirty = true; });
    ctl.addEventListener('start', () => { this.tween = null; this.framed = false; this.onUserMove?.(); });

    this.center = new THREE.Vector3(0, 0.1, 0);
    this.padPx = 64;
    this.bounds = { w: 1.5, h: 1.6 };
    this.dirty = true;
    this.spin = false;
    this.light('studio'); this.shadow('floor'); this.backdrop({ id: 'paper' });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    let last = performance.now();
    const loop = now => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (this.paused) return;
      if (this.tween) {
        const tw = this.tween, t = Math.min(1, (now - tw.t0) / tw.dur), e = ease(t);
        tw.step(e);
        if (t >= 1) this.tween = null;
        this.dirty = true;
      }
      if (this.spin && !this.recording) { this.group.rotation.y += dt * 0.7; this.dirty = true; }
      if (this.controls.update()) this.dirty = true;
      if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); }
    };
    this.raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { this.paused = document.hidden; this.dirty = true; });
  }

  fabricMat(plain = false) {
    const m = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide, sheen: 0.5, sheenRoughness: 0.5 });
    m.userData.inner = { value: new THREE.Color('#888') };
    m.onBeforeCompile = sh => {
      sh.uniforms.uInner = m.userData.inner;
      sh.fragmentShader = 'uniform vec3 uInner;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = uInner;');
    };
    if (plain) m.customProgramCacheKey = () => 'plain';
    return m;
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const prev = this.fit(this.camera.aspect || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.framed !== false) this.frame(false);
    else {
      // keep the user's zoom relative to the frame
      const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(this.fit(w / h) / prev);
      this.camera.position.copy(this.controls.target).add(off);
    }
    this.dirty = true;
  }

  fit(aspect) {
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const free = 1 - Math.min(0.3, this.padPx / (this.canvas.clientHeight || 600));
    return Math.max(this.bounds.h / free / 2 / t, this.bounds.w / 2 / (t * aspect)) * 1.16 + 0.3;
  }

  // where the camera looks: a little below center so the view buttons don't cover the hem
  aim() {
    const d = this.fit(this.camera.aspect), visH = 2 * d * Math.tan((this.camera.fov * Math.PI) / 360);
    return this.center.clone().add(new THREE.Vector3(0, -0.5 * (this.padPx / (this.canvas.clientHeight || 600)) * visH, 0));
  }

  frame(animate = true, dir = new THREE.Vector3(0, 0.04, 1)) {
    const aim = this.aim();
    const to = aim.clone().add(dir.normalize().multiplyScalar(this.fit(this.camera.aspect)));
    this.moveCamera(to, aim, animate);
    this.framed = true;
  }

  moveCamera(pos, target, animate = true) {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    if (!animate || reduceMotion()) { this.camera.position.copy(pos); this.controls.target.copy(target); this.dirty = true; return; }
    this.tween = { t0: performance.now(), dur: 650, step: e => { this.camera.position.lerpVectors(p0, pos, e); this.controls.target.lerpVectors(t0, target, e); } };
  }

  turn(angle, animate = true) {
    const a0 = this.group.rotation.y;
    // take the short way round
    let a1 = angle; while (a1 - a0 > Math.PI) a1 -= Math.PI * 2; while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    if (!animate || reduceMotion()) { this.group.rotation.y = a1; this.dirty = true; return; }
    const cam0 = this.camera.position.clone(), tg0 = this.controls.target.clone();
    const aim = this.aim();
    const camTo = aim.clone().add(new THREE.Vector3(0, 0.04, 1).normalize().multiplyScalar(this.fit(this.camera.aspect)));
    const reframe = !this.framedNow();
    this.tween = { t0: performance.now(), dur: 750, step: e => {
      this.group.rotation.y = a0 + (a1 - a0) * e;
      if (reframe) { this.camera.position.lerpVectors(cam0, camTo, e); this.controls.target.lerpVectors(tg0, aim, e); }
    } };
    this.framed = true;
  }

  framedNow() {
    const aim = this.aim();
    const to = aim.clone().add(new THREE.Vector3(0, 0.04, 1).normalize().multiplyScalar(this.fit(this.camera.aspect)));
    return this.camera.position.distanceTo(to) < 0.02 && this.controls.target.distanceTo(aim) < 0.01;
  }

  closeUp(side, x, y, size = 0.3) {
    this.turn(side === 'back' ? Math.PI : 0, false);
    const target = new THREE.Vector3(x, y, 0.15);
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const d = Math.max(0.5, Math.min(2.2, (size * 1.5) / (2 * t * Math.min(1, this.camera.aspect)) + 0.2));
    this.moveCamera(target.clone().add(new THREE.Vector3(0, 0.02, d)), target, true);
    this.framed = false;
  }

  setShape(shape) {
    for (const c of [...this.group.children]) { this.group.remove(c); c.geometry?.dispose(); }
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; this.group.add(m); return m; };
    this.front = add(shape.front, this.panelMats.front);
    this.back = add(shape.back, this.panelMats.back);
    this.front.userData.side = 'front'; this.back.userData.side = 'back';
    const collarLen = shape.collar.getLength();
    const cg = new THREE.TubeGeometry(shape.collar, 220, shape.collarR, 12, true);
    this.collarRepeat = Math.round(collarLen / 0.006);
    add(cg, this.trimMat);
    for (const b of shape.bindings) add(new THREE.TubeGeometry(b, 60, 0.008, 8, false), this.trimMat);
    for (const s of shape.strings) {
      add(new THREE.TubeGeometry(s, 40, 0.0055, 8, false), this.plainMat);
      const end = s.getPoint(1), dir = s.getTangent(1);
      const ag = new THREE.CylinderGeometry(0.0058, 0.0058, 0.026, 12);
      const m = add(ag, this.agletMat);
      m.position.copy(end).addScaledVector(dir, 0.011);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
    if (shape.hood) {
      // the hood hinges at the neckline and lies back over the shoulders
      const hinge = new THREE.Group(), inner = new THREE.Group();
      // folded down, the outside of the hood faces out and the lining lies against the back
      inner.add(Object.assign(new THREE.Mesh(shape.hood.front, this.plainMat), { castShadow: true }));
      inner.add(Object.assign(new THREE.Mesh(shape.hood.back, this.liningMat), { castShadow: true }));
      inner.position.y = -0.63;
      hinge.add(inner); hinge.position.set(0, 0.645, -0.05); hinge.rotation.x = -2.5;
      this.group.add(hinge);
    }
    // bounds for framing
    let minY = Infinity, maxY = -Infinity, maxX = 0;
    for (const p of shape.outerPoly) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); maxX = Math.max(maxX, Math.abs(p.x)); }
    if (shape.hood) maxY = Math.max(maxY, 0.9);
    this.bounds = { w: maxX * 2, h: maxY - minY };
    this.center.set(0, (minY + maxY) / 2, 0);
    this.floor.position.y = minY - 0.17;
    this.dirty = true;
  }

  // canvases → textures
  setTextures(side, cs) {
    const mat = this.panelMats[side];
    const make = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    if (cs.resized || !mat.map) {
      mat.map?.dispose(); mat.bumpMap?.dispose(); mat.roughnessMap?.dispose();
      mat.map = make(cs.map, true); mat.bumpMap = make(cs.bump); mat.roughnessMap = make(cs.rough);
      mat.sheenColorMap = mat.map;
      mat.needsUpdate = true;
    } else { mat.map.needsUpdate = true; mat.bumpMap.needsUpdate = true; mat.roughnessMap.needsUpdate = true; }
    this.dirty = true;
  }

  setFabric(color, fabric, wash) {
    const c = new THREE.Color(color);
    const hsl = {}; c.getHSL(hsl);
    const inner = c.clone().multiplyScalar(0.62);
    const washed = wash === 'acid' ? c.clone().lerp(new THREE.Color('#d8d8d8'), 0.35) : wash === 'vintage' ? c.clone().lerp(new THREE.Color('#bdbdbd'), 0.12) : c;
    for (const m of [this.panelMats.front, this.panelMats.back, this.plainMat, this.liningMat]) {
      m.sheen = fabric.sheen; m.sheenRoughness = fabric.sheenRough;
      // panels tint their sheen by the painted color (so dark ink stays dark); plain parts use a light tint
      if (m.sheenColorMap || m === this.panelMats.front || m === this.panelMats.back) m.sheenColor.set('#ffffff').multiplyScalar(hsl.l < 0.3 ? 1.4 : 0.8);
      else m.sheenColor.copy(c).lerp(new THREE.Color('#ffffff'), 0.15);
      m.bumpScale = 1.2 * fabric.bump;
      m.userData.inner.value.copy(inner);
    }
    this.plainMat.color.copy(washed);
    this.liningMat.color.copy(washed).multiplyScalar(0.62);
    this.agletMat.color.copy(washed).multiplyScalar(0.55);
    this.trimMat.color.copy(washed).multiplyScalar(0.96);
    this.trimMat.sheen = fabric.sheen * 0.7; this.trimMat.sheenRoughness = fabric.sheenRough; this.trimMat.sheenColor.copy(c).lerp(new THREE.Color('#ffffff'), 0.12);
    this.ribTex.repeat.set(this.collarRepeat || 120, 1);
    this.dirty = true;
  }

  light(id) {
    const L = LIGHTS[id] || LIGHTS.studio;
    this.lightId = id;
    this.scene.environmentIntensity = L.env;
    this.key.intensity = L.key; this.key.color.set(L.keyColor); this.key.position.set(...L.keyPos);
    this.rim.intensity = L.rim; this.rim.position.set(...L.rimPos);
    this.key.shadow.radius = L.soft; this.top.shadow.radius = L.soft * 1.6;
    this.floor.material.opacity = L.shadow; this.wall.material.opacity = L.shadow * 0.9;
    this.dirty = true;
  }

  shadow(mode) {
    this.shadowMode = mode;
    this.floor.visible = mode === 'floor';
    this.wall.visible = mode === 'wall';
    this.top.castShadow = mode === 'floor';
    this.key.castShadow = mode === 'wall';
    this.dirty = true;
  }

  backdrop(bg) {
    this.bg = bg;
    const B = bg.id === 'custom' ? { color: bg.color } : BACKDROPS[bg.id] || BACKDROPS.paper;
    this.scene.background?.dispose?.();
    if (B.clear) { this.scene.background = null; this.renderer.setClearColor(0x000000, 0); }
    else if (B.grad) {
      const c = document.createElement('canvas'); c.width = 4; c.height = 512;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, B.grad[0]); gr.addColorStop(1, B.grad[1]); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = t;
    } else this.scene.background = new THREE.Color(B.color);
    this.dirty = true;
  }

  // Where on the garment is this screen point?
  pick(clientX, clientY) {
    if (!this.front) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera);
    const hit = rc.intersectObjects([this.front, this.back], false)[0];
    if (!hit || !hit.uv) return null;
    const outside = hit.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(rc.ray.direction) < 0;
    return { side: hit.object.userData.side, x: (hit.uv.x - 0.5) * SPAN, y: (hit.uv.y - 0.5) * SPAN + CY, outside };
  }

  // Render one still at any size; returns a 2D canvas.
  still(w, h, { transparent = false } = {}) {
    const r = this.renderer;
    const max = Math.min(this.maxTex, 8192);
    const s = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * s); h = Math.round(h * s);
    const restore = this.pushSize(w, h, transparent);
    r.render(this.scene, this.camera);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(r.domElement, 0, 0, w, h);
    restore();
    return out;
  }

  pushSize(w, h, transparent) {
    const r = this.renderer, cam = this.camera;
    const pr = r.getPixelRatio(), size = r.getSize(new THREE.Vector2());
    const aspect = cam.aspect, pos = cam.position.clone(), bg = this.scene.background;
    const scale = this.fit(w / h) / this.fit(aspect);
    r.setPixelRatio(1); r.setSize(w, h, false);
    cam.aspect = w / h; cam.position.sub(this.controls.target).multiplyScalar(scale).add(this.controls.target); cam.updateProjectionMatrix();
    if (transparent) { this.scene.background = null; r.setClearColor(0, 0); }
    return () => {
      r.setPixelRatio(pr); r.setSize(size.x, size.y, false);
      cam.aspect = aspect; cam.position.copy(pos); cam.updateProjectionMatrix();
      if (transparent) { this.scene.background = bg; if (!bg) r.setClearColor(0, 0); }
      this.dirty = true;
    };
  }
}
