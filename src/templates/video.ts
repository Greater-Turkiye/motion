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
/** Points inside Türkiye, coast to coast and Thrace to Hakkari: a foreign emblem never stands on them. */
const TURKIYE_INSIDE: LonLat[] = [
  [26.7, 41.6], [28.0, 41.2], [27.3, 40.2], [27.4, 38.6], [28.2, 37.3], [30.2, 37.0], [31.5, 36.9], [33.5, 36.6],
  [35.3, 37.0], [36.3, 36.4], [37.4, 37.1], [39.0, 37.2], [41.0, 37.4], [43.5, 37.6], [44.0, 39.6], [42.7, 41.1],
  [40.0, 40.9], [37.5, 41.0], [35.5, 41.7], [33.0, 41.9], [31.0, 41.1], [29.5, 40.0], [32.5, 39.0], [35.0, 38.5],
  [37.0, 39.5], [39.5, 39.5], [41.5, 39.0], [34.0, 37.8],
];

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
const EMBLEM = 140;
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
  // our mark and address in the corner: map names keep clear of it
  obstacles.push({ x: LEFT - 10, y: SAFE.top, w: 360, h: 46 });
  // the progress bar: a name drawn across it reads as a broken bar
  if (full && (sc.anim?.progress ?? s.motion.progress)) obstacles.push({ x: 0, y: SAFE.top - 50, w: W, h: 30 });
  const labels: Label[] = [];

  if (sc.event) {
    const p = proj(sc.event.at);
    // as wide as the ring with its shock waves (they reach ~140 px): names stood on the outer rings
    if (p) obstacles.push({ x: p[0] - 95, y: p[1] - 95, w: 190, h: 190 });
  }
  // a digest story's own place: ringed (see drawVideo) and named under the ring while its block is on
  if (beat?.kind === 'facts' && beat.place) {
    const q = proj(beat.place.at);
    const w = windowOf(sc, beatIdx, t);
    if (q) {
      obstacles.push({ x: q[0] - 60, y: q[1] - 60, w: 120, h: 120 });
      labels.push({ key: `fp${beatIdx}`, text: beat.place.label, x: q[0], y: q[1] + 78, size: 28, color: s.ink, spacing: 0.3, weight: 700, priority: -1, alpha: w.inP * w.out });
    }
  }
  // the parties' points on a link beat: labels keep clear of them
  if (beat?.kind === 'link') for (const p of sc.parties ?? []) {
    const q = proj(p.at);
    if (q) obstacles.push({ x: q[0] - 22, y: q[1] - 22, w: 44, h: 44 });
  }
  if (beat?.kind === 'distance') {
    const w = windowOf(sc, beatIdx, t);
    const draw = anim(t, beat.at + 0.2, 1.4, ease.inOutCubic);
    ([['d-from', beat.from, 1], ['d-to', beat.to, draw >= 1 ? anim(t, beat.at + 1.6, 0.3, ease.outCubic) : 0]] as const).forEach(([key, end, show]) => {
      const q = proj(end.at);
      if (!q || !show) return;
      obstacles.push({ x: q[0] - 24, y: q[1] - 24, w: 48, h: 48 });
      // each end's name on the side away from the other end: above Cyprus lies Türkiye, and "KIBRIS"
      // stood inside it when every name went above its point
      const other = proj((end === beat.from ? beat.to : beat.from).at);
      const below = !!other && other[1] < q[1];
      labels.push({ key, text: end.label, x: q[0], y: q[1] + (below ? 52 : -46), size: 28, color: s.ink, spacing: 0.3, weight: 700, priority: -1, alpha: w.out * show });
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
      // 140 px: at 200 the emblem dwarfed the country it stands for (a trident over a Ukraine half its size)
      const size = EMBLEM * (0.85 + 0.15 * anim(t, 0.45, 0.7, ease.outCubic));
      const y = at[1] - (EMBLEM * emblemAr) / 2 - 30;
      const box = { x: at[0] - size / 2 - 20, y: y - (size * emblemAr) / 2 - 20, w: size + 40, h: size * emblemAr + 40 };
      // a small country beside Türkiye puts the emblem above it onto Turkish ground (GKRY's arms stood on
      // Anatolia in a Cyprus video): then there is no emblem at all, the map's label names the country
      const onTurkiye = sc.subject?.country !== 'TUR' && TURKIYE_INSIDE.some((ll) => {
        const q = proj(ll);
        return !!q && q[0] >= box.x && q[0] <= box.x + box.w && q[1] >= box.y && q[1] <= box.y + box.h;
      });
      if (!onTurkiye) {
        emblem = { x: at[0], y, size, alpha };
        obstacles.push({ x: at[0] - size / 2, y: y - (size * emblemAr) / 2, w: size, h: size * emblemAr });
      }
    }
  }
  // on a flat page the TÜRKİYE label sits on the home fill: white on a dark fill, ink on a light one
  const [hr, hg, hb] = rgbOf(s.home);
  const homeInk = !s.flat || 0.2126 * hr + 0.7152 * hg + 0.0722 * hb < 150 ? '#ffffff' : s.ink;
  // names grow a little as the camera closes in and shrink a little when it pulls back: at a fixed
  // size a name was large beside a small country in the wide opening and small over the country it
  // filled when the camera came close (zoom 0.6 -> 0.88x, 1 -> 1x, 2.7 -> 1.25x)
  const nameScale = Math.min(1.25, Math.max(0.85, Math.pow(cameraAt(sc, s, t).zoom, 0.25)));
  sc.labels.forEach((l, i) => {
    const home = l.kind === 'home';
    // TÜRKİYE never moves off its middle (the owner saw it slide from frame to frame): it has one anchor,
    // and as the first, sticky label every other name gives way to it
    const anchors: LonLat[] = home ? [l.at] : [l.at, ...(l.alts ?? [])];
    const alts = anchors.map((x) => proj(x));
    const p = alts[0] ?? alts.find(Boolean);
    if (!p) return;
    const isSubject = l === subjectLabel;
    // on a distance beat its end points carry their own names: the map's label of the same place
    // gives way, or "TİRAN" stands twice a few pixels apart
    const twin = beat?.kind === 'distance' && (l.text === beat.from.label || l.text === beat.to.label)
      ? 1 - anim(t, beat.at, 0.3) * windowOf(sc, beatIdx, t).out : 1;
    labels.push({ key: `l${i}`, text: l.text, x: p[0], y: p[1], alts: anchors.length > 1 ? alts : undefined, size: Math.round((home ? 32 : isSubject ? 26 : 24) * nameScale), sticky: home,
      // tracking 0.22-0.3 em: at 0.4-0.45 a name ran wider than the country under it
      // TÜRKİYE stands on its own fill, where a paper-coloured outline would read as a box
      color: home ? homeInk : s.label, halo: home ? undefined : hexA(s.land, 0.75), spacing: home ? 0.3 : isSubject ? 0.26 : 0.22, weight: home ? 700 : 500,
      // TÜRKİYE is placed first: it never gives way to another label (sticky), so any label it meets must
      // be the one that yields, or the two are drawn on top of each other (BRĂİLA: ROMANYA over TÜRKİYE)
      // a sea's name gives way to any place name: the place is the story, the sea only the setting
      priority: home ? -0.5 : isSubject ? 0 : l.kind === 'sea' ? 20 + i : 2 + i, alpha: anim(t, isSubject ? 0.8 : 0.6 + 0.08 * i, 0.4) * tail * twin });
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

  // the event: a region-level ring, never a pin, with shock waves every 1.1 s; a facts block with a
  // place of its own (a digest's story) rings that place while it is on
  const own = beat?.kind === 'facts' && beat.place ? beat.place : null;
  const ring = own ? own.at : sc.event?.at;
  if (ring) {
    const p = proj(ring);
    const dim = (beat?.kind === 'distance' ? 0.45 : 1) * (own ? windowOf(sc, beatIdx, t).inP * windowOf(sc, beatIdx, t).out : 1);
    if (p) {
      const [x, y] = p;
      ctx.globalAlpha = 1;
      // what happened decides how the place moves: a strike sends short, quick waves; a ship's sea
      // slow, wide ones; an aircraft, an exercise or a meeting none (PLAN.md section 26)
      const kind = own ? 'ring' : sc.event?.kind ?? 'ring';
      const waves = { drone: [3, 1.1, 120], missile: [2, 0.7, 150], artillery: [3, 1.1, 110], ground: [2, 1.4, 90], sea: [2, 2.2, 170], ring: [3, 1.1, 120] }[kind as string] as [number, number, number] | undefined;
      if (waves) {
        const [count, period, reach] = waves;
        for (let n = 0; n < count; n++) {
          const w = (t - 0.5 - n * (period / count)) / period;
          if (w < 0) continue;
          const ph = w - Math.floor(w);
          ctx.beginPath();
          // the sea's waves are flattened, as water spreads; the others round
          if (kind === 'sea') ctx.ellipse(x, y, 18 + ph * reach, (18 + ph * reach) * 0.45, 0, 0, Math.PI * 2);
          else ctx.arc(x, y, 18 + ph * reach, 0, Math.PI * 2);
          ctx.strokeStyle = s.accent; ctx.globalAlpha = (1 - ph) * 0.9 * dim * tail; ctx.lineWidth = 3 * (1 - ph) + 0.5; ctx.stroke();
        }
      }
      ctx.globalAlpha = anim(t, 0.35, 0.4) * dim * tail;
      ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.strokeStyle = s.accent; ctx.lineWidth = 3; ctx.stroke();
      if (kind === 'ring') {
        ctx.beginPath(); ctx.arc(x, y, 9 + 2 * pulse, 0, Math.PI * 2); ctx.fillStyle = s.accent; ctx.fill();
      } else {
        drawSymbol(ctx, kind, x, y, 44, s.accent);
      }
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
    for (const [end, show] of [[beat.from, 1], [beat.to, draw >= 1 ? anim(t, beat.at + 1.6, 0.3, ease.outCubic) : 0]] as const) {
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
      const on = anim(t, beat.at + 0.3 + (1.8 * k) / Math.max(1, pts.length), 0.35, ease.outCubic);
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

  // satellite heat detections in a magnified circle over the place: 25 km is a few pixels at any zoom
  // the relief can stand, so the circle draws that radius at a readable scale, with the detections at
  // their true offsets inside it and its scale written on its edge. Small squares, unlike our records'
  // round points, so the two are never read as the same thing; all appear together, as the satellite
  // saw them (no order to tell)
  if (beat?.kind === 'satellite' && sc.event) {
    const w = windowOf(sc, beatIdx, t);
    const on = anim(t, beat.at + 0.2, 0.5, ease.outCubic);
    const c = proj(sc.event.at);
    if (on > 0 && c) {
      const R = 230, KM = 25;
      const [lon0, lat0] = sc.event.at;
      const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.57;
      ctx.save();
      ctx.globalAlpha = w.out * Math.min(1, on);
      ctx.beginPath(); ctx.arc(c[0], c[1], R * on, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = s.muted; ctx.stroke();
      // the place itself: a cross, as in the record (its precision is the scene's, not the satellite's)
      ctx.strokeStyle = s.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(c[0] - 12, c[1]); ctx.lineTo(c[0] + 12, c[1]); ctx.moveTo(c[0], c[1] - 12); ctx.lineTo(c[0], c[1] + 12); ctx.stroke();
      const dots = anim(t, beat.at + 0.6, 0.4, ease.outCubic);
      if (dots > 0) {
        ctx.globalAlpha = w.out * Math.min(1, dots);
        ctx.fillStyle = s.accent;
        for (const p of beat.points) {
          const dx = ((p.at[0] - lon0) * kx) / KM, dy = ((p.at[1] - lat0) * ky) / KM;
          if (dx * dx + dy * dy > 1) continue;
          ctx.fillRect(c[0] + dx * R - 7, c[1] - dy * R - 7, 14, 14);
        }
      }
      ctx.globalAlpha = w.out * Math.min(1, on);
      ctx.font = `600 26px ${s.fonts.mono}`;
      ctx.fillStyle = s.muted; ctx.textAlign = 'center';
      ctx.fillText(`${KM} KM`, c[0], c[1] + R + 34);
      ctx.restore();
    }
  }

  // the story's own photograph over the map's upper part, cropped to fill it, fading into the page above
  // the text block; no frame, no filter, no motion on the picture itself (PLAN.md section 29)
  if (beat?.kind === 'photo') {
    const img = a.photos.get(beat.file);
    const w = windowOf(sc, beatIdx, t);
    const on = anim(t, beat.at, 0.4, ease.outCubic);
    if (img && on > 0) {
      const boxH = BLOCK_BOTTOM - 330;
      const k = Math.max(W / img.naturalWidth, boxH / img.naturalHeight);
      const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
      ctx.save();
      ctx.globalAlpha = w.out * Math.min(1, on);
      ctx.beginPath(); ctx.rect(0, 0, W, boxH); ctx.clip();
      ctx.drawImage(img, (W - dw) / 2, (boxH - dh) / 2, dw, dh);
      const g = ctx.createLinearGradient(0, boxH - 260, 0, boxH);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, s.bg[1]);
      ctx.fillStyle = g; ctx.fillRect(0, boxH - 260, W, 260);
      ctx.restore();
    }
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
  if (sc.anim?.post === 'close') {
    drawCloseCard(ctx, sc, s);
    drawFooter(ctx, sc, s, 1);
    return;
  }
  // the hook: on screen from frame 0; in a full video it hands over to the first beat and returns in
  // the last half second, in exactly its frame-0 state, so the end runs into the start
  const hookEnd = full ? sc.beats[0].at : D;
  if (t < hookEnd) drawHookBlock(ctx, sc, s, t, full ? 1 - span(t, hookEnd - 0.3, hookEnd) : 1);
  else if (full && t > D - 0.5) drawHookBlock(ctx, sc, s, 0, span(t, D - 0.5, D));
  if (beat) drawBeat(ctx, sc, s, beatIdx, t, a);

  // status and source: from the first second to the last frame, never only at the end (research/01, rules 9–10)
  drawFooter(ctx, sc, s, full ? 1 : anim(t, 1.3, 0.4));
  if (!sc.anim?.post && full && (sc.anim?.progress ?? s.motion.progress)) drawProgress(ctx, sc, s, t);
  // our mark and address in the corner of every frame and every slide (the owner's call, 6 October);
  // the synthetic voice is said in the posting text and the release notes (CLAUDE.md section 4)
  drawBrand(ctx, s, a);

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
    m = { subLines, sizes, heights, subTop, linesTop, kickerY, top: kickerY - 40 - (sc.hook.badge ? 56 : 0) };
    hookMemo.set(key, m);
  }
  return m;
}

function drawHookBlock(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, t: number, alpha: number) {
  if (alpha <= 0) return;
  const lift = (1 - alpha) * 40;
  const { subLines, sizes, heights, subTop, linesTop, kickerY } = hookMetrics(ctx, sc, s);
  guard({ x: LEFT - 6, y: kickerY - 26, w: WIDTH, h: BLOCK_BOTTOM - kickerY + 26 }, 'hook');

  if (sc.hook.badge) {
    // the badge: a plain line over the kicker, whole on frame 0 (also the thumbnail); no pill and no
    // pop, which read as a sticker on a template reel (CLAUDE.md section 4)
    ctx.save();
    ctx.font = `800 22px ${s.fonts.mono}`; ctx.letterSpacing = '3px';
    const bw = ctx.measureText(sc.hook.badge).width, bh = 38, by = kickerY - 26 - 18 - bh;
    guard({ x: LEFT - 2, y: by, w: bw + 4, h: bh }, 'badge');
    ctx.globalAlpha = alpha; ctx.fillStyle = s.accent; ctx.textBaseline = 'middle';
    ctx.fillText(sc.hook.badge, LEFT, by + bh / 2 + 1);
    ctx.restore();
  }

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
        const p = anim(t, t0 + 0.07 * k, 0.42, ease.outCubic), a = anim(t, t0 + 0.07 * k, 0.12);
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
 * The carousel's last slide: what happened in one sentence, then who we are, over a darkened map.
 * Nothing here is a new claim (the sentence is the hook's own sub-line or lines), the footer keeps
 * status and source, and there is no call to action: no "swipe", no "save, follow" (CLAUDE.md
 * section 4); Instagram shows its own slide dots.
 */
function drawCloseCard(ctx: CanvasRenderingContext2D, sc: Scene, s: Style) {
  ctx.save();
  // the map stays readable behind the card (Türkiye in it), the text block on a deeper band
  ctx.fillStyle = hexA(s.bg[1].startsWith('#') ? s.bg[1] : '#000000', 0.35);
  ctx.fillRect(0, POST_WINDOW.y, W, POST_WINDOW.h);
  // a hook in capitals, lowered for the sentence, takes its casing back from the headline it came from
  // ("Khmara, ADF komuta …", not "adf"); a hook the headline does not hold word for word is capitalised
  const lowered = sc.hook.lines.join(' ').toLocaleLowerCase('tr');
  const fromTitle = (() => { const src = sc.source_text[0] ?? '', i = src.toLocaleLowerCase('tr').indexOf(lowered); return i >= 0 ? src.slice(i, i + lowered.length) : null; })();
  // a sentence starts with a capital, also when it is taken from the middle of the headline ("üç kişi …")
  // the weekly digest's hook is its own sentence, with the region a name: "Bu hafta Karadeniz'den 177 kayıt
  // derlendi" (lowered whole, it read "karadeniz'den")
  const week = sc.hook.lines[0].match(/^BU HAFTA (.+)$/u);
  // the summary is the whole story, as the voice tells it: a casualty hook takes its clause out of the
  // sub-line, and the card read "Gaz şebekelerine ve iş tesisine zarar verdi" under a story of seven
  // wounded. The record's Turkish title when it fits the card (four lines); else the sub-line
  const head = sc.source_text[0] ?? '';
  const title = /[çğıöşüÇĞİÖŞÜ]/u.test(head) && head.length <= 120 ? head.replace(/\s+/g, ' ').replace(/(\d) '/gu, "$1'") : '';
  const said = week
    ? `Bu hafta ${week[1].toLocaleLowerCase('tr').replace(/(^|\s)(\p{Ll})/gu, (_, a, c) => a + c.toLocaleUpperCase('tr'))} ${sc.hook.lines.slice(1).join(' ').toLocaleLowerCase('tr')}`
    : (title || sc.hook.sub || fromTitle || lowered).replace(/^./u, (c) => c.toLocaleUpperCase('tr'));
  ctx.font = `700 54px ${s.fonts.text}`;
  const lines = wrap(ctx, said, WIDTH).slice(0, 4);
  // the stack sits on the footer like every other slide's text, the map open above it
  const height = 30 + lines.length * 70 + 150 + 56;
  const top = FOOT - 80 - height;
  const band = ctx.createLinearGradient(0, top - 120, 0, FOOT + 40);
  band.addColorStop(0, hexA(s.bg[1].startsWith('#') ? s.bg[1] : '#000000', 0));
  band.addColorStop(0.18, hexA(s.bg[1].startsWith('#') ? s.bg[1] : '#000000', 0.85));
  band.addColorStop(1, hexA(s.bg[1].startsWith('#') ? s.bg[1] : '#000000', 0.92));
  ctx.fillStyle = band; ctx.fillRect(0, top - 120, W, FOOT + 40 - (top - 120));
  let y = top + 30;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.accent; ctx.font = `700 26px ${s.fonts.mono}`; ctx.letterSpacing = '8px';
  ctx.fillText(`ÖZET · ${sc.hook.kicker}`, LEFT, y);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = s.ink; ctx.font = `700 54px ${s.fonts.text}`;
  for (const line of lines) { y += 70; ctx.fillText(line, LEFT, y); }
  y += 150;
  ctx.fillStyle = s.ink; ctx.font = `900 60px ${s.fonts.display}`;
  ctx.fillText('GREATER TÜRKİYE', LEFT, y);
  ctx.fillStyle = s.muted; ctx.font = `500 34px ${s.fonts.text}`;
  ctx.fillText('Açık kaynaklarla bölgeyi izliyoruz.', LEFT, y + 56);
  ctx.restore();
}

/** Map symbols, flat and one colour like a printed map's legend: no glow, no shading. Drawn about
 *  `size` px across, centred on (x, y), heading up (north) where they have a heading. */
function drawSymbol(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, size: number, color: string) {
  const u = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'drone': // a delta wing, as the one-way attack drones are drawn
      ctx.moveTo(0, -u); ctx.lineTo(u, u * 0.7); ctx.lineTo(0, u * 0.35); ctx.lineTo(-u, u * 0.7); ctx.closePath(); ctx.fill();
      break;
    case 'missile': // a body with its fins
      ctx.moveTo(0, -u); ctx.lineTo(u * 0.2, -u * 0.6); ctx.lineTo(u * 0.2, u * 0.45); ctx.lineTo(u * 0.5, u); ctx.lineTo(-u * 0.5, u);
      ctx.lineTo(-u * 0.2, u * 0.45); ctx.lineTo(-u * 0.2, -u * 0.6); ctx.closePath(); ctx.fill();
      break;
    case 'air': // an aircraft seen from above
      ctx.moveTo(0, -u); ctx.lineTo(u * 0.12, -u * 0.2); ctx.lineTo(u, u * 0.15); ctx.lineTo(u, u * 0.32); ctx.lineTo(u * 0.12, u * 0.15);
      ctx.lineTo(u * 0.1, u * 0.7); ctx.lineTo(u * 0.4, u); ctx.lineTo(-u * 0.4, u); ctx.lineTo(-u * 0.1, u * 0.7); ctx.lineTo(-u * 0.12, u * 0.15);
      ctx.lineTo(-u, u * 0.32); ctx.lineTo(-u, u * 0.15); ctx.lineTo(-u * 0.12, -u * 0.2); ctx.closePath(); ctx.fill();
      break;
    case 'sea': // a hull seen from above, bow up
      ctx.moveTo(0, -u); ctx.quadraticCurveTo(u * 0.45, -u * 0.4, u * 0.38, u * 0.85); ctx.lineTo(-u * 0.38, u * 0.85);
      ctx.quadraticCurveTo(-u * 0.45, -u * 0.4, 0, -u); ctx.closePath(); ctx.fill();
      break;
    case 'artillery': // the military map's artillery sign: a filled dot in a ring
      ctx.arc(0, 0, u * 0.9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, u * 0.35, 0, Math.PI * 2); ctx.fill();
      break;
    case 'ground': // crossed lines: a clash on the ground
      ctx.moveTo(-u * 0.75, -u * 0.75); ctx.lineTo(u * 0.75, u * 0.75); ctx.moveTo(u * 0.75, -u * 0.75); ctx.lineTo(-u * 0.75, u * 0.75);
      ctx.lineWidth = 5; ctx.stroke();
      break;
    case 'exercise': // a diamond, open
      ctx.moveTo(0, -u); ctx.lineTo(u, 0); ctx.lineTo(0, u); ctx.lineTo(-u, 0); ctx.closePath(); ctx.stroke();
      break;
    case 'meeting': // two points joined
      ctx.arc(-u * 0.55, 0, u * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(u * 0.55, 0, u * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-u * 0.3, 0); ctx.lineTo(u * 0.3, 0); ctx.stroke();
      break;
  }
  ctx.restore();
}

const BRAND = { x: LEFT, y: SAFE.top + 32, text: 'greaterturkiye.org', mark: 34 };

/** Our mark and our address, small, in the top corner: who made the video, in every frame. The
 *  synthetic voice is declared in the posting text and the release notes instead (owner, 6 October). */
function drawBrand(ctx: CanvasRenderingContext2D, s: Style, a: Assets) {
  ctx.globalAlpha = 0.9;
  let x = BRAND.x;
  if (a.mark) {
    ctx.drawImage(a.mark, x, BRAND.y - BRAND.mark + 8, BRAND.mark, BRAND.mark);
    x += BRAND.mark + 12;
  }
  ctx.font = `700 20px ${s.fonts.mono}`; ctx.letterSpacing = '1px';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.muted; ctx.fillText(BRAND.text, x, BRAND.y);
  guard({ x: BRAND.x, y: BRAND.y - BRAND.mark + 8, w: x - BRAND.x + ctx.measureText(BRAND.text).width, h: BRAND.mark }, 'brand');
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
      // the distance in a line with the two places it lies between, at the size of the facts: no
      // counter running up and no number standing alone at poster size (CLAUDE.md section 4)
      const d = km(b.from.at, b.to.at);
      const name = (n: string) => n.toLocaleLowerCase('tr').replace(/(^|[\s-])(\p{L})/gu, (_, a: string, c: string) => a + c.toLocaleUpperCase('tr'));
      const px = 64, lh = Math.round(px * 1.18);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      const main = wrap(ctx, `${name(b.from.label)} → ${name(b.to.label)}: *~${d}\u00a0km*`, WIDTH);
      ctx.font = `600 36px ${s.fonts.text}`;
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const top = BLOCK_BOTTOM - 0.8 * lh - (main.length - 1) * lh - (text.length ? 60 + (text.length - 1) * 50 : 0) - 10;
      guard({ x: LEFT, y: top - px, w: WIDTH, h: BLOCK_BOTTOM - top + px }, 'distance');
      // close is close only when it is: past 700 km the beat says distance, not nearness
      kicker(d <= 700 ? 'TÜRKİYE\'YE NE KADAR YAKIN' : 'TÜRKİYE\'YE UZAKLIK', top + 0.8 * lh - 0.72 * px - 26 + rise);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      lines(main, LEFT, top + lh * 0.8 + rise, lh, b.at, s.ink, px);
      ctx.font = `600 36px ${s.fonts.text}`;
      lines(text, LEFT, top + lh * 0.8 + (main.length - 1) * lh + 60 + rise, 50, b.at + 0.9, s.muted, 36);
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
        chip(ctx, a, p.emblem, p.label, x, y, colW, chipH, s, alpha * anim(t, b.at + 0.3 + 0.12 * k, 0.4, ease.outCubic));
      });
      ctx.font = `600 38px ${s.fonts.text}`;
      lines(text, LEFT, top + px * 0.95 + 20 + rows * (chipH + gap) + 42 + rise, 50, b.at + 0.9, s.muted, 38);
      break;
    }
    case 'recent': {
      // our records near the place, said as one sentence; the count appears whole and does not run up
      // (CLAUDE.md section 4): the points lighting on the map show the pattern
      const n = b.points.length;
      const px = 64, lh = Math.round(px * 1.18);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      const said = wrap(ctx, b.text ? `${b.text.replace(/[.\s]+$/, '')}: *${n}*\u00a0kayıt.` : `*${n}*\u00a0kayıt.`, WIDTH);
      const top = BLOCK_BOTTOM - said.length * lh;
      guard({ x: LEFT, y: top - px, w: WIDTH, h: BLOCK_BOTTOM - top + px }, 'recent');
      kicker(b.title, top + 0.8 * lh - 0.72 * px - 26 + rise);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      lines(said, LEFT, top + lh * 0.8 + rise, lh, b.at, s.ink, px);
      break;
    }
    case 'satellite': {
      // the count stands in its sentence at the size of the facts (CLAUDE.md section 4); the note under
      // it says what a detection is not, in the muted colour
      const n = b.points.length;
      const px = 60, lh = Math.round(px * 1.18);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      // the satellite sees one fire on several passes: the squares fall on one another, so the sentence
      // says in how many places ("1 noktada 3 ısı tespiti"), and the circle shows what it says
      const where = b.spots && b.spots < n ? `${b.spots}\u00a0noktada ` : '';
      const said = wrap(ctx, `${(b.text ?? '').replace(/[.\s]+$/, '')}: ${where}*${n}*\u00a0ısı tespiti.`, WIDTH);
      ctx.font = `600 36px ${s.fonts.text}`;
      const note = b.note ? wrap(ctx, b.note, WIDTH) : [];
      const noteH = note.length * 44;
      const top = BLOCK_BOTTOM - said.length * lh - noteH - (note.length ? 18 : 0);
      guard({ x: LEFT, y: top - px, w: WIDTH, h: BLOCK_BOTTOM - top + px }, 'satellite');
      kicker(b.title, top + 0.8 * lh - 0.72 * px - 26 + rise);
      ctx.font = `800 ${px}px ${s.fonts.text}`;
      lines(said, LEFT, top + lh * 0.8 + rise, lh, b.at, s.ink, px);
      if (note.length) {
        ctx.font = `600 36px ${s.fonts.text}`;
        lines(note, LEFT, top + said.length * lh + 18 + 36 + rise, 44, b.at + 0.6, s.muted, 36);
      }
      break;
    }
    case 'photo': {
      // whose photograph and under what terms, at the size of a kicker
      kicker('KAYNAĞIN FOTOĞRAFI', BLOCK_BOTTOM - 70 + rise);
      ctx.font = `600 36px ${s.fonts.text}`;
      lines(wrap(ctx, b.credit, WIDTH), LEFT, BLOCK_BOTTOM - 10 + rise, 44, b.at + 0.3, s.muted, 36);
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
