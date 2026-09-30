/**
 * Time. A frame is a pure function of `t` (seconds); nothing reads the wall clock while drawing.
 * The exporter asks for frame 0, 1, 2 … N at a fixed rate, so the video is exactly `fps` frames per
 * second however slow the machine is; the preview asks for whatever `t` the real clock says.
 */

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 0 before `t0`, 1 after `t1`, linear in between. */
export const span = (t: number, t0: number, t1: number) => clamp((t - t0) / Math.max(1e-9, t1 - t0));

export type Ease = (k: number) => number;

export const ease: Record<string, Ease> = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outQuart: (k) => 1 - Math.pow(1 - k, 4),
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inOutExpo: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
  outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
};

/** Progress of an animation that runs from `t0` for `dur` seconds, eased. */
export const anim = (t: number, t0: number, dur: number, e: Ease = ease.outCubic) => e(span(t, t0, t0 + dur));

/** Deterministic pseudo-random numbers (mulberry32): the same seed gives the same grain every run. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
