// A story's own photograph, when its source publishes one under terms that allow it and it shows no
// recognisable face (PLAN.md section 29).
//
//   node tools/scene/photo.mjs <datasets> <record id> <out dir>   # prints {"file","credit"} or nothing
//
// Only a photograph the source attached to the same story is used, never one of another event shown as
// this one. Sources so far: the US Sixth Fleet's and AFRICOM's stories, mirrored on DVIDS with their
// lead photograph, a US federal work in the public domain (dvidshub.net/about/copyright). The story is
// matched by its exact title (the Sixth Fleet's own site) or its link (a DVIDS story); media.defense.gov
// answers 403 to every client, DVIDS's image host serves 1000 px wide copies. DVIDS asks that its
// pictures are not shown as an endorsement: the credit says whose photograph it is and nothing more.
// A photograph with a face large enough to recognise is not used (tools/scene/faces.py; CLAUDE.md
// section 2: no personal data). Ukrinform, Shafaq, Reuters and AP photographs are never used.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { findRecord } from './generate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UA = 'GreaterTurkiyeMotion (+https://github.com/Greater-Turkiye/motion)';
const DVIDS = {
  'c6f.navy.mil': { units: [374], credit: 'Fotoğraf: ABD Donanması (DVIDS), kamu malı' },
  'dvidshub.net': { units: [374, 1015], credit: 'Fotoğraf: ABD Silahlı Kuvvetleri (DVIDS), kamu malı' },
};
const tag = (item, name) => item.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))?.[1]?.trim();
const plain = (s) => (s ?? '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase();

/** The photograph attached to this story by its own source: { url, credit } or null. */
export async function findPhoto(source) {
  const host = new URL(source.url).hostname.replace(/^www\./, '');
  const d = DVIDS[host];
  if (!d) return null;
  for (const unit of d.units) {
    const r = await fetch(`https://www.dvidshub.net/rss/unit/${unit}?type=news`, { headers: { 'User-Agent': UA } });
    if (!r.ok) continue;
    for (const item of (await r.text()).split('<item>').slice(1)) {
      const same = host === 'dvidshub.net' ? tag(item, 'link') === source.url : plain(tag(item, 'title')) === plain(source.title);
      if (!same) continue;
      const thumb = item.match(/https:\/\/[a-z0-9]+\.cloudfront\.net\/thumbs\/photos\/[^"' <]+?\/250w_q95\.jpg/)?.[0];
      return thumb ? { url: thumb.replace('/250w_q95.jpg', '/1000w_q95.jpg'), credit: d.credit } : null;
    }
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [datasets, id, out] = process.argv.slice(2);
  try {
    const record = parse(readFileSync(findRecord(datasets, id), 'utf8'));
    const source = record.sources?.[0];
    const found = source ? await findPhoto(source) : null;
    if (found) {
      const r = await fetch(found.url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`photo ${r.status}`);
      mkdirSync(out, { recursive: true });
      const file = path.join(out, `${id}.jpg`);
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      try {
        execFileSync('python3', [path.join(ROOT, 'tools/scene/faces.py'), file], { stdio: ['ignore', 2, 'inherit'] }); // its verdict goes to the log
        console.log(JSON.stringify({ file: path.relative(path.join(ROOT, 'assets'), file).split(path.sep).join('/'), credit: found.credit }));
      } catch {
        console.error('photo not used: a recognisable face');
      }
    }
  } catch (e) {
    console.error(`no photo: ${e.message}`);
  }
}
