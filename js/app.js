import {
  MOVES, SHOTS, COMBOS, LEVELS, PACES, ZONES, makeCaller, gapFor, maxHr, pctOfMax,
  pctOfReserve, zoneFor, targetBpm, weightLoss, fmtTime, NUDGES, slug, allLines,
} from './data.js';
import { GUIDE } from './guide.js';
import { CLIPS } from './clips.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const now = () => performance.now() / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('sm.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sm.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const S = Object.assign({
  level: 1, pace: 'easy', work: 30, rest: 30, rounds: 6,
  calls: true, voice: true, coach: true, beeps: true, unit: 'lb', wIn: '', cutOk: false,
}, store.get('settings', {}));
const profile = Object.assign({ age: null, rest: null, knownMax: null }, store.get('profile', {}));
let log = store.get('log', []);
const save = () => store.set('settings', S);

// ---------- Train tab ----------

const LIMITS = { work: [10, 300], rest: [5, 300], rounds: [1, 60] };

function renderTrain() {
  $('#levels').innerHTML = Object.entries(LEVELS).map(([n, lv]) =>
    `<button type="button" role="radio" aria-checked="${S.level == n}" data-level="${n}"><span>Level</span><b>${n}</b></button>`).join('');

  const lv = LEVELS[S.level];
  $('#level-moves').innerHTML = lv.base.map((k) => `<span>${MOVES[k].say}</span>`).join('') +
    (lv.extras ? `<span class="plus">+ ${SHOTS.length} named shots</span><span class="plus">+ ${COMBOS.length} combos</span>` : '');

  const max = maxHr(profile);
  $('#paces').innerHTML = Object.entries(PACES).map(([k, p]) => {
    const t = targetBpm(k, max);
    const hr = t ? `<b>${t[0]}–${t[1]}</b>bpm` : `<b>${p.hr[0] * 100}–${p.hr[1] * 100}%</b>max HR`;
    return `<button type="button" role="radio" aria-checked="${S.pace === k}" data-pace="${k}">
      <span class="int">${p.intensity}</span>
      <span class="nm">${p.name}${p.sub ? `<small>(${p.sub})</small>` : ''}</span>
      <span class="hr">${hr}</span>
      <span class="bl">${p.blurb}</span></button>`;
  }).join('');

  for (const el of $$('.stepper')) {
    const k = el.dataset.key;
    $('output', el).textContent = k === 'rounds' ? S[k] : fmtTime(S[k]);
  }
  const total = S.rounds * S.work + (S.rounds - 1) * S.rest;
  $('#total').innerHTML = `<b>${fmtTime(total)}</b> total · ${fmtTime(S.rounds * S.work)} of work`;

  $('#opt-calls').checked = S.calls;
  $('#opt-voice').checked = S.voice;
  $('#opt-coach').checked = S.coach && coachReady;
  $('#opt-coach').disabled = !coachReady;
  if (!coachReady) {
    const have = LINES.filter((l) => CLIPS.includes(slug(l))).length;
    $('#coach-note').textContent = `${have} of ${LINES.length} lines recorded so far. The phone's voice is used until the set is complete.`;
  }
  $('#opt-beeps').checked = S.beeps;

  $('#cut-box').hidden = S.pace !== 'hard';
  if ($('#w-in').value !== String(S.wIn)) $('#w-in').value = S.wIn;
  for (const b of $$('.unit button')) b.classList.toggle('on', b.dataset.unit === S.unit);
}

