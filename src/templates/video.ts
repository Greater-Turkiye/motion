import { geoDistance, geoInterpolate } from 'd3-geo';
import type { Assets } from '../assets';
import { anim, ease, lerp, rng, span } from '../engine/time';
import type { Beat, Camera, LonLat, Scene } from '../engine/scene';
import { H, W } from '../render/globe';
import type { MapRenderer } from '../render/map';
import { makeProject, type Project } from '../gl/globe-gl';
import { drawLabels, placeLabels, planSpots, type Box, type Label } from '../render/labels';
import type { Style } from '../styles';

const BOSPHORUS: LonLat = [29.05, 41.2];
/** Where TÜRKİYE may be written: the centre, the Black Sea side, the west, the east, all on land. */
const TURKIYE_ANCHORS: LonLat[] = [[33.6, 40.7], [30.6, 39.4], [38.8, 38.6], [36.5, 39.8]];

/** Great-circle distance, rounded to 10 km: the scale the viewer can feel ("Boğaz'a 430 km"). */
export const km = (a: LonLat, b: LonLat) => Math.round((geoDistance(a, b) * 6371) / 10) * 10;
export const kmToBosphorus = (at: LonLat) => km(at, BOSPHORUS);

/**
 * Where text may go: the part of a 1080x1920 frame that no platform covers with its own buttons or
 * caption (research/02: Meta 14 % top, TikTok 180 px right rail and 400 px bottom). Text that leaves
 * it is reported as a page error, and the exporter refuses to write the video.
 */
export const SAFE = { left: 65, right: W - 180, top: 270, bottom: H - 400 };
const LEFT = 80, WIDTH = SAFE.right - LEFT, FOOT = SAFE.bottom - 30, BLOCK_BOTTOM = FOOT - 64;

// film grain: a few whole-frame noise tiles made once from a fixed seed, picked by frame number
let grain: HTMLCanvasElement[] | null = null;
function grainTiles() {
  if (grain) return grain;
  const r = rng(20260930);
  grain = [0, 1, 2, 3].map(() => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  });
  return grain;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  // ordinary spaces only: a no-break space (as between a number and its unit) keeps its words together
  for (const w of text.split(/[ \t\n]+/)) {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > width && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** The largest size up to `max` at which every line fits the text column. */
function fit(ctx: CanvasRenderingContext2D, lines: string[], font: (px: number) => string, max: number, spacing = 0) {
  let px = max;
  for (; px > 24; px -= 4) {
    ctx.font = font(px); ctx.letterSpacing = `${spacing * px}px`;
    if (lines.every((l) => ctx.measureText(l).width <= WIDTH)) break;
  }
  ctx.letterSpacing = '0px';
  return px;
}

function guard(box: Box, what: string) {
  if (box.x < SAFE.left || box.x + box.w > SAFE.right + 1 || box.y < SAFE.top || box.y + box.h > SAFE.bottom)
    console.error(`outside the safe area: ${what} at ${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.w.toFixed(0)}x${box.h.toFixed(0)}`);
}

/** The camera at `t`: the legacy from/to move, or a path through keys; zoom moves in log space so a
 *  zoom from 1 to 3 feels as even as one from 3 to 9. A slow periodic sway keeps it alive between
 *  keys and returns to zero at the end, so the loop has no seam. */
function cameraAt(sc: Scene, s: Style, t: number): Camera {
  const cam = sc.camera;
  const mode = sc.anim?.camera ?? s.motion.camera;
  const sway = Math.sin((2 * Math.PI * t) / sc.duration);
  if (!cam.keys) {
    const k = (ease[cam.ease] || ease.outCubic)(span(t, 0, cam.seconds));
    const drift = t * 0.35;
    return { center: [lerp(cam.from.center[0], cam.to.center[0], k) + drift * 0.3, lerp(cam.from.center[1], cam.to.center[1], k)],
      zoom: lerp(cam.from.zoom, cam.to.zoom, k) * (1 + 0.012 * t) };
  }
  const ks = cam.keys;
  let i = 0;
  while (i < ks.length - 2 && t >= ks[i + 1].t) i++;
  const a = ks[i], b = ks[i + 1];
  // glide: one smooth move across the whole gap between keys
  // snap: the move happens in the first third, fast and decisive, then the frame holds
  // fly: like glide, but a long move rises and comes down (van Wijk and Nuij's zoom-out-then-in)
  const k = mode === 'snap' ? ease.outExpo(span(t, a.t, a.t + Math.min(1.2, (b.t - a.t) * 0.35)))
    : ease.inOutCubic(span(t, a.t, b.t));
  const far = Math.hypot(b.center[0] - a.center[0], b.center[1] - a.center[1]);
  const rise = mode === 'fly' ? 1 + Math.min(1.2, far / 6) * Math.sin(Math.PI * k) : 1;
  return {
    center: [lerp(a.center[0], b.center[0], k) + 0.5 * sway, lerp(a.center[1], b.center[1], k)],
    zoom: (Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)) * (1 + 0.015 * sway)) / rise,
  };
}

/** When the subject's emblem leaves: after the opening, before the camera zooms in far enough to crop it. */
const emblemOutOf = (sc: Scene) => (sc.beats.length ? sc.beats[0].at + 0.8 : sc.duration);

/**
 * Everything the labels must know at moment t, from geometry alone: the labels (each with a stable
 * key), what they must not cover (the text block, the event ring, the emblem, distance end points),
 * and where the emblem is. Used for every frame and, at sample moments, to plan the label spots.
 */
