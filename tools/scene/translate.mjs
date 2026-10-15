// Build the English track from the finished Turkish scene and narration. The record's facts are the
// same; only the words change, so rather than re-implement a thousand lines of Turkish grammar in
// English we translate the produced copy with NVIDIA NIM (gemma — a faithful translator) and refit the
// timeline to the longer English text. The on-screen labels (WHERE, STATUS, …) are drawn by the
// template from scene.lang (src/templates/video.ts), not translated here.
//
//   node tools/scene/translate.mjs <scene.yaml> <narration.json> <out-scene.en.yaml> <out-narration.en.json>
//
// On any failure — NIM unavailable, a malformed answer, a translation that invents a number, or a
// scene that will not validate even after refit — it logs a CI warning and writes nothing, so the
// English steps in produce.yml skip and the Turkish video still ships. It never guesses a fact.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { validate } from '../../src/engine/scene.ts';
import { fitScale, refit } from './refit.mjs';

const [scenePath, narrationPath, outScenePath, outNarrationPath] = process.argv.slice(2);
const apiKey = process.env.NVAPI?.trim();
const nimModel = 'google/gemma-4-31b-it'; // fixed, like tools/scene/nim-copy.mjs; not from an env var
const timeoutSeconds = Number(process.env.NVIDIA_NIM_TIMEOUT || 180);
if (!scenePath || !narrationPath || !outScenePath || !outNarrationPath) {
  throw new Error('usage: node tools/scene/translate.mjs <scene.yaml> <narration.json> <out-scene.en.yaml> <out-narration.en.json>');
}

const warn = (message) => { console.log(`::warning::English track skipped: ${message}`); process.exit(0); };
if (!apiKey) warn('NVAPI is not configured.');

const narration = JSON.parse(readFileSync(narrationPath, 'utf8'));
const starless = (s) => s.replace(/\*/g, '');

// Collect every on-screen string with a setter, in a fixed order, so the translation maps straight
// back by index. Asterisks mark accent words; keep them around the translated span, so strip and
// restore them rather than sending them to the model. The scene is parsed fresh each time so a
// failed attempt's partial mutations never carry into the next (translate retries the whole thing).
function buildScene() {
  const scene = parse(readFileSync(scenePath, 'utf8'));
  const slots = [];
  const add = (get, set) => { const v = get(); if (typeof v === 'string' && v.trim()) slots.push({ text: v, set }); };
  const addLines = (arr) => { if (Array.isArray(arr)) arr.forEach((_, i) => add(() => arr[i], (v) => { arr[i] = v; })); };

  add(() => scene.hook.kicker, (v) => { scene.hook.kicker = v; });
  addLines(scene.hook.lines);
  add(() => scene.hook.sub, (v) => { scene.hook.sub = v; });
  add(() => scene.hook.status, (v) => { scene.hook.status = v; });
  // the source line keeps its "SOURCE:" label; only the publisher name is translated
  const sourceName = scene.hook.source.replace(/^[^:]*:\s*/, '');
  add(() => sourceName, (v) => { scene.hook.source = `SOURCE: ${v}`; });
  for (const b of scene.beats ?? []) {
    add(() => b.title, (v) => { b.title = v; });
    add(() => b.text, (v) => { b.text = v; });
    add(() => b.note, (v) => { b.note = v; });
    add(() => b.kicker, (v) => { b.kicker = v; });
    add(() => b.credit, (v) => { b.credit = v; });
    addLines(b.lines);
    if (b.from) add(() => b.from.label, (v) => { b.from.label = v; });
    if (b.to) add(() => b.to.label, (v) => { b.to.label = v; });
  }
  for (const l of scene.labels ?? []) if (l.text !== 'TÜRKİYE') add(() => l.text, (v) => { l.text = v; });
  if (scene.subject) add(() => scene.subject.label, (v) => { scene.subject.label = v; });
  for (const p of scene.parties ?? []) add(() => p.label, (v) => { p.label = v; });
  return { scene, slots };
}

const screen = buildScene().slots.map((s) => starless(s.text));
const spoken = narration.segments.map((s) => s.text);

// Tell the model the exact counts it must return: the single most common failure was the translator
// merging or splitting lines, so the array came back a different length and the whole English track
// was dropped. Naming the counts, and retrying the content below, makes a faithful length reliable.
const prompt = [
  'Translate the following Turkish short-news video text into natural, plain English. It is a factual OSINT news card: keep it sober, no clickbait, no added drama.',
  'Rules: translate meaning, do not add or drop any fact. Keep every number exactly as written. Keep every proper noun (places, people, countries, weapons, organisations, the source name) — use the common English spelling (Kiev, Kharkiv, Odesa, Russia, Ukraine, Türkiye).',
  'The "screen" lines are short captions shown on screen: translate each as tersely as the Turkish, ideally no longer. The "narration" lines are spoken sentences: translate them as fluent spoken English.',
  `Translate each item one-to-one: never merge, split, reorder, add or drop an item. "screen" has exactly ${screen.length} item(s) and "narration" has exactly ${spoken.length} item(s); return exactly that many, in the same order.`,
  'Return ONLY JSON, no prose or code fence: {"screen":[...],"narration":[...]}.',
  `INPUT:\n${JSON.stringify({ screen, narration: spoken })}`,
].join('\n\n');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callNim(temperature) {
  const backoff = [0, 4000, 10000];
  let lastError;
  for (let attempt = 0; attempt < backoff.length; attempt++) {
    if (backoff[attempt]) await sleep(backoff[attempt]);
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
        body: JSON.stringify({ model: nimModel, messages: [{ role: 'user', content: prompt }], temperature, top_p: 0.9, max_tokens: 2048, stream: false }),
      });
      if (response.ok) return response.json();
      lastError = new Error(`NVIDIA NIM HTTP ${response.status}`);
      if (![429, 500, 502, 503, 529].includes(response.status)) break;
      console.log(`translate attempt ${attempt + 1} got HTTP ${response.status}; retrying.`);
    } catch (error) {
      lastError = error;
      console.log(`translate attempt ${attempt + 1} failed (${error.message}); retrying.`);
    }
  }
  // the endpoint is unreachable or kept erroring after its own retries: tag it so the caller skips
  // fast instead of re-rolling (a down service will not answer a second roll, and each roll waits out
  // the full timeout — four rolls once left the step spinning ~40 min before giving up).
  const serviceError = lastError instanceof Error ? lastError : new Error(String(lastError));
  serviceError.serviceError = true;
  throw serviceError;
}

function responseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(text.slice(start, end + 1));
}

// Every number in the English output must come from the Turkish input: a translation never introduces
// a quantity the source did not state (a red line, CLAUDE.md section 2).
const digits = (arr) => new Set(arr.flatMap((s) => s.match(/\d+/g) ?? []));

// One translation attempt: call NIM, parse, check faithfulness, apply onto a fresh scene, refit and
// validate. A stochastic translator sometimes merges a line or drops JSON; rather than lose the whole
// English track to one bad roll, try a few times (nudging the temperature up) and keep the first that
// passes. Only a genuine, repeated failure skips the track — the Turkish video always ships regardless.
async function attempt(temperature) {
  const result = await callNim(temperature);
  const candidate = responseJson(result.choices?.[0]?.message?.content ?? '');
  const outScreen = candidate.screen, outSpoken = candidate.narration;
  if (!Array.isArray(outScreen) || outScreen.length !== screen.length) throw new Error(`screen length mismatch (${Array.isArray(outScreen) ? outScreen.length : 'not an array'} vs ${screen.length})`);
  if (!Array.isArray(outSpoken) || outSpoken.length !== spoken.length) throw new Error(`narration length mismatch (${Array.isArray(outSpoken) ? outSpoken.length : 'not an array'} vs ${spoken.length})`);
  if (outScreen.some((s) => typeof s !== 'string' || !s.trim()) || outSpoken.some((s) => typeof s !== 'string' || !s.trim())) throw new Error('empty translation');

  const srcNumbers = digits([...screen, ...spoken]);
  const outNumbers = digits([...outScreen, ...outSpoken]);
  for (const n of outNumbers) if (!srcNumbers.has(n)) throw new Error(`translation introduced a number not in the source: ${n}`);

  const { scene, slots } = buildScene();
  // put accent asterisks back around the translated span of a line that had them
  slots.forEach((slot, i) => {
    const had = slot.text.includes('*');
    slot.set(had ? `*${outScreen[i].trim()}*` : outScreen[i].trim());
  });
  scene.lang = 'en';
  // The Turkish scene already carries `voice: synthetic` (produce.yml appends it after narration), and
  // produce.yml appends it again to the English file after the English voice — so dropping it here keeps
  // the key from appearing twice, which made the English YAML fail to parse ("Map keys must be unique").
  delete scene.voice;
  // source_text now holds the English words the hook may use: the translated screen text itself, so
  // every on-screen word is "in the source" for validate(). No Turkish headline is carried over.
  scene.source_text = [...new Set(screen.map((_, i) => starless(outScreen[i]).trim()))];

  const scale = fitScale(scene); // the factor refit is about to apply; the narration times follow it
  refit(scene);
  const problems = validate(scene);
  if (problems.length) throw new Error(`the English scene will not validate: ${problems.join('; ')}`);
  return { scene, scale, outScreen, outSpoken };
}

async function translate() {
  const temperatures = [0.2, 0.3, 0.5, 0.5];
  let lastError;
  for (let i = 0; i < temperatures.length; i++) {
    try {
      return await attempt(temperatures[i]);
    } catch (error) {
      // only a bad answer is worth another roll; if NIM itself is unreachable, re-rolling just waits
      // out the timeout again, so give up now and let the English track skip this run.
      if (error.serviceError) throw error;
      lastError = error;
      console.log(`translate try ${i + 1}/${temperatures.length} rejected (${error.message})${i + 1 < temperatures.length ? '; re-rolling.' : '.'}`);
    }
  }
  throw lastError;
}

try {
  const { scene, scale, outScreen, outSpoken } = await translate();

  const header = `# English track, translated from ${scenePath} by tools/scene/translate.mjs (NIM ${nimModel}).\n`;
  writeFileSync(outScenePath, header + stringify(scene, { lineWidth: 0 }));

  // the English narration tells the English scene: scale its block times by the same refit factor so
  // retime.mjs (which stretches the picture to the voice) starts from the English timeline
  const t = (v) => (typeof v === 'number' ? Math.round(v * scale * scene.fps) / scene.fps : v);
  const outNarration = {
    ...narration,
    lang: 'en',
    duration: t(narration.duration),
    segments: narration.segments.map((seg, i) => ({ ...seg, at: t(seg.at), until: t(seg.until), text: outSpoken[i].trim() })),
  };
  writeFileSync(outNarrationPath, JSON.stringify(outNarration, null, 1) + '\n');
  console.log(`English track written: ${outScreen.length} screen strings, ${outSpoken.length} narration segments; duration ${scene.duration}s.`);
} catch (error) {
  warn(error.message);
}
