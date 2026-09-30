import { geoDistance, geoInterpolate } from 'd3-geo';
import type { Assets } from '../assets';
import { anim, ease, lerp, rng, span } from '../engine/time';
import type { Beat, Camera, LonLat, Scene } from '../engine/scene';
import { H, W } from '../render/globe';
import type { MapRenderer } from '../render/map';
import { drawLabels, placeLabels, type Box, type Label } from '../render/labels';
import type { Style } from '../styles';

const BOSPHORUS: LonLat = [29.05, 41.2];

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
function cameraAt(sc: Scene, t: number): Camera {
  const cam = sc.camera;
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
  const k = ease.inOutCubic(span(t, a.t, b.t));
  return {
    center: [lerp(a.center[0], b.center[0], k) + 0.5 * sway, lerp(a.center[1], b.center[1], k)],
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)) * (1 + 0.015 * sway),
  };
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

/** Draws text runs where words between asterisks take the accent colour. */
function marked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ink: string, accent: string) {
  let cx = x;
  for (const [j, part] of text.split('*').entries()) {
    if (!part) continue;
    ctx.fillStyle = j % 2 ? accent : ink;
    ctx.fillText(part, cx, y);
    cx += ctx.measureText(part).width;
  }
}

/**
 * One video: the hook, then the beats of PLAN.md section 14 (place, facts, distance, status, close),
 * with the status and the source on screen from the first second to the last frame. Every value
 * below is a function of `t`; the last frame is the first one again, so the video loops.
 */
export function drawVideo(ctx: CanvasRenderingContext2D, a: Assets, map: MapRenderer, sc: Scene, s: Style, t: number, frame: number) {
  const D = sc.duration;
  const full = sc.beats.length > 0;
  const tail = full ? 1 - span(t, D - 0.9, D - 0.05) : 1; // everything that was not on frame 0 leaves before the loop
  const view = cameraAt(sc, t);
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6);
  const beatIdx = sc.beats.findIndex((b, i) => t >= b.at && (i + 1 >= sc.beats.length || t < sc.beats[i + 1].at));
  const beat: Beat | undefined = sc.beats[beatIdx];
  // the emblem belongs to the opening: gone before the camera zooms in far enough to crop it
  const emblemOut = full ? sc.beats[0].at + 0.8 : D;

  ctx.save();
  const proj = map.draw(ctx, s, view, { subject: sc.subject?.country, subjectReveal: anim(t, 0.15, 0.9, ease.outQuad) * tail, pulse });

  const obstacles: Box[] = [{ x: 0, y: 960, w: W, h: H - 960 }]; // the text block and its wash
  const labels: Label[] = [];

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
      obstacles.push({ x: x - 60, y: y - 60, w: 120, h: 120 });
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
      obstacles.push({ x: q[0] - 24, y: q[1] - 24, w: 48, h: 48 });
      labels.push({ text: end.label, x: q[0], y: q[1] - 46, size: 28, color: s.ink, spacing: 0.3, weight: 700, priority: -1, alpha: w.out * show });
    }
    ctx.globalAlpha = 1;
  }

  // the subject's emblem over its own territory (ADR 0026: news context, never beside our mark);
  // it belongs to the opening and leaves when the facts arrive
  const subjectLabel = sc.labels.find((l) => l.kind === 'country' && l.text === sc.subject?.label);
  if (sc.subject?.emblem) {
    const img = a.emblems.get(sc.subject.emblem);
    const at = proj(subjectLabel?.at ?? [view.center[0] + 10, view.center[1] + 9]);
    const alpha = anim(t, 0.45, 0.4) * (1 - span(t, emblemOut - 0.4, emblemOut));
    if (img && at && alpha > 0) {
      const p = anim(t, 0.45, 0.7, ease.outBack);
      const size = 200 * (0.85 + 0.15 * p);
      const ar = img.naturalHeight / img.naturalWidth || 1;
      const [x, y] = at;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (s.emblemMono) ctx.filter = 'grayscale(1) brightness(2.2) contrast(1.1)';
      if (!s.flat) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30; }
      ctx.drawImage(img, x - size / 2, y - (size * ar) / 2, size, size * ar);
      ctx.restore();
      obstacles.push({ x: x - size / 2, y: y - (size * ar) / 2, w: size, h: size * ar });
      if (sc.subject.label) labels.push({ text: sc.subject.label, x, y: y + (size * ar) / 2 + 34, size: 26, color: s.label, spacing: 0.45, priority: 0, alpha: anim(t, 0.8, 0.4) * alpha });
    }
  }
  sc.labels.forEach((l, i) => {
    if (l === subjectLabel && sc.subject?.emblem && t < emblemOut) return;
    const p = proj(l.at);
    if (!p) return;
    const home = l.kind === 'home';
    labels.push({ text: l.text, x: p[0], y: p[1], size: home ? 32 : 24, color: home ? '#ffffff' : s.label, spacing: 0.4, weight: home ? 700 : 500,
      priority: home ? 1 : 2 + i, alpha: anim(t, 0.6 + 0.08 * i, 0.4) * tail });
  });
  if (s.flat) labels.forEach((l) => { if (l.text === 'TÜRKİYE') l.color = '#ffffff'; });
  drawLabels(ctx, placeLabels(ctx, labels, obstacles));

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
  if (beat) drawBeat(ctx, sc, s, beatIdx, t);

  // status and source: from the first second to the last frame, never only at the end (research/01, rules 9–10)
  drawFooter(ctx, sc, s, full ? 1 : anim(t, 1.3, 0.4));

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

