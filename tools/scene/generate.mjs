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
/** Turkish places a distance is measured to: the nearest one, so the number is the one that matters
 *  (a strike in Gaza is measured to Hatay, not to the Bosphorus). */
const TR_PLACES = [
  ['İSTANBUL BOĞAZI', [29.05, 41.2]], ['EDİRNE', [26.56, 41.68]], ['İZMİR', [27.14, 38.42]], ['ANTALYA', [30.71, 36.9]],
  ['MERSİN', [34.64, 36.8]], ['HATAY', [36.16, 36.2]], ['GAZİANTEP', [37.38, 37.07]], ['DİYARBAKIR', [40.23, 37.91]],
  ['VAN', [43.38, 38.49]], ['KARS', [43.1, 40.6]], ['TRABZON', [39.72, 41.0]], ['SİNOP', [35.15, 42.02]], ['ANKARA', [32.85, 39.93]],
];
const nearestTr = (p) => TR_PLACES.map(([n, at]) => ({ name: n, at, km: Math.round((geoDistance(p, at) * 6371) / 10) * 10 })).sort((a, b) => a.km - b.km)[0];
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

/** The country table (assets/data/countries.json, tools/data/build_countries.mjs): every country a
 *  headline can name, with its Turkish name, its capital or centre, and a pattern for its names and
 *  demonyms. The parties of a story are the countries its English headline names, in order. */
const COUNTRY_TABLE = JSON.parse(readFileSync(path.join(ROOT, 'assets/data/countries.json'), 'utf8'))
  .map((c) => ({ ...c, re: new RegExp(c.match, 'u') }));
function partiesOf(titleEn) {
  const hits = [];
  for (const c of COUNTRY_TABLE) {
    const m = titleEn.match(c.re);
    if (m) hits.push({ i: m.index, c });
  }
  return hits.sort((a, b) => a.i - b.i).map((h) => h.c);
}

/** Families of event types, each with its own template (PLAN.md section 15). */
const FAMILIES = [
  [/^(kinetic\.|maritime\.incident|test\.)/, 'strike'],
  [/^(diplomatic\.(talks|agreement)|procurement\.|basing\.)/, 'deal'],
  [/^exercise\./, 'exercise'],
  [/^deployment\./, 'count'],
  [/./, 'statement'],
];
const familyOf = (type) => FAMILIES.find(([re]) => re.test(type ?? ''))[1];

/** What we call each type on screen, and the words a headline must contain before we say so: the
 *  types come from keyword rules and are sometimes wrong (a winter air-defence package was filed as a
 *  drone strike), so the label is used only when the headline itself carries the evidence. */
const TYPES = {
  'kinetic.drone-strike': ['İHA SALDIRISI', /\b(drones?|UAVs?|Shahed|Geran)\b|İHA|insansız/i],
  'kinetic.missile-strike': ['FÜZE SALDIRISI', /\b(missiles?|rockets?|ballistic|Iskander|Kinzhal)\b|füze|roket|balistik/i],
  'kinetic.airstrike': ['HAVA SALDIRISI', /\b(air ?strikes?|bomb(s|ing|ed)?|glide bombs?|KABs?)\b|bomba|hava saldırı/i],
  'kinetic.shelling': ['TOPÇU ATIŞI', /\b(shell(ing|ed)?|artillery|MLRS|Grad|Uragan|howitzers?)\b|topçu/i],
  'kinetic.clash': ['ÇATIŞMA', /\b(clash(es)?|fighting|battles?|combat)\b|çatışma/i],
  'kinetic.attack': ['SALDIRI', /\b(attack(s|ed)?|strikes?|struck|hit)\b|saldır/i],
  'maritime.incident': ['DENİZ OLAYI', /\b(ship|vessel|tanker|port|boat)s?\b|gemi|liman/i],
  'diplomatic.talks': ['ÜST DÜZEY TEMAS', /\b(talks|meet(s|ing)?|met|visit(s|ed)?|call)\b|görüş|ziyaret/i],
  'diplomatic.agreement': ['ANLAŞMA', /\b(agreement|deal|signed|memorandum|accord|pact|framework)\b|anlaşma|imza|mutabakat/i],
  'diplomatic.statement': ['RESMİ AÇIKLAMA', /\b(statement|said|says|condemn(s|ed)?|warn(s|ed)?)\b|açıklama|kına/i],
  'procurement.contract': ['SİLAH ALIMI', /\b(buy(s|ing)?|bought|purchase[sd]?|contract|acquire[sd]?|order(s|ed)?)\b|satın|sözleşme|alım/i],
  'procurement.delivery': ['TESLİMAT', /\b(deliver(y|ed|s)|receive[sd]?)\b|teslim/i],
  'basing.agreement': ['ÜS ANLAŞMASI', /\b(base|basing|presence)\b|üs|varlığ/i],
  'exercise.multinational': ['TATBİKAT', /\b(exercise|drill)s?\b|tatbikat/i],
  'exercise.military': ['TATBİKAT', /\b(exercise|drill)s?\b|tatbikat/i],
  'exercise.naval': ['DENİZ TATBİKATI', /\b(exercise|drill)s?\b|tatbikat/i],
  'exercise.air': ['HAVA TATBİKATI', /\b(exercise|drill)s?\b|tatbikat/i],
  'policy.sanctions': ['YAPTIRIM', /\bsanctions?\b|yaptırım/i],
  'policy.defense': ['SAVUNMA POLİTİKASI', /\b(defen[cs]e|security)\b|savunma|güvenlik/i],
  'deployment.announced': ['KONUŞLANMA', /\b(deploy(s|ed|ment)?|troops|lost|losses)\b|konuşlan|kaybetti|kayıp/i],
};
const typeLabel = (record, texts) => {
  const t = TYPES[record.event_type];
  return t && texts.some((x) => t[1].test(x)) ? t[0] : null;
};

