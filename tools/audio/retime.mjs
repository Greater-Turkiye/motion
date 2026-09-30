// The picture waits for the voice: after tools/audio/tts.py has read every block, each block of the
// scene is lengthened, where needed, until its clip fits in it, and the camera's keys are stretched
// with it. Then the video is rendered to the new clock and tools/audio/voice.mjs places the clips.
//
//   node tools/audio/retime.mjs <scene id or path> <clips dir>
//
// Rewrites the scene file (duration, beat starts, camera keys) and the clips' windows in clips.json.
// Blocks only ever get longer, so every reading-time rule of the scene check still holds. The model
// reads short lines slowly (4 s for "Karadeniz. Kesin konum yok." on the first run), and a voice that
// drifts behind its picture reads as a mistake; a video two or three seconds longer does not.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { TEMPO, GAP, trimmed } from './voice.mjs';
import { duration } from './mix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Where a clip starts inside its block (narration.mjs uses the same) and the air left after it. */
const LEAD_HOOK = 0.25, LEAD = 0.15, TAIL = 0.35;
const r2 = (x) => Math.round(x * 100) / 100;

/** Old block edges → new block edges, given how long each block's clip needs. */
export function stretch(edges, needs) {
  const out = [0];
  for (let i = 0; i + 1 < edges.length; i++) out.push(r2(out[i] + Math.max(edges[i + 1] - edges[i], needs[i] ?? 0)));
  return out;
}

/** A time on the old clock on the new one: linear inside each block. */
export function mapTime(t, from, to) {
  for (let i = 0; i + 1 < from.length; i++) {
    if (t <= from[i + 1] || i + 2 === from.length) return r2(to[i] + ((t - from[i]) * (to[i + 1] - to[i])) / (from[i + 1] - from[i]));
  }
  return t;
}

export function retime(sceneFile, dir) {
  const sc = parse(readFileSync(sceneFile, 'utf8'));
  const clips = JSON.parse(readFileSync(path.join(dir, 'clips.json'), 'utf8'));
  const edges = [0, ...sc.beats.map((b) => b.at), sc.duration];
  // which block each clip belongs to: the last block starting at or before it
  const blockOf = (at) => edges.slice(0, -1).reduce((k, e, i) => (at + 1e-6 >= e ? i : k), 0);
  const needs = [];
  for (const c of clips) {
    const k = blockOf(c.at);
    const len = duration(trimmed(path.join(dir, c.file))) / TEMPO;
    // the last block also holds the loop's fade (0.9 s) after the voice
    needs[k] = (k === 0 ? LEAD_HOOK : LEAD) + len + TAIL + GAP + (k === edges.length - 2 ? 0.9 : 0);
  }
  const next = stretch(edges, needs);
  const map = (t) => mapTime(t, edges, next);
  sc.beats.forEach((b, i) => { b.at = next[i + 1]; });
  sc.duration = next.at(-1);
  if (sc.camera?.keys) for (const key of sc.camera.keys) key.t = map(key.t);
  if (sc.camera?.seconds) sc.camera.seconds = map(sc.camera.seconds);
  for (const c of clips) {
    const k = blockOf(c.at);
    c.at = r2(next[k] + (k === 0 ? LEAD_HOOK : LEAD));
    c.until = r2(k + 1 === next.length - 1 ? next[k + 1] - 0.3 : next[k + 1]);
  }
  writeFileSync(sceneFile, stringify(sc, { lineWidth: 0 }));
  writeFileSync(path.join(dir, 'clips.json'), JSON.stringify(clips, null, 1));
  console.log(`retimed ${path.basename(sceneFile)}: ${edges.at(-1)} s → ${sc.duration} s; blocks ${edges.map(r2).join(' ')} → ${next.join(' ')}`);
  return sc;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ref = process.argv[2];
  const file = ref.endsWith('.yaml') ? ref : [path.join(ROOT, 'scenes', `${ref}.yaml`), path.join(ROOT, 'scenes', 'auto', `${ref}.yaml`)].find(existsSync);
  if (!file) { console.error(`no scene ${ref}`); process.exit(1); }
  retime(file, process.argv[3]);
}
