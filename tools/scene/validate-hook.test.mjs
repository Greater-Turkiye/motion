import assert from 'node:assert/strict';
import test from 'node:test';
import { validate } from '../../src/engine/scene.ts';

// A minimal legible scene the validator accepts, used as the base for the hook-lines checks.
const base = () => ({
  id: 'x', format: 'vertical', fps: 60, duration: 12, style: 'A',
  source_text: ['Cargo ship attacked in the Black Sea, captain killed'],
  camera: { from: { center: [33, 43], zoom: 0.9 }, to: { center: [33, 43], zoom: 1 }, seconds: 3, ease: 'outCubic',
    keys: [{ t: 0, center: [33, 43], zoom: 0.9 }, { t: 3, center: [33, 43], zoom: 1 }, { t: 12, center: [33, 43], zoom: 0.9 }] },
  labels: [],
  hook: { kicker: 'KARADENİZ · 23 EYLÜL', lines: ['KAPTAN', 'ÖLDÜ'], sub: 'Yük gemisine saldırıldı.', status: 'DOĞRULANMADI', source: 'KAYNAK: UKRINFORM' },
  beats: [{ kind: 'close', at: 3, kicker: 'KAYITLARIMIZDA · EYLÜL', lines: ['Karadeniz’den 267 kayıt:', 'en yoğun bölge.'] }],
});

test('a two-line hook is accepted', () => {
  assert.equal(validate(base()).filter((p) => /at most two lines/.test(p)).length, 0);
});

test('a three-line hook is rejected (owner: max two lines)', () => {
  const s = base();
  s.hook.lines = ['KAPTAN', 'YARALANDI', 'ÖLDÜ'];
  assert.ok(validate(s).some((p) => /at most two lines/.test(p)));
});
