// Moves, levels, paces and heart-rate maths. No DOM in here so it can be tested on its own.

// t = seconds a wrestler needs to finish the move and get back to stance.
export const MOVES = {
  shot:         { say: 'Shot',              lines: ['SHOT'],                  t: 1.6, cue: 'Level change, penetration step, back to stance' },
  sprawl:       { say: 'Sprawl',            lines: ['SPRAWL'],                t: 1.8, cue: 'Hips down and back, then circle up' },
  downblock:    { say: 'Down block',        lines: ['DOWN', 'BLOCK'],         t: 1.2, cue: 'Lower your level, hands to the mat side, stay square' },
  reshot:       { say: 'Shot, re-shot',     lines: ['SHOT', 'RE-SHOT'],       t: 3.0, cue: 'Finish the first, recover, fire again' },
  fakeClubShot: { say: 'Fake, club, shot',  lines: ['FAKE', 'CLUB', 'SHOT'],  t: 2.8, cue: 'Sell the fake, heavy club, shoot off the reaction' },
  clubShot:     { say: 'Club, shot',        lines: ['CLUB', 'SHOT'],          t: 2.2, cue: 'Club the head down, shoot as it comes up' },
  circleLeft:   { say: 'Circle hard left',  lines: ['CIRCLE', 'HARD LEFT'],   t: 2.6, cue: 'Short choppy steps, never cross your feet' },
  circleRight:  { say: 'Circle hard right', lines: ['CIRCLE', 'HARD RIGHT'],  t: 2.6, cue: 'Short choppy steps, never cross your feet' },
};

// Level 3 only: named shots.
export const SHOTS = [
  { say: 'Double leg',   lines: ['DOUBLE', 'LEG'],   t: 1.8, cue: 'Head up, drive across' },
  { say: 'Single leg',   lines: ['SINGLE', 'LEG'],   t: 1.8, cue: 'Head inside, corner off' },
  { say: 'High crotch',  lines: ['HIGH', 'CROTCH'],  t: 1.8, cue: 'Head outside, hips under you' },
  { say: 'Sweep single', lines: ['SWEEP', 'SINGLE'], t: 2.0, cue: 'Step outside, sweep around the leg' },
  { say: 'Low single',   lines: ['LOW', 'SINGLE'],   t: 2.0, cue: 'Drop to the ankle, head by the knee' },
];

// Level 3 only: chains built from everything above.
const combo = (say, t, cue = 'Every piece at full speed, finish in your stance') =>
  ({ say, lines: say.toUpperCase().split(', '), t, cue });

export const COMBOS = [
  combo('Sprawl, re-shot', 3.2),
  combo('Down block, re-shot', 2.8),
  combo('Shot, sprawl, shot', 4.2),
  combo('Fake, sprawl, shot', 3.6),
  combo('Fake, fake, shot', 2.8),
  combo('Sprawl, circle left', 3.6),
  combo('Sprawl, circle right', 3.6),
  combo('Double leg, sprawl', 3.4),
  combo('Single leg, re-shot double', 3.6),
  combo('High crotch, sprawl, re-shot', 5.0),
  combo('Club, shot, sprawl', 4.0),
  combo('Fake, club, shot, re-shot', 4.4),
  combo('Shot, re-shot, sprawl', 4.6),
  combo('Sprawl, sprawl, shot', 4.6),
  combo('Down block, club, shot', 3.6),
];

export const SYSTEM_LINES = ['Get in your stance', 'Go', 'Last round', 'Last round. Go', 'Rest', 'Time. Good work.'];

export const NUDGE_TEXT = 'You have not trained today.';

// File name for a spoken line: audio/<slug>.mp3
export const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const allLines = () => [...Object.values(MOVES), ...SHOTS, ...COMBOS].map((m) => m.say).concat(SYSTEM_LINES);

const L1 = ['shot', 'sprawl', 'downblock', 'reshot'];
const L2 = [...L1, 'fakeClubShot', 'clubShot', 'circleLeft', 'circleRight'];

export const LEVELS = {
  1: { name: 'Level 1', tag: 'The four basics', base: L1, extras: false },
  2: { name: 'Level 2', tag: 'Add set-ups and circling', base: L2, extras: false },
  3: { name: 'Level 3', tag: 'Everything, plus shots and combos', base: L2, extras: true },
};

