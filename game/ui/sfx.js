/* Sound, all of it synthesised: no audio files, nothing fetched at play time.
 *
 * During a turn, four things and nothing else (screen.js says why): robots
 * moving -- servos whining as a robot drives, a thud when one shoves
 * another, conveyors clattering, gears ratcheting round; a chime for each
 * register; damage -- the clang of a hit, the whistle of a fall into a pit,
 * the boom of a robot shot to pieces; and a brighter chime for a flag.
 * Outside the replay: the snap of a card going into a register, the title
 * menu's tick, the winner's fanfare.
 *
 * THE SOUNDS FOLLOW THE REPLAY, NOT THE ENGINE. The screen plays them from
 * the same timed actions that move the pieces (screen.js compile()), so a
 * sound is heard as its robot moves, at whatever speed the floor is set to.
 * The engine never knows sound exists: a replayed or simulated race is the
 * same race, silent or not.
 *
 * ONE BELT, ONE CLATTER. A board pass plays every event in it at once,
 * because every belt does move at once, and eight robots on belts would
 * otherwise be eight clatters stacked into one loud one. A sound asked for
 * again within a few milliseconds of itself is dropped.
 *
 * The browser holds sound back until the page has been touched, so nothing
 * plays until then; unlock() is called on every press and click, and the
 * first one starts the context.
 *
 * Muted is saved as pumarally_muted_v1, "1" or "0" (games-meta STANDARD.md
 * §5, §8). M toggles it anywhere in the game; main.js binds the key.
 */
const MUTED_KEY = "pumarally_muted_v1";
const LEVEL = 0.5;
const SAME = 40;                        // ms: the same sound again this soon is the same sound

let ac = null, out = null, comp = null, noiseBuf = null;
let muted = (() => { try { return localStorage.getItem(MUTED_KEY) === "1"; } catch (e) { return false; } })();
const last = new Map();                 // sound -> performance.now() it last played

/** Start (or wake) the audio context. Cheap to call on every gesture. */
export function unlock() {
  if (ac) { if (ac.state === "suspended") ac.resume().catch(() => { /* not yet allowed */ }); return; }
  try { const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext; if (!Ctx) return; ac = new Ctx(); } catch (e) { ac = null; return; }
  out = ac.createGain(); out.gain.value = muted ? 0 : LEVEL; out.connect(ac.destination);
  comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(out);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(MUTED_KEY, muted ? "1" : "0"); } catch (e) { /* no storage */ }
  if (out) out.gain.setTargetAtTime(muted ? 0 : LEVEL, ac.currentTime, 0.015);
}
export function toggleMute() { setMuted(!muted); return muted; }

/* --- the two voices everything is made of ------------------------------------ */

/** A tone gliding f0 -> f1 over ms, with a fast attack and an exponential fall. */
function tone(d, f0, f1, ms, type, vol, at = 0) {
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + 0.005 + at, s = ms / 1000;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + s);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, t + s);
  o.connect(g); g.connect(d); o.start(t); o.stop(t + s + 0.02);
}
/** Noise through a filter, falling away over ms; the filter may glide to f1. */
function hiss(d, ms, vol, freq, type = "bandpass", q = 1, at = 0, f1 = null) {
  const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime + 0.005 + at, s = ms / 1000;
  n.buffer = noiseBuf;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + s);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + s);
  n.connect(f); f.connect(g); g.connect(d); n.start(t, Math.random() * 1.5); n.stop(t + s + 0.02);
}

/* the register chimes climb a pentatonic step each register, so the five
 * beats of a turn are heard as a phrase going up */
const REGISTER_STEPS = [0, 2, 4, 7, 9];
const semi = n => Math.pow(2, n / 12);

/* Each sound takes the bus to play into and p, a pitch factor near 1 (a
 * robot's own, so two robots driving at once do not sound like one). */
