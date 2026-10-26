/**
 * Motion v2, design D, "Şehre iniş": from high over the city to the street. The ground is Sentinel-2
 * cloudless imagery (EOX, 2016, CC BY 4.0), a wide picture and a detailed one feathered into it; the
 * buildings are OpenStreetMap's footprints (ODbL) raised to their tagged heights, ring by ring from the
 * focus outward as the camera comes down, under a low sun that throws long shadows. One calm camera move
 * at a time, typed lines, the source line on screen: the rules of the globe page (CLAUDE.md section 4).
 */
import * as THREE from 'three';

const W = 1080, H = 1920;
const LEFT = 72, RIGHT = W - 180, TOP = 300, BOTTOM = H - 400;
const PANEL_TOP = 640, PANEL_BOTTOM = BOTTOM - 20; // the picture window between the text panel and the source panel
const TYPE_CPS = 45;
const INK = '#16181B', MUTED = '#5F625E', ACCENT = '#C8102E', PAPER = '#F2F0EA';

interface Key { t: number; at: [number, number]; z?: number; dist: number; tilt: number; az: number }
interface Beat { at: number; until: number; kicker?: string; lines: string[] }
interface Place { name: string; at: [number, number]; from: number; until: number }
interface Spec { id: string; design: string; fps: number; duration: number; city: string; wide: string; focus: [number, number];
  source: string; status: string; rise: [number, number]; camera: Key[]; beats: Beat[]; places: Place[] }
interface City { centre: [number, number]; box: [number, number, number, number]; buildings: ([number, number[]] | [number, number[], string])[] }
interface Picture { box: [number, number, number, number] }

const SPECS = import.meta.glob('../../scenes/v2/*.json', { eager: true, import: 'default' }) as Record<string, Spec>;
const params = new URLSearchParams(location.search);
const name = params.get('scene') || 'istanbul-levent';
const spec = Object.entries(SPECS).find(([k]) => k.endsWith(`/${name}.json`))?.[1];
if (!spec) throw new Error(`no v2 scene ${name}`);

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => { x = clamp(x); return x * x * x * (x * (6 * x - 15) + 10); };
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

// --- loading ---------------------------------------------------------------------------------------------
const json = <T>(u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json() as Promise<T>; });
const image = (u: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.decoding = 'sync'; i.onload = () => res(i); i.onerror = () => rej(new Error('image failed: ' + u)); i.src = u; });

async function loadFonts() {
  const faces = [new FontFace('Schibsted', 'url(fonts/schibstedgrotesk.ttf)', { weight: '400 900' }),
    new FontFace('PlexMono', 'url(fonts/plexmono-500-latin.woff2)', { weight: '500' }),
    new FontFace('PlexMono', 'url(fonts/plexmono-500-latin-ext.woff2)', { weight: '500', unicodeRange: 'U+0100-024F' })];
  for (const f of faces) document.fonts.add(await f.load());
}

// --- the scene ---------------------------------------------------------------------------------------------
const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false, logarithmicDepthBuffer: true });
gl.setPixelRatio(1);
gl.setSize(W, H, false);
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFSoftShadowMap;
const SKY = new THREE.Color('#D9DFE2');
gl.setClearColor(SKY);
const scene3 = new THREE.Scene();
scene3.fog = new THREE.Fog(SKY, 1e5, 2e5);
const camera = new THREE.PerspectiveCamera(32, W / H, 5, 400000);
// the picture's middle between the text panel and the source panel
camera.setViewOffset(W, H, 0, -((PANEL_TOP + PANEL_BOTTOM) / 2 - H / 2), W, H);
scene3.add(new THREE.HemisphereLight('#eef2f6', '#6f675c', 0.9));
const sun = new THREE.DirectionalLight('#ffe0b8', 3.4);
// low and from the south-west (about 20 degrees up): long shadows to the north-east, toward the Bosphorus
sun.position.set(-5600, -3900, 2500);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -4200, right: 4200, top: 3600, bottom: -3600, near: 100, far: 16000 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.5;
scene3.add(sun, sun.target);

let kx = 1, ky = 1, lon0 = 0, lat0 = 0;
const local = (lon: number, lat: number) => new THREE.Vector2((lon - lon0) * kx, (lat - lat0) * ky);

/** A satellite picture on the ground; `feather` fades its edges into what lies under it. */
function groundPlane(img: HTMLImageElement, box: Picture['box'], z: number, feather: number) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  if (feather > 0) {
    // the edges fade over `feather` of the picture: no seam where the detailed picture meets the wide one
    g.globalCompositeOperation = 'destination-in';
    const f = feather * Math.min(c.width, c.height);
    for (const [x0, y0, x1, y1] of [[0, 0, f, 0], [c.width, 0, c.width - f, 0], [0, 0, 0, f], [0, c.height, 0, c.height - f]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = gl.capabilities.getMaxAnisotropy();
  const a = local(box[0], box[1]), b = local(box[2], box[3]);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.x - a.x, b.y - a.y),
    new THREE.MeshBasicMaterial({ map: tex, transparent: feather > 0, depthWrite: feather === 0 }));
  mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z);
  scene3.add(mesh);
  return mesh;
}

