import { loadAssets } from './assets';
import { loadScene, type StyleId } from './engine/scene';
import { H, W } from './render/globe';
import { STYLES } from './styles';
import { drawHook } from './templates/hook';

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

function draw(t: number, frame: number, assets: Awaited<typeof ready>) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  drawHook(ctx, assets, scene, STYLES[scene.style], t, frame);
}

declare global {
  interface Window { motion: { ready: Promise<{ fps: number; frames: number; id: string; style: string }>; frame: (i: number, format?: 'jpeg' | 'png') => string } }
}

let assetsLoaded: Awaited<typeof ready> | null = null;
window.motion = {
  ready: ready.then((a) => { assetsLoaded = a; return { fps: scene.fps, frames, id: scene.id, style: scene.style }; }),
  // the exporter's entry point: draw frame i and hand back the finished image
  // JPEG at 0.95 by default: several times faster to encode than PNG at this size, and the H.264
  // pass that follows discards far more than it does; `png` stays available for stills
  frame(i: number, format: 'jpeg' | 'png' = 'jpeg') {
    if (!assetsLoaded) throw new Error('assets not loaded');
    draw(i / scene.fps, i, assetsLoaded);
    return format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95);
  },
};

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
      fps.textContent = `${(1000 / Math.max(now - last, 1)).toFixed(0)} fps · kare ${avg.toFixed(1)} ms · stil ${scene.style}`;
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
