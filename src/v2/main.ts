/**
 * Motion v2: a Three.js scene under a Canvas 2D text layer, behind the same `window.motion` API as the
 * globe page (src/main.ts), so export/render.mjs renders it with `--page v2.html`.
 *
 * Design B, "Yükselen Türkiye": the 81 provinces (geoBoundaries TUR ADM1, from OpenStreetMap) rise as
 * columns as tall as their population (TÜİK, ADNKS 2025). The camera makes one calm move at a time and
 * holds (the owner, 2026-10-25: quick back-and-forth moves tired the eye); every line is typed behind a
 * block cursor (the owner liked it better than text that appears at once).
 */
import * as THREE from 'three';

const W = 1080, H = 1920;
const LEFT = 72, RIGHT = W - 180, TOP = 300, BOTTOM = H - 400;
const TYPE_CPS = 45; // the globe page's typing speed (src/templates/video.ts)
const INK = '#1B1B1F', MUTED = '#6B6660', ACCENT = '#C8102E', PAPER = '#F3EFE6';

interface Key { t: number; at?: [number, number]; province?: string; z?: number; dist: number; tilt: number; az: number }
interface Beat { at: number; until: number; kicker?: string; lines: string[]; focus?: string; labels?: string[]; labelsAt?: number }
interface Spec { id: string; design: string; fps: number; duration: number; source: string; status: string; rise: [number, number]; height: number; camera: Key[]; beats: Beat[] }

const SPECS = import.meta.glob('../../scenes/v2/*.json', { eager: true, import: 'default' }) as Record<string, Spec>;
const params = new URLSearchParams(location.search);
const name = params.get('scene') || 'nufus-2025';
const spec = Object.entries(SPECS).find(([k]) => k.endsWith(`/${name}.json`))?.[1];
if (!spec) throw new Error(`no v2 scene ${name}`);

// --- small helpers -------------------------------------------------------------------------------
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => { x = clamp(x); return x * x * x * (x * (6 * x - 15) + 10); }; // smootherstep: no jolt at either end
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const fold = (s: string) => s.replace(/İ/g, 'I').replace(/ı/g, 'i').toLocaleUpperCase('en')
  .replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/Â/g, 'A').replace(/[^A-Z]/g, '');
const fmt = (n: number) => n.toLocaleString('tr-TR');
const COS = Math.cos((39 * Math.PI) / 180);
/** lon/lat to the map plane: one unit a degree of latitude, x shortened by cos 39° so shapes keep their proportions */
const plane = (lon: number, lat: number) => new THREE.Vector2((lon - 35.3) * COS, lat - 39);

// --- data ----------------------------------------------------------------------------------------
interface Province { name: string; key: string; pop: number; h: number; centre: THREE.Vector2; mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; base: THREE.Color; top: THREE.Group }

async function loadData() {
  const [adm, pop] = await Promise.all([
    fetch('data/tr-adm1.json').then((r) => r.json()) as Promise<{ provinces: { name: string; key: string; polygons: [number, number][][] }[] }>,
    fetch('data/tr-population-2025.json').then((r) => r.json()) as Promise<{ values: Record<string, number> }>,
  ]);
  return { adm: adm.provinces, pop: pop.values };
}

async function loadFonts() {
  const faces = [new FontFace('Schibsted', 'url(fonts/schibstedgrotesk.ttf)', { weight: '400 900' }),
    new FontFace('PlexMono', 'url(fonts/plexmono-500-latin.woff2)', { weight: '500' }),
    new FontFace('PlexMono', 'url(fonts/plexmono-500-latin-ext.woff2)', { weight: '500', unicodeRange: 'U+0100-024F' })];
  for (const f of faces) document.fonts.add(await f.load());
  // onload, as src/assets.ts does: decode() never settles in the exporter's background tabs
  return new Promise<HTMLImageElement | null>((res) => {
    const mark = new Image();
    mark.decoding = 'sync';
    mark.onload = () => res(mark); mark.onerror = () => res(null);
    mark.src = 'brand/mark.png';
  });
}