/** The buildings in rings of distance from the focus, each ring one merged mesh that rises on its own. */
function buildRings(city: City, focus: THREE.Vector2) {
  const RING = 650, N = 9;
  const pos: number[][] = Array.from({ length: N }, () => []), col: number[][] = Array.from({ length: N }, () => []);
  const low = new THREE.Color('#E4DDD0'), tall = new THREE.Color('#A9B7C3'), roof = new THREE.Color();
  for (const b of city.buildings) {
    const h = b[0], xy = b[1];
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < xy.length; i += 2) pts.push(new THREE.Vector2(xy[i], xy[i + 1]));
    if (pts.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const mid = pts.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(pts.length);
    const k = Math.min(N - 1, Math.floor(mid.distanceTo(focus) / RING));
    const P = pos[k], C = col[k];
    // towers in a cool glass grey, the low city in warm concrete
    const wall = low.clone().lerp(tall, clamp((h - 30) / 90));
    // roofs a step lighter than the walls, so a block reads as a volume even in flat light
    roof.copy(wall).offsetHSL(0, -0.02, 0.09);
    // z is the building's own height; the ring's scale.z animates the rise
    const push = (x: number, y: number, z: number, c: THREE.Color) => { P.push(x, y, z); C.push(c.r, c.g, c.b); };
    for (const [i, j, l] of THREE.ShapeUtils.triangulateShape(pts, [])) {
      push(pts[i].x, pts[i].y, h, roof); push(pts[j].x, pts[j].y, h, roof); push(pts[l].x, pts[l].y, h, roof);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      push(p.x, p.y, 0, wall); push(q.x, q.y, 0, wall); push(q.x, q.y, h, wall);
      push(p.x, p.y, 0, wall); push(q.x, q.y, h, wall); push(p.x, p.y, h, wall);
    }
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return pos.map((P, k) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col[k], 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.scale.z = 0.001;
    scene3.add(m);
    return m;
  });
}

// --- camera ------------------------------------------------------------------------------------------------
function placeCamera(t: number) {
  const ks = spec!.camera;
  let i = ks.findIndex((k) => k.t > t);
  if (i < 0) i = ks.length - 1;
  const a = ks[Math.max(0, i - 1)], b = ks[i];
  const u = a === b ? 1 : smooth(span(t, a.t, b.t));
  const pa = local(a.at[0], a.at[1]), pb = local(b.at[0], b.at[1]);
  const target = new THREE.Vector3(pa.x + (pb.x - pa.x) * u, pa.y + (pb.y - pa.y) * u, (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * u);
  // the distance moves in its logarithm: a fall from 60 km to 2 km at a steady pace, not a plunge at the end
  const dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * u);
  const tilt = THREE.MathUtils.degToRad(a.tilt + (b.tilt - a.tilt) * u);
  const az = THREE.MathUtils.degToRad(a.az + (b.az - a.az) * u);
  camera.position.set(target.x + dist * Math.sin(tilt) * Math.sin(az), target.y - dist * Math.sin(tilt) * Math.cos(az), target.z + dist * Math.cos(tilt));
  camera.up.set(-Math.sin(az) * Math.cos(tilt), Math.cos(az) * Math.cos(tilt), Math.sin(tilt));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  // haze grows with distance, so the far edge of the pictures never shows as a line against the sky
  (scene3.fog as THREE.Fog).near = dist * 1.6; (scene3.fog as THREE.Fog).far = dist * 5.5;
  camera.near = Math.max(5, dist / 200); camera.far = dist * 8; camera.updateProjectionMatrix();
}

// --- the text layer ------------------------------------------------------------------------------------------
const out = document.getElementById('c') as HTMLCanvasElement;
out.width = W; out.height = H;
const ctx = out.getContext('2d', { alpha: false })!;
const runs = (text: string) => text.split('*').map((p, j) => ({ p, acc: j % 2 === 1 })).filter((r) => r.p);
const plain = (text: string) => text.replace(/\*/g, '');

/** A line typed behind a block cursor (the owner liked it better than text that appears at once). */
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
  ctx.font = '800 70px Schibsted';
  b.lines.forEach((l, k) => {
    const start = t0 + b.lines.slice(0, k).reduce((a, x) => a + plain(x).length, 0) / TYPE_CPS + 0.08 * k;
    typed(l, LEFT, y + k * 84, t, start, 70, INK, fade);
  });
  ctx.globalAlpha = 1;
}

