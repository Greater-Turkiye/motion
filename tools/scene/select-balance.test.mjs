import assert from 'node:assert/strict';
import test from 'node:test';
import { score } from './select.mjs';

// The pool is dominated by one source (Ukrinform). Two otherwise-comparable records, one from that
// dominant host and one from another outlet, scored the same instant.
const now = Date.parse('2026-10-14T12:00:00Z');
const rec = (id, host, type = 'kinetic.attack') => ({
  id, event_type: type, reported_at: '2026-10-14T06:00:00Z',
  time: { start: '2026-10-14T06:00:00Z' },
  title: { en: 'Attack reported', tr: 'Saldırı bildirildi' },
  regions: ['black-sea'],
  assessment: { status: 'verified' },
  sources: [{ url: `https://${host}/story/1` }, { url: 'https://other.example/2' }],
  location: { geometry: { type: 'Point', coordinates: [36, 46] } },
});

test('a run from one source lets another outlet rise above a fifth from the same source', () => {
  const ukrinform = rec('u5', 'ukrinform.net');
  const newsam = rec('n1', 'news.am', 'diplomatic.statement');
  // the last four videos were all Ukrinform war items
  const recent = ['u1', 'u2', 'u3', 'u4'].map((id) => rec(id, 'ukrinform.net'));
  const sUkr = score(ukrinform, now, recent);
  const sOther = score(newsam, now, recent);
  assert.ok(sOther > sUkr, `another outlet should rise after a one-source run (other ${sOther.toFixed(1)} vs same ${sUkr.toFixed(1)})`);
});

test('with no recent run the two sources score equally on host (type still counts)', () => {
  const sA = score(rec('a', 'ukrinform.net'), now, []);
  const sB = score(rec('b', 'news.am'), now, []);
  assert.ok(Math.abs(sA - sB) < 1e-9);
});
