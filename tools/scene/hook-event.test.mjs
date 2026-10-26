import assert from 'node:assert/strict';
import test from 'node:test';
import { generate } from './generate.mjs';

// A located strike whose headline leads with a casualty. The hook must be the event (where + what),
// not the death or injury toll — people are hurt every day; the distinctive fact is the strike.
const casualtyStrike = () => ({
  id: 'evt_test_casualty', schema: 'event/1', event_type: 'kinetic.attack',
  title: { tr: "Rus güçleri Odesa'daki iş merkezine saldırdı, bir kişi yaralandı", en: 'Russian forces attack a business centre in Odesa, one injured' },
  time: { start: '2026-10-01T00:00Z', precision: 'day', basis: 'reported' },
  reported_at: '2026-10-01T03:24Z',
  location: { geometry: { type: 'Point', coordinates: [30.73, 46.48] }, precision: 'locality', place_name: { tr: 'Odesa', en: 'Odessa' } },
  regions: ['black-sea'],
  sources: [{ url: 'https://ukrinform.net/story/1', title: 'x', published_at: '2026-10-01T03:24Z', lang: 'en' }],
  assessment: { status: 'unverified', credibility: 6 },
});

test('a casualty headline does not become the hook; the event does', () => {
  const sc = generate(casualtyStrike(), {});
  const [l0, l1] = sc.hook.lines;
  // the big lines are not the death/injury toll
  assert.ok(!/ÖLDÜ|YARALANDI/u.test(l1 ?? ''), `the hook must not be the casualty: ${sc.hook.lines.join(' / ')}`);
  assert.ok(!/^(BİR|İKİ|ÜÇ|\d+)\s+(KİŞİ|ASKER|SİVİL|ÇOCUK)$/u.test(l0 ?? ''), `the first line must not be a victim count: ${l0}`);
  // it names the place and the event: the record's own clause when it is short ("RUS GÜÇLERİ ODESA'DAKİ /
  // İŞ MERKEZİNE SALDIRDI"), else the place over the event type ("ODESA / SALDIRI")
  assert.match(`${l0} ${l1}`, /ODESA/u);
  assert.match(`${l0} ${l1}`, /SALDIR|OLAY/u);
});

test('a clause-form death ("captain killed") is also rerouted to the event', () => {
  const r = casualtyStrike();
  r.id = 'evt_test_clause';
  r.title = { tr: "Rus saldırısında geminin kaptanı öldürüldü", en: 'Ship captain killed in Russian attack' };
  const sc = generate(r, {});
  assert.ok(!/(ÖLDÜ|ÖLDÜR)/u.test(sc.hook.lines.join(' ')), `a clause death must not be the hook: ${sc.hook.lines.join(' / ')}`);
  assert.match(sc.hook.lines[1] ?? '', /SALDIRI|OLAY/u);
});
