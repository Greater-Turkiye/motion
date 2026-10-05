// Which record becomes the next video (PLAN.md section 14; docs/research/04, section 1).
//
//   node tools/scene/select.mjs --datasets ../datasets --published published.txt [--max 1] [--hours 48]
//
// Prints the chosen record ids, best first, one per line; prints nothing when no record is worth a
// video, which is a normal outcome. A record is a candidate when it is recent, not yet published,
// and the generator accepts it (red lines, a place on the map, a scene that passes its checks).
// Candidates are ranked by the research's newsworthiness score, adapted to what our records carry:
//
//   S = 100 · D · (0.30 M + 0.20 P + 0.20 C + 0.15 R + 0.15 N) · (0.8 + 0.2 G) · V
//
//   D recency, halving every 24 h        M magnitude, from the event type and reported casualties
//   P proximity to Türkiye: from the point's distance when there is one, else from the region
//                                        C corroboration, distinct publishers, saturating at 5
//   R reliability, from the status      N novelty: 1 minus the overlap with the last published videos
//   G whether the record has a point on the map
//   V variety: 10 % less for each of the last three videos from the same watch region (PLAN.md 22)
//
// The owner decided that unverified records are published (datasets ADR 0023), so reliability
// lowers a record's rank instead of excluding it; the status is on screen in every frame.
//
// Then the opening: the twelve best are drawn as scenes and each score is weighed by its hook (H).
// A viewer decides in the first two seconds, and a count or a casualty ("İKİ / KİŞİ ÖLDÜ", "221 /
// ÇATIŞMA") holds better than a place and a type label; a label with no sentence under it least.
//   H = 1.0 a number or a casualty · 0.92 any other hook with its sentence · 0.85 a bare label
import { readFileSync, existsSync } from 'node:fs';
import { geoDistance } from 'd3-geo';
import { generate, records } from './generate.mjs';

const MAGNITUDE = [
  [/^kinetic\.(missile-strike|airstrike|drone-strike)/, 1.0], [/^kinetic\./, 0.95], [/^maritime\./, 0.9],
  [/^(deployment|exercise)\./, 0.75], [/^(procurement|policy)\./, 0.55], [/^diplomatic\.(agreement|treaty)/, 0.55], [/^diplomatic\./, 0.4], [/./, 0.3],
];
const PROXIMITY = { aegean: 1.0, cyprus: 1.0, 'east-med': 0.95, 'black-sea': 0.95, syria: 0.95, iraq: 0.9, caucasus: 0.9,
  iran: 0.85, levant: 0.8, balkans: 0.8, 'libya-north-africa': 0.7, 'gulf-red-sea': 0.6, 'central-asia': 0.7, global: 0.4 };
// the headline reports people killed or wounded: that outranks the event type alone
const HARM = /\b(killed|dead|died|deaths?|wounded|injured|casualties)\b/i;
// police and riot drills, food and aid: filed under exercise or clash by the feeds' type rules, but not
// defence news ("Police from three continents test anti-riot tactics in Romania", "fighting in Yemen
// deepens food security crisis" outranked seven wounded in Kherson once variety was weighed)
const SOFT = /\b(police|riot|gendarmes?|food security|famine|humanitarian|aid (convoy|deliver\w*)|refugees?)\b/i;
// Türkiye as a disc for distances: its middle and roughly its half-width, so a point at the border is ~0 km
const TR_CENTRE = [35, 39], TR_RADIUS = 450;
const RELIABILITY = { verified: 1.0, 'partially-verified': 0.8, disputed: 0.4, unverified: 0.5 };

const hours = (r, now) => (now - Date.parse(r.reported_at ?? r.time.start)) / 3.6e6;
const publishers = (r) => new Set((r.sources ?? []).map((s) => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return s.url; } })).size;

/** How strongly a scene opens (see the header): the generator's hook, weighed. */
export function hookWeight(scene) {
  const first = scene.hook.lines[0] ?? '';
  // a count leads its line since the casualty hook says who ("YEDİ KİŞİ", "İKİ ASKER", "BİRİ"): the
  // number word starts the line, it no longer stands alone on it
  if (/^\d|^(BİRİ|BİR|İKİ|ÜÇ|DÖRT|BEŞ|ALTI|YEDİ|SEKİZ|DOKUZ|ON)(\s|$)/u.test(first)) return 1.0;
  // "KARADENİZ / GELİŞME" names no event in the biggest type: the video leans on its sub-line alone, and
  // a clear hook elsewhere should go first ("Başkan: Savunma Kuvvetleri iki başarılı taarruz operasyonu
  // gerçekleştirdi" was the pick on 5 October with no place and no type to show)
  if (scene.hook.lines[1] === 'GELİŞME') return 0.65;
  return scene.hook.sub ? 0.92 : 0.85;
}