$('#levels').addEventListener('click', (e) => {
  const b = e.target.closest('[data-level]'); if (!b) return;
  S.level = +b.dataset.level; save(); renderTrain();
});
$('#paces').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pace]'); if (!b) return;
  S.pace = b.dataset.pace; applyPreset(); save(); renderTrain();
});
function applyPreset() {
  const p = PACES[S.pace];
  S.work = p.work; S.rest = p.rest; S.rounds = p.rounds;
}
$('#reset-intervals').addEventListener('click', () => { applyPreset(); save(); renderTrain(); });
$('.steppers').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.closest('.stepper').dataset.key;
  S[k] = clamp(S[k] + +b.dataset.d, ...LIMITS[k]); save(); renderTrain();
});
for (const k of ['calls', 'voice', 'coach', 'beeps']) {
  $('#opt-' + k).addEventListener('change', (e) => { S[k] = e.target.checked; save(); });
}
$('#w-in').addEventListener('input', (e) => { S.wIn = e.target.value; save(); });
$('.unit').addEventListener('click', (e) => {
  const b = e.target.closest('[data-unit]'); if (!b) return;
  S.unit = b.dataset.unit; save(); renderTrain();
});

// Weight cut rules have to be accepted once before the first hard session.
const safety = $('#safety');
let safetyThenStart = false;
function openSafety(thenStart) {
  safetyThenStart = thenStart;
  $('#safety-ok').checked = S.cutOk;
  $('#safety-go').disabled = !S.cutOk;
  $('#safety-go').textContent = thenStart ? 'Start session' : 'Got it';
  safety.showModal();
}
$('#open-safety').addEventListener('click', () => openSafety(false));
$('#safety-ok').addEventListener('change', (e) => { $('#safety-go').disabled = !e.target.checked; });
$('#safety-cancel').addEventListener('click', () => safety.close());
$('#safety-go').addEventListener('click', () => {
  S.cutOk = true; save(); safety.close();
  if (safetyThenStart) startWorkout();
});
$('#start').addEventListener('click', () => {
  if (S.pace === 'hard' && !S.cutOk) openSafety(true); else startWorkout();
});

// ---------- Sound ----------

let actx = null;
function audioInit() {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    loadClips();
  } catch { actx = null; }
}

// Recorded coach lines, one mp3 per phrase. Anything without a clip falls back to the phone's voice.
// The coach only takes over once every line is recorded, so the voice never switches mid-session.
const LINES = allLines();
const coachReady = LINES.every((l) => CLIPS.includes(slug(l)));
const clips = new Map();
let clipSrc = null, clipsLoading = false;
async function loadClips() {
  if (clipsLoading || !actx || !coachReady) return;
  clipsLoading = true;
  await Promise.all(CLIPS.map(async (k) => {
    try {
      const res = await fetch(`audio/${k}.mp3`);
      if (res.ok) clips.set(k, await actx.decodeAudioData(await res.arrayBuffer()));
    } catch { /* offline before first cache: the phone voice covers it */ }
  }));
}
function hush() {
  synth?.cancel();
  try { clipSrc?.stop(); } catch { /* already ended */ }
  clipSrc = null;
}
function beep(freq, dur = 0.12, delay = 0, vol = 0.3) {
  if (!S.beeps || !actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voice = null;
function pickVoice() {
  const vs = synth?.getVoices() ?? [];
  voice = vs.find((v) => v.lang === 'en-US' && v.default) || vs.find((v) => v.lang === 'en-US') ||
    vs.find((v) => v.lang?.startsWith('en')) || null;
}
if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }
const RATE = { easy: 1.05, medium: 1.2, hard: 1.3 };
function say(text) {
  if (!S.voice) return;
  hush(); // a late call must never queue behind an old one
  const buf = S.coach && coachReady && actx?.state === 'running' && clips.get(slug(text));
  if (buf) {
    clipSrc = actx.createBufferSource();
    clipSrc.buffer = buf;
    clipSrc.connect(actx.destination);
    clipSrc.start();
    return;
  }
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = RATE[S.pace]; u.volume = 1;
  if (voice) u.voice = voice;
  synth.speak(u);
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not allowed, carry on */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && W && !W.ended) keepAwake(true);
});

// ---------- Workout ----------

let W = null;
const wEl = $('#workout');

