// An earthquake as an instant story, for two channels (PLAN.md section 38):
//   tr     the owner's Türkiye channel: Kandilli Rasathanesi's list (KOERI), Turkish, the light map
//   earth  Greater Earth (@greaterearth): USGS's worldwide feed (public domain), English
//
//   node tools/scene/quake.mjs --channel tr|earth --next --published published.txt [--hours 6] [--min 3.8]
//        [--meta meta.json] [--narration out/narration.json]
//   node tools/scene/quake.mjs --channel tr --fixture lst0.txt ...      (a saved list, for tests)
//
// Prints the scene id and writes scenes/auto/<id>.yaml. Every number on screen and in the voice is the
// agency's own (magnitude, depth, time, place); the distance to the nearest province centre is computed
// and said as such. A preliminary solution says so ("İlksel çözüm"), because Kandilli revises them.
// The pace is the channel's point: the camera goes world → country → province → epicentre in the
// hook's first two seconds, and a block changes every 2-3 s.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROVINCES = JSON.parse(readFileSync(path.join(ROOT, 'assets/data/tr-provinces.json'), 'utf8')).provinces
  .map(([name, lon, lat]) => ({ name, at: [lon, lat] }));
const KANDILLI = 'http://www.koeri.boun.edu.tr/scripts/lst0.asp';
const USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const rad = (d) => (d * Math.PI) / 180;
export function km(a, b) {
  const [l1, p1] = a.map(rad), [l2, p2] = b.map(rad);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** Turkish letters folded to ASCII, for matching Kandilli's ASCII place names to our provinces. */
const fold = (s) => s.toLocaleUpperCase('tr').replace(/[İI]/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U')
  .replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/Â/g, 'A');
const SEAS = { 'EGE DENIZI': 'EGE DENİZİ', AKDENIZ: 'AKDENİZ', KARADENIZ: 'KARADENİZ', 'MARMARA DENIZI': 'MARMARA DENİZİ' };

/** Kandilli's lst0.asp table: one quake per line, newest first. Times are Türkiye time (UTC+3). */
export function parseKandilli(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{4})\.(\d\d)\.(\d\d)\s+(\d\d):(\d\d):(\d\d)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s{2,}(\S.*)$/);
    if (!m) continue;
    const mags = [m[10], m[11], m[12]].map(Number).filter((x) => Number.isFinite(x) && x > 0);
    if (!mags.length) continue;
    const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:00`;
    out.push({ id: `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}`, time: new Date(local), local: { y: +m[1], mo: +m[2], d: +m[3], h: m[4], mi: m[5] },
      at: [Number(m[8]), Number(m[7])], depth: Number(m[9]), mag: Math.max(...mags), place: m[13].trim(), quality: m[14].trim() });
  }
  return out;
}

/** The province a Kandilli place names ("HANLI-(SIVAS)", "KARACAKAS-SOMA (MANISA)"), or the sea. */
export function regionOf(place) {
  const paren = place.match(/\(([^)]+)\)\s*$/)?.[1];
  if (paren) {
    const p = PROVINCES.find((x) => fold(x.name) === fold(paren.trim()));
    if (p) return { kind: 'province', name: p.name };
  }
  const sea = Object.keys(SEAS).find((k) => place.toUpperCase().includes(k));
  if (sea) return { kind: 'sea', name: SEAS[sea] };
  return null;
}

export function nearestProvince(at) {
  return PROVINCES.map((p) => ({ ...p, km: km(at, p.at) })).sort((a, b) => a.km - b.km)[0];
}

const r1 = (x) => Math.round(x * 10) / 10;
/** How long the hook holds: at least `min`, and long enough to read its lines and half its sub-line at
 *  15 characters a second, the scene check's rule (src/engine/scene.ts). */
const hookTime = (hook, min) => Math.max(min, Math.ceil(((hook.lines.join(' ').length + hook.sub.length / 2) / 15) * 10 + 1) / 10);
const comma = (x) => x.toFixed(1).replace('.', ',');
const dativeTr = (name) => {
  // "SİVAS" → "SİVAS'A", "İZMİR" → "İZMİR'E", "MUĞLA" → "MUĞLA'YA"
  const v = [...name.toLocaleLowerCase('tr')].reverse().find((c) => 'aeıioöuü'.includes(c)) ?? 'a';
  const back = 'aıou'.includes(v);
  const endsVowel = 'aeıioöuü'.includes(name.toLocaleLowerCase('tr').slice(-1));
  return `${name}'${endsVowel ? 'Y' : ''}${back ? 'A' : 'E'}`;
};
/** "SİVAS" → "Sivas'ta", "MANİSA" → "Manisa'da", "EGE DENİZİ" → "Ege Denizi'nde" (the possessive n). */
export function locative(name) {
  const t = title(name), low = t.toLocaleLowerCase('tr');
  const v = [...low].reverse().find((c) => 'aeıioöuü'.includes(c)) ?? 'a';
  const back = 'aıou'.includes(v);
  if (/denizi$/u.test(low)) return `${t}'n${back ? 'da' : 'de'}`;
  const hard = 'çfhkpsşt'.includes(low.slice(-1));
  return `${t}'${hard ? 't' : 'd'}${back ? 'a' : 'e'}`;
}
const title = (s) => s.toLocaleLowerCase('tr').replace(/(^|[\s-])(\p{L})/gu, (_, a, c) => a + c.toLocaleUpperCase('tr'));

