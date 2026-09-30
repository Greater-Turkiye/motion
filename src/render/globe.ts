import { geoDistance, geoGraticule10, geoMercator, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature } from 'geojson';
import type { Assets } from '../assets';
import type { Camera } from '../engine/scene';
import type { Style } from '../styles';

export const W = 1080;
export const H = 1920;

// world-atlas numeric ids of the states a scene can name
export const NUM: Record<string, string> = { TUR: '792', RUS: '643', UKR: '804', GRC: '300', CYP: '196', SYR: '760', IRN: '364', ISR: '376' };
const idOf = (f: Feature) => String(f.id).padStart(3, '0');

export function projection(style: Style, cam: Camera): GeoProjection {
  if (style.flat) {
    return geoMercator().center(cam.center).scale(style.baseScale * cam.zoom).translate([W / 2, style.cy]);
  }
  return geoOrthographic().rotate([-cam.center[0], -cam.center[1], 0]).scale(style.baseScale * cam.zoom)
    .translate([W / 2, style.cy]).clipAngle(90).precision(0.6);
}

let glowC: HTMLCanvasElement | null = null;
function glowCanvas() {
  if (!glowC) { glowC = document.createElement('canvas'); glowC.width = W / 4; glowC.height = H / 4; }
  return glowC;
}

let hatch: CanvasPattern | null = null;
function hatchPattern(ctx: CanvasRenderingContext2D, dark: boolean) {
  if (hatch) return hatch;
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d')!;
  g.strokeStyle = dark ? 'rgba(255,255,255,0.38)' : 'rgba(20,20,20,0.45)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-3, 15); g.lineTo(15, -3); g.moveTo(-3, 3); g.lineTo(3, -3); g.moveTo(9, 15); g.lineTo(15, 9); g.stroke();
  hatch = ctx.createPattern(c, 'repeat');
  return hatch;
}

export interface GlobeOptions { subject?: string; subjectReveal: number; pulse: number }

/**
 * Draw the map for one frame. Countries are filled in a few batches (one path per colour), so a
 * frame costs a handful of fills and strokes whatever the number of countries.
 */
export function drawGlobe(ctx: CanvasRenderingContext2D, a: Assets, s: Style, proj: GeoProjection, o: GlobeOptions) {
  const path = geoPath(proj, ctx);
  const sphere = { type: 'Sphere' } as const;

  // background
  const bg = ctx.createRadialGradient(W / 2, s.cy * 0.8, 0, W / 2, s.cy * 0.8, H * 0.9);
  bg.addColorStop(0, s.bg[0]); bg.addColorStop(1, s.bg[1]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  if (!s.flat && s.atmosphere) {
    const r = proj.scale(), [cx, cy] = proj.translate();
    const g = ctx.createRadialGradient(cx, cy, r * 0.94, cx, cy, r * 1.1);
    g.addColorStop(0, s.atmosphere); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); path(sphere); ctx.fillStyle = s.sea; ctx.fill();
  ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = s.graticule; ctx.lineWidth = 1; ctx.stroke();

  // Each group is projected once per frame into a Path2D and that one path is filled, stroked and
  // glowed as often as needed. Projecting the 1:50m countries is the expensive part of a frame; doing
  // it once instead of for every fill and stroke is most of the export speed.
  const home = NUM.TUR, subj = o.subject ? NUM[o.subject] : null;
  const land = new Path2D(), homeP = new Path2D(), subjP = new Path2D(), disp = new Path2D(), bord = new Path2D();
  const into = (p: Path2D) => geoPath(proj, p as unknown as CanvasRenderingContext2D);
  const toLand = into(land), toHome = into(homeP), toSubj = into(subjP);
  let hasSubj = false;
  // skip what faces away: on the globe a shape whose bounding circle lies wholly beyond the horizon
  // cannot be seen, and clipping it is most of what projecting it would cost
  const rot = proj.rotate();
  const view: [number, number] = [-rot[0], -rot[1]];
  const visible = (c: { center: [number, number]; radius: number }) => s.flat || geoDistance(view, c.center) - c.radius < Math.PI / 2;
  for (const c of a.countries) {
    if (!visible(c)) continue;
    const f = c.shape;
    const id = idOf(f);
    if (id === home) toHome(f); else if (id === subj) { toSubj(f); hasSubj = true; } else toLand(f);
  }
  for (const f of a.disputed.features) into(disp)(f as Feature);
  const toBord = into(bord);
  for (const b of a.borders) if (visible(b)) toBord(b.shape);

  ctx.fillStyle = s.land; ctx.fill(land); ctx.fill(subjP);
  if (hasSubj && o.subjectReveal > 0) { ctx.globalAlpha = o.subjectReveal; ctx.fillStyle = s.subject; ctx.fill(subjP); ctx.globalAlpha = 1; }
  ctx.fillStyle = s.home; ctx.fill(homeP);

  // Türkiye's view of occupied territory (handbook ADR 0014): the de jure state's colour, hatched
  ctx.fillStyle = s.land; ctx.fill(disp);
  ctx.fillStyle = hatchPattern(ctx, !s.flat)!; ctx.fill(disp);

  ctx.strokeStyle = s.border; ctx.lineWidth = s.flat ? 1.4 : 1.1; ctx.stroke(bord);

  if (hasSubj && o.subjectReveal > 0) {
    if (s.glow) {
      // the glow is blurred at a quarter of the size and scaled up: the same look as a full-size
      // shadow blur for a fraction of its cost on an outline as long as Russia's
      const q = glowCanvas();
      const gq = q.getContext('2d')!;
      gq.setTransform(1, 0, 0, 1, 0, 0); gq.clearRect(0, 0, q.width, q.height);
      gq.setTransform(0.25, 0, 0, 0.25, 0, 0);
      gq.strokeStyle = s.glow; gq.lineWidth = 22 + 8 * o.pulse; gq.stroke(subjP);
      ctx.save();
      ctx.globalAlpha = o.subjectReveal; ctx.filter = 'blur(7px)';
      ctx.drawImage(q, 0, 0, W, H);
      ctx.restore();
    }
    ctx.globalAlpha = o.subjectReveal; ctx.strokeStyle = s.subjectStroke; ctx.lineWidth = 2.2; ctx.stroke(subjP); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = s.homeStroke; ctx.lineWidth = 2.4; ctx.stroke(homeP);
}