function layout(sc: Scene, s: Style, proj: Project, t: number, emblemAr: number, hookTop = 960) {
  const D = sc.duration;
  const full = sc.beats.length > 0;
  const tail = full ? 1 - span(t, D - 0.9, D - 0.05) : 1;
  const beatIdx = sc.beats.findIndex((b, i) => t >= b.at && (i + 1 >= sc.beats.length || t < sc.beats[i + 1].at));
  const beat = sc.beats[beatIdx];
  const emblemOut = emblemOutOf(sc);
  // the text block and its wash; the hook's kicker can stand higher than the beats' blocks
  const top = t < (sc.beats[0]?.at ?? D) ? Math.min(960, hookTop) : 960;
  const obstacles: Box[] = [{ x: 0, y: top, w: W, h: H - top }];
  if (sc.voice === 'synthetic') obstacles.push({ x: LEFT - 10, y: SAFE.top - 6, w: 400, h: 40 });
  // the progress bar: a name drawn across it reads as a broken bar
  if (full && (sc.anim?.progress ?? s.motion.progress)) obstacles.push({ x: 0, y: SAFE.top - 50, w: W, h: 30 });
  const labels: Label[] = [];

  if (sc.event) {
    const p = proj(sc.event.at);
    if (p) obstacles.push({ x: p[0] - 60, y: p[1] - 60, w: 120, h: 120 });
  }
  // the parties' points on a link beat: labels keep clear of them
  if (beat?.kind === 'link') for (const p of sc.parties ?? []) {
    const q = proj(p.at);
    if (q) obstacles.push({ x: q[0] - 22, y: q[1] - 22, w: 44, h: 44 });
  }
  if (beat?.kind === 'distance') {
    const w = windowOf(sc, beatIdx, t);
    const draw = anim(t, beat.at + 0.2, 1.4, ease.inOutCubic);
    ([['d-from', beat.from, 1], ['d-to', beat.to, draw >= 1 ? anim(t, beat.at + 1.6, 0.3, ease.outBack) : 0]] as const).forEach(([key, end, show]) => {
      const q = proj(end.at);
      if (!q || !show) return;
      obstacles.push({ x: q[0] - 24, y: q[1] - 24, w: 48, h: 48 });
      labels.push({ key, text: end.label, x: q[0], y: q[1] - 46, size: 28, color: s.ink, spacing: 0.3, weight: 700, priority: -1, alpha: w.out * show });
    });
  }

  let emblem: { x: number; y: number; size: number; alpha: number } | null = null;
  const subjectLabel = sc.labels.find((l) => l.kind === 'country' && l.text === sc.subject?.label);
  const anchorLL: LonLat | undefined = subjectLabel?.at;
  if (sc.subject?.emblem && anchorLL) {
    const at = proj(anchorLL);
    const alpha = anim(t, 0.45, 0.4) * (1 - span(t, emblemOut - 0.4, emblemOut));
    if (at && alpha > 0) {
      // the emblem stands above its country's label, which never moves
      const size = 200 * (0.85 + 0.15 * anim(t, 0.45, 0.7, ease.outBack));
      const y = at[1] - (200 * emblemAr) / 2 - 30;
      emblem = { x: at[0], y, size, alpha };
      obstacles.push({ x: at[0] - size / 2, y: y - (size * emblemAr) / 2, w: size, h: size * emblemAr });
    }
  }
  // on a flat page the TÜRKİYE label sits on the home fill: white on a dark fill, ink on a light one
  const [hr, hg, hb] = rgbOf(s.home);
  const homeInk = !s.flat || 0.2126 * hr + 0.7152 * hg + 0.0722 * hb < 150 ? '#ffffff' : s.ink;
  sc.labels.forEach((l, i) => {
    const home = l.kind === 'home';
    const anchors: LonLat[] = [l.at, ...(l.alts ?? []), ...(home && !l.alts ? TURKIYE_ANCHORS : [])];
    const alts = anchors.map((x) => proj(x));
    const p = alts[0] ?? alts.find(Boolean);
    if (!p) return;
    const isSubject = l === subjectLabel;
    // on a distance beat its end points carry their own names: the map's label of the same place
    // gives way, or "TİRAN" stands twice a few pixels apart
    const twin = beat?.kind === 'distance' && (l.text === beat.from.label || l.text === beat.to.label)
      ? 1 - anim(t, beat.at, 0.3) * windowOf(sc, beatIdx, t).out : 1;
    labels.push({ key: `l${i}`, text: l.text, x: p[0], y: p[1], alts: anchors.length > 1 ? alts : undefined, size: home ? 32 : isSubject ? 26 : 24, sticky: home,
      color: home ? homeInk : s.label, spacing: isSubject ? 0.45 : 0.4, weight: home ? 700 : 500,
      priority: isSubject ? 0 : home ? 1 : 2 + i, alpha: anim(t, isSubject ? 0.8 : 0.6 + 0.08 * i, 0.4) * tail * twin });
  });
  return { labels, obstacles, emblem };
}

/** Label spots for this scene and style, planned once from moments along the camera path. */
const plans = new Map<string, Map<string, number>>();
function labelPlan(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, emblemAr: number) {
  const key = `${sc.id}|${s.id}|${sc.anim?.camera ?? s.motion.camera}|${sc.duration}`;
  let plan = plans.get(key);
  if (!plan) {
    const times = new Set<number>();
    for (let tt = 0.25; tt < sc.duration; tt += 0.5) times.add(tt);
    for (const k of sc.camera.keys ?? []) times.add(Math.min(sc.duration - 0.01, k.t));
    const samples = [...times].map((tt) => layout(sc, s, makeProject(s, cameraAt(sc, s, tt)), tt, emblemAr, hookMetrics(ctx, sc, s).top))
      .map((l) => ({ labels: l.labels.filter((x) => (x.alpha ?? 1) > 0.05), obstacles: l.obstacles }));
    plan = planSpots(ctx, samples, W, H);
    plans.set(key, plan);
  }
  return plan;
}

