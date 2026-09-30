// A scene from a record, with nobody writing it (PLAN.md sections 10 and 14, milestone M5).
//
//   node tools/scene/generate.mjs --record ../datasets/data/events/2026/09/evt_….yaml --datasets ../datasets
//   node tools/scene/generate.mjs --id evt_… --datasets <dir>          # finds the file under data/events
//
// Everything is derived from the record's own fields, deterministically, with no language model:
// the hook is the record's own words (a number and its noun, or the shortest clause of the title),
// the facts are the title, the place and its precision come from the location, the context line is
// counted from the dataset. The scene then goes through the same validate() the engine runs, so a
// scene that would be refused at render time is refused here. Red lines are checked first: a record
// about Turkish forces, a retracted or false record, or one with no place on the map gets no video.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoDistance } from 'd3-geo';
import { parse, stringify } from 'yaml';
import { validate, CPS } from '../../src/engine/scene.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MONTHS = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
const BOSPHORUS = [29.05, 41.2];
const TR = (s) => s.toLocaleUpperCase('tr');

/** Watch regions (datasets vocab/regions.yaml): where the ring goes when the record has no place,
 *  the name in the kicker, its ablative for the context line, and the sea label if it is a sea. */
const REGIONS = {
  'black-sea': { at: [34, 43.3], name: 'Karadeniz', from: "Karadeniz'den", sea: { text: 'KARADENİZ', at: [31, 43.4] } },
  'east-med': { at: [31.5, 34], name: 'Doğu Akdeniz', from: "Doğu Akdeniz'den", sea: { text: 'AKDENİZ', at: [30, 33.8] } },
  aegean: { at: [25.3, 38.5], name: 'Ege', from: "Ege'den", sea: { text: 'EGE', at: [25.2, 38.8] } },
  cyprus: { at: [33.2, 35.1], name: 'Kıbrıs', from: "Kıbrıs'tan" },
  syria: { at: [38.5, 35.2], name: 'Suriye', from: "Suriye'den" },
  iraq: { at: [44, 33.5], name: 'Irak', from: "Irak'tan" },
  iran: { at: [53, 32.5], name: 'İran', from: "İran'dan" },
  levant: { at: [35.4, 32.4], name: 'Levant', from: "Levant'tan" },
  caucasus: { at: [45, 41.5], name: 'Kafkasya', from: "Kafkasya'dan" },
  'libya-north-africa': { at: [17, 29], name: 'Kuzey Afrika', from: "Kuzey Afrika'dan" },
  'gulf-red-sea': { at: [42, 20], name: 'Körfez', from: "Körfez'den" },
  balkans: { at: [21, 43], name: 'Balkanlar', from: "Balkanlar'dan" },
  'central-asia': { at: [65, 42], name: 'Orta Asya', from: "Orta Asya'dan" },
};

/** Countries a headline names as actors: the first one named becomes the subject (its emblem over
 *  its territory, its label). Cyprus is left out on purpose: which Cyprus is a judgement, not a word. */
const COUNTRIES = [
  [/\bRussia(n|ns)?\b/i, 'RUS', 'RUSYA FEDERASYONU', [44, 53.8]],
  [/\bUkrain(e|ian|ians)\b/i, 'UKR', 'UKRAYNA', [31.5, 49.3]],
  [/\bIsrael(i|is)?\b/i, 'ISR', 'İSRAİL', [34.9, 31.3]],
  [/\bIran(ian|ians)?\b/i, 'IRN', 'İRAN', [54, 32.5]],
  [/\b(United States|U\.S\.|USA|American)\b/, 'USA', 'ABD', [-98, 39]],
  [/\bGree(ce|k)\b/i, 'GRC', 'YUNANİSTAN', [22, 39.5]],
  [/\bSyria(n|ns)?\b/i, 'SYR', 'SURİYE', [38.5, 35]],
  [/\bArmenia(n|ns)?\b/i, 'ARM', 'ERMENİSTAN', [44.9, 40.2]],
  [/\bAzerbaijan(i|is)?\b/i, 'AZE', 'AZERBAYCAN', [47.7, 40.3]],
  [/\bIraq(i|is)?\b/i, 'IRQ', 'IRAK', [43.7, 33.2]],
  [/\bLeban(on|ese)\b/i, 'LBN', 'LÜBNAN', [35.9, 33.9]],
  [/\bEgypt(ian|ians)?\b/i, 'EGY', 'MISIR', [30, 26.5]],
  [/\bLibya(n|ns)?\b/i, 'LBY', 'LİBYA', [17, 27]],
  [/\bBulgaria(n|ns)?\b/i, 'BGR', 'BULGARİSTAN', [25.3, 42.7]],
  [/\bRomania(n|ns)?\b/i, 'ROU', 'ROMANYA', [25, 45.9]],
];