function startWorkout() {
  audioInit();
  const phases = [{ type: 'prep', dur: 10 }];
  for (let r = 1; r <= S.rounds; r++) {
    phases.push({ type: 'work', dur: S.work, round: r });
    if (r < S.rounds) phases.push({ type: 'rest', dur: S.rest, round: r });
  }
  const cfg = { level: S.level, pace: S.pace, work: S.work, rest: S.rest, rounds: S.rounds, calls: S.calls };
  W = {
    cfg, phases, i: -1, t0: now(), paused: false, pausedAt: 0, lastWhole: -1,
    caller: makeCaller(S.level), nextCall: 0, calls: 0, spent: 0, roundsDone: 0,
    hrSum: 0, hrN: 0, hrPeak: 0, ended: false,
    total: phases.reduce((n, p) => n + p.dur, 0), elapsedBefore: 0,
    target: targetBpm(S.pace, maxHr(profile)),
  };
  wEl.hidden = false; wEl.dataset.paused = '0';
  $('#w-pause').textContent = 'Pause';
  $('#w-meta').textContent = `L${S.level} · ${PACES[S.pace].name}`;
  keepAwake(true);
  enterPhase(0, now());
  W.timer = setInterval(tick, 100);
}

function showCall(lines, cue, pop) {
  const el = $('#w-call');
  el.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  $('#w-cue').textContent = cue || '';
  fitCall();
  if (pop) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}
// Scale the call so the longest line fills the width without overflowing the stage.
function fitCall() {
  const el = $('#w-call'), stage = $('.w-stage');
  if (wEl.hidden || !el.firstChild) return;
  el.classList.remove('pop');
  el.style.fontSize = '100px';
  const r = el.getBoundingClientRect();
  const availW = stage.clientWidth - 28;
  const availH = stage.clientHeight - $('.w-phase').offsetHeight - $('#w-cue').offsetHeight - 44;
  const scale = Math.min(availW / r.width, availH / r.height);
  el.style.fontSize = clamp(100 * scale, 28, 260) + 'px';
}
addEventListener('resize', fitCall);

function enterPhase(i, t0) {
  W.i = i; W.t0 = t0; W.lastWhole = -1;
  const p = W.phases[i];
  const pace = PACES[W.cfg.pace];
  wEl.dataset.phase = p.type;
  const last = p.round === W.cfg.rounds;
  if (p.type === 'prep') {
    $('#w-round').textContent = 'Get ready';
    $('#w-phase').textContent = 'STARTS IN';
    showCall(['STANCE'], 'Feet under you, hips low, hands ready');
    say('Get in your stance');
  } else if (p.type === 'work') {
    $('#w-round').textContent = `Round ${p.round}/${W.cfg.rounds}`;
    $('#w-phase').textContent = last ? 'LAST ROUND' : 'WORK';
    beep(880, 0.45);
    if (W.cfg.calls) {
      showCall(['GO'], 'Stance and motion');
      if (last && W.cfg.rounds > 1) say('Last round');
      W.nextCall = last && W.cfg.rounds > 1 ? 1.5 : 0.5;
    } else {
      showCall(['GO'], 'All out until the whistle', true);
      say(last && W.cfg.rounds > 1 ? 'Last round. Go' : 'Go');
    }
  } else {
    $('#w-round').textContent = `Round ${p.round}/${W.cfg.rounds}`;
    $('#w-phase').textContent = W.cfg.pace === 'hard' ? 'ACTIVE REST' : 'REST';
    showCall(['REST'], pace.restCue, true);
    beep(440, 0.18); beep(440, 0.18, 0.25);
    say('Rest');
  }
  W.label = $('#w-phase').textContent;
  paint();
}

function leavePhase(elapsed) {
  const p = W.phases[W.i];
  W.elapsedBefore += p.dur; // progress bar treats a skipped phase as done
  if (p.type !== 'prep') W.spent += Math.min(elapsed, p.dur);
  if (p.type === 'work' && elapsed >= p.dur * 0.5) W.roundsDone++;
}

