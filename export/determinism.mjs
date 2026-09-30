// Render the same scene twice, in two separate browser processes, and compare the frames.
//
// Within one browser process every frame is bit-identical however often and in whatever order it
// is drawn (the engine keeps no state between frames). Between processes, the rasteriser anti-
// aliases large text differently by one or two levels on a few dozen pixels. That is invisible and
// gone after H.264, but it is real, so the test measures it instead of pretending it away: a render
// passes when no channel differs by more than MAX_DELTA and fewer than MAX_SHARE of the bytes differ.
// Anything bigger means a frame reads the clock, an unseeded random source, or state left over.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const style = process.argv[2] || 'A';
const MAX_DELTA = 2;
const MAX_SHARE = 1e-4;

const run = (out, build) => execFileSync(process.execPath, ['export/render.mjs', '--frames-only', '--every', '30', '--style', style,
  '--workers', '1', '--format', 'png', '--save-frames', '--out', out, ...(build ? [] : ['--no-build'])], { cwd: ROOT, stdio: 'ignore' });
const raw = (file) => execFileSync(ffmpegPath, ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });

run('out/det-a', true);
run('out/det-b', false);
const dir = (d) => path.join(ROOT, d, `hook-karadeniz-${style}-frames`);
let worst = 0, worstShare = 0, failed = [];
for (const f of readdirSync(dir('out/det-a')).sort()) {
  const a = raw(path.join(dir('out/det-a'), f)), b = raw(path.join(dir('out/det-b'), f));
  if (a.length !== b.length) { failed.push(f); continue; }
  let n = 0, mx = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) { n++; if (d > mx) mx = d; } }
  const share = n / a.length;
  worst = Math.max(worst, mx); worstShare = Math.max(worstShare, share);
  if (mx > MAX_DELTA || share > MAX_SHARE) failed.push(`${f} (max ${mx}, ${(share * 100).toFixed(4)}%)`);
}
const summary = `worst channel delta ${worst}/255, worst share ${(worstShare * 100).toFixed(4)}% of bytes`;
if (failed.length) { console.error(`not deterministic: ${failed.join(', ')}; ${summary}`); process.exit(1); }
console.log(`deterministic within tolerance: ${summary}`);