/** Red lines (handbook; motion CLAUDE.md section 2): no video about Turkish forces. Matched on both
 *  titles; a false positive costs one video, a false negative is not acceptable. */
const TURKISH_FORCES = [
  /\bTurkish (armed forces|army|navy|air force|military|troops|soldiers?|forces|frigates?|warships?|jets?|drones?|UAVs?|special forces|gendarmerie)\b/i,
  /\bTürk (Silahlı Kuvvetleri|ordusu|donanması|Hava Kuvvetleri|askerleri|askeri|savaş gemisi|jetleri|SİHA|İHA)/i,
  /\bTSK\b/, /\bMehmetçik/i, /\bMSB\b.*\b(sevk|konuşlan|intikal)/i,
];

/** Default style by event family (PLAN.md section 11); `--style` overrides. */
function styleFor(type) {
  if (/^kinetic\.(drone-strike|missile-strike|airstrike)/.test(type)) return 'E';
  if (/^kinetic\.(clash|shelling)/.test(type)) return 'G';
  if (/^(kinetic|maritime)\./.test(type)) return 'A';
  if (/^diplomatic\./.test(type)) return 'K';
  if (/^(deployment|policy|procurement)\./.test(type)) return 'B';
  return 'C';
}

const STATUS = { unverified: 'DOĞRULANMADI', 'partially-verified': 'KISMEN DOĞRULANDI', verified: 'DOĞRULANDI', disputed: 'TARTIŞMALI' };
const PUBLISHERS = { 'ukrinform.net': 'UKRINFORM', 'aa.com.tr': 'AA', 'reuters.com': 'REUTERS', 'apnews.com': 'AP', 'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC', 'timesofisrael.com': 'TIMES OF ISRAEL', 'kyivindependent.com': 'KYIV INDEPENDENT', 'msb.gov.tr': 'MSB' };
const host = (u) => new URL(u).hostname.replace(/^www\./, '');
const publisher = (u) => { const h = host(u); return PUBLISHERS[h] ?? TR(h.split('.').slice(-2, -1)[0] ?? h); };

const words = (s) => s.split(/\s+/).filter(Boolean);
/** "Savaş güncellemesi: Ön saflarda 198 çatışma" → "Ön saflarda 198 çatışma": a feed's rubric is not the news. */
const unrubric = (s) => s.replace(/^[^:]{3,32}:\s+/, (m) => (words(m).length <= 3 ? '' : m));
const clauses = (s) => s.split(/\s*[,;:–—]\s+|\s+[–—]\s+/).map((c) => c.trim().replace(/^["“]|["”]$/g, '')).filter(Boolean);

