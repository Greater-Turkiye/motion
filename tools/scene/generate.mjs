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
import { geoDistance, geoCentroid, geoArea } from 'd3-geo';
import { feature } from 'topojson-client';
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
  // the border and the coast, where the nearest city is measured from: a Kirkuk story was "Kerkük → Van:
  // ~350 km" with Hakkari ~240 km away, and an Aegean island would go to İzmir rather than Ayvalık or Bodrum
  ['HAKKARİ', [43.74, 37.58]], ['ŞIRNAK', [42.46, 37.52]], ['MARDİN', [40.74, 37.31]], ['ŞANLIURFA', [38.79, 37.16]],
  ['KİLİS', [37.12, 36.72]], ['IĞDIR', [44.04, 39.92]], ['DOĞUBAYAZIT', [44.08, 39.55]], ['ARTVİN', [41.82, 41.18]],
  ['HOPA', [41.43, 41.39]], ['KIRKLARELİ', [27.22, 41.73]], ['ÇANAKKALE', [26.41, 40.15]], ['AYVALIK', [26.69, 39.32]],
  ['ÇEŞME', [26.3, 38.32]], ['BODRUM', [27.43, 37.03]], ['MARMARİS', [28.27, 36.85]], ['KAŞ', [29.64, 36.2]],
  ['ALANYA', [32.0, 36.54]], ['TAŞUCU', [33.88, 36.32]], ['İSKENDERUN', [36.17, 36.59]],
];
/** The middle of a country's largest landmass (Romania, not its capital; France, not an overseas
 *  island), for a record that names only its country. */
let SHAPES = null;
function countryMiddle(iso3) {
  const c = COUNTRY_TABLE.find((x) => x.iso3 === iso3);
  if (!c) return null;
  SHAPES ??= feature(JSON.parse(readFileSync(path.join(ROOT, 'assets/data/countries-50m.json'), 'utf8')), 'countries').features;
  const f = SHAPES.find((x) => String(x.id) === String(c.num));
  if (!f) return null;
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates })) : [f.geometry];
  const big = polys.sort((a, b) => geoArea(b) - geoArea(a))[0];
  return geoCentroid(big).map((x) => Math.round(x * 100) / 100);
}
/** Where a country's name goes on the map: the middle of its largest landmass (Ukraine's name over
 *  Ukraine, not over Kiev at its northern edge, where the event ring often is), unless the landmass is
 *  larger than about two million km2, whose middle a regional view does not show (Russia's lies in
 *  Siberia): then the capital, as before. */
export function labelPoint(c) {
  const middle = countryMiddle(c.iso3);
  if (!middle) return c.at;
  SHAPES ??= feature(JSON.parse(readFileSync(path.join(ROOT, 'assets/data/countries-50m.json'), 'utf8')), 'countries').features;
  const f = SHAPES.find((x) => String(x.id) === String(c.num));
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates })) : [f.geometry];
  const big = Math.max(...polys.map((g) => geoArea(g)));
  return big < 0.05 ? middle : c.at; // 0.05 sr is about 2 million km2
}
const nearestTr = (p) => TR_PLACES.map(([n, at]) => ({ name: n, at, km: Math.round((geoDistance(p, at) * 6371) / 10) * 10 })).sort((a, b) => a.km - b.km)[0];
const TR = (s) => s.toLocaleUpperCase('tr');

/** Watch regions (datasets vocab/regions.yaml): where the ring goes when the record has no place,
 *  the name in the kicker, its ablative for the context line, and the sea label if it is a sea. */