function drawHookBlock(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, t: number, alpha: number) {
  if (alpha <= 0) return;
  const lift = (1 - alpha) * 40;
  ctx.font = '600 40px M';
  const subLines = wrap(ctx, sc.hook.sub.replace('{km}', sc.event ? String(kmToBosphorus(sc.event.at)) : '?'), WIDTH);
  // each line as big as it can be on its own: a short word stays huge even when the next line is long
  // (sized for the loosest tracking of the settle below)
  const sizes = sc.hook.lines.map((l) => fit(ctx, [l], (p) => `900 ${p}px M`, 188, 4 / 188));
  const heights = sizes.map((px) => Math.round(px * 0.915));
  const subTop = BLOCK_BOTTOM - subLines.length * 50;
  const linesTop = subTop - 40 - heights.reduce((a, b) => a + b, 0);
  const kickerY = linesTop - 30;
  guard({ x: LEFT - 6, y: kickerY - 26, w: WIDTH, h: BLOCK_BOTTOM - kickerY + 26 }, 'hook');

  const kp = alpha;
  ctx.globalAlpha = kp; ctx.fillStyle = s.accent; ctx.font = '700 26px X'; ctx.letterSpacing = '8px';
  ctx.fillText(sc.hook.kicker, LEFT - 30 * (1 - anim(t, 0.05, 0.4)), kickerY - lift);
  ctx.letterSpacing = '0px';

  sc.hook.lines.forEach((text, i) => {
    // fully legible on frame 0, which is also the thumbnail (research/01, rule 1): the motion is the
    // tracking closing in, not the words arriving
    const p = anim(t, 0.04 * i, 0.7, ease.outExpo);
    const px = sizes[i];
    const base = linesTop + heights.slice(0, i + 1).reduce((a, b) => a + b, 0) - 18 * (px / 188);
    ctx.font = `900 ${px}px M`; ctx.letterSpacing = `${(-5 + 9 * (1 - p)) * (px / 188)}px`;
    ctx.fillStyle = i === sc.hook.lines.length - 1 ? s.accent : s.ink;
    ctx.globalAlpha = alpha;
    ctx.fillText(text, LEFT - 6, base - lift);
  });
  ctx.letterSpacing = '0px';

  const sp = anim(t, 0.95, 0.45);
  ctx.globalAlpha = sp * alpha; ctx.fillStyle = s.ink; ctx.font = '600 40px M';
  subLines.forEach((l, i) => ctx.fillText(l, LEFT, subTop + 40 + i * 50 + (1 - sp) * 18 - lift));
  ctx.globalAlpha = 1;
}

function drawFooter(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, alpha: number) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.font = '700 22px X'; ctx.letterSpacing = '3px';
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