/** The hook: the record's own words, at most two big lines. */
export function hookLines(title) {
  // matched on the Turkish lower case: JavaScript's /i does not fold "İ" into "i"
  const low = title.toLocaleLowerCase('tr');
  const at = (m) => title.slice(m.index, m.index + m[0].length);
  // casualties lead when there are any, deaths before injuries: the fact a reader would put first.
  // "48 kişinin yaralanmasının ardından" is shown as "48 / KİŞİ YARALANDI", the source's own verb
  // in its plain past form (the scene check still finds it in the source by its stem)
  const N = '(\\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)';
  for (const [re, verb] of [
    [new RegExp(`${N}\\s+(kişi(nin)?\\s+)?(öldü|ölü|öldürüldü|ölmesi|öldüğü|hayatını kaybet)`, 'u'), 'ÖLDÜ'],
    [new RegExp(`${N}\\s+(kişi(nin)?\\s+)?(yaralandı|yaralı|yaralanması|yaralandığı)`, 'u'), 'YARALANDI'],
  ]) {
    const m = low.match(re);
    if (!m) continue;
    const n = words(at(m))[0];
    const tail = m[4] === 'ölü' || m[4] === 'yaralı' ? TR(m[4]) : `${m[2] ? 'KİŞİ ' : ''}${verb}`;
    return { lines: [TR(n), tail], used: at(m) };
  }
  // a number and what it counts; a short word after it ("112 Rus İHA") belongs to the count, and a
  // case ending after an apostrophe is dropped on screen ("İHA'sının" reads "İHA")
  const num = title.match(/(\d[\d.,]*)\s+(\p{L}[\p{L}']*)(\s+\p{L}[\p{L}']*)?/u);
  if (num) {
    const noun = num[2].length <= 4 && num[3] ? `${num[2]}${num[3]}` : num[2];
    return { lines: [num[1], TR(noun.split(' ').map((w) => w.split("'")[0]).join(' '))], used: `${num[1]} ${noun}` };
  }
  const cs = clauses(title);
  // a clause of two or three words that ends the title or stands alone reads as a verdict ("kaptan öldürüldü")
  const short = cs.slice(1).filter((c) => { const w = words(c); return w.length >= 2 && w.length <= 3 && c.length <= 26; }).pop();
  if (short) {
    const w = words(short);
    return { lines: w.length === 2 ? w.map(TR) : [TR(w[0]), TR(w.slice(1).join(' '))], used: short };
  }
  // otherwise who, and what they did: the first word and the last two of the first clause that has them
  const first = words(title)[0].replace(/[,:;]$/, '').split("'")[0]; // "Kiev'deki" → "Kiev"
  const body = cs.find((c) => words(c).length >= 3) ?? title;
  const bw = words(body);
  // Turkish ends on its verb; "etkisiz hale getirildi" needs three words to mean anything
  const tail = bw.slice(bw.at(-2) === 'hale' ? -3 : -2).join(' ');
  return { lines: [TR(first), TR(tail)], used: `${first} ${tail}` };
}

/** Lines of at most `max` characters, whole words only, at most `n` lines. A title too long for
 *  that loses whole clauses from the end, never half a clause, so a line never stops mid-claim. */
function wrapLines(text, max = 28, n = 4) {
  const wrap = (t) => {
    const out = []; let line = '';
    for (const w of words(t)) { const next = line ? `${line} ${w}` : w; if (next.length > max && line) { out.push(line); line = w; } else line = next; }
    if (line) out.push(line);
    return out;
  };
  let t = text;
  for (;;) {
    const ls = wrap(t);
    const cs = clauses(t);
    if (ls.length <= n || cs.length <= 1) return ls.slice(0, n).map((l) => l.replace(/[,;:]$/, ''));
    t = cs.slice(0, -1).join(', ');
  }
}

const km = (a, b) => Math.round((geoDistance(a, b) * 6371) / 10) * 10;
const round1 = (x) => Math.round(x * 10) / 10;
const secs = (chars, min, pad = 0.6) => round1(Math.max(min, chars / CPS + pad));

/** Every record in the dataset, read once. Records are filed by when they were written, not by when
 *  the event happened, so months are counted from time.start, not from folder names. */
let all = null;
export function records(datasets) {
  if (all) return all;
  all = [];
  const base = path.join(datasets, 'data', 'events');
  for (const y of readdirSync(base)) for (const m of readdirSync(path.join(base, y))) for (const f of readdirSync(path.join(base, y, m))) {
    if (!f.endsWith('.yaml')) continue;
    const r = parse(readFileSync(path.join(base, y, m, f), 'utf8'));
    if (r && r.time?.start && !['retracted', 'false'].includes(r.assessment?.status)) all.push(r);
  }
  return all;
}

