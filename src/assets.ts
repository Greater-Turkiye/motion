import { geoCentroid, geoDistance } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, LineString, MultiLineString, Position } from 'geojson';

/** Everything a frame needs, loaded once before the first frame is drawn. */
/** A shape with a bounding circle on the sphere, so a frame can skip what faces away from it. */
export interface Culled<T> { shape: T; center: [number, number]; radius: number }

export interface Assets {
  countries: Culled<Feature>[];
  borders: Culled<LineString>[];
  disputed: FeatureCollection;
  emblems: Map<string, HTMLImageElement>;
}

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20C0';

async function fonts() {
  const faces = [
    new FontFace('M', 'url(fonts/montserrat-latin.woff2)', { weight: '100 900', unicodeRange: LATIN }),
    new FontFace('M', 'url(fonts/montserrat-latin-ext.woff2)', { weight: '100 900', unicodeRange: LATIN_EXT }),
    new FontFace('X', 'url(fonts/plexmono-400-latin.woff2)', { weight: '400', unicodeRange: LATIN }),
    new FontFace('X', 'url(fonts/plexmono-400-latin-ext.woff2)', { weight: '400', unicodeRange: LATIN_EXT }),
    new FontFace('X', 'url(fonts/plexmono-500-latin.woff2)', { weight: '500 700', unicodeRange: LATIN }),
    new FontFace('X', 'url(fonts/plexmono-500-latin-ext.woff2)', { weight: '500 700', unicodeRange: LATIN_EXT }),
  ];
  for (const f of faces) document.fonts.add(await f.load());
  // a Turkish sample in every weight used, so no glyph is fetched in the middle of an export
  await Promise.all(['900 40px M', '800 40px M', '600 40px M', '500 40px M', '700 20px X', '500 20px X'].map((f) => document.fonts.load(f, 'ĞÜŞİÖÇğüşıöç')));
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
  const [topo, disputed, manifest] = await Promise.all([
    fetch('data/countries-50m.json').then((r) => r.json()),
    fetch('data/disputed-tur-view.geojson').then((r) => r.json()),
    fetch('emblems/manifest.json').then((r) => r.json()),
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
  const emblems = new Map<string, HTMLImageElement>();
  for (const key of emblemKeys) {
    const [who, kind] = key.split('/');
    const it = manifest.items[who]?.[kind];
    if (!it) throw new Error(`no emblem ${key} in the manifest`);
    emblems.set(key, await image('emblems/' + it.file));
  }
  return { countries, borders, disputed, emblems };
}
