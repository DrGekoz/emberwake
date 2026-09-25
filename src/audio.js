// Fully synthesized score and SFX: no audio files to load.
let ctx, master, music, sfx, verb, echo, noise;
let mode = -1, step = 0, nextT = 0, timer = 0, muted = false;
const last = {};

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const BPM = 84;
const S16 = 60 / BPM / 4;

const NIGHT = [
  { pad: [50, 53, 57, 60, 64], bass: 38 },
  { pad: [46, 50, 53, 57, 62], bass: 34 },
  { pad: [45, 53, 57, 60, 64], bass: 41 },
  { pad: [48, 52, 55, 57, 62], bass: 36 },
  { pad: [50, 53, 57, 60, 64], bass: 38 },
  { pad: [46, 50, 53, 57, 62], bass: 34 },
  { pad: [43, 50, 53, 57, 58], bass: 43 },
  { pad: [45, 52, 55, 57, 61], bass: 33 },
];
const BOSS = [
  { pad: [50, 53, 57, 62], bass: 38 },
  { pad: [51, 55, 58, 63], bass: 39 },
  { pad: [50, 53, 57, 62], bass: 38 },
  { pad: [49, 52, 55, 58], bass: 37 },
];
const MELODY = [
  [0, 69, 6], [6, 65, 2], [8, 64, 4], [12, 62, 4], [16, 65, 6], [22, 62, 2], [24, 60, 4], [28, 62, 4],
  [32, 69, 6], [38, 72, 2], [40, 76, 6], [46, 74, 2], [48, 72, 8], [56, 67, 8],
  [64, 69, 6], [70, 65, 2], [72, 64, 4], [76, 62, 4], [80, 65, 6], [86, 69, 2], [88, 70, 4], [92, 69, 4],
  [96, 67, 6], [102, 65, 2], [104, 62, 8], [112, 64, 8], [120, 73, 4], [124, 76, 4],
];
const BOSS_RIFF = [62, 62, 74, 62, 65, 62, 69, 67, 62, 62, 74, 62, 70, 69, 65, 64];

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = 2.2;
  master.connect(comp).connect(ctx.destination);
  music = ctx.createGain(); music.gain.value = 0.7; music.connect(master);
  sfx = ctx.createGain(); sfx.gain.value = 0.7; sfx.connect(master);

  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  verb.buffer = ir;
  const vg = ctx.createGain(); vg.gain.value = 0.5;
  verb.connect(vg).connect(master);

  echo = ctx.createDelay(1); echo.delayTime.value = S16 * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2400;
  echo.connect(ef).connect(fb).connect(echo);
  ef.connect(music); ef.connect(verb);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  timer = setInterval(schedule, 25);
}

export function toggleMute() {
  muted = !muted;
  if (music) music.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.1);
  return muted;
}

// 0 title, 1-3 night intensity, 4 boss, 5 dawn, 6 defeat
export function setMusic(m) {
  if (!ctx || m === mode) return;
  const prev = mode;
  mode = m;
  if (m === 5) dawnChord();
  if (m === 6) defeatChord();
  if ((prev >= 4 || prev <= 0) !== (m >= 4 || m <= 0) || m === 4) step = Math.ceil(step / 16) * 16;
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
}

function env(g, t, a, peak, hold, rel) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}

function osc(type, f, t, dur, out) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(out); o.start(t); o.stop(t + dur + 0.05);
  return o;
}

function noiseSrc(t, dur, out) {
  const s = ctx.createBufferSource();
  s.buffer = noise; s.loop = true;
  s.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  return s;
}

function filt(type, f, q = 1) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  return b;
}

function gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }

function pad(notes, t, dur, vol = 0.05, bright = 900) {
  const lp = filt('lowpass', bright, 0.7);
  lp.frequency.setValueAtTime(bright * 0.6, t);
  lp.frequency.linearRampToValueAtTime(bright, t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(bright * 0.7, t + dur);
  const g = gain();
  env(g, t, 0.6, vol, Math.max(dur - 1.2, 0.1), 1.6);
  lp.connect(g); g.connect(music); g.connect(verb);
  for (const n of notes) for (const d of [-7, 7]) {
    const o = osc('sawtooth', mtof(n), t, dur + 2, lp);
    o.detune.value = d;
  }
}

function pluck(n, t, vol = 0.05, type = 'square') {
  const lp = filt('lowpass', 2600, 2);
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.22);
  const g = gain();
  env(g, t, 0.004, vol, 0.01, 0.28);
  lp.connect(g); g.connect(music); g.connect(echo);
  osc(type, mtof(n), t, 0.35, lp);
}

function bell(n, t, vol = 0.06, dec = 1.6, dest) {
  const g = gain();
  env(g, t, 0.003, vol, 0.0, dec);
  g.connect(dest || music); g.connect(verb);
  const car = osc('sine', mtof(n), t, dec + 0.1, g);
  const mod = ctx.createOscillator();
  const mg = gain(mtof(n) * 2.2);
  mg.gain.setValueAtTime(mtof(n) * 2.2, t);
  mg.gain.exponentialRampToValueAtTime(1, t + dec * 0.6);
  mod.frequency.value = mtof(n) * 3.5;
  mod.connect(mg).connect(car.frequency);
  mod.start(t); mod.stop(t + dec + 0.1);
}