/** A place's name over the picture, on a paper tag joined to its point. */
function drawPlace(p: Place, t: number) {
  const a = smooth(span(t, p.from, p.from + 0.5)) * (1 - span(t, p.until - 0.4, p.until));
  if (a <= 0) return;
  const g = local(p.at[0], p.at[1]);
  const v = new THREE.Vector3(g.x, g.y, 0).project(camera);
  if (v.z > 1) return;
  const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
  if (y < PANEL_TOP + 110 || y > PANEL_BOTTOM - 10 || x < LEFT || x > W - LEFT) return;
  ctx.globalAlpha = a;
  ctx.font = '500 26px PlexMono'; ctx.letterSpacing = '3px';
  const label = p.name.toLocaleUpperCase('tr');
  const w = ctx.measureText(label).width + 28;
  const bx = clamp(x - w / 2, LEFT, W - LEFT - w), by = y - 96;
  ctx.strokeStyle = PAPER; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, by + 44); ctx.stroke();
  ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(242,240,234,0.94)'; ctx.fillRect(bx, by, w, 44);
  ctx.textAlign = 'left';
  typed(label, bx + 14, by + 31, t, p.from, 26, INK, a);
  ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;
}

let mark: HTMLImageElement | null = null;
function drawPanels() {
  // paper above and below the picture: the text never sits on the photograph
  ctx.globalAlpha = 1; ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, PANEL_TOP); ctx.fillRect(0, PANEL_BOTTOM, W, H - PANEL_BOTTOM);
  ctx.globalAlpha = 0.5;
  let x = LEFT;
  if (mark) { ctx.drawImage(mark, x, TOP - 60, 34, 34); x += 46; }
  ctx.font = '500 18px PlexMono'; ctx.letterSpacing = '1px'; ctx.textAlign = 'left';
  ctx.fillStyle = MUTED; ctx.fillText('greaterturkiye.org', x, TOP - 34);
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  ctx.font = '500 22px PlexMono';
  ctx.fillStyle = ACCENT; ctx.fillText(spec!.status, LEFT, PANEL_BOTTOM + 56);
  ctx.fillStyle = MUTED;
  const words = spec!.source.split(' '); let line = '', y = PANEL_BOTTOM + 92;
  for (const w of words) {
    if (ctx.measureText(line + w).width > RIGHT - LEFT + 80 && line) { ctx.fillText(line.trim(), LEFT, y); line = ''; y += 32; }
    line += w + ' ';
  }
  ctx.fillText(line.trim(), LEFT, y);
}

// --- one frame -------------------------------------------------------------------------------------------------
let rings: THREE.Mesh[] = [];
function draw(t: number) {
  const [r0, r1] = spec!.rise;
  rings.forEach((m, k) => { m.scale.z = Math.max(0.001, smooth(span(t, r0 + k * ((r1 - r0) / (rings.length + 3)), r0 + (k + 4) * ((r1 - r0) / (rings.length + 3))))); });
  placeCamera(t);
  gl.render(scene3, camera);
  ctx.globalAlpha = 1;
  ctx.drawImage(gl.domElement, 0, 0);
  drawPanels();
  for (const p of spec!.places) drawPlace(p, t);
  for (const b of spec!.beats) drawBeat(b, t);
}

const frames = Math.round(spec.duration * spec.fps);
const ready = (async () => {
  const [city, wideBox, cityBox, wideImg, cityImg] = await Promise.all([
    json<City>(`data/v2/${spec!.city}.json`), json<Picture>(`data/v2/${spec!.wide}-s2.json`), json<Picture>(`data/v2/${spec!.city}-s2.json`),
    image(`data/v2/${spec!.wide}-s2.jpg`), image(`data/v2/${spec!.city}-s2.jpg`), loadFonts()]);
  [lon0, lat0] = city.centre;
  kx = 111320 * Math.cos((lat0 * Math.PI) / 180); ky = 110540;
  // drawn in this order: the wide picture, the detailed one over it, the shadows over both (transparent
  // layers are otherwise sorted by distance, and the detailed picture covered the shadows)
  groundPlane(wideImg, wideBox.box, -2, 0).renderOrder = 0;
  groundPlane(cityImg, cityBox.box, 0, 0.12).renderOrder = 1;
  // the shadows fall on a clear layer over the pictures
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(9000, 8000), new THREE.ShadowMaterial({ color: '#1d1a16', opacity: 0.42 }));
  shadow.position.z = 0.5; shadow.receiveShadow = true; shadow.renderOrder = 2;
  (shadow.material as THREE.ShadowMaterial).depthWrite = false;
  scene3.add(shadow);
  rings = buildRings(city, local(spec!.focus[0], spec!.focus[1]));
  mark = await image('brand/mark.png').catch(() => null);
  return { fps: spec!.fps, frames, id: spec!.id, style: `v2${spec!.design}`, renderer: 'three' };
})();

declare global {
  interface Window { motion: { ready: Promise<{ fps: number; frames: number; id: string; style: string; renderer: string }>; frame: (i: number, format?: 'jpeg' | 'png') => string; encode?: (bitrate?: number) => Promise<string> } }
}
window.motion = {
  ready,
  frame(i: number, format: 'jpeg' | 'png' = 'jpeg') {
    draw(i / spec!.fps);
    return format === 'png' ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.95);
  },
};

if (!params.has('export')) {
  ready.then(() => {
    const t0 = performance.now();
    const loop = () => { draw(((performance.now() - t0) / 1000) % spec!.duration); requestAnimationFrame(loop); };
    loop();
  });
}