const SOUNDS = {
  /* the title menu's tick (STANDARD.md §14): a click of noise, falling fast */
  tick: d => hiss(d, 14, 0.12, 2400, "bandpass", 1.2),

  /* the hand and the registers: the player's own actions, never the replay's */
  card: d => { hiss(d, 28, 0.16, 3600, "highpass", 0.8); tone(d, 900, 620, 40, "triangle", 0.06); },
  uncard: d => { hiss(d, 24, 0.1, 2200, "bandpass", 1); tone(d, 520, 380, 45, "triangle", 0.05); },
  lock: d => {
    tone(d, 190, 120, 70, "square", 0.05); hiss(d, 60, 0.18, 900, "lowpass", 1);
    tone(d, 260, 170, 90, "square", 0.05, 0.09); hiss(d, 80, 0.2, 900, "lowpass", 1, 0.09);
  },
  curtain: d => tone(d, 330, 495, 120, "triangle", 0.05),

  /* the replay's beats: one chime per register */
  register: (d, p, n = 0) => {
    const f = 523.25 * semi(REGISTER_STEPS[n % REGISTER_STEPS.length]);
    tone(d, f, f, 220, "triangle", 0.09); tone(d, f * 2, f * 2, 140, "sine", 0.025, 0.01);
  },

  /* movement: a robot's servo whine over its treads, a shove, the floor carrying it */
  step: (d, p) => { tone(d, 150 * p, 230 * p, 200, "sawtooth", 0.025); hiss(d, 200, 0.07, 380 * p, "lowpass", 1.2); },
  turn: (d, p) => { tone(d, 240 * p, 170 * p, 190, "sawtooth", 0.022); hiss(d, 160, 0.05, 520 * p, "lowpass", 1.4); },
  bump: d => { tone(d, 130, 48, 140, "sine", 0.45); hiss(d, 90, 0.25, 700, "lowpass", 1); tone(d, 95, 70, 40, "square", 0.04); },
  belt: d => { for (let i = 0; i < 6; i++) hiss(d, 20, 0.12, 1500 + (i % 2) * 300, "bandpass", 3, i * 0.048); tone(d, 72, 72, 290, "sawtooth", 0.02); },
  express: d => { for (let i = 0; i < 10; i++) hiss(d, 16, 0.12, 1800 + (i % 2) * 400, "bandpass", 3, i * 0.028); tone(d, 96, 96, 290, "sawtooth", 0.022); },
  /* a gear ratchets round: clicks climbing for a turn right, falling for a left */
  gear: (d, p, dir = 1) => {
    for (let i = 0; i < 5; i++) tone(d, 1500 * semi(dir * i * 1.5), 1300 * semi(dir * i * 1.5), 14, "square", 0.025, i * 0.042);
    tone(d, 110, 80, 70, "sine", 0.25, 0.2);
  },
  beltTurn: d => { tone(d, 1400, 1200, 14, "square", 0.022); tone(d, 1600, 1400, 14, "square", 0.022, 0.05); },
  teleport: d => { tone(d, 300, 1900, 150, "sine", 0.06); tone(d, 1900, 500, 170, "sine", 0.05, 0.13); hiss(d, 300, 0.05, 4000, "highpass", 0.6); },

  /* damage, and a robot lost */
  clank: d => {
    /* inharmonic partials ring like struck plate rather than a note */
    for (const [f, v] of [[440, 0.07], [1123, 0.05], [1871, 0.035], [2963, 0.02]]) tone(d, f, f * 0.97, 320, "sine", v);
    hiss(d, 60, 0.3, 2400, "bandpass", 0.9);
  },
  burn: d => { hiss(d, 420, 0.3, 900, "bandpass", 0.6, 0, 2400); hiss(d, 300, 0.1, 5000, "highpass", 0.5, 0.05); },
  geiger: d => { for (let i = 0; i < 7; i++) hiss(d, 6, 0.3, 3500, "highpass", 0.7, i * 0.03 + Math.random() * 0.025); },
  fall: d => { tone(d, 1100, 140, 620, "sine", 0.07); tone(d, 1110, 142, 620, "triangle", 0.025); tone(d, 70, 40, 180, "sine", 0.3, 0.6); hiss(d, 140, 0.14, 500, "lowpass", 1, 0.6); },
  boom: d => {
    hiss(d, 800, 0.7, 1800, "lowpass", 0.7, 0, 70); tone(d, 95, 30, 700, "sine", 0.6);
    for (let i = 0; i < 4; i++) hiss(d, 60, 0.15, 3000, "bandpass", 1, 0.08 + i * 0.07 + Math.random() * 0.04);
  },

  /* a flag touched: two notes up, brighter than a register's chime */
  flag: d => { tone(d, 784, 784, 130, "triangle", 0.09); tone(d, 1174.7, 1174.7, 260, "triangle", 0.09, 0.12); tone(d, 2349, 2349, 200, "sine", 0.02, 0.12); },

  /* the race won, after the last turn */
  win: d => {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      const long = i === 6, at = i * 0.13;
      tone(d, f, f, long ? 700 : 150, "triangle", 0.09, at);
      tone(d, f, f, long ? 600 : 120, "square", 0.018, at);
    });
  }
};

/**
 * Play a sound by name. pitch nudges it (a robot's own voice); arg is the
 * sound's own detail (the register for "register", +1/-1 for "gear").
 */
export function play(name, { vol = 1, pitch = 1, arg } = {}) {
  if (muted || !ac || ac.state !== "running" || !SOUNDS[name]) return;
  const now = performance.now();
  if (now - (last.get(name) || -1e9) < SAME) return;
  last.set(name, now);
  const g = ac.createGain();
  g.gain.value = vol;
  g.connect(comp);
  SOUNDS[name](g, pitch, arg);
  setTimeout(() => g.disconnect(), 2500);
}

/** A robot's pitch: each seat a little apart, so two drivers are two sounds. */
export function voiceOf(id) { return 1 + ((id * 5) % 8 - 3.5) * 0.035; }
