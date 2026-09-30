// The narration on the video: each clip of tools/audio/tts.py placed on its block, fitted to it, and
// mixed to the loudness short-video platforms play at.
//
//   node tools/audio/voice.mjs <clips dir> <video.mp4> <out.mp4> [--bed file.mp3] [--wav out.wav]
//
// Placement: a clip starts at its block (or just after the previous clip, never over it), its
// trailing silence trimmed, read 1.15 times faster than the model speaks (the sample read slowly
// for a short video). A clip that would still run past its block's end by more than 0.4 s is sped
// up further, to at most 1.3 (faster than that starts to sound mechanical); what then still runs
// past the video's end fades out. With a bed, the music sits at -20 dB and ducks under the voice.
// Prints where each clip went, so a run's log shows every fit.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { duration } from './mix.mjs';

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

export function voice(dir, video, out, { bed, wav } = {}) {
  const clips = JSON.parse(readFileSync(path.join(dir, 'clips.json'), 'utf8'));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  // trailing silence off first (reverse, strip the leading silence, reverse back), then measure
  for (const c of clips) {
    c.trimmed = path.join(tmp, c.file);
    ff(['-i', path.join(dir, c.file), '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.08,areverse,aresample=48000', c.trimmed]);
    c.raw = duration(c.trimmed);
  }
  const D = duration(video);
  const placed = place(clips, D);
  for (const c of placed) console.log(`${c.file}: block ${c.at.toFixed(2)}-${c.until.toFixed(2)}  at ${c.start.toFixed(2)}  x${c.tempo.toFixed(2)}  ${c.length.toFixed(2)} s${c.cut ? '  (cut at the end)' : ''}  ${c.text}`);

  const inputs = placed.flatMap((c) => ['-i', c.trimmed]);
  const chains = placed.map((c, i) => {
    const ms = Math.round(c.start * 1000);
    return `[${i}:a]atempo=${c.tempo},atrim=0:${c.length.toFixed(3)},afade=t=out:st=${Math.max(0, c.length - 0.06).toFixed(3)}:d=0.06,adelay=${ms}|${ms},apad[v${i}]`;
  });
  const n = placed.length;
  let graph = `${chains.join(';')};${placed.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0,atrim=0:${D.toFixed(3)}`;
  if (bed) {
    inputs.push('-stream_loop', '-1', '-i', bed);
    graph += `,asplit[voice][key];[${n}:a]aresample=48000,atrim=0:${D.toFixed(3)},volume=-20dB,afade=t=in:d=0.6,afade=t=out:st=${(D - 1.5).toFixed(3)}:d=1.5[b];` +
      `[b][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[duck];[voice][duck]amix=inputs=2:normalize=0`;
  }
  graph += ',loudnorm=I=-16:TP=-1.5:LRA=9[out]';
  const mixWav = wav ?? path.join(tmp, 'voice.wav');
  ff([...inputs, '-filter_complex', graph, '-map', '[out]', '-ac', '2', '-ar', '48000', mixWav]);
  // the picture is copied untouched: only the sound is added
  ff(['-i', video, '-i', mixWav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  return placed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, video, out] = process.argv.slice(2);
  const opt = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  voice(dir, video, out, { bed: opt('bed'), wav: opt('wav') });
}
