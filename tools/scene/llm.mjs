// One text model call for the copy editors (nim-copy.mjs): Gemini first (GEMINI_API_KEY, the org secret
// the voice already uses; answers in seconds), then NVIDIA NIM (NVAPI, gemma) with a short timeout. NIM
// alone timed out three times in a row at 180 s on 2026-10-26, nine minutes for nothing, and the video
// went out with the generator's label hook ("GAZZE / RESMİ AÇIKLAMA"). Returns the answer's text, or
// throws when neither answers. The model: gemini-3.8-flash (2.5 is closed to new keys, HTTP 404 on 2026-10-27).
const GEMINI_MODELS = (process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash,gemini-flash-latest').split(',').map((x) => x.trim()).filter(Boolean);
// gemma first, fixed by the owner (not from an env var); when its shared endpoint is overloaded (529 on
// every call, 2026-10-27) the same key reaches other hosted models, fixed here too
const NIM_MODELS = ['google/gemma-4-31b-it', 'meta/llama-3.3-70b-instruct', 'qwen/qwen3-next-80b-a3b-instruct'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gemini(prompt, { temperature, json }) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  let last;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
          }),
        });
        if (response.ok) {
          const body = await response.json();
          const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
          if (text.trim()) return { text, model };
          last = new Error(`Gemini ${model} returned no text`);
          break;
        }
        last = new Error(`Gemini ${model} HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        console.log(last.message.split(/\r?\n/)[0]);
        if (![429, 500, 502, 503, 504].includes(response.status)) break;
        await sleep(5000 * (attempt + 1));
      } catch (error) { last = error; await sleep(3000); }
    }
  }
  throw last;
}

// an OpenAI-style chat endpoint, retried on the busy answers (429, 5xx and NIM's own 529)
async function chat(label, url, key, model, prompt, temperature, timeoutS) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutS * 1000),
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature, top_p: 0.9, max_tokens: 1200, stream: false }),
      });
      if (response.ok) {
        const text = (await response.json()).choices?.[0]?.message?.content ?? '';
        if (text.trim()) return { text, model };
        last = new Error(`${label} ${model} returned no text`);
      } else {
        last = new Error(`${label} ${model} HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        if (![429, 500, 502, 503, 504, 529].includes(response.status)) break;
      }
    } catch (error) { last = error; }
    console.log(String(last?.message ?? last).split(/\r?\n/)[0]);
    await sleep(10_000 * (attempt + 1));
  }
  throw last;
}

async function nim(prompt, { temperature }) {
  const key = process.env.NVAPI?.trim();
  if (!key) throw new Error('NVAPI is not configured');
  let last;
  for (const model of NIM_MODELS) {
    try { return await chat('NIM', 'https://integrate.api.nvidia.com/v1/chat/completions', key, model, prompt, temperature, Number(process.env.NVIDIA_NIM_TIMEOUT || 60)); } catch (error) { last = error; }
  }
  throw last;
}

// Hugging Face's inference router (HF_TOKEN, an org secret the voice tools already have): the third
// way, since the Gemini key has no free text tier ("free tier is not available for this project",
// 2026-10-27) and NIM answers 529 when its shared endpoint is busy
const HF_MODELS = (process.env.HF_TEXT_MODEL || 'Qwen/Qwen3-235B-A22B-Instruct-2507,meta-llama/Llama-3.3-70B-Instruct').split(',').map((x) => x.trim()).filter(Boolean);
async function hf(prompt, { temperature }) {
  const key = process.env.HF_TOKEN?.trim();
  if (!key) throw new Error('HF_TOKEN is not configured');
  let last;
  for (const model of HF_MODELS) {
    try { return await chat('HF', 'https://router.huggingface.co/v1/chat/completions', key, model, prompt, temperature, 90); } catch (error) { last = error; }
  }
  throw last;
}

export async function ask(prompt, { temperature = 0.4, json = true } = {}) {
  const errors = [];
  for (const call of [gemini, nim, hf]) {
    try { return await call(prompt, { temperature, json }); } catch (error) { errors.push(error.message); console.log(`${call.name}: ${error.message}`); }
  }
  throw new Error(errors.join(' | '));
}

export function responseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the model did not return a JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

// a one-line check of the keys and models from CI (llm-check.yml): node tools/scene/llm.mjs
if (process.argv[1]?.endsWith('llm.mjs')) {
  const r = await ask('Return JSON {"ok":true,"word":"merhaba"}', { temperature: 0 });
  console.log(`${r.model}: ${r.text.trim().slice(0, 120)}`);
}
