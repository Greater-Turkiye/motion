// Render a scene to video, frame by frame.
//
//   node export/render.mjs                                   # hook-karadeniz, its own style
//   node export/render.mjs --scene hook-karadeniz --style B
//   node export/render.mjs --all-styles                      # one video per style
//   node export/render.mjs --frames-only --every 10          # hashes only (determinism test)
//   node export/render.mjs --format png                      # lossless frames (slower)
//   node export/render.mjs --workers 4                       # pages drawing frames at once
//   node export/render.mjs --save-frames                     # also write every frame to out/<name>-frames/
//   node export/render.mjs --encoder ffmpeg                  # skip WebCodecs (auto tries it first)
//
// The page draws frame i when asked and hands back the finished image; nothing depends on the wall
// clock, so the output is exactly `fps` frames per second however long each frame takes to draw.
// Frames are piped as PNG into ffmpeg (H.264, yuv420p, faststart). A JSON file next to each video
// lists every frame's SHA-256, which is how two renders are proven identical.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) { args.set(a.slice(2), next); i++; } else args.set(a.slice(2), true);
}
const SCENE = args.get('scene') || 'hook-karadeniz';
const STYLES = args.has('all-styles') ? ['A', 'B', 'C', 'D'] : [args.get('style') || null];
const FRAMES_ONLY = args.has('frames-only');
const EVERY = Number(args.get('every') || 1);
const FORMAT = args.get('format') === 'png' ? 'png' : 'jpeg';
const ENCODER = args.get('encoder') || 'auto'; // auto | webcodecs | ffmpeg
const OUT = path.resolve(ROOT, args.get('out') || 'out');
const CHROME = args.get('chrome') || process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
if (!CHROME) { console.error('no Chrome found; pass --chrome'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. build the page and serve it
if (!args.has('no-build')) await build({ root: ROOT, logLevel: 'warn' });
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.geojson': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = existsSync(p) && statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

// 2. a headless Chrome at exactly the frame size
const port = 9400 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text',
  // WebGL2 everywhere: the real GPU where there is one, SwiftShader on a runner without one
  '--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'motion-'))}`, 'about:blank'], { stdio: 'ignore' });
let up = false;
for (let i = 0; i < 80 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); up = true; } catch { await sleep(250); } }
if (!up) { console.error('Chrome did not start'); process.exit(2); }

async function page() {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'info' || d.params.type === 'warning')) console.log('  page: ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  return { ws, send, errors };
}

const evaluate = async (p, expression) => {
  const r = await p.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluation failed');
  return r.result?.result?.value;
};

mkdirSync(OUT, { recursive: true });
// Frames do not depend on each other, so several pages draw them at once and a small reorder
// buffer hands them to ffmpeg in order. Each page is its own renderer; the output is the same as
// with one page, frame for frame (the determinism test checks it).
const WORKERS = Math.max(1, Number(args.get('workers') || Math.min(4, Math.max(1, Math.floor(cpus().length / 2)))));

async function openScene(style) {
  const p = await page();
  const q = new URLSearchParams({ scene: SCENE, export: '1' });
  if (style) q.set('style', style);
  await p.send('Page.navigate', { url: base + '?' + q });
  let info = null;
  for (let i = 0; i < 160 && !info; i++) { await sleep(250); try { info = await evaluate(p, 'window.motion && window.motion.ready'); } catch { /* not yet */ } }
  if (!info) throw new Error('page never became ready: ' + p.errors.join('; '));
  return { p, info };
}

let failed = false;
for (const style of STYLES) {
  // WebCodecs first: the page encodes its own MP4 and hands back the file. Falls back to drawing
  // frames in parallel tabs and piping them to ffmpeg when the browser cannot encode.
  if (!FRAMES_ONLY && ENCODER !== 'ffmpeg') {
    const { p, info } = await openScene(style);
    const t0 = Date.now();
    try {
      // a time limit, so a browser whose encoder stalls falls back instead of holding the job
      const limit = Math.max(120, info.frames * 1.5) * 1000;
      const b64 = await Promise.race([evaluate(p, 'window.motion.encode()'),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`WebCodecs took longer than ${limit / 1000} s`)), limit))]);
      const name = `${info.id}-${info.style}`;
      writeFileSync(path.join(OUT, `${name}.mp4`), Buffer.from(b64, 'base64'));
      console.log(`${name}: ${info.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s with WebCodecs (${info.renderer}) -> ${path.relative(ROOT, path.join(OUT, name + '.mp4'))}`);
      if (p.errors.length) { console.error('page errors:', p.errors); failed = true; }
      p.ws.close();
      continue;
    } catch (e) {
      if (ENCODER === 'webcodecs') throw e;
      console.log(`WebCodecs unavailable (${String(e.message).split('\n')[0]}); falling back to ffmpeg`);
      p.ws.close();
    }
  }
  const pages = await Promise.all(Array.from({ length: WORKERS }, () => openScene(style)));
  const info = pages[0].info;
  const name = `${info.id}-${info.style}`;
  const video = path.join(OUT, `${name}.mp4`);
  const ff = FRAMES_ONLY ? null : spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', FORMAT === 'png' ? 'png' : 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { stdio: ['pipe', 'inherit', 'inherit'] });
  const wanted = [];
  for (let i = 0; i < info.frames; i += FRAMES_ONLY ? EVERY : 1) wanted.push(i);
  const hashes = new Array(wanted.length);
  const done = new Map();
  let next = 0, written = 0;
  const t0 = Date.now();
  const flush = async () => {
    while (done.has(written)) {
      const buf = done.get(written); done.delete(written);
      if (ff && !ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      written++;
    }
  };
  let flushing = Promise.resolve();
  await Promise.all(pages.map(async ({ p }) => {
    while (next < wanted.length) {
      const k = next++;
      const url = await evaluate(p, `window.motion.frame(${wanted[k]}, '${FORMAT}')`);
      const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      hashes[k] = createHash('sha256').update(buf).digest('hex');
      if (args.has('save-frames')) { const dir = path.join(OUT, `${name}-frames`); mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, `${String(wanted[k]).padStart(4, '0')}.${FORMAT === 'png' ? 'png' : 'jpg'}`), buf); }
      done.set(k, buf);
      flushing = flushing.then(flush);
      if (k % 60 === 0) process.stdout.write(`\r${name}: frame ${wanted[k]}/${info.frames} (${WORKERS} workers)`);
    }
  }));
  await flushing;
  if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
  const secs = (Date.now() - t0) / 1000;
  writeFileSync(path.join(OUT, `${name}.frames.json`), JSON.stringify({ scene: info.id, style: info.style, fps: info.fps, every: FRAMES_ONLY ? EVERY : 1, hashes }, null, 0));
  console.log(`\r${name}: ${hashes.length} frames in ${secs.toFixed(1)} s with ${WORKERS} workers${ff ? ' -> ' + path.relative(ROOT, video) : ''}          `);
  for (const { p } of pages) {
    if (p.errors.length) { console.error('page errors:', p.errors); failed = true; }
    p.ws.close();
  }
}
chrome.kill();
server.close();
process.exit(failed ? 1 : 0);
