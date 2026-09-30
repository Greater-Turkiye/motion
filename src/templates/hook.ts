import { geoDistance } from 'd3-geo';
import type { Assets } from '../assets';
import { anim, ease, lerp, rng, span } from '../engine/time';
import type { Scene } from '../engine/scene';
import { drawGlobe, H, projection, W } from '../render/globe';
import { drawLabels, placeLabels, type Box, type Label } from '../render/labels';
import type { Style } from '../styles';

const BOSPHORUS: [number, number] = [29.05, 41.2];

/** Distance from the event to the İstanbul Strait, rounded to 10 km: the hook's "why it matters". */
export const kmToBosphorus = (at: [number, number]) => Math.round((geoDistance(at, BOSPHORUS) * 6371) / 10) * 10;

// film grain: a few noise tiles made once from a fixed seed, picked and offset by frame number
let grain: HTMLCanvasElement[] | null = null;
function grainTiles() {
  if (grain) return grain;
  const r = rng(20260930);
  grain = [0, 1, 2, 3].map(() => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H; // whole frames, so a frame costs one draw instead of thirty
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

/**
 * The hook: the first seconds of a video. The camera is already moving on frame 0 (no logo, no
 * intro), the subject country lights up, the event pulses, and the record's most concrete fact
 * arrives in two heavy lines. Every timing below is a function of `t` alone.
 */
export function drawHook(ctx: CanvasRenderingContext2D, a: Assets, sc: Scene, s: Style, t: number, frame: number) {
  const cam = sc.camera;
  const k = (ease[cam.ease] || ease.outCubic)(span(t, 0, cam.seconds));
  const drift = t * 0.35; // a slow continuous drift so the frame never freezes after the move
  const center: [number, number] = [lerp(cam.from.center[0], cam.to.center[0], k) + drift * 0.3, lerp(cam.from.center[1], cam.to.center[1], k)];
  const zoom = lerp(cam.from.zoom, cam.to.zoom, k) * (1 + 0.012 * t);
  const proj = projection(s, { center, zoom });
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6);

  ctx.save();
  drawGlobe(ctx, a, s, proj, { subject: sc.subject?.country, subjectReveal: anim(t, 0.15, 0.9, ease.outQuad), pulse });

  const obstacles: Box[] = [{ x: 0, y: 1060, w: W, h: H - 1060 }]; // the text block and its wash
  // event: a region-level ring, never a pin, with shock waves every 1.1 s
  if (sc.event) {
    const p = proj(sc.event.at);
    if (p) {
      const [x, y] = p;
      for (let n = 0; n < 3; n++) {
        const w = (t - 0.5 - n * 0.37) / 1.1;
        if (w < 0) continue;
        const ph = w - Math.floor(w);
        ctx.beginPath(); ctx.arc(x, y, 18 + ph * 120, 0, Math.PI * 2);
        ctx.strokeStyle = s.accent; ctx.globalAlpha = (1 - ph) * 0.9; ctx.lineWidth = 3 * (1 - ph) + 0.5; ctx.stroke();
      }
      ctx.globalAlpha = anim(t, 0.35, 0.4);
      ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.strokeStyle = s.accent; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 9 + 2 * pulse, 0, Math.PI * 2); ctx.fillStyle = s.accent; ctx.fill();
      ctx.globalAlpha = 1;
      obstacles.push({ x: x - 60, y: y - 60, w: 120, h: 120 });
    }
  }

  // the subject's emblem over its own territory (ADR 0026: news context, never beside our mark)
  const labels: Label[] = [];
  if (sc.subject?.emblem) {
    const img = a.emblems.get(sc.subject.emblem);
    const at = proj([sc.labels.find((l) => l.kind === 'country' && l.text === sc.subject?.label)?.at[0] ?? center[0] + 10,
      sc.labels.find((l) => l.kind === 'country' && l.text === sc.subject?.label)?.at[1] ?? center[1] + 9]);
    if (img && at) {
      const p = anim(t, 0.45, 0.7, ease.outBack);
      const size = 200 * (0.85 + 0.15 * p);
      const ar = img.naturalHeight / img.naturalWidth || 1;
      const [x, y] = at;
      ctx.save();
      ctx.globalAlpha = anim(t, 0.45, 0.4);
      if (s.emblemMono) ctx.filter = 'grayscale(1) brightness(2.2) contrast(1.1)';
      if (!s.flat) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30; }
      ctx.drawImage(img, x - size / 2, y - (size * ar) / 2, size, size * ar);
      ctx.restore();
      obstacles.push({ x: x - size / 2, y: y - (size * ar) / 2, w: size, h: size * ar });
      if (sc.subject.label) labels.push({ text: sc.subject.label, x, y: y + (size * ar) / 2 + 34, size: 26, color: s.label, spacing: 0.45, priority: 0, alpha: anim(t, 0.8, 0.4) });
    }
  }
  sc.labels.forEach((l, i) => {
    if (l.kind === 'country' && l.text === sc.subject?.label) return;
    const p = proj(l.at);
    if (!p) return;
    const home = l.kind === 'home';
    labels.push({ text: l.text, x: p[0], y: p[1], size: home ? 32 : 24, color: home ? '#ffffff' : s.label, spacing: 0.4, weight: home ? 700 : 500,
      priority: home ? 1 : 2 + i, alpha: anim(t, 0.6 + 0.08 * i, 0.4) });
  });
  if (s.flat) labels.forEach((l) => { if (l.text === 'TÜRKİYE') l.color = '#ffffff'; });
  drawLabels(ctx, placeLabels(ctx, labels, obstacles));

  // wash under the text block
  const wash = ctx.createLinearGradient(0, 960, 0, H);
  const edge = s.bg[1];
  wash.addColorStop(0, hexA(edge, 0)); wash.addColorStop(0.3, hexA(edge, 0.9)); wash.addColorStop(1, hexA(edge, 1));
  ctx.fillStyle = wash; ctx.fillRect(0, 960, W, H - 960);

  // text, bottom-anchored
  const left = 80, width = W - 160;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '600 40px M';
  const subLines = wrap(ctx, sc.hook.sub.replace('{km}', sc.event ? String(kmToBosphorus(sc.event.at)) : '?'), width);
  const statusY = H - 250;
  const subTop = statusY - 60 - subLines.length * 50;
  const lineH = 172;
  const linesTop = subTop - 40 - sc.hook.lines.length * lineH;
  const kickerY = linesTop - 30;

  const kp = anim(t, 0.05, 0.4);
  ctx.globalAlpha = kp; ctx.fillStyle = s.accent; ctx.font = '700 26px X'; ctx.letterSpacing = '8px';
  ctx.fillText(sc.hook.kicker, left - 30 * (1 - kp), kickerY);
  ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;

  sc.hook.lines.forEach((text, i) => {
    // on screen from the first frame: the hook is what stops the thumb, so it cannot wait for an intro
    const p = anim(t, 0.06 * i, 0.45, ease.outExpo);
    const base = linesTop + (i + 1) * lineH - 18;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, base - lineH + 8, W, lineH + 20); ctx.clip(); // the line rises out of its own slot
    ctx.font = '900 188px M'; ctx.letterSpacing = '-5px';
    ctx.fillStyle = i === sc.hook.lines.length - 1 ? s.accent : s.ink;
    ctx.globalAlpha = 0.35 + 0.65 * p;
    ctx.fillText(text, left - 6, base + (1 - p) * lineH * 0.35);
    ctx.globalAlpha = 1;
    ctx.restore();
  });
  ctx.letterSpacing = '0px';

  const sp = anim(t, 0.95, 0.45);
  ctx.globalAlpha = sp; ctx.fillStyle = s.ink; ctx.font = '600 40px M';
  subLines.forEach((l, i) => ctx.fillText(l, left, subTop + 40 + i * 50 + (1 - sp) * 18));
  const stp = anim(t, 1.3, 0.4);
  ctx.globalAlpha = stp; ctx.fillStyle = s.status; ctx.font = '700 22px X'; ctx.letterSpacing = '3px';
  ctx.fillText(`${sc.hook.status} · ${sc.hook.source}`, left, statusY);
  ctx.letterSpacing = '0px'; ctx.globalAlpha = 1;

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

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
