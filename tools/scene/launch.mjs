// A launch scene for @greaterdefence, from Launch Library 2 (The Space Devs; free, no key, 15 calls an hour).
//
//   node tools/scene/launch.mjs --next --published published.txt [--hours 48] [--meta meta.json] [--narration out/narration.en.json]
//   node tools/scene/launch.mjs --id <launch uuid> ...
//
// Prints the scene id (launch-<uuid prefix>) and writes scenes/auto/<id>.yaml in English: the pad on the
// globe, the rocket and payload, the target orbit drawn around the Earth at its inclination and at the
// Earth's own scale, and the status Launch Library 2 gives. The hook and the facts use the record's own
// words (scene check, src/engine/scene.ts). The orbit's inclination and height are typical values for
// its type, said as such on screen ("typical for …"): Launch Library 2 gives the orbit type, not its
// elements. --next picks the most newsworthy launch of the next hours not yet published.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API = 'https://ll.thespacedevs.com/2.3.0/launches';
const COUNTRIES = JSON.parse(readFileSync(path.join(ROOT, 'assets/data/countries.json'), 'utf8'));
const byIso3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'assets/emblems/manifest.json'), 'utf8'));

/** Typical elements by Launch Library 2's orbit type. `inc: null` means "the pad's latitude", the
 *  inclination a launch due east reaches; ISS missions get the station's 51.6°. */
export const ORBITS = {
  LEO: { name: 'Low Earth Orbit', alt: 450, inc: null },
  SSO: { name: 'Sun-Synchronous Orbit', alt: 550, inc: 97.6 },
  PO: { name: 'Polar Orbit', alt: 600, inc: 90 },
  MEO: { name: 'Medium Earth Orbit', alt: 20200, inc: 55 },
  GTO: { name: 'Geostationary Transfer Orbit', alt: 250, apogee: 35786, inc: null },
  GEO: { name: 'Geostationary Orbit', alt: 35786, inc: 0 },
};
const ISS = /\b(ISS|Dragon|Soyuz MS|Progress MS|Cygnus|Starliner|Dream Chaser|HTV)\b/i;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The orbit a launch aims for, with its typical inclination and heights. */
export function orbitOf(l) {
  const ab = l.mission?.orbit?.abbrev;
  const o = ORBITS[ab];
  if (!o) return null;
  const lat = Math.abs(Number(l.pad?.latitude) || 0);
  const iss = ab === 'LEO' && ISS.test(`${l.name} ${l.mission?.name ?? ''} ${l.mission?.description ?? ''}`);
  const inc = iss ? 51.6 : o.inc ?? Math.round(lat * 10) / 10;
  return { abbrev: ab, name: iss ? 'Low Earth Orbit (ISS)' : o.name, inclination: Math.max(inc, 0), altitude: iss ? 420 : o.alt, apogee: o.apogee, iss };
}

/** How newsworthy a launch is: Türkiye's payloads first, then crews, then new and big rockets. */
export function score(l) {
  const text = `${l.name} ${l.mission?.description ?? ''} ${l.launch_service_provider?.name ?? ''}`;
  let s = 1;
  if (/\b(T[üu]rk|T[üu]rksat|IMECE|İMECE|TUA|Turkish|Türkiye|Turkey)\b/i.test(text)) s += 10;
  if (/Human Exploration|crew/i.test(`${l.mission?.type ?? ''} ${l.mission?.description ?? ''}`)) s += 5;
  if (/Starship|New Glenn|Ariane 6|Vulcan|SLS|Long March 10|Neutron/i.test(l.rocket?.configuration?.name ?? '')) s += 3;
  if (/Government|Military|Top Secret|National Security/i.test(`${l.mission?.type ?? ''} ${text}`)) s += 2;
  if (/Unknown Payload/i.test(l.name)) s -= 2;
  if (l.status?.abbrev !== 'Go') s -= 1;
  return s;
}

const upper = (s) => s.toLocaleUpperCase('en-US');
/** The words a block shows, as src/engine/scene.ts counts them for reading time. */
const beatText = (b) => (b.kind === 'facts' ? [b.kicker ?? '', ...b.lines] : [b.title ?? '', b.text ?? '']);
const firstSentence = (s = '') => (s.replace(/\s+/g, ' ').trim().match(/^.{20,200}?[.!](?=\s|$)/)?.[0] ?? s.trim().slice(0, 160));
const span = (chars, min) => Math.max(min, Math.round((chars / 13) * 10) / 10);

