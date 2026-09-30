// The sound of a video, synthesised from the scene alone (docs/research/05 §4, 08 §2).
//
//   node export/score.mjs <scene id> [--style X] [--out file.wav]
//
// No sample files and no generative model: every sound is computed here from oscillators, seeded
// noise and simple filters, so a scene always sounds the same, nothing can be claimed by Content ID,
// and there is no licence to track. What it plays follows the research:
//   - a quiet bed on an open fifth (never minor, never a melody), one timbre per style
//   - a soft whoosh into each block, a pluck at the start and at the loop point
//   - one peak per video: a short rise into the scale or pattern beat that resolves on an open chord,
//     not an impact; strikes get a lower bed and no brightness (nothing that sounds like a blast)
//   - a tick for each of our records as it lights on the map, typewriter clicks for styles that type
//   - a short silence before the verification status: a reset, so the status is heard as a fact
// Levels are set loosely here; the exporter brings the mix to -14 LUFS with ffmpeg's loudnorm.
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScene } from '../src/engine/scene.ts';
import { STYLES } from '../src/styles.ts';
import { rng } from '../src/engine/time.ts';

const SR = 48000;

/** One palette per style: the bed's root and timbre, and the extra textures it allows. */
const PALETTE = {
  A: { root: 55.0, wave: 'saw', cutoff: 420, plucks: false, clicks: false },
  B: { root: 65.41, wave: 'square', cutoff: 520, plucks: false, clicks: true },
  C: { root: 73.42, wave: 'sine', cutoff: 900, plucks: true, clicks: false },
  D: { root: 49.0, wave: 'sine', cutoff: 600, plucks: false, clicks: false },
  E: { root: 55.0, wave: 'saw', cutoff: 360, plucks: true, clicks: false },
  G: { root: 58.27, wave: 'sine', cutoff: 700, plucks: true, clicks: false },
  H: { root: 61.74, wave: 'square', cutoff: 380, plucks: false, clicks: true },
  I: { root: 61.74, wave: 'triangle', cutoff: 650, plucks: false, clicks: true },
  K: { root: 73.42, wave: 'triangle', cutoff: 800, plucks: true, clicks: false },
};

/** A state-variable filter (Chamberlin): lowpass and bandpass, cheap enough to sweep per sample. */
function svf() {
  let low = 0, band = 0;
  return (x, f, q) => {
    const k = 2 * Math.sin((Math.PI * Math.min(f, SR / 6)) / SR);
    low += k * band;
    const high = x - low - band / q;
    band += k * high;
    return { low, band };
  };
}