function bass(n, t, dur, vol = 0.14, grit = false) {
  const lp = filt('lowpass', grit ? 900 : 420, grit ? 6 : 1);
  const g = gain();
  env(g, t, 0.01, vol, dur * 0.5, dur * 0.6);
  lp.connect(g).connect(music);
  osc(grit ? 'sawtooth' : 'triangle', mtof(n), t, dur, lp);
  osc('sine', mtof(n - 12), t, dur, lp);
}

function kick(t, vol = 0.5) {
  const g = gain();
  env(g, t, 0.002, vol, 0.02, 0.28);
  g.connect(music);
  const o = osc('sine', 150, t, 0.35, g);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
}

function snare(t, vol = 0.18) {
  const g = gain(); env(g, t, 0.002, vol, 0.0, 0.16);
  const bp = filt('bandpass', 1900, 0.8);
  bp.connect(g); g.connect(music); g.connect(verb);
  noiseSrc(t, 0.2, bp);
  const g2 = gain(); env(g2, t, 0.002, vol * 0.8, 0, 0.08); g2.connect(music);
  osc('triangle', 190, t, 0.1, g2);
}

function hat(t, vol = 0.05, open = false) {
  const g = gain(); env(g, t, 0.001, vol, 0, open ? 0.2 : 0.035);
  const hp = filt('highpass', 7500, 0.7);
  hp.connect(g).connect(music);
  noiseSrc(t, 0.25, hp);
}

function schedule() {
  if (mode < 0 || mode >= 5) return;
  while (nextT < ctx.currentTime + 0.14) {
    playStep(step, nextT);
    step++;
    nextT += S16;
  }
}

function playStep(s, t) {
  const boss = mode === 4;
  const prog = boss ? BOSS : NIGHT;
  const barLen = 16;
  const bar = Math.floor(s / barLen) % prog.length;
  const b = s % barLen;
  const ch = prog[bar];
  const dur = S16 * barLen;

  if (b === 0) pad(ch.pad, t, dur, boss ? 0.035 : 0.04, boss ? 1300 : mode === 0 ? 700 : 950);

  if (mode === 0 || mode >= 2) {
    const loop = s % 128;
    for (const [at, n, len] of MELODY) if (at === loop && !boss) bell(n + (mode === 0 ? 0 : 12), t, mode === 0 ? 0.05 : 0.028, len * S16 * 2.5);
  }

  if (mode >= 1) {
    const tones = ch.pad;
    const idx = boss ? [0, 2, 1, 3, 2, 3, 1, 2] : [0, 1, 2, 3, 4, 3, 2, 1];
    if (boss || b % 2 === 0 || mode >= 3) {
      const i = idx[(b >> (boss || mode >= 3 ? 0 : 1)) % idx.length] % tones.length;
      pluck(tones[i] + 12, t, boss ? 0.028 : 0.022, boss ? 'sawtooth' : 'square');
    }
  }

  if (mode >= 2) {
    if (boss) {
      bass(BOSS_RIFF[b] - 24, t, S16 * 0.9, 0.11, true);
    } else if (b % 4 === 0 || b === 14) bass(ch.bass, t, S16 * (b === 14 ? 2 : 3.5), 0.13);
    if (b % 2 === 0) hat(t, boss ? 0.05 : 0.035);
    else if (boss || mode >= 3) hat(t, 0.02);
    if (b === 14 && mode >= 3) hat(t, 0.04, true);
  }

  if (mode >= 3) {
    if (b === 0 || b === 8 || (boss && (b === 4 || b === 12)) || b === 10) kick(t, boss ? 0.55 : 0.45);
    if (b === 4 || b === 12) snare(t, boss ? 0.2 : 0.15);
    if (boss && b === 15) snare(t, 0.08);
  }
}

function dawnChord() {
  const t = ctx.currentTime + 0.05;
  pad([50, 54, 57, 61, 64, 69], t, 6, 0.06, 1800);
  [62, 66, 69, 73, 74, 78, 81, 86].forEach((n, i) => bell(n, t + i * 0.16, 0.06, 2.8));
  bass(38, t, 5, 0.16);
}

function defeatChord() {
  const t = ctx.currentTime + 0.05;
  pad([38, 45, 50, 53], t, 4, 0.06, 500);
  [69, 65, 62, 57].forEach((n, i) => bell(n, t + i * 0.35, 0.05, 2.5));
}

// --- SFX -------------------------------------------------------------------

function ok(name, gap) {
  if (!ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < gap) return false;
  last[name] = now;
  return true;
}

export function shoot() {
  if (!ok('shoot', 0.05)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.002, 0.05, 0, 0.09);
  g.connect(sfx);
  const o = osc('triangle', 980 + Math.random() * 200, t, 0.12, g);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.09);
}

