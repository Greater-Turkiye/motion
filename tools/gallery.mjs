// Render the same stories several ways, so the owner can compare looks and motion side by side.
//
//   node tools/gallery.mjs [outdir]        # default: out/gallery; previews go to <outdir>/preview
//
// Each variant is a style plus page parameters (text entrance, camera path, progress bar, blur).
// The masters are full size; the previews are 720x1280 H.264 small enough to send to a phone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'out/gallery');
const SHIP = 'karadeniz-gemi';

// one entry per style: the style carries its own motion language, so a variant is just a style
export const VARIANTS = [
  ['A', SHIP, 'A', '', 'A gece kırmızısı · kelime kelime · sert kamera · çubuk'],
  ['B', SHIP, 'B', '', 'B harekât lacivert · daktilo · süzülme · çubuk'],
  ['C', SHIP, 'C', '', 'C editoryal · silerek · süzülme'],
  ['D', SHIP, 'D', '', 'D uydu gecesi · yükselen · uçuş'],
  ['E', SHIP, 'E', '', 'E ateşböceği · yükselen · uçuş · çubuk'],
  ['G', SHIP, 'G', '', 'G İsviçre rölyefi · silerek · süzülme'],
  ['H', SHIP, 'H', '', 'H gizliliği kaldırılmış · daktilo · 12 fps'],
  ['I', SHIP, 'I', '', 'I harekât paftası · silerek · sert · çubuk'],
  ['K', SHIP, 'K', '', 'K çini atlas · yükselen · ağır süzülme'],
];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(path.join(OUT, 'preview'), { recursive: true });
  let built = false;
  for (const [n, scene, style, query, label] of VARIANTS) {
    const dir = path.join(OUT, n);
    rmSync(dir, { recursive: true, force: true });
    const t0 = Date.now();
    execFileSync(process.execPath, ['export/render.mjs', '--scene', scene, '--style', style, '--out', dir, ...(built ? ['--no-build'] : [])],
      { cwd: ROOT, env: { ...process.env, MOTION_QUERY: query }, stdio: ['ignore', 'ignore', 'inherit'] });
    built = true;
    const master = path.join(dir, readdirSync(dir).find((f) => f.endsWith('.mp4')));
    const preview = path.join(OUT, 'preview', `${n}-${style}${query ? '-' + query.replace(/[=&]/g, '-') : ''}.mp4`);
    execFileSync(ffmpegPath, ['-loglevel', 'error', '-y', '-i', master, '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264',
      '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', preview]);
    console.log(`${n} ${((Date.now() - t0) / 1000).toFixed(0)} s  ${label}`);
  }
}
