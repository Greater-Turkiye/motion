import type { LonLat } from '../engine/scene';
import type { Project } from '../gl/globe-gl';
import type { Style } from '../styles';

const D = Math.PI / 180;
const EARTH_KM = 6371;

/**
 * The ground track of a circular orbit of inclination `inc` (degrees) that passes over the pad, one
 * revolution from the pad onwards, ignoring the Earth's turn under it (a single drawn revolution, not
 * a forecast). `heading` picks the pass: north-bound (the usual) or south-bound (a polar launch from
 * the southern hemisphere, as from New Zealand). An orbit cannot pass over a pad further from the
 * equator than its inclination allows, so the latitude is clamped to it.
 */
export function groundTrack([lon0, lat0]: LonLat, inc: number, heading: 'north' | 'south' = 'north', n = 360): LonLat[] {
  const i = Math.max(0.1, inc) * D;
  const s = Math.max(-1, Math.min(1, Math.sin(lat0 * D) / Math.sin(i)));
  let u0 = Math.asin(s);
  if (heading === 'south') u0 = Math.PI - u0;
  const lonAt = (u: number) => Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u));
  const node = lon0 * D - lonAt(u0);
  const pts: LonLat[] = [];
  for (let k = 0; k <= n; k++) {
    const u = u0 + (2 * Math.PI * k) / n;
    const lat = Math.asin(Math.sin(i) * Math.sin(u)) / D;
    const lon = (((node + lonAt(u)) / D + 540) % 360) - 180;
    pts.push([lon, lat]);
  }
  return pts;
}

/** A polyline through projected points, broken wherever a point is behind the globe. */
function polyline(ctx: CanvasRenderingContext2D, proj: Project, pts: LonLat[]) {
  ctx.beginPath();
  let pen = false;
  let last: [number, number] | null = null;
  for (const p of pts) {
    const q = proj(p);
    // a jump across the frame is the antimeridian on a flat map: lift the pen there too
    if (!q || (last && Math.abs(q[0] - last[0]) > 400)) { pen = false; last = q ?? null; continue; }
    if (pen) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    pen = true; last = q;
  }
  ctx.stroke();
}

export interface OrbitDraw {
  pad: LonLat; inclination: number; heading?: 'north' | 'south'; altitude: number; apogee?: number;
  ascent: number;   // 0..1, the climb out of the pad (the first 30° of the track)
  track: number;    // 0..1, the rest of the revolution
  ring: number;     // 0..1, the height ring
  alpha: number;
  globe: { cx: number; cy: number; r: number } | null;  // the globe on screen; null on a flat map
}

/**
 * The orbit block's drawing: plain lines in the style's accent, no glow and no trail of particles
 * (CLAUDE.md section 4). The height ring is at the Earth's own scale, which is the point: a low orbit
 * hugs the planet, a geostationary one stands 5.6 Earth radii out.
 */
export function drawOrbit(ctx: CanvasRenderingContext2D, proj: Project, s: Style, o: OrbitDraw) {
  if (o.alpha <= 0) return;
  const N = 360, CLIMB = 30;
  const track = groundTrack(o.pad, o.inclination, o.heading, N);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // the climb: the first 30° of the track, drawn on, with a small head
  const climb = Math.round(CLIMB * Math.min(1, o.ascent));
  if (climb > 0) {
    ctx.globalAlpha = o.alpha; ctx.strokeStyle = s.accent; ctx.lineWidth = 3.5;
    polyline(ctx, proj, track.slice(0, climb + 1));
  }
  // the revolution: the rest of the track, thinner, appearing as one line around the globe
  const rest = Math.round((N - CLIMB) * Math.min(1, o.track));
  if (rest > 0) {
    ctx.globalAlpha = o.alpha * 0.75; ctx.strokeStyle = s.accent; ctx.lineWidth = 2;
    polyline(ctx, proj, track.slice(CLIMB, CLIMB + rest + 1));
  }
  const headAt = rest > 0 ? track[Math.min(N, CLIMB + rest)] : track[Math.max(0, climb)];
  const head = (o.ascent > 0 && o.track < 1) ? proj(headAt) : null;
  if (head) { ctx.globalAlpha = o.alpha; ctx.fillStyle = s.ink; ctx.beginPath(); ctx.arc(head[0], head[1], 5, 0, Math.PI * 2); ctx.fill(); }
  // the height, to scale, on the globe styles
  if (o.globe && o.ring > 0) {
    const { cx, cy, r } = o.globe;
    const label = (km: number) => `${km.toLocaleString('en-US')} KM`;
    const rings: { km: number; dash: boolean }[] = o.apogee ? [{ km: o.altitude, dash: false }, { km: o.apogee, dash: true }] : [{ km: o.altitude, dash: false }];
    ctx.font = `600 22px ${s.fonts.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const ring of rings) {
      const rr = r * (1 + ring.km / EARTH_KM);
      ctx.globalAlpha = o.alpha * o.ring * 0.8; ctx.strokeStyle = s.label; ctx.lineWidth = 1.5;
      ctx.setLineDash(ring.dash ? [6, 10] : []);
      ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI * 0.95, Math.PI * 0.95 * (2 * o.ring - 1)); ctx.stroke();
      ctx.setLineDash([]);
      // its height written where the ring crosses the upper right, outside the globe
      const a = -Math.PI / 4, lx = cx + Math.cos(a) * rr + 10, ly = cy + Math.sin(a) * rr - 14;
      // only where it can be read whole: while the camera is close the ring runs out of the frame
      if (lx < 0 || ly < 0 || lx + ctx.measureText(label(ring.km)).width > ctx.canvas.width - 24) continue;
      ctx.globalAlpha = o.alpha * o.ring; ctx.fillStyle = s.muted;
      ctx.fillText(label(ring.km), lx, ly);
    }
  }
  ctx.restore();
}