function wavesSentence(w) {
  const pick = w.places.find((p) => p.show && ['ANKARA', 'İSTANBUL', 'İZMİR'].includes(p.name)) ?? w.places.find((p) => p.show);
  if (!pick) return '';
  const mm = Math.floor(pick.s / 60), ss = Math.round(pick.s % 60);
  const said = mm ? `${mm} dakika ${ss} saniyede` : `${ss} saniyede`;
  return `Model hesabına göre deprem dalgası ${title(dativeTr(pick.name).split("'")[0])}'${dativeTr(pick.name).split("'")[1].toLocaleLowerCase('tr')} yaklaşık ${said} ulaşıyor.`;
}

/** The camera: the whole Earth, the country, the province, the epicentre, in the hook's first seconds. */
function keysFor(at, country, D, beats) {
  // one calm move, then a hold: the globe glides to the country by the end of the hook and stays there,
  // drifting only a little toward the epicentre, while the fronts spread; the globe again at the end.
  // The owner (2026-10-25): a dive into the province and back, three moves in two seconds, tired the eye
  const near = [country.center[0] * 0.8 + at[0] * 0.2, country.center[1] * 0.8 + at[1] * 0.2];
  const last = beats.at(-1);
  return [
    { t: 0, center: country.center, zoom: 1.0 },
    { t: beats[0].at, center: near, zoom: country.zoom },
    { t: Math.max(beats[0].at + 0.5, last.at), center: [near[0] + 0.3, near[1]], zoom: country.zoom * 1.06 },
    { t: D, center: country.center, zoom: 1.0 },
  ].filter((x, i, a) => i === 0 || x.t > a[i - 1].t);
}

