// Photo, video and colorway-sheet exports, plus the share sheet.
export const PHOTO_SIZES = {
  square: { name: 'Square', w: 2048, h: 2048 },
  portrait: { name: 'Portrait 4:5', w: 1728, h: 2160 },
  story: { name: 'Story 9:16', w: 1440, h: 2560 },
  wide: { name: 'Wide 16:9', w: 2560, h: 1440 },
};
export const VIDEO_SIZES = {
  square: { name: 'Square', w: 1080, h: 1080 },
  portrait: { name: 'Portrait 4:5', w: 1080, h: 1350 },
  story: { name: 'Story 9:16', w: 1080, h: 1920 },
};
export const MOTIONS = { spin: 'Turntable', sway: 'Sway', flip: 'Front to back', push: 'Push in' };

const toBlob = (c, type = 'image/png', q) => new Promise(res => c.toBlob(res, type, q));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function photo(stage, sizeId, transparent) {
  const s = PHOTO_SIZES[sizeId] || PHOTO_SIZES.square;
  const c = stage.still(s.w, s.h, { transparent });
  return toBlob(c, 'image/png');
}

export function videoType() {
  if (!window.MediaRecorder) return null;
  const types = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const t = types.find(x => MediaRecorder.isTypeSupported(x));
  return t ? { mime: t, ext: t.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

export async function video(stage, { sizeId, motion, seconds, onProgress }) {
  const vt = videoType();
  if (!vt) throw new Error('This browser can’t record video. Try Chrome on Android or desktop.');
  const s = VIDEO_SIZES[sizeId] || VIDEO_SIZES.square;
  const r = stage.renderer, cam = stage.camera, g = stage.group;
  stage.recording = true; stage.paused = true;
  const restore = stage.pushSize(s.w, s.h, false);
  const rot0 = g.rotation.y, camPos = cam.position.clone(), target = stage.controls.target.clone();
  // frames are copied to a plain canvas and pushed one at a time, which records reliably everywhere
  const out = document.createElement('canvas'); out.width = s.w; out.height = s.h;
  const og = out.getContext('2d');
  let stream = out.captureStream(0);
  let track = stream.getVideoTracks()[0];
  if (!track || typeof track.requestFrame !== 'function') { stream = out.captureStream(30); track = null; }
  const rec = new MediaRecorder(stream, { mimeType: vt.mime, videoBitsPerSecond: 14_000_000 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(res => { rec.onstop = res; });
  const dur = seconds * 1000;
  const apply = t => {
    let rot = rot0;
    cam.position.copy(camPos);
    if (motion === 'spin') rot = rot0 + t * Math.PI * 2;
    else if (motion === 'sway') rot = rot0 + Math.sin(t * Math.PI * 2) * 0.55;
    else if (motion === 'flip') {
      const seg = (a, b) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
      rot = rot0 + Math.PI * seg(0.15, 0.45) + Math.PI * seg(0.6, 0.9);
    } else if (motion === 'push') {
      const e = ease(Math.min(1, t * 1.15));
      cam.position.copy(target).add(camPos.clone().sub(target).multiplyScalar(1 - 0.38 * e));
      rot = rot0 + Math.sin(t * Math.PI) * 0.18;
    }
    g.rotation.y = rot;
    cam.lookAt(target);
    r.render(stage.scene, cam);
    og.drawImage(r.domElement, 0, 0, s.w, s.h);
    track?.requestFrame();
  };
  apply(0);
  rec.start(250);
  await new Promise(res => {
    const t0 = performance.now();
    const frame = now => {
      const t = Math.min(1, (now - t0) / dur);
      apply(t);
      onProgress?.(t);
      if (t < 1) requestAnimationFrame(frame); else setTimeout(res, 120);
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach(t => t.stop());
  g.rotation.y = rot0; cam.position.copy(camPos); cam.lookAt(target);
  restore();
  stage.recording = false; stage.paused = false; stage.dirty = true;
  const blob = new Blob(chunks, { type: vt.mime.split(';')[0] });
  if (!blob.size) throw new Error('This browser didn’t record any frames. Try Chrome, or save a photo instead.');
  return { blob, ext: vt.ext };
}

// One shot per color, laid out on a sheet with names under each.
export async function colorway(stage, colors, applyColor, { title, onProgress }) {
  const cw = 760, ch = 950, gap = 36, label = 70, pad = 72, head = 150;
  const cols = colors.length <= 3 ? colors.length : colors.length === 4 ? 2 : 3;
  const rows = Math.ceil(colors.length / cols);
  const W = pad * 2 + cols * cw + (cols - 1) * gap, H = head + pad + rows * (ch + label) + (rows - 1) * gap;
  const sheet = document.createElement('canvas'); sheet.width = W; sheet.height = H;
  const g = sheet.getContext('2d');
  g.fillStyle = '#F2F1EE'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#141C3A';
  g.font = '800 76px "Big Shoulders Display", sans-serif'; g.textBaseline = 'alphabetic';
  g.fillText(title || 'Colorways', pad, 108);
  g.fillStyle = '#E0452F'; g.fillRect(pad, 126, 120, 6);
  for (let i = 0; i < colors.length; i++) {
    const [name, hex] = colors[i];
    await applyColor(colors[i]);
    const shot = stage.still(cw * 2, ch * 2);
    const x = pad + (i % cols) * (cw + gap), y = head + Math.floor(i / cols) * (ch + label + gap);
    g.drawImage(shot, x, y, cw, ch);
    g.fillStyle = hex; g.fillRect(x, y + ch + 22, 28, 28);
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 2; g.strokeRect(x + 1, y + ch + 23, 26, 26);
    g.fillStyle = '#141C3A'; g.font = '600 30px "Instrument Sans", sans-serif';
    g.fillText(name, x + 42, y + ch + 46);
    onProgress?.((i + 1) / colors.length);
  }
  return toBlob(sheet, 'image/png');
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}

export async function share(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  download(blob, name);
  return 'downloaded';
}
