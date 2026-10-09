import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { validate, words } from '../../src/engine/scene.ts';

const [scenePath, narrationPath] = process.argv.slice(2);
const apiKey = process.env.NVAPI?.trim();
const timeoutSeconds = Number(process.env.NVIDIA_NIM_TIMEOUT || 90);
if (!scenePath || !narrationPath) throw new Error('usage: node tools/scene/nim-copy.mjs <scene.yaml> <narration.json>');
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 120) throw new Error('NVIDIA_NIM_TIMEOUT must be 10-120 seconds');
if (!apiKey) {
  console.log('NVAPI is not configured; keeping deterministic source copy.');
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
  'spoken_segments sayısı ve sırası verilen narration ile aynı kalmalı. Her cümledeki tüm isimleri, eylemleri ve sayıları koru; yalnızca akıcılık, durak ve noktalama düzenle.',
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

function spokenCandidate(text, original) {
  if (typeof text !== 'string' || !text.trim() || text.length > Math.max(original.length + 12, 220)) return false;
  const testScene = {
    ...scene,
    duration: 90,
    beats: [],
    camera: { ...scene.camera, keys: undefined },
    source_text: [...facts, original],
    hook: { ...scene.hook, lines: [text], sub: '' },
  };
  return validate(testScene).length === 0;
}

try {
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
    body: JSON.stringify({
      model: process.env.NVIDIA_NIM_MODEL || 'google/gemma-4-31b-it',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.35,
      top_p: 0.9,
      max_tokens: 900,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`NVIDIA NIM HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const result = await response.json();
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
      narration.nim_model = process.env.NVIDIA_NIM_MODEL || 'google/gemma-4-31b-it';
      writeFileSync(narrationPath, JSON.stringify(narration, null, 1) + '\n');
    }
    console.log(`NIM spoken-copy segments accepted: ${changed}/${narration.segments.length}.`);
  } else {
    console.log('NIM narration rejected; keeping deterministic narration.');
  }
} catch (error) {
  console.warn(`NIM copy unavailable; keeping deterministic text: ${error.message}`);
}