/** Records of the same region in the same month, and that region's rank among all regions. */
function regionStats(datasets, record) {
  const month = String(record.time.start).slice(0, 7);
  const counts = {};
  for (const r of records(datasets)) if (String(r.time.start).slice(0, 7) === month) for (const g of r.regions ?? []) counts[g] = (counts[g] ?? 0) + 1;
  const n = counts[record.regions?.[0]] ?? 0;
  const rank = 1 + Object.values(counts).filter((c) => c > n).length;
  return { n, rank, month: MONTHS[Number(month.slice(5, 7)) - 1] };
}

export function generate(record, { datasets, style } = {}) {
  const refuse = (why) => { throw new Error(`${record.id}: no video: ${why}`); };
  const titleTr = record.title?.tr, titleEn = record.title?.en ?? '';
  if (!titleTr) refuse('no Turkish title');
  const st = record.assessment?.status;
  if (!STATUS[st]) refuse(`verification status "${st}" is not one a video can carry`);
  const sources = record.sources ?? [];
  if (!sources.length) refuse('no source');
  const texts = [...new Set([titleTr, titleEn, ...sources.map((s) => s.title ?? '')].filter(Boolean))];
  for (const re of TURKISH_FORCES) if (texts.some((t) => re.test(t))) refuse('about Turkish forces (red line)');

  const regionKey = record.regions?.find((g) => REGIONS[g]);
  const region = regionKey ? REGIONS[regionKey] : null;
  const loc = record.location;
  const pt = loc?.geometry?.type === 'Point' ? loc.geometry.coordinates : null;
  const at = pt ?? region?.at;
  if (!at) refuse('no place to show: no point and no watch region');
  const precision = pt ? (loc.precision === 'exact' ? 'exact' : 'locality') : 'region';

  const date = new Date(record.time.start);
  const kicker = `${TR(region?.name ?? loc?.place_name?.tr ?? '')} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`.replace(/^ · /, '');
  const news = unrubric(titleTr);
  const hook = hookLines(news);
  const subClause = clauses(news).find((c) => !c.includes(hook.used) && !hook.used.includes(c) && words(c).length >= 3 && c.length <= 72);
  // a whole clause of at most two lines, or nothing: never a clause cut in the middle
  const sub = subClause && subClause.length <= 72 ? subClause : '';
  const hosts = [...new Set(sources.map((s) => host(s.url)))];
  const name = publisher(sources[0].url);
  const auto = (record.tags ?? []).includes('otomatik');

  const subjectHit = COUNTRIES.map(([re, iso, label, lat]) => ({ i: titleEn.search(re), iso, label, lat })).filter((c) => c.i >= 0).sort((a, b) => a.i - b.i)[0];
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/emblems/manifest.json'), 'utf8')).items;
  const emblemKind = subjectHit && (manifest[subjectHit.iso]?.['arms-eagle'] ? 'arms-eagle' : manifest[subjectHit.iso]?.arms ? 'arms' : null);

  // beats and their lengths, from the characters they carry
  const beats = [];
  // a place name without coordinates is not a place on the map: then the ring and the title are the region's
  const placeTitle = TR((pt ? loc?.place_name?.tr : null) ?? region?.name ?? '');
  const placeText = precision === 'region' ? 'Kesin konum yok: halka bölgeyi gösterir.'
    : loc.method === 'inferred' ? `Konum başlıktaki yer adından: ±${Math.round((loc.uncertainty_m ?? 20000) / 1000)} km.`
      : 'Konum kaynağın verdiği yer.';
  const facts = wrapLines(news).map((l) => l.replace(/(\d[\d.,]*)/g, '*$1*'));
  const dist = pt ? km(pt, BOSPHORUS) : 0;
  const stats = datasets ? regionStats(datasets, record) : null;
  const statusText = st === 'verified' ? 'En az iki inceleyici doğruladı.'
    : `${hosts.length === 1 ? `Tek kaynak: ${name.length <= 4 ? name : name[0] + name.slice(1).toLowerCase()}.` : `${hosts.length} ayrı kaynak.`} ${auto ? 'Henüz kimse incelemedi.' : 'Bağımsız teyit yok.'}`;

  const hookChars = [...hook.lines, sub].join(' ').length;
  let t = secs(hookChars, 2.6, 0.4);
  const push = (b, chars, min, pad) => { beats.push({ ...b, at: round1(t) }); t += secs(chars, min, pad); };
  push({ kind: 'place', title: placeTitle, text: placeText }, placeTitle.length + placeText.length + 1, 3.0);
  // the source's words, not ours: the kicker says so
  push({ kind: 'facts', kicker: 'KAYNAĞA GÖRE', lines: facts }, facts.join(' ').length + 13, 4.0);
  if (pt && dist >= 100) push({ kind: 'distance', from: { at: pt, label: placeTitle }, to: { at: BOSPHORUS, label: 'İSTANBUL BOĞAZI' }, text: 'Kuş uçuşu.' }, placeTitle.length + 26, 3.2);
  push({ kind: 'status', text: statusText }, statusText.length, 3.0);
  if (stats && region && stats.n > 0) {
    // a rank means something only with enough records behind it
    const lines = stats.n >= 10 ? [`${region.from} *${stats.n}* kayıt:`, stats.rank === 1 ? 'en yoğun bölge.' : `bölgeler arasında ${stats.rank}.`] : [`${region.from} *${stats.n}* kayıt.`];
    const kick = `VERİ SETİMİZDE · ${stats.month}`;
    push({ kind: 'close', kicker: kick, lines }, kick.length + lines.join(' ').length, 3.4, 0.9);
  }
  const duration = round1(t);

  // camera: open on Türkiye and the event together, fly in, frame the distance, pull back to the start
  const home = [35, 39];
  const span = geoDistance(home, at) / (Math.PI / 180);
  const open = { center: [round1((home[0] + at[0]) / 2 - 4), round1((home[1] + at[1]) / 2 + 1.5)], zoom: round1(Math.min(1.0, Math.max(0.6, 560 / (span * 24.4 + 400)))) };
  const near = (dx, dy, zoom) => ({ center: [round1(at[0] + dx), round1(at[1] + dy)], zoom });
  const keys = [{ t: 0, ...open }, { t: beats[0].at, ...near(0.3, 2.4, 1.0) }];
  for (const b of beats) {
    const end = round1(beats[beats.indexOf(b) + 1]?.at ?? duration);
    if (b.kind === 'place') keys.push({ t: end, ...near(-1.0, 1.0, 2.3) });
    if (b.kind === 'facts') keys.push({ t: end, ...near(-1.8, 1.6, 2.7) });
    if (b.kind === 'distance') {
      const mid = [(at[0] + BOSPHORUS[0]) / 2, (at[1] + BOSPHORUS[1]) / 2];
      const d = geoDistance(at, BOSPHORUS) / (Math.PI / 180);
      keys.push({ t: round1(end - 0.2), center: [round1(mid[0]), round1(mid[1])], zoom: round1(Math.min(3.2, Math.max(0.9, 420 / (d * 24.4)))) });
    }
    if (b.kind === 'status') keys.push({ t: end, ...near(-0.5, 0.6, 2.2) });
  }
  if (keys[keys.length - 1].t >= duration) keys.pop();
  keys.push({ t: duration, ...open });

  const labels = [{ text: 'TÜRKİYE', at: [35, 39.2], kind: 'home' }];
  if (region?.sea) labels.push({ ...region.sea, kind: 'sea' });
  // a located event names its place on the map, so an inland view is never an empty page
  if (pt && placeTitle) labels.push({ text: placeTitle, at: [pt[0], pt[1] - 0.9], kind: 'country' });
  if (subjectHit) labels.unshift({ text: subjectHit.label, at: subjectHit.lat, kind: 'country' });

  const scene = {
    id: `auto-${record.id}`,
    record: record.id,
    format: 'vertical',
    fps: 60,
    duration,
    style: style ?? styleFor(record.event_type ?? ''),
    source_text: texts,
    camera: { from: { center: open.center, zoom: open.zoom }, to: keys[1], seconds: keys[1].t, ease: 'outCubic', keys },
    event: { at: at.map((x) => Math.round(x * 100) / 100), precision },
    ...(subjectHit ? { subject: { country: subjectHit.iso, ...(emblemKind ? { emblem: `${subjectHit.iso}/${emblemKind}` } : {}), label: subjectHit.label } } : {}),
    labels,
    hook: { kicker, lines: hook.lines, sub, status: STATUS[st], source: `KAYNAK: ${name}` },
    beats,
  };
  const problems = validate(structuredClone(scene));
  if (problems.length) refuse(`the scene fails its checks: ${problems.join('; ')}`);
  return scene;
}