const REGIONS = {
  'black-sea': { at: [34, 43.3], name: 'Karadeniz', from: "Karadeniz'den", sea: { text: 'KARADENİZ', at: [31, 43.4], alts: [[34.5, 43.4], [37.2, 42.6], [32.6, 42.4]] } },
  'east-med': { at: [31.5, 34], name: 'Doğu Akdeniz', from: "Doğu Akdeniz'den", sea: { text: 'AKDENİZ', at: [30, 33.8], alts: [[32.6, 33.4], [26.8, 34.6], [24.5, 34.1]] } },
  aegean: { at: [25.3, 38.5], name: 'Ege', from: "Ege'den", sea: { text: 'EGE', at: [25.2, 38.8], alts: [[25.1, 37.6], [24.6, 39.6], [25.8, 36.9]] } },
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

/** Waters and coasts that records name without a point (a sea area, or a coast filed at country
 *  level), matched on the English place name, first match wins: the ring goes over the named water,
 *  not the middle of the watch region ("around Crete" sat in the Cyclades, "Syrian coast" in the
 *  Syrian desert). Turkish waters are not listed: a ring there would only ever mark our own sea. */
const NAMED_AREAS = [
  [/\b(crete|cretan)\b/i, [24.9, 35.3], 'Girit'],
  [/\blimassol\b/i, [33.05, 34.5], 'Leymosun açıkları'],
  [/\b(syrian coast|tartus|hmeimim|latakia)\b/i, [35.9, 35.15], 'Suriye kıyısı'],
  [/\bbab[ -]al[ -]mandab\b/i, [43.35, 12.6], 'Babülmendep'],
  [/\bgulf of aden\b/i, [47.5, 12.3], 'Aden Körfezi'],
  [/\bhormuz\b/i, [56.35, 26.55], 'Hürmüz Boğazı'],
  [/\bgulf of oman\b/i, [58, 24.5], 'Umman Körfezi'],
  [/\b(persian|arabian) gulf\b/i, [51.5, 26.8], 'Basra Körfezi'],
  [/\bred sea\b/i, [38.5, 20.5], 'Kızıldeniz'],
  [/\bkerch\b/i, [36.55, 45.3], 'Kerç Boğazı'],
  [/\b(sea of )?azov\b/i, [36.6, 46.1], 'Azak Denizi'],
  [/\bgulf of (sidra|sirte)\b/i, [18.5, 31.4], 'Sirte Körfezi'],
  [/\bcaspian\b/i, [51, 41.5], 'Hazar Denizi'],
];
export function namedArea(name) {
  const hit = NAMED_AREAS.find(([re]) => re.test(name ?? ''));
  return hit ? { at: hit[1], name: hit[2] } : null;
}

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
/** An attack label ("FÜZE SALDIRISI") needs the attack itself in the headline, not only the weapon:
 *  "Freyja anti-balistik sisteminin ilk savaş testi" names a missile and attacks nothing, and a
 *  fighter that "destroys a Geran-5" shoots a drone down rather than being struck by one. */
const ATTACK = /\b(attack(s|ed|ing)?|strikes?|struck|hit(s)?|target(s|ed)?|bomb(s|ed|ing)?|shell(s|ed|ing)?|fired)\b|saldır|vurdu|vuruldu|vurul|hedef al|bombal|ateş aç/i;
const typeLabel = (record, texts) => {
  const t = TYPES[record.event_type];
  // a kinetic record whose headline does not name the weapon but does say it hit ("Ukrainian forces hit
  // Russian Buk-M3 SAM system … in Luhansk region") is an attack, said as the plain word: without a
  // label its long single clause had nothing for the hook and the record got no video
  if (t && !texts.some((x) => t[1].test(x)) && /^kinetic\./.test(record.event_type) && texts.some((x) => ATTACK.test(x))) return 'SALDIRI';
  if (!t || !texts.some((x) => t[1].test(x))) return null;
  if (/^kinetic\.(drone-strike|missile-strike|airstrike|shelling|attack)$/.test(record.event_type) && !texts.some((x) => ATTACK.test(x))) return null;
  return t[0];
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
  // the country named with a base, troops or a move of forces: "Turkiye to hand over Bashiqa-Zilkan base
  // to Iraq" (Shafaq, 3 October) named no "Turkish forces" and passed every pattern above
  /\b(Türkiye|Turkiye|Turkey|Ankara)('s)?\b[^.]{0,60}\b(bases?|outposts?|garrisons?|troops|soldiers|forces|military presence|deploy\w*|withdraw\w*|redeploy\w*)\b/i,
  /\b(Türkiye|Ankara)\b[^.]{0,60}(\büs(sü|sünü|leri|lerini)?\b|askerler|kuvvetler|birlikler|konuşlan|çekil|devred)/i,
  // Turkish bases abroad, by name
  /\b(Bashiqa|Bashika|Başika|Zilkan|Zlikan|Bamerni|Bamarni|TURKSOM|Tariq bin Ziyad|Camp Turkiye)\b/i,
];

const STATUS = { unverified: 'DOĞRULANMADI', 'partially-verified': 'KISMEN DOĞRULANDI', verified: 'DOĞRULANDI', disputed: 'TARTIŞMALI' };
const PUBLISHERS = { 'ukrinform.net': 'UKRINFORM', 'aa.com.tr': 'AA', 'reuters.com': 'REUTERS', 'apnews.com': 'AP', 'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC', 'timesofisrael.com': 'TIMES OF ISRAEL', 'kyivindependent.com': 'KYIV INDEPENDENT', 'msb.gov.tr': 'MSB',
  // names a reader knows, where the domain is no name ("GOVERNMENT", "WAR", "BALKANINSIGHT")
  'government.ru': 'RUSYA HÜKÜMETİ', 'war.gov': 'ABD SAVAŞ BAKANLIĞI', 'ec.europa.eu': 'AVRUPA KOMİSYONU',
  'resmigazete.gov.tr': 'RESMÎ GAZETE', 'hnhs.gr': 'YUNAN HİDROGRAFİ DAİRESİ', 'balkaninsight.com': 'BALKAN INSIGHT',
  'aljazeera.com': 'AL JAZEERA', 'themoscowtimes.com': 'MOSCOW TIMES', 'cyprus-mail.com': 'CYPRUS MAIL', 'arabnews.com': 'ARAB NEWS',
  'caspianpost.com': 'CASPIAN POST', 'sofiaglobe.com': 'SOFIA GLOBE', 'bucurestifm.ro': 'BUCUREȘTI FM',
  'mfa.gov.tr': 'DIŞİŞLERİ BAKANLIĞI', 'gov.cy': 'GKRY HÜKÜMETİ', 'mod.gov.eg': 'MISIR SAVUNMA BAKANLIĞI',
  'mil.am': 'ERMENİSTAN SAVUNMA BAKANLIĞI', 'lebarmy.gov.lb': 'LÜBNAN ORDUSU', 'mod.gov.ua': 'UKRAYNA SAVUNMA BAKANLIĞI' };
const host = (u) => new URL(u).hostname.replace(/^www\./, '');
/** The name on the source line: a known publisher, else its domain name; a government domain
 *  ("gov.uk") keeps its whole host, since "GOV" names nobody. */
const GENERIC = new Set(['gov', 'mil', 'gouv', 'gob', 'mfa', 'co', 'com', 'net', 'org', 'ac', 'edu', 'int']);
/** A publisher's name in lower case after its first letter: Turkish rules for a Turkish name
 *  ("DIŞİŞLERİ BAKANLIĞI" → "Dışişleri bakanlığı"), the plain ones for a Latin one, whose I is no ı
 *  ("UKRINFORM" → "Ukrinform", not "Ukrınform"). A name is Turkish when it has a Turkish letter;
 *  an acronym stays as it is ("ABD savaş bakanlığı"). */
const ACRONYM = new Set(['ABD', 'AB', 'BM', 'GKRY', 'NATO', 'UN']);
const lowerName = (s) => s.split(' ').map((w) => (ACRONYM.has(w) ? w : /[İŞĞÜÖÇ]/u.test(s) ? w.toLocaleLowerCase('tr') : w.toLowerCase())).join(' ');
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

/** The machine translation's stray spaces ("30 'dan", "anti - balistik"), off the screen and the site. */
export const tidy = (s) => s.replace(/(\d) ?' ?(\p{L})/gu, "$1'$2").replace(/(\p{L}) - (\p{L})/gu, '$1-$2')
  // a model's hyphen with a stray space ("F -16", "MiG -29", "Buk - M3")
  .replace(/(\p{Lu}) ?- ?(\d)/gu, '$1-$2');

/** A place name as Turkish writes it: the Turkish exonym where the Turkish text uses one ("Kiev'de"),
 *  and letters Turkish has no key for folded to their base ("Brăila" → "Braila", so it upper-cases
 *  to "BRAİLA", not "BRĂİLA"). Turkish letters and circumflexes stay. */
const EXONYM = { Kyiv: 'Kiev', Chisinau: 'Kişinev', 'Chișinău': 'Kişinev', Tbilisi: 'Tiflis',
  // the Turkish press's names for Ukrainian cities (AA, TRT): "KHARKİV" in the kicker over "Harkov'a" in the
  // headline read as two places
  Kharkiv: 'Harkov', Chernihiv: 'Çernihiv', Zhytomyr: 'Jitomir', Chernivtsi: 'Çernivtsi', Mykolaiv: 'Mikolayiv',
  Zaporizhzhia: 'Zaporijya', Kherson: 'Herson', Lviv: 'Lviv', Luhansk: 'Luhansk' };
const TURKISH = new Set('çşğöüıİÇŞĞÖÜâîûÂÎÛ');
const FOLD = { 'ș': 'ş', 'Ș': 'Ş', 'ţ': 't', 'ț': 't', 'Ț': 'T', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'ß': 'ss' };
export const trPlace = (s) => s.replace(/\p{L}+/gu, (w) => EXONYM[w] ?? w).replace(/./gu, (c) => (TURKISH.has(c) ? c : FOLD[c] ?? c.normalize('NFD').replace(/\p{M}/gu, '')));

/** "insansız hava aracı" is İHA, and its case ending goes with it: "aracıyla" is "İHA'yla", not "İHA"
 *  ("Rus kuvvetleri Molniya İHA Harkov'a saldırdı" lost its "with"). The ending is said the way İHA
 *  is read, ending on a vowel. */
const IHA_CASE = {
  '': '', 'ı': '', 'ıyla': "'yla", 'ıyle': "'yla", 'ının': "'nın", 'ına': "'ya", 'ında': "'da", 'ından': "'dan", 'ını': "'yı",
  'lar': "'lar", 'ları': "'ları", 'larla': "'larla", 'larıyla': "'larla", 'ların': "'ların", 'larının': "'ların",
  'lara': "'lara", 'larına': "'lara", 'larda': "'larda", 'larında': "'larda", 'lardan': "'lardan", 'larından': "'lardan",
  'larını': "'ları",
};

/** The hook: the record's own words, at most two big lines. */
export function hookLines(title) {
  // matched on the Turkish lower case: JavaScript's /i does not fold "İ" into "i"
  const low = title.toLocaleLowerCase('tr');
  const at = (m) => title.slice(m.index, m.index + m[0].length);
  // casualties lead when there are any, deaths before injuries: the fact a reader would put first.
  // "48 kişinin yaralanmasının ardından" is shown as "48 KİŞİ / YARALANDI", the source's own verb
  // in its plain past form (the scene check still finds it in the source by its stem)
  // whole words only: "on" must not match inside "Kiev'de on…" words, nor "üç" inside "üçü"
  // "biri öldü", "birini öldürdü": one person, said the Turkish way (shown "BİRİ / ÖLDÜ")
  const N = '(?<![\\p{L}\\d])(\\d+|birini|biri|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)';
  for (const [re, verb] of [
    // the active voice too: "bomba altı kişiyi yaraladı" is six wounded, said the source's way round
    [new RegExp(`${N}\\s+(kişi(nin|yi)?\\s+)?(öldürdü|öldü|ölü|öldürüldü|ölmesi|öldüğü|hayatını kaybet)`, 'u'), 'ÖLDÜ'],
    [new RegExp(`${N}\\s+(kişi(nin|yi)?\\s+)?(yaraladı|yaralandı|yaralı|yaralanması|yaralandığı)`, 'u'), 'YARALANDI'],
  ]) {
    const m = low.match(re);
    if (!m) continue;
    const n = words(at(m))[0].replace(/^(biri)ni$/iu, '$1');
    // the count stays with its noun, "3 KİŞİ / YARALANDI": a bare "3" alone on the big line is the
    // poster-number look (CLAUDE.md section 4); "BİRİ / ÖLDÜ" already says who. "5 ölü" and "5 yaralı"
    // read "5 KİŞİ / ÖLDÜ" and "5 KİŞİ / YARALANDI" (the check finds the verb by its stem)
    const lines = /^biri$/iu.test(n) ? [TR(n), verb] : [`${TR(n)} KİŞİ`, verb];
    return { kind: 'casualty', lines, used: at(m) };
  }
  // a number and what it counts; a short word after it ("112 Rus İHA") belongs to the count, and a
  // case ending after an apostrophe is dropped on screen ("İHA'sının" reads "İHA")
  // a number joined to a name is a model, not a count: "Geran-5 jet dronunu" is one drone, not five
  // ("Su-35", "F-16", "Geran -5" as a translation spaces it), nor is a number inside a word ("P1")
  // and a day before a month is a date, not a count: "1 Ekim'de 97 Rus İHA" counts the 97
  const MONTH = /^(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık|january|february|march|april|may|june|july|august|september|october|november|december)/iu;
  const num = [...title.matchAll(/(?<![-–]\s?)(?<![\p{L}\d.,])(\d[\d.,]*)\s+(\p{L}[\p{L}']*)(\s+\p{L}[\p{L}']*)?/gu)].find((m) => !MONTH.test(m[2]));
  // a number whose next word is a verb counts nothing ("zayiat geçen güne göre 1.900 arttı"), so it
  // is no hook; a modifier keeps its noun ("46.230 askeri personel" is not "46.230 / ASKERİ")
  // a duration counts nothing either: "12 yıllık askeri varlığına son verdi" is a span of time
  if (num && !endsOnVerb(num[2]) && !/^(yıl|ay|gün|hafta|saat|dakika)\p{L}*$/iu.test(num[2])) {
    // and without its possessive-accusative ending: "1470 askerini" is "1470 / ASKER", "5 jet dronunu" "5 / JET DRON"
    const bare = (w) => (w.length > 6 ? w.replace(/(?<=[^aeıioöuü\s])(ını|ini|unu|ünü)$/u, '') : w);
    const modifier = /^(askeri|sivil|yabancı|ağır|hafif|toplam|balistik|seyir)$/iu.test(num[2]);
    const two = (num[2].length <= 4 || modifier) && !!num[3];
    // the number with what it counts and the verb that says what happened, as the source words them:
    // "1470 ASKERİNİ / DAHA KAYBETTİ", never "1470 / ASKER", a number standing alone at poster size
    // with its unit under it (CLAUDE.md section 4). The verb is the rest of the number's clause, at
    // most four words and thirty letters ending on a finite verb ("254'ÜNÜ ETKİSİZ HALE GETİRDİ");
    // a count without one is no hook.
    const head = `${num[1]} ${num[2]}${two ? num[3] : ''}`;
    const from = num.index + num[1].length + 1 + num[2].length + (two ? num[3].length : 0);
    const end = title.slice(from).search(/[,;:.–—]/);
    const tail = title.slice(from, end < 0 ? undefined : from + end).trim();
    if (tail && words(tail).length <= 4 && tail.length <= 30 && endsOnVerb(tail)) return { kind: 'number', lines: [TR(head), TR(tail)], used: `${head} ${tail}` };
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

/** Whether a Turkish clause ends on its verb ("…tatbikatı düzenleyeceğini duyurdu"). */
const endsOnVerb = (s) => /(d[ıiuü]|t[ıiuü]|yor|acak|ecek|m[ıiuü]ş|d[ıiuü]lar|t[ıiuü]lar)$/iu.test((s ?? '').replace(/[.!"'”’]+$/u, '').split(' ').at(-1) ?? '');

/** Lines of at most `max` characters, whole words only, at most `n` lines. A title too long for
 *  that loses whole clauses from the end, never half a clause, so a line never stops mid-claim;
 *  but only while what is left still ends on its verb: "Romanya Hava Kuvvetleri, 14-25 Eylül'de …
 *  duyurdu" cut back to "Romanya Hava Kuvvetleri" says nothing, so such a sentence keeps its verb
 *  and takes up to six lines instead. */
function wrapLines(text, max = 28, n = 4) {
  const wrap = (t) => {
    const out = []; let line = '';
    for (const w of words(t)) { const next = line ? `${line} ${w}` : w; if (next.length > max && line) { out.push(line); line = w; } else line = next; }
    if (line) out.push(line);
    return out;
  };
  // a comma or colon at a line's end stays: the lines are one sentence, and without it "İki kişi öldü /
  // yaralı sayısı 33'e yükseldi" read, and was said, as one run-on clause
  const clean = (ls) => ls;
  let t = text;
  for (;;) {
    const ls = wrap(t);
    if (ls.length <= n) return clean(ls);
    const cs = clauses(t);
    const shorter = cs.length > 1 ? cs.slice(0, -1).join(', ') : null;
    if (!shorter || !endsOnVerb(shorter)) return clean(ls.slice(0, 6));
    t = shorter;
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

/** The name an exercise goes by: in quotes ('Cyprus Arrow'), or in capitals next to the word itself
 *  ("MEDUSA 2026 tatbikatına", "exercise MEDUSA 2026"). English title case ("Exercise Begins") is not
 *  a name, so the English pattern takes capitals only. */
export function exerciseName(texts) {
  for (const t of texts) {
    const m = t.match(/['‘’"“”]([\p{L}\d][\p{L}\d\s\-/.]{2,28}[\p{L}\d])['‘’"“”]/u);
    if (m) return m[1];
  }
  const word = '\\p{Lu}[\\p{Lu}\\d-]+';
  const name = `\\p{Lu}{2}[\\p{Lu}\\d-]*(?:\\s(?:${word}|\\d{2,4})){0,2}`;
  for (const t of texts) {
    const m = t.match(new RegExp(`(?<![\\p{L}\\d])(${name})\\s+tatbikat`, 'u')) ?? t.match(new RegExp(`\\b[Ee]xercises?\\s+(${name})(?![\\p{L}\\d])`, 'u'));
    if (m && m[1].length <= 24) return m[1];
  }
  return null;
}

/** "Ege" -> "EGE'DE", "Irak" -> "IRAK'TA", "Balkanlar" -> "BALKANLAR'DA": where something happens,
 *  for a hook that reads as a sentence and not as two words side by side ("EGE TATBİKAT"). A name
 *  that ends in a possessive ("DNİPRO BÖLGESİ") takes -NDE without an apostrophe. */
export function locative(name) {
  const up = TR(name);
  const v = [...up].reverse().find((ch) => 'AEIİOÖUÜ'.includes(ch)) ?? 'E';
  const back = 'AIOU'.includes(v);
  const last = up.split(' ').at(-1);
  if (up.includes(' ') && /(S[IİUÜ]|L[AE]R[Iİ])$/u.test(last)) return `${up}N${back ? 'DA' : 'DE'}`;
  return `${up}'${/[FSTHŞÇKP]$/u.test(up) ? 'T' : 'D'}${back ? 'A' : 'E'}`;
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

/**
 * Variants of one story's order, for testing what holds viewers (PLAN.md section 16). The facts are
 * the same in every variant; only what comes first and how much follows changes.
 *   standart  hook, place, what happened, distance or pattern, status (the control)
 *   yakinlik  self-relevance first: the kicker says how far from Türkiye, the distance comes next
 *   kisa      one idea, 12-15 s: the hook, what happened (or the family's own beat), the status
 *   oruntu    the pattern first: the last seven days around the place (or the month's count) next
 */
export const VARIANTS = ['standart', 'yakinlik', 'kisa', 'oruntu'];
function arrange(beats, variant) {
  const len = (i) => (beats[i + 1]?.at ?? beats.end) - beats[i].at;
  let list = beats.map((b, i) => ({ b, d: len(i) }));
  const first = (kinds) => { const k = list.findIndex((x) => kinds.includes(x.b.kind)); if (k > 0) list.unshift(...list.splice(k, 1)); };
  if (variant === 'yakinlik') first(['distance']);
  if (variant === 'oruntu') first(['recent']);
  if (variant === 'oruntu' && list[0].b.kind !== 'recent') first(['close']);
  if (variant === 'kisa') {
    const core = list.find((x) => ['facts', 'quote', 'link', 'roster'].includes(x.b.kind)) ?? list.find((x) => ['distance', 'recent', 'place'].includes(x.b.kind));
    list = [core, list.find((x) => x.b.kind === 'status')].filter(Boolean);
  }
  let t = beats[0].at;
  const out = list.map(({ b, d }) => { const o = { ...b, at: Math.round(t * 10) / 10 }; t += d; return o; });
  return { beats: out, end: t };
}

export function generate(record, { datasets, style, variant = 'standart' } = {}) {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown variant ${variant}`);
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
  // a meeting notice or a news roundup is not an event: "Güvenlik Konseyi, 10230. Toplantı (AM)",
  // "Kısaca Dünya Haberleri: Malezya …, Myanmar …" (UN press pages the feeds carry)
  if (texts.some((t) => /\b\d+(st|nd|rd|th)? meeting \((AM|PM)\)|toplantı \((AM|PM|ÖÖ|ÖS)\)|^(kısaca dünya haberleri|world news in brief)\b/iu.test(t))) refuse('a meeting notice or a news roundup, not an event');
  // a headline in the future tense is a forecast, not an event: "ABD seçimleri yaklaşırken Putin Ukrayna'ya
  // yönelik saldırılarını artıracak" came out as "UKRAYNA / SALDIRI"
  // a verdict on a trend is analysis, not an event: "Iran's Hormuz Leverage Is Fading, But It Isn't Gone"
  // (RFE/RL) came out as "İRAN'IN HÜRMÜZ AVANTAJI / AZALIYOR AMA GEÇMİYOR"; the same cues as datasets'
  // NOT_AN_EVENT, for the records written before it had them
  if (/\b(is (fading|growing|shrinking|waning|slipping|eroding)|isn'?t gone|up in arms|the (case|road|race) (for|to)|(lessons|takeaways) from|what'?s next|in (focus|context))\b/i.test(titleEn)) refuse('analysis, not an event');
  if (/(acak|ecek)(lar)?(dır|dir)?$/iu.test((titleTr.replace(/[.!"'”’]+$/u, '').split(/\s+/).at(-1) ?? ''))) refuse('a forecast, not an event');
  if (texts.some((t) => /\b(call ?sign|callsign)\b|çağrı işareti/i.test(t) || /\b[A-Z][a-z]{2,} [A-Z]\.(?=[\s,(]|$)/.test(t))) refuse('names a person (red line: no personal data)');

  const regionKey = record.regions?.find((g) => REGIONS[g]);
  const region = regionKey ? REGIONS[regionKey] : null;
  const loc = record.location;
  const placeName = loc?.place_name?.tr ? trPlace(loc.place_name.tr) : null;
  const pt = loc?.geometry?.type === 'Point' ? loc.geometry.coordinates : null;
  // a record placed at country level ("ülke genelinde") is drawn on that country, not on the middle
  // of the watch region it is filed under (Burebista 26 sat on the Balkans' centre, in Serbia)
  const area = pt ? null : namedArea(loc?.place_name?.en);
  // a record with no place at all whose headline names Ukraine is about the war there, not about the
  // sea its feed files it under: "Russian forces lose another 1,470 troops in war against Ukraine" read
  // "KARADENİZ" with a ring in the open sea. The ring goes on Ukraine, said to show the country
  const theatre = !pt && !area && !loc?.place_name && loc?.precision !== 'country' && regionKey === 'black-sea'
    && partiesOf(titleEn).some((c) => c.iso3 === 'UKR') ? countryMiddle('UKR') : null;
  const whole = (!pt && !area && loc?.precision === 'country' && record.countries?.length === 1 && record.countries[0] !== 'TUR' ? countryMiddle(record.countries[0]) : null) ?? theatre;
  const wholeName = theatre ? 'Ukrayna' : placeName;
  const at = pt ?? area?.at ?? whole ?? region?.at;
  if (!at) refuse('no place to show: no point and no watch region');
  const precision = pt ? (loc.precision === 'exact' ? 'exact' : 'locality') : 'region';

  const date = new Date(record.time.start);
  // the place when the record has one (a Kyiv story is not "KARADENİZ" because its feed files it there)
  // the rest of the feed's placeless war items (Russia's losses, sanctions on Russia, its drones) are
  // filed under the Black Sea too, but nothing in them happened at sea: the kicker gives the date
  // alone, and a region hook names the country the headline names instead of "KARADENİZ"
  const warParty = !pt && !area && !whole && regionKey === 'black-sea'
    ? partiesOf(titleEn).find((c) => c.iso3 === 'RUS' || c.iso3 === 'UKR') : null;
  const where = (pt || whole) && wholeName ? wholeName : warParty ? '' : area?.name ?? region?.name ?? placeName ?? '';
  let kicker = `${TR(where)} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`.replace(/^ · /, '');
  // the standard abbreviation İHA for "insansız hava aracı" in every case form, on screen and in the
  // words the checker accepts: the same headline, shorter, not a new claim
  const abbrev = (s) => s.replace(/insansız hava ara(?:ç|c)(\p{L}*)/giu, (_, tail) => `İHA${IHA_CASE[tail.toLocaleLowerCase('tr')] ?? ''}`);
  // the headline's own city names in the Turkish press's spelling too ("Mykolaiv'e" → "Mikolayiv'e"),
  // so the facts and the kicker name a city the same way
  const exonyms = (t) => t.replace(/\p{L}+/gu, (w) => EXONYM[w] ?? w);
  const news = exonyms(tidy(abbrev(unrubric(titleTr))));
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
  // talks and agreements are between parties: "ÜST DÜZEY TEMAS" over "Zelensky holds meeting with
  // commanders on Lyman front" called a leader's meeting with his own army a contact between states
  const label = /^diplomatic\.(talks|agreement)$/.test(record.event_type ?? '') && parties.length < 2 ? null : typeLabel(record, texts);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/emblems/manifest.json'), 'utf8')).items;
  const flag = (iso) => (manifest[iso]?.flag ? `${iso}/flag` : undefined);
  const arms = (iso) => (manifest[iso]?.['arms-eagle'] ? `${iso}/arms-eagle` : manifest[iso]?.arms ? `${iso}/arms` : undefined);
  const nameOf = (c) => TR(c.tr);
  const exName = family === 'exercise' ? exerciseName(texts) : null;

  // a place name without coordinates is not a place on the map: then the ring and the title are the region's
  const placeTitle = TR((pt || whole ? wholeName : null) ?? area?.name ?? region?.name ?? '');
  const placeText = theatre ? 'Kesin konum yok: halka ülkeyi gösterir.' : whole ? 'Kesin konum yok: ülke genelinde.' : area ? 'Kesin konum yok: halka kaynağın andığı alanı gösterir.' : precision === 'region' ? 'Kesin konum yok: halka bölgeyi gösterir.'
    : loc.method === 'inferred' ? `Konum başlıktaki yer adından: ±${Math.round((loc.uncertainty_m ?? 20000) / 1000)} km.`
      : 'Konum kaynağın verdiği yer.';
  // counts take the accent colour; a model's number ("Geran -5", "Su-35", "P1") is part of a name,
  // and a year is no count either: "MEDUSA 2026", "2026'da" stay in the text colour
  const facts = wrapLines(news).map((l) => l.replace(/(?<![-–]\s?)(?<![\p{L}\d.,])(\d[\d.,]*)/gu, (n) => (/^(19|20)\d\d$/.test(n) ? n : `*${n}*`)));
  const nearest = nearestTr(at);
  const stats = datasets ? regionStats(datasets, record) : null;
  const around = datasets && pt ? nearbyStats(datasets, record, pt) : null;
  const statusText = st === 'verified' ? 'En az iki inceleyici doğruladı.'
    : `${hosts.length === 1 ? `Tek kaynak: ${name.length <= 4 ? name : lowerName(name).replace(/^./u, (c) => c.toLocaleUpperCase('tr'))}.` : `${hosts.length} ayrı kaynak.`} ${auto ? 'Henüz kimse incelemedi.' : 'Bağımsız teyit yok.'}`;

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
  const regionWord = warParty ? TR(warParty.tr) : TR(region?.name ?? placeTitle);
  if (family === 'strike' && found.kind !== 'casualty' && pt && label) hook = { kind: 'place', lines: [placeTitle, label], used: '' };
  else if (deal) hook = { kind: 'parties', lines: [nameOf(parties[0]), nameOf(parties[1])], used: '' };
  else if (family === 'exercise') hook = { kind: 'name', lines: exName ? [TR(exName), 'TATBİKATI'] : [locative(area?.name ?? (parties.length === 1 ? parties[0].tr : region?.name) ?? placeTitle), 'TATBİKAT'], used: exName ?? '' };
  else if (speaker && found.kind !== 'casualty' && found.kind !== 'number') hook = { kind: 'speaker', lines: [nameOf(parties[0]), label ?? 'AÇIKLAMA'], used: '' };
  else if (family === 'count' && found.kind === 'number') hook = found;
  else if (found.kind === 'fallback' || (found.kind === 'clause' && (!verbish(found.lines.join(' ')) || (!pt && label)))) {
    // no casualty, no number, no place: where it happened and what it was, never a stray word pair
    hook = { kind: 'region', lines: [pt || area || whole ? placeTitle : regionWord, label ?? 'GELİŞME'], used: '' };
  }
  // it must end on its verb: a title split at the comma of a list ("Kasta radarını, Rus İHA komuta
  // noktalarını ve depolarını vurdu") gives a first piece that says nothing on its own
  // a bare number ("1470 / ASKER") says nothing until its sentence is read: under a number hook the
  // clause that holds the number is the right sub-line ("…1470 askerini daha kaybetti"); under any
  // other hook a clause that repeats the hook's words would only say it twice
  const subClause = clauses(news).find((c) => (!hook.used || hook.kind === 'number' || (!c.includes(hook.used) && !hook.used.includes(c))) && words(c).length >= 3 && c.length <= 72 && verbish(c.replace(/[.!]$/, '')));
  // a whole clause of at most two lines, or nothing: never a clause cut in the middle
  let sub = subClause ? subClause[0].toLocaleUpperCase('tr') + subClause.slice(1) : '';
  // "KİEV / GELİŞME" puts a word that says nothing in the biggest type. When the record's own sentence
  // is short enough to be a headline (six words or fewer, ending on its verb), it becomes the hook,
  // split so the verb closes the second line ("ADF KOMUTA NOKTALARINI / ZİYARET ETTİ"), and the place
  // stays in the kicker
  // a subject the headline set off with a comma comes along ("Khmara, ADF komuta noktalarını ziyaret
  // etti"): without it the hook says something was visited and not who visited
  const cl = clauses(news), at0 = cl.indexOf(subClause);
  // (and one of up to four words, "Kataib Seyyid el-Şüheda, Başbakan'ın silah taahhüdüne destek verdi"; a
  // longer one means no clause hook at all, not "BAŞBAKAN'IN SİLAH / TAAHHÜDÜNE DESTEK VERDİ" with nobody
  // doing it)
  const before = at0 > 0 && !verbish(cl[at0 - 1]) ? cl[at0 - 1] : '';
  const subject = before && words(before).length <= 4 ? before : '';
  const headline = subClause && !(before && !subject) ? `${subject ? subject + ', ' : ''}${subClause}` : '';
  if (hook.lines[1] === 'GELİŞME' && headline && words(headline).length <= (subject ? 8 : 6)) {
    const w = words(TR(headline.replace(/[.!]$/, '')));
    let cut = 1;
    for (let k = 1; k < w.length; k++) {
      const worst = (j) => Math.max(w.slice(0, j).join(' ').length, w.slice(j).join(' ').length);
      if (worst(k) < worst(cut)) cut = k;
    }
    hook = { kind: 'clause', lines: w.length > 1 ? [w.slice(0, cut).join(' '), w.slice(cut).join(' ')] : w, used: headline };
    sub = '';
  }
  // the kicker names the place unless the hook's first line already does ("KİEV BÖLGESİ" twice)
  if (hook.lines[0] === TR(where)) kicker = kicker.split(' · ').slice(1).join(' · ') || kicker;
  // "KARADENİZ / GELİŞME" and nothing under it tells a viewer nothing in the first two seconds
  if (hook.lines[1] === 'GELİŞME' && !sub) refuse('nothing to say in the hook: no casualty, number, type or whole clause');
  // what the hook may say beyond the headline: the record's own fields (its type as we name it, its
  // place, the countries its headline names, the exercise's name), never a word from nowhere
  const fields = [label, placeTitle, TR(region?.name ?? ''), ...parties.map(nameOf), exName ? TR(exName) : '', 'TATBİKAT TATBİKATI AÇIKLAMA GELİŞME KİŞİ'].filter(Boolean).join(' · ');

  // ---- beats, by family ------------------------------------------------------------------------------
  const beats = [];
  const hookChars = [...hook.lines, sub].join(' ').length;
  let t = secs(hookChars, 2.6, 0.4);
  const push = (b, chars, min, pad) => { beats.push({ ...b, at: round1(t) }); t += secs(chars, min, pad); };
  // the facts block exists to say more than the hook's sub-line; when it would only say it again
  // (a one-clause headline) it is left out: the same sentence twice is six seconds of nothing new
  const same = (a, b) => a.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === b.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // the hook itself when it is the headline's clause (no sub-line under it)
  const factsBeat = () => { const said = sub || (hook.kind === 'clause' ? hook.lines.join(' ') : ''); if (!(said && same(facts.join(' ').replace(/\*/g, ''), said))) push({ kind: 'facts', kicker: 'KAYNAĞA GÖRE', lines: facts }, facts.join(' ').length + 13, 4.0); };
  const statusBeat = () => push({ kind: 'status', text: statusText }, statusText.length, 3.0);
  const distanceBeat = (fromLabel) => {
    if (whole) return; // from the middle of a whole country, a distance measures nothing the record says
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
    // a war item filed under the Black Sea has no place to show: "NEREDE / KARADENİZ" would say it
    if (!warParty) push({ kind: 'place', title: placeTitle, text: placeText }, placeTitle.length + placeText.length + 1, 3.0);
    factsBeat();
    if (pt) distanceBeat(placeTitle);
    if (around && around.n >= 3) {
      const text = `${placeName} çevresinde, 150 km içinde.`;
      push({ kind: 'recent', title: 'KAYITLARIMIZDA · SON 7 GÜN', points: around.points, text }, 28 + text.length, 3.6);
    }
    statusBeat();
    if (!(around && around.n >= 3)) regionClose();
  }
  // the variant's order, before the camera, which follows the beats by kind
  if (variant !== 'standart' && beats.length) {
    beats.end = t;
    const a = arrange(beats, variant);
    beats.splice(0, beats.length, ...a.beats);
    t = a.end;
    const dist = beats.find((b) => b.kind === 'distance');
    if (variant === 'yakinlik' && dist) kicker = `TÜRKİYE'YE ~${km(dist.from.at, dist.to.at)} KM`;
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
  for (const c of partyList.slice(0, deal || family === 'exercise' ? 6 : 1)) labels.unshift({ text: nameOf(c), at: labelPoint(c), kind: 'country' });
  const lead = partyList[0];
  const single = !deal && family !== 'exercise';

  const scene = {
    id: `auto-${record.id}`,
    record: record.id,
    // what the scene is, by its blocks: a talks record with one party is drawn as a single event
    template: deal ? 'deal' : speaker ? 'statement' : family === 'deal' ? 'event' : family,
    format: 'vertical',
    fps: 60,
    duration,
    ...(variant !== 'standart' ? { variant } : {}),
    style: style ?? styleFor(record.event_type ?? ''),
    source_text: [...texts, news, fields],
    camera: { from: { center: open.center, zoom: open.zoom }, to: ordered[1], seconds: ordered[1].t, ease: 'outCubic', keys: ordered },
    ...(family === 'strike' || family === 'exercise' || pt || area ? { event: { at: at.map((x) => Math.round(x * 100) / 100), precision } } : {}),
    ...(single && lead ? { subject: { country: lead.iso3, ...(arms(lead.iso3) ? { emblem: arms(lead.iso3) } : {}), label: nameOf(lead) } } : {}),
    ...(parties.length ? { parties: parties.map((c) => ({ country: c.iso3, label: nameOf(c), at: c.at, ...(flag(c.iso3) ? { emblem: flag(c.iso3) } : {}) })) } : {}),
    labels,
    // two cues of relevance and trust, both computed, neither a claim: how near Türkiye a located
    // event is when it is within 500 km, and how many outlets carry the story
    hook: { kicker, lines: hook.lines, sub, status: STATUS[st], source: `KAYNAK: ${name}${hosts.length > 1 ? ` +${hosts.length - 1}` : ''}`,
      ...((pt || whole) && nearest.km <= 500 && !kicker.startsWith('TÜRKİYE') ? { badge: `TÜRKİYE'YE YAKIN · ~${nearest.km} KM` } : {}) },
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
    'başlığıdır (çevirisi makine çevirisi olabilir) ve kimse okumadan yayımlandı.',
    "This video was generated automatically from a dataset record; the facts on screen are the source's own",
    'headline (possibly machine-translated) and were published without human review.',
    // the voice line is added by the workflow when there is a voice ("Seslendirme yok" stood above
    // "Seslendirme: yapay ses" in every narrated video's notes)
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
  const variant = args.get('variant') ?? 'standart';
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
      const scene = generate(record, { datasets, style, variant });
      write(scene, record, args.get('out'));
      if (args.get('notes')) writeFileSync(args.get('notes'), notes(record, scene));
      // what the site's videos page shows next to the video (tools/scene/site.mjs)
      if (args.get('meta')) writeFileSync(args.get('meta'), JSON.stringify({
        id: record.id, title: tidy(record.title.tr), title_en: record.title.en ?? null, status: scene.hook.status,
        date: String(record.time.start).slice(0, 10), published: new Date().toISOString(), style: scene.style, variant: scene.variant ?? 'standart',
        sources: record.sources.map((s) => s.url),
        release: `https://github.com/Greater-Turkiye/motion/releases/tag/video-${record.id}`,
      }, null, 1) + '\n');
    } catch (e) { console.error(e.message); process.exit(3); }
  }
}

// helpers the weekly digest (tools/scene/digest.mjs) builds on
export { REGIONS, MONTHS, TR, STATUS, host, wrapLines, publisher };