/** The window a beat owns: `inP` rises over its first 0.45 s, `out` falls over its last 0.3 s. */
function windowOf(sc: Scene, i: number, t: number) {
  const start = i < 0 ? 0 : sc.beats[i].at;
  const end = i + 1 < sc.beats.length ? sc.beats[i + 1].at : sc.duration;
  const inP = i < 0 ? 1 : anim(t, start, 0.45, ease.outExpo);
  const last = i === sc.beats.length - 1;
  const out = 1 - span(t, end - (last ? 0.7 : 0.3), end - (last ? 0.35 : 0));
  return { start, end, on: t >= start - 1e-6 && t < end, inP, out };
}

/**
 * One video: the hook, then the beats of PLAN.md section 14 (place, facts, distance, status, close),
 * with the status and the source on screen from the first second to the last frame. Every value
 * below is a function of `t`; the last frame is the first one again, so the video loops.
 */
/** How far a point in the middle of the picture moves on screen between t and t + dt, in pixels:
 *  the exporter uses it to decide how many sub-frames a frame needs for its motion blur. */
export function screenMotion(sc: Scene, s: Style, t: number, dt: number) {
  const p0 = makeProject(s, cameraAt(sc, s, t)), p1 = makeProject(s, cameraAt(sc, s, t + dt));
  const v = cameraAt(sc, s, t);
  let worst = 0;
  for (const [dx, dy] of [[0, 0], [4, 3], [-4, -3]]) {
    const at: LonLat = [v.center[0] + dx, v.center[1] + dy];
    const a = p0(at), b = p1(at);
    if (a && b) worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return worst;
}

export function drawVideo(ctx: CanvasRenderingContext2D, a: Assets, map: MapRenderer, sc: Scene, s: Style, t: number, frame: number) {
  const D = sc.duration;
  const full = sc.beats.length > 0;
  const tail = full ? 1 - span(t, D - 0.9, D - 0.05) : 1; // everything that was not on frame 0 leaves before the loop
  // a stop-motion style moves its camera in steps (12 a second for the photocopied dossier)
  const view = cameraAt(sc, s, s.stepFps ? Math.floor(t * s.stepFps) / s.stepFps : t);
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6);
  const beatIdx = sc.beats.findIndex((b, i) => t >= b.at && (i + 1 >= sc.beats.length || t < sc.beats[i + 1].at));
  const beat: Beat | undefined = sc.beats[beatIdx];

  ctx.save();
  const proj = map.draw(ctx, s, view, { subject: sc.subject?.country, subjectReveal: anim(t, 0.15, 0.9, ease.outQuad) * tail, pulse });

  const emblemImg = sc.subject?.emblem ? a.emblems.get(sc.subject.emblem) : undefined;
  const emblemAr = emblemImg ? emblemImg.naturalHeight / emblemImg.naturalWidth || 1 : 1;
  const lay = layout(sc, s, proj, t, emblemAr, hookMetrics(ctx, sc, s).top);

  // the event: a region-level ring, never a pin, with shock waves every 1.1 s
  if (sc.event) {
    const p = proj(sc.event.at);
    const dim = beat?.kind === 'distance' ? 0.45 : 1;
    if (p) {
      const [x, y] = p;
      ctx.globalAlpha = 1;
      for (let n = 0; n < 3; n++) {
        const w = (t - 0.5 - n * 0.37) / 1.1;
        if (w < 0) continue;
        const ph = w - Math.floor(w);
        ctx.beginPath(); ctx.arc(x, y, 18 + ph * 120, 0, Math.PI * 2);
        ctx.strokeStyle = s.accent; ctx.globalAlpha = (1 - ph) * 0.9 * dim * tail; ctx.lineWidth = 3 * (1 - ph) + 0.5; ctx.stroke();
      }
      ctx.globalAlpha = anim(t, 0.35, 0.4) * dim * tail;
      ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.strokeStyle = s.accent; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 9 + 2 * pulse, 0, Math.PI * 2); ctx.fillStyle = s.accent; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // distance: the great circle drawn from one named place to the other, with a counter below
  if (beat?.kind === 'distance') {
    const w = windowOf(sc, beatIdx, t);
    const draw = anim(t, beat.at + 0.2, 1.4, ease.inOutCubic);
    const arc = geoInterpolate(beat.from.at, beat.to.at);
    const pts: [number, number][] = [];
    for (let k = 0; k <= 64; k++) { const q = proj(arc((k / 64) * draw)); if (q) pts.push(q); }
    ctx.globalAlpha = w.out;
    ctx.strokeStyle = s.accent; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.setLineDash([2, 14]);
    ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.setLineDash([]);
    for (const [end, show] of [[beat.from, 1], [beat.to, draw >= 1 ? anim(t, beat.at + 1.6, 0.3, ease.outBack) : 0]] as const) {
      const q = proj(end.at);
      if (!q || !show) continue;
      ctx.beginPath(); ctx.arc(q[0], q[1], 11 * show, 0, Math.PI * 2); ctx.fillStyle = s.accent; ctx.fill();
      ctx.beginPath(); ctx.arc(q[0], q[1], 20 * show, 0, Math.PI * 2); ctx.strokeStyle = s.accent; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // link: capital to capital, a great circle drawn with a bright head (research/05, effect 1)
  if (beat?.kind === 'link' && sc.parties && sc.parties.length > 1) {
    const w = windowOf(sc, beatIdx, t);
    const [p0, ...rest] = sc.parties;
    rest.forEach((p, k) => {
      const head = anim(t, beat.at + 0.25 + 0.3 * k, 1.3, ease.inOutCubic);
      const arc = geoInterpolate(p0.at, p.at);
      const pts: [number, number][] = [];
      for (let j = 0; j <= 80; j++) { const q = proj(arc((j / 80) * head)); if (q) pts.push(q); }
      if (pts.length < 2) return;
      ctx.globalAlpha = 0.9 * w.out; ctx.strokeStyle = s.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      const [hx, hy] = pts[pts.length - 1];
      if (head < 1) { ctx.globalAlpha = w.out; ctx.fillStyle = s.ink; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill(); }
    });
    for (const p of sc.parties) {
      const q = proj(p.at);
      if (!q) continue;
      ctx.globalAlpha = w.out * anim(t, beat.at, 0.4);
      ctx.beginPath(); ctx.arc(q[0], q[1], 10, 0, Math.PI * 2); ctx.fillStyle = s.accent; ctx.fill();
      ctx.beginPath(); ctx.arc(q[0], q[1], 18, 0, Math.PI * 2); ctx.strokeStyle = s.accent; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // recent: our own records around the place, lit in the order they happened (research/05, effect 4)
  if (beat?.kind === 'recent') {
    const w = windowOf(sc, beatIdx, t);
    const pts = [...beat.points].sort((x, y) => y.days - x.days); // oldest first
    pts.forEach((p, k) => {
      const q = proj(p.at);
      if (!q) return;
      const on = anim(t, beat.at + 0.3 + (1.8 * k) / Math.max(1, pts.length), 0.35, ease.outBack);
      if (on <= 0) return;
      const fresh = 1 - Math.min(1, p.days / 7); // the newer, the brighter
      ctx.globalAlpha = w.out * Math.min(1, on) * (0.35 + 0.65 * fresh);
      ctx.fillStyle = s.accent;
      ctx.beginPath(); ctx.arc(q[0], q[1], 5 + 5 * on, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha *= 0.35;
      ctx.beginPath(); ctx.arc(q[0], q[1], 14 * on, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // the subject's emblem over its own territory (ADR 0026: news context, never beside our mark);
  // it belongs to the opening and leaves before the camera zooms in far enough to crop it
  if (emblemImg && lay.emblem) {
    const { x, y, size, alpha } = lay.emblem;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (s.emblemMono) ctx.filter = 'grayscale(1) brightness(2.2) contrast(1.1)';
    if (!s.flat) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30; }
    ctx.drawImage(emblemImg, x - size / 2, y - (size * emblemAr) / 2, size, size * emblemAr);
    ctx.restore();
  }
  drawLabels(ctx, placeLabels(ctx, lay.labels, lay.obstacles, labelPlan(ctx, sc, s, emblemAr), W, H));

  // wash under the text block
  const wash = ctx.createLinearGradient(0, 900, 0, H);
  wash.addColorStop(0, hexA(s.bg[1], 0)); wash.addColorStop(0.28, hexA(s.bg[1], 0.9)); wash.addColorStop(1, hexA(s.bg[1], 1));
  ctx.fillStyle = wash; ctx.fillRect(0, 900, W, H - 900);

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // the hook: on screen from frame 0; in a full video it hands over to the first beat and returns in
  // the last half second, in exactly its frame-0 state, so the end runs into the start
  const hookEnd = full ? sc.beats[0].at : D;
  if (t < hookEnd) drawHookBlock(ctx, sc, s, t, full ? 1 - span(t, hookEnd - 0.3, hookEnd) : 1);
  else if (full && t > D - 0.5) drawHookBlock(ctx, sc, s, 0, span(t, D - 0.5, D));
  if (beat) drawBeat(ctx, sc, s, beatIdx, t, a);

  // status and source: from the first second to the last frame, never only at the end (research/01, rules 9–10)
  drawFooter(ctx, sc, s, full ? 1 : anim(t, 1.3, 0.4));
  if (sc.anim?.post) drawSlideMarks(ctx, sc, s, t);
  else {
    if (full && (sc.anim?.progress ?? s.motion.progress)) drawProgress(ctx, sc, s, t);
    if (sc.voice === 'synthetic') drawVoiceNote(ctx, s);
  }

  // vignette and grain
  if (!s.flat) {
    const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.45, H * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  if (s.grain > 0) {
    const tiles = grainTiles();
    ctx.globalAlpha = s.grain; ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(tiles[frame % tiles.length], 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** The hook block's measures, once per scene and style: the labels keep clear of its top line. */
const hookMemo = new Map<string, { subLines: string[]; sizes: number[]; heights: number[]; subTop: number; linesTop: number; kickerY: number; top: number }>();
function hookMetrics(ctx: CanvasRenderingContext2D, sc: Scene, s: Style) {
  const key = `${sc.id}|${s.id}|${sc.hook.lines.join('/')}|${sc.hook.sub}`;
  let m = hookMemo.get(key);
  if (!m) {
    ctx.save();
    ctx.font = `600 40px ${s.fonts.text}`;
    const subLines = wrap(ctx, sc.hook.sub.replace('{km}', sc.event ? String(kmToBosphorus(sc.event.at)) : '?'), WIDTH);
    // each line as big as it can be on its own: a short word stays huge even when the next line is long
    // (sized for the loosest tracking of the settle below)
    const sizes = sc.hook.lines.map((l) => fit(ctx, [l], (p) => `900 ${p}px ${s.fonts.display}`, 188, 4 / 188));
    ctx.restore();
    const heights = sizes.map((px) => Math.round(px * 0.915));
    const subTop = BLOCK_BOTTOM - subLines.length * 50;
    const linesTop = subTop - 40 - heights.reduce((a, b) => a + b, 0);
    const kickerY = linesTop - 30;
    m = { subLines, sizes, heights, subTop, linesTop, kickerY, top: kickerY - 40 };
    hookMemo.set(key, m);
  }
  return m;
}

function drawHookBlock(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, t: number, alpha: number) {
  if (alpha <= 0) return;
  const lift = (1 - alpha) * 40;
  const { subLines, sizes, heights, subTop, linesTop, kickerY } = hookMetrics(ctx, sc, s);
  guard({ x: LEFT - 6, y: kickerY - 26, w: WIDTH, h: BLOCK_BOTTOM - kickerY + 26 }, 'hook');

  const kp = alpha;
  ctx.globalAlpha = kp; ctx.fillStyle = s.accent; ctx.font = `700 26px ${s.fonts.mono}`; ctx.letterSpacing = '8px';
  ctx.fillText(sc.hook.kicker, LEFT - 30 * (1 - anim(t, 0.05, 0.4)), kickerY - lift);
  ctx.letterSpacing = '0px';

  sc.hook.lines.forEach((text, i) => {
    // fully legible on frame 0, which is also the thumbnail (research/01, rule 1): the motion is the
    // tracking closing in, not the words arriving
    const p = anim(t, 0.04 * i, 0.7, ease.outExpo);
    const px = sizes[i];
    const base = linesTop + heights.slice(0, i + 1).reduce((a, b) => a + b, 0) - 18 * (px / 188);
    ctx.font = `900 ${px}px ${s.fonts.display}`; ctx.letterSpacing = `${(-5 + 9 * (1 - p)) * (px / 188)}px`;
    ctx.fillStyle = i === sc.hook.lines.length - 1 ? s.accent : s.ink;
    ctx.globalAlpha = alpha;
    ctx.fillText(text, LEFT - 6, base - lift);
  });
  ctx.letterSpacing = '0px';

  const sp = anim(t, 0.95, 0.45);
  ctx.globalAlpha = sp * alpha; ctx.fillStyle = s.ink; ctx.font = `600 40px ${s.fonts.text}`;
  subLines.forEach((l, i) => ctx.fillText(l, LEFT, subTop + 40 + i * 50 + (1 - sp) * 18 - lift));
  ctx.globalAlpha = 1;
}

function drawFooter(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, alpha: number) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.font = `700 22px ${s.fonts.mono}`; ctx.letterSpacing = '3px';
  const status = sc.hook.status, source = sc.hook.source;
  const sw = ctx.measureText(status).width;
  // the status as a pill, so it reads as a label of the whole video and not as part of a sentence
  ctx.fillStyle = hexA(s.status, 0.16); ctx.strokeStyle = s.status; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(LEFT - 2, FOOT - 27, sw + 26, 38, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = s.status; ctx.fillText(status, LEFT + 11, FOOT);
  ctx.fillStyle = s.muted; ctx.fillText(source, LEFT + sw + 46, FOOT);
  guard({ x: LEFT - 2, y: FOOT - 27, w: sw + 46 + ctx.measureText(source).width, h: 38 }, 'footer');
  ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;
}

type TextMode = 'rise' | 'wipe' | 'type' | 'pop';
const TYPE_CPS = 45; // typewriter speed: three times reading speed, so the line is complete long before it must be read

/** A line of text split into runs; words between asterisks take the accent colour. */
const runs = (text: string) => text.split('*').map((p, j) => ({ p, acc: j % 2 === 1 })).filter((r) => r.p);

/**
 * One line of a beat, entering the way the scene asks (anim.text):
 * rise, it slides up and fades in; wipe, a bar in the accent colour draws it from the left;
 * type, it is typed out behind a block cursor; pop, word by word, each springing up to size.
 * The font and letter spacing are whatever the caller set; `size` is the line's font size.
 */
function reveal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, t0: number, mode: TextMode,
  ink: string, accent: string, alpha: number, size: number) {
  const rs = runs(text);
  const draw = (rr: { p: string; acc: boolean }[], yy: number) => {
    let cx = x;
    for (const r of rr) { ctx.fillStyle = r.acc ? accent : ink; ctx.fillText(r.p, cx, yy); cx += ctx.measureText(r.p).width; }
    return cx;
  };
  if (mode === 'wipe') {
    const p = anim(t, t0, 0.55, ease.inOutCubic);
    if (p <= 0) return;
    const w = ctx.measureText(rs.map((r) => r.p).join('')).width + 16;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 8, y - size * 1.05, w * p, size * 1.45); ctx.clip();
    ctx.globalAlpha = alpha; draw(rs, y);
    ctx.restore();
    if (p < 1) { ctx.globalAlpha = alpha; ctx.fillStyle = accent; ctx.fillRect(x - 8 + w * p - 3, y - size * 0.85, 6, size * 1.05); }
  } else if (mode === 'type') {
    const n = Math.floor(Math.max(0, t - t0) * TYPE_CPS);
    if (n <= 0) return;
    let left = n;
    const shown: { p: string; acc: boolean }[] = [];
    for (const r of rs) { if (left <= 0) break; shown.push({ p: r.p.slice(0, left), acc: r.acc }); left -= r.p.length; }
    ctx.globalAlpha = alpha;
    const end = draw(shown, y);
    const total = rs.reduce((a, r) => a + r.p.length, 0);
    // the cursor stays while typing and for a moment after, blinking three times a second
    if (n < total + 12 && Math.floor((t - t0) * 6) % 2 === 0) { ctx.fillStyle = accent; ctx.fillRect(end + 6, y - size * 0.74, size * 0.42, size * 0.84); }
  } else if (mode === 'pop') {
    let cx = x, k = 0;
    for (const r of rs) for (const wd of r.p.split(/(\s+)/)) {
      if (!wd) continue;
      const ww = ctx.measureText(wd).width;
      if (/\S/.test(wd)) {
        const p = anim(t, t0 + 0.07 * k, 0.42, ease.outBack), a = anim(t, t0 + 0.07 * k, 0.12);
        k++;
        if (a > 0) {
          ctx.save(); ctx.globalAlpha = alpha * a;
          ctx.translate(cx + ww / 2, y); const sc = 0.5 + 0.5 * p; ctx.scale(sc, sc);
          ctx.fillStyle = r.acc ? accent : ink; ctx.fillText(wd, -ww / 2, 0);
          ctx.restore();
        }
      }
      cx += ww;
    }
  } else {
    const p = anim(t, t0, 0.45, ease.outExpo);
    ctx.globalAlpha = alpha * p;
    draw(rs, y + (1 - p) * 24);
  }
}

/** When line k of a block starts: typed lines wait for the one before, the others follow a beat apart. */
function lineStart(lines: string[], k: number, t0: number, mode: TextMode) {
  if (mode === 'type') return t0 + lines.slice(0, k).reduce((a, l) => a + l.replace(/\*/g, '').length, 0) / TYPE_CPS + 0.08 * k;
  if (mode === 'pop') return t0 + lines.slice(0, k).reduce((a, l) => a + l.split(/\s+/).length, 0) * 0.07;
  return t0 + 0.12 * k;
}

/** Stories-style progress: one segment per block, filling as the video plays (a reason to stay). */
/** The 4:5 window a carousel slide is cut from (tools/post/carousel.mjs): the map and the whole text
 *  block, without the platform-covered top band. */
export const POST_WINDOW = { y: 250, h: 1350 };

/**
 * A carousel slide's own marks, inside the 4:5 window: which slide of how many (top right), and on
 * the cover a swipe cue (bottom right). A feed post is read by swiping, so the reader is told there
 * is more and how much; nothing here is a claim, and the status and source stay as in the video.
 */
function drawSlideMarks(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, t: number) {
  const n = sc.beats.length + 1;
  const k = sc.beats.filter((b) => t >= b.at).length + 1;
  ctx.save();
  ctx.font = `700 24px ${s.fonts.mono}`; ctx.letterSpacing = '4px'; ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right'; ctx.globalAlpha = 0.9; ctx.fillStyle = s.muted;
  ctx.fillText(`${k}/${n}`, W - 60, POST_WINDOW.y + 70);
  if (k === 1) { ctx.fillStyle = s.accent; ctx.fillText('KAYDIR  →', W - 60, POST_WINDOW.y + POST_WINDOW.h - 40); }
  ctx.restore();
}

/** Where the synthetic-voice note sits: top left inside the safe area, under the progress bar. */
const VOICE_NOTE = { x: LEFT, y: SAFE.top + 22, text: 'SESLENDİRME: YAPAY SES' };

/** A narrated video says, in every frame, that the voice is synthetic (TikTok, YouTube and Meta ask
 *  for AI-made realistic audio to be labelled; the viewer should not have to find it in a caption). */
function drawVoiceNote(ctx: CanvasRenderingContext2D, s: Style) {
  ctx.globalAlpha = 0.85;
  ctx.font = `700 18px ${s.fonts.mono}`; ctx.letterSpacing = '3px';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.muted; ctx.fillText(VOICE_NOTE.text, VOICE_NOTE.x, VOICE_NOTE.y);
  guard({ x: VOICE_NOTE.x, y: VOICE_NOTE.y - 18, w: ctx.measureText(VOICE_NOTE.text).width, h: 24 }, 'voice note');
  ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;
}

function drawProgress(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, t: number) {
  const starts = [0, ...sc.beats.map((b) => b.at)], ends = [...sc.beats.map((b) => b.at), sc.duration];
  const x0 = LEFT, x1 = W - LEFT, gap = 8, y = SAFE.top - 34;
  const total = x1 - x0 - gap * (starts.length - 1);
  let x = x0;
  ctx.globalAlpha = 1;
  starts.forEach((a, i) => {
    const w = (total * (ends[i] - a)) / sc.duration;
    ctx.fillStyle = hexA(s.ink.startsWith('#') ? s.ink : '#ffffff', 0.22); ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = s.accent; ctx.fillRect(x, y, w * span(t, a, ends[i]), 5);
    x += w + gap;
  });
}

function drawBeat(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, i: number, t: number, a: Assets) {
  const b = sc.beats[i];
  const w = windowOf(sc, i, t);
  const alpha = w.inP * w.out;
  if (alpha <= 0) return;
  const mode: TextMode = sc.anim?.text ?? s.motion.text;
  const rise = (mode === 'rise' ? (1 - w.inP) * 36 : 0) + (1 - w.out) * 30;
  const kicker = (text: string, y: number) => {
    ctx.globalAlpha = alpha; ctx.fillStyle = s.accent; ctx.font = `700 26px ${s.fonts.mono}`; ctx.letterSpacing = '8px';
    ctx.fillText(text, LEFT, y); ctx.letterSpacing = '0px';
  };
  const lines = (ls: string[], x: number, y0: number, lh: number, t0: number, color: string, size: number) =>
    ls.forEach((l, k) => reveal(ctx, l, x, y0 + lh * k, t, lineStart(ls, k, t0, mode), mode, color, s.accent, alpha, size));

  switch (b.kind) {
    case 'place': {
      ctx.font = `600 40px ${s.fonts.text}`;
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const px = fit(ctx, [b.title], (p) => `900 ${p}px ${s.fonts.display}`, 132, -0.02);
      const top = BLOCK_BOTTOM - text.length * 52 - (text.length ? 24 : 0) - px * 0.9;
      guard({ x: LEFT, y: top, w: WIDTH, h: BLOCK_BOTTOM - top }, 'place');
      kicker('NEREDE', top - 22 + rise);
      ctx.font = `900 ${px}px ${s.fonts.display}`; ctx.letterSpacing = `${-0.02 * px}px`;
      reveal(ctx, b.title, LEFT - 4, top + px * 0.9 + rise, t, b.at, mode, s.ink, s.accent, alpha, px);
      ctx.letterSpacing = '0px'; ctx.font = `600 40px ${s.fonts.text}`;
      lines(text, LEFT, top + px * 0.9 + 24 + 52 + rise, 52, b.at + (mode === 'type' ? b.title.length / TYPE_CPS : 0.35), s.muted, 40);
      break;
    }
    case 'facts': {
      const px = fit(ctx, b.lines.map((l) => l.replace(/\*/g, '')), (p) => `800 ${p}px ${s.fonts.text}`, 76);
      const lh = Math.round(px * 1.18);
      const top = BLOCK_BOTTOM - b.lines.length * lh;
      guard({ x: LEFT, y: top - px, w: WIDTH, h: BLOCK_BOTTOM - top + px }, 'facts');
      kicker(b.kicker ?? 'NE OLDU', top + 0.8 * lh - 0.72 * px - 26 + rise);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      lines(b.lines, LEFT, top + lh * 0.8 + rise, lh, b.at, s.ink, px);
      break;
    }
    case 'distance': {
      const d = km(b.from.at, b.to.at);
      const count = anim(t, b.at + 0.2, 1.4, ease.inOutCubic);
      const num = `~${Math.round((d * count) / 10) * 10} KM`;
      const px = fit(ctx, [`~${d} KM`], (p) => `900 ${p}px ${s.fonts.display}`, 200, -0.03);
      ctx.font = `600 40px ${s.fonts.text}`;
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const top = BLOCK_BOTTOM - text.length * 50 - 64 - px * 0.9;
      guard({ x: LEFT, y: top - 40, w: WIDTH, h: BLOCK_BOTTOM - top + 40 }, 'distance');
      // close is close only when it is: past 700 km the beat says distance, not nearness
      kicker(d <= 700 ? 'TÜRKİYE\'YE NE KADAR YAKIN' : 'TÜRKİYE\'YE UZAKLIK', top - 16 + rise);
      // the counter is its own animation in every mode: a number that runs up is the point of this beat
      ctx.globalAlpha = alpha; ctx.fillStyle = s.accent;
      ctx.font = `900 ${px}px ${s.fonts.display}`; ctx.letterSpacing = `${-0.03 * px}px`;
      ctx.fillText(num, LEFT - 6, top + px * 0.9 + rise);
      ctx.letterSpacing = '0px'; ctx.font = `700 40px ${s.fonts.text}`;
      reveal(ctx, `${b.from.label} → ${b.to.label}`, LEFT, top + px * 0.9 + 60 + rise, t, b.at + 0.3, mode, s.ink, s.accent, alpha, 40);
      ctx.font = `600 36px ${s.fonts.text}`;
      lines(text, LEFT, top + px * 0.9 + 64 + 50 + rise, 50, b.at + 0.9, s.muted, 36);
      break;
    }
    case 'status': {
      const label = sc.hook.status;
      const px = fit(ctx, [label], (p) => `900 ${p}px ${s.fonts.display}`, 104, 0.02);
      ctx.font = `600 40px ${s.fonts.text}`;
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const top = BLOCK_BOTTOM - text.length * 52 - 40 - px * 1.25;
      guard({ x: LEFT - 12, y: top - 40, w: WIDTH + 12, h: BLOCK_BOTTOM - top + 40 }, 'status');
      const p = anim(t, b.at, 0.6, ease.outExpo);
      kicker('DURUM', top - 16 + rise);
      // the stamp: a frame that closes around the word
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${px}px ${s.fonts.display}`; ctx.letterSpacing = `${0.02 * px}px`;
      const tw = ctx.measureText(label).width;
      ctx.strokeStyle = s.status; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect(LEFT - 12, top + rise, (tw + 24) * p, px * 1.25, 8); ctx.stroke();
      ctx.fillStyle = s.status; ctx.fillText(label, LEFT, top + px * 1.0 + rise);
      ctx.letterSpacing = '0px'; ctx.font = `600 40px ${s.fonts.text}`;
      lines(text, LEFT, top + px * 1.25 + 60 + rise, 52, b.at + 0.4, s.ink, 40);
      break;
    }
    case 'close': {
      const px = fit(ctx, b.lines.map((l) => l.replace(/\*/g, '')), (p) => `800 ${p}px ${s.fonts.text}`, 72);
      const lh = Math.round(px * 1.2);
      const top = BLOCK_BOTTOM - b.lines.length * lh;
      guard({ x: LEFT, y: top - 50, w: WIDTH, h: BLOCK_BOTTOM - top + 50 }, 'close');
      if (b.kicker) kicker(b.kicker, top + 0.8 * lh - 0.72 * px - 26 + rise);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      lines(b.lines, LEFT, top + lh * 0.8 + rise, lh, b.at, s.ink, px);
      break;
    }
    case 'link':
    case 'roster': {
      // title, then the parties as flag chips, two to a row
      const parties = sc.parties ?? [];
      ctx.font = `600 38px ${s.fonts.text}`;
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const px = fit(ctx, [b.title], (p) => `900 ${p}px ${s.fonts.display}`, 104, -0.01);
      const rows = Math.ceil(parties.length / 2), chipH = 64, gap = 14;
      const top = BLOCK_BOTTOM - text.length * 50 - rows * (chipH + gap) - 20 - px * 0.95;
      guard({ x: LEFT, y: top - 40, w: WIDTH, h: BLOCK_BOTTOM - top + 40 }, b.kind);
      kicker(b.kind === 'link' ? 'TARAFLAR' : 'KATILIMCILAR', top - 16 + rise);
      ctx.font = `900 ${px}px ${s.fonts.display}`; ctx.letterSpacing = `${-0.01 * px}px`;
      reveal(ctx, b.title, LEFT - 3, top + px * 0.85 + rise, t, b.at, mode, s.ink, s.accent, alpha, px);
      ctx.letterSpacing = '0px';
      const colW = (WIDTH - gap) / 2;
      parties.forEach((p, k) => {
        const x = LEFT + (k % 2) * (colW + gap), y = top + px * 0.95 + 20 + Math.floor(k / 2) * (chipH + gap) + rise;
        chip(ctx, a, p.emblem, p.label, x, y, colW, chipH, s, alpha * anim(t, b.at + 0.3 + 0.12 * k, 0.4, ease.outBack));
      });
      ctx.font = `600 38px ${s.fonts.text}`;
      lines(text, LEFT, top + px * 0.95 + 20 + rows * (chipH + gap) + 42 + rise, 50, b.at + 0.9, s.muted, 38);
      break;
    }
    case 'recent': {
      const n = b.points.length;
      const count = Math.round(n * anim(t, b.at + 0.3, 1.8, ease.linear));
      const px = fit(ctx, [String(n)], (p) => `900 ${p}px ${s.fonts.display}`, 200, -0.03);
      ctx.font = `600 38px ${s.fonts.text}`;
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const top = BLOCK_BOTTOM - text.length * 50 - 60 - px * 0.9;
      guard({ x: LEFT, y: top - 40, w: WIDTH, h: BLOCK_BOTTOM - top + 40 }, 'recent');
      kicker(b.title, top - 16 + rise);
      // a count of our records, not of casualties: it may run up
      ctx.globalAlpha = alpha; ctx.fillStyle = s.accent;
      ctx.font = `900 ${px}px ${s.fonts.display}`; ctx.letterSpacing = `${-0.03 * px}px`;
      ctx.fillText(String(count), LEFT - 6, top + px * 0.9 + rise);
      ctx.letterSpacing = '0px'; ctx.font = `600 38px ${s.fonts.text}`;
      lines(text, LEFT, top + px * 0.9 + 58 + rise, 50, b.at + 0.5, s.ink, 38);
      break;
    }
    case 'quote': {
      const speaker = b.speaker != null ? sc.parties?.[b.speaker] : undefined;
      const px = fit(ctx, b.lines, (p) => `700 ${p}px ${s.fonts.text}`, 64);
      const lh = Math.round(px * 1.22);
      const top = BLOCK_BOTTOM - b.lines.length * lh;
      guard({ x: LEFT, y: top - 150, w: WIDTH, h: BLOCK_BOTTOM - top + 150 }, 'quote');
      // the quotation mark is the frame: it says these are someone's words, not ours
      ctx.globalAlpha = alpha * anim(t, b.at, 0.4); ctx.fillStyle = s.accent; ctx.font = `900 150px ${s.fonts.display}`;
      ctx.fillText('“', LEFT - 8, top + 48 + rise);
      if (speaker) chip(ctx, a, speaker.emblem, speaker.label, LEFT + 110, top - 118 + rise, WIDTH - 110, 56, s, alpha * anim(t, b.at + 0.15, 0.4));
      ctx.font = `700 ${px}px ${s.fonts.text}`;
      lines(b.lines, LEFT, top + lh * 0.8 + rise, lh, b.at + 0.3, s.ink, px);
      break;
    }
  }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
}

/** A party as a chip: its flag in a rounded frame and its name in capitals. */
function chip(ctx: CanvasRenderingContext2D, a: Assets, emblem: string | undefined, label: string, x: number, y: number, w: number, h: number, s: Style, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = hexA(s.bg[1].startsWith('#') ? s.bg[1] : '#000000', 0.55);
  ctx.strokeStyle = hexA(s.ink.startsWith('#') ? s.ink : '#ffffff', 0.35); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
  const img = emblem ? a.emblems.get(emblem) : undefined;
  let tx = x + 18;
  if (img) {
    const fh = h - 22, fw = Math.min(fh * 1.5, (fh * img.naturalWidth) / (img.naturalHeight || 1));
    ctx.save(); ctx.beginPath(); ctx.roundRect(x + 11, y + 11, fw, fh, 4); ctx.clip();
    ctx.drawImage(img, x + 11, y + 11, fw, fh); ctx.restore();
    tx = x + 11 + fw + 14;
  }
  ctx.fillStyle = s.ink; ctx.font = `700 26px ${s.fonts.mono}`; ctx.letterSpacing = '2px'; ctx.textBaseline = 'middle';
  let name = label;
  while (ctx.measureText(name).width > x + w - tx - 12 && name.length > 3) name = name.slice(0, -2) + '…';
  ctx.fillText(name, tx, y + h / 2 + 1);
  ctx.restore();
}

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