// --- the 3D scene --------------------------------------------------------------------------------
const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
gl.setPixelRatio(1);
gl.setSize(W, H, false);
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFSoftShadowMap;
gl.setClearColor(PAPER);
const scene3 = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 400);
// the picture's middle 120 px below the frame's, between the text block above and the source line below
camera.setViewOffset(W, H, 0, -120, W, H);
scene3.add(new THREE.HemisphereLight('#ffffff', '#d9cfc0', 1.9));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(-14, -10, 30); // high and from the south-west, so columns throw short shadows to the north-east
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 9, bottom: -9, near: 1, far: 80 });
sun.shadow.bias = -0.0008;
scene3.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ color: '#5a4a3a', opacity: 0.16 }));
ground.receiveShadow = true;
scene3.add(ground);

/** The palette from the light quake style: pale rose for the smallest province to flag red for the largest. */
const LOW = new THREE.Color('#F3C7C9'), HIGH = new THREE.Color('#C8102E');

function buildProvinces(data: Awaited<ReturnType<typeof loadData>>) {
  const max = Math.max(...Object.values(data.pop));
  const ranks = Object.values(data.pop).sort((a, b) => a - b);
  const out: Province[] = [];
  for (const p of data.adm) {
    const pop = data.pop[p.key];
    if (!pop) throw new Error(`no population for ${p.name}`);
    // rings close on their first point; a shape must not repeat it
    const open = (ring: [number, number][]) => (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring);
    const shapes = p.polygons.map((ring) => new THREE.Shape(open(ring).map(([lon, lat]) => plane(lon, lat))));
    // depth 1, scaled to the column's height each frame
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
    // the colour follows the rank, not the value: on a linear scale all but three provinces were the same pale pink
    const base = LOW.clone().lerp(HIGH, Math.pow(ranks.indexOf(pop) / (ranks.length - 1), 1.3));
    const mat = new THREE.MeshLambertMaterial({ color: base.clone() });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    // the top outline, a thin paper line, rides on the column's top
    const top = new THREE.Group();
    for (const ring of p.polygons) {
      const g = new THREE.BufferGeometry().setFromPoints(ring.map(([lon, lat]) => { const v = plane(lon, lat); return new THREE.Vector3(v.x, v.y, 0); }));
      top.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: '#FFF8F0', transparent: true, opacity: 0.85 })));
    }
    scene3.add(mesh, top);
    // the label point: the middle of the largest ring's bounding box, pulled toward its vertex mean
    const big = p.polygons.reduce((a, b) => (b.length > a.length ? b : a));
    const vs = big.map(([lon, lat]) => plane(lon, lat));
    const bb = new THREE.Box2().setFromPoints(vs);
    const mean = vs.reduce((a, v) => a.add(v), new THREE.Vector2()).divideScalar(vs.length);
    const centre = bb.getCenter(new THREE.Vector2()).lerp(mean, 0.5);
    out.push({ name: p.name, key: p.key, pop, h: (spec!.height * pop) / max, centre, mesh, mat, base, top });
  }
  return out;
}

// --- camera: keyframes, each move eased in and out, holds between them ----------------------------
function keyTarget(k: Key, provs: Map<string, Province>, rise: number) {
  if (k.province) {
    const p = provs.get(fold(k.province))!;
    return new THREE.Vector3(p.centre.x, p.centre.y, (k.z ?? 0) * p.h * rise);
  }
  const v = plane(k.at![0], k.at![1]);
  return new THREE.Vector3(v.x, v.y, 0);
}

