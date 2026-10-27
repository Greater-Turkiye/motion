// One text model call for the copy editors (nim-copy.mjs): Gemini first (GEMINI_API_KEY, the org secret
// the voice already uses; answers in seconds), then NVIDIA NIM (NVAPI, gemma) with a short timeout. NIM
// alone timed out three times in a row at 180 s on 2026-10-26, nine minutes for nothing, and the video
// went out with the generator's label hook ("GAZZE / RESMİ AÇIKLAMA"). Returns the answer's text, or
// throws when neither answers.
const GEMINI_MODELS = (process.env.GEMINI_TEXT_MODEL || 'gemini-flash-latest,gemini-2.5-flash').split(',').map((x) => x.trim()).filter(Boolean);
const NIM_MODEL = 'google/gemma-4-31b-it'; // fixed by the owner, not from an env var

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
        if (![429, 500, 502, 503, 504].includes(response.status)) break;
        await sleep(5000 * (attempt + 1));
      } catch (error) { last = error; await sleep(3000); }
    }
  }
  throw last;
}

async function nim(prompt, { temperature }) {
  const key = process.env.NVAPI?.trim();
  if (!key) throw new Error('NVAPI is not configured');
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(Number(process.env.NVIDIA_NIM_TIMEOUT || 60) * 1000),
    body: JSON.stringify({ model: NIM_MODEL, messages: [{ role: 'user', content: prompt }], temperature, top_p: 0.9, max_tokens: 1200, stream: false }),
  });
  if (!response.ok) throw new Error(`NVIDIA NIM HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json();
  return { text: body.choices?.[0]?.message?.content ?? '', model: NIM_MODEL };
}

export async function ask(prompt, { temperature = 0.4, json = true } = {}) {
  const errors = [];
  for (const call of [gemini, nim]) {
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
