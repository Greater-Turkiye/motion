import assert from 'node:assert/strict';
import test from 'node:test';
import { validate } from '../../src/engine/scene.ts';
import { fitScale, refit } from './refit.mjs';

// An English scene at the Turkish timeline: the translated copy runs longer, so reading-speed fails.
const enScene = () => ({
  id: 'x-en', format: 'vertical', fps: 60, duration: 22, style: 'A', lang: 'en',
  source_text: [
    'Cargo ship attacked in Black Sea, captain killed',
    'According to Ukrinform, Russians attacked warehouses in Odesa and a cargo ship came under attack',
  ],
  camera: { from: { center: [26, 40.5], zoom: 0.92 }, to: { center: [33.5, 46], zoom: 1 }, seconds: 2.8, ease: 'outCubic',
    keys: [{ t: 0, center: [26, 40.5], zoom: 0.92 }, { t: 2.8, center: [33.5, 46], zoom: 1 }, { t: 22, center: [26, 40.5], zoom: 0.92 }] },
  labels: [],
  hook: { kicker: 'BLACK SEA · 23 SEPTEMBER', lines: ['CAPTAIN', 'KILLED'], sub: 'Cargo ship came under attack.', status: 'UNVERIFIED', source: 'SOURCE: UKRINFORM' },
  beats: [
    { kind: 'place', at: 2.8, title: 'BLACK SEA', text: 'No exact location: the ring shows the area.' },
    { kind: 'facts', at: 6.2, lines: ['According to Ukrinform, *Russians*', 'attacked warehouses in Odesa', 'and a *cargo ship*.'] },
    { kind: 'status', at: 14.4, text: 'Single source: Ukrinform. No independent confirmation.' },
    { kind: 'close', at: 17.4, kicker: 'IN OUR DATASET · SEPTEMBER', lines: ['267 records from the Black Sea:', 'the most active area.'] },
  ],
});

test('an untimed English scene fails reading speed', () => {
  assert.ok(validate(enScene()).some((p) => /needs .* s, it gets/.test(p)));
});

test('refit scales the timeline so every block is legible', () => {
  const s = enScene();
  const scale = fitScale(s);
  assert.ok(scale > 1, 'the English copy needs more time');
  refit(s);
  assert.deepEqual(validate(s), []);
  // order and camera path are preserved, only stretched
  assert.ok(s.beats.every((b, i) => i === 0 || b.at > s.beats[i - 1].at));
  assert.equal(s.camera.keys.at(-1).t, s.duration);
  assert.ok(s.duration > 22);
});

test('a scene that already fits is untouched', () => {
  const s = enScene();
  s.duration = 60; s.beats.forEach((b, i) => { b.at = 3 + i * 10; });
  s.camera.keys = [{ t: 0, center: [0, 0], zoom: 1 }, { t: 60, center: [0, 0], zoom: 1 }];
  const before = JSON.stringify(s);
  assert.equal(fitScale(s), 1);
  refit(s);
  assert.equal(JSON.stringify(s), before);
});

test('refit leaves no block a frame short after rounding to the frame', () => {
  // status lines of every length: rounding each end to the frame used to cost the tightest block a frame
  for (let n = 40; n <= 130; n++) {
    const s = enScene();
    s.beats[2].text = 'x'.repeat(n);
    s.source_text.push(s.beats[2].text);
    refit(s);
    assert.deepEqual(validate(s).filter((p) => /it gets/.test(p)), [], `status of ${n} characters`);
  }
});
