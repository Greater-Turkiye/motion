// The narration on the video: each clip of tools/audio/tts.py placed on its block, fitted to it, and
// mixed to the loudness short-video platforms play at.
//
//   node tools/audio/voice.mjs <clips dir | -> <video.mp4> <out.mp4> [--kit assets/sound/kit.json --scene <id>] [--wav out.wav]
//
// Placement: a clip starts at its block (or just after the previous clip, never over it), its
// trailing silence trimmed, read 1.15 times faster than the model speaks (the sample read slowly
// for a short video). A clip that would still run past its block's end by more than 0.4 s is sped
// up further, to at most 1.3 (faster than that starts to sound mechanical); what then still runs
// past the video's end fades out. With a kit, its bed and effects go under the voice (see voice()).
// Prints where each clip went, so a run's log shows every fit.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { duration, mix } from './mix.mjs';

export const TEMPO = 1.15, TEMPO_MAX = 1.3, GAP = 0.12, OVERRUN = 0.4;

const ff = (args) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

/** Where each clip goes and how fast it is read: [{ file, start, tempo, length }] on the video's clock. */
export function place(clips, videoLength) {
  let end = 0;
  return clips.map((c) => {
    const start = Math.max(c.at, end + GAP);
    const room = Math.max(0.5, c.until + OVERRUN - start);
    const tempo = Math.min(TEMPO_MAX, Math.max(TEMPO, c.raw / room));
    let length = c.raw / tempo;
    const cut = start + length > videoLength - 0.1;
    if (cut) length = Math.max(0.3, videoLength - 0.1 - start);
    end = start + length;
    return { ...c, start: Math.round(start * 1000) / 1000, tempo: Math.round(tempo * 1000) / 1000, length, cut };
  });
}

/** A clip without its trailing silence (reversed, leading silence stripped, reversed back), at 48 kHz,
 *  made once next to the clip: tools/audio/retime.mjs measures the same file this mixer places. */
export function trimmed(src) {
  const dst = src.replace(/\.wav$/, '.trim.wav');
  if (!existsSync(dst)) ff(['-i', src, '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.08,areverse,aresample=48000', dst]);
  return dst;
}

/** The bed long enough for the video: a short loop is laid twice with a 1.5 s crossfade, so the join
 *  is not heard (the kit's drone is 20.7 s; videos run to about 32 s). */
function bedChain(n, file, D, db) {
  const len = duration(file);
  const twice = len < D + 0.5;
  const src = twice ? `[${n}:a][${n + 1}:a]acrossfade=d=1.5,` : `[${n}:a]`;
  return { inputs: twice ? ['-i', file, '-i', file] : ['-i', file], used: twice ? 2 : 1,
    chain: `${src}aresample=48000,aformat=channel_layouts=stereo,atrim=0:${D.toFixed(3)},volume=${db}dB,afade=t=in:d=0.6,afade=t=out:st=${(D - 1.5).toFixed(3)}:d=1.5` };
}

/**
 * The video's sound: the narration (a clips dir, or '-' for none), and with a kit its bed and its
 * effects. The bed ducks under the voice; the effects (a whoosh into each block, a tick for each of
 * our records lighting, a pop as a distance lands) duck a little; everything ends at -16 LUFS.
 */
export function voice(dir, video, out, { kit, scene, wav } = {}) {
  const D = duration(video);
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  const inputs = [], parts = [];
  let n = 0, voiced = false;
  if (dir && dir !== '-') {
    const clips = JSON.parse(readFileSync(path.join(dir, 'clips.json'), 'utf8'));
    for (const c of clips) {
      c.trimmed = trimmed(path.join(dir, c.file));
      c.raw = duration(c.trimmed);
    }
    const placed = place(clips, D);
    for (const c of placed) console.log(`${c.file}: block ${c.at.toFixed(2)}-${c.until.toFixed(2)}  at ${c.start.toFixed(2)}  x${c.tempo.toFixed(2)}  ${c.length.toFixed(2)} s${c.cut ? '  (cut at the end)' : ''}  ${c.text}`);
    for (const c of placed) {
      const ms = Math.round(c.start * 1000);
      inputs.push('-i', c.trimmed);
      parts.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atempo=${c.tempo},atrim=0:${c.length.toFixed(3)},afade=t=out:st=${Math.max(0, c.length - 0.06).toFixed(3)}:d=0.06,adelay=${ms}|${ms},apad[v${n}]`);
      n++;
    }
    parts.push(`${placed.map((_, i) => `[v${i}]`).join('')}amix=inputs=${placed.length}:normalize=0,atrim=0:${D.toFixed(3)},asplit=3[voice][key1][key2]`);
    voiced = true;
  }
  const layers = voiced ? ['[voice]'] : [];
  if (kit?.bed) {
    const b = bedChain(n, kit.bed, D, kit.gain?.bed ?? -20);
    inputs.push(...b.inputs); n += b.used;
    parts.push(voiced ? `${b.chain}[bed];[bed][key1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[bd]` : `${b.chain}[bd]`);
    layers.push('[bd]');
  }
  if (kit && scene) {
    const fx = path.join(tmp, 'fx.wav');
    if (mix(scene, { ...kit, bed: undefined }, fx, { normalize: false })) {
      inputs.push('-i', fx);
      parts.push(voiced ? `[${n}:a]aformat=channel_layouts=stereo[fx0];[fx0][key2]sidechaincompress=threshold=0.05:ratio=3:attack=10:release=250[fx]` : `[${n}:a]aformat=channel_layouts=stereo[fx]`);
      layers.push('[fx]'); n++;
    }
  }
  if (!layers.length) throw new Error('nothing to mix: no voice and no kit');
  // a voice split it does not need (no bed, or no effects) goes to a null sink
  if (voiced && !layers.includes('[bd]')) parts.push('[key1]anullsink');
  if (voiced && !layers.includes('[fx]')) parts.push('[key2]anullsink');
  parts.push(`${layers.join('')}amix=inputs=${layers.length}:normalize=0,atrim=0:${D.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=9[out]`);
  const mixWav = wav ?? path.join(tmp, 'mix.wav');
  ff([...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-ac', '2', '-ar', '48000', mixWav]);
  // the picture is copied untouched: only the sound is added
  ff(['-i', video, '-i', mixWav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, video, out] = process.argv.slice(2);
  const opt = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const kitFile = opt('kit');
  voice(dir, video, out, { kit: kitFile ? JSON.parse(readFileSync(kitFile, 'utf8')) : undefined, scene: opt('scene'), wav: opt('wav') });
}
