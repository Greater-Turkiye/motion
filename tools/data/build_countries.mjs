// The country table the scene generator and the templates use (assets/data/countries.json).
//
//   node tools/data/build_countries.mjs
//
// One entry per country drawn on the map (Natural Earth via world-atlas, keyed by ISO numeric):
//   iso2, iso3, num          from Unicode CLDR codeMappings (Unicode-3.0 licence), cached outside the repo
//   tr, en                   display names from the runtime's own CLDR data (Intl.DisplayNames), with the
//                            short forms Turkish news uses (ABD, GKRY, …) where they differ
//   at                       where a label or an arc end goes: the capital for the countries our records
//                            name, the feature's centroid otherwise
//   match                    a regular expression (source) that finds the country in an English headline:
//                            its name and its demonyms
// Same inputs, same bytes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'gt-cache');
const CLDR = 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-core/supplemental/codeMappings.json';

async function cldr() {
  mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, 'cldr-codeMappings-48.2.3.json');
  if (!existsSync(f)) writeFileSync(f, await (await fetch(CLDR)).text());
  return JSON.parse(readFileSync(f, 'utf8')).supplemental.codeMappings;
}

// capitals of the countries our records name (lon, lat); Israel's point is Tel Aviv, where most embassies are
const CAPITALS = {
  RUS: [37.62, 55.75], UKR: [30.52, 50.45], USA: [-77.04, 38.9], GBR: [-0.13, 51.51], FRA: [2.35, 48.86], DEU: [13.4, 52.52],
  ITA: [12.5, 41.9], ESP: [-3.7, 40.42], GRC: [23.73, 37.98], CYP: [33.36, 35.17], ISR: [34.78, 32.08], IRN: [51.39, 35.69],
  IRQ: [44.37, 33.31], SYR: [36.29, 33.51], LBN: [35.5, 33.89], JOR: [35.93, 31.95], EGY: [31.24, 30.04], LBY: [13.19, 32.89],
  SAU: [46.72, 24.71], ARE: [54.37, 24.45], QAT: [51.53, 25.29], YEM: [44.21, 15.35], ARM: [44.51, 40.18], AZE: [49.87, 40.41],
  GEO: [44.79, 41.72], BGR: [23.32, 42.7], ROU: [26.1, 44.43], MDA: [28.86, 47.01], SRB: [20.46, 44.79], HRV: [15.98, 45.81],
  BIH: [18.41, 43.86], ALB: [19.82, 41.33], MKD: [21.43, 42.0], MNE: [19.26, 42.44], POL: [21.01, 52.23], KAZ: [71.45, 51.17],
  UZB: [69.24, 41.3], TKM: [58.38, 37.95], KGZ: [74.59, 42.87], TJK: [68.79, 38.56], CHN: [116.4, 39.9], IND: [77.21, 28.61],
  PAK: [73.05, 33.68], AFG: [69.18, 34.53], JPN: [139.69, 35.69], KOR: [126.98, 37.57], PRK: [125.76, 39.04], VNM: [105.85, 21.03],
  BLR: [27.56, 53.9], LTU: [25.28, 54.69], LVA: [24.1, 56.95], EST: [24.75, 59.44], FIN: [24.94, 60.17], SWE: [18.07, 59.33],
  NOR: [10.75, 59.91], NLD: [4.9, 52.37], BEL: [4.35, 50.85], AUT: [16.37, 48.21], HUN: [19.04, 47.5], CZE: [14.42, 50.08],
  SVK: [17.11, 48.15], CAN: [-75.7, 45.42], TUN: [10.18, 36.81], DZA: [3.06, 36.75], MAR: [-6.84, 34.02], SDN: [32.53, 15.5],
  ETH: [38.76, 9.01], SOM: [45.34, 2.05], DJI: [43.15, 11.59], ERI: [38.93, 15.32], KWT: [47.98, 29.37], BHR: [50.59, 26.23],
  OMN: [58.41, 23.59], TUR: [32.85, 39.93], PRT: [-9.14, 38.72], DNK: [12.57, 55.68], SVN: [14.51, 46.06], AUS: [149.13, -35.28],
  BRA: [-47.88, -15.79], ZAF: [28.19, -25.75], IDN: [106.85, -6.21], MYS: [101.69, 3.14], PHL: [120.98, 14.6], THA: [100.5, 13.76],
};

// the short names Turkish news uses, where CLDR's Turkish name is long or differs
const TR_SHORT = { USA: 'ABD', GBR: 'Birleşik Krallık', CYP: 'GKRY', ARE: 'BAE', KOR: 'Güney Kore', PRK: 'Kuzey Kore', RUS: 'Rusya', CZE: 'Çekya' };

