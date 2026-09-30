import { loadAssets } from './assets';
import { loadScene, type StyleId } from './engine/scene';
import { H, W } from './render/globe';
import { STYLES } from './styles';
import { drawVideo, screenMotion } from './templates/video';
import { Accumulator } from './gl/accum';
import { makeMap, type MapRenderer } from './render/map';

// hand-written scenes in scenes/, generated ones in scenes/auto/; a scene is found by its file name
const SCENES = import.meta.glob('../scenes/**/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const params = new URLSearchParams(location.search);
const name = params.get('scene') || 'hook-karadeniz';
const text = Object.entries(SCENES).find(([k]) => k.endsWith(`/${name}.yaml`))?.[1];
if (!text) throw new Error(`no scene ${name}`);
const scene = loadScene(text);
const styleParam = params.get('style') as StyleId | null;
if (styleParam && STYLES[styleParam]) scene.style = styleParam;
const exporting = params.has('export');
// the motion language belongs to the style; the URL can still override it for experiments
// (?text=pop&camera=fly&progress=1&blur=0), never the production pipeline
const A = (scene.anim ||= {});
const pick = <T extends string>(v: string | null, ok: readonly T[]) => (v && (ok as readonly string[]).includes(v) ? (v as T) : undefined);
A.text = pick(params.get('text'), ['rise', 'wipe', 'type', 'pop'] as const) ?? A.text;
A.camera = pick(params.get('camera'), ['glide', 'fly', 'snap'] as const) ?? A.camera;
if (params.has('progress')) A.progress = params.get('progress') !== '0';
if (params.has('blur')) A.blur = params.get('blur') !== '0';

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
// GPU canvas in both modes: a CPU canvas was slower and no more repeatable across browser processes
// (see export/determinism.mjs for what does and does not vary)
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })!;

const frames = Math.round(scene.duration * scene.fps);
const ready = loadAssets(scene.subject?.emblem ? [scene.subject.emblem] : []);

let map: MapRenderer | null = null;
const prefer = params.get('renderer') === 'canvas2d' ? 'canvas2d' : 'webgl2';
function draw(t: number, frame: number, assets: Awaited<typeof ready>) {
  map ??= makeMap(assets, scene.subject?.country, prefer);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  drawVideo(ctx, assets, map, scene, STYLES[scene.style], t, frame);
}

/**
 * One exported frame: several sub-frames spread over half a frame's time (a 180° shutter) when the
 * camera moves fast enough to judder, averaged and dithered by the accumulator; a still or slow
 * frame is drawn once and only dithered. The number of sub-frames follows the motion, so the cost
 * is paid where the eye would see the difference.
 */
let accum: Accumulator | null | undefined;
function exportFrame(i: number, assets: Awaited<typeof ready>) {
  const t = i / scene.fps;
  accum ??= Accumulator.make(W, H);
  if (!accum) { draw(t, i, assets); return; }
  const px = A.blur === false ? 0 : screenMotion(scene, STYLES[scene.style], t, 1 / scene.fps);
  const n = px < 1.5 ? 1 : px < 4 ? 2 : px < 10 ? 4 : 6;
  accum.begin();
  for (let k = 0; k < n; k++) {
    draw(Math.max(0, n === 1 ? t : t + ((k + 0.5) / n - 0.5) * 0.5 / scene.fps), i, assets);
    accum.push(canvas);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(accum.finish(), 0, 0);
}

declare global {
  interface Window { motion: { ready: Promise<{ fps: number; frames: number; id: string; style: string; renderer: string }>; frame: (i: number, format?: 'jpeg' | 'png') => string; encode?: (bitrate?: number) => Promise<string> } }
}

let assetsLoaded: Awaited<typeof ready> | null = null;
window.motion = {
  ready: ready.then((a) => { assetsLoaded = a; map ??= makeMap(a, scene.subject?.country, prefer); return { fps: scene.fps, frames, id: scene.id, style: scene.style, renderer: map.kind }; }),
  // the exporter's entry point: draw frame i and hand back the finished image
  // JPEG at 0.95 by default: several times faster to encode than PNG at this size, and the H.264
  // pass that follows discards far more than it does; `png` stays available for stills
  frame(i: number, format: 'jpeg' | 'png' = 'jpeg') {
    if (!assetsLoaded) throw new Error('assets not loaded');
    exportFrame(i, assetsLoaded);
    return format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95);
  },
};

/**
 * Encode the whole scene inside the page: each frame goes from the canvas straight to the browser's
 * H.264 encoder (hardware where there is one) and into an MP4, with no image copied out of the GPU
 * or through the DevTools protocol. Returns the file as base64; throws when the browser cannot
 * encode this size, and the exporter falls back to ffmpeg.
 */
async function encode(bitrate = 16_000_000): Promise<string> {
  if (!assetsLoaded) throw new Error('assets not loaded');
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs is not available');
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  // High profile where the platform encoder has it; Baseline for Chrome's software encoder
  // (OpenH264, on a runner without a GPU), which supports nothing else
  let config: VideoEncoderConfig | null = null;
  for (const codec of ['avc1.640033', 'avc1.42E033']) {
    const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate, framerate: scene.fps, avc: { format: 'avc' } };
    if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; }
  }
  if (!config) throw new Error('this browser cannot encode 1080x1920 H.264');
  console.info(`encoder ${config.codec}`);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: scene.fps }, fastStart: 'in-memory' });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e as Error; } });
  encoder.configure(config);
  const us = 1e6 / scene.fps;
  const started = performance.now();
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    exportFrame(i, assetsLoaded);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(i * us), duration: Math.round(us) });
    encoder.encode(vf, { keyFrame: i % (scene.fps * 2) === 0 });
    vf.close();
    // wait for the encoder to catch up, but never forever: a dequeue event that does not come must not hang an export
    while (encoder.encodeQueueSize > 6) await new Promise((r) => { encoder.addEventListener('dequeue', r, { once: true }); setTimeout(r, 50); });
    if (i % 60 === 0) console.info(`encode ${i}/${frames} ${Math.round(performance.now() - started)} ms`);
  }
  await encoder.flush();
  if (failure) throw failure;
  muxer.finalize();
  const bytes = new Uint8Array(muxer.target.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
window.motion.encode = encode;

if (!exporting) {
  // preview: the same drawing, driven by the real clock, looping
  const ui = document.getElementById('ui')!;
  ui.hidden = false;
  const bar = document.getElementById('bar') as HTMLInputElement;
  const fps = document.getElementById('fps')!;
  let playing = true, start = performance.now(), paused = 0, last = performance.now(), avg = 16.7;
  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => b.addEventListener('click', () => {
    const u = new URL(location.href); u.searchParams.set('style', b.dataset.style!); location.href = u.toString();
  }));
  document.getElementById('play')!.addEventListener('click', () => {
    playing = !playing;
    if (playing) start = performance.now() - paused * 1000; else paused = ((performance.now() - start) / 1000) % scene.duration;
  });
  bar.addEventListener('input', () => { playing = false; paused = (Number(bar.value) / 1000) * scene.duration; });
  ready.then((a) => {
    const loop = (now: number) => {
      const t = playing ? ((now - start) / 1000) % scene.duration : paused;
      const t0 = performance.now();
      draw(t, Math.floor(t * scene.fps), a);
      avg = avg * 0.9 + (performance.now() - t0) * 0.1;
      if (playing) bar.value = String(Math.round((t / scene.duration) * 1000));
      fps.textContent = `${(1000 / Math.max(now - last, 1)).toFixed(0)} fps · kare ${avg.toFixed(1)} ms · stil ${scene.style} · ${map?.kind}`;
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
