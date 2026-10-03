// The words that go with a video when it is posted: an Instagram caption, a YouTube Shorts title and
// description, and an X post, in one text file next to the MP4 and the carousel slides.
//
//   node tools/post/captions.mjs <scene id> <meta.json> <out dir>
//
// Everything in it is the record's own: its headline (the source's, machine-translated), its place and
// date, its verification status said plainly, and the source with its link. No question, no teaser,
// no emoji, no call to follow (CLAUDE.md section 4). Hashtags are only names already in the video: the
// place, the countries it names, and our own tag. Writes <out dir>/<scene id>-paylasim.txt.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { sceneFile } from '../../export/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Turkish lower case for a Turkish word, the plain one for a Latin name: "UKRINFORM" is "Ukrinform",
 *  not "Ukrınform"; an acronym stays as it is. */
const ACRONYM = new Set(['ABD', 'AB', 'BM', 'GKRY', 'NATO', 'UN', 'İHA']);
const lowerWord = (w) => (ACRONYM.has(w) ? w : /[İŞĞÜÖÇ]/u.test(w) ? w.toLocaleLowerCase('tr') : w.toLowerCase());
const lower = (s) => s.split(' ').map(lowerWord).join(' ');
/** "DNİPRO BÖLGESİ" → "Dnipro Bölgesi": a label in capitals written as a name. */
const name = (s) => lower(s).replace(/(^|[\s-])(\p{Ll})/gu, (_, a, c) => a + c.toLocaleUpperCase('tr'));
/** A hashtag from a name: one word, no apostrophe or hyphen, "#DniproBölgesi". */
const tag = (s) => '#' + name(s).replace(/['’\s-]+/gu, '');
const STATUS = {
  'DOĞRULANMADI': 'Doğrulanmadı',
  'KISMEN DOĞRULANDI': 'Kısmen doğrulandı',
  'DOĞRULANDI': 'Doğrulandı',
  'TARTIŞMALI': 'Tartışmalı',
};

export function captions(sc, meta) {
  // the weekly digest's headline is its hook ("BU HAFTA KARADENİZ'DEN / 227 KAYIT DERLENDİ"), not a record's
  const digest = sc.template === 'digest';
  const week = digest && sc.hook.lines[0].match(/^BU HAFTA (.+)$/u);
  const headline = week ? `Bu hafta ${name(week[1])} ${sc.hook.lines.slice(1).join(' ').toLocaleLowerCase('tr')}.`
    : meta.title.replace(/\s+/g, ' ').trim().replace(/[.!]?$/, '.');
  const [kickPlace, kickDate] = sc.hook.kicker.includes(' · ') ? sc.hook.kicker.split(' · ') : ['', sc.hook.kicker];
  // the place: the video's own "NEREDE" block, else the kicker's; a story without a place has none
  const place = (sc.beats ?? []).find((b) => b.kind === 'place')?.title ?? kickPlace;
  const where = [place && name(place), kickDate && lower(kickDate)].filter(Boolean).join(', ');
  const statusBeat = (sc.beats ?? []).find((b) => b.kind === 'status')?.text ?? '';
  const status = `${STATUS[meta.status] ?? meta.status}${statusBeat ? ` · ${statusBeat}` : ''}`;
  const publisher = sc.hook.source.replace(/^KAYNAK:\s*/, '').replace(/^(\d+) YAYIN ORGANI$/u, '$1 yayın organı');
  const url = meta.sources[0];
  // a digest has many sources: up to three links, the rest in the release
  const sourceLine = digest ? `Kaynaklar (${publisher}): ${meta.sources.slice(0, 3).join(' ')}` : `Kaynak: ${name(publisher)} (${url})`;
  const tags = [...new Set([place, ...(sc.parties ?? []).map((p) => p.label), ...(sc.subject?.label ? [sc.subject.label] : [])]
    .filter((x) => x && x !== 'TÜRKİYE').map(tag)), '#OSINT', '#GreaterTürkiye'];
  const note = 'Greater Türkiye veri setindeki kayıttan otomatik üretildi; ekrandaki olgular kaynağın kendi başlığıdır, kimse okumadan yayımlandı.';

  const instagram = [
    headline,
    '',
    where ? `${where}.` : '',
    `Durum: ${status}`,
    sourceLine,
    '',
    note,
    '',
    tags.join(' '),
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  // YouTube: a title of at most 100 characters, the headline when it fits, then the place
  const ytTitle = (headline.length <= 92 ? headline.replace(/\.$/, '') : headline.slice(0, 89).replace(/\s+\S*$/, '') + '…') + ' #Shorts';
  const youtube = [
    `Başlık: ${ytTitle}`,
    '',
    'Açıklama:',
    headline,
    where ? `${where}.` : '',
    '',
    `Durum: ${status}`,
    sourceLine,
    '',
    note,
    'Veri ve içerik CC BY 4.0, Greater Türkiye.',
    '',
    tags.join(' '),
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  // X: a link counts 23 characters whatever its length; the headline is cut at a word if it must be
  const tail = ` (${STATUS[meta.status] ?? meta.status}) Kaynak: `;
  const room = 280 - tail.length - 23 - 2;
  const xHead = headline.length <= room ? headline.replace(/\.$/, '') : headline.slice(0, room - 1).replace(/\s+\S*$/, '') + '…';
  const x = `${xHead}${tail}${url}`;

  return [
    '=== INSTAGRAM (Reels ve kaydırmalı gönderi) ===',
    instagram,
    '',
    '=== YOUTUBE SHORTS ===',
    youtube,
    '',
    '=== X ===',
    x,
    '',
  ].join('\n');
}

if (process.argv[1]?.endsWith('captions.mjs')) {
  const [id, metaFile, out] = process.argv.slice(2);
  const sc = parse(sceneFile(ROOT, id));
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  mkdirSync(out, { recursive: true });
  const file = path.join(out, `${id}-paylasim.txt`);
  writeFileSync(file, captions(sc, meta));
  console.log(file);
}
