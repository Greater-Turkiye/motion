// An Instagram carousel from a scene: one 4:5 slide (1080x1350) per block, drawn by the video's own
// renderer in post mode, so every slide carries exactly the video's facts, status and source.
//
//   node tools/post/carousel.mjs <scene id> <out dir> [--no-build]
//
// Each slide is the frame where its block has settled (the hook 2.2 s in, every other block 2 s after
// it starts, never past the next one), drawn with ?post=1 (no progress bar or voice note, a "2/6"
// counter, a swipe cue on the cover) and cut to the 4:5 window POST_WINDOW in src/templates/video.ts.
// Writes <scene>-01.jpg, <scene>-02.jpg … and prints their paths.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { parse } from 'yaml';
import { sceneFile } from '../../export/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WINDOW = { y: 250, h: 1350 }; // POST_WINDOW in src/templates/video.ts

export function carousel(id, out, { build = true } = {}) {
  const sc = parse(sceneFile(ROOT, id));
  const starts = [0, ...sc.beats.map((b) => b.at)];
  const ends = [...sc.beats.map((b) => b.at), sc.duration];
  const times = starts.map((a, i) => Math.min(a + (i === 0 ? 2.2 : 2.0), ends[i] - 0.25));
  const frames = times.map((t) => Math.round(t * sc.fps));
  const tmp = path.join(ROOT, 'out', 'post-frames', id);
  rmSync(tmp, { recursive: true, force: true });
  execFileSync(process.execPath, ['export/render.mjs', ...(build ? [] : ['--no-build']), '--scene', id, '--frames', frames.join(','), '--format', 'png',
    '--save-frames', '--workers', '1', '--out', tmp], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, MOTION_QUERY: 'post=1' } });
  const dir = path.join(tmp, readdirSync(tmp).find((d) => d.endsWith('-frames')));
  const pngs = readdirSync(dir).filter((f) => f.endsWith('.png') || f.endsWith('.jpg')).sort();
  mkdirSync(out, { recursive: true });
  return pngs.map((f, i) => {
    const dst = path.join(out, `${id}-${String(i + 1).padStart(2, '0')}.jpg`);
    execFileSync(ffmpegPath, ['-loglevel', 'error', '-y', '-i', path.join(dir, f), '-vf', `crop=1080:${WINDOW.h}:0:${WINDOW.y}`, '-q:v', '2', dst]);
    return dst;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id, out] = process.argv.slice(2);
  for (const f of carousel(id, out, { build: !process.argv.includes('--no-build') })) console.log(f);
}
