// What the narrator says: one segment per block of the scene, from the words already on screen.
//
//   node tools/audio/narration.mjs <scene id or path> [out.json]
//
// Nothing is added that the screen does not show: the hook, the place, the facts, the distance, the
// status and the dataset's own count, turned into sentences a voice can read (numbers spelled out,
// capitals lowered so a model does not spell "KARADENİZ" letter by letter, "km" said as "kilometre").
// Each segment knows its window, from its block's start to the next block's; a segment whose words
// would not fit loses its optional parts first (tools/audio/voice.mjs places and fits the clips).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { sceneFile } from '../../export/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Characters a second the voice reads at (Chatterbox, Turkish, sped up 1.15 by the mixer): measured
 *  18 to 23 on the karadeniz-gemi sample, 20 with its full stops; the mixer speeds up a clip that
 *  still runs over, so the estimate may be a little optimistic. */
export const SPEECH_CPS = 19;

// ---- numbers -----------------------------------------------------------------------------------------
const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return [h === 0 ? '' : h === 1 ? 'yüz' : `${ONES[h]} yüz`, TENS[Math.floor(r / 10)], ONES[r % 10]].filter(Boolean).join(' ');
}
/** 1470 → "bin dört yüz yetmiş" (Turkish says "bin", never "bir bin"). */
export function sayNumber(n) {
  if (n === 0) return 'sıfır';
  const parts = [];
  for (const [unit, word] of [[1e9, 'milyar'], [1e6, 'milyon'], [1e3, 'bin']]) {
    const k = Math.floor(n / unit);
    if (k) parts.push(k === 1 && unit === 1e3 ? 'bin' : `${under1000(k)} ${word}`);
    n %= unit;
  }
  if (n) parts.push(under1000(n));
  return parts.join(' ');
}
const ORDINAL = { 1: 'birinci', 2: 'ikinci', 3: 'üçüncü', 4: 'dördüncü', 5: 'beşinci', 6: 'altıncı', 7: 'yedinci', 8: 'sekizinci', 9: 'dokuzuncu', 10: 'onuncu' };
const MONTHS = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

const lower = (s) => s.toLocaleLowerCase('tr');
const cap = (s) => (s ? s[0].toLocaleUpperCase('tr') + s.slice(1) : s);
/** In a title set in capitals every word is in capitals ("KİEV / İHA SALDIRISI"): all lowered, except
 *  known acronyms. In running text a word in capitals is an acronym ("ADF", "TPP") and stays. */
const KEEP = new Set(['İHA', 'NATO', 'AB', 'BM']);
const SAY = { ABD: 'Amerika Birleşik Devletleri', km: 'kilometre', 'km²': 'kilometrekare' };

