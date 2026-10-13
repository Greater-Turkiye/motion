import assert from 'node:assert/strict';
import test from 'node:test';
import { narration } from './narration.mjs';

// A weekly digest scene: the hook is the week's own count, and each facts beat is one of the week's
// records shown on screen. The owner's rule (2026-10-14): the voice reads each item exactly as the
// screen shows it, not a reworded or generic summary.
const digest = () => ({
  id: 'digest-black-sea-2026-10-13', template: 'digest', format: 'vertical', fps: 60, duration: 16, style: 'A',
  source_text: ['Odesa limanında depo vuruldu', 'Harkov’da enerji altyapısı hedef alındı', 'Greater Türkiye kayıtları'],
  camera: { from: { center: [34, 44], zoom: 1 }, to: { center: [34, 44], zoom: 1 }, seconds: 3, ease: 'outCubic',
    keys: [{ t: 0, center: [34, 44], zoom: 0.8 }, { t: 3, center: [34, 44], zoom: 1 }, { t: 16, center: [34, 44], zoom: 0.8 }] },
  labels: [],
  hook: { kicker: '7–13 Ekim', lines: ['BU HAFTA KARADENİZ’DEN', '5 KAYIT DERLENDİ'], sub: '', status: 'DOĞRULANMADI', source: 'KAYNAK: 4 YAYIN ORGANI' },
  beats: [
    { kind: 'facts', at: 4, kicker: '1 · Odesa · 7 Ekim', lines: ['Odesa limanında', '*3* *depo* vuruldu.'] },
    { kind: 'facts', at: 9, kicker: '2 · Harkov · 9 Ekim', lines: ['Harkov’da enerji', 'altyapısı hedef alındı.'] },
    { kind: 'status', at: 13, text: '4 ayrı yayın organı. Kayıtların hiçbiri bizim iddiamız değil, kaynağın haberi.' },
  ],
});

test('the digest voice reads each item exactly as the screen shows it', () => {
  const segs = narration(digest());
  const joined = segs.map((s) => s.text).join(' ').toLocaleLowerCase('tr');
  // the first item's own words are spoken, number spelled out ("3" -> "üç")
  assert.ok(/odesa liman/.test(joined), `Odesa item should be spoken: ${joined}`);
  assert.ok(/depo vuruldu/.test(joined), `the item's own words should be spoken: ${joined}`);
  // the second item too, not dropped or replaced by a generic phrase
  assert.ok(/harkov/.test(joined) && /altyapısı hedef/.test(joined), `Harkov item should be spoken: ${joined}`);
  // no generic placeholder stands in for an item
  assert.ok(!/bu haftaki gelişmeler|çeşitli olaylar|genel özet/.test(joined), `no generic summary phrase: ${joined}`);
});