export function score(r, now, recent) {
  // 24 h rather than the research's 12: our feeds arrive in six-hour batches and a record's
  // reported_at is when the feed carried it, so twelve hours punished the batch timing, not the news
  const D = Math.pow(2, -Math.max(0, hours(r, now)) / 24);
  const M = SOFT.test(r.title?.en ?? '') && !HARM.test(r.title?.en ?? '') ? 0.3
    : Math.max(MAGNITUDE.find(([re]) => re.test(r.event_type ?? ''))[1], HARM.test(r.title?.en ?? '') ? 1.0 : 0);
  // a located record's proximity is its own distance from Türkiye, not its region's: Kharkiv and the
  // Aegean are both "near" by region (0.95, 1.0), but one is ~850 km from the border and the other at it
  const pt = r.location?.geometry?.type === 'Point' ? r.location.geometry.coordinates : null;
  const P = pt ? Math.max(0.4, Math.min(1, 1 - Math.max(0, geoDistance(pt, TR_CENTRE) * 6371 - TR_RADIUS) / 2500))
    : Math.max(0.4, ...(r.regions ?? []).map((g) => PROXIMITY[g] ?? 0.4));
  const C = Math.min(1, Math.log2(1 + publishers(r)) / Math.log2(6));
  const R = RELIABILITY[r.assessment?.status] ?? 0.3;
  // novelty: the same type in the same region as a recent video is the same story again
  const same = recent.filter((p) => p.event_type === r.event_type && (p.regions ?? []).some((g) => (r.regions ?? []).includes(g))).length;
  const N = 1 / (1 + same);
  const G = r.location?.geometry ? 1 : 0;
  // a point on the map helps the video, but less than the research's 0.6 + 0.4 G: on the first run
  // a located routine visit outranked an unlocated strike with two dead
  // variety: each of the last three videos from the same watch region costs this record 10 %. On 2-3
  // October four videos in a row were Ukrainian casualty reports, the feed with the most items, while
  // the platform watches Türkiye's whole surroundings
  const region = (x) => (x.regions ?? [])[0];
  const sameRegion = recent.slice(0, 3).filter((p) => region(p) && region(p) === region(r)).length;
  const V = 1 - 0.1 * sameRegion;
  return 100 * D * (0.3 * M + 0.2 * P + 0.2 * C + 0.15 * R + 0.15 * N) * (0.8 + 0.2 * G) * V;
}

if (process.argv[1]?.endsWith('select.mjs')) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i]); }
  const datasets = args.get('datasets');
  const max = Number(args.get('max') || 1);
  const window = Number(args.get('hours') || 48);
  const now = args.has('now') ? Date.parse(args.get('now')) : Date.now();
  const file = args.get('published');
  const done = new Set(file && existsSync(file) ? readFileSync(file, 'utf8').split(/\s+/).filter(Boolean) : []);
  const all = records(datasets);
  const byId = new Map(all.map((r) => [r.id, r]));
  const recent = [...done].map((id) => byId.get(id)).filter(Boolean).slice(0, 6);
  const pool = all.filter((r) => !done.has(r.id) && hours(r, now) <= window && hours(r, now) >= 0);
  // greedy: after each pick the rest are scored again, so a second pick is not the same story twice
  const out = [];
  while (out.length < max && pool.length) {
    const ranked = pool.map((r) => ({ r, s: score(r, now, recent) })).sort((a, b) => b.s - a.s);
    // the best twelve the generator accepts, each weighed by how its scene opens
    const drawn = [];
    for (const c of ranked) {
      if (drawn.length >= 12) break;
      try { drawn.push({ ...c, h: hookWeight(generate(c.r, { datasets })) }); } catch (e) { pool.splice(pool.indexOf(c.r), 1); console.error(`skip ${e.message}`); }
    }
    if (!drawn.length) break;
    const best = drawn.sort((a, b) => b.s * b.h - a.s * a.h)[0];
    const picked = best.r;
    pool.splice(pool.indexOf(picked), 1);
    console.error(`pick ${picked.id} score ${best.s.toFixed(1)} × hook ${best.h} = ${(best.s * best.h).toFixed(1)}: ${picked.title?.tr}`);
    out.push(picked.id);
    recent.unshift(picked);
  }
  if (!out.length) console.error('nothing to publish: no recent record the generator accepts');
  console.log(out.join('\n'));
}
