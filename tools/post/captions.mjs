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
import { geoDistance } from 'd3-geo';
import { sceneFile } from '../../export/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Turkish lower case for a Turkish word, the plain one for a Latin name: "UKRINFORM" is "Ukrinform",
 *  not "Ukrınform"; an acronym stays as it is. */
const ACRONYM = new Set(['ABD', 'AB', 'BM', 'GKRY', 'NATO', 'UN', 'İHA']);
const lowerWord = (w) => (ACRONYM.has(w) ? w : /[İŞĞÜÖÇ]/u.test(w) ? w.toLocaleLowerCase('tr') : w.toLowerCase());
const lower = (s) => s.split(' ').map(lowerWord).join(' ');
/** "DNİPRO BÖLGESİ" → "Dnipro Bölgesi": a label in capitals written as a name. */
const name = (s) => lower(s).replace(/(^|[\s-])(\p{Ll})/gu, (_, a, c) => a + c.toLocaleUpperCase('tr'));
/** A map label or a date is Turkish, written in Turkish capitals ("MISIR", "30 EYLÜL"): Turkish lower
 *  case, so "MISIR" is "Mısır" (not "Misir") and a month keeps its capital ("30 Eylül"). */
const trName = (s) => s.split(' ').map((w) => (ACRONYM.has(w) ? w : w.toLocaleLowerCase('tr')))
  .join(' ').replace(/(^|[\s-])(\p{Ll})/gu, (_, a, c) => a + c.toLocaleUpperCase('tr'));
