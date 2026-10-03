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
/** Short capitals the scene's own headline writes as capitals ("ADF", "DTEK", "GKRY"): a hook in
 *  capitals keeps them, where it lowers every other word ("adf" was read as a word). Set per scene
 *  by narration(). */
let ACRONYMS = new Set();
const SAY = { ABD: 'Amerika Birleşik Devletleri', km: 'kilometre', 'km²': 'kilometrekare' };

/** Screen text → speech: accents off, numbers in words, capitals lowered, abbreviations said. */
export function speakable(text, title = false) {
  let s = text.replace(/\*/g, '').replace(/\s+·\s+/g, ', ').replace(/\s+(-{1,2}|[–—])\s+/g, ', ');
  s = s.replace(/±\s*/g, 'artı eksi ');
  s = s.replace(/(\p{L})\s*[-–]\s*(?=\d)/gu, '$1 ');
  // "bölgeler arasında 2." → "ikinci"; only small ranks, and only a number that ends the sentence
  s = s.replace(/(?<![\d.,])(\d{1,2})\.(?=\s*$)/g, (m, d) => ORDINAL[Number(d)] ?? m);
  // decimals with a comma ("2,5") and thousands with a dot ("1.470")
  s = s.replace(/\d{1,3}(?:\.\d{3})+(?!\d)/g, (m) => m.replace(/\./g, ''));
  s = s.replace(/(\d+),(\d+)/g, (_, a, b) => `${sayNumber(Number(a))} virgül ${sayNumber(Number(b))}`);
  s = s.replace(/\d+/g, (m) => sayNumber(Number(m)));
  // "yedi'ye" is read the same as "yediye", but a spelled number keeps no apostrophe
  s = s.replace(/dört'(?=[aeıioöuü])/gu, "dörd'");
  s = s.replace(/(sıfır|bir|iki|üç|dört|dörd|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar)'(\p{L})/gu, '$1$2');
  s = s.replace(/[\p{L}²]+/gu, (w) => SAY[w] ?? (title && w === w.toLocaleUpperCase('tr') && /\p{Lu}/u.test(w) && !KEEP.has(w) && !ACRONYMS.has(w) ? lower(w) : w));
  return s.replace(/\s+/g, ' ').replace(/\s+([,.:;!?])/g, '$1').trim();
}
const sentence = (s) => { const t = s.trim().replace(/[,:;]$/, ''); return t ? cap(/[.!?]$/.test(t) ? t : `${t}.`) : ''; };

/** Great-circle kilometres, rounded to 10, as the distance beat shows them. */
function km([lo1, la1], [lo2, la2]) {
  const r = Math.PI / 180;
  const c = Math.sin(la1 * r) * Math.sin(la2 * r) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  return Math.round((Math.acos(Math.min(1, c)) * 6371) / 10) * 10;
}

/** A distance as the voice says it: the round hundred when it is within 3% ("yaklaşık bin" for ~990).
 *  The model loops on runs of like-sounding number words ("dokuz yüz doksan" came back as 990, 9, 9, 9
 *  in four of nine sample runs), and "yaklaşık" already says the figure is rounded; the screen keeps
 *  the measured ~990. */
export function spokenKm(n) {
  const r = Math.round(n / 100) * 100;
  return r > 0 && Math.abs(r - n) / n <= 0.03 ? r : n;
}

/** "KAYITLARIMIZDA · EYLÜL" → "Eylül ayında kayıtlarımızda,"; a kicker without a month is said as it is. */
function kickerSaid(k) {
  if (!k) return '';
  const [a, b] = k.split(/\s+·\s+/);
  if (b && MONTHS.includes(b)) return `${cap(lower(b))} ayında ${lower(a)},`;
  return `${speakable(k, true)},`;
}

/** The source as a name the voice can say: "UKRINFORM" is "Ukrinform" (a Latin name keeps its i),
 *  "RUSYA HÜKÜMETİ" is "Rusya Hükümeti"; an acronym stays as it is. */
const ACRONYMS_KEPT = new Set(['ABD', 'AB', 'BM', 'GKRY', 'NATO', 'UN', 'BBC', 'AP', 'AA']);
function publisherName(sc) {
  const raw = (sc.hook.source ?? '').replace(/^KAYNAK:\s*/, '').replace(/\s*\+\d+$/, '');
  if (/^\d+ YAYIN ORGANI$/u.test(raw)) return '';
  return raw.split(' ').map((w) => (ACRONYMS_KEPT.has(w) || (raw.split(' ').length === 1 && w.length <= 4) ? w
    : (/[İŞĞÜÖÇ]/u.test(w) ? w.toLocaleLowerCase('tr') : w.toLowerCase()).replace(/^\p{Ll}/u, (c) => c.toLocaleUpperCase('tr')))).join(' ');
}
/** The headline as the video shows it in its facts (or quote) block: the story the voice tells first. */
function headlineOf(sc) {
  const b = (sc.beats ?? []).find((x) => x.kind === 'facts' || x.kind === 'quote');
  if (b?.lines?.length) return b.lines.join(' ').replace(/\*/g, '');
  return sc.hook.sub || '';
}

const T = (x) => speakable(x, true);
const B = (x) => speakable(x);
/** A place label in capitals as a name: "SİNOP" is "Sinop", not "sinop". */
const name = (x) => B(lower(x).replace(/(^|[\s-])(\p{L})/gu, (_, a, c) => a + c.toLocaleUpperCase('tr')));
/** Sentences of a status line, each its own part: "Tek kaynak: Ukrinform." stays when "Henüz kimse
 *  incelemedi." has to go. */
const sentences = (x) => (x ?? '').split(/(?<=\.)\s+/).filter(Boolean).map(B);
/** Two big lines as one sentence: "İKİ / KİŞİ ÖLDÜ" is read straight on, "KİEV / SALDIRI" as a
 *  place and what happened there, with a pause between. */
const verbish = (w) => /(d[ıiuü]|t[ıiuü]|yor|acak|ecek|m[ıiuü]ş|d[ıiuü]lar|t[ıiuü]lar)$/u.test(lower(w));
function hookSentence(lines, sc) {
  // a line that is a country's or a party's name is said as a name ("Bulgaristan, Romanya"), where
  // the capitals of any other line are lowered ("romanya" was the second name)
  const names = new Set([...(sc?.parties ?? []).map((p) => p.label), ...(sc?.labels ?? []).map((l) => l.text)]);
  if (lines.some((l) => names.has(l))) {
    const said = lines.map((l) => (names.has(l) ? name(l) : T(l)));
    const straight = verbish(lines.at(-1).split(' ').at(-1));
    return said.join(straight ? ' ' : ', ');
  }
  if (lines.length < 2) return T(lines.join(' '));
  const straight = /^\d|^(BİR|İKİ|ÜÇ|DÖRT|BEŞ|ALTI|YEDİ|SEKİZ|DOKUZ|ON)$/u.test(lines[0]) || verbish(lines[1].split(' ').at(-1));
  return T(lines.join(straight ? ' ' : ', '));
}
const norm = (x) => lower(x).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

/** True when the facts block, past the hook's sub-line, says nothing the hook's big lines do not:
 *  "Rus kuvvetleri Pavlohrad'a saldırdı, üç kişi yaralandı" under "ÜÇ / KİŞİ YARALANDI". Then the
 *  hook reads only its headline and the facts read the whole sentence, attributed; otherwise the
 *  voice said "Üç kişi yaralandı. Rus kuvvetleri Pavlohrad'a saldırdı." and then "Ayrıca üç kişi
 *  yaralandı." */
function factsOnlyRepeatHook(sc) {
  const f = sc.beats.find((b) => b.kind === 'facts');
  const sub = norm(sc.hook.sub);
  if (!f || !sub) return false;
  const body = norm(f.lines.join(' ').replace(/\*/g, ''));
  if (!body.startsWith(sub)) return false;
  const rest = body.slice(sub.length).trim();
  // only the source's credit after a dash: the whole sentence, read once, carries it
  const raw = f.lines.join(' ').replace(/\*/g, '').split(/\s+/).slice(sub.split(' ').length).join(' ');
  if (/^[\s,;:]*[–—-]/.test(raw)) return true;
  // a word or two with no verb after the sentence ("\"Flash\"", a name) is a credit too
  const tail = raw.replace(/[^\p{L}\p{N}\s']/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (tail.length && tail.length <= 2 && !/(d[ıiuü]|t[ıiuü]|yor|acak|ecek|m[ıiuü]ş)$/u.test(tail.at(-1).toLocaleLowerCase('tr'))) return true;
  const head = norm(speakable(sc.hook.lines.join(' '), true));
  return rest.length > 0 && norm(speakable(rest)).split(' ').every((w) => head.includes(w.slice(0, 5)));
}

/** The parts of one block's narration, most important first; later parts are dropped to fit. */
function blockParts(sc, b) {
  const labelOf = (i) => sc.parties?.[i]?.label ?? '';
  switch (b.kind) {
    case 'place': {
      // the screen names the place and how sure it is; the voice says it as a sentence
      const where = name(b.title);
      if (/ülkeyi gösterir|ülke genelinde/.test(b.text ?? '')) return [`Kaynak bir yer vermiyor; harita ${where} genelini gösteriyor.`];
      if (/^Kesin konum yok/.test(b.text ?? '')) return [`Kesin yer bilinmiyor; harita ${where} çevresini gösteriyor.`];
      if (/başlıktaki yer adından/.test(b.text ?? '')) return [`Olay yeri ${where}; harita, haberde geçen yer adından yaklaşık konumu gösteriyor.`];
      return [`Olay yeri ${where}.`];
    }
    case 'facts': {
      // the hook told this story aloud already; the block that shows it in full is read by the eye, under
      // the music, rather than said a second time (the weekly digest's facts are its items: said)
      if (sc.template !== 'digest') return [];
      // what the hook's sub-line already said is not said twice: the facts go on from there
      let body = b.lines.join(' ').replace(/\*/g, '');
      // a hook that is itself the headline's first clause ("KHMARA, ADF KOMUTA / NOKTALARINI ZİYARET
      // ETTİ", no sub-line) counts as said too
      // (only a hook that ends on its verb: "BULGARİSTAN / ROMANYA" is no sentence, and cutting its two
      // words off "Bulgaristan, Romanya ve İspanya …" left "Ayrıca ve İspanya …")
      const sub = norm(sc.hook.sub || (verbish(sc.hook.lines.at(-1)?.split(' ').at(-1) ?? '') ? sc.hook.lines.join(' ') : ''));
      if (sub && norm(body).startsWith(sub) && !factsOnlyRepeatHook(sc)) {
        const words = sub.split(' ').length;
        body = body.split(/\s+/).slice(words).join(' ').replace(/^[,;:.\s]+/, '');
        // and what the hook's big lines said is not said again either: "Ayrıca iki kişi öldü, …" after
        // the hook "İki kişi öldü."
        const head = norm(speakable(sc.hook.lines.join(' '), true));
        if (head && norm(body).startsWith(head)) body = body.split(/\s+/).slice(head.split(' ').length).join(' ').replace(/^[,;:.\s]+/, '');
        return body ? [`Ayrıca ${B(body)}`] : [];
      }
      if (sub && norm(body) === sub) return [];
      const lead = b.kicker === 'KAYNAĞA GÖRE' && !/'[ae] göre/.test(body) ? 'Kaynağa göre, ' : '';
      return [lead + B(body)];
    }
    case 'distance':
      return [`Türkiye'den en yakın şehir ${name(b.to.label)}; arada kuş uçuşu yaklaşık ${sayNumber(spokenKm(km(b.from.at, b.to.at)))} kilometre var`];
    case 'status': {
      // the screen stamps the status; the voice says what it means
      const who = publisherName(sc);
      const many = (b.text ?? '').match(/(\d+) ayrı kaynak/);
      const state = { 'DOĞRULANMADI': 'henüz doğrulanmadı', 'KISMEN DOĞRULANDI': 'kısmen doğrulandı', 'DOĞRULANDI': 'iki inceleyici tarafından doğrulandı', 'TARTIŞMALI': 'tartışmalı' }[sc.hook.status] ?? lower(sc.hook.status);
      if (many) return [`Bilgi ${sayNumber(Number(many[1]))} ayrı kaynağa dayanıyor ve ${state}.`];
      return [who ? `Kaynak yalnızca ${who}; bilgi ${state}.` : `Tek bir kaynak var; bilgi ${state}.`];
    }
    case 'close': {
      // our own count, said as ours: "Eylül ayında Karadeniz'den üç yüz yedi kayıt derledik; en yoğun bölge
      // burası." rather than the screen's "Karadeniz'den 307 kayıt: en yoğun bölge."
      const text = b.lines.join(' ').replace(/\*/g, '');
      const m = text.match(/^(.+?'d[ae]n) (\d+) kayıt[:.]?\s*(.*)$/u);
      if (m) {
        const ORDINAL = { 2: 'ikinci', 3: 'üçüncü', 4: 'dördüncü', 5: 'beşinci', 6: 'altıncı', 7: 'yedinci', 8: 'sekizinci', 9: 'dokuzuncu', 10: 'onuncu' };
        const r = m[3].match(/bölgeler arasında (\d+)\./u);
        const rank = /en yoğun bölge/.test(m[3]) ? '; en yoğun bölge burası' : r && ORDINAL[r[1]] ? `; bölgeler arasında ${ORDINAL[r[1]]} sırada` : '';
        const month = (b.kicker ?? '').split(/\s+·\s+/)[1];
        const when = month && MONTHS.includes(month) ? `${cap(lower(month))} ayında ` : '';
        return [`${when}${m[1]} ${sayNumber(Number(m[2]))} kayıt derledik${rank}`];
      }
      const pair = text.match(/^Son 12 ayda bu iki ülke: (\d+) kayıt\.?$/u);
      if (pair) return [`Son on iki ayda bu iki ülke arasında ${sayNumber(Number(pair[1]))} olay kaydettik`];
      return [`${kickerSaid(b.kicker)} ${B(text)}`];
    }
    case 'link':
      // the two names were the hook a moment ago ("Rusya, Tacikistan."): the block says only what joins them
      const pairSaid = sc.hook.lines[0] === labelOf(0) && sc.hook.lines[1] === labelOf(1);
      return [pairSaid ? T(b.title) : `${name(labelOf(0))} ve ${name(labelOf(1))}: ${T(b.title)}`, b.text ? B(b.text) : ''];
    case 'roster': {
      const names = (sc.parties ?? []).slice(0, 4).map((p) => name(p.label));
      if (!names.length) return [];
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} ve ${names.at(-1)}` : names[0];
      return [`Tatbikata katılanlar ${list}.`];
    }
    case 'recent': {
      const where = (b.text ?? '').split(' çevresinde')[0];
      return [`Kayıtlarımızda ${where ? `${B(where)} çevresinde ` : 'bu çevrede '}son bir haftada ${sayNumber(b.points.length)} olay var`];
    }
    case 'quote':
      return [`${b.speaker !== undefined && labelOf(b.speaker) ? `${name(labelOf(b.speaker))}: ` : ''}${B(b.lines.join(' '))}`];
    default:
      return [];
  }
}

/** The hook: its big lines as one sentence, then its sub-line. */
function hookParts(sc) {
  const h = sc.hook;
  // the voice tells the story in a sentence while the screen shows its short headline: "Ukrinform
  // bildiriyor: Hostomel'e Rus saldırısından kaynaklanan kayıplar dörde yükseldi." under "KİEV BÖLGESİ /
  // SALDIRI". Reading the screen's words aloud was the owner's complaint ("okunca aptal gibi oluyor").
  // The facts block, which shows the same sentence, is then left to the music (blockParts)
  if (sc.template !== 'digest') {
    const story = headlineOf(sc);
    const who = publisherName(sc);
    if (story) return [`${who ? `${who} bildiriyor: ` : ''}${B(story)}`];
  }
  const km0 = sc.event ? String(km(sc.event.at, [29.05, 41.2])) : '';
  // a number hook's sub-line is its whole sentence ("…1470 askerini daha kaybetti"): read that, not
  // "Bin dört yüz yetmiş asker." and then the sentence, or only the bare number when time is short
  // the facts will read the whole sentence, so the hook reads only its headline (see factsOnlyRepeatHook);
  // a GELİŞME label is no headline aloud, so then only the place
  if (sc.template !== 'digest' && factsOnlyRepeatHook(sc)) return [h.lines[1] === 'GELİŞME' ? `${T(h.lines[0])}.` : hookSentence(h.lines, sc)];
  if (/^\d/.test(h.lines[0] ?? '') && h.sub && norm(h.sub).includes(norm(h.lines[0]))) return [B(h.sub)];
  // the weekly digest's hook is its own sentence: "Bu hafta Karadeniz'den iki yüz kırk kayıt derlendi."
  if (sc.template === 'digest') {
    const m = (h.lines[0] ?? '').match(/^BU HAFTA (.+)$/u);
    return [m ? `Bu hafta ${name(m[1])} ${lower(T(h.lines.slice(1).join(' ')))}` : hookSentence(h.lines, sc)];
  }
  // a hook whose label is only GELİŞME (development) says nothing aloud: the sentence is the news
  // and the place is not said first when the sentence opens with it ("Kiev. Kiev'de …")
  if (h.lines[1] === 'GELİŞME' && h.sub) return norm(h.sub).startsWith(norm(T(h.lines[0])).slice(0, 4)) ? [B(h.sub)] : [`${T(h.lines[0])}. ${B(h.sub)}`];
  return [hookSentence(h.lines, sc), h.sub ? B(h.sub.replace('{km}', km0)) : ''];
}

/** Segments for the whole scene: [{ at, until, text }], text already speakable. */
export function narration(sc) {
  ACRONYMS = new Set((sc.source_text ?? []).slice(0, 2).join(' ').match(/(?<![\p{L}\d])\p{Lu}[\p{Lu}\d]{1,3}(?![\p{L}\d])/gu) ?? []);
  const starts = [0.25, ...sc.beats.map((b) => b.at + 0.15)];
  const ends = [...sc.beats.map((b) => b.at), sc.duration - 0.3];
  const blocks = [hookParts(sc), ...sc.beats.map((b) => blockParts(sc, b))];
  const out = [];
  blocks.forEach((parts, i) => {
    const window = ends[i] - starts[i];
    let keep = parts.filter(Boolean).map(sentence);
    // a block that opens with exactly what the voice has just said drops that ("Karadeniz." then
    // "Karadeniz. Kesin konum yok." reads "Kesin konum yok."), as long as something is left
    const last = out.at(-1)?.text;
    if (last && keep.length > 1 && norm(keep[0]) === norm(last)) keep = keep.slice(1);
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
