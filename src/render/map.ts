import type { Assets } from '../assets';
import { GlobeGL, makeProject, type Project, type View } from '../gl/globe-gl';
import type { Style } from '../styles';
import { drawGlobe, NUM, projection } from './globe';

export interface MapOptions { subject?: string; subjectReveal: number; pulse: number }

/** Draws the map for one frame into the output canvas and returns the projection used, so the
 *  overlay (rings, emblem, labels) lands on exactly the pixels the map put things on. */
export interface MapRenderer { kind: 'webgl2' | 'canvas2d'; draw(ctx: CanvasRenderingContext2D, s: Style, v: View, o: MapOptions): Project }

export function makeMap(a: Assets, subject: string | undefined, prefer: 'webgl2' | 'canvas2d' = 'webgl2'): MapRenderer {
  if (prefer === 'webgl2') {
    try {
      const g = new GlobeGL(a.countries.map((c) => c.shape), a.disputed.features, a.borderLines, a.coastLines, a.relief);
      g.setScene(subject ? NUM[subject] ?? null : null, NUM.TUR);
      return {
        kind: 'webgl2',
        draw(ctx, s, v, o) {
          g.draw(s, v, o);
          ctx.drawImage(g.canvas, 0, 0);
          return makeProject(s, v);
        },
      };
    } catch (e) {
      console.warn('WebGL2 map unavailable, falling back to canvas 2D:', (e as Error).message);
    }
  }
  return {
    kind: 'canvas2d',
    draw(ctx, s, v, o) {
      const proj = projection(s, v);
      drawGlobe(ctx, a, s, proj, o);
      return (p) => (proj(p) as [number, number] | null) ?? null;
    },
  };
}