// demonyms and other names an English headline uses for a country
const DEMONYMS = {
  RUS: 'Russian|Russians|Moscow|Kremlin', UKR: 'Ukrainian|Ukrainians|Kyiv|Kiev', USA: 'U\\.S\\.|US|USA|American|Americans|Washington|Pentagon',
  GBR: 'UK|U\\.K\\.|Britain|British', ISR: 'Israeli|Israelis|IDF', IRN: 'Iranian|Iranians|Tehran|IRGC', GRC: 'Greek|Athens', CYP: 'Cypriot|Greek Cypriot',
  SYR: 'Syrian|Syrians|Damascus', IRQ: 'Iraqi|Iraqis|Baghdad', LBN: 'Lebanese|Beirut', EGY: 'Egyptian|Cairo', LBY: 'Libyan', ARM: 'Armenian|Yerevan',
  AZE: 'Azerbaijani|Azeri|Baku', GEO: 'Georgian|Tbilisi', BGR: 'Bulgarian|Sofia', ROU: 'Romanian|Bucharest', MDA: 'Moldovan|Chisinau', POL: 'Polish|Warsaw',
  DEU: 'German|Berlin', FRA: 'French|Paris', ITA: 'Italian|Rome', ESP: 'Spanish|Madrid', CHN: 'Chinese|Beijing', IND: 'Indian|New Delhi',
  PAK: 'Pakistani|Islamabad', KAZ: 'Kazakh|Astana', UZB: 'Uzbek', VNM: 'Vietnamese|Viet Nam|Hanoi', HRV: 'Croatian|Zagreb', SRB: 'Serbian|Belgrade',
  ALB: 'Albanian|Tirana', HUN: 'Hungarian|Budapest', BLR: 'Belarusian|Minsk', LTU: 'Lithuanian|Vilnius', LVA: 'Latvian|Riga', EST: 'Estonian|Tallinn',
  SAU: 'Saudi|Riyadh', ARE: 'UAE|Emirati|Abu Dhabi', QAT: 'Qatari|Doha', YEM: 'Yemeni', KOR: 'South Korean|Seoul', PRK: 'North Korean|Pyongyang',
  JPN: 'Japanese|Tokyo', JOR: 'Jordanian|Amman', TUR: 'Turkish|Türkiye|Turkey|Ankara', FIN: 'Finnish|Helsinki', SWE: 'Swedish|Stockholm',
  NOR: 'Norwegian|Oslo', NLD: 'Dutch|Netherlands', BEL: 'Belgian|Brussels', AUT: 'Austrian|Vienna', CZE: 'Czech|Prague', SVK: 'Slovak',
  MKD: 'Macedonian|Skopje', MNE: 'Montenegrin', BIH: 'Bosnian|Sarajevo', AFG: 'Afghan|Kabul', TKM: 'Turkmen', KGZ: 'Kyrgyz', TJK: 'Tajik',
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const topo = JSON.parse(readFileSync(path.join(ROOT, 'assets/data/countries-50m.json'), 'utf8'));
const fc = feature(topo, topo.objects.countries);
const codes = await cldr();
const byNum = new Map(Object.entries(codes).filter(([k, v]) => /^[A-Z]{2}$/.test(k) && v._numeric && v._alpha3).map(([iso2, v]) => [v._numeric, { iso2, iso3: v._alpha3 }]));
const trNames = new Intl.DisplayNames(['tr'], { type: 'region' }), enNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** The centroid of the largest polygon: a label for France belongs in France, not between it and Guiana. */
function mainCentroid(f) {
  const g = f.geometry;
  if (!g) return null;
  if (g.type !== 'MultiPolygon') return geoCentroid(f);
  const parts = g.coordinates.map((c) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: c } }));
  return geoCentroid(parts.sort((a, b) => geoArea(b) - geoArea(a))[0]);
}

const out = [];
for (const f of fc.features) {
  if (f.id == null) continue;
  const num = String(f.id).padStart(3, '0');
  const c = byNum.get(num);
  if (!c) continue;
  const tr = TR_SHORT[c.iso3] ?? trNames.of(c.iso2);
  const en = enNames.of(c.iso2);
  const names = [en, f.properties?.name, ...(DEMONYMS[c.iso3] ? DEMONYMS[c.iso3].split('|') : [])].filter(Boolean);
  const alternation = [...new Set(names)].map((n) => (/\\/.test(n) ? n : esc(n))).join('|');
  const at = (CAPITALS[c.iso3] ?? mainCentroid(f) ?? [0, 0]).map((x) => Math.round(x * 100) / 100);
  out.push({ iso3: c.iso3, iso2: c.iso2, num, tr, en, at, match: `\\b(?:${alternation})\\b` });
}
out.sort((a, b) => a.iso3.localeCompare(b.iso3));
writeFileSync(path.join(ROOT, 'assets/data/countries.json'), JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`${out.length} countries -> assets/data/countries.json`);