function tick() {
  if (!W || W.paused || W.ended) return;
  const p = W.phases[W.i];
  const el = now() - W.t0;
  const rem = p.dur - el;
  if (rem <= 0) {
    leavePhase(p.dur);
    if (W.i + 1 >= W.phases.length) return finish(true);
    return enterPhase(W.i + 1, W.t0 + p.dur); // carry the exact boundary so time never drifts
  }
  const whole = Math.ceil(rem);
  if (whole !== W.lastWhole) {
    W.lastWhole = whole;
    if (whole <= 3) beep(660, 0.09);
    sampleHr(p);
    paint();
  }
  if (p.type === 'work' && W.cfg.calls && el >= W.nextCall && rem > 1.3) {
    const m = W.caller(rem);
    if (m.t <= rem + 0.4) {
      W.calls++;
      showCall(m.lines, m.cue, true);
      say(m.say);
    }
    W.nextCall = el + m.t + gapFor(W.cfg.pace);
  }
}

function paint() {
  const p = W.phases[W.i];
  const el = W.paused ? W.pausedAt - W.t0 : now() - W.t0;
  const rem = clamp(p.dur - el, 0, p.dur);
  $('#w-time').textContent = fmtTime(Math.ceil(rem));
  const done = W.elapsedBefore + (p.dur - rem);
  $('#w-progress').style.width = (done / W.total) * 100 + '%';
  $('#w-left').textContent = `${fmtTime(W.total - done)} left`;
  paintHr();
}

function paintHr() {
  const chip = $('#w-hr');
  chip.hidden = !ble.bpm;
  if (!ble.bpm || !W) return;
  $('#w-bpm').textContent = ble.bpm;
  const z = zoneFor(ble.bpm, maxHr(profile));
  let txt = z ? `Z${z}` : 'bpm';
  if (W.target && W.phases[W.i].type === 'work') {
    txt += ble.bpm < W.target[0] ? ' · push' : ble.bpm > W.target[1] ? ' · ease off' : ' · on target';
  }
  $('#w-zone').textContent = txt;
}
function sampleHr(p) {
  if (!ble.bpm || p.type === 'prep') return;
  W.hrSum += ble.bpm; W.hrN++; W.hrPeak = Math.max(W.hrPeak, ble.bpm);
}

function setPaused(on) {
  if (!W || W.paused === on) return;
  W.paused = on;
  if (on) { W.pausedAt = now(); hush(); } else { W.t0 += now() - W.pausedAt; }
  wEl.dataset.paused = on ? '1' : '0';
  $('#w-pause').textContent = on ? 'Resume' : 'Pause';
  $('#w-phase').textContent = on ? 'PAUSED' : W.label;
}
$('#w-pause').addEventListener('click', () => { audioInit(); setPaused(!W.paused); });
$('#w-skip').addEventListener('click', () => {
  if (!W) return;
  const wasPaused = W.paused;
  if (wasPaused) setPaused(false);
  leavePhase(now() - W.t0);
  if (W.i + 1 >= W.phases.length) return finish(true);
  enterPhase(W.i + 1, now());
});
$('#w-end').addEventListener('click', () => {
  if (!W) return;
  setPaused(true);
  if (confirm('End this session now?')) {
    leavePhase(W.pausedAt - W.t0);
    finish(false);
  } else setPaused(false);
});

// ---------- Finish and log ----------

let pending = null;
function finish(completed) {
  clearInterval(W.timer);
  W.ended = true;
  hush();
  keepAwake(false);
  wEl.hidden = true;
  if (W.spent < 5) { W = null; return; } // quit during the countdown: nothing to save
  if (completed) { beep(880, 0.2); beep(880, 0.2, 0.3); beep(1175, 0.6, 0.6); say('Time. Good work.'); }

  const c = W.cfg;
  pending = {
    ts: Date.now(), ...c, completed, seconds: Math.round(W.spent), roundsDone: W.roundsDone, callCount: W.calls,
    avgHr: W.hrN ? Math.round(W.hrSum / W.hrN) : null, peakHr: W.hrPeak || null,
    unit: S.unit, wIn: c.pace === 'hard' && +S.wIn > 0 ? +S.wIn : null, wOut: null, pulse: null,
  };
  $('#d-title').textContent = completed ? 'Time' : 'Stopped';
  $('#d-sub').textContent = `Level ${c.level} · ${PACES[c.pace].intensity}: ${PACES[c.pace].name}`;
  const cells = [[fmtTime(pending.seconds), 'Time'], [`${pending.roundsDone}/${c.rounds}`, 'Rounds']];
  if (c.calls) cells.push([pending.callCount, 'Calls']);
  if (pending.avgHr) cells.push([pending.avgHr, 'Avg bpm'], [pending.peakHr, 'Peak bpm']);
  $('#d-stats').innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');

  $('#d-weight').hidden = c.pace !== 'hard';
  $('#w-out').value = ''; $('#w-out-unit').textContent = S.unit; $('#d-loss').innerHTML = '';
  pulseReset('done');
  $('#done').hidden = false; $('#done').scrollTop = 0;
  W = null;
}

