import { loadAssets } from './assets';
import { loadScene, type StyleId } from './engine/scene';
import { H, W } from './render/globe';
import { STYLES } from './styles';
import { drawHook } from './templates/hook';
import { makeMap, type MapRenderer } from './render/map';

const SCENES = import.meta.glob('../scenes/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const params = new URLSearchParams(location.search);
const name = params.get('scene') || 'hook-karadeniz';
const text = SCENES[`../scenes/${name}.yaml`];
if (!text) throw new Error(`no scene ${name}`);
const scene = loadScene(text);
const styleParam = params.get('style') as StyleId | null;
if (styleParam && STYLES[styleParam]) scene.style = styleParam;
const exporting = params.has('export');

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
  drawHook(ctx, assets, map, scene, STYLES[scene.style], t, frame);
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
    draw(i / scene.fps, i, assetsLoaded);
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
  const config: VideoEncoderConfig = { codec: 'avc1.640033', width: W, height: H, bitrate, framerate: scene.fps, avc: { format: 'avc' } };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error('this browser cannot encode 1080x1920 H.264');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: scene.fps }, fastStart: 'in-memory' });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e as Error; } });
  encoder.configure(config);
  const us = 1e6 / scene.fps;
  const started = performance.now();
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    draw(i / scene.fps, i, assetsLoaded);
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