function findRecord(datasets, id) {
  const base = path.join(datasets, 'data', 'events');
  for (const y of readdirSync(base)) for (const m of readdirSync(path.join(base, y))) {
    const f = path.join(base, y, m, `${id}.yaml`);
    if (existsSync(f)) return f;
  }
  throw new Error(`no record ${id} under ${base}`);
}

/** The text that goes with a published video: what it shows, how sure we are, where it came from,
 *  and that nobody wrote or checked it (research/04: disclosure on every post). */
export function notes(record, scene) {
  const d = String(record.time.start).slice(0, 10);
  return [
    `**${record.title.tr}**`,
    record.title.en ? `_${record.title.en}_` : '',
    '',
    `- Durum / status: **${scene.hook.status}**`,
    `- Tarih / date: ${d}`,
    `- Kayıt / record: \`${record.id}\``,
    ...record.sources.map((s) => `- Kaynak / source: ${s.url}`),
    '',
    'Bu video, Greater Türkiye veri setindeki kayıttan otomatik üretildi; ekrandaki olgular kaynağın kendi',
    'başlığıdır (çevirisi makine çevirisi olabilir) ve kimse okumadan yayımlandı. Seslendirme yok.',
    "This video was generated automatically from a dataset record; the facts on screen are the source's own",
    'headline (possibly machine-translated) and were published without human review. No voice-over.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n') + '\n';
}

