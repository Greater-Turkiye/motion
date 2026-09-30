// A video's sound from recorded samples: a kit (which file plays which role) placed on the scene's
// beats and mixed by ffmpeg. Deterministic: the same scene and kit give the same mix.
//
//   node tools/audio/mix.mjs <scene id> <kit.json> <out.wav>
//
// A kit names files for these roles, all optional: bed (music or drone, trimmed to the video with
// fades), whoosh (into each block), riser (ending on the peak beat), hit (on the peak beat), tick
// (each of our records lighting on the map), pop (a number landing), open (the first frame), type
// (typewriter keys under typed text). Gains are in dB; the mix is brought to -16 LUFS / -1.5 dBTP.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { loadScene } from '../../src/engine/scene.ts';
import { sceneFile } from '../../export/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A file's length in seconds, read from ffmpeg's own report (ffmpeg-static ships no ffprobe). */
export function duration(file) {
  let err = '';
  try { execFileSync(ffmpegPath, ['-hide_banner', '-i', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { err = String(e.stderr ?? ''); }
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 2;
}

/** When a file is loudest (its hit, in a riser-hit), from ffmpeg's momentary loudness every 0.1 s. */
export function loudestAt(file) {
  // ffmpeg reports on stderr and exits 0 here, so read stderr whatever the exit
  const err = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }).stderr ?? '';
  let best = 0, bestM = -1e9;
  for (const line of err.split('\n')) {
    const m = line.match(/t:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+)/);
    if (m && Number(m[2]) > bestM) { bestM = Number(m[2]); best = Number(m[1]); }
  }
  return Math.max(0, best - 0.2); // the momentary window is 400 ms; its centre is the hit
}

/** Where each role plays: seconds on the video's clock, with a gain. */
export function cues(scene, kit) {
  const out = [];
  const g = (role, dflt) => kit.gain?.[role] ?? dflt;
  const peak = scene.beats.find((b) => ['recent', 'distance', 'link', 'roster'].includes(b.kind));
  if (kit.open) out.push({ file: kit.open, at: 0, db: g('open', -8) });
  for (const b of scene.beats) {
    if (b.kind === 'status') continue; // the status arrives in a short silence: no cue
    if (b === peak) {
      if (kit.riser) out.push({ file: kit.riser, end: b.at + (kit.riserOffset ?? 0), db: g('riser', -10), max: kit.riserMax });
      // a hit lands on the beat by its loudest moment, not by the start of its file
      if (kit.hit) out.push({ file: kit.hit, peakAt: b.at, pre: kit.hitPre ?? 1.5, db: g('hit', -8), max: kit.hitMax ?? 4 });
    } else if (kit.whoosh) out.push({ file: kit.whoosh, peakAt: b.at, pre: kit.whooshPre ?? 1.0, db: g('whoosh', -10), max: kit.whooshMax ?? 2.5 });
    if (b.kind === 'recent' && kit.tick) {
      const n = Math.min(12, b.points.length);
      for (let k = 0; k < n; k++) out.push({ file: kit.tick, at: b.at + 0.3 + (1.8 * k) / Math.max(1, b.points.length), db: g('tick', -18) });
    }
    if (b.kind === 'distance' && kit.pop) out.push({ file: kit.pop, at: b.at + 1.6, db: g('pop', -12) });
    if (kit.type && (b.kind === 'facts' || b.kind === 'quote')) out.push({ file: kit.type, at: b.at, db: g('type', -14), max: 2.2 });
  }
  return out;
}

export function mix(sceneId, kit, outWav) {
  const scene = loadScene(sceneFile(ROOT, sceneId));
  const D = scene.duration;
  const list = cues(scene, kit);
  const inputs = [], filters = [], labels = [];
  let n = 0;
  if (kit.bed) {
    inputs.push('-stream_loop', '-1', '-i', kit.bed);
    const fade = Math.min(1.2, D / 6);
    // the bed ducks for the silence before the status, then comes back
    const st = scene.beats.find((b) => b.kind === 'status');
    const duck = st ? `,volume='if(between(t,${(st.at - 0.4).toFixed(2)},${(st.at + 0.25).toFixed(2)}),0.3,1)':eval=frame` : '';
    filters.push(`[${n}:a]atrim=0:${D},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=${fade},afade=t=out:st=${(D - fade).toFixed(2)}:d=${fade},volume=${kit.gain?.bed ?? -14}dB${duck}[b]`);
    labels.push('[b]'); n++;
  }
  for (const c of list) {
    inputs.push('-i', c.file);
    // a cue that must end at a moment (the riser) is placed by its own length
    let at = c.at, start = 0;
    if (c.end != null) at = Math.max(0, c.end - Math.min(duration(c.file), c.max ?? 1e9));
    if (c.peakAt != null) {
      // keep `pre` seconds before the file's loudest moment (the whole rise of a riser-hit), so the peak lands on the beat
      const p = loudestAt(c.file);
      start = Math.max(0, p - (c.pre ?? 1.5));
      at = Math.max(0, c.peakAt - (p - start));
    }
    if (c.end != null && c.max) start = Math.max(0, duration(c.file) - c.max);
    const ms = Math.round(at * 1000);
    const len = c.max ?? 1e9;
    const trim = `atrim=${start.toFixed(3)}:${(start + len).toFixed(3)},asetpts=PTS-STARTPTS,` + (c.max ? `afade=t=out:st=${Math.max(0, len - 0.35).toFixed(3)}:d=0.35,` : '');
    filters.push(`[${n}:a]${trim}aformat=sample_rates=48000:channel_layouts=stereo,volume=${c.db}dB,adelay=${ms}|${ms}[c${n}]`);
    labels.push(`[c${n}]`); n++;
  }
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=0:${D},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`);
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ac', '2', '-ar', '48000', outWav]);
  return list.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id, kitFile, out] = process.argv.slice(2);
  const n = mix(id, JSON.parse(readFileSync(kitFile, 'utf8')), out);
  console.log(`${out}: ${n} cues`);
}