function placeCamera(t: number, provs: Map<string, Province>, rise: number) {
  const ks = spec!.camera;
  let i = ks.findIndex((k) => k.t > t);
  if (i < 0) i = ks.length - 1;
  const a = ks[Math.max(0, i - 1)], b = ks[i];
  const u = a === b ? 1 : smooth(span(t, a.t, b.t));
  const target = keyTarget(a, provs, rise).lerp(keyTarget(b, provs, rise), u);
  const dist = a.dist + (b.dist - a.dist) * u;
  const tilt = THREE.MathUtils.degToRad(a.tilt + (b.tilt - a.tilt) * u);
  const az = THREE.MathUtils.degToRad(a.az + (b.az - a.az) * u);
  camera.position.set(target.x + dist * Math.sin(tilt) * Math.sin(az), target.y - dist * Math.sin(tilt) * Math.cos(az), target.z + dist * Math.cos(tilt));
  // screen-up is north when looking straight down and the sky when looking across: never degenerate
  camera.up.set(-Math.sin(az) * Math.cos(tilt), Math.cos(az) * Math.cos(tilt), Math.sin(tilt));
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

// --- the text layer -------------------------------------------------------------------------------
const out = document.getElementById('c') as HTMLCanvasElement;
out.width = W; out.height = H;
const ctx = out.getContext('2d', { alpha: false })!;

const runs = (text: string) => text.split('*').map((p, j) => ({ p, acc: j % 2 === 1 })).filter((r) => r.p);
const plain = (text: string) => text.replace(/\*/g, '');

/** A line typed behind a block cursor from t0; the cursor blinks three times a second and stays a moment after. */
function typed(text: string, x: number, y: number, t: number, t0: number, size: number, ink: string, alpha: number) {
  const n = Math.floor(Math.max(0, t - t0) * TYPE_CPS);
  if (n <= 0) return;
  let left = n, cx = x;
  ctx.globalAlpha = alpha;
  for (const r of runs(text)) {
    if (left <= 0) break;
    const s = r.p.slice(0, left); left -= r.p.length;
    ctx.fillStyle = r.acc ? ACCENT : ink; ctx.fillText(s, cx, y); cx += ctx.measureText(s).width;
  }
  if (n < plain(text).length + 12 && Math.floor((t - t0) * 6) % 2 === 0) { ctx.fillStyle = ACCENT; ctx.fillRect(cx + 6, y - size * 0.74, size * 0.42, size * 0.84); }
}
const typeEnd = (lines: string[], t0: number) => t0 + lines.reduce((a, l) => a + plain(l).length, 0) / TYPE_CPS + 0.08 * lines.length;

/** Where the text block of the beat on screen ends; labels keep below it. */
let textBottom = TOP;
const blockBottom = (b: Beat) => TOP + 40 + (b.kicker ? 92 : 0) + (b.lines.length - 1) * 88 + 40;

function drawBeat(b: Beat, t: number) {
  const fade = 1 - span(t, b.until - 0.35, b.until);
  if (t < b.at || fade <= 0) return;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let y = TOP + 40, t0 = b.at;
  if (b.kicker) {
    ctx.font = '500 30px PlexMono'; ctx.letterSpacing = '3px';
    typed(b.kicker, LEFT, y, t, t0, 30, ACCENT, fade);
    ctx.letterSpacing = '0px';
    t0 += b.kicker.length / TYPE_CPS + 0.1; y += 92;
  }
  ctx.font = '800 74px Schibsted';
  b.lines.forEach((l, k) => {
    const start = k === 0 ? t0 : typeEnd(b.lines.slice(0, k), t0);
    typed(l, LEFT, y + k * 88, t, start, 74, INK, fade);
  });
  ctx.globalAlpha = 1;
}

/** A province's name and population over its column, joined to it by a short line. */
function drawLabel(p: Province, t: number, t0: number, alpha: number, rise: number) {
  const v = new THREE.Vector3(p.centre.x, p.centre.y, p.h * rise).project(camera);
  if (v.z > 1) return;
  const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
  const a = alpha * smooth(span(t, t0, t0 + 0.5));
  if (a <= 0) return;
  ctx.font = '800 40px Schibsted';
  const n1 = p.name.toLocaleUpperCase('tr'), n2 = `${fmt(p.pop)} kişi`;
  const w1 = ctx.measureText(n1).width; ctx.font = '500 26px PlexMono'; const w2 = ctx.measureText(n2).width;
  const bw = Math.max(w1, w2) + 32, bh = 92;
  // above the column's top; beside it when that would run into the text block (a tall column's top
  // can stand right under the headline), on the side with more room
  let bx = clamp(x - bw / 2, LEFT, RIGHT - bw), by = y - 90 - bh, ex = x, ey = by + bh;
  if (by < textBottom) {
    by = clamp(y - bh / 2, textBottom, BOTTOM - bh);
    bx = x + 40 + bw < RIGHT ? x + 40 : Math.max(LEFT, x - 40 - bw);
    ex = bx > x ? bx : bx + bw; ey = by + bh / 2;
  }
  ctx.globalAlpha = a;
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,250,244,0.92)'; ctx.fillRect(bx, by, bw, bh);
  ctx.textAlign = 'left';
  ctx.font = '800 40px Schibsted'; typed(n1, bx + 16, by + 44, t, t0, 40, INK, a);
  ctx.font = '500 26px PlexMono'; typed(n2, bx + 16, by + 78, t, t0 + n1.length / TYPE_CPS, 26, MUTED, a);
  ctx.globalAlpha = 1;
}

