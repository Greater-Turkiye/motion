import assert from 'node:assert/strict';
import test from 'node:test';
import { validate } from '../../src/engine/scene.ts';
import { locative, parseKandilli, regionOf, sceneEarth, sceneTr } from './quake.mjs';

// two lines of Kandilli's lst0.asp table as it prints them (ASCII place names, Türkiye time)
const LIST = `2026.10.24 20:29:18  39.4393   36.6538        5.0      -.-  3.2  3.1   HANLI-(SIVAS)                                     İlksel
2026.10.24 12:41:27  36.0005   27.1497        5.6      -.-  3.4  3.2   EGE DENIZI                                        İlksel`;

test('Kandilli lines parse to time, place, depth and the largest magnitude', () => {
  const [q, sea] = parseKandilli(LIST);
  assert.equal(q.id, '20261024202918');
  assert.deepEqual(q.at, [36.6538, 39.4393]);
  assert.equal(q.depth, 5);
  assert.equal(q.mag, 3.2);
  assert.equal(regionOf(q.place).name, 'SİVAS');
  assert.equal(regionOf(sea.place).name, 'EGE DENİZİ');
});

test('the locative follows vowel harmony, consonant voicing and the possessive n', () => {
  assert.equal(locative('SİVAS'), "Sivas'ta");
  assert.equal(locative('MANİSA'), "Manisa'da");
  assert.equal(locative('İZMİR'), "İzmir'de");
  assert.equal(locative('EGE DENİZİ'), "Ege Denizi'nde");
  assert.equal(locative('AKDENİZ'), "Akdeniz'de");
});

test('a Türkiye scene with model arrivals has a waves block and passes the scene check', () => {
  const list = parseKandilli(LIST);
  const arrivals = { model: 'IASP91', curve: [[0, 0.9, 1.5], [100, 16, 28], [400, 57, 101]],
    provinces: [{ name: 'SİVAS', at: [37.02, 39.75], km: 47, p_s: 8.1, s_s: 14 }, { name: 'ANKARA', at: [32.85, 39.93], km: 330, p_s: 47.7, s_s: 84.7 }] };
  const { scene, narration } = sceneTr(list[0], list, arrivals);
  const waves = scene.beats.find((b) => b.kind === 'waves');
  assert.ok(waves);
  assert.match(waves.note, /IASP91 modeli · \d+ kat hızlı/);
  assert.ok(waves.places.find((p) => p.name === 'ANKARA').show);
  assert.deepEqual(validate(scene), []);
  assert.match(narration.segments[1].text, /^Model hesabına göre/);
});

test('a USGS feature becomes an English scene that passes the scene check', () => {
  const f = { id: 'us7000abcd', geometry: { coordinates: [139.9, 28, 473] },
    properties: { mag: 7.0, place: 'Bonin Islands, Japan region', time: Date.parse('2026-10-24T02:09:00Z'), status: 'automatic', tsunami: 0, felt: null, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd' } };
  const { scene } = sceneEarth(f);
  assert.equal(scene.lang, 'en');
  assert.deepEqual(scene.hook.lines, ['MAGNITUDE 7.0', 'EARTHQUAKE']);
  assert.deepEqual(validate(scene), []);
});