// gap = extra seconds after a move is finished before the next call.
// hr = target share of max heart rate during the work bouts.
export const PACES = {
  easy: {
    intensity: 'Easy', name: 'Warm up',
    work: 30, rest: 30, rounds: 6, gap: [2.4, 4.0], hr: [0.60, 0.75],
    blurb: 'Loosen up. Clean technique, light sweat, you could talk.',
    restCue: 'Shake out, breathe through your nose',
  },
  medium: {
    intensity: 'Medium', name: 'Conditioning',
    work: 30, rest: 30, rounds: 12, gap: [0.9, 1.9], hr: [0.80, 0.90],
    blurb: 'Match pace. Every call at full speed, recover on the rest.',
    restCue: 'Stay on your feet, slow your breathing',
  },
  hard: {
    intensity: 'Hard', name: 'Weight cut', sub: 'water loss',
    work: 40, rest: 20, rounds: 20, gap: [0.4, 1.1], hr: [0.85, 0.95],
    blurb: 'Long, fast and sweaty. Calls barely stop and the rests are short.',
    restCue: 'Keep your feet moving, stay warm',
  },
};

// Returns a function that hands back the next call for a level.
// Never repeats the call it just made. `allowed` can leave out moves (used to skip ones with no recording).
export function makeCaller(level, rng = Math.random, allowed = () => true) {
  const lv = LEVELS[level];
  const base = lv.base.map((k) => MOVES[k]);
  const shots = SHOTS.filter(allowed), combos = COMBOS.filter(allowed);
  let last = null;
  const pick = (list) => list[Math.floor(rng() * list.length)];
  return function next(maxT = Infinity) {
    for (let i = 0; i < 40; i++) {
      let pool = base;
      if (lv.extras) {
        const r = rng();
        pool = r < 0.4 ? base : r < 0.6 ? shots : combos;
        if (!pool.length) pool = base;
      }
      const m = pick(pool);
      if (m !== last && m.t <= maxT) { last = m; return m; }
    }
    // Not enough time left for anything long: fall back to the quickest base move.
    const quick = base.filter((m) => m !== last).sort((a, b) => a.t - b.t)[0];
    last = quick;
    return quick;
  };
}

export const gapFor = (pace, rng = Math.random) => {
  const [lo, hi] = PACES[pace].gap;
  return lo + rng() * (hi - lo);
};

// ---- Heart rate ----

// Tanaka, Monahan & Seals (2001): 208 - 0.7 x age. Closer than 220 - age for most adults.
export const maxHrFromAge = (age) => Math.round(208 - 0.7 * age);

export function maxHr(profile) {
  if (profile.knownMax >= 120 && profile.knownMax <= 230) return profile.knownMax;
  if (profile.age >= 8 && profile.age <= 90) return maxHrFromAge(profile.age);
  return null;
}

export const ZONES = [
  { n: 1, lo: 0.50, hi: 0.60, name: 'Recovery',  feel: 'Very easy, full sentences' },
  { n: 2, lo: 0.60, hi: 0.70, name: 'Easy',      feel: 'Warm, light sweat' },
  { n: 3, lo: 0.70, hi: 0.80, name: 'Steady',    feel: 'Breathing hard, short sentences' },
  { n: 4, lo: 0.80, hi: 0.90, name: 'Hard',      feel: 'Match pace, a few words at a time' },
  { n: 5, lo: 0.90, hi: 1.00, name: 'All out',   feel: 'Third-period scramble, no talking' },
];

export const pctOfMax = (max, pct) => Math.round(max * pct);
// Karvonen: works from heart rate reserve (max - resting).
export const pctOfReserve = (max, rest, pct) => Math.round((max - rest) * pct + rest);

export function zoneFor(bpm, max) {
  if (!max || !bpm) return null;
  const p = bpm / max;
  if (p < 0.5) return 0;
  for (const z of ZONES) if (p < z.hi) return z.n;
  return 5;
}

export function targetBpm(pace, max) {
  if (!max) return null;
  const [lo, hi] = PACES[pace].hr;
  return [pctOfMax(max, lo), pctOfMax(max, hi)];
}

// ---- Weight ----

// Share of body weight lost in one session, and what to say about it.
export function weightLoss(before, after) {
  if (!(before > 0) || !(after > 0)) return null;
  const lost = before - after;
  const pct = (lost / before) * 100;
  let level = 'ok', note = 'Small change. Drink back what you lost once you have weighed in.';
  if (pct >= 3) {
    level = 'stop';
    note = 'Over 3% in one session is too much. Stop, cool down, start drinking, and tell your coach or trainer.';
  } else if (pct >= 2) {
    level = 'warn';
    note = 'Past 2%, strength, speed and thinking all start to drop. That is enough for today.';
  } else if (pct >= 1) {
    level = 'note';
    note = 'You are in the range where you will feel it. Do not stack another sweat session on top of this one.';
  } else if (pct < 0) {
    note = 'You weigh more than when you started.';
  }
  return { lost, pct, level, note };
}

export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