export function sceneTr(q, list, arrivals = null) {
  const region = regionOf(q.place);
  const near = nearestProvince(q.at);
  const where = region?.name ?? near.name;
  const when = `${q.local.d} ${AYLAR[q.local.mo - 1]} ${q.local.h}.${q.local.mi}`;
  const mag = comma(q.mag);
  const prelim = /İlksel|Ilksel/i.test(q.quality);
  // the region's last 24 hours, from the same list: a count, not a forecast
  const day = list.filter((x) => x !== q && Math.abs(x.time - q.time) <= 864e5 && km(x.at, q.at) <= 50).length;
  const nearKm = Math.round(near.km);
  const source_text = [
    `Kandilli Rasathanesi: ${q.local.d} ${title(AYLAR[q.local.mo - 1])} ${q.local.y} saat ${q.local.h}.${q.local.mi}, ${title(where)} ${mag} büyüklüğünde deprem, derinlik ${comma(q.depth)} km.`,
    `${where} ${mag} BÜYÜKLÜĞÜNDE DEPREM. Merkez üssü ${near.name} il merkezine kuş uçuşu ${nearKm} km.`,
    `${day ? `Son 24 saatte 50 km içinde ${day} deprem daha.` : "Son 24 saatte 50 km içinde başka deprem yok."} ${prelim ? 'İlksel çözüm: büyüklük ve yer güncellenebilir.' : 'Revize çözüm.'}`,
  ];
  const hook = { kicker: `${where} · ${when}`, lines: [`${mag} BÜYÜKLÜĞÜNDE`, 'DEPREM'], sub: `Derinlik ${comma(q.depth)} km.`,
    status: prelim ? 'İLKSEL ÇÖZÜM' : 'REVİZE ÇÖZÜM', source: 'KAYNAK: KANDİLLİ RASATHANESİ' };
  const beats = [];
  let t = hookTime(hook, 2.4);
  let waves = null;
  if (arrivals) {
    // the places named on the map: the three nearest centres and the big cities the front reaches
    const byName = new Map(arrivals.provinces.map((r) => [r.name, r]));
    const named = [...arrivals.provinces.slice(0, 3).map((r) => r.name), 'ANKARA', 'İSTANBUL', 'İZMİR']
      .filter((n, i, a) => a.indexOf(n) === i && byName.get(n)?.s_s != null).slice(0, 6);
    const last = Math.max(...named.map((n) => byName.get(n).s_s));
    const speed = Math.max(2, Math.ceil(last / 6.2));
    const head = byName.get('ANKARA')?.s_s != null && byName.get('ANKARA').km > 60 ? byName.get('ANKARA') : byName.get(named[0]);
    const mm = Math.floor(head.s_s / 60), ss = Math.round(head.s_s % 60);
    waves = { kind: 'waves', at: t, title: 'DALGANIN TAHMİNİ VARIŞI', headline: `${title(head.name)}: ~${mm ? `${mm} dk ${ss} sn` : `${ss} sn`}`,
      note: `Tahmini S dalgası varışı, ${arrivals.model} modeli · ${speed} kat hızlı`, speed, curve: arrivals.curve,
      places: arrivals.provinces.filter((r) => r.s_s != null).map((r) => ({ name: r.name, at: r.at, s: r.s_s, ...(named.includes(r.name) ? { show: true } : {}) })) };
    beats.push(waves);
    source_text.push(`${waves.title}. ${waves.headline}. ${waves.note}.`);
    t += 7.0;
  } else if (nearKm >= 8) {
    beats.push({ kind: 'distance', at: t, kicker: 'MERKEZ ÜSSÜNDEN', from: { at: q.at, label: 'MERKEZ ÜSSÜ' }, to: { at: near.at, label: near.name }, text: 'Kuş uçuşu, en yakın il merkezine.' });
    t += 3.4;
  }
  beats.push({ kind: 'facts', at: r1(t), kicker: 'SON 24 SAAT', lines: day ? [`50 km içinde *${day}* deprem daha.`] : ['50 km içinde başka deprem yok.'] });
  t += 3.0;
  beats.push({ kind: 'status', at: r1(t), text: prelim ? 'İlksel çözüm: büyüklük ve yer güncellenebilir.' : 'Kandilli\'nin revize çözümü.' });
  t += 3.2;
  const D = r1(t);
  const country = { center: [35.2, 39.2], zoom: 1.7 };
  const id = `quake-tr-${q.id}`;
  const scene = {
    id, record: `koeri:${q.id}`, format: 'vertical', fps: 60, duration: D, style: 'Q', lang: 'tr', source_text,
    camera: { from: { center: country.center, zoom: 1 }, to: { center: q.at, zoom: 4 }, seconds: 2, ease: 'inOutCubic', keys: keysFor(q.at, country, D, beats), globe: true },
    event: { at: q.at, precision: 'exact', kind: 'ring' },
    labels: [{ text: 'TÜRKİYE', at: [35, 39.2], kind: 'home' }, ...(region?.kind === 'province' ? [] : [{ text: where, at: q.at, kind: 'sea' }])],
    hook, beats,
  };
  const r2 = (x) => Math.round(x * 100) / 100;
  const ends = [...beats.map((b) => b.at), D - 0.3];
  const said = [
    `${locative(where)} ${mag} büyüklüğünde deprem.`,
    waves ? wavesSentence(waves) : nearKm >= 8 ? `Merkez üssü ${title(dativeTr(near.name).split("'")[0])}'${dativeTr(near.name).split("'")[1].toLocaleLowerCase('tr')} kuş uçuşu ${nearKm} kilometre.` : '',
    day ? `Son yirmi dört saatte, elli kilometre içinde ${day} deprem daha oldu.` : 'Son yirmi dört saatte yakında başka deprem yok.',
    prelim ? 'Bu ilksel çözüm; büyüklük güncellenebilir.' : 'Bu, Kandilli\'nin revize çözümü.',
  ].filter(Boolean);
  const starts = [0.2, ...beats.map((b) => b.at + 0.1)];
  const narration = { id, duration: D, segments: said.map((text, i) => ({ at: r2(starts[i]), until: r2(ends[i]), text })) };
  const meta = { id: q.id, title: `${locative(where)} ${mag} büyüklüğünde deprem`, title_en: `M${q.mag.toFixed(1)} earthquake, ${title(where)}, Türkiye`,
    status: hook.status, date: `${q.local.y}-${String(q.local.mo).padStart(2, '0')}-${String(q.local.d).padStart(2, '0')}`, published: new Date().toISOString(),
    sources: [KANDILLI], variant: 'quake', channel: 'tr' };
  return { scene, narration, meta };
}

