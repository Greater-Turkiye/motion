import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { validate, words } from '../../src/engine/scene.ts';
import { ask, responseJson } from './llm.mjs';

const [scenePath, narrationPath] = process.argv.slice(2);
if (!scenePath || !narrationPath) throw new Error('usage: node tools/scene/nim-copy.mjs <scene.yaml> <narration.json>');
if (!process.env.GEMINI_API_KEY?.trim() && !process.env.NVAPI?.trim()) {
  console.log('::warning::neither GEMINI_API_KEY nor NVAPI is configured; the copy stays the generator’s own.');
  process.exit(0);
}

const sceneSource = readFileSync(scenePath, 'utf8');
const header = sceneSource.match(/^# Generated[^\r\n]*\r?\n/)?.[0] ?? '';
const scene = parse(sceneSource);
const narrationSource = readFileSync(narrationPath, 'utf8');
const narration = JSON.parse(narrationSource);
const facts = [
  ...scene.source_text,
  scene.hook.lines.join(' '),
  scene.hook.sub,
  ...scene.beats.filter((beat) => beat.kind === 'facts' || beat.kind === 'quote').flatMap((beat) => beat.lines),
].filter(Boolean);
// The hook is the first thing a viewer reads, in the biggest type, in the first second: it has to be the
// news itself, the one concrete thing that happened, not a label. The generator's label hooks ("GAZZE /
// RESMİ AÇIKLAMA", "IRAK / GELİŞME") stopped nobody (owner, 2026-10-27: "viral olma ihtimali %0").
const prompt = [
  'Sen bir Türk haber kanalının kısa video (YouTube Shorts) editörüsün. Aşağıdaki kaynak metinden ekrandaki kancayı, YouTube başlığını ve seslendirmeyi yaz.',
  'KANCA (hook_lines, tam 2 satır, normal Türkçe yazımla; özel isimler büyük harfle başlar, gerisi küçük; ekranda büyük harfe çevrilir): haberin kendisi, olan tek somut şey: kim, kime, ne yaptı, kaç. 1. satır en fazla 18, 2. satır en fazla 24 karakter. Etiket değil cümle: "GAZZE / RESMİ AÇIKLAMA", "IRAK / GELİŞME", "KHARKİV / SALDIRI" gibi tür adları YASAK. Kaynakta sayı varsa sayıyı kullan, ama ölü ya da yaralı sayısı kanca olmaz (sahibin kuralı): kanca olayın kendisi, ne vuruldu, kim ne yaptı; kayıp alt satırda.',
  'hook_sub: kancanın altında en fazla 72 karakterlik tek cümle, kancanın söylemediği en önemli ikinci olgu.',
  'post_title: YouTube başlığı, en fazla 70 karakter, düz cümle, haberin özü; alıntıyı ortadan kesme.',
  'Kurallar: yalnızca kaynakta açıkça bulunan olgular. Yeni sayı, kişi, yer, neden, sonuç, niyet ekleme. Soru cümlesi, "Şok", "Bomba", "İşte", "Ama", emoji, ünlem, öfke, taraf tutma yok. Kaynağın doğrulama durumunu değiştirme. Çeviri dili yok ("…uyarısında bulundu" değil "…uyardı"); kısa, etken, günlük Türkçe.',
  'spoken_segments: verilen seslendirme ile aynı sayıda ve sırada; her biri bir spikerin akıcı, kısa cümleleri. Ekranı okuma, hikâyeyi anlat. Özel isimleri, yerleri ve sayıları aynen koru.',
  'Yanıtı yalnızca JSON olarak ver: {"hook_lines":["...","..."],"hook_sub":"...","post_title":"...","spoken_segments":["..."]}',
  `SOURCE TEXT:\n${facts.join('\n')}`,
  `CURRENT HOOK:\n${JSON.stringify({ lines: scene.hook.lines, sub: scene.hook.sub })}`,
  `CURRENT NARRATION:\n${JSON.stringify(narration.segments.map((segment) => segment.text))}`,
].join('\n\n');

// The hook may be written freely, like the narration, but adds no fact: every number and proper noun in
// it is the source's (factsOnly, the narration's gate), and the scene still validates (lengths, reading
// time, banned words; validate() skips its word-by-word source check for an edited hook).
function hookCandidate(candidate) {
  const lines = candidate.hook_lines;
  if (!Array.isArray(lines) || lines.length !== 2 || lines.some((l) => typeof l !== 'string' || !l.trim())) return null;
  const up = lines.map((l) => l.trim().toLocaleUpperCase('tr'));
  if (up[0].length > 18 || up[1].length > 24) return null;
  if (typeof candidate.hook_sub !== 'string' || candidate.hook_sub.length > 72) return null;
  if (LABEL.test(up.join(' / '))) return null;
  // gated in the model's own case, where a capital marks a proper noun; shown in capitals
  if (![...lines, candidate.hook_sub].every((t) => !t || factsOnly(t))) return null;
  const proposed = { ...scene, hook: { ...scene.hook, lines: up, sub: candidate.hook_sub.trim(), edited: true } };
  const problems = validate(proposed);
  if (problems.length) { console.log(`hook rejected: ${problems.join('; ')}`); return null; }
  return proposed;
}
// a type word alone on a line is a label, not news
const LABEL = /(^|\/ )(GELİŞME|SALDIRI|RESMİ AÇIKLAMA|AÇIKLAMA|KONUŞLANMA|TATBİKAT|YAPTIRIM|ANLAŞMA|GÖRÜŞME)$/u;

// The spoken narration is heard, not shown, so it may read as natural Turkish
// news prose rather than the clipped on-screen facts — but the red line holds:
// it states no claim the source does not make. The gate below keeps every
// number and proper noun tied to the source (and to the deterministic original,
// which already carries only sourced facts) while allowing a short allowlist of
// framing and discourse words that add flow but no fact. This is looser than the
// on-screen hook check (validate()), which stays strict.
// words() lower-cases and folds ı→i, so an allowlist must be folded the same way
// or a word carrying ı (e.g. "ardından" → "ardindan") would never match.
const fold = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i');
const lowerTr = fold;
const stem = (w) => w.slice(0, Math.min(5, w.length));
const SPOKEN_BANNED = ['hain', 'rezil', 'küstah', 'alçak', 'namussuz', 'şerefsiz', 'vahşi', 'barbar', 'katliamcı',
  'şok', 'inanılmaz', 'bomba gibi', 'flaş', 'son dakika'].map(fold);
const SPOKEN_STOP = new Set(['ve', 'ile', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'mi', 'göre', 'için', 'gibi', 'kadar',
  'daha', 'en', 'çok', 'az', 'ya', 'veya', 'ama', 'fakat', 'ise', 'olarak', 'olan', 'yeni'].map(fold));
// Framing and attribution words that carry no claim about the event itself.
const SPOKEN_FRAME = new Set(['bildirildi', 'bildirdi', 'açıklandı', 'açıkladı', 'duyurdu', 'duyuruldu', 'aktardı', 'aktarıldı',
  'kaydetti', 'kaydedildi', 'belirtti', 'belirtildi', 'ifade', 'edildi', 'ediliyor', 'söyledi', 'dedi', 'ekledi', 'vurguladı',
  'öğrenildi', 'bildiriyor', 'aktarıyor', 'açıklamaya', 'açıklamasına', 'açıklama', 'haberine', 'haberi', 'bilgisine',
  'bilgilere', 'raporuna', 'rapora', 'ajansına', 'ajansının', 'basınına', 'ayrıca', 'ardından', 'sırasında', 'henüz', 'halen',
  'üzere', 'şöyle', 'böylece', 'yönelik', 'ilişkin', 'dair', 'düzenlenen', 'gerçekleştirilen'].map(fold));

// Turkish number words: a quantity the source did not state is a new claim even
// when spelled out ("iki" → "üç"), so these are gated like digits.
// "bir" is excluded: it is far more often the indefinite article "a" than "one".
const NUMBER_WORDS = new Set(['iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on', 'yirmi', 'otuz',
  'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan', 'yüz', 'bin', 'milyon', 'milyar', 'yarım', 'çeyrek'].map(fold));

// The heard narration may be written freely as natural Turkish, but it must add
// no fact the source does not carry. So the gate ties only the two things that
// would be a fabricated claim to the source: numbers (digits and number words)
// and proper nouns (capitalised tokens — places, people, weapons, orgs). Any
// lower-case word (verbs, connectives, adjectives) is allowed, which lets NIM
// turn the clipped facts into flowing news prose. The on-screen hook stays
// strict (validate()). A residual phrasing risk is accepted for the spoken-only
// track; the prompt forbids new facts and the banned-outrage words are blocked.
function spokenCandidate(text, original) {
  if (typeof text !== 'string' || !text.trim() || text.includes('?')) return false;
  if (text.length > Math.max(original.length + 80, 280)) return false;
  return factsOnly(text, original);
}
function factsOnly(text, original = '') {
  if (text.includes('?') || /\p{Extended_Pictographic}/u.test(text)) return false;
  const low = lowerTr(text);
  if (SPOKEN_BANNED.some((b) => low.includes(b))) return false;
  const src = [...facts, original].flatMap(words);
  const srcText = [...facts, original];
  const sourceName = words(scene.hook.source.replace(/^.*?:/, ''));
  const inSource = (w) => SPOKEN_STOP.has(w) || SPOKEN_FRAME.has(w) || sourceName.includes(w)
    || src.some((x) => x.startsWith(stem(w)) || w.startsWith(stem(x)));
  // Keep case: a capitalised token mid- or start-of-sentence is a proper noun.
  for (const raw of text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []) {
    const bare = raw.split(/['’]/)[0];
    const w = fold(bare);
    if (w.length < 2) continue;
    if (/\d/.test(w) || NUMBER_WORDS.has(w)) {
      // a number the source does not state is a new claim
      if (!(/\d/.test(w) ? srcText.some((t) => t.includes(w)) : src.includes(w))) return false;
      continue;
    }
    if (/^\p{Lu}/u.test(bare) && !inSource(w)) return false; // a proper noun not in the source
  }
  return true;
}

try {
  const result = await ask(prompt, { temperature: 0.45 });
  console.log(`copy rewrite by ${result.model}.`);
  const candidate = responseJson(result.text);

  const proposedScene = hookCandidate(candidate);
  if (proposedScene) {
    scene.hook.lines = proposedScene.hook.lines;
    scene.hook.sub = proposedScene.hook.sub;
    scene.hook.edited = true;
    // the YouTube title: the edited sentence, not the source's long headline cut mid-quote
    if (typeof candidate.post_title === 'string' && candidate.post_title.trim().length <= 70 && factsOnly(candidate.post_title)) scene.post_title = candidate.post_title.trim();
    writeFileSync(scenePath, header + stringify(scene, { lineWidth: 0 }));
    console.log(`hook accepted: ${scene.hook.lines.join(' / ')}`);
  } else {
    console.log(`hook rejected: ${JSON.stringify(candidate.hook_lines)}; keeping the generated hook.`);
  }

  if (Array.isArray(candidate.spoken_segments) && candidate.spoken_segments.length === narration.segments.length) {
    let changed = 0;
    candidate.spoken_segments.forEach((text, index) => {
      if (spokenCandidate(text, narration.segments[index].text)) {
        narration.segments[index].text = text.trim();
        changed++;
      }
    });
    if (changed) {
      narration.nim_model = result.model;
      writeFileSync(narrationPath, JSON.stringify(narration, null, 1) + '\n');
    }
    console.log(`NIM spoken-copy segments accepted: ${changed}/${narration.segments.length}.`);
  } else {
    console.log('::warning::NIM narration rejected or empty; keeping deterministic narration.');
  }
} catch (error) {
  console.warn(`::warning::NIM copy unavailable; keeping deterministic text: ${error.message}`);
}