function renderLoss() {
  const before = pending?.wIn, after = +$('#w-out').value;
  const out = $('#d-loss');
  if (!(after > 0)) { out.innerHTML = ''; return; }
  if (!before) { out.innerHTML = '<p class="fine">Enter a weight before the session next time to see how much you lost.</p>'; return; }
  const r = weightLoss(before, after);
  const u = pending.unit;
  let drink = '';
  if (r.lost > 0) {
    drink = u === 'kg'
      ? `After you weigh in, drink about ${(r.lost * 1.25).toFixed(1)}–${(r.lost * 1.5).toFixed(1)} L with something salty.`
      : `After you weigh in, drink about ${Math.round(r.lost * 20)}–${Math.round(r.lost * 24)} oz with something salty.`;
  }
  out.innerHTML = `<div class="loss ${r.level}"><b>${r.lost >= 0 ? '−' : '+'}${Math.abs(r.lost).toFixed(1)} ${u} · ${Math.abs(r.pct).toFixed(1)}%</b>
    <p>${r.note}</p>${drink ? `<p class="fine">${drink}</p>` : ''}</div>`;
}
$('#w-out').addEventListener('input', renderLoss);

$('#d-save').addEventListener('click', () => {
  if (pending) {
    const after = +$('#w-out').value;
    if (after > 0) pending.wOut = after;
    pending.pulse = pulses.done ?? null;
    log.unshift(pending); log = log.slice(0, 300); syncNudgeState();
    store.set('log', log); pending = null;
  }
  $('#done').hidden = true;
  renderLog();
});

function renderLog() {
  const week = Date.now() - 7 * 864e5;
  const mins = Math.round(log.reduce((n, e) => n + e.seconds, 0) / 60);
  $('#log-stats').innerHTML = [[log.length, 'Sessions'], [log.filter((e) => e.ts > week).length, 'Last 7 days'], [mins, 'Minutes']]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('#log-clear').hidden = !log.length;
  if (!log.length) {
    $('#log-list').innerHTML = '<p class="empty">Nothing yet. Finish a session and it shows up here.</p>';
    return;
  }
  $('#log-list').innerHTML = log.map((e) => {
    const p = PACES[e.pace];
    const d = new Date(e.ts);
    const when = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const nums = [`${fmtTime(e.seconds)}`, `${e.roundsDone}/${e.rounds} rounds of ${e.work}s/${e.rest}s`];
    if (e.calls) nums.push(`${e.callCount} calls`);
    if (e.avgHr) nums.push(`avg ${e.avgHr}, peak ${e.peakHr} bpm`);
    if (e.pulse) nums.push(`pulse ${e.pulse}`);
    if (e.wIn && e.wOut) {
      const r = weightLoss(e.wIn, e.wOut);
      nums.push(`${e.wIn} → ${e.wOut} ${e.unit} (${r.pct.toFixed(1)}%)`);
    }
    return `<div class="entry" style="--c: var(--${e.pace})"><div class="when">${when}</div>
      <div class="what">Level ${e.level} · ${p.name}${e.completed ? '' : ' (stopped early)'}</div>
      <div class="nums">${nums.join(' · ')}</div></div>`;
  }).join('');
}
$('#log-clear').addEventListener('click', () => {
  if (confirm('Delete every saved session?')) { log = []; store.set('log', log); renderLog(); }
});

