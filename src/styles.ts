import type { StyleId } from './engine/scene';

/** The four design directions of PLAN.md section 11, as data. */
export interface Style {
  id: StyleId;
  name: string;
  flat: boolean;           // C is a flat Mercator page; the others are a globe
  bg: [string, string];    // radial background, centre and edge
  sea: string;
  land: string;
  border: string;
  graticule: string;
  home: string; homeStroke: string;          // Türkiye
  subject: string; subjectStroke: string;    // the country the story is about
  glow: string | null;
  atmosphere: string | null;
  accent: string;          // hook line two, rings
  ink: string;             // text
  muted: string;
  status: string;          // the DOĞRULANMADI line
  label: string;
  emblemMono: boolean;     // draw emblems white on dark styles
  baseScale: number;       // globe radius (px) at zoom 1, or Mercator scale for C
  cy: number;              // where the camera centre sits on screen
  grain: number;
  relief: number;          // 0 flat colours, 1 full hill shading (ETOPO1 normal map)
  limb: number;            // how much the globe darkens towards its edge
}

export const STYLES: Record<StyleId, Style> = {
  A: { id: 'A', name: 'Gece kırmızısı', flat: false, bg: ['#1a0f10', '#030303'], sea: '#050608', land: '#1b1719', border: 'rgba(255,255,255,0.11)',
    graticule: 'rgba(255,255,255,0.035)', home: '#9e0020', homeStroke: '#ff2b4a', subject: '#3a1219', subjectStroke: 'rgba(255,90,110,0.55)',
    glow: 'rgba(200,0,42,0.55)', atmosphere: 'rgba(200,40,60,0.35)', accent: '#f4e14a', ink: '#ffffff', muted: '#b7b0a8', status: '#ff8a98',
    label: 'rgba(255,255,255,0.8)', emblemMono: true, baseScale: 1400, cy: 640, grain: 0.05, relief: 0.95, limb: 0.35 },
  B: { id: 'B', name: 'Harekât lacivert', flat: false, bg: ['#06182a', '#020a12'], sea: '#061a2c', land: '#0b2740', border: 'rgba(79,208,255,0.5)',
    graticule: 'rgba(79,208,255,0.10)', home: '#0f3d5e', homeStroke: '#4fd0ff', subject: '#2a1f14', subjectStroke: '#ffb020',
    glow: 'rgba(255,176,32,0.35)', atmosphere: 'rgba(79,208,255,0.25)', accent: '#4fd0ff', ink: '#ffffff', muted: '#7fc9ec', status: '#ffb020',
    label: 'rgba(223,244,255,0.85)', emblemMono: true, baseScale: 1700, cy: 640, grain: 0.035, relief: 0.6, limb: 0.3 },
  C: { id: 'C', name: 'Editoryal', flat: true, bg: ['#f4efe6', '#ebe4d8'], sea: '#e4ddd0', land: '#fbf8f2', border: 'rgba(20,20,20,0.5)',
    graticule: 'rgba(20,20,20,0.06)', home: '#c8002a', homeStroke: '#8a001c', subject: '#d8cfc1', subjectStroke: '#141414',
    glow: null, atmosphere: null, accent: '#c8002a', ink: '#141414', muted: '#555555', status: '#555555',
    label: 'rgba(20,20,20,0.85)', emblemMono: false, baseScale: 1650, cy: 470, grain: 0.02, relief: 0.5, limb: 0 },
  D: { id: 'D', name: 'Uydu gecesi', flat: false, bg: ['#0e1726', '#010102'], sea: '#0a1422', land: '#1d2530', border: 'rgba(255,255,255,0.32)',
    graticule: 'rgba(255,255,255,0.04)', home: '#23303f', homeStroke: '#ffffff', subject: '#1d2530', subjectStroke: 'rgba(255,209,102,0.85)',
    glow: 'rgba(120,170,255,0.3)', atmosphere: 'rgba(120,170,255,0.35)', accent: '#ffd166', ink: '#ffffff', muted: '#9fb4d6', status: '#ffd166',
    label: 'rgba(255,255,255,0.85)', emblemMono: true, baseScale: 1100, cy: 640, grain: 0.04, relief: 1.0, limb: 0.45 },
};