export function score(scene, style) {
  const pal = PALETTE[style.id] ?? PALETTE.A;
  const n = Math.ceil(scene.duration * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rand = rng([...scene.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7));
  const strike = scene.template === 'strike' || /saldır|öldü|yaralan/i.test(scene.hook.lines.join(' '));
  const put = (i, v, pan = 0) => { if (i >= 0 && i < n) { L[i] += v * Math.min(1, 1 - pan); R[i] += v * Math.min(1, 1 + pan); } };

  // ---- the bed: root and fifth, lowpassed, breathing slowly; ducked for the silence before the status
  const status = scene.beats.find((b) => b.kind === 'status');
  const bedLevel = strike ? 0.006 : 0.009; // a bed, not a score: about 12 dB under the cues
  const f1 = svf(), f2 = svf();
  let p1 = 0, p2 = 0;
  const osc = (p) => pal.wave === 'saw' ? 2 * p - 1 : pal.wave === 'square' ? (p < 0.5 ? 0.6 : -0.6) : pal.wave === 'triangle' ? 1 - 4 * Math.abs(p - 0.5) : Math.sin(2 * Math.PI * p);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p1 = (p1 + pal.root / SR) % 1; p2 = (p2 + (pal.root * 1.5) / SR) % 1;
    const cut = pal.cutoff * (1 + 0.18 * Math.sin(2 * Math.PI * 0.07 * t));
    const x = 0.6 * osc(p1) + 0.4 * osc(p2);
    let env = Math.min(1, t / 0.5, (scene.duration - t) / 0.4);
    if (status) { const d = t - (status.at - 0.35); if (d >= 0 && d < 0.6) env *= d < 0.35 ? 0.25 : 0.25 + 0.75 * ((d - 0.35) / 0.25); }
    const yl = f1(x, cut, 0.8).low, yr = f2(x, cut * 1.02, 0.8).low;
    L[i] += yl * bedLevel * env; R[i] += yr * bedLevel * env;
  }

  // ---- cues ----------------------------------------------------------------------------------------
  const whoosh = (at, dur = 0.6, amp = 0.12) => {
    const f = svf(), s0 = Math.round(at * SR), len = Math.round(dur * SR);
    for (let k = 0; k < len; k++) {
      const u = k / len;
      const fc = u < 0.55 ? 300 * Math.pow(2500 / 300, u / 0.55) : 2500 * Math.pow(600 / 2500, (u - 0.55) / 0.45);
      const env = u < 0.55 ? Math.pow(u / 0.55, 2) : Math.pow(1 - (u - 0.55) / 0.45, 1.5);
      const y = f(rand() * 2 - 1, fc, 1.4).band;
      put(s0 + k, y * amp * env, -0.6 + 1.2 * u);
    }
  };
  const tick = (at, freq = 2400, amp = 0.05, dur = 0.03) => {
    const s0 = Math.round(at * SR), len = Math.round(dur * SR);
    for (let k = 0; k < len; k++) put(s0 + k, Math.sin((2 * Math.PI * freq * k) / SR) * amp * Math.exp(-k / (len / 5)));
  };
  const click = (at, amp = 0.035) => {
    const f = svf(), s0 = Math.round(at * SR), len = Math.round(0.012 * SR);
    for (let k = 0; k < len; k++) put(s0 + k, f(rand() * 2 - 1, 3500, 2).band * amp * Math.exp(-k / (len / 4)), (rand() - 0.5) * 0.4);
  };
  /** Karplus–Strong: a plucked string from a burst of seeded noise, for the soft styles. */
  const pluck = (at, freq, amp = 0.08, dur = 1.4) => {
    const period = Math.round(SR / freq), buf = new Float32Array(period);
    for (let k = 0; k < period; k++) buf[k] = rand() * 2 - 1;
    const s0 = Math.round(at * SR), len = Math.round(dur * SR);
    for (let k = 0, j = 0; k < len; k++, j = (j + 1) % period) {
      const next = buf[(j + 1) % period];
      buf[j] = 0.996 * 0.5 * (buf[j] + next);
      put(s0 + k, buf[j] * amp * (1 - k / len));
    }
  };
  const chord = (at, root, amp = 0.05, dur = 2.6) => {
    const s0 = Math.round(at * SR), len = Math.round(dur * SR);
    for (let k = 0; k < len; k++) {
      const t = k / SR, env = Math.min(1, t / 0.06) * Math.exp(-t / (dur / 3));
      const v = [2, 3, 4, 6].reduce((a, h, i) => a + Math.sin(2 * Math.PI * root * h * t) / (1 + i), 0);
      put(s0 + k, v * amp * env * 0.5);
    }
  };
  const riser = (end, dur = 1.1, amp = 0.035) => {
    const f = svf(), s0 = Math.round((end - dur) * SR), len = Math.round(dur * SR);
    let p = 0;
    for (let k = 0; k < len; k++) {
      const u = k / len, freq = 200 * Math.pow(4, u);
      p = (p + freq / SR) % 1;
      const y = f(0.5 * (2 * p - 1) + 0.5 * (rand() * 2 - 1), 400 * Math.pow(12, u), 0.9).low;
      put(s0 + k, y * amp * u * u);
    }
  };

  const root = pal.root;
  pal.plucks ? pluck(0.02, root * 8, 0.07) : tick(0.02, root * 16, 0.04, 0.08);
  const peak = scene.beats.find((b) => ['recent', 'distance', 'link', 'roster'].includes(b.kind));
  for (const b of scene.beats) {
    if (b.kind === 'status') { tick(b.at + 0.05, root * 12, 0.03, 0.06); continue; }
    if (b === peak) { riser(b.at, 1.1, strike ? 0.02 : 0.035); chord(b.at, root, strike ? 0.035 : 0.05); }
    else whoosh(b.at - 0.18, 0.55, strike ? 0.06 : 0.08);
    if (b.kind === 'recent') {
      const m = Math.min(24, b.points.length);
      for (let k = 0; k < m; k++) tick(b.at + 0.3 + (1.8 * k) / Math.max(1, b.points.length), 2000 + 600 * rand(), 0.025);
    }
    if (pal.clicks && (b.kind === 'facts' || b.kind === 'quote')) {
      const chars = b.lines.join('').replace(/\*/g, '').replace(/\s/g, '').length;
      for (let k = 0; k < Math.min(160, chars); k++) click(b.at + k / 45 + 0.08 * (rand() - 0.5) / 10);
    }
  }
  // the loop point: the opening pluck again, quieter, so the end runs into the start
  pal.plucks ? pluck(scene.duration - 0.45, root * 8, 0.05, 0.45) : tick(scene.duration - 0.2, root * 16, 0.025, 0.08);

  // ---- peak limit to -1 dBFS; loudness is ffmpeg's job
  let peakV = 1e-9;
  for (let i = 0; i < n; i++) peakV = Math.max(peakV, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.89 / peakV; // peak to -1 dBFS; the loudness target is set when the mix is muxed
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return { L, R };
}

export function wav(L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  return buf;
}

/** The scene file for an id: hand-written in scenes/, generated in scenes/auto/. */
export function sceneFile(root, id) {
  for (const p of [path.join(root, 'scenes', `${id}.yaml`), path.join(root, 'scenes', 'auto', `${id}.yaml`)]) {
    try { return readFileSync(p, 'utf8'); } catch { /* next */ }
  }
  throw new Error(`no scene ${id}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const [id, ...rest] = process.argv.slice(2);
  const arg = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const scene = loadScene(sceneFile(ROOT, id));
  const style = STYLES[arg('style') ?? scene.style];
  const { L, R } = score(scene, style);
  const out = arg('out') ?? path.join(ROOT, 'out', `${id}-${style.id}.wav`);
  writeFileSync(out, wav(L, R));
  console.log(`${out}: ${scene.duration} s`);
}