// ---------- Heart rate tab ----------

function renderHr() {
  const max = maxHr(profile);
  const rest = profile.rest >= 30 && profile.rest <= 110 ? profile.rest : null;
  $('#hr-summary').textContent = !max
    ? 'Enter your age to see your numbers in beats per minute.'
    : profile.knownMax >= 120 ? `Using your own max of ${max} bpm.`
      : `Estimated max: ${max} bpm (208 − 0.7 × age). Real max can be 10 or more beats either side.`;
  $('#zones').innerHTML = ZONES.map((z) => {
    const pct = `${z.lo * 100}–${z.hi * 100}%`;
    let bp = `<div class="bp">${pct}<small>of max</small></div>`;
    if (max) {
      bp = `<div class="bp">${pctOfMax(max, z.lo)}–${pctOfMax(max, z.hi)}<small>${
        rest ? `reserve: ${pctOfReserve(max, rest, z.lo)}–${pctOfReserve(max, rest, z.hi)}` : pct}</small></div>`;
    }
    return `<div class="zone z${z.n}"><div class="n">${z.n}</div><div class="nm">${z.name}</div>${bp}<div class="fl">${z.feel}</div></div>`;
  }).join('');
  $('#pace-targets').innerHTML = Object.entries(PACES).map(([k, p]) => {
    const t = targetBpm(k, max);
    return `<div class="pt"><div>${p.intensity}: ${p.name}</div><b>${t ? `${t[0]}–${t[1]} bpm` : `${p.hr[0] * 100}–${p.hr[1] * 100}%`}</b>
      <span>${p.blurb}</span></div>`;
  }).join('');
}
for (const [id, key] of [['hr-age', 'age'], ['hr-rest', 'rest'], ['hr-max', 'knownMax']]) {
  const el = $('#' + id);
  el.value = profile[key] ?? '';
  el.addEventListener('input', () => {
    profile[key] = el.value === '' ? null : +el.value;
    store.set('profile', profile); renderHr(); renderTrain();
  });
}

// Tap-along pulse counter.
const pulses = {};
const taps = {};
function pulseReset(id) {
  taps[id] = []; delete pulses[id];
  $(`[data-pulse-out="${id}"] b`).textContent = '—';
}
for (const btn of $$('[data-pulse]')) {
  const id = btn.dataset.pulse;
  taps[id] = [];
  btn.addEventListener('pointerdown', () => {
    const t = now(), a = taps[id];
    if (a.length && t - a[a.length - 1] > 3) a.length = 0; // long gap: start over
    a.push(t);
    if (a.length > 12) a.shift();
    if (a.length >= 4) {
      const bpm = Math.round(60 * (a.length - 1) / (a[a.length - 1] - a[0]));
      if (bpm >= 30 && bpm <= 240) {
        pulses[id] = bpm;
        $(`[data-pulse-out="${id}"] b`).textContent = bpm;
      }
    }
  });
}

// Bluetooth heart rate strap (standard heart_rate service).
const ble = { bpm: null, device: null };
function bleStatus(msg) { $('#ble-status').textContent = msg; }
if (!navigator.bluetooth) {
  $('#ble-connect').hidden = true;
  $('#ble-note').textContent = 'This browser cannot talk to Bluetooth heart rate straps. Chrome on Android or a computer can. You can still tap your pulse above.';
}
$('#ble-connect').addEventListener('click', async () => {
  if (ble.device?.gatt?.connected) { ble.device.gatt.disconnect(); return; }
  try {
    bleStatus('Looking for monitors…');
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    ble.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      ble.bpm = null; bleStatus('Disconnected.'); $('#ble-connect').textContent = 'Connect heart rate monitor';
      if (W) paintHr();
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const ch = await service.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => {
      const v = e.target.value;
      ble.bpm = v.getUint8(0) & 1 ? v.getUint16(1, true) : v.getUint8(1);
      bleStatus(`${device.name || 'Monitor'}: ${ble.bpm} bpm`);
      if (W) paintHr();
    });
    await ch.startNotifications();
    $('#ble-connect').textContent = 'Disconnect';
    bleStatus(`${device.name || 'Monitor'} connected. Waiting for a reading…`);
  } catch (err) {
    bleStatus(err.name === 'NotFoundError' ? 'No monitor picked.' : 'Could not connect. Make sure the strap is on and awake.');
  }
});

