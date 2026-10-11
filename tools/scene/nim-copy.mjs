import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { validate, words } from '../../src/engine/scene.ts';

const [scenePath, narrationPath] = process.argv.slice(2);
const apiKey = process.env.NVAPI?.trim();
// Fixed by the owner: the NIM model is google/gemma-4-31b-it, hardcoded, not
// read from an env var. The HTTP 529 seen earlier was the shared endpoint being
// overloaded (handled by the retry below), not a bad model id.
const nimModel = 'google/gemma-4-31b-it';
const timeoutSeconds = Number(process.env.NVIDIA_NIM_TIMEOUT || 90);
if (!scenePath || !narrationPath) throw new Error('usage: node tools/scene/nim-copy.mjs <scene.yaml> <narration.json>');
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 120) throw new Error('NVIDIA_NIM_TIMEOUT must be 10-120 seconds');
if (!apiKey) {
  console.log('::warning::NVAPI is not configured; narration keeps the deterministic source copy (no NIM rewrite).');
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
const prompt = [
  'Türkçe bir kısa haber videosu için ekrandaki hook ve seslendirme metinlerini sade, konuşulur ve merak uyandıran biçimde düzenle.',
  'Yalnızca aşağıdaki source metinlerinde açıkça bulunan olguları kullan. Yeni sayı, kişi, yer, neden, sonuç, niyet veya doğrulama ekleme.',
  'Clickbait, soru cümlesi, öfke, taraf tutma ve ölüm sayısını gereksiz yere öne çıkarma. Kaynağın doğrulama durumunu değiştirme.',
  'hook_lines aynı sayıda ve kısa satırlar olmalı; hook_sub en fazla 72 karakter olmalı.',
  'spoken_segments sayısı ve sırası verilen narration ile aynı kalmalı. Her segmenti, bir haber spikerinin akıcı ve doğal konuşmasıyla yeniden yaz: ekrandaki kısa olguları olduğu gibi okumak yerine tam, akıcı Türkçe cümlelere dönüştür. Tüm özel isimleri, yerleri ve sayıları aynen koru; kaynakta olmayan hiçbir yeni sayı, isim, yer, neden, sonuç veya iddia ekleme. Bağlaç ve aktarım ifadeleriyle (örneğin "bildirildiğine göre", "açıklandı") cümleyi doğallaştırabilirsin.',
  'Yanıtı yalnızca JSON olarak ver: {"hook_lines":["..."],"hook_sub":"...","spoken_segments":["..."]}',
  `SOURCE TEXT:\n${facts.join('\n')}`,
  `CURRENT HOOK:\n${JSON.stringify({ lines: scene.hook.lines, sub: scene.hook.sub })}`,
  `CURRENT NARRATION:\n${JSON.stringify(narration.segments.map((segment) => segment.text))}`,
].join('\n\n');

function responseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('NIM did not return a JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

function hookCandidate(candidate) {
  if (!Array.isArray(candidate.hook_lines) || candidate.hook_lines.length !== scene.hook.lines.length
      || candidate.hook_lines.some((line) => typeof line !== 'string' || !line.trim() || line.length > 28)
      || typeof candidate.hook_sub !== 'string' || candidate.hook_sub.length > 72) return null;
  const proposed = { ...scene, hook: { ...scene.hook, lines: candidate.hook_lines, sub: candidate.hook_sub } };
  return validate(proposed).length === 0 ? proposed : null;
}

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

function spokenCandidate(text, original) {
  if (typeof text !== 'string' || !text.trim() || text.includes('?')) return false;
  if (text.length > Math.max(original.length + 60, 260)) return false;
  const low = lowerTr(text);
  if (SPOKEN_BANNED.some((b) => low.includes(b))) return false;
  const src = [...facts, original].flatMap(words);
  const sourceName = words(scene.hook.source.replace(/^.*?:/, ''));
  for (const w of words(text)) {
    if (SPOKEN_STOP.has(w) || SPOKEN_FRAME.has(w) || sourceName.includes(w)) continue;
    // Symmetric stem match so an inflected form of a source word is allowed
    // ("kişi" ↔ "kişinin"), but an unrelated word (a new place or claim) is not.
    const ok = /^\d/.test(w)
      ? [...facts, original].some((t) => t.includes(w))
      : src.some((x) => x.startsWith(stem(w)) || w.startsWith(stem(x)));
    if (!ok) return false;
  }
  return true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callNim() {
  // NVIDIA NIM returns 429/503/529 when the shared endpoint is busy; a single
  // call then drops the rewrite for the whole day. Retry a few times with
  // backoff before giving up and keeping the deterministic copy.
  const backoff = [0, 4000, 10000];
  let lastError;
  for (let attempt = 0; attempt < backoff.length; attempt++) {
    if (backoff[attempt]) await sleep(backoff[attempt]);
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
        body: JSON.stringify({
          model: nimModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.35,
          top_p: 0.9,
          max_tokens: 900,
          stream: false,
        }),
      });
      if (response.ok) return response.json();
      const detail = (await response.text()).slice(0, 400);
      lastError = new Error(`NVIDIA NIM HTTP ${response.status}: ${detail}`);
      if (![429, 500, 502, 503, 529].includes(response.status)) break;
      console.log(`NIM attempt ${attempt + 1} got HTTP ${response.status}; retrying.`);
    } catch (error) {
      lastError = error;
      console.log(`NIM attempt ${attempt + 1} failed (${error.message}); retrying.`);
    }
  }
  throw lastError;
}

try {
  console.log(`NIM rewrite with model ${nimModel}.`);
  const result = await callNim();
  const candidate = responseJson(result.choices?.[0]?.message?.content ?? '');

  const proposedScene = hookCandidate(candidate);
  if (proposedScene) {
    scene.hook.lines = proposedScene.hook.lines;
    scene.hook.sub = proposedScene.hook.sub;
    writeFileSync(scenePath, header + stringify(scene, { lineWidth: 0 }));
    console.log('NIM hook accepted by source and readability validation.');
  } else {
    console.log('NIM hook rejected by source/readability validation; keeping generated hook.');
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
      narration.nim_model = nimModel;
      writeFileSync(narrationPath, JSON.stringify(narration, null, 1) + '\n');
    }
    console.log(`NIM spoken-copy segments accepted: ${changed}/${narration.segments.length}.`);
  } else {
    console.log('::warning::NIM narration rejected or empty; keeping deterministic narration.');
  }
} catch (error) {
  console.warn(`::warning::NIM copy unavailable; keeping deterministic text: ${error.message}`);
}