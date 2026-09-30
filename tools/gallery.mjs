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

export const VARIANTS = [
  ['01', SHIP, 'A', 'text=rise&camera=glide', 'A gece kırmızısı · yükselen yazı · süzülen kamera (bugünkü)'],
  ['02', SHIP, 'A', 'text=rise&camera=glide&blur=0', 'Aynısı, hareket bulanıklığı KAPALI (01 ile karşılaştır)'],
  ['03', SHIP, 'A', 'text=pop&camera=snap&progress=1', 'A · kelime kelime patlama · sert kamera · ilerleme çubuğu'],
  ['04', SHIP, 'E', 'text=type&camera=fly&progress=1', 'E ateşböceği · daktilo · uçan kamera · ilerleme çubuğu'],
  ['05', SHIP, 'G', 'text=wipe&camera=glide', 'G İsviçre rölyefi · silerek açılan yazı · süzülen kamera'],
  ['06', SHIP, 'K', 'text=pop&camera=fly', 'K çini atlas · kelime kelime · uçan kamera'],
  ['07', SHIP, 'H', 'text=type&camera=snap', 'H gizliliği kaldırılmış · daktilo · 12 fps stop-motion kamera'],
  ['08', SHIP, 'I', 'text=wipe&camera=snap&progress=1', 'I harekât paftası · silerek · sert kamera · ilerleme çubuğu'],
  ['09', SHIP, 'D', 'text=rise&camera=fly', 'D uydu gecesi · yükselen yazı · uçan kamera'],
  ['10', SHIP, 'B', 'text=type&camera=glide&progress=1', 'B harekât lacivert · daktilo · süzülen kamera · ilerleme çubuğu'],
  ['11', SHIP, 'C', 'text=wipe&camera=fly', 'C editoryal · silerek · uçan kamera'],
  ['12', 'auto-evt_01m3qjcv37eg3rf9w2kaep61qm', 'E', 'text=pop&camera=snap&progress=1', 'Otomatik üretilmiş başka bir haber (Sumy) · E · patlama · sert kamera'],
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
    const preview = path.join(OUT, 'preview', `${n}-${style}-${query.replace(/[=&]/g, '-')}.mp4`);
    execFileSync(ffmpegPath, ['-loglevel', 'error', '-y', '-i', master, '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264',
      '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', preview]);
    console.log(`${n} ${((Date.now() - t0) / 1000).toFixed(0)} s  ${label}`);
  }
}