/** A hashtag from a name: one word, no apostrophe or hyphen, "#DniproBölgesi". */
const tag = (s) => '#' + trName(s).replace(/['’\s-]+/gu, '');
const STATUS = {
  'DOĞRULANMADI': 'Doğrulanmadı',
  'KISMEN DOĞRULANDI': 'Kısmen doğrulandı',
  'DOĞRULANDI': 'Doğrulandı',
  'TARTIŞMALI': 'Tartışmalı',
};

const EN_STATUS = {
  'DOĞRULANMADI': 'Unverified', 'KISMEN DOĞRULANDI': 'Partly verified', 'DOĞRULANDI': 'Verified', 'TARTIŞMALI': 'Disputed',
};
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A hashtag from a name, in plain Latin casing for the English channel: "#BlackSea". */
const enTag = (s) => '#' + s.split(/[\s-]+/u).map((w) => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join('').replace(/['’]/gu, '');

/** The English channel (@Conflict-Grid): the same record, its words already translated on the scene
 *  (tools/scene/translate.mjs), said plainly in English. Same rules as the Turkish text — the record's
 *  own facts, status and source, no teaser, no emoji (CLAUDE.md section 4). */
export function enCaptions(sc, meta) {
  const cap = (s) => (s ? s[0].toLocaleUpperCase('en-US') + s.slice(1) : s);
  // the source's own English headline when the record keeps one (most feeds are English): the hook's
  // label ("50 BILLION $ PLANS TO REQUEST") read as a shouted fragment and the channel's titles drew no clicks
  const own = (meta.title_en ?? '').replace(/\s+/g, ' ').trim();
  const launch = meta.variant === 'launch';
  const headline = cap(own || (sc.hook.sub || sc.hook.lines.join(' ')).replace(/\s+/g, ' ').trim()).replace(/[.!]?$/, '.');
  const [kickPlace, kickDate] = sc.hook.kicker.includes(' · ') ? sc.hook.kicker.split(' · ') : ['', sc.hook.kicker];
  const place = (sc.beats ?? []).find((b) => b.kind === 'place')?.title ?? kickPlace;
  const EN_ACR = new Set(['UN', 'EU', 'UK', 'US', 'USA', 'NATO', 'UAV', 'ABD', 'BM', 'UAE']);
  const name = (s) => s.split(/[\s-]+/u).map((w) => (EN_ACR.has(w) ? w : w ? w[0] + w.slice(1).toLocaleLowerCase('en-US') : w)).join(' ');
  const day = /^\d{4}-\d{2}-\d{2}/.test(meta.date ?? '') ? `${EN_MONTHS[Number(meta.date.slice(5, 7)) - 1]} ${Number(meta.date.slice(8, 10))}` : '';
  const when = day || (/\d/.test(kickDate) && !/KM$/u.test(kickDate) ? name(kickDate) : '');
  const where = [place && name(place), when].filter(Boolean).join(', ');
  const statusBeat = (sc.beats ?? []).find((b) => b.kind === 'status')?.text ?? '';
  const statusWord = EN_STATUS[meta.status] ?? cap(sc.hook.status.toLocaleLowerCase('en-US'));
  const status = `${statusWord}${statusBeat ? ` · ${statusBeat}` : ''}`;
  const publisher = sc.hook.source.replace(/^[^:]*:\s*/, '');
  const url = meta.sources[0];
  const sourceLine = `Source: ${name(publisher)} (${url})`;
  const tags = [...new Set([place, ...(sc.parties ?? []).map((p) => p.label), ...(sc.subject?.label ? [sc.subject.label] : [])]
    .filter((x) => x && x !== 'TÜRKİYE').map(enTag)), ...(launch ? ['#Space', '#RocketLaunch'] : meta.variant === 'quake' ? ['#Earthquake'] : ['#OSINT']), '#GreaterTurkiye'];
  const note = meta.variant === 'quake'
    ? 'Made from the USGS earthquake feed (public domain). Magnitude, place and depth are the USGS solution and may be revised.'
    : launch
    ? 'Made from Launch Library 2 (The Space Devs) data. The orbit drawn is typical for its type, not the mission’s own elements.'
    : 'Compiled from a record in the Greater Türkiye dataset; the facts on screen are the source’s own report.';
  // the pictures are drawn by code, not generated (owner, 2026-10-26: no AI label on them)
  const voiceLine = 'Animation: drawn in code by Greater Türkiye motion.';
  const photoLine = (sc.beats ?? []).filter((b) => b.kind === 'photo').map((b) => `${b.credit}.`).join(' ');
  const satellite = (sc.beats ?? []).some((b) => b.kind === 'satellite') ? 'Satellite data: NASA FIRMS (VIIRS, NOAA-20), public domain. A heat detection is not a confirmed event.' : '';

  const dist = (sc.beats ?? []).find((b) => b.kind === 'distance');
  const far = dist ? ` | ~${Math.round((geoDistance(dist.from.at, dist.to.at) * 6371) / 10) * 10} km from Türkiye` : '';
  const base = headline.replace(/\.$/, '');
  const ytTitle = (base.length + far.length <= 92 ? base + far
    : headline.length <= 92 ? base : headline.slice(0, 89).replace(/\s+\S*$/, '') + '…') + ' #Shorts';

  const instagram = [headline, '', where ? `${where}.` : '', `Status: ${status}`, sourceLine, satellite, voiceLine, photoLine, '', note, '', tags.join(' ')]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const youtube = [`Title: ${ytTitle}`, '', 'Description:', headline, where ? `${where}.` : '', '', `Status: ${status}`, sourceLine, satellite, voiceLine, photoLine, '', note, 'Data and content CC BY 4.0, Greater Türkiye.', '', tags.join(' ')]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const tail = ` (${statusWord}) Source: `;
  const room = 280 - tail.length - 23 - 2;
  const xHead = headline.length <= room ? headline.replace(/\.$/, '') : headline.slice(0, room - 1).replace(/\s+\S*$/, '') + '…';
  const x = `${xHead}${tail}${url}`;

  const checklist = [
    '=== WHEN POSTING (this section is not posted) ===',
    '- To add trending music, use the music-free copy (-muziksiz.mp4, if present) and add music from the app’s own library.',
    '',
  ];
  return [...checklist, '=== INSTAGRAM (Reels and carousel) ===', instagram, '', '=== YOUTUBE SHORTS ===', youtube, '', '=== X ===', x, ''].join('\n');
}

export function captions(sc, meta) {
  if (sc.lang === 'en') return enCaptions(sc, meta);
  // the weekly digest's headline is its hook ("BU HAFTA KARADENİZ'DEN / 227 KAYIT DERLENDİ"), not a record's
  const digest = sc.template === 'digest';
  const week = digest && sc.hook.lines[0].match(/^BU HAFTA (.+)$/u);
  const headline = week ? `Bu hafta ${name(week[1])} ${sc.hook.lines.slice(1).join(' ').toLocaleLowerCase('tr')}.`
    : meta.title.replace(/\s+/g, ' ').trim().replace(/[.!]?$/, '.');
  const [kickPlace, kickDate] = sc.hook.kicker.includes(' · ') ? sc.hook.kicker.split(' · ') : ['', sc.hook.kicker];
  // the place: the video's own "NEREDE" block, else the kicker's; a story without a place has none
  const place = (sc.beats ?? []).find((b) => b.kind === 'place')?.title ?? kickPlace;
  // the date from the record, not from the kicker: the proximity variant's kicker is "TÜRKİYE'YE ~150 KM",
  // which read "Kıbrıs, Türkiye'ye ~150 Km." (a digest's kicker is its week, said as it is)
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const day = /^\d{4}-\d{2}-\d{2}/.test(meta.date ?? '') ? `${Number(meta.date.slice(8, 10))} ${MONTHS[Number(meta.date.slice(5, 7)) - 1]}` : '';
  const when = digest ? kickDate && trName(kickDate) : day || (/\d/.test(kickDate) && !/KM$/u.test(kickDate) ? trName(kickDate) : '');
  const where = [place && trName(place), when].filter(Boolean).join(', ');
  const statusBeat = (sc.beats ?? []).find((b) => b.kind === 'status')?.text ?? '';
  const status = `${STATUS[meta.status] ?? meta.status}${statusBeat ? ` · ${statusBeat}` : ''}`;
  const publisher = sc.hook.source.replace(/^KAYNAK:\s*/, '').replace(/^(\d+) YAYIN ORGANI$/u, '$1 yayın organı');
  const url = meta.sources[0];
  // a digest has many sources: up to three links, the rest in the release
  const sourceLine = digest ? `Kaynaklar (${publisher}): ${meta.sources.slice(0, 3).join(' ')}` : `Kaynak: ${name(publisher)} (${url})`;
  const tags = [...new Set([place, ...(sc.parties ?? []).map((p) => p.label), ...(sc.subject?.label ? [sc.subject.label] : [])]
    .filter((x) => x && x !== 'TÜRKİYE').map(tag)), ...(meta.variant === 'quake' ? ['#deprem', '#sondakika'] : ['#OSINT', '#GreaterTürkiye'])];
  // an earthquake comes from Kandilli's list, not from the dataset, and its wave arrivals are a model's
  const note = meta.variant === 'quake'
    ? 'Kandilli Rasathanesi\'nin kaydından hazırlandı. Büyüklük ve yer Kandilli\'nin çözümüdür, güncellenebilir. Dalga varış süreleri IASP91 modeliyle hesaplanmış tahminlerdir; depremin hissedildiği anlamına gelmez.'
    : 'Greater Türkiye veri setindeki kayıttan derlendi; ekrandaki olgular kaynağın kendi haberindendir.';
  // the satellite block's data, credited where the source is (PLAN.md section 25)
  // the pictures are drawn by code, not generated (owner, 2026-10-26: no AI label on them)
  const voiceLine = 'Animasyon: Greater Türkiye motion yazılımıyla kodla çizildi.';
  const photoLine = (sc.beats ?? []).filter((b) => b.kind === 'photo').map((b) => `${b.credit}.`).join(' ');
  const satellite = (sc.beats ?? []).some((b) => b.kind === 'satellite') ? 'Uydu verisi: NASA FIRMS (VIIRS, NOAA-20), kamu malı. Isı tespiti yangın olduğu doğrulanmış bir olay değildir.' : '';

  const instagram = [
    headline,
    '',
    where ? `${where}.` : '',
    `Durum: ${status}`,
    sourceLine,
    satellite,
    voiceLine,
    photoLine,
    '',
    note,
    '',
    tags.join(' '),
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  // YouTube: a title of at most 100 characters, the headline when it fits, then the place
  // and how far from Türkiye, as the cover says it, when the title has room: the one line no other
  // channel's title carries (PLAN.md section 33)
  const dist = (sc.beats ?? []).find((b) => b.kind === 'distance');
  const far = dist ? ` | Türkiye'ye ~${Math.round((geoDistance(dist.from.at, dist.to.at) * 6371) / 10) * 10} km` : '';
  const base = headline.replace(/\.$/, '');
  // the copy editor's short title when it wrote one: the source's long headline was cut mid-quote
  const ytTitle = sc.post_title ? `${sc.post_title.replace(/[.!]$/, '')} #Shorts`
    : (base.length + far.length <= 92 ? base + far
    : headline.length <= 92 ? base : headline.slice(0, 89).replace(/\s+\S*$/, '') + '…') + ' #Shorts';
  const youtube = [
    `Başlık: ${ytTitle}`,
    '',
    'Açıklama:',
    headline,
    where ? `${where}.` : '',
    '',
    `Durum: ${status}`,
    sourceLine,
    satellite,
    voiceLine,
    photoLine,
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

  // for whoever posts, not for the post: the copy to use for trending music (PLAN.md sections 27 and 28)
  const checklist = [
    '=== PAYLAŞIRKEN (bu bölüm paylaşılmaz) ===',
    '- Trend müzik eklemek için müziksiz kopyayı kullan (-muziksiz.mp4, varsa); müziği uygulamanın kendi kütüphanesinden ekle.',
    '',
  ];

  return [
    ...checklist,
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
