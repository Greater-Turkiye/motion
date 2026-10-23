import assert from 'node:assert/strict';
import test from 'node:test';
import { validate } from '../../src/engine/scene.ts';
import { buildScene, orbitOf } from './launch.mjs';

// The shape Launch Library 2 2.3.0 returns in detailed mode, cut to the fields the generator reads.
const launch = (orbit, over = {}) => ({
  id: 'ef9850ad-1096-425b-9d27-f7bbd186e61a',
  name: 'Vulcan VC6L | Amazon Leo (LV-01)',
  net: '2026-10-29T00:00:00Z',
  url: 'https://ll.thespacedevs.com/2.3.0/launches/ef9850ad-1096-425b-9d27-f7bbd186e61a/',
  status: { name: 'Go for Launch', abbrev: 'Go' },
  launch_service_provider: { name: 'United Launch Alliance' },
  rocket: { configuration: { name: 'Vulcan VC6L', full_name: 'Vulcan VC6L' } },
  mission: { name: 'Amazon Leo (LV-01)', type: 'Communications', description: '45 satellites will be carried on each Vulcan launch.', orbit: { abbrev: orbit } },
  pad: { name: 'Space Launch Complex 41', latitude: 28.58, longitude: -80.58, country: { alpha_3_code: 'USA' }, location: { name: 'Cape Canaveral SFS, FL, USA' } },
  ...over,
});

test('every drawable orbit type gives a scene that passes the scene check', () => {
  for (const o of ['LEO', 'SSO', 'PO', 'MEO', 'GTO', 'GEO']) {
    const { scene, error } = buildScene(launch(o));
    assert.equal(error, undefined, o);
    assert.deepEqual(validate(scene), [], o);
    assert.ok(scene.beats.some((b) => b.kind === 'orbit'), o);
  }
});

test('an orbit Launch Library 2 does not name is not drawn', () => {
  assert.match(buildScene(launch('Sub')).error, /no drawable orbit/);
});

test('a launch due east reaches the pad latitude; the ISS orbit is the station\'s', () => {
  assert.equal(orbitOf(launch('LEO')).inclination, 28.6);
  assert.equal(orbitOf(launch('LEO', { name: 'Falcon 9 | Crew Dragon to ISS' })).inclination, 51.6);
});