export function buildScene(l) {
  const orbit = orbitOf(l);
  if (!orbit) return { error: `no drawable orbit (${l.mission?.orbit?.abbrev ?? 'none'})` };
  const lat = Number(l.pad?.latitude), lon = Number(l.pad?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: 'the pad has no coordinates' };
  const iso3 = l.pad?.country?.alpha_3_code ?? l.pad?.location?.country?.alpha_3_code;
  const country = byIso3.get(iso3);
  const rocket = l.rocket?.configuration?.name ?? l.name.split('|')[0].trim();
  const payload = l.mission?.name ?? l.name.split('|')[1]?.trim() ?? '';
  const provider = l.launch_service_provider?.name ?? '';
  const net = new Date(l.net);
  const when = `${String(net.getUTCDate()).padStart(2, '0')} ${MONTHS[net.getUTCMonth()]} · ${String(net.getUTCHours()).padStart(2, '0')}:${String(net.getUTCMinutes()).padStart(2, '0')} UTC`;
  const statusName = l.status?.name ?? 'To Be Determined';
  const location = l.pad?.location?.name ?? '';
  // the sub-line is short or it is the payload's name: a whole mission description kept the hook on
  // screen for 14 s (the first test, an Electron launch)
  const first = firstSentence(l.mission?.description);
  const sub = first && first.length <= 110 && /[.!]$/.test(first) ? first : `${payload || l.name}.`;

  const source_text = [l.name, payload, l.mission?.description ?? '', provider, l.rocket?.configuration?.full_name ?? rocket,
    l.pad?.name ?? '', location, orbit.name, `Launch ${statusName}`].filter(Boolean);

  const hook = {
    kicker: upper(`${country?.en ?? location.split(',').pop()?.trim() ?? ''} · ${when}`),
    lines: [upper(rocket), upper(orbit.name.replace(/ \(ISS\)$/, ''))],
    sub,
    status: upper(statusName),
    source: 'SOURCE: LAUNCH LIBRARY 2',
  };
  // blocks, each long enough to be read (15 characters a second, src/engine/scene.ts)
  const hookEnd = span([...hook.lines, sub].join(' ').length, 3.0);
  const place = { kind: 'place', title: upper(location.split(',')[0] || l.pad?.name || ''), text: l.pad?.name ?? '' };
  const facts = { kind: 'facts', kicker: 'PAYLOAD', lines: [payload, provider].filter(Boolean) };
  const typical = orbit.apogee
    ? `Typical for this orbit: from about ${orbit.altitude} km up to ${orbit.apogee.toLocaleString('en-US')} km, about ${Math.round(orbit.inclination)}° inclination.`
    : `Typical for this orbit: about ${orbit.altitude.toLocaleString('en-US')} km up, about ${Math.round(orbit.inclination)}° inclination.`;
  const orb = { kind: 'orbit', title: upper(orbit.name), text: typical, inclination: orbit.inclination, heading: lat < -20 && orbit.inclination > 80 ? 'south' : 'north', altitude: orbit.altitude, ...(orbit.apogee ? { apogee: orbit.apogee } : {}) };
  const status = { kind: 'status', text: `Launch Library 2 lists it as: ${statusName}. Launch times often move.` };
  const beats = [];
  let t = hookEnd;
  // each block as long as its words take at the scene check's reading speed (beatText, 15 a second),
  // with a little air; the orbit block also needs time for its drawing
  for (const [b, min] of [[place, 2.4], [facts, 2.4], [orb, 6.0], [status, 2.8]]) {
    beats.push({ ...b, at: Math.round(t * 10) / 10 });
    t += span(beatText(b).join(' ').length * (13 / 14), min);
  }
  const duration = Math.round((t + 0.6) * 10) / 10;
  const pad = [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
  const orbitAt = beats[2].at;
  // the whole orbit in the frame: wide enough for a ring at the orbit's height (GEO is 6.6 Earth radii)
  // at 0.12 the geostationary ring (6.6 Earth radii) ran out of the frame and through the text block
  const far = orbit.apogee || orbit.altitude > 5000 ? 0.08 : 0.62;
  const keys = [
    { t: 0, center: pad, zoom: 0.5 },
    { t: hookEnd, center: pad, zoom: 2.2 },
    { t: orbitAt, center: pad, zoom: 1.6 },
    { t: Math.round((orbitAt + 2.2) * 10) / 10, center: [pad[0] + 25, pad[1] * 0.4], zoom: far },
    { t: duration, center: pad, zoom: 0.5 },
  ];
  const emblem = iso3 && MANIFEST.items[iso3]?.flag ? `${iso3}/flag` : undefined;
  const id = `launch-${l.id.slice(0, 8)}`;
  // the look changes from launch to launch, so the channel is never one style over and over (owner,
  // 2026-10-26); the night globes suit a launch, and the launch's own id picks one, the same every run
  const LOOKS = ['D', 'A', 'E', 'B', 'G'];
  const look = LOOKS[[...l.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % LOOKS.length];
  const scene = {
    id, record: `ll2:${l.id}`, format: 'vertical', fps: 60, duration, style: look, lang: 'en', source_text,
    camera: { from: { center: pad, zoom: 0.5 }, to: { center: pad, zoom: 2.2 }, seconds: hookEnd, ease: 'inOutCubic', keys, globe: true },
    event: { at: pad, precision: 'exact', kind: 'launch' },
    ...(country ? { subject: { country: iso3, label: upper(country.en), ...(emblem ? { emblem } : {}) } } : {}),
    labels: country ? [{ text: upper(country.en), at: country.at, kind: 'country' }] : [],
    hook, beats,
  };
  // what the voice says: the screen's facts in sentences, nothing added
  const r2 = (x) => Math.round(x * 100) / 100;
  const seg = (i) => [r2(i === 0 ? 0.25 : beats[i - 1].at + 0.15), r2(i < beats.length ? beats[i].at : duration - 0.3)];
  const narration = { id, duration, segments: [
    { text: `${rocket} launches ${payload || 'its payload'}.` },
    { text: `It lifts off from ${location || l.pad?.name}.` },
    { text: `${provider ? `${provider} is the launch provider.` : ''}` },
    { text: `The target is ${orbit.name.replace(' (ISS)', ', the space station\'s orbit')}. ${typical.replace('Typical for this orbit: ', 'Orbits like this are typically ').replace(/ km/g, ' kilometres')}` },
    { text: `Launch Library 2 lists the launch as ${statusName}.` },
  ].map((s, i) => ({ at: seg(i)[0], until: seg(i)[1], text: s.text })).filter((s) => s.text.trim()) };
  const meta = { id: l.id, title: `${rocket} · ${payload}`.trim(), title_en: `${rocket} launches ${payload} to ${orbit.name}`, status: upper(statusName),
    date: net.toISOString().slice(0, 10), published: new Date().toISOString(), sources: [l.url ?? `https://ll.thespacedevs.com/2.3.0/launches/${l.id}/`], variant: 'launch', channel: 'defence' };
  return { scene, narration, meta };
}

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'GreaterTurkiyeMotion (+https://github.com/Greater-Turkiye/motion)' } });
  if (!r.ok) throw new Error(`Launch Library 2: HTTP ${r.status} for ${url}`);
  return r.json();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[++i]); }
  const published = new Set(args.get('published') && existsSync(args.get('published')) ? readFileSync(args.get('published'), 'utf8').split(/\s+/).filter(Boolean) : []);
  let launch;
  if (typeof args.get('id') === 'string') launch = await get(`${API}/${args.get('id')}/?mode=detailed`);
  else {
    const hours = Number(args.get('hours') || 48);
    const list = (await get(`${API}/upcoming/?limit=30&mode=detailed&hide_recent_previous=true`)).results ?? [];
    const soon = list.filter((l) => (new Date(l.net) - Date.now()) / 36e5 <= hours && !published.has(`launch-${l.id.slice(0, 8)}`) && orbitOf(l));
    soon.sort((a, b) => score(b) - score(a) || new Date(a.net) - new Date(b.net));
    launch = soon[0];
  }
  if (!launch) process.exit(0); // nothing worth a video in the window: a normal outcome
  const built = buildScene(launch);
  if (built.error) { console.error(`${launch.name}: ${built.error}`); process.exit(0); }
  const dir = path.join(ROOT, 'scenes/auto');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${built.scene.id}.yaml`), `# Generated from Launch Library 2 ${launch.id} by tools/scene/launch.mjs; do not edit by hand.\n${stringify(built.scene)}`);
  if (typeof args.get('narration') === 'string') { mkdirSync(path.dirname(args.get('narration')), { recursive: true }); writeFileSync(args.get('narration'), JSON.stringify(built.narration, null, 1)); }
  if (typeof args.get('meta') === 'string') writeFileSync(args.get('meta'), JSON.stringify(built.meta, null, 1));
  console.log(built.scene.id);
}