function write(scene, record, out) {
  out ??= path.join(ROOT, 'scenes', 'auto', `${scene.id}.yaml`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `# Generated from ${record.id} by tools/scene/generate.mjs; do not edit by hand.\n` + stringify(scene, { flowLevel: 3, lineWidth: 0 }));
  console.log(`${path.relative(ROOT, out)}: ${scene.duration} s, style ${scene.style}, ${scene.beats.length} beats`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i]); }
  const datasets = args.get('datasets');
  const style = args.get('style');
  if (args.has('latest')) {
    // the newest records first; a refusal is news about the record, not a failure of the run
    const n = Number(args.get('latest')) || 5;
    const newest = [...records(datasets)].sort((a, b) => String(b.reported_at ?? b.time.start).localeCompare(String(a.reported_at ?? a.time.start)));
    let made = 0;
    for (const record of newest) {
      if (made >= n) break;
      try { write(generate(record, { datasets, style }), record); made++; } catch (e) { console.log(`skip ${e.message}`); }
    }
    if (!made) { console.error('no scene could be made from the newest records'); process.exit(3); }
  } else {
    const file = args.get('record') ?? findRecord(datasets, args.get('id'));
    const record = parse(readFileSync(file, 'utf8'));
    try {
      const scene = generate(record, { datasets, style });
      write(scene, record, args.get('out'));
      if (args.get('notes')) writeFileSync(args.get('notes'), notes(record, scene));
      // what the site's videos page shows next to the video (tools/scene/site.mjs)
      if (args.get('meta')) writeFileSync(args.get('meta'), JSON.stringify({
        id: record.id, title: record.title.tr, title_en: record.title.en ?? null, status: scene.hook.status,
        date: String(record.time.start).slice(0, 10), published: new Date().toISOString(), style: scene.style,
        sources: record.sources.map((s) => s.url),
        release: `https://github.com/Greater-Turkiye/motion/releases/tag/video-${record.id}`,
      }, null, 1) + '\n');
    } catch (e) { console.error(e.message); process.exit(3); }
  }
}