// ---------- Guide, tabs, install ----------

$('#guide').innerHTML = GUIDE.map((g) =>
  `<details${g.open ? ' open' : ''}><summary>${g.title}</summary><div class="body">${g.html}</div></details>`).join('');

$('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  for (const t of $$('.tabs button')) t.classList.toggle('on', t === b);
  for (const v of $$('.view')) v.hidden = v.id !== 'view-' + b.dataset.tab;
  scrollTo(0, 0);
});

// ---------- Nudges ----------

const N = Object.assign({ on: false, from: 15, to: 21, every: 60, open: true, still: true, bg: true, last: 0 }, store.get('nudge', {}));
const STILL_MIN = 20;
const hasSW = 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost');
const sameDay = (ts) => ts && new Date(ts).toDateString() === new Date().toDateString();
const trainedToday = () => log.some((e) => sameDay(e.ts));
const inHours = () => {
  const h = new Date().getHours();
  return N.from <= N.to ? h >= N.from && h < N.to : h >= N.from || h < N.to;
};
const nudgeDue = () => N.on && !W && !pending && !trainedToday() && inHours() && Date.now() - N.last > N.every * 60000;

// The service worker cannot read localStorage, so the settings it needs go into a cache entry.
async function syncNudgeState() {
  store.set('nudge', N);
  if (!('caches' in window)) return;
  try {
    const state = { on: N.on, bg: N.bg, from: N.from, to: N.to, every: N.every, last: N.last, lastSession: log[0]?.ts ?? 0, lines: NUDGES };
    const cache = await caches.open('stance-state');
    await cache.put('state', new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }));
  } catch { /* storage blocked */ }
}

async function notify(body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'nudge', renotify: true, vibrate: [200, 100, 200] };
  try {
    if (hasSW) { (await navigator.serviceWorker.ready).showNotification('Stance & Motion', opts); return true; }
    new Notification('Stance & Motion', opts); return true;
  } catch { return false; }
}

function fireNudge(test) {
  const line = NUDGES[Math.floor(Math.random() * NUDGES.length)];
  if (!test) { N.last = Date.now(); syncNudgeState(); }
  if (document.visibilityState === 'visible') {
    $('#nudge-text').textContent = line;
    $('#nudge').hidden = false;
    navigator.vibrate?.([200, 100, 200]);
    audioInit(); say(line); // silent until the first tap on some phones
    if (test) notify(line);
  } else notify(line);
}
$('#nudge-later').addEventListener('click', () => { hush(); $('#nudge').hidden = true; });
$('#nudge-go').addEventListener('click', () => {
  hush(); $('#nudge').hidden = true;
  S.pace = 'easy'; applyPreset(); save(); renderTrain();
  $('[data-tab="train"]').click();
  startWorkout();
});

// Motion: remember the last time the phone moved.
let lastMoved = Date.now(), prevAcc = null, motionOn = false;
function onMotion(e) {
  const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
  if (prevAcc && Math.hypot(a.x - prevAcc.x, a.y - prevAcc.y, a.z - prevAcc.z) > 0.7) lastMoved = Date.now();
  prevAcc = { x: a.x, y: a.y, z: a.z };
}
async function motionStart(askPermission) {
  if (motionOn || !('DeviceMotionEvent' in window)) return;
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      if (!askPermission) return; // iPhones only allow asking from a tap
      if (await DeviceMotionEvent.requestPermission() !== 'granted') return;
    }
    addEventListener('devicemotion', onMotion); motionOn = true; lastMoved = Date.now();
  } catch { /* sensor blocked */ }
}
setInterval(() => {
  if (N.still && motionOn && Date.now() - lastMoved > STILL_MIN * 60000 && nudgeDue()) { lastMoved = Date.now(); fireNudge(); }
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && N.open && nudgeDue()) fireNudge();
});