export function hit() {
  if (!ok('hit', 0.035)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.001, 0.07, 0, 0.06);
  const bp = filt('bandpass', 1400 + Math.random() * 600, 1.2);
  bp.connect(g).connect(sfx);
  noiseSrc(t, 0.08, bp);
}

export function kill(big = false) {
  if (!ok('kill', 0.03)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.002, big ? 0.16 : 0.08, 0, big ? 0.4 : 0.12);
  g.connect(sfx);
  const o = osc('square', big ? 300 : 720 + Math.random() * 180, t, 0.4, g);
  o.frequency.exponentialRampToValueAtTime(big ? 50 : 160, t + (big ? 0.35 : 0.1));
  if (big) { const n = gain(); env(n, t, 0.002, 0.2, 0.05, 0.5); const lp = filt('lowpass', 900); lp.connect(n).connect(sfx); n.connect(verb); noiseSrc(t, 0.6, lp); }
}

const PENTA = [0, 2, 4, 7, 9];
export function gem(streak) {
  if (!ok('gem', 0.028)) return;
  const i = Math.min(streak, 24);
  const n = 72 + Math.floor(i / 5) * 12 + PENTA[i % 5];
  bell(Math.min(n, 108), ctx.currentTime, 0.035, 0.35, sfx);
}

export function levelUp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [74, 78, 81, 86, 90].forEach((n, i) => bell(n, t + i * 0.07, 0.07, 1.2, sfx));
  const g = gain(); env(g, t, 0.1, 0.05, 0.3, 1.2); const hp = filt('highpass', 3000); hp.connect(g).connect(sfx); g.connect(verb); noiseSrc(t, 1.6, hp);
}

export function hurt() {
  if (!ok('hurt', 0.1)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.002, 0.22, 0.02, 0.22);
  const lp = filt('lowpass', 1200); lp.connect(g).connect(sfx);
  const o = osc('square', 190, t, 0.3, lp);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.22);
  noiseSrc(t, 0.12, lp);
}

export function dash() {
  if (!ok('dash', 0.05)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.02, 0.12, 0.03, 0.18);
  const bp = filt('bandpass', 600, 1.4);
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(3500, t + 0.2);
  bp.connect(g).connect(sfx); g.connect(verb);
  noiseSrc(t, 0.3, bp);
}

export function ignite() {
  if (!ctx) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.03, 0.3, 0.1, 0.9);
  const lp = filt('lowpass', 200, 2);
  lp.frequency.setValueAtTime(150, t);
  lp.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
  lp.frequency.exponentialRampToValueAtTime(500, t + 1);
  lp.connect(g).connect(sfx); g.connect(verb);
  noiseSrc(t, 1.2, lp);
  [62, 69, 74].forEach((n, i) => bell(n + 12, t + 0.1 + i * 0.06, 0.04, 1.2, sfx));
}

export function nova() {
  if (!ok('nova', 0.1)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.005, 0.16, 0.02, 0.6);
  g.connect(sfx); g.connect(verb);
  const o = osc('sine', 900, t, 0.7, g);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.5);
  const n = gain(); env(n, t, 0.005, 0.1, 0, 0.4); const hp = filt('highpass', 2000); hp.connect(n).connect(sfx); noiseSrc(t, 0.5, hp);
}

export function zap() {
  if (!ok('zap', 0.06)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.001, 0.12, 0.05, 0.12);
  const hp = filt('bandpass', 3000, 0.6); hp.connect(g).connect(sfx); g.connect(verb);
  noiseSrc(t, 0.25, hp);
  const o = osc('sawtooth', 120, t, 0.2, g);
  o.frequency.setValueAtTime(900, t + 0.03);
  o.frequency.setValueAtTime(200, t + 0.07);
}

export function block() {
  if (!ctx) return;
  const t = ctx.currentTime;
  bell(88, t, 0.08, 0.8, sfx); bell(95, t + 0.03, 0.05, 0.8, sfx);
}

export function roar() {
  if (!ctx) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.3, 0.3, 0.8, 1.2);
  const lp = filt('lowpass', 300, 5);
  lp.frequency.linearRampToValueAtTime(1400, t + 1);
  lp.frequency.linearRampToValueAtTime(200, t + 2.2);
  lp.connect(g).connect(sfx); g.connect(verb);
  for (const f of [55, 55.8, 82.5]) {
    const o = osc('sawtooth', f, t, 2.4, lp);
    o.frequency.linearRampToValueAtTime(f * 0.7, t + 2.3);
  }
}

export function gong() {
  if (!ctx) return;
  const t = ctx.currentTime;
  bell(38, t, 0.2, 3.5, sfx); bell(50, t, 0.1, 3, sfx);
  kick(t, 0.6);
}

export function ui(up = true) {
  if (!ok('ui', 0.04)) return;
  const t = ctx.currentTime, g = gain();
  env(g, t, 0.002, 0.06, 0.02, 0.06);
  g.connect(sfx);
  osc('square', up ? 880 : 660, t, 0.1, g);
}

export function pick() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [81, 88, 93].forEach((n, i) => bell(n, t + i * 0.05, 0.06, 0.8, sfx));
}


// Test hook: lets automation read output levels.
export const debug = () => ({ ctx, master });