function drawBeat(ctx: CanvasRenderingContext2D, sc: Scene, s: Style, i: number, t: number) {
  const b = sc.beats[i];
  const w = windowOf(sc, i, t);
  const alpha = w.inP * w.out;
  if (alpha <= 0) return;
  const rise = (1 - w.inP) * 36 + (1 - w.out) * 30;
  const at = (dt: number, d = 0.45) => anim(t, b.at + dt, d, ease.outExpo); // staggered entry inside a beat

  switch (b.kind) {
    case 'place': {
      ctx.font = '600 40px M';
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const px = fit(ctx, [b.title], (p) => `900 ${p}px M`, 132, -0.02);
      const top = BLOCK_BOTTOM - text.length * 52 - (text.length ? 24 : 0) - px * 0.9;
      guard({ x: LEFT, y: top, w: WIDTH, h: BLOCK_BOTTOM - top }, 'place');
      ctx.globalAlpha = alpha; ctx.fillStyle = s.accent; ctx.font = '700 26px X'; ctx.letterSpacing = '8px';
      ctx.fillText('NEREDE', LEFT, top - 22 + rise);
      ctx.font = `900 ${px}px M`; ctx.letterSpacing = `${-0.02 * px}px`; ctx.fillStyle = s.ink;
      ctx.fillText(b.title, LEFT - 4, top + px * 0.9 + rise);
      ctx.letterSpacing = '0px'; ctx.font = '600 40px M'; ctx.fillStyle = s.muted;
      text.forEach((l, k) => { ctx.globalAlpha = alpha * at(0.35 + 0.1 * k); ctx.fillText(l, LEFT, top + px * 0.9 + 24 + 52 * (k + 1) + rise); });
      break;
    }
    case 'facts': {
      const px = fit(ctx, b.lines.map((l) => l.replace(/\*/g, '')), (p) => `800 ${p}px M`, 76);
      const lh = Math.round(px * 1.18);
      const top = BLOCK_BOTTOM - b.lines.length * lh;
      guard({ x: LEFT, y: top - px, w: WIDTH, h: BLOCK_BOTTOM - top + px }, 'facts');
      ctx.font = '700 26px X'; ctx.letterSpacing = '8px'; ctx.fillStyle = s.accent; ctx.globalAlpha = alpha;
      ctx.fillText(b.kicker ?? 'NE OLDU', LEFT, top + 0.8 * lh - 0.72 * px - 26 + rise);
      ctx.letterSpacing = '0px'; ctx.font = `800 ${px}px M`;
      b.lines.forEach((l, k) => {
        const p = at(0.12 * k);
        ctx.globalAlpha = alpha * p;
        marked(ctx, l, LEFT, top + lh * (k + 1) - lh * 0.2 + (1 - p) * 24 + rise, s.ink, s.accent);
      });
      break;
    }
    case 'distance': {
      const d = km(b.from.at, b.to.at);
      const count = anim(t, b.at + 0.2, 1.4, ease.inOutCubic);
      const num = `~${Math.round((d * count) / 10) * 10} KM`;
      const px = fit(ctx, [`~${d} KM`], (p) => `900 ${p}px M`, 200, -0.03);
      ctx.font = '600 40px M';
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const top = BLOCK_BOTTOM - text.length * 50 - 64 - px * 0.9;
      guard({ x: LEFT, y: top - 40, w: WIDTH, h: BLOCK_BOTTOM - top + 40 }, 'distance');
      ctx.globalAlpha = alpha; ctx.fillStyle = s.accent; ctx.font = '700 26px X'; ctx.letterSpacing = '8px';
      ctx.fillText('NE KADAR YAKIN', LEFT, top - 16 + rise);
      ctx.font = `900 ${px}px M`; ctx.letterSpacing = `${-0.03 * px}px`;
      ctx.fillText(num, LEFT - 6, top + px * 0.9 + rise);
      ctx.letterSpacing = '0px'; ctx.font = '700 40px M'; ctx.fillStyle = s.ink; ctx.globalAlpha = alpha * at(0.3);
      ctx.fillText(`${b.from.label} → ${b.to.label}`, LEFT, top + px * 0.9 + 60 + rise);
      ctx.font = '600 36px M'; ctx.fillStyle = s.muted;
      text.forEach((l, k) => { ctx.globalAlpha = alpha * at(0.9 + 0.12 * k); ctx.fillText(l, LEFT, top + px * 0.9 + 64 + 50 * (k + 1) + rise); });
      break;
    }
    case 'status': {
      const label = sc.hook.status;
      const px = fit(ctx, [label], (p) => `900 ${p}px M`, 104, 0.02);
      ctx.font = '600 40px M';
      const text = b.text ? wrap(ctx, b.text, WIDTH) : [];
      const top = BLOCK_BOTTOM - text.length * 52 - 40 - px * 1.25;
      guard({ x: LEFT - 12, y: top - 40, w: WIDTH + 12, h: BLOCK_BOTTOM - top + 40 }, 'status');
      const p = at(0, 0.6);
      ctx.globalAlpha = alpha; ctx.fillStyle = s.accent; ctx.font = '700 26px X'; ctx.letterSpacing = '8px';
      ctx.fillText('DURUM', LEFT, top - 16 + rise);
      // the stamp: a frame that closes around the word
      ctx.font = `900 ${px}px M`; ctx.letterSpacing = `${0.02 * px}px`;
      const tw = ctx.measureText(label).width;
      ctx.strokeStyle = s.status; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect(LEFT - 12, top + rise, (tw + 24) * p, px * 1.25, 8); ctx.stroke();
      ctx.fillStyle = s.status; ctx.fillText(label, LEFT, top + px * 1.0 + rise);
      ctx.letterSpacing = '0px'; ctx.font = '600 40px M'; ctx.fillStyle = s.ink;
      text.forEach((l, k) => { ctx.globalAlpha = alpha * at(0.4 + 0.12 * k); ctx.fillText(l, LEFT, top + px * 1.25 + 40 + 52 * k + 20 + rise); });
      break;
    }
    case 'close': {
      const px = fit(ctx, b.lines, (p) => `800 ${p}px M`, 72);
      const lh = Math.round(px * 1.2);
      const top = BLOCK_BOTTOM - b.lines.length * lh;
      guard({ x: LEFT, y: top - 50, w: WIDTH, h: BLOCK_BOTTOM - top + 50 }, 'close');
      if (b.kicker) { ctx.globalAlpha = alpha; ctx.fillStyle = s.accent; ctx.font = '700 26px X'; ctx.letterSpacing = '8px'; ctx.fillText(b.kicker, LEFT, top + 0.8 * lh - 0.72 * px - 26 + rise); }
      ctx.letterSpacing = '0px'; ctx.font = `800 ${px}px M`;
      b.lines.forEach((l, k) => { const p = at(0.12 * k); ctx.globalAlpha = alpha * p; marked(ctx, l, LEFT, top + lh * (k + 1) - lh * 0.2 + (1 - p) * 20 + rise, s.ink, s.accent); });
      break;
    }
  }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
