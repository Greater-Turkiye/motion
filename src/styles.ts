import type { StyleId } from './engine/scene';

/** The design directions of PLAN.md section 11 and docs/research/03, as data. */
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
  hypso?: [string, string, string];   // land coloured by height: lowland, middle, high (G)
  shadeTint?: [string, string];       // relief shadow and light colours instead of black and white (G)
  rhumb?: { color: string; centers: [number, number][] };  // portolan rhumb lines on the sea, 32 winds (K; flat styles only)
  tile?: string;                      // a faint tile pattern on the sea (K)
  halftone?: number;                  // relief printed as a 45° dot screen, cell size in px (H)
  speckle?: number;                   // photocopy toner speckle, 0..1 (H)
  contour?: { color: string; step: number };  // contour lines, step as a share of 5 km (I)
  gratStep?: number;                  // graticule spacing in degrees (default 10)
  stepFps?: number;                   // camera moves in steps, n per second: stop motion (H)
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
  // research/03 E: a dark world in which one thing is lit (John Nelson's firefly recipe)
  E: { id: 'E', name: 'Ateşböceği', flat: false, bg: ['#0b0f16', '#030406'], sea: '#05070B', land: '#12161D', border: 'rgba(38,45,58,0.9)',
    graticule: 'rgba(255,255,255,0.02)', home: '#101c24', homeStroke: 'rgba(127,227,255,0.75)', subject: '#2b1606', subjectStroke: '#FFF4D6',
    glow: 'rgba(255,106,0,0.85)', atmosphere: 'rgba(255,181,71,0.10)', accent: '#FFB547', ink: '#FFF4D6', muted: '#9aa3ad', status: '#FFB547',
    label: 'rgba(255,244,214,0.75)', emblemMono: true, baseScale: 1300, cy: 640, grain: 0.04, relief: 0.1, limb: 0.55 },
  // research/03 G: Imhof's Swiss relief, hypsometric tint, blue-grey shadows and warm light
  G: { id: 'G', name: 'İsviçre rölyefi', flat: true, bg: ['#eef0ea', '#e4e7df'], sea: '#A7C5D9', land: '#A9B89A', border: 'rgba(40,40,40,0.45)',
    graticule: 'rgba(40,60,80,0.07)', home: '#E30A17', homeStroke: '#8c1420', subject: '#7A1F2B', subjectStroke: '#7A1F2B',
    glow: null, atmosphere: null, accent: '#b3121f', ink: '#1d2326', muted: '#46525c', status: '#7A1F2B',
    label: 'rgba(20,30,40,0.85)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.02, relief: 1.0, limb: 0,
    hypso: ['#A9B89A', '#D9CFA6', '#F1EBDC'], shadeTint: ['#5B6E82', '#FFF6E0'] },
  // research/03 K: an İznik tile atlas, Piri Reis rhumb lines on a pale sea
  K: { id: 'K', name: 'Çini atlas', flat: true, bg: ['#F7F3EA', '#EFE8D8'], sea: '#d9ebe7', land: '#F7F3EA', border: 'rgba(27,27,27,0.75)',
    graticule: 'rgba(0,0,0,0)', home: '#B8322A', homeStroke: '#1B1B1B', subject: '#e6e3f0', subjectStroke: '#1F3F8F',
    glow: null, atmosphere: null, accent: '#1F3F8F', ink: '#1B1B1B', muted: '#4d4a44', status: '#B8322A',
    label: 'rgba(27,27,27,0.85)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.02, relief: 0.3, limb: 0,
    rhumb: { color: 'rgba(31,63,143,0.26)', centers: [[27.5, 35.2], [38.5, 42.6], [18.5, 40.5]] }, tile: 'rgba(47,167,168,0.10)' },
  // research/03 H: a declassified dossier, photocopied: toner on paper, Factbook-blue sea, halftone relief
  H: { id: 'H', name: 'Gizliliği kaldırılmış', flat: true, bg: ['#ECE7DB', '#E2DCCD'], sea: '#C9D6DF', land: '#E9E4D8', border: 'rgba(26,26,26,0.8)',
    graticule: 'rgba(26,26,26,0.10)', home: '#d8cbb6', homeStroke: '#1A1A1A', subject: '#dcd3c3', subjectStroke: '#B3261E',
    glow: null, atmosphere: null, accent: '#B3261E', ink: '#1A1A1A', muted: '#4a4640', status: '#B3261E',
    label: 'rgba(26,26,26,0.9)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.07, relief: 0.8, limb: 0,
    halftone: 7, speckle: 0.5, stepFps: 12 },
  // research/03 I: a printed field sheet: pale green lowland, brown contours, a one-degree grid
  I: { id: 'I', name: 'Harekât paftası', flat: true, bg: ['#F2EFE4', '#E9E5D6'], sea: '#9CC7E0', land: '#F2EFE4', border: 'rgba(29,29,29,0.7)',
    graticule: 'rgba(29,29,29,0.22)', home: '#E30A17', homeStroke: '#1D1D1D', subject: '#D40000', subjectStroke: '#D40000',
    glow: null, atmosphere: null, accent: '#C8102E', ink: '#1D1D1D', muted: '#4b4b43', status: '#A0703C',
    label: 'rgba(29,29,29,0.9)', emblemMono: false, baseScale: 1650, cy: 520, grain: 0.02, relief: 0.55, limb: 0,
    hypso: ['#CFE3B4', '#EFE9D2', '#E6D5B8'], contour: { color: 'rgba(160,112,60,0.55)', step: 0.04 }, gratStep: 1 },
};
