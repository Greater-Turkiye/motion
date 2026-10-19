import assert from 'node:assert/strict';
import test from 'node:test';
import { captions, enCaptions } from './captions.mjs';

const enScene = {
  lang: 'en', voice: 'synthetic',
  hook: { kicker: 'BLACK SEA · 23 SEPTEMBER', lines: ['CAPTAIN', 'KILLED'], sub: 'A cargo ship came under attack.', status: 'UNVERIFIED', source: 'SOURCE: UKRINFORM' },
  subject: { label: 'RUSSIAN FEDERATION' }, parties: [],
  beats: [
    { kind: 'place', title: 'BLACK SEA' },
    { kind: 'status', text: 'Single source: Ukrinform.' },
    { kind: 'distance', from: { at: [30.73, 46.48], label: 'ODESA' }, to: { at: [29.05, 41.2], label: 'BOSPHORUS' } },
  ],
};
const meta = { title: 'ignored Turkish title', status: 'DOĞRULANMADI', date: '2026-09-23', sources: ['https://example.test/x'] };

test('captions() routes an English scene to the English builder', () => {
  assert.equal(captions(enScene, meta), enCaptions(enScene, meta));
});

test('the English YouTube block uses English markers and words', () => {
  const text = enCaptions(enScene, meta);
  const yt = text.split('=== YOUTUBE SHORTS ===')[1].split('=== X ===')[0];
  assert.match(yt, /^\s*Title: /m);
  assert.match(yt, /\nDescription:\n/);
  assert.match(yt, /Status: Unverified/);        // Turkish record status mapped to English
  assert.match(yt, /Source: Ukrinform/);
  assert.match(yt, /Black Sea, September 23\./);  // place/date in English, not "Black SEA"
  assert.match(yt, /km from Türkiye/);
  assert.match(yt, /#BlackSea/);
  assert.doesNotMatch(yt, /Başlık|Açıklama|Durum|Kaynak/);
});

test('synthetic voice is disclosed in English', () => {
  assert.match(enCaptions(enScene, meta), /Voice-over: synthetic\./);
});

test('the English title is the source’s own English headline when the record keeps one', () => {
  const text = enCaptions({ ...enScene, hook: { ...enScene.hook, sub: '', lines: ['50 BILLION $', 'PLANS TO REQUEST'] } },
    { ...meta, title_en: 'Pentagon plans to ask Congress for $50 billion to mass-produce drones' });
  assert.match(text, /^Title: Pentagon plans to ask Congress for \$50 billion to mass-produce drones/m);
  assert.doesNotMatch(text, /PLANS TO REQUEST/);
});
