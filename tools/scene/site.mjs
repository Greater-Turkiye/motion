// The video list the site's videos page reads (platform apps/web/videolar.html).
//
//   node tools/scene/site.mjs site/        # reads site/v/*.json, writes site/videos.json
//
// Each published video has three files in site/v/ (and, since the carousel, its slides -01.jpg …): auto-<record>.mp4, .jpg (its first frame) and
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
  // the Instagram carousel's slides (tools/post/carousel.mjs), when the release has them
  const post = readdirSync(dir).filter((x) => x.startsWith(`${base}-`) && /-\d{2}\.jpg$/.test(x)).sort().map((x) => `v/${x}`);
  videos.push({ ...m, video: `v/${base}.mp4`, poster: `v/${base}.jpg`, ...(post.length ? { post } : {}) });
}
videos.sort((a, b) => String(b.published ?? b.date).localeCompare(String(a.published ?? a.date)));
writeFileSync(path.join(root, 'videos.json'), JSON.stringify({ generated: new Date().toISOString(), videos }, null, 1) + '\n');
writeFileSync(path.join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Greater Türkiye · motion</title>'
  + '<p>Otomatik videolar / automatic videos: <a href="https://greater-turkiye.github.io/platform/videolar.html">videolar</a> · '
  + '<a href="videos.json">videos.json</a> · <a href="studio/">stüdyo</a></p>\n');
console.log(`${videos.length} videos in ${path.join(root, 'videos.json')}`);

// the studio (tools/scene/studio.mjs): every style on a recent story of each family, the default marked
const studioJson = path.join(root, 'studio', 'studio.json');
if (existsSync(studioJson)) {
  const st = JSON.parse(readFileSync(studioJson, 'utf8'));
  const NAMES = { A: 'Gece kırmızısı', B: 'Harekât lacivert', C: 'Editoryal', D: 'Uydu gecesi', E: 'Ateşböceği', G: 'İsviçre rölyefi', H: 'Gizliliği kaldırılmış', I: 'Harekât paftası', K: 'Çini atlas' };
  const FAM = { strike: 'Saldırı', deal: 'Anlaşma ve temas', exercise: 'Tatbikat', statement: 'Açıklama', count: 'Sayı iddiası' };
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const edit = 'https://github.com/Greater-Turkiye/motion/edit/main/config/styles.yaml';
  const sections = st.families.map((f) => `
<section>
  <h2>${esc(FAM[f.family] ?? f.family)} <small>${esc(f.type)} · ${esc(f.date)}</small></h2>
  <p class="t">${esc(f.title)}</p>
  <div class="row">${Object.entries(f.stills).map(([id, imgs]) => `
    <figure class="${id === f.default ? 'on' : ''}">
      <figcaption><b>${id}</b> ${esc(NAMES[id] ?? '')}${id === f.default ? ' <span>varsayılan</span>' : ''}</figcaption>
      ${imgs.map((src) => `<img src="${esc(src)}" alt="" loading="lazy" width="180" height="320">`).join('')}
    </figure>`).join('')}
  </div>
</section>`).join('\n');
  writeFileSync(path.join(root, 'studio', 'index.html'), `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Stüdyo · Greater Türkiye motion</title>
<style>
:root{--bg:#0b0b0c;--fg:#ece8e1;--mut:#9a958e;--acc:#e0b04a;--line:rgba(255,255,255,.1)}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif}
header,section{max-width:1400px;margin:0 auto;padding:24px 18px}
h1{font-size:28px;margin:0 0 6px}header p{color:var(--mut);margin:4px 0}
a{color:var(--acc)}
h2{font-size:20px;margin:0}h2 small{color:var(--mut);font-weight:400;font-size:13px;margin-left:8px}
.t{color:var(--mut);margin:4px 0 14px}
.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
figure{margin:0;flex:0 0 auto;display:grid;grid-template-columns:repeat(3,120px);gap:4px;padding:8px;border:1px solid var(--line);border-radius:10px}
figure.on{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
figcaption{grid-column:1/-1;font-size:13px}figcaption span{color:var(--bg);background:var(--acc);border-radius:4px;padding:1px 6px;margin-left:6px;font-size:11px}
img{width:120px;height:213px;object-fit:cover;border-radius:4px;background:#222}
section+section{border-top:1px solid var(--line)}
</style></head><body>
<header><h1>Stüdyo</h1>
<p>Her olay ailesinden güncel bir haber, dokuz stilin hepsinde: kanca, ailenin kendi bölümü, durum. Çerçeveli olan, o türün şu anki varsayılanı.</p>
<p>Varsayılanı değiştirmek için <a href="${edit}">config/styles.yaml</a> dosyasında harfi değiştirin; sonraki otomatik videolar onu kullanır. Üretim: ${esc(st.generated.slice(0, 16).replace('T', ' '))} UTC · <a href="../">videolar</a></p>
</header>
${sections}
</body></html>
`);
  console.log(`studio: ${st.families.length} families`);
}