/** Screen text → speech: accents off, numbers in words, capitals lowered, abbreviations said. */
export function speakable(text, title = false) {
  let s = text.replace(/\*/g, '').replace(/\s+·\s+/g, ', ').replace(/\s+-{1,2}\s+/g, ', ');
  s = s.replace(/±\s*/g, 'artı eksi ');
  // "bölgeler arasında 2." → "ikinci"; only small ranks, and only a number that ends the sentence
  s = s.replace(/(?<![\d.,])(\d{1,2})\.(?=\s*$)/g, (m, d) => ORDINAL[Number(d)] ?? m);
  // decimals with a comma ("2,5") and thousands with a dot ("1.470")
  s = s.replace(/\d{1,3}(?:\.\d{3})+(?!\d)/g, (m) => m.replace(/\./g, ''));
  s = s.replace(/(\d+),(\d+)/g, (_, a, b) => `${sayNumber(Number(a))} virgül ${sayNumber(Number(b))}`);
  s = s.replace(/\d+/g, (m) => sayNumber(Number(m)));
  // "yedi'ye" is read the same as "yediye", but a spelled number keeps no apostrophe
  s = s.replace(/(sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar)'(\p{L})/gu, '$1$2');
  s = s.replace(/[\p{L}²]+/gu, (w) => SAY[w] ?? (title && w === w.toLocaleUpperCase('tr') && /\p{Lu}/u.test(w) && !KEEP.has(w) ? lower(w) : w));
  return s.replace(/\s+/g, ' ').replace(/\s+([,.:;!?])/g, '$1').trim();
}
const sentence = (s) => { const t = s.trim().replace(/[,:;]$/, ''); return t ? cap(/[.!?]$/.test(t) ? t : `${t}.`) : ''; };

/** Great-circle kilometres, rounded to 10, as the distance beat shows them. */
function km([lo1, la1], [lo2, la2]) {
  const r = Math.PI / 180;
  const c = Math.sin(la1 * r) * Math.sin(la2 * r) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  return Math.round((Math.acos(Math.min(1, c)) * 6371) / 10) * 10;
}

/** "KAYITLARIMIZDA · EYLÜL" → "Eylül ayında kayıtlarımızda,"; a kicker without a month is said as it is. */
function kickerSaid(k) {
  if (!k) return '';
  const [a, b] = k.split(/\s+·\s+/);
  if (b && MONTHS.includes(b)) return `${cap(lower(b))} ayında ${lower(a)},`;
  return `${speakable(k, true)},`;
}

const T = (x) => speakable(x, true);
const B = (x) => speakable(x);
/** Sentences of a status line, each its own part: "Tek kaynak: Ukrinform." stays when "Henüz kimse
 *  incelemedi." has to go. */
const sentences = (x) => (x ?? '').split(/(?<=\.)\s+/).filter(Boolean).map(B);
/** Two big lines as one sentence: "İKİ / KİŞİ ÖLDÜ" is read straight on, "KİEV / SALDIRI" as a
 *  place and what happened there, with a pause between. */
const verbish = (w) => /(d[ıiuü]|t[ıiuü]|yor|acak|ecek|m[ıiuü]ş|d[ıiuü]lar|t[ıiuü]lar)$/u.test(lower(w));
function hookSentence(lines) {
  if (lines.length < 2) return T(lines.join(' '));
  const straight = /^\d|^(BİR|İKİ|ÜÇ|DÖRT|BEŞ|ALTI|YEDİ|SEKİZ|DOKUZ|ON)$/u.test(lines[0]) || verbish(lines[1].split(' ').at(-1));
  return T(lines.join(straight ? ' ' : ', '));
}
const norm = (x) => lower(x).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

/** The parts of one block's narration, most important first; later parts are dropped to fit. */
function blockParts(sc, b) {
  const labelOf = (i) => sc.parties?.[i]?.label ?? '';
  switch (b.kind) {
    case 'place': {
      const how = /^Kesin konum yok/.test(b.text ?? '') ? 'Kesin konum yok.' : /başlıktaki yer adından/.test(b.text ?? '') ? 'Konum, başlıktaki yer adından.' : '';
      return [T(b.title), how];
    }
    case 'facts': {
      // what the hook's sub-line already said is not said twice: the facts go on from there
      let body = b.lines.join(' ').replace(/\*/g, '');
      const sub = norm(sc.hook.sub);
      if (sub && norm(body).startsWith(sub)) {
        const words = sub.split(' ').length;
        body = body.split(/\s+/).slice(words).join(' ').replace(/^[,;:.\s]+/, '');
        return body ? [`Ayrıca ${B(body)}`] : [];
      }
      if (sub && norm(body) === sub) return [];
      const lead = b.kicker === 'KAYNAĞA GÖRE' && !/'[ae] göre/.test(body) ? 'Kaynağa göre, ' : '';
      return [lead + B(body)];
    }
    case 'distance':
      return [`${T(b.from.label)} ile ${T(b.to.label)} arası, kuş uçuşu yaklaşık ${sayNumber(km(b.from.at, b.to.at))} kilometre`];
    case 'status':
      return [T(sc.hook.status), ...sentences(b.text)];
    case 'close':
      return [`${kickerSaid(b.kicker)} ${B(b.lines.join(' '))}`];
    case 'link':
      return [`${T(labelOf(0))} ve ${T(labelOf(1))}: ${T(b.title)}`, b.text ? B(b.text) : ''];
    case 'roster': {
      const names = (sc.parties ?? []).slice(0, 4).map((p) => T(p.label));
      return [T(b.title), names.length ? `Katılanlar: ${names.join(', ')}` : ''];
    }
    case 'recent': {
      const where = (b.text ?? '').split(' çevresinde')[0];
      return [`Son yedi günde ${where ? `${B(where)} çevresinde ` : ''}${sayNumber(b.points.length)} kayıt`];
    }
    case 'quote':
      return [`${b.speaker !== undefined && labelOf(b.speaker) ? `${T(labelOf(b.speaker))}: ` : ''}${B(b.lines.join(' '))}`];
    default:
      return [];
  }
}

/** The hook: its big lines as one sentence, then its sub-line. */
function hookParts(sc) {
  const h = sc.hook;
  const km0 = sc.event ? String(km(sc.event.at, [29.05, 41.2])) : '';
  // a number hook's sub-line is its whole sentence ("…1470 askerini daha kaybetti"): read that, not
  // "Bin dört yüz yetmiş asker." and then the sentence, or only the bare number when time is short
  if (/^\d/.test(h.lines[0] ?? '') && h.sub.includes(h.lines[0])) return [B(h.sub)];
  return [hookSentence(h.lines), h.sub ? B(h.sub.replace('{km}', km0)) : ''];
}

/** Segments for the whole scene: [{ at, until, text }], text already speakable. */
export function narration(sc) {
  const starts = [0.25, ...sc.beats.map((b) => b.at + 0.15)];
  const ends = [...sc.beats.map((b) => b.at), sc.duration - 0.3];
  const blocks = [hookParts(sc), ...sc.beats.map((b) => blockParts(sc, b))];
  const out = [];
  blocks.forEach((parts, i) => {
    const window = ends[i] - starts[i];
    let keep = parts.filter(Boolean).map(sentence);
    // the first part always stays; optional parts go while the words would overrun the window
    while (keep.length > 1 && keep.join(' ').length / SPEECH_CPS > window) keep = keep.slice(0, -1);
    const text = keep.join(' ');
    if (text) out.push({ at: Math.round(starts[i] * 100) / 100, until: Math.round(ends[i] * 100) / 100, text });
  });
  return out;
}

/** A scene by file path, or by id from scenes/ or scenes/auto/ as the renderer finds it. */
export function loadScene(ref) {
  return parse(ref.endsWith('.yaml') ? readFileSync(ref, 'utf8') : sceneFile(ROOT, ref));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sc = loadScene(process.argv[2]);
  const segs = narration(sc);
  const json = JSON.stringify({ id: sc.id, duration: sc.duration, segments: segs }, null, 1) + '\n';
  if (process.argv[3]) { mkdirSync(path.dirname(process.argv[3]), { recursive: true }); writeFileSync(process.argv[3], json); }
  for (const s of segs) {
    const need = s.text.length / SPEECH_CPS;
    console.log(`${s.at.toFixed(2).padStart(6)} ${(s.until - s.at).toFixed(1).padStart(4)}s ${need > s.until - s.at ? '!' : ' '} ${s.text}`);
  }
}