/** The style for an event type, from config/styles.yaml (the studio page shows every style on a
 *  recent story of each family): the exact type, else the longest matching prefix, else default. */
const STYLE_CONFIG = parse(readFileSync(path.join(ROOT, 'config', 'styles.yaml'), 'utf8'));
export function styleFor(type) {
  if (STYLE_CONFIG[type]) return STYLE_CONFIG[type];
  const prefix = Object.keys(STYLE_CONFIG).filter((k) => k.endsWith('.') && type.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return prefix ? STYLE_CONFIG[prefix] : STYLE_CONFIG.default ?? 'C';
}

/** Red lines (handbook; motion CLAUDE.md section 2): no video about Turkish forces. Matched on both
 *  titles; a false positive costs one video, a false negative is not acceptable. */
const TURKISH_FORCES = [
  /\bTurkish (armed forces|army|navy|air force|military|troops|soldiers?|forces|frigates?|warships?|jets?|drones?|UAVs?|special forces|gendarmerie)\b/i,
  /\bTürk (Silahlı Kuvvetleri|ordusu|donanması|Hava Kuvvetleri|askerleri|askeri|savaş gemisi|jetleri|SİHA|İHA)/i,
  /\bTSK\b/, /\bMehmetçik/i, /\bMSB\b.*\b(sevk|konuşlan|intikal)/i,
];

const STATUS = { unverified: 'DOĞRULANMADI', 'partially-verified': 'KISMEN DOĞRULANDI', verified: 'DOĞRULANDI', disputed: 'TARTIŞMALI' };
const PUBLISHERS = { 'ukrinform.net': 'UKRINFORM', 'aa.com.tr': 'AA', 'reuters.com': 'REUTERS', 'apnews.com': 'AP', 'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC', 'timesofisrael.com': 'TIMES OF ISRAEL', 'kyivindependent.com': 'KYIV INDEPENDENT', 'msb.gov.tr': 'MSB' };
const host = (u) => new URL(u).hostname.replace(/^www\./, '');
/** The name on the source line: a known publisher, else its domain name; a government domain
 *  ("gov.uk") keeps its whole host, since "GOV" names nobody. */
const GENERIC = new Set(['gov', 'mil', 'gouv', 'gob', 'mfa', 'co', 'com', 'net', 'org', 'ac', 'edu', 'int']);
const publisher = (u) => {
  const h = host(u);
  if (PUBLISHERS[h]) return PUBLISHERS[h];
  const parts = h.split('.');
  const name = parts.length > 1 ? parts[parts.length - 2] : h;
  return (GENERIC.has(name) ? h : name).toUpperCase(); // a Latin name keeps its Latin I: KREMLIN, not KREMLİN
};

/** Who is speaking, when the record says so: a government's own site, or a headline that names the
 *  speaker of a statement ("… : UK statement to the OSCE"). Never the first country named: a
 *  statement about Russia is not Russia's statement. */
const SPEAKER_HOSTS = [
  ['gov.uk', 'GBR'], ['mid.ru', 'RUS'], ['kremlin.ru', 'RUS'], ['government.ru', 'RUS'], ['mil.ru', 'RUS'],
  ['state.gov', 'USA'], ['defense.gov', 'USA'], ['whitehouse.gov', 'USA'], ['mfa.gov.ua', 'UKR'], ['mil.gov.ua', 'UKR'],
  ['president.gov.ua', 'UKR'], ['gov.il', 'ISR'], ['mfa.gr', 'GRC'], ['mod.mil.gr', 'GRC'], ['elysee.fr', 'FRA'],
  ['diplomatie.gouv.fr', 'FRA'], ['auswaertiges-amt.de', 'DEU'], ['bundesregierung.de', 'DEU'], ['mfa.am', 'ARM'],
  ['mfa.gov.az', 'AZE'], ['president.az', 'AZE'], ['mfa.ir', 'IRN'], ['mofa.gov.sa', 'SAU'], ['mfa.gov.cn', 'CHN'],
];
function speakerOf(record, titleEn) {
  for (const s of record.sources ?? []) {
    let h = '';
    try { h = host(s.url); } catch { continue; }
    const hit = SPEAKER_HOSTS.find(([d]) => h === d || h.endsWith('.' + d));
    if (hit) return hit[1];
  }
  for (const seg of titleEn.split(/:\s+|\s+[–—]\s+/)) {
    if (!/\b(statement|says|said|warns|condemns|calls on|announces|announced)\b/i.test(seg)) continue;
    const who = partiesOf(seg.split(/\b(statement|says|said|warns|condemns|calls on|announces|announced)\b/i)[0]);
    if (who.length) return who[0].iso3;
  }
  return null;
}

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
  // whole words only: "on" must not match inside "Kiev'de on…" words, nor "üç" inside "üçü"
  const N = '(?<![\\p{L}\\d])(\\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)';
  for (const [re, verb] of [
    [new RegExp(`${N}\\s+(kişi(nin)?\\s+)?(öldü|ölü|öldürüldü|ölmesi|öldüğü|hayatını kaybet)`, 'u'), 'ÖLDÜ'],
    [new RegExp(`${N}\\s+(kişi(nin)?\\s+)?(yaralandı|yaralı|yaralanması|yaralandığı)`, 'u'), 'YARALANDI'],
  ]) {
    const m = low.match(re);
    if (!m) continue;
    const n = words(at(m))[0];
    const tail = m[4] === 'ölü' || m[4] === 'yaralı' ? TR(m[4]) : `${m[2] ? 'KİŞİ ' : ''}${verb}`;
    return { kind: 'casualty', lines: [TR(n), tail], used: at(m) };
  }
  // a number and what it counts; a short word after it ("112 Rus İHA") belongs to the count, and a
  // case ending after an apostrophe is dropped on screen ("İHA'sının" reads "İHA")
  const num = title.match(/(\d[\d.,]*)\s+(\p{L}[\p{L}']*)(\s+\p{L}[\p{L}']*)?/u);
  if (num) {
    const noun = num[2].length <= 4 && num[3] ? `${num[2]}${num[3]}` : num[2];
    return { kind: 'number', lines: [num[1], TR(noun.split(' ').map((w) => w.split("'")[0]).join(' '))], used: `${num[1]} ${noun}` };
  }
  const cs = clauses(title);
  // a clause of two or three words that ends the title or stands alone reads as a verdict ("kaptan öldürüldü")
  const short = cs.slice(1).filter((c) => { const w = words(c); return w.length >= 2 && w.length <= 3 && c.length <= 26; }).pop();
  if (short) {
    const w = words(short);
    return { kind: 'clause', lines: w.length === 2 ? w.map(TR) : [TR(w[0]), TR(w.slice(1).join(' '))], used: short };
  }
  // otherwise who, and what they did: the first word and the last two of the first clause that has them
  const first = words(title)[0].replace(/[,:;]$/, '').split("'")[0]; // "Kiev'deki" → "Kiev"
  const body = cs.find((c) => words(c).length >= 3) ?? title;
  const bw = words(body);
  // Turkish ends on its verb; "etkisiz hale getirildi" needs three words to mean anything
  const tail = bw.slice(bw.at(-2) === 'hale' ? -3 : -2).join(' ');
  return { kind: 'fallback', lines: [TR(first), TR(tail)], used: `${first} ${tail}` };
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

/** Our records within 150 km of the point in the seven days up to the event (the event included),
 *  with how many days before the event each happened: the "recent" beat lights them in order. */
function nearbyStats(datasets, record, pt) {
  const end = Date.parse(record.time.start) + 864e5, start = end - 8 * 864e5;
  const points = [];
  for (const r of records(datasets)) {
    const p = r.location?.geometry?.type === 'Point' ? r.location.geometry.coordinates : null;
    const t = Date.parse(r.time.start);
    if (p && t >= start && t < end && geoDistance(p, pt) * 6371 <= 150)
      points.push({ at: [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100], days: Math.max(0, Math.round((end - 864e5 - t) / 864e5)) });
  }
  return { n: points.length, points: points.slice(0, 80) };
}

/** Our records in the twelve months before the event whose headline names both countries. */
function pairStats(datasets, record, a, b) {
  const end = Date.parse(record.time.start) + 864e5, start = end - 366 * 864e5;
  let n = 0;
  for (const r of records(datasets)) {
    const t = Date.parse(r.time.start), en = r.title?.en ?? '';
    if (t >= start && t < end && a.re.test(en) && b.re.test(en)) n++;
  }
  return { n };
}

/** The name an exercise goes by, when its headline gives one in quotes ('Cyprus Arrow'). */
function exerciseName(texts) {
  for (const t of texts) {
    const m = t.match(/['‘’"“”]([\p{L}\d][\p{L}\d\s\-/.]{2,28}[\p{L}\d])['‘’"“”]/u);
    if (m) return m[1];
  }
  return null;
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
  // no personal data (red line): a call sign, or a person named by first name and initial ("Kristin N.")
  if (texts.some((t) => /\b(call ?sign|callsign)\b|çağrı işareti/i.test(t) || /\b[A-Z][a-z]{2,} [A-Z]\.(?=[\s,(]|$)/.test(t))) refuse('names a person (red line: no personal data)');

  const regionKey = record.regions?.find((g) => REGIONS[g]);
  const region = regionKey ? REGIONS[regionKey] : null;
  const loc = record.location;
  const pt = loc?.geometry?.type === 'Point' ? loc.geometry.coordinates : null;
  const at = pt ?? region?.at;
  if (!at) refuse('no place to show: no point and no watch region');
  const precision = pt ? (loc.precision === 'exact' ? 'exact' : 'locality') : 'region';

  const date = new Date(record.time.start);
  // the place when the record has one (a Kyiv story is not "KARADENİZ" because its feed files it there)
  const where = pt && loc?.place_name?.tr ? loc.place_name.tr : region?.name ?? loc?.place_name?.tr ?? '';
  const kicker = `${TR(where)} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`.replace(/^ · /, '');
  // the standard abbreviation İHA for "insansız hava aracı" in every case form, on screen and in the
  // words the checker accepts: the same headline, shorter, not a new claim
  const abbrev = (s) => s.replace(/insansız hava araç(lar)?\p{L}*/giu, 'İHA').replace(/insansız hava arac\p{L}*/giu, 'İHA');
  const news = abbrev(unrubric(titleTr));
  if (news !== unrubric(titleTr)) texts.push(news);
  const hosts = [...new Set(sources.map((s) => host(s.url)))];
  const name = publisher(sources[0].url);
  const auto = (record.tags ?? []).includes('otomatik');

  const family = familyOf(record.event_type);
  let parties = partiesOf(titleEn).filter((c) => c.iso3 !== 'TUR' || family === 'deal' || family === 'exercise').slice(0, 6);
  const speakerIso = family === 'statement' || family === 'deal' ? speakerOf(record, titleEn) : null;
  if (speakerIso) {
    // the speaker leads, whether or not the headline names it
    const sp = COUNTRY_TABLE.find((c) => c.iso3 === speakerIso);
    parties = [sp, ...parties.filter((c) => c.iso3 !== speakerIso)].slice(0, 6);
  }
  const label = typeLabel(record, texts);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/emblems/manifest.json'), 'utf8')).items;
  const flag = (iso) => (manifest[iso]?.flag ? `${iso}/flag` : undefined);
  const arms = (iso) => (manifest[iso]?.['arms-eagle'] ? `${iso}/arms-eagle` : manifest[iso]?.arms ? `${iso}/arms` : undefined);
  const nameOf = (c) => TR(c.tr);
  const exName = family === 'exercise' ? exerciseName(texts) : null;

  // a place name without coordinates is not a place on the map: then the ring and the title are the region's
  const placeTitle = TR((pt ? loc?.place_name?.tr : null) ?? region?.name ?? '');
  const placeText = precision === 'region' ? 'Kesin konum yok: halka bölgeyi gösterir.'
    : loc.method === 'inferred' ? `Konum başlıktaki yer adından: ±${Math.round((loc.uncertainty_m ?? 20000) / 1000)} km.`
      : 'Konum kaynağın verdiği yer.';
  const facts = wrapLines(news).map((l) => l.replace(/(\d[\d.,]*)/g, '*$1*'));
  const nearest = nearestTr(at);
  const stats = datasets ? regionStats(datasets, record) : null;
  const around = datasets && pt ? nearbyStats(datasets, record, pt) : null;
  const statusText = st === 'verified' ? 'En az iki inceleyici doğruladı.'
    : `${hosts.length === 1 ? `Tek kaynak: ${name.length <= 4 ? name : name[0] + name.slice(1).toLowerCase()}.` : `${hosts.length} ayrı kaynak.`} ${auto ? 'Henüz kimse incelemedi.' : 'Bağımsız teyit yok.'}`;

  // ---- the hook, from the record's own fields first ------------------------------------------------
  const found = hookLines(news);
  // a clause is a hook only when it ends on a verb ("kaptan öldürüldü"), not on a bare noun phrase
  const verbish = (s) => /(d[ıiuü]|t[ıiuü]|yor|acak|ecek|m[ıiuü]ş|d[ıiuü]lar|t[ıiuü]lar)$/iu.test((s ?? '').split(' ').at(-1) ?? '');
  let hook = found;
  // two countries and evidence of what joins them; a story that merely names two countries is not a deal
  const deal = family === 'deal' && parties.length >= 2 && !!label;
  // a meeting or a statement with one named country: that country speaks (the quote card)
  // only a known speaker gets the quote card under its flag; otherwise the quote stands alone
  const speaker = !deal && (family === 'statement' || family === 'deal') && !!speakerIso;
  const regionWord = TR(region?.name ?? placeTitle);
  if (family === 'strike' && found.kind !== 'casualty' && pt && label) hook = { kind: 'place', lines: [placeTitle, label], used: '' };
  else if (deal) hook = { kind: 'parties', lines: [nameOf(parties[0]), nameOf(parties[1])], used: '' };
  else if (family === 'exercise') hook = { kind: 'name', lines: exName ? [TR(exName), 'TATBİKATI'] : [TR(region?.name ?? placeTitle), 'TATBİKAT'], used: exName ?? '' };
  else if (speaker && found.kind !== 'casualty' && found.kind !== 'number') hook = { kind: 'speaker', lines: [nameOf(parties[0]), label ?? 'AÇIKLAMA'], used: '' };
  else if (family === 'count' && found.kind === 'number') hook = found;
  else if (found.kind === 'fallback' || (found.kind === 'clause' && (!verbish(found.lines.join(' ')) || (!pt && label)))) {
    // no casualty, no number, no place: where it happened and what it was, never a stray word pair
    hook = { kind: 'region', lines: [regionWord, label ?? 'GELİŞME'], used: '' };
  }
  const subClause = clauses(news).find((c) => (!hook.used || (!c.includes(hook.used) && !hook.used.includes(c))) && words(c).length >= 3 && c.length <= 72);
  // a whole clause of at most two lines, or nothing: never a clause cut in the middle
  const sub = subClause ?? '';
  // what the hook may say beyond the headline: the record's own fields (its type as we name it, its
  // place, the countries its headline names, the exercise's name), never a word from nowhere
  const fields = [label, placeTitle, TR(region?.name ?? ''), ...parties.map(nameOf), exName ? TR(exName) : '', 'TATBİKAT TATBİKATI AÇIKLAMA GELİŞME'].filter(Boolean).join(' · ');

  // ---- beats, by family ------------------------------------------------------------------------------
  const beats = [];
  const hookChars = [...hook.lines, sub].join(' ').length;
  let t = secs(hookChars, 2.6, 0.4);
  const push = (b, chars, min, pad) => { beats.push({ ...b, at: round1(t) }); t += secs(chars, min, pad); };
  const factsBeat = () => push({ kind: 'facts', kicker: 'KAYNAĞA GÖRE', lines: facts }, facts.join(' ').length + 13, 4.0);
  const statusBeat = () => push({ kind: 'status', text: statusText }, statusText.length, 3.0);
  const distanceBeat = (fromLabel) => {
    if (nearest.km >= 100) push({ kind: 'distance', from: { at, label: fromLabel }, to: { at: nearest.at, label: nearest.name }, text: 'Kuş uçuşu, en yakın Türk şehrine.' }, fromLabel.length + nearest.name.length + 34, 3.2);
  };
  const regionClose = () => {
    if (!(stats && region && stats.n > 0)) return;
    // a rank means something only with enough records behind it
    const lines = stats.n >= 10 ? [`${region.from} *${stats.n}* kayıt:`, stats.rank === 1 ? 'en yoğun bölge.' : `bölgeler arasında ${stats.rank}.`] : [`${region.from} *${stats.n}* kayıt.`];
    const kick = `KAYITLARIMIZDA · ${stats.month}`;
    push({ kind: 'close', kicker: kick, lines }, kick.length + lines.join(' ').length, 3.4, 0.9);
  };

  if (deal) {
    push({ kind: 'link', title: label ?? 'TEMAS' }, (label ?? 'TEMAS').length + parties.map(nameOf).join(' ').length, 3.2);
    factsBeat();
    statusBeat();
    const pair = datasets ? pairStats(datasets, record, parties[0], parties[1]) : { n: 0 };
    if (pair.n >= 2) {
      const lines = ['Son 12 ayda bu iki ülke:', `*${pair.n}* kayıt.`];
      push({ kind: 'close', kicker: 'KAYITLARIMIZDA', lines }, 14 + lines.join(' ').length, 3.4, 0.9);
    } else regionClose();
  } else if (family === 'exercise') {
    if (parties.length) push({ kind: 'roster', title: exName ? TR(exName) : label ?? 'TATBİKAT' }, (exName ?? '').length + parties.map(nameOf).join(' ').length + 12, 3.4);
    push({ kind: 'place', title: placeTitle, text: placeText }, placeTitle.length + placeText.length + 1, 3.0);
    factsBeat();
    distanceBeat(placeTitle);
    statusBeat();
  } else if (speaker) {
    push({ kind: 'quote', speaker: 0, lines: facts.map((l) => l.replace(/\*/g, '')) }, facts.join(' ').length + parties[0].tr.length, 4.2);
    statusBeat();
    regionClose();
  } else {
    push({ kind: 'place', title: placeTitle, text: placeText }, placeTitle.length + placeText.length + 1, 3.0);
    factsBeat();
    if (pt) distanceBeat(placeTitle);
    if (around && around.n >= 3) {
      const text = `${loc.place_name.tr} çevresinde, 150 km içinde.`;
      push({ kind: 'recent', title: 'KAYITLARIMIZDA · SON 7 GÜN', points: around.points, text }, 28 + text.length, 3.6);
    }
    statusBeat();
    if (!(around && around.n >= 3)) regionClose();
  }
  const duration = round1(t);

  // ---- camera ----------------------------------------------------------------------------------------
  const home = [35, 39];
  const deg = (a, b) => geoDistance(a, b) / (Math.PI / 180);
  let open, near;
  if (deal || (speaker && !pt)) {
    // frame the parties (and Türkiye, so the viewer knows where they are)
    const pts = [...parties.slice(0, deal ? 6 : 1).map((c) => c.at), home];
    const mid = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const spread = Math.max(...pts.map((p) => deg(p, mid)));
    const z = Math.min(1.6, Math.max(0.35, 480 / (spread * 24.4 + 260)));
    open = { center: [round1(mid[0]), round1(mid[1])], zoom: round1(z * 0.85) };
    near = (dx, dy, zoom) => ({ center: [round1(mid[0] + dx), round1(mid[1] + dy)], zoom: round1(z * zoom) });
  } else {
    const span = deg(home, at);
    open = { center: [round1((home[0] + at[0]) / 2 - 4), round1((home[1] + at[1]) / 2 + 1.5)], zoom: round1(Math.min(1.0, Math.max(0.6, 560 / (span * 24.4 + 400)))) };
    near = (dx, dy, zoom) => ({ center: [round1(at[0] + dx), round1(at[1] + dy)], zoom });
  }
  const wide = deal || (speaker && !pt);
  const keys = [{ t: 0, ...open }, { t: beats[0].at, ...(wide ? near(0, 0, 1.0) : near(0.3, 2.4, 1.0)) }];
  for (const b of beats) {
    const end = round1(beats[beats.indexOf(b) + 1]?.at ?? duration);
    if (wide) { keys.push({ t: end, ...near(0, 0.3, b.kind === 'facts' || b.kind === 'quote' ? 1.12 : 1.04) }); continue; }
    if (b.kind === 'place' || b.kind === 'roster') keys.push({ t: end, ...near(-1.0, 1.0, 2.3) });
    if (b.kind === 'facts') keys.push({ t: end, ...near(-1.8, 1.6, 2.7) });
    if (b.kind === 'recent') keys.push({ t: end, ...near(0, 1.0, 1.9) });
    if (b.kind === 'distance') {
      const to = b.to.at;
      const mid = [(at[0] + to[0]) / 2, (at[1] + to[1]) / 2];
      keys.push({ t: round1(end - 0.2), center: [round1(mid[0]), round1(mid[1])], zoom: round1(Math.min(3.2, Math.max(0.9, 420 / (deg(at, to) * 24.4)))) });
    }
    if (b.kind === 'status') keys.push({ t: end, ...near(-0.5, 0.6, 2.2) });
  }
  // keys strictly in time order, the last one the opening again (the loop)
  const ordered = keys.filter((k, i) => i === 0 || k.t > keys[i - 1].t);
  while (ordered.length > 1 && ordered[ordered.length - 1].t >= duration) ordered.pop();
  ordered.push({ t: duration, ...open });

  // ---- labels and parties ------------------------------------------------------------------------
  const labels = [{ text: 'TÜRKİYE', at: [35, 39.2], kind: 'home' }];
  if (region?.sea) labels.push({ ...region.sea, kind: 'sea' });
  // a located event names its place on the map, so an inland view is never an empty page
  if (pt && placeTitle) labels.push({ text: placeTitle, at: [pt[0], pt[1] - 0.9], kind: 'country' });
  const partyList = parties.filter((c) => c.iso3 !== 'TUR');
  for (const c of partyList.slice(0, deal || family === 'exercise' ? 6 : 1)) labels.unshift({ text: nameOf(c), at: c.at, kind: 'country' });
  const lead = partyList[0];
  const single = !deal && family !== 'exercise';

  const scene = {
    id: `auto-${record.id}`,
    record: record.id,
    template: deal ? 'deal' : speaker ? 'statement' : family,
    format: 'vertical',
    fps: 60,
    duration,
    style: style ?? styleFor(record.event_type ?? ''),
    source_text: [...texts, fields],
    camera: { from: { center: open.center, zoom: open.zoom }, to: ordered[1], seconds: ordered[1].t, ease: 'outCubic', keys: ordered },
    ...(family === 'strike' || family === 'exercise' || pt ? { event: { at: at.map((x) => Math.round(x * 100) / 100), precision } } : {}),
    ...(single && lead ? { subject: { country: lead.iso3, ...(arms(lead.iso3) ? { emblem: arms(lead.iso3) } : {}), label: nameOf(lead) } } : {}),
    ...(parties.length ? { parties: parties.map((c) => ({ country: c.iso3, label: nameOf(c), at: c.at, ...(flag(c.iso3) ? { emblem: flag(c.iso3) } : {}) })) } : {}),
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
