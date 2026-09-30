// Which record becomes the next video (PLAN.md section 14; docs/research/04, section 1).
//
//   node tools/scene/select.mjs --datasets ../datasets --published published.txt [--max 1] [--hours 48]
//
// Prints the chosen record ids, best first, one per line; prints nothing when no record is worth a
// video, which is a normal outcome. A record is a candidate when it is recent, not yet published,
// and the generator accepts it (red lines, a place on the map, a scene that passes its checks).
// Candidates are ranked by the research's newsworthiness score, adapted to what our records carry:
//
//   S = 100 · D · (0.30 M + 0.20 P + 0.20 C + 0.15 R + 0.15 N) · (0.6 + 0.4 G)
//
//   D recency, halving every 12 h        M magnitude, from the event type
//   P proximity to Türkiye, from region  C corroboration, distinct publishers, saturating at 5
//   R reliability, from the status      N novelty: 1 minus the overlap with the last published videos
//   G whether the record has a point on the map
//
// The owner decided that unverified records are published (datasets ADR 0023), so reliability
// lowers a record's rank instead of excluding it; the status is on screen in every frame.
import { readFileSync, existsSync } from 'node:fs';
import { generate, records } from './generate.mjs';

const MAGNITUDE = [
  [/^kinetic\.(missile-strike|airstrike|drone-strike)/, 1.0], [/^kinetic\./, 0.95], [/^maritime\./, 0.9],
  [/^(deployment|exercise)\./, 0.75], [/^(procurement|policy)\./, 0.6], [/^diplomatic\./, 0.55], [/./, 0.3],
];
const PROXIMITY = { aegean: 1.0, cyprus: 1.0, 'east-med': 0.95, 'black-sea': 0.95, syria: 0.95, iraq: 0.9, caucasus: 0.9,
  iran: 0.85, levant: 0.8, balkans: 0.8, 'libya-north-africa': 0.7, 'gulf-red-sea': 0.6, 'central-asia': 0.7, global: 0.4 };
const RELIABILITY = { verified: 1.0, 'partially-verified': 0.8, disputed: 0.4, unverified: 0.5 };

const hours = (r, now) => (now - Date.parse(r.reported_at ?? r.time.start)) / 3.6e6;
const publishers = (r) => new Set((r.sources ?? []).map((s) => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return s.url; } })).size;

export function score(r, now, recent) {
  const D = Math.pow(2, -Math.max(0, hours(r, now)) / 12);
  const M = MAGNITUDE.find(([re]) => re.test(r.event_type ?? ''))[1];
  const P = Math.max(0.4, ...(r.regions ?? []).map((g) => PROXIMITY[g] ?? 0.4));
  const C = Math.min(1, Math.log2(1 + publishers(r)) / Math.log2(6));
  const R = RELIABILITY[r.assessment?.status] ?? 0.3;
  // novelty: the same type in the same region as a recent video is the same story again
  const same = recent.filter((p) => p.event_type === r.event_type && (p.regions ?? []).some((g) => (r.regions ?? []).includes(g))).length;
  const N = 1 / (1 + same);
  const G = r.location?.geometry ? 1 : 0;
  return 100 * D * (0.3 * M + 0.2 * P + 0.2 * C + 0.15 * R + 0.15 * N) * (0.6 + 0.4 * G);
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
    let picked = null;
    for (const { r, s } of ranked) {
      pool.splice(pool.indexOf(r), 1);
      try { generate(r, { datasets }); picked = r; console.error(`pick ${r.id} score ${s.toFixed(1)}: ${r.title?.tr}`); break; } catch (e) { console.error(`skip ${e.message}`); }
    }
    if (!picked) break;
    out.push(picked.id);
    recent.unshift(picked);
  }
  if (!out.length) console.error('nothing to publish: no recent record the generator accepts');
  console.log(out.join('\n'));
}