export function sceneEarth(f) {
  const p = f.properties, [lon, lat, depth] = f.geometry.coordinates;
  const at = [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
  const time = new Date(p.time);
  const when = `${time.getUTCDate()} ${MONTHS[time.getUTCMonth()]} · ${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')} UTC`;
  const country = (p.place ?? '').split(',').pop().trim().toLocaleUpperCase('en-US') || 'OPEN SEA';
  const mag = p.mag.toFixed(1);
  const place = p.place ?? '';
  const source_text = [`USGS: M ${mag} earthquake, ${place}, ${time.toUTCString()}, depth ${Math.round(depth)} km.`, `MAGNITUDE ${mag} EARTHQUAKE. ${place}.`,
    `USGS status: ${p.status}. USGS tsunami flag: ${p.tsunami ? 'yes' : 'no'}. USGS felt reports: ${p.felt ?? 0}.`];
  const hook = { kicker: `${country} · ${when}`, lines: [`MAGNITUDE ${mag}`, 'EARTHQUAKE'], sub: `${place}; depth ${Math.round(depth)} km.`,
    status: p.status === 'reviewed' ? 'REVIEWED' : 'AUTOMATIC SOLUTION', source: 'SOURCE: USGS' };
  const beats = [];
  let t = hookTime(hook, 2.6);
  if (p.tsunami) { beats.push({ kind: 'facts', at: t, kicker: 'USGS', lines: ['USGS tsunami flag: *yes*.'] }); t += 3; }
  if (p.felt) { beats.push({ kind: 'facts', at: r1(t), kicker: 'FELT REPORTS', lines: [`USGS felt reports: *${p.felt}*.`] }); t += 2.8; }
  beats.push({ kind: 'status', at: r1(t), text: p.status === 'reviewed' ? 'Reviewed by a USGS seismologist.' : 'Automatic solution: values may be revised.' });
  t += 3.2;
  const D = r1(t);
  const region = { center: at, zoom: 1.4 };
  const id = `quake-earth-${f.id}`;
  const scene = {
    id, record: `usgs:${f.id}`, format: 'vertical', fps: 60, duration: D, style: 'A', lang: 'en', source_text,
    camera: { from: { center: at, zoom: 1 }, to: { center: at, zoom: 3 }, seconds: 2, ease: 'inOutCubic', keys: keysFor(at, region, D, beats), globe: true },
    event: { at, precision: 'exact', kind: 'ring' }, labels: [], hook, beats,
  };
  const r2 = (x) => Math.round(x * 100) / 100;
  const ends = [...beats.map((b) => b.at), D - 0.3];
  const said = [`A magnitude ${mag} earthquake struck ${place}, at a depth of ${Math.round(depth)} kilometres.`,
    ...(p.tsunami ? ['The USGS has set its tsunami flag for this earthquake.'] : []),
    ...(p.felt ? [`${p.felt} people have reported feeling it.`] : []),
    p.status === 'reviewed' ? 'A USGS seismologist has reviewed the solution.' : 'This is an automatic solution, and the values may change.'];
  const starts = [0.2, ...beats.map((b) => b.at + 0.1)];
  const narration = { id, duration: D, segments: said.map((text, i) => ({ at: r2(starts[i]), until: r2(ends[i]), text })) };
  const meta = { id: f.id, title: `M${mag} earthquake · ${place}`, title_en: `Magnitude ${mag} earthquake, ${place}`, status: hook.status,
    date: time.toISOString().slice(0, 10), published: new Date().toISOString(), sources: [p.url], variant: 'quake', channel: 'earth' };
  return { scene, narration, meta };
}

async function get(url, json) {
  const r = await fetch(url, { headers: { 'User-Agent': 'GreaterTurkiyeMotion (+https://github.com/Greater-Turkiye/motion)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  if (json) return r.json();
  const buf = Buffer.from(await r.arrayBuffer());
  return new TextDecoder('windows-1254').decode(buf);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[++i]); }
  const channel = args.get('channel') ?? 'tr';
  const published = new Set(typeof args.get('published') === 'string' && existsSync(args.get('published')) ? readFileSync(args.get('published'), 'utf8').split(/\s+/).filter(Boolean) : []);
  const hours = Number(args.get('hours') || 6);
  let built;
  if (channel === 'tr') {
    const min = Number(args.get('min') || 3.8);
    const text = typeof args.get('fixture') === 'string' ? readFileSync(args.get('fixture'), 'utf8') : await get(KANDILLI);
    const list = parseKandilli(text);
    const inBox = (q) => q.at[1] >= 35.5 && q.at[1] <= 42.5 && q.at[0] >= 25.5 && q.at[0] <= 45;
    const fresh = list.filter((q) => q.mag >= min && inBox(q) && (args.has('fixture') || (Date.now() - q.time) / 36e5 <= hours) && !published.has(`quake-tr-${q.id}`));
    fresh.sort((a, b) => b.mag - a.mag);
    // --id picks one quake (the workflow's second pass, after arrivals.py ran for it); --pick prints the
    // chosen quake as "id lon lat depth" without writing a scene, for that first pass
    const chosen = typeof args.get('id') === 'string' ? list.find((q) => q.id === args.get('id')) : fresh[0];
    if (chosen && args.has('pick')) { console.log(`${chosen.id} ${chosen.at[0]} ${chosen.at[1]} ${chosen.depth}`); process.exit(0); }
    const arr = typeof args.get('arrivals') === 'string' ? JSON.parse(readFileSync(args.get('arrivals'), 'utf8')) : null;
    if (chosen) built = sceneTr(chosen, list, arr);
  } else {
    const min = Number(args.get('min') || 5.5);
    const data = typeof args.get('fixture') === 'string' ? JSON.parse(readFileSync(args.get('fixture'), 'utf8')) : await get(USGS, true);
    const fresh = data.features.filter((f) => f.properties.mag >= min && f.properties.type === 'earthquake' && (args.has('fixture') || (Date.now() - f.properties.time) / 36e5 <= hours) && !published.has(`quake-earth-${f.id}`));
    fresh.sort((a, b) => b.properties.mag - a.properties.mag);
    const chosen = typeof args.get('id') === 'string' ? data.features.find((f) => f.id === args.get('id')) : fresh[0];
    if (chosen && args.has('pick')) { const [lon, lat, depth] = chosen.geometry.coordinates; console.log(`${chosen.id} ${lon} ${lat} ${depth}`); process.exit(0); }
    if (chosen) built = sceneEarth(chosen);
  }
  if (!built) process.exit(0); // nothing big enough in the window: a normal outcome
  const dir = path.join(ROOT, 'scenes/auto');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${built.scene.id}.yaml`), `# Generated by tools/scene/quake.mjs; do not edit by hand.\n${stringify(built.scene)}`);
  if (typeof args.get('narration') === 'string') { mkdirSync(path.dirname(args.get('narration')), { recursive: true }); writeFileSync(args.get('narration'), JSON.stringify(built.narration, null, 1)); }
  if (typeof args.get('meta') === 'string') writeFileSync(args.get('meta'), JSON.stringify(built.meta, null, 1));
  console.log(built.scene.id);
}
