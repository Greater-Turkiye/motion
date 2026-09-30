import { parse } from 'yaml';

export type LonLat = [number, number];
export type StyleId = 'A' | 'B' | 'C' | 'D';

export interface Camera { center: LonLat; zoom: number }

export interface Scene {
  id: string;
  format: 'vertical';
  fps: number;
  duration: number;
  style: StyleId;
  record?: string;
  camera: { from: Camera; to: Camera; seconds: number; ease: string };
  event?: { at: LonLat; precision: 'region' | 'locality' | 'exact' };
  subject?: { country: string; emblem?: string; label?: string };
  labels: { text: string; at: LonLat; kind?: 'country' | 'sea' | 'home' }[];
  hook: { kicker: string; lines: string[]; sub: string; status: string; source: string };
}

const need = (cond: unknown, msg: string) => { if (!cond) throw new Error(`scene: ${msg}`); };

/**
 * A scene is data, checked before it is drawn. The checks here are the ones that keep a video
 * honest (a status and a source on screen) and legible (a known style, a sane length).
 */
export function loadScene(text: string): Scene {
  const s = parse(text) as Scene;
  need(s && typeof s.id === 'string', 'id is required');
  need(s.format === 'vertical', 'only the vertical format exists so far');
  need(Number.isInteger(s.fps) && s.fps >= 24 && s.fps <= 120, 'fps must be 24–120');
  need(s.duration > 0 && s.duration <= 90, 'duration must be 0–90 s');
  need(['A', 'B', 'C', 'D'].includes(s.style), 'style must be A, B, C or D');
  need(s.hook && s.hook.lines?.length, 'the hook needs at least one line');
  need(s.hook.status && s.hook.status.trim(), 'the verification status must be on screen');
  need(s.hook.source && s.hook.source.trim(), 'the source must be on screen');
  s.labels ||= [];
  return s;
}
