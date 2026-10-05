// The week in one region, as one video (PLAN.md section 19).
//
//   node tools/scene/digest.mjs --datasets ../datasets --region black-sea [--end 2026-10-01] [--out scenes/auto/x.yaml]
//
// A single story answers "what happened?"; the week answers "what is going on near us?", which is
// the reason to follow. The scene uses the blocks every video uses, so the narration, the voice
// check, the carousel and the scene check work unchanged:
//   hook     BU HAFTA · 24–30 EYLÜL / KARADENİZ / 412 KAYIT
//   recent   every located record of the seven days on the map
//   facts ×3 the week's three most newsworthy records (tools/scene/select.mjs score), each in its
//            source's own headline, with its place and day
//   status   how many of the week's records are unverified, from how many outlets
// Only records the single-story generator accepts are counted, so every red line holds here too.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { generate, records, trPlace, REGIONS, MONTHS, TR, STATUS, host, wrapLines } from './generate.mjs';
import { score } from './select.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const r1 = (x) => Math.round(x * 10) / 10;
const CPS = 15;
export const MIN_WEEK = 15;
const secs = (chars, min, pad = 0.6) => r1(Math.max(min, chars / CPS + pad));

export function digest(datasets, regionKey, end = new Date()) {
  const region = REGIONS[regionKey];
  if (!region) throw new Error(`unknown region ${regionKey}`);
  const to = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59));
  const from = new Date(to.getTime() - 7 * 86400e3 + 1000);
  const inWeek = (r) => { const t = Date.parse(r.time?.start); return t >= from.getTime() && t <= to.getTime(); };
  // the week's records in the region that a video could be made of (red lines, status, a place)
  const week = [];
  for (const r of records(datasets)) {
    if (!inWeek(r) || !(r.regions ?? []).includes(regionKey)) continue;
    try { week.push({ r, scene: generate(r, { datasets }) }); } catch { /* refused: not counted */ }
  }
  // a week is a pattern only with enough behind it: five records made a "digest" of one day's notices
  if (week.length < MIN_WEEK) throw new Error(`${regionKey}: ${week.length} records this week, fewer than ${MIN_WEEK}`);
  const n = week.length;
  const unverified = week.filter(({ r }) => r.assessment?.status === 'unverified').length;
  const outlets = new Set(week.flatMap(({ r }) => (r.sources ?? []).map((s) => { try { return host(s.url); } catch { return s.url; } }))).size;
  // the week's weight, not the last day's: each record scored as of its own report, so recency
  // (which picks the next single video) does not push the whole digest onto the last day
  const top = week.map((x) => ({ ...x, s: score(x.r, Date.parse(x.r.reported_at ?? x.r.time.start), []) })).sort((a, b) => b.s - a.s);
  // three different stories from three different places where the week has them: not the same
  // headline twice from two feeds, and not Kiev three times when Odesa and Kharkiv also had news
  const placeOf = (r) => r.location?.place_name?.tr ?? '';
  const picks = [];
  for (const distinctPlace of [true, false]) {
    for (const x of top) {
      if (picks.length >= 3) break;
      if (picks.includes(x)) continue;
      const t = x.r.title.tr.toLocaleLowerCase('tr').slice(0, 40);
      if (picks.some((p) => p.r.title.tr.toLocaleLowerCase('tr').slice(0, 40) === t)) continue;
      // and from different days: the week, not one bad night
      if (distinctPlace && picks.some((p) => placeOf(p.r) === placeOf(x.r) || String(p.r.time.start).slice(0, 10) === String(x.r.time.start).slice(0, 10))) continue;
      picks.push(x);
    }
  }
  const points = week.map(({ r }) => r.location?.geometry?.type === 'Point' ? r.location.geometry.coordinates : null)
    .filter(Boolean).slice(0, 220)
    .map((p, i) => ({ at: [r1(p[0] * 10) / 10, r1(p[1] * 10) / 10], days: 6 - Math.floor((i * 7) / Math.max(1, n)) }));
  const day = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const span = from.getUTCMonth() === to.getUTCMonth() ? `${from.getUTCDate()}–${day(to)}` : `${day(from)} – ${day(to)}`;

  // a sentence with its verb, not "KARADENİZ / 242 KAYIT": a count under a name at poster size is the
  // look CLAUDE.md section 4 forbids. "Karadeniz'den", the watch region the records are filed under,
  // not "Karadeniz'de": a Kiev strike filed there did not happen at sea
  const hookLines = [`BU HAFTA ${TR(region.from)}`, `${n} KAYIT DERLENDİ`];
  const statusWord = unverified === n ? STATUS.unverified : `${n} KAYITTAN ${unverified}'İ DOĞRULANMADI`;
  // what the hook and the status say is our own count of our own records: it is put in source_text
  // as such, the way the single-story generator lists the record's own fields
  const ours = `Greater Türkiye kayıtları: ${TR(region.name)} BU HAFTA ${TR(region.from)} ${n} KAYIT DERLENDİ ${points.length} ${unverified} ${outlets}`;

  const beats = [];
  let t = secs(hookLines.join(' ').length + 20, 2.8, 0.5);
  const push = (b, chars, min, pad) => { beats.push({ ...b, at: r1(t) }); t += secs(chars, min, pad); };
  if (points.length >= 3) {
    const text = `${region.name} çevresinde, haritada yeri olan kayıtlar.`;
    push({ kind: 'recent', title: 'BU HAFTA · KAYITLARIMIZ', points, text }, 30 + text.length, 3.6);
  }
  picks.forEach(({ r }, i) => {
    const place = r.location?.place_name?.tr ? TR(trPlace(r.location.place_name.tr)) : TR(region.name);
    const kicker = `${i + 1} · ${place} · ${day(new Date(r.time.start))}`;
    const lines = wrapLines(r.title.tr).map((l) => l.replace(/(?<![-–]\s?)(?<![\p{L}\d.,])(\d[\d.,]*)/gu, '*$1*'));
    const pt = r.location?.geometry?.type === 'Point' ? r.location.geometry.coordinates : null;
    push({ kind: 'facts', kicker, lines, ...(pt ? { place: { at: [r1(pt[0] * 100) / 100, r1(pt[1] * 100) / 100], label: place } } : {}) },
      lines.join(' ').length + kicker.length, 4.2);
  });
  const statusText = `${outlets} ayrı yayın organı. Kayıtların hiçbiri bizim iddiamız değil, kaynağın haberi.`;
  push({ kind: 'status', text: statusText }, statusText.length + statusWord.length, 3.6);
  const duration = r1(t);

  // camera: the region, then each of the three stories' places, then the region again (the loop)
  const open = { center: region.at, zoom: 1.0 };
  const keys = [{ t: 0, center: [region.at[0] - 3, region.at[1] + 1], zoom: 0.8 }, { t: beats[0].at, ...open }];
  beats.forEach((b, i) => {
    const endAt = r1(beats[i + 1]?.at ?? duration);
    if (b.kind === 'facts') {
      const r = picks[beats.filter((x, j) => j < i && x.kind === 'facts').length].r;
      const p = r.location?.geometry?.type === 'Point' ? r.location.geometry.coordinates : region.at;
      keys.push({ t: r1(endAt - 0.3), center: [r1(p[0]), r1(p[1] - 1.2)], zoom: 2.0 });
    } else keys.push({ t: endAt - 0.1 > keys.at(-1).t ? r1(endAt - 0.1) : r1(keys.at(-1).t + 0.5), ...open });
  });
  // in time order, each at least 0.4 s after the last, and the last the opening again (the loop)
  const ordered = [];
  for (const k of keys.sort((a, b) => a.t - b.t)) if (k.t < duration - 0.5 && (!ordered.length || k.t >= ordered.at(-1).t + 0.4)) ordered.push(k);
  ordered.push({ ...keys.find((k) => k.t === 0), t: duration });

  const id = `digest-${regionKey}-${to.toISOString().slice(0, 10)}`;
  return {
    id,
    template: 'digest',
    format: 'vertical',
    fps: 60,
    duration,
    style: 'A',
    source_text: [...picks.map(({ r }) => r.title.tr), ...picks.map(({ r }) => r.title.en ?? ''), ours].filter(Boolean),
    camera: { from: { center: ordered[0].center, zoom: ordered[0].zoom }, to: ordered[1], seconds: ordered[1].t, ease: 'outCubic', keys: ordered },
    labels: [{ text: 'TÜRKİYE', at: [35, 39.2], kind: 'home' }, ...(region.sea ? [{ ...region.sea, kind: 'sea' }] : [])],
    hook: { kicker: span, lines: hookLines, sub: '', status: statusWord, source: `KAYNAK: ${outlets} YAYIN ORGANI` },
    beats,
    sources: picks.flatMap(({ r }) => (r.sources ?? []).map((x) => x.url)).slice(0, 6),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[++i]); }
  let sc;
  try { sc = digest(args.get('datasets'), args.get('region') ?? 'black-sea', args.get('end') ? new Date(args.get('end')) : new Date()); }
  catch (e) { console.log(`no digest: ${e.message}`); process.exit(0); } // too few records is a normal week, not a failure
  const out = args.get('out') ?? path.join(ROOT, 'scenes', 'auto', `${sc.id}.yaml`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, stringify(sc, { flowLevel: 3, lineWidth: 0 }));
  // what the site's videos page shows next to it (tools/scene/site.mjs), as for a single story
  if (args.get('meta')) writeFileSync(args.get('meta'), JSON.stringify({
    // "Bu hafta Karadeniz'den 177 kayıt derlendi": the hook's first line already says "BU HAFTA" (the title
    // read "Bu hafta Bu hafta karadeniz'den: …"), and the region is a name
    id: sc.id, title: `Bu hafta ${sc.hook.lines[0].replace(/^BU HAFTA /u, '').toLocaleLowerCase('tr').replace(/(^|\s)(\p{Ll})/gu, (_, a, c) => a + c.toLocaleUpperCase('tr'))} ${sc.hook.lines[1].toLocaleLowerCase('tr')}`,
    title_en: null, status: sc.hook.status, date: (args.get('end') ? new Date(args.get('end')) : new Date()).toISOString().slice(0, 10),
    published: new Date().toISOString(), style: sc.style, variant: 'digest', sources: sc.sources ?? [],
    release: `https://github.com/Greater-Turkiye/motion/releases/tag/${sc.id}`,
  }, null, 1) + '\n');
  if (args.get('id-file')) writeFileSync(args.get('id-file'), sc.id);
  console.log(`${out}: ${sc.duration} s, ${sc.beats.length} blocks, ${sc.hook.lines.join(' / ')} · ${sc.hook.status}`);
}
