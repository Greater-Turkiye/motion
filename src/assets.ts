import { geoCentroid, geoDistance } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, LineString, MultiLineString, Position } from 'geojson';

/** Everything a frame needs, loaded once before the first frame is drawn. */
/** A shape with a bounding circle on the sphere, so a frame can skip what faces away from it. */
export interface Culled<T> { shape: T; center: [number, number]; radius: number }

export interface Assets {
  countries: Culled<Feature>[];
  borders: Culled<LineString>[];
  borderLines: MultiLineString;   // shared land borders, for the GPU
  coastLines: MultiLineString;    // coasts: arcs that belong to one country only
  disputed: FeatureCollection;
  emblems: Map<string, HTMLImageElement>;
  relief: HTMLImageElement | null;   // assets/data/relief.png, built by tools/data/build_relief.py
  /** assets/data/countries.json (tools/data/build_countries.mjs): ISO codes, names, label points */
  countryTable: CountryRow[];
  nums: Map<string, string>;         // ISO3 → the map's numeric id
  mark: HTMLImageElement | null;     // assets/brand/mark.png, our mark in the corner of every frame
}

export interface CountryRow { iso3: string; iso2: string; num: string; tr: string; en: string; at: [number, number]; match: string }

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20C0';

/** Every family a style may use (assets/fonts, licences in assets/fonts/licenses and LICENSES.md).
 *  Static faces are declared over the whole weight range so the browser never fakes a bold. */
const FAMILIES: [string, string, FontFaceDescriptors][] = [
  ['BigShoulders', 'bigshoulders.ttf', { weight: '100 900' }],
  ['Archivo', 'archivo.ttf', { weight: '100 900', stretch: '62% 125%' }],
  ['Newsreader', 'newsreader.ttf', { weight: '200 800' }],
  ['Schibsted', 'schibstedgrotesk.ttf', { weight: '400 900' }],
  ['Unbounded', 'unbounded.ttf', { weight: '200 900' }],
  ['Martian', 'martianmono.ttf', { weight: '100 800', stretch: '75% 112.5%' }],
  ['JetBrains', 'jetbrainsmono.ttf', { weight: '100 800' }],
  ['SpecialElite', 'specialelite-regular.ttf', { weight: '100 900' }],
  ['CourierPrime', 'courierprime-regular.ttf', { weight: '100 600' }],
  ['CourierPrime', 'courierprime-bold.ttf', { weight: '700 900' }],
  ['BlackOps', 'blackopsone-regular.ttf', { weight: '100 900' }],
  ['Cinzel', 'cinzel.ttf', { weight: '400 900' }],
  ['Fraunces', 'fraunces.ttf', { weight: '100 900' }],
];

async function fonts() {
  const faces = [
    new FontFace('M', 'url(fonts/montserrat-latin.woff2)', { weight: '100 900', unicodeRange: LATIN }),
    new FontFace('M', 'url(fonts/montserrat-latin-ext.woff2)', { weight: '100 900', unicodeRange: LATIN_EXT }),
    new FontFace('X', 'url(fonts/plexmono-400-latin.woff2)', { weight: '400', unicodeRange: LATIN }),
    new FontFace('X', 'url(fonts/plexmono-400-latin-ext.woff2)', { weight: '400', unicodeRange: LATIN_EXT }),
    new FontFace('X', 'url(fonts/plexmono-500-latin.woff2)', { weight: '500 700', unicodeRange: LATIN }),
    new FontFace('X', 'url(fonts/plexmono-500-latin-ext.woff2)', { weight: '500 700', unicodeRange: LATIN_EXT }),
    ...FAMILIES.map(([name, file, d]) => new FontFace(name, `url(fonts/${file})`, d)),
  ];
  for (const f of faces) { await f.load(); document.fonts.add(f); }
  const names = ['M', 'X', ...new Set(FAMILIES.map(([n]) => n))];
  await Promise.all(names.flatMap((n) => ['900', '700', '500'].map((w) => document.fonts.load(`${w} 40px ${n}`, 'ĞÜŞİÖÇğüşıöç'))));
}

function image(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image failed: ' + src));
    img.src = src;
  });
}

/** `key` is "<ISO3 or org>/<kind>", e.g. "RUS/arms-eagle", "nato/emblem"; see assets/emblems/manifest.json. */
export async function loadAssets(emblemKeys: string[]): Promise<Assets> {
  const [topo, disputed, manifest, countryTable] = await Promise.all([
    fetch('data/countries-50m.json').then((r) => r.json()),
    fetch('data/disputed-tur-view.geojson').then((r) => r.json()),
    fetch('emblems/manifest.json').then((r) => r.json()),
    fetch('data/countries.json').then((r) => r.json()) as Promise<CountryRow[]>,
    fonts(),
  ]);
  const bound = <T>(shape: T, pts: Position[]): Culled<T> => {
    const center = geoCentroid(shape as never) as [number, number];
    let radius = 0;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 400))) radius = Math.max(radius, geoDistance(center, pts[i] as [number, number]));
    return { shape, center, radius: radius + 0.02 };
  };
  const flat = (g: any): Position[] => (typeof g[0] === 'number' ? [g] : g.flatMap(flat));
  const countries = (feature(topo, topo.objects.countries) as unknown as FeatureCollection).features
    .map((f) => bound(f, f.geometry ? flat((f.geometry as any).coordinates) : []));
  const mls = mesh(topo, topo.objects.countries, (a, b) => a !== b) as MultiLineString;
  const borders = mls.coordinates.map((c) => bound<LineString>({ type: 'LineString', coordinates: c }, c));
  const coastLines = mesh(topo, topo.objects.countries, (a, b) => a === b) as MultiLineString;
  const emblems = new Map<string, HTMLImageElement>();
  for (const key of emblemKeys) {
    const [who, kind] = key.split('/');
    const it = manifest.items[who]?.[kind];
    if (!it) throw new Error(`no emblem ${key} in the manifest`);
    emblems.set(key, await image('emblems/' + it.file));
  }
  const relief = await image('data/relief.png').catch(() => null); // optional: the map renders without it
  const mark = await image('brand/mark.png').catch(() => null);
  return { countries, borders, borderLines: mls, coastLines, disputed, emblems, relief, countryTable, nums: new Map(countryTable.map((c) => [c.iso3, c.num])), mark };
}
