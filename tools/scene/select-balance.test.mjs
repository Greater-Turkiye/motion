import assert from 'node:assert/strict';
import test from 'node:test';
import { score } from './select.mjs';

// Two comparable records, one about Ukraine, one about Russia, scored the same instant.
const now = Date.parse('2026-10-14T12:00:00Z');
const rec = (id, country) => ({
  id, event_type: 'strike', reported_at: '2026-10-14T06:00:00Z',
  time: { start: '2026-10-14T06:00:00Z' },
  title: { en: 'Strike reported', tr: 'Saldırı bildirildi' },
  countries: [country], regions: ['black-sea'],
  assessment: { status: 'verified' },
  sources: [{ url: 'https://a.example/1' }, { url: 'https://b.example/2' }],
  location: { geometry: { type: 'Point', coordinates: [36, 46] } },
});

test('a run of same-side videos lowers the next same-side record below the other side', () => {
  const ukr = rec('u5', 'UKR');
  const rus = rec('r1', 'RUS');
  // the last four videos were all about Ukraine
  const recent = ['u1', 'u2', 'u3', 'u4'].map((id) => rec(id, 'UKR'));
  const sUkr = score(ukr, now, recent);
  const sRus = score(rus, now, recent);
  assert.ok(sRus > sUkr, `the other side should rise after a one-sided run (rus ${sRus.toFixed(1)} vs ukr ${sUkr.toFixed(1)})`);
});

test('with no recent run the two sides score equally', () => {
  const sUkr = score(rec('u', 'UKR'), now, []);
  const sRus = score(rec('r', 'RUS'), now, []);
  assert.ok(Math.abs(sUkr - sRus) < 1e-9);
});