async function bgSync() {
  if (!hasSW) return 'none';
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return 'none';
    const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (perm.state !== 'granted') return 'denied';
    if (N.on && N.bg) await reg.periodicSync.register('nudge', { minInterval: N.every * 60000 });
    else await reg.periodicSync.unregister('nudge');
    return 'ok';
  } catch { return 'none'; }
}

const hourName = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
for (const id of ['n-from', 'n-to']) {
  $('#' + id).innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hourName(h)}</option>`).join('');
}
async function renderNudge() {
  $('#n-on').checked = N.on; $('#n-open').checked = N.open; $('#n-still').checked = N.still; $('#n-bg').checked = N.bg;
  $('#n-from').value = N.from; $('#n-to').value = N.to; $('#n-every').value = N.every;
  $('#n-body').dataset.off = N.on ? '0' : '1';
  const bg = await bgSync();
  const perm = 'Notification' in window ? Notification.permission : 'none';
  const rows = [
    perm === 'granted' ? ['yes', 'Notifications', 'Allowed.']
      : perm === 'denied' ? ['no', 'Notifications', 'Blocked. Turn them back on for this site in your browser settings.']
        : perm === 'none' ? ['no', 'Notifications', 'Not available here. On an iPhone, add the app to your Home Screen first.']
          : ['', 'Notifications', 'Not asked yet. Turn on "Nudge me" to allow them.'],
    bg === 'ok' ? ['yes', 'Background check-ins', 'Available. The phone decides the timing, and it can be as rare as once or twice a day.']
      : bg === 'denied' ? ['no', 'Background check-ins', 'Install the app to your home screen and use it a few times, then Chrome allows them.']
        : ['no', 'Background check-ins', 'Not available in this browser. They work in Chrome on Android with the app installed.'],
    motionOn ? ['yes', 'Motion sensor', 'Reading movement while the app is open.']
      : 'DeviceMotionEvent' in window ? ['', 'Motion sensor', 'Turn "Phone sitting still" off and on again to allow it.']
        : ['no', 'Motion sensor', 'This device has no motion sensor the app can read.'],
  ];
  $('#n-status').innerHTML = rows.map(([c, t, d]) => `<div class="st ${c}"><i></i><b>${t}</b><span>${d}</span></div>`).join('');
}
$('#n-on').addEventListener('change', async (e) => {
  N.on = e.target.checked;
  if (N.on) {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    if (N.still) await motionStart(true);
  }
  await syncNudgeState(); renderNudge();
});
for (const [id, key] of [['n-open', 'open'], ['n-still', 'still'], ['n-bg', 'bg']]) {
  $('#' + id).addEventListener('change', async (e) => {
    N[key] = e.target.checked;
    if (key === 'still' && N.still) await motionStart(true);
    await syncNudgeState(); renderNudge();
  });
}
for (const [id, key] of [['n-from', 'from'], ['n-to', 'to'], ['n-every', 'every']]) {
  $('#' + id).addEventListener('change', async (e) => { N[key] = +e.target.value; await syncNudgeState(); renderNudge(); });
}
$('#n-test').addEventListener('click', () => fireNudge(true));

renderTrain(); renderHr(); renderLog();

if (hasSW) navigator.serviceWorker.register('sw.js').catch(() => {});
syncNudgeState(); renderNudge();
if (N.on && N.still) motionStart(false);
// Opened from a notification, or opened on a day with no session yet.
if (new URLSearchParams(location.search).has('nudge')) { history.replaceState(null, '', location.pathname); fireNudge(true); }
else if (N.open && nudgeDue()) fireNudge();
// Pull the coach clips through the service worker once so they are there offline.
if (hasSW && coachReady) setTimeout(() => CLIPS.forEach((k) => fetch(`audio/${k}.mp3`).catch(() => {})), 4000);
