// The video list the site's videos page reads (platform apps/web/videolar.html).
//
//   node tools/scene/site.mjs site/        # reads site/v/*.json, writes site/videos.json
//
// Each published video has three files in site/v/: auto-<record>.mp4, .jpg (its first frame) and
// .json (what generate.mjs --meta wrote). The list is newest first and names files relative to the
// site root, so the page can load them from the same origin.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'site';
const dir = path.join(root, 'v');
const videos = [];
for (const f of existsSync(dir) ? readdirSync(dir) : []) {
  if (!f.endsWith('.json')) continue;
  const base = f.slice(0, -5);
  if (!existsSync(path.join(dir, base + '.mp4')) || !existsSync(path.join(dir, base + '.jpg'))) continue;
  const m = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  videos.push({ ...m, video: `v/${base}.mp4`, poster: `v/${base}.jpg` });
}
videos.sort((a, b) => String(b.published ?? b.date).localeCompare(String(a.published ?? a.date)));
writeFileSync(path.join(root, 'videos.json'), JSON.stringify({ generated: new Date().toISOString(), videos }, null, 1) + '\n');
writeFileSync(path.join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Greater Türkiye · motion</title>'
  + '<p>Otomatik videolar / automatic videos: <a href="https://greater-turkiye.github.io/platform/videolar.html">videolar</a> · '
  + '<a href="videos.json">videos.json</a></p>\n');
console.log(`${videos.length} videos in ${path.join(root, 'videos.json')}`);
