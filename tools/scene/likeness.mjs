// A distance said beside one the viewer knows, and a name with its Turkish dative suffix.
//
// "~600 km" alone is a number; "Ankara ile Trabzon arası kadar" is a distance a Turkish viewer has a
// feel for (numbers put beside something familiar are understood and remembered better: Barrio et al.,
// CHI 2016). The pairs are measured here from their own coordinates, as the crow flies, like ours.
import { geoDistance } from 'd3-geo';

const CITY = {
  İstanbul: [28.98, 41.01], Ankara: [32.85, 39.93], İzmir: [27.14, 38.42], Antalya: [30.71, 36.9],
  Trabzon: [39.72, 41.0], Van: [43.38, 38.49], Edirne: [26.56, 41.68], Diyarbakır: [40.23, 37.91],
};
// the best-known pairs first: the first within 12 % is the one said
const PAIRS = [
  ['İstanbul', 'Ankara'], ['İstanbul', 'İzmir'], ['Ankara', 'İzmir'], ['İstanbul', 'Antalya'], ['Ankara', 'Trabzon'],
  ['Ankara', 'Diyarbakır'], ['İstanbul', 'Trabzon'], ['İzmir', 'Diyarbakır'], ['İstanbul', 'Van'], ['Edirne', 'Van'],
];
const crow = (a, b) => (geoDistance(CITY[a], CITY[b]) * 6371);

/** "Ankara ile Trabzon arası kadar", "İstanbul ile Ankara arasının iki katı", or null when nothing fits
 *  within 12 %: no comparison is forced. */
export function likeness(km) {
  if (!(km > 150)) return null;
  for (const [a, b] of PAIRS) {
    const r = km / crow(a, b);
    if (r > 0.88 && r < 1.12) return `${a} ile ${b} arası kadar`;
  }
  const base = crow('İstanbul', 'Ankara');
  for (const [n, word] of [[2, 'iki'], [3, 'üç'], [4, 'dört'], [5, 'beş']]) {
    const r = km / (base * n);
    if (r > 0.9 && r < 1.1) return `İstanbul ile Ankara arasının ${word} katı`;
  }
  return null;
}

const VOWEL = /[aeıioöuü]/u;
/** A name with its dative suffix: "Ukrinform'a", "ABD Altıncı Filo'ya", "Avrupa Komisyonu'na",
 *  "BBC'ye". An acronym is read letter by letter, so it takes the suffix of its last letter's name. */
export function dative(name) {
  const words = name.trim().split(/\s+/);
  const w = words.at(-1);
  if (/^[A-ZÇĞİÖŞÜ]{2,5}$/u.test(w)) return `${name}'${'AIKOU'.includes(w.at(-1)) ? 'ya' : 'ye'}`;
  const low = w.toLocaleLowerCase('tr');
  const last = [...low].reverse().find((c) => VOWEL.test(c)) ?? 'e';
  const back = 'aıou'.includes(last);
  const endsVowel = VOWEL.test(low.at(-1));
  // a compound name ending in its possessive ("Avrupa Komisyonu", "Savunma Bakanlığı") takes n
  const buffer = endsVowel ? (words.length > 1 && /[ıiuü]$/u.test(low) ? 'n' : 'y') : '';
  return `${name}'${buffer}${back ? 'a' : 'e'}`;
}