function drawFurniture(mark: HTMLImageElement | null) {
  // our mark and address, small, in the top corner (as on the globe page)
  ctx.globalAlpha = 0.5;
  let x = LEFT;
  if (mark) { ctx.drawImage(mark, x, TOP - 60, 34, 34); x += 46; }
  ctx.font = '500 18px PlexMono'; ctx.letterSpacing = '1px'; ctx.textAlign = 'left';
  ctx.fillStyle = MUTED; ctx.fillText('greaterturkiye.org', x, TOP - 34);
  ctx.globalAlpha = 1;
  // the source and the status, always on screen
  ctx.font = '500 22px PlexMono'; ctx.letterSpacing = '0px';
  ctx.fillStyle = ACCENT; ctx.fillText(spec!.status, LEFT, BOTTOM + 40);
  ctx.fillStyle = MUTED;
  const words = spec!.source.split(' '); let line = '', y = BOTTOM + 76;
  for (const w of words) {
    if (ctx.measureText(line + w).width > RIGHT - LEFT && line) { ctx.fillText(line.trim(), LEFT, y); line = ''; y += 32; }
    line += w + ' ';
  }
  ctx.fillText(line.trim(), LEFT, y);
}

// --- one frame ---------------------------------------------------------------------------------------
let provs: Province[] = [];
let byKey = new Map<string, Province>();
let mark: HTMLImageElement | null = null;
const LIGHT = new THREE.Color('#EFE7DC');

function draw(t: number) {
  const rise = smooth(span(t, spec!.rise[0], spec!.rise[1]));
  // the focused province keeps its colour; the others pale toward the paper while it is the subject
  const beat = spec!.beats.find((b) => t >= b.at - 0.6 && t < b.until);
  const focus = beat?.focus ? byKey.get(fold(beat.focus)) : undefined;
  const fIn = beat?.focus ? smooth(span(t, beat.at - 0.6, beat.at + 0.6)) * (1 - smooth(span(t, beat.until - 0.5, beat.until + 0.3))) : 0;
  for (const p of provs) {
    const s = Math.max(0.035, p.h * rise);
    p.mesh.scale.set(1, 1, s);
    p.top.position.z = s + 0.002;
    p.mat.color.copy(p.base).lerp(LIGHT, focus && p !== focus ? 0.6 * fIn : 0);
  }
  placeCamera(t, byKey, rise);
  gl.render(scene3, camera);
  ctx.globalAlpha = 1;
  ctx.drawImage(gl.domElement, 0, 0);
  textBottom = Math.max(TOP, ...spec!.beats.filter((b) => t >= b.at && t < b.until).map(blockBottom));
  for (const b of spec!.beats) {
    if (t < b.at || t >= b.until + 0.4) continue;
    const fade = 1 - span(t, b.until - 0.35, b.until);
    for (const n of b.labels ?? []) { const p = byKey.get(fold(n)); if (p) drawLabel(p, t, b.labelsAt ?? b.at + 0.4, fade, rise); }
  }
  for (const b of spec!.beats) drawBeat(b, t);
  drawFurniture(mark);
}

const frames = Math.round(spec.duration * spec.fps);
declare global {
  interface Window { motion: { ready: Promise<{ fps: number; frames: number; id: string; style: string; renderer: string }>; frame: (i: number, format?: 'jpeg' | 'png') => string; encode?: (bitrate?: number) => Promise<string> } }
}
const ready = Promise.all([loadData(), loadFonts()]).then(([data, m]) => {
  provs = buildProvinces(data);
  byKey = new Map(provs.map((p) => [p.key, p]));
  mark = m;
  return { fps: spec!.fps, frames, id: spec!.id, style: `v2${spec!.design}`, renderer: 'three' };
});
window.motion = {
  ready,
  frame(i: number, format: 'jpeg' | 'png' = 'jpeg') {
    draw(i / spec!.fps);
    return format === 'png' ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.95);
  },
};

// in a normal browser tab: play it
if (!params.has('export')) {
  ready.then(() => {
    const t0 = performance.now();
    const loop = () => { draw(((performance.now() - t0) / 1000) % spec!.duration); requestAnimationFrame(loop); };
    loop();
  });
}
